const { handler } = require('../lib/http');
const { verifyAdmin } = require('../lib/adminAuth');
const { getSupabase } = require('../lib/supabase');

module.exports = handler(async (req, res) => {
  if (!verifyAdmin(req)) return res.status(401).json({ ok: false, error: '未授权' });
  const sb = getSupabase();

  if (req.method === 'GET') {
    const convId = req.query.conversationId;
    let query = sb.from('messages').select('*').order('created_at', { ascending: false }).limit(200);
    if (convId) query = query.eq('conversation_id', convId);
    const { data } = await query;
    return res.json({ ok: true, messages: data || [] });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.json({ ok: false, error: '缺少消息 ID' });
    await sb.from('messages').delete().eq('id', id);
    return res.json({ ok: true });
  }

  res.status(405).json({ ok: false, error: 'Method not allowed' });
});
