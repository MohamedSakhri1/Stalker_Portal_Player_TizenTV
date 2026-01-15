import logging
import re
from urllib.parse import quote
from typing import Dict, Optional

logger = logging.getLogger(__name__)

class StreamCreationError(Exception):
    """Exception raised when creating a stream link fails."""
    pass

def validate_stream_url(portal, url: str) -> bool:
    """
    Validate the stream URL using a regular expression.
    """
    if re.match(portal.URL_REGEX, url):
        logger.debug(f"Stream URL is valid: {url}")
        return True
    else:
        logger.warning(f"Stream URL is invalid: {url}")
        return False

def create_stream_link(portal, stream_id: str, custom_cmd: Optional[str] = None) -> str:
    """
    Create a playable stream link using the provided stream ID (Generic/VOD).
    If custom_cmd is provided, it is used instead of the default /media/file_... format.
    """
    if hasattr(portal, 'ensure_token'):
        portal.ensure_token()
    
    # Use custom_cmd if available, otherwise fallback to standard construction
    cmd_param = custom_cmd if custom_cmd else f"/media/file_{stream_id}.mpg"
    
    url = portal.api_url
    params = {
        "action": "create_link",
        "type": "vod",
        "cmd": cmd_param,
        "JsHttpRequest": "1-xml"
    }
    headers = portal.generate_headers(include_auth=True)
    logger.debug(f"Creating stream link - GET {url} with params {params}")
    response = portal.make_request_with_retries(url, params=params, headers=headers)

    if not response:
        logger.error(f"Failed to create stream link for stream_id={stream_id}")
        raise StreamCreationError("No response received while creating stream link.")

    json_response = portal.safe_json_parse(response)
    if not json_response:
        logger.error(f"Invalid JSON response while creating stream link for stream_id={stream_id}")
        raise StreamCreationError("Invalid JSON response received.")

    js_data = json_response.get("js", {})
    logger.info(f"DEBUG: Raw 'js' data from create_link: {js_data}")
    stream_url = js_data.get("url")
    cmd_value = js_data.get("cmd")

    if not stream_url:
        if cmd_value:
            potential_url = cmd_value.strip()
            if re.match(r'(?i)^ffmpeg\s*(.*)', potential_url):
                logger.debug(f"Stripping 'ffmpeg' prefix from cmd: {potential_url}")
                potential_url = re.sub(r'(?i)^ffmpeg\s*', '', potential_url).strip()

            if not re.match(r'^https?://', potential_url, re.IGNORECASE):
                potential_url = f"{portal.stream_base_url}/{potential_url.lstrip('/')}"
                logger.debug(f"Constructed absolute URL: {potential_url}")

            stream_url = potential_url
        else:
            logger.error(f"No 'url' or 'cmd' found in create_link response for stream_id={stream_id}")
            raise StreamCreationError("Stream URL not found in the response.")

    if stream_url.lower().startswith("ffmpeg "):
        stream_url = stream_url[7:].strip()

    logger.debug(f"Final VOD stream URL before validation: {stream_url}")
    if validate_stream_url(portal, stream_url):
        logger.info(f"Successfully created stream link: {stream_url}")
        return stream_url
    else:
        logger.error(f"Invalid stream URL generated: {stream_url}")
        raise StreamCreationError("Generated stream URL is invalid.")

def get_tv_stream_link(portal, item: Dict) -> Optional[str]:
    """
    Creates a playable link for IPTV channels.
    """
    cmd = item.get("cmd")
    item_type = item.get("item_type", "channel")

    if item_type != "channel":
        logger.warning(f"get_tv_stream_link called for non-channel item: {item_type}")
        return None

    if not cmd:
        logger.error("IPTV channel must have 'cmd'.")
        return None

    # Fix for portals that embed the real URL in the local cmd
    embedded_match = re.search(r'/ch/\d+_(https?://.+)', cmd)
    if embedded_match:
        direct_url = embedded_match.group(1).strip()
        logger.info(f"Detected embedded URL in cmd. Extracted: {direct_url}")
        return direct_url

    url = (
        f"{portal.api_url}?action=create_link&type=itv&cmd={quote(cmd)}&JsHttpRequest=1-xml"
    )
    headers = portal.generate_headers(include_auth=True)
    logger.debug(f"Creating IPTV stream link - GET {url}")
    response = portal.make_request_with_retries(url, headers=headers)
    if not response:
        logger.error("Failed to create IPTV stream link - no response.")
        return None
    json_response = portal.safe_json_parse(response)
    if not json_response:
        logger.error("Invalid JSON for IPTV stream link.")
        return None

    js = json_response.get("js", {})
    logger.info(f"DEBUG: Raw 'js' data from IPTV create_link: {js}")
    url_link = js.get("url")
    cmd_value = js.get("cmd")

    stream_url = None
    if url_link:
        stream_url = url_link
    elif cmd_value:
        stream_url = cmd_value.strip()
        if re.match(r'(?i)^ffmpeg\s*(.*)', stream_url):
            logger.debug(f"Stripping 'ffmpeg' prefix from cmd: {stream_url}")
            stream_url = re.sub(r'(?i)^ffmpeg\s*', '', stream_url).strip()

        if not re.match(r'^https?://', stream_url, re.IGNORECASE):
            stream_url = f"{portal.stream_base_url}/{stream_url.lstrip('/')}"
            logger.debug(f"Constructed absolute URL by prepending stream_base_url: {stream_url}")
    else:
        logger.error("Neither 'url' nor 'cmd' found in IPTV stream link response.")
        return None

    if isinstance(stream_url, str):
        logger.debug(f"Final IPTV stream URL before validation: {stream_url}")

        clean_input_cmd = cmd
        if re.match(r'(?i)^ffmpeg\s*(.*)', clean_input_cmd):
             clean_input_cmd = re.sub(r'(?i)^ffmpeg\s*', '', clean_input_cmd).strip()

        if re.search(r':\d+/.*:\d+/', stream_url) or re.search(r'https?://.*https?://', stream_url):
             logger.warning(f"Detected malformed stream URL (double host/port): {stream_url}")
             if re.match(r'^https?://', clean_input_cmd, re.IGNORECASE):
                  logger.info(f"Falling back to clean input CMD: {clean_input_cmd}")
                  stream_url = clean_input_cmd
        
        # FIX for Missing Stream ID / Broken Token
        if "stream=&" in stream_url or stream_url.endswith("stream="):
            logger.warning("Detected missing 'stream' ID in generated URL.")
            if re.search(r'stream=\d+', clean_input_cmd) and re.match(r'^https?://', clean_input_cmd, re.IGNORECASE):
                 logger.info(f"Falling back to clean input CMD (valid full URL): {clean_input_cmd}")
                 stream_url = clean_input_cmd
            else:
                 logger.warning("CMD is not a full URL or missing stream ID, attempting partial repair.")
                 match_stream = re.search(r'stream=(\d+)', cmd)
                 if match_stream:
                     original_stream_id = match_stream.group(1)
                     if "stream=&" in stream_url:
                         stream_url = stream_url.replace("stream=&", f"stream={original_stream_id}&")
                     elif stream_url.endswith("stream="):
                         stream_url = stream_url + original_stream_id

    if validate_stream_url(portal, stream_url):
        logger.info(f"Successfully created IPTV stream link: {stream_url}")
        return stream_url
    else:
        logger.error(f"Invalid stream URL generated: {stream_url}")
        return None
