const { handler, getUserId } = require('../../lib/http');
const db = require('../../lib/db');

module.exports = handler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: '未登录' });
  const id = req.query.id;
  if (req.method !== 'PUT') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const result = await db.togglePin(id, userId);
  if (!result) return res.json({ ok: false, error: '会话不存在' });
  res.json({ ok: true, ...result });
});
