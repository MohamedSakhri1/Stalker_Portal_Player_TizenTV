const DB_NAME = 'MacIPTVDB';
const DB_VERSION = 1;
const STORE_NAME = 'combos';

const DB = {
    db: null,

    open() {
        return new Promise((resolve, reject) => {
            if (this.db) return resolve(this.db);

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.errorCode);
                reject(event.target.errorCode);
            };
        });
    },

    getAll() {
        return new Promise(async (resolve, reject) => {
            await this.open();
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    add(item) {
        return new Promise(async (resolve, reject) => {
            await this.open();
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            // Ensure ID is unique if manually provided, or let autoIncrement handle it
            if (!item.id) delete item.id;
            const request = store.add(item);

            request.onsuccess = () => resolve(request.result); // Returns ID
            request.onerror = () => reject(request.error);
        });
    },

    put(item) {
        return new Promise(async (resolve, reject) => {
            await this.open();
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(item);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    delete(id) {
        return new Promise(async (resolve, reject) => {
            await this.open();
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // Migration helper
    async migrateFromLocalStorage() {
        const stored = localStorage.getItem('mac_iptv_combos');
        if (stored) {
            try {
                const combos = JSON.parse(stored);
                if (Array.isArray(combos) && combos.length > 0) {
                    console.log("Migrating combos from LocalStorage to IndexedDB...");
                    for (const combo of combos) {
                        // Clean up old ID to let DB generate new one or keep if strict
                        // We'll let DB handle IDs for safety
                        await this.put({
                            name: combo.name || "Imported",
                            url: combo.url,
                            mac: combo.mac
                        });
                    }
                    console.log("Migration complete. Clearing LocalStorage.");
                    localStorage.removeItem('mac_iptv_combos');
                }
            } catch (e) {
                console.error("Migration failed:", e);
            }
        }
    }
};

// Expose globally
window.DB = DB;
