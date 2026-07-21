const { handler, getUserId } = require('../lib/http');
const db = require('../lib/db');

module.exports = handler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId || !(await db.getUser(userId))) return res.status(401).json({ ok: false, error: '未登录' });

  if (req.method === 'GET') {
    return res.json({ ok: true, user: db.userPublic(await db.getUser(userId)) });
  }
  if (req.method === 'PUT') {
    const { email, ...safe } = req.body || {};
    const updated = await db.updateUser(userId, safe);
    return res.json({ ok: true, user: db.userPublic(updated) });
  }
  res.status(405).json({ ok: false, error: 'Method not allowed' });
});
