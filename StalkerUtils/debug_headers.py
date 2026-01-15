import requests
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

def test_headers():
    # URL and Token from user's provided log
    # Note: Tokens expire, so this might fail if too much time passed, 
    # but we can check if the response is 403 or 410/404.
    # User's URL: http://JiiiIIIlllLLav.funtogether.xyz:8080/hu1pQJ4cC6/tMTieZF7oC/118632?play_token=IRgKyuLVff
    # Real IP redirect: http://192.142.24.31:8080/hu1pQJ4cC6/tMTieZF7oC/118632?play_token=IRgKyuLVff&token=SzJKZ1FqVnh2ZzhEaGlD
    
    # We will use the original domain URL to trigger the redirect chain properly
    url = "http://JiiiIIIlllLLav.funtogether.xyz:8080/hu1pQJ4cC6/tMTieZF7oC/118632?play_token=IRgKyuLVff"
    
    # Headers that the Emulator FAILED to set
    headers_full = {
        "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3",
        "Cookie": "mac=00%3A1A%3A79%3AFA%3A63%3AEE; stb_lang=en; timezone=Europe%2FParis;"
    }
    
    # Standard headers (without specific Stalker formatting)
    headers_plain = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }

    print(f"Testing URL: {url}")

    # Test 1: Full Headers (Simulating correct device behavior)
    print("\n[1] Testing with FULL Stalker Headers...")
    try:
        r = requests.get(url, headers=headers_full, stream=True, allow_redirects=False)
        print(f"    Status: {r.status_code}")
        print(f"    Headers: {r.headers}")
        if r.status_code in [301, 302]:
            print(f"    Redirects to: {r.headers.get('Location')}")
    except Exception as e:
        print(f"    Error: {e}")

    # Test 2: No Key Headers (Simulating Emulator failure)
    print("\n[2] Testing with NO Stalker Headers (Default User-Agent)...")
    try:
        r = requests.get(url, headers=headers_plain, stream=True, allow_redirects=False)
        print(f"    Status: {r.status_code}")
        print(f"    Headers: {r.headers}")
    except Exception as e:
        print(f"    Error: {e}")

if __name__ == "__main__":
    test_headers()
