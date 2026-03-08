/* ═══════════════════════════════════════════════════════════════════
   database.js — MFAppDB v2 ETL strictly-typed IndexedDB
   ═══════════════════════════════════════════════════════════════════ */

const DB_NAME = 'MFAppDB';
const DB_VERSION = 2;

const STORE_SYNC = 'sync_metadata';
const STORE_FUNDS = 'funds';
const STORE_PEERS = 'category_peers';

const MFDB = {
    _db: null,

    async init() {
        if (this._db) return this._db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Wipe old V1 cache
                if (db.objectStoreNames.contains('marketData')) {
                    db.deleteObjectStore('marketData');
                }

                // Create V2 Stores
                if (!db.objectStoreNames.contains(STORE_SYNC)) {
                    db.createObjectStore(STORE_SYNC, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORE_FUNDS)) {
                    db.createObjectStore(STORE_FUNDS, { keyPath: 'schemeCode' });
                }
                if (!db.objectStoreNames.contains(STORE_PEERS)) {
                    db.createObjectStore(STORE_PEERS, { keyPath: 'categoryId' });
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

    async getSyncState() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SYNC], 'readonly');
            const store = tx.objectStore(STORE_SYNC);
            const request = store.get('latest');
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    },

    async setSyncState(date, status) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SYNC], 'readwrite');
            const store = tx.objectStore(STORE_SYNC);
            const request = store.put({ id: 'latest', date, status, timestamp: Date.now() });
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    },

    async getFund(code) {
        if (!code) return null;
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_FUNDS], 'readonly');
            const store = tx.objectStore(STORE_FUNDS);
            const request = store.get(String(code));
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    },

    async setFund(fundObj) {
        if (!fundObj || !fundObj.schemeCode) return false;
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_FUNDS], 'readwrite');
            const store = tx.objectStore(STORE_FUNDS);
            const request = store.put({ ...fundObj, schemeCode: String(fundObj.schemeCode) });
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    },

    async getPeers(category) {
        if (!category) return null;
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_PEERS], 'readonly');
            const store = tx.objectStore(STORE_PEERS);
            const request = store.get(String(category));
            request.onsuccess = () => resolve(request.result ? request.result.peers : null);
            request.onerror = () => reject(request.error);
        });
    },

    async setPeers(category, peersArray) {
        if (!category) return false;
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_PEERS], 'readwrite');
            const store = tx.objectStore(STORE_PEERS);
            const request = store.put({ categoryId: String(category), peers: peersArray, updated_at: Date.now() });
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
};

window.MFDB = MFDB;
