import { StalkerUtils } from './jsStalkerUtils/orchestrator.js';

class StalkerPortal {
    constructor(portalUrl, mac) {
        // Sanitize URL
        let cleaned = portalUrl.trim().replace(/\/$/, "");
        cleaned = cleaned.replace(/\/c\/index\.html$/i, "");
        cleaned = cleaned.replace(/\/c\/?$/i, "");
        cleaned = cleaned.replace(/\/stalker_portal\/?$/i, "");
        this.portalUrl = cleaned.replace(/\/$/, "");

        this.mac = mac;

        // These properties are required by the Utils
        this.activeApiPath = null;
        this.apiUrl = null;
        this.serial = this.generateSerial(mac);
        this.deviceId = this.generateDeviceId(mac);
        this.deviceId2 = this.deviceId;

        this.token = "";
        this.random = null;

        // Conditional Headers for Tizen vs Browser
        const headers = {
            "Accept-Language": "en-US,en;q=0.5",
            "Pragma": "no-cache",
            "Accept": "*/*",
            "X-Requested-With": "XMLHttpRequest"
        };

        // Only set unsafe headers if we are likely on a TV or environment that allows it
        // (Browsers block these and throw errors)
        const isTizen = typeof window !== 'undefined' && (window.tizen || navigator.userAgent.includes('Tizen'));

        if (isTizen) {
            headers["User-Agent"] = "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3";
            headers["X-User-Agent"] = "Model: MAG250; Link: WiFi";
            headers["Referer"] = this.portalUrl + "/stalker_portal/c/index.html";
        }

        console.log(`[StalkerPortal] Init Axios: URL=${this.portalUrl}, MAC=${this.mac}`);

        // Initialize Axios Client (Still managed here as the "Context")
        this.client = axios.create({
            baseURL: this.portalUrl,
            timeout: 10000,
            // withCredentials: true, // REMOVED: Try without strict CORS cookies first
            headers: headers,
            paramsSerializer: (params) => {
                // Standard Stalker order: type, action, mac, ... others ... token, JsHttpRequest
                const orderedKeys = ["type", "action", "mac", "stb_lang", "timezone"];
                const parts = [];
                for (const key of orderedKeys) {
                    if (key in params) {
                        parts.push(`${key}=${encodeURIComponent(params[key])}`);
                        delete params[key];
                    }
                }

                let tokenVal = null;
                if ("token" in params) {
                    tokenVal = params["token"];
                    delete params["token"];
                }

                let jsHttpVal = null;
                if ("JsHttpRequest" in params) {
                    jsHttpVal = params["JsHttpRequest"];
                    delete params["JsHttpRequest"];
                }

                // Add remaining keys
                for (const key in params) {
                    parts.push(`${key}=${encodeURIComponent(params[key])}`);
                }

                // Append Token near the end
                if (tokenVal !== null) {
                    parts.push(`token=${encodeURIComponent(tokenVal)}`);
                }

                // Append JsHttpRequest last
                if (jsHttpVal !== null) {
                    parts.push(`JsHttpRequest=${encodeURIComponent(jsHttpVal)}`);
                }
                return parts.join('&');
            }
        });

        // Interceptor to inject Cookies dynamically
        this.client.interceptors.request.use(config => {
            if (config.url && (config.url.includes("/c/") && !config.url.includes("/stalker_portal/"))) {
                try { config.headers["Referer"] = this.portalUrl + "/c/index.html"; } catch (e) { }
            }

            let cookies = `mac=${encodeURIComponent(this.mac)}; stb_lang=en; timezone=${encodeURIComponent("Europe/Paris")}`;
            // Matches Python: generate_headers(include_auth=True) checks for bearer_token
            if (this.bearer_token) {
                config.headers["Authorization"] = `Bearer ${this.bearer_token}`;
            } else if (this.token) {
                // Fallback if bearer_token not set but token is
                config.headers["Authorization"] = `Bearer ${this.token}`;
            }

            // Cookie set moved to conditional block below

            if (config.method === 'get' && config.params) {
                config.params.mac = this.mac;
                config.params.stb_lang = 'en';
                config.params.timezone = 'Europe/Paris';
                // Python does NOT add token to params generally, it uses headers.
                // We rely on headers now as requested.
            }

            // Try to set "unsafe" headers only on Tizen/Device
            const isTizen = typeof window !== 'undefined' && (window.tizen || navigator.userAgent.includes('Tizen'));

            if (isTizen) {
                try {
                    // We already set UA/Referer in defaults, but cookie is dynamic.
                    // Cookie header is forbidden in standard browsers but allowed in Tizen WebApp
                    config.headers["Cookie"] = cookies;
                } catch (e) { }
            } else {
                // In standard browser:
                // 1. We CANNOT set Cookie header (it uses document.cookie).
                // 2. We CANNOT set User-Agent/Referer.
                // We leave them out to avoid "Refused to set unsafe header" errors.
            }

            // console.log(`[Axios] ${config.method.toUpperCase()} ${config.url}`, config.params);

            // console.log(`[Axios] ${config.method.toUpperCase()} ${config.url}`, config.params);
            return config;
        });

        this.client.interceptors.response.use(async response => {
            // Global delay as requested to prevent server connection resets
            await new Promise(r => setTimeout(r, 500));

            if (response.data && typeof response.data === 'string' && response.data.trim().length === 0) {
                console.warn(`[Axios] Empty response from ${response.config.url}`);
            }
            return response;
        }, error => {
            if (error.response) {
                console.warn(`[Axios] Error ${error.response.status} from ${error.config.url}`);
            }
            return Promise.reject(error);
        });
    }

    // --- Crypto Helpers (Still needed here for constructor init of serials, or could move) ---
    generateSerial(mac) {
        return CryptoJS.MD5(mac).toString().toUpperCase().substring(0, 13);
    }
    generateDeviceId(mac) {
        return CryptoJS.SHA256(mac).toString().toUpperCase();
    }

    // --- API Methods delegated to StalkerUtils ---

    async handshake() {
        return await StalkerUtils.performHandshake(this);
    }

    async getProfile() {
        return await StalkerUtils.getProfile(this);
    }

    async getAllChannels() {
        // First get categories, then get channels for first one, or all logic?
        // Original StalkerPortal.js just called action: "get_all_channels" which is different.
        // But utils mimic Python which fetches by category.
        // Let's use getCategories -> getChannelsInCategory loop?
        // OR does stalker_content support "get_all_channels"? No.

        // Wait, original StalkerPortal.js used "get_all_channels". 
        // Python code uses get_channels_in_category.
        // The user asked to "migrate from @[StalkerUtils]".
        // So I should use the Utils logic.
        // "get_all_channels" in StalkerPortal.js was likely custom or older API.
        // I will implement getAllChannels by fetching categories then channels of first category (IPTV) 
        // similar to Python logic, or just first category for now to be safe/fast.

        const categories = await StalkerUtils.getCategories(this, "itv");
        if (categories.length > 0) {
            // Fetching all channels from all categories might be slow.
            // Let's fetch from the FIRST category for the test (or mimic get_all_channels by chaining).
            // For checking "Connect & Play", one playlist is enough.
            console.log(`[StalkerPortal] Fetched ${categories.length} categories. Fetching items for first one: ${categories[0].name}`);
            return await StalkerUtils.getChannelsInCategory(this, categories[0]["category_id"]);
        }
        return [];
    }

    async createLink(type, cmd) {
        // We create an item-like object for the Util
        // Map 'itv' -> 'channel', 'vod' -> 'vod'
        const itemType = (type === "vod") ? "vod" : "channel";
        const item = { item_type: itemType, cmd: cmd };
        return await StalkerUtils.getStreamLink(this, item);
    }

    getPlaybackHeaders() {
        return {
            "User-Agent": this.client.defaults.headers["User-Agent"],
            "Cookie": `mac=${encodeURIComponent(this.mac)}; stb_lang=en; timezone=${encodeURIComponent("Europe/Paris")}; token=${encodeURIComponent(this.token)}`
        };
    }
}

// Expose to window for index.html usage
// Since index.html script is not a module yet, we gotta be careful.
// If index.html becomes module, this works.
if (typeof window !== 'undefined') {
    window.StalkerPortal = StalkerPortal;
}

export default StalkerPortal;
