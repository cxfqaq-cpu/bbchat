/**
 * bbchat - 主应用
 */

const LOGO = 'assets/logo.png';

let currentTab = 'chat';
let contextTarget = null;
let editField = null;
let pendingGroupId = null;
let conversations = [];
let friends = [];
let friendRequests = [];
let pendingRequestCount = 0;
let activeConversation = null;
let messageHandler = null;
let convUpdateHandler = null;
let friendsUpdateHandler = null;
let requestPollTimer = null;

const GENDER_ITEM_HEIGHT = 44;

function tabTitles() {
  return { friends: t('friends'), chat: t('chat'), groups: t('groups'), me: t('me') };
}

async function init() {
  const userId = getCurrentUserId();
  if (!userId) {
    window.location.href = 'index.html';
    return;
  }

  setLang(getLang());
  applyI18n();
  updateLanguageLabel();

  bindNavigation();
  bindProfile();
  bindContextMenu();
  bindSearch();
  bindModals();
  bindGenderPicker();
  bindEmailBind();
  bindAddFriend();
  bindNewFriendsPage();
  bindLanguage();
  bindChatRoom();
  bindSocketEvents();

  const user = await loadCurrentUser();
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  await refreshAll();
  updateHeaderActions();
  startRequestPolling();
}

function avatarSrc(avatar) {
  return avatar || LOGO;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const locale = getLang() === 'zh' ? 'zh-CN' : getLang() === 'vi' ? 'vi-VN' : 'en-US';
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' });
}

function formatMsgTime(ts) {
  const locale = getLang() === 'zh' ? 'zh-CN' : getLang() === 'vi' ? 'vi-VN' : 'en-US';
  return new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

async function refreshAll() {
  renderMe();
  await Promise.all([loadFriends(), loadConversations(), loadFriendRequests()]);
  renderFriends();
  renderChats();
  renderGroups();
  renderFriendRequestBadges();
  renderFriendRequestList();
}

async function loadFriends() {
  friends = await fetchFriends();
}

async function loadConversations() {
  conversations = await fetchConversations();
}

async function loadFriendRequests() {
  const result = await fetchFriendRequests();
  friendRequests = result.requests || [];
  pendingRequestCount = result.count || 0;
}

function startRequestPolling() {
  clearInterval(requestPollTimer);
  requestPollTimer = setInterval(async () => {
    try {
      await loadFriendRequests();
      renderFriendRequestBadges();
      if (document.getElementById('newFriendsPage').classList.contains('active')) {
        renderFriendRequestList();
      }
    } catch (_) {}
  }, 15000);
}

function getPrivateChats() {
  return conversations.filter(c => c.type === 'private');
}

function getGroupChats() {
  return conversations.filter(c => c.type === 'group');
}

function updateHeaderActions() {
  const btn = document.getElementById('headerAddFriend');
  btn.classList.toggle('hidden', currentTab !== 'chat' && currentTab !== 'friends');
}

function updateLanguageLabel() {
  const el = document.getElementById('menuLanguageValue');
  if (el) el.textContent = t('langName');
}

/* ===== Navigation ===== */
function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

async function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('[data-panel]').forEach(p => {
    p.classList.toggle('hidden', p.dataset.panel !== tab);
  });
  document.getElementById('headerTitle').textContent = tabTitles()[tab];
  document.getElementById('bottomNav').classList.remove('hidden');
  document.getElementById('mainHeader').classList.remove('hidden');
  updateHeaderActions();
  if (tab === 'friends') {
    await loadFriendRequests();
    renderFriendRequestBadges();
  }
}

/* ===== Add Friend / New Friends ===== */
function bindAddFriend() {
  document.getElementById('headerAddFriend').addEventListener('click', openAddFriendModal);
  document.getElementById('addFriendCancel').addEventListener('click', closeAddFriendModal);
  document.getElementById('addFriendConfirm').addEventListener('click', confirmAddFriend);
  document.getElementById('addFriendInput').addEventListener('input', debounce(previewAddFriend, 400));
}

function bindNewFriendsPage() {
  document.getElementById('newFriendBanner').addEventListener('click', openNewFriendsPage);
  document.getElementById('newFriendsBack').addEventListener('click', closeNewFriendsPage);
  document.getElementById('openAddByIdBtn').addEventListener('click', openAddFriendModal);
}

function openNewFriendsPage() {
  document.getElementById('newFriendsPage').classList.add('active');
  document.getElementById('bottomNav').classList.add('hidden');
  document.getElementById('mainHeader').classList.add('hidden');
  loadFriendRequests().then(() => {
    renderFriendRequestBadges();
    renderFriendRequestList();
  });
}

function closeNewFriendsPage() {
  document.getElementById('newFriendsPage').classList.remove('active');
  document.getElementById('bottomNav').classList.remove('hidden');
  document.getElementById('mainHeader').classList.remove('hidden');
}

function renderFriendRequestBadges() {
  const n = pendingRequestCount || 0;
  const text = n > 99 ? '99+' : String(n);

  const bannerBadge = document.getElementById('newFriendBadge');
  if (bannerBadge) {
    bannerBadge.textContent = text;
    bannerBadge.classList.toggle('hidden', n <= 0);
  }

  const navBadge = document.getElementById('friendsNavBadge');
  if (navBadge) {
    navBadge.textContent = text;
    navBadge.classList.toggle('hidden', n <= 0);
  }
}

function renderFriendRequestList() {
  const box = document.getElementById('friendRequestList');
  if (!box) return;
  if (!friendRequests.length) {
    box.innerHTML = `<div class="empty-state">${escapeHtml(t('noPending'))}</div>`;
    return;
  }
  box.innerHTML = friendRequests.map(r => `
    <div class="request-item" data-request-id="${escapeHtml(r.id)}">
      <img class="list-avatar round" src="${avatarSrc(r.avatar)}" alt="">
      <div class="list-body">
        <div class="list-name">${escapeHtml(r.nickname)}</div>
        <div class="list-preview">ID: ${escapeHtml(r.fromId)}</div>
      </div>
      <div class="request-actions">
        <button class="req-btn req-accept" data-action="accept">${escapeHtml(t('accept'))}</button>
        <button class="req-btn req-reject" data-action="reject">${escapeHtml(t('reject'))}</button>
      </div>
    </div>
  `).join('');

  box.querySelectorAll('.request-item').forEach(row => {
    row.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const action = btn.dataset.action;
        const result = await respondFriendRequest(row.dataset.requestId, action);
        if (result.ok) {
          await refreshAll();
          if (result.accepted && result.conversationId) {
            alert(t('requestAccepted'));
          }
        } else {
          alert(result.error || 'Error');
          btn.disabled = false;
        }
      });
    });
  });
}

function openAddFriendModal() {
  document.getElementById('addFriendModal').classList.remove('hidden');
  document.getElementById('addFriendInput').value = '';
  document.getElementById('addFriendError').textContent = '';
  document.getElementById('addFriendPreview').classList.add('hidden');
  document.getElementById('addFriendInput').focus();
}

function closeAddFriendModal() {
  document.getElementById('addFriendModal').classList.add('hidden');
}

async function previewAddFriend() {
  const id = document.getElementById('addFriendInput').value.trim();
  const preview = document.getElementById('addFriendPreview');
  if (!id) { preview.classList.add('hidden'); return; }
  if (id.toLowerCase() === String(getCurrentUserId() || '').toLowerCase()) {
    preview.classList.remove('hidden');
    preview.innerHTML = '<span class="preview-hint">不能添加自己</span>';
    return;
  }
  try {
    const result = await api('/api/users/' + encodeURIComponent(id));
    if (result.ok) {
      preview.classList.remove('hidden');
      preview.innerHTML = `
        <img src="${avatarSrc(result.user.avatar)}" class="preview-avatar" alt="">
        <div><div class="preview-name">${escapeHtml(result.user.nickname)}</div>
        <div class="preview-id">ID: ${escapeHtml(result.user.id)}</div></div>`;
    } else {
      preview.classList.remove('hidden');
      preview.innerHTML = '<span class="preview-hint">该宝宝 ID 不存在</span>';
    }
  } catch (_) {
    preview.classList.add('hidden');
  }
}

async function confirmAddFriend() {
  const targetId = document.getElementById('addFriendInput').value.trim().toLowerCase();
  const errEl = document.getElementById('addFriendError');
  if (!targetId) { errEl.textContent = t('babyId'); return; }
  if (targetId === String(getCurrentUserId() || '').toLowerCase()) {
    errEl.textContent = '不能添加自己为好友';
    return;
  }

  const btn = document.getElementById('addFriendConfirm');
  btn.disabled = true;
  try {
    const result = await addFriendById(targetId);
    if (result.ok) {
      closeAddFriendModal();
      await refreshAll();
      alert(result.message || (result.autoAccepted ? t('friendAdded') : t('requestSent')));
      if (result.autoAccepted && result.conversationId) {
        closeNewFriendsPage();
        openChatRoom(result.conversationId);
      }
    } else {
      errEl.textContent = result.error;
    }
  } catch (_) {
    errEl.textContent = '添加失败，请检查网络';
  } finally {
    btn.disabled = false;
    btn.textContent = t('sendRequest');
  }
}

function bindLanguage() {
  document.getElementById('menuLanguage').addEventListener('click', () => {
    document.getElementById('languageModal').classList.remove('hidden');
  });
  document.getElementById('languageCancel').addEventListener('click', () => {
    document.getElementById('languageModal').classList.add('hidden');
  });
  document.querySelectorAll('.lang-option').forEach(opt => {
    opt.addEventListener('click', () => {
      setLang(opt.dataset.lang);
      applyI18n();
      updateLanguageLabel();
      document.getElementById('headerTitle').textContent = tabTitles()[currentTab];
      document.getElementById('languageModal').classList.add('hidden');
      renderFriends();
      renderFriendRequestList();
      renderFriendRequestBadges();
      renderMe();
    });
  });
}

/* ===== Friends ===== */
function renderFriends() {
  const container = document.getElementById('friendsList');
  const indexEl = document.getElementById('friendsIndex');
  const { groups, letters } = groupByLetter(friends, 'name');

  if (letters.length === 0) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(t('noFriends'))}<br><span class="empty-hint">${escapeHtml(t('noFriendsHint'))}</span></div>`;
    indexEl.innerHTML = '';
    return;
  }

  let html = '';
  letters.forEach(letter => {
    html += `<div class="section-index" id="idx-${letter}">${letter}</div>`;
    groups[letter].forEach(f => {
      html += `
        <div class="list-item" data-friend-id="${escapeHtml(f.id)}">
          <img class="list-avatar round" src="${avatarSrc(f.avatar)}" alt="">
          <div class="list-body"><div class="list-name">${escapeHtml(f.name)}</div></div>
        </div>`;
    });
  });

  container.innerHTML = html;
  indexEl.innerHTML = letters.map(l => `<span data-scroll="${l}">${l}</span>`).join('');
  indexEl.querySelectorAll('span').forEach(span => {
    span.addEventListener('click', () => {
      document.getElementById('idx-' + span.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  container.querySelectorAll('.list-item[data-friend-id]').forEach(el => {
    el.addEventListener('click', () => openFriendChat(el.dataset.friendId));
  });
}

function openFriendChat(friendId) {
  const conv = conversations.find(c =>
    c.type === 'private' && (
      c.id === `private_${[getCurrentUserId(), friendId].sort().join('_')}` ||
      c.id === `private_${[String(getCurrentUserId()).toLowerCase(), String(friendId).toLowerCase()].sort().join('_')}`
    )
  );
  if (conv) openChatRoom(conv.id);
}

/* ===== Chats ===== */
function renderChats() {
  let chats = getPrivateChats();
  const query = document.getElementById('chatSearch').value;
  chats = filterBySearch(chats, query, ['name', 'lastMessage']);
  chats = sortWithPin(chats);

  const container = document.getElementById('chatList');
  if (chats.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无聊天</div>';
    return;
  }

  container.innerHTML = chats.map(c => chatItemHtml(c, 'chat')).join('');
  bindListItemEvents(container, 'chat');
}

function chatItemHtml(c, type) {
  return `
    <div class="list-item ${c.pinned ? 'pinned' : ''}"
         data-id="${c.id}" data-type="${type}" data-pinned="${c.pinned}"
         data-creator="${c.creatorId || ''}">
      <img class="list-avatar" src="${avatarSrc(c.avatar)}" alt="">
      <div class="list-body">
        <div class="list-name">${escapeHtml(c.name)}</div>
        <div class="list-sub">${escapeHtml(c.lastMessage || '')}</div>
      </div>
      <div class="list-meta">
        <div class="list-time">${formatTime(c.lastTime)}</div>
        ${c.pinned ? '<div class="pin-icon">📌 置顶</div>' : ''}
      </div>
    </div>`;
}

function bindListItemEvents(container, type) {
  container.querySelectorAll('.list-item').forEach(el => {
    const id = el.dataset.id;
    const isPinned = el.dataset.pinned === 'true';
    const isCreator = el.dataset.creator === getCurrentUserId();

    el.addEventListener('click', e => {
      if (e.defaultPrevented) return;
      openChatRoom(id);
    });

    el.addEventListener('contextmenu', e => {
      showContextMenu(e, type, id, isPinned, isCreator);
    });

    let pressTimer;
    el.addEventListener('touchstart', e => {
      pressTimer = setTimeout(() => showContextMenu(e, type, id, isPinned, isCreator), 500);
    }, { passive: true });
    el.addEventListener('touchend', () => clearTimeout(pressTimer));
    el.addEventListener('touchmove', () => clearTimeout(pressTimer));
  });
}

/* ===== Groups ===== */
function renderGroups() {
  let groups = getGroupChats();
  const query = document.getElementById('groupSearch').value;
  groups = filterBySearch(groups, query, ['name', 'lastMessage']);

  const pinned = groups.filter(g => g.pinned).sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0));
  const unpinned = groups.filter(g => !g.pinned);
  const { groups: letterGroups, letters } = groupByLetter(unpinned, 'name');

  const container = document.getElementById('groupList');
  if (groups.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无群组</div>';
    return;
  }

  let html = '';
  pinned.forEach(g => { html += chatItemHtml(g, 'group'); });
  letters.forEach(letter => {
    html += `<div class="section-index">${letter}</div>`;
    letterGroups[letter].forEach(g => { html += chatItemHtml(g, 'group'); });
  });

  container.innerHTML = html;
  bindListItemEvents(container, 'group');
}

/* ===== Chat Room ===== */
function bindChatRoom() {
  document.getElementById('chatRoomBack').addEventListener('click', closeChatRoom);
  document.getElementById('chatSendBtn').addEventListener('click', sendCurrentMessage);
  document.getElementById('chatMessageInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendCurrentMessage();
  });
}

async function openChatRoom(conversationId) {
  const conv = conversations.find(c => c.id === conversationId);
  if (!conv) return;

  activeConversation = conv;
  document.getElementById('chatRoomTitle').textContent = conv.name;
  document.getElementById('chatMessages').innerHTML = '<div class="empty-state">加载中...</div>';
  document.getElementById('chatRoomPage').classList.add('active');
  document.getElementById('bottomNav').classList.add('hidden');
  document.getElementById('mainHeader').classList.add('hidden');
  document.getElementById('chatMessageInput').value = '';

  joinConversation(conversationId);
  const messages = await fetchMessages(conversationId);
  renderMessages(messages);
  scrollMessagesToBottom();
}

function closeChatRoom() {
  if (activeConversation) {
    leaveConversation();
    activeConversation = null;
  }
  document.getElementById('chatRoomPage').classList.remove('active');
  document.getElementById('bottomNav').classList.remove('hidden');
  document.getElementById('mainHeader').classList.remove('hidden');
}

function renderMessages(messages) {
  const container = document.getElementById('chatMessages');
  const myId = getCurrentUserId();

  if (!messages.length) {
    container.innerHTML = '<div class="empty-state chat-empty">还没有消息，发一句打个招呼吧</div>';
    return;
  }

  container.innerHTML = messages.map(m => {
    const mine = m.senderId === myId;
    return `
      <div class="msg-row ${mine ? 'mine' : 'theirs'}">
        ${!mine ? `<img class="msg-avatar" src="${LOGO}" alt="">` : ''}
        <div class="msg-bubble-wrap">
          ${!mine ? `<div class="msg-sender">${escapeHtml(m.senderName)}</div>` : ''}
          <div class="msg-bubble">${escapeHtml(m.content)}</div>
          <div class="msg-time">${formatMsgTime(m.createdAt)}</div>
        </div>
      </div>`;
  }).join('');
}

function appendMessage(m) {
  const container = document.getElementById('chatMessages');
  const empty = container.querySelector('.chat-empty, .empty-state');
  if (empty) container.innerHTML = '';

  const myId = getCurrentUserId();
  const mine = m.senderId === myId;
  const div = document.createElement('div');
  div.className = 'msg-row ' + (mine ? 'mine' : 'theirs');
  div.innerHTML = `
    ${!mine ? `<img class="msg-avatar" src="${LOGO}" alt="">` : ''}
    <div class="msg-bubble-wrap">
      ${!mine ? `<div class="msg-sender">${escapeHtml(m.senderName)}</div>` : ''}
      <div class="msg-bubble">${escapeHtml(m.content)}</div>
      <div class="msg-time">${formatMsgTime(m.createdAt)}</div>
    </div>`;
  container.appendChild(div);
  scrollMessagesToBottom();
}

function scrollMessagesToBottom() {
  const el = document.getElementById('chatMessages');
  el.scrollTop = el.scrollHeight;
}

async function sendCurrentMessage() {
  if (!activeConversation) return;
  const input = document.getElementById('chatMessageInput');
  const content = input.value.trim();
  if (!content) return;

  input.value = '';
  const btn = document.getElementById('chatSendBtn');
  btn.disabled = true;

  const user = getCurrentUser();
  appendMessage({
    senderId: user.id,
    senderName: user.nickname,
    content,
    createdAt: Date.now()
  });

  const result = await sendMessage(activeConversation.id, content);
  if (!result.ok) alert(result.error || '发送失败');
  btn.disabled = false;
  input.focus();
}

function bindSocketEvents() {
  messageHandler = (msg) => {
    if (activeConversation && msg.conversationId === activeConversation.id) {
      const container = document.getElementById('chatMessages');
      const last = container.querySelector('.msg-row:last-child .msg-bubble');
      if (last && last.textContent === msg.content && msg.senderId === getCurrentUserId()) return;
      appendMessage(msg);
    }
    const conv = conversations.find(c => c.id === msg.conversationId);
    if (conv) {
      conv.lastMessage = msg.content;
      conv.lastTime = msg.createdAt;
      renderChats();
      renderGroups();
    }
  };

  convUpdateHandler = async () => {
    await loadConversations();
    renderChats();
    renderGroups();
  };

  friendsUpdateHandler = async () => {
    await loadFriends();
    renderFriends();
  };

  onSocketEvent('message:new', messageHandler);
  onSocketEvent('conversation:updated', convUpdateHandler);
  onSocketEvent('friends:updated', friendsUpdateHandler);
}

/* ===== Me / Profile ===== */
function renderMe() {
  const user = getCurrentUser();
  if (!user) return;

  document.getElementById('meAvatar').src = avatarSrc(user.avatar);
  document.getElementById('detailAvatar').src = avatarSrc(user.avatar);
  document.getElementById('meId').textContent = user.nickname || user.id;
  document.getElementById('meSubId').textContent = 'ID: ' + user.id;
  document.getElementById('detailNickname').textContent = user.nickname || '未填写';
  document.getElementById('detailGender').textContent = user.gender || '未填写';
  document.getElementById('detailEmail').textContent = user.email || '未绑定';
  document.getElementById('detailGames').textContent = user.favoriteGames || '未填写';
  document.getElementById('detailId').textContent = user.id;
}

function bindProfile() {
  document.getElementById('profileHeader').addEventListener('click', () => {
    document.getElementById('detailPage').classList.add('active');
    document.getElementById('bottomNav').classList.add('hidden');
  });

  document.getElementById('detailBack').addEventListener('click', () => {
    document.getElementById('detailPage').classList.remove('active');
    document.getElementById('bottomNav').classList.remove('hidden');
  });

  document.getElementById('meQrBtn').addEventListener('click', e => {
    e.stopPropagation();
    showQrCode();
  });

  document.getElementById('menuLogout').addEventListener('click', () => {
    setCurrentUserId(null);
    window.location.href = 'index.html';
  });

  document.getElementById('detailAvatarRow').addEventListener('click', () => {
    document.getElementById('avatarInput').click();
  });

  document.getElementById('avatarInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await updateUser({ avatar: reader.result });
      renderMe();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  document.querySelectorAll('#detailPage .detail-row[data-field]').forEach(row => {
    row.addEventListener('click', () => openEditField(row.dataset.field));
  });

  document.getElementById('detailEmailRow').addEventListener('click', () => {
    if (getCurrentUser()?.emailVerified) {
      alert('已绑定邮箱：' + getCurrentUser().email + '\n可使用该邮箱登录');
      return;
    }
    openBindEmailModal();
  });
}

let bindVerified = false;
let bindSendTimer = null;

function bindEmailBind() {
  document.getElementById('bindEmailCancel').addEventListener('click', () => {
    document.getElementById('bindEmailModal').classList.add('hidden');
  });

  document.getElementById('bindSendCode').addEventListener('click', async () => {
    const email = document.getElementById('bindEmailInput').value.trim();
    const errEl = document.getElementById('bindEmailError');
    const hintEl = document.getElementById('bindEmailHint');
    const statusEl = document.getElementById('bindVerifyStatus');
    const confirmBtn = document.getElementById('bindEmailConfirm');
    errEl.textContent = '';
    setCodeStatus(statusEl, '', '');
    bindVerified = false;
    confirmBtn.disabled = true;
    if (!email) { errEl.textContent = '请先输入邮箱'; return; }
    try {
      const result = await sendEmailCode(email, 'bind');
      if (result.ok) {
        hintEl.textContent = result.message + (result.devCode ? `（开发模式验证码：${result.devCode}）` : '');
        clearInterval(bindSendTimer);
        bindSendTimer = startCodeCountdown(document.getElementById('bindSendCode'), 60, '发送验证码');
      } else {
        errEl.textContent = result.error;
      }
    } catch (_) { errEl.textContent = '发送失败'; }
  });

  document.getElementById('bindVerifyCode').addEventListener('click', async () => {
    const email = document.getElementById('bindEmailInput').value.trim();
    const code = getCodeValue('bindCodeBoxes');
    const statusEl = document.getElementById('bindVerifyStatus');
    const errEl = document.getElementById('bindEmailError');
    const confirmBtn = document.getElementById('bindEmailConfirm');
    errEl.textContent = '';
    if (!email) { errEl.textContent = '请先输入邮箱'; return; }
    if (code.length !== 6) { setCodeStatus(statusEl, 'error', '请输入完整的6位验证码'); return; }
    try {
      const result = await verifyEmailCode(email, code, 'bind');
      if (result.ok) {
        bindVerified = true;
        confirmBtn.disabled = false;
        setCodeStatus(statusEl, 'success', '✓ 验证码正确，点击确认绑定');
      } else {
        bindVerified = false;
        confirmBtn.disabled = true;
        setCodeStatus(statusEl, 'error', result.error || '验证码错误');
      }
    } catch (_) { setCodeStatus(statusEl, 'error', '验证失败'); }
  });

  document.getElementById('bindEmailConfirm').addEventListener('click', async () => {
    const email = document.getElementById('bindEmailInput').value.trim();
    const code = getCodeValue('bindCodeBoxes');
    const errEl = document.getElementById('bindEmailError');
    if (!bindVerified) { errEl.textContent = '请先验证验证码'; return; }
    try {
      const result = await bindEmail(email, code);
      if (result.ok) {
        document.getElementById('bindEmailModal').classList.add('hidden');
        renderMe();
      } else {
        errEl.textContent = result.error;
      }
    } catch (_) { errEl.textContent = '绑定失败'; }
  });
}

function openBindEmailModal() {
  document.getElementById('bindEmailModal').classList.remove('hidden');
  initCodeBoxes('bindCodeBoxes');
  document.getElementById('bindEmailInput').value = '';
  clearCodeBoxes('bindCodeBoxes');
  document.getElementById('bindEmailError').textContent = '';
  document.getElementById('bindEmailHint').textContent = '';
  setCodeStatus(document.getElementById('bindVerifyStatus'), '', '');
  bindVerified = false;
  document.getElementById('bindEmailConfirm').disabled = true;
}

function openEditField(field) {
  const user = getCurrentUser();
  const labels = { nickname: '昵称', gender: '性别', favoriteGames: '爱玩的游戏' };
  editField = field;
  document.getElementById('editTitle').textContent = '编辑' + labels[field];
  document.getElementById('editError').textContent = '';

  const inputEl = document.getElementById('editInput');
  const genderEl = document.getElementById('genderPicker');

  if (field === 'gender') {
    inputEl.classList.add('hidden');
    genderEl.classList.remove('hidden');
    const current = user.gender === '男' || user.gender === '女' ? user.gender : '男';
    setGenderPickerValue(current);
  } else {
    inputEl.classList.remove('hidden');
    genderEl.classList.add('hidden');
    inputEl.value = user[field] === '未填写' ? '' : (user[field] || '');
  }

  document.getElementById('editModal').classList.remove('hidden');
}

/* ===== Context Menu ===== */
function bindContextMenu() {
  document.getElementById('ctxPin').addEventListener('click', async () => {
    if (!contextTarget) return;
    await togglePinConversation(contextTarget.id);
    hideContextMenu();
    await loadConversations();
    renderChats();
    renderGroups();
  });

  document.getElementById('ctxUnpin').addEventListener('click', async () => {
    if (!contextTarget) return;
    await togglePinConversation(contextTarget.id);
    hideContextMenu();
    await loadConversations();
    renderChats();
    renderGroups();
  });

  document.getElementById('ctxAvatar').addEventListener('click', () => {
    if (!contextTarget) return;
    pendingGroupId = contextTarget.id;
    document.getElementById('groupAvatarInput').click();
    hideContextMenu();
  });

  document.getElementById('groupAvatarInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file || !pendingGroupId) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const result = await updateGroupAvatar(pendingGroupId, reader.result);
      if (!result.ok) alert(result.error);
      else {
        await loadConversations();
        renderGroups();
      }
      pendingGroupId = null;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  document.addEventListener('click', hideContextMenu);
}

function showContextMenu(e, type, id, isPinned, isCreator) {
  e.preventDefault();
  contextTarget = { type, id };
  const menu = document.getElementById('contextMenu');
  document.getElementById('ctxPin').classList.toggle('hidden', isPinned);
  document.getElementById('ctxUnpin').classList.toggle('hidden', !isPinned);
  document.getElementById('ctxAvatar').classList.toggle('hidden', !(type === 'group' && isCreator));

  menu.classList.remove('hidden');
  const x = e.clientX || e.touches?.[0]?.clientX || 100;
  const y = e.clientY || e.touches?.[0]?.clientY || 100;
  menu.style.left = Math.min(x, window.innerWidth - 160) + 'px';
  menu.style.top = y + 'px';
}

function hideContextMenu() {
  document.getElementById('contextMenu').classList.add('hidden');
  contextTarget = null;
}

/* ===== Search ===== */
function bindSearch() {
  document.getElementById('chatSearch').addEventListener('input', renderChats);
  document.getElementById('groupSearch').addEventListener('input', renderGroups);
}

/* ===== Gender Picker ===== */
function bindGenderPicker() {
  const scroll = document.getElementById('genderPickerScroll');
  scroll.addEventListener('scroll', () => {
    clearTimeout(scroll._snapTimer);
    scroll._snapTimer = setTimeout(updateGenderPickerActive, 80);
    updateGenderPickerActive();
  }, { passive: true });
}

function getGenderPickerItems() {
  return Array.from(document.querySelectorAll('.gender-picker-item'));
}

function setGenderPickerValue(gender) {
  const scroll = document.getElementById('genderPickerScroll');
  const items = getGenderPickerItems();
  const index = items.findIndex(item => item.dataset.gender === gender);
  const idx = index >= 0 ? index : 0;
  scroll.scrollTop = idx * GENDER_ITEM_HEIGHT;
  updateGenderPickerActive();
}

function getGenderPickerValue() {
  const scroll = document.getElementById('genderPickerScroll');
  const index = Math.round(scroll.scrollTop / GENDER_ITEM_HEIGHT);
  const items = getGenderPickerItems();
  const item = items[Math.max(0, Math.min(index, items.length - 1))];
  return item?.dataset.gender || '男';
}

function updateGenderPickerActive() {
  const scroll = document.getElementById('genderPickerScroll');
  const center = scroll.scrollTop + scroll.clientHeight / 2;
  const items = getGenderPickerItems();
  let closest = items[0];
  let minDist = Infinity;
  items.forEach(item => {
    const itemCenter = item.offsetTop + item.offsetHeight / 2;
    const dist = Math.abs(center - itemCenter);
    if (dist < minDist) {
      minDist = dist;
      closest = item;
    }
  });
  items.forEach(item => item.classList.toggle('active', item === closest));
}

/* ===== Modals ===== */
function bindModals() {
  document.getElementById('qrClose').addEventListener('click', () => {
    document.getElementById('qrModal').classList.add('hidden');
  });

  document.getElementById('editCancel').addEventListener('click', () => {
    document.getElementById('editModal').classList.add('hidden');
    editField = null;
  });

  document.getElementById('editConfirm').addEventListener('click', async () => {
    if (!editField) return;
    let val;
    if (editField === 'gender') {
      val = getGenderPickerValue();
    } else {
      val = document.getElementById('editInput').value.trim();
      if (!val) {
        document.getElementById('editError').textContent = '内容不能为空';
        return;
      }
    }
    document.getElementById('editError').textContent = '';
    await updateUser({ [editField]: val });
    document.getElementById('editModal').classList.add('hidden');
    editField = null;
    renderMe();
  });
}

function showQrCode() {
  const user = getCurrentUser();
  const modal = document.getElementById('qrModal');
  const container = document.getElementById('qrContainer');
  container.innerHTML = '<p class="qr-hint">生成中...</p>';
  modal.classList.remove('hidden');

  const qrData = JSON.stringify({ type: 'campus_chat_friend', id: user.id, nickname: user.nickname });

  if (typeof QRCode !== 'undefined') {
    container.innerHTML = '';
    QRCode.toCanvas(document.createElement('canvas'), qrData, { width: 200, margin: 2 }, (err, canvas) => {
      if (err) { container.innerHTML = '<p class="qr-hint">二维码生成失败</p>'; return; }
      container.appendChild(canvas);
      const hint = document.createElement('p');
      hint.className = 'qr-hint';
      hint.textContent = '扫一扫，加我为好友 · ID: ' + user.id;
      container.appendChild(hint);
    });
  } else {
    container.innerHTML = `<p class="qr-hint">ID: ${user.id}</p>`;
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
