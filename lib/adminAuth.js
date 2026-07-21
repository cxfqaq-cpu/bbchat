const crypto = require('crypto');

function getAdminToken() {
  const secret = process.env.ADMIN_PASSWORD || 'bbchat-admin';
  return crypto.createHash('sha256').update('bbchat-admin:' + secret).digest('hex');
}

function verifyAdmin(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  return token === getAdminToken();
}

function adminLogin(password) {
  if (password !== (process.env.ADMIN_PASSWORD || 'bbchat-admin')) {
    return { ok: false, error: '管理员密码错误' };
  }
  return { ok: true, token: getAdminToken() };
}

module.exports = { verifyAdmin, adminLogin, getAdminToken };
