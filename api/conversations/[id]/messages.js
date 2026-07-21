const { handler, getUserId } = require('../../lib/http');
const db = require('../../lib/db');

module.exports = handler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: '未登录' });
  const id = req.query.id;
  if (!id) return res.status(400).json({ ok: false, error: '缺少会话 ID' });
  if (!(await db.isMember(id, userId))) return res.status(403).json({ ok: false, error: '无权访问' });

  if (req.method === 'GET') {
    return res.json({ ok: true, messages: await db.getMessages(id) });
  }
  res.status(405).json({ ok: false, error: 'Method not allowed' });
});
