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
    },

    /**
     * Invalidation logic: Check if a cached object is still fresh.
     * @param {Object} cached - The object retrieved from IndexedDB
     * @returns {boolean}
     */
    isCacheValid(cached) {
        if (!cached || !cached.lastFetchedAt) return false;

        // 1. Check if fetched within the last 12 hours
        const ageInMs = Date.now() - cached.lastFetchedAt;
        if (ageInMs < 12 * 60 * 60 * 1000) return true;

        // 2. Check if the latest NAV in the data array is from "today" (or "yesterday" if weekend)
        if (cached.data && cached.data.length > 0) {
            const latestEntry = cached.data[0]; // Assuming descending sort (latest first)
            const latestNavDate = new Date(latestEntry.date);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Determine expected market date (yesterday if Sat/Sun)
            let expectedMarketDate = new Date(today);
            const day = today.getDay(); // 0 = Sun, 6 = Sat
            if (day === 0) expectedMarketDate.setDate(today.getDate() - 2); // Sunday -> Friday
            else if (day === 6) expectedMarketDate.setDate(today.getDate() - 1); // Saturday -> Friday

            // If the latest NAV date is >= our expected market date, it's valid
            if (latestNavDate >= expectedMarketDate) return true;
        }

        return false;
    }
};

// Export to window for global access
window.CacheManager = CacheManager;
