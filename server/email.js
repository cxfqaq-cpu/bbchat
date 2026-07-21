const CODE_TTL = 3 * 60 * 1000; // 3 minutes
const RESEND_INTERVAL = 60 * 1000; // 60 seconds

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function codeKey(email, purpose, userId) {
  const e = email.toLowerCase().trim();
  if (purpose === 'bind' && userId) return `${e}:bind:${userId}`;
  return `${e}:${purpose}`;
}

function saveCode(db, email, purpose, userId) {
  if (!db.data.verificationCodes) db.data.verificationCodes = {};
  const key = codeKey(email, purpose, userId);
  const code = generateCode();
  db.data.verificationCodes[key] = {
    code,
    expiresAt: Date.now() + CODE_TTL,
    sentAt: Date.now()
  };
  db.persist();
  return code;
}

function canResend(db, email, purpose, userId) {
  if (!db.data.verificationCodes) return true;
  const key = codeKey(email, purpose, userId);
  const row = db.data.verificationCodes[key];
  if (!row) return true;
  return Date.now() - row.sentAt >= RESEND_INTERVAL;
}

function checkCode(db, email, code, purpose, userId) {
  if (!db.data.verificationCodes) return { ok: false, error: '请先获取验证码' };
  const key = codeKey(email, purpose, userId);
  const row = db.data.verificationCodes[key];
  if (!row) return { ok: false, error: '请先获取验证码' };
  if (Date.now() > row.expiresAt) return { ok: false, error: '验证码已过期，请重新获取' };
  if (row.code !== String(code).trim()) return { ok: false, error: '验证码错误' };
  return { ok: true, message: '验证码正确' };
}
function verifyCode(db, email, code, purpose, userId) {
  const result = checkCode(db, email, code, purpose, userId);
  if (!result.ok) return result;
  const key = codeKey(email, purpose, userId);
  delete db.data.verificationCodes[key];
  db.persist();
  return { ok: true };
}

async function sendMail(to, code, purpose) {
  const subject = purpose === 'register' ? 'bbchat - 注册验证码' : 'bbchat - 绑定邮箱验证码';
  const text = `您的验证码是：${code}\n\n验证码 3 分钟内有效，请勿泄露给他人。`;

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE !== 'false',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text
    });
    return { sent: true };
  }

  console.log(`[邮箱验证码][${purpose}] ${to} -> ${code} （3分钟内有效）`);
  return { sent: false, devCode: code };
}

async function sendVerificationCode(db, email, purpose, userId) {
  const normalized = email.toLowerCase().trim();
  if (!isValidEmail(normalized)) return { ok: false, error: '邮箱格式不正确' };
  if (!canResend(db, normalized, purpose, userId)) {
    return { ok: false, error: '发送太频繁，请稍后再试' };
  }

  if (purpose === 'register') {
    if (db.getUserByEmail(normalized)) {
      return { ok: false, error: '该邮箱已被绑定' };
    }
  } else if (purpose === 'bind') {
    const owner = db.getUserByEmail(normalized);
    if (owner && owner.id !== userId) {
      return { ok: false, error: '该邮箱已被其他账号绑定' };
    }
  }

  const code = saveCode(db, normalized, purpose, userId);
  const mailResult = await sendMail(normalized, code, purpose);
  const res = { ok: true, message: '验证码已发送，3 分钟内有效', expiresIn: CODE_TTL / 1000 };
  if (mailResult.devCode) res.devCode = mailResult.devCode;
  return res;
}

module.exports = {
  isValidEmail,
  sendVerificationCode,
  checkCode,
  verifyCode,
  CODE_TTL
};
