const { handler, getUserId } = require('../lib/http');
const emailService = require('../lib/email');

module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const { email, code, purpose } = req.body || {};
  if (!email || !code) return res.json({ ok: false, error: '请输入邮箱和验证码' });
  if (purpose === 'bind') {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, error: '未登录' });
    return res.json(await emailService.checkCode(email, code, 'bind', userId));
  }
  res.json(await emailService.checkCode(email, code, 'register'));
});
