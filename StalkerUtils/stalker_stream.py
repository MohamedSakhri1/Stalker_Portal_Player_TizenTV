import logging
from typing import Dict, Optional, List
import stalker_content
from stalker_tv_stream import (
    validate_stream_url,
    create_stream_link,
    get_tv_stream_link,
    StreamCreationError
)
from stalker_movie_stream import get_vod_stream_url
from stalker_serie_stream import (
    get_season_stream_link,
    get_episode_stream_link,
    get_episode_stream_url
)

logger = logging.getLogger(__name__)

# Facade for get_stream_link
def get_stream_link(portal, item: Dict) -> Optional[str]:
    """
    Creates a playable link (for IPTV or standard VOD movies).
    Unified facade delegating to specific modules.
    """
    item_type = item.get("item_type", "")
    is_series = item.get("is_series", "0")

    if is_series == "1":
        logger.warning("Item is a series. Use get_seasons(), get_episodes(), and get_episode_stream_link(...).")
        return None

    if item_type == "vod":
        movie_id = item.get("movie_id")
        if not movie_id:
            logger.error("VOD item must have 'movie_id'.")
            return None
        return get_vod_stream_url(portal, movie_id)

    elif item_type == "channel":
        return get_tv_stream_link(portal, item)
        
    else:
        logger.error(f"Unhandled item_type: {item_type}")
        return None

def select_movie_and_get_stream(portal, items: List[Dict], selection_index: int = 0) -> Optional[str]:
    """
    Select an item and get its stream link.
    """
    if not items:
        logger.error("No items available to select.")
        return None
    if selection_index < 0 or selection_index >= len(items):
        logger.error(f"Selection index {selection_index} is out of range.")
        return None

    selected_item = items[selection_index]
    item_type = selected_item.get("item_type")
    item_id = (
        selected_item.get("id") or
        selected_item.get("movie_id") or
        selected_item.get("video_id") or
        selected_item.get("season_id") or
        selected_item.get("channel_id")
    )
    logger.info(f"Selected {item_type.capitalize()} ID: {item_id}")

    if item_type == "series":
        logger.info("Selected item is a series. Streaming for series is not handled.")
        return None
    elif item_type == "season":
        stream_link = get_season_stream_link(portal, item_id)
        return stream_link
    elif item_type == "vod":
        movie_details = stalker_content.get_movie_details(portal, item_id)
        if not movie_details:
            logger.error("Failed to fetch movie details.")
            return None

        if movie_details.get("is_series") in [True, "1", "true", "True"]:
            logger.info("Selected movie is a series. Use get_seasons() and get_episodes().")
            return None
        else:
            stream_link = get_stream_link(portal, selected_item)
            return stream_link
    elif item_type == "channel":
        stream_link = get_stream_link(portal, selected_item)
        return stream_link
    elif item_type == "episode":
        movie_id = selected_item.get("movie_id")
        season_id = selected_item.get("season_id")
        episode_id = selected_item.get("id")
        stream_link = get_episode_stream_url(portal, movie_id, season_id, episode_id)
        return stream_link
    else:
        logger.error(f"Unknown item_type: {item_type}")
        return None
