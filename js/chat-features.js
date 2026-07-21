/**
 * 聊天增强：表情 / 语音 / 定位 / 撤回 / 翻译 / 反应
 */
const CUTE_STICKERS = [
  '1f970', '1f60d', '1f61c', '1f92a', '1f633', '1f97a', '1f62d', '1f525',
  '1f496', '1f49d', '1f308', '1f338', '1f43e', '1f431', '1f436', '1f98a',
  '1f389', '1f381', '1f37a', '1f355', '2600-fe0f', '1f319', '2b50', '1f4a1'
].map(code => ({
  id: code,
  url: `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${code.replace(/-fe0f$/, '')}.png`
}));

const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '👏'];

function deviceLang() {
  const nav = (navigator.language || 'zh').toLowerCase();
  if (nav.startsWith('zh')) return 'zh-CN';
  if (nav.startsWith('vi')) return 'vi';
  if (nav.startsWith('en')) return 'en';
  return nav.slice(0, 2);
}

function stickerUrl(code) {
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${String(code).replace(/-fe0f$/, '')}.png`;
}

function mapUrl(lat, lng) {
  return `https://maps.google.com/maps?q=${lat},${lng}`;
}

function closeChatPanels() {
  ['stickerPanel', 'plusPanel', 'msgActionSheet'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function bindChatExtras() {
  const stickerPanel = document.getElementById('stickerPanel');
  if (stickerPanel && !stickerPanel.dataset.ready) {
    stickerPanel.dataset.ready = '1';
    stickerPanel.innerHTML = CUTE_STICKERS.map(s =>
      `<button type="button" class="sticker-item" data-sticker="${s.id}"><img src="${s.url}" alt=""></button>`
    ).join('');
    stickerPanel.addEventListener('click', async e => {
      const btn = e.target.closest('[data-sticker]');
      if (!btn || !activeConversation) return;
      const code = btn.dataset.sticker;
      const result = await sendMessage(activeConversation.id, '[表情]', 'sticker', { sticker: code });
      if (result.ok) {
        appendMessage(result.message);
        closeChatPanels();
        await loadConversations();
        renderChats();
      }
    });
  }

  document.getElementById('chatStickerBtn')?.addEventListener('click', () => {
    document.getElementById('plusPanel')?.classList.add('hidden');
    document.getElementById('stickerPanel')?.classList.toggle('hidden');
  });

  document.getElementById('chatPlusBtn')?.addEventListener('click', () => {
    document.getElementById('stickerPanel')?.classList.add('hidden');
    document.getElementById('plusPanel')?.classList.toggle('hidden');
  });

  document.getElementById('optSendLocation')?.addEventListener('click', () => sendLocation(false));
  document.getElementById('optShareLocation')?.addEventListener('click', () => sendLocation(true));

  // 语音：按住录音
  const voiceBtn = document.getElementById('chatVoiceBtn');
  if (voiceBtn) {
    let recorder = null;
    let chunks = [];
    let recording = false;

    const start = async (e) => {
      e.preventDefault();
      if (!activeConversation || recording) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunks = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
        recorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(chunks, { type: 'audio/webm' });
          if (blob.size < 800) return;
          if (blob.size > 350000) { alert('语音过长，请缩短'); return; }
          const reader = new FileReader();
          reader.onload = async () => {
            const result = await sendMessage(activeConversation.id, '[语音]', 'voice', {
              audio: reader.result,
              duration: Math.max(1, Math.round(blob.size / 4000))
            });
            if (result.ok) {
              appendMessage(result.message);
              await loadConversations();
              renderChats();
            }
          };
          reader.readAsDataURL(blob);
        };
        recorder.start();
        recording = true;
        voiceBtn.classList.add('recording');
        voiceBtn.textContent = '松开结束';
      } catch (_) {
        alert('无法使用麦克风');
      }
    };
    const stop = () => {
      if (!recording || !recorder) return;
      recording = false;
      voiceBtn.classList.remove('recording');
      voiceBtn.textContent = '语音';
      try { recorder.stop(); } catch (_) {}
    };
    voiceBtn.addEventListener('mousedown', start);
    voiceBtn.addEventListener('mouseup', stop);
    voiceBtn.addEventListener('mouseleave', stop);
    voiceBtn.addEventListener('touchstart', start, { passive: false });
    voiceBtn.addEventListener('touchend', stop);
  }

  document.getElementById('msgActionClose')?.addEventListener('click', () => {
    document.getElementById('msgActionSheet')?.classList.add('hidden');
  });
}

async function sendLocation(live) {
  if (!activeConversation) return;
  if (!navigator.geolocation) { alert('设备不支持定位'); return; }
  closeChatPanels();
  navigator.geolocation.getCurrentPosition(async pos => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const result = await sendMessage(
      activeConversation.id,
      live ? '[共享位置]' : '[位置]',
      live ? 'live_location' : 'location',
      { lat, lng, live: !!live, label: `${lat.toFixed(5)}, ${lng.toFixed(5)}` }
    );
    if (result.ok) {
      appendMessage(result.message);
      await loadConversations();
      renderChats();
      if (live) startLiveLocationWatch(activeConversation.id);
    }
  }, () => alert('定位失败，请允许位置权限'), { enableHighAccuracy: true, timeout: 10000 });
}

let liveWatchId = null;
function startLiveLocationWatch(conversationId) {
  if (liveWatchId != null) navigator.geolocation.clearWatch(liveWatchId);
  liveWatchId = navigator.geolocation.watchPosition(async pos => {
    if (!activeConversation || activeConversation.id !== conversationId) {
      navigator.geolocation.clearWatch(liveWatchId);
      liveWatchId = null;
      return;
    }
    // 节流：仅更新最近一条共享提示，不刷屏
  });
  setTimeout(() => {
    if (liveWatchId != null) {
      navigator.geolocation.clearWatch(liveWatchId);
      liveWatchId = null;
    }
  }, 5 * 60 * 1000);
}

function openMsgActions(msg) {
  const sheet = document.getElementById('msgActionSheet');
  if (!sheet) return;
  sheet.dataset.msgId = msg.id;
  sheet.dataset.msgContent = msg.content || '';
  sheet.dataset.msgMine = String(msg.senderId === getCurrentUserId());
  sheet.dataset.recalled = String(!!msg.recalled);
  const recallBtn = document.getElementById('actRecall');
  if (recallBtn) {
    const canRecall = msg.senderId === getCurrentUserId() && !msg.recalled && (Date.now() - msg.createdAt < 120000);
    recallBtn.classList.toggle('hidden', !canRecall);
  }
  sheet.classList.remove('hidden');
}

function bindMsgActions() {
  document.getElementById('actTranslate')?.addEventListener('click', async () => {
    const sheet = document.getElementById('msgActionSheet');
    const text = sheet?.dataset.msgContent || '';
    if (!text) return;
    const r = await translateTextApi(text, deviceLang());
    sheet.classList.add('hidden');
    if (r.ok) alert(r.translated);
    else alert(r.error || '翻译失败');
  });

  document.getElementById('actRecall')?.addEventListener('click', async () => {
    const sheet = document.getElementById('msgActionSheet');
    const id = sheet?.dataset.msgId;
    sheet.classList.add('hidden');
    if (!id) return;
    const r = await recallMessageApi(id);
    if (r.ok) {
      await openChatRoom(activeConversation.id);
    } else alert(r.error || '撤回失败');
  });

  document.getElementById('reactionRow')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-emoji]');
    if (!btn) return;
    const sheet = document.getElementById('msgActionSheet');
    const id = sheet?.dataset.msgId;
    sheet.classList.add('hidden');
    if (!id) return;
    const r = await reactMessageApi(id, btn.dataset.emoji);
    if (r.ok && activeConversation) await openChatRoom(activeConversation.id);
  });
}
