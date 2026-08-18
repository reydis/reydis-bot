const express = require('express');
const axios   = require('axios');
const cheerio = require('cheerio');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3000;

// ── TELEGRAM BOT — Alertas en tiempo real ────────────────────────────────────
const TG_TOKEN   = process.env.TELEGRAM_TOKEN || '';
const TG_CHAT_IDS = (() => {
  const raw = process.env.TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
})();
const TG_ACTIVO = !!(TG_TOKEN && TG_CHAT_IDS.length);

const yaNotificado = {};
let primeraSyncTrasArranque = true;
let primerSyncTrasArranque = true; 

async function enviarTelegram(mensaje) {
  if (!TG_ACTIVO) return;
  const resultados = await Promise.allSettled(TG_CHAT_IDS.map(chatId =>
    axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: mensaje,
      parse_mode: 'HTML'
    }, { timeout: 8000 })
  ));
  resultados.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`  ⚠️ Telegram REJECTED (chat ${TG_CHAT_IDS[i]}):`, JSON.stringify(r.reason?.response?.data || r.reason?.message));
    }
  });
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

  if (primerSyncTrasArranque) {
    for (const n of nuevos) yaNotificado[n.clave] = true;
    if (nuevos.length) console.log(`🔇 Arranque: ${nuevos.length} resultado(s) marcados como vistos`);
    return;
  }
  if (nuevos.length === 0) return;
  if (esArranque) {
    for (const n of nuevos) yaNotificado[n.clave] = true;
    console.log(`🔕 Arranque: ${nuevos.length} resultado(s) ya conocidos`);
    return;
  }

  console.log(`📱 Notificando ${nuevos.length} resultado(s) en UN solo mensaje...`);
  for (const n of nuevos) yaNotificado[n.clave] = true;

  const lineas = nuevos.map(n => {
    const nums = n.numeros.map(x => String(x).padStart(2, '0')).join('-');
    const etiqueta = n.tipo === 'cuarteta' ? '🎲' : n.tipo === 'especial' ? '🎰' : '✅';
    const extra = n.empresa ? ` [${n.empresa}]` : '';
    return `${etiqueta} <b>${n.nombre}</b>${extra} — <b>${nums}</b> <i>(${n.hora})</i>`;
  });
  const msg = `🇩🇴 <b>REYDIS RADAR PRO</b> — ${fechaRD()}\n📥 <b>${nuevos.length} resultado(s) nuevo(s):</b>\n\n` + lineas.join('\n');
  await enviarTelegram(msg);
}

// ── PREDICCIONES por Telegram ─────────────────────────────────────────────────
const MIN_DIAS_PREDICCION = 2;
const p2s = n => String(n).padStart(2, '0');
const confianzaIcon = d => d >= 10 ? '🟢' : d >= 5 ? '🟡' : '🔴';

function calcularPrediccionQuiniela(clave) {
  const datos = estado.historico.filter(h => h.sorteos?.[clave]?.numeros?.length >= 3).map(h => h.sorteos[clave].numeros);
  if (datos.length < MIN_DIAS_PREDICCION) return null;

  const scorePond = {}, freqTotal = {};
  datos.forEach((nums, idx) => {
    const recencia = Math.max(1, datos.length - idx);
    if (nums[0] !== undefined) { scorePond[nums[0]] = (scorePond[nums[0]] || 0) + 60 * recencia; freqTotal[nums[0]] = (freqTotal[nums[0]] || 0) + 1; }
    if (nums[1] !== undefined) { scorePond[nums[1]] = (scorePond[nums[1]] || 0) + 8 * recencia; freqTotal[nums[1]] = (freqTotal[nums[1]] || 0) + 1; }
    if (nums[2] !== undefined) { scorePond[nums[2]] = (scorePond[nums[2]] || 0) + 4 * recencia; freqTotal[nums[2]] = (freqTotal[nums[2]] || 0) + 1; }
  });

  const top3 = Object.entries(scorePond).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => +n);
  const topPale = Object.entries(freqTotal).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => +n);
  const recientes = new Set(datos.slice(0, Math.min(4, datos.length)).flat());
  const candidatosFrios = Object.entries(freqTotal).filter(([n]) => !recientes.has(+n)).sort((a, b) => b[1] - a[1]);
  
  return { top3, top1: top3[0], topPale, topFrio: candidatosFrios.length > 0 ? +candidatosFrios[0][0] : null, dias: datos.length, icon: confianzaIcon(datos.length) };
}

function calcularPrediccionCuarteta(clave) {
  const datos = estado.historico.filter(h => h.cuartetas?.[clave]?.numeros?.length >= 4).map(h => h.cuartetas[clave].numeros);
  if (datos.length < MIN_DIAS_PREDICCION) return null;
  const freq = {};
  datos.forEach((nums, idx) => {
    const w = Math.max(1, datos.length - idx);
    for (const n of nums) freq[n] = (freq[n] || 0) + w;
  });
  return { top4: Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => +n), dias: datos.length, icon: confianzaIcon(datos.length) };
}

function calcularPrediccionDigitos(clave, cantDigitos) {
  const datos = estado.historico.filter(h => h.especiales?.[clave]?.numeros?.length >= cantDigitos).map(h => h.especiales[clave].numeros);
  if (datos.length < MIN_DIAS_PREDICCION) return null;
  const digitos = [];
  for (let pos = 0; pos < cantDigitos; pos++) {
    const freq = {};
    datos.forEach((nums, idx) => {
      const w = Math.max(1, datos.length - idx);
      const d = nums[pos];
      if (d !== undefined) freq[d] = (freq[d] || 0) + w;
    });
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    digitos.push(top ? +top[0] : 0);
  }
  return { digitos, dias: datos.length };
}

function calcularPrediccionFrecuenciaEspecial(clave, cantNumeros) {
  const datos = estado.historico.filter(h => h.especiales?.[clave]?.numeros?.length > 0).map(h => h.especiales[clave].numeros);
  if (datos.length < MIN_DIAS_PREDICCION) return null;
  const freq = {};
  datos.forEach((nums, idx) => {
    const w = Math.max(1, datos.length - idx);
    for (const n of nums) freq[n] = (freq[n] || 0) + w;
  });
  return { top: Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, cantNumeros).map(([n]) => +n), dias: datos.length };
}

const TIPO_PRED_CANT = { kino: 10, loto: 6, lotomas: 7 };

async function enviarPrediccionesTelegram() {
  if (!TG_ACTIVO) return { enviado: false, motivo: 'Telegram no configurado' };
  const fmtN = arr => arr.map(n => p2s(n)).join(' - ');

  let msg1 = `🔮 <b>PREDICCIONES QUINIELAS — ${fechaRD()}</b>\n<i>⚠️ Basado en estadística dura. 🟢=alta confianza 🟡=media 🔴=pocos datos</i>\n\n`;
  for (const [k, s] of Object.entries(estado.sorteos)) {
    const p = calcularPrediccionQuiniela(k);
    if (p) {
      msg1 += `${p.icon} <b>${s.nombre}</b> (${s.hora}) <i>(${p.dias}d)</i>\n`;
      msg1 += `🎯 <code>${p2s(p.top1)}</code>  ↩️ <code>${fmtN(p.topPale)}</code>  🎲 <code>${fmtN(p.top3)}</code>`;
      if (p.topFrio !== null) msg1 += `  ❄️ <code>${p2s(p.topFrio)}</code>`;
      msg1 += `\n\n`;
    }
  }
  await enviarTelegram(msg1);

  let msg2 = `🔮 <b>PREDICCIONES LA CUARTETA — ${fechaRD()}</b>\n<i>⚠️ Predicción Estadística Walk-Forward.</i>\n\n`;
  for (const [k, c] of Object.entries(estado.cuartetas)) {
    const p = calcularPrediccionCuarteta(k);
    if (p) msg2 += `${p.icon} <b>${c.nombre}</b> (${c.hora})\n🎲 <code>${fmtN(p.top4)}</code>\n\n`;
  }
  await enviarTelegram(msg2);

  let msg3 = `🔮 <b>PREDICCIONES JUEGOS ESPECIALES — ${fechaRD()}</b>\n\n`;
  for (const [k, e] of Object.entries(estado.especiales)) {
    let pred = null;
    if (e.tipo === 'pega3' || e.tipo === 'pega4') {
      const p = calcularPrediccionDigitos(k, e.cant);
      if (p) pred = { texto: p.digitos.join(' - '), dias: p.dias };
    } else {
      const cant = TIPO_PRED_CANT[e.tipo] || e.cant;
      const p = calcularPrediccionFrecuenciaEspecial(k, cant);
      if (p) pred = { texto: fmtN(p.top), dias: p.dias };
    }
    if (pred) msg3 += `${confianzaIcon(pred.dias)} <b>${e.nombre}</b> [${e.empresa}]\n🔢 <code>${pred.texto}</code>\n\n`;
  }
  await enviarTelegram(msg3);

  return { enviado: true };
}

let ultimaPrediccionFecha = null;
async function chequearEnvioAutomaticoPredicciones() {
  if (!TG_ACTIVO) return;
  const [hh] = horaRD().split(':').map(Number);
  if (hh === 7 && ultimaPrediccionFecha !== estado.fecha) {
    ultimaPrediccionFecha = estado.fecha;
    await enviarPrediccionesTelegram();
  }
}

// ── Persistencia en disco & Supabase ───────────────────────────────────────
const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'estado.json');

function guardarEnDisco() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({ fecha: estado.fecha, historico: estado.historico }));
  } catch (e) { console.error('⚠️ No se pudo guardar en disco:', e.message); }
}

function cargarDeDisco() {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) { return null; }
}

app.use(cors({ origin: '*' }));
app.options('*', cors());
app.use(express.json());

function fechaRD() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function horaRD() { return new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); }

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
  } else if (remoto !== null && estado.historico.length > 0) {
    for (const dia of estado.historico) await guardarEnSupabase(dia);
  }
}

const persistido = cargarDeDisco();
let estado = {
  fecha: fechaRD(), hora_actualizacion: horaRD(),
  sorteos: crearSorteos(), cuartetas: crearCuartetas(), especiales: crearJuegosEspeciales(),
  historico: persistido?.historico || []
};

function crearCuartetas() {
  return {
    cuarteta_m:  { nombre:'La Cuarteta Mañana',    hora:'10:00 AM', numeros:[], estado:'pendiente' },
    cuarteta_md: { nombre:'La Cuarteta Medio Día', hora:'1:00 PM',  numeros:[], estado:'pendiente' },
    cuarteta_t:  { nombre:'La Cuarteta Tarde',     hora:'6:00 PM',  numeros:[], estado:'pendiente' },
    cuarteta_n:  { nombre:'La Cuarteta Noche',     hora:'9:00 PM',  numeros:[], estado:'pendiente' }
  };
}

function crearJuegosEspeciales() {
  return {
    pega3mas:  { nombre:'Pega 3 Más',    empresa:'LEIDSA',  hora:'9:00 PM',  tipo:'pega3',   numeros:[], estado:'pendiente', rango:[0,50],  cant:3  },
    superkino: { nombre:'Super Kino TV', empresa:'LEIDSA',  hora:'9:00 PM',  tipo:'kino',    numeros:[], estado:'pendiente', rango:[1,80],  cant:20 },
    loto:      { nombre:'Loto',          empresa:'LEIDSA',  hora:'9:00 PM',  tipo:'loto',    numeros:[], estado:'pendiente', rango:[1,40],  cant:6  },
    lotomas:   { nombre:'Loto Más',      empresa:'LEIDSA',  hora:'9:00 PM',  tipo:'lotomas', numeros:[], estado:'pendiente', rango:[1,40],  cant:7  },
    quemaito:  { nombre:'El Quemaito Mayor', empresa:'LOTEDOM', hora:'1:55 PM', tipo:'quiniela', numeros:[], estado:'pendiente', rango:[0,99], cant:1 },
    megachance:{ nombre:'Mega Chance',   empresa:'LOTEKA',  hora:'7:55 PM',  tipo:'chance',  numeros:[], estado:'pendiente', rango:[0,99],  cant:5  },
    pega4king: { nombre:'Pega 4 Real',   empresa:'REAL',    hora:'12:55 PM', tipo:'pega4',   numeros:[], estado:'pendiente', rango:[0,9],   cant:4  },
  };
}

function crearSorteos() {
  return {
    anguila_m:   { nombre:'Anguila Mañana',   hora:'10:00 AM', numeros:[], estado:'pendiente' },
    laprimera:   { nombre:'La Primera Día',   hora:'12:00 PM', numeros:[], estado:'pendiente' },
    lotedom:     { nombre:'LoteDom',          hora:'12:00 PM', numeros:[], estado:'pendiente' },
    suerte:      { nombre:'La Suerte 12:30',  hora:'12:30 PM', numeros:[], estado:'pendiente' },
    king_t:      { nombre:'King Tarde',       hora:'12:30 PM', numeros:[], estado:'pendiente' },
    real_t:      { nombre:'Lotería Real',     hora:'1:00 PM',  numeros:[], estado:'pendiente' },
    anguila_t:   { nombre:'Anguila 1:00 PM',  hora:'1:00 PM',  numeros:[], estado:'pendiente' },
    gana_mas:    { nombre:'Gana Más',         hora:'2:30 PM',  numeros:[], estado:'pendiente' },
    new_york_t:  { nombre:'New York Tarde',   hora:'2:30 PM',  numeros:[], estado:'pendiente' },
    florida_d:   { nombre:'Florida Día',      hora:'2:00 PM',  numeros:[], estado:'pendiente' },
    suerte_t2:   { nombre:'La Suerte Tarde',  hora:'6:00 PM',  numeros:[], estado:'pendiente' },
    anguila_n:   { nombre:'Anguila 6:00 PM',  hora:'6:00 PM',  numeros:[], estado:'pendiente' },
    king_n:      { nombre:'King Noche',       hora:'7:00 PM',  numeros:[], estado:'pendiente' },
    loteka:      { nombre:'Loteka',           hora:'6:55 PM',  numeros:[], estado:'pendiente' },
    laprimera_n: { nombre:'La Primera Noche', hora:'7:00 PM',  numeros:[], estado:'pendiente' },
    leidsa:      { nombre:'Leidsa',           hora:'8:55 PM',  numeros:[], estado:'pendiente' },
    nacional:    { nombre:'Lotería Nacional', hora:'9:00 PM',  numeros:[], estado:'pendiente' },
    anguila_nn:  { nombre:'Anguila 9:00 PM',  hora:'9:00 PM',  numeros:[], estado:'pendiente' },
    new_york_n:  { nombre:'New York Noche',   hora:'10:30 PM', numeros:[], estado:'pendiente' },
    florida_n:   { nombre:'Florida Noche',    hora:'10:30 PM', numeros:[], estado:'pendiente' }
  };
}

const MAPA = {
  'anguila mañana': 'anguila_m', 'anguila medio día': 'anguila_t', 'anguila tarde': 'anguila_n', 'anguila noche': 'anguila_nn',
  'la primera día': 'laprimera', 'primera noche': 'laprimera_n', 'quiniela lotedom': 'lotedom', 'lotedom': 'lotedom',
  'la suerte 12:30': 'suerte', 'la suerte 18:00': 'suerte_t2', 'quiniela real': 'real_t', 'lotería real': 'real_t',
  'gana más': 'gana_mas', 'new york tarde': 'new_york_t', 'new york noche': 'new_york_n', 'quiniela leidsa': 'leidsa',
  'lotería nacional': 'nacional', 'quiniela loteka': 'loteka', 'king lottery 12:30': 'king_t', 'king lottery 7:30': 'king_n',
  'florida día': 'florida_d', 'florida noche': 'florida_n', 'la suerte tarde': 'suerte_t2', 'king tarde': 'king_t', 'king noche': 'king_n'
};

const MAPA_ESPECIALES = { 'pega 3 más':'pega3mas', 'super kino tv':'superkino', 'loto más':'lotomas', 'loto':'loto', 'el quemaito':'quemaito', 'mega chance':'megachance', 'pega 4':'pega4king' };
const MAPA_CUARTETA = { 'la cuarteta mañana':'cuarteta_m', 'la cuarteta medio día':'cuarteta_md', 'la cuarteta tarde':'cuarteta_t', 'la cuarteta noche':'cuarteta_n' };

function buscarClave(texto) { const t = texto.toLowerCase().trim(); for (const [k, v] of Object.entries(MAPA)) if (t.includes(k)) return v; return null; }
function buscarClaveEspecial(texto) { const t = texto.toLowerCase().trim(); for (const [k, v] of Object.entries(MAPA_ESPECIALES)) if (t.includes(k)) return v; return null; }
function buscarClaveCuarteta(texto) { const t = texto.toLowerCase().trim(); for (const [k, v] of Object.entries(MAPA_CUARTETA)) if (t.includes(k)) return v; return null; }

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
  for (const [path, clave] of pendientesMap.slice(0, 5)) {
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

// ── 🎯 CAZADOR DE ACIERTOS (Solo Métodos Estadísticos Reales) ───────────────
const yaChequeado = {}; 

function radarPuntoWF(clave) {
  const dias = [...estado.historico]
    .filter(h => h.sorteos && h.sorteos[clave] && h.sorteos[clave].numeros && h.sorteos[clave].numeros.length >= 3)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    .map(h => h.sorteos[clave].numeros.slice(0, 3).map(Number));
  let ev = 0, ac = 0;
  for (let i = 2; i < dias.length; i++) {
    const score = {};
    for (let j = 0; j < i; j++) {
      const rec = j + 1;
      const n = dias[j];
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

async function cazarAciertos({ enviar = true, marcar = true } = {}) {
  const dias = [...estado.historico].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const lab = backtestLaboratorio(null).resumen;
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
    
    // ── Radar top-2 ponderado (¡palé completo!) ──
    if (serie.length >= 2 && !yaChequeado[`${clave}|radar`]) {
      const pesos = {};
      serie.forEach((nums, j) => {
        const w = 0.5 + 0.5 * (j + 1) / serie.length;
        nums.forEach((n, pos) => pesos[n] = (pesos[n] || 0) + w * (pos === 0 ? 60 : pos === 1 ? 8 : 4));
      });
      const top = Object.entries(pesos).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => +x[0]);
      if ([...new Set(top)].filter(n => hoy.has(n)).length >= 2) {
        const m = lab.radarTop2;
        avisos.push(`🎯 <b>Radar top-2</b> ¡PALÉ! — ${s.nombre}\n     jugó <b>${top.map(f2).join('-')}</b> · salió ${salio} · lleva ${m.pales_completos} palés (${m.tasa_pale} vs azar ${m.azar_pale})`);
      }
      if (marcar) yaChequeado[`${clave}|radar`] = true;
    }

    // ── Radar punto (el número #1 del día) ──
    if (!yaChequeado[`${clave}|punto`]) {
      const pred = calcularPrediccionQuiniela(clave);
      if (pred && pred.top1 !== undefined && hoy.has(pred.top1)) {
        const wf = radarPuntoWF(clave);
        avisos.push(`🎯 <b>Radar punto</b> — ${s.nombre}\n     jugó <b>${f2(pred.top1)}</b> · salió ${salio} · lleva ${wf.ac}/${wf.ev} (${wf.tasa.toFixed(1)}% vs azar 3%)`);
      }
      if (marcar) yaChequeado[`${clave}|punto`] = true;
    }
  }

  if (enviar && avisos.length && TG_ACTIVO) await enviarTelegram(
    `🎯 <b>ACIERTOS DE HOY</b> — ${fechaRD()}\n<i>(Estadística Dura: Ponderación Posicional)</i>\n\n` + avisos.join('\n\n')
  );
  return avisos;
}

// ── Sincronización principal ───────────────────────────────────────────────────
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
    if (Object.values(estado.cuartetas).filter(c => c.numeros.length < 4).length > 0) await scrapeCuartetaLotDominicanas();
    if (Object.values(estado.especiales).filter(e => e.numeros.length === 0).length > 0) await scrapeLeidsa();
    await scrapePega4Yelu();

    estado.hora_actualizacion = horaRD();
    guardarEnDisco();
    await guardarEnSupabase({ fecha: estado.fecha, sorteos: estado.sorteos, cuartetas: estado.cuartetas, especiales: estado.especiales });
    await notificarNuevosSorteos();
    await cazarAciertos({ enviar: !primerSyncTrasArranque });
    primerSyncTrasArranque = false;
    await chequearEnvioAutomaticoPredicciones();
  } catch(e) { console.error('⚠️ Error en sincronizar:', e.message); } finally { sincronizando = false; }
}

setInterval(sincronizar, 15 * 60 * 1000);

// ── ENDPOINTS Frontend ─────────────────────────────────────────────────────
app.get('/api/hoy', async (req, res) => { await sincronizar(); res.json({ fecha: estado.fecha, hora_actualizacion: estado.hora_actualizacion, sorteos: estado.sorteos, cuartetas: estado.cuartetas, especiales: estado.especiales }); });
app.get('/api/historico', (req, res) => res.json({ historico: estado.historico, total: estado.historico.length }));
app.get('/', (req, res) => res.json({ version: 'v8.0-CLEAN', status: 'ok', fecha_rd: fechaRD() }));

// ── 🧪 LABORATORIO DE MÉTODOS (Limpiado y Optimizado) ─────────────────────
function backtestLaboratorio(filtroLoteria) {
  const dias = [...estado.historico].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const met = {
    radarTop2:  { nombre: 'Radar top-2 ponderado',    tipo: 'pale',  ev: 0, pale: 0, medio: 0 },
    jala50:     { nombre: 'Jaladera atraccion +50',   tipo: 'pale',  ev: 0, pale: 0, medio: 0 },
  };
  const porLoteriaM1 = {};
  const claves = new Set();
  for (const d of dias) for (const k of Object.keys(d.sorteos || {})) claves.add(k);

  for (const clave of claves) {
    if (filtroLoteria && clave !== filtroLoteria) continue;
    const serie = [];
    for (const d of dias) {
      const s = d.sorteos && d.sorteos[clave];
      if (s && s.numeros && s.numeros.length >= 3) serie.push({ f: d.fecha, nums: s.numeros.map(Number) });
    }
    if (serie.length < 3) continue;

    for (let i = 1; i < serie.length; i++) {
      const ayer = serie[i - 1].nums;
      const hoy = new Set(serie[i].nums);

      // Top 1 de ayer para estadisticas generales (para saber dónde repite más el 1ro por pura curiosidad estadística)
      if (hoy.has(ayer[0])) {
        porLoteriaM1[clave] = (porLoteriaM1[clave] || 0) + 1;
      }

      met.jala50.ev++;
      const jugJala = [...new Set([ayer[0], (ayer[0] + 50) % 100])];
      const hitsJala = jugJala.filter(n => hoy.has(n)).length;
      if (hitsJala >= 2) met.jala50.pale++;
      if (hitsJala >= 1) met.jala50.medio++;

      met.radarTop2.ev++;
      const pesos = {};
      for (let j = 0; j < i; j++) {
        const w = 0.5 + 0.5 * (j + 1) / i; // recencia
        serie[j].nums.forEach((n, pos) => {
          pesos[n] = (pesos[n] || 0) + w * (pos === 0 ? 60 : pos === 1 ? 8 : 4);
        });
      }
      const top = Object.entries(pesos).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => parseInt(x[0], 10));
      const hits = [...new Set(top)].filter(n => hoy.has(n)).length;
      if (hits >= 2) met.radarTop2.pale++;
      if (hits >= 1) met.radarTop2.medio++;
    }
  }

  const pct = (a, b) => (b ? +((100 * a) / b).toFixed(2) : 0);
  const resumen = {};
  for (const [k, m] of Object.entries(met)) {
    resumen[k] = { metodo: m.nombre, evaluaciones: m.ev,
      pales_completos: m.pale, tasa_pale: pct(m.pale, m.ev) + '%', azar_pale: '0.06%',
      medios_pale: m.medio, tasa_medio: pct(m.medio, m.ev) + '%', azar_medio: '5.94%' };
  }
  const topM1 = Object.entries(porLoteriaM1).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([k, c]) => ({ loteria: (estado.sorteos[k] && estado.sorteos[k].nombre) || k, repeticiones: c }));

  return {
    dias_historial: dias.length,
    nota: 'Walk-forward honesto: cada prediccion usa SOLO datos anteriores. Solo evalúa modelos estadísticos reales.',
    resumen,
    donde_mas_repite_el_1ro: topM1,
  };
}

function textoBacktesting(arg) {
  const dias = [...estado.historico].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  if (dias.length < 2) return 'Aún no hay suficiente historial para backtesting.';
  let objetivos = [];
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) { objetivos = [arg]; } 
  else { let n = Math.min(Math.max(parseInt(arg, 10) || 1, 1), 7); objetivos = dias.slice(-n).map(d => d.fecha); }

  const claves = new Set();
  for (const d of dias) for (const k of Object.keys(d.sorteos || {})) claves.add(k);
  const seriePor = {};
  for (const clave of claves) {
    const serie = [];
    for (const d of dias) {
      const s = d.sorteos && d.sorteos[clave];
      if (s && s.numeros && s.numeros.length >= 3) serie.push({ f: d.fecha, nums: s.numeros.map(Number), nombre: s.nombre || clave });
    }
    seriePor[clave] = serie;
  }

  const f2 = x => String(x).padStart(2, '0');
  const bloques = [];
  for (const fecha of objetivos) {
    const agg = { radar: { p: 0, m: 0, det: [], ev: 0 } };
    for (const [clave, serie] of Object.entries(seriePor)) {
      const i = serie.findIndex(x => x.f === fecha);
      if (i < 1) continue;
      const hoy = new Set(serie[i].nums);
      const nom = serie[i].nombre;

      agg.radar.ev++;
      const pesos = {};
      for (let j = 0; j < i; j++) {
        const w = 0.5 + 0.5 * (j + 1) / i;
        serie[j].nums.forEach((n, pos) => pesos[n] = (pesos[n] || 0) + w * (pos === 0 ? 60 : pos === 1 ? 8 : 4));
      }
      const top = Object.entries(pesos).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => parseInt(x[0], 10));
      const hits = [...new Set(top)].filter(n => hoy.has(n)).length;
      if (hits >= 2) { agg.radar.p++; agg.radar.det.push(`${nom} 🎯`); }
      else if (hits === 1) agg.radar.m++; 
    }

    if (!agg.radar.ev) { bloques.push(`📅 <b>${fecha}</b>: sin datos evaluables.`); continue; }
    const det = arr => (arr.length ? ` (${arr.slice(0, 3).join(' · ')})` : '');
    const cuerpo = (agg.radar.p > 0 || agg.radar.m > 0) 
      ? `🏆 Radar top-2: ${agg.radar.p} palés · ${agg.radar.m} medios${det(agg.radar.det)}` 
      : '— Sin aciertos del Radar este día —';
    bloques.push(`📅 <b>${fecha}</b> — ${agg.radar.ev} loterías evaluadas\n${cuerpo}`);
  }

  return `🔬 <b>BACKTESTING</b> — Radar Top-2 (Pesos Ponderados) vs Resultados Reales\n\n` + bloques.join('\n\n') + `\n\n⚖️ Uso: /backtesting · /backtesting 2026-07-10 · /backtesting 5`;
}

function textoLaboratorio(arg) {
  let filtro = null;
  if (arg) {
    const pedido = arg.toLowerCase();
    for (const [k, s] of Object.entries(estado.sorteos)) {
      if (k === pedido || (s.nombre || '').toLowerCase().includes(pedido)) { filtro = k; break; }
    }
  }
  const lab = backtestLaboratorio(filtro);
  const titulo = filtro ? estado.sorteos[filtro].nombre : 'TODAS las quinielas';
  const lineas = Object.values(lab.resumen).map(m => `• ${m.metodo}: ${m.pales_completos} palés (<b>${m.tasa_pale}</b> vs azar ${m.azar_pale}) · medios ${m.tasa_medio}`);
  return `🧪 <b>LABORATORIO — ${titulo}</b> (${lab.dias_historial} días)\n\n` + lineas.join('\n') + `\n\n⚖️ Walk-forward honesto: Solo evaluamos estadística dura.`;
}

function auditarJaladera50() {
  const dias = [...estado.historico].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const P_MEDIO = 1 - Math.pow(0.99, 3); 
  const porLot = [];
  let totEv = 0, totMedio = 0;

  const claves = new Set();
  for (const d of dias) for (const k of Object.keys(d.sorteos || {})) claves.add(k);

  for (const clave of claves) {
    const serie = [];
    for (const d of dias) {
      const s = d.sorteos && d.sorteos[clave];
      if (s && s.numeros && s.numeros.length >= 3) serie.push(s.numeros.slice(0, 3).map(Number)); 
    }
    if (serie.length < 5) continue;
    let ev = 0, medio = 0;
    for (let i = 1; i < serie.length; i++) {
      const comp = (serie[i - 1][0] + 50) % 100;
      ev++;
      if (serie[i].includes(comp)) medio++;
    }
    totEv += ev; totMedio += medio;
    const tasa = medio / ev;
    const z = (tasa - P_MEDIO) / Math.sqrt(P_MEDIO * (1 - P_MEDIO) / ev);
    porLot.push({ loteria: (estado.sorteos[clave] && estado.sorteos[clave].nombre) || clave, evaluaciones: ev, aciertos: medio, tasa: (tasa * 100).toFixed(1) + '%', z_score: z.toFixed(2) });
  }
  porLot.sort((a, b) => parseFloat(b.z_score) - parseFloat(a.z_score));
  const tasaGlobal = totMedio / totEv;
  const zGlobal = (tasaGlobal - P_MEDIO) / Math.sqrt(P_MEDIO * (1 - P_MEDIO) / totEv);

  return { global: { evaluaciones: totEv, aciertos: totMedio, tasa_real: (tasaGlobal * 100).toFixed(2) + '%', z_score: zGlobal.toFixed(2), veredicto: Math.abs(zGlobal) < 2 ? 'RUIDO (dentro del azar)' : '⚠️ SEÑAL POSITIVA' }, por_loteria: porLot, azar_esperado: (P_MEDIO * 100).toFixed(2) + '%' };
}

function analizarSaltosAnguila() {
  const P1 = 1 - Math.pow(0.99, 3);
  const z = (obs, ev, p) => ev ? ((obs / ev - p) / Math.sqrt(p * (1 - p) / ev)).toFixed(2) : '0';
  return { salto_espacial_mismo_dia: { descripcion: '1er premio de Anguila a otra lotería', tasa: '—', azar: (P1 * 100).toFixed(2) + '%', z_score: '0' }, salto_temporal: { 'D+1': { tasa: '—', z_score: '0' }, 'D+2': { tasa: '—', z_score: '0' }, 'D+3': { tasa: '—', z_score: '0' } } };
}

// ── WEBHOOK del bot ─────────────────────────────────────────────────────────
app.post('/api/telegram-webhook', async (req, res) => {
  res.sendStatus(200); 
  try {
    const msg = req.body && req.body.message;
    if (!msg || !msg.text) return;
    const chatId = msg.chat.id;
    const [cmd, ...args] = msg.text.trim().split(/\s+/);
    const comando = cmd.toLowerCase().replace(/@\w+$/, '');

    if (comando === '/start') {
      await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { chat_id: chatId, text: `🇩🇴 <b>REYDIS RADAR PRO</b> 📡\n\nComandos:\n/hoy\n/predicciones\n/backtesting\n/laboratorio\n/jaladera\n/anguila\n\nTu chat ID: <code>${chatId}</code>`, parse_mode: 'HTML' });
    } else if (comando === '/hoy') {
      await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { chat_id: chatId, text: `🇩🇴 <b>RESULTADOS</b> — ${fechaRD()}\n\nConsulta la web para ver en tiempo real.`, parse_mode: 'HTML' });
    } else if (comando === '/predicciones') {
      if (TG_CHAT_IDS.includes(String(chatId))) await enviarPrediccionesTelegram();
    } else if (comando === '/backtesting' || comando === '/backtest') {
      await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { chat_id: chatId, text: textoBacktesting(args[0]), parse_mode: 'HTML' });
    } else if (comando === '/laboratorio') {
      await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { chat_id: chatId, text: textoLaboratorio(args[0]), parse_mode: 'HTML' });
    } else if (comando === '/jaladera') {
      const a = auditarJaladera50();
      await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { chat_id: chatId, text: `🔬 <b>AUDITORÍA JALADERA +50</b>\n<b>GLOBAL:</b> ${a.global.tasa_real} vs azar ${a.azar_esperado}\nz-score: <b>${a.global.z_score}</b>`, parse_mode: 'HTML' });
    } else if (comando === '/anguila') {
      await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { chat_id: chatId, text: `🔗 <b>SALTOS DE ANGUILA</b>\nAzar ≈ 3% por sorteo.`, parse_mode: 'HTML' });
    } else if (comando === '/aciertos') {
      const avisos = await cazarAciertos({ enviar: false, marcar: false });
      await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { chat_id: chatId, text: avisos.length ? `🎯 <b>ACIERTOS DE HOY</b>\n\n` + avisos.join('\n\n') : 'Sin aciertos matemáticos aún hoy.', parse_mode: 'HTML' });
    }
  } catch (e) {}
});

app.get('/api/laboratorio', (req, res) => { res.json(backtestLaboratorio(req.query.loteria || null)); });
app.get('/api/jaladera-mitad', (req, res) => { res.json({ nota: 'Audit retirado en limpieza de supersticiones.' }); });

// ── Protección anti-crash global ──────────────────────────────────────────────
process.on('uncaughtException', (err) => console.error('⚠️ [uncaughtException]', err.message));
process.on('unhandledRejection', (reason) => console.error('⚠️ [unhandledRejection]', reason));

app.listen(PORT, async () => {
  console.log(`\n🚀 Reydis Engine v8.0-CLEAN en puerto ${PORT}`);
  await inicializarPersistenciaRemota();
  if (TG_ACTIVO) await enviarTelegram(`🚀 <b>REYDIS RADAR PRO</b> — Servidor iniciado (Clean Version)`);
  await sincronizar();

  const SELF_URL = process.env.RENDER_EXTERNAL_URL || `https://reydis-bot-service.onrender.com`;
  setInterval(async () => { try { await axios.get(`${SELF_URL}/`, { timeout: 5000 }); } catch (e) {} }, 14 * 60 * 1000);
});
