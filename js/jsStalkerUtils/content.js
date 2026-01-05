// Migrated from stalker_content.py (TV Only)

export async function getCategories(portal, categoryType = "itv") {
    if (categoryType.toLowerCase() !== "itv") {
        console.error(`Unknown or unsupported category_type in TV-only util: ${categoryType}`);
        return [];
    }
    return getItvCategories(portal);
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
        categories.sort((a, b) => a.name.localeCompare(b.name));
        console.debug(`Fetched IPTV categories: ${categories.length}`);
        return categories;

    } catch (e) {
        console.error("Error fetching IPTV categories:", e);
        return [];
    }
}

export async function getChannelsInCategory(portal, categoryId) {
    return fetchAllPages(portal, "IPTV", categoryId);
}

async function fetchAllPages(portal, categoryType, categoryId) {
    // Only handling IPTV
    if (categoryType !== "IPTV") return [];

    if (portal.ensureToken) await portal.ensureToken();

    const url = portal.activeApiPath || portal.apiUrl;
    const itemType = "channel";
    const paramKey = "genre";
    const paramValue = categoryId;
    const typeParam = "itv";

    const items = [];
    let pageNumber = 1;

    // Determine total pages
    const initialParams = {
        "type": typeParam,
        "action": "get_ordered_list",
        [paramKey]: paramValue,
        "JsHttpRequest": "1-xml",
        "p": pageNumber
    };

    try {
        console.debug(`Fetching initial page ${pageNumber} for category ${categoryId}`);
        const response = await portal.client.get(url, { params: initialParams });

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

        // Logic for fetching pages. JS is async.
        // We can use Promise.all for parallelism like ThreadPoolExecutor

        const pagePromises = [];
        // Loop from 1 to totalPages. We already have page 1 data, but to keep logic simple we can refetch or skip.
        // Optimization: Use page 1 data we just got.

        const processData = (pageData) => {
            for (const item of pageData) {
                item.item_type = itemType;
                item.channel_id = item.id || item.channel_id; // Python logic
                // TV doesn't use is_series filter
                items.push(item);
            }
        };

        processData(data); // Process Page 1

        // Fetch remaining pages
        for (let p = 2; p <= totalPages; p++) {
            const params = {
                "type": typeParam,
                "action": "get_ordered_list",
                [paramKey]: paramValue,
                "JsHttpRequest": "1-xml",
                "p": p
            };
            pagePromises.push(portal.client.get(url, { params: params }).then(resp => ({ p, resp })).catch(e => ({ p, error: e })));
        }

        const results = await Promise.all(pagePromises);

        for (const res of results) {
            if (res.error) {
                console.warn(`Failed to fetch page ${res.p}:`, res.error);
                continue;
            }
            const pData = res.resp.data && res.resp.data.js && res.resp.data.js.data ? res.resp.data.js.data : [];
            processData(pData);
        }

        // Remove duplicates
        const unique = {};
        const finalList = [];
        for (const i of items) {
            const cid = i.channel_id;
            if (cid && !unique[cid]) {
                unique[cid] = true;
                finalList.push(i);
            }
        }

        finalList.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        console.debug(`Fetched ${finalList.length} items in total for category ${categoryId}`);
        return finalList;

    } catch (e) {
        console.error(`Error fetching channels for category ${categoryId}:`, e);
        return [];
    }
}
