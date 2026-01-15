import hashlib
import time
import json
import logging
import requests
from typing import Dict, Optional

logger = logging.getLogger(__name__)

def generate_signature(portal) -> str:
    """
    Generate signature for profile request.

    Args:
        portal: The StalkerPortal instance.

    Returns:
        str: Generated signature.
    """
    data = f"{portal.mac}{portal.serial}{portal.device_id1}{portal.device_id2}"
    signature = hashlib.sha256(data.encode()).hexdigest().upper()
    logger.debug(f"Generated signature: {signature}")
    return signature

def generate_metrics(portal) -> str:
    """
    Generate metrics for profile request.

    Args:
        portal: The StalkerPortal instance.

    Returns:
        str: JSON-formatted metrics string.
    """
    if not portal.random:
        # Assuming generate_random_value is available on portal or imported
        # For safety, if portal has the method, use it, otherwise use a fallback or import
        if hasattr(portal, 'generate_random_value'):
            portal.random = portal.generate_random_value()
        else:
             # Fallback if method missing (should be there per StalkerPortal definition)
             import random
             portal.random = ''.join(random.choices('0123456789abcdef', k=40))

    metrics = {
        "mac": portal.mac,
        "sn": portal.serial,
        "type": "STB",
        "model": "MAG250",
        "uid": "",
        "random": portal.random
    }
    metrics_str = json.dumps(metrics)
    logger.debug(f"Generated metrics: {metrics_str}")
    return metrics_str

def get_profile(portal) -> Optional[Dict]:
    """
    Fetch user profile after ensuring a valid token.
    
    Args:
        portal: The StalkerPortal instance.

    Returns:
        Optional[Dict]: Profile data or None.
    """
    # ensure_token logic is usually "check time, if expired, handshake"
    # We will assume portal.ensure_token() handles this, or implement inline if needed.
    # Given the user instruction to "extract", we should probably use portal's method if it exists
    # or replicate logic. StalkerPortal.get_profile calls self.ensure_token().
    if hasattr(portal, 'ensure_token'):
        portal.ensure_token()
    
    url = portal.api_url
    
    # We need to replicate the params structure exactly
    params = {
        "type": "stb",
        "action": "get_profile",
        "hd": "1",
        "ver": (
            "ImageDescription: 0.2.18-r23-250; ImageDate: Thu Sep 13 11:31:16 EEST 2018; "
            "PORTAL version: 5.6.2; API Version: JS API version: 343; STB API version: 146; "
            "Player Engine version: 0x58c"
        ),
        "num_banks": "2",
        "sn": portal.serial,
        "stb_type": "MAG250",
        "client_type": "STB",
        "image_version": "218",
        "video_out": "hdmi",
        "device_id": portal.device_id1,
        "device_id2": portal.device_id2,
        "signature": generate_signature(portal),
        "auth_second_step": "1",
        "hw_version": "1.7-BD-00",
        "not_valid_token": "0",
        "metrics": generate_metrics(portal),
        "hw_version_2": hashlib.sha1(portal.mac.encode()).hexdigest(),
        "timestamp": int(time.time()),
        "api_signature": "262",
        "prehash": "",
        "JsHttpRequest": "1-xml",
    }
    
    headers = portal.generate_headers(include_auth=True, include_token=False)
    logger.debug(f"Get Profile - GET {url} with params {params}")
    
    response = portal.make_request_with_retries(url, params=params, headers=headers)
    
    # safe_json_parse logic
    json_response = portal.safe_json_parse(response)
    if not json_response:
        logger.error("Failed to fetch profile.")
        return None
        
    js_data = json_response.get("js", {})
    token = js_data.get("token")
    if token:
        portal.token = token
        portal.bearer_token = token
        portal.token_timestamp = time.time()
        logger.debug(f"Profile token updated: {portal.token}")

    logger.info("Profile fetched successfully.")
    return js_data
