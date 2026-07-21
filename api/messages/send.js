const { handler, getUserId } = require('../lib/http');
const db = require('../lib/db');

module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: '未登录' });
  const { conversationId, content } = req.body || {};
  if (!conversationId || !content?.trim()) return res.json({ ok: false, error: '消息不能为空' });
  if (!(await db.isMember(conversationId, userId))) return res.status(403).json({ ok: false, error: '无权发送' });
  const message = await db.insertMessage({ conversationId, senderId: userId, content: content.trim() });
  res.json({ ok: true, message });
});
