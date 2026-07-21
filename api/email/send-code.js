const { handler, getUserId } = require('../lib/http');
const db = require('../lib/db');
const emailService = require('../lib/email');

module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const { email, purpose } = req.body || {};
  if (!email) return res.json({ ok: false, error: '请输入邮箱' });
  if (purpose === 'bind') {
    const userId = getUserId(req);
    if (!userId || !(await db.getUser(userId))) return res.status(401).json({ ok: false, error: '未登录' });
    return res.json(await emailService.sendVerificationCode(db, email, 'bind', userId));
  }
  res.json(await emailService.sendVerificationCode(db, email, 'register'));
});
