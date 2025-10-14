// admin.js
// Admin UI — uses same DB as dashboard.js (store 'users' in DB)
const DB_NAME = 'dashboard-store-v1';
const USERS_STORE = 'users';

function openDBUsers() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(USERS_STORE)) {
        db.createObjectStore(USERS_STORE, { keyPath: 'username' });
      }
      // ensure files store exists for compatibility
      if (!db.objectStoreNames.contains('files')) {
        const os = db.createObjectStore('files', { keyPath: 'id' });
        os.createIndex('by-owner', 'owner', { unique: false });
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function getAllUsers() {
  const db = await openDBUsers();
  return new Promise((res, rej) => {
    const tx = db.transaction(USERS_STORE, 'readonly');
    const req = tx.objectStore(USERS_STORE).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}

async function putUser(u) {
  const db = await openDBUsers();
  return new Promise((res, rej) => {
    const tx = db.transaction(USERS_STORE, 'readwrite');
    tx.objectStore(USERS_STORE).put(u);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function deleteUserDB(username) {
  const db = await openDBUsers();
  return new Promise((res, rej) => {
    const tx = db.transaction(USERS_STORE, 'readwrite');
    tx.objectStore(USERS_STORE).delete(username);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// auth guard: only Admin group allowed here
const logged = sessionStorage.getItem('loggedUser');
if (!logged) { window.location = 'index.html'; throw new Error('Not logged'); }

(async function init() {
  // show who
  const whoEl = document.getElementById('who');
  whoEl.textContent = logged;

  // load user object for groups check
  const db = await openDBUsers();
  const tx = db.transaction(USERS_STORE,'readonly');
  const meReq = tx.objectStore(USERS_STORE).get(logged);
  meReq.onsuccess = async () => {
    const me = meReq.result;
    if (!me || !Array.isArray(me.groups) || !me.groups.includes('Admin')) {
      alert('Admin access required');
      window.location = 'dashboard.html';
      return;
    }
    // seed users from credentials.js if DB empty
    const users = await getAllUsers();
    if (!users.length && Array.isArray(window.CREDENTIALS)) {
      for (const c of window.CREDENTIALS) {
        await putUser({
          username: c.username,
          name: c.name || c.username,
          password: c.password,
          groups: c.groups || ['User']
        });
      }
    }
    refreshTable();
  };
  meReq.onerror = () => { alert('Error checking admin'); window.location='dashboard.html'; };
})();

async function refreshTable() {
  const rows = document.querySelector('#usersTable tbody');
  rows.innerHTML = '';
  const users = await getAllUsers();
  users.forEach(u => {
    const tr = document.createElement('tr');
    const g = (u.groups || []).join(',');
    tr.innerHTML = `
      <td>${u.username}</td>
      <td>${u.name || ''}</td>
      <td>${g}</td>
      <td>
        <button data-u="${u.username}" class="edit">Edit</button>
        <button data-u="${u.username}" class="del">Delete</button>
      </td>`;
    rows.appendChild(tr);
  });

  // wire edit/delete
  rows.querySelectorAll('.edit').forEach(b => b.onclick = onEdit);
  rows.querySelectorAll('.del').forEach(b => b.onclick = async (e) => {
    const u = e.target.dataset.u;
    if (!confirm('Delete ' + u + '?')) return;
    await deleteUserDB(u);
    refreshTable();
  });
}

function onEdit(e) {
  const u = e.target.dataset.u;
  openDBUsers().then(db => {
    const tx = db.transaction(USERS_STORE,'readonly');
    const req = tx.objectStore(USERS_STORE).get(u);
    req.onsuccess = () => {
      const user = req.result;
      const username = prompt('Username', user.username);
      if (!username) return;
      const name = prompt('Full name', user.name||'') || '';
      const pass = prompt('Password (leave blank to keep current)') || user.password;
      const groups = prompt('Groups (comma separated, e.g. Admin,User)', (user.groups||[]).join(',')) || '';
      putUser({ username, name, password: pass, groups: groups.split(',').map(s=>s.trim()).filter(Boolean) })
        .then(()=> refreshTable());
    };
  });
}

// create
document.getElementById('createBtn').onclick = async () => {
  const u = document.getElementById('newUser').value.trim();
  if(!u) return showMsg('Enter username');
  const name = document.getElementById('newName').value.trim();
  const pass = document.getElementById('newPass').value;
  const groupsSel = Array.from(document.getElementById('newGroups').selectedOptions).map(o=>o.value);
  await putUser({ username: u, name, password: pass, groups: groupsSel.length?groupsSel:['User'] });
  showMsg('User created');
  document.getElementById('newUser').value='';
  document.getElementById('newName').value='';
  document.getElementById('newPass').value='';
  refreshTable();
};

function showMsg(t) {
  const el = document.getElementById('adminMsg');
  el.textContent = t;
  setTimeout(()=> el.textContent='', 2500);
}

document.getElementById('back').onclick = () => window.location='dashboard.html';
document.getElementById('logout').onclick = () => { sessionStorage.removeItem('loggedUser'); window.location='index.html'; };
