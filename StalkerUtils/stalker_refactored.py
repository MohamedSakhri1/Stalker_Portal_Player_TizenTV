import logging
import requests
import json
import time
import hashlib
import random
import string
from urllib.parse import urlparse
import subprocess

# Import sibling modules
import stalker_handshake
import stalker_profile
import stalker_content
import stalker_stream

# Configure Logging
# Configure Logging - global default if run directly, but suppress if imported to avoid conflicts
if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
else:
    # If imported, ensure we have a handler if none exists (or let importer handle it)
    logging.getLogger(__name__).addHandler(logging.NullHandler())
logger = logging.getLogger(__name__)

class StalkerPortal:
    def __init__(self, portal_url, mac):
        self.portal_url = portal_url.rstrip('/')
        if not self.portal_url.endswith('/c'):
             # Tries to append /c if likely missing, but respects raw input if it looks complete
             pass 

        self.mac = mac
        self.timeout = 10
        self.num_threads = 5
        self.session = requests.Session()
        
        # Crypto / Hardware placeholders
        self.serial = hashlib.md5(mac.encode()).hexdigest().upper()[:13]
        self.device_id1 = hashlib.sha256(mac.encode()).hexdigest().upper()
        self.device_id2 = self.device_id1
        self.signature = hashlib.sha256((mac + self.serial + self.device_id1 + self.device_id2).encode()).hexdigest().upper()
        
        # Auth State
        self.token = None
        self.bearer_token = None
        self.random = None
        self.token_timestamp = 0
        
        # Stream Config
        self.stream_base_url = self.portal_url # Default fallback
        self.URL_REGEX = r'^https?://' # Simple regex for validation

        # API Endpoint (Dynamic)
        self.api_url = f"{self.portal_url}/server/load.php" # Default, updated by handshake

    def generate_random_value(self):
        return ''.join(random.choices("0123456789abcdef", k=40))

    def generate_headers(self, include_auth=True, include_token=True):
        headers = {
            "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3",
            "X-User-Agent": "Model: MAG250; Link: WiFi",
            "Referer": f"{self.portal_url}/stalker_portal/c/index.html",
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "Keep-Alive"
        }
        
        cookies = [
            f"mac={self.mac}",
            "stb_lang=en",
            "timezone=Europe/Paris"
        ]
        
        if include_token and self.token:
            cookies.append(f"token={self.token}")
            
        headers["Cookie"] = "; ".join(cookies)
        
        if include_auth and self.bearer_token:
            headers["Authorization"] = f"Bearer {self.bearer_token}"
            
        return headers

    def make_request_with_retries(self, url, params=None, headers=None, retries=3):
        for attempt in range(retries):
            try:
                # Ensure JsHttpRequest is LAST (manual construction if needed, but requests usually handles it ok unless server is SUPER strict)
                # If server is strict about order, passing params as dict might be risky depending on python version (3.7+ preserves insertion order)
                # But here we rely on requests.
                
                resp = self.session.get(url, params=params, headers=headers, timeout=self.timeout)
                if resp.status_code == 200:
                    return resp
                elif resp.status_code == 404:
                    return resp # Handled by handshake logic
                else:
                    logger.warning(f"Request failed with status {resp.status_code}. Retry {attempt+1}/{retries}")
            except Exception as e:
                logger.warning(f"Request exception: {e}. Retry {attempt+1}/{retries}")
            
            time.sleep(1)
        return None

    def safe_json_parse(self, response):
        try:
            val = response.json()
            # Some portals wrap in "js" key, logic usually handles that caller side, 
            # but sometimes response text is garbage.
            return val
        except ValueError:
            logger.warning(f"Failed to parse JSON response. Status: {response.status_code}, URL: {response.url}")
            logger.warning(f"Response Body Preview: {response.text[:500]}")
            return None

    def safe_json_list(self, response):
        js = self.safe_json_parse(response)
        if js and 'js' in js:
            data = js['js']
            if isinstance(data, list): return data
            if isinstance(data, dict) and 'data' in data: return data['data']
        return []

    def ensure_token(self):
        if not self.token or (time.time() - self.token_timestamp > 3600):
            logger.info("Token expired or missing. Re-handshaking...")
            stalker_handshake.perform_handshake(self)

    # --- Orchestration Methods ---
    
    def run(self):
        print("--- Stalker Refactored Orchestrator ---")
        
        # 1. Handshake
        print("\n[1] Performing Handshake...")
        stalker_handshake.perform_handshake(self)
        print(f"    Token: {self.token}")
        
        # 2. Get Profile
        print("\n[2] Fetching Profile...")
        profile = stalker_profile.get_profile(self)
        if profile:
            print(f"    Profile found for: {profile.get('fname', 'Unknown')}")
        else:
            print("    Failed to get profile.")
            return

        # 3. Get Categories (ITV)
        print("\n[3] Fetching ITV Categories...")
        categories = stalker_content.get_categories(self, "itv")
        print(f"    Found {len(categories)} categories.")
        
        if not categories:
            print("    No categories found.")
            return
            
        first_cat = categories[0]
        print(f"    Selected Category: {first_cat['name']} (ID: {first_cat['category_id']})")
        
        # 4. Get Channels
        print(f"\n[4] Fetching Channels for Category '{first_cat['name']}'...")
        channels = stalker_content.get_channels_in_category(self, first_cat['category_id'], max_pages=1)
        print(f"    Found {len(channels)} channels.")
        
        if not channels:
            print("    No channels found.")
            return
            
        first_channel = channels[0]
        print(f"    Selected Channel: {first_channel['name']} (CMD: {first_channel.get('cmd')})")
        
        # 5. Create Link
        print(f"\n[5] Creating Stream Link for '{first_channel['name']}'...")
        try:
            link = stalker_stream.get_stream_link(self, first_channel)
            if link:
                print(f"    SUCCESS! Stream Link: {link}")
                
                # Launch VLC
                vlc_path = r"D:/Program Files/VideoLAN/VLC/vlc.exe"
                print(f"    Launching VLC...")
                try:
                    subprocess.Popen([vlc_path, link])
                except FileNotFoundError:
                    print(f"    ERROR: VLC not found at {vlc_path}")
                except Exception as e:
                    print(f"    ERROR launching VLC: {e}")
                    
            else:
                print("    Failed to create link.")
        except Exception as e:
            print(f"    Error creating link: {e}")

if __name__ == "__main__":
    # Example Usage
    PORTAL_URL = "http://gfr5.mi20.cc/stalker_portal/c"  # Removed /c to avoid double-appending
    MAC_ADDRESS = "00:1A:79:77:D9:0C"
    
    client = StalkerPortal(PORTAL_URL, MAC_ADDRESS)
    client.run()
