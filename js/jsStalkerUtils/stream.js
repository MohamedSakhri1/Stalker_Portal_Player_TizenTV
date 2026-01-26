// Migrated from stalker_tv_stream.py (TV Only)

export function validateStreamUrl(portal, url) {
    // Regular expression from Portal (assuming portal.URL_REGEX is regex string or RegExp obj)
    // If not on portal, use default generic one
    const regex = portal.URL_REGEX ? new RegExp(portal.URL_REGEX) : /^(https?|rtmp|rtsp|mms):\/\/.+/i;

    if (regex.test(url)) {
        console.debug(`Stream URL is valid: ${url}`);
        return true;
    } else {
        console.warn(`Stream URL is invalid: ${url}`);
        return false;
    }
}

export async function getStreamLink(portal, item) {
    const supportedTypes = ["channel", "vod"];
    if (!supportedTypes.includes(item.item_type)) {
        console.warn(`getStreamLink called for unsupported item type: ${item.item_type}`);
        return null;
    }

    const cmd = item.cmd;
    if (!cmd) {
        console.error("Item must have 'cmd'.");
        return null;
    }

    // Fix for portals that embed the real URL in the local cmd
    const embeddedMatch = /\/ch\/\d+_(https?:\/\/.+)/.exec(cmd);
    if (embeddedMatch && embeddedMatch[1]) {
        const directUrl = embeddedMatch[1].trim();
        console.info(`Detected embedded URL in cmd. Extracted: ${directUrl}`);
        return directUrl;
    }

    const url = portal.activeApiPath || portal.apiUrl;
    // Determine API type param: 'itv' for channels, 'vod' for movies
    const apiType = (item.item_type === "vod") ? "vod" : "itv";

    const params = {
        action: "create_link",
        type: apiType,
        cmd: cmd,
        JsHttpRequest: "1-xml"
    };

    try {
        console.debug(`Creating stream link (${apiType}) - GET ${url} params`, params);
        const response = await portal.client.get(url, { params: params });

        const js = (response.data && response.data.js) ? response.data.js : {};
        console.log(`DEBUG: Raw 'js' data from ${apiType} create_link:`, js);

        const urlLink = js.url;
        const cmdValue = js.cmd;

        let streamUrl = null;
        if (urlLink) {
            streamUrl = urlLink;
        } else if (cmdValue) {
            streamUrl = cmdValue.trim();
            // Prefix cleanup
            if (/^ffmpeg\s*/i.test(streamUrl)) {
                streamUrl = streamUrl.replace(/^ffmpeg\s*/i, '').trim();
            }
            // Absolute URL check
            if (!/^https?:\/\//i.test(streamUrl)) {
                // portal.streamBaseUrl might be needed. 
                // Python: portal.stream_base_url
                const streamBase = portal.streamBaseUrl || "";
                streamUrl = streamBase + '/' + streamUrl.replace(/^\//, '');
            }
        } else {
            console.error("Neither 'url' nor 'cmd' found in stream link response.");
            return null;
        }

        if (streamUrl) {
            console.debug(`Final stream URL before validation: ${streamUrl}`);

            // Logic to repair broken token
            let cleanInputCmd = cmd;
            if (/^ffmpeg\s*/i.test(cleanInputCmd)) {
                cleanInputCmd = cleanInputCmd.replace(/^ffmpeg\s*/i, '').trim();
            }

            if (/:\d+\/.*:\d+\//.test(streamUrl) || /https?:\/\/.*https?:\/\//.test(streamUrl)) {
                console.warn(`Detected malformed stream URL: ${streamUrl}`);
                if (/^https?:\/\//i.test(cleanInputCmd)) {
                    streamUrl = cleanInputCmd;
                }
            }

            if (streamUrl.includes("stream=&") || streamUrl.endsWith("stream=")) {
                console.warn("Detected missing 'stream' ID in generated URL.");
                if (/stream=\d+/.test(cleanInputCmd) && /^https?:\/\//i.test(cleanInputCmd)) {
                    streamUrl = cleanInputCmd;
                } else {
                    const matchStream = /stream=(\d+)/.exec(cmd);
                    if (matchStream && matchStream[1]) {
                        const originalId = matchStream[1];
                        if (streamUrl.includes("stream=&")) {
                            streamUrl = streamUrl.replace("stream=&", `stream=${originalId}&`);
                        } else {
                            streamUrl += originalId;
                        }
                    }
                }
            }
        }

        if (validateStreamUrl(portal, streamUrl)) {
            console.info(`Successfully created stream link: ${streamUrl}`);
            return streamUrl;
        } else {
            console.error(`Invalid stream URL generated: ${streamUrl}`);
            return null;
        }

    } catch (e) {
        console.error("Error creating stream link:", e);
        return null;
    }
}

// Backward compatibility alias if needed
export const getTvStreamLink = getStreamLink;
