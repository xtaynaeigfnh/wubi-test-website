"use client";

// One origin-wide lock covers the complete synchronous read/modify/write unit.
// Never await inside an operation: nested storage helpers run under this lock.
const LOCK_NAME = "wubi-test:local-data-write:v1";
let lockDepth = 0;

export function hasStorageWriteLock(): boolean {
  return lockDepth > 0;
}

function execute<T>(operation: () => T): T {
  lockDepth += 1;
  try {
    return operation();
  } finally {
    lockDepth -= 1;
  }
}

export async function withStorageWriteLock<T>(operation: () => T): Promise<T> {
  if (hasStorageWriteLock()) return operation();
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(LOCK_NAME, () =>
      typeof indexedDB === "undefined" ? execute(operation) : withIndexedDbWriteLock(operation),
    );
  }
  return withIndexedDbWriteLock(operation);
}

// Keep the IndexedDB request/commit boundary even when Web Locks are available.
// WebKit can grant the next Web Lock before the previous renderer's localStorage
// changes reach this renderer. The database transaction gives storage IPC a
// task boundary before reading and holds the writer until its commit completes.
// No user data is stored here; the transaction only coordinates writes.
function withIndexedDbWriteLock<T>(operation: () => T): Promise<T> {
  if (typeof indexedDB === "undefined") {
    throw new Error("当前浏览器无法安全协调本机数据写入，请使用支持 Web Locks 或 IndexedDB 的浏览器。");
  }
  return new Promise<T>((resolve, reject) => {
    let cancelled = false;
    const request = indexedDB.open(LOCK_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("mutex");
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      cancelled = true;
      reject(new Error("本机写入协调器被其他窗口阻塞，请关闭旧窗口后重试。"));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (cancelled) { db.close(); return; }
      db.onversionchange = () => db.close();
      let result: T;
      let failure: unknown;
      let transaction: IDBTransaction;
      try { transaction = db.transaction("mutex", "readwrite"); }
      catch (error) { db.close(); reject(error); return; }
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onabort = () => { db.close(); reject(failure ?? transaction.error); };
      transaction.onerror = () => { failure ??= transaction.error; };
      transaction.objectStore("mutex").get("lock").onsuccess = () => {
        try { result = execute(operation); }
        catch (error) { failure = error; transaction.abort(); }
      };
    };
  });
}
