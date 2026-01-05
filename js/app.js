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

    init() {
        console.log("[App] Initializing...");
        // Ensure buttons have bindings
        // (OnClick attributes in HTML handle this for Login)
        // Global access
        window.App = this;
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
            console.log("[App] Profile Fetched");

            // Fetch Categories (Groups)
            // Using Utils directly since StalkerPortal.getAllChannels was test-only
            this.data.categories = await StalkerUtils.getCategories(this.stalker, "itv");

            this.showGroups();
        } catch (e) {
            console.error("[App] Connection Failed:", e);
            alert("Connection Failed: " + e.message);
        }
    },

    showLogin() {
        this.switchView('view-login');
        this.state = "LOGIN";
        player.stop();
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

    async selectGroup(category) {
        console.log(`[App] Selected Group: ${category.name}`);
        this.data.currentCategory = category;

        // UX: Show loading?
        const container = document.getElementById('groups-list');
        container.innerHTML = '<div class="list-item">Loading...</div>';

        try {
            this.data.channels = await StalkerUtils.getChannelsInCategory(this.stalker, category.category_id);
            this.showChannels();
        } catch (e) {
            console.error("Failed to load channels", e);
            this.showGroups(); // Go back on fail
        }
    },

    showChannels() {
        this.switchView('view-channels');
        this.state = "CHANNELS";

        const container = document.getElementById('channels-list');
        container.innerHTML = "";

        if (this.data.channels.length === 0) {
            container.innerHTML = '<div class="list-item">No Channels Found</div>';
            return;
        }

        let foundFocus = false;

        this.data.channels.forEach((ch, index) => {
            const el = document.createElement('div');
            el.className = 'list-item focusable';
            el.textContent = ch.name;
            el.onclick = () => this.selectChannel(ch);
            if (index === 0) setTimeout(() => el.focus(), 100);
            container.appendChild(el);

            // Restore focus if this was the last selected channel
            if (this.data.currentChannel && this.data.currentChannel.id === ch.id) {
                setTimeout(() => {
                    el.focus();
                    el.classList.add('focused');
                    el.scrollIntoView({ block: 'center' });
                }, 100);
                foundFocus = true;
            }
        });

        if (!foundFocus && this.data.channels.length > 0) {
            setTimeout(() => {
                const first = container.firstElementChild;
                if (first) { first.focus(); first.classList.add('focused'); }
            }, 100);
        }
    },

    async selectChannel(channel) {
        console.log(`[App] Selected Channel: ${channel.name}`);
        this.data.currentChannel = channel;

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

    showPlayer(channel, url) {
        this.switchView('view-player');
        this.state = "PLAYER";

        document.getElementById('player-title').textContent = channel.name;

        // Tizen Requirement: Make background transparent to see video plane
        document.body.classList.add('transparent-bg');
        document.getElementById('view-player').classList.add('transparent-bg');

        // Hide Logs and Title during playback
        document.getElementById('logBox').style.display = 'none';
        document.getElementById('main-title').style.display = 'none';

        // Show overlay initially, then hide after 3 seconds for clean view
        const overlay = document.getElementById('player-overlay');
        overlay.style.opacity = '1';

        if (this.overlayTimer) clearTimeout(this.overlayTimer);
        this.overlayTimer = setTimeout(() => {
            overlay.style.transition = 'opacity 1s';
            overlay.style.opacity = '0';
        }, 3000);

        const headers = this.stalker.getPlaybackHeaders();
        const bufferingEl = document.getElementById('buffering-overlay');

        // Define play options
        const playOptions = {
            headers: headers,
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

    showCombos() {
        this.switchView('view-combos');
        this.state = "COMBOS";
        this.loadCombos();
        this.renderCombos();
        // Clear inputs
        document.getElementById('comboName').value = "";
        document.getElementById('comboUrl').value = "";
        document.getElementById('comboMac').value = "";
        this.selectedComboId = null;
    },

    loadCombos() {
        const stored = localStorage.getItem('mac_iptv_combos');
        if (stored) {
            try {
                this.combos = JSON.parse(stored);
            } catch (e) {
                console.error("Failed to parse combos", e);
                this.combos = [];
            }
        } else {
            this.combos = [];
        }
    },

    saveCombosToStorage() {
        localStorage.setItem('mac_iptv_combos', JSON.stringify(this.combos));
    },

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

    saveCombo() {
        const name = document.getElementById('comboName').value.trim();
        const url = document.getElementById('comboUrl').value.trim();
        const mac = document.getElementById('comboMac').value.trim();

        if (!url || !mac) {
            alert("Please enter URL and MAC");
            return;
        }

        const newCombo = {
            id: Date.now(), // Simple ID
            name: name || "Unnamed",
            url: url,
            mac: mac
        };

        this.combos.push(newCombo);
        this.saveCombosToStorage();
        this.renderCombos();
        alert("Combo Saved!");
    },

    updateCombo() {
        if (!this.selectedComboId) {
            alert("No combo selected to update");
            return;
        }

        const name = document.getElementById('comboName').value.trim();
        const url = document.getElementById('comboUrl').value.trim();
        const mac = document.getElementById('comboMac').value.trim();

        if (!url || !mac) {
            alert("Please enter URL and MAC");
            return;
        }

        const index = this.combos.findIndex(c => c.id === this.selectedComboId);
        if (index !== -1) {
            this.combos[index].name = name || "Unnamed";
            this.combos[index].url = url;
            this.combos[index].mac = mac;
            this.saveCombosToStorage();
            this.renderCombos();
            alert("Combo Updated!");
        }
    },

    deleteCombo() {
        if (!this.selectedComboId) {
            alert("No combo selected to delete");
            return;
        }

        const index = this.combos.findIndex(c => c.id === this.selectedComboId);
        if (index !== -1) {
            this.combos.splice(index, 1);
            this.saveCombosToStorage();
            this.renderCombos();

            // Clear inputs
            document.getElementById('comboName').value = "";
            document.getElementById('comboUrl').value = "";
            document.getElementById('comboMac').value = "";
            this.selectedComboId = null;
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
