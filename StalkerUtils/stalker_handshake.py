import hashlib
import time
import requests
import logging
import random
import string
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

def generate_token() -> str:
    """
    Generate a random token string.

    Returns:
        str: Generated token.
    """
    token_length = 32  # Example length
    token = ''.join(random.choices(string.ascii_uppercase + string.digits, k=token_length))
    logger.debug(f"Generated token: {token}")
    return token

def generate_prehash(token: str) -> str:
    """
    Generate a prehash based on the token.

    Parameters:
        token (str): The token string.

    Returns:
        str: Generated prehash.
    """
    # Example prehash generation using SHA1
    hash_object = hashlib.sha1(token.encode())
    prehash = hash_object.hexdigest()
    logger.debug(f"Generated prehash from token: {prehash}")
    return prehash

def perform_handshake(portal) -> None:
    """
    Initiates handshake to obtain a token from the server.
    Iterates through multiple common API paths. 
    Handles 404 by trying next path or generating a token fallback.
    
    Args:
        portal: The StalkerPortal instance.
    """
    
    # Define standard API suffixes
    api_suffixes = [
        "/stalker_portal/server/load.php",
        "/server/load.php",
        "/portal.php",
        "/c/server/load.php",
        "/c/portal.php",
        "/c/stalker_portal/server/load.php"
    ]

    # Define base variations
    base_urls = []
    original_base = portal.portal_url.rstrip('/')
    base_urls.append(original_base)

    # 1. Strip /c
    if original_base.endswith('/c'):
        base_urls.append(original_base[:-2])
    
    # 2. Strip /stalker_portal/c
    if original_base.endswith('/stalker_portal/c'):
         base_urls.append(original_base[:-17]) # Remove /stalker_portal/c

    # 3. Root (Protocol + Domain)
    parsed = urlparse(original_base)
    root_url = f"{parsed.scheme}://{parsed.netloc}"
    if root_url not in base_urls:
        base_urls.append(root_url)

    # Use a set to avoid duplicates in testing
    tested_urls = set()

    working_url = None
    last_error = None

    for base in base_urls:
        if working_url: break
        for suffix in api_suffixes:
            # Construct candidate url
            if base.endswith('/') and suffix.startswith('/'):
                 full_url = f"{base}{suffix[1:]}"
            elif not base.endswith('/') and not suffix.startswith('/'):
                 full_url = f"{base}/{suffix}"
            else:
                 full_url = f"{base}{suffix}"
            
            if full_url in tested_urls:
                continue
            tested_urls.add(full_url)
        
            # Test URL with standard handshake params
            initial_url = f"{full_url}?type=stb&action=handshake&token=&JsHttpRequest=1-xml"
            
            headers = portal.generate_headers(include_auth=False)
            logger.debug(f"Handshake - Attempting {initial_url}")
            
            try:
                response = portal.make_request_with_retries(initial_url, headers=headers)
                
                # If 404, this path is wrong, try next
                if not response or response.status_code == 404:
                    # logger.debug(f"Path {full_url} returned 404/None. Trying next.")
                    continue
                
                # If 200, check content
                if response.status_code == 200:
                    # Can we parse it?
                    json_response = portal.safe_json_parse(response)
                    
                    # If we can parse it and it has 'js', great
                    if json_response and "js" in json_response:
                        working_url = full_url
                        logger.info(f"Handshake successful on URL: {full_url}")
                        break
                    
                    # Fallback Logic (200 OK but invalid/empty JSON)
                    logger.warning(f"URL {full_url} returned 200 OK but invalid JSON. Attempting Client-Side Token Fallback.")
                    
                    token = generate_token()
                    prehash = generate_prehash(token)
                    
                    portal.token = token
                    headers_fallback = portal.generate_headers(include_auth=False, include_token=True)
                    
                    retry_url = f"{full_url}?type=stb&action=handshake&token={token}&prehash={prehash}&JsHttpRequest=1-xml"
                    resp_retry = portal.make_request_with_retries(retry_url, headers=headers_fallback)
                    if resp_retry and resp_retry.status_code == 200:
                        json_retry = portal.safe_json_parse(resp_retry)
                        if json_retry and "js" in json_retry:
                            # SUCCESS via fallback
                            working_url = full_url
                            json_response = json_retry # Use this response
                            logger.info(f"Handshake fallback successful on URL: {full_url}")
                            break
                        
            except requests.exceptions.RequestException as e:
                logger.error(f"Handshake request failed for {full_url}: {e}")
                last_error = e
                continue

    if not working_url:
        logger.error(f"Failed to perform handshake. Scanned {len(tested_urls)} URLs.")
        raise ConnectionError("Failed to perform handshake on any known path.")

    # Update portal API URL to the working endpoint
    if working_url:
        portal.api_url = working_url
        logger.info(f"Updated API Endpoint URL to: {portal.api_url}")

    # Process success (json_response is set from the loop)
    js_data = json_response.get("js", {})
    portal.token = js_data.get("token")
    
    random_value = js_data.get("random", None)
    if random_value:
        portal.random = random_value.lower()
    else:
        portal.random = portal.generate_random_value()

    portal.token_timestamp = time.time()
    portal.bearer_token = portal.token
    logger.debug(f"Handshake sequence complete. Token: {portal.token}")
