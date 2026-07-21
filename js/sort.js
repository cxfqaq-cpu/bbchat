/**
 * 排序工具：好友/群组按拼音首字母 A-Z，数字符号归入 # 组
 */

function getFirstChar(name) {
  if (!name || !name.trim()) return '#';
  return name.trim()[0];
}

function isDigitOrSymbol(char) {
  if (!char) return true;
  if (/[0-9]/.test(char)) return true;
  if (/[a-zA-Z\u4e00-\u9fff]/.test(char)) return false;
  return true;
}

function getPinyinFirstLetter(char) {
  if (typeof pinyinPro !== 'undefined' && pinyinPro.pinyin) {
    try {
      const py = pinyinPro.pinyin(char, { pattern: 'first', toneType: 'none' });
      if (py) return py.charAt(0).toUpperCase();
    } catch (_) { /* fallback below */ }
  }
  return getFallbackPinyinLetter(char);
}

function getFallbackPinyinLetter(char) {
  const code = char.charCodeAt(0);
  if (code >= 0x4e00 && code <= 0x9fff) {
    const ranges = [
      ['A', 0x554a], ['B', 0x556a], ['C', 0x67e5], ['D', 0x5927],
      ['E', 0x563f], ['F', 0x53d1], ['G', 0x54e5], ['H', 0x54c8],
      ['I', 0x563f], ['J', 0x51e0], ['K', 0x5580], ['L', 0x5783],
      ['M', 0x5988], ['N', 0x62ff], ['O', 0x5668], ['P', 0x556a],
      ['Q', 0x671f], ['R', 0x7136], ['S', 0x4e09], ['T', 0x4ed6],
      ['U', 0x5668], ['V', 0x5668], ['W', 0x6211], ['X', 0x897f],
      ['Y', 0x5440], ['Z', 0x5728]
    ];
    for (let i = ranges.length - 1; i >= 0; i--) {
      if (code >= ranges[i][1]) return ranges[i][0];
    }
    return 'Z';
  }
  return '#';
}

function getSortGroup(name) {
  const char = getFirstChar(name);
  if (isDigitOrSymbol(char)) return '#';
  if (/[a-zA-Z]/.test(char)) return char.toUpperCase();
  if (/[\u4e00-\u9fff]/.test(char)) return getPinyinFirstLetter(char);
  return '#';
}

function getSortKey(name) {
  return name.trim().toLowerCase();
}

function groupByLetter(items, nameField = 'name') {
  const groups = {};
  items.forEach(item => {
    const name = item[nameField] || '';
    const letter = getSortGroup(name);
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(item);
  });

  Object.keys(groups).forEach(letter => {
    groups[letter].sort((a, b) =>
      getSortKey(a[nameField]).localeCompare(getSortKey(b[nameField]), 'zh-CN')
    );
  });

  const letters = Object.keys(groups).sort((a, b) => {
    if (a === '#') return -1;
    if (b === '#') return 1;
    return a.localeCompare(b);
  });

  return { groups, letters };
}

function sortWithPin(items, options = {}) {
  const { pinnedField = 'pinned', pinnedAtField = 'pinnedAt', timeField = 'lastTime' } = options;

  const pinned = items.filter(i => i[pinnedField]);
  const unpinned = items.filter(i => !i[pinnedField]);

  pinned.sort((a, b) => (b[pinnedAtField] || 0) - (a[pinnedAtField] || 0));
  unpinned.sort((a, b) => (b[timeField] || 0) - (a[timeField] || 0));

  return [...pinned, ...unpinned];
}

function filterBySearch(items, query, fields = ['name']) {
  if (!query || !query.trim()) return items;
  const q = query.trim().toLowerCase();
  return items.filter(item =>
    fields.some(f => (item[f] || '').toLowerCase().includes(q))
  );
}
