const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const db = require('./db');
const emailService = require('./email');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(ROOT));

const onlineUsers = new Map();

function auth(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId || !db.getUser(userId)) {
    return res.status(401).json({ ok: false, error: '未登录' });
  }
  req.userId = userId;
  next();
}

app.post('/api/email/verify-code', (req, res) => {
  const { email, code, purpose } = req.body;
  if (!email || !code) return res.json({ ok: false, error: '请输入邮箱和验证码' });
  if (purpose === 'bind') {
    const userId = req.headers['x-user-id'];
    if (!userId || !db.getUser(userId)) return res.status(401).json({ ok: false, error: '未登录' });
    return res.json(emailService.checkCode(db, email, code, 'bind', userId));
  }
  res.json(emailService.checkCode(db, email, code, 'register'));
});

app.post('/api/email/send-code', async (req, res) => {
  try {
    const { email, purpose } = req.body;
    if (!email) return res.json({ ok: false, error: '请输入邮箱' });
    if (purpose === 'bind') {
      const userId = req.headers['x-user-id'];
      if (!userId || !db.getUser(userId)) return res.status(401).json({ ok: false, error: '未登录' });
      const result = await emailService.sendVerificationCode(db, email, 'bind', userId);
      return res.json(result);
    }
    const result = await emailService.sendVerificationCode(db, email, 'register');
    res.json(result);
  } catch (e) {
    console.error(e);
    res.json({ ok: false, error: '验证码发送失败' });
  }
});

app.post('/api/register', (req, res) => {
  const { id, password, nickname, email, code } = req.body;
  if (!id || !password || !email || !code) return res.json({ ok: false, error: '请填写完整信息' });
  if (!emailService.isValidEmail(email)) return res.json({ ok: false, error: '邮箱格式不正确' });
  if (db.getUser(id)) return res.json({ ok: false, error: '该账号已存在' });
  if (db.getUserByEmail(email)) return res.json({ ok: false, error: '该邮箱已被绑定' });

  const verify = emailService.verifyCode(db, email, code, 'register');
  if (!verify.ok) return res.json(verify);

  db.createUser({ id, password, nickname: nickname || id, email: email.toLowerCase().trim() });
  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const { id, password } = req.body;
  const user = db.findUserByLogin(id || '');
  if (!user) return res.json({ ok: false, error: '账号或邮箱不存在' });
  if (user.password !== password) return res.json({ ok: false, error: '密码错误' });
  res.json({ ok: true, user: db.userPublic(user) });
});

app.post('/api/email/bind', auth, (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.json({ ok: false, error: '请填写邮箱和验证码' });
  if (!emailService.isValidEmail(email)) return res.json({ ok: false, error: '邮箱格式不正确' });

  const verify = emailService.verifyCode(db, email, code, 'bind', req.userId);
  if (!verify.ok) return res.json(verify);

  const result = db.bindUserEmail(req.userId, email.toLowerCase().trim());
  res.json(result);
});

app.post('/api/reset-password', (req, res) => {
  const { id, password } = req.body;
  const user = db.findUserByLogin(id || '');
  if (!user) return res.json({ ok: false, error: '账号或邮箱不存在' });
  db.updateUser(user.id, { password });
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  res.json({ ok: true, user: db.userPublic(db.getUser(req.userId)) });
});

app.put('/api/me', auth, (req, res) => {
  const { email, ...safeUpdates } = req.body;
  const updated = db.updateUser(req.userId, safeUpdates);
  res.json({ ok: true, user: db.userPublic(updated) });
});

app.get('/api/users/:id', auth, (req, res) => {
  const user = db.getUser(req.params.id);
  if (!user) return res.json({ ok: false, error: '用户不存在' });
  res.json({ ok: true, user: db.userPublic(user) });
});

app.get('/api/friends', auth, (req, res) => {
  res.json({ ok: true, friends: db.getFriends(req.userId) });
});

app.post('/api/friends', auth, (req, res) => {
  const { targetId } = req.body;
  if (!targetId) return res.json({ ok: false, error: '请输入宝宝 ID' });
  const result = db.addFriend(req.userId, targetId.trim());
  if (!result.ok) return res.json(result);

  io.to(`user:${targetId.trim()}`).emit('friends:updated');
  res.json(result);
});

app.get('/api/conversations', auth, (req, res) => {
  const list = db.getConversations(req.userId).map(c => db.enrichConversation(c, req.userId));
  res.json({ ok: true, conversations: list });
});

app.get('/api/conversations/:id/messages', auth, (req, res) => {
  const { id } = req.params;
  if (!db.isMember(id, req.userId)) return res.status(403).json({ ok: false, error: '无权访问' });
  res.json({ ok: true, messages: db.getMessages(id) });
});

app.put('/api/conversations/:id/pin', auth, (req, res) => {
  const result = db.togglePin(req.params.id, req.userId);
  if (!result) return res.json({ ok: false, error: '会话不存在' });
  res.json({ ok: true, ...result });
});

app.put('/api/conversations/:id/avatar', auth, (req, res) => {
  const result = db.updateGroupAvatar(req.params.id, req.userId, req.body.avatar);
  res.json(result);
});

io.on('connection', (socket) => {
  let userId = null;

  socket.on('auth', (data) => {
    userId = data?.userId;
    if (!userId || !db.getUser(userId)) return;
    socket.join(`user:${userId}`);
    onlineUsers.set(socket.id, userId);
    socket.emit('auth:ok');
  });

  socket.on('join:conversation', (conversationId) => {
    if (!userId || !db.isMember(conversationId, userId)) return;
    socket.join(`conv:${conversationId}`);
  });

  socket.on('leave:conversation', (conversationId) => {
    socket.leave(`conv:${conversationId}`);
  });

  socket.on('message:send', (data) => {
    if (!userId) return;
    const { conversationId, content } = data || {};
    if (!conversationId || !content?.trim()) return;
    if (!db.isMember(conversationId, userId)) return;

    const message = db.insertMessage({
      conversationId,
      senderId: userId,
      content: content.trim()
    });

    io.to(`conv:${conversationId}`).emit('message:new', message);

    const memberIds = db.getMemberIds(conversationId);
    memberIds.forEach(mid => {
      io.to(`user:${mid}`).emit('conversation:updated', {
        conversationId,
        lastMessage: message.content,
        lastTime: message.createdAt
      });
    });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`bbchat 服务已启动: http://localhost:${PORT}`);
  console.log(`打开浏览器访问: http://localhost:${PORT}/index.html`);
});
