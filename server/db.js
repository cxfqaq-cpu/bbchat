const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'campus.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function defaultData() {
  return { users: {}, friendships: {}, conversations: {}, messages: {}, emailIndex: {}, verificationCodes: {} };
}

function load() {
  try {
    if (fs.existsSync(dbFile)) return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  } catch (_) { /* ignore */ }
  return defaultData();
}

function save(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf8');
}

let data = load();

function migrate() {
  if (!data.emailIndex) data.emailIndex = {};
  if (!data.verificationCodes) data.verificationCodes = {};
  Object.values(data.users).forEach(u => {
    if (u.emailVerified === undefined) {
      const hasEmail = u.email && u.email !== '未填写' && u.email !== '未绑定';
      u.emailVerified = !!hasEmail;
      if (!u.emailVerified) u.email = '未绑定';
      else data.emailIndex[u.email.toLowerCase()] = u.id;
    }
  });
  persist();
}

migrate();

function persist() { save(data); }

function privateConvId(a, b) {
  return 'private_' + [a, b].sort().join('_');
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function userPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    gender: row.gender,
    email: row.emailVerified ? row.email : '未绑定',
    emailVerified: !!row.emailVerified,
    favoriteGames: row.favoriteGames,
    avatar: row.avatar
  };
}

function getUserByEmail(email) {
  if (!email) return null;
  const key = email.toLowerCase().trim();
  const userId = data.emailIndex[key];
  return userId ? data.users[userId] : null;
}

function findUserByLogin(login) {
  const val = login.trim();
  if (val.includes('@')) return getUserByEmail(val);
  return getUser(val);
}

function getUser(id) {
  return data.users[id] || null;
}

function createUser({ id, password, nickname, email }) {
  data.users[id] = {
    id,
    password,
    nickname: nickname || id,
    gender: '未填写',
    email: email || '未绑定',
    emailVerified: !!email,
    favoriteGames: '未填写',
    avatar: null
  };
  if (email) {
    data.emailIndex[email.toLowerCase().trim()] = id;
  }
  seedDemoForUser(id);
  persist();
}

function bindUserEmail(userId, email) {
  const user = data.users[userId];
  if (!user) return { ok: false, error: '用户不存在' };
  const normalized = email.toLowerCase().trim();
  const existing = getUserByEmail(normalized);
  if (existing && existing.id !== userId) {
    return { ok: false, error: '该邮箱已被其他账号绑定' };
  }
  if (user.emailVerified && user.email !== normalized) {
    delete data.emailIndex[user.email.toLowerCase()];
  }
  user.email = normalized;
  user.emailVerified = true;
  data.emailIndex[normalized] = userId;
  persist();
  return { ok: true, user: userPublic(user) };
}

function seedDemoForUser(userId) {
  if (data.friendships[userId]) return;

  const demos = [
    { id: 'demo_friend_a1', nickname: '爱我' },
    { id: 'demo_friend_a2', nickname: '爱他' },
    { id: 'demo_friend_b1', nickname: '宝宝' },
    { id: 'demo_friend_c1', nickname: '陈小明' },
    { id: 'demo_friend_d1', nickname: 'David' },
    { id: 'demo_friend_num', nickname: '123同学' },
    { id: 'demo_friend_z1', nickname: '张三' }
  ];

  demos.forEach(d => {
    if (!data.users[d.id]) {
      data.users[d.id] = { id: d.id, password: 'demo', nickname: d.nickname, gender: '未填写', email: '未绑定', emailVerified: false, favoriteGames: '未填写', avatar: null };
    }
    addFriendship(userId, d.id);
    const convId = privateConvId(userId, d.id);
    ensurePrivateConversation(userId, d.id, convId);
    const now = Date.now();
    [
      ['你好呀！', now - 86400000],
      ['在吗？', now - 3600000]
    ].forEach(([content, ts], i) => {
      const msgId = `seed_${convId}_${i}`;
      if (!data.messages[msgId]) {
        insertMessage({ id: msgId, conversationId: convId, senderId: d.id, content, createdAt: ts });
      }
    });
  });

  const groupId = 'group_' + userId + '_cs';
  if (!data.conversations[groupId]) {
    data.conversations[groupId] = {
      id: groupId, type: 'group', name: '计算机2024', avatar: null,
      creatorId: userId, lastMessage: '明天考试加油', lastTime: Date.now() - 1800000,
      members: { [userId]: { pinned: false, pinnedAt: 0 }, demo_friend_c1: { pinned: false, pinnedAt: 0 }, demo_friend_d1: { pinned: false, pinnedAt: 0 } }
    };
    insertMessage({ conversationId: groupId, senderId: 'demo_friend_c1', content: '明天考试加油', createdAt: Date.now() - 1800000 });
  }

  const groupId2 = 'group_' + userId + '_bb';
  if (!data.conversations[groupId2]) {
    data.conversations[groupId2] = {
      id: groupId2, type: 'group', name: '篮球社', avatar: null,
      creatorId: 'demo_friend_d1', lastMessage: '周六训练', lastTime: Date.now() - 5400000,
      members: {
        [userId]: { pinned: true, pinnedAt: Date.now() - 50000 },
        demo_friend_d1: { pinned: false, pinnedAt: 0 },
        demo_friend_b1: { pinned: false, pinnedAt: 0 }
      }
    };
    insertMessage({ conversationId: groupId2, senderId: 'demo_friend_d1', content: '周六训练', createdAt: Date.now() - 5400000 });
  }

  persist();
}

function ensureDemoAccount() {
  if (!getUser('demo')) {
    createUser({ id: 'demo', password: '123456', nickname: '宝宝' });
  }
}

function addFriendship(userId, friendId) {
  if (!data.friendships[userId]) data.friendships[userId] = {};
  if (!data.friendships[friendId]) data.friendships[friendId] = {};
  data.friendships[userId][friendId] = Date.now();
  data.friendships[friendId][userId] = Date.now();
}

function ensurePrivateConversation(userId, friendId, convId) {
  if (!data.conversations[convId]) {
    const friend = getUser(friendId);
    data.conversations[convId] = {
      id: convId, type: 'private', name: friend?.nickname || friendId,
      avatar: friend?.avatar || null, creatorId: null,
      lastMessage: '', lastTime: 0,
      members: {}
    };
  }
  const conv = data.conversations[convId];
  if (!conv.members[userId]) conv.members[userId] = { pinned: false, pinnedAt: 0 };
  if (!conv.members[friendId]) conv.members[friendId] = { pinned: false, pinnedAt: 0 };
  return convId;
}

function getFriends(userId) {
  const map = data.friendships[userId] || {};
  return Object.keys(map).map(fid => {
    const u = getUser(fid);
    return { id: fid, name: u?.nickname || fid, avatar: u?.avatar || null };
  });
}

function addFriend(userId, targetId) {
  if (userId === targetId) return { ok: false, error: '不能添加自己为好友' };
  const target = getUser(targetId);
  if (!target) return { ok: false, error: '该宝宝 ID 不存在' };
  if (data.friendships[userId]?.[targetId]) return { ok: false, error: '已经是好友了' };

  addFriendship(userId, targetId);
  const convId = ensurePrivateConversation(userId, targetId, privateConvId(userId, targetId));
  persist();
  return { ok: true, friend: { id: target.id, name: target.nickname, avatar: target.avatar }, conversationId: convId };
}

function getPrivateChatName(convId, userId) {
  const parts = convId.replace('private_', '').split('_');
  const otherId = parts.find(p => p !== userId) || parts[1];
  const u = getUser(otherId);
  return u?.nickname || otherId;
}

function getPrivateAvatar(convId, userId) {
  const parts = convId.replace('private_', '').split('_');
  const otherId = parts.find(p => p !== userId) || parts[1];
  return getUser(otherId)?.avatar || null;
}

function getConversations(userId) {
  return Object.values(data.conversations)
    .filter(c => c.members[userId])
    .map(c => ({
      id: c.id,
      type: c.type,
      name: c.type === 'private' ? getPrivateChatName(c.id, userId) : c.name,
      avatar: c.type === 'private' ? getPrivateAvatar(c.id, userId) : c.avatar,
      creatorId: c.creatorId,
      lastMessage: c.lastMessage,
      lastTime: c.lastTime,
      pinned: !!c.members[userId].pinned,
      pinnedAt: c.members[userId].pinnedAt || 0
    }));
}

function enrichConversation(conv, userId) {
  return conv;
}

function togglePin(conversationId, userId) {
  const conv = data.conversations[conversationId];
  if (!conv?.members[userId]) return null;
  const m = conv.members[userId];
  m.pinned = !m.pinned;
  m.pinnedAt = m.pinned ? Date.now() : 0;
  persist();
  return { pinned: m.pinned, pinnedAt: m.pinnedAt };
}

function updateGroupAvatar(conversationId, userId, avatar) {
  const conv = data.conversations[conversationId];
  if (!conv || conv.type !== 'group') return { ok: false, error: '群组不存在' };
  if (conv.creatorId !== userId) return { ok: false, error: '只有群主可以修改群头像' };
  conv.avatar = avatar;
  persist();
  return { ok: true };
}

function insertMessage({ id, conversationId, senderId, content, createdAt }) {
  const msgId = id || uid();
  const ts = createdAt || Date.now();
  data.messages[msgId] = { id: msgId, conversationId, senderId, content, createdAt: ts };
  const conv = data.conversations[conversationId];
  if (conv) {
    conv.lastMessage = content;
    conv.lastTime = ts;
  }
  persist();
  const sender = getUser(senderId);
  return {
    id: msgId,
    conversationId,
    senderId,
    senderName: sender?.nickname || senderId,
    content,
    createdAt: ts
  };
}

function getMessages(conversationId, limit = 100) {
  return Object.values(data.messages)
    .filter(m => m.conversationId === conversationId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-limit)
    .map(m => ({
      ...m,
      senderName: getUser(m.senderId)?.nickname || m.senderId
    }));
}

function isMember(conversationId, userId) {
  return !!data.conversations[conversationId]?.members[userId];
}

function getMemberIds(conversationId) {
  const conv = data.conversations[conversationId];
  return conv ? Object.keys(conv.members) : [];
}

function updateUser(userId, updates) {
  const user = data.users[userId];
  if (!user) return null;
  if (updates.password !== undefined) user.password = updates.password;
  if (updates.nickname !== undefined) user.nickname = updates.nickname;
  if (updates.gender !== undefined) user.gender = updates.gender;
  if (updates.favoriteGames !== undefined) user.favoriteGames = updates.favoriteGames;
  if (updates.avatar !== undefined) user.avatar = updates.avatar;
  persist();
  return user;
}

ensureDemoAccount();

module.exports = {
  data,
  persist,
  userPublic,
  getUser,
  getUserByEmail,
  findUserByLogin,
  createUser,
  bindUserEmail,
  getFriends,
  addFriend,
  getConversations,
  enrichConversation,
  togglePin,
  updateGroupAvatar,
  insertMessage,
  getMessages,
  isMember,
  getMemberIds,
  updateUser
};
