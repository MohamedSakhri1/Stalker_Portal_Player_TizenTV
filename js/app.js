// Basic UI State Machine
import StalkerPortal from './StalkerPortal.js';
import { StalkerUtils } from './jsStalkerUtils/orchestrator.js'; // Direct import if needed, or via Portal

const App = {
    state: "LOGIN", // LOGIN, GROUPS, CHANNELS, PLAYER
    stalker: null,
    fetchController: null,

    data: {
        categories: [],
        channels: [],
        currentCategory: null,
        currentChannel: null
    },

    log(msg) {
        console.log("[App Log] " + msg);
    },

    async init() {
        console.log("[App] Initializing...");

        // Load Views Dynamically
        await this.loadViews();

        this.showLogin();

        if (window.initNavigation) {
            window.initNavigation();
        }

        // Ensure buttons have bindings
        // (OnClick attributes in HTML handle this for Login)
        // Global access
        window.App = this;
    },

    async loadViews() {
        const views = ['login', 'combos', 'groups', 'channels', 'player', 'vod_groups', 'vod_list', 'vod_player'];
        const root = document.getElementById('app-root');

        for (const view of views) {
            try {
                const response = await fetch(`views/${view}.html`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const html = await response.text();

                const temp = document.createElement('div');
                temp.innerHTML = html;

                while (temp.firstChild) {
                    root.appendChild(temp.firstChild);
                }
                console.log(`[App] Loaded view: ${view}`);
            } catch (e) {
                console.error(`[App] Failed to load view ${view}:`, e);
                this.log(`Error loading ${view}: ${e.message}`);
            }
        }
    },

    async connect() {
        const url = document.getElementById('portalUrl').value;
        const mac = document.getElementById('macAddr').value;

        console.log(`[App] Connecting to ${url}...`);

        try {
            this.stalker = new StalkerPortal(url, mac);
            await this.stalker.handshake();
            console.log("[App] Handshake Success");

            await this.stalker.getProfile();
            console.log("[App] Profile Fetched:", this.stalker.profile);

            // Fetch Categories (Groups)
            // Default to TV
            this.currentMode = "TV";
            this.data.categories = await StalkerUtils.getCategories(this.stalker, "itv");

            this.showGroups();

            // Use the already fetched profile data for expiration
            if (this.stalker.profile && this.stalker.profile.expire_billing_date) {
                const dateStr = this.stalker.profile.expire_billing_date;

                if (dateStr === "0000-00-00 00:00:00") {
                    document.getElementById('expiration-info').textContent = "Expiration: Unlimited";
                } else {
                    try {
                        const date = new Date(dateStr.replace(/-/g, "/"));

                        if (!isNaN(date.getTime())) {
                            // Format: "January 27, 2026, 9:51 am"
                            const options = {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: 'numeric',
                                hour12: true
                            };
                            const formatted = date.toLocaleDateString('en-US', options);
                            document.getElementById('expiration-info').textContent = formatted;
                        } else {
                            document.getElementById('expiration-info').textContent = dateStr;
                        }
                    } catch (e) {
                        console.warn("Date parse error", e);
                        document.getElementById('expiration-info').textContent = dateStr;
                    }
                }
            }
        } catch (e) {
            console.error("[App] Connection Failed:", e);
            alert("Connection Failed: " + e.message);
        }
    },

    showLogin() {
        this.switchView('view-login');
        this.state = "LOGIN";
        player.stop();

        setTimeout(() => {
            const btn = document.getElementById('btn-connect');
            if (btn) {
                document.querySelectorAll('.focused').forEach(el => el.classList.remove('focused'));
                btn.focus();
                btn.classList.add('focused');
            }
        }, 100);
    },

    currentMode: "TV", // "TV" or "VOD"

    switchMode(mode) {
        if (this.currentMode === mode) return;
        console.log(`[App] Switching Mode to ${mode}`);
        this.currentMode = mode;
        this.showGroups();
    },

    async showGroups() {
        if (this.currentMode === "TV") {
            this.showTvGroups();
        } else {
            this.showVodGroups();
        }
    },

    // --- TV LOGIC ---
    async showTvGroups() {
        this.switchView('view-groups');
        this.state = "GROUPS";
        this.updateSidebarUI('tv');

        const container = document.getElementById('groups-list');
        container.innerHTML = '<div class="list-item">Loading TV Groups...</div>';
        const titleEl = document.getElementById('groups-title');
        titleEl.textContent = "TV Groups";

        try {
            // Always fetch fresh or check cache logic? 
            // Simplest: fetch fresh
            this.data.categories = await StalkerUtils.getCategories(this.stalker, "itv");
        } catch (e) {
            console.error("Error fetching TV groups:", e);
            container.innerHTML = '<div class="list-item">Error Loading Groups</div>';
            return;
        }

        this.renderTvGroups();
    },

    renderTvGroups() {
        const container = document.getElementById('groups-list');
        container.innerHTML = "";

        if (!this.data.categories || this.data.categories.length === 0) {
            container.innerHTML = '<div class="list-item">No Groups Found</div>';
            return;
        }

        this.data.categories.forEach((cat) => {
            const el = document.createElement('div');
            el.className = 'list-item focusable';
            el.textContent = cat.name;
            el.onclick = () => this.selectTvGroup(cat);
            el.id = `group-${cat.category_id}`;
            container.appendChild(el);

            if (this.data.currentCategory && this.data.currentCategory.category_id === cat.category_id) {
                setTimeout(() => { el.focus(); el.classList.add('focused'); el.scrollIntoView({ block: 'center' }); }, 100);
            }
        });

        // Default focus logic similar to before
        if (!document.querySelector('.focused')) {
            setTimeout(() => {
                const btn = document.getElementById('btn-mode-tv');
                if (btn) { btn.focus(); btn.classList.add('focused'); }
            }, 100);
        }
    },

    async selectTvGroup(category) {
        if (this.inputLocked) return;
        console.log(`[App] Selected TV Group: ${category.name}`);

        // Abort previous fetch if any
        if (this.fetchController) {
            this.fetchController.abort();
            this.fetchController = null;
        }
        this.fetchController = new AbortController();
        const options = { signal: this.fetchController.signal };

        this.data.currentCategory = category;
        this.inputLocked = true;
        setTimeout(() => { this.inputLocked = false; }, 1000);

        const lastId = sessionStorage.getItem('lastFocusedChannelId');
        if (lastId) {
            console.log(`[App] Will try to restore focus to channel ID: ${lastId}`);
            this.data.pendingFocusId = lastId;
        } else {
            this.data.pendingFocusId = null;
        }

        const onProgress = (newItems) => {
            if (options.signal.aborted) return;
            this.data.channels = this.data.channels.concat(newItems);
            // Re-use generic append but target TV container
            this.appendChannels(newItems, 'channels-list');

            const loadingEl = document.getElementById('channels-list').querySelector('.loading-item');
            if (loadingEl) loadingEl.remove();
        };

        this.data.channels = [];
        this.showTvList(true);

        try {
            await StalkerUtils.getChannelsInCategory(this.stalker, category.category_id, onProgress, options);
            if (this.data.channels.length === 0) {
                document.getElementById('channels-list').innerHTML = '<div class="list-item">No Channels Found</div>';
            }
        } catch (e) {
            if (!options.signal.aborted) {
                document.getElementById('channels-list').innerHTML = `<div class="list-item">Error loading items</div>`;
            }
        }
    },

    showTvList(isLoading = false) {
        this.switchView('view-channels');
        this.state = "CHANNELS";

        const container = document.getElementById('channels-list');
        if (isLoading) {
            container.innerHTML = '<div class="list-item loading-item">Loading...</div>';
            return;
        }
        container.innerHTML = "";

        if (this.data.channels.length === 0) {
            container.innerHTML = '<div class="list-item">No Channels Found</div>';
            return;
        }

        const lastId = sessionStorage.getItem('lastFocusedChannelId');
        if (lastId) this.data.pendingFocusId = lastId;

        this.appendChannels(this.data.channels, 'channels-list');
    },

    // --- VOD LOGIC ---
    async showVodGroups() {
        this.switchView('view-vod-groups');
        this.state = "VOD_GROUPS";
        this.updateSidebarUI('vod');

        const container = document.getElementById('vod-groups-list');
        container.innerHTML = '<div class="list-item">Loading Movies Groups...</div>';
        const titleEl = document.getElementById('vod-groups-title');
        titleEl.textContent = "Movies Groups";

        try {
            this.data.categories = await StalkerUtils.getCategories(this.stalker, "vod");
        } catch (e) {
            console.error("Error fetching VOD groups:", e);
            container.innerHTML = '<div class="list-item">Error Loading Groups</div>';
            return;
        }
        this.renderVodGroups();
    },

    renderVodGroups() {
        const container = document.getElementById('vod-groups-list');
        container.innerHTML = "";

        if (!this.data.categories || this.data.categories.length === 0) {
            container.innerHTML = '<div class="list-item">No Groups Found</div>';
            return;
        }

        this.data.categories.forEach((cat) => {
            const el = document.createElement('div');
            el.className = 'list-item focusable';
            el.textContent = cat.name;
            el.onclick = () => this.selectVodGroup(cat);
            el.id = `vod-group-${cat.category_id}`;
            container.appendChild(el);

            if (this.data.currentCategory && this.data.currentCategory.category_id === cat.category_id) {
                setTimeout(() => { el.focus(); el.classList.add('focused'); el.scrollIntoView({ block: 'center' }); }, 100);
            }
        });

        if (!document.querySelector('.focused')) {
            setTimeout(() => {
                const btn = document.getElementById('btn-mode-vod-vod'); // ID in vod_groups.html
                if (btn) { btn.focus(); btn.classList.add('focused'); }
            }, 100);
        }
    },

    async selectVodGroup(category) {
        if (this.inputLocked) return;
        console.log(`[App] Selected VOD Group: ${category.name}`);

        // Abort previous
        if (this.fetchController) {
            this.fetchController.abort();
            this.fetchController = null;
        }
        this.fetchController = new AbortController();
        const options = { signal: this.fetchController.signal };

        this.data.currentCategory = category;
        this.inputLocked = true;
        setTimeout(() => { this.inputLocked = false; }, 1000);

        const lastId = sessionStorage.getItem('lastFocusedChannelId');
        if (lastId) {
            this.data.pendingFocusId = lastId;
        } else {
            this.data.pendingFocusId = null;
        }

        const onProgress = (newItems) => {
            if (options.signal.aborted) return;
            this.data.channels = this.data.channels.concat(newItems); // Reuse data.channels for list items
            this.appendChannels(newItems, 'vod-list'); // Use VOD container

            const loadingEl = document.getElementById('vod-list').querySelector('.loading-item');
            if (loadingEl) loadingEl.remove();
        };

        this.data.channels = [];
        this.showVodList(true);

        try {
            await StalkerUtils.getVodInCategory(this.stalker, category.category_id, onProgress, options);
            if (this.data.channels.length === 0) {
                document.getElementById('vod-list').innerHTML = '<div class="list-item">No Movies Found</div>';
            }
        } catch (e) {
            if (!options.signal.aborted) {
                document.getElementById('vod-list').innerHTML = `<div class="list-item">Error loading items</div>`;
            }
        }
    },

    showVodList(isLoading = false) {
        this.switchView('view-vod-list');
        this.state = "VOD_LIST";

        const container = document.getElementById('vod-list');
        if (isLoading) {
            container.innerHTML = '<div class="list-item loading-item">Loading...</div>';
            return;
        }
        container.innerHTML = "";

        if (this.data.channels.length === 0) {
            container.innerHTML = '<div class="list-item">No Movies Found</div>';
            return;
        }

        const lastId = sessionStorage.getItem('lastFocusedChannelId');
        if (lastId) this.data.pendingFocusId = lastId;

        this.appendChannels(this.data.channels, 'vod-list');
    },

    // Helper for Sidebar UI
    updateSidebarUI(activeType) {
        // TV View Sidebar
        const tvBtn = document.getElementById('btn-mode-tv');
        const vodBtn = document.getElementById('btn-mode-vod');
        if (tvBtn && vodBtn) {
            tvBtn.classList.remove('active-mode');
            vodBtn.classList.remove('active-mode');
            if (activeType === 'tv') tvBtn.classList.add('active-mode');
            else vodBtn.classList.add('active-mode');
        }

        // VOD View Sidebar
        const tvBtn2 = document.getElementById('btn-mode-tv-vod');
        const vodBtn2 = document.getElementById('btn-mode-vod-vod');
        if (tvBtn2 && vodBtn2) {
            tvBtn2.classList.remove('active-mode');
            vodBtn2.classList.remove('active-mode');
            if (activeType === 'tv') tvBtn2.classList.add('active-mode');
            else vodBtn2.classList.add('active-mode');
        }
    },

    // Generic Append (Used by both)
    appendChannels(channels, containerId) {
        const container = document.getElementById(containerId);
        let indexOffset = container.childElementCount;

        const loadingEl = container.querySelector('.loading-item');
        if (loadingEl) loadingEl.remove();

        channels.forEach((ch, i) => {
            const index = indexOffset + i;
            const el = document.createElement('div');
            el.className = 'list-item focusable';

            if (ch.logo || ch.screenshot_uri) {
                const img = document.createElement('img');
                const baseUrl = this.stalker.portalUrl;
                let logoUrl = ch.logo || ch.screenshot_uri;
                if (logoUrl) {
                    if (logoUrl.startsWith('http') || logoUrl.startsWith('//')) {
                        img.src = logoUrl;
                    } else {
                        img.src = `${baseUrl}/stalker_portal/${logoUrl}`;
                    }
                    img.className = 'channel-logo';
                    img.onerror = () => { img.style.display = 'none'; };
                    el.appendChild(img);
                }
            }

            const span = document.createElement('span');
            span.textContent = ch.name;
            el.appendChild(span);

            el.onclick = () => this.selectChannel(ch);

            if (index === 0) setTimeout(() => el.focus(), 100);
            container.appendChild(el);

            const itemId = ch.channel_id || ch.movie_id || ch.id;

            // Check PENDING focus
            // Normalize to strings for safe comparison
            if (this.data.pendingFocusId && String(this.data.pendingFocusId) === String(itemId)) {
                console.log(`[App] Restoring focus to ${ch.name} (${itemId})`);
                setTimeout(() => {
                    el.focus();
                    el.classList.add('focused');
                    el.scrollIntoView({ block: 'center' });
                }, 100);
                this.data.pendingFocusId = null;
            }
        });

        // Fallback or Forced focus if none found yet
        if (this.state === "CHANNELS" || this.state === "VOD_LIST") {
            if (indexOffset <= 3 && container.firstElementChild && !this.data.pendingFocusId) {
                // Only default focus if we really don't have a pending target or we are at the start
                // But if pendingFocusId is set, we might be waiting for it to appear (scrolling/loading).
                // However, appendChannels usually renders what we have.
                // If we are looking for ID 500 and only loaded 1-10, we shouldn't force focus on 1?
                // Actually, logic below checks document.activeElement.
                const active = document.activeElement;
                const isFocusInContainer = container.contains(active);

                if (!isFocusInContainer) {
                    setTimeout(() => {
                        // Only force if we are NOT waiting for a specific item, OR if we are sure it's not here?
                        // For now, keep existing behavior but be careful.
                        if (container.firstElementChild && !this.data.pendingFocusId) {
                            container.firstElementChild.focus();
                            container.firstElementChild.classList.add('focused');
                        }
                    }, 100);
                }
            }
        }
    },

    inputLocked: false,

    async selectChannel(channel) {
        if (this.inputLocked) return;
        console.log(`[App] Selected Item: ${channel.name} (${this.currentMode})`);
        this.data.currentChannel = channel;

        const itemId = channel.channel_id || channel.movie_id || channel.id;
        if (itemId) sessionStorage.setItem('lastFocusedChannelId', itemId);

        try {
            let link = null;
            if (this.currentMode === "TV") {
                link = await this.stalker.createLink("itv", channel.cmd);
            } else {
                link = await this.stalker.createLink("vod", channel.cmd);
            }

            if (link) {
                if (this.currentMode === "TV") this.showTvPlayer(channel, link);
                else this.showVodPlayer(channel, link);
            } else {
                alert("Failed to create link");
            }
        } catch (e) {
            console.error("Play Error", e);
        }
    },

    nextChannel() {
        if (!this.data.currentChannel || this.data.channels.length === 0) return;
        const currentId = this.data.currentChannel.id || this.data.currentChannel.movie_id || this.data.currentChannel.channel_id;
        const currentIndex = this.data.channels.findIndex(ch => {
            const chId = ch.id || ch.movie_id || ch.channel_id;
            return chId === currentId;
        });
        let nextIndex = currentIndex + 1;
        if (nextIndex >= this.data.channels.length) nextIndex = 0;
        this.selectChannel(this.data.channels[nextIndex]);
    },

    prevChannel() {
        if (!this.data.currentChannel || this.data.channels.length === 0) return;
        const currentId = this.data.currentChannel.id || this.data.currentChannel.movie_id || this.data.currentChannel.channel_id;
        const currentIndex = this.data.channels.findIndex(ch => {
            const chId = ch.id || ch.movie_id || ch.channel_id;
            return chId === currentId;
        });
        let prevIndex = currentIndex - 1;
        if (prevIndex < 0) prevIndex = this.data.channels.length - 1;
        this.selectChannel(this.data.channels[prevIndex]);
    },

    // --- PLAYERS ---

    showTvPlayer(channel, url) {
        this.switchView('view-player');
        this.state = "PLAYER";
        this.configurePlayer(channel, url, 'player-title', 'player-logo', 'player-overlay', 'buffering-overlay', 'main-title', 'main-author');
    },

    showVodPlayer(channel, url) {
        this.switchView('view-vod-player');
        this.state = "VOD_PLAYER";
        // Note: VOD Player HTML IDs are different
        this.configurePlayer(channel, url, 'vod-player-title', 'vod-player-logo', 'vod-player-overlay', 'vod-buffering-overlay', 'main-title', 'main-author', true);
    },

    configurePlayer(channel, url, titleId, logoId, overlayId, bufferId, hideTitleId, hideAuthorId, isVod = false) {
        document.getElementById(titleId).textContent = channel.name;

        const logoEl = document.getElementById(logoId);
        if (logoEl) {
            const logoUrl = channel.logo || channel.screenshot_uri;
            if (logoUrl) {
                const baseUrl = this.stalker.portalUrl;
                if (logoUrl.startsWith('http') || logoUrl.startsWith('//')) {
                    logoEl.src = logoUrl;
                } else {
                    logoEl.src = `${baseUrl}/stalker_portal/${logoUrl}`;
                }
                logoEl.classList.remove('hidden');
                logoEl.style.display = '';
            } else {
                logoEl.classList.add('hidden');
                logoEl.style.display = 'none';
            }
        }

        document.body.classList.add('transparent-bg');
        // Target correct view for transparent bg
        document.getElementById(isVod ? 'view-vod-player' : 'view-player').classList.add('transparent-bg');

        document.getElementById('logBox').style.display = 'none';
        document.getElementById(hideTitleId).style.display = 'none';
        if (hideAuthorId) {
            const auth = document.getElementById(hideAuthorId);
            if (auth) auth.style.display = 'none';
        }

        const overlay = document.getElementById(overlayId);
        overlay.style.opacity = '1';

        if (this.overlayTimer) clearTimeout(this.overlayTimer);
        this.overlayTimer = setTimeout(() => {
            overlay.style.opacity = '0';
        }, 4000);

        const bufferingEl = document.getElementById(bufferId);

        const playOptions = {
            autoRestart: false,
            onBufferingStart: () => { bufferingEl.style.display = 'block'; bufferingEl.textContent = "Buffering..."; },
            onBufferingProgress: (percent) => { bufferingEl.textContent = `Buffering ${percent}%`; },
            onBufferingComplete: () => { bufferingEl.style.display = 'none'; },
            onStreamCompleted: () => {
                if (!isVod) this.restartStream(channel); // TV: Restart
                else this.handleBack(); // VOD: Exit
            },
            onError: (e) => {
                console.error("Playback Error", e);
                this.player.stop();

                // Fallback exit
                if (isVod) {
                    this.switchView('view-vod-list');
                    this.state = "VOD_LIST";
                    document.getElementById('view-vod-player').classList.remove('transparent-bg');
                } else {
                    this.switchView('view-channels');
                    this.state = "CHANNELS";
                    document.getElementById('view-player').classList.remove('transparent-bg');
                }

                document.body.classList.remove('transparent-bg');
                document.getElementById('logBox').style.display = 'block';
                document.getElementById(hideTitleId).style.display = 'block';
                if (hideAuthorId) {
                    const auth = document.getElementById(hideAuthorId);
                    if (auth) auth.style.display = 'block';
                }
                if (bufferingEl) bufferingEl.style.display = 'none';
            }
        };

        player.play(url, playOptions);
    },

    async restartStream(channel) {
        // Stop first
        player.stop();

        console.log("[App] Refreshing stream link...");
        try {
            // Fetch a fresh link (generates new token)
            // Fix: Use correct type
            const type = (this.currentMode === "TV") ? "itv" : "vod";
            const newLink = await this.stalker.createLink(type, channel.cmd);
            if (newLink) {
                console.log("[App] Restarting with new link:", newLink);
                // Re-use the player configuration logic
                if (this.currentMode === "TV") this.showTvPlayer(channel, newLink);
                else this.showVodPlayer(channel, newLink);
            } else {
                console.error("[App] Failed to refresh link on restart.");
                // Maybe go back to channels?
                this.showTvList(); // Assuming TV mode for restart
            }
        } catch (e) {
            console.error("[App] Error restarting stream:", e);
            this.showTvList(); // Assuming TV mode for restart
        }
    },

    handleBack() {
        console.log("[App] Back Pressed. Current State:", this.state);

        // Abort fetch if pending
        if (this.fetchController) {
            this.fetchController.abort();
            this.fetchController = null;
        }

        // Common cleanup when exiting any player
        if (this.state === "PLAYER" || this.state === "VOD_PLAYER") {
            if (this.overlayTimer) clearTimeout(this.overlayTimer);
            player.stop();
            document.body.classList.remove('transparent-bg');
            document.getElementById('logBox').style.display = 'block';
            document.getElementById('main-title').style.display = 'block';
            const auth = document.getElementById('main-author');
            if (auth) auth.style.display = 'block';
        }

        switch (this.state) {
            case "PLAYER":
                document.getElementById('view-player').classList.remove('transparent-bg');
                document.getElementById('player-overlay').style.opacity = '1';
                this.showTvList(); // Return to TV List
                break;
            case "VOD_PLAYER":
                document.getElementById('view-vod-player').classList.remove('transparent-bg');
                document.getElementById('vod-player-overlay').style.opacity = '1';
                this.showVodList(); // Return to VOD List
                break;
            case "CHANNELS":
                sessionStorage.removeItem('lastFocusedChannelId');
                this.showTvGroups();
                break;
            case "VOD_LIST":
                sessionStorage.removeItem('lastFocusedChannelId');
                this.showVodGroups();
                break;
            case "GROUPS": // TV Groups
                this.showLogin();
                break;
            case "VOD_GROUPS": // VOD Groups
                // If sidebar switches mode, fine. But Back key should go to Login? 
                // Or we could argue user might want to switch back to TV mode. 
                // But consistent navigation says "Up one level". Parent of Groups is Login.
                this.showLogin();
                break;
            case "COMBOS":
                this.showLogin();
                break;
            case "LOGIN":
                console.log("Exit requested");
                if (window.tizen) {
                    try { tizen.application.getCurrentApplication().exit(); } catch (e) { }
                }
                break;
        }
    },

    switchView(viewId) {
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
    },

    // --- COMBO MANAGEMENT ---

    combos: [],
    selectedComboId: null,

    async showCombos() {
        this.switchView('view-combos');
        this.state = "COMBOS";

        // Show loading state if needed, or just clear list
        const container = document.getElementById('combos-list');
        container.innerHTML = '<div class="list-item">Loading...</div>';

        await this.loadCombos();
        this.renderCombos();

        // Clear inputs
        document.getElementById('comboName').value = "";
        document.getElementById('comboUrl').value = "";
        document.getElementById('comboMac').value = "";
        this.selectedComboId = null;
    },

    async loadCombos() {
        // Migrate old data first if exists
        await DB.migrateFromLocalStorage();
        try {
            this.combos = await DB.getAll();
        } catch (e) {
            console.error("Failed to load combos from DB", e);
            this.combos = [];
        }
    },

    // saveCombosToStorage is no longer needed as we use direct DB ops
    // kept for reference or bulk refactor:
    // saveCombosToStorage() { ... }

    renderCombos() {
        const container = document.getElementById('combos-list');
        container.innerHTML = "";

        if (this.combos.length === 0) {
            container.innerHTML = '<div class="list-item">No Combos Saved</div>';
            return;
        }

        this.combos.forEach((combo, index) => {
            const el = document.createElement('div');
            el.className = 'list-item focusable';
            const name = combo.name || "Unnamed";
            el.textContent = `${name} (${combo.url})`; // Show Name and URL
            el.onclick = () => this.fillComboInputs(combo);
            if (index === 0) setTimeout(() => el.focus(), 100);
            container.appendChild(el);
        });
    },

    fillComboInputs(combo) {
        document.getElementById('comboName').value = combo.name || "";
        document.getElementById('comboUrl').value = combo.url;
        document.getElementById('comboMac').value = combo.mac;
        this.selectedComboId = combo.id;
    },

    async saveCombo() {
        const name = document.getElementById('comboName').value.trim();
        const url = document.getElementById('comboUrl').value.trim();
        const mac = document.getElementById('comboMac').value.trim();

        if (name && url && mac) {
            const newCombo = { name, url, mac };
            try {
                if (this.selectedComboId) {
                    newCombo.id = this.selectedComboId;
                    await DB.put(newCombo);
                } else {
                    await DB.add(newCombo);
                }

                this.combos = await DB.getAll();
                this.renderCombos();

                this.selectedComboId = null;
                document.getElementById('comboName').value = "";
                document.getElementById('comboUrl').value = "";
                document.getElementById('comboMac').value = "";
                alert("Combo Saved");
            } catch (e) {
                console.error("Error saving combo:", e);
                alert("Failed to save combo");
            }
        } else {
            alert("Please fill all fields");
        }
    },

    // updateCombo merged into saveCombo

    async deleteCombo() {
        if (this.selectedComboId) {
            try {
                await DB.delete(this.selectedComboId);
                this.combos = await DB.getAll();
                this.renderCombos();

                this.selectedComboId = null;
                document.getElementById('comboName').value = "";
                document.getElementById('comboUrl').value = "";
                document.getElementById('comboMac').value = "";
            } catch (e) {
                console.error("Error deleting combo:", e);
                alert("Failed to delete combo");
            }
        } else {
            alert("No combo selected to delete");
        }
    },

    selectComboAction() {
        const url = document.getElementById('comboUrl').value.trim();
        const mac = document.getElementById('comboMac').value.trim();

        if (!url || !mac) {
            alert("Please enter both URL and MAC (or select a combo)");
            return;
        }

        // Go back to login and fill
        document.getElementById('portalUrl').value = url;
        document.getElementById('macAddr').value = mac;

        this.showLogin();
    }
};

window.App = App;
export default App;
