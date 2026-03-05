/* ═══════════════════════════════════════════════════════════════════
   cache.js — IndexedDB Cache Manager for Public Market Data
   ═══════════════════════════════════════════════════════════════════ */

const DB_NAME = 'MFAppDB';
const DB_VERSION = 1;
const STORE_NAME = 'marketData';

const CacheManager = {
    _db: null,

    /**
     * Initialize the IndexedDB instance
     */
    async init() {
        if (this._db) return this._db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };

            request.onsuccess = (event) => {
                this._db = event.target.result;
                resolve(this._db);
            };

            request.onerror = (event) => {
                console.error("IndexedDB initialization failed:", event.target.error);
                reject(event.target.error);
            };
        });
    },

    /**
     * Retrieve a value from the cache
     * @param {string} key - Usually the scheme code
     */
    async get(key) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(String(key));

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Store a value in the cache
     * @param {string} key - Usually the scheme code
     * @param {any} value - The payload to cache
     */
    async set(key, value) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            // Append timestamp for invalidation logic in Step 2
            const entry = {
                ...value,
                lastFetchedAt: Date.now()
            };

            const request = store.put(entry, String(key));

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Clear specific entries or the whole store
     */
    async delete(key) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(String(key));

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
};

// Export to window for global access
window.CacheManager = CacheManager;
