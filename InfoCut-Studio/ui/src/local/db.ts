// 휴대폰 안 저장소 (IndexedDB): 설정, 프로젝트, 고친 기록, 사진·소리 파일
const NAME = 'infocut';
const STORES = ['kv', 'projects', 'versions', 'files'] as const;
type Store = (typeof STORES)[number];

let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, 1);
      req.onupgradeneeded = () => { for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { opening = null; reject(new Error('저장소를 열 수 없어요.')); };
    });
  }
  return opening;
}

function run<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error?.name === 'QuotaExceededError' ? new Error('저장 공간이 부족해요.') : (tx.error || new Error('저장 실패')));
    tx.onabort = () => reject(tx.error?.name === 'QuotaExceededError' ? new Error('저장 공간이 부족해요.') : (tx.error || new Error('저장 실패')));
  }));
}

const prefix = (p: string) => IDBKeyRange.bound(p, `${p}￿`);

export const db = {
  get: <T>(store: Store, key: string) => run<T | undefined>(store, 'readonly', (s) => s.get(key)),
  put: (store: Store, key: string, value: unknown) => run(store, 'readwrite', (s) => s.put(value, key)),
  del: (store: Store, key: string) => run(store, 'readwrite', (s) => s.delete(key)),
  delPrefix: (store: Store, p: string) => run(store, 'readwrite', (s) => s.delete(prefix(p))),
  all: <T>(store: Store, p = '') => run<T[]>(store, 'readonly', (s) => s.getAll(p ? prefix(p) : undefined)),
  keys: (store: Store, p = '') => run<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys(p ? prefix(p) : undefined)) as Promise<string[]>,
};
