/**
 * IndexedDB storage for browser sync.
 * Stores directory handle and sync state persistently.
 */

export interface StorageConfig {
	dbName: string;
}

const DEFAULT_CONFIG: StorageConfig = {
	dbName: "trip2g-sync",
};

let currentConfig: StorageConfig = DEFAULT_CONFIG;
const DB_VERSION = 1;
const HANDLE_STORE = "handles";
const STATE_STORE = "state";

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Configure storage settings. Call before any storage operations.
 */
export function configureStorage(config: Partial<StorageConfig>): void {
	// If config changed, close existing connection
	if (dbPromise && config.dbName && config.dbName !== currentConfig.dbName) {
		dbPromise.then((db) => db.close()).catch(() => {});
		dbPromise = null;
	}
	currentConfig = { ...currentConfig, ...config };
}

function openDB(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;

	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(currentConfig.dbName, DB_VERSION);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;

			// Store for directory handles
			if (!db.objectStoreNames.contains(HANDLE_STORE)) {
				db.createObjectStore(HANDLE_STORE);
			}

			// Store for sync state
			if (!db.objectStoreNames.contains(STATE_STORE)) {
				db.createObjectStore(STATE_STORE);
			}
		};
	});

	return dbPromise;
}

// ============ Directory Handle ============

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(HANDLE_STORE, "readwrite");
		const store = tx.objectStore(HANDLE_STORE);
		const request = store.put(handle, "directory");

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve();
	});
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(HANDLE_STORE, "readonly");
		const store = tx.objectStore(HANDLE_STORE);
		const request = store.get("directory");

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result ?? null);
	});
}

export async function clearDirectoryHandle(): Promise<void> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(HANDLE_STORE, "readwrite");
		const store = tx.objectStore(HANDLE_STORE);
		const request = store.delete("directory");

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve();
	});
}

/**
 * Request permission to access the directory.
 * Must be called on user gesture if permission was lost.
 */
export async function requestPermission(
	handle: FileSystemDirectoryHandle
): Promise<boolean> {
	const permission = await handle.requestPermission({ mode: "readwrite" });
	return permission === "granted";
}

/**
 * Check if we have permission to access the directory.
 */
export async function checkPermission(
	handle: FileSystemDirectoryHandle
): Promise<boolean> {
	const permission = await handle.queryPermission({ mode: "readwrite" });
	return permission === "granted";
}

// ============ Sync State ============

import type { SyncState } from "../types";

export async function saveSyncState(state: SyncState): Promise<void> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STATE_STORE, "readwrite");
		const store = tx.objectStore(STATE_STORE);
		const request = store.put(state, "syncState");

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve();
	});
}

export async function loadSyncState(): Promise<SyncState> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STATE_STORE, "readonly");
		const store = tx.objectStore(STATE_STORE);
		const request = store.get("syncState");

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result ?? { files: {} });
	});
}

export async function clearSyncState(): Promise<void> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STATE_STORE, "readwrite");
		const store = tx.objectStore(STATE_STORE);
		const request = store.delete("syncState");

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve();
	});
}
