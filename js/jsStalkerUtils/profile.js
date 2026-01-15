// Migrated from stalker_profile.py
// Requires CryptoJS to be available in scope or imported

export function generateSignature(portal) {
    // Python: hashlib.sha256(data.encode()).hexdigest().upper()
    // Data: mac + serial + device_id1 + device_id2
    // JS equivalent using CryptoJS
    if (typeof CryptoJS === 'undefined') {
        console.warn("CryptoJS is not defined.");
        return "";
    }
    const data = (portal.mac || "") + (portal.serial || "") + (portal.deviceId || "") + (portal.deviceId2 || "");
    const signature = CryptoJS.SHA256(data).toString().toUpperCase();
    console.debug(`Generated signature: ${signature}`);
    return signature;
}

export function generateMetrics(portal) {
    if (!portal.random) {
        // Fallback random
        const generateRandom = () => {
            const chars = '0123456789abcdef';
            let result = '';
            for (let i = 0; i < 40; i++) result += chars[Math.floor(Math.random() * chars.length)];
            return result;
        };
        portal.random = portal.generateRandom ? portal.generateRandom() : generateRandom();
    }

    const metrics = {
        "mac": portal.mac,
        "sn": portal.serial,
        "type": "STB",
        "model": "MAG250",
        "uid": "", // Empty string as per Python code
        "random": portal.random
    };

    // JS JSON.stringify matches Python json.dumps for this simple dict
    const metricsStr = JSON.stringify(metrics);
    console.debug(`Generated metrics: ${metricsStr}`);
    return metricsStr;
}

export async function getProfile(portal) {
    if (portal.ensureToken) {
        await portal.ensureToken();
    } else if (portal.handshake && (!portal.token)) {
        // Fallback if ensureToken logic isn't there
        await portal.handshake();
    }

    // Use active paths
    const url = portal.activeApiPath || portal.apiUrl;

    // Note: Python used explicit SHA1 of mac for hw_version_2
    let hwVersion2 = "";
    if (typeof CryptoJS !== 'undefined') {
        hwVersion2 = CryptoJS.SHA1(portal.mac).toString();
    }

    const params = {
        "type": "stb",
        "action": "get_profile",
        "hd": "1",
        "ver": "ImageDescription: 0.2.18-r23-250; ImageDate: Thu Sep 13 11:31:16 EEST 2018; PORTAL version: 5.6.2; API Version: JS API version: 343; STB API version: 146; Player Engine version: 0x58c",
        "num_banks": "2",
        "sn": portal.serial,
        "stb_type": "MAG250",
        "client_type": "STB",
        "image_version": "218",
        "video_out": "hdmi",
        "device_id": portal.deviceId, // Python: device_id1
        "device_id2": portal.deviceId2,
        "signature": generateSignature(portal),
        "auth_second_step": "1",
        "hw_version": "1.7-BD-00",
        "not_valid_token": "0",
        "metrics": generateMetrics(portal),
        "hw_version_2": hwVersion2,
        "timestamp": Math.floor(Date.now() / 1000),
        "api_signature": "262",
        "prehash": "",
        "JsHttpRequest": "1-xml",
    };

    console.debug("Get Profile params:", params);

    // Explicitly add token if available (to match Python logic strictly)
    if (portal.token && !params.token) {
        params.token = portal.token;
    }

    // Header generation is assumed handled by portal.client interceptors (cookies etc)

    try {
        const response = await portal.client.get(url, { params: params });

        // Python: safe_json_parse(response)
        const jsData = response.data && response.data.js ? response.data.js : null;

        if (!jsData) {
            console.error("Failed to fetch profile (Invalid JS data).");
            return null;
        }

        const token = jsData.token;
        if (token) {
            portal.token = token;
            portal.bearerToken = token;
            portal.tokenTimestamp = Date.now() / 1000;
            console.debug(`Profile token updated: ${portal.token}`);
        }

        console.info("Profile fetched successfully.");
        return jsData;
    } catch (error) {
        console.error("Failed to fetch profile:", error);
        return null;
    }
}
// Migrated from stalker_portal.py (get_account_info)
export async function getAccountInfo(portal) {
    if (!portal.token) {
        console.warn("Cannot get account info without token");
        return null;
    }
    const url = portal.activeApiPath || portal.apiUrl;

    // Use full auth params similar to get_profile to ensure server acceptance
    const params = {
        "type": "stb",
        "action": "get_account_info",
        "mac": portal.mac,
        "sn": portal.serial,
        "stb_type": "MAG250",
        "device_id": portal.deviceId,
        "device_id2": portal.deviceId2,
        "signature": generateSignature(portal),
        "auth_second_step": "1",
        "hw_version": "1.7-BD-00",
        "metrics": generateMetrics(portal),
        "ver": "ImageDescription: 0.2.18-r23-250; ImageDate: Thu Sep 13 11:31:16 EEST 2018; PORTAL version: 5.6.2; API Version: JS API version: 343; STB API version: 146; Player Engine version: 0x58c",
        "token": portal.token, // Explicitly pass token if server expects it in params
        "JsHttpRequest": "1-xml"
    };

    console.debug("Get Account Info params:", params);

    try {
        const response = await portal.client.get(url, { params: params });
        const jsData = response.data && response.data.js ? response.data.js : null;

        if (!jsData) {
            console.error("Failed to fetch account info (Invalid JS data). Response:", response.data);
            return null;
        }

        console.info("Account info fetched successfully:", jsData);
        return jsData;
    } catch (error) {
        console.error("Failed to fetch account info:", error);
        return null;
    }
}
