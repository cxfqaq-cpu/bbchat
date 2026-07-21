const { handler } = require('../lib/http');
const { verifyAdmin } = require('../lib/adminAuth');
const { getSupabase } = require('../lib/supabase');

module.exports = handler(async (req, res) => {
  if (!verifyAdmin(req)) return res.status(401).json({ ok: false, error: '未授权' });
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const sb = getSupabase();
  const [users, convs, msgs] = await Promise.all([
    sb.from('users').select('*', { count: 'exact', head: true }),
    sb.from('conversations').select('*', { count: 'exact', head: true }),
    sb.from('messages').select('*', { count: 'exact', head: true })
  ]);
  res.json({
    ok: true,
    stats: {
      users: users.count || 0,
      conversations: convs.count || 0,
      messages: msgs.count || 0
    }
  });
});
