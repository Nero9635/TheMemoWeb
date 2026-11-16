// 端末の中の保存場所(IndexedDB)。メモ・写真・そのほかの値を分けて持つ

const DB_NAME = 'thememo';
const VERSION = 1;
let opening = null;

function open() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('memos')) db.createObjectStore('memos', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const s = tx.objectStore(store);
    let result;
    const req = fn(s);
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  allMemos: () => run('memos', 'readonly', (s) => s.getAll()),
  putMemo: (memo) => run('memos', 'readwrite', (s) => s.put(memo)),
  putMemos: (memos) => run('memos', 'readwrite', (s) => { memos.forEach((m) => s.put(m)); }),
  deleteMemo: (id) => run('memos', 'readwrite', (s) => s.delete(id)),

  getImage: (name) => run('images', 'readonly', (s) => s.get(name)),
  putImage: (name, blob) => run('images', 'readwrite', (s) => s.put(blob, name)),
  deleteImage: (name) => run('images', 'readwrite', (s) => s.delete(name)),
  imageNames: () => run('images', 'readonly', (s) => s.getAllKeys()),

  get: (key) => run('kv', 'readonly', (s) => s.get(key)),
  set: (key, value) => run('kv', 'readwrite', (s) => s.put(value, key)),
};
