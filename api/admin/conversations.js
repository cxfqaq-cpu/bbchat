const { handler } = require('../lib/http');
const { verifyAdmin } = require('../lib/adminAuth');
const { getSupabase } = require('../lib/supabase');

module.exports = handler(async (req, res) => {
  if (!verifyAdmin(req)) return res.status(401).json({ ok: false, error: '未授权' });
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const sb = getSupabase();
  const { data } = await sb.from('conversations').select('*').order('last_time', { ascending: false }).limit(100);
  res.json({ ok: true, conversations: data || [] });
});
