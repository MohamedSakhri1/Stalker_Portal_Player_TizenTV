// Migrated from stalker_handshake.py
// Requires CryptoJS to be available in scope or imported

export function generateToken() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let token = "";
    for (let i = 0; i < 32; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    console.debug(`Generated token: ${token}`);
    return token;
}

export function generatePrehash(token) {
    if (typeof CryptoJS === 'undefined') {
        console.warn("CryptoJS is not defined. Prehash generation will fail.");
        return "";
    }
    const prehash = CryptoJS.SHA1(token).toString();
    console.debug(`Generated prehash from token: ${prehash}`);
    return prehash;
}

export async function performHandshake(portal) {
    const apiSuffixes = [
        "/stalker_portal/server/load.php",
        "/server/load.php",
        "/portal.php",
        "/c/server/load.php",
        "/c/portal.php",
        "/c/stalker_portal/server/load.php"
    ];

    const baseUrls = [];
    let originalBase = portal.portalUrl.replace(/\/$/, "");
    baseUrls.push(originalBase);

    if (originalBase.endsWith('/c')) {
        baseUrls.push(originalBase.slice(0, -2));
    }

    if (originalBase.endsWith('/stalker_portal/c')) {
        baseUrls.push(originalBase.slice(0, -17));
    }

    try {
        const parsed = new URL(originalBase);
        const rootUrl = `${parsed.protocol}//${parsed.host}`;
        if (!baseUrls.includes(rootUrl)) {
            baseUrls.push(rootUrl);
        }
    } catch (e) {
        console.warn("Invalid portal URL:", originalBase);
    }

    const testedUrls = new Set();
    let workingUrl = null;
    let finalJsData = null;

    for (const base of baseUrls) {
        if (workingUrl) break;

        for (const suffix of apiSuffixes) {
            if (workingUrl) break;

            let fullUrl;
            if (base.endsWith('/') && suffix.startsWith('/')) {
                fullUrl = base + suffix.substring(1);
            } else if (!base.endsWith('/') && !suffix.startsWith('/')) {
                fullUrl = base + '/' + suffix;
            } else {
                fullUrl = base + suffix;
            }

            if (testedUrls.has(fullUrl)) continue;
            testedUrls.add(fullUrl);

            console.debug(`Handshake - Attempting ${fullUrl}`);

            const params = {
                type: "stb",
                action: "handshake",
                token: "",
                JsHttpRequest: "1-xml"
            };

            try {
                const response = await portal.client.get(fullUrl, { params: params });

                if (response.status === 200) {
                    const jsData = response.data && response.data.js ? response.data.js : null;

                    if (jsData && jsData.token) {
                        workingUrl = fullUrl;
                        finalJsData = jsData;
                        console.info(`Handshake successful on URL: ${fullUrl}`);
                        break;
                    }

                    // Fallback Logic
                    console.warn(`URL ${fullUrl} returned 200 OK but invalid JSON. Attempting Client-Side Token Fallback.`);

                    const token = generateToken();
                    const prehash = generatePrehash(token);

                    portal.token = token;

                    const retryParams = {
                        type: "stb",
                        action: "handshake",
                        token: token,
                        prehash: prehash,
                        JsHttpRequest: "1-xml"
                    };

                    const retryResp = await portal.client.get(fullUrl, { params: retryParams });
                    if (retryResp.status === 200 && retryResp.data && retryResp.data.js && retryResp.data.js.token) {
                        workingUrl = fullUrl;
                        finalJsData = retryResp.data.js;
                        console.info(`Handshake fallback successful on URL: ${fullUrl}`);
                        break;
                    }
                }
            } catch (error) {
                // Python logs error and continues
                console.warn(`Handshake request failed for ${fullUrl}:`, error.message);
            }
        }
    }

    if (!workingUrl || !finalJsData) {
        console.error(`Failed to perform handshake. Scanned ${testedUrls.size} URLs.`);
        throw new Error("Failed to perform handshake on any known path.");
    }

    // Upsert portal state
    if (workingUrl) {
        portal.activeApiPath = workingUrl;
        portal.apiUrl = workingUrl;
        console.info(`Updated API Endpoint URL to: ${workingUrl}`);
    }

    portal.token = finalJsData.token;

    if (finalJsData.random) {
        portal.random = finalJsData.random.toLowerCase();
    } else {
        // Fallback random generation
        // Python: portal.generate_random_value()
        // Assuming portal has this or we use local
        const generateRandom = () => {
            const chars = '0123456789abcdef';
            let result = '';
            for (let i = 0; i < 40; i++) result += chars[Math.floor(Math.random() * chars.length)];
            return result;
        };
        portal.random = portal.generateRandom ? portal.generateRandom() : generateRandom();
    }

    portal.tokenTimestamp = Date.now() / 1000;
    portal.bearerToken = portal.token;
    console.debug(`Handshake sequence complete. Token: ${portal.token}`);
}
