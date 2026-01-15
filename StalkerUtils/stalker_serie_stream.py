import logging
import re
from typing import Optional
from stalker_tv_stream import validate_stream_url

logger = logging.getLogger(__name__)

def get_season_stream_link(portal, season_id: str) -> Optional[str]:
    """
    Fetch the stream link for a specific season.
    """
    if hasattr(portal, 'ensure_token'):
        portal.ensure_token()
    url = portal.api_url
    params = {
        "type": "vod",
        "action": "get_season_stream",
        "season_id": season_id,
        "JsHttpRequest": "1-xml"
    }
    headers = portal.generate_headers(include_auth=True)
    logger.debug(f"Fetching stream link for season_id={season_id}")
    response = portal.make_request_with_retries(url, params=params, headers=headers)
    if not response:
        logger.error(f"Failed to fetch stream link for season_id={season_id}")
        return None
    json_response = portal.safe_json_parse(response)
    if not json_response:
        logger.error(f"Invalid JSON response while fetching stream link for season_id={season_id}")
        return None
    js_data = json_response.get("js", {})
    stream_cmd = js_data.get("cmd") or js_data.get("url")
    if not stream_cmd:
        logger.error(f"No stream command/url found for season_id={season_id}")
        return None
    logger.debug(f"Stream command/url for season_id={season_id}: {stream_cmd}")
    return stream_cmd

def get_episode_stream_link(portal, episode_id: str) -> Optional[str]:
    """
    Fetch the stream link for a specific episode.
    """
    if hasattr(portal, 'ensure_token'):
        portal.ensure_token()
    url = portal.api_url
    params = {
        "type": "vod",
        "action": "get_episode_stream",
        "episode_id": episode_id,
        "JsHttpRequest": "1-xml"
    }
    headers = portal.generate_headers(include_auth=True)
    logger.debug(f"Fetching stream link for episode_id={episode_id}")
    response = portal.make_request_with_retries(url, params=params, headers=headers)
    if not response:
        logger.error(f"Failed to fetch stream link for episode_id={episode_id}")
        return None
    json_response = portal.safe_json_parse(response)
    if not json_response:
        logger.error(f"Invalid JSON response while fetching stream link for episode_id={episode_id}")
        return None
    js_data = json_response.get("js", {})
    stream_cmd = js_data.get("cmd") or js_data.get("url")
    if not stream_cmd:
        logger.error(f"No stream command/url found for episode_id={episode_id}")
        return None
    logger.debug(f"Stream command/url for episode_id={episode_id}: {stream_cmd}")
    return stream_cmd

def get_episode_stream_url(portal, movie_id: str, season_id: str, episode_id: str) -> Optional[str]:
    """
    Fetch the stream URL for a specific episode (full flow).
    """
    if hasattr(portal, 'ensure_token'):
        portal.ensure_token()

    # Step 1: Fetch Episode Data
    ordered_list_url = portal.api_url
    ordered_list_params = {
        "action": "get_ordered_list",
        "type": "vod",
        "movie_id": movie_id,
        "season_id": season_id,
        "episode_id": episode_id,
        "JsHttpRequest": "1-xml"
    }
    headers = portal.generate_headers(include_auth=True)
    logger.debug(f"Fetching episode data - GET {ordered_list_url} with params {ordered_list_params}")
    response = portal.make_request_with_retries(ordered_list_url, params=ordered_list_params, headers=headers)
    if not response:
        logger.error("Failed to fetch episode data.")
        return None

    json_response = portal.safe_json_parse(response)
    if not json_response or "js" not in json_response:
        logger.error("Invalid JSON response while fetching episode data.")
        return None

    episode_data = json_response["js"].get("data", [])
    if not episode_data:
        logger.error("No episode data found in the response.")
        return None

    episode_info = episode_data[0]
    stream_id = episode_info.get("id")
    if not stream_id:
        logger.error("Episode 'id' not found in the response.")
        return None

    logger.debug(f"Extracted stream_id: {stream_id}")

    # Step 2: Create Stream Link
    create_link_url = portal.api_url
    create_link_params = {
        "action": "create_link",
        "type": "vod",
        "cmd": f"/media/file_{stream_id}.mpg",
        "JsHttpRequest": "1-xml"
    }
    logger.debug(f"Creating stream link - GET {create_link_url} with params {create_link_params}")
    create_link_response = portal.make_request_with_retries(create_link_url, params=create_link_params, headers=headers)
    if not create_link_response:
        logger.error("Failed to create stream link.")
        return None

    create_link_json = portal.safe_json_parse(create_link_response)
    if not create_link_json or "js" not in create_link_json:
        logger.error("Invalid JSON response while creating stream link.")
        return None

    cmd_url = create_link_json["js"].get("cmd")
    if not cmd_url:
        logger.error("Stream 'cmd' URL not found in the create_link response.")
        return None

    logger.debug(f"Generated stream URL: {cmd_url}")

    cmd_url = cmd_url.strip()
    if re.match(r'(?i)^ffmpeg\s*(.*)', cmd_url):
        logger.debug(f"Stripping 'ffmpeg' prefix from cmd: {cmd_url}")
        cmd_url = re.sub(r'(?i)^ffmpeg\s*', '', cmd_url).strip()

    if not re.match(r'^https?://', cmd_url, re.IGNORECASE):
        cmd_url = f"{portal.stream_base_url}/{cmd_url.lstrip('/')}"
        logger.debug(f"Constructed absolute URL: {cmd_url}")

    if validate_stream_url(portal, cmd_url):
        return cmd_url
    else:
        logger.error("Invalid stream URL generated.")
        return None
