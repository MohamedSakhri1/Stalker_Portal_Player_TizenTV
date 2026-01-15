// Basic UI State Machine
import StalkerPortal from './StalkerPortal.js';
import { StalkerUtils } from './jsStalkerUtils/orchestrator.js'; // Direct import if needed, or via Portal

const App = {
    state: "LOGIN", // LOGIN, GROUPS, CHANNELS, PLAYER
    stalker: null,

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
        const views = ['login', 'combos', 'groups', 'channels', 'player'];
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
            console.log("[App] Profile Fetched:", this.stalker.profile); // Inspect this!

            // Fetch Categories (Groups)
            // Using Utils directly since StalkerPortal.getAllChannels was test-only
            this.data.categories = await StalkerUtils.getCategories(this.stalker, "itv");

            this.showGroups();

            this.showGroups();

            // Use the already fetched profile data for expiration
            if (this.stalker.profile && this.stalker.profile.expire_billing_date) {
                const dateStr = this.stalker.profile.expire_billing_date;

                if (dateStr === "0000-00-00 00:00:00") {
                    document.getElementById('expiration-info').textContent = "Expiration: Unlimited";
                } else {
                    try {
                        // dateStr is usually YYYY-MM-DD HH:MM:SS
                        // Replace - with / to ensure cross-browser parsing if needed, though most support ISO-ish
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

        // Focus Connect button initially as requested
        setTimeout(() => {
            const btn = document.getElementById('btn-connect');
            if (btn) {
                // Remove class from any auto-selected element (like initNavigation's default)
                document.querySelectorAll('.focused').forEach(el => el.classList.remove('focused'));

                btn.focus();
                btn.classList.add('focused'); // Sync with navigation.js
            }
        }, 100);
    },

    showGroups() {
        this.switchView('view-groups');
        this.state = "GROUPS";

        const container = document.getElementById('groups-list');
        container.innerHTML = "";

        let foundFocus = false;

        this.data.categories.forEach((cat, index) => {
            const el = document.createElement('div');
            el.className = 'list-item focusable';
            el.textContent = cat.name;
            el.onclick = () => this.selectGroup(cat);
            el.id = `group-${cat.category_id}`;

            container.appendChild(el);

            // Restore focus if this was the last selected category
            if (this.data.currentCategory && this.data.currentCategory.category_id === cat.category_id) {
                setTimeout(() => {
                    el.focus();
                    el.classList.add('focused');
                    el.scrollIntoView({ block: 'center' });
                }, 100);
                foundFocus = true;
            }
        });

        // Auto focus first item if no prior selection
        if (!foundFocus && this.data.categories.length > 0) {
            setTimeout(() => {
                const first = container.firstElementChild;
                if (first) { first.focus(); first.classList.add('focused'); }
            }, 100);
        }
    },

    inputLocked: false, // Prevent key bounce/double clicks

    async selectGroup(category) {
        if (this.inputLocked) return;
        console.log(`[App] Selected Group: ${category.name}`);
        this.data.currentCategory = category;

        // Lock input to prevent immediate selection of first channel (key bounce)
        this.inputLocked = true;
        setTimeout(() => { this.inputLocked = false; }, 1000); // 1s safety lock

        // Reset focus state completely when entering a new group
        this.data.pendingFocusId = null;
        this.data.currentChannel = null; // Fix: Prevent legacy focus logic from finding old channel
        sessionStorage.removeItem('lastFocusedChannelId');

        // Reset pending focus from storage
        const lastId = sessionStorage.getItem('lastFocusedChannelId');
        if (lastId) {
            console.log(`[App] Will try to restore focus to channel ID: ${lastId}`);
            this.data.pendingFocusId = parseInt(lastId, 10);
        } else {
            this.data.pendingFocusId = null;
        }

        // UX: Show loading?
        const container = document.getElementById('groups-list');
        container.innerHTML = '<div class="list-item">Loading...</div>';

        try {
            // Reset channels list
            this.data.channels = [];

            // Define incremental loader
            const onProgress = (newChannels) => {
                this.data.channels = this.data.channels.concat(newChannels);
                this.appendChannels(newChannels);

                // Remove "Loading..." specific item if it exists and we have data
                const container = document.getElementById('channels-list');
                const loadingEl = container.querySelector('.loading-item');
                if (loadingEl) {
                    loadingEl.remove();
                }
            };

            this.showChannels(true); // Show view immediately in loading state

            await StalkerUtils.getChannelsInCategory(this.stalker, category.category_id, onProgress);

            // Final check if empty (and no progress was called or network failed silently)
            if (this.data.channels.length === 0) {
                const container = document.getElementById('channels-list');
                container.innerHTML = '<div class="list-item">No Channels Found</div>';
            } else {
                // If we finished loading and still have a pending focus (item not found), fallback to first
                if (this.data.pendingFocusId) {
                    console.warn(`[App] Pending focus channel ${this.data.pendingFocusId} not found in list. Defaulting to first.`);
                    this.data.pendingFocusId = null;
                    const container = document.getElementById('channels-list');
                    if (container.firstElementChild) {
                        container.firstElementChild.focus();
                        container.firstElementChild.classList.add('focused');
                    }
                }
            }

        } catch (e) {
            console.error("Failed to load channels", e);
            // Don't auto-back navigation on error, just alert or show error state in list
            const container = document.getElementById('channels-list');
            container.innerHTML = `<div class="list-item">Error loading channels</div>`;
        }
    },

    showChannels(isLoading = false) {
        this.switchView('view-channels');
        this.state = "CHANNELS";

        const container = document.getElementById('channels-list');

        if (isLoading) {
            container.innerHTML = '<div class="list-item loading-item">Loading Channels...</div>';
            return;
        }

        container.innerHTML = "";

        if (this.data.channels.length === 0) {
            container.innerHTML = '<div class="list-item">No Channels Found</div>';
            return;
        }

        // Initial Render of everything only if not incremental (fallback)
        // Check storage for focus (e.g. returning from player)
        const lastId = sessionStorage.getItem('lastFocusedChannelId');
        if (lastId) {
            this.data.pendingFocusId = parseInt(lastId, 10);
        }

        this.appendChannels(this.data.channels);
    },

    appendChannels(channels) {
        const container = document.getElementById('channels-list');
        let indexOffset = container.childElementCount; // Maintain focus logic index

        // If it was just loading message, clear it
        const loadingEl = container.querySelector('.loading-item');
        if (loadingEl) loadingEl.remove();

        channels.forEach((ch, i) => {
            const index = indexOffset + i;
            const el = document.createElement('div');
            el.className = 'list-item focusable';

            if (ch.logo) {
                const img = document.createElement('img');
                const baseUrl = this.stalker.portalUrl;
                if (ch.logo.startsWith('http') || ch.logo.startsWith('//')) {
                    img.src = ch.logo;
                } else {
                    img.src = `${baseUrl}/stalker_portal/${ch.logo}`;
                }
                img.className = 'channel-logo';
                img.onerror = () => { img.style.display = 'none'; };
                el.appendChild(img);
            }

            const span = document.createElement('span');
            span.textContent = ch.name;
            el.appendChild(span);

            el.onclick = () => this.selectChannel(ch);

            // Auto-focus only if it's the very first item overall
            if (index === 0) setTimeout(() => el.focus(), 100);

            container.appendChild(el);

            // Restore focus check (simplified)
            if (this.data.currentChannel && this.data.currentChannel.id === ch.id) {
                setTimeout(() => {
                    el.focus();
                    el.classList.add('focused');
                    el.scrollIntoView({ block: 'center' });
                }, 100);
            }
            // Check pending focus
            if (this.data.pendingFocusId && this.data.pendingFocusId === ch.id) {
                console.log(`[App] Restoring focus to ${ch.name} (${ch.id})`);
                setTimeout(() => {
                    el.focus();
                    el.classList.add('focused');
                    el.scrollIntoView({ block: 'center' });
                }, 100);
                this.data.pendingFocusId = null; // Found it
            }
        });

        // If we added items and nothing is focused, try to focus first item
        // Check if focus is within container, if not, force focus to first element
        // ONLY if we are NOT waiting for a specific focus item
        if (this.state === "CHANNELS" && indexOffset <= 3 && container.firstElementChild && !this.data.pendingFocusId) {
            const active = document.activeElement;
            const isFocusInContainer = container.contains(active);

            if (!isFocusInContainer) {
                console.log("Auto-focusing first channel item (forced)...");
                setTimeout(() => {
                    // Re-check existence just in case
                    if (container.firstElementChild) {
                        container.firstElementChild.focus();
                        container.firstElementChild.classList.add('focused'); // Visual feedback
                    }
                }, 100);
            }
        }
    },



    async selectChannel(channel) {
        if (this.inputLocked) {
            console.log("[App] Input locked - ignoring selection");
            return;
        }
        console.log(`[App] Selected Channel: ${channel.name}`);
        this.data.currentChannel = channel;

        // Save for focus restoration
        if (channel.id) {
            sessionStorage.setItem('lastFocusedChannelId', channel.id);
        }

        try {
            const link = await this.stalker.createLink("itv", channel.cmd);
            if (link) {
                this.showPlayer(channel, link);
            } else {
                alert("Failed to create link");
            }
        } catch (e) {
            console.error("Play Error", e);
        }
    },

    nextChannel() {
        if (!this.data.currentChannel || this.data.channels.length === 0) return;

        const currentIndex = this.data.channels.findIndex(ch => ch.id === this.data.currentChannel.id);
        let nextIndex = currentIndex + 1;

        // Wrap around
        if (nextIndex >= this.data.channels.length) {
            nextIndex = 0;
        }

        console.log(`[App] Switching to Next Channel (Index: ${nextIndex})`);
        this.selectChannel(this.data.channels[nextIndex]);
    },

    prevChannel() {
        if (!this.data.currentChannel || this.data.channels.length === 0) return;

        const currentIndex = this.data.channels.findIndex(ch => ch.id === this.data.currentChannel.id);
        let prevIndex = currentIndex - 1;

        // Wrap around
        if (prevIndex < 0) {
            prevIndex = this.data.channels.length - 1;
        }

        console.log(`[App] Switching to Prev Channel (Index: ${prevIndex})`);
        this.selectChannel(this.data.channels[prevIndex]);
    },

    showPlayer(channel, url) {
        this.switchView('view-player');
        this.state = "PLAYER";

        document.getElementById('player-title').textContent = channel.name;

        const logoEl = document.getElementById('player-logo');
        if (logoEl) {
            if (channel.logo) {
                const baseUrl = this.stalker.portalUrl;
                if (channel.logo.startsWith('http') || channel.logo.startsWith('//')) {
                    logoEl.src = channel.logo;
                } else {
                    logoEl.src = `${baseUrl}/stalker_portal/${channel.logo}`;
                }
                // Tailwind: remove 'hidden' class, ensure display style is cleared
                logoEl.classList.remove('hidden');
                logoEl.style.display = '';
            } else {
                logoEl.classList.add('hidden');
                logoEl.style.display = 'none';
            }
        }

        // Tizen Requirement: Make background transparent to see video plane
        document.body.classList.add('transparent-bg');
        document.getElementById('view-player').classList.add('transparent-bg');

        // Hide Logs and Title during playback
        document.getElementById('logBox').style.display = 'none';
        document.getElementById('main-title').style.display = 'none';

        // Show overlay initially, then hide after 3 seconds for clean view
        const overlay = document.getElementById('player-overlay');

        // Reset overlay state
        overlay.style.opacity = '1';
        overlay.style.transition = 'opacity 0.2s';

        if (this.overlayTimer) clearTimeout(this.overlayTimer);
        this.overlayTimer = setTimeout(() => {
            overlay.style.transition = 'opacity 1s';
            overlay.style.opacity = '0';
        }, 4000);

        const headers = this.stalker.getPlaybackHeaders();
        const bufferingEl = document.getElementById('buffering-overlay');

        // Define play options
        const playOptions = {
            // Headers disabled to match Python VLC behavior (URL contains token)
            // headers: headers, 
            autoRestart: false, // We handle restart manually to refresh tokens
            onBufferingStart: () => {
                bufferingEl.style.display = 'block';
                bufferingEl.textContent = "Buffering...";
            },
            onBufferingProgress: (percent) => {
                bufferingEl.textContent = `Buffering ${percent}%`;
            },
            onBufferingComplete: () => {
                bufferingEl.style.display = 'none';
            },
            onStreamCompleted: () => {
                console.log("[App] Stream ended. Validating and restarting...");
                this.restartStream(channel);
            },
            onError: (e) => {
                console.error("[App] Playback Failed:", e);
                // alert("Playback Failed: Stream is unplayable."); // Disabled per user request
                this.player.stop(); // Ensure player is stopped
                this.switchView('view-channels');
                this.state = "CHANNELS";

                // Restore layout visibility
                document.body.classList.remove('transparent-bg');
                document.getElementById('view-player').classList.remove('transparent-bg');
                document.getElementById('logBox').style.display = 'block';
                document.getElementById('main-title').style.display = 'block';
                document.getElementById('buffering-overlay').style.display = 'none';
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
            const newLink = await this.stalker.createLink("itv", channel.cmd);
            if (newLink) {
                console.log("[App] Restarting with new link:", newLink);
                this.showPlayer(channel, newLink);
            } else {
                console.error("[App] Failed to refresh link on restart.");
                // Maybe go back to channels?
                this.showChannels();
            }
        } catch (e) {
            console.error("[App] Error restarting stream:", e);
            this.showChannels();
        }
    },

    handleBack() {
        console.log("[App] Back Pressed. Current State:", this.state);
        switch (this.state) {
            case "PLAYER":
                if (this.overlayTimer) clearTimeout(this.overlayTimer);
                player.stop();
                // Restore background and logs
                document.body.classList.remove('transparent-bg');
                document.getElementById('view-player').classList.remove('transparent-bg');
                document.getElementById('logBox').style.display = 'block';
                document.getElementById('main-title').style.display = 'block';

                // Reset overlay for next time
                document.getElementById('player-overlay').style.opacity = '1';

                this.showChannels();
                break;
            case "CHANNELS":
                sessionStorage.removeItem('lastFocusedChannelId'); // Clear saved focus
                this.showGroups();
                break;
            case "GROUPS":
                this.showLogin();
                break;
            case "COMBOS":
                this.showLogin();
                break;
            case "LOGIN":
                // Exit app?
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
        // Reset focus? Focus logic handles it inside showX methods
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
