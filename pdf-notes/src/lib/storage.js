// IndexedDB: PDF 원본(files), 최근 목록(recent), 필기 데이터(notes)를 브라우저에 저장한다.
const DB_NAME = 'pdf-notes'
const DB_VERSION = 1

let dbPromise
function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        for (const name of ['files', 'recent', 'notes']) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

async function run(store, mode, fn) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const req = fn(tx.objectStore(store))
    tx.oncomplete = () => resolve(req?.result)
    tx.onerror = () => reject(tx.error)
  })
}

export const getNotes = id => run('notes', 'readonly', s => s.get(id))
export const saveNotes = (id, doc) => run('notes', 'readwrite', s => s.put(doc, id))
export const getFile = id => run('files', 'readonly', s => s.get(id))

export async function saveFile(id, name, bytes) {
  await run('files', 'readwrite', s => s.put({ name, bytes }, id))
  await run('recent', 'readwrite', s => s.put({ id, name, openedAt: Date.now() }, id))
}

export async function listRecent() {
  const items = (await run('recent', 'readonly', s => s.getAll())) || []
  return items.sort((a, b) => b.openedAt - a.openedAt)
}

export async function removeRecent(id) {
  for (const store of ['files', 'recent', 'notes']) {
    await run(store, 'readwrite', s => s.delete(id))
  }
}
