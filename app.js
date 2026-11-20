/* ============ KONFIGURASI ============ */
// Ganti dengan URL Web App Apps Script Anda (akhiran /exec)
const API_URL = 'https://script.google.com/macros/s/AKfycbyie9Csrbxr62yiIbBxqz_HbVxgnZdlZNJB9o7_ZVopFNC9CwHIFJvOQBuYKyL74I3AHw/exec';

/* ============ UTIL ============ */
const $ = s => document.querySelector(s);
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf = n => Number(n || 0).toLocaleString('id-ID');
const rp = n => 'Rp ' + nf(n);
const today = () => new Date().toLocaleDateString('sv-SE');
const mStart = () => today().slice(0, 8) + '01';
const H = h => ({ h });
const tglID = t => t ? t.split('-').reverse().join('/') : '';
const unf = s => Number(String(s ?? '').replace(/\D/g, '')) || 0;
function fmtInput(el) {
  const pos = el.selectionStart, before = el.value.slice(0, pos).replace(/\D/g, '').length, d = el.value.replace(/\D/g, '');
  el.value = d ? Number(d).toLocaleString('id-ID') : '';
  let c = 0, i = 0; for (; i < el.value.length && c < before; i++) if (/\d/.test(el.value[i])) c++;
  try { el.setSelectionRange(i, i); } catch (x) {}
}
document.addEventListener('input', ev => { if (ev.target.classList && ev.target.classList.contains('num')) fmtInput(ev.target); }, true);
const _ls = {};
const loadScript = u => _ls[u] || (_ls[u] = new Promise((ok, no) => { const t = document.createElement('script'); t.src = u; t.onload = ok; t.onerror = () => no(new Error('Gagal memuat pustaka, cek koneksi internet')); document.head.appendChild(t); }));
let S = { token: localStorage.getItem('mb_token') || '', user: null, cfg: {}, barang: [], pelanggan: [], supplier: [], cart: [], pos: {}, pg: 0 };
let busyN = 0;
try { const saved = JSON.parse(localStorage.getItem('mb_cart_v1') || '{}'); if (Array.isArray(saved.cart)) S.cart = saved.cart; if (saved.pos && typeof saved.pos === 'object') S.pos = saved.pos; } catch (_) {}
function persistCart(){ try { localStorage.setItem('mb_cart_v1', JSON.stringify({cart:S.cart,pos:S.pos})); } catch (_) {} }

async function api(action, data, quiet) {
  if (!SW_READ.has(action)) swClear();
  if (!quiet) { busyN++; $('#busy').classList.add('on'); document.body.classList.add('wait'); }
  try {
    if (API_URL.indexOf('GANTI') === 0) throw new Error('API_URL belum diisi di index.html');
    const r = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action, token: S.token, data }) });
    const j = await r.json();
    if (!j.ok) { if (j.error === 'SESSION') logout(true); throw new Error(j.msg); }
    return j.data;
  } catch (err) {
    if (action === 'saveSale' && (err instanceof TypeError || !navigator.onLine)) {
      const q = JSON.parse(localStorage.getItem('mb_offline_sales') || '[]');
      const clientId = 'MB-' + Date.now() + '-' + Math.floor(Math.random()*1e6);
      q.push({clientId, payload:data, queuedAt:new Date().toISOString()});
      localStorage.setItem('mb_offline_sales', JSON.stringify(q));
      return {queued:true, clientId};
    }
    throw err;
  } finally { if (!quiet && --busyN === 0) { $('#busy').classList.remove('on'); document.body.classList.remove('wait'); } }
}
/* ============ CACHE DATA: tampil instan dari cache, lalu diperbarui di latar ============ */
const SW_READ = new Set(['list', 'dashboard', 'report', 'serviceList', 'warrantyInfo', 'tutupInfo', 'returInfo', 'returInfoBeli', 'nextNo', 'kasirInit', 'backupList', 'init']);
const SWK = 'mb_sw_', _sw = new Map(), _pf = new Map();
let swEp = 0;
function swKey(action, data) { return (S.user ? S.user.id : '') + '|' + action + '|' + JSON.stringify(data === undefined ? null : data); }
function swGet(key) {
  if (_sw.has(key)) return _sw.get(key);
  try { const raw = localStorage.getItem(SWK + key); if (raw !== null) { const o = JSON.parse(raw); _sw.set(key, o); return o; } } catch (_) {}
  return undefined;
}
function swPut(key, val) {
  _sw.set(key, val);
  try {
    const s = JSON.stringify(val);
    if (s.length > 400000) return;
    localStorage.setItem(SWK + key, s);
    const idx = JSON.parse(localStorage.getItem(SWK + '#idx') || '[]').filter(k => k !== key); idx.push(key);
    while (idx.length > 24) localStorage.removeItem(SWK + idx.shift());
    localStorage.setItem(SWK + '#idx', JSON.stringify(idx));
  } catch (_) {}
}
function swClear() {
  swEp++; _sw.clear(); _pf.clear();
  try { Object.keys(localStorage).filter(k => k.indexOf(SWK) === 0).forEach(k => localStorage.removeItem(k)); } catch (_) {}
}
async function swr(action, data, paint) {
  const key = swKey(action, data), my = S.pg, ep = swEp, cached = swGet(key), live = () => S.pg === my;
  let shown = null;
  if (cached !== undefined) { shown = JSON.stringify(cached); if (live()) paint(cached); }
  let fresh;
  try { fresh = await api(action, data); }
  catch (err) {
    if (!live()) return cached;
    if (cached !== undefined) { if (S.token) fail(err); return cached; }
    throw err;
  }
  if (ep === swEp) swPut(key, fresh);
  if (live() && (cached === undefined || JSON.stringify(fresh) !== shown)) paint(fresh);
  return fresh;
}
const PRE = {
  dashboard: () => [['dashboard', undefined]],
  penjualan: () => [['list', { sheet: 'Penjualan', from: mStart(), to: today() }]],
  pembelian: () => [['list', { sheet: 'Pembelian', from: mStart(), to: today() }]],
  retur: () => [['list', { sheet: 'Retur', from: mStart(), to: today() }]],
  returbeli: () => [['list', { sheet: 'ReturBeli', from: mStart(), to: today() }]],
  mutasi: () => [['list', { sheet: 'Mutasi', from: mStart(), to: today() }]],
  barang: () => [['list', { sheet: 'Barang' }]],
  pelanggan: () => [['list', { sheet: 'Pelanggan' }]],
  supplier: () => [['list', { sheet: 'Supplier' }]],
  pengeluaran: () => { const r = _cr.Pengeluaran || { f: mStart(), t: today() }; return [['list', { sheet: 'Pengeluaran', from: r.f, to: r.t }]]; },
  servis: () => [['serviceList', { from: '', to: '' }]]
};
function prefetchPage(p) {
  const m = MENU.find(x => x[0] === p);
  if (!S.user || !PRE[p] || (m && m[3] && !isAdmin())) return;
  PRE[p]().forEach(([a, d]) => {
    const k = swKey(a, d), ep = swEp;
    if (_pf.has(k) && Date.now() - _pf.get(k) < 60000) return;
    _pf.set(k, Date.now());
    api(a, d, true).then(r => { if (ep === swEp) swPut(k, r); }).catch(() => {});
  });
}
function prefetchStart() {
  setTimeout(() => ['penjualan', 'barang', 'pelanggan', 'pembelian'].forEach((p, i) => setTimeout(() => prefetchPage(p), i * 700)), 2000);
}


function toast(m, err) {
  const d = document.createElement('div'); d.textContent = m; if (err) d.className = 'err';
  $('#toast').appendChild(d); setTimeout(() => d.remove(), err ? 5000 : 2600);
}
const fail = x => toast(x.message || String(x), true);

function modal(title, body, onOk, okText, wide, force) {
  const m = $('#modal');
  m.innerHTML = `<div class="mb ${wide ? 'w' : ''}"><div class="mh">${e(title)}</div><div class="mc">${body}</div><div class="mf">${force ? '' : `<button class="btn" id="mX">${onOk ? 'Batal' : 'Tutup'}</button>`}${onOk ? `<button class="btn p" id="mOk">${okText || 'Simpan'}</button>` : ''}</div></div>`;
  m.classList.add('on');
  const close = () => { m.classList.remove('on'); m.innerHTML = ''; };
  if ($('#mX')) $('#mX').onclick = close;
  if (onOk) $('#mOk').onclick = async ev => {
    const b = ev.target; b.disabled = true;
    try { if ((await onOk(m)) !== false) close(); } catch (x) { fail(x); }
    b.disabled = false;
  };
  m.close = close; return m;
}
const confirmBox = (msg, fn) => modal('Konfirmasi', `<p>${msg}</p>`, async () => { await fn(); }, 'Ya, lanjutkan');

function field(f, v) {
  v = v ?? f.def ?? '';
  if (f.t === 'select') {
    const o = (typeof f.o === 'function' ? f.o() : f.o).map(x => Array.isArray(x) ? x : [x, x]);
    return `<select name="${f.k}">${o.map(x => `<option value="${e(x[0])}" ${String(x[0]) === String(v) ? 'selected' : ''}>${e(x[1])}</option>`).join('')}</select>`;
  }
  if (f.t === 'textarea') return `<textarea name="${f.k}" rows="2">${e(v)}</textarea>`;
  if (f.t === 'number') return `<input name="${f.k}" class="num" inputmode="numeric" value="${v === '' ? '' : nf(v)}" ${f.ph ? `placeholder="${e(f.ph)}"` : ''}>`;
  return `<input name="${f.k}" type="${f.t || 'text'}" value="${e(v)}" ${f.ph ? `placeholder="${e(f.ph)}"` : ''}>`;
}
function formModal(title, fields, row, onSave) {
  const vis = fields.filter(f => !(f.newOnly && row.ID));
  modal(title, `<div class="fg">${vis.map(f => `<label class="f ${f.full ? 'full' : ''}"><span>${f.l}${f.req ? ' *' : ''}</span>${field(f, row[f.k])}</label>`).join('')}</div>`, async m => {
    const o = { ...row };
    for (const f of vis) {
      const el = m.querySelector(`[name="${f.k}"]`); o[f.k] = el.classList.contains('num') ? unf(el.value) : el.value;
      if (f.req && !String(el.value).trim()) throw new Error(f.l + ' wajib diisi');
    }
    return onSave(o);
  });
}

const PG = 40, _pg = {}; let _pgN = 0;
function tbl(heads, rows, foot, all) {
  const cell = c => (c && typeof c === 'object' && 'h' in c) ? `<td${c.c ? ` class="${c.c}"` : ''}>${c.h}</td>` : typeof c === 'number' ? `<td class="r">${nf(c)}</td>` : `<td>${e(c)}</td>`;
  const txt = c => (c && typeof c === 'object' && 'h' in c) ? c.h : typeof c === 'number' ? nf(c) : e(c);
  const n = heads.length, cardOn = n >= 4, hasAct = heads[n - 1] === '';
  const ti = Math.max(0, heads.findIndex(h => /^(Nama|Barang|Produk)$/.test(h)));
  const card = (r, ft) => {
    const act = hasAct && !ft;
    const body = r.map((c, i) => (i === ti || (act && i === n - 1) || c === '' || c == null) ? '' : `<div><small>${heads[i]}</small><span>${txt(c)}</span></div>`).join('');
    return `<div class="rcard${ft ? ' ft' : ''}"><b>${txt(r[ti]) || txt(r[0])}</b><div class="kv">${body}</div>${act ? `<div class="ca">${txt(r[n - 1])}</div>` : ''}</div>`;
  };
  const id = ++_pgN, lim = all ? rows.length : PG;
  const trs = rows.map(r => `<tr>${r.map(cell).join('')}</tr>`);
  const crd = cardOn ? rows.map(r => card(r)) : [];
  delete _pg[id - 30];
  _pg[id] = { trs, crd, shown: lim };
  const table = `<div class="tw${cardOn ? ' hasc' : ''}"><table><thead><tr>${heads.map(h => `<th class="${/^(Harga|Total|Qty|Stok|Jumlah|Sisa|Subtotal|Bayar|Nilai|Laba|Diskon|HPP|Kurang|Kembali|Potong|Uang|Modal|Seharusnya|Hitung|Selisih|Pelunasan|PPN|DPP)/.test(h) ? 'r' : ''}">${h}</th>`).join('')}</tr></thead><tbody id="tb${id}">${rows.length ? trs.slice(0, lim).join('') : `<tr><td class="empty" colspan="${n}">Belum ada data</td></tr>`}</tbody>${foot ? `<tfoot><tr>${foot.map(cell).join('')}</tr></tfoot>` : ''}</table></div>`;
  const cards = cardOn ? `<div class="cards" id="cd${id}">${rows.length ? crd.slice(0, lim).join('') : '<div class="empty">Belum ada data</div>'}${foot ? card(foot, true).replace('class="rcard ft"', 'class="rcard ft" id="cf' + id + '"') : ''}</div>` : '';
  const more = rows.length > lim ? `<div class="more" id="mo${id}"><button class="btn" onclick="pgMore(${id})">Muat lebih banyak (${rows.length - lim} lagi)</button></div>` : '';
  return table + cards + more;
}
function pgMore(id) {
  const p = _pg[id]; if (!p) return;
  const a = p.shown, b = Math.min(a + PG, p.trs.length);
  $('#tb' + id).insertAdjacentHTML('beforeend', p.trs.slice(a, b).join(''));
  const cd = $('#cd' + id);
  if (cd && p.crd.length) {
    const h = p.crd.slice(a, b).join(''), f = $('#cf' + id);
    if (f) f.insertAdjacentHTML('beforebegin', h); else cd.insertAdjacentHTML('beforeend', h);
  }
  p.shown = b;
  const mo = $('#mo' + id);
  if (b >= p.trs.length) mo.remove(); else mo.firstChild.textContent = `Muat lebih banyak (${p.trs.length - b} lagi)`;
}
const badge = s => `<span class="bd ${{ Lunas: 'ok', Piutang: 'bad', Hutang: 'bad', Batal: 'warn' }[s] || ''}">${e(s)}</span>`;
const sum = (a, k) => a.reduce((p, c) => p + (+c[k] || 0), 0);
const cats = () => (S.cfg.kategori || '').split(',').map(x => x.trim()).filter(Boolean);
const isAdmin = () => S.user && S.user.role === 'admin';
function csv(name, heads, rows) {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const t = [heads, ...rows].map(r => r.map(q).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + t], { type: 'text/csv' })); a.download = name + '.csv'; a.click();
}

/* ============ AUTH & BOOT ============ */
$('#lform').onsubmit = async ev => {
  ev.preventDefault(); const b = $('#lbtn'); b.disabled = true; b.textContent = 'Memeriksa...';
  try {
    const r = await api('login', { username: $('#lu').value, password: $('#lp').value });
    S.token = r.token; localStorage.setItem('mb_token', r.token);
    localStorage.setItem('mb_page', 'dashboard'); history.replaceState(null, '', '#dashboard');
    $('#lu').value = ''; $('#lp').value = '';
    await boot();
  } catch (x) { fail(x); }
  b.disabled = false; b.textContent = 'Masuk';
};
function logout(silent) {
  swClear();
  localStorage.removeItem('mb_token'); localStorage.removeItem('mb_page');
  S.token = ''; S.user = null;
  if (!silent) { S.cart = []; S.pos = {}; }
  $('#lu').value = ''; $('#lp').value = '';
  $('#app').style.display = 'none'; $('#splash').style.display = 'none'; $('#login').style.display = 'grid';
  if (silent) toast('Sesi berakhir, silakan login ulang', true);
}
async function boot() {
  if (!S.token) { $('#splash').style.display = 'none'; $('#login').style.display = 'grid'; return; }
  try {
    const r = await api('init');
    Object.assign(S, { user: r.user, cfg: r.settings, barang: r.barang, pelanggan: r.pelanggan, supplier: r.supplier });
    $('#login').style.display = 'none'; $('#splash').style.display = 'none'; $('#app').style.display = 'block';
    $('#sName').textContent = S.cfg.nama_toko || 'Menara Ban'; document.title = S.cfg.nama_toko || 'Menara Ban';
    $('#meName').textContent = S.user.nama; $('#meRole').textContent = S.user.role === 'admin' ? 'Administrator' : 'Kasir';
    buildNav(); route(); prefetchStart(); setTimeout(syncOfflineSales,1200); if (S.user.wajib) forcePw();
  } catch (x) {
    if (S.token) { $('#login').style.display = 'none'; const sp = $('#splash'); sp.style.display = 'grid'; sp.innerHTML = `<div style="text-align:center;padding:20px"><p style="margin-bottom:12px">Gagal terhubung: ${e(x.message)}</p><button class="btn p" onclick="location.reload()">Coba lagi</button></div>`; }
  }
}

/* ============ NAVIGASI ============ */
const IC = {
  dash: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  truck: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v9"/>',
  swap: '<path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  wallet: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  chart: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.2 4.2L7 7M17 17l2.8 2.8M1 12h4M19 12h4M4.2 19.8L7 17M17 7l2.8-2.8"/>'
};
const MENU = [
  ['dashboard', 'Dashboard', 'dash'], ['kasir', 'Kasir / Penjualan', 'cart'], ['penjualan', 'Riwayat Penjualan', 'list'], ['retur', 'Retur Penjualan', 'undo', 1], ['tutup', 'Tutup Kasir', 'lock'],
  ['pembelian', 'Pembelian', 'truck', 1], ['returbeli', 'Retur Pembelian', 'undo', 1], ['barang', 'Barang & Stok', 'box'], ['mutasi', 'Mutasi Stok', 'swap', 1],
  ['pelanggan', 'Pelanggan', 'users'], ['supplier', 'Supplier', 'users', 1], ['pengeluaran', 'Pengeluaran', 'wallet', 1],
  ['laporan', 'Laporan', 'chart', 1], ['pengaturan', 'Pengaturan', 'gear', 1], ['servis', 'Riwayat Servis', 'truck']
];
const PAGES = () => ({ dashboard: pDashboard, kasir: pKasir, penjualan: pPenjualan, pembelian: pPembelian, barang: pBarang, mutasi: pMutasi, pelanggan: pPelanggan, supplier: pSupplier, pengeluaran: pPengeluaran, laporan: pLaporan, pengaturan: pPengaturan, retur: pRetur, tutup: pTutup, returbeli: pReturBeli, servis: pServis });
function toggleSide(on) {
  const v = on === undefined ? !$('#side').classList.contains('on') : on;
  $('#side').classList.toggle('on', v); $('#scrim').classList.toggle('on', v);
}
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') toggleSide(false); });
function buildNav() {
  $('#nav').innerHTML = MENU.filter(m => !m[3] || isAdmin()).map(m => `<a data-p="${m[0]}" onmouseenter="prefetchPage('${m[0]}')" ontouchstart="prefetchPage('${m[0]}')" onclick="location.hash='${m[0]}'"><svg viewBox="0 0 24 24">${IC[m[2]]}</svg>${m[1]}</a>`).join('');
}
async function route() {
  if (!S.user) return;
  let p = location.hash.slice(1) || localStorage.getItem('mb_page') || 'dashboard';
  const m = MENU.find(x => x[0] === p);
  if (!m || (m[3] && !isAdmin())) { p = 'dashboard'; }
  const mm = MENU.find(x => x[0] === p);
  localStorage.setItem('mb_page', p); if (location.hash.slice(1) !== p) history.replaceState(null, '', '#' + p);
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.p === p));
  $('#title').textContent = mm[1]; $('#topAct').innerHTML = ''; toggleSide(false);
  S.pg++;
  const v = $('#view'); const mb=$('#posMobileBar'); if(mb) mb.remove(); v.innerHTML = '<div class="empty">Memuat...</div>';
  try { await PAGES()[p](v); } catch (x) { v.innerHTML = `<div class="card empty">${e(x.message)}</div>`; }
}
window.onhashchange = route;

/* ============ DASHBOARD ============ */
function pDashboard(v) { return swr('dashboard', undefined, d => dashPaint(v, d)); }
function dashPaint(v, d) {
  const A = isAdmin();
  const seri = d.seri || [], mx = Math.max(...seri.map(x => x.total), 1);
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const now = new Date(), jam = now.getHours();
  const sapa = jam < 11 ? 'Selamat pagi' : jam < 15 ? 'Selamat siang' : jam < 18 ? 'Selamat sore' : 'Selamat malam';
  const hr = t => HARI[new Date(t + 'T00:00:00').getDay()].slice(0, 3);
  const short = n => n >= 1e6 ? (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + 'jt' : n >= 1000 ? nf(Math.round(n / 1000)) + 'rb' : n ? nf(n) : '';
  const ico = p => `<span class="db-ic"><svg viewBox="0 0 24 24">${p}</svg></span>`;
  const WARN = '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>';
  const K = (cls, ic, label, val, sub) => `<div class="db-k ${cls}">${ico(ic)}<div><small>${label}</small><b>${val}</b><i>${sub}</i></div></div>`;

  const hari = seri.length ? seri[seri.length - 1].total : 0, kemarin = seri.length > 1 ? seri[seri.length - 2].total : 0;
  let delta = '';
  if (kemarin > 0) { const p = Math.round((hari - kemarin) / kemarin * 100); delta = `<span class="db-d ${p >= 0 ? 'up' : 'dn'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}%</span>`; }

  const tot7 = seri.reduce((p, c) => p + c.total, 0), avg7 = seri.length ? Math.round(tot7 / seri.length) : 0;
  const best = seri.reduce((p, c) => c.total > p.total ? c : p, { total: 0, tgl: '' });
  const topMax = Math.max(...(d.top || []).map(t => t.qty), 1);

  v.innerHTML = `
  <div class="db-head">
    <div><h2>${sapa}, ${e((S.user.nama || '').split(' ')[0])}</h2><p>${HARI[now.getDay()]}, ${now.getDate()} ${BLN[now.getMonth()]} ${now.getFullYear()}</p></div>
    <div class="db-act"><button class="btn a" onclick="location.hash='kasir'">+ Transaksi Baru</button>${A ? `<button class="btn" onclick="location.hash='pembelian'">Pembelian</button><button class="btn" onclick="location.hash='laporan'">Laporan</button>` : ''}</div>
  </div>

  <div class="db-kpi">
    ${K('', IC.cart, 'Omzet hari ini', rp(d.omzetHari), `${d.trxHari} transaksi${delta}`)}
    ${K('a', IC.chart, 'Omzet bulan ini', rp(d.omzetBulan), `${d.trxBulan} transaksi`)}
    ${A ? K('g', IC.wallet, 'Laba bersih bulan ini', rp(d.labaBulan), `setelah biaya ${rp(d.biayaBulan)}`) : ''}
    ${K(d.jmlMenipis ? 'r' : 'g', WARN, 'Stok menipis', d.jmlMenipis + ' barang', d.jmlMenipis ? 'perlu segera restok' : 'semua stok aman')}
  </div>

  <div class="db-grid">
    <div class="card">
      <div class="db-ch"><h3>Penjualan 7 hari terakhir</h3><span>dalam Rupiah</span></div>
      <div class="db-chart">${seri.map((x, i) => `<div class="db-col ${i === seri.length - 1 ? 'now' : ''}" title="${tglID(x.tgl)}: ${rp(x.total)}"><em>${short(x.total)}</em><u style="height:${Math.max(1.5, x.total / mx * 82)}%"></u></div>`).join('')}</div>
      <div class="db-axis">${seri.map((x, i) => `<div class="${i === seri.length - 1 ? 'now' : ''}">${hr(x.tgl)}<br>${x.tgl.slice(8)}</div>`).join('')}</div>
      <div class="db-sum"><span>Total 7 hari: <b>${rp(tot7)}</b></span><span>Rata-rata/hari: <b>${rp(avg7)}</b></span>${best.total ? `<span>Terbaik: <b>${hr(best.tgl)}, ${tglID(best.tgl).slice(0, 5)}</b></span>` : ''}</div>
    </div>

    <div class="card">
      <div class="db-ch"><h3>Perlu restok</h3><a onclick="location.hash='barang'">Lihat barang</a></div>
      ${d.stokMenipis.length ? `<div class="db-rank">${d.stokMenipis.slice(0, 6).map(b => {
        const pct = Math.min(100, Math.max(4, b.Stok / Math.max(b.StokMin, 1) * 100));
        return `<div class="db-ri" style="grid-template-columns:1fr auto"><div class="t"><b>${e(b.Nama)}</b><small>${e(b.Ukuran || '')}</small><div class="db-bar ${b.Stok <= 0 ? 'bad' : 'warn'}"><i style="width:${pct}%"></i></div></div><div class="v"><span class="bd ${b.Stok <= 0 ? 'bad' : 'warn'}">${nf(b.Stok)}</span><br><small class="note">min ${nf(b.StokMin)}</small></div></div>`;
      }).join('')}</div>${d.stokMenipis.length > 6 ? `<p class="note" style="margin-top:10px">+${d.stokMenipis.length - 6} barang lainnya</p>` : ''}` : '<div class="db-ok">✓ Semua stok masih aman</div>'}
    </div>
  </div>

  <div class="db-grid two ${A ? '' : 'solo'}">
    <div class="card">
      <div class="db-ch"><h3>Produk terlaris bulan ini</h3><span>qty terjual</span></div>
      ${(d.top || []).length ? `<div class="db-rank">${d.top.map((t, i) => `<div class="db-ri ${i === 0 ? 'f' : ''}"><div class="n">${i + 1}</div><div class="t"><b>${e(t.nama)}</b><div class="db-bar"><i style="width:${t.qty / topMax * 100}%"></i></div></div><div class="v">${nf(t.qty)}</div></div>`).join('')}</div>` : '<p class="note">Belum ada penjualan bulan ini.</p>'}
    </div>
    ${A ? `<div class="card">
      <div class="db-ch"><h3>Ringkasan keuangan</h3><a onclick="location.hash='laporan'">Laporan lengkap</a></div>
      <div class="db-fin">
        <div><small>Piutang pelanggan</small><b style="color:var(--bad)">${rp(d.piutang)}</b></div>
        <div><small>Hutang supplier</small><b style="color:var(--warn)">${rp(d.hutang)}</b></div>
        <div><small>Nilai persediaan</small><b>${rp(d.nilaiStok)}</b></div>
        <div><small>Biaya bulan ini</small><b>${rp(d.biayaBulan)}</b></div>
      </div>
    </div>` : ''}
  </div>`;
}

/* ============ KASIR ============ */
async function pKasir(v) {
  v.innerHTML = `<div class="pos v${[1, 2, 3, 4, 5, 6].includes(+S.cfg.tampilan_kasir) ? +S.cfg.tampilan_kasir : 1}"><div class="card"><div class="bar"><input class="grow" id="q" placeholder="Cari nama, merek, ukuran, kode barang..."><select id="kat"><option value="">Semua kategori</option>${cats().map(c => `<option>${e(c)}</option>`).join('')}</select></div><div class="plist" id="plist"></div></div><div class="card" id="cart"></div></div>`;
  $('#q').oninput = $('#kat').onchange = prodList; $('#q').addEventListener('keydown', ev => { if(ev.key==='Enter'){ev.preventDefault(); const code=$('#q').value.trim().toLowerCase(); const b=S.barang.find(x=>x.Aktif!=='N' && String(x.Kode||'').toLowerCase()===code); if(b){addCart(b.ID);$('#q').value='';prodList();} else {const first=S.barang.filter(x=>x.Aktif!=='N' && (x.Kode+x.Nama+x.Merek+x.Ukuran).toLowerCase().includes(code)); if(first.length===1){addCart(first[0].ID);$('#q').value='';prodList();}} }}); prodList(); cartRender();
  if (!$('#posMobileBar')) document.body.insertAdjacentHTML('beforeend','<div class="pos-mobilebar" id="posMobileBar"><div><b id="mbTotal">Rp 0</b><div class="note" id="mbCount">0 item</div></div><button class="btn p" type="button" onclick="document.querySelector(\'#cart\').scrollIntoView({behavior:\'smooth\',block:\'start\'})">Lihat keranjang</button></div>'); $('#q').focus();
  api('kasirInit').then(r => {
    S.barang = r.barang; S.pelanggan = r.pelanggan; S.nextNo = r.nextNo;
    if ($('#plist')) { prodList(); if (!S.pos.noManual && $('#pN')) $('#pN').value = S.nextNo; }
  }).catch(() => {});
}
function prodList() {
  const q = $('#q').value.toLowerCase(), k = $('#kat').value;
  const L = S.barang.filter(b => b.Aktif !== 'N' && (!k || b.Kategori === k) && (b.Kode + b.Nama + b.Merek + b.Ukuran).toLowerCase().includes(q)).slice(0, 80);
  $('#plist').innerHTML = L.map(b => { const out = b.Kategori !== 'Jasa' && b.Stok <= 0; return `<button class="pi ${out ? 'out' : ''}" ${out ? 'disabled title="Stok habis"' : ''} onclick="addCart('${b.ID}')"><b>${e(b.Nama)}</b><small>${e([b.Merek, b.Ukuran].filter(Boolean).join(' · '))}</small><div class="pr">${rp(b.HargaJual)}</div><small>${b.Kategori === 'Jasa' ? 'Jasa' : (out ? 'Stok habis' : 'Stok: ' + b.Stok + ' ' + e(b.Satuan))}</small></button>`; }).join('') || '<p class="empty">Barang tidak ditemukan</p>';
}
function addCart(id) {
  const b = S.barang.find(x => x.ID === id), j = b.Kategori === 'Jasa', c = S.cart.find(x => x.id === id);
  if (!j && (c ? c.qty + 1 : 1) > b.Stok) return toast('Stok ' + b.Nama + ' tidak cukup', true);
  if (c) c.qty++; else { const tier=S.pos.tier||'eceran'; const harga=tier==='grosir'&&b.HargaGrosir?b.HargaGrosir:tier==='bengkel'&&b.HargaBengkel?b.HargaBengkel:b.HargaJual; S.cart.push({ id, nama: b.Nama, uk: b.Ukuran, qty: 1, harga, diskon: 0, jasa: j, stok: b.Stok, dot:'', garansiBulan:0, montir:'', komisi:0 }); }
  persistCart(); cartRender();
}
function cartSet(i, k, val) {
  const c = S.cart[i]; val = unf(val);
  if (k === 'qty' && !c.jasa && val > c.stok) { toast('Stok hanya ' + c.stok, true); val = c.stok; }
  c[k] = val; if (k === 'qty' && val <= 0) S.cart.splice(i, 1); persistCart(); cartRender();
}
function itemExtra(i){
  const c=S.cart[i];
  modal('Detail Barang / Jasa',`<div class="fg"><label class="f"><span>Kode DOT ban</span><input id="ixDot" value="${e(c.dot||'')}" placeholder="mis. 2426"></label><label class="f"><span>Garansi (bulan)</span><input id="ixGar" class="num" value="${nf(c.garansiBulan||0)}"></label><label class="f"><span>Plat nomor</span><input id="ixPlat" value="${e(c.platNomor||'')}"></label><label class="f"><span>Montir</span><input id="ixMontir" value="${e(c.montir||'')}"></label><label class="f"><span>Komisi montir (Rp)</span><input id="ixKom" class="num" value="${nf(c.komisi||0)}"></label></div>`,async()=>{c.dot=$('#ixDot').value;c.garansiBulan=unf($('#ixGar').value);c.platNomor=$('#ixPlat').value;c.montir=$('#ixMontir').value;c.komisi=unf($('#ixKom').value);persistCart();});
}
function cartTotals() {
  const sub = S.cart.reduce((p, c) => p + Math.max(0, c.qty * c.harga - c.diskon), 0);
  const net = Math.max(0, sub - unf(S.pos.diskon));
  const mode = $('#pPpn') ? $('#pPpn').value : 'none';
  const pp = ppnCalc(net, mode);
  const total = pp.total;
  const bayar = S.pos.bayar === '' || S.pos.bayar === undefined ? total : unf(S.pos.bayar);
  return { sub, net, ppn:pp.ppn, total, bayar };
}
function cartCalc() {
  const t = cartTotals();
  $('#tSub').textContent = rp(t.sub); $('#tTot').textContent = rp(t.total);
  $('#tKem').innerHTML = t.bayar >= t.total ? `Kembali: <b>${rp(t.bayar - t.total)}</b>` : `<span class="bd bad">Piutang ${rp(t.total - t.bayar)}</span>`;
  const mt=$('#mbTotal'), mc=$('#mbCount'); if(mt) mt.textContent=rp(t.total); if(mc) mc.textContent=S.cart.reduce((n,c)=>n+c.qty,0)+' item';
}
function cartRender() {
  const p = S.pos, el = $('#cart'); if (!el) return;
  persistCart();
  el.innerHTML = `<h3>Keranjang</h3><div class="bar"><label>Jenis harga <select id="pTier"><option value="eceran">Eceran</option><option value="grosir">Grosir</option><option value="bengkel">Bengkel</option></select></label></div>${S.cart.length ? S.cart.map((c, i) => `<div class="ci"><div><b>${e(c.nama)}</b><small>${e(c.uk)}</small></div><input class="num" inputmode="numeric" value="${nf(c.qty)}" onchange="cartSet(${i},'qty',this.value)" title="Qty"><input class="num" inputmode="numeric" value="${nf(c.harga)}" onchange="cartSet(${i},'harga',this.value)" title="Harga satuan"><input class="dk num" inputmode="numeric" value="${nf(c.diskon)}" onchange="cartSet(${i},'diskon',this.value)" title="Diskon (Rp)" placeholder="Disk."><button class="btn s" onclick="itemExtra(${i})" title="DOT, garansi, montir">Detail</button><button class="x" onclick="S.cart.splice(${i},1);cartRender()" title="Hapus">×</button></div>`).join('') + '<p class="note" style="margin-top:6px">Kolom: Qty · Harga satuan · Diskon item (Rp)</p>' : '<p class="empty">Klik barang di sebelah kiri untuk menambah.</p>'}
  <div class="sum"><div class="row"><span>Subtotal</span><b id="tSub"></b></div>
  <div class="row"><span>Diskon nota (Rp)</span><input class="num" inputmode="numeric" id="pD" value="${p.diskon || ''}" placeholder="0"></div>
  <div class="row"><span>Total</span><span class="tot" id="tTot"></span></div>
  <div class="row"><span>No. Nota</span><span class="pw"><input id="pN" value="${e(p.noManual ? p.no : S.nextNo)}" style="width:150px;text-align:left"><button class="btn" onclick="noAuto()" title="Kembali ke nomor otomatis">↺</button></span></div>
  <div class="note" style="text-align:right">Otomatis. Ketik untuk mengganti dengan nomor manual.</div>
  <div class="row"><span>Pelanggan</span><span class="pw"><select id="pP" style="width:150px"><option>Umum</option>${S.pelanggan.map(x => `<option ${p.pel === x.Nama ? 'selected' : ''}>${e(x.Nama)}</option>`).join('')}</select><button class="btn" onclick="newCust()">+</button></span></div>
  <div class="row"><span>Metode 1</span><select id="pM">${['Tunai', 'Transfer', 'QRIS', 'Debit'].map(m => `<option ${p.metode === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div><div class="row"><span>Nominal metode 1</span><input class="num" id="pPay1" inputmode="numeric" placeholder="kosong = seluruh pembayaran"></div><div class="row"><span>Metode 2 (opsional)</span><select id="pM2"><option value="">Tidak ada</option>${['Tunai','Transfer','QRIS','Debit'].map(m=>`<option>${m}</option>`).join('')}</select></div><div class="row"><span>Nominal metode 2</span><input class="num" id="pPay2" inputmode="numeric" placeholder="0"></div><div class="row"><span>PPN penjualan</span><select id="pPpn"><option value="none">Tanpa PPN</option><option value="exclude">Tambah PPN ${ppnRate()}%</option><option value="include">Harga termasuk PPN ${ppnRate()}%</option></select></div><div class="row"><span>Jatuh tempo</span><input type="date" id="pDue"></div><div class="row"><span>Plat nomor</span><input id="pPlat" placeholder="B 1234 XYZ"></div>
  <div class="row"><span>Dibayar (Rp)</span><span class="pw"><input class="num" inputmode="numeric" id="pB" value="${p.bayar ?? ''}" placeholder="kosong = lunas pas"></span></div>
  <div class="row"><span class="note">Kurang dari total = piutang</span><span id="tKem"></span></div>
  <input id="pC" placeholder="Catatan (plat nomor, dll)" value="${e(p.cat || '')}">
  <button class="btn a" style="padding:12px;font-size:16px" id="bSave" ${S.cart.length ? '' : 'disabled'} onclick="saleSave()">Simpan</button>
  ${S.cart.length ? '<button class="btn d" onclick="S.cart=[];S.pos={};cartRender()">Kosongkan</button>' : ''}</div>`;
  const sync = () => { p.diskon = $('#pD').value; p.bayar = $('#pB').value; p.pel = $('#pP').value; p.metode = $('#pM').value; p.cat = $('#pC').value; cartCalc(); };
  ['#pD', '#pB', '#pP', '#pM', '#pC', '#pPay1', '#pPay2', '#pM2', '#pPpn', '#pDue', '#pPlat', '#pTier'].forEach(s => $(s).oninput = $(s).onchange = sync); cartCalc();
  $('#pN').oninput = () => { p.no = $('#pN').value; p.noManual = true; }; $('#pTier').value=p.tier||'eceran'; $('#pTier').onchange=()=>{p.tier=$('#pTier').value;S.cart.forEach(c=>{const b=S.barang.find(x=>x.ID===c.id);if(b)c.harga=p.tier==='grosir'&&b.HargaGrosir?b.HargaGrosir:p.tier==='bengkel'&&b.HargaBengkel?b.HargaBengkel:b.HargaJual;});cartRender();};
}
function noAuto() { S.pos.noManual = false; S.pos.no = ''; cartRender(); }
function newCust() {
  formModal('Pelanggan Baru', CUST_F, {}, async o => {
    const r = await api('save', { sheet: 'Pelanggan', row: o });
    S.pelanggan.push(Object.assign({}, o, { ID: r.ID })); S.pos.pel = o.Nama; cartRender();
  });
}
async function saleSave() {
  const t = cartTotals(), p = S.pos;
  const a1=$('#pPay1')&&$('#pPay1').value!==''?unf($('#pPay1').value):t.bayar; const a2=$('#pPay2')?unf($('#pPay2').value):0; const bayarAktual=a1+a2;
  if (bayarAktual < t.total && (!p.pel || p.pel === 'Umum')) return toast('Piutang wajib memilih pelanggan (bukan Umum)', true);
  $('#bSave').disabled = true;
  try {
    const pays=a2>0?[{metode:$('#pM').value,jumlah:a1},{metode:$('#pM2').value,jumlah:a2}]:[]; const r = await api('saveSale', { items: S.cart.map(c => ({ id: c.id, nama: c.nama, qty: c.qty, harga: c.harga, diskon: c.diskon, dot:c.dot, garansiBulan:c.garansiBulan, montir:c.montir, komisi:c.komisi, platNomor:c.platNomor })), diskon: unf(p.diskon), bayar: bayarAktual, payments:pays, ppnMode:$('#pPpn')?$('#pPpn').value:'none', ppnRate:ppnRate(), jatuhTempo:$('#pDue')?$('#pDue').value:'', platNomor:$('#pPlat')?$('#pPlat').value:'', no: p.noManual ? String(p.no || '').trim() : '', pelanggan: p.pel || 'Umum', metode: p.metode || 'Tunai', catatan: p.cat || '' });
    if(r.queued){toast('Transaksi disimpan di antrean offline. Akan dikirim saat internet kembali.');S.cart=[];S.pos={};persistCart();cartRender();return;}
    toast('Transaksi ' + r.sale.No + ' tersimpan');
    S.cart.forEach(c => { if (!c.jasa) { const b = S.barang.find(x => x.ID === c.id); if (b) b.Stok -= c.qty; } });
    S.cart = []; S.pos = {}; persistCart(); S.nextNo = r.nextNo; prodList(); cartRender();
  } catch (x) { fail(x); $('#bSave').disabled = false; }
}
const RC_CSS = '.rc{font:12px/1.4 monospace;width:290px;margin:0 auto;padding:12px;background:#fff;color:#000}.rc hr{border:0;border-top:1px dashed #000;margin:6px 0}.rc h3,.rc p{margin:2px 0;text-align:center}.rc .l{display:flex;justify-content:space-between;gap:8px}body{margin:0}';
function receiptBody(s, items) {
  const c = S.cfg, L = (a, b) => `<div class="l"><span>${a}</span><span>${b}</span></div>`;
  return `<h3>${e(c.nama_toko)}</h3><p>${e(c.alamat)}</p><p>${e(c.telp)}</p><hr>${L('No', e(s.No))}${L('Tgl', tglID(s.Tanggal) + ' ' + s.Waktu)}${L('Kasir', e(s.Kasir))}${L('Pelanggan', e(s.Pelanggan))}<hr>
  ${items.map(i => `<div>${e(i.Nama)}</div>${L(nf(i.Qty) + ' x ' + nf(i.Harga) + (i.Diskon ? ' (-' + nf(i.Diskon) + ')' : ''), nf(i.Subtotal))}`).join('')}<hr>
  ${L('Subtotal', nf(s.Subtotal))}${s.Diskon ? L('Diskon', '-' + nf(s.Diskon)) : ''}${s.PPN ? L('PPN', nf(s.PPN)) : ''}${L('<b>TOTAL</b>', '<b>' + nf(s.Total) + '</b>')}${L('Bayar (' + e(s.Metode) + ')', nf(s.Bayar + s.Kembali))}${s.Kembali ? L('Kembali', nf(s.Kembali)) : ''}${s.Total > s.Bayar ? L('SISA PIUTANG', nf(s.Total - s.Bayar)) : ''}<hr><p>${e(S.cfg.footer_struk)}</p>`;
}
function printReceipt(s, items) {
  const html = `<html><head><title>${e(s.No)}</title><style>${RC_CSS}</style></head><body><div class="rc">${receiptBody(s, items)}</div></body></html>`;
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(f);
  f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 300);
}
function strukModal(s, items) {
  const fn = 'Struk-' + s.No.replace(/\//g, '-');
  modal('Struk ' + s.No, `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button class="btn p" id="sP">Cetak</button><button class="btn" id="sWA">Kirim WhatsApp</button><button class="btn" id="sI">Simpan Gambar (PNG)</button><button class="btn" id="sD">Simpan PDF</button></div><div style="background:#eef1f4;padding:10px;border-radius:8px;overflow:auto"><div class="rc" id="rcp">${receiptBody(s, items)}</div></div>`);
  const shot = async () => { await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'); return html2canvas($('#rcp'), { scale: 2, backgroundColor: '#ffffff' }); };
  $('#sP').onclick = () => printReceipt(s, items);
  $('#sWA').onclick = () => { const tel=(S.pelanggan.find(x=>x.Nama===s.Pelanggan)||{}).Telp||''; const digits=tel.replace(/\D/g,'').replace(/^0/,'62'); const msg='Struk '+s.No+'\n'+S.cfg.nama_toko+'\n'+tglID(s.Tanggal)+'\nTotal: '+rp(s.Total)+'\nDibayar: '+rp(s.Bayar)+'\nSisa: '+rp(Math.max(0,s.Total-s.Bayar)); window.open('https://wa.me/'+digits+'?text='+encodeURIComponent(msg),'_blank','noopener'); };
  $('#sI').onclick = async () => { try { const cv = await shot(), a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = fn + '.png'; a.click(); } catch (x) { fail(x); } };
  $('#sD').onclick = async () => {
    try {
      const cv = await shot(); await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const w = 80, h = w * cv.height / cv.width, pdf = new window.jspdf.jsPDF({ unit: 'mm', format: [w, h] });
      pdf.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, w, h); pdf.save(fn + '.pdf');
    } catch (x) { fail(x); }
  };
}

/* ============ NOTA (kertas setengah HVS / A5 landscape 210x148 mm) ============ */
const NOTA_ROWS = 10;
const NOTA_CSS = `.np{box-sizing:border-box;width:210mm;height:148mm;padding:6mm 9mm 5mm;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;position:relative;overflow:hidden;page-break-after:always;margin:0 auto 10px}
.np:last-child{page-break-after:auto}
.np *{box-sizing:border-box;margin:0;padding:0}
.np .hd1{display:flex;justify-content:space-between;align-items:flex-start;gap:6mm}
.np .ttl{font:700 29pt/1 'Times New Roman',Times,serif;letter-spacing:.3px}
.np .sub{font-size:9pt;line-height:1.32;margin-top:1.2mm}
.np .sub small{font-size:8pt;display:block}
.np .rt{width:64mm;font-size:8pt;flex:none;padding-top:2.5mm}
.np .rt .ln{display:flex;align-items:flex-end;gap:1mm;height:5.4mm;white-space:nowrap}
.np .dl{flex:1;border-bottom:1px dotted #000;min-width:0;overflow:hidden;text-overflow:ellipsis;padding-left:1mm;height:4.2mm;line-height:4mm}
.np .nno{font:700 12pt Arial,sans-serif;margin:3mm 0 1.2mm;display:flex;align-items:flex-end;gap:2mm}
.np .nno .dl{flex:none;width:62mm;height:5.2mm;font:700 10pt Arial;line-height:5mm}
.np .nno .pg{font:400 8pt Arial;margin-left:auto}
.np .thick{border-top:1.1mm solid #000;margin-bottom:1mm}
.np table{width:100%;border-collapse:collapse;table-layout:fixed;border:.35mm solid #000;background:#fff}
.np th,.np td{border:.3mm solid #000;font-size:9pt;height:5.65mm;line-height:1;padding:0 1.6mm;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.np th{font-weight:700;text-align:center;height:6.4mm;font-size:10pt}
.np td.r{text-align:right}.np td.c{text-align:center}
.np tfoot td{height:9mm;padding:0 1.6mm;font-size:10.5pt;font-weight:700;text-align:right;overflow:hidden;white-space:nowrap}
.np tfoot td.fl{border-left:hidden;border-bottom:hidden;padding:0;font-weight:400}
.np tfoot td.fl>div{display:flex;justify-content:space-between;align-items:center;height:9mm;padding:0 3mm 0 1mm;line-height:1.25;font-size:10pt}
.np .nb{text-align:left}
.np .nb span{display:block;padding-left:9mm}
.np .jr{font-weight:700}
.np .sg{display:flex;justify-content:space-between;font-size:10pt;margin-top:3mm;padding:0 11mm 0 12mm}`;

function notaTgl(t) {
  const B = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'], p = String(t || '').split('-');
  return p.length === 3 && B[+p[1] - 1] ? (+p[2]) + ' ' + B[+p[1] - 1] + ' ' + p[0] : tglID(t);
}
function notaPageHtml(s, rows, pi, np) {
  const last = pi === np - 1;
  const fill = rows.slice();
  while (fill.length < NOTA_ROWS) fill.push({ q: '', n: '', h: '', j: '' });
  const tr = fill.map(r => `<tr><td class="c">${e(r.q)}</td><td>${e(r.n)}</td><td class="r">${e(r.h)}</td><td class="r">${e(r.j)}</td></tr>`).join('');
  return `<div class="np">
<div class="hd1"><div><div class="ttl">MENARA BAN</div>
<div class="sub">Jual Beli Ban Mobil &amp; Velg Racing (Import &amp; Lokal)<br>Jl. Demak No. 353 Surabaya<small>(150 meter setelah masjid Demak / Sebelah BRI unit Demak)</small>Telp. (031) 3554726 Fax. 3556596</div></div>
<div class="rt"><div class="ln">Tanggal,<span class="dl">${e(notaTgl(s.Tanggal))}</span></div><div class="ln">Tuan / Toko,<span class="dl">${e(s.Pelanggan)}</span></div><div class="ln"><span class="dl">${e(s.Catatan || '')}</span></div><div class="ln"><span class="dl"></span></div></div></div>
<div class="nno">NOTA No: <span class="dl">${e(s.No)}</span>${np > 1 ? `<span class="pg">Hal. ${pi + 1}/${np}</span>` : ''}</div>
<div class="thick"></div>
<table><colgroup><col style="width:19.3%"><col style="width:45.6%"><col style="width:18.2%"><col style="width:16.9%"></colgroup><thead><tr><th>Banyaknya</th><th>Nama Barang</th><th>Harga Satuan</th><th>Jumlah</th></tr></thead><tbody>${tr}</tbody><tfoot><tr><td class="fl" colspan="3"><div><div class="nb">NB: Barang yang sudah dibeli tidak dapat ditukar /<span>dikembalikan kecuali ada perjanjian.</span></div><div class="jr">Jumlah Rp.</div></div></td><td>${last ? nf(s.Total) : ''}</td></tr></tfoot></table>
<div class="sg"><span>Penerima,</span><span>Hormat kami,</span></div>
</div>`;
}
function notaHtml(s, items) {
  const rows = items.map(i => ({ q: nf(i.Qty), n: i.Nama + (i.Diskon ? ' (disk. ' + nf(i.Diskon) + ')' : ''), h: nf(i.Harga), j: nf(i.Subtotal) }));
  if (s.Diskon) rows.push({ q: '', n: 'Diskon nota', h: '', j: '-' + nf(s.Diskon) });
  if (s.PPN) {
    const net = s.Subtotal - s.Diskon;
    rows.push(s.Total > net ? { q: '', n: 'PPN', h: '', j: nf(s.PPN) } : { q: '', n: 'PPN ' + nf(s.PPN) + ' (sudah termasuk)', h: '', j: '' });
  }
  const pages = [];
  for (let i = 0; i < rows.length; i += NOTA_ROWS) pages.push(rows.slice(i, i + NOTA_ROWS));
  if (!pages.length) pages.push([]);
  return pages.map((p, i) => notaPageHtml(s, p, i, pages.length)).join('');
}
function notaPrint(s, items) {
  const html = `<html><head><title>Nota ${e(s.No)}</title><style>@page{size:210mm 148mm;margin:0}html,body{margin:0;padding:0;background:#fff}${NOTA_CSS}.np{margin:0 auto!important}</style></head><body>${notaHtml(s, items)}</body></html>`;
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(f);
  f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 400);
}
function notaModal(s, items) {
  const fn = 'Nota-' + s.No.replace(/\//g, '-');
  const m = modal('Nota ' + s.No, `<style>${NOTA_CSS}</style><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button class="btn p" id="nP">Cetak</button><button class="btn" id="nD">Simpan PDF</button></div><p class="note" style="margin-bottom:8px">Ukuran kertas: setengah HVS (A5 landscape, 210 x 148 mm). Pada dialog cetak, pilih ukuran A5 dan skala 100%.</p><div id="nWrap" style="background:#eef1f4;padding:10px;border-radius:8px;overflow:auto">${notaHtml(s, items)}</div>`, null, '', true);
  const hd = m.querySelector('.mh'); hd.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px';
  hd.insertAdjacentHTML('beforeend', '<button class="btn s" id="nX" type="button">Tutup ✕</button>');
  m.querySelector('.mf').style.display = 'none'; $('#nX').onclick = m.close;
  $('#nP').onclick = () => notaPrint(s, items);
  $('#nD').onclick = async ev => {
    const b = ev.target; b.disabled = true;
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: [210, 148] });
      const pgs = [...document.querySelectorAll('#nWrap .np')];
      for (let i = 0; i < pgs.length; i++) {
        const cv = await html2canvas(pgs[i], { scale: 3, backgroundColor: '#ffffff' });
        if (i) pdf.addPage([210, 148], 'landscape');
        pdf.addImage(cv.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 148);
      }
      pdf.save(fn + '.pdf');
    } catch (x) { fail(x); }
    b.disabled = false;
  };
}
async function notaLama(id) {
  try {
    const s = (window._pj || []).find(x => x.ID === id);
    const d = (await api('list', { sheet: 'DetailPenjualan', from: s.Tanggal, to: s.Tanggal })).filter(x => x.NoNota === s.No);
    notaModal(s, d);
  } catch (x) { fail(x); }
}

/* ============ RIWAYAT PENJUALAN ============ */
function rangeBar(id, fn, extra) {
  return `<div class="bar"><label>Dari <input type="date" id="${id}F" value="${mStart()}"></label><label>Sampai <input type="date" id="${id}T" value="${today()}"></label><button class="btn p" id="${id}Go">Tampilkan</button>${extra || ''}</div>`;
}
// PERBAIKAN: id wadah diubah menjadi "<id>Qk" agar tidak bentrok dengan kolom pencarian #pjQ / #pbQ
function quickBar(id) {
  return `<div class="bar" id="${id}Qk"><button class="btn s" data-q="0">Hari ini</button><button class="btn s" data-q="1">7 hari terakhir</button><button class="btn s" data-q="2">Bulan ini</button><button class="btn s" data-q="3">Bulan lalu</button></div>`;
}
function quickBind(id) {
  const iso = d => d.toLocaleDateString('sv-SE'), n = new Date();
  const R = [[today(), today()], [iso(new Date(Date.now() - 6 * 864e5)), today()], [mStart(), today()], [iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), iso(new Date(n.getFullYear(), n.getMonth(), 0))]];
  document.querySelectorAll('#' + id + 'Qk button').forEach(b => b.onclick = () => { const r = R[+b.dataset.q]; $('#' + id + 'F').value = r[0]; $('#' + id + 'T').value = r[1]; $('#' + id + 'Go').click(); });
}
function fillOpts(sel, vals, label) {
  const cur = sel.value;
  sel.innerHTML = `<option value="">${label}</option>` + [...new Set(vals.filter(Boolean))].sort().map(x => `<option ${x === cur ? 'selected' : ''}>${e(x)}</option>`).join('');
}
async function pPenjualan(v) {
  const extra = `<input class="grow" id="pjQ" placeholder="Cari no nota / pelanggan / kasir / catatan..."><select id="pjS"><option value="">Semua status</option><option>Lunas</option><option>Piutang</option><option value="telat">Piutang lewat jatuh tempo</option><option>Batal</option></select><select id="pjM"><option value="">Semua metode</option><option>Tunai</option><option>Transfer</option><option>QRIS</option><option>Debit</option><option>Campuran</option></select><select id="pjK"><option value="">Semua kasir</option></select><button class="btn" id="pjRs">Reset filter</button>`;
  v.innerHTML = quickBar('pj') + rangeBar('pj', 0, extra) + '<p class="note" id="pjInfo" style="margin-bottom:8px"></p><div id="pjR"></div>';
  const draw = () => {
    const r = window._pj || [], q = $('#pjQ').value.toLowerCase().trim(), st = $('#pjS').value, mt = $('#pjM').value, ks = $('#pjK').value, t0 = today();
    const L = r.filter(x => (!st || (st === 'telat' ? (x.Status === 'Piutang' && x.JatuhTempo && x.JatuhTempo < t0) : x.Status === st)) && (!mt || x.Metode === mt) && (!ks || x.Kasir === ks) && (!q || (x.No + ' ' + x.Pelanggan + ' ' + x.Kasir + ' ' + x.Catatan).toLowerCase().includes(q)));
    const ok = L.filter(x => x.Batal !== 'Y');
    $('#pjInfo').textContent = 'Menampilkan ' + L.length + ' dari ' + r.length + ' transaksi';
    $('#pjR').innerHTML = tbl(['No', 'Tanggal', 'Pelanggan', 'Total', 'Bayar', 'Status', 'Jatuh Tempo', 'Kasir', ''], L.map(x => [x.No, tglID(x.Tanggal) + ' ' + x.Waktu, x.Pelanggan, x.Total, x.Bayar, H(badge(x.Status)),
      tglID(x.JatuhTempo), x.Kasir, { h: `<button class="btn s" data-receipt="${e(x.ID)}" onclick="strukLama(this.dataset.receipt)">Struk</button><button class="btn s" data-receipt="${e(x.ID)}" onclick="notaLama(this.dataset.receipt)">Nota</button>${x.Status === 'Piutang' ? `<button class="btn s p" onclick="lunasi('jual','${x.ID}',${x.Total - x.Bayar},load_pj)">Bayar</button>` : ''}${isAdmin() && x.Batal !== 'Y' ? `<button class="btn s" onclick="returForm('${x.ID}',load_pj)">Retur</button><button class="btn s d" onclick="batal('jual','${x.ID}',load_pj)">Batal</button>` : ''}`, c: 'act' }]),
      ['Total ' + ok.length + ' transaksi', '', '', sum(ok, 'Total'), sum(ok, 'Bayar'), '', '', '', '']);
  };
  const load = () => swr('list', { sheet: 'Penjualan', from: $('#pjF').value, to: $('#pjT').value }, r0 => {
    const r = r0.slice().reverse(); window._pj = r;
    fillOpts($('#pjK'), r.map(x => x.Kasir), 'Semua kasir');
    draw();
  });
  window.load_pj = load; $('#pjGo').onclick = () => load().catch(fail); quickBind('pj');
  ['#pjQ', '#pjS', '#pjM', '#pjK'].forEach(s => { $(s).oninput = $(s).onchange = draw; });
  $('#pjRs').onclick = () => { $('#pjQ').value = ''; $('#pjS').value = ''; $('#pjM').value = ''; $('#pjK').value = ''; draw(); };
  window.strukLama = async id => {
    const s = (window._pj || []).find(x => x.ID === id);
    const d = (await api('list', { sheet: 'DetailPenjualan', from: s.Tanggal, to: s.Tanggal })).filter(x => x.NoNota === s.No);
    strukModal(s, d);
  };
  load().catch(fail);
}
function lunasi(type, id, sisa, cb) {
  modal('Pelunasan', `<div class="fg"><label class="f"><span>Nominal metode 1 (sisa ${rp(sisa)})</span><input class="num" inputmode="numeric" id="lj" value="${nf(sisa)}"></label><label class="f"><span>Metode 1</span><select id="lm"><option>Tunai</option><option>Transfer</option><option>QRIS</option><option>Debit</option></select></label><label class="f"><span>Nominal metode 2 (opsional)</span><input class="num" inputmode="numeric" id="lj2" value="0"></label><label class="f"><span>Metode 2</span><select id="lm2"><option>Transfer</option><option>QRIS</option><option>Tunai</option><option>Debit</option></select></label></div>`, async () => { const a=unf($('#lj').value),b=unf($('#lj2').value),payments=b>0?[{metode:$('#lm').value,jumlah:a},{metode:$('#lm2').value,jumlah:b}]:[]; await api('pay', { type, id, jumlah:a+b, metode:$('#lm').value, payments }); toast('Pembayaran dicatat'); cb(); }, 'Catat');
}
function batal(type, id, cb) {
  modal('Batalkan Transaksi', `<p>Stok akan dikembalikan otomatis. Tindakan ini tidak bisa dibatalkan.</p><br><label class="f"><span>Alasan</span><input id="ba" placeholder="mis. salah input"></label>`, async () => { await api('void', { type, id, alasan: $('#ba').value }); toast('Transaksi dibatalkan'); cb(); }, 'Batalkan transaksi');
}

/* ============ PEMBELIAN ============ */
async function pPembelian(v) {
  $('#topAct').innerHTML = '<button class="btn a" id="pbNew">+ Pembelian Baru</button>';
  const extra = `<input class="grow" id="pbQ" placeholder="Cari no nota / supplier / user..."><select id="pbS"><option value="">Semua status</option><option>Lunas</option><option>Hutang</option><option value="telat">Hutang lewat jatuh tempo</option><option>Batal</option></select><select id="pbSup"><option value="">Semua supplier</option></select><button class="btn" id="pbRs">Reset filter</button>`;
  v.innerHTML = quickBar('pb') + rangeBar('pb', 0, extra) + '<p class="note" id="pbInfo" style="margin-bottom:8px"></p><div id="pbR"></div>';
  let DATA = [];
  const draw = () => {
    const q = $('#pbQ').value.toLowerCase().trim(), st = $('#pbS').value, sp = $('#pbSup').value, t0 = today();
    const L = DATA.filter(x => (!st || (st === 'telat' ? (x.Status === 'Hutang' && x.JatuhTempo && x.JatuhTempo < t0) : x.Status === st)) && (!sp || x.Supplier === sp) && (!q || (x.No + ' ' + x.Supplier + ' ' + x.User + ' ' + x.Catatan).toLowerCase().includes(q)));
    const ok = L.filter(x => x.Batal !== 'Y');
    $('#pbInfo').textContent = 'Menampilkan ' + L.length + ' dari ' + DATA.length + ' nota';
    $('#pbR').innerHTML = tbl(['No', 'Tanggal', 'Supplier', 'Total', 'PPN', 'Bayar', 'Status', 'Jatuh Tempo', 'User', ''], L.map(x => [x.No, tglID(x.Tanggal), x.Supplier, x.Total, x.PPN, x.Bayar, H(badge(x.Status)), tglID(x.JatuhTempo), x.User,
      { h: `<button class="btn s" data-no="${e(x.No)}" data-tanggal="${e(x.Tanggal)}" onclick="detailBeli(this.dataset.no,this.dataset.tanggal)">Detail</button>${x.Status === 'Hutang' ? `<button class="btn s p" onclick="lunasi('beli','${x.ID}',${x.Total - x.Bayar},load_pb)">Bayar</button>` : ''}${x.Batal !== 'Y' ? `<button class="btn s" onclick="returBeliForm('${x.ID}',load_pb)">Retur</button><button class="btn s d" onclick="batal('beli','${x.ID}',load_pb)">Batal</button>` : ''}`, c: 'act' }]),
      ['Total ' + ok.length + ' nota', '', '', sum(ok, 'Total'), sum(ok, 'PPN'), sum(ok, 'Bayar'), '', '', '', '']);
  };
  const load = () => swr('list', { sheet: 'Pembelian', from: $('#pbF').value, to: $('#pbT').value }, r => {
    DATA = r.slice().reverse();
    fillOpts($('#pbSup'), DATA.map(x => x.Supplier), 'Semua supplier');
    draw();
  });
  window.load_pb = load; $('#pbGo').onclick = () => load().catch(fail); quickBind('pb');
  ['#pbQ', '#pbS', '#pbSup'].forEach(s => { $(s).oninput = $(s).onchange = draw; });
  $('#pbRs').onclick = () => { $('#pbQ').value = ''; $('#pbS').value = ''; $('#pbSup').value = ''; draw(); };
  window.detailBeli = async (no, t) => {
    const d = (await api('list', { sheet: 'DetailPembelian', from: t, to: t })).filter(x => x.NoNota === no);
    modal('Detail ' + no, tbl(['Barang', 'Qty', 'Harga', 'Subtotal'], d.map(x => [x.Nama, x.Qty, x.Harga, x.Subtotal])));
  };
  $('#pbNew').onclick = () => beliForm(load);
  load().catch(fail);
}
async function beliForm(done) {
  S.barang = await api('list', { sheet: 'Barang' });
  S.supplier = await api('list', { sheet: 'Supplier' });
  const items = S.barang.filter(b => b.Kategori !== 'Jasa' && b.Aktif !== 'N');
  if (!items.length) return toast('Tambahkan data barang terlebih dahulu', true);
  const lbl = b => b.Kode + ' · ' + b.Nama + (b.Ukuran ? ' ' + b.Ukuran : '') + ' (stok ' + b.Stok + ')';
  const byL = {}; items.forEach(b => byL[lbl(b)] = b);
  const rowH = () => `<tr><td><input class="bi" list="bl" placeholder="Ketik untuk cari barang" autocomplete="off" style="min-width:180px"></td><td><input class="bq num" inputmode="numeric" value="1" style="width:60px"></td><td><input class="bh num" inputmode="numeric" value="" placeholder="0" style="width:100px"></td><td><input class="bdot" placeholder="DOT" style="width:75px"></td><td><input class="bgar num" inputmode="numeric" placeholder="bln" style="width:55px"></td><td class="r bs">0</td><td><button class="btn s d" onclick="this.closest('tr').remove();beliCalc()">×</button></td></tr>`;
  const m = modal('Pembelian Baru', `<div class="fg"><label class="f"><span>Tanggal</span><input type="date" id="bT" value="${today()}"></label><label class="f"><span>Supplier</span><input id="bS" list="supl" placeholder="Pilih / ketik nama"><datalist id="supl">${S.supplier.map(s => `<option value="${e(s.Nama)}">`).join('')}</datalist></label></div><datalist id="bl">${items.map(b => `<option value="${e(lbl(b))}">`).join('')}</datalist><br>
  <div class="tw"><table><thead><tr><th>Barang</th><th>Qty</th><th>Harga beli</th><th>DOT</th><th>Garansi bln</th><th class="r">Subtotal</th><th></th></tr></thead><tbody id="bRows">${rowH()}</tbody></table></div>
  <button class="btn s" style="margin-top:8px" id="bAdd">+ Tambah baris</button>
  <div class="fg" style="margin-top:14px"><label class="f"><span>PPN</span><select id="bP"><option value="none">Tanpa PPN</option><option value="exclude">Harga belum termasuk PPN (+${ppnRate()}%)</option><option value="include">Harga sudah termasuk PPN (${ppnRate()}%)</option></select></label><label class="f"><span>Nominal metode 1</span><input class="num" inputmode="numeric" id="bB"></label><label class="f"><span>Metode 1</span><select id="bM"><option>Tunai</option><option>Transfer</option><option>QRIS</option><option>Debit</option></select></label><label class="f"><span>Nominal metode 2 (opsional)</span><input class="num" inputmode="numeric" id="bB2"></label><label class="f"><span>Metode 2</span><select id="bM2"><option>Transfer</option><option>QRIS</option><option>Tunai</option><option>Debit</option></select></label><label class="f"><span>Jatuh tempo hutang</span><input type="date" id="bDue"></label></div>
  <div style="margin-top:12px;text-align:right"><div class="note">Subtotal: <b id="bSub">Rp 0</b> &nbsp;·&nbsp; PPN: <b id="bPpn">Rp 0</b></div><div>Total: <b class="tot" id="bTot">Rp 0</b></div></div>`, async () => {
    const its = [...document.querySelectorAll('#bRows tr')].map(r => {
      const b = byL[r.querySelector('.bi').value];
      if (!b) throw new Error('Pilih barang dari daftar pada setiap baris');
      return { id: b.ID, qty: unf(r.querySelector('.bq').value), harga: unf(r.querySelector('.bh').value), dot:r.querySelector('.bdot').value, garansiBulan:unf(r.querySelector('.bgar').value) };
    });
    const tot = ppnCalc(its.reduce((p, c) => p + c.qty * c.harga, 0), $('#bP').value).total, b = $('#bB').value, b2=unf($('#bB2').value); const pays=b2>0?[{metode:$('#bM').value,jumlah:b===''?Math.max(0,tot-b2):unf(b)},{metode:$('#bM2').value,jumlah:b2}]:[];
    await api('savePurchase', { tanggal: $('#bT').value, supplier: $('#bS').value, items: its, ppn: $('#bP').value, bayar: pays.length?pays.reduce((a,x)=>a+x.jumlah,0):(b === '' ? tot : unf(b)), payments:pays, metode:$('#bM').value, jatuhTempo:$('#bDue').value });
    toast('Pembelian tersimpan, stok bertambah'); done();
  }, 'Simpan Pembelian', true);
  window.beliCalc = () => { let t = 0; document.querySelectorAll('#bRows tr').forEach(r => { const s = unf(r.querySelector('.bq').value) * unf(r.querySelector('.bh').value); r.querySelector('.bs').textContent = nf(s); t += s; }); const pc = ppnCalc(t, $('#bP').value); $('#bSub').textContent = rp(t); $('#bPpn').textContent = rp(pc.ppn); $('#bTot').textContent = rp(pc.total); };
  const bind = () => document.querySelectorAll('#bRows tr').forEach(r => {
    r.querySelector('.bi').oninput = ev => { const b = byL[ev.target.value]; if (b) r.querySelector('.bh').value = nf(b.HargaBeli); beliCalc(); };
    r.querySelector('.bq').oninput = r.querySelector('.bh').oninput = beliCalc;
  });
  $('#bAdd').onclick = () => { $('#bRows').insertAdjacentHTML('beforeend', rowH()); bind(); beliCalc(); };
  $('#bP').onchange = beliCalc; bind(); beliCalc();
}

/* ============ CRUD UMUM ============ */
const _cr = {}, _cf = {};
function crud(v, cfg) {
  const rg = cfg.range ? (_cr[cfg.sheet] = _cr[cfg.sheet] || { f: mStart(), t: today() }) : null;
  return swr('list', { sheet: cfg.sheet, ...(rg ? { from: rg.f, to: rg.t } : {}) }, rows => crudPaint(v, cfg, rg, rows));
}
function crudPaint(v, cfg, rg, rows) {
  const A = isAdmin(), canEdit = A || cfg.kasir;
  if (cfg.sheet === 'Barang') S.barang = rows; if (cfg.sheet === 'Pelanggan') S.pelanggan = rows;
  const FL = cfg.filters || [], st = (_cf[cfg.sheet] = _cf[cfg.sheet] || { q: '', f: [] });
  const optHtml = (f, i) => {
    const o = typeof f.o === 'function' ? [...new Set(f.o(rows).filter(Boolean))].sort().map(x => [x, x]) : f.o;
    return `<select data-fi="${i}"><option value="">${e(f.l)}</option>${o.map(x => `<option value="${e(x[0])}" ${String(st.f[i] ?? '') === String(x[0]) ? 'selected' : ''}>${e(x[1])}</option>`).join('')}</select>`;
  };
  v.innerHTML = (rg ? quickBar('cr') + `<div class="bar"><label>Dari <input type="date" id="crF" value="${rg.f}"></label><label>Sampai <input type="date" id="crT" value="${rg.t}"></label><button class="btn p" id="crGo">Tampilkan</button></div>` : '')
    + `<div class="bar"><input class="grow" id="cq" placeholder="Cari..." value="${e(st.q)}">${FL.map(optHtml).join('')}${FL.length ? '<button class="btn" id="cRs">Reset filter</button>' : ''}<span id="cInfo" class="note"></span>${canEdit ? `<button class="btn a" id="cAdd">+ Tambah</button>` : ''}${cfg.csv ? '<button class="btn" id="cCsv">Ekspor CSV</button>' : ''}</div><div id="cT"></div>`;
  let cur = [];
  const draw = () => {
    st.q = $('#cq').value; const q = st.q.toLowerCase().trim();
    document.querySelectorAll('select[data-fi]').forEach(s => { st.f[+s.dataset.fi] = s.value; });
    const L = rows.filter(r => FL.every((f, i) => !st.f[i] || f.t(r, st.f[i])) && (!q || Object.values(r).join(' ').toLowerCase().includes(q))).slice().reverse();
    cur = L;
    $('#cInfo').textContent = L.length + ' dari ' + rows.length + ' data';
    const visibleCols = cfg.sheet === 'Barang' && !A ? cfg.cols.filter(c => c[0] !== 'Harga Beli') : cfg.cols;
    $('#cT').innerHTML = tbl([...visibleCols.map(c => c[0]), ''], L.map(r => [...visibleCols.map(c => c[1](r)), { h: (cfg.extra ? cfg.extra(r) : '') + (canEdit ? `<button class="btn s" data-e="${r.ID}">Ubah</button>` : '') + (A ? `<button class="btn s d" data-d="${r.ID}">${['Barang','Pelanggan','Supplier'].includes(cfg.sheet) ? 'Nonaktifkan' : 'Hapus'}</button>` : ''), c: 'act' }]), cfg.foot ? cfg.foot(L) : undefined);
  };
  const save = async o => { await api('save', { sheet: cfg.sheet, row: o }); toast('Data tersimpan'); reload().catch(fail); };
  const reload = () => crud(v, cfg);
  window['reload_' + cfg.sheet] = reload;
  $('#cq').oninput = draw;
  document.querySelectorAll('select[data-fi]').forEach(s => { s.onchange = draw; });
  if ($('#cRs')) $('#cRs').onclick = () => { $('#cq').value = ''; document.querySelectorAll('select[data-fi]').forEach(s => { s.value = ''; }); draw(); };
  if (rg) { $('#crGo').onclick = () => { rg.f = $('#crF').value; rg.t = $('#crT').value; reload().catch(fail); }; quickBind('cr'); }
  draw();
  $('#cT').onclick = ev => {
    const b = ev.target.closest('[data-e],[data-d]'); if (!b) return;
    if (b.dataset.e) formModal('Ubah ' + cfg.name, cfg.fields, rows.find(x => x.ID === b.dataset.e), save);
    else confirmBox(['Barang','Pelanggan','Supplier'].includes(cfg.sheet) ? 'Nonaktifkan data ini? Riwayat transaksi lama tetap tersimpan.' : 'Hapus data ini?', async () => { await api('del', { sheet: cfg.sheet, id: b.dataset.d }); toast(['Barang','Pelanggan','Supplier'].includes(cfg.sheet) ? 'Data dinonaktifkan' : 'Data dihapus'); reload().catch(fail); });
  };
  if ($('#cAdd')) $('#cAdd').onclick = () => formModal('Tambah ' + cfg.name, cfg.fields, cfg.def ? cfg.def() : {}, save);
  if ($('#cCsv')) $('#cCsv').onclick = () => csv(cfg.sheet, cfg.cols.map(c => c[0]), cur.map(r => cfg.cols.map(c => { const x = c[1](r); return x && x.h !== undefined ? x.h.replace(/<[^>]+>/g, '') : x; })));
}
const STATUS_F = { l: 'Semua status', o: [['Y', 'Aktif'], ['N', 'Nonaktif']], t: (r, v) => v === 'N' ? r.Aktif === 'N' : r.Aktif !== 'N' };
const CUST_F = [{ k: 'Nama', l: 'Nama', req: 1 }, { k: 'Telp', l: 'No. HP / WA' }, { k: 'Kendaraan', l: 'Kendaraan / Plat' }, { k: 'Alamat', l: 'Alamat', full: 1 }, { k: 'Catatan', l: 'Catatan', t: 'textarea', full: 1 }];
const pPelanggan = v => crud(v, {
  sheet: 'Pelanggan', name: 'Pelanggan', kasir: 1, fields: CUST_F,
  filters: [STATUS_F, { l: 'Semua data', o: [['hp', 'Belum ada No. HP'], ['kend', 'Belum ada kendaraan']], t: (r, v) => v === 'hp' ? !String(r.Telp || '').trim() : !String(r.Kendaraan || '').trim() }],
  cols: [['Nama', r => r.Nama], ['HP', r => r.Telp], ['Kendaraan', r => r.Kendaraan], ['Alamat', r => r.Alamat], ['Status', r => r.Aktif === 'N' ? 'Nonaktif' : 'Aktif']]
});
const pSupplier = v => crud(v, {
  sheet: 'Supplier', name: 'Supplier',
  fields: [{ k: 'Nama', l: 'Nama Supplier', req: 1 }, { k: 'Telp', l: 'No. HP / Telp' }, { k: 'Alamat', l: 'Alamat', full: 1 }, { k: 'Catatan', l: 'Catatan', t: 'textarea', full: 1 }],
  filters: [STATUS_F, { l: 'Semua data', o: [['telp', 'Belum ada No. Telp']], t: (r, v) => !String(r.Telp || '').trim() }],
  cols: [['Nama', r => r.Nama], ['Telp', r => r.Telp], ['Alamat', r => r.Alamat], ['Catatan', r => r.Catatan], ['Status', r => r.Aktif === 'N' ? 'Nonaktif' : 'Aktif']]
});
const pPengeluaran = v => crud(v, {
  sheet: 'Pengeluaran', name: 'Pengeluaran', range: 1, csv: 1, def: () => ({ Tanggal: today() }),
  fields: [{ k: 'Tanggal', l: 'Tanggal', t: 'date', req: 1 }, { k: 'Kategori', l: 'Kategori', t: 'select', o: ['Gaji', 'Listrik & Air', 'Sewa', 'Transport', 'Perawatan', 'Lain-lain'] }, { k: 'Keterangan', l: 'Keterangan', full: 1 }, { k: 'Jumlah', l: 'Jumlah (Rp)', t: 'number', req: 1 }],
  filters: [{ l: 'Semua kategori', o: rows => rows.map(r => r.Kategori), t: (r, v) => r.Kategori === v }, { l: 'Semua user', o: rows => rows.map(r => r.User), t: (r, v) => r.User === v }],
  cols: [['Tanggal', r => tglID(r.Tanggal)], ['Kategori', r => r.Kategori], ['Keterangan', r => r.Keterangan], ['Jumlah', r => r.Jumlah], ['User', r => r.User]],
  foot: L => ['TOTAL ' + L.length + ' data', '', '', sum(L, 'Jumlah'), '', '']
});
const pBarang = v => crud(v, {
  sheet: 'Barang', name: 'Barang', kasir: 0, csv: 1,
  def: () => ({ Satuan: 'Pcs', StokMin: 2 }),
  fields: [{ k: 'Kode', l: 'Kode (kosong = otomatis)' }, { k: 'Nama', l: 'Nama barang', req: 1 }, { k: 'Kategori', l: 'Kategori', t: 'select', o: cats }, { k: 'Merek', l: 'Merek' }, { k: 'Ukuran', l: 'Ukuran / Tipe', ph: 'mis. 185/65 R15' },
    { k: 'Satuan', l: 'Satuan', t: 'select', o: ['Pcs', 'Set', 'Unit', 'Liter', 'Kali'] }, { k: 'HargaBeli', l: 'Harga beli', t: 'number' }, { k: 'HargaJual', l: 'Harga eceran', t: 'number', req: 1 }, { k: 'HargaGrosir', l: 'Harga grosir', t: 'number' }, { k: 'HargaBengkel', l: 'Harga bengkel', t: 'number' },
    { k: 'Stok', l: 'Stok awal', t: 'number', newOnly: 1 }, { k: 'StokMin', l: 'Stok minimum', t: 'number' }, { k: 'Lokasi', l: 'Lokasi rak' }, { k: 'Aktif', l: 'Status', t: 'select', o: [['Y', 'Aktif'], ['N', 'Nonaktif']], def: 'Y' }],
  filters: [
    { l: 'Semua kategori', o: rows => rows.map(r => r.Kategori), t: (r, v) => r.Kategori === v },
    { l: 'Semua merek', o: rows => rows.map(r => r.Merek), t: (r, v) => r.Merek === v },
    { l: 'Semua kondisi stok', o: [['habis', 'Stok habis'], ['tipis', 'Stok menipis'], ['aman', 'Stok aman']], t: (r, v) => r.Kategori !== 'Jasa' && (v === 'habis' ? r.Stok <= 0 : v === 'tipis' ? (r.Stok > 0 && r.Stok <= r.StokMin) : r.Stok > r.StokMin) },
    { l: 'Semua lokasi', o: rows => rows.map(r => r.Lokasi), t: (r, v) => r.Lokasi === v },
    STATUS_F
  ],
  cols: [['Kode', r => r.Kode], ['Nama', r => r.Nama + (r.Ukuran ? ' · ' + r.Ukuran : '')], ['Kategori', r => r.Kategori], ['Merek', r => r.Merek], ['Harga Beli', r => r.HargaBeli], ['Harga Jual', r => r.HargaJual],
    ['Stok', r => r.Kategori === 'Jasa' ? H('-') : H(`<span class="bd ${r.Stok <= 0 ? 'bad' : r.Stok <= r.StokMin ? 'warn' : 'ok'}">${r.Stok} ${e(r.Satuan)}</span>`)], ['Status', r => r.Aktif === 'N' ? 'Nonaktif' : 'Aktif']],
  extra: r => isAdmin() && r.Kategori !== 'Jasa' ? `<button class="btn s" onclick="opname('${r.ID}')">Stok</button>` : ''
});
function opname(id) {
  const b = S.barang.find(x => x.ID === id);
  modal('Penyesuaian Stok: ' + b.Nama, `<div class="fg"><label class="f"><span>Stok sistem</span><input value="${b.Stok}" disabled></label><label class="f"><span>Stok fisik (hasil hitung)</span><input class="num" inputmode="numeric" id="op" value="${nf(b.Stok)}"></label><label class="f full"><span>Keterangan</span><input id="ok" value="Stok opname"></label></div>`, async () => { await api('adjust', { id, stokBaru: unf($('#op').value), ket: $('#ok').value }); toast('Stok disesuaikan'); window.reload_Barang(); });
}

/* ============ MUTASI STOK ============ */
async function pMutasi(v) {
  const extra = `<input class="grow" id="mtQ" placeholder="Cari barang / ref / keterangan..."><select id="mtJ"><option value="">Semua jenis</option></select><select id="mtA"><option value="">Masuk &amp; keluar</option><option value="in">Stok masuk (+)</option><option value="out">Stok keluar (-)</option></select><select id="mtU"><option value="">Semua user</option></select><button class="btn" id="mtRs">Reset filter</button>`;
  v.innerHTML = quickBar('mt') + rangeBar('mt', 0, extra) + '<p class="note" id="mtInfo" style="margin-bottom:8px"></p><div id="mtR"></div>';
  let DATA = [];
  const draw = () => {
    const q = $('#mtQ').value.toLowerCase().trim(), jn = $('#mtJ').value, ar = $('#mtA').value, us = $('#mtU').value;
    const L = DATA.filter(x => (!jn || x.Jenis === jn) && (!us || x.User === us) && (!ar || (ar === 'in' ? x.Qty > 0 : x.Qty < 0)) && (!q || (x.Nama + ' ' + x.Ref + ' ' + x.Ket + ' ' + x.User).toLowerCase().includes(q)));
    $('#mtInfo').textContent = 'Menampilkan ' + L.length + ' dari ' + DATA.length + ' mutasi';
    $('#mtR').innerHTML = tbl(['Tanggal', 'Barang', 'Jenis', 'Qty', 'Stok Akhir', 'Ref', 'User', 'Ket'], L.map(x => [tglID(x.Tanggal) + ' ' + x.Waktu, x.Nama, x.Jenis, x.Qty, x.StokAkhir, x.Ref, x.User, x.Ket]));
  };
  const load = () => swr('list', { sheet: 'Mutasi', from: $('#mtF').value, to: $('#mtT').value }, r => {
    DATA = r.slice().reverse();
    fillOpts($('#mtJ'), DATA.map(x => x.Jenis), 'Semua jenis');
    fillOpts($('#mtU'), DATA.map(x => x.User), 'Semua user');
    draw();
  });
  $('#mtGo').onclick = () => load().catch(fail); quickBind('mt');
  ['#mtQ', '#mtJ', '#mtA', '#mtU'].forEach(s => { $(s).oninput = $(s).onchange = draw; });
  $('#mtRs').onclick = () => { $('#mtQ').value = ''; $('#mtJ').value = ''; $('#mtA').value = ''; $('#mtU').value = ''; draw(); };
  load().catch(fail);
}


async function pServis(v) {
  v.innerHTML = quickBar('sv') + `<div class="bar"><label>Dari <input type="date" id="svF"></label><label>Sampai <input type="date" id="svT"></label><button class="btn p" id="svGo">Tampilkan</button><input class="grow" id="svQ" placeholder="Cari plat / pelanggan / keluhan / pekerjaan / barang..."><select id="svM"><option value="">Semua montir</option></select><select id="svJ"><option value="">Semua jadwal</option><option value="dekat">Servis berikut: akan datang</option><option value="lewat">Servis berikut: sudah lewat</option><option value="none">Tanpa jadwal</option></select><button class="btn" id="svRs">Reset filter</button></div><div class="bar"><button class="btn a" id="svAdd">+ Catat Servis</button><input id="svWarranty" placeholder="Cari DOT / plat untuk cek garansi"><button class="btn" id="svWarrantyGo">Cek Garansi</button></div><p class="note" id="svInfo" style="margin-bottom:8px"></p><div id="svRows"></div>`;
  let DATA = [];
  const draw = () => {
    const q = $('#svQ').value.toLowerCase().trim(), mt = $('#svM').value, jd = $('#svJ').value, t0 = today();
    const L = DATA.filter(x => (!mt || x.Montir === mt) && (!jd || (jd === 'dekat' ? (x.JadwalBerikut && x.JadwalBerikut >= t0) : jd === 'lewat' ? (x.JadwalBerikut && x.JadwalBerikut < t0) : !x.JadwalBerikut)) && (!q || [x.PlatNomor, x.Pelanggan, x.Keluhan, x.Pekerjaan, x.Barang, x.Catatan].join(' ').toLowerCase().includes(q)));
    const up = DATA.filter(x => x.JadwalBerikut && x.JadwalBerikut >= t0).length;
    $('#svInfo').textContent = 'Menampilkan ' + L.length + ' dari ' + DATA.length + ' riwayat · Pengingat servis mendatang: ' + up + ' kendaraan';
    $('#svRows').innerHTML = tbl(['Tanggal', 'Plat Nomor', 'Pelanggan', 'Keluhan', 'Pekerjaan', 'Montir', 'Biaya Jasa', 'Komisi', 'Servis Berikut'],
      L.map(x => [tglID(x.Tanggal), x.PlatNomor, x.Pelanggan, x.Keluhan, x.Pekerjaan, x.Montir, x.BiayaJasa, x.Komisi, tglID(x.JadwalBerikut)]),
      ['TOTAL ' + L.length + ' servis', '', '', '', '', '', sum(L, 'BiayaJasa'), sum(L, 'Komisi'), '']);
  };
  const load = () => swr('serviceList', { from: $('#svF').value, to: $('#svT').value }, r => {
    DATA = r;
    fillOpts($('#svM'), DATA.map(x => x.Montir), 'Semua montir');
    draw();
  });
  $('#svGo').onclick = () => load().catch(fail); quickBind('sv');
  ['#svQ', '#svM', '#svJ'].forEach(s => { $(s).oninput = $(s).onchange = draw; });
  $('#svRs').onclick = () => { $('#svQ').value = ''; $('#svM').value = ''; $('#svJ').value = ''; draw(); };
  $('#svWarrantyGo').onclick = async () => {
    try {
      const z = await api('warrantyInfo', { q: $('#svWarranty').value });
      $('#svInfo').textContent = 'Hasil cek garansi: ' + z.length + ' data. Klik Tampilkan untuk kembali ke riwayat servis.';
      $('#svRows').innerHTML = tbl(['Nota', 'Tanggal', 'Barang', 'DOT', 'Plat', 'Pelanggan', 'Garansi', 'Berlaku Sampai', 'Status'], z.map(x => [x.NoNota, tglID(x.Tanggal), x.Barang, x.DOT, x.PlatNomor, x.Pelanggan, x.GaransiBulan + ' bln', tglID(x.BerlakuSampai), x.Status]));
    } catch (x) { fail(x); }
  };
  $('#svAdd').onclick = () => formModal('Catat Riwayat Servis', [{ k: 'Tanggal', l: 'Tanggal', t: 'date', req: 1, def: today() }, { k: 'PlatNomor', l: 'Plat nomor', req: 1 }, { k: 'Pelanggan', l: 'Nama pelanggan' }, { k: 'Keluhan', l: 'Keluhan', t: 'textarea', full: 1 }, { k: 'Pekerjaan', l: 'Pekerjaan / jasa', t: 'textarea', full: 1 }, { k: 'Barang', l: 'Barang yang dipasang' }, { k: 'Montir', l: 'Nama montir' }, { k: 'BiayaJasa', l: 'Biaya jasa', t: 'number' }, { k: 'Komisi', l: 'Komisi montir', t: 'number' }, { k: 'Km', l: 'Kilometer', t: 'number' }, { k: 'JadwalBerikut', l: 'Jadwal servis berikutnya', t: 'date' }, { k: 'Catatan', l: 'Catatan', t: 'textarea', full: 1 }], {}, async row => { await api('saveService', { row }); toast('Riwayat servis disimpan'); load().catch(fail); });
  load().catch(fail);
}

/* ============ LAPORAN ============ */
async function pLaporan(v) {
  v.innerHTML = rangeBar('lp', 0, '<button class="btn" onclick="window.print()">Cetak</button><button class="btn" id="lpCsv">Ekspor CSV</button>') + '<div class="tabs" id="lpTabs"></div><div class="card"><div class="ph"><h2>' + e(S.cfg.nama_toko) + '</h2></div><div id="lpR"></div></div>';
  const TABS = ['Laba Rugi', 'Penjualan', 'Produk Terjual', 'Pembelian', 'Stok Barang', 'Piutang & Hutang', 'Pengeluaran', 'Retur', 'Retur Beli', 'PPN Masukan', 'PPN Keluaran', 'Komisi Montir'];
  let D = null, tab = 0, cur = null;
  const draw = () => {
    $('#lpTabs').innerHTML = TABS.map((t, i) => `<button class="${i === tab ? 'on' : ''}" data-t="${i}">${t}</button>`).join('');
    document.querySelectorAll('#lpTabs button').forEach(b => b.onclick = () => { tab = +b.dataset.t; draw(); });
    if (!D) return; const f = $('#lpF').value, t = $('#lpT').value, per = `Periode ${tglID(f)} s/d ${tglID(t)}`;
    const J = D.penjualan.filter(x => x.Batal !== 'Y'), ok = {}; J.forEach(x => ok[x.No] = 1);
    const DJ = D.detailJual.filter(x => ok[x.NoNota]), B = D.pembelian.filter(x => x.Batal !== 'Y');
    let heads, rows, foot, html;
    if (tab === 0) {
      const omzet = sum(J, 'Subtotal'), disk = sum(J, 'Diskon'), hpp = DJ.reduce((p, c) => p + c.HPP * c.Qty, 0), RT = D.retur || [], rTot = sum(RT, 'Total'), hppBalik = rTot - sum(RT, 'Laba'), kotor = sum(J, 'Laba') - sum(RT, 'Laba'), biaya = sum(D.pengeluaran, 'Jumlah');
      heads = ['Keterangan', 'Jumlah (Rp)']; rows = [['Penjualan kotor', omzet], ['Diskon nota', -disk], ['Penjualan bersih', omzet - disk], ['Retur penjualan', -rTot], ['Penjualan neto', omzet - disk - rTot], ['Harga pokok penjualan (HPP, setelah retur)', -(hpp - hppBalik)], ['Laba kotor', kotor], ['Biaya operasional', -biaya], ['LABA BERSIH', kotor - biaya], ['', ''], ['Info: total pembelian stok (setelah retur)', sum(B, 'Total') - sum(D.returBeli || [], 'Total')], ['Info: PPN masukan (setelah retur)', sum(B, 'PPN') - sum(D.returBeli || [], 'PPN')], ['Info: jumlah transaksi penjualan', J.length]];
    } else if (tab === 1) {
      heads = ['No', 'Tanggal', 'Pelanggan', 'Metode', 'Total', 'Bayar', 'Laba', 'Status']; rows = D.penjualan.map(x => [x.No, tglID(x.Tanggal), x.Pelanggan, x.Metode, x.Total, x.Bayar, x.Laba, x.Status]); foot = ['TOTAL', '', '', '', sum(J, 'Total'), sum(J, 'Bayar'), sum(J, 'Laba'), '(tanpa batal)'];
    } else if (tab === 2) {
      const m = {}; DJ.forEach(x => { const k = x.Nama; m[k] = m[k] || { q: 0, o: 0, l: 0 }; m[k].q += x.Qty; m[k].o += x.Subtotal; m[k].l += x.Subtotal - x.HPP * x.Qty; });
      heads = ['Produk', 'Qty', 'Omzet', 'Laba']; rows = Object.keys(m).sort((a, b) => m[b].q - m[a].q).map(k => [k, m[k].q, m[k].o, m[k].l]); foot = ['TOTAL', rows.reduce((p, c) => p + c[1], 0), rows.reduce((p, c) => p + c[2], 0), rows.reduce((p, c) => p + c[3], 0)];
    } else if (tab === 3) {
      heads = ['No', 'Tanggal', 'Supplier', 'Total', 'PPN', 'Bayar', 'Status']; rows = D.pembelian.map(x => [x.No, tglID(x.Tanggal), x.Supplier, x.Total, x.PPN, x.Bayar, x.Status]); foot = ['TOTAL', '', '', sum(B, 'Total'), sum(B, 'PPN'), sum(B, 'Bayar'), ''];
    } else if (tab === 4) {
      const bs = D.barang.filter(b => b.Kategori !== 'Jasa');
      heads = ['Kode', 'Barang', 'Kategori', 'Stok', 'Harga Beli', 'Nilai Beli', 'Nilai Jual']; rows = bs.map(b => [b.Kode, b.Nama + ' ' + b.Ukuran, b.Kategori, b.Stok, b.HargaBeli, b.Stok * b.HargaBeli, b.Stok * b.HargaJual]); foot = ['TOTAL', '', '', sum(bs, 'Stok'), '', rows.reduce((p, c) => p + c[5], 0), rows.reduce((p, c) => p + c[6], 0)];
    } else if (tab === 5) {
      heads = ['Jenis', 'No', 'Tanggal', 'Pihak', 'Total', 'Bayar', 'Sisa', 'Jatuh Tempo']; rows = [...J.filter(x => x.Total > x.Bayar).map(x => ['Piutang', x.No, tglID(x.Tanggal), x.Pelanggan, x.Total, x.Bayar, x.Total - x.Bayar, tglID(x.JatuhTempo)]), ...B.filter(x => x.Total > x.Bayar).map(x => ['Hutang', x.No, tglID(x.Tanggal), x.Supplier, x.Total, x.Bayar, x.Total - x.Bayar, tglID(x.JatuhTempo)])];
    } else if (tab === 6) {
      heads = ['Tanggal', 'Kategori', 'Keterangan', 'Jumlah']; rows = D.pengeluaran.map(x => [tglID(x.Tanggal), x.Kategori, x.Keterangan, x.Jumlah]); foot = ['TOTAL', '', '', sum(D.pengeluaran, 'Jumlah')];
    } else if (tab === 7) {
      const RR = D.retur || [];
      heads = ['No Retur', 'Tanggal', 'Nota', 'Pelanggan', 'Total', 'Potong Piutang', 'Uang Kembali', 'Alasan']; rows = RR.map(x => [x.No, tglID(x.Tanggal), x.NoNota, x.Pelanggan, x.Total, x.PotongPiutang, x.UangKembali, x.Alasan]); foot = ['TOTAL', '', '', '', sum(RR, 'Total'), sum(RR, 'PotongPiutang'), sum(RR, 'UangKembali'), ''];
    } else if (tab === 8) {
      const RB = D.returBeli || [];
      heads = ['No Retur', 'Tanggal', 'Nota Beli', 'Supplier', 'Total', 'Potong Hutang', 'Uang Kembali', 'Alasan']; rows = RB.map(x => [x.No, tglID(x.Tanggal), x.NoNota, x.Supplier, x.Total, x.PotongHutang, x.UangKembali, x.Alasan]); foot = ['TOTAL', '', '', '', sum(RB, 'Total'), sum(RB, 'PotongHutang'), sum(RB, 'UangKembali'), ''];
    } else if (tab === 9) {
      const RB = D.returBeli || [];
      heads = ['No', 'Tanggal', 'Supplier', 'DPP', 'PPN'];
      rows = [...B.filter(x => x.PPN > 0).map(x => [x.No, tglID(x.Tanggal), x.Supplier, x.Total - x.PPN, x.PPN]), ...RB.filter(x => x.PPN > 0).map(x => [x.No + ' (retur)', tglID(x.Tanggal), x.Supplier, -(x.Total - x.PPN), -x.PPN])];
      foot = ['TOTAL PPN MASUKAN', '', '', rows.reduce((p, c) => p + c[3], 0), rows.reduce((p, c) => p + c[4], 0)];
    } else if (tab === 10) {
      heads = ['No', 'Tanggal', 'Pelanggan', 'DPP', 'PPN Keluaran', 'Total']; rows = J.map(x => [x.No, tglID(x.Tanggal), x.Pelanggan, x.DPP || x.Total, x.PPN || 0, x.Total]); foot = ['TOTAL', '', '', sum(J,'DPP'), sum(J,'PPN'), sum(J,'Total')];
    } else {
      const comm=DJ.filter(x=>(+x.Komisi||0)>0); heads=['Tanggal','No Nota','Barang / Jasa','Montir','Qty','Komisi']; rows=comm.map(x=>[tglID(x.Tanggal),x.NoNota,x.Nama,x.Montir,x.Qty,x.Komisi]); foot=['TOTAL','','','', '',sum(comm,'Komisi')];
    }
    cur = { heads, rows, name: 'laporan-' + TABS[tab].replace(/\W+/g, '-').toLowerCase() };
    $('#lpR').innerHTML = `<h3>${TABS[tab]}</h3><p class="note" style="margin-bottom:10px">${tab === 4 ? 'Posisi stok saat ini' : per}</p>` + tbl(heads, rows, foot, true);
  };
  const load = () => swr('report', { from: $('#lpF').value, to: $('#lpT').value }, r => { D = r; draw(); });
  $('#lpGo').onclick = () => load().catch(fail); $('#lpCsv').onclick = () => cur && csv(cur.name, cur.heads, cur.rows); draw(); load().catch(fail);
}

/* ============ PENGATURAN ============ */
const VIEWS = [['Klasik', 'Produk di kiri, keranjang di kanan'], ['Keranjang Kiri', 'Keranjang di kiri, produk di kanan'], ['Daftar Ringkas', 'Produk berbentuk daftar, muat banyak'], ['Layar Sentuh', 'Tombol besar untuk tablet / HP'], ['Atas - Bawah', 'Produk di atas, keranjang melebar di bawah'], ['Mode Gelap', 'Tampilan gelap, nyaman di toko redup']];
function thumb(n) {
  const R = (x, y, w, h, f = '#fff') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${f}" stroke="rgba(120,130,140,.45)"/>`;
  const G = (x, y, c, r, w, h, g, f) => { let o = ''; for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) o += `<rect x="${x + j * (w + g)}" y="${y + i * (h + g)}" width="${w}" height="${h}" rx="2" fill="${f}"/>`; return o; };
  const cart = (x, y, w, h, f, l, b) => R(x, y, w, h, f) + G(x + 4, y + 5, 1, 4, w - 8, 5, 5, l) + R(x + 4, y + h - 13, w - 8, 9, b);
  let bg = '#eef1f4', o = '';
  if (n == 1) o = R(3, 3, 70, 70) + G(7, 7, 3, 3, 19, 19, 3, '#cfe0ee') + cart(77, 3, 40, 70, '#fff', '#dfe5eb', '#f0a202');
  if (n == 2) o = cart(3, 3, 40, 70, '#fff', '#dfe5eb', '#f0a202') + R(47, 3, 70, 70) + G(51, 7, 3, 3, 19, 19, 3, '#cfe0ee');
  if (n == 3) o = R(3, 3, 70, 70) + G(7, 7, 1, 7, 62, 6, 3, '#cfe0ee') + cart(77, 3, 40, 70, '#fff', '#dfe5eb', '#f0a202');
  if (n == 4) o = R(3, 3, 70, 70) + G(7, 7, 2, 2, 30, 30, 4, '#cfe0ee') + cart(77, 3, 40, 70, '#fff', '#dfe5eb', '#f0a202');
  if (n == 5) o = R(3, 3, 114, 36) + G(7, 7, 6, 2, 15, 12, 4, '#cfe0ee') + R(3, 43, 114, 30) + G(7, 47, 1, 2, 70, 5, 4, '#dfe5eb') + R(88, 57, 25, 12, '#f0a202');
  if (n == 6) { bg = '#1f2933'; o = R(3, 3, 70, 70, '#2b3846') + G(7, 7, 3, 3, 19, 19, 3, '#46617a') + cart(77, 3, 40, 70, '#2b3846', '#46617a', '#f0a202'); }
  return `<svg viewBox="0 0 120 76"><rect width="120" height="76" fill="${bg}"/>${o}</svg>`;
}
async function setView(n) {
  try {
    S.cfg = await api('saveSettings', { tampilan_kasir: n });
    document.querySelectorAll('.tile').forEach((t, i) => t.classList.toggle('on', i + 1 === n));
    toast('Tampilan kasir: ' + VIEWS[n - 1][0]);
  } catch (x) { fail(x); }
}

async function pPengaturan(v) {
  const c = S.cfg, F = [['nama_toko', 'Nama toko'], ['telp', 'Telepon / WA'], ['alamat', 'Alamat', 1], ['footer_struk', 'Catatan kaki struk', 1], ['prefix_beli', 'Awalan nomor nota beli'], ['kategori', 'Kategori barang (pisahkan koma; "Jasa" = tanpa stok)', 1], ['ppn_persen', 'Tarif PPN pembelian (%)'], ['ppn_hpp', 'PPN masuk ke harga pokok barang?', 0, [['N', 'Tidak (PPN = pajak masukan)'], ['Y', 'Ya (PPN tidak dikreditkan)']]]];
  const acc = (id, title, body, open) => `<details class="acc" id="${id}" ${open ? 'open' : ''}><summary>${title}</summary><div class="accb">${body}</div></details>`;
  v.innerHTML =
    acc('acProfil', 'Profil Toko & Nota',
      `<div class="fg">${F.map(f => `<label class="f ${f[2] ? 'full' : ''}"><span>${f[1]}</span>${f[3] ? `<select id="cf_${f[0]}">${f[3].map(o => `<option value="${o[0]}" ${c[f[0]] === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>` : `<input id="cf_${f[0]}" value="${e(c[f[0]])}">`}</label>`).join('')}</div><br><button class="btn p" id="cfSave">Simpan Pengaturan</button>`, true) +
    acc('acView', 'Tampilan Kasir / Penjualan',
      `<p class="note" style="margin-bottom:12px">Pilih tampilan halaman Kasir. Berlaku untuk semua pengguna.</p><div class="tiles">${VIEWS.map((t, i) => `<button class="tile ${(+S.cfg.tampilan_kasir || 1) === i + 1 ? 'on' : ''}" onclick="setView(${i + 1})">${thumb(i + 1)}<b>${i + 1}. ${t[0]}</b><small>${t[1]}</small></button>`).join('')}</div>`) +
    acc('acPw', 'Ganti Password',
      `<div class="fg"><label class="f full"><span>Password lama</span><input type="password" id="pl"></label><label class="f full"><span>Password baru (min. 6 karakter)</span><input type="password" id="pn"></label></div><br><button class="btn p" id="pwSave">Ubah Password</button>`) +
    acc('acBackup', 'Backup Data', `<div id="bk">Memuat...</div>`) +
    acc('acUser', 'Pengguna Aplikasi', `<div id="usr">Memuat...</div>`) +
    acc('acTips', 'Tips', `<p class="note">Data tersimpan di Google Spreadsheet milik Anda. Backup rutin: File → Buat salinan. Jasa pasang/balancing: buat barang berkategori "Jasa" agar tidak mengurangi stok.</p>`);

  $('#cfSave').onclick = async () => { try { const o = {}; F.forEach(f => o[f[0]] = $('#cf_' + f[0]).value); S.cfg = await api('saveSettings', o); $('#sName').textContent = S.cfg.nama_toko; toast('Pengaturan tersimpan'); } catch (x) { fail(x); } };
  $('#pwSave').onclick = async () => { try { await api('changePassword', { lama: $('#pl').value, baru: $('#pn').value }); toast('Password diubah'); $('#pl').value = $('#pn').value = ''; } catch (x) { fail(x); } };

  // Backup dan Pengguna dimuat hanya saat bagian itu dibuka pertama kali
  let bkOk = false, usOk = false;
  $('#acBackup').ontoggle = ev => { if (ev.target.open && !bkOk) { bkOk = true; loadBackup(); } };
  $('#acUser').ontoggle = ev => {
    if (!ev.target.open || usOk) return; usOk = true;
    crud($('#usr'), {
      sheet: 'Users', name: 'Pengguna',
      def: () => ({ Role: 'kasir', Aktif: 'Y' }),
      fields: [{ k: 'Username', l: 'Username', req: 1 }, { k: 'Nama', l: 'Nama lengkap', req: 1 }, { k: 'Password', l: 'Password (kosong = tidak diubah)', t: 'password' }, { k: 'Role', l: 'Hak akses', t: 'select', o: [['kasir', 'Kasir'], ['admin', 'Admin']] }, { k: 'Aktif', l: 'Status', t: 'select', o: [['Y', 'Aktif'], ['N', 'Nonaktif']] }],
      cols: [['Username', r => r.Username], ['Nama', r => r.Nama], ['Hak akses', r => r.Role], ['Status', r => H(r.Aktif === 'Y' ? '<span class="bd ok">Aktif</span>' : '<span class="bd">Nonaktif</span>')]]
    }).catch(x => { usOk = false; $('#usr').innerHTML = `<p class="note">${e(x.message)}</p>`; });
  };
}
/* ============ PASSWORD WAJIB, RETUR, TUTUP KASIR, BACKUP ============ */
function forcePw() {
  modal('Ganti Password Wajib', `<p class="note" style="margin-bottom:12px">Anda masih memakai password bawaan. Demi keamanan, ganti sekarang.</p><div class="fg"><label class="f full"><span>Password lama</span><input type="password" id="fp0" autocomplete="current-password"></label><label class="f full"><span>Password baru (min. 6 karakter)</span><input type="password" id="fp1" autocomplete="new-password"></label><label class="f full"><span>Ulangi password baru</span><input type="password" id="fp2" autocomplete="new-password"></label></div>`, async () => {
    if ($('#fp1').value !== $('#fp2').value) throw new Error('Ulangi password tidak sama');
    await api('changePassword', { lama: $('#fp0').value, baru: $('#fp1').value });
    S.user.wajib = false; toast('Password berhasil diganti'); route();
  }, 'Simpan Password', false, true);
}

async function returForm(id, cb) {
  const r = await api('returInfo', { id });
  const rows = r.items.map(i => `<tr data-id="${i.id}" data-h="${i.harga}" data-max="${i.sisa}"><td>${e(i.nama)}</td><td class="r">${nf(i.qty)}</td><td class="r">${nf(i.retur)}</td><td class="r">${rp(i.harga)}</td><td><input class="rq num" inputmode="numeric" placeholder="0" ${i.sisa ? '' : 'disabled'} style="width:70px"></td><td><select class="rk"><option>Baik</option><option>Rusak</option></select></td></tr>`).join('');
  modal('Retur Nota ' + r.sale.No, `<div class="tw"><table><thead><tr><th>Barang</th><th class="r">Terjual</th><th class="r">Sudah retur</th><th class="r">Harga</th><th>Qty retur</th><th>Kondisi</th></tr></thead><tbody id="rtR">${rows}</tbody></table></div>
  <p class="note" style="margin:8px 0">Kondisi <b>Baik</b>: barang kembali ke stok. <b>Rusak</b>: tidak masuk stok (dicatat sebagai kerugian). Harga retur sudah memperhitungkan diskon nota.</p>
  <div class="fg"><label class="f"><span>Pengembalian</span><select id="rj"><option>Uang Kembali</option>${r.piutang > 0 ? '<option>Potong Piutang</option>' : ''}</select></label><label class="f"><span>Uang kembali via</span><select id="rm"><option>Tunai</option><option>Transfer</option></select></label><label class="f full"><span>Alasan</span><input id="ra" placeholder="mis. salah ukuran / cacat"></label></div>
  <p style="margin-top:10px">Total retur: <b class="tot" id="rtT">Rp 0</b></p>`, async () => {
    const items = [...document.querySelectorAll('#rtR tr')].map(tr => ({ id: tr.dataset.id, qty: unf(tr.querySelector('.rq').value), kondisi: tr.querySelector('.rk').value })).filter(x => x.qty > 0);
    if (!items.length) throw new Error('Isi qty retur minimal satu barang');
    await api('saveRetur', { id, items, jenis: $('#rj').value, metode: $('#rm').value, alasan: $('#ra').value });
    toast('Retur tersimpan'); cb();
  }, 'Simpan Retur', true);
  const calc = () => { let t = 0; document.querySelectorAll('#rtR tr').forEach(tr => { const q = tr.querySelector('.rq'), mx = +tr.dataset.max; let n = unf(q.value); if (n > mx) { n = mx; q.value = nf(mx); } t += n * tr.dataset.h; }); $('#rtT').textContent = rp(t); };
  document.querySelectorAll('#rtR .rq').forEach(i => i.oninput = calc);
}

async function pRetur(v) {
  const extra = `<input class="grow" id="rtQ" placeholder="Cari no retur / nota / pelanggan / alasan..."><select id="rtP"><option value="">Semua pelanggan</option></select><select id="rtJn"><option value="">Semua jenis</option><option value="kembali">Uang kembali</option><option value="potong">Potong piutang</option></select><select id="rtM"><option value="">Semua metode</option><option>Tunai</option><option>Transfer</option></select><select id="rtU"><option value="">Semua user</option></select><button class="btn" id="rtRs">Reset filter</button>`;
  v.innerHTML = quickBar('rt') + rangeBar('rt', 0, extra) + '<p class="note" id="rtInfo" style="margin-bottom:8px"></p><div id="rtL"></div>';
  let DATA = [];
  const draw = () => {
    const q = $('#rtQ').value.toLowerCase().trim(), pl = $('#rtP').value, jn = $('#rtJn').value, mt = $('#rtM').value, us = $('#rtU').value;
    const L = DATA.filter(x => (!pl || x.Pelanggan === pl) && (!jn || (jn === 'potong' ? x.PotongPiutang > 0 : !(x.PotongPiutang > 0))) && (!mt || x.Metode === mt) && (!us || x.User === us) && (!q || (x.No + ' ' + x.NoNota + ' ' + x.Pelanggan + ' ' + x.Alasan + ' ' + x.User).toLowerCase().includes(q)));
    $('#rtInfo').textContent = 'Menampilkan ' + L.length + ' dari ' + DATA.length + ' retur';
    $('#rtL').innerHTML = tbl(['No Retur', 'Tanggal', 'Nota', 'Pelanggan', 'Total', 'Potong Piutang', 'Uang Kembali', 'Alasan', ''],
      L.map(x => [x.No, tglID(x.Tanggal) + ' ' + x.Waktu, x.NoNota, x.Pelanggan, x.Total, x.PotongPiutang, x.UangKembali, x.Alasan, { h: `<button class="btn s" onclick="detailRetur('${x.No}','${x.Tanggal}')">Detail</button>`, c: 'act' }]),
      ['TOTAL', '', '', '', sum(L, 'Total'), sum(L, 'PotongPiutang'), sum(L, 'UangKembali'), '', '']);
  };
  const load = () => swr('list', { sheet: 'Retur', from: $('#rtF').value, to: $('#rtT').value }, r => {
    DATA = r.slice().reverse();
    fillOpts($('#rtP'), DATA.map(x => x.Pelanggan), 'Semua pelanggan');
    fillOpts($('#rtU'), DATA.map(x => x.User), 'Semua user');
    draw();
  });
  window.detailRetur = async (no, t) => {
    const d = (await api('list', { sheet: 'DetailRetur', from: t, to: t })).filter(x => x.NoRetur === no);
    modal('Detail ' + no, tbl(['Barang', 'Qty', 'Harga', 'Subtotal', 'Kondisi'], d.map(x => [x.Nama, x.Qty, x.Harga, x.Subtotal, x.Kondisi])));
  };
  $('#rtGo').onclick = () => load().catch(fail); quickBind('rt');
  ['#rtQ', '#rtP', '#rtJn', '#rtM', '#rtU'].forEach(s => { $(s).oninput = $(s).onchange = draw; });
  $('#rtRs').onclick = () => { ['#rtQ', '#rtP', '#rtJn', '#rtM', '#rtU'].forEach(s => { $(s).value = ''; }); draw(); };
  load().catch(fail);
}

async function pTutup(v) {
  v.innerHTML = `<div class="bar"><label>Tanggal <input type="date" id="tkD" value="${today()}"></label><button class="btn p" id="tkGo">Hitung</button></div><div id="tkR"></div>`;
  const load = async () => {
    const tgl = $('#tkD').value, r = await api('tutupInfo', { tanggal: tgl }), h = r.hitung;
    const M = ['Tunai', 'Transfer', 'QRIS', 'Debit'], masuk = (h.jual.Tunai || 0) + (h.lunas.Tunai || 0);
    const rows = M.map(m => [m, h.jual[m] || 0, h.lunas[m] || 0, (h.jual[m] || 0) + (h.lunas[m] || 0)]);
    const tot = i => rows.reduce((p, c) => p + c[i], 0);
    if(r.closed){ $('#tkR').innerHTML = `<div class="card"><h3>Kasir sudah ditutup</h3><p>Tanggal ${tglID(tgl)} telah ditutup oleh ${e(r.closing.Kasir)} pada ${e(r.closing.Waktu)}.</p><p>Uang fisik: <b>${rp(r.closing.Hitung)}</b> · Selisih: <b>${rp(r.closing.Selisih)}</b></p></div><div class="card"><h3>Riwayat tutup kasir</h3>${tbl(['Tanggal','Jam','Kasir','Modal','Seharusnya','Hitung','Selisih','Catatan'],r.riwayat.map(x=>[tglID(x.Tanggal),x.Waktu,x.Kasir,x.Modal,x.Seharusnya,x.Hitung,x.Selisih,x.Catatan]))}</div>`; return; }
     $('#tkR').innerHTML = `<div class="stats"><div class="st"><small>Jumlah nota</small><b>${h.jml}</b><i>tidak termasuk yang dibatalkan</i></div><div class="st a"><small>Total penjualan</small><b>${rp(h.total)}</b><i>piutang baru ${rp(h.piutang)}</i></div><div class="st r"><small>Retur (uang kembali tunai)</small><b>${rp(h.returTunai)}</b></div><div class="st r"><small>Pengeluaran</small><b>${rp(h.pengeluaran)}</b></div></div>
    <div class="grid2"><div class="card"><h3>Penerimaan per metode</h3>${tbl(['Metode', 'Penjualan', 'Pelunasan piutang', 'Total'], rows, ['TOTAL', tot(1), tot(2), tot(3)])}</div>
    <div class="card"><h3>Hitung uang laci</h3><div class="fg"><label class="f"><span>Modal awal laci (Rp)</span><input class="num" inputmode="numeric" id="tkM" placeholder="0"></label><label class="f"><span>Uang fisik di laci (Rp)</span><input class="num" inputmode="numeric" id="tkH" placeholder="hasil hitung"></label>
    <div class="f full"><span>Uang seharusnya = modal + tunai masuk (${rp(masuk)}) - retur tunai - pengeluaran</span><b class="tot" id="tkS">Rp 0</b></div><div class="f full"><span>Selisih</span><b id="tkSel">-</b></div><label class="f full"><span>Catatan</span><input id="tkC"></label></div><br>
    <button class="btn a" id="tkSave">Simpan Tutup Kasir</button><p class="note" style="margin-top:8px">Pembelian stok tidak dihitung dari laci. Jika dibayar dari uang laci, catat di menu Pengeluaran.</p></div></div>
    <div class="card"><h3>Riwayat tutup kasir</h3>${tbl(['Tanggal', 'Jam', 'Kasir', 'Modal', 'Seharusnya', 'Hitung', 'Selisih', 'Catatan'], r.riwayat.map(x => [tglID(x.Tanggal), x.Waktu, x.Kasir, x.Modal, x.Seharusnya, x.Hitung, H(`<span class="bd ${x.Selisih === 0 ? 'ok' : 'bad'}">${x.Selisih > 0 ? '+' : ''}${nf(x.Selisih)}</span>`), x.Catatan]))}</div>`;
    const calc = () => {
      const sh = unf($('#tkM').value) + masuk - h.returTunai - h.pengeluaran; $('#tkS').textContent = rp(sh);
      if ($('#tkH').value === '') { $('#tkSel').textContent = '-'; return; }
      const d = unf($('#tkH').value) - sh;
      $('#tkSel').innerHTML = `<span class="bd ${d === 0 ? 'ok' : 'bad'}">${d > 0 ? '+' : ''}${nf(d)} ${d === 0 ? '(pas)' : d > 0 ? '(lebih)' : '(kurang)'}</span>`;
    };
    $('#tkM').oninput = $('#tkH').oninput = calc; calc();
    $('#tkSave').onclick = async ev => {
      if ($('#tkH').value === '') return toast('Isi uang fisik di laci', true);
      ev.target.disabled = true;
      try { await api('tutupSave', { tanggal: tgl, modal: unf($('#tkM').value), hitung: unf($('#tkH').value), catatan: $('#tkC').value }); toast('Tutup kasir tersimpan'); load(); } catch (x) { fail(x); ev.target.disabled = false; }
    };
  };
  $('#tkGo').onclick = () => load().catch(fail); load().catch(fail);
}

async function loadBackup() {
  const el = $('#bk'); if (!el) return;
  try {
    const r = await api('backupList');
    el.innerHTML = `<p class="note" style="margin-bottom:10px">Backup otomatis: <span class="bd ${r.aktif ? 'ok' : 'bad'}">${r.aktif ? 'Aktif' : 'Belum aktif'}</span>. Restore akan mengganti data sheet aktif dengan isi backup yang dipilih.</p><div class="bar"><button class="btn p" id="bkNow">Backup Sekarang</button>${r.aktif ? '' : '<button class="btn a" id="bkAuto">Aktifkan Backup Harian</button>'}<select id="bkPick"><option value="">Pilih backup untuk restore</option>${r.files.map(f=>`<option value="${e(f.id)}">${e(f.name)}</option>`).join('')}</select><button class="btn d" id="bkRestore">Restore</button></div><div class="bar"><input type="number" id="arYear" value="${new Date().getFullYear()-1}" min="2020" max="2099"><button class="btn" id="arMake">Buat Arsip Tahunan</button></div>${tbl(['Nama file', 'Dibuat', ''], r.files.map(f => [f.name, f.tgl, { h: `<a class="btn s" href="${e(f.url)}" target="_blank" rel="noopener">Buka</a>`, c: 'act' }]))}`;
    $('#bkRestore').onclick=()=>{const id=$('#bkPick').value;if(!id)return toast('Pilih file backup',true);confirmBox('Data sheet saat ini akan diganti dengan isi backup. Buat backup baru sebelum melanjutkan. Lanjutkan?',async()=>{const z=await api('restoreBackup',{fileId:id});toast('Restore selesai. Backup pengaman dibuat sebelum pemulihan. Muat ulang aplikasi.');});}; $('#arMake').onclick=async()=>{try{const z=await api('archiveYear',{year:$('#arYear').value});window.open(z.Url,'_blank','noopener');toast('Arsip tahunan dibuat');}catch(x){fail(x);}}; $('#bkNow').onclick = async ev => { ev.target.disabled = true; try { await api('backupNow'); toast('Backup berhasil dibuat'); } catch (x) { fail(x); } loadBackup(); };
    if ($('#bkAuto')) $('#bkAuto').onclick = async () => { try { await api('backupAuto'); toast('Backup harian diaktifkan'); } catch (x) { fail(x); } loadBackup(); };
  } catch (x) { el.innerHTML = `<p class="note">${e(x.message)}</p>`; }
}

/* ============ PPN & RETUR PEMBELIAN ============ */
const ppnRate = () => +S.cfg.ppn_persen || 11;
function ppnCalc(sum, mode) {
  const r = ppnRate();
  if (mode === 'exclude') { const p = Math.round(sum * r / 100); return { ppn: p, total: sum + p }; }
  if (mode === 'include') return { ppn: Math.round(sum * r / (100 + r)), total: sum };
  return { ppn: 0, total: sum };
}

async function returBeliForm(id, cb) {
  const r = await api('returInfoBeli', { id });
  const rows = r.items.map(i => { const mx = Math.min(i.sisa, i.stok); return `<tr data-id="${i.id}" data-h="${i.harga}" data-max="${mx}"><td>${e(i.nama)}</td><td class="r">${nf(i.qty)}</td><td class="r">${nf(i.retur)}</td><td class="r">${nf(i.stok)}</td><td class="r">${rp(i.harga)}</td><td><input class="rq num" inputmode="numeric" placeholder="0" ${mx > 0 ? '' : 'disabled'} style="width:70px"></td></tr>`; }).join('');
  modal('Retur Pembelian ' + r.purchase.No, `<div class="tw"><table><thead><tr><th>Barang</th><th class="r">Dibeli</th><th class="r">Sudah retur</th><th class="r">Stok saat ini</th><th class="r">Harga beli</th><th>Qty retur</th></tr></thead><tbody id="rbRows">${rows}</tbody></table></div>
  <p class="note" style="margin:8px 0">Qty retur tidak bisa melebihi sisa nota maupun stok saat ini. Stok berkurang otomatis. Harga memakai harga di nota${r.mode === 'none' ? '' : ', PPN dihitung proporsional'}.</p>
  <div class="fg"><label class="f"><span>Penyelesaian</span><select id="rbJ"><option>Uang Kembali</option>${r.hutang > 0 ? '<option>Potong Hutang</option>' : ''}</select></label><label class="f"><span>Alasan</span><input id="rbA" placeholder="mis. barang cacat"></label></div>
  <div style="margin-top:10px;text-align:right"><div class="note">Subtotal: <b id="rbSub">Rp 0</b> &nbsp;·&nbsp; PPN: <b id="rbPpn">Rp 0</b></div><div>Total retur: <b class="tot" id="rbTot">Rp 0</b></div></div>`, async () => {
    const items = [...document.querySelectorAll('#rbRows tr')].map(tr => ({ id: tr.dataset.id, qty: unf(tr.querySelector('.rq').value) })).filter(x => x.qty > 0);
    if (!items.length) throw new Error('Isi qty retur minimal satu barang');
    await api('saveReturBeli', { id, items, jenis: $('#rbJ').value, alasan: $('#rbA').value });
    toast('Retur pembelian tersimpan, stok berkurang'); cb();
  }, 'Simpan Retur', true);
  const calc = () => {
    let sb = 0;
    document.querySelectorAll('#rbRows tr').forEach(tr => { const q = tr.querySelector('.rq'), mx = +tr.dataset.max; let n = unf(q.value); if (n > mx) { n = mx; q.value = nf(mx); } sb += n * tr.dataset.h; });
    const p = Math.round(sb * r.ratio);
    $('#rbSub').textContent = rp(sb); $('#rbPpn').textContent = rp(p); $('#rbTot').textContent = rp(r.mode === 'exclude' ? sb + p : sb);
  };
  document.querySelectorAll('#rbRows .rq').forEach(i => i.oninput = calc);
}

async function pReturBeli(v) {
  const extra = `<input class="grow" id="rbQ" placeholder="Cari no retur / nota beli / supplier / alasan..."><select id="rbSp"><option value="">Semua supplier</option></select><select id="rbJn"><option value="">Semua jenis</option><option value="kembali">Uang kembali</option><option value="potong">Potong hutang</option></select><select id="rbU"><option value="">Semua user</option></select><button class="btn" id="rbRs">Reset filter</button>`;
  v.innerHTML = quickBar('rb') + rangeBar('rb', 0, extra) + '<p class="note" id="rbInfo" style="margin-bottom:8px"></p><div id="rbL"></div>';
  let DATA = [];
  const draw = () => {
    const q = $('#rbQ').value.toLowerCase().trim(), sp = $('#rbSp').value, jn = $('#rbJn').value, us = $('#rbU').value;
    const L = DATA.filter(x => (!sp || x.Supplier === sp) && (!jn || (jn === 'potong' ? x.PotongHutang > 0 : !(x.PotongHutang > 0))) && (!us || x.User === us) && (!q || (x.No + ' ' + x.NoNota + ' ' + x.Supplier + ' ' + x.Alasan + ' ' + x.User).toLowerCase().includes(q)));
    $('#rbInfo').textContent = 'Menampilkan ' + L.length + ' dari ' + DATA.length + ' retur';
    $('#rbL').innerHTML = tbl(['No Retur', 'Tanggal', 'Nota Beli', 'Supplier', 'Total', 'PPN', 'Potong Hutang', 'Uang Kembali', 'Alasan', ''],
      L.map(x => [x.No, tglID(x.Tanggal) + ' ' + x.Waktu, x.NoNota, x.Supplier, x.Total, x.PPN, x.PotongHutang, x.UangKembali, x.Alasan, { h: `<button class="btn s" onclick="detailReturBeli('${x.No}','${x.Tanggal}')">Detail</button>`, c: 'act' }]),
      ['TOTAL', '', '', '', sum(L, 'Total'), sum(L, 'PPN'), sum(L, 'PotongHutang'), sum(L, 'UangKembali'), '', '']);
  };
  const load = () => swr('list', { sheet: 'ReturBeli', from: $('#rbF').value, to: $('#rbT').value }, r => {
    DATA = r.slice().reverse();
    fillOpts($('#rbSp'), DATA.map(x => x.Supplier), 'Semua supplier');
    fillOpts($('#rbU'), DATA.map(x => x.User), 'Semua user');
    draw();
  });
  window.detailReturBeli = async (no, t) => {
    const d = (await api('list', { sheet: 'DetailReturBeli', from: t, to: t })).filter(x => x.NoRetur === no);
    modal('Detail ' + no, tbl(['Barang', 'Qty', 'Harga', 'Subtotal'], d.map(x => [x.Nama, x.Qty, x.Harga, x.Subtotal])));
  };
  $('#rbGo').onclick = () => load().catch(fail); quickBind('rb');
  ['#rbQ', '#rbSp', '#rbJn', '#rbU'].forEach(s => { $(s).oninput = $(s).onchange = draw; });
  $('#rbRs').onclick = () => { ['#rbQ', '#rbSp', '#rbJn', '#rbU'].forEach(s => { $(s).value = ''; }); draw(); };
  load().catch(fail);
}

/* ============ TARIK UNTUK REFRESH ============ */
(function () {
  const el = $('#ptr'), TH = 60; let y0 = 0, dy = 0, on = false, busy = false;
  const canStart = t => {
    if (busy || !S.user || window.scrollY > 0) return false;
    if ($('#modal').classList.contains('on') || $('#side').classList.contains('on')) return false;
    for (let n = t; n && n !== document.body; n = n.parentElement) if (n.scrollTop > 0) return false;
    return true;
  };
  const pos = (d, anim) => {
    el.style.transition = anim ? 'transform .2s,opacity .2s' : 'none';
    el.style.transform = `translateY(${d - 60}px) rotate(${d * 4}deg)`;
    el.style.opacity = Math.min(1, d / TH);
  };
  addEventListener('touchstart', ev => {
    on = ev.touches.length === 1 && canStart(ev.target);
    if (on) { y0 = ev.touches[0].clientY; dy = 0; }
  }, { passive: true });
  addEventListener('touchmove', ev => {
    if (!on) return;
    dy = Math.max(0, Math.min((ev.touches[0].clientY - y0) * 0.5, 110));
    pos(dy);
  }, { passive: true });
  addEventListener('touchend', async () => {
    if (!on) return; on = false;
    if (dy < TH) return pos(0, true);
    busy = true; el.classList.add('go'); pos(50, true);
    try { await route(); } finally { el.classList.remove('go'); pos(0, true); busy = false; }
  });
})();

/* ============ START ============ */
if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
boot();

async function syncOfflineSales(){
  if(!S.token || !navigator.onLine)return;
  let q=[];try{q=JSON.parse(localStorage.getItem('mb_offline_sales')||'[]');}catch(_){q=[];}
  if(!q.length)return;
  try{const out=await api('offlineSync',{items:q.map(x=>({clientId:x.clientId,payload:x.payload}))});const done=new Set(out.filter(x=>x.ok||x.duplicate).map(x=>x.clientId));q=q.filter(x=>!done.has(x.clientId));localStorage.setItem('mb_offline_sales',JSON.stringify(q));toast('Sinkronisasi offline selesai. Berhasil '+done.size+', tertunda/gagal '+q.length);}
  catch(x){console.warn('Sinkronisasi offline:',x.message);}
}
window.addEventListener('online',()=>setTimeout(syncOfflineSales,1500));
