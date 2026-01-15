import logging
from typing import Optional
from stalker_tv_stream import create_stream_link, validate_stream_url

logger = logging.getLogger(__name__)

def get_vod_stream_url(portal, movie_id: str) -> Optional[str]:
    """
    Fetch the playable stream URL for a VOD movie.
    """
    if hasattr(portal, 'ensure_token'):
        portal.ensure_token()
    url = portal.api_url
    params = {
        "type": "vod",
        "action": "get_ordered_list",
        "movie_id": movie_id,
        "JsHttpRequest": "1-xml"
    }
    headers = portal.generate_headers(include_auth=True)
    logger.debug(f"Fetching ordered list - GET {url} with params {params}")
    response = portal.make_request_with_retries(url, params=params, headers=headers)

    if not response:
        logger.error("Failed to fetch ordered list - no response.")
        if hasattr(portal, 'report_progress'): portal.report_progress(100)
        return None

    json_response = portal.safe_json_parse(response)
    if not json_response:
        logger.error("Invalid JSON response for ordered list.")
        if hasattr(portal, 'report_progress'): portal.report_progress(100)
        return None

    js_data = json_response.get("js", {})
    data = js_data.get("data", [])

    if not data:
        logger.error("No data found in ordered list response.")
        if hasattr(portal, 'report_progress'): portal.report_progress(100)
        return None

    stream_item = data[0]
    stream_id = stream_item.get("id")
    # Get custom cmd if present (e.g. for portals like 45.139.122.199 that use complex/base64 cmds)
    stream_cmd = stream_item.get("cmd")

    if not stream_id:
        logger.error("No 'id' found in the first stream item.")
        if hasattr(portal, 'report_progress'): portal.report_progress(100)
        return None

    logger.debug(f"Stream ID obtained: {stream_id}")
    if stream_cmd:
        logger.debug(f"Found custom CMD in movie details: {stream_cmd}")

    try:
        # Reuse generic create_stream_link from TV module (or move generic func to shared)
        # Assuming create_stream_link is generic enough for VOD (it sets type=vod).
        stream_url = create_stream_link(portal, stream_id, custom_cmd=stream_cmd)
        if hasattr(portal, 'report_progress'): portal.report_progress(100)
        return stream_url
    except Exception as e:
        logger.error(f"Error creating stream link: {e}")
        if hasattr(portal, 'report_progress'): portal.report_progress(100)
        return None
