const { getSupabase } = require('./supabase');

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeUserId(id) {
  return String(id || '').trim().toLowerCase();
}

async function getUserLite(id) {
  const sb = getSupabase();
  const key = String(id) === '1' ? '1' : normalizeUserId(id);
  const { data } = await sb.from('users').select('id, nickname').eq('id', key).maybeSingle();
  return data;
}

async function isMember(conversationId, userId) {
  const sb = getSupabase();
  const { data } = await sb.from('conversation_members').select('user_id').eq('conversation_id', conversationId).eq('user_id', userId).maybeSingle();
  return !!data;
}

async function insertMessage({ id, conversationId, senderId, content, createdAt, msgType = 'text', meta = {} }) {
  const type = msgType || 'text';
  let text = String(content || '').trim();
  if (type === 'text') {
    if (!text) throw new Error('消息不能为空');
    if (text.length > 2000) throw new Error('消息过长（最多 2000 字）');
  } else if (!text) {
    text = type === 'voice' ? '[语音]' : type === 'sticker' ? '[表情]' : type === 'location' ? '[位置]' : type === 'live_location' ? '[共享位置]' : '[消息]';
  }
  if (type === 'sticker' && !(meta && meta.sticker)) throw new Error('缺少表情');
  if ((type === 'location' || type === 'live_location') && (meta == null || meta.lat == null || meta.lng == null)) {
    throw new Error('缺少定位信息');
  }

  const sb = getSupabase();
  const msgId = id || uid();
  const ts = createdAt || Date.now();
  const preview =
    type === 'voice' ? '[语音]' :
    type === 'sticker' ? '[表情]' :
    type === 'location' ? '[位置]' :
    type === 'live_location' ? '[共享位置]' :
    text;

  const payload = {
    id: msgId,
    conversation_id: conversationId,
    sender_id: senderId,
    content: text,
    created_at: ts,
    msg_type: type,
    meta: meta || {},
    recalled: false
  };
  let { error } = await sb.from('messages').insert(payload);
  if (error) {
    const { error: e2 } = await sb.from('messages').insert({
      id: msgId,
      conversation_id: conversationId,
      sender_id: senderId,
      content: text,
      created_at: ts
    });
    if (e2) throw e2;
  }
  await sb.from('conversations').update({ last_message: preview, last_time: ts }).eq('id', conversationId);
  const sender = await getUserLite(senderId);
  return {
    id: msgId,
    conversationId,
    senderId,
    senderName: sender?.nickname || senderId,
    content: text,
    createdAt: ts,
    msgType: type,
    meta: meta || {},
    recalled: false,
    reactions: []
  };
}

async function getMessages(conversationId, limit = 100) {
  const sb = getSupabase();
  const { data: rows } = await sb.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(limit);
  const list = rows || [];
  const senderIds = [...new Set(list.map(r => r.sender_id))];
  const msgIds = list.map(r => r.id);
  const { data: users } = await sb.from('users').select('id, nickname').in('id', senderIds.length ? senderIds : ['__none__']);
  const nameMap = Object.fromEntries((users || []).map(u => [u.id, u.nickname]));

  let reactions = [];
  if (msgIds.length) {
    const { data: rx, error } = await sb.from('message_reactions').select('*').in('message_id', msgIds);
    if (!error) reactions = rx || [];
  }
  const rxMap = {};
  reactions.forEach(r => {
    if (!rxMap[r.message_id]) rxMap[r.message_id] = [];
    rxMap[r.message_id].push({ userId: r.user_id, emoji: r.emoji });
  });

  return list.map(m => ({
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    senderName: nameMap[m.sender_id] || m.sender_id,
    content: m.recalled ? '' : m.content,
    createdAt: m.created_at,
    msgType: m.msg_type || 'text',
    meta: m.meta || {},
    recalled: !!m.recalled,
    reactions: rxMap[m.id] || []
  }));
}

async function recallMessage(userId, messageId) {
  const sb = getSupabase();
  const me = String(userId) === '1' ? '1' : normalizeUserId(userId);
  const { data: msg } = await sb.from('messages').select('*').eq('id', messageId).maybeSingle();
  if (!msg) return { ok: false, error: '消息不存在' };
  if (msg.sender_id !== me) return { ok: false, error: '只能撤回自己的消息' };
  if (Date.now() - msg.created_at > 2 * 60 * 1000) return { ok: false, error: '超过 2 分钟无法撤回' };
  await sb.from('messages').update({ recalled: true, content: '', msg_type: 'text', meta: {} }).eq('id', messageId);
  await sb.from('conversations').update({ last_message: '有消息被撤回' }).eq('id', msg.conversation_id);
  return { ok: true, messageId, conversationId: msg.conversation_id };
}

async function reactToMessage(userId, messageId, emoji) {
  const me = String(userId) === '1' ? '1' : normalizeUserId(userId);
  const sb = getSupabase();
  const { data: msg } = await sb.from('messages').select('id, recalled, conversation_id').eq('id', messageId).maybeSingle();
  if (!msg || msg.recalled) return { ok: false, error: '消息不存在' };
  if (!(await isMember(msg.conversation_id, me))) return { ok: false, error: '无权操作' };

  const { data: existing } = await sb.from('message_reactions').select('*').eq('message_id', messageId).eq('user_id', me).maybeSingle();
  if (existing && existing.emoji === emoji) {
    await sb.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', me);
  } else {
    await sb.from('message_reactions').upsert({ message_id: messageId, user_id: me, emoji, created_at: Date.now() });
  }
  const { data: list } = await sb.from('message_reactions').select('user_id, emoji').eq('message_id', messageId);
  return {
    ok: true,
    messageId,
    conversationId: msg.conversation_id,
    reactions: (list || []).map(r => ({ userId: r.user_id, emoji: r.emoji }))
  };
}

module.exports = { insertMessage, getMessages, recallMessage, reactToMessage, isMember };
