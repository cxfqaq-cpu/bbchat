-- bbchat Supabase 数据库结构
-- 在 Supabase Dashboard -> SQL Editor 中执行此脚本

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  nickname TEXT NOT NULL,
  gender TEXT DEFAULT '未填写',
  email TEXT DEFAULT '未绑定',
  email_verified BOOLEAN DEFAULT FALSE,
  favorite_games TEXT DEFAULT '未填写',
  avatar TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email)) WHERE email_verified = TRUE;

CREATE TABLE IF NOT EXISTS friendships (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('private', 'group')),
  name TEXT,
  avatar TEXT,
  creator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  last_message TEXT DEFAULT '',
  last_time BIGINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pinned BOOLEAN DEFAULT FALSE,
  pinned_at BIGINT DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS verification_codes (
  code_key TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  sent_at BIGINT NOT NULL
);

-- 请在 Supabase Dashboard -> Database -> Publications 中
-- 确认 supabase_realtime 已包含 messages 和 conversations 表

-- 演示账号（密码: 123456）
INSERT INTO users (id, password, nickname, gender, email, email_verified, favorite_games)
VALUES ('demo', '123456', '宝宝', '未填写', '未绑定', FALSE, '未填写')
ON CONFLICT (id) DO NOTHING;
