/**
 * bbchat API 客户端 + Supabase Realtime
 */

const API_BASE = window.location.origin;
let currentUser = null;
let supabaseClient = null;
let messageChannel = null;
let convChannel = null;
const realtimeHandlers = { message: [], conversation: [] };

function getCurrentUserId() {
  return sessionStorage.getItem('currentUserId');
}

function setCurrentUserId(id) {
  if (id) sessionStorage.setItem('currentUserId', id);
  else {
    sessionStorage.removeItem('currentUserId');
    disconnectRealtime();
    currentUser = null;
  }
}

function getCurrentUser() {
  return currentUser;
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const userId = getCurrentUserId();
  if (userId) headers['X-User-Id'] = userId;

  const res = await fetch(API_BASE + path, { ...options, headers });
  return res.json();
}

async function adminApi(path, options = {}, token) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + token,
    ...(options.headers || {})
  };
  const res = await fetch(API_BASE + path, { ...options, headers });
  return res.json();
}

async function initSupabase() {
  if (supabaseClient) return supabaseClient;
  if (typeof supabase === 'undefined') return null;
  const cfg = await api('/api/config');
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
  supabaseClient = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return supabaseClient;
}

function disconnectRealtime() {
  if (supabaseClient) {
    if (messageChannel) supabaseClient.removeChannel(messageChannel);
    if (convChannel) supabaseClient.removeChannel(convChannel);
  }
  messageChannel = null;
  convChannel = null;
}

async function connectRealtime() {
  await initSupabase();
}

async function subscribeConversation(conversationId) {
  const sb = await initSupabase();
  if (!sb || !conversationId) return;
  if (messageChannel) sb.removeChannel(messageChannel);

  messageChannel = sb
    .channel('msg:' + conversationId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`
    }, async (payload) => {
      const row = payload.new;
      const sender = row.sender_id === getCurrentUserId() ? currentUser : null;
      const msg = {
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        senderName: sender?.nickname || row.sender_id,
        content: row.content,
        createdAt: row.created_at
      };
      if (!sender && row.sender_id) {
        const r = await api('/api/users/' + encodeURIComponent(row.sender_id));
        if (r.ok) msg.senderName = r.user.nickname;
      }
      realtimeHandlers.message.forEach(fn => fn(msg));
    })
    .subscribe();
}

function unsubscribeConversation() {
  if (supabaseClient && messageChannel) {
    supabaseClient.removeChannel(messageChannel);
    messageChannel = null;
  }
}

async function subscribeConversationsList() {
  const sb = await initSupabase();
  if (!sb) return;
  if (convChannel) sb.removeChannel(convChannel);
  convChannel = sb
    .channel('conv-list')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, () => {
      realtimeHandlers.conversation.forEach(fn => fn());
    })
    .subscribe();
}

function onRealtimeMessage(handler) {
  realtimeHandlers.message.push(handler);
}

function onRealtimeConversation(handler) {
  realtimeHandlers.conversation.push(handler);
}

async function registerUser(data) {
  return api('/api/register', { method: 'POST', body: JSON.stringify(data) });
}

async function loginUser(login, password) {
  const result = await api('/api/login', {
    method: 'POST',
    body: JSON.stringify({ id: login, password })
  });
  if (result.ok) {
    setCurrentUserId(result.user.id);
    currentUser = result.user;
    await connectRealtime();
    await subscribeConversationsList();
  }
  return result;
}

async function verifyEmailCode(email, code, purpose = 'register') {
  return api('/api/email/verify-code', {
    method: 'POST',
    body: JSON.stringify({ email, code, purpose })
  });
}

async function sendEmailCode(email, purpose = 'register') {
  return api('/api/email/send-code', {
    method: 'POST',
    body: JSON.stringify({ email, purpose })
  });
}

async function bindEmail(email, code) {
  const result = await api('/api/email/bind', {
    method: 'POST',
    body: JSON.stringify({ email, code })
  });
  if (result.ok) currentUser = result.user;
  return result;
}

async function resetPassword(id, newPassword) {
  return api('/api/reset-password', {
    method: 'POST',
    body: JSON.stringify({ id, password: newPassword })
  });
}

async function loadCurrentUser() {
  const userId = getCurrentUserId();
  if (!userId) return null;
  const result = await api('/api/me');
  if (!result.ok) {
    setCurrentUserId(null);
    return null;
  }
  currentUser = result.user;
  await connectRealtime();
  await subscribeConversationsList();
  return currentUser;
}

async function updateUser(updates) {
  const result = await api('/api/me', { method: 'PUT', body: JSON.stringify(updates) });
  if (result.ok) currentUser = result.user;
  return result;
}

async function fetchFriends() {
  const result = await api('/api/friends');
  return result.ok ? result.friends : [];
}

async function addFriendById(targetId) {
  return api('/api/friends', {
    method: 'POST',
    body: JSON.stringify({ targetId })
  });
}

async function fetchFriendRequests() {
  const result = await api('/api/friend-requests');
  return result.ok ? result : { ok: false, requests: [], count: 0 };
}

async function respondFriendRequest(requestId, action) {
  return api('/api/friend-requests', {
    method: 'POST',
    body: JSON.stringify({ requestId, action })
  });
}

async function fetchConversations() {
  const result = await api('/api/conversations');
  return result.ok ? result.conversations : [];
}

async function fetchMessages(conversationId) {
  const result = await api(`/api/conversations/${conversationId}/messages`);
  return result.ok ? result.messages : [];
}

async function togglePinConversation(conversationId) {
  return api(`/api/conversations/${conversationId}/pin`, { method: 'PUT' });
}

async function updateGroupAvatar(conversationId, avatar) {
  return api(`/api/conversations/${conversationId}/avatar`, {
    method: 'PUT',
    body: JSON.stringify({ avatar })
  });
}

async function sendMessage(conversationId, content) {
  const result = await api('/api/messages/send', {
    method: 'POST',
    body: JSON.stringify({ conversationId, content })
  });
  return result;
}

function joinConversation(conversationId) {
  return subscribeConversation(conversationId);
}

function leaveConversation() {
  unsubscribeConversation();
}

async function ensureDemoAccount() {
  await api('/api/init', { method: 'POST' });
}

// 兼容旧接口名
function connectSocket() { return connectRealtime(); }
function onSocketEvent(event, handler) {
  if (event === 'message:new') onRealtimeMessage(handler);
  if (event === 'conversation:updated') onRealtimeConversation(handler);
  if (event === 'friends:updated') onRealtimeConversation(handler);
}
