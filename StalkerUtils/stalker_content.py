import logging
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional, Any

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------------
# CATEGORY FETCHING
# -------------------------------------------------------------------------

def get_categories(portal, category_type: str = "itv") -> List[Dict]:
    """
    Generic method to fetch categories by type: "itv", "vod", or "series".

    Args:
        portal: The StalkerPortal instance.
        category_type (str): Type of category to fetch.

    Returns:
        List[Dict]: List of categories.
    """
    category_type = category_type.lower().strip()
    if category_type == "itv":
        return get_itv_categories(portal)
    elif category_type == "vod":
        return get_vod_categories(portal)
    elif category_type == "series":
        return get_series_categories(portal)
    else:
        logger.error(f"Unknown category_type: {category_type}")
        return []

def get_vod_categories(portal) -> List[Dict]:
    """
    Fetch VOD (Movies) categories by excluding categories that look like TV Shows.

    Args:
        portal: The StalkerPortal instance.

    Returns:
        List[Dict]: List of VOD categories.
    """
    def is_movie_category(cat_name: str) -> bool:
        exclude_keywords = ['tv', 'series', 'show']
        return not any(keyword in cat_name.lower() for keyword in exclude_keywords)

    if hasattr(portal, 'ensure_token'):
        portal.ensure_token()
    
    url = f"{portal.api_url}?type=vod&action=get_categories&JsHttpRequest=1-xml"
    headers = portal.generate_headers(include_auth=True)
    response = portal.make_request_with_retries(url, headers=headers)
    categories_data = portal.safe_json_list(response)
    categories = []
    for category in categories_data:
        if not isinstance(category, dict):
            continue
        name = category.get("title") or category.get("name") or category.get("category_name")
        category_id = category.get("id") or category.get("category_id")
        if not (name and category_id):
            continue

        # EXCLUDE TV/Series type categories
        if is_movie_category(name):
            categories.append({
                "name": name,
                "category_type": "VOD",
                "category_id": category_id,
            })

    categories.sort(key=lambda x: x["name"])
    logger.debug(f"Fetched VOD categories: {categories}")
    return categories

def get_series_categories(portal) -> List[Dict]:
    """
    Fetch Series (TV Shows) categories by including only categories that look like TV/Series.

    Args:
        portal: The StalkerPortal instance.

    Returns:
        List[Dict]: List of Series categories.
    """
    def is_series_category(cat_name: str) -> bool:
        include_keywords = ['tv', 'series', 'show']
        return any(keyword in cat_name.lower() for keyword in include_keywords)

    if hasattr(portal, 'ensure_token'):
        portal.ensure_token()
        
    url = f"{portal.api_url}?type=vod&action=get_categories&JsHttpRequest=1-xml"
    headers = portal.generate_headers(include_auth=True)
    response = portal.make_request_with_retries(url, headers=headers)
    categories_data = portal.safe_json_list(response)
    categories = []
    for category in categories_data:
        if not isinstance(category, dict):
            continue
        name = category.get("title") or category.get("name") or category.get("category_name")
        category_id = category.get("id") or category.get("category_id")
        if not (name and category_id):
            continue

        # ONLY categories that contain 'tv', 'series', or 'show'
        if is_series_category(name):
            categories.append({
                "name": name,
                "category_type": "Series",
                "category_id": category_id,
            })

    categories.sort(key=lambda x: x["name"])
    logger.debug(f"Fetched Series categories: {categories}")
    return categories

def get_itv_categories(portal) -> List[Dict]:
    """
    Fetch Live TV categories (type=itv) from 'action=get_genres'.

    Args:
        portal: The StalkerPortal instance.

    Returns:
        List[Dict]: List of IPTV categories.
    """
    if hasattr(portal, 'ensure_token'):
        portal.ensure_token()

    url = f"{portal.api_url}?type=itv&action=get_genres&JsHttpRequest=1-xml"
    headers = portal.generate_headers(include_auth=True)
    response = portal.make_request_with_retries(url, headers=headers)
    raw_categories = portal.safe_json_list(response)
    categories = []
    for cat in raw_categories:
        if not isinstance(cat, dict):
            continue
        name = cat.get("title")
        category_id = cat.get("id")
        if name and category_id:
            categories.append({
                "name": name,
                "category_type": "IPTV",
                "category_id": category_id
            })
    categories.sort(key=lambda x: x["name"])
    logger.debug(f"Fetched IPTV categories: {categories}")
    return categories

# -------------------------------------------------------------------------
# PAGINATION & LIST FETCHING
# -------------------------------------------------------------------------

def fetch_all_pages(
    portal,
    category_type: str,
    category_id: str,
    max_pages: Optional[int] = None,
    only_series: Optional[bool] = None
) -> List[Dict]:
    """
    Unified pagination method for VOD, Series, and IPTV.

    Args:
        portal: The StalkerPortal instance.
        category_type (str): Type of category ("VOD", "Series", "IPTV").
        category_id (str): ID of the category.
        max_pages (Optional[int]): Maximum number of pages to fetch.
        only_series (Optional[bool]): Filter series items.

    Returns:
        List[Dict]: List of items.
    """
    if hasattr(portal, 'ensure_token'):
        portal.ensure_token()
        
    base_url = portal.api_url

    if category_type == "IPTV":
        item_type = "channel"
        param_key = "genre"
        param_value = category_id
        type_param = "itv"
    elif category_type == "VOD":
        item_type = "vod"
        param_key = "category"
        param_value = category_id
        type_param = "vod"
    elif category_type == "Series":
        item_type = "series"
        param_key = "category"
        param_value = category_id
        type_param = "vod"
    else:
        logger.error("Unknown category_type.")
        return []

    headers = portal.generate_headers(include_auth=True)
    items = []
    page_number = 1

    # Determine total pages first
    initial_params = {
        "type": type_param,
        "action": "get_ordered_list",
        param_key: param_value,
        "JsHttpRequest": "1-xml",
        "p": page_number
    }
    logger.debug(f"Fetching initial page {page_number} to determine total pages.")
    response = portal.make_request_with_retries(base_url, params=initial_params, headers=headers)
    if not response:
        logger.error(f"Failed to fetch initial page {page_number} for category {category_type} ID {category_id}.")
        return []

    json_response = portal.safe_json_parse(response)
    if not json_response:
        logger.error(f"Invalid JSON on initial page {page_number} for category {category_type} ID {category_id}.")
        return []
    
    if not isinstance(json_response, dict):
        logger.error(f"Invalid JSON structure (not a dict) on initial page {page_number}.")
        return []

    js_data = json_response.get("js", {})
    if not isinstance(js_data, dict):
        logger.error(f"Invalid JSON 'js' content (not a dict) on initial page {page_number}.")
        return []
    total_items_str = js_data.get("total_items", "0")
    try:
        total_items = int(total_items_str)
    except ValueError:
        total_items = len(js_data.get("data", []))
    items_per_page = len(js_data.get("data", []))
    if items_per_page == 0:
        total_pages = 0
    else:
        total_pages = (total_items + items_per_page - 1) // items_per_page
    logger.debug(f"Total items: {total_items}, Items per page: {items_per_page}, Total pages: {total_pages}")

    # Adjust total_pages based on max_pages
    if max_pages:
        total_pages = min(total_pages, max_pages)
        logger.debug(f"Adjusted total_pages based on max_pages={max_pages}: {total_pages}")

    # Fetch all pages concurrently
    with ThreadPoolExecutor(max_workers=portal.num_threads) as executor:
        future_to_page = {}
        for p in range(1, total_pages + 1):
            params = {
                "type": type_param,
                "action": "get_ordered_list",
                param_key: param_value,
                "JsHttpRequest": "1-xml",
                "p": p
            }
            future = executor.submit(portal.make_request_with_retries, base_url, params=params, headers=headers)
            future_to_page[future] = p

        completed_pages = 0
        for future in as_completed(future_to_page):
            page = future_to_page[future]
            try:
                resp = future.result()
                if not resp:
                    logger.error(f"Failed to fetch page {page} for category {category_type} ID {category_id}.")
                    continue
                json_response = portal.safe_json_parse(resp)
                if not json_response or not isinstance(json_response, dict):
                    logger.error(f"Invalid JSON on page {page} for category {category_type} ID {category_id}.")
                    continue
                js_data = json_response.get("js", {})
                if not isinstance(js_data, dict):
                     continue
                data = js_data.get("data", [])

                if not data:
                    logger.debug(f"No data found on page {page}, skipping.")
                    continue

                for item in data:
                    if not isinstance(item, dict):
                        continue
                    # Mark item type
                    item["item_type"] = item_type

                    # Correct assignment of 'movie_id'
                    if category_type == "Series":
                        item["movie_id"] = item.get("video_id")
                    elif category_type == "VOD":
                        item["movie_id"] = item.get("id") or item.get("movie_id")
                    elif category_type == "IPTV":
                        item["channel_id"] = item.get("id") or item.get("channel_id")
                    else:
                        item["movie_id"] = None

                    # Filter by is_series if requested
                    is_series_value = item.get("is_series")
                    if is_series_value is not None:
                        is_series_str = str(is_series_value).lower()
                    else:
                        is_series_str = "0"

                    if only_series is True and is_series_str != "1":
                        continue
                    if only_series is False and is_series_str == "1":
                        continue

                    items.append(item)
                    logger.debug(f"Processed item on page {page}: {item.get('name', 'Unnamed')}")

            except Exception as e:
                logger.exception(f"Exception occurred while fetching page {page}: {e}")
            finally:
                completed_pages += 1
                if hasattr(portal, 'report_progress'):
                     progress_percent = int((completed_pages / total_pages) * 100)
                     portal.report_progress(progress_percent)

    # Remove duplicates
    unique = {}
    for i in items:
        if category_type == "IPTV":
            cid = i.get("channel_id")
        else:
            cid = i.get("id") or i.get("movie_id")
        if cid and cid not in unique:
            unique[cid] = i

    final_list = list(unique.values())
    final_list.sort(key=lambda x: x.get("name", ""))
    logger.debug(f"Fetched {len(final_list)} items in total for category {category_type} ID {category_id}")
    return final_list

def get_vod_in_category(portal, category_id: str, max_pages: Optional[int] = None) -> List[Dict]:
    return fetch_all_pages(portal, "VOD", category_id, max_pages=max_pages, only_series=False)

def get_series_in_category(portal, category_id: str, max_pages: Optional[int] = None) -> List[Dict]:
    return fetch_all_pages(portal, "Series", category_id, max_pages=max_pages, only_series=True)

def get_channels_in_category(portal, category_id: str, max_pages: Optional[int] = None) -> List[Dict]:
    return fetch_all_pages(portal, "IPTV", category_id, max_pages=max_pages)

# -------------------------------------------------------------------------
# SEASON & EPISODE FETCHING
# -------------------------------------------------------------------------

def fetch_season_pages(portal, movie_id: str, max_pages: Optional[int] = None) -> List[Dict]:
    logger.debug(f"Fetching seasons for movie_id={movie_id}")
    if hasattr(portal, 'ensure_token'):
        portal.ensure_token()
    base_url = portal.api_url
    headers = portal.generate_headers(include_auth=True)

    items = []
    page_number = 1

    initial_params = {
        "type": "vod",
        "action": "get_ordered_list",
        "movie_id": movie_id,
        "season_id": "0",
        "episode_id": "0",
        "JsHttpRequest": "1-xml",
        "p": page_number
    }
    initial_resp = portal.make_request_with_retries(base_url, params=initial_params, headers=headers)
    if not initial_resp:
        return []

    initial_json = portal.safe_json_parse(initial_resp)
    if not initial_json:
        return []

    js_data = initial_json.get("js", {})
    total_items_str = js_data.get("total_items", "0")
    try:
        total_items = int(total_items_str)
    except ValueError:
        total_items = len(js_data.get("data", []))
    items_per_page = len(js_data.get("data", []))
    if items_per_page == 0:
        total_pages = 0
    else:
        total_pages = (total_items + items_per_page - 1) // items_per_page
    
    if max_pages:
        total_pages = min(total_pages, max_pages)

    with ThreadPoolExecutor(max_workers=portal.num_threads) as executor:
        future_to_page = {}
        for p in range(1, total_pages + 1):
            params = {
                "type": "vod",
                "action": "get_ordered_list",
                "movie_id": movie_id,
                "season_id": "0",
                "episode_id": "0",
                "JsHttpRequest": "1-xml",
                "p": p
            }
            future = executor.submit(portal.make_request_with_retries, base_url, params=params, headers=headers)
            future_to_page[future] = p

        completed_pages = 0
        for future in as_completed(future_to_page):
            page = future_to_page[future]
            try:
                resp = future.result()
                if not resp:
                    continue
                json_response = portal.safe_json_parse(resp)
                if not json_response:
                    continue
                js_data = json_response.get("js", {})
                data = js_data.get("data", [])

                if not data:
                    continue

                for item in data:
                    if not isinstance(item, dict):
                        continue
                    if item.get("is_season"):
                        season_id = item.get("id")
                        video_id = item.get("video_id") or item.get("movie_id")

                        if video_id == season_id:
                            video_id = movie_id

                        if not (season_id and video_id):
                            continue

                        item["item_type"] = "season"
                        item["season_id"] = season_id
                        item["movie_id"] = video_id
                        items.append(item)

            except Exception as e:
                logger.exception(f"Exception fetching season page {page}: {e}")
            finally:
                completed_pages += 1
                if hasattr(portal, 'report_progress'):
                     progress_percent = int((completed_pages / total_pages) * 100)
                     portal.report_progress(progress_percent)

    logger.info(f"Fetched {len(items)} seasons for movie_id={movie_id}")
    return items

def get_seasons(portal, movie_id: str, max_pages: Optional[int] = None) -> List[Dict]:
    all_items = fetch_season_pages(portal, movie_id, max_pages=max_pages)
    seasons = []
    for it in all_items:
        is_season_value = it.get("is_season")
        if is_season_value in [True, 1, "1", "true", "True", "yes", "Yes"]:
            season_id = it.get("season_id") or it.get("id")
            video_id = it.get("video_id") or it.get("movie_id")
            if not (season_id and video_id):
                continue
            it["item_type"] = "season"
            it["season_id"] = season_id
            it["movie_id"] = video_id
            seasons.append(it)
    return seasons

def fetch_episode_pages(portal, movie_id: str, season_id: str, max_pages: Optional[int] = None) -> List[Dict]:
    logger.debug(f"Fetching episodes for movie_id={movie_id}, season_id={season_id}")
    if hasattr(portal, 'ensure_token'):
        portal.ensure_token()
    base_url = portal.api_url
    headers = portal.generate_headers(include_auth=True)

    items = []
    page_number = 1

    initial_params = {
        "type": "vod",
        "action": "get_ordered_list",
        "movie_id": movie_id,
        "season_id": season_id,
        "episode_id": "0",
        "JsHttpRequest": "1-xml",
        "p": page_number
    }
    initial_resp = portal.make_request_with_retries(base_url, params=initial_params, headers=headers)
    if not initial_resp:
        return []

    initial_json = portal.safe_json_parse(initial_resp)
    if not initial_json:
        return []

    js_data = initial_json.get("js", {})
    total_items_str = js_data.get("total_items", "0")
    try:
        total_items = int(total_items_str)
    except ValueError:
        total_items = len(js_data.get("data", []))
    items_per_page = len(js_data.get("data", []))
    if items_per_page == 0:
        total_pages = 0
    else:
        total_pages = (total_items + items_per_page - 1) // items_per_page
    
    if max_pages:
        total_pages = min(total_pages, max_pages)

    with ThreadPoolExecutor(max_workers=portal.num_threads) as executor:
        future_to_page = {}
        for p in range(1, total_pages + 1):
            params = {
                "type": "vod",
                "action": "get_ordered_list",
                "movie_id": movie_id,
                "season_id": season_id,
                "episode_id": "0",
                "JsHttpRequest": "1-xml",
                "p": p
            }
            future = executor.submit(portal.make_request_with_retries, base_url, params=params, headers=headers)
            future_to_page[future] = p

        completed_pages = 0
        for future in as_completed(future_to_page):
            page = future_to_page[future]
            try:
                resp = future.result()
                if not resp:
                    continue
                json_response = portal.safe_json_parse(resp)
                if not json_response:
                    continue
                js_data = json_response.get("js", {})
                data = js_data.get("data", [])

                if not data:
                    continue

                for item in data:
                    if not isinstance(item, dict):
                        continue
                    episode_id = item.get("id")
                    if not episode_id:
                        continue

                    item["item_type"] = "episode"
                    item["episode_id"] = episode_id
                    item["movie_id"] = movie_id
                    item["season_id"] = season_id
                    item["episode_number"] = item.get("series_number")
                    items.append(item)

            except Exception as e:
                logger.exception(f"Exception fetching episode page {page}: {e}")
            finally:
                completed_pages += 1
                if hasattr(portal, 'report_progress'):
                     progress_percent = int((completed_pages / total_pages) * 100)
                     portal.report_progress(progress_percent)

    logger.info(f"Fetched {len(items)} episodes for movie_id={movie_id}, season_id={season_id}")
    return items

def get_episodes(portal, movie_id: str, season_id: str, max_pages: Optional[int] = None) -> List[Dict]:
    return fetch_episode_pages(portal, movie_id, season_id, max_pages=max_pages)

def get_movie_details(portal, movie_id: str) -> Optional[Dict]:
    """
    Fetch movie details.

    Args:
        portal: The StalkerPortal instance.
        movie_id (str): The ID of the movie.

    Returns:
        Optional[Dict]: Movie details or None if failed.
    """
    if hasattr(portal, 'ensure_token'):
        portal.ensure_token()
    base_url = portal.api_url
    params = {
        "type": "vod",
        "action": "get_movie_details",
        "movie_id": movie_id,
        "JsHttpRequest": "1-xml"
    }
    headers = portal.generate_headers(include_auth=True)
    logger.debug(f"Fetching movie details for movie_id={movie_id}")
    response = portal.make_request_with_retries(base_url, params=params, headers=headers)
    if not response:
        return None
    json_response = portal.safe_json_parse(response)
    if not json_response:
        return None
    movie_details = json_response.get("js", {})
    if not movie_details:
        logger.error(f"No 'js' data found in response for movie_id={movie_id}")
        return None
    return movie_details
