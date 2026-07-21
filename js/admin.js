let adminToken = sessionStorage.getItem('bbchat_admin_token');

function showPanel(loggedIn) {
  document.getElementById('loginPanel').classList.toggle('hidden', loggedIn);
  document.getElementById('adminPanel').classList.toggle('hidden', !loggedIn);
}

async function loadStats() {
  const r = await adminApi('/api/admin/stats', {}, adminToken);
  if (!r.ok) return;
  document.getElementById('statUsers').textContent = r.stats.users;
  document.getElementById('statConvs').textContent = r.stats.conversations;
  document.getElementById('statMsgs').textContent = r.stats.messages;
}

async function loadUsers() {
  const r = await adminApi('/api/admin/users', {}, adminToken);
  const tbody = document.getElementById('usersBody');
  if (!r.ok) { tbody.innerHTML = '<tr><td colspan="5">加载失败</td></tr>'; return; }
  tbody.innerHTML = r.users.map(u => `
    <tr>
      <td>${escapeHtml(u.id)}</td>
      <td>${escapeHtml(u.nickname)}</td>
      <td>${u.email_verified ? escapeHtml(u.email) : '未绑定'}</td>
      <td>${escapeHtml(u.gender || '-')}</td>
      <td><button class="modal-btn modal-btn-secondary pressable" data-del-user="${escapeHtml(u.id)}">删除</button></td>
    </tr>`).join('');
  tbody.querySelectorAll('[data-del-user]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('确定删除用户 ' + btn.dataset.delUser + '？')) return;
      await adminApi('/api/admin/users', { method: 'DELETE', body: JSON.stringify({ id: btn.dataset.delUser }) }, adminToken);
      loadUsers();
      loadStats();
    });
  });
}

async function loadConversations() {
  const r = await adminApi('/api/admin/conversations', {}, adminToken);
  const tbody = document.getElementById('convsBody');
  if (!r.ok) { tbody.innerHTML = '<tr><td colspan="5">加载失败</td></tr>'; return; }
  tbody.innerHTML = r.conversations.map(c => `
    <tr>
      <td>${escapeHtml(c.id)}</td>
      <td>${c.type}</td>
      <td>${escapeHtml(c.name || '-')}</td>
      <td>${escapeHtml(c.last_message || '')}</td>
      <td>${c.last_time ? new Date(c.last_time).toLocaleString('zh-CN') : '-'}</td>
    </tr>`).join('');
}

async function loadMessages() {
  const r = await adminApi('/api/admin/messages', {}, adminToken);
  const tbody = document.getElementById('msgsBody');
  if (!r.ok) { tbody.innerHTML = '<tr><td colspan="4">加载失败</td></tr>'; return; }
  tbody.innerHTML = r.messages.map(m => `
    <tr>
      <td>${escapeHtml(m.conversation_id)}</td>
      <td>${escapeHtml(m.sender_id)}</td>
      <td>${escapeHtml(m.content)}</td>
      <td><button class="modal-btn modal-btn-secondary pressable" data-del-msg="${escapeHtml(m.id)}">删除</button></td>
    </tr>`).join('');
  tbody.querySelectorAll('[data-del-msg]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await adminApi('/api/admin/messages', { method: 'DELETE', body: JSON.stringify({ id: btn.dataset.delMsg }) }, adminToken);
      loadMessages();
      loadStats();
    });
  });
}

async function loadAll() {
  await Promise.all([loadStats(), loadUsers(), loadConversations(), loadMessages()]);
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

document.getElementById('adminLoginBtn').addEventListener('click', async () => {
  const password = document.getElementById('adminPassword').value;
  const errEl = document.getElementById('adminLoginError');
  try {
    const r = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    }).then(res => res.json());
    if (r.ok) {
      adminToken = r.token;
      sessionStorage.setItem('bbchat_admin_token', adminToken);
      showPanel(true);
      loadAll();
    } else {
      errEl.textContent = r.error;
    }
  } catch (_) {
    errEl.textContent = '登录失败';
  }
});

document.getElementById('adminLogoutBtn').addEventListener('click', () => {
  adminToken = null;
  sessionStorage.removeItem('bbchat_admin_token');
  showPanel(false);
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ['users', 'conversations', 'messages'].forEach(t => {
      document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('hidden', btn.dataset.tab !== t);
    });
  });
});

if (adminToken) {
  showPanel(true);
  loadAll();
} else {
  showPanel(false);
}
