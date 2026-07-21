/**
 * 单一 Serverless Function（适配 Vercel Hobby ≤12 函数限制）
 * 路由：/api/*
 */
const { cors, getUserId } = require('../lib/http');
const db = require('../lib/db');
const emailService = require('../lib/email');
const { adminLogin, verifyAdmin } = require('../lib/adminAuth');
const { getSupabase } = require('../lib/supabase');

function pathParts(req) {
  // vercel.json rewrite: /api/(.*) -> /api/handler?path=$1
  let p = req.query && req.query.path;
  if (Array.isArray(p)) p = p.join('/');
  if (typeof p === 'string' && p.length) {
    return p.split('/').filter(Boolean).map((s) => {
      try { return decodeURIComponent(s); } catch (_) { return s; }
    });
  }

  // Fallback: parse from URL
  const rawUrl = req.url || '';
  const pathname = rawUrl.split('?')[0] || '';
  const stripped = pathname
    .replace(/^\/api\/handler\/?/, '')
    .replace(/^\/api\/?/, '')
    .replace(/^\//, '');
  if (!stripped || stripped === 'handler') return [];
  return stripped.split('/').filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch (_) { return s; }
  });
}

function joinPath(parts) {
  return parts.join('/');
}

async function requireUser(req, res) {
  const userId = getUserId(req);
  if (!userId || !(await db.getUser(userId))) {
    res.status(401).json({ ok: false, error: '未登录' });
    return null;
  }
  return userId;
}

async function route(req, res) {
  const parts = pathParts(req);
  const path = joinPath(parts);
  const method = req.method;

  // GET/POST /api/config
  if (path === 'config') {
    return res.json({
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
    });
  }

  // POST /api/init
  if (path === 'init') {
    if (method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    await db.ensureDemoAccount();
    return res.json({ ok: true });
  }

  // POST /api/login
  if (path === 'login') {
    if (method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    const { id, password } = req.body || {};
    const user = await db.findUserByLogin(id || '');
    if (!user) return res.json({ ok: false, error: '账号或邮箱不存在' });
    if (user.password !== password) return res.json({ ok: false, error: '密码错误' });
    return res.json({ ok: true, user: db.userPublic(user) });
  }

  // POST /api/register
  if (path === 'register') {
    if (method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    const { id, password, nickname, email, code } = req.body || {};
    if (!id || !password || !email || !code) return res.json({ ok: false, error: '请填写完整信息' });
    if (!emailService.isValidEmail(email)) return res.json({ ok: false, error: '邮箱格式不正确' });
    if (await db.getUser(id)) return res.json({ ok: false, error: '该账号已存在' });
    if (await db.getUserByEmail(email)) return res.json({ ok: false, error: '该邮箱已被绑定' });
    const verify = await emailService.verifyCode(email, code, 'register');
    if (!verify.ok) return res.json(verify);
    await db.createUser({ id, password, nickname: nickname || id, email: email.toLowerCase().trim() });
    return res.json({ ok: true });
  }

  // POST /api/reset-password
  if (path === 'reset-password') {
    if (method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    const { id, password } = req.body || {};
    const user = await db.findUserByLogin(id || '');
    if (!user) return res.json({ ok: false, error: '账号或邮箱不存在' });
    await db.updateUser(user.id, { password });
    return res.json({ ok: true });
  }

  // GET|PUT /api/me
  if (path === 'me') {
    const userId = await requireUser(req, res);
    if (!userId) return;
    if (method === 'GET') {
      return res.json({ ok: true, user: db.userPublic(await db.getUser(userId)) });
    }
    if (method === 'PUT') {
      const { email, ...safe } = req.body || {};
      const updated = await db.updateUser(userId, safe);
      return res.json({ ok: true, user: db.userPublic(updated) });
    }
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // GET|POST /api/friends
  if (path === 'friends') {
    const userId = await requireUser(req, res);
    if (!userId) return;
    if (method === 'GET') return res.json({ ok: true, friends: await db.getFriends(userId) });
    if (method === 'POST') {
      const { targetId } = req.body || {};
      if (!targetId) return res.json({ ok: false, error: '请输入宝宝 ID' });
      return res.json(await db.addFriend(userId, targetId.trim()));
    }
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // GET /api/conversations
  if (path === 'conversations') {
    const userId = await requireUser(req, res);
    if (!userId) return;
    if (method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    return res.json({ ok: true, conversations: await db.getConversations(userId) });
  }

  // /api/conversations/:id/messages|pin|avatar
  if (parts[0] === 'conversations' && parts[1] && parts[2]) {
    const userId = await requireUser(req, res);
    if (!userId) return;
    const id = decodeURIComponent(parts[1]);
    const action = parts[2];

    if (action === 'messages') {
      if (!(await db.isMember(id, userId))) return res.status(403).json({ ok: false, error: '无权访问' });
      if (method === 'GET') return res.json({ ok: true, messages: await db.getMessages(id) });
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    if (action === 'pin') {
      if (method !== 'PUT') return res.status(405).json({ ok: false, error: 'Method not allowed' });
      const result = await db.togglePin(id, userId);
      if (!result) return res.json({ ok: false, error: '会话不存在' });
      return res.json({ ok: true, ...result });
    }

    if (action === 'avatar') {
      if (method !== 'PUT') return res.status(405).json({ ok: false, error: 'Method not allowed' });
      return res.json(await db.updateGroupAvatar(id, userId, req.body?.avatar));
    }
  }

  // POST /api/messages/send
  if (path === 'messages/send') {
    if (method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    const userId = await requireUser(req, res);
    if (!userId) return;
    const { conversationId, content } = req.body || {};
    if (!conversationId || !content?.trim()) return res.json({ ok: false, error: '消息不能为空' });
    if (!(await db.isMember(conversationId, userId))) return res.status(403).json({ ok: false, error: '无权发送' });
    const message = await db.insertMessage({ conversationId, senderId: userId, content: content.trim() });
    return res.json({ ok: true, message });
  }

  // POST /api/email/send-code
  if (path === 'email/send-code') {
    if (method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    const { email, purpose } = req.body || {};
    if (!email) return res.json({ ok: false, error: '请输入邮箱' });
    if (purpose === 'bind') {
      const userId = await requireUser(req, res);
      if (!userId) return;
      return res.json(await emailService.sendVerificationCode(db, email, 'bind', userId));
    }
    return res.json(await emailService.sendVerificationCode(db, email, 'register'));
  }

  // POST /api/email/verify-code
  if (path === 'email/verify-code') {
    if (method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    const { email, code, purpose } = req.body || {};
    if (!email || !code) return res.json({ ok: false, error: '请输入邮箱和验证码' });
    if (purpose === 'bind') {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ ok: false, error: '未登录' });
      return res.json(await emailService.checkCode(email, code, 'bind', userId));
    }
    return res.json(await emailService.checkCode(email, code, 'register'));
  }

  // POST /api/email/bind
  if (path === 'email/bind') {
    if (method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    const userId = await requireUser(req, res);
    if (!userId) return;
    const { email, code } = req.body || {};
    if (!email || !code) return res.json({ ok: false, error: '请填写邮箱和验证码' });
    if (!emailService.isValidEmail(email)) return res.json({ ok: false, error: '邮箱格式不正确' });
    const verify = await emailService.verifyCode(email, code, 'bind', userId);
    if (!verify.ok) return res.json(verify);
    return res.json(await db.bindUserEmail(userId, email.toLowerCase().trim()));
  }

  // GET /api/users/:id
  if (parts[0] === 'users' && parts[1] && !parts[2]) {
    const userId = await requireUser(req, res);
    if (!userId) return;
    const id = decodeURIComponent(parts[1]);
    const user = await db.getUser(id);
    if (!user) return res.json({ ok: false, error: '用户不存在' });
    return res.json({ ok: true, user: db.userPublic(user) });
  }

  // POST /api/admin/login
  if (path === 'admin/login') {
    if (method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    const { password } = req.body || {};
    return res.json(adminLogin(password));
  }

  // Admin routes
  if (parts[0] === 'admin') {
    if (!verifyAdmin(req)) return res.status(401).json({ ok: false, error: '未授权' });
    const sb = getSupabase();

    if (path === 'admin/stats') {
      if (method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
      const [users, convs, msgs] = await Promise.all([
        sb.from('users').select('*', { count: 'exact', head: true }),
        sb.from('conversations').select('*', { count: 'exact', head: true }),
        sb.from('messages').select('*', { count: 'exact', head: true })
      ]);
      return res.json({
        ok: true,
        stats: {
          users: users.count || 0,
          conversations: convs.count || 0,
          messages: msgs.count || 0
        }
      });
    }

    if (path === 'admin/users') {
      if (method === 'GET') {
        const { data } = await sb.from('users').select('id, nickname, email, email_verified, gender, favorite_games, created_at').order('created_at', { ascending: false });
        return res.json({ ok: true, users: data || [] });
      }
      if (method === 'PUT') {
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
      if (method === 'DELETE') {
        const { id } = req.body || {};
        if (!id) return res.json({ ok: false, error: '缺少用户 ID' });
        await sb.from('users').delete().eq('id', id);
        return res.json({ ok: true });
      }
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    if (path === 'admin/conversations') {
      if (method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
      const { data } = await sb.from('conversations').select('*').order('last_time', { ascending: false }).limit(100);
      return res.json({ ok: true, conversations: data || [] });
    }

    if (path === 'admin/messages') {
      if (method === 'GET') {
        const convId = req.query.conversationId;
        let query = sb.from('messages').select('*').order('created_at', { ascending: false }).limit(200);
        if (convId) query = query.eq('conversation_id', convId);
        const { data } = await query;
        return res.json({ ok: true, messages: data || [] });
      }
      if (method === 'DELETE') {
        const { id } = req.body || {};
        if (!id) return res.json({ ok: false, error: '缺少消息 ID' });
        await sb.from('messages').delete().eq('id', id);
        return res.json({ ok: true });
      }
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
  }

  return res.status(404).json({ ok: false, error: 'Not found: /api/' + path });
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    await route(req, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || '服务器错误' });
  }
};
