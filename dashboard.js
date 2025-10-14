// dashboard.js

// tiny IndexedDB helper
const DB_NAME = 'dashboard-store-v1';
const STORE_NAME = 'files';

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const os = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        os.createIndex('by-owner', 'owner', { unique: false });
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function addFileRecord(record) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function getFilesForUser(owner) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const idx = tx.objectStore(STORE_NAME).index('by-owner');
    const req = idx.getAll(owner);
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}

async function deleteFile(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function deleteAllForUser(owner) {
  const files = await getFilesForUser(owner);
  await Promise.all(files.map(f => deleteFile(f.id)));
}

// helpers
function uid() { return Math.random().toString(36).slice(2) + Date.now(); }
function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
  return (n/(1024*1024)).toFixed(2) + ' MB';
}

// auth guard
const loggedUser = sessionStorage.getItem('loggedUser');
if (!loggedUser) {
  // not logged in -> go to login
  window.location = 'index.html';
  throw new Error('Not authenticated');
}

document.getElementById('who').textContent = loggedUser;

const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploadMsg = document.getElementById('uploadMsg');
const listEl = document.getElementById('filesList');
const clearAllBtn = document.getElementById('clearAll');
const logoutBtn = document.getElementById('logoutBtn');

logoutBtn.onclick = () => {
  sessionStorage.removeItem('loggedUser');
  window.location = 'index.html';
};

async function refreshList() {
  listEl.innerHTML = '';
  const files = await getFilesForUser(loggedUser);
  if (!files.length) {
    listEl.innerHTML = '<li><em>No files uploaded yet</em></li>';
    return;
  }

  files.sort((a,b)=> b.createdAt - a.createdAt).forEach(f => {
    const li = document.createElement('li');
    li.className = 'file-item';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${f.name} (${formatBytes(f.size)})`;

    const openBtn = document.createElement('button');
    openBtn.textContent = 'Download';
    openBtn.onclick = () => {
      // Create blob URL and open in new tab or download
      const blob = new Blob([f.data], { type: f.type });
      const url = URL.createObjectURL(blob);
      // open in new tab
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=> URL.revokeObjectURL(url), 5000);
    };

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.onclick = async () => {
      if (!confirm('Delete this file?')) return;
      await deleteFile(f.id);
      refreshList();
    };

    li.appendChild(nameSpan);
    const controls = document.createElement('span');
    controls.className = 'file-controls';
    controls.appendChild(openBtn);
    controls.appendChild(delBtn);
    li.appendChild(controls);

    listEl.appendChild(li);
  });
}

uploadBtn.onclick = async () => {
  const file = fileInput.files[0];
  if (!file) { uploadMsg.textContent = 'Choose a file first'; return; }
  uploadMsg.textContent = 'Uploading...';

  // read as ArrayBuffer to store binary
  const ab = await file.arrayBuffer();
  const rec = {
    id: uid(),
    owner: loggedUser,
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    data: ab,
    createdAt: Date.now()
  };
  try {
    await addFileRecord(rec);
    uploadMsg.textContent = 'Uploaded!';
    fileInput.value = '';
    await refreshList();
    setTimeout(()=> uploadMsg.textContent = '', 1500);
  } catch (e) {
    uploadMsg.textContent = 'Error saving file: ' + e.message;
  }
};

clearAllBtn.onclick = async () => {
  if (!confirm('Delete ALL files for your account in this browser?')) return;
  await deleteAllForUser(loggedUser);
  refreshList();
};

// initial list
refreshList();
