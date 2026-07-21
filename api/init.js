const { handler } = require('../lib/http');
const db = require('../lib/db');

module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  await db.ensureDemoAccount();
  res.json({ ok: true });
});
