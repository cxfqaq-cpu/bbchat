function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-User-Id,Authorization');
}

function handler(fn) {
  return async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    try {
      await fn(req, res);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: e.message || '服务器错误' });
    }
  };
}

function getUserId(req) {
  return req.headers['x-user-id'] || req.headers['X-User-Id'];
}

module.exports = { cors, handler, getUserId };
