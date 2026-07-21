/**
 * 六位验证码输入框组件
 */
function initCodeBoxes(containerId) {
  const container = document.getElementById(containerId);
  if (!container || container.dataset.inited) return;
  container.dataset.inited = '1';
  container.innerHTML = Array.from({ length: 6 }, (_, i) =>
    `<input type="text" class="code-box" maxlength="1" inputmode="numeric" pattern="[0-9]" data-idx="${i}" aria-label="验证码第${i + 1}位">`
  ).join('');

  const boxes = container.querySelectorAll('.code-box');
  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '').slice(0, 1);
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !box.value && i > 0) boxes[i - 1].focus();
    });
    box.addEventListener('paste', e => {
      e.preventDefault();
      const text = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      text.split('').forEach((ch, j) => { if (boxes[j]) boxes[j].value = ch; });
      if (text.length > 0) boxes[Math.min(text.length, 5)].focus();
    });
  });
}

function getCodeValue(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return '';
  return Array.from(container.querySelectorAll('.code-box')).map(b => b.value).join('');
}

function clearCodeBoxes(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.code-box').forEach(b => { b.value = ''; });
}

function setCodeStatus(statusEl, type, message) {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.className = 'verify-status' + (type ? ' verify-' + type : '');
}

function startCodeCountdown(btn, seconds, label) {
  let left = seconds;
  btn.disabled = true;
  btn.textContent = `${left}s`;
  const timer = setInterval(() => {
    left--;
    if (left <= 0) {
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = label;
    } else {
      btn.textContent = `${left}s`;
    }
  }, 1000);
  return timer;
}
