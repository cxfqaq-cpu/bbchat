const { handler } = require('../lib/http');
const db = require('../lib/db');
const emailService = require('../lib/email');

module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const { id, password, nickname, email, code } = req.body || {};
  if (!id || !password || !email || !code) return res.json({ ok: false, error: '请填写完整信息' });
  if (!emailService.isValidEmail(email)) return res.json({ ok: false, error: '邮箱格式不正确' });
  if (await db.getUser(id)) return res.json({ ok: false, error: '该账号已存在' });
  if (await db.getUserByEmail(email)) return res.json({ ok: false, error: '该邮箱已被绑定' });
  const verify = await emailService.verifyCode(email, code, 'register');
  if (!verify.ok) return res.json(verify);
  await db.createUser({ id, password, nickname: nickname || id, email: email.toLowerCase().trim() });
  res.json({ ok: true });
});
