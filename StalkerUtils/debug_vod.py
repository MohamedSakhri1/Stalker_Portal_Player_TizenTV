import logging
import sys
import os
import codecs
import re

# Force UTF-8 for stdout
sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())
sys.stderr = codecs.getwriter("utf-8")(sys.stderr.detach())

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from stalker_refactored import StalkerPortal
import stalker_handshake
import stalker_content
import stalker_movie_stream
from stalker_tv_stream import create_stream_link # To debug manually if needed

# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(levelname)s: %(message)s', stream=sys.stdout)
logger = logging.getLogger("DebugVOD")

def run_debug():
    url = "http://45.139.122.199:8080/c"
    mac = "00:1A:79:C3:3A:D2"
    
    print(f"Testing VOD: {url} | {mac}")
    client = StalkerPortal(url, mac)
    
    try:
        print("[1] Handshake...")
        stalker_handshake.perform_handshake(client)
        
        print("[2] Fetching VOD Categories...")
        vod_cats = stalker_content.get_categories(client, "vod")
        if not vod_cats:
            print("No VOD categories.")
            return

        cat = vod_cats[0]
        print(f"    Category: {cat['name']} (ID: {cat['category_id']})")

        print("[3] Fetching Movies...")
        movies = stalker_content.get_vod_in_category(client, cat['category_id'], max_pages=1)
        if not movies:
            print("No movies found.")
            return

        movie = movies[0]
        print(f"    Movie: {movie.get('name')} (ID: {movie.get('movie_id')})")
        print(f"    Movie Data: {movie}")

        print("[4] Creating Link Tests...")
        
        # Test 1: Standard .mpg (Already Failed 500, but keeping for baseline log if changed)
        # Test 2: .mkv extension (Since target_container is mkv)
        # Test 3: Raw cmd base64
        
        stream_id = "2195219" # From previous log
        
        tests = [
            ("Standard .mpg", f"/media/file_{stream_id}.mpg"),
            ("Extension .mkv", f"/media/file_{stream_id}.mkv"),
            ("Raw Base64 CMD", movie.get('cmd'))
        ]
        
        for label, cmd_val in tests:
            if not cmd_val: continue
            print(f"\n--- Testing: {label} ---")
            print(f"    CMD: {cmd_val}")
            
            # Simplified manual request to allow observing partial success
            link_url = f"{client.api_url}?action=create_link&type=vod&cmd={re.escape(cmd_val)}&JsHttpRequest=1-xml"
            # re.escape might be too aggressive, use urllib
            import urllib.parse
            link_url = f"{client.api_url}?action=create_link&type=vod&cmd={urllib.parse.quote(cmd_val)}&JsHttpRequest=1-xml"
            
            headers = client.generate_headers(include_auth=True)
            print(f"    Request: {link_url}")
            resp = client.make_request_with_retries(link_url, headers=headers)
            if resp:
                print(f"    Status: {resp.status_code}")
                print(f"    Body: {resp.text[:500]}")
            else:
                print("    No Response.")

    except Exception as e:
        print(f"EXCEPTION: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    run_debug()
