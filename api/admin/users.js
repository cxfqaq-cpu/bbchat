const { handler } = require('../lib/http');
const { verifyAdmin } = require('../lib/adminAuth');
const { getSupabase } = require('../lib/supabase');

module.exports = handler(async (req, res) => {
  if (!verifyAdmin(req)) return res.status(401).json({ ok: false, error: '未授权' });
  const sb = getSupabase();

  if (req.method === 'GET') {
    const { data } = await sb.from('users').select('id, nickname, email, email_verified, gender, favorite_games, created_at').order('created_at', { ascending: false });
    return res.json({ ok: true, users: data || [] });
  }

  if (req.method === 'PUT') {
    const { id, nickname, gender, favorite_games } = req.body || {};
    if (!id) return res.json({ ok: false, error: '缺少用户 ID' });
    const patch = {};
    if (nickname !== undefined) patch.nickname = nickname;
    if (gender !== undefined) patch.gender = gender;
    if (favorite_games !== undefined) patch.favorite_games = favorite_games;
    const { data, error } = await sb.from('users').update(patch).eq('id', id).select('*').single();
    if (error) return res.json({ ok: false, error: error.message });
    return res.json({ ok: true, user: data });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.json({ ok: false, error: '缺少用户 ID' });
    await sb.from('users').delete().eq('id', id);
    return res.json({ ok: true });
  }

  res.status(405).json({ ok: false, error: 'Method not allowed' });
});
