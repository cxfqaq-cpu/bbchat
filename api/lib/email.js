const { getSupabase } = require('./supabase');

const CODE_TTL = 3 * 60 * 1000;
const RESEND_INTERVAL = 60 * 1000;

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

async function saveCode(email, purpose, userId) {
  const sb = getSupabase();
  const key = codeKey(email, purpose, userId);
  const code = generateCode();
  await sb.from('verification_codes').upsert({
    code_key: key,
    code,
    expires_at: Date.now() + CODE_TTL,
    sent_at: Date.now()
  });
  return code;
}

async function canResend(email, purpose, userId) {
  const sb = getSupabase();
  const key = codeKey(email, purpose, userId);
  const { data: row } = await sb.from('verification_codes').select('sent_at').eq('code_key', key).maybeSingle();
  if (!row) return true;
  return Date.now() - row.sent_at >= RESEND_INTERVAL;
}

async function checkCode(email, code, purpose, userId) {
  const sb = getSupabase();
  const key = codeKey(email, purpose, userId);
  const { data: row } = await sb.from('verification_codes').select('*').eq('code_key', key).maybeSingle();
  if (!row) return { ok: false, error: '请先获取验证码' };
  if (Date.now() > row.expires_at) return { ok: false, error: '验证码已过期，请重新获取' };
  if (row.code !== String(code).trim()) return { ok: false, error: '验证码错误' };
  return { ok: true, message: '验证码正确' };
}

async function verifyCode(email, code, purpose, userId) {
  const result = await checkCode(email, code, purpose, userId);
  if (!result.ok) return result;
  const sb = getSupabase();
  await sb.from('verification_codes').delete().eq('code_key', codeKey(email, purpose, userId));
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
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text
    });
    return { sent: true };
  }

  console.log(`[bbchat验证码][${purpose}] ${to} -> ${code}`);
  return { sent: false, devCode: code };
}

async function sendVerificationCode(db, email, purpose, userId) {
  const normalized = email.toLowerCase().trim();
  if (!isValidEmail(normalized)) return { ok: false, error: '邮箱格式不正确' };
  if (!(await canResend(normalized, purpose, userId))) {
    return { ok: false, error: '发送太频繁，请稍后再试' };
  }
  if (purpose === 'register') {
    if (await db.getUserByEmail(normalized)) return { ok: false, error: '该邮箱已被绑定' };
  } else if (purpose === 'bind') {
    const owner = await db.getUserByEmail(normalized);
    if (owner && owner.id !== userId) return { ok: false, error: '该邮箱已被其他账号绑定' };
  }
  const code = await saveCode(normalized, purpose, userId);
  const mailResult = await sendMail(normalized, code, purpose);
  const res = { ok: true, message: '验证码已发送，3 分钟内有效', expiresIn: CODE_TTL / 1000 };
  if (mailResult.devCode) res.devCode = mailResult.devCode;
  return res;
}

module.exports = {
  isValidEmail,
  sendVerificationCode,
  checkCode,
  verifyCode
};
