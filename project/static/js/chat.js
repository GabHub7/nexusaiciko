// NexusAI – Chat Page JS

let currentSessionId = null;
let allSessions = [];
let isSending = false;

// ── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadUser();
  await loadSessions();
  setupMarkdown();
});

function setupMarkdown() {
  marked.setOptions({
    highlight: (code, lang) => {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
      return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true
  });
}

// ── USER ─────────────────────────────────────────────────────
async function loadUser() {
  try {
    const res = await fetch('/api/me');
    if (res.status === 401) { window.location.href = '/'; return; }
    const user = await res.json();
    document.getElementById('sidebarAvatar').textContent = user.avatar || user.username[0].toUpperCase();
    document.getElementById('sidebarUsername').textContent = user.username;
    document.getElementById('sidebarEmail').textContent = user.email;
    // settings
    document.getElementById('modelSelect').value = user.model || 'claude-sonnet-4-20250514';
    document.getElementById('systemPromptInput').value = user.system_prompt || '';
    // stats
    document.getElementById('infoUsername').textContent = user.username;
    document.getElementById('infoEmail').textContent = user.email;
    document.getElementById('infoCreated').textContent = new Date(user.created_at).toLocaleDateString('id-ID');
    document.getElementById('statCount').textContent = user.message_count;
  } catch (e) { console.error(e); }
}

// ── SESSIONS ─────────────────────────────────────────────────
async function loadSessions() {
  try {
    const res = await fetch('/api/chat/sessions');
    allSessions = await res.json();
    renderSessions(allSessions);
    // stats
    document.getElementById('statSessions').textContent = allSessions.length;
    const totalMsgs = allSessions.reduce((a,s) => a + s.message_count, 0);
    document.getElementById('statMessages').textContent = totalMsgs;
  } catch (e) { console.error(e); }
}

function renderSessions(sessions) {
  const list = document.getElementById('sessionsList');
  if (!sessions.length) {
    list.innerHTML = '<div class="sessions-loading">Belum ada sesi. Mulai chat baru!</div>';
    return;
  }
  list.innerHTML = sessions.map(s => `
    <div class="session-item ${s.id === currentSessionId ? 'active' : ''}"
         onclick="loadSession('${s.id}')" id="session-${s.id}">
      <span class="session-icon">💬</span>
      <div class="session-info">
        <div class="session-title">${escHtml(s.title)}</div>
        <div class="session-meta">${s.message_count} pesan · ${timeAgo(s.created_at)}</div>
      </div>
      <button class="session-del" onclick="deleteSession(event,'${s.id}')">✕</button>
    </div>
  `).join('');
}

function filterSessions() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const filtered = allSessions.filter(s => s.title.toLowerCase().includes(q));
  renderSessions(filtered);
}

async function newChat() {
  const res = await fetch('/api/chat/sessions', { method: 'POST' });
  const session = await res.json();
  allSessions.unshift(session);
  renderSessions(allSessions);
  await loadSession(session.id);
}

async function loadSession(sid) {
  currentSessionId = sid;
  document.getElementById('welcomeScreen').style.display = 'none';
  document.getElementById('deleteSessionBtn').style.display = 'inline-block';

  // highlight active
  document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
  const el = document.getElementById('session-' + sid);
  if (el) el.classList.add('active');

  try {
    const res = await fetch('/api/chat/sessions/' + sid);
    const data = await res.json();
    document.getElementById('chatTitle').textContent = data.title || 'Chat';
    renderMessages(data.messages || []);
    scrollToBottom();
  } catch (e) { console.error(e); }
}

async function deleteSession(e, sid) {
  e.stopPropagation();
  if (!confirm('Hapus sesi ini?')) return;
  await fetch('/api/chat/sessions/' + sid, { method: 'DELETE' });
  allSessions = allSessions.filter(s => s.id !== sid);
  if (currentSessionId === sid) {
    currentSessionId = null;
    document.getElementById('chatTitle').textContent = 'Pilih atau buat chat baru';
    document.getElementById('messagesList').innerHTML = '';
    document.getElementById('welcomeScreen').style.display = 'block';
    document.getElementById('deleteSessionBtn').style.display = 'none';
  }
  renderSessions(allSessions);
}

function deleteCurrentSession() {
  if (currentSessionId) deleteSession({ stopPropagation: ()=>{} }, currentSessionId);
}

// ── MESSAGES ─────────────────────────────────────────────────
function renderMessages(messages) {
  const list = document.getElementById('messagesList');
  list.innerHTML = messages.map(m => buildMessage(m)).join('');
  list.querySelectorAll('pre code').forEach(block => {
    hljs.highlightElement(block);
    addCopyButton(block.parentElement);
  });
}

function buildMessage(m) {
  const isUser = m.role === 'user';
  const name = isUser ? 'Kamu' : 'NexusAI';
  const avatarContent = isUser ? '👤' : '◈';
  const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'}) : '';
  const content = isUser ? `<div class="msg-bubble">${escHtml(m.content)}</div>`
    : `<div class="msg-bubble">${marked.parse(m.content)}</div>`;

  return `
    <div class="message ${m.role}">
      <div class="msg-avatar">${avatarContent}</div>
      <div class="msg-content">
        <div class="msg-header">
          <span class="msg-name">${name}</span>
          <span class="msg-time">${time}</span>
        </div>
        ${content}
      </div>
    </div>`;
}

function addCopyButton(preEl) {
  const btn = document.createElement('button');
  btn.className = 'copy-code-btn';
  btn.textContent = 'Copy';
  btn.onclick = () => {
    navigator.clipboard.writeText(preEl.querySelector('code').innerText);
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  };
  preEl.style.position = 'relative';
  preEl.appendChild(btn);
}

// ── SEND ─────────────────────────────────────────────────────
async function sendMessage() {
  if (isSending) return;
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text) return;

  if (!currentSessionId) await newChat();

  isSending = true;
  document.getElementById('sendBtn').disabled = true;
  input.value = '';
  input.style.height = 'auto';

  // Append user message immediately
  appendMessage({ role: 'user', content: text, timestamp: new Date().toISOString() });

  // Typing indicator
  const typingId = 'typing-' + Date.now();
  const list = document.getElementById('messagesList');
  list.innerHTML += `
    <div class="message assistant" id="${typingId}">
      <div class="msg-avatar">◈</div>
      <div class="msg-content">
        <div class="msg-header"><span class="msg-name">NexusAI</span></div>
        <div class="msg-bubble">
          <div class="typing-indicator"><span></span><span></span><span></span></div>
        </div>
      </div>
    </div>`;
  scrollToBottom();

  try {
    const res = await fetch('/api/chat/send', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ session_id: currentSessionId, message: text })
    });
    const data = await res.json();
    document.getElementById(typingId).remove();

    if (data.error) {
      appendMessage({ role: 'assistant', content: `❌ Error: ${data.error}`, timestamp: new Date().toISOString() });
    } else {
      appendMessage({ role: 'assistant', content: data.reply, timestamp: data.timestamp });
      // Update session title
      if (data.title) {
        document.getElementById('chatTitle').textContent = data.title;
        const sEl = document.getElementById('session-' + currentSessionId);
        if (sEl) sEl.querySelector('.session-title').textContent = data.title;
        const s = allSessions.find(x => x.id === currentSessionId);
        if (s) s.title = data.title;
      }
    }
  } catch {
    document.getElementById(typingId).remove();
    appendMessage({ role: 'assistant', content: '❌ Terjadi kesalahan koneksi. Coba lagi.', timestamp: new Date().toISOString() });
  }

  isSending = false;
  document.getElementById('sendBtn').disabled = false;
  scrollToBottom();
}

function appendMessage(m) {
  const list = document.getElementById('messagesList');
  const div = document.createElement('div');
  div.innerHTML = buildMessage(m);
  const msg = div.firstElementChild;
  list.appendChild(msg);
  msg.querySelectorAll('pre code').forEach(block => {
    hljs.highlightElement(block);
    addCopyButton(block.parentElement);
  });
  scrollToBottom();
}

function quickPrompt(text) {
  document.getElementById('messageInput').value = text;
  sendMessage();
}

// ── INPUT ─────────────────────────────────────────────────────
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

// ── UI HELPERS ────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}
function toggleUserMenu() {
  document.getElementById('userMenu').classList.toggle('open');
}
document.addEventListener('click', (e) => {
  const menu = document.getElementById('userMenu');
  if (!e.target.closest('.sidebar-footer')) menu.classList.remove('open');
});

function openPanel(name) {
  document.getElementById('panelOverlay').classList.add('active');
  document.getElementById('settingsPanel').classList.remove('open');
  document.getElementById('statsPanel').classList.remove('open');
  document.getElementById('userMenu').classList.remove('open');
  if (name === 'settings') {
    document.getElementById('settingsPanel').classList.add('open');
  } else if (name === 'stats') {
    document.getElementById('statsPanel').classList.add('open');
    loadStats();
  }
}
function closePanel() {
  document.getElementById('panelOverlay').classList.remove('active');
  document.getElementById('settingsPanel').classList.remove('open');
  document.getElementById('statsPanel').classList.remove('open');
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    document.getElementById('statSessions').textContent = data.total_sessions;
    document.getElementById('statMessages').textContent = data.total_messages;
    document.getElementById('statCount').textContent = data.message_count;
  } catch {}
}

async function saveSettings() {
  const model = document.getElementById('modelSelect').value;
  const system_prompt = document.getElementById('systemPromptInput').value;
  await fetch('/api/update-settings', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ model, system_prompt })
  });
  closePanel();
  showToast('Pengaturan disimpan!');
}

function toggleTheme() {
  const body = document.body;
  if (body.classList.contains('dark')) setTheme('light');
  else setTheme('dark');
}
function setTheme(t) {
  document.body.className = t;
  document.getElementById('themeDark').classList.toggle('active', t === 'dark');
  document.getElementById('themeLight').classList.toggle('active', t === 'light');
  fetch('/api/update-settings', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ theme: t })
  });
}

async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
}

function scrollToBottom() {
  const c = document.getElementById('messagesContainer');
  c.scrollTop = c.scrollHeight;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return Math.floor(diff/60) + ' mnt lalu';
  if (diff < 86400) return Math.floor(diff/3600) + ' jam lalu';
  return Math.floor(diff/86400) + ' hari lalu';
}

function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:24px;right:24px;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:12px 20px;border-radius:10px;font-size:.85rem;z-index:999;animation:fadeIn .2s ease;`;
  t.textContent = '✓ ' + msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
