const { handler, getUserId } = require('../lib/http');
const db = require('../lib/db');

module.exports = handler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: '未登录' });
  const id = req.query.id;
  const user = await db.getUser(id);
  if (!user) return res.json({ ok: false, error: '用户不存在' });
  res.json({ ok: true, user: db.userPublic(user) });
});
