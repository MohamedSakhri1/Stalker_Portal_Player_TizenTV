// Migrated from stalker_content.py (TV Only)

export async function getCategories(portal, categoryType = "itv") {
    if (categoryType.toLowerCase() === "itv") {
        return getItvCategories(portal);
    } else if (categoryType.toLowerCase() === "vod") {
        return getVodCategories(portal);
    } else {
        console.error(`Unknown or unsupported category_type: ${categoryType}`);
        return [];
    }
}

export async function getItvCategories(portal) {
    if (portal.ensureToken) await portal.ensureToken();

    const url = portal.activeApiPath || portal.apiUrl;
    const params = {
        type: "itv",
        action: "get_genres",
        JsHttpRequest: "1-xml"
    };

    try {
        const response = await portal.client.get(url, { params: params });

        // Python: safe_json_list(response)
        // Stalker often returns a list directly in data.js or data.js.data
        let rawCategories = [];
        if (response.data && response.data.js) {
            if (Array.isArray(response.data.js)) {
                rawCategories = response.data.js;
            } else if (response.data.js.data && Array.isArray(response.data.js.data)) {
                rawCategories = response.data.js.data;
            }
        }

        const categories = [];
        for (const cat of rawCategories) {
            const name = cat.title;
            const categoryId = cat.id;
            if (name && categoryId) {
                categories.push({
                    "name": name,
                    "category_type": "IPTV",
                    "category_id": categoryId
                });
            }
        }
        console.debug(`Fetched IPTV categories: ${categories.length}`);
        return categories;

    } catch (e) {
        console.error("Error fetching IPTV categories:", e);
        return [];
    }
}

export async function getVodCategories(portal) {
    if (portal.ensureToken) await portal.ensureToken();

    const url = portal.activeApiPath || portal.apiUrl;
    const params = {
        type: "vod",
        action: "get_categories",
        JsHttpRequest: "1-xml"
    };

    try {
        const response = await portal.client.get(url, { params: params });

        let rawCategories = [];
        if (response.data && response.data.js) {
            if (Array.isArray(response.data.js)) {
                rawCategories = response.data.js;
            } else if (response.data.js.data && Array.isArray(response.data.js.data)) {
                rawCategories = response.data.js.data;
            }
        }

        const categories = [];
        const excludeKeywords = ['tv', 'series', 'show'];

        for (const cat of rawCategories) {
            const name = cat.title || cat.name || cat.category_name;
            const categoryId = cat.id || cat.category_id;

            if (!name || !categoryId) continue;

            // VOD Filtering (Exclude Series-like names)
            const lowerName = name.toLowerCase();
            const isMovie = !excludeKeywords.some(kw => lowerName.includes(kw));

            if (isMovie) {
                categories.push({
                    "name": name,
                    "category_type": "VOD",
                    "category_id": categoryId
                });
            }
        }
        categories.sort((a, b) => a.name.localeCompare(b.name));
        console.debug(`Fetched VOD categories: ${categories.length}`);
        return categories;

    } catch (e) {
        console.error("Error fetching VOD categories:", e);
        return [];
    }
}

export async function getChannelsInCategory(portal, categoryId, onProgress, options) {
    // Default to ITV for backward compatibility if called directly,
    // but better to use generic fetchAllPages
    return fetchAllPages(portal, "IPTV", categoryId, onProgress, options);
}

export async function getVodInCategory(portal, categoryId, onProgress, options) {
    return fetchAllPages(portal, "VOD", categoryId, onProgress, options);
}

// Internal Generic Fetcher
async function fetchAllPages(portal, categoryType, categoryId, onProgress, options = {}) {
    if (portal.ensureToken) await portal.ensureToken();

    const url = portal.activeApiPath || portal.apiUrl;
    let itemType, paramKey, paramValue, typeParam;

    if (categoryType === "IPTV") {
        itemType = "channel";
        paramKey = "genre";
        paramValue = categoryId;
        typeParam = "itv";
    } else if (categoryType === "VOD") {
        itemType = "vod";
        paramKey = "category";
        paramValue = categoryId;
        typeParam = "vod";
    } else {
        return [];
    }

    const items = [];
    const pageNumber = 1;

    // Determine total pages
    const initialParams = {
        "type": typeParam,
        "action": "get_ordered_list",
        [paramKey]: paramValue,
        "JsHttpRequest": "1-xml",
        "p": pageNumber
    };

    try {
        if (options && options.signal && options.signal.aborted) throw new Error("Aborted");

        console.debug(`Fetching initial page ${pageNumber} for category ${categoryId} (${categoryType})`);
        const response = await portal.client.get(url, { params: initialParams, signal: options.signal });

        const jsData = response.data && response.data.js ? response.data.js : {};
        let data = jsData.data || [];

        // Total items logic
        let totalItems = 0;
        if (jsData.total_items) {
            totalItems = parseInt(jsData.total_items, 10);
        } else {
            totalItems = data.length;
        }

        const itemsPerPage = data.length;
        let totalPages = 0;
        if (itemsPerPage > 0) {
            totalPages = Math.ceil(totalItems / itemsPerPage);
        }

        console.debug(`Total items: ${totalItems}, Items per page: ${itemsPerPage}, Total pages: ${totalPages}`);

        const processAndYield = (pageData) => {
            if (options && options.signal && options.signal.aborted) return;
            const newItems = [];
            for (const item of pageData) {
                // Common props
                item.item_type = itemType;

                // Specific ID mapping
                if (categoryType === "IPTV") {
                    item.channel_id = item.id || item.channel_id;
                } else if (categoryType === "VOD") {
                    item.movie_id = item.id || item.movie_id;
                    item.cmd = item.cmd || `ffmpeg ${item.url}`; // VOD usually has cmd or plain URL. Stalker might return 'cmd'.
                    // Actually VOD playback often uses create_link with 'vod' type and cmd/cmd_url.
                    // We'll capture everything.
                }

                newItems.push(item);
                items.push(item);
            }
            if (onProgress && newItems.length > 0) {
                onProgress(newItems);
            }
        };

        processAndYield(data); // Process Page 1

        // Fetch remaining pages sequentially
        for (let p = 2; p <= totalPages; p++) {
            if (options && options.signal && options.signal.aborted) {
                console.log("Fetch aborted by signal.");
                break;
            }

            await new Promise(r => setTimeout(r, 500));

            // Check again after sleep
            if (options && options.signal && options.signal.aborted) {
                console.log("Fetch aborted by signal.");
                break;
            }

            const params = {
                "type": typeParam,
                "action": "get_ordered_list",
                [paramKey]: paramValue,
                "JsHttpRequest": "1-xml",
                "p": p
            };

            try {
                const resp = await portal.client.get(url, { params: params, signal: options.signal });
                const pData = resp.data && resp.data.js && resp.data.js.data ? resp.data.js.data : [];
                processAndYield(pData);
            } catch (e) {
                if (axios.isCancel(e)) {
                    console.log("Request cancelled", p);
                    break;
                }
                console.warn(`Failed to fetch page ${p}:`, e);
            }
        }

        // Remove duplicates
        const unique = {};
        const finalList = [];
        for (const i of items) {
            const id = (categoryType === "IPTV") ? i.channel_id : i.movie_id;
            if (id && !unique[id]) {
                unique[id] = true;
                finalList.push(i);
            }
        }

        console.debug(`Fetched ${finalList.length} items in total for category ${categoryId}`);
        return finalList;

    } catch (e) {
        console.error(`Error fetching items for category ${categoryId}:`, e);
        return [];
    }
}
