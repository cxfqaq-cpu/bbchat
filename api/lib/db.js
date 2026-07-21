const { getSupabase } = require('./supabase');

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function privateConvId(a, b) {
  return 'private_' + [a, b].sort().join('_');
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
  const { data } = await sb.from('users').select('*').eq('id', id).maybeSingle();
  return rowToUser(data);
}

async function getUserByEmail(email) {
  const normalized = email.toLowerCase().trim();
  const sb = getSupabase();
  const { data } = await sb.from('users').select('*').eq('email', normalized).eq('email_verified', true).maybeSingle();
  return rowToUser(data);
}

async function findUserByLogin(login) {
  const val = login.trim();
  if (val.includes('@')) return getUserByEmail(val);
  return getUser(val);
}

async function createUser({ id, password, nickname, email }) {
  const sb = getSupabase();
  const normalizedEmail = email ? email.toLowerCase().trim() : '未绑定';
  const { error } = await sb.from('users').insert({
    id,
    password,
    nickname: nickname || id,
    gender: '未填写',
    email: normalizedEmail,
    email_verified: !!email,
    favorite_games: '未填写',
    avatar: null
  });
  if (error) throw error;
  await seedDemoForUser(id);
  return getUser(id);
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
  if (updates.password !== undefined) patch.password = updates.password;
  if (updates.nickname !== undefined) patch.nickname = updates.nickname;
  if (updates.gender !== undefined) patch.gender = updates.gender;
  if (updates.favoriteGames !== undefined) patch.favorite_games = updates.favoriteGames;
  if (updates.avatar !== undefined) patch.avatar = updates.avatar;
  const { data } = await sb.from('users').update(patch).eq('id', userId).select('*').single();
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
  if (userId === targetId) return { ok: false, error: '不能添加自己为好友' };
  const target = await getUser(targetId);
  if (!target) return { ok: false, error: '该宝宝 ID 不存在' };
  const sb = getSupabase();
  const { data: ex } = await sb.from('friendships').select('*').eq('user_id', userId).eq('friend_id', targetId).maybeSingle();
  if (ex) return { ok: false, error: '已经是好友了' };
  await addFriendship(userId, targetId);
  const convId = await ensurePrivateConversation(userId, targetId, privateConvId(userId, targetId));
  return { ok: true, friend: { id: target.id, name: target.nickname, avatar: target.avatar }, conversationId: convId };
}

async function getPrivateChatName(convId, userId) {
  const parts = convId.replace('private_', '').split('_');
  const otherId = parts.find(p => p !== userId) || parts[1];
  const u = await getUser(otherId);
  return u?.nickname || otherId;
}

async function getPrivateAvatar(convId, userId) {
  const parts = convId.replace('private_', '').split('_');
  const otherId = parts.find(p => p !== userId) || parts[1];
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
  const sb = getSupabase();
  const msgId = id || uid();
  const ts = createdAt || Date.now();
  await sb.from('messages').insert({
    id: msgId,
    conversation_id: conversationId,
    sender_id: senderId,
    content,
    created_at: ts
  });
  await sb.from('conversations').update({ last_message: content, last_time: ts }).eq('id', conversationId);
  const sender = await getUser(senderId);
  return {
    id: msgId,
    conversationId,
    senderId,
    senderName: sender?.nickname || senderId,
    content,
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
  userPublic,
  getUser,
  getUserByEmail,
  findUserByLogin,
  createUser,
  bindUserEmail,
  updateUser,
  getFriends,
  addFriend,
  getConversations,
  togglePin,
  updateGroupAvatar,
  insertMessage,
  getMessages,
  isMember,
  ensureDemoAccount,
  seedDemoForUser
};
