const { handler, getUserId } = require('../lib/http');
const db = require('../lib/db');

module.exports = handler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId || !(await db.getUser(userId))) return res.status(401).json({ ok: false, error: '未登录' });

  if (req.method === 'GET') {
    return res.json({ ok: true, friends: await db.getFriends(userId) });
  }
  if (req.method === 'POST') {
    const { targetId } = req.body || {};
    if (!targetId) return res.json({ ok: false, error: '请输入宝宝 ID' });
    return res.json(await db.addFriend(userId, targetId.trim()));
  }
  res.status(405).json({ ok: false, error: 'Method not allowed' });
});
