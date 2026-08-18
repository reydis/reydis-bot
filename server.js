const express = require('express');
const axios   = require('axios');
const cheerio = require('cheerio');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3000;

// ── TELEGRAM BOT ────────────────────────────────────────────────────────────
const TG_TOKEN   = process.env.TELEGRAM_TOKEN || '';
const TG_CHAT_IDS = (() => {
  const raw = process.env.TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
})();
const TG_ACTIVO = !!(TG_TOKEN && TG_CHAT_IDS.length);

const yaNotificado = {};
const yaChequeado = {};
let primeraSyncTrasArranque = true;
let primerSyncTrasArranque = true;

async function enviarTelegram(mensaje) {
  if (!TG_ACTIVO) return;
  await Promise.allSettled(TG_CHAT_IDS.map(chatId =>
    axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { chat_id: chatId, text: mensaje, parse_mode: 'HTML' }, { timeout: 8000 })
  ));
}

async function notificarNuevosSorteos() {
  if (!TG_ACTIVO) return;
  const esArranque = primeraSyncTrasArranque;
  primeraSyncTrasArranque = false;

  const nuevos = [];
  for (const [k, s] of Object.entries(estado.sorteos)) {
    if (s.numeros.length >= 3 && !yaNotificado[k]) nuevos.push({ tipo: 'sorteo', clave: k, nombre: s.nombre, hora: s.hora, numeros: s.numeros });
  }
  for (const [k, c] of Object.entries(estado.cuartetas)) {
    if (c.numeros.length >= 4 && !yaNotificado[k]) nuevos.push({ tipo: 'cuarteta', clave: k, nombre: c.nombre, hora: c.hora, numeros: c.numeros });
  }
  for (const [k, e] of Object.entries(estado.especiales)) {
    if (e.numeros.length > 0 && !yaNotificado[k]) nuevos.push({ tipo: 'especial', clave: k, nombre: e.nombre, hora: e.hora, numeros: e.numeros, empresa: e.empresa });
  }

  if (nuevos.length === 0) return;

  for (const n of nuevos) yaNotificado[n.clave] = true;
  if (primerSyncTrasArranque || esArranque) return; 

  console.log(`📱 Notificando ${nuevos.length} resultado(s) en UN solo mensaje...`);
  const lineas = nuevos.map(n => {
    const nums = n.numeros.map(x => String(x).padStart(2, '0')).join('-');
    const etiqueta = n.tipo === 'cuarteta' ? '🎲' : n.tipo === 'especial' ? '🎰' : '✅';
    const extra = n.empresa ? ` [${n.empresa}]` : '';
    return `${etiqueta} <b>${n.nombre}</b>${extra} — <b>${nums}</b> <i>(${n.hora})</i>`;
  });
  await enviarTelegram(`🇩🇴 <b>REYDIS RADAR PRO</b> — ${fechaRD()}\n📥 <b>${nuevos.length} resultado(s) nuevo(s):</b>\n\n` + lineas.join('\n'));
}

// ── PERSISTENCIA: SUPABASE & DISCO ──────────────────────────────────────────
const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'estado.json');
function guardarEnDisco() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({ fecha: estado.fecha, historico: estado.historico }));
  } catch (e) {}
}
function cargarDeDisco() { try { return fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : null; } catch (e) { return null; } }

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const SUPABASE_ACTIVO = !!(SUPABASE_URL && SUPABASE_KEY);

async function guardarEnSupabase(snapshot) {
  if (!SUPABASE_ACTIVO) return false;
  try {
    await axios.post(`${SUPABASE_URL}/rest/v1/historico?on_conflict=fecha`, 
      { fecha: snapshot.fecha, sorteos: snapshot.sorteos, cuartetas: snapshot.cuartetas, especiales: snapshot.especiales || {} },
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }, timeout: 10000 }
    );
    return true;
  } catch (e) { return false; }
}

async function cargarDeSupabase() {
  if (!SUPABASE_ACTIVO) return null;
  try {
    const res = await axios.get(`${SUPABASE_URL}/rest/v1/historico?select=fecha,sorteos,cuartetas,especiales&order=fecha.desc&limit=90`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, timeout: 10000 }
    );
    return res.data.map(r => ({ fecha: r.fecha, sorteos: r.sorteos, cuartetas: r.cuartetas, especiales: r.especiales || {} }));
  } catch (e) { return null; }
}

async function inicializarPersistenciaRemota() {
  if (!SUPABASE_ACTIVO) return;
  const remoto = await cargarDeSupabase();
  if (remoto && remoto.length > 0) {
    estado.historico = remoto.filter(r => r.fecha !== estado.fecha);
    const hoyData = remoto.find(r => r.fecha === estado.fecha);
    if (hoyData) {
      if (hoyData.sorteos) estado.sorteos = hoyData.sorteos;
      if (hoyData.cuartetas) estado.cuartetas = hoyData.cuartetas;
      if (hoyData.especiales) estado.especiales = hoyData.especiales;
      for (const k of Object.keys(estado.sorteos)) if (estado.sorteos[k].numeros && estado.sorteos[k].numeros.length >= 3) { yaNotificado[k] = true; yaChequeado[`${k}|radar`] = true; yaChequeado[`${k}|punto`] = true; }
      for (const k of Object.keys(estado.cuartetas)) if (estado.cuartetas[k].numeros && estado.cuartetas[k].numeros.length >= 4) yaNotificado[k] = true;
      for (const k of Object.keys(estado.especiales)) if (estado.especiales[k].numeros && estado.especiales[k].numeros.length > 0) yaNotificado[k] = true;
    }
  } else if (remoto !== null && estado.historico.length > 0) {
    for (const dia of estado.historico) await guardarEnSupabase(dia);
  }
}

// ── CONFIGURACIÓN DEL ESTADO ────────────────────────────────────────────────
function fechaRD() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function horaRD() { return new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); }

const persistido = cargarDeDisco();
let estado = {
  fecha: fechaRD(), hora_actualizacion: horaRD(),
  sorteos: crearSorteos(), cuartetas: crearCuartetas(), especiales: crearJuegosEspeciales(),
  historico: persistido?.historico || []
};

function crearCuartetas() { return { cuarteta_m: { nombre:'La Cuarteta Mañana', hora:'10:00 AM', numeros:[], estado:'pendiente' }, cuarteta_md: { nombre:'La Cuarteta Medio Día', hora:'1:00 PM', numeros:[], estado:'pendiente' }, cuarteta_t: { nombre:'La Cuarteta Tarde', hora:'6:00 PM', numeros:[], estado:'pendiente' }, cuarteta_n: { nombre:'La Cuarteta Noche', hora:'9:00 PM', numeros:[], estado:'pendiente' } }; }
function crearJuegosEspeciales() { return { pega3mas: { nombre:'Pega 3 Más', empresa:'LEIDSA', hora:'9:00 PM', tipo:'pega3', numeros:[], estado:'pendiente', rango:[0,50], cant:3 }, superkino: { nombre:'Super Kino TV', empresa:'LEIDSA', hora:'9:00 PM', tipo:'kino', numeros:[], estado:'pendiente', rango:[1,80], cant:20 }, loto: { nombre:'Loto', empresa:'LEIDSA', hora:'9:00 PM', tipo:'loto', numeros:[], estado:'pendiente', rango:[1,40], cant:6 }, lotomas: { nombre:'Loto Más', empresa:'LEIDSA', hora:'9:00 PM', tipo:'lotomas', numeros:[], estado:'pendiente', rango:[1,40], cant:7 }, quemaito: { nombre:'El Quemaito Mayor', empresa:'LOTEDOM', hora:'1:55 PM', tipo:'quiniela', numeros:[], estado:'pendiente', rango:[0,99], cant:1 }, megachance:{ nombre:'Mega Chance', empresa:'LOTEKA', hora:'7:55 PM', tipo:'chance', numeros:[], estado:'pendiente', rango:[0,99], cant:5 }, pega4king: { nombre:'Pega 4 Real', empresa:'REAL', hora:'12:55 PM', tipo:'pega4', numeros:[], estado:'pendiente', rango:[0,9], cant:4 } }; }
function crearSorteos() { return { anguila_m: { nombre:'Anguila Mañana', hora:'10:00 AM', numeros:[], estado:'pendiente' }, laprimera: { nombre:'La Primera Día', hora:'12:00 PM', numeros:[], estado:'pendiente' }, lotedom: { nombre:'LoteDom', hora:'12:00 PM', numeros:[], estado:'pendiente' }, suerte: { nombre:'La Suerte 12:30', hora:'12:30 PM', numeros:[], estado:'pendiente' }, king_t: { nombre:'King Tarde', hora:'12:30 PM', numeros:[], estado:'pendiente' }, real_t: { nombre:'Lotería Real', hora:'1:00 PM', numeros:[], estado:'pendiente' }, anguila_t: { nombre:'Anguila 1:00 PM', hora:'1:00 PM', numeros:[], estado:'pendiente' }, gana_mas: { nombre:'Gana Más', hora:'2:30 PM', numeros:[], estado:'pendiente' }, new_york_t: { nombre:'New York Tarde', hora:'2:30 PM', numeros:[], estado:'pendiente' }, florida_d: { nombre:'Florida Día', hora:'2:00 PM', numeros:[], estado:'pendiente' }, suerte_t2: { nombre:'La Suerte Tarde', hora:'6:00 PM', numeros:[], estado:'pendiente' }, anguila_n: { nombre:'Anguila 6:00 PM', hora:'6:00 PM', numeros:[], estado:'pendiente' }, king_n: { nombre:'King Noche', hora:'7:00 PM', numeros:[], estado:'pendiente' }, loteka: { nombre:'Loteka', hora:'6:55 PM', numeros:[], estado:'pendiente' }, laprimera_n: { nombre:'La Primera Noche', hora:'7:00 PM', numeros:[], estado:'pendiente' }, leidsa: { nombre:'Leidsa', hora:'8:55 PM', numeros:[], estado:'pendiente' }, nacional: { nombre:'Lotería Nacional', hora:'9:00 PM', numeros:[], estado:'pendiente' }, anguila_nn: { nombre:'Anguila 9:00 PM', hora:'9:00 PM', numeros:[], estado:'pendiente' }, new_york_n: { nombre:'New York Noche', hora:'10:30 PM', numeros:[], estado:'pendiente' }, florida_n: { nombre:'Florida Noche', hora:'10:30 PM', numeros:[], estado:'pendiente' } }; }

const MAPA = { 'anguila mañana': 'anguila_m', 'anguila medio día': 'anguila_t', 'anguila tarde': 'anguila_n', 'anguila noche': 'anguila_nn', 'la primera día': 'laprimera', 'primera noche': 'laprimera_n', 'quiniela lotedom': 'lotedom', 'lotedom': 'lotedom', 'la suerte 12:30': 'suerte', 'la suerte 18:00': 'suerte_t2', 'quiniela real': 'real_t', 'lotería real': 'real_t', 'gana más': 'gana_mas', 'new york tarde': 'new_york_t', 'new york noche': 'new_york_n', 'quiniela leidsa': 'leidsa', 'lotería nacional': 'nacional', 'quiniela loteka': 'loteka', 'king lottery 12:30': 'king_t', 'king lottery 7:30': 'king_n', 'florida día': 'florida_d', 'florida noche': 'florida_n', 'la suerte tarde': 'suerte_t2', 'king tarde': 'king_t', 'king noche': 'king_n' };
const MAPA_ESPECIALES = { 'pega 3 más':'pega3mas', 'super kino tv':'superkino', 'loto más':'lotomas', 'loto':'loto', 'el quemaito':'quemaito', 'mega chance':'megachance', 'pega 4':'pega4king' };
const MAPA_CUARTETA = { 'la cuarteta mañana':'cuarteta_m', 'la cuarteta medio día':'cuarteta_md', 'la cuarteta tarde':'cuarteta_t', 'la cuarteta noche':'cuarteta_n' };

function buscarClave(texto) { const t = texto.toLowerCase().trim(); for (const [k, v] of Object.entries(MAPA)) if (t.includes(k)) return v; return null; }
function buscarClaveEspecial(texto) { const t = texto.toLowerCase().trim(); for (const [k, v] of Object.entries(MAPA_ESPECIALES)) if (t.includes(k)) return v; return null; }

const HEADERS = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,application/json' };

// ── SCRAPERS ─────────────────────────────────────────────────────────────────
async function scrapeConectateAPI() {
  try {
    const res = await axios.get('https://www.conectate.com.do/loterias/api/widget', { headers: HEADERS, timeout: 10000 });
    const items = Array.isArray(res.data) ? res.data : (res.data?.data || []);
    let conteo = 0;
    for (const item of items) {
      const nombre = (item.game_title || '').toString().trim();
      const [año, mes, dia] = estado.fecha.split('-');
      if (!item.today && item.date !== `${dia}-${mes}`) continue;
      const scoreArr = item.score;
      if (!Array.isArray(scoreArr) || scoreArr.length === 0) continue;

      const clave = buscarClave(nombre);
      if (clave && estado.sorteos[clave] && estado.sorteos[clave].numeros.length < 3 && scoreArr.length >= 3) {
        const nums = scoreArr.slice(0,3).map(n=>parseInt(n,10)).filter(n=>!isNaN(n));
        if (nums.length === 3 && !(nums.includes(0) && nums.includes(99))) {
          estado.sorteos[clave].numeros = nums; estado.sorteos[clave].estado = 'disponible'; conteo++;
        }
        continue;
      }
      const claveEsp = buscarClaveEspecial(nombre);
      if (claveEsp && estado.especiales[claveEsp]) {
        const juego = estado.especiales[claveEsp];
        if (juego.numeros.length >= juego.cant) continue;
        let nums;
        if (juego.tipo === 'pega3' || juego.tipo === 'pega4') {
          const padded = scoreArr.join('').replace(/\D/g, '').padStart(juego.cant, '0').slice(-juego.cant);
          nums = padded.split('').map(d => parseInt(d, 10));
        } else {
          nums = scoreArr.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
        }
        if (nums.length >= juego.cant) {
          juego.numeros = nums.slice(0, juego.cant); juego.estado = 'disponible'; conteo++;
        }
      }
    }
    return conteo;
  } catch (e) { return 0; }
}

const LOTS_SCRAPER_MAP = [
  ['anguila/anguila-manana','anguila_m'], ['anguila/anguila-medio-dia','anguila_t'], ['anguila/anguila-tarde','anguila_n'],
  ['anguila/anguila-noche','anguila_nn'], ['la-primera/la-primera-dia','laprimera_d'], ['lotedom','lotedom'],
  ['la-suerte-dominicana/la-suerte-12-30','suerte_m'], ['king-lottery/king-tarde','king_t'], ['loto-real/real-tarde','real_t'],
  ['la-primera/gana-mas','gana_mas'], ['nueva-york/new-york-tarde','new_york_t'], ['loteria-de-florida/florida-dia','florida_d'],
  ['la-suerte-dominicana/la-suerte-tarde','suerte_t2'], ['king-lottery/king-noche','king_n'], ['loteka','loteka'],
  ['la-primera/la-primera-noche','laprimera_n'], ['leidsa','leidsa'], ['loteria-nacional','nacional'],
  ['nueva-york/new-york-noche','new_york_n'], ['loteria-de-florida/florida-noche','florida_n']
];

async function scrapeLotDominicanas() {
  const pendientesMap = LOTS_SCRAPER_MAP.filter(([, k]) => estado.sorteos[k] && estado.sorteos[k].numeros.length < 3);
  if (pendientesMap.length === 0) return 0;
  let conteo = 0;
  for (const [path, clave] of pendientesMap) {
    try {
      const res = await axios.get(`https://loteriasdominicanas.com/${path}/_payload.json`, { headers: HEADERS, timeout: 10000 });
      const raw = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      if (!Array.isArray(raw)) continue;
      for (let i = 0; i < raw.length; i++) {
        if (Array.isArray(raw[i]) && raw[i].length === 3) {
          const nums = raw[i].map(Number);
          if (nums.every(n => !isNaN(n) && n >= 0 && n <= 99) && i > 10) {
            estado.sorteos[clave].numeros = nums; estado.sorteos[clave].estado = 'disponible'; conteo++; break;
          }
        }
      }
    } catch (e) {}
  }
  return conteo;
}

const ENLOTERIA_REGLAS = [
  [/primera.*noche/, 'laprimera_n'], [/primera/, 'laprimera'], [/lotedom/, 'lotedom'], [/suerte.*(6|18|tarde)/, 'suerte_t2'], [/suerte/, 'suerte'], [/king.*(noche|7)/, 'king_n'], [/king/, 'king_t'], [/^(quiniela )?real$/, 'real_t'], [/gana.*mas/, 'gana_mas'], [/(new.*york|nueva.*york).*(noche|10)/, 'new_york_n'], [/(new.*york|nueva.*york)/, 'new_york_t'], [/florida.*(noche|10)/, 'florida_n'], [/florida/, 'florida_d'], [/^(quiniela )?loteka$/, 'loteka'], [/^(quiniela )?leidsa$/, 'leidsa'], [/nacional/, 'nacional'],
];
const ANGUILA_HORAS = { '10am': 'anguila_m', '1pm': 'anguila_t', '6pm': 'anguila_n', '9pm': 'anguila_nn' };
function claveEnloteria(slug) {
  const s = slug.toLowerCase().replace(/-/g, ' ');
  const ang = s.match(/anguil+a\s+(\d{1,2})\s*(am|pm)/);
  if (ang) return ANGUILA_HORAS[ang[1] + ang[2]] || null;
  if (/anguil/.test(s)) return null;
  for (const [re, clave] of ENLOTERIA_REGLAS) if (re.test(s)) return clave;
  return null;
}
const MESES_ES = { enero:'01', febrero:'02', marzo:'03', abril:'04', mayo:'05', junio:'06', julio:'07', agosto:'08', septiembre:'09', octubre:'10', noviembre:'11', diciembre:'12' };
function fechaEnloteria(texto) {
  const m = texto.match(/(\d{1,2})\s+de\s+([a-záéíóú]+),?\s+(\d{4})/i);
  return m && MESES_ES[m[2].toLowerCase()] ? `${m[3]}-${MESES_ES[m[2].toLowerCase()]}-${String(m[1]).padStart(2,'0')}` : null;
}
function parsearEnloteria(html) {
  const $ = cheerio.load(html); const tarjetas = []; const vistos = new Set();
  $('a[href*="/resultados-"]').each((_, a) => {
    const m = ($(a).attr('href') || '').match(/\/resultados-([a-z0-9-]+?)(?:-hoy|-ayer|-antes-de-ayer|-\d{4}-\d{2}-\d{2})?$/);
    if (!m || m[1] === 'loterias') return;
    let $c = $(a).parent(), fecha = null;
    for (let i = 0; i < 6 && $c.length; i++) { fecha = fechaEnloteria($c.text()); if (fecha) break; $c = $c.parent(); }
    if (!fecha || /Avísame cuando salga/i.test($c.text())) return;
    const nums = [];
    $c.find('*').addBack().contents().each((_, n) => {
      if (n.type === 'text' && /^\d{1,2}$/.test($(n).text().trim())) nums.push(parseInt($(n).text().trim(), 10));
    });
    if (nums.length < 3) return;
    const key = `${m[1]}|${fecha}`;
    if (vistos.has(key)) return;
    vistos.add(key);
    tarjetas.push({ slug: m[1], clave: claveEnloteria(m[1]), fecha, numeros: nums.slice(0, 6) });
  });
  return tarjetas;
}

async function scrapeEnloteria() {
  if (Object.values(estado.sorteos).filter(s => s.numeros.length < 3).length === 0) return 0;
  try {
    const res = await axios.get('https://enloteria.com/resultados-loterias-hoy', { headers: HEADERS, timeout: 15000 });
    const tarjetas = parsearEnloteria(res.data);
    const hoy = fechaRD(); let conteo = 0;
    for (const t of tarjetas) {
      if (t.clave && estado.sorteos[t.clave] && estado.sorteos[t.clave].numeros.length < 3 && t.fecha === hoy) {
        const nums = t.numeros.slice(0, 3);
        if (!nums.every(n => n === nums[0])) { estado.sorteos[t.clave].numeros = nums; estado.sorteos[t.clave].estado = 'disponible'; conteo++; }
      }
    }
    return conteo;
  } catch (e) { return 0; }
}

const YELU_FUENTES = { gana_mas: 'lottery/results/gana-mas', nacional: 'lottery/results/loteria-nacional', leidsa: 'leidsa/results/quiniela-pale', loteka: 'loteria-loteka/results/quiniela-loteka' };
const MESES_ABREV = { ene:'01', feb:'02', mar:'03', abr:'04', may:'05', jun:'06', jul:'07', ago:'08', sep:'09', oct:'10', nov:'11', dic:'12' };
function fechaGanamas(texto) {
  const m = texto.match(/(\d{1,2})\s+(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*\.?,?\s+(\d{4})/i);
  return m ? `${m[3]}-${MESES_ABREV[m[2].toLowerCase()]}-${String(m[1]).padStart(2, '0')}` : null;
}
function parsearGanamas(html, cant, rango) {
  const $ = cheerio.load(html); const porFecha = {}; let fAct = null;
  $('body *').addBack().contents().each((_, n) => {
    if (n.type !== 'text') return;
    const t = $(n).text().trim(); if (!t) return;
    let p = n.parent, excl = false;
    while (p && p.type === 'tag') {
      const tg = (p.tagName || p.name || '').toLowerCase();
      if (tg === 'a' || tg === 'nav' || tg === 'header' || tg === 'footer' || tg === 'script' || tg === 'style') { excl = true; break; }
      p = p.parent;
    }
    const f = fechaGanamas(t);
    if (f) { fAct = f; if (!porFecha[f]) porFecha[f] = []; return; }
    if (excl) return;
    if (fAct && /^\d{1,2}$/.test(t)) {
      const num = parseInt(t, 10);
      if (num >= rango[0] && num <= rango[1] && porFecha[fAct].length < cant) porFecha[fAct].push(num);
    }
  });
  const res = {}; for (const [f, nums] of Object.entries(porFecha)) if (nums.length === cant) res[f] = nums;
  return res;
}

async function scrapeYelu() {
  const obj = Object.entries(YELU_FUENTES).filter(([k]) => estado.sorteos[k] && estado.sorteos[k].numeros.length < 3);
  if (!obj.length) return 0;
  const hoy = fechaRD(); let conteo = 0;
  for (const [k, r] of obj) {
    try {
      const res = await axios.get(`https://www.yelu.do/${r}`, { headers: HEADERS, timeout: 15000 });
      const tarjetas = parsearGanamas(res.data, 3, [0, 99]);
      const nums = tarjetas[hoy];
      if (nums && nums.length === 3 && !nums.every(n => n === nums[0])) {
        estado.sorteos[k].numeros = nums; estado.sorteos[k].estado = 'disponible'; conteo++;
      }
    } catch (e) {}
  }
  return conteo;
}

async function scrapeCuartetaLotDominicanas() {
  const rdHour = new Date(Date.now() - 4 * 3600 * 1000).getUTCHours();
  const PAGINAS = [['anguila/la-cuarteta-manana', 'cuarteta_m', 10], ['anguila/cuarteta-medio-dia', 'cuarteta_md', 13], ['anguila/cuarteta-tarde', 'cuarteta_t', 18], ['anguila/cuarteta-noche', 'cuarteta_n', 21]];
  const pend = PAGINAS.filter(([, k, h]) => estado.cuartetas[k] && estado.cuartetas[k].numeros.length < 4 && rdHour >= h);
  if (pend.length === 0) return 0;
  let conteo = 0;
  for (const [path, clave] of pend) {
    try {
      const res = await axios.get(`https://loteriasdominicanas.com/${path}`, { headers: HEADERS, timeout: 10000 });
      const $ = cheerio.load(res.data);
      let nums = [];
      $('.game-scores.ball-mode').first().find('span.score').each((j, span) => {
        if (nums.length >= 4) return false;
        if (/^\d{1,2}$/.test($(span).text().trim())) nums.push(parseInt($(span).text().trim(), 10));
      });
      if (nums.length === 4) { estado.cuartetas[clave].numeros = nums; estado.cuartetas[clave].estado = 'disponible'; conteo++; }
    } catch (e) {}
  }
  return conteo;
}

const ESPECIALES_ENLOTERIA = { superkino: 'super-kino-tv', loto: 'loto', lotomas: 'loto', megachance: 'megachance', pega3mas: 'pega-3-mas', pega4king: 'pega-4', quemaito: 'el-quemaito-mayor' };
const ESPECIALES_ENLOTERIA_RE = { superkino: /kino/i, loto: /loto/i, lotomas: /loto/i, megachance: /mega\s*chance/i, pega3mas: /pega\s*3/i, pega4king: /pega\s*4/i, quemaito: /quemaito/i };

function parsearPaginaJuegoEnloteria(html, nombreRe) {
  const $ = cheerio.load(html); const tarjetas = [];
  $('h5').each((_, h) => {
    if (nombreRe && !nombreRe.test($(h).text())) return;
    let $card = $(h).parent(), fecha = null;
    for (let i = 0; i < 6 && $card.length; i++) { fecha = fechaEnloteria($card.text()); if (fecha) break; $card = $card.parent(); }
    if (!fecha || /Avísame cuando salga/i.test($card.text())) return;
    const nums = [];
    $card.find('*').addBack().contents().each((_, node) => {
      if (node.type === 'text' && /^\d{1,2}$/.test($(node).text().trim())) nums.push(parseInt($(node).text().trim(), 10));
    });
    if (nums.length > 0) tarjetas.push({ fecha, numeros: nums });
  });
  return tarjetas;
}

async function scrapeLeidsa() {
  try {
    const res = await axios.get('https://www.leidsa.com/', { headers: HEADERS, timeout: 12000 });
    const $ = cheerio.load(res.data);
    let conteo = 0;
    $('[class*="result"], [class*="number"], [class*="kino"], [class*="pega"], [class*="loto"]').each((i, el) => {
      const texto = $(el).text().trim();
      const nums = texto.match(/\d+/g);
      if (!nums || nums.length === 0) return;
      const textoNorm = texto.toLowerCase();
      let clave = null;
      if (textoNorm.includes('pega 3')) clave = 'pega3mas'; else if (textoNorm.includes('super kino')) clave = 'superkino'; else if (textoNorm.includes('loto más')) clave = 'lotomas'; else if (textoNorm.includes('loto')) clave = 'loto';
      if (clave && estado.especiales[clave] && estado.especiales[clave].numeros.length === 0) {
        const juego = estado.especiales[clave];
        const validos = nums.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
        if (validos.length >= juego.cant) { juego.numeros = validos.slice(0, juego.cant); juego.estado = 'disponible'; conteo++; }
      }
    });
    return conteo;
  } catch (e) { return 0; }
}

async function scrapePega4Yelu() {
  const juego = estado.especiales.pega4king;
  if (!juego || juego.numeros.length > 0) return 0;
  try {
    const res = await axios.get('https://www.yelu.do/loteria-real/results/pega-4-real', { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(res.data);
    const nums = [];
    $('.score, .ball, .numero, .result-number').each((_, el) => {
      if (nums.length >= 4) return false;
      const txt = $(el).text().trim();
      if (/^\d{1}$/.test(txt)) nums.push(parseInt(txt, 10));
    });
    if (nums.length === 4) { juego.numeros = nums; juego.estado = 'disponible'; return 1; }
  } catch (e) { }
  return 0;
}

// ── MÁQUINA DEL TIEMPO (BACKFILL RESTAURADO) ───────────────────────────────
let estadoBackfill = { activo: false, inicio: null, log: [], resumen: null };

function logBF(msg) {
  console.log(`[BACKFILL] ${msg}`);
  estadoBackfill.log.push(msg);
  if (estadoBackfill.log.length > 200) estadoBackfill.log.shift();
}

function listaFechas(desde, hasta) {
  const fechas = [];
  let d = new Date(desde + 'T12:00:00Z');
  const fin = new Date(hasta + 'T12:00:00Z');
  while (d <= fin && fechas.length < 15) {
    fechas.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return fechas;
}

async function ejecutarBackfill(desde, hasta, guardar) {
  estadoBackfill = { activo: true, inicio: new Date().toISOString(), log: [], resumen: null };
  const pausa = ms => new Promise(r => setTimeout(r, ms));
  try {
    const fechas = listaFechas(desde, hasta);
    logBF(`Rango: ${fechas[0]} a ${fechas[fechas.length - 1]} (${fechas.length} dias) - guardar=${guardar}`);

    const existentes = {};
    if (SUPABASE_ACTIVO) {
      try {
        const r = await axios.get(
          `${SUPABASE_URL}/rest/v1/historico?select=fecha,sorteos,cuartetas,especiales&fecha=gte.${fechas[0]}&fecha=lte.${fechas[fechas.length - 1]}`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, timeout: 15000 }
        );
        for (const row of r.data) existentes[row.fecha] = row;
        logBF(`Supabase: ${r.data.length} dias ya existen en el rango`);
      } catch (e) { logBF(`AVISO no pude leer Supabase: ${e.message}`); }
    }

    const quinielasPorDia = {};
    for (const f of fechas) {
      quinielasPorDia[f] = {};
      try {
        const res = await axios.get(`https://enloteria.com/resultados-loterias-${f}`, { headers: HEADERS, timeout: 15000 });
        const tarjetas = parsearEnloteria(res.data);
        let n = 0;
        for (const t of tarjetas) {
          if (t.fecha !== f || !t.clave) continue;
          const nums = t.numeros.slice(0, 3);
          if (nums.length < 3 || nums.every(x => x === nums[0])) continue;
          quinielasPorDia[f][t.clave] = nums; n++;
        }
        logBF(`${f}: ${n} quinielas encontradas`);
      } catch (e) {
        logBF(`${f}: AVISO ${e.message}`);
      }
      await pausa(1300);
    }

    const slugsMalos = new Set();
    const especialesPorDia = {};
    for (const f of fechas) especialesPorDia[f] = {};
    const plantilla = crearJuegosEspeciales();
    const cachePag = {};
    for (const [clave, slug] of Object.entries(ESPECIALES_ENLOTERIA)) {
      const juego = plantilla[clave];
      if (!juego) continue;
      try {
        const re = ESPECIALES_ENLOTERIA_RE[clave];
        const ck = slug + '|' + (re ? re.source : '');
        if (!cachePag[ck]) {
          const res = await axios.get(`https://enloteria.com/resultados-${slug}`, { headers: HEADERS, timeout: 15000 });
          cachePag[ck] = parsearPaginaJuegoEnloteria(res.data, re);
          await pausa(1300);
        }
        let n = 0;
        for (const t of cachePag[ck]) {
          if (!especialesPorDia[t.fecha]) continue; 
          const validos = t.numeros.filter(x => x >= juego.rango[0] && x <= juego.rango[1]);
          const esDig = juego.tipo === 'pega3' || juego.tipo === 'pega4';
          const usar = esDig ? validos : [...new Set(validos)];
          if (usar.length >= juego.cant) { especialesPorDia[t.fecha][clave] = usar.slice(0, juego.cant); n++; }
        }
        logBF(`Especial ${clave} (${slug}): ${n} dias en rango (portada)`);
      } catch (e) {
        logBF(`Especial ${clave} (${slug}): AVISO ${e.message}`);
        slugsMalos.add(slug); 
      }
    }

    for (const [clave, slug] of Object.entries(ESPECIALES_ENLOTERIA)) {
      const juego = plantilla[clave];
      if (!juego || slugsMalos.has(slug)) continue;
      const re = ESPECIALES_ENLOTERIA_RE[clave];
      let nProf = 0, n404 = 0;
      for (const f of fechas) {
        if (especialesPorDia[f][clave]) continue; 
        try {
          const res = await axios.get(`https://enloteria.com/resultados-${slug}-${f}`, { headers: HEADERS, timeout: 15000 });
          const tarjetas = parsearPaginaJuegoEnloteria(res.data, re);
          const t = tarjetas.find(x => x.fecha === f);
          if (t) {
            const validos = t.numeros.filter(x => x >= juego.rango[0] && x <= juego.rango[1]);
            const esDig = juego.tipo === 'pega3' || juego.tipo === 'pega4';
            const usar = esDig ? validos : [...new Set(validos)];
            if (usar.length >= juego.cant) { especialesPorDia[f][clave] = usar.slice(0, juego.cant); nProf++; }
          }
        } catch (e) { n404++; }
        await pausa(1100);
      }
      if (nProf > 0 || n404 > 0) logBF(`Especial ${clave} EXCAVACION: +${nProf} fechas antiguas rescatadas`);
    }

    const resumen = [];
    for (const f of fechas) {
      const base = existentes[f] || { fecha: f, sorteos: crearSorteos(), cuartetas: crearCuartetas(), especiales: crearJuegosEspeciales() };
      base.sorteos = base.sorteos || crearSorteos();
      base.cuartetas = base.cuartetas || crearCuartetas();
      base.especiales = base.especiales || crearJuegosEspeciales();
      let nuevos = 0;
      for (const [clave, nums] of Object.entries(quinielasPorDia[f] || {})) {
        const s = base.sorteos[clave];
        if (s && (!s.numeros || s.numeros.length < 3)) { s.numeros = nums; s.estado = 'disponible'; nuevos++; }
      }
      for (const [clave, nums] of Object.entries(especialesPorDia[f] || {})) {
        const j = base.especiales[clave];
        if (j && (!j.numeros || j.numeros.length === 0)) { j.numeros = nums; j.estado = 'disponible'; nuevos++; }
      }
      let guardado = false;
      if (guardar && nuevos > 0) guardado = await guardarEnSupabase(base);
      resumen.push({ fecha: f, existia: !!existentes[f], nuevos, guardado });
      logBF(`${f}: +${nuevos} sorteos nuevos recuperados ${guardar ? (guardado ? '-> GUARDADO OK' : '-> ERROR GUARDANDO') : '(Simulacion)'}`);
    }
    estadoBackfill.resumen = resumen;
    logBF('✅ Backfill terminado con éxito.');
  } catch (e) {
    logBF(`❌ ERROR GENERAL: ${e.message}`);
  } finally {
    estadoBackfill.activo = false;
  }
}

// ── 🎯 CAZADOR DE ACIERTOS ──────────────────────────────────────────────────
function radarPuntoWF(clave) {
  const dias = [...estado.historico].filter(h => h.sorteos && h.sorteos[clave] && h.sorteos[clave].numeros && h.sorteos[clave].numeros.length >= 3).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).map(h => h.sorteos[clave].numeros.slice(0, 3).map(Number));
  let ev = 0, ac = 0;
  for (let i = 2; i < dias.length; i++) {
    const score = {};
    for (let j = 0; j < i; j++) {
      const rec = j + 1; const n = dias[j];
      if (n[0] !== undefined) score[n[0]] = (score[n[0]] || 0) + 60 * rec;
      if (n[1] !== undefined) score[n[1]] = (score[n[1]] || 0) + 8 * rec;
      if (n[2] !== undefined) score[n[2]] = (score[n[2]] || 0) + 4 * rec;
    }
    const ent = Object.entries(score).sort((a, b) => b[1] - a[1]);
    if (!ent.length) continue;
    ev++;
    if (dias[i].includes(+ent[0][0])) ac++;
  }
  return { ac, ev, tasa: ev ? (100 * ac / ev) : 0 };
}

async function cazarAciertos({ enviar = true } = {}) {
  const dias = [...estado.historico].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const f2 = n => String(n).padStart(2, '0');
  const avisos = [];

  for (const [clave, s] of Object.entries(estado.sorteos)) {
    if (!s.numeros || s.numeros.length < 3) continue;
    const hoy = new Set(s.numeros.map(Number));
    const salio = s.numeros.map(f2).join('-');
    const serie = [];
    for (const d of dias) {
      const ds = d.sorteos && d.sorteos[clave];
      if (ds && ds.numeros && ds.numeros.length >= 3) serie.push(ds.numeros.map(Number));
    }
    
    if (serie.length >= 2 && !yaChequeado[`${clave}|radar`]) {
      const pesos = {};
      serie.forEach((nums, j) => {
        const w = 0.5 + 0.5 * (j + 1) / serie.length;
        nums.forEach((n, pos) => pesos[n] = (pesos[n] || 0) + w * (pos === 0 ? 60 : pos === 1 ? 8 : 4));
      });
      const top = Object.entries(pesos).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => +x[0]);
      if ([...new Set(top)].filter(n => hoy.has(n)).length >= 2) {
        avisos.push(`🎯 <b>Radar top-2</b> ¡PALÉ! — ${s.nombre}\n     jugó <b>${top.map(f2).join('-')}</b> · salió ${salio}`);
      }
      yaChequeado[`${clave}|radar`] = true;
    }

    if (!yaChequeado[`${clave}|punto`]) {
      if (serie.length >= 2) {
        const pesosP = {};
        serie.forEach((nums, j) => {
          const w = Math.max(1, serie.length - j);
          if (nums[0] !== undefined) pesosP[nums[0]] = (pesosP[nums[0]] || 0) + 60 * w;
          if (nums[1] !== undefined) pesosP[nums[1]] = (pesosP[nums[1]] || 0) + 8 * w;
          if (nums[2] !== undefined) pesosP[nums[2]] = (pesosP[nums[2]] || 0) + 4 * w;
        });
        const top1 = Object.entries(pesosP).sort((a, b) => b[1] - a[1])[0];
        if (top1 && hoy.has(+top1[0])) {
          const wf = radarPuntoWF(clave);
          avisos.push(`🎯 <b>Radar punto</b> — ${s.nombre}\n     jugó <b>${f2(+top1[0])}</b> · salió ${salio} · lleva ${wf.ac}/${wf.ev} (${wf.tasa.toFixed(1)}% vs azar 3%)`);
        }
      }
      yaChequeado[`${clave}|punto`] = true;
    }
  }

  if (enviar && avisos.length && TG_ACTIVO) await enviarTelegram(
    `🎯 <b>ACIERTOS DE HOY</b> — ${fechaRD()}\n\n` + avisos.join('\n\n')
  );
  return avisos;
}

// ── Sincronización principal ───────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

let sincronizando = false;
async function sincronizar() {
  if (sincronizando) return;
  sincronizando = true;
  try {
    const hoy = fechaRD();
    if (hoy !== estado.fecha) {
      const snapshot = { fecha: estado.fecha, sorteos: JSON.parse(JSON.stringify(estado.sorteos)), cuartetas: JSON.parse(JSON.stringify(estado.cuartetas)), especiales: JSON.parse(JSON.stringify(estado.especiales)) };
      estado.historico.unshift(snapshot);
      if (estado.historico.length > 90) estado.historico.pop();
      estado.sorteos = crearSorteos(); estado.cuartetas = crearCuartetas(); estado.especiales = crearJuegosEspeciales(); estado.fecha = hoy;
      Object.keys(yaNotificado).forEach(k => delete yaNotificado[k]); Object.keys(yaChequeado).forEach(k => delete yaChequeado[k]);
      guardarEnDisco(); await guardarEnSupabase(snapshot);
    }

    await scrapeConectateAPI();
    if (Object.values(estado.sorteos).filter(s => s.numeros.length < 3).length > 0) await scrapeLotDominicanas();
    if (Object.values(estado.sorteos).filter(s => s.numeros.length < 3).length > 0) await scrapeEnloteria();
    if (Object.values(estado.sorteos).filter(s => s.numeros.length < 3).length > 0) await scrapeYelu();

    if (Object.values(estado.cuartetas).filter(c => c.numeros.length < 4).length > 0) await scrapeCuartetaLotDominicanas();
    
    estado.hora_actualizacion = horaRD();
    guardarEnDisco();
    await guardarEnSupabase({ fecha: estado.fecha, sorteos: estado.sorteos, cuartetas: estado.cuartetas, especiales: estado.especiales });
    await notificarNuevosSorteos();
    await cazarAciertos({ enviar: true });
  } catch(e) { console.error('⚠️ Error en sincronizar:', e.message); } finally { sincronizando = false; }
}

setInterval(sincronizar, 15 * 60 * 1000);

// ── ENDPOINTS Frontend y Diagnóstico ───────────────────────────────────────
app.get('/api/hoy', async (req, res) => { await sincronizar(); res.json({ fecha: estado.fecha, hora_actualizacion: estado.hora_actualizacion, sorteos: estado.sorteos, cuartetas: estado.cuartetas, especiales: estado.especiales }); });
app.get('/api/historico', (req, res) => res.json({ historico: estado.historico, total: estado.historico.length }));
app.get('/api/debug', async (req, res) => {
  try {
    const r1 = await axios.get('https://www.conectate.com.do/loterias/api/widget', { headers: { ...HEADERS, 'Accept': 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' }, timeout: 8000 });
    let items = Array.isArray(r1.data) ? r1.data : (r1.data?.data || []);
    res.json({ status: r1.status, total_items: items.length, todos_los_items: items.map(item => ({ game_title: item.game_title, today: item.today, date: item.date })) });
  } catch (e) { res.status(200).json({ error: e.message, status: e.response?.status }); }
});
app.get('/api/debug-db', async (req, res) => {
  if (!SUPABASE_ACTIVO) return res.json({ activo: false, mensaje: 'SUPABASE variables no configuradas.' });
  const datos = await cargarDeSupabase();
  if (datos === null) return res.json({ activo: true, conectado: false, mensaje: 'Conexión a Supabase falló.' });
  res.json({ activo: true, conectado: true, dias_guardados: datos.length, ultimas_fechas: datos.slice(0, 5).map(d => d.fecha) });
});
app.get('/', (req, res) => res.json({ version: 'v8.4-BACKFILL-RESTORED', status: 'ok', fecha_rd: fechaRD() }));

// ── ENDPOINTS BACKFILL RESTAURADOS ─────────────────────────────────────────
app.get('/api/backfill-enloteria', (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) return res.status(400).json({ error: 'Faltan desde/hasta. Ejemplo: ?desde=2026-08-05&hasta=2026-08-17' });
  if (estadoBackfill.activo) return res.status(409).json({ error: 'Ya hay un backfill corriendo' });
  const guardar = req.query.guardar === '1';
  ejecutarBackfill(desde, hasta, guardar);
  res.json({ iniciado: true, desde, hasta, modo: guardar ? 'GUARDAR EN SUPABASE' : 'SIMULACION' });
});
app.get('/api/backfill-estado', (req, res) => res.json(estadoBackfill));

// ── WEBHOOK Telegram ───────────────────────────────────────────────────────
app.post('/api/telegram-webhook', async (req, res) => {
  res.sendStatus(200); 
  try {
    const msg = req.body && req.body.message;
    if (!msg || !msg.text) return;
    const chatId = msg.chat.id;
    const [cmd] = msg.text.trim().split(/\s+/);
    const comando = cmd.toLowerCase().replace(/@\w+$/, '');

    if (comando === '/start') {
      await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { chat_id: chatId, text: `🇩🇴 <b>REYDIS RADAR PRO</b> 📡\n\nTu chat ID: <code>${chatId}</code>`, parse_mode: 'HTML' });
    } else if (comando === '/hoy') {
      await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { chat_id: chatId, text: `🇩🇴 <b>RESULTADOS</b> — ${fechaRD()}\n\nConsulta la web para ver en tiempo real.`, parse_mode: 'HTML' });
    }
  } catch (e) {}
});

// ── Protección anti-crash ──────────────────────────────────────────────────
process.on('uncaughtException', (err) => console.error('⚠️ [uncaughtException]', err.message));
process.on('unhandledRejection', (reason) => console.error('⚠️ [unhandledRejection]', reason));

app.listen(PORT, async () => {
  console.log(`\n🚀 Reydis Engine v8.4-BACKFILL-RESTORED en puerto ${PORT}`);
  await inicializarPersistenciaRemota();
  if (TG_ACTIVO) await enviarTelegram(`🚀 <b>REYDIS RADAR PRO</b> — Servidor Reiniciado y Conectado`);
  await sincronizar();

  const SELF_URL = process.env.RENDER_EXTERNAL_URL || `https://reydis-bot-service.onrender.com`;
  setInterval(async () => { try { await axios.get(`${SELF_URL}/`, { timeout: 5000 }); } catch (e) {} }, 14 * 60 * 1000);
});
