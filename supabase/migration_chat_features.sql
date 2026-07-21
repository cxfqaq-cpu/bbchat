-- bbchat 聊天增强：消息类型 / 撤回 / 表情反应
-- 请在 Supabase SQL Editor 运行

ALTER TABLE messages ADD COLUMN IF NOT EXISTS msg_type TEXT DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS recalled BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions (message_id);

-- 测试账号 1 / 1
INSERT INTO users (id, password, nickname, gender, email, email_verified, favorite_games)
VALUES ('1', '1', '测试账号', '未填写', '未绑定', FALSE, '未填写')
ON CONFLICT (id) DO UPDATE SET password = '1', nickname = EXCLUDED.nickname;
