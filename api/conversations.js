const { handler, getUserId } = require('../lib/http');
const db = require('../lib/db');

module.exports = handler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId || !(await db.getUser(userId))) return res.status(401).json({ ok: false, error: '未登录' });
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const list = await db.getConversations(userId);
  res.json({ ok: true, conversations: list });
});
