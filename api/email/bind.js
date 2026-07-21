const { handler, getUserId } = require('../lib/http');
const db = require('../lib/db');
const emailService = require('../lib/email');

module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: '未登录' });
  const { email, code } = req.body || {};
  if (!email || !code) return res.json({ ok: false, error: '请填写邮箱和验证码' });
  if (!emailService.isValidEmail(email)) return res.json({ ok: false, error: '邮箱格式不正确' });
  const verify = await emailService.verifyCode(email, code, 'bind', userId);
  if (!verify.ok) return res.json(verify);
  res.json(await db.bindUserEmail(userId, email.toLowerCase().trim()));
});
