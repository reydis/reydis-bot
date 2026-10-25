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
const yaPredicho = {};
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
    if (s.numeros.length >= 3 && !yaNotificado[k]) nuevos.push({ tipo: 'sorteo', clave: k, nombre: s.nombre, hora: s.hora, numeros: s.numeros, prediccion: s.prediccion || null });
  }
  for (const [k, c] of Object.entries(estado.cuartetas)) {
    if (c.numeros.length >= 4 && !yaNotificado[k]) nuevos.push({ tipo: 'cuarteta', clave: k, nombre: c.nombre, hora: c.hora, numeros: c.numeros, prediccion: null });
  }
  for (const [k, e] of Object.entries(estado.especiales)) {
    if (e.numeros.length > 0 && !yaNotificado[k]) nuevos.push({ tipo: 'especial', clave: k, nombre: e.nombre, hora: e.hora, numeros: e.numeros, empresa: e.empresa, prediccion: null });
  }

  if (nuevos.length === 0) return;
  for (const n of nuevos) yaNotificado[n.clave] = true;
  if (esArranque) return;
  // otra copia del servidor (deploy/reinicio) ya pudo haberlos avisado
  const sinAvisar = nuevos.filter(n => !yaEnviado(`res|${n.clave}`));
  if (!sinAvisar.length) return;
  nuevos.length = 0; nuevos.push(...sinAvisar);
  await marcarEnviado(nuevos.map(n => `res|${n.clave}`));

  const f2 = x => String(x).padStart(2, '0');

  // Resumen acumulativo de todos los números que ya salieron hoy
  // Los que salieron en 2 o más loterías distintas se marcan con ⚡ y dicen en cuáles
  const conteoHoy = {}; // { numero: [nombreLoteria, ...] }
  for (const [, s] of Object.entries(estado.sorteos)) {
    if (s.numeros && s.numeros.length >= 3) {
      for (const n of s.numeros) {
        if (!conteoHoy[n]) conteoHoy[n] = [];
        if (!conteoHoy[n].includes(s.nombre)) conteoHoy[n].push(s.nombre);
      }
    }
  }
  const todosHoy = Object.keys(conteoHoy).map(Number).sort((a, b) => a - b);
  const repetidosHoy = todosHoy.filter(n => conteoHoy[n].length >= 2);

  const listaRepetidos = repetidosHoy.length
    ? `\n🔁 <b>Repetidos en varias loterías:</b>\n` +
      repetidosHoy.map(n =>
        `⚡ <b>${f2(n)}</b> → ${conteoHoy[n].join(', ')}`
      ).join('\n')
    : '';

  const resumenDia = todosHoy.length
    ? `\n\n📊 <b>Números del día:</b>\n` +
      todosHoy.map(n => conteoHoy[n].length >= 2 ? `⚡<b>${f2(n)}</b>` : f2(n)).join(' · ') +
      listaRepetidos
    : '';

  console.log(`📱 Notificando ${nuevos.length} resultado(s)...`);

  // Repetidos del día ANTES de este resultado (para cruzar con cada lotería)
  const repetidosAntes = {};
  for (const [, sv] of Object.entries(estado.sorteos)) {
    if (sv.numeros && sv.numeros.length >= 3) {
      for (const n of sv.numeros) {
        if (!repetidosAntes[n]) repetidosAntes[n] = [];
        if (!repetidosAntes[n].includes(sv.nombre)) repetidosAntes[n].push(sv.nombre);
      }
    }
  }
  const numsRepetidosHoy = Object.entries(repetidosAntes)
    .filter(([, lots]) => lots.length >= 2)
    .map(([n]) => +n);

  const lineas = nuevos.map(n => {
    const nums = n.numeros.map(x => f2(x)).join('-');
    const etiqueta = n.tipo === 'cuarteta' ? '🎲' : n.tipo === 'especial' ? '🎰' : '✅';
    const extra = n.empresa ? ` [${n.empresa}]` : '';
    let lineaPred = '';

    // — Comparación vs predicción —
    if (n.prediccion && n.prediccion.top3 && n.tipo === 'sorteo') {
      const pred = n.prediccion;
      const top1 = pred.top1;
      const top3 = pred.top3;
      const acertoPunto = top1 !== null && n.numeros.includes(top1);
      const acertosTop3 = n.numeros.filter(x => top3.includes(x)).length;
      const predStr = top3.map(f2).join('-');
      if (acertoPunto) {
        lineaPred = `\n     🎯 <b>¡PUNTO!</b> Predije ${f2(top1)} · salió ${nums}`;
      } else if (acertosTop3 >= 2) {
        lineaPred = `\n     💙 <b>PALE</b> en top-3 (${predStr}) · salió ${nums}`;
      } else if (acertosTop3 === 1) {
        lineaPred = `\n     ✔️ 1 de 3 · predije ${predStr} · salió ${nums}`;
      } else {
        lineaPred = `\n     ❌ Sin acierto · predije ${predStr} · salió ${nums}`;
      }
    }

    // — Para el Kino: los aciertos van de 0 a 20, gana con 0,5,6,7,8,9,10+ —
    if (n.tipo === 'especial' && n.clave === 'superkino' && n.prediccion && n.prediccion.top3) {
      const pred = n.prediccion;
      const top10 = Object.entries(pred.scoreDetalle || {})
        .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([num]) => +num);
      const aciertos = n.numeros.filter(x => top10.includes(x)).length;
      const premio = aciertos === 0 ? '🏆 Premio 0 aciertos' :
                     aciertos >= 10 ? '🏆 JACKPOT 10 aciertos' :
                     aciertos >= 5 ? `🎯 Premio ${aciertos} aciertos` : `(${aciertos} aciertos, sin premio)`;
      lineaPred = `\n     ${premio} · ticket de 10 jugado vs ${aciertos} que coincidieron`;
    }

    // — ¿Algún número ⚡ repetido del día salió en ESTA lotería? —
    const repsEnEsta = n.numeros.filter(x => numsRepetidosHoy.includes(x));
    let lineaReps = '';
    if (repsEnEsta.length > 0) {
      lineaReps = `\n     ⚡ <b>Repetidos del día que salieron aquí:</b> ` +
        repsEnEsta.map(x => {
          const lots = (repetidosAntes[x] || []).filter(ln => ln !== n.nombre);
          return `<b>${f2(x)}</b> (venía de: ${lots.join(', ')})`;
        }).join(' · ');
    }

    return `${etiqueta} <b>${n.nombre}</b>${extra} — <b>${nums}</b> <i>(${n.hora})</i>${lineaPred}${lineaReps}`;
  });

  await enviarTelegram(
    `🇩🇴 <b>REYDIS RADAR PRO</b> — ${fechaRD()}\n📥 <b>${nuevos.length} resultado(s) nuevo(s):</b>\n\n` +
    lineas.join('\n') +
    resumenDia
  );
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

// La columna 'anguilas' (Anguila de cada hora) es nueva: si todavía no se creó
// en Supabase, se guarda igual todo lo demás y se avisa en /api/debug-anguila.
let columnaAnguilas = true;
async function guardarEnSupabase(snapshot) {
  if (!SUPABASE_ACTIVO) return false;
  const fila = { fecha: snapshot.fecha, sorteos: snapshot.sorteos, cuartetas: snapshot.cuartetas, especiales: snapshot.especiales || {} };
  if (columnaAnguilas && snapshot.anguilas && Object.keys(snapshot.anguilas).length) fila.anguilas = snapshot.anguilas;
  const opts = { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }, timeout: 10000 };
  try {
    await axios.post(`${SUPABASE_URL}/rest/v1/historico?on_conflict=fecha`, fila, opts);
    return true;
  } catch (e) {
    if (fila.anguilas && /anguilas/.test(JSON.stringify(e.response?.data || ''))) {
      columnaAnguilas = false; delete fila.anguilas;
      try { await axios.post(`${SUPABASE_URL}/rest/v1/historico?on_conflict=fecha`, fila, opts); return true; } catch (e2) { return false; }
    }
    return false;
  }
}

async function cargarDeSupabase() {
  if (!SUPABASE_ACTIVO) return null;
  const h = { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, timeout: 10000 };
  const leer = (cols) => axios.get(`${SUPABASE_URL}/rest/v1/historico?select=${cols}&order=fecha.desc&limit=90`, h);
  try {
    let res;
    try { res = await leer('fecha,sorteos,cuartetas,especiales,anguilas'); }
    catch (e) { columnaAnguilas = false; res = await leer('fecha,sorteos,cuartetas,especiales'); }
    return res.data.map(r => ({ fecha: r.fecha, sorteos: r.sorteos, cuartetas: r.cuartetas, especiales: r.especiales || {}, anguilas: r.anguilas || {} }));
  } catch (e) { return null; }
}

async function inicializarPersistenciaRemota() {
  if (!SUPABASE_ACTIVO) return;
  await cargarEnviados();
  const remoto = await cargarDeSupabase();
  if (remoto && remoto.length > 0) {
    estado.historico = remoto.filter(r => r.fecha !== estado.fecha);
    const hoyData = remoto.find(r => r.fecha === estado.fecha);
    if (hoyData) {
      if (hoyData.sorteos) estado.sorteos = hoyData.sorteos;
      if (hoyData.cuartetas) estado.cuartetas = hoyData.cuartetas;
      if (hoyData.especiales) estado.especiales = { ...crearJuegosEspeciales(), ...hoyData.especiales }; // juegos nuevos aparecen aunque el día ya existiera
      if (hoyData.anguilas && Object.keys(hoyData.anguilas).length) estado.anguilas = { ...crearAnguilasHora(), ...hoyData.anguilas };
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
// Estas dos se usaban en revisarYEnviarPredicciones() pero nunca existieron:
// cada sync tiraba ReferenceError ahí y se saltaba las predicciones y el aviso de jugadas.
function minutosActualesRD() {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santo_Domingo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':').map(Number);
  return (h % 24) * 60 + m;
}
function horaTextoAMinutos(txt) {
  const m = String(txt || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return h * 60 + parseInt(m[2], 10);
}
function diaSemanaRD() { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santo_Domingo', weekday: 'short' }).format(new Date()); }

// Anguila de cada hora (aparte de las 4 clásicas: 10 AM, 1 PM, 6 PM y 9 PM).
// Solo para consulta: NO entran en ⚡ repetidos, predicciones, jugadas auto ni avisos.
const ANGUILA_HORA_LIST = [
  ['ang_08', 'Anguila 8:00 AM', '8:00 AM', 'anguila-8-am', 'anguilla-8am'],
  ['ang_09', 'Anguila 9:00 AM', '9:00 AM', 'anguila-9-am', 'anguilla-9am'],
  ['ang_11', 'Anguila 11:00 AM', '11:00 AM', 'anguila-11-am', 'anguilla-11am'],
  ['ang_12', 'Anguila 12:00 PM', '12:00 PM', 'anguila-12-pm', 'anguilla-12pm'],
  ['ang_14', 'Anguila 2:00 PM', '2:00 PM', 'anguila-2-pm', 'anguilla-2pm'],
  ['ang_15', 'Anguila 3:00 PM', '3:00 PM', 'anguila-3-pm', 'anguilla-3pm'],
  ['ang_16', 'Anguila 4:00 PM', '4:00 PM', 'anguila-4-pm', 'anguilla-4pm'],
  ['ang_17', 'Anguila 5:00 PM', '5:00 PM', 'anguila-5-pm', 'anguilla-5pm'],
  ['ang_19', 'Anguila 7:00 PM', '7:00 PM', 'anguila-7-pm', 'anguilla-7pm'],
  ['ang_20', 'Anguila 8:00 PM', '8:00 PM', 'anguila-8-pm', 'anguilla-8pm'],
  ['ang_22', 'Anguila 10:00 PM', '10:00 PM', 'anguila-10-pm', 'anguilla-10pm'],
];
const ANGUILA_PRINCIPALES_WU = { 'anguila-manana': 'anguila_m', 'anguila-medio-dia': 'anguila_t', 'anguila-tarde': 'anguila_n', 'anguila-noche': 'anguila_nn' };
function crearAnguilasHora() { const o = {}; for (const [k, nombre, hora] of ANGUILA_HORA_LIST) o[k] = { nombre, hora, numeros: [], estado: 'pendiente' }; return o; }
const persistido = cargarDeDisco();
let estado = {
  fecha: fechaRD(), hora_actualizacion: horaRD(),
  sorteos: crearSorteos(), cuartetas: crearCuartetas(), especiales: crearJuegosEspeciales(), anguilas: crearAnguilasHora(),
  historico: persistido?.historico || []
};

function crearCuartetas() { return { cuarteta_m: { nombre:'La Cuarteta Mañana', hora:'10:00 AM', numeros:[], estado:'pendiente' }, cuarteta_md: { nombre:'La Cuarteta Medio Día', hora:'1:00 PM', numeros:[], estado:'pendiente' }, cuarteta_t: { nombre:'La Cuarteta Tarde', hora:'6:00 PM', numeros:[], estado:'pendiente' }, cuarteta_n: { nombre:'La Cuarteta Noche', hora:'9:00 PM', numeros:[], estado:'pendiente' } }; }
function crearJuegosEspeciales() { return { pega3mas: { nombre:'Pega 3 Más', empresa:'LEIDSA', hora:'9:00 PM', tipo:'pega3', numeros:[], estado:'pendiente', rango:[0,50], cant:3 }, superkino: { nombre:'Super Kino TV', empresa:'LEIDSA', hora:'9:00 PM', tipo:'kino', numeros:[], estado:'pendiente', rango:[1,84], cant:20 }, loto: { nombre:'Loto', empresa:'LEIDSA', hora:'9:00 PM', tipo:'loto', numeros:[], estado:'pendiente', rango:[1,40], cant:6 }, lotomas: { nombre:'Loto Más · Súper Más', empresa:'LEIDSA', hora:'9:00 PM', tipo:'lotomas', numeros:[], estado:'pendiente', rango:[1,15], cant:2 }, quemaito: { nombre:'El Quemaito Mayor', empresa:'LOTEDOM', hora:'12:00 PM', tipo:'quiniela', numeros:[], estado:'pendiente', rango:[0,99], cant:1 }, megachance:{ nombre:'Mega Chance', empresa:'LOTEKA', hora:'7:55 PM', tipo:'chance', numeros:[], estado:'pendiente', rango:[0,99], cant:5 }, pega4king: { nombre:'Pega 4 Real', empresa:'REAL', hora:'12:55 PM', tipo:'pega4', numeros:[], estado:'pendiente', rango:[0,9], cant:4 }, loto5: { nombre:'Loto 5', empresa:'LA PRIMERA', hora:'8:00 PM', tipo:'loto5', numeros:[], estado:'pendiente', rango:[1,38], cant:6 }, lotopoolreal: { nombre:'Loto Pool Real', empresa:'REAL', hora:'1:00 PM', tipo:'lotopool', numeros:[], estado:'pendiente', rango:[0,99], cant:4 }, lotopoolleidsa: { nombre:'Loto Pool Leidsa', empresa:'LEIDSA', hora:'8:55 PM', tipo:'lotopool', numeros:[], estado:'pendiente', rango:[0,31], cant:5 } }; }
function crearSorteos() { return { anguila_m: { nombre:'Anguila Mañana', hora:'10:00 AM', numeros:[], estado:'pendiente' }, laprimera: { nombre:'La Primera Día', hora:'10:30 AM', numeros:[], estado:'pendiente' }, lotedom: { nombre:'LoteDom', hora:'12:00 PM', numeros:[], estado:'pendiente' }, suerte: { nombre:'La Suerte 12:30', hora:'12:30 PM', numeros:[], estado:'pendiente' }, king_t: { nombre:'King Tarde', hora:'12:30 PM', numeros:[], estado:'pendiente' }, real_t: { nombre:'Lotería Real', hora:'12:30 PM', numeros:[], estado:'pendiente' }, anguila_t: { nombre:'Anguila 1:00 PM', hora:'1:00 PM', numeros:[], estado:'pendiente' }, gana_mas: { nombre:'Gana Más', hora:'2:30 PM', numeros:[], estado:'pendiente' }, new_york_t: { nombre:'New York Tarde', hora:'3:30 PM', numeros:[], estado:'pendiente' }, florida_d: { nombre:'Florida Día', hora:'2:00 PM', numeros:[], estado:'pendiente' }, suerte_t2: { nombre:'La Suerte Tarde', hora:'6:00 PM', numeros:[], estado:'pendiente' }, anguila_n: { nombre:'Anguila 6:00 PM', hora:'6:00 PM', numeros:[], estado:'pendiente' }, king_n: { nombre:'King Noche', hora:'7:00 PM', numeros:[], estado:'pendiente' }, loteka: { nombre:'Loteka', hora:'6:55 PM', numeros:[], estado:'pendiente' }, laprimera_n: { nombre:'La Primera Noche', hora:'8:00 PM', numeros:[], estado:'pendiente' }, leidsa: { nombre:'Leidsa', hora:'8:55 PM', numeros:[], estado:'pendiente' }, nacional: { nombre:'Lotería Nacional', hora:'9:00 PM', numeros:[], estado:'pendiente' }, anguila_nn: { nombre:'Anguila 9:00 PM', hora:'9:00 PM', numeros:[], estado:'pendiente' }, new_york_n: { nombre:'New York Noche', hora:'10:30 PM', numeros:[], estado:'pendiente' }, florida_n: { nombre:'Florida Noche', hora:'10:30 PM', numeros:[], estado:'pendiente' } }; }

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
const MESES_ABREV_ENLOTERIA = { ene:'01', feb:'02', mar:'03', abr:'04', may:'05', jun:'06', jul:'07', ago:'08', sep:'09', oct:'10', nov:'11', dic:'12' };
function fechaEnloteria(texto) {
  let m = texto.match(/(\d{1,2})\s+de\s+([a-záéíóú]+),?\s+(?:de\s+)?(\d{4})/i);
  if (m && MESES_ES[m[2].toLowerCase()]) {
    return `${m[3]}-${MESES_ES[m[2].toLowerCase()]}-${String(m[1]).padStart(2,'0')}`;
  }
  m = texto.match(/(\d{1,2})\s+([a-z]{3,4})\.?,?\s+(\d{4})/i);
  if (m && MESES_ABREV_ENLOTERIA[m[2].toLowerCase()]) {
    return `${m[3]}-${MESES_ABREV_ENLOTERIA[m[2].toLowerCase()]}-${String(m[1]).padStart(2,'0')}`;
  }
  return null;
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

// Usamos las clases CSS reales de enloteria.com (.result-card, .result-date,
// .result-number), que son mucho más estables que adivinar por posición de texto.
// Tomamos SOLO el primer .result-card (el más reciente) y verificamos que su
// fecha coincida con "hoy" (según nuestro propio reloj de RD) antes de aceptar
// los números — así nunca confundimos el resultado de ayer con el de hoy,
// ni tomamos el placeholder vacío del sorteo de hoy que aún no ha salido.
// Loto LEIDSA: un solo sorteo → 6 números (1-40) + bolo azul "Más" + bolo rojo "Súper Más".
// Recibe la lista completa que publique la fuente y la reparte en loto / lotomas.
function repartirLoto(nums) {
  if (!Array.isArray(nums) || nums.length < 6 || !AUTO.diasLoto.includes(diaSemanaRD())) return false;
  let cambio = false;
  const loto = estado.especiales.loto, mas = estado.especiales.lotomas;
  if (loto && loto.numeros.length < 6) { loto.numeros = nums.slice(0, 6); loto.estado = 'disponible'; cambio = true; }
  if (mas && mas.numeros.length < 2 && nums.length >= 8) { mas.numeros = nums.slice(6, 8); mas.estado = 'disponible'; cambio = true; }
  return cambio;
}
function extraerResultadoHoyEnloteria(html, cantidadNumeros, fechaBuscada, todos) {
  const $ = cheerio.load(html);
  const card = $('.result-card').first();
  if (!card.length) return [];
  const fechaTexto = card.find('.result-date').first().text().trim();
  const fecha = fechaEnloteria(fechaTexto);
  if (fecha !== (fechaBuscada || fechaRD())) return [];
  const nums = [];
  card.find('.result-number').each((_, el) => {
    const t = $(el).text().trim();
    if (/^\d{1,2}$/.test(t)) nums.push(parseInt(t, 10));
  });
  if (todos) return nums.length >= cantidadNumeros ? nums : [];
  return nums.length >= cantidadNumeros ? nums.slice(0, cantidadNumeros) : [];
}

const ENLOTERIA_SORTEO_SLUGS = {
  'leidsa': 'leidsa',
  'real': 'real_t',
  'nacional-noche': 'nacional',
  'gana-mas': 'gana_mas',
  'la-primera': 'laprimera',
  'la-primera-noche': 'laprimera_n',
  'lotedom': 'lotedom',
  'la-suerte': 'suerte',
  'la-suerte-6pm': 'suerte_t2',
  'new-york-tarde': 'new_york_t',
  'new-york-noche': 'new_york_n',
  'florida-tarde': 'florida_d',
  'florida-noche': 'florida_n',
  'king-lottery-dia': 'king_t',
  'king-lottery-noche': 'king_n',
  'loteka': 'loteka',
  'anguilla-10am': 'anguila_m',
  'anguilla-1pm': 'anguila_t',
  'anguilla-6pm': 'anguila_n',
  'anguilla-9pm': 'anguila_nn',
};

async function scrapeEnloteria() {
  const pendientes = Object.entries(ENLOTERIA_SORTEO_SLUGS).filter(([, clave]) => estado.sorteos[clave] && estado.sorteos[clave].numeros.length < 3);
  if (!pendientes.length) return 0;
  let conteo = 0;
  for (const [slug, clave] of pendientes) {
    try {
      const res = await axios.get(`https://enloteria.com/resultados-${slug}-hoy`, { headers: HEADERS, timeout: 15000 });
      const nums = extraerResultadoHoyEnloteria(res.data, 3);
      if (nums.length === 3 && !nums.every(n => n === nums[0])) {
        estado.sorteos[clave].numeros = nums; estado.sorteos[clave].estado = 'disponible'; conteo++;
      }
    } catch (e) {}
  }
  return conteo;
}

// Mismo arreglo que scrapeEnloteria() pero para los juegos especiales
// (Super Kino TV, Loto, Loto Más, Mega Chance, Pega 3 Más, El Quemaito
// Mayor, Pega 4 Real) — antes solo se había aplicado a las 20 quinielas
// normales, dejando los especiales dependiendo de fuentes ya rotas.
// Slugs verificados en enloteria.com oct 2026.
// pega-3-mas y pega-4 NO tienen página propia en Enloteria — se eliminaron.
const ENLOTERIA_ESPECIAL_SLUGS = {
  'super-kino-tv': 'superkino',
  'loto': 'loto',
  'megachance': 'megachance',
  'el-quemaito-mayor': 'quemaito',
};

// ── JUEGOS NUEVOS: Loto 5 (La Primera), Loto Pool Real, Loto Pool Leidsa ─────
// Loto 5: 5 números (1-38) + bolo "5+" (1-10) → se guardan los 6.
// Loto Pool Real: 4 números (00-99). Loto Pool Leidsa: 5 números (00-31).
// Se prueban varios nombres de página y SOLO se acepta un resultado que cumpla
// la forma del juego (cantidad y rango), así no se mezcla con otro "Loto Pool".
const ESPECIALES_NUEVOS = {
  loto5:          { enl: ['loto-5', 'loto-5-la-primera', 'la-primera-loto-5'], wu: ['loto-5'],
                    valida: n => n.length === 6 && n.slice(0, 5).every(x => x >= 1 && x <= 38) && n[5] >= 1 && n[5] <= 10 },
  lotopoolreal:   { enl: ['loto-pool-real', 'real-loto-pool', 'loto-pool'], wu: ['loto-pool', 'loto-pool-real'],
                    valida: n => n.length === 4 && n.every(x => x >= 0 && x <= 99) },
  lotopoolleidsa: { enl: ['loto-pool', 'loto-pool-leidsa', 'leidsa-loto-pool'], wu: ['loto-pool', 'loto-pool-leidsa'], // en Wuloteria los 2 Loto Pool se llaman 'loto-pool': se distinguen por cantidad y rango
                    valida: n => n.length === 5 && n.every(x => x >= 0 && x <= 31) },
};
const slugNuevoOk = {}; // clave → slug de Enloteria que funcionó
async function leerNuevoEnloteria(clave, fecha) {
  const cfg = ESPECIALES_NUEVOS[clave];
  const slugs = slugNuevoOk[clave] ? [slugNuevoOk[clave]] : cfg.enl;
  for (const slug of slugs) {
    try {
      const url = fecha ? `https://enloteria.com/resultados-${slug}-${fecha}` : `https://enloteria.com/resultados-${slug}-hoy`;
      const r = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      const nums = extraerResultadoHoyEnloteria(r.data, 1, fecha || null, true);
      if (cfg.valida(nums)) { slugNuevoOk[clave] = slug; return nums; }
    } catch (e) {}
  }
  return null;
}
async function scrapeEspecialesNuevos() {
  let conteo = 0;
  for (const clave of Object.keys(ESPECIALES_NUEVOS)) {
    const j = estado.especiales[clave];
    if (!j || j.numeros.length >= j.cant) continue;
    const m = horaTextoAMinutos(j.hora);
    if (m !== null && minutosActualesRD() < m) continue; // todavía no se ha jugado
    const nums = await leerNuevoEnloteria(clave);
    if (nums) { j.numeros = nums; j.estado = 'disponible'; conteo++; }
  }
  return conteo;
}

async function scrapeEspecialesEnloteria() {
  const pendientes = Object.entries(ENLOTERIA_ESPECIAL_SLUGS).filter(([, clave]) => {
    const j = estado.especiales[clave];
    if (clave === 'loto' && estado.especiales.lotomas && estado.especiales.lotomas.numeros.length < 2 && AUTO.diasLoto.includes(diaSemanaRD())) return true; // falta el bolo Más
    return j && j.numeros.length < j.cant;
  });
  if (!pendientes.length) return 0;
  let conteo = 0;
  for (const [slug, clave] of pendientes) {
    const juego = estado.especiales[clave];
    try {
      const res = await axios.get(`https://enloteria.com/resultados-${slug}-hoy`, { headers: HEADERS, timeout: 15000 });
      if (clave === 'loto') { if (repartirLoto(extraerResultadoHoyEnloteria(res.data, 6, null, true))) conteo++; continue; }
      const nums = extraerResultadoHoyEnloteria(res.data, juego.cant);
      if (nums.length === juego.cant) {
        juego.numeros = nums; juego.estado = 'disponible'; conteo++;
      }
    } catch (e) {}
  }
  return conteo;
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

// ── WULOTERIA ───────────────────────────────────────────────────────────────
// Wuloteria (Next.js) mete todos los resultados como JSON dentro del HTML:
//   {"drawSlot":"manana","game":"La Cuarteta Mañana","gameSlug":"la-cuarteta-manana",
//    "numbers":[30,85,49,50],"date":"2026-10-14",...}
// Leemos esos objetos directo, sin depender de clases CSS. Es la única fuente
// viva que encontramos para La Cuarteta y Pega 3 Más (oct 2026).
const WULOTERIA_CUARTETAS = {
  'la-cuarteta-manana': 'cuarteta_m',
  'cuarteta-medio-dia': 'cuarteta_md',
  'cuarteta-tarde':     'cuarteta_t',
  'cuarteta-noche':     'cuarteta_n',
};
const WULOTERIA_ESPECIALES = {
  'pega-3-mas':        'pega3mas',
  'super-kino-tv':     'superkino',
  'mega-chances':      'megachance',
  'el-quemaito-mayor': 'quemaito',
};
// Páginas de detalle (cada una trae los últimos ~10 sorteos) — para el backfill
const WULOTERIA_PAGINAS = {
  'la-cuarteta-manana': 'anguila/la-cuarteta-manana',
  'cuarteta-medio-dia': 'anguila/cuarteta-medio-dia',
  'cuarteta-tarde':     'anguila/cuarteta-tarde',
  'cuarteta-noche':     'anguila/cuarteta-noche',
  'pega-3-mas':         'leidsa/pega-3-mas',
};

function parsearWuloteria(html) {
  const texto = String(html).replace(/\\"/g, '"');
  const vistos = new Set();
  const salida = [];
  const re = /\{[^{}]*?"gameSlug":"[^"]+"[^{}]*\}/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    let obj;
    try { obj = JSON.parse(m[0]); } catch (e) { continue; }
    if (!obj.gameSlug || !Array.isArray(obj.numbers) || !/^\d{4}-\d{2}-\d{2}$/.test(obj.date || '')) continue;
    const nums = obj.numbers.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
    if (!nums.length) continue;
    const id = `${obj.gameSlug}|${obj.date}`;
    if (vistos.has(id)) continue;
    vistos.add(id);
    salida.push({ slug: obj.gameSlug, juego: obj.game || '', fecha: obj.date, numeros: nums });
  }
  return salida;
}

// Páginas de detalle (/loto/...): historial en HTML normal
//   <li class="wl-hist__row"> <time dateTime="2026-10-12"> ... <span class="wl-fig__v">24</span> ...
function parsearHistorialWuloteria(html) {
  const $ = cheerio.load(html); const out = []; const vistos = new Set();
  $('li.wl-hist__row').each((_, li) => {
    const fecha = ($(li).find('time').first().attr('datetime') || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || vistos.has(fecha)) return;
    const nums = $(li).find('.wl-fig__v').map((__, s) => parseInt($(s).text().trim(), 10)).get().filter(n => !isNaN(n));
    if (!nums.length) return;
    vistos.add(fecha); out.push({ fecha, numeros: nums });
  });
  return out;
}

async function scrapeWuloteria() {
  const faltanCuartetas = Object.values(estado.cuartetas).some(c => c.numeros.length < 4);
  const faltanEspeciales = Object.values(WULOTERIA_ESPECIALES).some(k => estado.especiales[k] && estado.especiales[k].numeros.length < estado.especiales[k].cant) || (estado.especiales.lotomas && estado.especiales.lotomas.numeros.length < 2 && AUTO.diasLoto.includes(diaSemanaRD()));
  const faltanAnguilas = Object.values(estado.anguilas || {}).some(a => a.numeros.length < 3) || !estado._anguilaMVerificada;
  if (!faltanCuartetas && !faltanEspeciales && !faltanAnguilas) return 0;
  if (!estado.anguilas) estado.anguilas = crearAnguilasHora();
  const hoy = fechaRD();
  let conteo = 0;
  try {
    const res = await axios.get('https://wuloteria.com/', { headers: HEADERS, timeout: 15000 });
    for (const r of parsearWuloteria(res.data)) {
      if (r.fecha !== hoy) continue;
      const ka = ANGUILA_HORA_LIST.find(x => x[3] === r.slug);
      if (ka && r.numeros.length === 3 && estado.anguilas[ka[0]] && estado.anguilas[ka[0]].numeros.length < 3) {
        estado.anguilas[ka[0]].numeros = r.numeros; estado.anguilas[ka[0]].estado = 'disponible'; conteo++;
        continue;
      }
      const kp = ANGUILA_PRINCIPALES_WU[r.slug];
      if (kp && r.numeros.length === 3 && estado.sorteos[kp]) {
        const s = estado.sorteos[kp];
        if (s.numeros.length < 3) { s.numeros = r.numeros; s.estado = 'disponible'; conteo++; }
        else if (kp === 'anguila_m' && s.numeros.join('-') !== r.numeros.join('-')) {
          // Antes se leía el sorteo de las 8 AM como "Anguila Mañana": se corrige con el de las 10 AM
          console.log(`[ANGUILA] Corrigiendo Anguila Mañana ${s.numeros.join('-')} → ${r.numeros.join('-')} (sorteo de 10 AM)`);
          s.numeros = r.numeros; conteo++;
        }
        if (kp === 'anguila_m') estado._anguilaMVerificada = true;
        continue;
      }
      const kc = WULOTERIA_CUARTETAS[r.slug];
      if (kc && estado.cuartetas[kc] && estado.cuartetas[kc].numeros.length < 4 && r.numeros.length === 4) {
        estado.cuartetas[kc].numeros = r.numeros; estado.cuartetas[kc].estado = 'disponible'; conteo++;
        continue;
      }
      // En Wuloteria "loto" es OTRO juego (sale días que LEIDSA no juega); el de LEIDSA con sus 2 bolos extra es "loto-mas" (8 números)
      if (r.slug === 'loto-mas' && r.numeros.length >= 8 && repartirLoto(r.numeros)) { conteo++; continue; }
      const kn = Object.keys(ESPECIALES_NUEVOS).find(k => ESPECIALES_NUEVOS[k].wu.includes(r.slug) && ESPECIALES_NUEVOS[k].valida(r.numeros));
      if (kn && estado.especiales[kn] && estado.especiales[kn].numeros.length < estado.especiales[kn].cant) {
        estado.especiales[kn].numeros = r.numeros; estado.especiales[kn].estado = 'disponible'; conteo++; continue;
      }
      const ke = WULOTERIA_ESPECIALES[r.slug];
      const juego = ke && estado.especiales[ke];
      if (juego && juego.numeros.length < juego.cant && r.numeros.length === juego.cant) {
        juego.numeros = r.numeros; juego.estado = 'disponible'; conteo++;
      }
    }
  } catch (e) {}
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

// ── DIAGNÓSTICO DE FUENTES DE SCRAPING ──────────────────────────────────────
async function diagnosticarFuentes() {
  const resultado = {};

  // 1. Conéctate
  try {
    const r = await axios.get('https://www.conectate.com.do/loterias/api/widget', { headers: HEADERS, timeout: 10000 });
    const items = Array.isArray(r.data) ? r.data : (r.data?.data || []);
    resultado.conectate = { ok: true, status: r.status, items: items.length };
  } catch (e) {
    resultado.conectate = { ok: false, error: e.message, status: e.response?.status || null };
  }

  // 2. LoteriasDominicanas
  try {
    const r = await axios.get('https://loteriasdominicanas.com/anguila/anguila-manana/_payload.json', { headers: HEADERS, timeout: 10000 });
    resultado.loteriasdominicanas = { ok: true, status: r.status, tipo: typeof r.data, muestra: JSON.stringify(r.data).slice(0, 200) };
  } catch (e) {
    resultado.loteriasdominicanas = { ok: false, error: e.message, status: e.response?.status || null };
  }

  // 3. Enloteria (prueba directa con Leidsa, usando la lógica robusta por clases CSS)
  try {
    const r = await axios.get('https://enloteria.com/resultados-leidsa-hoy', { headers: HEADERS, timeout: 15000 });
    const nums = extraerResultadoHoyEnloteria(r.data, 3);
    resultado.enloteria = { ok: true, status: r.status, numeros_leidsa_hoy: nums, funciono: nums.length === 3, nota: nums.length === 0 ? 'Puede ser normal si el sorteo de hoy aun no ha salido' : undefined };
  } catch (e) {
    resultado.enloteria = { ok: false, error: e.message, status: e.response?.status || null };
  }

  // 3b. Wuloteria (Cuarteta + Pega 3 Más)
  try {
    const r = await axios.get('https://wuloteria.com/', { headers: HEADERS, timeout: 15000 });
    const todos = parsearWuloteria(r.data);
    const interes = todos.filter(x => WULOTERIA_CUARTETAS[x.slug] || WULOTERIA_ESPECIALES[x.slug]);
    resultado.wuloteria = { ok: true, status: r.status, sorteos_leidos: todos.length, funciono: interes.length > 0,
      cuartetas_y_especiales: interes.map(x => `${x.fecha} ${x.slug}: ${x.numeros.join('-')}`) };
  } catch (e) {
    resultado.wuloteria = { ok: false, error: e.message, status: e.response?.status || null };
  }

  // 4. Yelu
  try {
    const r = await axios.get('https://www.yelu.do/lottery/results/gana-mas', { headers: HEADERS, timeout: 15000 });
    resultado.yelu = { ok: true, status: r.status, tamano_html: r.data.length };
  } catch (e) {
    resultado.yelu = { ok: false, error: e.message, status: e.response?.status || null };
  }

  return resultado;
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
  let totalSorteos = 0, totalAciertos = 0;

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
        avisos.push(`🎯 <b>Radar top-2 ¡PALÉ!</b> — ${s.nombre}\n     jugó <b>${top.map(f2).join('-')}</b> · salió ${salio}`);
        totalAciertos++;
      }
      yaChequeado[`${clave}|radar`] = true;
    }

    if (!yaChequeado[`${clave}|punto`] && yaEnviado(`radar|${clave}`)) yaChequeado[`${clave}|punto`] = true;
    if (!yaChequeado[`${clave}|punto`]) {
      if (enviar) await marcarEnviado(`radar|${clave}`);
      totalSorteos++;
      if (serie.length >= 2) {
        const pesosP = {};
        serie.forEach((nums, j) => {
          const w = (j + 1) /* v9.10: el más reciente pesa más */;
          if (nums[0] !== undefined) pesosP[nums[0]] = (pesosP[nums[0]] || 0) + 60 * w;
          if (nums[1] !== undefined) pesosP[nums[1]] = (pesosP[nums[1]] || 0) + 8 * w;
          if (nums[2] !== undefined) pesosP[nums[2]] = (pesosP[nums[2]] || 0) + 4 * w;
        });
        const top1 = Object.entries(pesosP).sort((a, b) => b[1] - a[1])[0];
        const wf = radarPuntoWF(clave);
        if (top1 && hoy.has(+top1[0])) {
          totalAciertos++;
          avisos.push(`✅ <b>${s.nombre}</b> — salió ${salio}\n     🎯 Punto: predijo <b>${f2(+top1[0])}</b> ¡ACERTÓ! · lleva ${wf.ac}/${wf.ev} (${wf.tasa.toFixed(1)}% vs azar 3%)`);
        } else if (top1) {
          avisos.push(`❌ <b>${s.nombre}</b> — salió ${salio}\n     predijo <b>${f2(+top1[0])}</b> · no acertó · lleva ${wf.ac}/${wf.ev} (${wf.tasa.toFixed(1)}%)`);
        }
      } else {
        avisos.push(`⚪ <b>${s.nombre}</b> — salió ${salio}\n     (sin historial suficiente aún)`);
      }
      yaChequeado[`${clave}|punto`] = true;
    }
  }

  if (enviar && avisos.length && TG_ACTIVO) await enviarTelegram(
    `🎯 <b>RADAR PUNTO</b> — ${fechaRD()} ${horaRD()}\n` +
    (totalSorteos > 1 ? `📊 ${totalAciertos} aciertos en estos ${totalSorteos} sorteos\n\n` : '') +
    avisos.join('\n\n') +
    `\n\n<i>El total del día llega en la noche.</i>`
  );
  return avisos;
}

// Resumen de la noche: TODOS los sorteos del día juntos (se recalcula desde cero,
// así no depende de reinicios del servidor).
let radarResumenEnviado = null;
async function enviarResumenRadarDelDia() {
  if (!TG_ACTIVO) return;
  const hoy = fechaRD();
  if (radarResumenEnviado === hoy || minutosActualesRD() < 23 * 60 + 10) return;
  radarResumenEnviado = hoy;
  if (yaEnviado('resumen-radar')) return;
  await marcarEnviado('resumen-radar');
  const f2 = n => String(n).padStart(2, '0');
  const lineas = []; let ev = 0, ac = 0;
  for (const [clave, s] of Object.entries(estado.sorteos)) {
    if (!s.numeros || s.numeros.length < 3) continue;
    const serie = [...estado.historico].filter(d => d.fecha < hoy).sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
      .map(d => d.sorteos && d.sorteos[clave]).filter(x => x && x.numeros && x.numeros.length >= 3).map(x => x.numeros.map(Number));
    if (serie.length < 2) continue;
    const pesos = {};
    serie.forEach((nums, j) => { const w = (j + 1) /* v9.10: el más reciente pesa más */; [60, 8, 4].forEach((p, i) => { if (nums[i] !== undefined) pesos[nums[i]] = (pesos[nums[i]] || 0) + p * w; }); });
    const top = Object.entries(pesos).sort((a, b) => b[1] - a[1])[0];
    if (!top) continue;
    const hit = s.numeros.map(Number).includes(+top[0]);
    ev++; if (hit) ac++;
    lineas.push(`${hit ? '✅' : '❌'} ${s.nombre}: predijo <b>${f2(+top[0])}</b> · salió ${s.numeros.map(f2).join('-')}`);
  }
  if (!ev) return;
  const esperado = (ev * 0.0297).toFixed(1);
  await enviarTelegram(`📊 <b>RADAR PUNTO — RESUMEN DEL DÍA</b> ${hoy}\n<b>${ac} de ${ev}</b> sorteos acertados (por azar se esperaban ~${esperado})\n\n${lineas.join('\n')}`);
}

// ── PREDICCIÓN ANTICIPADA — SCORE COMBINADO DE 3 SEÑALES ──────────────────
// Señal 1 — Frecuencia ponderada por posición y recencia (igual que Radar punto)
// Señal 2 — Bonus de adyacencia: si el número tiene un adyacente frecuente que
//           ya salió HOY en esta misma lotería u otras, sube su score
// Señal 3 — Bonus de vencimiento: si el número lleva más sorteos que su ciclo
//           promedio sin aparecer, está "vencido" y sube proporcionalmente
// Señal 4 — Contexto del día: números repetidos en 2+ loterías distintas hoy
function calcularPrediccionConContextoDelDia(clave) {
  const dias = [...estado.historico].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const serie = [];
  for (const d of dias) {
    const ds = d.sorteos && d.sorteos[clave];
    if (ds && ds.numeros && ds.numeros.length >= 3) serie.push(ds.numeros.map(Number));
  }
  if (!serie.length) return { top1: null, top3: [], scoreDetalle: {}, diasHistoricos: 0, contextoHoy: [] };

  // — SEÑAL 1: frecuencia ponderada por posición y recencia —
  const score = {};
  serie.forEach((nums, j) => {
    const w = (j + 1) /* v9.10: el más reciente pesa más */;
    if (nums[0] !== undefined) score[nums[0]] = (score[nums[0]] || 0) + 60 * w;
    if (nums[1] !== undefined) score[nums[1]] = (score[nums[1]] || 0) + 8 * w;
    if (nums[2] !== undefined) score[nums[2]] = (score[nums[2]] || 0) + 4 * w;
  });

  // v9.6: el laboratorio de 100 días (21 métodos) no encontró NINGUNO mejor que el azar.
  // Adyacentes y repetidos del día eran ideas para el Kino: en las quinielas
  // queda SOLO frecuencia + posición. Las señales 2-4 se dejan apagadas.
  const SOLO_FRECUENCIA = true;
  // — SEÑAL 2: bonus de adyacencia —
  // Calcula qué pares consecutivos aparecen juntos más veces en el historial,
  // luego refuerza los números cuyo adyacente más frecuente YA salió hoy en
  // cualquier lotería (señal fuerte) o en el historial (señal moderada).
  const adjFreq = {};
  for (const nums of serie) {
    const s = new Set(nums);
    for (const n of nums) if (s.has(n + 1)) { const k = `${n}-${n+1}`; adjFreq[k] = (adjFreq[k] || 0) + 1; }
  }
  const salidasHoyTodas = new Set();
  for (const [, s] of Object.entries(estado.sorteos)) {
    if (s.numeros) for (const n of s.numeros) salidasHoyTodas.add(n);
  }
  const PESO_ADJ_HOY = 55;
  const PESO_ADJ_HIST = 15;
  if (!SOLO_FRECUENCIA) for (const [par, veces] of Object.entries(adjFreq)) {
    const [a, b] = par.split('-').map(Number);
    if (salidasHoyTodas.has(b)) score[a] = (score[a] || 0) + veces * PESO_ADJ_HOY;
    if (salidasHoyTodas.has(a)) score[b] = (score[b] || 0) + veces * PESO_ADJ_HOY;
    score[a] = (score[a] || 0) + veces * PESO_ADJ_HIST;
    score[b] = (score[b] || 0) + veces * PESO_ADJ_HIST;
  }

  // — SEÑAL 3: bonus de vencimiento (ciclo) —
  // Para cada número, calcula cuántos sorteos pasan en promedio entre una
  // aparición y la siguiente (su "ciclo"). Si lleva más sorteos que ese
  // ciclo sin aparecer, está "vencido" — le suma puntos proporcionales.
  const ultimaAparicion = {}; // número → índice del último sorteo donde salió
  const intervalos = {};       // número → lista de gaps entre apariciones
  serie.forEach((nums, idx) => {
    for (const n of nums) {
      if (ultimaAparicion[n] !== undefined) {
        const gap = idx - ultimaAparicion[n];
        if (!intervalos[n]) intervalos[n] = [];
        intervalos[n].push(gap);
      }
      ultimaAparicion[n] = idx;
    }
  });
  const totalSorteos = serie.length;
  const PESO_VENCIMIENTO = 40;
  for (let n = 0; n <= 99; n++) {
    const cicloPromedio = intervalos[n] && intervalos[n].length
      ? intervalos[n].reduce((a, b) => a + b, 0) / intervalos[n].length
      : null;
    const sorteosSinSalir = ultimaAparicion[n] !== undefined
      ? totalSorteos - 1 - ultimaAparicion[n]
      : totalSorteos; // nunca salió → totalmente vencido
    if (!SOLO_FRECUENCIA && cicloPromedio && sorteosSinSalir > cicloPromedio) {
      const vencimiento = (sorteosSinSalir - cicloPromedio) / cicloPromedio; // 0..N
      score[n] = (score[n] || 0) + Math.min(vencimiento, 3) * PESO_VENCIMIENTO;
    }
  }

  // — SEÑAL 4: contexto del día con peso diferenciado por horario —
  // Las loterías de la noche muestran más coincidencias con los repetidos
  // del día — les damos el doble de peso. Además distinguimos loterías
  // locales dominicanas vs externas (Florida, New York): un número que
  // repite en 3 loterías locales es señal más fuerte que uno que repite
  // entre New York y una local.
  const LOTERIAS_NOCTURNAS = new Set(['king_n','loteka','laprimera_n','leidsa','nacional','anguila_nn','new_york_n','florida_n']);
  const LOTERIAS_EXTERNAS  = new Set(['new_york_t','new_york_n','florida_d','florida_n']);
  const esNocturna = LOTERIAS_NOCTURNAS.has(clave);

  const numerosDeHoy = {};
  for (const [k, s] of Object.entries(estado.sorteos)) {
    if (k === clave) continue;
    if (s.numeros && s.numeros.length >= 3) {
      for (const n of s.numeros) {
        if (!numerosDeHoy[n]) numerosDeHoy[n] = { lots: [], externas: 0 };
        numerosDeHoy[n].lots.push(s.nombre);
        if (LOTERIAS_EXTERNAS.has(k)) numerosDeHoy[n].externas++;
      }
    }
  }
  const repetidosHoy = Object.entries(numerosDeHoy).filter(([, d]) => d.lots.length >= 2);

  // Peso base: 35 diurnas, 70 nocturnas (doble por mayor coincidencia observada)
  // Factor local: 1.5x si 2+ repeticiones son de loterías locales
  const PESO_BASE = esNocturna ? 70 : 35;
  if (!SOLO_FRECUENCIA) for (const [n, d] of repetidosHoy) {
    const locales = d.lots.length - d.externas;
    const factorLocal = locales >= 2 ? 1.5 : locales === 1 ? 1.0 : 0.5;
    score[n] = (score[n] || 0) + d.lots.length * PESO_BASE * factorLocal;
  }

  const ranking = Object.entries(score).sort((a, b) => b[1] - a[1]).map(([n]) => +n);

  const scoreDetalle = {};
  for (const [n, v] of Object.entries(score)) scoreDetalle[+n] = Math.round(v);

  return {
    top1: ranking[0],
    top3: ranking.slice(0, 3),
    scoreDetalle,
    diasHistoricos: serie.length,
    contextoHoy: repetidosHoy
      .map(([n, d]) => ({ numero: +n, loterias: d.lots }))
      .sort((a, b) => b.loterias.length - a.loterias.length),
  };
}

async function revisarYEnviarPredicciones() {
  if (!TG_ACTIVO) return;
  const ahora = minutosActualesRD();
  const VENTANA_MIN = 75; // manda predicción hasta 75 min antes del cierre
  const avisos = [];

  for (const [clave, s] of Object.entries(estado.sorteos)) {
    if (yaPredicho[clave]) continue;
    if (yaEnviado(`pred|${clave}`)) { yaPredicho[clave] = true; continue; }
    if (s.numeros && s.numeros.length >= 3) { yaPredicho[clave] = true; continue; }
    const minutosSorteo = horaTextoAMinutos(s.hora);
    if (minutosSorteo === null) continue;
    const faltan = minutosSorteo - ahora;
    if (faltan < 0 || faltan > VENTANA_MIN) continue;

    const pred = calcularPrediccionConContextoDelDia(clave);
    if (pred.diasHistoricos < 5) { yaPredicho[clave] = true; continue; }

    yaPredicho[clave] = true;
    await marcarEnviado(`pred|${clave}`);
    // Guarda también el scoreDetalle y la fecha para el dashboard de precisión
    s.prediccion = {
      top1: pred.top1,
      top3: pred.top3,
      scoreDetalle: pred.scoreDetalle,
      hora_calculo: horaRD(),
      contexto_dia: pred.contextoHoy,
      fecha: fechaRD(),
    };

    const f2 = n => String(n).padStart(2, '0');

    // Construir resumen de repetidos del día en este momento
    const conteoActual = {};
    for (const [, sv] of Object.entries(estado.sorteos)) {
      if (sv.numeros && sv.numeros.length >= 3) {
        for (const n of sv.numeros) {
          if (!conteoActual[n]) conteoActual[n] = [];
          if (!conteoActual[n].includes(sv.nombre)) conteoActual[n].push(sv.nombre);
        }
      }
    }
    const repsActuales = Object.entries(conteoActual)
      .filter(([, lots]) => lots.length >= 2)
      .sort((a, b) => b[1].length - a[1].length);

    const ctxTxt = repsActuales.length
      ? `\n     🔁 <b>Repetidos hoy:</b>\n` +
        repsActuales.map(([n, lots]) => `     ⚡ <b>${f2(+n)}</b> → ${lots.join(', ')}`).join('\n')
      : '\n     🔁 Repetidos hoy: ninguno aún';

    avisos.push(`🔮 <b>${s.nombre}</b> — cierra ${s.hora}\n     Punto: <b>${f2(pred.top1)}</b> · Top-3: <b>${pred.top3.map(f2).join('-')}</b>${ctxTxt}`);
  }

  if (avisos.length) {
    await enviarTelegram(`🔮 <b>PREDICCIONES DEL MOMENTO</b> — ${fechaRD()}\n\n` + avisos.join('\n\n') +
      `\n\n<i>Método: frecuencia + posición (los ⚡ repetidos son solo informativos).</i>`);
    guardarEnDisco();
    await guardarEnSupabase({ fecha: estado.fecha, sorteos: estado.sorteos, cuartetas: estado.cuartetas, especiales: estado.especiales, anguilas: estado.anguilas });
  }
}


app.use(cors({ origin: '*' }));
app.use(express.json());

let sincronizando = false;
async function sincronizar() {
  if (sincronizando) return;
  sincronizando = true;
  try {
    const hoy = fechaRD();
    if (hoy !== estado.fecha) {
      const snapshot = { fecha: estado.fecha, sorteos: JSON.parse(JSON.stringify(estado.sorteos)), cuartetas: JSON.parse(JSON.stringify(estado.cuartetas)), especiales: JSON.parse(JSON.stringify(estado.especiales)), anguilas: JSON.parse(JSON.stringify(estado.anguilas || {})) };
      estado.historico.unshift(snapshot);
      if (estado.historico.length > 90) estado.historico.pop();
      estado.sorteos = crearSorteos(); estado.cuartetas = crearCuartetas(); estado.especiales = crearJuegosEspeciales(); estado.anguilas = crearAnguilasHora(); estado._anguilaMVerificada = false; estado.fecha = hoy;
      Object.keys(yaNotificado).forEach(k => delete yaNotificado[k]); Object.keys(yaChequeado).forEach(k => delete yaChequeado[k]); Object.keys(yaPredicho).forEach(k => delete yaPredicho[k]);
      guardarEnDisco(); await guardarEnSupabase(snapshot);
    }

    await cargarEnviados(); // nuevo día → lista vacía; mismo día → no hace nada
    aplicarHorasDelDia();
    await scrapeConectateAPI();
    if (Object.values(estado.sorteos).filter(s => s.numeros.length < 3).length > 0) await scrapeLotDominicanas();
    if (Object.values(estado.sorteos).filter(s => s.numeros.length < 3).length > 0) await scrapeEnloteria();
    if (Object.values(estado.sorteos).filter(s => s.numeros.length < 3).length > 0) await scrapeYelu();

    await scrapeWuloteria(); // Cuarteta + Pega 3 Más (fuente principal) y respaldo de Kino/MegaChance/Quemaito
    if (Object.values(estado.cuartetas).filter(c => c.numeros.length < 4).length > 0) await scrapeCuartetaLotDominicanas();
    if (Object.values(estado.especiales).filter(e => e.numeros.length < e.cant).length > 0) await scrapeEspecialesEnloteria();
    await scrapeEspecialesNuevos();
    
    estado.hora_actualizacion = horaRD();
    guardarEnDisco();
    await guardarEnSupabase({ fecha: estado.fecha, sorteos: estado.sorteos, cuartetas: estado.cuartetas, especiales: estado.especiales, anguilas: estado.anguilas });
    // Cada paso en su propio try: si uno falla, los demás siguen corriendo
    const paso = async (nombre, fn) => { try { await fn(); } catch (e) { console.error(`⚠️ [${nombre}]`, e.message); } };
    await paso('jugadas-auto', generarJugadasAutomaticas);
    await paso('evaluar-auto', evaluarJugadasAutomaticas);
    await paso('lab-generar', labGenerar);
    await paso('lab-evaluar', labEvaluar);
    await paso('nuevos-sorteos', notificarNuevosSorteos);
    await paso('aciertos', () => cazarAciertos({ enviar: true }));
    await paso('predicciones', revisarYEnviarPredicciones);
    await paso('jugadas-personales', notificarJugadasPersonales);
    await paso('resumen-radar', enviarResumenRadarDelDia);
    await paso('resumen-auto', enviarResumenAutoDelDia);
    await paso('teoria-repetidos', enviarAnalisisRepetidos);
    await paso('lab-resumen', labResumenNoche);
  } catch(e) { console.error('⚠️ Error en sincronizar:', e.message); } finally { sincronizando = false; }
}

setInterval(sincronizar, 15 * 60 * 1000);

// ── ENDPOINTS Frontend y Diagnóstico ───────────────────────────────────────
app.get('/api/hoy', async (req, res) => { await sincronizar(); res.json({ fecha: estado.fecha, hora_actualizacion: estado.hora_actualizacion, sorteos: estado.sorteos, cuartetas: estado.cuartetas, especiales: estado.especiales, anguilas: estado.anguilas || {} }); });
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
app.get('/api/debug-scrapers', async (req, res) => {
  const r = await diagnosticarFuentes();
  res.json(r);
});
app.get('/', (req, res) => res.json({ version: 'v9.17-RODEAN-TODAS', status: 'ok', fecha_rd: fechaRD() }));

// ── ENDPOINTS BACKFILL RESTAURADOS ─────────────────────────────────────────
app.get('/api/backfill-enloteria', (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) return res.status(400).json({ error: 'Faltan desde/hasta. Ejemplo: ?desde=2026-08-05&hasta=2026-08-17' });
  if (estadoBackfill.activo) return res.status(409).json({ error: 'Ya hay un backfill corriendo' });
  const guardar = req.query.guardar === '1';
  ejecutarBackfill(desde, hasta, guardar);
  res.json({ iniciado: true, desde, hasta, modo: guardar ? 'GUARDAR EN SUPABASE' : 'SIMULACION' });
});

// Backfill específico para juegos especiales (Kino, Pega 3 Más, Loto, etc.)
// que la función general no cubre bien porque busca por quiniela.
// Uso: /api/backfill-especiales?desde=2026-08-01&hasta=2026-09-22&guardar=1
app.get('/api/backfill-especiales', async (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) return res.status(400).json({ error: 'Faltan desde/hasta' });
  if (estadoBackfill.activo) return res.status(409).json({ error: 'Ya hay un backfill corriendo' });
  const guardar = req.query.guardar === '1';
  estadoBackfill = { activo: true, inicio: new Date().toISOString(), log: [], resumen: null };
  res.json({ iniciado: true, desde, hasta, modo: guardar ? 'GUARDAR' : 'SIMULACION' });

  const pausa = ms => new Promise(r => setTimeout(r, ms));
  const logBF = msg => { console.log(`[BF-ESP] ${msg}`); estadoBackfill.log.push(msg); };

  try {
    const fechas = [];
    let d = new Date(desde + 'T12:00:00Z');
    const fin = new Date(hasta + 'T12:00:00Z');
    while (d <= fin && fechas.length < 60) { fechas.push(d.toISOString().slice(0,10)); d.setUTCDate(d.getUTCDate()+1); }

    // Cargar historial existente de Supabase
    const existentes = {};
    if (SUPABASE_ACTIVO) {
      try {
        const r = await axios.get(`${SUPABASE_URL}/rest/v1/historico?select=fecha,sorteos,cuartetas,especiales&fecha=gte.${fechas[0]}&fecha=lte.${fechas[fechas.length-1]}`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, timeout: 15000 });
        for (const row of r.data) existentes[row.fecha] = row;
        logBF(`Supabase: ${r.data.length} días ya existen en rango`);
      } catch(e) { logBF(`AVISO Supabase: ${e.message}`); }
    }

    const resumen = [];
    for (const [slug, clave] of Object.entries(ENLOTERIA_ESPECIAL_SLUGS)) {
      const plantilla = crearJuegosEspeciales()[clave];
      if (!plantilla) continue;
      logBF(`Procesando ${clave} (${slug}) — ${fechas.length} fechas`);
      for (const f of fechas) {
        try {
          const res2 = await axios.get(`https://enloteria.com/resultados-${slug}-${f}`, { headers: HEADERS, timeout: 15000 });
          const nums = extraerResultadoHoyEnloteria(res2.data, plantilla.cant, f);
          if (nums.length === plantilla.cant) {
            const base = existentes[f] || { fecha: f, sorteos: crearSorteos(), cuartetas: crearCuartetas(), especiales: crearJuegosEspeciales() };
            base.especiales = base.especiales || crearJuegosEspeciales();
            if (!base.especiales[clave] || base.especiales[clave].numeros.length < plantilla.cant) {
              base.especiales[clave] = { ...plantilla, numeros: nums, estado: 'disponible' };
              existentes[f] = base;
              if (guardar) await guardarEnSupabase(base);
              logBF(`${f} ${clave}: ${nums.join('-')} ${guardar ? '→ GUARDADO' : '(simulación)'}`);
              resumen.push({ fecha: f, clave, nums });
            }
          }
        } catch(e) {}
        await pausa(1200);
      }
    }
    logBF(`✅ Backfill especiales terminado. ${resumen.length} registros recuperados.`);
    estadoBackfill.resumen = resumen;
  } catch(e) { logBF(`❌ ERROR: ${e.message}`); }
  finally { estadoBackfill.activo = false; }
});
app.get('/api/backfill-estado', (req, res) => res.json(estadoBackfill));

// Backfill de La Cuarteta y Pega 3 Más desde Wuloteria.
// Cada página de detalle trae los últimos ~10 sorteos (no tiene URLs por fecha),
// así que esto rellena aprox. los últimos 10 días.
// Uso: /api/backfill-wuloteria?guardar=1   (sin guardar=1 es simulación)
app.get('/api/backfill-wuloteria', async (req, res) => {
  if (estadoBackfill.activo) return res.status(409).json({ error: 'Ya hay un backfill corriendo' });
  const guardar = req.query.guardar === '1';
  estadoBackfill = { activo: true, inicio: new Date().toISOString(), log: [], resumen: null };
  res.json({ iniciado: true, fuente: 'wuloteria', modo: guardar ? 'GUARDAR' : 'SIMULACION' });

  const logBF = msg => { console.log(`[BF-WU] ${msg}`); estadoBackfill.log.push(msg); };
  const pausa = ms => new Promise(r => setTimeout(r, ms));
  try {
    const hoy = fechaRD();
    // 1. Juntar resultados por fecha
    const porFecha = {}; // { fecha: [{slug, numeros}] }
    const agregar = (r) => { (porFecha[r.fecha] = porFecha[r.fecha] || []).push(r); };
    try {
      const r = await axios.get('https://wuloteria.com/', { headers: HEADERS, timeout: 15000 });
      parsearWuloteria(r.data).filter(x => WULOTERIA_PAGINAS[x.slug]).forEach(agregar);
      logBF('Portada leída');
    } catch (e) { logBF(`AVISO portada: ${e.response?.status || e.message}`); }
    for (const [slug, ruta] of Object.entries(WULOTERIA_PAGINAS)) {
      try {
        const r = await axios.get(`https://wuloteria.com/loto/${ruta}`, { headers: HEADERS, timeout: 15000 });
        let encontrados = parsearHistorialWuloteria(r.data).map(x => ({ ...x, slug }));
        if (!encontrados.length) encontrados = parsearWuloteria(r.data).filter(x => x.slug === slug);
        encontrados.forEach(agregar);
        logBF(`${slug}: ${encontrados.length} sorteos en la página`);
      } catch (e) { logBF(`AVISO ${slug}: ${e.response?.status || e.message}`); }
      await pausa(1200);
    }
    const fechas = Object.keys(porFecha).filter(f => f < hoy).sort();
    if (!fechas.length) { logBF('Nada que rellenar (solo había resultados de hoy, o ninguno).'); return; }

    // 2. Cargar esos días de Supabase para no pisar lo que ya existe
    const existentes = {};
    if (SUPABASE_ACTIVO) {
      try {
        const r = await axios.get(`${SUPABASE_URL}/rest/v1/historico?select=fecha,sorteos,cuartetas,especiales&fecha=gte.${fechas[0]}&fecha=lte.${fechas[fechas.length-1]}`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, timeout: 15000 });
        for (const row of r.data) existentes[row.fecha] = row;
      } catch (e) { logBF(`AVISO Supabase: ${e.message}`); }
    }

    // 3. Rellenar solo lo que falta
    const resumen = [];
    for (const f of fechas) {
      const base = existentes[f] || estado.historico.find(d => d.fecha === f) ||
                   { fecha: f, sorteos: crearSorteos(), cuartetas: crearCuartetas(), especiales: crearJuegosEspeciales() };
      base.cuartetas = base.cuartetas || crearCuartetas();
      base.especiales = base.especiales || crearJuegosEspeciales();
      let cambio = false;
      for (const r of porFecha[f]) {
        const kc = WULOTERIA_CUARTETAS[r.slug];
        if (kc && r.numeros.length === 4) {
          const c = base.cuartetas[kc] || crearCuartetas()[kc];
          if (!c.numeros || c.numeros.length < 4) {
            base.cuartetas[kc] = { ...c, numeros: r.numeros, estado: 'disponible' };
            cambio = true; resumen.push({ fecha: f, clave: kc, nums: r.numeros });
            logBF(`${f} ${kc}: ${r.numeros.join('-')}`);
          }
          continue;
        }
        const ke = WULOTERIA_ESPECIALES[r.slug];
        if (ke) {
          const plantilla = crearJuegosEspeciales()[ke];
          const j = base.especiales[ke] || plantilla;
          if (r.numeros.length === plantilla.cant && (!j.numeros || j.numeros.length < plantilla.cant)) {
            base.especiales[ke] = { ...plantilla, ...j, numeros: r.numeros, estado: 'disponible' };
            cambio = true; resumen.push({ fecha: f, clave: ke, nums: r.numeros });
            logBF(`${f} ${ke}: ${r.numeros.join('-')}`);
          }
        }
      }
      if (cambio && guardar) {
        if (!base.sorteos) base.sorteos = crearSorteos();
        await guardarEnSupabase(base);
        const idx = estado.historico.findIndex(d => d.fecha === f);
        if (idx >= 0) estado.historico[idx] = { ...estado.historico[idx], cuartetas: base.cuartetas, especiales: base.especiales };
      }
    }
    if (guardar) guardarEnDisco();
    logBF(`✅ Backfill Wuloteria terminado. ${resumen.length} registros ${guardar ? 'guardados' : '(simulación)'}.`);
    estadoBackfill.resumen = resumen;
  } catch (e) { logBF(`❌ ERROR: ${e.message}`); }
  finally { estadoBackfill.activo = false; }
});

// ── JUGADAS PERSONALES → SUPABASE + NOTIFICACIÓN TELEGRAM ─────────────────
// Guarda tickets del usuario en Supabase para poder notificarle si gana/pierde.
// El frontend llama POST /api/jugada cuando agrega una jugada.
async function guardarJugadaSupabase(jugada) {
  if (!SUPABASE_ACTIVO) return false;
  try {
    await axios.post(`${SUPABASE_URL}/rest/v1/jugadas`,
      jugada,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, timeout: 8000 }
    );
    return true;
  } catch(e) { return false; }
}

async function cargarJugadasPendientes() {
  if (!SUPABASE_ACTIVO) return [];
  try {
    const hoy = fechaRD();
    const ayer = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/jugadas?notificado=eq.false&fecha=gte.${ayer}&select=*`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, timeout: 8000 }
    );
    return res.data || [];
  } catch(e) { return []; }
}

async function marcarJugadaNotificada(id) {
  if (!SUPABASE_ACTIVO) return;
  try {
    await axios.patch(`${SUPABASE_URL}/rest/v1/jugadas?id=eq.${id}`,
      { notificado: true },
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }, timeout: 8000 }
    );
  } catch(e) {}
}

function evaluarJugadaServidor(jugada, sorteoActual) {
  const real = sorteoActual.numeros || [];
  if (!real.length) return null;
  const tipo = jugada.tipo;
  const nums = jugada.numeros;
  let aciertos = 0, gano = false, detalle = '';

  if (['punto','pale','superpale','tripleta','adyacente','repetitivo'].includes(tipo)) {
    aciertos = nums.filter(n => real.includes(n)).length;
    const minimo = { punto: 1, pale: 2, superpale: 3, tripleta: 3, adyacente: 2, repetitivo: 1 }[tipo] || 1;
    gano = aciertos >= minimo;
    detalle = `${aciertos} de ${nums.length} aparecieron`;
  } else if (jugada.clave === 'superkino') {
    aciertos = nums.filter(n => real.includes(n)).length;
    gano = aciertos === 0 || aciertos >= 5;
    detalle = aciertos === 0 ? 'Premio 0 aciertos 🎯' : aciertos >= 10 ? 'JACKPOT 🏆' : aciertos >= 5 ? `Premio ${aciertos} aciertos 🎯` : `${aciertos} aciertos (sin premio)`;
  } else if (jugada.clave === 'loto' || jugada.clave === 'lotomas') {
    aciertos = nums.filter(n => real.includes(n)).length;
    gano = aciertos >= 3;
    detalle = `${aciertos} de ${nums.length} coincidieron`;
  } else if (jugada.clave === 'pega3mas') {
    aciertos = nums.filter((n, i) => real[i] === n).length;
    gano = aciertos === 3;
    detalle = `${aciertos} en posición exacta`;
  } else if (jugada.clave === 'loto5' || jugada.clave === 'lotopoolleidsa') {
    aciertos = nums.filter(n => real.slice(0, 5).includes(n)).length;
    gano = aciertos >= 3;
    detalle = `${aciertos} de 5`;
  } else if (jugada.clave === 'lotopoolreal') {
    aciertos = nums.filter(n => real.slice(0, 4).includes(n)).length;
    gano = aciertos >= 2;
    detalle = `${aciertos} de 4${aciertos === 1 ? ' (solo devuelve lo jugado)' : ''}`;
  } else if (jugada.clave === 'megachance') {
    aciertos = nums.filter(n => real.includes(n)).length;
    gano = aciertos >= 2;
    detalle = `${aciertos} de 5`;
  } else if (jugada.clave === 'pega4king') {
    aciertos = nums.filter(n => real.includes(n)).length;
    gano = aciertos >= 3;
    detalle = `${aciertos} de 4`;
  } else if (jugada.clave === 'quemaito') {
    aciertos = nums.filter(n => real.includes(n)).length;
    gano = aciertos >= 1;
    detalle = gano ? '¡Acertó!' : 'No acertó';
  } else {
    aciertos = nums.filter(n => real.includes(n)).length;
    gano = aciertos >= 1;
    detalle = `${aciertos} coincidencia(s)`;
  }
  return { gano, aciertos, detalle, real };
}

async function notificarJugadasPersonales() {
  if (!TG_ACTIVO) return;
  const pendientes = await cargarJugadasPendientes();
  if (!pendientes.length) return;
  const f2 = n => String(n).padStart(2, '0');
  const avisos = [];

  for (const j of pendientes) {
    const sorteo = (estado.sorteos[j.clave] || estado.especiales[j.clave] || estado.cuartetas[j.clave] || (estado.anguilas || {})[j.clave]);
    if (!sorteo || !sorteo.numeros || sorteo.numeros.length === 0) continue;
    if (estado.fecha !== j.fecha) continue;
    if (j.tipo === 'superpale' && j.clave2) {
      // Súper Palé: 1er premio de cada lotería, en cualquier orden
      const s2 = estado.sorteos[j.clave2];
      if (!s2 || !s2.numeros || s2.numeros.length < 3 || sorteo.numeros.length < 3) continue;
      const primeros = [Number(sorteo.numeros[0]), Number(s2.numeros[0])];
      const m = emparejar(j.numeros.map(Number), primeros);
      await marcarJugadaNotificada(j.id);
      avisos.push(`${m === 2 ? '🎯' : '❌'} <b>Súper Palé ${sorteo.nombre} + ${s2.nombre}</b>\n     Jugaste: <b>${j.numeros.map(f2).join('-')}</b> · 1ros premios: <b>${primeros.map(f2).join('-')}</b>\n     ${m} de 2 · ${m === 2 ? '¡GANASTE! 🏆' : 'No acertaste'}`);
      continue;
    }
    const r = evaluarJugadaServidor(j, sorteo);
    if (!r) continue;
    await marcarJugadaNotificada(j.id);
    const nums = j.numeros.map(f2).join('-');
    const real = r.real.map(f2).join('-');
    const emoji = r.gano ? '🎯' : '❌';
    avisos.push(`${emoji} <b>${sorteo.nombre}</b>\n     Jugaste: <b>${nums}</b> · Salió: <b>${real}</b>\n     ${r.detalle} · ${r.gano ? '¡GANASTE! 🏆' : 'No acertaste'}`);
  }

  if (avisos.length) {
    await enviarTelegram(`🎟️ <b>RESULTADO DE TUS JUGADAS</b> — ${fechaRD()}\n\n` + avisos.join('\n\n'));
  }
}

// 🗑 borrar una jugada SUYA (origen manual) también del servidor, para que no lleguen avisos de Telegram
async function borrarManuales({ clave, fecha, numeros, clave2 }) {
  let q = `origen=eq.manual&clave=eq.${encodeURIComponent(clave)}&fecha=eq.${fecha}`;
  if (clave2) q += `&clave2=eq.${encodeURIComponent(clave2)}`;
  if (Array.isArray(numeros) && numeros.length) { const arr = encodeURIComponent(JSON.stringify(numeros.map(Number))); q += `&numeros=cs.${arr}&numeros=cd.${arr}`; }
  const r = await axios.delete(`${SUPABASE_URL}/rest/v1/jugadas?${q}`, { headers: { ...SB_HEADERS(), Prefer: 'return=representation' }, timeout: 15000 });
  return (r.data || []).length;
}
app.post('/api/jugada/borrar', async (req, res) => {
  const j = req.body || {};
  if (!SUPABASE_ACTIVO || !j.clave || !j.fecha || !Array.isArray(j.numeros) || !j.numeros.length) return res.status(400).json({ error: 'Faltan campos' });
  try { res.json({ ok: true, borradas: await borrarManuales(j) }); } catch (e) { res.status(500).json({ error: e.message }); }
});
// ver / limpiar las jugadas suyas guardadas en el servidor de un día: ?fecha=YYYY-MM-DD[&clave=superkino][&borrar=1]
app.get('/api/jugadas-mias', async (req, res) => {
  const fecha = req.query.fecha || fechaRD(); const clave = req.query.clave;
  try {
    if (req.query.borrar === '1') { if (!clave) return res.status(400).json({ error: 'Para borrar ponga también &clave=' }); return res.json({ fecha, clave, borradas: await borrarManuales({ clave, fecha }) }); }
    const filas = await leerJugadas(`origen=eq.manual&fecha=eq.${fecha}${clave ? `&clave=eq.${clave}` : ''}&select=clave,tipo,numeros,monto,creado`);
    res.json({ fecha, total: filas.length, jugadas: filas });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/jugada', async (req, res) => {
  const j = req.body;
  if (!j || !j.clave || !j.numeros || !j.fecha) return res.status(400).json({ error: 'Faltan campos' });
  const jugada = { id: `${Date.now()}-${Math.random().toString(36).slice(2,6)}`, clave: j.clave, clave2: j.clave2 || null, fecha: j.fecha, tipo: j.tipo || 'especial', numeros: j.numeros, monto: j.monto || null, notificado: false, creado: new Date().toISOString() };
  const ok = await guardarJugadaSupabase(jugada);
  res.json({ ok, id: jugada.id });
});



// ════════════════════════════════════════════════════════════════════════════
// ── JUGADAS AUTOMÁTICAS (para auditoría) ────────────────────────────────────
// Cada día, ANTES de cada sorteo (ventana de 75 min), el servidor registra en
// la tabla `jugadas` de Supabase:
//   • origen 'auto'    → lo que predice el sistema
//   • origen 'control' → la misma cantidad de jugadas AL AZAR, mismo tipo y
//                        misma lotería. Sin este grupo no se puede saber si el
//                        sistema le gana al azar o fue suerte.
// Después del sorteo las evalúa solo (aciertos, si ganó y el premio en
// "unidades": cuánto paga por cada RD$1 jugado) y guarda todo.
// Las automáticas no se pueden borrar desde el dashboard: así nadie quita las
// perdedoras y la auditoría queda limpia.
// ════════════════════════════════════════════════════════════════════════════
const AUTO = {
  activo: process.env.AUTO_JUGADAS !== '0',
  // Grupo FIJO de quinielas (no se re-escoge cada día; ver explicación arriba).
  // Se puede cambiar con la variable de entorno AUTO_LOTERIAS=leidsa,real_t,...
  loterias: (process.env.AUTO_LOTERIAS || 'laprimera,real_t,gana_mas,loteka,leidsa,nacional').split(',').map(s => s.trim()).filter(Boolean),
  superpales: [['real_t', 'gana_mas'], ['leidsa', 'nacional']],
  especiales: ['superkino', 'pega3mas', 'megachance', 'quemaito', 'loto', 'loto5', 'lotopoolreal', 'lotopoolleidsa'], // Loto Más no es un ticket aparte: son los bolos extra del Loto
  cuartetas: ['cuarteta_m', 'cuarteta_md', 'cuarteta_t', 'cuarteta_n'],
  ticketsEspecial: 3,           // 3 predichos + 3 de control por juego especial
  ventanaMin: 75,               // se generan entre 75 y 0 minutos antes del sorteo
  diasLoto: ['Wed', 'Sat'],     // Loto / Loto Más solo miércoles y sábado
  horasDomingo: { leidsa: '3:55 PM', pega3mas: '3:55 PM', superkino: '3:55 PM', nacional: '6:00 PM', lotopoolleidsa: '3:55 PM' },
  // Pagos por cada RD$1 (los más comunes en bancas de RD; AJUSTAR a su banca)
  pagos: {
    punto: [60, 8, 4],                                 // 1ra, 2da, 3ra
    pale: { '0-1': 1000, '0-2': 1000, '1-2': 100 },    // 1ra+2da, 1ra+3ra, 2da+3ra
    tripleta: { 3: 20000, 2: 100 },                    // los 3 / 2 de los 3
    superpale: 2000,                                   // 1ra de cada lotería
  },
};
const AUTO_TICKETS = {
  superkino:  { min: 1, max: 80, n: 10 },
  pega3mas:   { min: 0, max: 50, n: 3, posicional: true },
  loto:       { min: 1, max: 40, n: 6 },
  lotomas:    { min: 1, max: 40, n: 7 },
  megachance: { min: 0, max: 99, n: 5 },
  quemaito:   { min: 0, max: 99, n: 1 },
  loto5:          { min: 1, max: 38, n: 5, principales: 5 }, // el 6to número es el bolo 5+ (1-10), no se juega en el ticket
  lotopoolreal:   { min: 0, max: 99, n: 4 },
  lotopoolleidsa: { min: 0, max: 31, n: 5 },
  cuarteta:   { min: 0, max: 99, n: 4 },
};
// Probabilidad exacta de ganar AL AZAR con 1 jugada (quiniela: 3 bolos 00-99
// independientes) y retorno esperado por cada RD$1 con la tabla de pagos de
// arriba. Se calcula recorriendo los 1,000,000 resultados posibles.
const AUTO_TEORICO = (() => {
  const P = AUTO.pagos; const acc = { punto: [0, 0], pale: [0, 0], tripleta: [0, 0] };
  for (let a = 0; a < 100; a++) for (let b = 0; b < 100; b++) for (let c = 0; c < 100; c++) {
    const r = [a, b, c];
    const pu = r.reduce((s, x, i) => s + (x === 0 ? P.punto[i] : 0), 0);
    let pa = 0; for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) if (i !== k && r[i] === 0 && r[k] === 1) pa = Math.max(pa, P.pale[[i, k].sort().join('-')] || 0);
    const resto = [...r]; let m = 0; for (const x of [0, 1, 2]) { const j = resto.indexOf(x); if (j >= 0) { m++; resto.splice(j, 1); } }
    const tr = P.tripleta[m] || 0;
    if (pu) { acc.punto[0]++; acc.punto[1] += pu; }
    if (pa) { acc.pale[0]++; acc.pale[1] += pa; }
    if (tr) { acc.tripleta[0]++; acc.tripleta[1] += tr; }
  }
  const out = {};
  for (const [k, [n, s]] of Object.entries(acc)) out[k] = { prob_pct: +(100 * n / 1e6).toFixed(4), retorno: +(s / 1e6).toFixed(3) };
  out.superpale = { prob_pct: +(100 * 2 / 1e4).toFixed(4), retorno: +(P.superpale * 2 / 1e4).toFixed(3) };
  return out;
})();

let autoPlan = { fecha: null, ultimoError: null, generadas: 0, evaluadas: 0 };
const autoHechos = new Set();
let autoHechosFecha = null;
let autoResumenEnviado = null;

const SB_HEADERS = () => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' });

function nuevaJugadaAuto(base) {
  return {
    id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    monto: 1, notificado: true, evaluado: false, creado: new Date().toISOString(),
    clave2: null, contexto: null, ...base,
  };
}
function aleatorios(n, min, max, distintos = true) {
  const out = [];
  while (out.length < n) {
    const x = min + Math.floor(Math.random() * (max - min + 1));
    if (distintos && out.includes(x)) continue;
    out.push(x);
  }
  return out;
}
function serieDe(tipo, clave) {
  return [...estado.historico]
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    .map(d => d[tipo] && d[tipo][clave] && d[tipo][clave].numeros)
    .filter(n => Array.isArray(n) && n.length)
    .map(n => n.map(Number));
}
function rangoReal(cfg, serie) {
  let max = cfg.max;
  if (cfg.max === 80) for (const nums of serie) for (const n of nums) if (n > max && n <= 99) max = n; // el Kino trae 81-84
  return { min: cfg.min, max };
}
function atrasadosDe(serie, min, max) {
  const ult = {}; serie.forEach((nums, i) => nums.forEach(n => (ult[n] = i)));
  const r = []; for (let n = min; n <= max; n++) r.push(n);
  return r.sort((a, b) => (ult[a] ?? -1) - (ult[b] ?? -1) || a - b);
}
function rankingFrecuencia(serie, min, max) {
  const sc = {};
  serie.forEach((nums, i) => { const w = 1 + i / Math.max(1, serie.length); nums.forEach(n => (sc[n] = (sc[n] || 0) + w)); });
  const r = []; for (let n = min; n <= max; n++) r.push(n);
  return r.sort((a, b) => (sc[b] || 0) - (sc[a] || 0) || a - b);
}
function repetidosDelDia() {
  const c = {};
  for (const s of Object.values(estado.sorteos)) {
    if (!s.numeros || s.numeros.length < 3) continue;
    for (const n of new Set(s.numeros.map(Number))) c[n] = (c[n] || 0) + 1;
  }
  return Object.entries(c).filter(([, v]) => v >= 2).sort((a, b) => b[1] - a[1]).map(([n]) => +n);
}
function numerosAnguilaHoy() {
  const out = [];
  for (const k of ['anguila_m', 'anguila_t', 'anguila_n', 'anguila_nn']) {
    const s = estado.sorteos[k]; if (s && s.numeros) out.push(...s.numeros.map(Number));
  }
  for (const c of Object.values(estado.cuartetas)) if (c.numeros) out.push(...c.numeros.map(Number));
  return [...new Set(out)];
}
function completar(base, ranking, n, min, max) {
  const out = [];
  for (const x of [...base, ...ranking]) { if (x >= min && x <= max && !out.includes(x)) out.push(x); if (out.length === n) break; }
  return out;
}
// Pone en el estado la hora real de hoy (los domingos LEIDSA y Nacional juegan temprano),
// así las predicciones, los avisos y la app muestran la hora correcta.
function aplicarHorasDelDia() {
  const dom = diaSemanaRD() === 'Sun';
  const baseS = crearSorteos(), baseE = crearJuegosEspeciales();
  for (const [k, h] of Object.entries(AUTO.horasDomingo)) {
    const obj = estado.sorteos[k] || estado.especiales[k];
    const base = baseS[k] || baseE[k];
    if (obj && base) obj.hora = dom ? h : base.hora;
  }
}
function horaDeHoy(clave, horaBase) {
  if (diaSemanaRD() === 'Sun' && AUTO.horasDomingo[clave]) return AUTO.horasDomingo[clave];
  return horaBase;
}
function enVentana(hora) {
  const m = horaTextoAMinutos(hora); if (m === null) return false;
  const falta = m - minutosActualesRD();
  return falta >= 0 && falta <= AUTO.ventanaMin;
}

// ── Generadores ──────────────────────────────────────────────────────────────
function generarQuinielaAuto(clave, hoy, hora) {
  const pred = calcularPrediccionConContextoDelDia(clave);
  if (!pred || pred.diasHistoricos < 5 || pred.top3.length < 3) return [];
  const [a, b, c] = pred.top3;
  const rnd = aleatorios(3, 0, 99);
  const base = { clave, fecha: hoy, hora_sorteo: hora, grupo: `q|${clave}`, generado_rd: horaRD() };
  const ctx = { top3: pred.top3, repetidos_hoy: (pred.contextoHoy || []).slice(0, 8).map(x => x.numero), dias_hist: pred.diasHistoricos };
  return [
    nuevaJugadaAuto({ ...base, origen: 'auto', metodo: 'radar5', tipo: 'punto', numeros: [a], contexto: ctx }),
    nuevaJugadaAuto({ ...base, origen: 'auto', metodo: 'radar5', tipo: 'pale', numeros: [a, b], contexto: ctx }),
    nuevaJugadaAuto({ ...base, origen: 'auto', metodo: 'radar5', tipo: 'tripleta', numeros: [a, b, c], contexto: ctx }),
    nuevaJugadaAuto({ ...base, origen: 'control', metodo: 'aleatorio', tipo: 'punto', numeros: [rnd[0]] }),
    nuevaJugadaAuto({ ...base, origen: 'control', metodo: 'aleatorio', tipo: 'pale', numeros: rnd.slice(0, 2) }),
    nuevaJugadaAuto({ ...base, origen: 'control', metodo: 'aleatorio', tipo: 'tripleta', numeros: rnd }),
  ];
}
function generarSuperpaleAuto(c1, c2, hoy, hora) {
  const p1 = calcularPrediccionConContextoDelDia(c1), p2 = calcularPrediccionConContextoDelDia(c2);
  if (!p1 || !p2 || p1.diasHistoricos < 5 || p2.diasHistoricos < 5 || p1.top1 == null || p2.top1 == null) return [];
  const base = { clave: c1, clave2: c2, fecha: hoy, tipo: 'superpale', hora_sorteo: hora, grupo: `sp|${c1}+${c2}`, generado_rd: horaRD() };
  return [
    nuevaJugadaAuto({ ...base, origen: 'auto', metodo: 'radar5', numeros: [p1.top1, p2.top1] }),
    nuevaJugadaAuto({ ...base, origen: 'control', metodo: 'aleatorio', numeros: aleatorios(2, 0, 99, false) }),
  ];
}
function generarEspecialAuto(clave, hoy, hora) {
  const cfg = AUTO_TICKETS[clave];
  const serie = serieDe('especiales', clave).map(n => (cfg && cfg.principales ? n.slice(0, cfg.principales) : n));
  if (!cfg || serie.length < 3) return { jugadas: [], motivo: `sin historial suficiente (${serie.length} sorteos)` };
  const { min, max } = rangoReal(cfg, serie);
  const base = { clave, fecha: hoy, hora_sorteo: hora, grupo: `e|${clave}`, generado_rd: horaRD(), tipo: 'especial' };
  const tickets = []; // [{metodo, numeros}]
  if (cfg.posicional) {
    const rk = [0, 1, 2].map(p => rankingFrecuencia(serie.filter(s => s[p] !== undefined).map(s => [s[p]]), min, max));
    for (let t = 0; t < AUTO.ticketsEspecial; t++) tickets.push({ metodo: `posicional-${t + 1}`, numeros: rk.map(r => r[t]) });
  } else {
    const rank = rankingFrecuencia(serie, min, max);
    const ordenar = a => (cfg.n > 1 ? [...a].sort((x, y) => x - y) : a);
    if (clave === 'superkino') {
      tickets.push({ metodo: 'kino-repetidos', numeros: ordenar(completar(repetidosDelDia(), rank, cfg.n, min, max)) });
      tickets.push({ metodo: 'kino-anguila', numeros: ordenar(completar(numerosAnguilaHoy(), rank, cfg.n, min, max)) });
      tickets.push({ metodo: 'kino-historico', numeros: ordenar(rank.slice(0, cfg.n)) });
    } else {
      tickets.push({ metodo: 'frecuencia', numeros: ordenar(rank.slice(0, cfg.n)) });
      // 'repetidos del día' es idea del Kino; aquí se usan los atrasados (los que más tiempo llevan sin salir)
      tickets.push({ metodo: 'atrasados', numeros: ordenar(atrasadosDe(serie, min, max).slice(0, cfg.n)) });
      tickets.push({ metodo: 'frecuencia-2', numeros: ordenar(rank.slice(cfg.n, cfg.n * 2)) });
    }
  }
  // Evitar tickets idénticos (pasa cuando no hay repetidos hoy)
  const vistos = new Set(); const rank2 = rankingFrecuencia(serie, min, max); let extra = cfg.n * 2;
  for (const t of tickets) {
    while (vistos.has(t.numeros.join(',')) && extra < rank2.length) { t.numeros = [...t.numeros.slice(0, -1), rank2[extra++]]; if (cfg.n > 1 && !cfg.posicional) t.numeros.sort((x, y) => x - y); }
    vistos.add(t.numeros.join(','));
  }
  const jugadas = tickets.map(t => nuevaJugadaAuto({ ...base, origen: 'auto', metodo: t.metodo, numeros: t.numeros }));
  for (let i = 0; i < tickets.length; i++) {
    let nums = aleatorios(cfg.n, min, max, !cfg.posicional);
    if (cfg.n > 1 && !cfg.posicional) nums.sort((x, y) => x - y);
    jugadas.push(nuevaJugadaAuto({ ...base, origen: 'control', metodo: clave === 'superkino' ? 'kino-aleatorio' : 'aleatorio', numeros: nums }));
  }
  return { jugadas };
}
function generarCuartetaAuto(clave, hoy, hora) {
  const cfg = AUTO_TICKETS.cuarteta;
  const serie = serieDe('cuartetas', clave);
  if (serie.length < 3) return { jugadas: [], motivo: `sin historial suficiente (${serie.length} sorteos)` };
  const rank = rankingFrecuencia(serie, cfg.min, cfg.max);
  const pos = {}; rank.forEach((n, i) => (pos[n] = i));
  const anguila = numerosAnguilaHoy().filter(n => n >= cfg.min && n <= cfg.max).sort((a, b) => pos[a] - pos[b]).slice(0, 2);
  const base = { clave, fecha: hoy, hora_sorteo: hora, grupo: `c|${clave}`, generado_rd: horaRD(), tipo: 'cuarteta' };
  return { jugadas: [
    nuevaJugadaAuto({ ...base, origen: 'auto', metodo: 'frecuencia+anguila', numeros: completar(anguila, rank, 4, cfg.min, cfg.max).sort((a, b) => a - b), contexto: { anguila_hoy: anguila } }),
    nuevaJugadaAuto({ ...base, origen: 'control', metodo: 'aleatorio', numeros: aleatorios(4, cfg.min, cfg.max).sort((a, b) => a - b) }),
  ] };
}

// ── Supabase ─────────────────────────────────────────────────────────────────
async function insertarJugadas(filas) {
  if (!SUPABASE_ACTIVO || !filas.length) return false;
  try {
    await axios.post(`${SUPABASE_URL}/rest/v1/jugadas`, filas, { headers: { ...SB_HEADERS(), Prefer: 'return=minimal' }, timeout: 15000 });
    autoPlan.ultimoError = null;
    return true;
  } catch (e) {
    autoPlan.ultimoError = `insertar: ${e.response?.status || ''} ${JSON.stringify(e.response?.data || e.message).slice(0, 300)}`;
    console.error('⚠️ [AUTO]', autoPlan.ultimoError);
    return false;
  }
}
async function upsertJugadas(filas) {
  if (!SUPABASE_ACTIVO || !filas.length) return false;
  try {
    await axios.post(`${SUPABASE_URL}/rest/v1/jugadas?on_conflict=id`, filas, { headers: { ...SB_HEADERS(), Prefer: 'resolution=merge-duplicates,return=minimal' }, timeout: 15000 });
    return true;
  } catch (e) {
    autoPlan.ultimoError = `actualizar: ${e.response?.status || ''} ${JSON.stringify(e.response?.data || e.message).slice(0, 300)}`;
    console.error('⚠️ [AUTO]', autoPlan.ultimoError);
    return false;
  }
}
async function leerJugadas(query) {
  const r = await axios.get(`${SUPABASE_URL}/rest/v1/jugadas?${query}`, { headers: SB_HEADERS(), timeout: 15000 });
  return r.data || [];
}

// ── MENSAJES YA ENVIADOS (sobreviven reinicios y deploys) ───────────────────
// Render borra la memoria y el disco en cada reinicio, así que se anota en Supabase
// (tabla jugadas, origen 'sistema': ninguna consulta de jugadas ni auditoría los lee).
const enviadosHoy = new Set();
let enviadosFecha = null;
async function cargarEnviados() {
  const hoy = fechaRD();
  if (enviadosFecha === hoy) return;
  enviadosHoy.clear(); enviadosFecha = hoy;
  if (!SUPABASE_ACTIVO) return;
  try { (await leerJugadas(`fecha=eq.${hoy}&origen=eq.sistema&select=grupo`)).forEach(f => f.grupo && enviadosHoy.add(f.grupo)); }
  catch (e) { console.log('[ENVIADOS] no se pudo leer:', e.message); }
}
function yaEnviado(tag) { return enviadosFecha === fechaRD() && enviadosHoy.has(tag); }
async function marcarEnviado(...tags) {
  const hoy = fechaRD();
  if (enviadosFecha !== hoy) { enviadosHoy.clear(); enviadosFecha = hoy; }
  tags = tags.flat().filter(Boolean);
  if (!tags.length) return;
  tags.forEach(t => enviadosHoy.add(t));
  if (!SUPABASE_ACTIVO) return;
  await upsertJugadas(tags.map(tag => ({ id: `sys|${hoy}|${tag}`, clave: 'sistema', fecha: hoy, tipo: 'sistema', numeros: [], origen: 'sistema', grupo: tag, notificado: true, evaluado: true })));
}
async function asegurarAutoHechos(hoy) {
  if (autoHechosFecha === hoy) return true;
  try {
    const filas = await leerJugadas(`fecha=eq.${hoy}&origen=in.(auto,control)&select=grupo`);
    autoHechos.clear();
    for (const f of filas) if (f.grupo) autoHechos.add(f.grupo);
    autoHechosFecha = hoy;
    return true;
  } catch (e) {
    autoPlan.ultimoError = `leer: ${e.response?.status || ''} ${JSON.stringify(e.response?.data || e.message).slice(0, 300)}`;
    return false;
  }
}

// ── Generación (se llama en cada sincronizar) ───────────────────────────────
async function generarJugadasAutomaticas() {
  if (!AUTO.activo || !SUPABASE_ACTIVO) return;
  const hoy = fechaRD();
  if (estado.fecha !== hoy) return;
  if (!(await asegurarAutoHechos(hoy))) return;
  autoPlan.fecha = hoy;
  const nuevas = [], grupos = [], avisos = [];
  const f2 = n => String(n).padStart(2, '0');
  const pendiente = (s, min) => !s || !s.numeros || s.numeros.length < min;

  for (const clave of AUTO.loterias) {
    const s = estado.sorteos[clave]; const g = `q|${clave}`;
    if (!s || autoHechos.has(g) || !pendiente(s, 3)) continue;
    const hora = horaDeHoy(clave, s.hora);
    if (!enVentana(hora)) continue;
    const js = generarQuinielaAuto(clave, hoy, hora);
    grupos.push(g); nuevas.push(...js);
    const a = js.filter(j => j.origen === 'auto');
    if (a.length) avisos.push(`🎯 <b>${s.nombre}</b> (${hora})\n     Punto <b>${f2(a[0].numeros[0])}</b> · Palé <b>${a[1].numeros.map(f2).join('-')}</b> · Tripleta <b>${a[2].numeros.map(f2).join('-')}</b>`);
  }
  for (const [c1, c2] of AUTO.superpales) {
    const s1 = estado.sorteos[c1], s2 = estado.sorteos[c2]; const g = `sp|${c1}+${c2}`;
    if (!s1 || !s2 || autoHechos.has(g) || !pendiente(s1, 3) || !pendiente(s2, 3)) continue;
    const h1 = horaDeHoy(c1, s1.hora), h2 = horaDeHoy(c2, s2.hora);
    const primera = horaTextoAMinutos(h1) <= horaTextoAMinutos(h2) ? h1 : h2;
    if (!enVentana(primera)) continue;
    const js = generarSuperpaleAuto(c1, c2, hoy, primera);
    grupos.push(g); nuevas.push(...js);
    const a = js.find(j => j.origen === 'auto');
    if (a) avisos.push(`🔗 <b>Súper Palé</b> ${s1.nombre} + ${s2.nombre}: <b>${a.numeros.map(f2).join('-')}</b>`);
  }
  for (const clave of AUTO.especiales) {
    const e = estado.especiales[clave]; const g = `e|${clave}`;
    if (!e || autoHechos.has(g) || !pendiente(e, e.cant || 1)) continue;
    if ((clave === 'loto' || clave === 'lotomas') && !AUTO.diasLoto.includes(diaSemanaRD())) continue;
    const hora = horaDeHoy(clave, e.hora);
    if (!enVentana(hora)) continue;
    const r = generarEspecialAuto(clave, hoy, hora);
    grupos.push(g); nuevas.push(...r.jugadas);
    const a = r.jugadas.filter(j => j.origen === 'auto');
    if (a.length) avisos.push(`🎰 <b>${e.nombre}</b> (${hora})\n` + a.map(j => `     ${j.metodo}: <b>${j.numeros.map(f2).join('-')}</b>`).join('\n'));
    else if (r.motivo) console.log(`[AUTO] ${clave}: ${r.motivo}`);
  }
  for (const clave of AUTO.cuartetas) {
    const c = estado.cuartetas[clave]; const g = `c|${clave}`;
    if (!c || autoHechos.has(g) || !pendiente(c, 4)) continue;
    if (!enVentana(c.hora)) continue;
    const r = generarCuartetaAuto(clave, hoy, c.hora);
    grupos.push(g); nuevas.push(...r.jugadas);
    const a = r.jugadas.find(j => j.origen === 'auto');
    if (a) avisos.push(`🎲 <b>${c.nombre}</b> (${c.hora}): <b>${a.numeros.map(f2).join('-')}</b>`);
  }

  if (!grupos.length) return;
  if (nuevas.length) {
    const ok = await insertarJugadas(nuevas);
    if (!ok) return; // se reintenta en el próximo sync
    autoPlan.generadas += nuevas.length;
  }
  grupos.forEach(g => autoHechos.add(g));
  if (avisos.length && TG_ACTIVO) {
    await enviarTelegram(`🤖 <b>JUGADAS AUTOMÁTICAS</b> — ${hoy}\n<i>Registradas antes del sorteo (+ igual cantidad al azar como control)</i>\n\n${avisos.join('\n\n')}`);
  }
}

// ── Evaluación ───────────────────────────────────────────────────────────────
function emparejar(a, b) { // coincidencias contando repetidos una sola vez cada uno
  const resto = [...b]; let k = 0;
  for (const x of a) { const i = resto.indexOf(x); if (i >= 0) { k++; resto.splice(i, 1); } }
  return k;
}
function resultadoDe(grupoTipo, clave, fecha) {
  const desde = fecha === estado.fecha ? estado : (estado.historico.find(d => d.fecha === fecha) || null);
  if (!desde) return null;
  const tabla = desde[grupoTipo] || {};
  const r = tabla[clave];
  return r && Array.isArray(r.numeros) && r.numeros.length ? r.numeros.map(Number) : null;
}
function evaluarAuto(j) {
  const P = AUTO.pagos; const nums = (j.numeros || []).map(Number);
  if (['punto', 'pale', 'tripleta'].includes(j.tipo)) {
    const real = resultadoDe('sorteos', j.clave, j.fecha); if (!real || real.length < 3) return null;
    let premio = 0;
    if (j.tipo === 'punto') premio = real.reduce((s, x, i) => s + (x === nums[0] ? (P.punto[i] || 0) : 0), 0);
    if (j.tipo === 'pale') {
      for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) if (i !== k && real[i] === nums[0] && real[k] === nums[1]) premio = Math.max(premio, P.pale[[i, k].sort().join('-')] || 0);
    }
    if (j.tipo === 'tripleta') { const m = emparejar(nums, real); premio = P.tripleta[m] || 0; }
    return { resultado: real, aciertos: emparejar(nums, real), gano: premio > 0, premio };
  }
  if (j.tipo === 'superpale') {
    const r1 = resultadoDe('sorteos', j.clave, j.fecha), r2 = resultadoDe('sorteos', j.clave2, j.fecha);
    if (!r1 || !r2) return null;
    const m = emparejar(nums, [r1[0], r2[0]]);
    return { resultado: r1, resultado2: r2, aciertos: m, gano: m === 2, premio: m === 2 ? P.superpale : 0 };
  }
  if (j.tipo === 'cuarteta') {
    const real = resultadoDe('cuartetas', j.clave, j.fecha); if (!real || real.length < 4) return null;
    const m = emparejar(nums, real);
    return { resultado: real, aciertos: m, gano: m === 4, premio: null };
  }
  const e = estado.especiales[j.clave];
  const real = resultadoDe('especiales', j.clave, j.fecha);
  if (!real || (e && e.cant && real.length < e.cant)) return null;
  let aciertos, gano;
  if (j.clave === 'pega3mas') { aciertos = nums.filter((n, i) => real[i] === n).length; gano = aciertos === 3; }
  else if (j.clave === 'loto5' || j.clave === 'lotopoolleidsa') { aciertos = nums.filter(n => real.slice(0, 5).includes(n)).length; gano = aciertos >= 3; }
  else if (j.clave === 'lotopoolreal') { aciertos = emparejar(nums, real.slice(0, 4)); gano = aciertos >= 2; } // 1 acierto solo devuelve lo jugado
  else {
    aciertos = j.clave === 'megachance' ? emparejar(nums, real) : nums.filter(n => real.includes(n)).length;
    gano = j.clave === 'superkino' ? (aciertos === 0 || aciertos >= 5)
         : (j.clave === 'loto' || j.clave === 'lotomas') ? aciertos >= 3
         : j.clave === 'megachance' ? aciertos >= 2
         : aciertos >= 1;
  }
  return { resultado: real, aciertos, gano, premio: null };
}
async function evaluarJugadasAutomaticas() {
  if (!AUTO.activo || !SUPABASE_ACTIVO) return;
  const desde = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10);
  let pend;
  try { pend = await leerJugadas(`evaluado=eq.false&origen=in.(auto,control)&fecha=gte.${desde}&select=*&limit=1000`); }
  catch (e) { return; }
  const listas = [], ganadoras = [];
  for (const j of pend) {
    const r = evaluarAuto(j); if (!r) continue;
    listas.push({ ...j, ...r, resultado2: r.resultado2 || null, evaluado: true, evaluado_en: new Date().toISOString() });
    if (r.gano && j.origen === 'auto') ganadoras.push({ j, r });
  }
  if (!listas.length) return;
  if (!(await upsertJugadas(listas))) return;
  autoPlan.evaluadas += listas.length;
  if (ganadoras.length && TG_ACTIVO) {
    const f2 = n => String(n).padStart(2, '0');
    const nombre = (j) => (estado.sorteos[j.clave] || estado.especiales[j.clave] || estado.cuartetas[j.clave] || {}).nombre || j.clave;
    const txt = ganadoras.map(({ j, r }) => `🏆 <b>${nombre(j)}${j.clave2 ? ' + ' + nombre({ clave: j.clave2 }) : ''}</b> · ${j.tipo}${j.metodo ? ' (' + j.metodo + ')' : ''}\n     Jugó <b>${j.numeros.map(f2).join('-')}</b> · salió ${r.resultado.map(f2).join('-')}${r.resultado2 ? ' / ' + r.resultado2.map(f2).join('-') : ''}${r.premio ? ` · paga <b>${r.premio}x</b>` : ''}`).join('\n\n');
    await enviarTelegram(`🤖🏆 <b>JUGADA AUTOMÁTICA GANADORA</b>\n\n${txt}`);
  }
}

// ── Resumen y auditoría ──────────────────────────────────────────────────────
function agregarAuditoria(filas) {
  const g = {};
  for (const j of filas) {
    if (j.clave === 'lotomas') continue; // tickets viejos de Loto Más (formato equivocado, nunca evaluables)
    const tipoClave = ['punto', 'pale', 'tripleta', 'superpale', 'cuarteta'].includes(j.tipo) ? j.tipo : j.clave;
    const k = `${tipoClave}|${j.origen}`;
    if (!g[k]) g[k] = { tipo: tipoClave, origen: j.origen, jugadas: 0, evaluadas: 0, ganadas: 0, aciertos: 0, premio: 0, costo: 0, conPremio: false };
    const x = g[k]; x.jugadas++;
    if (j.evaluado) {
      x.evaluadas++; x.aciertos += j.aciertos || 0;
      if (j.gano) x.ganadas++;
      if (j.premio !== null && j.premio !== undefined) { x.conPremio = true; x.premio += Number(j.premio) || 0; x.costo += Number(j.monto) || 1; }
    }
  }
  const tipos = [...new Set(Object.values(g).map(x => x.tipo))];
  return tipos.map(t => {
    const fila = { tipo: t, teorico: AUTO_TEORICO[t] || null };
    for (const o of ['auto', 'control']) {
      const x = g[`${t}|${o}`];
      fila[o] = x ? {
        jugadas: x.jugadas, evaluadas: x.evaluadas, ganadas: x.ganadas,
        tasa: x.evaluadas ? +(100 * x.ganadas / x.evaluadas).toFixed(2) : null,
        aciertos_prom: x.evaluadas ? +(x.aciertos / x.evaluadas).toFixed(2) : null,
        retorno_por_peso: x.conPremio && x.costo ? +(x.premio / x.costo).toFixed(3) : null,
      } : null;
    }
    return fila;
  });
}
async function enviarResumenAutoDelDia() {
  if (!AUTO.activo || !SUPABASE_ACTIVO || !TG_ACTIVO) return;
  const hoy = fechaRD();
  if (autoResumenEnviado === hoy || minutosActualesRD() < 23 * 60 + 15) return;
  let filas;
  try { filas = await leerJugadas(`fecha=eq.${hoy}&origen=in.(auto,control)&select=tipo,clave,origen,evaluado,gano,aciertos,premio,monto`); }
  catch (e) { return; }
  autoResumenEnviado = hoy;
  if (!filas.length || yaEnviado('resumen-auto')) return;
  await marcarEnviado('resumen-auto');
  const nom = { punto: 'Punto', pale: 'Palé', tripleta: 'Tripleta', superpale: 'Súper Palé', cuarteta: 'Cuarteta', superkino: 'Kino', pega3mas: 'Pega 3 Más', megachance: 'Mega Chance', quemaito: 'Quemaito', loto: 'Loto', lotomas: 'Loto Más', loto5: 'Loto 5', lotopoolreal: 'Loto Pool Real', lotopoolleidsa: 'Loto Pool Leidsa' };
  const fmt = x => x ? `${x.ganadas}/${x.evaluadas}${x.retorno_por_peso !== null ? ` · ret ${x.retorno_por_peso}` : ''}` : '—';
  const lineas = agregarAuditoria(filas).map(f => `• <b>${nom[f.tipo] || f.tipo}</b>: 🤖 ${fmt(f.auto)}  |  🎲 ${fmt(f.control)}`);
  await enviarTelegram(`📒 <b>RESUMEN JUGADAS AUTOMÁTICAS</b> — ${hoy}\n<i>ganadas/evaluadas · ret = lo que devolvió cada RD$1 (1.0 = quedó igual)</i>\n🤖 sistema  |  🎲 azar (control)\n\n${lineas.join('\n')}`);
}

app.get('/api/jugadas', async (req, res) => {
  if (!SUPABASE_ACTIVO) return res.json({ jugadas: [], error: 'Supabase no configurado' });
  const dias = Math.min(120, Math.max(1, parseInt(req.query.dias, 10) || 7));
  const desde = new Date(Date.now() - (dias - 1) * 86400000 - 4 * 3600000).toISOString().slice(0, 10);
  try {
    const filas = await leerJugadas(`fecha=gte.${desde}&origen=in.(auto,control,lab)&select=id,clave,clave2,fecha,tipo,numeros,origen,metodo,hora_sorteo,generado_rd,evaluado,resultado,resultado2,aciertos,gano,premio,creado&order=creado.desc&limit=4000`);
    // las del laboratorio llevan el nombre de su estrategia
    const nombres = Object.fromEntries(((typeof labCargar === 'function' ? await labCargar() : []) || []).map(e => [e.id, e.nombre]));
    for (const f of filas) if (f.origen === 'lab') f.estrategia = nombres[f.metodo] || (typeof kinoNombre === 'function' ? kinoNombre(f.metodo) : f.metodo);
    res.json({ jugadas: filas, desde });
  } catch (e) { res.json({ jugadas: [], error: `${e.response?.status || ''} ${JSON.stringify(e.response?.data || e.message).slice(0, 200)}` }); }
});
app.get('/api/auditoria', async (req, res) => {
  if (!SUPABASE_ACTIVO) return res.json({ error: 'Supabase no configurado' });
  const dias = Math.min(365, Math.max(1, parseInt(req.query.dias, 10) || 90));
  const desde = new Date(Date.now() - (dias - 1) * 86400000 - 4 * 3600000).toISOString().slice(0, 10);
  try {
    const filas = await leerJugadas(`fecha=gte.${desde}&origen=in.(auto,control)&select=fecha,tipo,clave,origen,evaluado,gano,aciertos,premio,monto&limit=100000`);
    const primera = filas.reduce((m, f) => (!m || (f.fecha && f.fecha < m) ? f.fecha : m), null) || desde;
    res.json({ desde: primera, total: filas.length, pagos: AUTO.pagos, loterias: AUTO.loterias, resumen: agregarAuditoria(filas) });
  } catch (e) { res.json({ error: `${e.response?.status || ''} ${JSON.stringify(e.response?.data || e.message).slice(0, 200)}` }); }
});
app.get('/api/debug-jugadas', async (req, res) => {
  if (!SUPABASE_ACTIVO) return res.json({ ok: false, mensaje: 'Supabase no configurado' });
  try {
    await leerJugadas('select=id,origen,metodo,grupo,clave2,hora_sorteo,generado_rd,evaluado,resultado,resultado2,aciertos,gano,premio,contexto,evaluado_en&limit=1');
    const hoy = fechaRD();
    const deHoy = await leerJugadas(`fecha=eq.${hoy}&origen=in.(auto,control)&select=grupo,origen`);
    res.json({ ok: true, tabla: 'jugadas lista con todas las columnas', activo: AUTO.activo, loterias: AUTO.loterias, superpales: AUTO.superpales,
      hoy, jugadas_auto_hoy: deHoy.length, grupos_hoy: [...new Set(deHoy.map(x => x.grupo))], hora_rd: horaRD(), estado: autoPlan });
  } catch (e) {
    res.json({ ok: false, status: e.response?.status || null, error: e.response?.data || e.message,
      solucion: 'Corre el SQL de la tabla jugadas en Supabase (SQL Editor) y vuelve a abrir esta página.' });
  }
});



// ════════════════════════════════════════════════════════════════════════════
// ── TEORÍA ⚡: ¿los repetidos del día vuelven a salir de noche más de lo normal?
// ⚡ = número que salió en 2+ loterías DE DÍA. Se mira qué fracción de los
// números que salen DE NOCHE eran ⚡, y se compara con lo que daría el azar:
// si hay 9 ⚡, un número al azar (00-99) tiene 9% de probabilidad de ser uno.
// ════════════════════════════════════════════════════════════════════════════
const NOCHE_TEORIA = new Set(['king_n','loteka','laprimera_n','leidsa','nacional','anguila_nn','new_york_n','florida_n']);
function analizarRepetidosDia(dia) {
  const sorteos = (dia && dia.sorteos) || {};
  const conteo = {}; let loteriasDia = 0, loteriasNoche = 0;
  for (const [k, s] of Object.entries(sorteos)) {
    if (NOCHE_TEORIA.has(k) || !s || !Array.isArray(s.numeros) || s.numeros.length < 3) continue;
    loteriasDia++;
    for (const n of new Set(s.numeros.map(Number))) conteo[n] = (conteo[n] || 0) + 1;
  }
  const rayos = new Set(Object.entries(conteo).filter(([, c]) => c >= 2).map(([n]) => +n));
  let numsNoche = 0, aciertos = 0; const cuales = [];
  for (const k of NOCHE_TEORIA) {
    const s = sorteos[k];
    if (!s || !Array.isArray(s.numeros) || s.numeros.length < 3) continue;
    loteriasNoche++;
    for (const n of s.numeros.slice(0, 3).map(Number)) {
      numsNoche++;
      if (rayos.has(n)) { aciertos++; cuales.push({ n, loteria: s.nombre || k }); }
    }
  }
  if (loteriasDia < 6 || loteriasNoche < 3) return null; // día incompleto: no cuenta
  const p = rayos.size / 100;
  return { fecha: dia.fecha, rayos: rayos.size, loteriasDia, loteriasNoche, numsNoche, aciertos,
           esperado: +(numsNoche * p).toFixed(2), varianza: numsNoche * p * (1 - p),
           pct: numsNoche ? +(100 * aciertos / numsNoche).toFixed(1) : 0, pctEsperado: +(100 * p).toFixed(1), cuales };
}
// La memoria del servidor solo guarda 90 días (y cada día se cae el más viejo).
// Para la teoría ⚡ se lee TODO el historial de Supabase una vez al día.
let histTeoria = { fecha: null, filas: [] };
async function cargarHistTeoria() {
  if (!SUPABASE_ACTIVO || histTeoria.fecha === fechaRD()) return;
  try {
    const r = await axios.get(`${SUPABASE_URL}/rest/v1/historico?select=fecha,sorteos,especiales&order=fecha.asc&limit=3000`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, timeout: 30000 });
    histTeoria = { fecha: fechaRD(), filas: r.data || [] };
  } catch (e) { console.log('[TEORIA] no se pudo leer el historial completo:', e.message); }
}
function analisisRepetidosAcumulado() {
  const porFecha = {};
  for (const d of histTeoria.filas) porFecha[d.fecha] = d;
  for (const d of estado.historico) porFecha[d.fecha] = d;           // lo de memoria es más nuevo
  porFecha[estado.fecha] = { fecha: estado.fecha, sorteos: estado.sorteos };
  const dias = Object.values(porFecha)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    .map(analizarRepetidosDia).filter(Boolean);
  let obs = 0, esp = 0, vari = 0, nums = 0, arriba = 0, abajo = 0;
  for (const d of dias) { obs += d.aciertos; esp += d.esperado; vari += d.varianza; nums += d.numsNoche; if (d.aciertos > d.esperado) arriba++; else if (d.aciertos < d.esperado) abajo++; }
  const z = vari > 0 ? (obs - esp) / Math.sqrt(vari) : 0;
  const veredicto = dias.length < 10 ? 'pocos días todavía'
    : z >= 3 ? 'los ⚡ salen de noche MÁS que el azar (señal fuerte)'
    : z >= 2 ? 'prometedor: por encima del azar, falta confirmar con más días'
    : z >= 1 ? 'ligeramente por encima del azar (todavía no concluyente)'
    : z <= -1 ? 'por debajo del azar'
    : 'igual que el azar';
  return { dias: dias.length, numeros_noche: nums, observados: obs, esperados: +esp.toFixed(1),
           pct: nums ? +(100 * obs / nums).toFixed(1) : 0, pct_esperado: nums ? +(100 * esp / nums).toFixed(1) : 0,
           dias_arriba: arriba, dias_abajo: abajo, z: +z.toFixed(2), veredicto, detalle: dias };
}
let analisisRepEnviado = null;
async function enviarAnalisisRepetidos() {
  if (!TG_ACTIVO) return;
  const hoy = fechaRD();
  if (analisisRepEnviado === hoy || minutosActualesRD() < 23 * 60 + 15) return;
  analisisRepEnviado = hoy;
  if (yaEnviado('teoria')) return;
  await marcarEnviado('teoria');
  await cargarHistTeoria();
  const d = analizarRepetidosDia({ fecha: hoy, sorteos: estado.sorteos });
  const a = analisisRepetidosAcumulado();
  const f2 = n => String(n).padStart(2, '0');
  const hoyTxt = d
    ? `Hoy de día hubo <b>${d.rayos} ⚡</b> (${d.pctEsperado}% de los números).\nDe noche salieron <b>${d.aciertos} de ${d.numsNoche}</b> números que eran ⚡ → <b>${d.pct}%</b> vs ${d.pctEsperado}% esperado ${d.aciertos > d.esperado ? '📈' : d.aciertos < d.esperado ? '📉' : '➖'}` +
      (d.cuales.length ? `\n     ${d.cuales.map(c => `${f2(c.n)} (${c.loteria})`).join(' · ')}` : '')
    : 'Hoy faltan resultados para medirlo.';
  await enviarTelegram(`⚡ <b>TEORÍA DE LOS REPETIDOS</b> — ${hoy}\n\n${hoyTxt}\n\n📚 <b>Acumulado ${a.dias} días:</b> ${a.observados} de ${a.numeros_noche} (${a.pct}%) vs ${a.pct_esperado}% esperado\n     Días por encima: ${a.dias_arriba} · por debajo: ${a.dias_abajo}\n     Veredicto: <i>${a.veredicto}</i>`);
}
app.get('/api/analisis-repetidos', async (req, res) => {
  await cargarHistTeoria();
  const a = analisisRepetidosAcumulado();
  // días guardados que no cuentan por tener pocas loterías (menos de 6 de día o 3 de noche)
  const cuentan = new Set(a.detalle.map(d => d.fecha));
  const incompletos = [...new Set([...histTeoria.filas, ...estado.historico].map(d => d.fecha))].filter(f => f !== estado.fecha && !cuentan.has(f)).sort();
  res.json({ ...a, dias_guardados_que_no_cuentan: incompletos, detalle: a.detalle.map(({ varianza, ...x }) => x).reverse() });
});


// ── ANGUILA: rellenar historial de cada hora + corregir "Anguila Mañana" ─────
// Uso: /api/backfill-anguila?guardar=1                     → últimos ~10 días (Wuloteria)
//      /api/backfill-anguila?desde=2026-08-20&hasta=2026-10-06&guardar=1 → además días viejos (Enloteria)
// "Anguila Mañana" se SOBRESCRIBE con el sorteo de 10 AM (antes se guardaba el de 8 AM).
// Las otras 3 clásicas y las de cada hora solo se rellenan si faltan.
app.get('/api/backfill-anguila', async (req, res) => {
  if (estadoBackfill.activo) return res.status(409).json({ error: 'Ya hay un backfill corriendo' });
  const guardar = req.query.guardar === '1';
  const { desde, hasta } = req.query;
  estadoBackfill = { activo: true, inicio: new Date().toISOString(), log: [], resumen: null };
  res.json({ iniciado: true, fuente: 'anguila', modo: guardar ? 'GUARDAR' : 'SIMULACION', rango_enloteria: desde && hasta ? `${desde} → ${hasta}` : 'no' });
  const logBF = msg => { console.log(`[BF-ANG] ${msg}`); estadoBackfill.log.push(msg); };
  const pausa = ms => new Promise(r => setTimeout(r, ms));
  try {
    const hoy = fechaRD();
    const datos = {}; // fecha → { clave: numeros }
    const poner = (f, k, nums) => { if (f >= hoy || !Array.isArray(nums) || nums.length !== 3) return; (datos[f] = datos[f] || {})[k] = nums; };
    const paginas = [...Object.entries(ANGUILA_PRINCIPALES_WU).map(([slug, k]) => [slug, k]), ...ANGUILA_HORA_LIST.map(x => [x[3], x[0]])];
    for (const [slug, k] of paginas) {
      try {
        const r = await axios.get(`https://wuloteria.com/loto/anguila/${slug}`, { headers: HEADERS, timeout: 15000 });
        const h = parsearHistorialWuloteria(r.data);
        h.forEach(x => poner(x.fecha, k, x.numeros));
        logBF(`Wuloteria ${slug}: ${h.length} sorteos`);
      } catch (e) { logBF(`AVISO Wuloteria ${slug}: ${e.response?.status || e.message}`); }
      await pausa(800);
    }
    if (desde && hasta) {
      const ENL = [['anguilla-10am', 'anguila_m'], ['anguilla-1pm', 'anguila_t'], ['anguilla-6pm', 'anguila_n'], ['anguilla-9pm', 'anguila_nn'], ...ANGUILA_HORA_LIST.map(x => [x[4], x[0]])];
      for (const f of listaFechas(desde, hasta)) {
        if (f >= hoy) continue;
        let n = 0;
        for (const [slug, k] of ENL) {
          if (datos[f] && datos[f][k]) continue;
          try {
            const r = await axios.get(`https://enloteria.com/resultados-${slug}-${f}`, { headers: HEADERS, timeout: 15000 });
            const nums = extraerResultadoHoyEnloteria(r.data, 3, f);
            if (nums.length === 3) { poner(f, k, nums); n++; }
          } catch (e) {}
          await pausa(1000);
        }
        logBF(`Enloteria ${f}: ${n} sorteos`);
      }
    }
    const fechas = Object.keys(datos).sort();
    if (!fechas.length) { logBF('Nada que procesar.'); return; }
    const existentes = {};
    if (SUPABASE_ACTIVO) {
      try {
        const cols = columnaAnguilas ? 'fecha,sorteos,cuartetas,especiales,anguilas' : 'fecha,sorteos,cuartetas,especiales';
        const r = await axios.get(`${SUPABASE_URL}/rest/v1/historico?select=${cols}&fecha=gte.${fechas[0]}&fecha=lte.${fechas[fechas.length - 1]}`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, timeout: 15000 });
        for (const row of r.data) existentes[row.fecha] = row;
      } catch (e) { logBF(`AVISO Supabase: ${e.message}`); }
    }
    let corregidas = 0, rellenadas = 0, horas = 0;
    for (const f of fechas) {
      const base = existentes[f] || estado.historico.find(d => d.fecha === f) || { fecha: f, sorteos: crearSorteos(), cuartetas: crearCuartetas(), especiales: crearJuegosEspeciales() };
      base.sorteos = base.sorteos || crearSorteos();
      base.anguilas = { ...crearAnguilasHora(), ...(base.anguilas || {}) };
      let cambio = false;
      for (const [k, nums] of Object.entries(datos[f])) {
        if (k.startsWith('ang_')) {
          if (!base.anguilas[k].numeros || base.anguilas[k].numeros.length < 3) { base.anguilas[k] = { ...base.anguilas[k], numeros: nums, estado: 'disponible' }; horas++; cambio = true; }
          continue;
        }
        const s = base.sorteos[k] || crearSorteos()[k];
        const actual = (s.numeros || []).map(Number);
        if (actual.length < 3) { base.sorteos[k] = { ...s, numeros: nums, estado: 'disponible' }; rellenadas++; cambio = true; }
        else if (k === 'anguila_m' && actual.join('-') !== nums.join('-')) {
          logBF(`${f} Anguila Mañana: ${actual.join('-')} → ${nums.join('-')}`);
          base.sorteos[k] = { ...s, numeros: nums, estado: 'disponible' }; corregidas++; cambio = true;
        }
      }
      if (cambio && guardar) {
        await guardarEnSupabase(base);
        const idx = estado.historico.findIndex(d => d.fecha === f);
        if (idx >= 0) estado.historico[idx] = { ...estado.historico[idx], sorteos: base.sorteos, anguilas: base.anguilas };
      }
    }
    if (guardar) guardarEnDisco();
    estadoBackfill.resumen = { dias: fechas.length, anguila_manana_corregidas: corregidas, clasicas_rellenadas: rellenadas, sorteos_de_cada_hora: horas, columna_anguilas: columnaAnguilas };
    logBF(`✅ Listo: ${fechas.length} días · ${corregidas} Anguila Mañana corregidas · ${rellenadas} clásicas rellenadas · ${horas} sorteos de cada hora ${guardar ? 'guardados' : '(simulación)'}${columnaAnguilas ? '' : ' · ⚠️ falta crear la columna anguilas en Supabase: las de cada hora NO se guardaron'}`);
  } catch (e) { logBF(`❌ ERROR: ${e.message}`); }
  finally { estadoBackfill.activo = false; }
});
app.get('/api/debug-anguila', (req, res) => {
  res.json({ columna_anguilas_en_supabase: columnaAnguilas, anguila_manana_hoy: estado.sorteos.anguila_m,
    anguilas_de_cada_hora_hoy: Object.fromEntries(Object.entries(estado.anguilas || {}).map(([k, a]) => [a.nombre, a.numeros.join('-') || 'pendiente'])),
    dias_en_historial_con_anguilas: estado.historico.filter(d => d.anguilas && Object.values(d.anguilas).some(a => a.numeros && a.numeros.length)).length });
});


// ── LOTO: ver qué publica la fuente y rellenar los bolos Más / Súper Más ──
app.get('/api/debug-loto', async (req, res) => {
  const out = { hoy_loto: estado.especiales.loto, hoy_loto_mas: estado.especiales.lotomas };
  try {
    const r = await axios.get('https://enloteria.com/resultados-loto-hoy', { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(r.data); const card = $('.result-card').first();
    out.enloteria = { fecha: card.find('.result-date').first().text().trim(), numeros: card.find('.result-number').map((_, e) => $(e).text().trim()).get() };
  } catch (e) { out.enloteria = { error: e.response?.status || e.message }; }
  try {
    const r = await axios.get('https://wuloteria.com/', { headers: HEADERS, timeout: 15000 });
    out.wuloteria = parsearWuloteria(r.data).filter(x => /loto/i.test(x.slug));
  } catch (e) { out.wuloteria = { error: e.response?.status || e.message }; }
  res.json(out);
});
// /api/backfill-loto-mas?desde=2026-09-20&hasta=2026-10-17&guardar=1  (máx. 15 días por llamada; solo miércoles y sábado)
app.get('/api/backfill-loto-mas', async (req, res) => {
  if (estadoBackfill.activo) return res.status(409).json({ error: 'Ya hay un backfill corriendo' });
  const { desde, hasta } = req.query; const guardar = req.query.guardar === '1';
  if (!desde || !hasta) return res.status(400).json({ error: 'Faltan desde y hasta (AAAA-MM-DD)' });
  estadoBackfill = { activo: true, inicio: new Date().toISOString(), log: [], resumen: null };
  res.json({ iniciado: true, fuente: 'loto-mas', modo: guardar ? 'GUARDAR' : 'SIMULACION', rango: `${desde} → ${hasta}` });
  const logBF = m => { console.log(`[BF-LOTO] ${m}`); estadoBackfill.log.push(m); };
  let n = 0;
  try {
    for (const f of listaFechas(desde, hasta)) {
      const dia = new Date(f + 'T12:00:00Z').getUTCDay();
      if (dia !== 3 && dia !== 6 || f >= fechaRD()) continue;
      try {
        const r = await axios.get(`https://enloteria.com/resultados-loto-${f}`, { headers: HEADERS, timeout: 15000 });
        const nums = extraerResultadoHoyEnloteria(r.data, 6, f, true);
        if (nums.length < 8) { logBF(`${f}: la fuente trae ${nums.length} números (sin bolos extra)`); continue; }
        const base = estado.historico.find(d => d.fecha === f);
        if (!base) { logBF(`${f}: día no está en el historial`); continue; }
        base.especiales = base.especiales || crearJuegosEspeciales();
        if (!base.especiales.loto || !(base.especiales.loto.numeros || []).length) base.especiales.loto = { ...crearJuegosEspeciales().loto, numeros: nums.slice(0, 6), estado: 'disponible' };
        base.especiales.lotomas = { ...crearJuegosEspeciales().lotomas, numeros: nums.slice(6, 8), estado: 'disponible' };
        logBF(`${f}: Loto ${nums.slice(0, 6).join('-')} · Más ${nums[6]} · Súper Más ${nums[7]}`); n++;
        if (guardar) await guardarEnSupabase(base);
      } catch (e) { logBF(`${f}: ${e.response?.status || e.message}`); }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (guardar) guardarEnDisco();
    estadoBackfill.resumen = { sorteos: n };
    logBF(`✅ Listo: ${n} sorteos de Loto con bolos extra ${guardar ? 'guardados' : '(simulación)'}`);
  } catch (e) { logBF(`❌ ERROR: ${e.message}`); }
  finally { estadoBackfill.activo = false; }
});


// ── QUINIELAS: rellenar días incompletos lotería por lotería (Enloteria por fecha) ──
// La página general "resultados-loterias-FECHA" no trae todas; las páginas de cada
// lotería sí (así se completó la Anguila). Solo rellena lo que falta, nunca sobrescribe.
// Uso: /api/backfill-quinielas?desde=2026-08-05&hasta=2026-08-19&guardar=1  (máx. 15 días por llamada)
app.get('/api/backfill-quinielas', async (req, res) => {
  if (estadoBackfill.activo) return res.status(409).json({ error: 'Ya hay un backfill corriendo' });
  const { desde, hasta } = req.query; const guardar = req.query.guardar === '1';
  if (!desde || !hasta) return res.status(400).json({ error: 'Faltan desde y hasta (AAAA-MM-DD)' });
  estadoBackfill = { activo: true, inicio: new Date().toISOString(), log: [], resumen: null };
  res.json({ iniciado: true, fuente: 'quinielas-enloteria', modo: guardar ? 'GUARDAR' : 'SIMULACION', rango: `${desde} → ${hasta}` });
  const logBF = m => { console.log(`[BF-QUI] ${m}`); estadoBackfill.log.push(m); };
  const pausa = ms => new Promise(r => setTimeout(r, ms));
  let totalNuevos = 0, diasGuardados = 0;
  try {
    const fechas = listaFechas(desde, hasta).filter(f => f < fechaRD());
    const existentes = {};
    if (SUPABASE_ACTIVO && fechas.length) {
      try {
        const cols = columnaAnguilas ? 'fecha,sorteos,cuartetas,especiales,anguilas' : 'fecha,sorteos,cuartetas,especiales';
        const r = await axios.get(`${SUPABASE_URL}/rest/v1/historico?select=${cols}&fecha=gte.${fechas[0]}&fecha=lte.${fechas[fechas.length - 1]}`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, timeout: 15000 });
        for (const row of r.data) existentes[row.fecha] = row;
      } catch (e) { logBF(`AVISO Supabase: ${e.message}`); }
    }
    for (const f of fechas) {
      const base = existentes[f] || estado.historico.find(d => d.fecha === f) || { fecha: f, sorteos: {}, cuartetas: crearCuartetas(), especiales: crearJuegosEspeciales() };
      base.sorteos = { ...crearSorteos(), ...(base.sorteos || {}) };
      let nuevos = 0, yaTenia = 0, sinDato = 0;
      for (const [slug, clave] of Object.entries(ENLOTERIA_SORTEO_SLUGS)) {
        const s = base.sorteos[clave];
        if (s && Array.isArray(s.numeros) && s.numeros.length >= 3) { yaTenia++; continue; }
        try {
          const r = await axios.get(`https://enloteria.com/resultados-${slug}-${f}`, { headers: HEADERS, timeout: 15000 });
          const nums = extraerResultadoHoyEnloteria(r.data, 3, f);
          if (nums.length === 3 && !nums.every(x => x === nums[0])) { base.sorteos[clave] = { ...crearSorteos()[clave], numeros: nums, estado: 'disponible' }; nuevos++; }
          else sinDato++;
        } catch (e) { sinDato++; }
        await pausa(900);
      }
      logBF(`${f}: +${nuevos} nuevas · ${yaTenia} ya estaban · ${sinDato} sin dato`);
      totalNuevos += nuevos;
      if (nuevos && guardar) {
        await guardarEnSupabase(base); diasGuardados++;
        const idx = estado.historico.findIndex(d => d.fecha === f);
        if (idx >= 0) estado.historico[idx] = { ...estado.historico[idx], sorteos: base.sorteos };
      }
    }
    if (guardar) { guardarEnDisco(); histTeoria.fecha = null; } // que la teoría ⚡ relea el historial
    estadoBackfill.resumen = { dias: fechas.length, sorteos_nuevos: totalNuevos, dias_guardados: diasGuardados };
    logBF(`✅ Listo: ${totalNuevos} sorteos nuevos en ${diasGuardados} días ${guardar ? 'guardados' : '(simulación)'}`);
  } catch (e) { logBF(`❌ ERROR: ${e.message}`); }
  finally { estadoBackfill.activo = false; }
});


// ── JUEGOS NUEVOS: ver qué publica cada fuente + rellenar historial ───────
app.get('/api/debug-especiales-nuevos', async (req, res) => {
  const out = { hoy: Object.fromEntries(Object.keys(ESPECIALES_NUEVOS).map(k => [k, estado.especiales[k]])), slug_que_funciono: slugNuevoOk, enloteria: {}, wuloteria: null };
  for (const [clave, cfg] of Object.entries(ESPECIALES_NUEVOS)) {
    out.enloteria[clave] = {};
    for (const slug of cfg.enl) {
      try {
        const r = await axios.get(`https://enloteria.com/resultados-${slug}-hoy`, { headers: HEADERS, timeout: 15000 });
        const $ = cheerio.load(r.data); const card = $('.result-card').first();
        const nums = card.find('.result-number').map((_, e) => parseInt($(e).text().trim(), 10)).get().filter(n => !isNaN(n));
        out.enloteria[clave][slug] = { fecha: card.find('.result-date').first().text().trim(), numeros: nums, valido: cfg.valida(nums) };
      } catch (e) { out.enloteria[clave][slug] = { error: e.response?.status || e.message }; }
    }
  }
  try {
    const r = await axios.get('https://wuloteria.com/', { headers: HEADERS, timeout: 15000 });
    out.wuloteria = parsearWuloteria(r.data).filter(x => /loto|pool/i.test(x.slug));
  } catch (e) { out.wuloteria = { error: e.response?.status || e.message }; }
  res.json(out);
});
// /api/backfill-especiales-nuevos?desde=2026-10-05&hasta=2026-10-18&guardar=1  (máx. 15 días)
app.get('/api/backfill-especiales-nuevos', async (req, res) => {
  if (estadoBackfill.activo) return res.status(409).json({ error: 'Ya hay un backfill corriendo' });
  const { desde, hasta } = req.query; const guardar = req.query.guardar === '1';
  if (!desde || !hasta) return res.status(400).json({ error: 'Faltan desde y hasta (AAAA-MM-DD)' });
  estadoBackfill = { activo: true, inicio: new Date().toISOString(), log: [], resumen: null };
  res.json({ iniciado: true, fuente: 'especiales-nuevos', modo: guardar ? 'GUARDAR' : 'SIMULACION', rango: `${desde} → ${hasta}` });
  const logBF = m => { console.log(`[BF-NUEVOS] ${m}`); estadoBackfill.log.push(m); };
  let total = 0;
  try {
    for (const f of listaFechas(desde, hasta).filter(x => x < fechaRD())) {
      const base = estado.historico.find(d => d.fecha === f);
      if (!base) { logBF(`${f}: día no está en el historial`); continue; }
      base.especiales = { ...crearJuegosEspeciales(), ...(base.especiales || {}) };
      const partes = [];
      for (const clave of Object.keys(ESPECIALES_NUEVOS)) {
        const ya = base.especiales[clave];
        if (ya && Array.isArray(ya.numeros) && ya.numeros.length >= crearJuegosEspeciales()[clave].cant) { partes.push(`${clave} ya estaba`); continue; }
        const nums = await leerNuevoEnloteria(clave, f);
        if (nums) { base.especiales[clave] = { ...crearJuegosEspeciales()[clave], numeros: nums, estado: 'disponible' }; partes.push(`${clave} ${nums.join('-')}`); total++; }
        else partes.push(`${clave} sin dato`);
        await new Promise(r => setTimeout(r, 800));
      }
      logBF(`${f}: ${partes.join(' · ')}`);
      if (guardar) await guardarEnSupabase(base);
    }
    if (guardar) guardarEnDisco();
    estadoBackfill.resumen = { sorteos_nuevos: total, slugs: slugNuevoOk };
    logBF(`✅ Listo: ${total} sorteos ${guardar ? 'guardados' : '(simulación)'}`);
  } catch (e) { logBF(`❌ ERROR: ${e.message}`); }
  finally { estadoBackfill.activo = false; }
});


// ════════════════════════════════════════════════════════════════════════════
// 🧪 LABORATORIO DE ESTRATEGIAS (v9.7)
// El usuario crea estrategias desde la app; el servidor las juega SOLO, en papel
// (sin dinero), en las loterías normales que él escoja. Cada número sugerido
// cuenta como un PUNTO de RD$1 y se paga con la tabla de la banca (60/8/4).
// Cada jugada lleva al lado un CONTROL al azar del mismo tamaño, para comparar.
// Además cada estrategia se prueba al instante sobre TODO el historial (backtest).
// Tabla Supabase: estrategias (ver supabase_estrategias.sql). Jugadas: tabla
// jugadas con origen 'lab' / 'labctl' (las consultas de auditoría no las leen).
// ════════════════════════════════════════════════════════════════════════════
const LAB_TIPOS = {
  codigoq:    { nombre: 'Código Q + Método 1220', desc: '1er premio de AYER en esa lotería ÷ 1220 → suma de dígitos × Código Q → pares (y virados)', params: ['Q'] },
  jaladera:   { nombre: 'Jaladera (+25 / +50 / +75)', desc: 'Los 3 números que "jala" el 1er premio de la fuente', params: ['fuente'] },
  gemelos:    { nombre: 'Gemelos (+5 a cada dígito)', desc: 'El gemelo de los 3 números de la fuente (57 → 02)', params: ['fuente'] },
  espejo:     { nombre: 'Espejo (18 → 81)', desc: 'Los 3 números de la fuente al revés', params: ['fuente'] },
  repite:     { nombre: 'Se repite', desc: 'Juega los mismos 3 números de la fuente', params: ['fuente'] },
  vecinos:    { nombre: 'Dígitos vecinos par/impar (video)', desc: 'Dígitos ±1, ±2, ±3 del 1er premio de la fuente, alternando par/impar (≈18 números)', params: ['fuente'] },
  decena:     { nombre: 'Misma decena', desc: 'Los 10 números que empiezan como el 1er premio de la fuente (18 → 10-19)', params: ['fuente'] },
  terminal:   { nombre: 'Misma terminación', desc: 'Los 10 números que terminan como el 1er premio de la fuente (18 → x8)', params: ['fuente'] },
  frecuencia: { nombre: 'Calientes', desc: 'Los N que más han salido en esa lotería (últimos 90 sorteos)', params: ['n'] },
  atrasados:  { nombre: 'Atrasados', desc: 'Los N que más tiempo llevan sin salir en esa lotería', params: ['n'] },
  rodean:     { nombre: 'Números que rodean (video)', desc: 'Se le da la vuelta al 1er premio de la fuente (85 → 58) y se juegan los 4 que lo rodean: 57, 59, 48, 68', params: ['fuente'] },
  piramide:   { nombre: 'Pirámide de fechas (video)', desc: 'Pirámide de la fecha de AYER + la de HOY → número base, su equivalente (1=6…5=0), base ± el día y sus vueltas (6 números, los mismos en todas las loterías)', params: [] },
  fe:         { nombre: 'Mis números de fe', desc: 'Sus números fijos, todos los días', params: ['numeros'] },
};
const LAB_FUENTES = { ayer: 'el mismo sorteo AYER', anterior: 'la lotería que salió JUSTO ANTES (cualquiera)' };
const LAB_NUEVAS = [
  { id: 'piramide-fecha', nombre: 'Pirámide de fechas', tipo: 'piramide', parametros: {}, loterias: 'auto' },
  { id: 'rodean-anterior', nombre: 'Números que rodean · lotería anterior', tipo: 'rodean', parametros: { fuente: 'anterior' }, loterias: 'todas' },
];
const LAB_DEFAULT = [
  { id: 'codigoq-real', nombre: 'Código Q 35.9 · Lotería Real', tipo: 'codigoq', parametros: { Q: 35.9 }, loterias: ['real_t'] },
  { id: 'codigoq-loteka', nombre: 'Código Q 4570 · Loteka', tipo: 'codigoq', parametros: { Q: 4570 }, loterias: ['loteka'] },
  { id: 'jaladera-anterior', nombre: 'Jaladera de la lotería anterior', tipo: 'jaladera', parametros: { fuente: 'anterior' }, loterias: 'auto' },
  { id: 'gemelos-anterior', nombre: 'Gemelos de la lotería anterior', tipo: 'gemelos', parametros: { fuente: 'anterior' }, loterias: 'auto' },
  { id: 'espejo-anterior', nombre: 'Espejo de la lotería anterior', tipo: 'espejo', parametros: { fuente: 'anterior' }, loterias: 'auto' },
  { id: 'vecinos-ayer', nombre: 'Dígitos vecinos par/impar', tipo: 'vecinos', parametros: { fuente: 'ayer' }, loterias: 'auto' },
  { id: 'atrasados-3', nombre: 'Los 3 más atrasados', tipo: 'atrasados', parametros: { n: 3 }, loterias: 'auto' },
];
let labEstrategias = null;      // cache
let labTablaOk = true;
const LAB_HORA = Object.fromEntries(Object.entries(crearSorteos()).map(([k, s]) => [k, horaTextoAMinutos(s.hora)]));
function labLoterias(est) { if (est.loterias === 'todas') return Object.keys(LAB_HORA); return est.loterias === 'auto' || !Array.isArray(est.loterias) || !est.loterias.length ? AUTO.loterias : est.loterias; }

async function labCargar(forzar) {
  if (labEstrategias && !forzar) return labEstrategias;
  if (!SUPABASE_ACTIVO) return (labEstrategias = LAB_DEFAULT.map(e => ({ ...e, activa: true })));
  try {
    const r = await axios.get(`${SUPABASE_URL}/rest/v1/estrategias?select=*&order=creado.asc`, { headers: SB_HEADERS(), timeout: 15000 });
    labTablaOk = true;
    if (!r.data.length) { // primera vez: se cargan las estrategias de ejemplo
      const filas = LAB_DEFAULT.map(e => ({ ...e, activa: true }));
      await axios.post(`${SUPABASE_URL}/rest/v1/estrategias?on_conflict=id`, filas, { headers: { ...SB_HEADERS(), Prefer: 'resolution=merge-duplicates,return=minimal' }, timeout: 15000 });
      return (labEstrategias = filas);
    }
    // v9.17: 'Números que rodean' juega en TODAS las quinielas (una sola vez; si el usuario lo cambia después, se respeta)
    const rod = r.data.find(x => x.id === 'rodean-anterior');
    if (rod && rod.loterias === 'auto') {
      let ya = false; try { ya = (await leerJugadas(`id=eq.${encodeURIComponent('sys|lab-todas|rodean-anterior')}&select=id`)).length > 0; } catch (er) { ya = true; }
      if (!ya) try {
        await axios.patch(`${SUPABASE_URL}/rest/v1/estrategias?id=eq.rodean-anterior`, { loterias: 'todas' }, { headers: SB_HEADERS(), timeout: 15000 });
        await upsertJugadas([{ id: 'sys|lab-todas|rodean-anterior', origen: 'sistema', clave: 'sistema', fecha: fechaRD(), tipo: 'sistema', numeros: [], notificado: true, evaluado: true }]);
        rod.loterias = 'todas';
      } catch (er) {}
    }
    // v9.15: estrategias nuevas que se agregan solas una vez (si se borran, no vuelven: queda la marca 'sys|lab-sembrada|id')
    for (const e of LAB_NUEVAS) {
      if (r.data.some(x => x.id === e.id)) continue;
      let ya = false; try { ya = (await leerJugadas(`id=eq.${encodeURIComponent('sys|lab-sembrada|' + e.id)}&select=id`)).length > 0; } catch (er) { ya = true; }
      if (ya) continue;
      try {
        await axios.post(`${SUPABASE_URL}/rest/v1/estrategias?on_conflict=id`, [{ ...e, activa: true }], { headers: { ...SB_HEADERS(), Prefer: 'resolution=merge-duplicates,return=minimal' }, timeout: 15000 });
        await upsertJugadas([{ id: 'sys|lab-sembrada|' + e.id, origen: 'sistema', clave: 'sistema', fecha: fechaRD(), tipo: 'sistema', numeros: [], notificado: true, evaluado: true }]);
        r.data.push({ ...e, activa: true });
      } catch (er) {}
    }
    return (labEstrategias = r.data);
  } catch (e) {
    labTablaOk = false;
    console.log('[LAB] falta la tabla estrategias:', e.response?.status || e.message);
    labEstrategias = null; // no se guarda en caché: se vuelve a intentar en la próxima consulta
    return [];
  }
}

// ── el cálculo de cada estrategia ──
const labJal = n => [(n + 25) % 100, (n + 50) % 100, (n + 75) % 100];
const labGem = n => ((Math.floor(n / 10) + 5) % 10) * 10 + (n % 10 + 5) % 10;
const labEsp = n => (n % 10) * 10 + Math.floor(n / 10);
function labSumaCalc(x) { // dígitos como los muestra una calculadora (13 decimales, redondeado)
  const t = (Math.round(x * 1e13) / 1e13).toFixed(13);
  return [...t].filter(c => c >= '0' && c <= '9').reduce((s, c) => s + +c, 0);
}
function labCodigoQ(n, Q) {
  const s = labSumaCalc(n / 1220);
  const r = Math.round(s * Q * 1000) / 1000;
  const ent = Math.floor(r), dec = Math.floor(Math.round((r - ent) * 10));
  const base = String(dec ? ent - dec : ent);
  const out = new Set();
  for (let i = 0; i + 1 < base.length; i += 2) { const p = +base.slice(i, i + 2); out.add(p); out.add((p % 10) * 10 + Math.floor(p / 10)); }
  return [...out];
}
function labVecinos(n) {
  const a = Math.floor(n / 10), b = n % 10, out = new Set();
  for (const da of [1, 2, 3, -1, -2, -3]) for (const db of [1, 2, 3, -1, -2, -3]) {
    const x = (a + da + 10) % 10, y = (b + db + 10) % 10;
    if (x % 2 !== y % 2) out.add(x * 10 + y);
  }
  return [...out];
}
// dias: [{fecha, sorteos}] ordenados por fecha (el último puede ser hoy, a medias)
function labFuente(dias, idxDia, clave, fuente) {
  const hDest = LAB_HORA[clave];
  if (fuente === 'ayer') {
    for (let i = idxDia - 1; i >= 0; i--) { const s = dias[i].sorteos && dias[i].sorteos[clave]; if (s && s.numeros && s.numeros.length >= 3) return s.numeros.map(Number); }
    return null;
  }
  // 'anterior': la última lotería con resultado ANTES de esta (hoy; si no hay, la última de ayer)
  for (let i = idxDia; i >= Math.max(0, idxDia - 3); i--) {
    let mejor = null, hm = -1;
    for (const [k, s] of Object.entries(dias[i].sorteos || {})) {
      if (!LAB_HORA[k] || !s || !s.numeros || s.numeros.length < 3) continue;
      const h = LAB_HORA[k];
      if (i === idxDia && h >= hDest) continue;
      if (h > hm) { hm = h; mejor = s.numeros.map(Number); }
    }
    if (mejor) return mejor;
  }
  return null;
}
function labSerie(dias, idxDia, clave, max = 90) {
  const out = [];
  for (let i = Math.max(0, idxDia - max); i < idxDia; i++) { const s = dias[i].sorteos && dias[i].sorteos[clave]; if (s && s.numeros && s.numeros.length >= 3) out.push(s.numeros.map(Number)); }
  return out;
}
// Pirámide de fechas: cada fila suma los dígitos vecinos (último dígito) hasta que queda uno.
// base = pirámide(ayer)·10 + pirámide(hoy); números: base, equivalente (+5 a cada dígito), base+día y su vuelta, |base−día| y su vuelta
function labPiramide(fecha) {
  if (!fecha) return null;
  const pir = t => { let d = t.split('').map(Number); while (d.length > 1) d = d.slice(1).map((x, i) => (d[i] + x) % 10); return d[0]; };
  const ddmmaaaa = f => { const [y, m, d] = f.split('-'); return d + m + y; };
  const hoy = new Date(fecha + 'T12:00:00Z'); const ayer = new Date(hoy.getTime() - 86400000).toISOString().slice(0, 10);
  const base = pir(ddmmaaaa(ayer)) * 10 + pir(ddmmaaaa(fecha)); const dia = hoy.getUTCDate();
  const eq = n => ((Math.floor(n / 10) + 5) % 10) * 10 + (n % 10 + 5) % 10, vuelta = n => (n % 10) * 10 + Math.floor(n / 10);
  const suma = (base + dia) % 100, resta = Math.abs(base - dia);
  return [...new Set([base, eq(base), suma, vuelta(suma), resta, vuelta(resta)])];
}
function labCandidatos(est, dias, idxDia, clave) {
  const p = est.parametros || {}; const fuente = p.fuente || 'anterior';
  let c = null;
  if (est.tipo === 'codigoq') { const f = labFuente(dias, idxDia, clave, 'ayer'); c = f ? labCodigoQ(f[0], Number(p.Q) || 35.9) : null; }
  else if (est.tipo === 'fe') c = (p.numeros || []).map(Number);
  else if (est.tipo === 'piramide') c = labPiramide(dias[idxDia] && dias[idxDia].fecha);
  else if (est.tipo === 'frecuencia' || est.tipo === 'atrasados') {
    const serie = labSerie(dias, idxDia, clave); if (serie.length < 10) return null;
    const n = Math.min(10, Math.max(1, Number(p.n) || 3));
    if (est.tipo === 'frecuencia') { const cnt = {}; serie.forEach(s => s.forEach(x => (cnt[x] = (cnt[x] || 0) + 1))); c = [...Array(100).keys()].sort((a, b) => (cnt[b] || 0) - (cnt[a] || 0) || a - b).slice(0, n); }
    else { const ult = {}; serie.forEach((s, i) => s.forEach(x => (ult[x] = i))); c = [...Array(100).keys()].sort((a, b) => (ult[a] ?? -1) - (ult[b] ?? -1) || a - b).slice(0, n); }
  } else {
    const f = labFuente(dias, idxDia, clave, fuente); if (!f) return null;
    if (est.tipo === 'jaladera') c = labJal(f[0]);
    else if (est.tipo === 'gemelos') c = f.map(labGem);
    else if (est.tipo === 'espejo') c = f.map(labEsp).filter((x, i) => x !== f[i]);
    else if (est.tipo === 'repite') c = f;
    else if (est.tipo === 'vecinos') c = labVecinos(f[0]);
    else if (est.tipo === 'rodean') { const t = f[0] % 10, u = Math.floor(f[0] / 10); c = [t * 10 + (u + 9) % 10, t * 10 + (u + 1) % 10, ((t + 9) % 10) * 10 + u, ((t + 1) % 10) * 10 + u]; }
    else if (est.tipo === 'decena') c = [...Array(10).keys()].map(i => Math.floor(f[0] / 10) * 10 + i);
    else if (est.tipo === 'terminal') c = [...Array(10).keys()].map(i => i * 10 + f[0] % 10);
  }
  if (!c) return null;
  c = [...new Set(c.map(Number).filter(x => x >= 0 && x <= 99))];
  return c.length ? c : null;
}
// cada número = un punto de RD$1 → paga 60/8/4 según en qué premio salga
function labCobro(cands, real) {
  const P = AUTO.pagos.punto; let premio = 0, aciertos = 0;
  real.forEach((x, i) => { if (cands.includes(x)) premio += P[i] || 0; });
  const s = new Set(real); cands.forEach(x => { if (s.has(x)) aciertos++; });
  return { premio, aciertos };
}
function labAzar(n) { const s = new Set(); while (s.size < n) s.add(Math.floor(Math.random() * 100)); return [...s]; }

// ══════════ 🎰 KINO EN EL LABORATORIO (v9.11) ══════════
// Tickets de 10 números (RD$25). Premios Leidsa: 0 aciertos RD$80 · 5→60 · 6→300 · 7→1,000 · 8→10,000 · 9→150,000 · 10→25M
const KINO_PAGO = { 0: 80, 5: 60, 6: 300, 7: 1000, 8: 10000, 9: 150000, 10: 25000000 }, KINO_COSTO = 25;
const KINO_LAB = [
  { id: 'k-jaladora', nombre: 'Kino · Tabla jaladora', desc: 'Los 10 que más han salido AL DÍA SIGUIENTE de los 20 de ayer' },
  { id: 'k-vecinos', nombre: 'Kino · Vecinos ±1 de ayer', desc: 'Los que están al lado (−1 / +1) de los de ayer y más se repiten' },
  { id: 'k-espejo', nombre: 'Kino · Espejo de ayer', desc: 'Los de ayer al revés (17 → 71)' },
  { id: 'k-terminacion', nombre: 'Kino · Jaladora por terminación', desc: 'Las 2 terminaciones (último dígito) que más jalan las de ayer' },
  { id: 'k-decena', nombre: 'Kino · Decena caliente de ayer', desc: 'La decena (1er dígito) que más salió ayer, sin repetir los de ayer' },
  { id: 'k-suma', nombre: 'Kino · Suma de dígitos de ayer', desc: 'Números cuya suma de dígitos termina igual que la del 1er bolo de ayer' },
];
const kinoNombre = id => (KINO_LAB.find(k => k.id === id) || {}).nombre || id;
function kinoCobro(nums, real) { const s = new Set(real); const aciertos = nums.filter(n => s.has(n)).length; return { aciertos, premio: KINO_PAGO[aciertos] || 0 }; }
function kinoSerie(antesDe) { // [{fecha, nums}] en orden, solo días anteriores a 'antesDe' — TODO el historial (Supabase + memoria)
  const porFecha = {};
  for (const d of histTeoria.filas) porFecha[d.fecha] = d;
  for (const d of estado.historico) if (d.especiales && d.especiales.superkino && (d.especiales.superkino.numeros || []).length >= 20) porFecha[d.fecha] = d;
  return Object.values(porFecha).filter(d => d.fecha < antesDe).sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    .map(d => ({ fecha: d.fecha, nums: ((d.especiales && d.especiales.superkino && d.especiales.superkino.numeros) || []).map(Number) }))
    .filter(x => x.nums.length >= 20);
}
function kinoMax(serie) { return serie.some(x => x.nums.some(n => n > 80)) ? 84 : 80; }
function kinoTablaJaladora(serie) {
  const J = {}; for (let i = 1; i < serie.length; i++) for (const x of serie[i - 1].nums) { const c = J[x] = J[x] || {}; for (const y of serie[i].nums) c[y] = (c[y] || 0) + 1; }
  return J;
}
function kinoTicket(id, serie) {
  if (serie.length < 15) return null;
  const R = kinoMax(serie), ayer = serie[serie.length - 1].nums, fq = {};
  for (const x of serie) for (const n of x.nums) fq[n] = (fq[n] || 0) + 1;
  const todos = []; for (let n = 1; n <= R; n++) todos.push(n);
  const porFq = arr => [...arr].sort((a, b) => (fq[b] || 0) - (fq[a] || 0) || a - b);
  const porScore = sc => todos.filter(n => sc[n] !== undefined).sort((a, b) => sc[b] - sc[a] || (fq[b] || 0) - (fq[a] || 0) || a - b);
  let c = [];
  if (id === 'k-jaladora') { const J = kinoTablaJaladora(serie), sc = {}; for (const x of ayer) for (const [y, v] of Object.entries(J[x] || {})) sc[y] = (sc[y] || 0) + v; c = porScore(sc); }
  else if (id === 'k-vecinos') { const sc = {}; for (const x of ayer) for (const y of [x - 1, x + 1]) if (y >= 1 && y <= R && !ayer.includes(y)) sc[y] = (sc[y] || 0) + 1; c = porScore(sc); }
  else if (id === 'k-espejo') c = [...new Set(ayer.map(x => +String(x).padStart(2, '0').split('').reverse().join('')))].filter(y => y >= 1 && y <= R && !ayer.includes(y));
  else if (id === 'k-terminacion') {
    const JT = {}; for (let i = 1; i < serie.length; i++) for (const x of serie[i - 1].nums) { const t = JT[x % 10] = JT[x % 10] || {}; for (const y of serie[i].nums) t[y % 10] = (t[y % 10] || 0) + 1; }
    const st = {}; for (const x of ayer) for (const [t, v] of Object.entries(JT[x % 10] || {})) st[t] = (st[t] || 0) + v;
    const t2 = Object.keys(st).sort((a, b) => st[b] - st[a]).slice(0, 2).map(Number);
    c = porFq(todos.filter(n => t2.includes(n % 10)));
  } else if (id === 'k-decena') {
    const dd = {}; for (const x of ayer) dd[Math.floor(x / 10)] = (dd[Math.floor(x / 10)] || 0) + 1;
    const d1 = +Object.keys(dd).sort((a, b) => dd[b] - dd[a] || a - b)[0];
    c = porFq(todos.filter(n => Math.floor(n / 10) === d1 && !ayer.includes(n)));
  } else if (id === 'k-suma') { const sd = String(ayer[0]).split('').reduce((a, b) => a + +b, 0) % 10; c = porFq(todos.filter(n => (Math.floor(n / 10) + n % 10) % 10 === sd)); }
  c = c.slice(0, 10);
  for (const n of porFq(todos)) { if (c.length >= 10) break; if (!c.includes(n)) c.push(n); } // si faltan, se completa con los más frecuentes
  return c.sort((a, b) => a - b);
}
function kinoDigitos(serie, ultimos = 30) { // tabla de dígitos: terminación (último dígito) y decena (1er dígito)
  const sub = serie.slice(-ultimos), R = kinoMax(serie), cuantos = { t: {}, d: {} };
  for (let n = 1; n <= R; n++) { cuantos.t[n % 10] = (cuantos.t[n % 10] || 0) + 1; cuantos.d[Math.floor(n / 10)] = (cuantos.d[Math.floor(n / 10)] || 0) + 1; }
  const mk = (clave, f) => Object.keys(cuantos[clave]).map(Number).sort((a, b) => a - b).map(dig => {
    let veces = 0; sub.forEach(x => { veces += x.nums.filter(n => f(n) === dig).length; });
    const esperado = sub.length * 20 * cuantos[clave][dig] / R;
    const ayer = sub.length ? sub[sub.length - 1].nums.filter(n => f(n) === dig).length : 0;
    return { digito: dig, veces, esperado: +esperado.toFixed(1), diferencia: +(veces - esperado).toFixed(1), ayer, ayer_esperado: +(20 * cuantos[clave][dig] / R).toFixed(1) };
  });
  return { sorteos: sub.length, terminaciones: mk('t', n => n % 10), decenas: mk('d', n => Math.floor(n / 10)) };
}
async function kinoGenerar() {
  if (!SUPABASE_ACTIVO) return;
  const s = estado.especiales && estado.especiales.superkino; if (!s || (s.numeros && s.numeros.length >= 20)) return;
  const hora = horaDeHoy('superkino', s.hora); if (!enVentana(hora)) return;
  const hoy = fechaRD(); await cargarHistTeoria(); const serie = kinoSerie(hoy); if (serie.length < 15) return;
  const R = kinoMax(serie); const nuevas = [];
  if (labHechosFecha !== hoy) {
    labHechos.clear(); labHechosFecha = hoy;
    try { (await leerJugadas(`fecha=eq.${hoy}&origen=eq.lab&select=grupo`)).forEach(f => labHechos.add(f.grupo)); } catch (e) { labHechosFecha = null; return; }
  }
  for (const k of KINO_LAB) {
    const g = `labk|${k.id}`; if (labHechos.has(g)) continue;
    const c = kinoTicket(k.id, serie); if (!c) continue;
    const base = { clave: 'superkino', fecha: hoy, tipo: 'lab', hora_sorteo: hora, generado_rd: horaRD(), grupo: g, metodo: k.id, notificado: true, evaluado: false };
    const az = new Set(); while (az.size < 10) az.add(1 + Math.floor(Math.random() * R));
    nuevas.push({ ...base, id: `lab-${hoy}-${k.id}`, origen: 'lab', numeros: c });
    nuevas.push({ ...base, id: `labctl-${hoy}-${k.id}`, origen: 'labctl', numeros: [...az].sort((a, b) => a - b), grupo: g + '|ctl' });
    labHechos.add(g);
  }
  if (nuevas.length) await upsertJugadas(nuevas);
}
async function kinoVivo() {
  let filas; try { filas = await leerJugadasTodas(`clave=eq.superkino&origen=in.(lab,labctl)&evaluado=eq.true&select=id,metodo,origen,numeros,premio,aciertos,fecha`); } catch (e) { return null; }
  const v = {}; for (const f of filas) { const a = v[f.metodo] = v[f.metodo] || { sorteos: 0, aciertos: 0, cobro: 0, ctl_aciertos: 0, ctl_cobro: 0, ctl_sorteos: 0 };
    if (f.origen === 'labctl') { a.ctl_sorteos++; a.ctl_aciertos += +f.aciertos || 0; a.ctl_cobro += +f.premio || 0; } else { a.sorteos++; a.aciertos += +f.aciertos || 0; a.cobro += +f.premio || 0; } }
  return KINO_LAB.map(k => { const a = v[k.id] || { sorteos: 0, aciertos: 0, cobro: 0, ctl_aciertos: 0, ctl_cobro: 0, ctl_sorteos: 0 };
    return { id: k.id, nombre: k.nombre, desc: k.desc, sorteos: a.sorteos, prom_aciertos: a.sorteos ? +(a.aciertos / a.sorteos).toFixed(2) : null, azar_esperado: 2.38,
      jugado: a.sorteos * KINO_COSTO, cobro: a.cobro, ctl_prom: a.ctl_sorteos ? +(a.ctl_aciertos / a.ctl_sorteos).toFixed(2) : null, ctl_cobro: a.ctl_cobro }; });
}
async function kinoResumenTexto(hoy) {
  let filas; try { filas = await leerJugadas(`fecha=eq.${hoy}&clave=eq.superkino&origen=in.(lab,labctl)&evaluado=eq.true&select=metodo,origen,premio,aciertos`); } catch (e) { return ''; }
  if (!filas.length) return '';
  const hoyL = KINO_LAB.map(k => { const m = filas.find(f => f.metodo === k.id && f.origen === 'lab'), c = filas.find(f => f.metodo === k.id && f.origen === 'labctl');
    if (!m) return null; return `${m.premio > 0 ? '🟢' : '⚪'} ${k.nombre.replace('Kino · ', '')}: ${m.aciertos} aciertos${m.premio ? ` · cobra RD$${m.premio}` : ''} · azar ${c ? c.aciertos : '?'}`; }).filter(Boolean);
  const vivo = await kinoVivo() || [];
  const acum = vivo.filter(x => x.sorteos).map(x => `• ${x.nombre.replace('Kino · ', '')}: ${x.sorteos} sorteos · prom ${x.prom_aciertos} (azar 2.38) · RD$${x.cobro} de RD$${x.jugado}`);
  return `\n\n🎰 <b>KINO DEL LABORATORIO</b> (tickets de RD$25)\n${hoyL.join('\n')}${acum.length ? `\n\n📈 <b>Kino acumulado</b>\n${acum.join('\n')}` : ''}`;
}
app.get('/api/lab/kino', async (req, res) => {
  await cargarHistTeoria(); const hoy = fechaRD(); const serie = kinoSerie(hoy);
  let reg = {}; try { (await leerJugadas(`fecha=eq.${hoy}&clave=eq.superkino&origen=eq.lab&select=metodo,numeros,generado_rd,evaluado,aciertos,premio`)).forEach(f => { reg[f.metodo] = f; }); } catch (e) {}
  const s = estado.especiales && estado.especiales.superkino;
  const hoyT = KINO_LAB.map(k => { const r = reg[k.id]; return { id: k.id, nombre: k.nombre, desc: k.desc, numeros: r ? r.numeros.map(Number) : kinoTicket(k.id, serie),
    registrado: !!r, registrado_a: r ? r.generado_rd : null, evaluado: r ? r.evaluado : false, aciertos: r ? r.aciertos : null, premio: r ? r.premio : null }; });
  const J = kinoTablaJaladora(serie); const R = kinoMax(serie);
  const jaladora = {}; for (let n = 1; n <= R; n++) jaladora[n] = Object.entries(J[n] || {}).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 5).map(([y, v]) => ({ numero: +y, veces: v }));
  res.json({ fecha: hoy, hora: s ? horaDeHoy('superkino', s.hora) : null, resultado_hoy: s && s.numeros && s.numeros.length >= 20 ? s.numeros.map(Number) : null,
    sorteos_historial: serie.length, rango: `1-${R}`, ayer: serie.length ? serie[serie.length - 1] : null, hoy: hoyT, vivo: await kinoVivo(), digitos: kinoDigitos(serie), jaladora, pagos: KINO_PAGO, costo: KINO_COSTO });
});

// ── jugar en vivo (dentro de la ventana antes de cada sorteo) ──
const labHechos = new Set(); let labHechosFecha = null;
async function labGenerar() {
  if (!SUPABASE_ACTIVO) return;
  const ests = (await labCargar()).filter(e => e.activa !== false && LAB_TIPOS[e.tipo]);
  if (!ests.length) { try { await kinoGenerar(); } catch (e) {} return; }
  const hoy = fechaRD();
  if (labHechosFecha !== hoy) {
    labHechos.clear(); labHechosFecha = hoy;
    try { (await leerJugadas(`fecha=eq.${hoy}&origen=eq.lab&select=grupo`)).forEach(f => labHechos.add(f.grupo)); } catch (e) { labHechosFecha = null; return; }
  }
  const dias = [...estado.historico].filter(d => d.fecha < hoy).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).concat([{ fecha: hoy, sorteos: estado.sorteos }]);
  const idx = dias.length - 1; const nuevas = [];
  for (const est of ests) for (const clave of labLoterias(est)) {
    const s = estado.sorteos[clave]; const g = `lab|${est.id}|${clave}`;
    if (!s || labHechos.has(g) || (s.numeros && s.numeros.length >= 3)) continue;
    if (!enVentana(horaDeHoy(clave, s.hora))) continue;
    const c = labCandidatos(est, dias, idx, clave); if (!c) continue;
    const base = { clave, fecha: hoy, tipo: 'lab', hora_sorteo: s.hora, generado_rd: horaRD(), grupo: g, metodo: est.id, notificado: true, evaluado: false };
    nuevas.push({ ...base, id: `lab-${hoy}-${est.id}-${clave}`, origen: 'lab', numeros: c });
    nuevas.push({ ...base, id: `labctl-${hoy}-${est.id}-${clave}`, origen: 'labctl', numeros: labAzar(c.length), grupo: g + '|ctl' });
    labHechos.add(g);
  }
  if (nuevas.length) await upsertJugadas(nuevas);
  try { await kinoGenerar(); } catch (e) { console.log('kino lab:', e.message); }
}
async function labEvaluar() {
  if (!SUPABASE_ACTIVO) return;
  const desde = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10);
  let pend; try { pend = await leerJugadas(`evaluado=eq.false&origen=in.(lab,labctl)&fecha=gte.${desde}&select=*&limit=2000`); } catch (e) { return; }
  const listas = [];
  for (const j of pend) {
    const esKino = j.clave === 'superkino';
    const real = esKino ? resultadoDe('especiales', 'superkino', j.fecha) : resultadoDe('sorteos', j.clave, j.fecha);
    if (!real || real.length < (esKino ? 20 : 3)) continue;
    const { premio, aciertos } = esKino ? kinoCobro((j.numeros || []).map(Number), real) : labCobro((j.numeros || []).map(Number), real);
    listas.push({ ...j, resultado: real, aciertos, premio, gano: premio > 0, evaluado: true, evaluado_en: new Date().toISOString() });
  }
  if (!listas.length) return;
  if (!(await upsertJugadas(listas))) return;
  // aviso por Telegram cuando una estrategia del laboratorio pega
  const pegaron = listas.filter(j => j.origen === 'lab' && j.premio > 0);
  if (pegaron.length && TG_ACTIVO) {
    const nombres = Object.fromEntries((await labCargar()).map(e => [e.id, e.nombre])); KINO_LAB.forEach(k => { nombres[k.id] = k.nombre; });
    const f2 = n => String(n).padStart(2, '0');
    await enviarTelegram(`🧪 <b>¡PEGÓ EN EL LABORATORIO!</b> (en papel)\n\n` + pegaron.map(j =>
      `🎯 <b>${nombres[j.metodo] || j.metodo}</b> — ${j.clave === 'superkino' ? 'Super Kino TV' : (estado.sorteos[j.clave]?.nombre || j.clave)}\n     Jugó: ${j.numeros.map(f2).join('-')}${j.clave === 'superkino' ? ` · ${j.aciertos} aciertos` : ` · salió ${j.resultado.map(f2).join('-')}`}\n     Cobraría <b>RD$${j.premio}</b> por RD$${j.clave === 'superkino' ? KINO_COSTO : j.numeros.length} jugados`).join('\n\n'));
  }
}

// ── backtest sobre todo el historial ──
function labBacktest(est, dias) {
  let jug = 0, costo = 0, cobro = 0, ac = 0, esp = 0, vari = 0, ctlCobro = 0, ganadas = 0;
  const lots = labLoterias(est);
  for (let i = 0; i < dias.length; i++) for (const clave of lots) {
    const s = dias[i].sorteos && dias[i].sorteos[clave]; if (!s || !s.numeros || s.numeros.length < 3) continue;
    const c = labCandidatos(est, dias, i, clave); if (!c) continue;
    const real = s.numeros.slice(0, 3).map(Number); const r = labCobro(c, real); const p = new Set(real).size / 100;
    jug++; costo += c.length; cobro += r.premio; ac += r.aciertos; esp += c.length * p; vari += c.length * p * (1 - p); if (r.premio > 0) ganadas++;
    ctlCobro += labCobro(labAzar(c.length), real).premio;
  }
  return { jugadas: jug, costo, cobro, ganadas, retorno: costo ? +(cobro / costo).toFixed(3) : null, aciertos: ac, esperado: +esp.toFixed(1),
           pct_vs_azar: esp ? Math.round(100 * ac / esp) : null, z: vari ? +((ac - esp) / Math.sqrt(vari)).toFixed(2) : null,
           control_retorno: costo ? +(ctlCobro / costo).toFixed(3) : null };
}
function labDiasCompletos() {
  const porFecha = {};
  for (const d of histTeoria.filas) porFecha[d.fecha] = d;
  for (const d of estado.historico) porFecha[d.fecha] = d;
  delete porFecha[estado.fecha];
  return Object.values(porFecha).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}
const labBtCache = {}; // id → {fecha, firma, res}

// ── API ──
app.get('/api/lab/tipos', (req, res) => res.json({ tipos: LAB_TIPOS, fuentes: LAB_FUENTES, loterias_auto: AUTO.loterias,
  loterias: Object.fromEntries(Object.entries(crearSorteos()).map(([k, s]) => [k, s.nombre])) }));
app.get('/api/lab/estrategias', async (req, res) => { const e = await labCargar(true); res.json({ estrategias: e, tabla_ok: labTablaOk }); });
app.post('/api/lab/estrategias', async (req, res) => {
  const b = req.body || {};
  if (!b.nombre || !LAB_TIPOS[b.tipo]) return res.status(400).json({ error: 'Falta nombre o tipo válido' });
  const fila = { id: b.id || `${b.tipo}-${Date.now().toString(36)}`, nombre: String(b.nombre).slice(0, 60), tipo: b.tipo,
    parametros: b.parametros || {}, loterias: b.loterias === 'todas' ? 'todas' : Array.isArray(b.loterias) && b.loterias.length ? b.loterias.filter(k => LAB_HORA[k]) : 'auto', activa: b.activa !== false };
  if (fila.tipo === 'fe') fila.parametros.numeros = (fila.parametros.numeros || []).map(Number).filter(x => x >= 0 && x <= 99).slice(0, 20);
  try {
    await axios.post(`${SUPABASE_URL}/rest/v1/estrategias?on_conflict=id`, fila, { headers: { ...SB_HEADERS(), Prefer: 'resolution=merge-duplicates,return=minimal' }, timeout: 15000 });
    delete labBtCache[fila.id]; await labCargar(true); res.json({ ok: true, estrategia: fila });
  } catch (e) { res.status(500).json({ error: `${e.response?.status || ''} ${JSON.stringify(e.response?.data || e.message).slice(0, 200)}` }); }
});
app.post('/api/lab/borrar', async (req, res) => {
  const id = req.body && req.body.id; if (!id) return res.status(400).json({ error: 'Falta id' });
  try { await axios.delete(`${SUPABASE_URL}/rest/v1/estrategias?id=eq.${encodeURIComponent(id)}`, { headers: SB_HEADERS(), timeout: 15000 }); await labCargar(true); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
// Números de HOY de cada estrategia activa, para los sorteos que todavía no han salido
app.get('/api/lab/hoy', async (req, res) => {
  const ests = (await labCargar(true)).filter(e => e.activa !== false && LAB_TIPOS[e.tipo]);
  const hoy = fechaRD();
  const dias = [...estado.historico].filter(d => d.fecha < hoy).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).concat([{ fecha: hoy, sorteos: estado.sorteos }]);
  // lo que YA quedó registrado hoy en Mis Jugadas (esos números ya no cambian)
  const reg = {};
  try { (await leerJugadas(`fecha=eq.${hoy}&origen=eq.lab&select=grupo,numeros,generado_rd`)).forEach(f => { reg[f.grupo] = f; }); } catch (e) {}
  const out = [];
  for (const est of ests) for (const clave of labLoterias(est)) {
    const s = estado.sorteos[clave]; if (!s || (s.numeros && s.numeros.length >= 3)) continue;
    const r = reg[`lab|${est.id}|${clave}`];
    const c = r ? (r.numeros || []).map(Number) : labCandidatos(est, dias, dias.length - 1, clave); if (!c || !c.length) continue;
    out.push({ estrategia: est.id, nombre: est.nombre, clave, loteria: s.nombre, hora: horaDeHoy(clave, s.hora), minutos: horaTextoAMinutos(horaDeHoy(clave, s.hora)), numeros: c,
      registrado: !!r, registrado_a: r ? r.generado_rd || null : null });
  }
  out.sort((a, b) => (a.minutos ?? 9999) - (b.minutos ?? 9999));
  res.json({ fecha: hoy, jugadas: out, nota: "Los ✅ ya están registrados y no cambian. Los ⏳ todavía pueden cambiar hasta que se registren (~75 min antes)." });
});
app.get('/api/lab/ranking', async (req, res) => {
  const ests = await labCargar(true);
  await cargarHistTeoria();
  const dias = labDiasCompletos();
  const dias90 = Math.min(365, Math.max(1, parseInt(req.query.dias, 10) || 90));
  const desde = new Date(Date.now() - (dias90 - 1) * 86400000 - 4 * 3600000).toISOString().slice(0, 10);
  let filas = [];
  try { filas = await leerJugadas(`fecha=gte.${desde}&origen=in.(lab,labctl)&evaluado=eq.true&select=metodo,origen,numeros,resultado,aciertos,premio&limit=20000`); } catch (e) {}
  const vivo = {};
  for (const f of filas) {
    const v = vivo[f.metodo] = vivo[f.metodo] || { jugadas: 0, costo: 0, cobro: 0, ganadas: 0, aciertos: 0, esperado: 0, ctl_costo: 0, ctl_cobro: 0 };
    const n = (f.numeros || []).length;
    if (f.origen === 'labctl') { v.ctl_costo += n; v.ctl_cobro += Number(f.premio) || 0; continue; }
    const p = new Set(f.resultado || []).size / 100;
    v.jugadas++; v.costo += n; v.cobro += Number(f.premio) || 0; v.ganadas += f.premio > 0 ? 1 : 0; v.aciertos += f.aciertos || 0; v.esperado += n * p;
  }
  const out = ests.map(e => {
    const firma = JSON.stringify([e.tipo, e.parametros, labLoterias(e)]);
    let bt = labBtCache[e.id];
    if (!bt || bt.fecha !== fechaRD() || bt.firma !== firma) bt = labBtCache[e.id] = { fecha: fechaRD(), firma, res: labBacktest(e, dias) };
    const v = vivo[e.id] || null;
    return { ...e, tipo_nombre: LAB_TIPOS[e.tipo]?.nombre, loterias_usadas: labLoterias(e), historial: bt.res,
      vivo: v && { ...v, retorno: v.costo ? +(v.cobro / v.costo).toFixed(3) : null, control_retorno: v.ctl_costo ? +(v.ctl_cobro / v.ctl_costo).toFixed(3) : null } };
  });
  res.json({ dias_historial: dias.length, desde_vivo: desde, tabla_ok: labTablaOk, estrategias: out,
    nota: 'retorno = lo que devuelve cada RD$1 (1.0 = quedó igual). Jugando puntos al azar el retorno esperado es ≈0.72.' });
});
// resumen por Telegram (una vez por noche)
let labResumenEnviado = null;
async function labResumenNoche() {
  if (!TG_ACTIVO || !SUPABASE_ACTIVO) return;
  const hoy = fechaRD();
  if (labResumenEnviado === hoy || minutosActualesRD() < 23 * 60 + 20) return;
  labResumenEnviado = hoy;
  if (yaEnviado('lab')) return;
  let filas; try { filas = (await leerJugadas(`fecha=eq.${hoy}&origen=in.(lab,labctl)&evaluado=eq.true&select=metodo,origen,numeros,premio,aciertos,clave`)).filter(f => f.clave !== 'superkino'); } catch (e) { return; }
  const kinoTxt = await kinoResumenTexto(hoy);
  if (!filas.length && !kinoTxt) return;
  await marcarEnviado('lab');
  const ests = Object.fromEntries((await labCargar()).map(e => [e.id, e.nombre]));
  const agg = {};
  for (const f of filas) { const a = agg[f.metodo] = agg[f.metodo] || { c: 0, w: 0, cc: 0, cw: 0, hits: [] };
    const n = (f.numeros || []).length; if (f.origen === 'labctl') { a.cc += n; a.cw += +f.premio || 0; } else { a.c += n; a.w += +f.premio || 0; if (f.premio > 0) a.hits.push(estado.sorteos[f.clave]?.nombre || f.clave); } }
  const lineas = Object.entries(agg).sort((a, b) => (b[1].w - b[1].c) - (a[1].w - a[1].c)).map(([id, a]) =>
    `${a.w > a.c ? '🟢' : a.w > 0 ? '🟡' : '⚪'} <b>${ests[id] || id}</b>: jugó RD$${a.c} · cobró RD$${a.w}${a.hits.length ? ` (${a.hits.join(', ')})` : ''} · azar cobró RD$${a.cw}`);
  const vig = await labVigilar();
  await enviarTelegram(`🧪 <b>LABORATORIO DE ESTRATEGIAS</b> — ${hoy}\n<i>En papel: cada número = un punto de RD$1</i>\n\n${lineas.join('\n')}${vig}${kinoTxt}`);
}

// ── VIGILANTE (v9.9): con suficientes sorteos EN VIVO, pausa sola la estrategia que pierde
// claramente contra el azar y avisa la que va claramente por encima.
// Cada número = punto RD$1 que paga 60/8/4 → el azar devuelve 0.72 por peso, desviación ≈ 6.02 por número.
async function leerJugadasTodas(query) { // Supabase devuelve máx. 1000 filas por consulta → se lee por páginas
  const out = []; for (let off = 0; off < 200000; off += 1000) {
    const p = await leerJugadas(`${query}&order=id.asc&limit=1000&offset=${off}`); out.push(...p); if (p.length < 1000) break; }
  return out;
}
const LAB_MIN_SORTEOS = 60, LAB_Z_PAUSA = -2, LAB_Z_BUENA = 2;
function labVivo(filas, desde) {
  // se juzga por ACIERTOS (cada número tiene 3% de salir en algún premio) y el dinero como 2da condición
  const r = { sorteos: 0, nums: 0, cobro: 0, aciertos: 0 };
  for (const f of filas) { if (desde && f.fecha < desde) continue; r.sorteos++; r.nums += (f.numeros || []).length; r.cobro += Number(f.premio) || 0; r.aciertos += Number(f.aciertos) || 0; }
  r.ret = r.nums ? r.cobro / r.nums : null;
  r.esperados = +(0.03 * r.nums).toFixed(1);
  r.z = r.nums ? +((r.aciertos - 0.03 * r.nums) / Math.sqrt(r.nums * 0.03 * 0.97)).toFixed(2) : 0;
  return r;
}
async function labVigilar() {
  let filas; try { filas = await leerJugadasTodas(`origen=eq.lab&evaluado=eq.true&select=id,metodo,numeros,premio,aciertos,fecha`); } catch (e) { return ''; }
  const por = {}; for (const f of filas) if (!String(f.metodo).startsWith('k-')) (por[f.metodo] = por[f.metodo] || []).push(f);
  const ests = (await labCargar(true)).filter(e => e.activa !== false);
  const lin = []; let cambio = false;
  for (const e of ests) {
    const v = labVivo(por[e.id] || [], e.creado ? String(e.creado).slice(0, 10) : null);
    if (!v.sorteos) continue;
    let marca = '';
    if (v.sorteos >= LAB_MIN_SORTEOS && v.z <= LAB_Z_PAUSA && v.ret < 0.72) {
      try { await axios.patch(`${SUPABASE_URL}/rest/v1/estrategias?id=eq.${encodeURIComponent(e.id)}`, { activa: false }, { headers: SB_HEADERS(), timeout: 15000 }); cambio = true; marca = ' ⏸ <b>PAUSADA</b> (pierde claramente contra el azar)'; } catch (er) {}
    } else if (v.sorteos >= LAB_MIN_SORTEOS && v.z >= LAB_Z_BUENA && v.ret > 0.72) marca = ' 🌟 va por encima del azar (sigue a prueba)';
    else if (v.sorteos < LAB_MIN_SORTEOS) marca = ` · faltan ${LAB_MIN_SORTEOS - v.sorteos} sorteos para juzgarla`;
    lin.push(`• ${e.nombre}: ${v.sorteos} sorteos · aciertos ${v.aciertos} (azar ~${v.esperados}) · ret ${v.ret.toFixed(2)}${marca}`);
  }
  if (cambio) await labCargar(true);
  return lin.length ? `\n\n📈 <b>En vivo desde que empezó</b>\n${lin.join('\n')}` : '';
}
app.get('/api/lab/vivo', async (req, res) => {
  let filas; try { filas = await leerJugadasTodas(`origen=eq.lab&evaluado=eq.true&select=id,metodo,numeros,premio,aciertos,fecha`); } catch (e) { return res.status(500).json({ error: e.message }); }
  const por = {}; for (const f of filas) (por[f.metodo] = por[f.metodo] || []).push(f);
  const ests = await labCargar(true);
  res.json({ regla: `Con ${LAB_MIN_SORTEOS}+ sorteos: aciertos con z ≤ ${LAB_Z_PAUSA} y retorno < 0.72 → se pausa sola; z ≥ ${LAB_Z_BUENA} y retorno > 0.72 → se avisa como prometedora.`,
    estrategias: ests.map(e => ({ id: e.id, nombre: e.nombre, activa: e.activa !== false, ...labVivo(por[e.id] || [], e.creado ? String(e.creado).slice(0, 10) : null) })) });
});

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
  console.log(`\n🚀 Reydis Engine v9.17-RODEAN-TODAS en puerto ${PORT}`);
  await inicializarPersistenciaRemota();
  if (TG_ACTIVO) await enviarTelegram(`🚀 <b>REYDIS RADAR PRO</b> — Servidor Reiniciado y Conectado`);
  await sincronizar();

  const SELF_URL = process.env.RENDER_EXTERNAL_URL || `https://reydis-bot-service.onrender.com`;
  setInterval(async () => { try { await axios.get(`${SELF_URL}/`, { timeout: 5000 }); } catch (e) {} }, 14 * 60 * 1000);
});
