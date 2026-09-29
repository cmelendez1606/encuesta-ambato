/* App del brigadista — Estudio de Opinión Ciudadana Ambato
 * Funciona sin señal: todo se guarda en el teléfono (IndexedDB) y se envía solo cuando hay internet.
 */
'use strict';

// ---------------- Utilidades ----------------
const $app = document.getElementById('app');
const LS = {
  get(k, d) { try { const v = localStorage.getItem('ea_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ea_' + k, JSON.stringify(v)); } catch (e) { /* sin espacio */ } },
  del(k) { try { localStorage.removeItem('ea_' + k); } catch (e) { } }
};

function el(tag, attrs, ...hijos) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'html') n.innerHTML = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) if (h !== null && h !== undefined && h !== false) n.append(h.nodeType ? h : document.createTextNode(String(h)));
  return n;
}
function pintar(...nodos) { $app.replaceChildren(...nodos.flat().filter(n => n !== null && n !== undefined && n !== false)); window.scrollTo(0, 0); }
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
}
function aviso(txt, ms = 3200) {
  const a = document.getElementById('aviso');
  a.textContent = txt; a.hidden = false;
  clearTimeout(aviso._t); aviso._t = setTimeout(() => { a.hidden = true; }, ms);
}
function hoyISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function fechaLocal(iso) { const d = new Date(iso); return isNaN(d) ? '' : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function horaCorta(iso) { const d = new Date(iso); return d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }); }
function barajar(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
function limpiarCedula(v) { return String(v || '').replace(/\D/g, ''); }

const DEVICE_ID = LS.get('device') || (() => { const d = 'dev-' + uuid(); LS.set('device', d); return d; })();

// ---------------- Almacenamiento local (IndexedDB) ----------------
const DB = {
  _db: null,
  abrir() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((ok, mal) => {
      const r = indexedDB.open('encuesta-ambato', 1);
      r.onupgradeneeded = () => {
        const s = r.result.createObjectStore('registros', { keyPath: 'uuid' });
        s.createIndex('estado', 'estadoEnvio');
      };
      r.onsuccess = () => { this._db = r.result; ok(this._db); };
      r.onerror = () => mal(r.error);
    });
  },
  async tx(modo, fn) {
    const db = await this.abrir();
    return new Promise((ok, mal) => {
      const t = db.transaction('registros', modo);
      const s = t.objectStore('registros');
      let res;
      Promise.resolve(fn(s)).then(v => { res = v; });
      t.oncomplete = () => ok(res);
      t.onerror = () => mal(t.error);
      t.onabort = () => mal(t.error || new Error('Transacción abortada'));
    });
  },
  guardar(reg) { return this.tx('readwrite', s => { s.put(reg); }); },
  todos() {
    return this.tx('readonly', s => new Promise(ok => { const r = s.getAll(); r.onsuccess = () => ok(r.result); }));
  },
  async pendientes() { return (await this.todos()).filter(r => r.estadoEnvio === 'pendiente'); }
};

// ---------------- Fotos y logos de candidatos (guardados en el teléfono para usarlos sin señal) ----------------
const IMG = {
  mapa: {},
  _db: null,
  abrir() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((ok, mal) => {
      const r = indexedDB.open('encuesta-ambato-imagenes', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('imgs');
      r.onsuccess = () => { this._db = r.result; ok(this._db); };
      r.onerror = () => mal(r.error);
    });
  },
  async cargarTodo() {
    try {
      const db = await this.abrir();
      await new Promise(ok => {
        const t = db.transaction('imgs', 'readonly'), s = t.objectStore('imgs');
        const rq = s.openCursor();
        rq.onsuccess = () => { const c = rq.result; if (c) { this.mapa[c.key] = c.value; c.continue(); } else ok(); };
        rq.onerror = () => ok();
      });
    } catch (e) { }
  },
  async guardar(fuente, dataUrl) {
    this.mapa[fuente] = dataUrl;
    try {
      const db = await this.abrir();
      db.transaction('imgs', 'readwrite').objectStore('imgs').put(dataUrl, fuente);
    } catch (e) { }
  },
  src(fuente) { return fuente ? this.mapa[fuente] || '' : ''; }
};

function reducirImagen(dataUrl, max) {
  return new Promise(ok => {
    const img = new Image();
    img.onload = () => {
      const esc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * esc)); c.height = Math.max(1, Math.round(img.height * esc));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => ok('');
    img.src = dataUrl;
  });
}

let _descargandoImgs = false;
async function sincronizarImagenes() {
  if (_descargandoImgs || !S.cfg || !navigator.onLine) return;
  const fuentes = [...new Set((S.cfg.candidatos || []).flatMap(c => [c.foto, c.logo]).filter(Boolean))].filter(f => !IMG.mapa[f]);
  if (!fuentes.length) return;
  _descargandoImgs = true;
  try {
    for (let i = 0; i < fuentes.length; i += 4) {
      const lote = fuentes.slice(i, i + 4);
      const r = await api('GET', null, { action: 'imagenes', fuentes: lote.join('|') });
      if (!r || !r.ok) continue;
      for (const f of Object.keys(r.imagenes || {})) {
        const peq = await reducirImagen(r.imagenes[f], 360);
        if (peq) await IMG.guardar(f, peq);
      }
    }
  } catch (e) { /* se reintenta en la próxima conexión */ }
  finally { _descargandoImgs = false; }
}

// Pide al navegador que no borre los datos guardados
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });

// ---------------- Estado ----------------
const S = {
  sesion: LS.get('sesion'),
  cfg: LS.get('cfg'),
  enc: null,          // encuesta en curso
  sincronizando: false,
  watchId: null,
  ultimaPos: null
};

function modoPrueba() { return !!(S.cfg && S.cfg.modoPrueba); }

// ---------------- Red ----------------
async function api(metodo, datos, params) {
  if (!API_URL || API_URL.indexOf('http') !== 0) throw new Error('La app no está configurada (falta la URL del servidor en config.js)');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    let resp;
    if (metodo === 'GET') {
      const q = new URLSearchParams(params || {}).toString();
      resp = await fetch(API_URL + (q ? '?' + q : ''), { signal: ctrl.signal, redirect: 'follow' });
    } else {
      resp = await fetch(API_URL, {
        method: 'POST', body: JSON.stringify(datos), signal: ctrl.signal, redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
      });
    }
    if (!resp.ok) throw new Error('El servidor respondió ' + resp.status);
    return await resp.json();
  } finally { clearTimeout(t); }
}

function actualizarBarraRed() {
  const b = document.getElementById('barra-red');
  if (navigator.onLine) { b.hidden = true; }
  else { b.hidden = false; b.textContent = 'Sin señal — puede seguir encuestando. Todo se guarda en el teléfono.'; }
}
window.addEventListener('online', () => { actualizarBarraRed(); sincronizar(true); });
window.addEventListener('offline', actualizarBarraRed);

async function cargarConfig(forzar) {
  const hace = Date.now() - (LS.get('cfgHora') || 0);
  if (!forzar && S.cfg && hace < 10 * 60 * 1000) return S.cfg;
  if (!navigator.onLine) return S.cfg;
  try {
    const c = await api('GET', null, { action: 'config' });
    if (c && c.ok) { S.cfg = c; LS.set('cfg', c); LS.set('cfgHora', Date.now()); }
  } catch (e) { /* se usa la copia guardada */ }
  sincronizarImagenes();
  return S.cfg;
}

async function sincronizar(silencioso) {
  if (S.sincronizando || !S.sesion) return;
  if (!navigator.onLine) { if (!silencioso) aviso('Sin señal. Se enviará automáticamente cuando haya internet.'); return; }
  S.sincronizando = true;
  let enviados = 0, errores = 0;
  try {
    let pend = await DB.pendientes();
    // Primero las encuestas y visitas; luego los contactos
    pend.sort((a, b) => (a.tipo === 'contacto') - (b.tipo === 'contacto') || String(a.creado).localeCompare(String(b.creado)));
    while (pend.length) {
      const lote = [];
      let tam = 0;
      while (pend.length && lote.length < 8 && tam < 1500000) {
        const r = pend.shift();
        lote.push(r); tam += (r.foto ? r.foto.length : 0) + 3000;
      }
      const envio = lote.map(r => { const c = Object.assign({}, r); delete c.estadoEnvio; delete c.creado; delete c.errorEnvio; return c; });
      const res = await api('POST', {
        action: 'sync', cedula: S.sesion.cedula, token: S.sesion.token, deviceId: DEVICE_ID,
        appVersion: APP_VERSION, deviceNow: new Date().toISOString(), registros: envio
      });
      if (!res.ok) {
        if (res.reingresar) { S.sesion.expirada = true; LS.set('sesion', S.sesion); aviso(res.error, 6000); }
        throw new Error(res.error || 'Error del servidor');
      }
      const listos = new Set([].concat(res.aceptados || [], res.duplicados || []));
      const rech = {}; (res.rechazados || []).forEach(x => { if (x.uuid) rech[x.uuid] = x.motivo; });
      for (const r of lote) {
        if (listos.has(r.uuid)) { r.estadoEnvio = 'enviado'; r.enviado = new Date().toISOString(); delete r.foto; enviados++; }
        else if (rech[r.uuid]) { r.estadoEnvio = 'rechazado'; r.errorEnvio = rech[r.uuid]; errores++; }
        await DB.guardar(r);
      }
    }
    LS.set('ultimaSync', new Date().toISOString());
    if (!silencioso || enviados) aviso(enviados ? `Enviados ${enviados} registros al servidor ✓` : 'Todo está al día ✓');
  } catch (e) {
    errores++;
    if (!silencioso) aviso('No se pudo enviar: ' + e.message + '. Se reintentará solo.', 5000);
  } finally {
    S.sincronizando = false;
    if (document.getElementById('pantalla-inicio')) pantallaInicio();
  }
}
setInterval(() => { if (!S.enc) sincronizar(true); }, 90 * 1000);

// ---------------- GPS ----------------
function obtenerGPS(maxMs = 25000, precisionBuscada = 25) {
  return new Promise(resolve => {
    if (!('geolocation' in navigator)) return resolve({ error: 'Este teléfono no tiene GPS disponible' });
    let mejor = null, fin = false;
    const terminar = (v) => { if (fin) return; fin = true; navigator.geolocation.clearWatch(id); clearTimeout(t); resolve(v); };
    const id = navigator.geolocation.watchPosition(p => {
      const pos = { lat: +p.coords.latitude.toFixed(7), lng: +p.coords.longitude.toFixed(7), acc: Math.round(p.coords.accuracy), t: new Date(p.timestamp).toISOString() };
      if (!mejor || pos.acc < mejor.acc) mejor = pos;
      if (pos.acc <= precisionBuscada) terminar(mejor);
    }, err => {
      terminar(mejor || { error: err.code === 1 ? 'Permiso de ubicación negado. Actívelo en la configuración del navegador.' : 'No se pudo obtener la ubicación. Salga a un lugar abierto y reintente.' });
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs });
    const t = setTimeout(() => terminar(mejor || { error: 'El GPS tardó demasiado. Reintente en un lugar abierto.' }), maxMs);
  });
}
function vigilarGPS() {
  pararGPS();
  if (!('geolocation' in navigator)) return;
  S.watchId = navigator.geolocation.watchPosition(p => {
    S.ultimaPos = { lat: +p.coords.latitude.toFixed(7), lng: +p.coords.longitude.toFixed(7), acc: Math.round(p.coords.accuracy), t: new Date(p.timestamp).toISOString() };
  }, () => { }, { enableHighAccuracy: true, maximumAge: 15000 });
}
function pararGPS() { if (S.watchId !== null) { navigator.geolocation.clearWatch(S.watchId); S.watchId = null; } }

// ---------------- Foto ----------------
function comprimirFoto(file) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 900, esc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      // Sello de tiempo en la foto
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, c.height - 30, c.width, 30);
      ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif';
      ctx.fillText(new Date().toLocaleString('es-EC') + ' · ' + (S.sesion ? S.sesion.cedula : ''), 10, c.height - 10);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.62));
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No se pudo leer la foto')); };
    img.src = url;
  });
}
async function hashArchivo(file) {
  try {
    const buf = await file.arrayBuffer();
    if (crypto.subtle) {
      const d = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    }
    const u = new Uint8Array(buf); let h = 0; for (let i = 0; i < u.length; i += 7) h = (h * 31 + u[i]) | 0; return 'h' + h + '-' + u.length;
  } catch (e) { return hashTexto(file.name + file.size + file.lastModified); }
}
async function hashTexto(txt) {
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  }
  let h = 0; for (let i = 0; i < txt.length; i++) { h = (h * 31 + txt.charCodeAt(i)) | 0; } return 'h' + h;
}

// ================================================================
//  PANTALLAS
// ================================================================
function encabezado(titulo) {
  const red = navigator.onLine ? el('span', { class: 'chip ok' }, '● En línea') : el('span', { class: 'chip off' }, '● Sin señal');
  return el('div', { class: 'encabezado' }, el('div', { class: 'titulo' }, titulo || (S.cfg ? S.cfg.estudio : 'Estudio de Opinión Ciudadana')), red);
}
function bandaPrueba() { return modoPrueba() ? el('div', { class: 'banda-prueba' }, 'MODO CAPACITACIÓN — estas encuestas no cuentan') : null; }

// ---- Login ----
function pantallaLogin(error, cedPrevia) {
  const ced = el('input', { type: 'tel', inputmode: 'numeric', maxlength: 10, autocomplete: 'username', placeholder: 'Ej. 1804567890', value: cedPrevia || (S.sesion ? S.sesion.cedula : '') });
  const pin = el('input', { type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'current-password', placeholder: '••••' });
  const btn = el('button', { class: 'btn primario enorme', onclick: entrar }, 'Ingresar');
  async function entrar() {
    const c = limpiarCedula(ced.value), p = pin.value.trim();
    if (c.length !== 10) return aviso('Ingrese su cédula de 10 dígitos');
    if (!p) return aviso('Ingrese su PIN');
    if (!navigator.onLine) return aviso('Para ingresar la primera vez necesita señal de internet');
    btn.disabled = true; btn.textContent = 'Verificando…';
    try {
      const r = await api('POST', { action: 'login', cedula: c, pin: p });
      if (!r.ok) throw new Error(r.error);
      S.sesion = Object.assign({}, r.brigadista, { token: r.token, desde: new Date().toISOString() });
      LS.set('sesion', S.sesion);
      await cargarConfig(true);
      pantallaInicio();
      sincronizar(true);
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Ingresar';
      pantallaLogin(e.message, c);
    }
  }
  pintar(
    encabezado('Estudio de Opinión Ciudadana'),
    el('h1', null, 'Ingreso de encuestadores'),
    error ? el('div', { class: 'caja-error' }, error) : null,
    S.sesion && S.sesion.expirada ? el('div', { class: 'caja-alerta' }, 'Su sesión debe renovarse. Sus encuestas guardadas NO se pierden.') : null,
    el('div', { class: 'tarjeta' },
      el('label', { class: 'campo' }, 'Cédula'), ced,
      el('label', { class: 'campo' }, 'PIN'), pin,
      btn),
    el('p', { class: 'suave' }, 'Su PIN es personal. Cada encuesta queda registrada a su nombre, con ubicación y hora.')
  );
}

// ---- Inicio ----
async function pantallaInicio() {
  if (!S.sesion || S.sesion.expirada) return pantallaLogin();
  const regs = await DB.todos();
  const hoy = hoyISO();
  const encHoy = regs.filter(r => r.tipo === 'encuesta' && fechaLocal(r.inicio) === hoy).length;
  const visHoy = regs.filter(r => r.tipo === 'visita' && fechaLocal(r.fecha) === hoy).length;
  const pend = regs.filter(r => r.estadoEnvio === 'pendiente').length;
  const rech = regs.filter(r => r.estadoEnvio === 'rechazado');
  const ultima = LS.get('ultimaSync');
  const cfg = S.cfg;
  const bloqueo = !cfg ? 'Falta descargar el cuestionario. Conéctese a internet y toque "Actualizar cuestionario".'
    : (!cfg.modoPrueba && (cfg.dignidadesIncompletas || []).some(d => d === 'alcaldia' || d === 'prefectura'))
      ? 'El coordinador aún no ha cargado todos los candidatos. No se puede iniciar el levantamiento real.' : null;
  const borrador = cfg ? LS.get('borrador') : null;
  const h = new Date().getHours();
  const fueraHorario = cfg && (h < cfg.horaInicio || h >= cfg.horaFin);

  pintar(
    el('div', { id: 'pantalla-inicio' }),
    encabezado(),
    bandaPrueba(),
    el('h1', null, 'Hola, ' + String(S.sesion.nombre || '').split(' ')[0]),
    S.sesion.parroquia ? el('p', { class: 'suave' }, 'Zona asignada: ' + S.sesion.parroquia) : null,
    el('div', { class: 'cifras' },
      el('div', { class: 'cifra' }, el('b', null, encHoy), el('span', null, 'Encuestas hoy')),
      el('div', { class: 'cifra' }, el('b', null, visHoy), el('span', null, 'Visitas sin encuesta')),
      el('div', { class: 'cifra' }, el('b', { style: pend ? 'color:var(--alerta)' : '' }, pend), el('span', null, 'Por enviar'))
    ),
    borrador ? el('div', { class: 'caja-alerta', style: 'margin-top:14px' },
      el('b', null, 'Tiene una encuesta sin terminar'),
      el('button', { class: 'btn primario', onclick: recuperarBorrador }, 'Continuar esa encuesta'),
      el('button', { class: 'btn peligro', onclick: () => { if (confirm('¿Descartar la encuesta interrumpida? Se registrará como visita abandonada.')) { S.enc = Object.assign(borrador, { preguntas: [] }); terminarComoVisita('Abandonó la entrevista'); } } }, 'Descartar')) : null,
    bloqueo ? el('div', { class: 'caja-error', style: 'margin-top:14px' }, bloqueo) : null,
    fueraHorario ? el('div', { class: 'caja-alerta', style: 'margin-top:14px' }, `Está fuera del horario de campo (${cfg.horaInicio}:00 a ${cfg.horaFin}:00). Las encuestas en este horario se marcan para revisión.`) : null,
    el('button', { class: 'btn primario enorme', style: 'margin-top:16px', disabled: !!bloqueo || !!borrador, onclick: iniciarEncuesta }, '+ Nueva encuesta'),
    el('button', { class: 'btn secundario', disabled: !cfg, onclick: () => pantallaVisita() }, 'Registrar visita sin encuesta'),
    el('div', { class: 'tarjeta', style: 'margin-top:14px' },
      el('div', { class: 'estado-item' }, el('span', null, 'Última sincronización'), el('b', null, ultima ? new Date(ultima).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca')),
      el('div', { class: 'estado-item' }, el('span', null, 'Cuestionario'), el('b', null, cfg ? 'v' + cfg.version : 'No descargado')),
      rech.length ? el('div', { class: 'estado-item' }, el('span', { style: 'color:var(--error)' }, rech.length + ' registro(s) rechazados'), el('b', null, rech[0].errorEnvio || '')) : null,
      el('button', { class: 'btn secundario', disabled: S.sincronizando, onclick: () => sincronizar(false) }, S.sincronizando ? 'Enviando…' : 'Enviar ahora'),
      el('button', {
        class: 'btn secundario', onclick: async () => {
          if (!navigator.onLine) return aviso('Necesita señal para actualizar');
          await cargarConfig(true); aviso('Cuestionario actualizado'); pantallaInicio();
        }
      }, 'Actualizar cuestionario')
    ),
    el('button', { class: 'btn', style: 'background:none;color:var(--suave);font-weight:500', onclick: () => pantallaHistorial() }, 'Ver mis registros'),
    el('button', {
      class: 'btn', style: 'background:none;color:var(--suave);font-weight:500', onclick: async () => {
        if ((await DB.pendientes()).length) return aviso('Tiene registros sin enviar. Envíelos antes de cerrar sesión.', 5000);
        if (!confirm('¿Cerrar sesión en este teléfono?')) return;
        LS.del('sesion'); S.sesion = null; pantallaLogin();
      }
    }, 'Cerrar sesión'),
    el('p', { class: 'suave', style: 'text-align:center' }, 'Versión ' + APP_VERSION)
  );
  // Refresca el cuestionario en segundo plano
  if (navigator.onLine && !S.enc) cargarConfig(false).then(c => { if (c && cfg && c.version !== cfg.version && document.getElementById('pantalla-inicio')) pantallaInicio(); });
}

async function pantallaHistorial() {
  const regs = (await DB.todos()).filter(r => r.tipo !== 'contacto').sort((a, b) => String(b.creado).localeCompare(String(a.creado))).slice(0, 60);
  const etiqueta = { pendiente: ['Por enviar', 'off'], enviado: ['Enviado', 'ok'], rechazado: ['Rechazado', 'err'] };
  pintar(
    encabezado(),
    el('h1', null, 'Mis registros'),
    el('div', { class: 'tarjeta lista-registros' },
      regs.length ? regs.map(r => {
        const e = etiqueta[r.estadoEnvio] || ['', ''];
        const txt = r.tipo === 'encuesta' ? `Encuesta · ${horaCorta(r.inicio)} · ${(r.respuestas && r.respuestas.P03_parroquia) || ''}` : `Visita · ${horaCorta(r.fecha)} · ${r.resultado}`;
        return el('div', { class: 'estado-item' }, el('span', null, fechaLocal(r.creado) + ' ' + txt), el('span', { class: 'chip ' + e[1] }, e[0]));
      }) : el('p', { class: 'suave' }, 'Aún no hay registros.')),
    el('button', { class: 'btn secundario', onclick: pantallaInicio }, 'Volver')
  );
}

// ---- Visita sin encuesta ----
async function pantallaVisita(motivoPrefijado, contexto) {
  const motivos = ['No hay nadie en casa', 'Rechazó la encuesta', 'Vivienda desocupada / negocio', 'Otro'];
  let sel = motivoPrefijado || '';
  const estadoGps = el('b', null, 'Buscando…');
  let gps = contexto && contexto.gps ? contexto.gps : null;
  const btn = el('button', { class: 'btn primario', disabled: true, onclick: guardar }, 'Guardar visita');
  const opciones = el('div', { class: 'opciones' }, motivos.map(m => el('button', {
    class: 'opcion' + (sel === m ? ' sel' : ''), onclick: (ev) => { sel = m; [...opciones.children].forEach(x => x.classList.remove('sel')); ev.currentTarget.classList.add('sel'); revisar(); }
  }, m)));
  const selPar = el('select', null, (S.cfg.parroquias || []).map(p => el('option', { value: p.nombre, selected: p.nombre === S.sesion.parroquia }, p.nombre)));
  function revisar() { btn.disabled = !(sel && gps && !gps.error); }
  async function guardar() {
    btn.disabled = true;
    await DB.guardar({
      uuid: uuid(), tipo: 'visita', cedula: S.sesion.cedula, fecha: new Date().toISOString(), gps, parroquia: selPar.value,
      resultado: sel, prueba: modoPrueba(), estadoEnvio: 'pendiente', creado: new Date().toISOString()
    });
    aviso('Visita registrada');
    pantallaInicio(); sincronizar(true);
  }
  pintar(
    encabezado(), bandaPrueba(),
    el('h1', null, 'Visita sin encuesta'),
    el('p', { class: 'suave' }, 'Registre las casas donde no se pudo encuestar. También sirve como respaldo de su recorrido.'),
    opciones,
    el('label', { class: 'campo' }, 'Parroquia'), selPar,
    el('div', { class: 'tarjeta', style: 'margin-top:14px' }, el('div', { class: 'estado-item' }, el('span', null, 'Ubicación'), estadoGps)),
    btn,
    el('button', { class: 'btn secundario', onclick: pantallaInicio }, 'Cancelar')
  );
  if (!gps) gps = await obtenerGPS(20000, 40);
  estadoGps.textContent = gps.error ? 'Sin ubicación' : `✓ ±${gps.acc} m`;
  if (gps.error) aviso(gps.error, 5000);
  revisar();
}

// ---- Nueva encuesta: preparación ----
function iniciarEncuesta() {
  S.enc = {
    uuid: uuid(), respuestas: {}, tiempos: {}, orden: {}, historial: [], idx: 0,
    gpsInicio: null, foto: null, fotoHash: null, telefono: '', sinTelefono: false,
    preguntas: construirCuestionario(S.cfg, S.sesion)
  };
  pantallaPreparacion();
}

function pantallaPreparacion() {
  const e = S.enc, cfg = S.cfg;
  const chk1 = el('input', { type: 'checkbox' }), chk2 = el('input', { type: 'checkbox' });
  const estGps = el('b', null, e.gpsInicio && !e.gpsInicio.error ? `✓ ±${e.gpsInicio.acc} m` : 'Buscando…');
  const estFoto = el('b', null, e.foto ? '✓ Tomada' : (cfg.fotoObligatoria ? 'Obligatoria' : 'Opcional'));
  const previa = el('div');
  const inputFoto = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' });
  const btnSeguir = el('button', { class: 'btn primario enorme', disabled: true, onclick: () => pantallaConsentimiento() }, 'Continuar');
  const btnGps = el('button', { class: 'btn secundario', style: 'display:none', onclick: buscarGps }, 'Reintentar ubicación');

  function revisar() {
    const gpsOk = e.gpsInicio && !e.gpsInicio.error;
    btnSeguir.disabled = !(chk1.checked && chk2.checked && gpsOk && (e.foto || !cfg.fotoObligatoria));
  }
  async function buscarGps() {
    btnGps.style.display = 'none'; estGps.textContent = 'Buscando…';
    const g = await obtenerGPS(25000, 25);
    e.gpsInicio = g;
    if (g.error) { estGps.textContent = '✗ Sin ubicación'; aviso(g.error, 6000); btnGps.style.display = 'block'; }
    else {
      estGps.textContent = `✓ ±${g.acc} m`;
      if (g.acc > cfg.maxPrecisionGps) { estGps.textContent += ' (baja)'; btnGps.style.display = 'block'; btnGps.textContent = 'Mejorar precisión'; }
    }
    revisar();
  }
  inputFoto.addEventListener('change', async () => {
    const f = inputFoto.files && inputFoto.files[0];
    if (!f) return;
    estFoto.textContent = 'Procesando…';
    try {
      e.foto = await comprimirFoto(f);
      // Huella del archivo ORIGINAL: detecta si se reutiliza la misma foto en otra encuesta
      e.fotoHash = await hashArchivo(f);
      // Antigüedad de la foto: una foto vieja sugiere que se eligió de la galería
      e.fotoEdadSeg = f.lastModified ? Math.round((Date.now() - f.lastModified) / 1000) : null;
      estFoto.textContent = '✓ Tomada'; guardarBorrador();
      previa.replaceChildren(el('img', { class: 'foto-previa', src: e.foto, alt: 'Foto de la fachada' }));
    } catch (err) { estFoto.textContent = 'Error'; aviso(err.message); }
    revisar();
  });
  chk1.addEventListener('change', revisar); chk2.addEventListener('change', revisar);

  pintar(
    encabezado(), bandaPrueba(),
    el('h1', null, 'Antes de tocar la puerta'),
    el('label', { class: 'check' }, chk1, el('span', null, 'Guardé el material de campaña. No llevo nada visible de ningún partido (camiseta, gorra, volantes).')),
    el('label', { class: 'check' }, chk2, el('span', null, 'Me presentaré como encuestador de un estudio de opinión ciudadana, sin mencionar partidos ni candidatos.')),
    el('div', { class: 'tarjeta' },
      el('div', { class: 'estado-item' }, el('span', null, 'Ubicación GPS'), estGps),
      btnGps,
      el('div', { class: 'estado-item' }, el('span', null, 'Foto de la fachada o puerta'), estFoto),
      el('p', { class: 'suave' }, 'Solo la casa. Nunca fotografíe a personas.'),
      el('button', { class: 'btn secundario', onclick: () => inputFoto.click() }, e.foto ? 'Tomar otra foto' : 'Tomar foto'),
      inputFoto, previa
    ),
    btnSeguir,
    el('button', { class: 'btn secundario', onclick: () => { S.enc = null; borrarBorrador(); pararGPS(); pantallaInicio(); } }, 'Cancelar')
  );
  if (e.foto) previa.replaceChildren(el('img', { class: 'foto-previa', src: e.foto, alt: 'Foto de la fachada' }));
  if (!e.gpsInicio || e.gpsInicio.error) buscarGps(); else revisar();
  vigilarGPS();
}

// ---- Consentimiento ----
function pantallaConsentimiento() {
  pintar(
    encabezado(), bandaPrueba(),
    el('h1', null, 'Presentación'),
    el('div', { class: 'guion' }, 'Buenos días / tardes. Estamos realizando un estudio de opinión ciudadana sobre Ambato. Es anónimo y toma unos 7 minutos. ¿Me permite hacerle unas preguntas?'),
    el('p', { class: 'suave' }, 'Una sola encuesta por hogar, a una persona de 16 años o más que viva aquí.'),
    el('button', {
      class: 'btn primario enorme', onclick: () => {
        S.enc.inicio = new Date().toISOString();
        guardarBorrador();
        mostrarPregunta(primeraVisibleDesde(0));
      }
    }, 'Aceptó participar'),
    el('button', { class: 'btn secundario', onclick: () => terminarComoVisita('Rechazó la encuesta') }, 'No aceptó'),
    el('button', { class: 'btn secundario', onclick: () => terminarComoVisita('No hay nadie en casa') }, 'No hay nadie en casa')
  );
}

async function terminarComoVisita(motivo) {
  const e = S.enc;
  pararGPS();
  await DB.guardar({
    uuid: e.uuid, tipo: 'visita', cedula: S.sesion.cedula, fecha: new Date().toISOString(),
    gps: S.ultimaPos || e.gpsInicio, parroquia: e.respuestas.P03_parroquia || S.sesion.parroquia || '', resultado: motivo,
    prueba: modoPrueba(), estadoEnvio: 'pendiente', creado: new Date().toISOString()
  });
  S.enc = null; borrarBorrador();
  aviso('Registrado: ' + motivo);
  pantallaInicio(); sincronizar(true);
}

// ---- Borrador (recupera la encuesta si el teléfono se apaga o se cierra la app) ----
function guardarBorrador() {
  if (!S.enc) return;
  const b = Object.assign({}, S.enc); delete b.preguntas;
  LS.set('borrador', b);
}
function borrarBorrador() { LS.del('borrador'); }
function recuperarBorrador() {
  const b = LS.get('borrador');
  if (!b) return;
  S.enc = Object.assign(b, { preguntas: construirCuestionario(S.cfg, S.sesion) });
  vigilarGPS();
  if (!S.enc.inicio) return pantallaPreparacion();
  mostrarPregunta(S.enc.idx || 0);
}

// ---- Preguntas ----
function val(fnOValor) { return typeof fnOValor === 'function' ? fnOValor(S.enc.respuestas) : fnOValor; }
function visible(q) { return !q.mostrarSi || q.mostrarSi(S.enc.respuestas); }
function primeraVisibleDesde(i) { const p = S.enc.preguntas; while (i < p.length && !visible(p[i])) i++; return i; }
function contarVisibles() { return S.enc.preguntas.filter(visible).length; }

function valida(q, v) {
  switch (q.tipo) {
    case 'numero': return v !== '' && v !== undefined && !isNaN(v) && Number(v) >= q.min && Number(v) <= q.max;
    case 'multiple': return Array.isArray(v) && v.length > 0 && v.length <= q.max;
    case 'texto': return typeof v === 'string' && v.trim().length > 0;
    case 'matriz': { const filas = val(q.filas); return v && filas.every(f => v[f.label]); }
    case 'telefono': return S.enc.sinTelefono || /^09\d{8}$/.test(S.enc.telefono) || /^0[2-7]\d{7}$/.test(S.enc.telefono);
    default: return v !== undefined && v !== null && v !== '';
  }
}

function mostrarPregunta(i) {
  const e = S.enc;
  if (i >= e.preguntas.length) return finalizarEncuesta();
  e.idx = i;
  guardarBorrador();
  const q = e.preguntas[i];
  const visibles = e.preguntas.filter(visible);
  const pos = visibles.indexOf(q) + 1;
  const mostradaEn = Date.now();
  let v = e.respuestas[q.id];
  if (v === undefined && q.porDefecto) v = q.porDefecto;

  const btnSig = el('button', { class: 'btn primario', onclick: siguiente }, pos === visibles.length ? 'Guardar encuesta' : 'Siguiente');
  const btnAtras = el('button', { class: 'btn secundario', onclick: atras }, 'Atrás');
  const cuerpo = el('div');
  const actualizar = () => { btnSig.disabled = !valida(q, v); };

  function registrarTiempo() { e.tiempos[q.id] = (e.tiempos[q.id] || 0) + (Date.now() - mostradaEn); }
  function siguiente() {
    if (!valida(q, v)) return;
    if (q.tipo !== 'telefono') e.respuestas[q.id] = v;
    registrarTiempo();
    const motivo = q.terminaSi && q.terminaSi(v);
    if (motivo) return terminarComoVisita(motivo);
    e.historial.push(i);
    mostrarPregunta(primeraVisibleDesde(i + 1));
  }
  function atras() {
    registrarTiempo();
    if (q.tipo !== 'telefono' && v !== undefined) e.respuestas[q.id] = v;
    const prev = e.historial.pop();
    if (prev === undefined) return pantallaConsentimiento();
    mostrarPregunta(prev);
  }
  function botonOpcion(o, esSel, onSel, clase) {
    return el('button', { class: 'opcion' + (clase ? ' ' + clase : '') + (esSel ? ' sel' : ''), onclick: onSel },
      o.texto || o.label, o.detalle ? el('small', null, o.detalle) : null);
  }
  function tarjetaCandidato(o, esSel, onSel) {
    const foto = IMG.src(o.foto), logo = IMG.src(o.logo);
    const iniciales = String(o.label).split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
    return el('button', { class: 'opcion candidato' + (esSel ? ' sel' : ''), onclick: onSel },
      foto ? el('img', { class: 'cand-foto', src: foto, alt: '' }) : el('span', { class: 'cand-foto cand-iniciales' }, iniciales),
      el('span', { class: 'cand-texto' },
        el('span', { class: 'cand-nombre' }, o.label),
        el('span', { class: 'cand-partido' }, [o.organizacion, o.lista ? 'Lista ' + o.lista : ''].filter(Boolean).join(' · '))),
      logo ? el('img', { class: 'cand-logo', src: logo, alt: o.organizacion || '' }) : (o.lista ? el('span', { class: 'cand-logo cand-lista' }, o.lista) : null));
  }
  function marcar(cont, btn) { [...cont.querySelectorAll('.opcion')].forEach(x => x.classList.remove('sel')); btn.classList.add('sel'); }

  switch (q.tipo) {
    case 'numero': {
      const inp = el('input', { type: 'number', inputmode: 'numeric', min: q.min, max: q.max, value: v === undefined ? '' : v });
      inp.addEventListener('input', () => { v = inp.value === '' ? '' : Number(inp.value); actualizar(); });
      cuerpo.append(inp);
      setTimeout(() => inp.focus(), 50);
      break;
    }
    case 'unica': {
      const cont = el('div', { class: 'opciones' });
      (q.aleatorio ? ordenGuardado(q, q.opciones) : q.opciones).forEach(o => {
        const b = botonOpcion(o, v === o.label, (ev) => { v = o.label; marcar(cont, ev.currentTarget); actualizar(); });
        cont.append(b);
      });
      cuerpo.append(cont);
      break;
    }
    case 'parroquia': {
      const sel = el('select', null, el('option', { value: '' }, '— Seleccione —'),
        el('optgroup', { label: 'Urbanas' }, q.opciones.filter(o => o.detalle !== 'rural').map(o => el('option', { value: o.label, selected: v === o.label }, o.label))),
        el('optgroup', { label: 'Rurales' }, q.opciones.filter(o => o.detalle === 'rural').map(o => el('option', { value: o.label, selected: v === o.label }, o.label))));
      sel.addEventListener('change', () => { v = sel.value; actualizar(); });
      cuerpo.append(sel);
      break;
    }
    case 'multiple': {
      v = Array.isArray(v) ? v.slice() : [];
      const cont = el('div', { class: 'opciones' });
      ordenGuardado(q, q.opciones).forEach(o => {
        const b = botonOpcion(o, v.includes(o.label), (ev) => {
          const k = v.indexOf(o.label);
          if (k >= 0) { v.splice(k, 1); ev.currentTarget.classList.remove('sel'); }
          else if (v.length < q.max) { v.push(o.label); ev.currentTarget.classList.add('sel'); }
          else aviso('Máximo ' + q.max + ' opciones');
          actualizar();
        });
        cont.append(b);
      });
      cuerpo.append(cont);
      break;
    }
    case 'texto': {
      const inp = el('input', { type: 'text', autocomplete: 'off', value: v && !(q.rapidas || []).includes(v) ? v : '', placeholder: 'Escriba la respuesta' });
      const chips = el('div', { class: 'chips-rapidas' });
      (q.rapidas || []).forEach(r => {
        chips.append(botonOpcion({ label: r }, v === r, (ev) => { v = r; inp.value = ''; marcar(chips, ev.currentTarget); actualizar(); }));
      });
      inp.addEventListener('input', () => { v = inp.value; [...chips.children].forEach(x => x.classList.remove('sel')); actualizar(); });
      cuerpo.append(inp, chips);
      break;
    }
    case 'papeleta': {
      const op = val(q.opciones);
      const clave = q.id + ':' + val(q.dignidad);
      if (!e.orden[clave]) e.orden[clave] = barajar(op.aleatorias.map(o => o.id));
      const ordenadas = e.orden[clave].map(id => op.aleatorias.find(o => o.id === id)).filter(Boolean);
      const etiquetas = ordenadas.map(o => o.label).concat(op.fijas.map(o => o.label));
      if (v !== undefined && !etiquetas.includes(v)) v = undefined;
      const cont = el('div', { class: 'opciones' });
      ordenadas.forEach(o => cont.append(tarjetaCandidato(o, v === o.label, (ev) => { v = o.label; marcar(cont, ev.currentTarget); actualizar(); })));
      cont.append(el('div', { class: 'separador' }));
      op.fijas.forEach(o => cont.append(botonOpcion(o, v === o.label, (ev) => { v = o.label; marcar(cont, ev.currentTarget); actualizar(); }, 'especial')));
      cuerpo.append(cont);
      break;
    }
    case 'matriz': {
      const filas = val(q.filas);
      v = Object.assign({}, v || {});
      Object.keys(v).forEach(k => { if (!filas.some(f => f.label === k)) delete v[k]; });
      const cont = el('div', { class: 'opciones' });
      ordenGuardado(q, filas).forEach(f => {
        const cols = el('div', { class: 'cols' });
        q.columnas.forEach(c => cols.append(botonOpcion({ label: c }, v[f.label] === c, (ev) => { v[f.label] = c; marcar(cols, ev.currentTarget); actualizar(); })));
        const fotoM = IMG.src(f.foto);
        cont.append(el('div', { class: 'matriz-fila' },
          el('div', { class: 'nombre con-foto' }, fotoM ? el('img', { class: 'cand-foto chica', src: fotoM, alt: '' }) : null,
            el('span', null, f.label, f.detalle ? el('small', null, f.detalle) : null)), cols));
      });
      cuerpo.append(cont);
      break;
    }
    case 'telefono': {
      const inp = el('input', { type: 'tel', inputmode: 'numeric', maxlength: 10, placeholder: '09XXXXXXXX', value: e.telefono || '' });
      const chk = el('input', { type: 'checkbox', checked: e.sinTelefono });
      inp.addEventListener('input', () => { e.telefono = inp.value.replace(/\D/g, ''); if (e.telefono) { e.sinTelefono = false; chk.checked = false; } actualizar(); });
      chk.addEventListener('change', () => { e.sinTelefono = chk.checked; if (chk.checked) { inp.value = ''; e.telefono = ''; } actualizar(); });
      cuerpo.append(inp, el('label', { class: 'check' }, chk, el('span', null, 'No desea dar teléfono')));
      break;
    }
  }

  pintar(
    encabezado(), bandaPrueba(),
    el('div', { class: 'suave' }, `Pregunta ${pos} de ${visibles.length}`),
    el('div', { class: 'progreso' }, el('div', { style: `width:${Math.round(100 * (pos - 1) / visibles.length)}%` })),
    el('div', { class: 'pregunta' }, val(q.texto)),
    q.instruccion ? el('div', { class: 'instruccion' }, q.instruccion) : null,
    cuerpo,
    el('button', {
      class: 'btn', style: 'background:none;color:var(--error);font-weight:500;margin-top:24px', onclick: () => {
        if (confirm('¿La persona abandonó la entrevista? Las respuestas se descartan y se registra como visita.')) terminarComoVisita('Abandonó la entrevista');
      }
    }, 'La persona abandonó la entrevista'),
    el('div', { class: 'pie-fijo' }, el('div', { class: 'fila-btns' }, btnAtras, btnSig))
  );
  actualizar();
}

function ordenGuardado(q, lista) {
  const e = S.enc;
  if (!q.aleatorio) return lista;
  const ids = lista.map(o => o.label);
  const guard = e.orden[q.id];
  if (!guard || guard.length !== ids.length || !ids.every(x => guard.includes(x))) {
    // Las opciones "Otro" / "No sabe" se quedan al final
    const fijas = ids.filter(x => /^(Otro|No sabe)$/.test(x));
    e.orden[q.id] = barajar(ids.filter(x => !fijas.includes(x))).concat(fijas);
  }
  return e.orden[q.id].map(l => lista.find(o => o.label === l));
}

// ---- Guardar y bloquear ----
async function finalizarEncuesta() {
  const e = S.enc, cfg = S.cfg;
  pintar(encabezado(), el('div', { class: 'cargando' }, 'Guardando encuesta…'));
  let gpsFin = S.ultimaPos;
  if (!gpsFin || (Date.now() - new Date(gpsFin.t).getTime()) > 120000) {
    const g = await obtenerGPS(8000, 30);
    if (!g.error) gpsFin = g;
  }
  pararGPS();
  const respuestas = {};
  e.preguntas.forEach(q => { if (q.id !== 'TEL' && visible(q) && e.respuestas[q.id] !== undefined) respuestas[q.id] = e.respuestas[q.id]; });
  const parroquia = respuestas.P03_parroquia || '';
  const zona = ((cfg.parroquias || []).find(p => p.nombre === parroquia) || {}).zona || '';
  const tiempos = {};
  Object.keys(e.tiempos).forEach(k => { if (respuestas[k] !== undefined || k === 'TEL') tiempos[k] = e.tiempos[k]; });
  const registro = {
    uuid: e.uuid, tipo: 'encuesta', cedula: S.sesion.cedula,
    inicio: e.inicio, fin: new Date().toISOString(),
    gpsInicio: e.gpsInicio, gpsFin: gpsFin || null,
    parroquia, zona, respuestas, tiempos, ordenOpciones: e.orden,
    telefonoVerificacion: e.sinTelefono ? '' : e.telefono,
    foto: e.foto, fotoHash: e.fotoHash, fotoEdadSeg: e.fotoEdadSeg,
    prueba: modoPrueba(), versionCuestionario: cfg.version,
    estadoEnvio: 'pendiente', creado: new Date().toISOString()
  };
  await DB.guardar(registro);
  const cierre = { uuidEncuesta: e.uuid, parroquia, gps: gpsFin || e.gpsInicio };
  S.enc = null; borrarBorrador();
  sincronizar(true);
  pintar(
    encabezado(), bandaPrueba(),
    el('div', { class: 'caja-ok' }, '✓ Encuesta guardada y cerrada', el('div', { style: 'font-weight:400;font-size:.9rem;margin-top:4px' }, 'Las respuestas ya no se pueden modificar.')),
    cfg.cierreActivo
      ? [el('p', null, 'Ahora sí, si la persona lo permite, puede presentar el mensaje de campaña.'),
      el('button', { class: 'btn primario enorme', onclick: () => pantallaCierre(cierre) }, 'Continuar al mensaje final'),
      el('button', { class: 'btn secundario', onclick: pantallaInicio }, 'Omitir y terminar')]
      : el('button', { class: 'btn primario enorme', onclick: pantallaInicio }, 'Terminar')
  );
}

// ---- Cierre de campaña (separado de la encuesta) ----
function pantallaCierre(ctx) {
  const datos = {};
  const nombre = el('input', { type: 'text', autocomplete: 'off', placeholder: 'Nombre' });
  const wa = el('input', { type: 'tel', inputmode: 'numeric', maxlength: 10, placeholder: '09XXXXXXXX' });
  const bloqueContacto = el('div', { style: 'display:none' }, el('label', { class: 'campo' }, 'Nombre'), nombre, el('label', { class: 'campo' }, 'WhatsApp'), wa);
  const btn = el('button', { class: 'btn primario enorme', onclick: guardar }, 'Guardar y terminar');
  const preguntas = PREGUNTAS_CIERRE.map(p => {
    const cont = el('div', { class: 'cols', style: 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px' });
    p.opciones.forEach(o => cont.append(el('button', {
      class: 'opcion', style: 'width:auto;flex:1 1 40%;text-align:center', onclick: (ev) => {
        datos[p.id] = o;
        [...cont.children].forEach(x => x.classList.remove('sel')); ev.currentTarget.classList.add('sel');
        if (p.id === 'autorizaContacto') bloqueContacto.style.display = o === 'Sí' ? 'block' : 'none';
      }
    }, o)));
    return el('div', { class: 'matriz-fila', style: 'margin-bottom:10px' }, el('div', { class: 'nombre' }, p.texto), cont);
  });
  async function guardar() {
    if (datos.autorizaContacto === 'Sí') {
      datos.nombre = nombre.value.trim();
      datos.whatsapp = wa.value.replace(/\D/g, '');
      if (!/^09\d{8}$/.test(datos.whatsapp)) return aviso('Revise el número de WhatsApp (09XXXXXXXX)');
    }
    btn.disabled = true;
    await DB.guardar({
      uuid: ctx.uuidEncuesta + '-contacto', uuidEncuesta: ctx.uuidEncuesta, tipo: 'contacto', cedula: S.sesion.cedula,
      fecha: new Date().toISOString(), parroquia: ctx.parroquia, cierre: datos, prueba: modoPrueba(),
      estadoEnvio: 'pendiente', creado: new Date().toISOString()
    });
    aviso('¡Gracias! Registro guardado');
    pantallaInicio(); sincronizar(true);
  }
  pintar(
    encabezado(), bandaPrueba(),
    el('h1', null, 'Mensaje final'),
    el('div', { class: 'guion' }, S.cfg.guionCierre),
    el('p', { class: 'suave', style: 'margin-top:14px' }, 'Registre la reacción. El contacto solo se guarda si la persona lo autoriza.'),
    preguntas, bloqueContacto, btn,
    el('button', { class: 'btn secundario', onclick: pantallaInicio }, 'Omitir')
  );
}

// ---------------- Arranque ----------------
(async function arrancar() {
  actualizarBarraRed();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
  IMG.cargarTodo();
  try { await DB.abrir(); } catch (e) {
    pintar(el('div', { class: 'caja-error' }, 'Este navegador no permite guardar datos. Use Chrome actualizado y no use modo incógnito.'));
    return;
  }
  if (S.sesion && !S.sesion.expirada) {
    await cargarConfig(false);
    pantallaInicio();
    sincronizar(true);
  } else pantallaLogin();
})();

// Evita cerrar la app por accidente en medio de una encuesta
window.addEventListener('beforeunload', ev => { if (S.enc && S.enc.inicio) { ev.preventDefault(); ev.returnValue = ''; } });
