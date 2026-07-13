/* ============================================================
   备忘录 App — 核心逻辑
   ============================================================ */

// ── 数据层 ──────────────────────────────────────────────────
const STORAGE_KEY = 'beiwang_memos';

/** @returns {Record<string, Array<{id, title, desc, time, completed, createdAt}>>} */
function loadMemos() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch { return {}; }
}

function saveMemos(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getDateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getMemosForDate(dateKey) {
  const all = loadMemos();
  return (all[dateKey] || []).sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1; // 未完成在前
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return b.createdAt - a.createdAt;
  });
}

function saveMemo(dateKey, memo) {
  const all = loadMemos();
  if (!all[dateKey]) all[dateKey] = [];
  all[dateKey].push(memo);
  if (memo.time && memo.time !== '') {
    scheduleNotification(memo, dateKey);
  }
  saveMemos(all);
}

function updateMemo(dateKey, memoId, updates) {
  const all = loadMemos();
  const list = all[dateKey] || [];
  const idx = list.findIndex(m => m.id === memoId);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...updates };
    saveMemos(all);
  }
}

function deleteMemo(dateKey, memoId) {
  const all = loadMemos();
  if (all[dateKey]) {
    all[dateKey] = all[dateKey].filter(m => m.id !== memoId);
    if (all[dateKey].length === 0) delete all[dateKey];
    saveMemos(all);
  }
}

function toggleMemo(dateKey, memoId) {
  const all = loadMemos();
  const list = all[dateKey] || [];
  const idx = list.findIndex(m => m.id === memoId);
  if (idx !== -1) {
    list[idx].completed = !list[idx].completed;
    saveMemos(all);
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── 状态 ────────────────────────────────────────────────────
let currentDateKey = getDateKey(new Date());
let editingMemoId = null;

// ── DOM 引用 ────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const mainPage = $('#main-page');
const memoList = $('#memo-list');
const emptyState = $('#empty-state');
const quickAddInput = $('#quick-add-input');
const quickAddBtn = $('#quick-add-btn');
const sectionTitle = $('#section-title');
const sectionHeader = $('.section-header');
const statPending = $('#stat-pending');
const statDone = $('#stat-done');
const progressFill = $('#progress-fill');
const datePicker = $('#date-picker');
const datePickerBtn = $('#date-picker-btn');
const headerDate = $('#header-date');
const todayLabel = $('.today-label');
const todayDateLabel = $('#today-date');
const tabBar = $('#tab-bar');

// 日历弹窗
const calendarModal = $('#calendar-modal');
const calendarGrid = $('#calendar-grid');
const calMonthLabel = $('#cal-month-label');
let calendarDisplayDate = new Date();

// 编辑弹窗
const editModal = $('#edit-modal');
const editTitle = $('#edit-title');
const editMemoTitle = $('#edit-memo-title');
const editMemoDesc = $('#edit-memo-desc');
const editMemoDate = $('#edit-memo-date');
const editMemoTime = $('#edit-memo-time');
const editSave = $('#edit-save');
const editDelete = $('#edit-delete');

// ── 渲染 ────────────────────────────────────────────────────
function renderAll() {
  renderMemoList();
  renderTodayStats();
  updateDateDisplay();
}

function renderMemoList() {
  const memos = getMemosForDate(currentDateKey);

  if (memos.length === 0) {
    memoList.innerHTML = '';
    emptyState.classList.add('show');
  } else {
    emptyState.classList.remove('show');
    memoList.innerHTML = memos.map(m => `
      <div class="memo-item ${m.completed ? 'completed' : ''}" data-id="${m.id}">
        <div class="memo-check" data-action="toggle" data-id="${m.id}"></div>
        <div class="memo-body" data-action="edit" data-id="${m.id}">
          <div class="memo-title">${escapeHtml(m.title)}</div>
          ${m.desc ? `<div class="memo-desc">${escapeHtml(m.desc)}</div>` : ''}
          <div class="memo-meta">
            ${m.time ? `<span class="memo-time-badge">⏰ ${m.time}</span>` : ''}
            <span>${formatTimeAgo(m.createdAt)}</span>
          </div>
        </div>
        <span class="memo-chevron">›</span>
      </div>
    `).join('');
  }

  updateSectionTitle();
}

function updateDateDisplay() {
  const d = parseDateKey(currentDateKey);

  // Header date
  headerDate.textContent = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;

  // Section title
  const today = getDateKey(new Date());
  if (currentDateKey === today) {
    sectionTitle.textContent = '今日备忘录';
    todayLabel.textContent = '今天';
  } else {
    sectionTitle.textContent = `${d.getMonth()+1}月${d.getDate()}日 备忘录`;
  }

  // Today date label
  const now = new Date();
  const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
  todayDateLabel.textContent = `${now.getMonth()+1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
}

function updateSectionTitle() {
  const d = parseDateKey(currentDateKey);
  const today = getDateKey(new Date());
  if (currentDateKey === today) {
    sectionTitle.textContent = '今日备忘录';
  } else {
    sectionTitle.textContent = `${d.getMonth()+1}月${d.getDate()}日 备忘录`;
  }
}

function renderTodayStats() {
  const today = getDateKey(new Date());
  const memos = getMemosForDate(today);
  const pending = memos.filter(m => !m.completed).length;
  const done = memos.filter(m => m.completed).length;
  const total = memos.length;

  // 数字弹跳动画
  animateStat(statPending, `${pending} 待办`);
  animateStat(statDone, `${done} 已完成`);

  if (total > 0) {
    const pct = Math.round((done / total) * 100);
    progressFill.style.width = `${pct}%`;
    if (pct === 100) {
      progressFill.classList.add('full');
      setTimeout(() => progressFill.classList.remove('full'), 600);
    }
  } else {
    progressFill.style.width = '0%';
  }
}

function animateStat(el, text) {
  if (el.textContent === text) return;
  el.textContent = text;
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = 'statPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
}

// ── 操作 ────────────────────────────────────────────────────

function addMemo(title, desc, dateKey, time) {
  const memo = {
    id: generateId(),
    title: title.trim(),
    desc: (desc || '').trim(),
    time: time || '',
    completed: false,
    createdAt: Date.now(),
  };
  saveMemo(dateKey, memo);
  if (dateKey === currentDateKey) {
    renderAll();
  } else {
    // 只是更新日历标记
    renderAll();
  }
  // 切换到对应日期
  if (dateKey !== currentDateKey) {
    currentDateKey = dateKey;
    renderAll();
  }
}

function handleToggleMemo(dateKey, memoId) {
  toggleMemo(dateKey, memoId);
  renderAll();
}

function handleEditMemo(memoId) {
  const memos = getMemosForDate(currentDateKey);
  const memo = memos.find(m => m.id === memoId);
  if (!memo) return;

  editingMemoId = memoId;
  editTitle.textContent = '编辑备忘录';
  editMemoTitle.value = memo.title;
  editMemoDesc.value = memo.desc || '';
  editMemoDate.value = currentDateKey;
  editMemoTime.value = memo.time || '';
  editDelete.style.display = 'block';

  showModal(editModal);
}

function handleSaveEdit() {
  const title = editMemoTitle.value.trim();
  if (!title) {
    shakeElement(editMemoTitle);
    return;
  }

  const desc = editMemoDesc.value.trim();
  const dateKey = editMemoDate.value || currentDateKey;
  const time = editMemoTime.value;
  const oldDateKey = currentDateKey;

  if (editingMemoId) {
    // 编辑已有
    if (dateKey !== oldDateKey) {
      // 日期变了，需要移动
      const memos = getMemosForDate(oldDateKey);
      const memo = memos.find(m => m.id === editingMemoId);
      if (memo) {
        memo.title = title;
        memo.desc = desc;
        memo.time = time;
        deleteMemo(oldDateKey, editingMemoId);
        saveMemo(dateKey, memo);
      }
    } else {
      updateMemo(dateKey, editingMemoId, { title, desc, time });
    }
  } else {
    // 新建
    addMemo(title, desc, dateKey, time);
  }

  hideModal(editModal);
  editingMemoId = null;
  currentDateKey = dateKey;
  renderAll();
}

function handleDeleteMemo() {
  if (!editingMemoId) return;

  if (confirm('确定要删除这条备忘录吗？')) {
    deleteMemo(currentDateKey, editingMemoId);
    hideModal(editModal);
    editingMemoId = null;
    renderAll();
  }
}

function handleQuickAdd() {
  const title = quickAddInput.value.trim();
  if (!title) return;

  const today = getDateKey(new Date());
  addMemo(title, '', today, '');
  quickAddInput.value = '';
  quickAddInput.focus();

  // 按钮脉冲动画
  quickAddBtn.classList.add('pulse');
  setTimeout(() => quickAddBtn.classList.remove('pulse'), 500);

  // 如果当前不在今天，切换到今天
  if (currentDateKey !== today) {
    currentDateKey = today;
  }
  renderAll();
}

// ── 日历 ────────────────────────────────────────────────────

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay(); // 0=周日
}

function renderCalendar() {
  const year = calendarDisplayDate.getFullYear();
  const month = calendarDisplayDate.getMonth();

  calMonthLabel.textContent = `${year}年${month + 1}月`;

  const allMemos = loadMemos();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = getDateKey(new Date());

  let html = '';
  const weekdays = ['日','一','二','三','四','五','六'];
  weekdays.forEach(d => {
    html += `<div class="cal-weekday">${d}</div>`;
  });

  // 填充空白
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="cal-day other-month"></div>';
  }

  // 日期
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const hasMemo = allMemos[dateKey] && allMemos[dateKey].length > 0;
    const isToday = dateKey === today;
    const isSelected = dateKey === currentDateKey;

    let cls = 'cal-day';
    if (isToday) cls += ' today';
    if (isSelected) cls += ' selected';
    if (hasMemo) cls += ' has-memo';

    html += `<div class="${cls}" data-date="${dateKey}">${day}</div>`;
  }

  // 补满最后一行
  const totalCells = firstDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 0; i < remaining; i++) {
    html += '<div class="cal-day other-month"></div>';
  }

  calendarGrid.innerHTML = html;
}

function handleCalendarDayClick(dateKey) {
  currentDateKey = dateKey;
  renderAll();
  hideModal(calendarModal);
}

// ── 弹窗 ────────────────────────────────────────────────────

function showModal(modal) {
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function hideModal(modal) {
  modal.classList.remove('show');
  document.body.style.overflow = '';
}

function showEditModal(isNew = true) {
  editingMemoId = null;
  editTitle.textContent = '新建备忘录';
  editMemoTitle.value = '';
  editMemoDesc.value = '';
  editMemoDate.value = currentDateKey;
  editMemoTime.value = '';
  editDelete.style.display = 'none';
  showModal(editModal);
  setTimeout(() => editMemoTitle.focus(), 300);
}

function showCalendarModal() {
  calendarDisplayDate = parseDateKey(currentDateKey);
  renderCalendar();
  showModal(calendarModal);
}

// ── 工具函数 ────────────────────────────────────────────────

function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()}`;
}

function shakeElement(el) {
  el.style.borderColor = 'var(--red)';
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = 'shake 0.4s ease';
  setTimeout(() => {
    el.style.borderColor = '';
    el.style.animation = '';
  }, 400);
}

// 添加 shake 动画
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-6px); }
    40% { transform: translateX(6px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }
`;
document.head.appendChild(shakeStyle);

// ── 通知 ────────────────────────────────────────────────────

function scheduleNotification(memo, dateKey) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  if (!memo.time) return;

  const [h, m] = memo.time.split(':').map(Number);
  const target = parseDateKey(dateKey);
  target.setHours(h, m, 0, 0);

  const delay = target.getTime() - Date.now();
  if (delay <= 0 || delay > 86400000 * 30) return;

  setTimeout(() => {
    new Notification('📝 备忘录提醒', {
      body: memo.title,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📝</text></svg>',
      tag: memo.id,
      requireInteraction: true,
    });
  }, delay);
}

function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        // 重新调度所有未来的提醒
        rescheduleAllNotifications();
      }
    });
  }
}

function rescheduleAllNotifications() {
  const all = loadMemos();
  for (const [dateKey, memos] of Object.entries(all)) {
    for (const memo of memos) {
      if (!memo.completed && memo.time) {
        scheduleNotification(memo, dateKey);
      }
    }
  }
}

// ── 导出到系统日历（锁屏显示） ──────────────────────────────

function exportToCalendar() {
  const today = getDateKey(new Date());
  const memos = getMemosForDate(today).filter(m => !m.completed);

  if (memos.length === 0) {
    const btn = $('#export-cal-btn');
    btn.textContent = '📭 今天没有待办任务';
    btn.classList.add('success');
    setTimeout(() => {
      btn.textContent = '🔔 添加到锁屏';
      btn.classList.remove('success');
    }, 2000);
    return;
  }

  // 生成 ICS 日历文件
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dtStamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const dtDate = today.replace(/-/g, '');

  let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//备忘录//CN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:今日备忘录\r\nX-WR-TIMEZONE:Asia/Shanghai\r\n';

  memos.forEach((m, i) => {
    // 开始时间：有具体时间则用，否则默认早9点
    const startH = m.time ? m.time.split(':')[0] : '09';
    const startM = m.time ? m.time.split(':')[1] : '00';
    // 结束时间：开始时间 + 1小时
    const endH = String((parseInt(startH) + 1) % 24).padStart(2, '0');
    const dtStart = `${dtDate}T${startH}${startM}00`;
    const dtEnd = `${dtDate}T${endH}${startM}00`;
    const uid = `${m.id}@beiwang`;

    const safeTitle = m.title
      .replace(/\\/g, '\\\\')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;')
      .replace(/\n/g, '\\n');

    ics += 'BEGIN:VEVENT\r\n';
    ics += `UID:${uid}\r\n`;
    ics += `DTSTAMP:${dtStamp}\r\n`;
    ics += `DTSTART:${dtStart}\r\n`;
    ics += `DTEND:${dtEnd}\r\n`;
    ics += `SUMMARY:📝 ${safeTitle}\r\n`;
    if (m.desc) {
      const safeDesc = m.desc
        .replace(/\\/g, '\\\\')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;')
        .replace(/\n/g, '\\n');
      ics += `DESCRIPTION:${safeDesc}\r\n`;
    }
    ics += 'BEGIN:VALARM\r\nTRIGGER:-PT30M\r\nACTION:DISPLAY\r\n';
    ics += `DESCRIPTION:📝 ${safeTitle}\r\n`;
    ics += 'END:VALARM\r\n';
    ics += 'END:VEVENT\r\n';
  });

  ics += 'END:VCALENDAR\r\n';

  // iOS 上用 data URI 更可靠
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  if (isIOS) {
    // iOS: 直接导航到 data URI，Safari 会弹出日历导入
    const reader = new FileReader();
    reader.onload = function() {
      window.location.href = reader.result;
    };
    reader.readAsDataURL(blob);
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = `备忘录_${today}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 按钮反馈
  const btn = $('#export-cal-btn');
  btn.textContent = '✅ 已导出！在弹窗中点「添加」';
  btn.classList.add('success');
  setTimeout(() => {
    btn.textContent = '🔔 添加到锁屏';
    btn.classList.remove('success');
  }, 3000);

  // 提示下一步
  if (memos.length === 1) {
    alert('✅ 已导出 1 条任务！\n\n📱 下一步：在弹出的日历窗口中点击「添加」，任务就会出现在锁屏上。\n\n💡 以后每次改了任务，重新点一下「添加到锁屏」即可更新。');
  } else {
    alert(`✅ 已导出 ${memos.length} 条任务！\n\n📱 下一步：在弹出的日历窗口中点击「添加全部」，任务就会出现在锁屏上。\n\n💡 以后每次改了任务，重新点一下「添加到锁屏」即可更新。`);
  }
}

// ── 事件绑定 ────────────────────────────────────────────────

// 备忘录列表点击（事件委托）
memoList.addEventListener('click', (e) => {
  const item = e.target.closest('.memo-item');
  if (!item) return;

  const memoId = item.dataset.id;
  const action = e.target.closest('[data-action]')?.dataset?.action;

  if (action === 'toggle') {
    handleToggleMemo(currentDateKey, memoId);
  } else if (action === 'edit' || !action) {
    handleEditMemo(memoId);
  }
});

// 快速添加
quickAddBtn.addEventListener('click', handleQuickAdd);
quickAddInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    handleQuickAdd();
  }
});

// 导出到日历锁屏
$('#export-cal-btn').addEventListener('click', exportToCalendar);

// 日期选择按钮 → 打开日历
datePickerBtn.addEventListener('click', showCalendarModal);

// 左滑 or 右滑切换日期（简单实现：点击日历选择）

// 编辑弹窗
editSave.addEventListener('click', handleSaveEdit);
editDelete.addEventListener('click', handleDeleteMemo);

// 关闭弹窗
$$('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    hideModal(calendarModal);
    hideModal(editModal);
    editingMemoId = null;
  });
});

// 点击弹窗外部关闭
[calendarModal, editModal].forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      hideModal(modal);
      editingMemoId = null;
    }
  });
});

// 编辑弹窗 Enter 保存
editMemoTitle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSaveEdit();
  }
});

// 日历弹窗
calendarGrid.addEventListener('click', (e) => {
  const day = e.target.closest('.cal-day');
  if (!day || !day.dataset.date) return;
  handleCalendarDayClick(day.dataset.date);
});

$('#cal-prev').addEventListener('click', () => {
  calendarDisplayDate.setMonth(calendarDisplayDate.getMonth() - 1);
  renderCalendar();
});

$('#cal-next').addEventListener('click', () => {
  calendarDisplayDate.setMonth(calendarDisplayDate.getMonth() + 1);
  renderCalendar();
});

$('#btn-today').addEventListener('click', () => {
  currentDateKey = getDateKey(new Date());
  renderAll();
  hideModal(calendarModal);
});

// Tab 切换
tabBar.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;

  // 更新激活状态
  $$('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const tab = btn.dataset.tab;

  if (tab === 'today') {
    currentDateKey = getDateKey(new Date());
    renderAll();
  } else if (tab === 'calendar') {
    showCalendarModal();
    // 恢复激活状态到"今天"
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    tabBar.querySelector('[data-tab="today"]').classList.add('active');
  }
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
  // Escape 关闭弹窗
  if (e.key === 'Escape') {
    if (calendarModal.classList.contains('show')) {
      hideModal(calendarModal);
    }
    if (editModal.classList.contains('show')) {
      hideModal(editModal);
      editingMemoId = null;
    }
  }
  // Cmd+N / Ctrl+N 新建
  if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
    e.preventDefault();
    showEditModal(true);
  }
});

// ── 初始化 ──────────────────────────────────────────────────

function init() {
  currentDateKey = getDateKey(new Date());
  renderAll();

  // 请求通知权限（延迟一点，避免页面加载时弹出）
  setTimeout(requestNotificationPermission, 2000);

  // 注册 Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  console.log('📝 备忘录已就绪');
  console.log('  ⌘+N / Ctrl+N  新建备忘录');
  console.log('  点击 📅 选择日期');
}

document.addEventListener('DOMContentLoaded', init);
