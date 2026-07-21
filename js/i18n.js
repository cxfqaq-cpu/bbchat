/**
 * bbchat i18n — zh / en / vi
 */
const I18N = {
  zh: {
    langName: '中文',
    friends: '好友',
    chat: '聊天',
    groups: '群组',
    me: '自己',
    newFriends: '新的朋友',
    newFriendsSub: '好友申请与添加',
    newFriendsPage: '新的朋友',
    addById: '通过 ID 添加',
    pendingRequests: '待处理申请',
    noPending: '暂无新的好友申请',
    accept: '同意',
    reject: '拒绝',
    addFriend: '添加好友',
    addFriendSub: '输入对方的宝宝 ID',
    babyId: '宝宝 ID',
    cancel: '取消',
    add: '添加',
    sendRequest: '发送申请',
    requestSent: '好友申请已发送',
    searchChat: '搜索聊天记录',
    searchGroup: '搜索群组',
    logout: '退出登录',
    profile: '个人资料',
    avatar: '头像',
    nickname: '昵称',
    gender: '性别',
    email: '邮箱号',
    games: '爱玩的游戏',
    language: '语言',
    settings: '设置',
    pin: '置顶',
    unpin: '取消置顶',
    changeGroupAvatar: '修改群头像',
    send: '发送',
    inputMessage: '输入消息...',
    noFriends: '暂无好友',
    noFriendsHint: '点击上方「新的朋友」添加',
    myQr: '我的二维码',
    close: '关闭',
    save: '保存',
    edit: '编辑',
    male: '男',
    female: '女',
    unset: '未填写',
    unbound: '未绑定',
    emptyChat: '暂无聊天',
    emptyGroup: '暂无群组',
    friendAdded: '已添加好友，可以开始聊天',
    requestAccepted: '已同意，对方已加入好友列表'
  },
  en: {
    langName: 'English',
    friends: 'Friends',
    chat: 'Chats',
    groups: 'Groups',
    me: 'Me',
    newFriends: 'New Friends',
    newFriendsSub: 'Requests & add friends',
    newFriendsPage: 'New Friends',
    addById: 'Add by ID',
    pendingRequests: 'Pending requests',
    noPending: 'No new friend requests',
    accept: 'Accept',
    reject: 'Decline',
    addFriend: 'Add Friend',
    addFriendSub: 'Enter their baby ID',
    babyId: 'Baby ID',
    cancel: 'Cancel',
    add: 'Add',
    sendRequest: 'Send request',
    requestSent: 'Friend request sent',
    searchChat: 'Search chats',
    searchGroup: 'Search groups',
    logout: 'Log out',
    profile: 'Profile',
    avatar: 'Avatar',
    nickname: 'Nickname',
    gender: 'Gender',
    email: 'Email',
    games: 'Favorite games',
    language: 'Language',
    settings: 'Settings',
    pin: 'Pin',
    unpin: 'Unpin',
    changeGroupAvatar: 'Change group avatar',
    send: 'Send',
    inputMessage: 'Message...',
    noFriends: 'No friends yet',
    noFriendsHint: 'Tap New Friends above to add',
    myQr: 'My QR code',
    close: 'Close',
    save: 'Save',
    edit: 'Edit',
    male: 'Male',
    female: 'Female',
    unset: 'Not set',
    unbound: 'Not linked',
    emptyChat: 'No chats',
    emptyGroup: 'No groups',
    friendAdded: 'Friend added. You can chat now.',
    requestAccepted: 'Accepted. They are now in your friends list.'
  },
  vi: {
    langName: 'Tiếng Việt',
    friends: 'Bạn bè',
    chat: 'Trò chuyện',
    groups: 'Nhóm',
    me: 'Tôi',
    newFriends: 'Bạn mới',
    newFriendsSub: 'Lời mời & thêm bạn',
    newFriendsPage: 'Bạn mới',
    addById: 'Thêm bằng ID',
    pendingRequests: 'Lời mời chờ xử lý',
    noPending: 'Không có lời mời mới',
    accept: 'Đồng ý',
    reject: 'Từ chối',
    addFriend: 'Thêm bạn',
    addFriendSub: 'Nhập ID của họ',
    babyId: 'ID',
    cancel: 'Hủy',
    add: 'Thêm',
    sendRequest: 'Gửi lời mời',
    requestSent: 'Đã gửi lời mời kết bạn',
    searchChat: 'Tìm cuộc trò chuyện',
    searchGroup: 'Tìm nhóm',
    logout: 'Đăng xuất',
    profile: 'Hồ sơ',
    avatar: 'Ảnh đại diện',
    nickname: 'Biệt danh',
    gender: 'Giới tính',
    email: 'Email',
    games: 'Game yêu thích',
    language: 'Ngôn ngữ',
    settings: 'Cài đặt',
    pin: 'Ghim',
    unpin: 'Bỏ ghim',
    changeGroupAvatar: 'Đổi ảnh nhóm',
    send: 'Gửi',
    inputMessage: 'Nhập tin nhắn...',
    noFriends: 'Chưa có bạn',
    noFriendsHint: 'Chạm Bạn mới phía trên để thêm',
    myQr: 'Mã QR của tôi',
    close: 'Đóng',
    save: 'Lưu',
    edit: 'Sửa',
    male: 'Nam',
    female: 'Nữ',
    unset: 'Chưa đặt',
    unbound: 'Chưa liên kết',
    emptyChat: 'Chưa có trò chuyện',
    emptyGroup: 'Chưa có nhóm',
    friendAdded: 'Đã thêm bạn, có thể chat ngay',
    requestAccepted: 'Đã đồng ý, họ đã vào danh sách bạn'
  }
};

const LANG_KEY = 'bbchat_lang';

function getLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && I18N[saved]) return saved;
  return 'zh';
}

function setLang(lang) {
  if (!I18N[lang]) lang = 'zh';
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  return lang;
}

function t(key) {
  const pack = I18N[getLang()] || I18N.zh;
  return pack[key] || I18N.zh[key] || key;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.placeholder = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.title = t(key);
  });
}
