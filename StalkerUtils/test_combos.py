import logging
import time
import sys
import os

# Add current directory to path so we can import sibling modules if run from parent
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from stalker_refactored import StalkerPortal
import stalker_handshake
import stalker_profile
import stalker_content
import stalker_stream

# Configure logging to console, cleaner format
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger("TestCombos")

def run_test_case(portal_url, mac):
    print(f"\n{'='*60}")
    print(f"Testing Combo: {portal_url} | {mac}")
    print(f"{'='*60}")

    client = StalkerPortal(portal_url, mac)
    
    try:
        # 1. Handshake
        print("[1] Handshake...")
        stalker_handshake.perform_handshake(client)
        if not client.token:
            print("FAILED: No token received.")
            return

        # 2. Profile
        print(f"[2] Profile (API: {client.api_url})...")
        stalker_profile.get_profile(client)
        
        # 3. Categories
        print("[3] Categories...")
        categories = stalker_content.get_categories(client, "itv")
        if not categories:
            print("FAILED: No categories found.")
            return
            
        first_cat = categories[0]
        # Use repr to avoid encoding errors in console output
        print(f"    Category: {repr(first_cat.get('name'))} (ID: {first_cat.get('category_id')})")

        # 4. Channels
        print("[4] Channels...")
        channels = stalker_content.get_channels_in_category(client, first_cat['category_id'], max_pages=1)
        if not channels:
            print("FAILED: No channels found.")
            return
            
        first_channel = channels[0]
        print(f"    Channel: {repr(first_channel.get('name'))}")
        print(f"    CMD: {repr(first_channel.get('cmd'))}")

        # 5. Stream Link
        print("[5] Generating Link...")
        link = stalker_stream.get_stream_link(client, first_channel)
        
        if link:
            print(f"RESULT LINK: {link}")
        else:
            print("FAILED: Could not generate link.")

        # ---------------------------------------------------------
        # 6. VOD Testing
        # ---------------------------------------------------------
        print("\n[6] VOD Categories...")
        vod_cats = stalker_content.get_categories(client, "vod")
        if vod_cats:
            first_vod_cat = vod_cats[0]
            print(f"    Category: {repr(first_vod_cat.get('name'))} (ID: {first_vod_cat.get('category_id')})")
            
            print("[7] VOD Movies...")
            movies = stalker_content.get_vod_in_category(client, first_vod_cat['category_id'], max_pages=1)
            if movies:
                first_movie = movies[0]
                print(f"    Movie: {repr(first_movie.get('name'))} (ID: {first_movie.get('movie_id')})")
                
                print("[8] Generating VOD Link...")
                # Note: get_stream_link handles item_type='vod' via facade
                # We need to ensure item_type is set, which stalker_content does.
                vod_link = stalker_stream.get_stream_link(client, first_movie)
                if vod_link:
                    print(f"    VOD LINK: {vod_link}")
                else:
                    print("    FAILED: Could not generate VOD link.")
            else:
                print("    No movies found in first category.")
        else:
            print("    No VOD categories found.")

        # ---------------------------------------------------------
        # 7. Series Testing
        # ---------------------------------------------------------
        print("\n[9] Series Categories...")
        series_cats = stalker_content.get_categories(client, "series")
        if series_cats:
            first_series_cat = series_cats[0]
            print(f"    Category: {repr(first_series_cat.get('name'))} (ID: {first_series_cat.get('category_id')})")
            
            print("[10] Series...")
            series_list = stalker_content.get_series_in_category(client, first_series_cat['category_id'], max_pages=1)
            if series_list:
                first_series = series_list[0]
                series_id = first_series.get('movie_id') # stalker_content standardizes on movie_id for series too
                print(f"    Series: {repr(first_series.get('name'))} (ID: {series_id})")
                
                print("[11] Seasons...")
                seasons = stalker_content.get_seasons(client, series_id)
                if seasons:
                    first_season = seasons[0]
                    season_id = first_season.get('season_id')
                    print(f"    Season: {repr(first_season.get('name'))} (ID: {season_id})")
                    
                    print("[12] Episodes...")
                    episodes = stalker_content.get_episodes(client, series_id, season_id)
                    if episodes:
                        first_episode = episodes[0]
                        episode_id = first_episode.get('id')
                        print(f"    Episode: {repr(first_episode.get('name'))} (ID: {episode_id})")
                        
                        print("[13] Generating Episode Link...")
                        # We use the specific facade method for episodes or construct item manually
                        # stalker_stream facade has get_episode_stream_url
                        ep_link = stalker_stream.get_episode_stream_url(client, series_id, season_id, episode_id)
                        if ep_link:
                            print(f"    EPISODE LINK: {ep_link}")
                        else:
                            print("    FAILED: Could not generate Episode link.")
                    else:
                        print("    No episodes found in first season.")
                else:
                    print("    No seasons found for first series.")
            else:
                print("    No series found in first category.")
        else:
             print("    No Series categories found.")

    except Exception as e:
        print(f"EXCEPTION: {e}")

if __name__ == "__main__":
    combos = [
        #("http://globaltv1.net:8080/c", "00:1A:79:25:06:93"),
        #("http://fastrunner.live:8080/c","00:1A:79:FA:63:EE"),
        #("http://eu.majes-line.co/c", "00:1A:79:D4:3B:EF"),
        #("http://ix.kingtv.pw/c", "00:1A:79:9E:86:89"),
        #("http://gfr5.mi20.cc/stalker_portal/c","00:1A:79:77:D9:0C"),
        #("http://45.139.122.199:8080/c", "00:1A:79:C3:3A:D2"),
        #("http://sbhgoldpro.org/c", "00:1A:79:C3:97:12"),
        ("http://line.wishiptv.vip/c/", "00:1A:79:FB:5F:79"),
    ]

    for url, mac in combos:
        run_test_case(url, mac)
        time.sleep(2) # Polite delay
