const { getSupabase } = require('./supabase');

const RESERVED_IDS = new Set([
  'demo', 'admin', 'root', 'system', 'api', 'null', 'undefined',
  'bbchat', 'support', 'official', 'me', 'self'
]);

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeUserId(id) {
  return String(id || '').trim().toLowerCase();
}

/** 账号规则：字母开头，3-20 位英文数字，全小写存储，避免大小写冲突 */
function validateUserId(id) {
  const normalized = normalizeUserId(id);
  if (!normalized) return { ok: false, error: '请输入账号' };
  if (!/^[a-z][a-z0-9]{2,19}$/.test(normalized)) {
    return { ok: false, error: '账号须字母开头，3-20位英文或数字，不能含下划线或特殊符号' };
  }
  if (RESERVED_IDS.has(normalized)) {
    return { ok: false, error: '该账号为系统保留，请换一个' };
  }
  if (normalized.startsWith('demo_friend')) {
    return { ok: false, error: '该账号不可用，请换一个' };
  }
  return { ok: true, id: normalized };
}

function validatePassword(password) {
  if (password === undefined || password === null || String(password).length < 1) {
    return { ok: false, error: '请输入密码' };
  }
  if (String(password).length > 128) {
    return { ok: false, error: '密码过长' };
  }
  return { ok: true };
}

function validateNickname(nickname, fallbackId) {
  const name = String(nickname || fallbackId || '').trim();
  if (!name) return { ok: false, error: '请填写昵称' };
  if (name.length > 20) return { ok: false, error: '昵称最多 20 个字' };
  return { ok: true, nickname: name };
}

function privateConvId(a, b) {
  return 'private_' + [normalizeUserId(a), normalizeUserId(b)].sort().join('_');
}

/** 从 private_xxx 会话 ID 解析对方用户（兼容含下划线的旧 demo 好友 ID） */
function getOtherUserId(convId, userId) {
  if (!convId || !convId.startsWith('private_')) return null;
  const raw = convId.slice('private_'.length);
  const me = normalizeUserId(userId);
  if (raw.startsWith(me + '_')) return raw.slice(me.length + 1);
  if (raw.endsWith('_' + me)) return raw.slice(0, raw.length - me.length - 1);
  return null;
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    password: row.password,
    nickname: row.nickname,
    gender: row.gender,
    email: row.email,
    emailVerified: row.email_verified,
    favoriteGames: row.favorite_games,
    avatar: row.avatar
  };
}

function userPublic(row) {
  const u = rowToUser(row);
  if (!u) return null;
  return {
    id: u.id,
    nickname: u.nickname,
    gender: u.gender,
    email: u.emailVerified ? u.email : '未绑定',
    emailVerified: !!u.emailVerified,
    favoriteGames: u.favoriteGames,
    avatar: u.avatar
  };
}

async function getUser(id) {
  const sb = getSupabase();
  const { data } = await sb.from('users').select('*').eq('id', normalizeUserId(id)).maybeSingle();
  return rowToUser(data);
}

async function getUserByEmail(email) {
  const normalized = email.toLowerCase().trim();
  const sb = getSupabase();
  const { data } = await sb.from('users').select('*').eq('email', normalized).eq('email_verified', true).maybeSingle();
  return rowToUser(data);
}

async function findUserByLogin(login) {
  const val = String(login || '').trim();
  if (!val) return null;
  if (val.includes('@')) return getUserByEmail(val);
  return getUser(normalizeUserId(val));
}

async function createUser({ id, password, nickname }) {
  const idCheck = validateUserId(id);
  if (!idCheck.ok) throw new Error(idCheck.error);
  const pwdCheck = validatePassword(password);
  if (!pwdCheck.ok) throw new Error(pwdCheck.error);
  const nickCheck = validateNickname(nickname, idCheck.id);
  if (!nickCheck.ok) throw new Error(nickCheck.error);

  if (await getUser(idCheck.id)) {
    const err = new Error('该账号已被注册');
    err.code = 'ID_TAKEN';
    throw err;
  }

  const sb = getSupabase();
  const { error } = await sb.from('users').insert({
    id: idCheck.id,
    password: String(password),
    nickname: nickCheck.nickname,
    gender: '未填写',
    email: '未绑定',
    email_verified: false,
    favorite_games: '未填写',
    avatar: null
  });
  if (error) {
    if (error.code === '23505') {
      const err = new Error('该账号已被注册');
      err.code = 'ID_TAKEN';
      throw err;
    }
    throw error;
  }
  await seedDemoForUser(idCheck.id);
  return getUser(idCheck.id);
}

async function bindUserEmail(userId, email) {
  const normalized = email.toLowerCase().trim();
  const existing = await getUserByEmail(normalized);
  if (existing && existing.id !== userId) return { ok: false, error: '该邮箱已被其他账号绑定' };
  const sb = getSupabase();
  const { data, error } = await sb.from('users').update({
    email: normalized,
    email_verified: true
  }).eq('id', userId).select('*').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, user: userPublic(data) };
}

async function updateUser(userId, updates) {
  const sb = getSupabase();
  const patch = {};
  // 禁止通过资料接口修改账号 ID / 邮箱（邮箱走绑定流程）
  if (updates.password !== undefined) {
    const pwdCheck = validatePassword(updates.password);
    if (!pwdCheck.ok) throw new Error(pwdCheck.error);
    patch.password = String(updates.password);
  }
  if (updates.nickname !== undefined) {
    const nickCheck = validateNickname(updates.nickname, userId);
    if (!nickCheck.ok) throw new Error(nickCheck.error);
    patch.nickname = nickCheck.nickname;
  }
  if (updates.gender !== undefined) {
    const g = String(updates.gender).trim();
    if (!['男', '女', '未填写'].includes(g)) throw new Error('性别无效');
    patch.gender = g;
  }
  if (updates.favoriteGames !== undefined) {
    const fg = String(updates.favoriteGames).trim() || '未填写';
    if (fg.length > 100) throw new Error('爱好过长');
    patch.favorite_games = fg;
  }
  if (updates.avatar !== undefined) patch.avatar = updates.avatar;
  const { data, error } = await sb.from('users').update(patch).eq('id', normalizeUserId(userId)).select('*').single();
  if (error) throw error;
  return rowToUser(data);
}

async function addFriendship(userId, friendId) {
  const sb = getSupabase();
  const now = Date.now();
  await sb.from('friendships').upsert([
    { user_id: userId, friend_id: friendId, created_at: now },
    { user_id: friendId, friend_id: userId, created_at: now }
  ]);
}

async function ensurePrivateConversation(userId, friendId, convId) {
  const sb = getSupabase();
  const { data: existing } = await sb.from('conversations').select('id').eq('id', convId).maybeSingle();
  if (!existing) {
    const friend = await getUser(friendId);
    await sb.from('conversations').insert({
      id: convId,
      type: 'private',
      name: friend?.nickname || friendId,
      avatar: friend?.avatar || null,
      creator_id: null,
      last_message: '',
      last_time: 0
    });
  }
  await sb.from('conversation_members').upsert([
    { conversation_id: convId, user_id: userId, pinned: false, pinned_at: 0 },
    { conversation_id: convId, user_id: friendId, pinned: false, pinned_at: 0 }
  ]);
  return convId;
}

async function seedDemoForUser(userId) {
  const sb = getSupabase();
  const { count } = await sb.from('friendships').select('*', { count: 'exact', head: true }).eq('user_id', userId);
  if (count > 0) return;

  const demos = [
    { id: 'demo_friend_a1', nickname: '爱我' },
    { id: 'demo_friend_a2', nickname: '爱他' },
    { id: 'demo_friend_b1', nickname: '宝宝' },
    { id: 'demo_friend_c1', nickname: '陈小明' },
    { id: 'demo_friend_d1', nickname: 'David' },
    { id: 'demo_friend_num', nickname: '123同学' },
    { id: 'demo_friend_z1', nickname: '张三' }
  ];

  for (const d of demos) {
    const { data: ex } = await sb.from('users').select('id').eq('id', d.id).maybeSingle();
    if (!ex) {
      await sb.from('users').insert({
        id: d.id, password: 'demo', nickname: d.nickname,
        gender: '未填写', email: '未绑定', email_verified: false,
        favorite_games: '未填写', avatar: null
      });
    }
    await addFriendship(userId, d.id);
    const convId = privateConvId(userId, d.id);
    await ensurePrivateConversation(userId, d.id, convId);
    const now = Date.now();
    for (const [content, ts] of [['你好呀！', now - 86400000], ['在吗？', now - 3600000]]) {
      const msgId = `seed_${convId}_${content}`;
      const { data: msgEx } = await sb.from('messages').select('id').eq('id', msgId).maybeSingle();
      if (!msgEx) await insertMessage({ id: msgId, conversationId: convId, senderId: d.id, content, createdAt: ts });
    }
  }

  const groupId = 'group_' + userId + '_cs';
  const { data: g1 } = await sb.from('conversations').select('id').eq('id', groupId).maybeSingle();
  if (!g1) {
    await sb.from('conversations').insert({
      id: groupId, type: 'group', name: '计算机2024', creator_id: userId,
      last_message: '明天考试加油', last_time: Date.now() - 1800000
    });
    for (const uid2 of [userId, 'demo_friend_c1', 'demo_friend_d1']) {
      await sb.from('conversation_members').upsert({ conversation_id: groupId, user_id: uid2, pinned: false, pinned_at: 0 });
    }
    await insertMessage({ conversationId: groupId, senderId: 'demo_friend_c1', content: '明天考试加油', createdAt: Date.now() - 1800000 });
  }
}

async function getFriends(userId) {
  const sb = getSupabase();
  const { data: links } = await sb.from('friendships').select('friend_id').eq('user_id', userId);
  if (!links?.length) return [];
  const ids = links.map(l => l.friend_id);
  const { data: users } = await sb.from('users').select('id, nickname, avatar').in('id', ids);
  return (users || []).map(u => ({ id: u.id, name: u.nickname, avatar: u.avatar }));
}

async function addFriend(userId, targetId) {
  return sendFriendRequest(userId, targetId);
}

async function sendFriendRequest(userId, targetId) {
  const me = normalizeUserId(userId);
  const target = normalizeUserId(targetId);
  if (!target) return { ok: false, error: '请输入宝宝 ID' };
  if (me === target) return { ok: false, error: '不能添加自己为好友' };
  const targetUser = await getUser(target);
  if (!targetUser) return { ok: false, error: '该宝宝 ID 不存在' };

  const sb = getSupabase();
  const { data: ex } = await sb.from('friendships').select('*').eq('user_id', me).eq('friend_id', target).maybeSingle();
  if (ex) return { ok: false, error: '已经是好友了' };

  const { data: pendingOut } = await sb.from('friend_requests').select('id')
    .eq('from_id', me).eq('to_id', target).eq('status', 'pending').maybeSingle();
  if (pendingOut) return { ok: false, error: '已发送过申请，请等待对方处理' };

  // 对方已向我发过申请 → 直接互通好友
  const { data: pendingIn } = await sb.from('friend_requests').select('id')
    .eq('from_id', target).eq('to_id', me).eq('status', 'pending').maybeSingle();
  if (pendingIn) {
    await sb.from('friend_requests').update({ status: 'accepted' }).eq('id', pendingIn.id);
    await addFriendship(me, target);
    const convId = await ensurePrivateConversation(me, target, privateConvId(me, target));
    return {
      ok: true,
      autoAccepted: true,
      message: '对方也申请加你，已直接成为好友',
      friend: { id: targetUser.id, name: targetUser.nickname, avatar: targetUser.avatar },
      conversationId: convId
    };
  }

  const reqId = uid();
  const { error } = await sb.from('friend_requests').insert({
    id: reqId,
    from_id: me,
    to_id: target,
    status: 'pending',
    created_at: Date.now()
  });
  if (error) {
    if (error.code === '23505') return { ok: false, error: '已发送过申请，请等待对方处理' };
    return { ok: false, error: error.message };
  }
  return { ok: true, pending: true, message: '好友申请已发送，等待对方同意' };
}

async function getPendingFriendRequests(userId) {
  const me = normalizeUserId(userId);
  const sb = getSupabase();
  const { data: rows } = await sb.from('friend_requests')
    .select('id, from_id, created_at')
    .eq('to_id', me)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (!rows?.length) return [];
  const ids = rows.map(r => r.from_id);
  const { data: users } = await sb.from('users').select('id, nickname, avatar').in('id', ids);
  const map = Object.fromEntries((users || []).map(u => [u.id, u]));
  return rows.map(r => ({
    id: r.id,
    fromId: r.from_id,
    nickname: map[r.from_id]?.nickname || r.from_id,
    avatar: map[r.from_id]?.avatar || null,
    createdAt: r.created_at
  }));
}

async function countPendingFriendRequests(userId) {
  const me = normalizeUserId(userId);
  const sb = getSupabase();
  const { count } = await sb.from('friend_requests')
    .select('*', { count: 'exact', head: true })
    .eq('to_id', me)
    .eq('status', 'pending');
  return count || 0;
}

async function respondFriendRequest(userId, requestId, action) {
  const me = normalizeUserId(userId);
  const sb = getSupabase();
  const { data: row } = await sb.from('friend_requests').select('*').eq('id', requestId).maybeSingle();
  if (!row) return { ok: false, error: '申请不存在' };
  if (row.to_id !== me) return { ok: false, error: '无权处理该申请' };
  if (row.status !== 'pending') return { ok: false, error: '该申请已处理' };

  if (action === 'reject') {
    await sb.from('friend_requests').update({ status: 'rejected' }).eq('id', requestId);
    return { ok: true, rejected: true };
  }

  if (action !== 'accept') return { ok: false, error: '无效操作' };

  await sb.from('friend_requests').update({ status: 'accepted' }).eq('id', requestId);
  await addFriendship(me, row.from_id);
  const convId = await ensurePrivateConversation(me, row.from_id, privateConvId(me, row.from_id));
  const fromUser = await getUser(row.from_id);
  return {
    ok: true,
    accepted: true,
    friend: { id: fromUser.id, name: fromUser.nickname, avatar: fromUser.avatar },
    conversationId: convId
  };
}

async function getPrivateChatName(convId, userId) {
  const otherId = getOtherUserId(convId, userId);
  if (!otherId) return '私聊';
  const u = await getUser(otherId);
  return u?.nickname || otherId;
}

async function getPrivateAvatar(convId, userId) {
  const otherId = getOtherUserId(convId, userId);
  if (!otherId) return null;
  const u = await getUser(otherId);
  return u?.avatar || null;
}

async function getConversations(userId) {
  const sb = getSupabase();
  const { data: memberships } = await sb.from('conversation_members').select('conversation_id, pinned, pinned_at').eq('user_id', userId);
  if (!memberships?.length) return [];
  const ids = memberships.map(m => m.conversation_id);
  const { data: convs } = await sb.from('conversations').select('*').in('id', ids);
  const memberMap = Object.fromEntries(memberships.map(m => [m.conversation_id, m]));
  return Promise.all((convs || []).map(async c => ({
    id: c.id,
    type: c.type,
    name: c.type === 'private' ? await getPrivateChatName(c.id, userId) : c.name,
    avatar: c.type === 'private' ? await getPrivateAvatar(c.id, userId) : c.avatar,
    creatorId: c.creator_id,
    lastMessage: c.last_message,
    lastTime: c.last_time,
    pinned: !!memberMap[c.id]?.pinned,
    pinnedAt: memberMap[c.id]?.pinned_at || 0
  })));
}

async function togglePin(conversationId, userId) {
  const sb = getSupabase();
  const { data: m } = await sb.from('conversation_members').select('*').eq('conversation_id', conversationId).eq('user_id', userId).maybeSingle();
  if (!m) return null;
  const pinned = !m.pinned;
  const pinnedAt = pinned ? Date.now() : 0;
  await sb.from('conversation_members').update({ pinned, pinned_at: pinnedAt }).eq('conversation_id', conversationId).eq('user_id', userId);
  return { pinned, pinnedAt };
}

async function updateGroupAvatar(conversationId, userId, avatar) {
  const sb = getSupabase();
  const { data: conv } = await sb.from('conversations').select('*').eq('id', conversationId).maybeSingle();
  if (!conv || conv.type !== 'group') return { ok: false, error: '群组不存在' };
  if (conv.creator_id !== userId) return { ok: false, error: '只有群主可以修改群头像' };
  await sb.from('conversations').update({ avatar }).eq('id', conversationId);
  return { ok: true };
}

async function insertMessage({ id, conversationId, senderId, content, createdAt }) {
  const text = String(content || '').trim();
  if (!text) throw new Error('消息不能为空');
  if (text.length > 2000) throw new Error('消息过长（最多 2000 字）');
  const sb = getSupabase();
  const msgId = id || uid();
  const ts = createdAt || Date.now();
  await sb.from('messages').insert({
    id: msgId,
    conversation_id: conversationId,
    sender_id: senderId,
    content: text,
    created_at: ts
  });
  await sb.from('conversations').update({ last_message: text, last_time: ts }).eq('id', conversationId);
  const sender = await getUser(senderId);
  return {
    id: msgId,
    conversationId,
    senderId,
    senderName: sender?.nickname || senderId,
    content: text,
    createdAt: ts
  };
}

async function getMessages(conversationId, limit = 100) {
  const sb = getSupabase();
  const { data: rows } = await sb.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(limit);
  const senderIds = [...new Set((rows || []).map(r => r.sender_id))];
  const { data: users } = await sb.from('users').select('id, nickname').in('id', senderIds.length ? senderIds : ['__none__']);
  const nameMap = Object.fromEntries((users || []).map(u => [u.id, u.nickname]));
  return (rows || []).map(m => ({
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    senderName: nameMap[m.sender_id] || m.sender_id,
    content: m.content,
    createdAt: m.created_at
  }));
}

async function isMember(conversationId, userId) {
  const sb = getSupabase();
  const { data } = await sb.from('conversation_members').select('user_id').eq('conversation_id', conversationId).eq('user_id', userId).maybeSingle();
  return !!data;
}

async function ensureDemoAccount() {
  const demo = await getUser('demo');
  if (!demo) {
    const sb = getSupabase();
    await sb.from('users').insert({
      id: 'demo', password: '123456', nickname: '宝宝',
      gender: '未填写', email: '未绑定', email_verified: false,
      favorite_games: '未填写', avatar: null
    });
  }
  await seedDemoForUser('demo');
}

module.exports = {
  uid,
  normalizeUserId,
  validateUserId,
  validatePassword,
  validateNickname,
  userPublic,
  getUser,
  getUserByEmail,
  findUserByLogin,
  createUser,
  bindUserEmail,
  updateUser,
  getFriends,
  addFriend,
  sendFriendRequest,
  getPendingFriendRequests,
  countPendingFriendRequests,
  respondFriendRequest,
  getConversations,
  togglePin,
  updateGroupAvatar,
  insertMessage,
  getMessages,
  isMember,
  ensureDemoAccount,
  seedDemoForUser,
  privateConvId,
  getOtherUserId
};
