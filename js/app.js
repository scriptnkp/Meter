// ===== ตัวแปรสถานะ =====
const state = {
  unit: null,
  workType: null,   // cut_reconnect | remove | over90
  editingId: null,
  photos: [],        // [{dataUrl, blob}]
  history: [],
};

const WORK_TYPE_LABEL = {
  cut_reconnect: "ตัด-ต่อ",
  remove: "ถอนมิเตอร์",
  over90: "เกิน 90 วัน",
};

let supabaseClient = null;
function getClient() {
  if (!supabaseClient && window.supabase && window.CONFIG.SUPABASE_URL.startsWith("http")) {
    supabaseClient = window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

// ===== นำทางระหว่างหน้าจอ =====
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelectorAll("nav.tabs button").forEach(b => b.classList.remove("active"));
  if (id === "screen-history") document.getElementById("tab-history").classList.add("active");
  if (id === "screen-dashboard") document.getElementById("tab-dashboard").classList.add("active");
  if (id === "screen-home") document.getElementById("tab-home").classList.add("active");
  window.scrollTo(0, 0);
}

// ===== หน้าแรก: เลือกหน่วยงาน =====
function renderUnits() {
  const grid = document.getElementById("unit-grid");
  grid.innerHTML = "";
  const units = (window.unitList || []).slice().sort();
  if (units.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-soft)">ไม่พบรายชื่อหน่วยงาน (ตรวจสอบไฟล์ js/data.js)</p>`;
    return;
  }
  units.forEach(u => {
    const btn = document.createElement("button");
    btn.className = "unit-card";
    btn.textContent = u;
    btn.onclick = () => {
      state.unit = u;
      showMenu();
    };
    grid.appendChild(btn);
  });
}

// ===== หน้าเลือกประเภทงาน (3 การ์ด) =====
function showMenu() {
  document.getElementById("menu-unit-name").textContent = state.unit;
  showScreen("screen-menu");
}

function selectWorkType(type) {
  state.workType = type;
  state.editingId = null;
  state.photos = [];
  showForm();
}

// ===== ฟอร์มบันทึกงาน =====
function peaListForUnit() {
  return (window.peaData || []).filter(p => p.unit === state.unit);
}

function fillPeaDatalist() {
  const dl = document.getElementById("pea-options");
  dl.innerHTML = "";
  peaListForUnit().forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.pea;
    opt.label = `${p.pea} - ${p.customerName}`;
    dl.appendChild(opt);
  });
}

function onPeaOldInput(e) {
  const val = e.target.value.trim();
  const match = peaListForUnit().find(p => p.pea === val);
  if (match) {
    document.getElementById("f-customer").value = match.customerName || "";
    document.getElementById("f-address").value = match.address || "";
  }
}

function showForm() {
  document.getElementById("form-unit-name").textContent = state.unit;
  document.getElementById("form-work-label").textContent = WORK_TYPE_LABEL[state.workType];
  document.getElementById("work-form").reset();
  state.photos = [];
  renderPhotoPreview();
  fillPeaDatalist();

  // ซ่อน/แสดงฟิลด์ตามประเภทงาน
  const showNewFields = state.workType === "cut_reconnect";
  const isOver90 = state.workType === "over90";
  document.getElementById("field-pea-new").style.display = showNewFields ? "" : "none";
  document.getElementById("field-meter-new").style.display = showNewFields ? "" : "none";
  document.getElementById("field-meter-old").style.display = "";
  document.getElementById("field-meter-unit").style.display = isOver90 ? "" : "none";

  document.getElementById("form-status").textContent = "";
  document.getElementById("form-status").className = "status-msg";
  showScreen("screen-form");
}

function openEdit(item) {
  state.unit = item.unit;
  state.workType = item.work_type;
  state.editingId = item.id;
  state.photos = (item.photo_urls || []).map(url => ({ existingUrl: url }));
  showForm();
  document.getElementById("f-pea-old").value = item.pea_old || "";
  document.getElementById("f-meter-old").value = item.meter_old || "";
  document.getElementById("f-pea-new").value = item.pea_new || "";
  document.getElementById("f-meter-new").value = item.meter_new || "";
  document.getElementById("f-meter-unit").value = item.meter_unit || "";
  document.getElementById("f-customer").value = item.customer_name || "";
  document.getElementById("f-address").value = item.address || "";
  document.getElementById("f-coords").value = item.coordinates || "";
  document.getElementById("f-note").value = item.note || "";
  renderPhotoPreview();
}

// ===== พิกัด =====
function pickCoords() {
  if (!navigator.geolocation) {
    alert("อุปกรณ์นี้ไม่รองรับการดึงพิกัด กรุณากรอกเอง");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      document.getElementById("f-coords").value = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
    },
    () => alert("ดึงพิกัดไม่สำเร็จ กรุณากรอกเอง หรือเปิดอนุญาตตำแหน่งที่ตั้ง")
  );
}

// ===== รูปภาพ: บีบอัดให้ไม่เกิน 1MB ก่อนแสดงตัวอย่าง =====
function compressImage(file, maxMB) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        let quality = 0.85;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        function draw(scale) {
          canvas.width = width * scale;
          canvas.height = height * scale;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }

        function tryCompress(scale) {
          draw(scale);
          let dataUrl = canvas.toDataURL("image/jpeg", quality);
          const sizeMB = (dataUrl.length * 0.75) / (1024 * 1024);
          if (sizeMB <= maxMB || (scale < 0.15 && quality <= 0.4)) {
            resolve(dataUrl);
            return;
          }
          if (quality > 0.4) {
            quality -= 0.1;
          } else {
            scale *= 0.8;
          }
          tryCompress(scale);
        }
        tryCompress(1);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function onPhotoSelected(e) {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    try {
      const dataUrl = await compressImage(file, window.CONFIG.MAX_PHOTO_SIZE_MB || 1);
      state.photos.push({ dataUrl, filename: file.name.replace(/\.[^.]+$/, "") + ".jpg" });
    } catch (err) {
      console.error("บีบอัดรูปไม่สำเร็จ", err);
    }
  }
  renderPhotoPreview();
  e.target.value = "";
}

function renderPhotoPreview() {
  const wrap = document.getElementById("photo-preview");
  wrap.innerHTML = "";
  state.photos.forEach((p, idx) => {
    const div = document.createElement("div");
    div.className = "thumb";
    const img = document.createElement("img");
    img.src = p.dataUrl || p.existingUrl;
    const btn = document.createElement("button");
    btn.textContent = "×";
    btn.type = "button";
    btn.onclick = () => { state.photos.splice(idx, 1); renderPhotoPreview(); };
    div.appendChild(img);
    div.appendChild(btn);
    wrap.appendChild(div);
  });
}

async function uploadPhotos() {
  const urls = [];
  for (const p of state.photos) {
    if (p.existingUrl) { urls.push(p.existingUrl); continue; }
    if (!window.CONFIG.GAS_UPLOAD_URL.startsWith("http")) continue; // ยังไม่ตั้งค่า ข้ามไป
    const res = await fetch(window.CONFIG.GAS_UPLOAD_URL, {
      method: "POST",
      body: JSON.stringify({ image: p.dataUrl, filename: p.filename }),
    });
    const json = await res.json();
    if (json.success) urls.push(json.url);
  }
  return urls;
}

// ===== บันทึกฟอร์ม =====
async function submitForm(e) {
  e.preventDefault();
  const statusEl = document.getElementById("form-status");
  const btn = document.getElementById("submit-btn");
  btn.disabled = true;
  statusEl.textContent = "กำลังอัปโหลดรูปและบันทึกข้อมูล...";
  statusEl.className = "status-msg";

  try {
    const photoUrls = await uploadPhotos();

    const payload = {
      work_type: state.workType,
      unit: state.unit,
      pea_old: document.getElementById("f-pea-old").value.trim(),
      meter_old: document.getElementById("f-meter-old").value.trim(),
      pea_new: document.getElementById("f-pea-new").value.trim(),
      meter_new: document.getElementById("f-meter-new").value.trim(),
      meter_unit: document.getElementById("f-meter-unit").value.trim(),
      customer_name: document.getElementById("f-customer").value.trim(),
      address: document.getElementById("f-address").value.trim(),
      coordinates: document.getElementById("f-coords").value.trim(),
      note: document.getElementById("f-note").value.trim(),
      photo_urls: photoUrls,
    };

    const client = getClient();
    if (!client) {
      statusEl.textContent = "ยังไม่ได้ตั้งค่า Supabase ใน js/config.js";
      statusEl.className = "status-msg err";
      btn.disabled = false;
      return;
    }

    let error;
    if (state.editingId) {
      ({ error } = await client.from("submissions").update(payload).eq("id", state.editingId));
    } else {
      ({ error } = await client.from("submissions").insert(payload));
    }

    if (error) throw error;

    statusEl.textContent = "บันทึกสำเร็จ";
    statusEl.className = "status-msg ok";
    setTimeout(() => showMenu(), 700);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "เกิดข้อผิดพลาด: " + (err.message || err);
    statusEl.className = "status-msg err";
  } finally {
    btn.disabled = false;
  }
}

// ===== ประวัติ =====
async function loadHistory() {
  const listEl = document.getElementById("history-list");
  listEl.innerHTML = `<p style="color:var(--text-soft)">กำลังโหลด...</p>`;
  const client = getClient();
  if (!client) {
    listEl.innerHTML = `<p style="color:var(--text-soft)">ยังไม่ได้ตั้งค่า Supabase ใน js/config.js</p>`;
    return;
  }
  const { data, error } = await client.from("submissions").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) {
    listEl.innerHTML = `<p style="color:var(--red)">โหลดข้อมูลไม่สำเร็จ: ${error.message}</p>`;
    return;
  }
  state.history = data || [];
  renderHistory();
}

function renderHistory() {
  const listEl = document.getElementById("history-list");
  listEl.innerHTML = "";
  if (state.history.length === 0) {
    listEl.innerHTML = `<p style="color:var(--text-soft)">ยังไม่มีรายการบันทึก</p>`;
    return;
  }
  state.history.forEach(item => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.onclick = () => openEdit(item);
    const tagClass = item.work_type === "remove" ? "remove" : (item.work_type === "over90" ? "over90" : "");
    div.innerHTML = `
      <div>
        <div><strong>${item.pea_old || "-"}</strong> · ${item.customer_name || "ไม่ระบุชื่อ"}</div>
        <div class="meta">${item.unit} · ${new Date(item.created_at).toLocaleString("th-TH")}</div>
      </div>
      <span class="tag ${tagClass}">${WORK_TYPE_LABEL[item.work_type] || item.work_type}</span>
    `;
    listEl.appendChild(div);
  });
}

// ===== Dashboard =====
async function loadDashboard() {
  const client = getClient();
  const el = document.getElementById("dash-grid");
  if (!client) {
    el.innerHTML = `<p style="color:var(--text-soft)">ยังไม่ได้ตั้งค่า Supabase ใน js/config.js</p>`;
    return;
  }
  const { data, error } = await client.from("submissions").select("work_type, unit");
  if (error) {
    el.innerHTML = `<p style="color:var(--red)">โหลดข้อมูลไม่สำเร็จ: ${error.message}</p>`;
    return;
  }
  const total = data.length;
  const byType = { cut_reconnect: 0, remove: 0, over90: 0 };
  const byUnit = {};
  data.forEach(d => {
    byType[d.work_type] = (byType[d.work_type] || 0) + 1;
    byUnit[d.unit] = (byUnit[d.unit] || 0) + 1;
  });
  const topUnit = Object.entries(byUnit).sort((a, b) => b[1] - a[1])[0];

  el.innerHTML = `
    <div class="dash-stat"><div class="num">${total}</div><div class="label">บันทึกทั้งหมด</div></div>
    <div class="dash-stat"><div class="num">${byType.cut_reconnect}</div><div class="label">ตัด-ต่อ</div></div>
    <div class="dash-stat"><div class="num">${byType.remove}</div><div class="label">ถอนมิเตอร์</div></div>
    <div class="dash-stat"><div class="num">${byType.over90}</div><div class="label">เกิน 90 วัน</div></div>
    <div class="dash-stat"><div class="num">${topUnit ? topUnit[1] : 0}</div><div class="label">หน่วยงานสูงสุด${topUnit ? " (" + topUnit[0] + ")" : ""}</div></div>
  `;
}

// ===== เริ่มต้น =====
document.addEventListener("DOMContentLoaded", () => {
  renderUnits();
  document.getElementById("last-updated").textContent = window.lastUpdated ? `อัปเดตฐานข้อมูล PEA ล่าสุด: ${window.lastUpdated}` : "";

  document.getElementById("tab-home").onclick = () => showScreen("screen-home");
  document.getElementById("tab-history").onclick = () => { showScreen("screen-history"); loadHistory(); };
  document.getElementById("tab-dashboard").onclick = () => { showScreen("screen-dashboard"); loadDashboard(); };

  document.querySelectorAll(".menu-card").forEach(card => {
    card.onclick = () => selectWorkType(card.dataset.type);
  });

  document.getElementById("back-to-units").onclick = () => showScreen("screen-home");
  document.getElementById("back-to-menu").onclick = () => showMenu();

  document.getElementById("f-pea-old").addEventListener("change", onPeaOldInput);
  document.getElementById("pick-coords-btn").onclick = pickCoords;
  document.getElementById("photo-input").addEventListener("change", onPhotoSelected);
  document.getElementById("work-form").addEventListener("submit", submitForm);
});
