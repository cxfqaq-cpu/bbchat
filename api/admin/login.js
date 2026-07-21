const { handler } = require('../lib/http');
const { adminLogin } = require('../lib/adminAuth');

module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const { password } = req.body || {};
  res.json(adminLogin(password));
});
