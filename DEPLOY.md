# bbchat 部署指南（Vercel + Supabase）

本指南将 bbchat 部署到 Vercel，并使用 Supabase 作为云端数据库，实现多端数据同步。

---

## 架构说明

| 组件 | 作用 |
|------|------|
| **Vercel** | 托管静态前端 + Serverless API |
| **Supabase** | PostgreSQL 数据库 + Realtime 实时消息 |
| **admin.html** | 云端管理后台（用户/会话/消息） |

> 本地 `server/` 文件夹仅用于本地开发，**部署到 Vercel 时不需要运行 start.bat**。

---

## 第一步：创建 Supabase 项目

1. 打开 [https://supabase.com](https://supabase.com) 并注册账号
2. 点击 **New Project**，创建项目（记住数据库密码）
3. 等待项目初始化完成

### 执行数据库脚本

1. 进入 Supabase Dashboard → **SQL Editor**
2. 点击 **New query**
3. 复制项目 `supabase/schema.sql` 的全部内容，粘贴并 **Run**
4. 进入 **Database → Publications → supabase_realtime**
5. 确认 `messages` 和 `conversations` 表已加入 Realtime（若没有，手动添加）

### 获取 API 密钥

进入 **Project Settings → API**，记录：

- **Project URL** → `SUPABASE_URL`
- **anon public** → `SUPABASE_ANON_KEY`
- **service_role**（保密）→ `SUPABASE_SERVICE_ROLE_KEY`

---

## 第二步：推送代码到 GitHub

1. 在 GitHub 创建新仓库（如 `bbchat`）
2. 在项目根目录打开终端，执行：

```bash
git init
git add .
git commit -m "bbchat: Vercel + Supabase 云端版"
git branch -M main
git remote add origin https://github.com/你的用户名/bbchat.git
git push -u origin main
```

> 注意：`.gitignore` 已排除 `node_modules` 和 `.env`，请勿提交密钥。

---

## 第三步：在 Vercel 部署

1. 打开 [https://vercel.com](https://vercel.com) 并登录
2. 点击 **Add New → Project**
3. 选择 **Import Git Repository**，选中你的 `bbchat` 仓库
4. 配置项目：
   - **Framework Preset**: Other
   - **Root Directory**: `./`（默认）
   - **Build Command**: 留空
   - **Output Directory**: 留空
5. 展开 **Environment Variables**，添加以下变量：

| 变量名 | 值 |
|--------|-----|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `ADMIN_PASSWORD` | 你的管理后台密码（请设强密码） |

6. 点击 **Deploy**，等待部署完成
7. 部署成功后获得域名，如：`https://bbchat-xxx.vercel.app`

---

## 第四步：验证部署

### 主应用
- 打开 `https://你的域名.vercel.app/index.html`
- 演示账号：`demo` / `123456`
- 注册新账号测试邮箱验证码
- 开两个浏览器标签页测试实时聊天

### 管理后台
- 打开 `https://你的域名.vercel.app/admin.html`
- 使用你在 Vercel 环境变量中设置的 `ADMIN_PASSWORD` 登录
- 可查看/删除用户、会话、消息

---

## 第五步（可选）：配置真实邮件

默认情况下，验证码会显示在：
- 注册/绑定页面的「开发模式验证码」提示
- Vercel 函数日志（Dashboard → Project → Logs）

如需真实发送邮件，在 Vercel 环境变量中添加：

```
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=your@email.com
SMTP_PASS=your_password
SMTP_FROM=bbchat <noreply@yourdomain.com>
```

---

## 环境变量完整列表

复制 `.env.example` 作为参考：

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=
SMTP_HOST=        (可选)
SMTP_PORT=465     (可选)
SMTP_USER=        (可选)
SMTP_PASS=        (可选)
SMTP_FROM=        (可选)
```

---

## 本地开发（可选）

本地仍可使用旧版 Node 服务器：

```bash
# 方式一：本地 Node 服务器（JSON 文件存储）
双击 start.bat

# 方式二：模拟 Vercel 环境
npm install
npx vercel dev
```

使用 `vercel dev` 时，在项目根目录创建 `.env.local` 并填入 Supabase 变量。

---

## 常见问题

**Q: 部署后 API 返回 500？**  
A: 检查 Vercel 环境变量是否正确配置，尤其是 `SUPABASE_SERVICE_ROLE_KEY`。

**Q: 消息不能实时同步？**  
A: 确认 Supabase Realtime 已启用 `messages` 表，且 `SUPABASE_ANON_KEY` 已配置。

**Q: 验证码收不到？**  
A: 未配置 SMTP 时，查看页面上的「开发模式验证码」或 Vercel Logs。

**Q: 如何修改管理后台密码？**  
A: 在 Vercel Dashboard → Settings → Environment Variables 修改 `ADMIN_PASSWORD`，重新 Deploy。

---

## 项目结构（部署版）

```
bbchat/
├── api/                 # Vercel Serverless API
│   ├── lib/             # 数据库、邮件、鉴权
│   ├── admin/           # 管理后台 API
│   ├── conversations/   # 会话 API
│   └── email/           # 邮箱验证码 API
├── supabase/schema.sql  # 数据库建表脚本
├── index.html           # 登录页
├── app.html             # 主应用
├── admin.html           # 管理后台
├── vercel.json          # Vercel 配置
├── package.json           # 依赖
└── DEPLOY.md            # 本文档
```
