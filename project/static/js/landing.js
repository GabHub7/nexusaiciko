// NexusAI – Landing Page JS

function openModal(type) {
  document.getElementById('modalOverlay').classList.add('active');
  document.getElementById('loginModal').classList.remove('active');
  document.getElementById('registerModal').classList.remove('active');
  if (type === 'login') document.getElementById('loginModal').classList.add('active');
  if (type === 'register') document.getElementById('registerModal').classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  document.getElementById('loginModal').classList.remove('active');
  document.getElementById('registerModal').classList.remove('active');
}

function togglePw(id, btn) {
  const input = document.getElementById(id);
  if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
  else { input.type = 'password'; btn.textContent = '👁'; }
}

// Password strength
document.addEventListener('DOMContentLoaded', () => {
  const pwInput = document.getElementById('regPassword');
  const bar = document.getElementById('pwStrength');
  if (pwInput) {
    pwInput.addEventListener('input', () => {
      const v = pwInput.value;
      let strength = 0;
      if (v.length >= 6) strength++;
      if (/[A-Z]/.test(v)) strength++;
      if (/[0-9]/.test(v)) strength++;
      if (/[^A-Za-z0-9]/.test(v)) strength++;
      const colors = ['#ff4757','#ffa502','#2ed573','#00e5ff'];
      const widths = ['25%','50%','75%','100%'];
      bar.style.background = v.length ? colors[strength-1] || '#ff4757' : 'var(--border)';
      bar.style.width = v.length ? widths[strength-1] || '25%' : '100%';
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter' && document.getElementById('loginModal').classList.contains('active')) doLogin();
    if (e.key === 'Enter' && document.getElementById('registerModal').classList.contains('active')) doRegister();
  });
});

async function doLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btnText = document.getElementById('loginBtnText');
  errEl.style.display = 'none';

  if (!username || !password) {
    errEl.textContent = 'Isi semua field terlebih dahulu';
    errEl.style.display = 'block';
    return;
  }
  btnText.textContent = 'Masuk...';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      btnText.textContent = '✓ Berhasil!';
      setTimeout(() => window.location.href = '/chat', 500);
    } else {
      errEl.textContent = data.error || 'Login gagal';
      errEl.style.display = 'block';
      btnText.textContent = 'Masuk';
    }
  } catch {
    errEl.textContent = 'Terjadi kesalahan. Coba lagi.';
    errEl.style.display = 'block';
    btnText.textContent = 'Masuk';
  }
}

async function doRegister() {
  const username = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const errEl = document.getElementById('registerError');
  const btnText = document.getElementById('regBtnText');
  errEl.style.display = 'none';

  if (!username || !email || !password) {
    errEl.textContent = 'Isi semua field terlebih dahulu';
    errEl.style.display = 'block';
    return;
  }
  btnText.textContent = 'Mendaftar...';
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (data.success) {
      btnText.textContent = '✓ Berhasil!';
      setTimeout(() => window.location.href = '/chat', 500);
    } else {
      errEl.textContent = data.error || 'Registrasi gagal';
      errEl.style.display = 'block';
      btnText.textContent = 'Buat Akun';
    }
  } catch {
    errEl.textContent = 'Terjadi kesalahan. Coba lagi.';
    errEl.style.display = 'block';
    btnText.textContent = 'Buat Akun';
  }
}
