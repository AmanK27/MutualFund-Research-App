/**
 * advisor-db.js
 * 
 * Handles the isolated IndexedDB for the Robo-Advisor micro-app,
 * and provides read-only access to the main app's cached market data.
 */

const ADVISOR_DB_NAME = 'AdvisorDB';
const ADVISOR_DB_VERSION = 1;
const ADVISOR_STORE = 'analysisLogs';



const AdvisorDB = {
    _db: null,

    /**
     * Initialize the isolated Advisor DB
     */
    async init() {
        if (this._db) return this._db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(ADVISOR_DB_NAME, ADVISOR_DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(ADVISOR_STORE)) {
                    // Create object store with autoIncrementing key for logs
                    db.createObjectStore(ADVISOR_STORE, { autoIncrement: true });
                }
            };

            request.onsuccess = (event) => {
                this._db = event.target.result;
                resolve(this._db);
            };

            request.onerror = (event) => {
                console.error("AdvisorDB initialization failed:", event.target.error);
                reject(event.target.error);
            };
        });
    },

    /**
     * Save an analysis log to the isolated DB
     */
    async saveLog(logData) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([ADVISOR_STORE], 'readwrite');
            const store = transaction.objectStore(ADVISOR_STORE);
            const request = store.add({
                ...logData,
                timestamp: Date.now()
            });

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Read-only access to the main app's public market data cache via MFDB
     */
    async getMarketData(schemeCode) {
        if (typeof MFDB === 'undefined') {
            console.warn("MFDB is not loaded.");
            return null;
        }

        try {
            return await MFDB.getFund(schemeCode);
        } catch (e) {
            console.warn("Could not retrieve fund from MFDB:", e);
            return null;
        }
    }
};

window.AdvisorDB = AdvisorDB;
