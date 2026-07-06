// ===== STATE =====
const state = {
  unit: null,
  workType: null,
  editingId: null,
  photos: [],
};

const WORK_TYPE_LABEL = { cut: 'ตัด', reconnect: 'ต่อ', remove: 'ถอนมิเตอร์', over90: 'เกิน 90 วัน' };
const BADGE_CLASS     = { cut: 'badge-cut', reconnect: 'badge-reconnect', remove: 'badge-remove', over90: 'badge-over90' };
const MARKER_COLOR    = { cut: '#dc2626', reconnect: '#16a34a', remove: '#7c3aed', over90: '#d97706' };

// ===== SUPABASE =====
let _client = null;
function db() {
  if (!_client && window.supabase && window.CONFIG.SUPABASE_URL.startsWith('http')) {
    _client = window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY);
  }
  return _client;
}

// ===== NAVIGATION =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.topbar-nav button').forEach(b => b.classList.remove('active'));
  const tabMap = { 'screen-home': 'tab-home', 'screen-menu': 'tab-home', 'screen-form': 'tab-home', 'screen-history': 'tab-history', 'screen-dashboard': 'tab-dashboard' };
  if (tabMap[id]) document.getElementById(tabMap[id]).classList.add('active');
  window.scrollTo(0, 0);
}

// ===== HOME: หน่วยงาน =====
function renderUnits() {
  const el = document.getElementById('unit-list');
  const units = (window.unitList || []).slice().sort();
  if (!units.length) {
    el.innerHTML = '<div class="empty"><span class="empty-icon">📂</span>ไม่พบรายชื่อหน่วยงาน</div>';
    return;
  }
  el.innerHTML = units.map(u => `
    <div class="unit-item" onclick="selectUnit('${u}')">
      <span>${u}</span>
      <span class="unit-arrow">›</span>
    </div>`).join('');
}

function selectUnit(u) {
  state.unit = u;
  document.getElementById('menu-unit-name').textContent = u;
  showScreen('screen-menu');
}

// ===== MENU: เลือกประเภทงาน =====
function selectWorkType(type) {
  state.workType = type;
  state.editingId = null;
  state.photos = [];
  renderForm();
  showScreen('screen-form');
}

// ===== FORM =====
function peaForUnit() {
  return (window.peaData || []).filter(p => p.unit === state.unit);
}

function renderForm() {
  document.getElementById('form-unit-name').textContent = state.unit;
  document.getElementById('form-work-label').textContent = WORK_TYPE_LABEL[state.workType];
  document.getElementById('work-form').reset();
  state.photos = [];
  renderPreviews();

  const dl = document.getElementById('pea-options');
  dl.innerHTML = peaForUnit().map(p =>
    `<option value="${p.pea}">${p.pea} — ${p.customerName}</option>`).join('');

  const showNew = state.workType === 'reconnect';
  const isOver90 = state.workType === 'over90';
  document.getElementById('row-new-fields').style.display = showNew ? '' : 'none';
  document.getElementById('field-meter-unit').style.display = isOver90 ? '' : 'none';

  document.getElementById('form-status').textContent = '';
  document.getElementById('form-status').className = 'status-msg';
}

function onPeaOldChange() {
  const val = document.getElementById('f-pea-old').value.trim();
  const match = peaForUnit().find(p => p.pea === val);
  if (match) {
    document.getElementById('f-customer').value = match.customerName || '';
    document.getElementById('f-address').value = match.address || '';
  }
}

function openEdit(item) {
  state.unit = item.unit;
  state.workType = item.work_type;
  state.editingId = item.id;
  state.photos = (item.photo_urls || []).map(url => ({ existingUrl: url }));
  renderForm();
  document.getElementById('f-pea-old').value = item.pea_old || '';
  document.getElementById('f-meter-old').value = item.meter_old || '';
  document.getElementById('f-pea-new').value = item.pea_new || '';
  document.getElementById('f-meter-new').value = item.meter_new || '';
  document.getElementById('f-meter-unit').value = item.meter_unit || '';
  document.getElementById('f-customer').value = item.customer_name || '';
  document.getElementById('f-address').value = item.address || '';
  document.getElementById('f-coords').value = item.coordinates || '';
  document.getElementById('f-note').value = item.note || '';
  renderPreviews();
  showScreen('screen-form');
}

// ===== พิกัด =====
function pickCoords() {
  if (!navigator.geolocation) { alert('อุปกรณ์นี้ไม่รองรับการดึงพิกัด'); return; }
  navigator.geolocation.getCurrentPosition(
    pos => { document.getElementById('f-coords').value = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`; },
    () => alert('ดึงพิกัดไม่สำเร็จ — เปิดอนุญาตตำแหน่งที่ตั้งก่อน')
  );
}

// ===== รูปภาพ =====
function compressImage(file, maxMB) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let quality = 0.85, scale = 1;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        function tryCompress() {
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          if ((dataUrl.length * 0.75) / 1048576 <= maxMB || (scale < 0.15 && quality <= 0.4)) { resolve(dataUrl); return; }
          quality > 0.4 ? (quality -= 0.1) : (scale *= 0.8);
          tryCompress();
        }
        tryCompress();
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function onPhotoSelected(e) {
  for (const file of Array.from(e.target.files || [])) {
    try {
      const dataUrl = await compressImage(file, window.CONFIG.MAX_PHOTO_SIZE_MB || 1);
      state.photos.push({ dataUrl, filename: file.name.replace(/\.[^.]+$/, '') + '.jpg' });
    } catch(err) { console.error('compress error', err); }
  }
  renderPreviews();
  e.target.value = '';
}

function renderPreviews() {
  const wrap = document.getElementById('photo-preview');
  wrap.innerHTML = state.photos.map((p, i) => `
    <div class="photo-thumb">
      <img src="${p.dataUrl || p.existingUrl}" alt="">
      <button type="button" class="photo-thumb-del" onclick="removePhoto(${i})">×</button>
    </div>`).join('');
}

function removePhoto(i) { state.photos.splice(i, 1); renderPreviews(); }

async function uploadPhotos() {
  const urls = [];
  for (const p of state.photos) {
    if (p.existingUrl) { urls.push(p.existingUrl); continue; }
    if (!window.CONFIG.GAS_UPLOAD_URL.startsWith('http')) continue;
    try {
      const res = await fetch(window.CONFIG.GAS_UPLOAD_URL, {
        method: 'POST', body: JSON.stringify({ image: p.dataUrl, filename: p.filename }),
      });
      const json = await res.json();
      if (json.success) urls.push(json.url);
    } catch(e) { console.error('upload error', e); }
  }
  return urls;
}

// ===== SUBMIT =====
async function submitForm(e) {
  e.preventDefault();
  const statusEl = document.getElementById('form-status');
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  statusEl.textContent = 'กำลังบันทึก...';
  statusEl.className = 'status-msg';
  try {
    const photoUrls = await uploadPhotos();
    const payload = {
      work_type:     state.workType,
      unit:          state.unit,
      pea_old:       document.getElementById('f-pea-old').value.trim(),
      meter_old:     document.getElementById('f-meter-old').value.trim(),
      pea_new:       document.getElementById('f-pea-new').value.trim(),
      meter_new:     document.getElementById('f-meter-new').value.trim(),
      meter_unit:    document.getElementById('f-meter-unit').value.trim(),
      customer_name: document.getElementById('f-customer').value.trim(),
      address:       document.getElementById('f-address').value.trim(),
      coordinates:   document.getElementById('f-coords').value.trim(),
      note:          document.getElementById('f-note').value.trim(),
      photo_urls:    photoUrls,
    };
    const client = db();
    if (!client) throw new Error('ยังไม่ได้ตั้งค่า Supabase ใน js/config.js');
    const { error } = state.editingId
      ? await client.from('submissions').update(payload).eq('id', state.editingId)
      : await client.from('submissions').insert(payload);
    if (error) throw error;
    statusEl.textContent = 'บันทึกสำเร็จ ✓';
    statusEl.className = 'status-msg ok';
    setTimeout(() => { state.unit ? (document.getElementById('menu-unit-name').textContent = state.unit, showScreen('screen-menu')) : showScreen('screen-home'); }, 800);
  } catch(err) {
    statusEl.textContent = err.message || 'เกิดข้อผิดพลาด';
    statusEl.className = 'status-msg err';
  } finally { btn.disabled = false; }
}

// ===== HISTORY =====
async function loadHistory() {
  const el = document.getElementById('history-list');
  el.innerHTML = '<div class="empty">กำลังโหลด...</div>';
  const client = db();
  if (!client) { el.innerHTML = '<div class="empty">ยังไม่ได้ตั้งค่า Supabase</div>'; return; }
  const { data, error } = await client.from('submissions').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) { el.innerHTML = `<div class="empty">โหลดไม่สำเร็จ: ${error.message}</div>`; return; }
  if (!data.length) { el.innerHTML = '<div class="empty"><span class="empty-icon">📋</span>ยังไม่มีรายการ</div>'; return; }
  el.innerHTML = `<div class="history-table">${data.map(item => `
    <div class="history-row" onclick='openEdit(${JSON.stringify(item)})'>
      <span class="badge ${BADGE_CLASS[item.work_type] || ''}">${WORK_TYPE_LABEL[item.work_type] || item.work_type}</span>
      <div>
        <div class="pea-num">${item.pea_old || '-'} · ${item.customer_name || 'ไม่ระบุชื่อ'}</div>
        <div class="history-meta">${item.unit} · ${new Date(item.created_at).toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
      </div>
      <span class="history-arrow">›</span>
    </div>`).join('')}</div>`;
}

// ===== DASHBOARD =====
async function loadDashboard() {
  const submEl = document.getElementById('dash-submitted');
  const cic0El = document.getElementById('dash-cic0');

  // --- ยอดจาก cic0 (static data.js) ---
  const totalCic0 = (window.peaData || []).length;
  const cic0ByUnit = {};
  (window.peaData || []).forEach(p => { cic0ByUnit[p.unit] = (cic0ByUnit[p.unit] || 0) + 1; });
  const topUnit = Object.entries(cic0ByUnit).sort((a,b) => b[1]-a[1])[0];
  cic0El.innerHTML = `
    <div class="stat-card accent-amber">
      <div class="stat-num">${totalCic0}</div>
      <div class="stat-label">เครื่องเกิน 90 วันในรายงาน</div>
    </div>
    ${Object.entries(cic0ByUnit).sort((a,b) => b[1]-a[1]).map(([unit, cnt]) => `
      <div class="stat-card">
        <div class="stat-num">${cnt}</div>
        <div class="stat-label">${unit}</div>
      </div>`).join('')}`;

  // --- ยอดที่บันทึกแล้วจาก Supabase ---
  const client = db();
  if (!client) {
    submEl.innerHTML = '<div class="empty" style="grid-column:1/-1">ยังไม่ได้ตั้งค่า Supabase</div>';
    return;
  }
  const { data, error } = await client.from('submissions').select('work_type, unit, coordinates, pea_old, customer_name, address');
  if (error) { submEl.innerHTML = `<div class="empty" style="grid-column:1/-1">โหลดไม่สำเร็จ</div>`; return; }
  const total = data.length;
  const byType = { cut:0, reconnect:0, remove:0, over90:0 };
  data.forEach(d => { if (byType[d.work_type] !== undefined) byType[d.work_type]++; });
  submEl.innerHTML = `
    <div class="stat-card accent-blue"><div class="stat-num">${total}</div><div class="stat-label">บันทึกทั้งหมด</div></div>
    <div class="stat-card accent-red"><div class="stat-num">${byType.cut}</div><div class="stat-label">ตัด</div></div>
    <div class="stat-card accent-green"><div class="stat-num">${byType.reconnect}</div><div class="stat-label">ต่อ</div></div>
    <div class="stat-card accent-purple"><div class="stat-num">${byType.remove}</div><div class="stat-label">ถอนมิเตอร์</div></div>
    <div class="stat-card accent-amber"><div class="stat-num">${byType.over90}</div><div class="stat-label">เกิน 90 วัน</div></div>`;
  plotMapMarkers(data);
}

// ===== MAP (Safari-safe) =====
let dashMap = null, markerGroup = null;

function initMap() {
  if (dashMap) { setTimeout(() => { dashMap.invalidateSize(); }, 100); return; }
  if (typeof L === 'undefined') {
    document.getElementById('dash-map').innerHTML = '<div class="empty">โหลดแผนที่ไม่สำเร็จ</div>';
    return;
  }
  dashMap = L.map('dash-map', { center: [16.0, 102.5], zoom: 6, preferCanvas: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19, crossOrigin: true,
  }).addTo(dashMap);
  markerGroup = L.layerGroup().addTo(dashMap);
}

function plotMapMarkers(data) {
  if (!dashMap || !markerGroup) return;
  markerGroup.clearLayers();
  const bounds = [];
  data.forEach(item => {
    if (!item.coordinates) return;
    const [latStr, lngStr] = item.coordinates.split(',');
    const lat = parseFloat(latStr), lng = parseFloat(lngStr);
    if (isNaN(lat) || isNaN(lng)) return;
    const color = MARKER_COLOR[item.work_type] || '#2563eb';
    const icon = L.divIcon({
      className: '',
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="30" viewBox="0 0 22 30"><path d="M11 0C4.92 0 0 4.92 0 11c0 8.25 11 19 11 19S22 19.25 22 11C22 4.92 17.08 0 11 0z" fill="${color}" opacity="0.88"/><circle cx="11" cy="11" r="4.5" fill="white" opacity="0.95"/></svg>`,
      iconSize: [22, 30], iconAnchor: [11, 30], popupAnchor: [0, -32],
    });
    L.marker([lat, lng], { icon }).bindPopup(`
      <strong>${item.pea_old || '-'}</strong><br>
      ${item.customer_name || ''}<br>
      <span style="font-size:11px;color:#64748b">${item.unit} · ${WORK_TYPE_LABEL[item.work_type] || ''}</span>
    `).addTo(markerGroup);
    bounds.push([lat, lng]);
  });
  if (bounds.length) setTimeout(() => { dashMap.invalidateSize(); dashMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 }); }, 150);
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  renderUnits();
  const lu = window.lastUpdated;
  if (lu) document.getElementById('last-updated').textContent = `อัปเดตข้อมูล PEA ล่าสุด: ${lu}`;

  document.getElementById('tab-home').onclick      = () => showScreen('screen-home');
  document.getElementById('tab-history').onclick   = () => { showScreen('screen-history'); loadHistory(); };
  document.getElementById('tab-dashboard').onclick = () => {
    showScreen('screen-dashboard');
    setTimeout(() => { initMap(); loadDashboard(); }, 0);
  };

  document.getElementById('back-to-units').onclick = () => showScreen('screen-home');
  document.getElementById('back-to-menu').onclick  = () => showScreen('screen-menu');

  document.querySelectorAll('.work-tab').forEach(btn => {
    btn.onclick = () => selectWorkType(btn.dataset.type);
  });

  document.getElementById('f-pea-old').addEventListener('change', onPeaOldChange);
  document.getElementById('pick-coords-btn').onclick = pickCoords;
  document.getElementById('photo-input').addEventListener('change', onPhotoSelected);
  document.getElementById('work-form').addEventListener('submit', submitForm);
});
