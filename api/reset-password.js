const { handler } = require('../lib/http');
const db = require('../lib/db');

module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const { id, password } = req.body || {};
  const user = await db.findUserByLogin(id || '');
  if (!user) return res.json({ ok: false, error: '账号或邮箱不存在' });
  await db.updateUser(user.id, { password });
  res.json({ ok: true });
});
