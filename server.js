const express = require('express');
const axios   = require('axios');
const cheerio = require('cheerio');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3000;

// ── TELEGRAM BOT — Alertas en tiempo real ────────────────────────────────────
// Variables de entorno en Render:
//   TELEGRAM_TOKEN    = token del bot (de BotFather)
//   TELEGRAM_CHAT_IDS = chat IDs separados por coma (ej: 8490682294,123456789)
//                       (también acepta TELEGRAM_CHAT_ID para compatibilidad)
// Si no están configuradas, las alertas se ignoran silenciosamente.
const TG_TOKEN   = process.env.TELEGRAM_TOKEN || '';
const TG_CHAT_IDS = (() => {
  const raw = process.env.TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
})();
const TG_ACTIVO = !!(TG_TOKEN && TG_CHAT_IDS.length);

// Registro de sorteos ya notificados hoy (clave → true)
// Se reinicia al cambiar de día junto con estado.sorteos
const yaNotificado = {};

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
      const err = r.reason?.response?.data || r.reason?.message;
      console.error(`  ⚠️ Telegram REJECTED (chat ${TG_CHAT_IDS[i]}):`, JSON.stringify(err));
    } else if (r.value?.data?.ok === false) {
      // HTTP 200 pero Telegram rechazó el mensaje (ej. HTML inválido, chat no iniciado)
      console.error(`  ⚠️ Telegram OK:false (chat ${TG_CHAT_IDS[i]}):`, JSON.stringify(r.value.data));
    }
  });
}

// Notifica todos los sorteos nuevos que aparecieron en este sync.
// IMPORTANTE: estos mensajes son RESULTADOS REALES ya confirmados (el
// sorteo ya salió). Se marcan explícitamente con ✅ RESULTADO REAL para que
// nunca se puedan confundir con los mensajes de predicción (que usan 🔮 y
// se mandan ANTES de que el sorteo ocurra).
async function notificarNuevosSorteos() {
  if (!TG_ACTIVO) return;

  // Recopilar todos los resultados nuevos (no notificados aún)
  const nuevos = [];
  for (const [k, s] of Object.entries(estado.sorteos)) {
    if (s.numeros.length >= 3 && !yaNotificado[k]) {
      nuevos.push({ tipo: 'sorteo', clave: k, nombre: s.nombre, hora: s.hora, numeros: s.numeros });
    }
  }
  for (const [k, c] of Object.entries(estado.cuartetas)) {
    if (c.numeros.length >= 4 && !yaNotificado[k]) {
      nuevos.push({ tipo: 'cuarteta', clave: k, nombre: c.nombre, hora: c.hora, numeros: c.numeros });
    }
  }
  for (const [k, e] of Object.entries(estado.especiales)) {
    if (e.numeros.length > 0 && !yaNotificado[k]) {
      nuevos.push({ tipo: 'especial', clave: k, nombre: e.nombre, hora: e.hora, numeros: e.numeros, empresa: e.empresa });
    }
  }

  if (nuevos.length === 0) return;

  console.log(`📱 Notificando ${nuevos.length} resultado(s) en UN solo mensaje (modo resumen anti-ban)...`);

  // Marcar todos como notificados ANTES de enviar para evitar duplicados
  for (const n of nuevos) yaNotificado[n.clave] = true;

  // MODO RESUMEN: un solo mensaje con todos los resultados del lote.
  // El bot anterior fue baneado por mandar ráfagas de 15+ mensajes —
  // este patrón (1 mensaje consolidado) es el perfil sano para Telegram.
  const lineas = nuevos.map(n => {
    const nums = n.numeros.map(x => String(x).padStart(2, '0')).join(' - ');
    const etiqueta = n.tipo === 'cuarteta' ? '🎲' : n.tipo === 'especial' ? '🎰' : '✅';
    const extra = n.empresa ? ` [${n.empresa}]` : '';
    return `${etiqueta} <b>${n.nombre}</b>${extra} (${n.hora})\n     🔢 <b>${nums}</b>`;
  });
  const msg = `🇩🇴 <b>REYDIS RADAR PRO</b> — ${fechaRD()}\n` +
    `📥 <b>${nuevos.length} resultado(s) nuevo(s):</b>\n\n` +
    lineas.join('\n\n');
  await enviarTelegram(msg);
  console.log(`📱 Completado: ${nuevos.length} resultado(s) en 1 mensaje`);
}

// ── PREDICCIONES por Telegram ─────────────────────────────────────────────────
// Mismo método que el frontend: peso por posición 60-8-4 para quinielas
// (1ra posición vale más porque paga más en la vida real), frecuencia simple
// para La Cuarteta (no hay orden en ese juego). Usa SOLO días ya cerrados
// (estado.historico), nunca el día de hoy en progreso, para no hacer trampa.
// Antes exigía 3 días — bajado a 2 para cubrir más loterías desde el inicio.
// Con 2 días ya hay señal real; la calidad mejora sola cada día que pasa.
const MIN_DIAS_PREDICCION = 2;

// Helper para formatear dígitos a 2 posiciones
const p2s = n => String(n).padStart(2, '0');
// Indicador de confianza basado en días de historial
const confianzaIcon = d => d >= 10 ? '🟢' : d >= 5 ? '🟡' : '🔴';

// ── Predicción de quiniela (3 números) ──────────────────────────────────────
// Mejoras vs versión anterior:
//   1. RECENCIA: días más recientes cuentan más (peso = posición inversa)
//   2. PALE: los 2 números con mayor frecuencia total (independiente de posición)
//   3. FRÍO: número con historial que NO salió en los últimos 3 sorteos
//   4. Confianza: 🟢 ≥10d / 🟡 ≥5d / 🔴 <5d
function calcularPrediccionQuiniela(clave) {
  const datos = estado.historico
    .filter(h => h.sorteos?.[clave]?.numeros?.length >= 3)
    .map(h => h.sorteos[clave].numeros);
  if (datos.length < MIN_DIAS_PREDICCION) return null;

  const scorePond = {}, freqTotal = {};
  datos.forEach((nums, idx) => {
    // datos[0] = más reciente; le damos peso mayor
    const recencia = Math.max(1, datos.length - idx);
    if (nums[0] !== undefined) {
      scorePond[nums[0]] = (scorePond[nums[0]] || 0) + 60 * recencia;
      freqTotal[nums[0]] = (freqTotal[nums[0]] || 0) + 1;
    }
    if (nums[1] !== undefined) {
      scorePond[nums[1]] = (scorePond[nums[1]] || 0) + 8 * recencia;
      freqTotal[nums[1]] = (freqTotal[nums[1]] || 0) + 1;
    }
    if (nums[2] !== undefined) {
      scorePond[nums[2]] = (scorePond[nums[2]] || 0) + 4 * recencia;
      freqTotal[nums[2]] = (freqTotal[nums[2]] || 0) + 1;
    }
  });

  const sortedPond = Object.entries(scorePond).sort((a, b) => b[1] - a[1]);
  const top3 = sortedPond.slice(0, 3).map(([n]) => +n);

  // Pale: top 2 por frecuencia total (no importa posición)
  const topPale = Object.entries(freqTotal)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([n]) => +n);

  // Frío: tiene historial pero no salió en la ventana reciente
  const ventana = Math.min(4, datos.length);
  const recientes = new Set(datos.slice(0, ventana).flat());
  const candidatosFrios = Object.entries(freqTotal)
    .filter(([n]) => !recientes.has(+n))
    .sort((a, b) => b[1] - a[1]);
  const topFrio = candidatosFrios.length > 0 ? +candidatosFrios[0][0] : null;

  return {
    top3,       // Super Pale ponderado (top 3 con recencia)
    top1: top3[0],  // Punto (mejor número solo)
    topPale,    // Pale histórico (top 2 por frecuencia)
    topFrio,    // Número frío (atrasado, candidato por equilibrio)
    dias: datos.length,
    icon: confianzaIcon(datos.length)
  };
}

// ── Predicción de La Cuarteta (4 números sin orden) ──────────────────────────
function calcularPrediccionCuarteta(clave) {
  const datos = estado.historico
    .filter(h => h.cuartetas?.[clave]?.numeros?.length >= 4)
    .map(h => h.cuartetas[clave].numeros);
  if (datos.length < MIN_DIAS_PREDICCION) return null;

  const freq = {};
  datos.forEach((nums, idx) => {
    const w = Math.max(1, datos.length - idx);
    for (const n of nums) freq[n] = (freq[n] || 0) + w;
  });
  const top4 = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => +n);
  return { top4, dias: datos.length, icon: confianzaIcon(datos.length) };
}

// ── Predicción dígitos posicionales (Pega 3, Pega 4, El Quemaito) ──────────
function calcularPrediccionDigitos(clave, cantDigitos) {
  const datos = estado.historico
    .filter(h => h.especiales?.[clave]?.numeros?.length >= cantDigitos)
    .map(h => h.especiales[clave].numeros);
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

// ── Predicción por frecuencia general (Super Kino, Loto, Mega Chance) ───────
function calcularPrediccionFrecuenciaEspecial(clave, cantNumeros) {
  const datos = estado.historico
    .filter(h => h.especiales?.[clave]?.numeros?.length > 0)
    .map(h => h.especiales[clave].numeros);
  if (datos.length < MIN_DIAS_PREDICCION) return null;

  const freq = {};
  datos.forEach((nums, idx) => {
    const w = Math.max(1, datos.length - idx);
    for (const n of nums) freq[n] = (freq[n] || 0) + w;
  });
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, cantNumeros).map(([n]) => +n);
  return { top, dias: datos.length };
}


const TIPO_PRED_CANT = { kino: 10, loto: 6, lotomas: 7 };

async function enviarPrediccionesTelegram() {
  if (!TG_ACTIVO) return { enviado: false, motivo: 'Telegram no configurado' };

  const fmtN = arr => arr.map(n => p2s(n)).join(' - ');

  // ── Mensaje 1: Quinielas ──────────────────────────────────────────────────
  // Formato por lotería:
  //   🟢 Gana Más (2:30 PM)  — predicción (6d)
  //   🎯 Punto: 34  |  ↩️ Pale: 34-12  |  🎲 34-12-67  |  ❄️ Frío: 08
  let msg1 = `🔮 <b>PREDICCIONES QUINIELAS — ${fechaRD()}</b>\n<i>⚠️ Predicción, NO resultado real. 🟢=alta confianza 🟡=media 🔴=pocos datos</i>\n\n`;
  let conDatos = 0;
  const pendientes1 = [];

  for (const [k, s] of Object.entries(estado.sorteos)) {
    const p = calcularPrediccionQuiniela(k);
    if (p) {
      msg1 += `${p.icon} <b>${s.nombre}</b> (${s.hora}) <i>(${p.dias}d)</i>\n`;
      msg1 += `🎯 <code>${p2s(p.top1)}</code>  ↩️ <code>${fmtN(p.topPale)}</code>  🎲 <code>${fmtN(p.top3)}</code>`;
      if (p.topFrio !== null) msg1 += `  ❄️ <code>${p2s(p.topFrio)}</code>`;
      msg1 += `\n\n`;
      conDatos++;
    } else {
      // Cuenta cuántos días tiene aunque no llegue al mínimo
      const diasDisp = estado.historico.filter(h => h.sorteos?.[k]?.numeros?.length >= 3).length;
      pendientes1.push(`${s.nombre}: ${diasDisp}/${MIN_DIAS_PREDICCION}d`);
    }
  }
  if (conDatos === 0) {
    msg1 += `⏳ Sin datos suficientes aún. Días en historial: ${estado.historico.length}`;
  }
  if (pendientes1.length > 0) {
    msg1 += `\n⏳ <i>Pronto: ${pendientes1.join(', ')}</i>`;
  }
  await enviarTelegram(msg1);

  // ── Mensaje 2: La Cuarteta ───────────────────────────────────────────────
  let msg2 = `🔮 <b>PREDICCIONES LA CUARTETA — ${fechaRD()}</b>\n<i>⚠️ Predicción, NO resultado real. Top 4 con recencia.</i>\n\n`;
  let conDatosC = 0;
  const pendientes2 = [];

  for (const [k, c] of Object.entries(estado.cuartetas)) {
    const p = calcularPrediccionCuarteta(k);
    if (p) {
      msg2 += `${p.icon} <b>${c.nombre}</b> (${c.hora}) <i>(${p.dias}d)</i>\n`;
      msg2 += `🎲 <code>${fmtN(p.top4)}</code>\n\n`;
      conDatosC++;
    } else {
      const d = estado.historico.filter(h => h.cuartetas?.[k]?.numeros?.length >= 4).length;
      pendientes2.push(`${c.nombre}: ${d}/${MIN_DIAS_PREDICCION}d`);
    }
  }
  if (conDatosC === 0) msg2 += `⏳ Sin datos suficientes para La Cuarteta todavía.`;
  if (pendientes2.length > 0) msg2 += `\n⏳ <i>Pronto: ${pendientes2.join(', ')}</i>`;
  await enviarTelegram(msg2);

  // ── Mensaje 3: Juegos especiales ─────────────────────────────────────────
  let msg3 = `🔮 <b>PREDICCIONES JUEGOS ESPECIALES — ${fechaRD()}</b>\n<i>⚠️ Predicción, NO resultado real.</i>\n\n`;
  let conDatosE = 0;
  const pendientes3 = [];

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
    if (pred) {
      msg3 += `${confianzaIcon(pred.dias)} <b>${e.nombre}</b> [${e.empresa}] (${e.hora}) <i>(${pred.dias}d)</i>\n`;
      msg3 += `🔢 <code>${pred.texto}</code>\n\n`;
      conDatosE++;
    } else {
      const d = estado.historico.filter(h => (h.especiales?.[k]?.numeros?.length || 0) > 0).length;
      pendientes3.push(`${e.nombre}: ${d}/${MIN_DIAS_PREDICCION}d`);
    }
  }
  if (conDatosE === 0) msg3 += `⏳ Sin datos suficientes para juegos especiales todavía.`;
  if (pendientes3.length > 0) msg3 += `\n⏳ <i>Pronto: ${pendientes3.join(', ')}</i>`;
  await enviarTelegram(msg3);

  console.log(`🔮 Predicciones TG: ${conDatos}/${Object.keys(estado.sorteos).length} quinielas · ${conDatosC}/4 cuartetas · ${conDatosE}/${Object.keys(estado.especiales).length} especiales`);
  return {
    enviado: true,
    quinielas: { con_datos: conDatos, pendientes: pendientes1.length },
    cuartetas: { con_datos: conDatosC, pendientes: pendientes2.length },
    especiales: { con_datos: conDatosE, pendientes: pendientes3.length },
    dias_historico: estado.historico.length
  };
}

// Evita reenviar las predicciones más de una vez por día
let ultimaPrediccionFecha = null;
async function chequearEnvioAutomaticoPredicciones() {
  if (!TG_ACTIVO) return;
  const [hh] = horaRD().split(':').map(Number);
  // Envía una sola vez, en la franja de 7:00-7:14 AM hora RD (antes de
  // que empiecen los sorteos del día, que arrancan ~10:00 AM)
  if (hh === 7 && ultimaPrediccionFecha !== estado.fecha) {
    ultimaPrediccionFecha = estado.fecha;
    await enviarPrediccionesTelegram();
    try { await enviarTelegram(textoCodigoQ()); } catch (e) { console.error('⚠️ Código Q diario:', e.message); }
  }
}

// ── Persistencia en disco (best-effort) ───────────────────────────────────────
// Render Free no garantiza disco persistente entre DEPLOYS (se borra al
// redesplegar), pero SÍ conserva el filesystem de la misma instancia entre
// ciclos de sueño/despertar. Esto evita perder el histórico cada vez que el
// servidor "duerme" por inactividad, que era el caso anterior (solo memoria).
// Si quieres persistencia garantizada incluso entre redeploys, lo correcto es
// una base de datos real (ej. Render Postgres free, o Supabase) — avísame si
// quieres que lo conectemos.
const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'estado.json');

function guardarEnDisco() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      fecha: estado.fecha,
      historico: estado.historico
    }));
  } catch (e) {
    console.error('⚠️ No se pudo guardar en disco:', e.message);
  }
}

function cargarDeDisco() {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('⚠️ No se pudo leer del disco:', e.message);
    return null;
  }
}

app.use(cors({ origin: '*' }));
app.options('*', cors());
app.use(express.json());

// ── Zona horaria RD ──────────────────────────────────────────────────────────
function fechaRD() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}
function horaRD() {
  return new Intl.DateTimeFormat('es-DO', {
    timeZone: 'America/Santo_Domingo',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
}
function horaNumRD() {
  return parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santo_Domingo', hour: '2-digit', hour12: false
  }).format(new Date()), 10);
}

// ── Persistencia REMOTA: Supabase (sobrevive a redeploys) ────────────────────
// Si SUPABASE_URL y SUPABASE_KEY están configuradas como variables de entorno
// en Render, el histórico se guarda ahí (permanente). Si no están configuradas,
// el sistema sigue funcionando con solo el disco local (como antes) — no se
// rompe nada si todavía no las has puesto.
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const SUPABASE_ACTIVO = !!(SUPABASE_URL && SUPABASE_KEY);

async function guardarEnSupabase(snapshot) {
  if (!SUPABASE_ACTIVO) return false;
  try {
    await axios.post(
      `${SUPABASE_URL}/rest/v1/historico?on_conflict=fecha`,
      { fecha: snapshot.fecha, sorteos: snapshot.sorteos, cuartetas: snapshot.cuartetas, especiales: snapshot.especiales || {} },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates'
        },
        timeout: 10000
      }
    );
    return true;
  } catch (e) {
    console.error('⚠️ Supabase guardar ERROR:', e.response?.data?.message || e.message);
    return false;
  }
}

async function cargarDeSupabase() {
  if (!SUPABASE_ACTIVO) return null;
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/historico?select=fecha,sorteos,cuartetas,especiales&order=fecha.desc&limit=90`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, timeout: 10000 }
    );
    return res.data.map(r => ({ fecha: r.fecha, sorteos: r.sorteos, cuartetas: r.cuartetas, especiales: r.especiales || {} }));
  } catch (e) {
    console.error('⚠️ Supabase cargar ERROR:', e.response?.data?.message || e.message);
    return null;
  }
}

// Al iniciar: si Supabase tiene datos, manda — es la fuente más durable.
// Si Supabase está vacío pero había algo en disco/SEMILLA, lo sube una vez
// (migración inicial), para no perder lo que ya tenías acumulado.
async function inicializarPersistenciaRemota() {
  if (!SUPABASE_ACTIVO) {
    console.log('ℹ️  Supabase no configurado (faltan SUPABASE_URL/SUPABASE_KEY). Usando solo disco local por ahora.');
    return;
  }
  console.log('🔌 Conectando a Supabase...');
  const remoto = await cargarDeSupabase();
  if (remoto === null) {
    console.log('⚠️ No se pudo leer Supabase (revisa la URL/key). Sigo con disco/memoria mientras tanto.');
    return;
  }
  if (remoto.length > 0) {
    estado.historico = remoto.filter(r => r.fecha !== estado.fecha);
    console.log(`💾 Histórico restaurado desde Supabase: ${estado.historico.length} días (excluyendo hoy)`);
  } else if (estado.historico.length > 0) {
    console.log(`⬆️  Supabase está vacío. Subiendo ${estado.historico.length} días que ya tenía...`);
    for (const dia of estado.historico) await guardarEnSupabase(dia);
    console.log('✅ Migración inicial a Supabase completa.');
  }
}

// ── Estado en memoria (con histórico persistente) ─────────────────────────────
const persistido = cargarDeDisco();

let estado = {
  fecha: fechaRD(),
  hora_actualizacion: horaRD(),
  sorteos: crearSorteos(),
  cuartetas: crearCuartetas(),
  especiales: crearJuegosEspeciales(),
  historico: persistido?.historico || []
};

if (persistido) {
  console.log(`💾 Histórico restaurado desde disco: ${estado.historico.length} días`);
}

function crearCuartetas() {
  return {
    cuarteta_m:  { nombre:'La Cuarteta Mañana',    hora:'10:00 AM', numeros:[], estado:'pendiente' },
    cuarteta_md: { nombre:'La Cuarteta Medio Día', hora:'1:00 PM',  numeros:[], estado:'pendiente' },
    cuarteta_t:  { nombre:'La Cuarteta Tarde',     hora:'6:00 PM',  numeros:[], estado:'pendiente' },
    cuarteta_n:  { nombre:'La Cuarteta Noche',     hora:'9:00 PM',  numeros:[], estado:'pendiente' }
  };
}

// ── Juegos especiales (formato diferente a quiniela 3 números) ─────────────────
// Cada uno tiene su propio rango, cantidad de números y lógica de predicción.
// tipo: 'pega3' = 3 dígitos 0-9 posicionales
//       'kino'  = 20 números de 80
//       'loto'  = 6 números de 38
//       'lotomas' = 6+1 números de 38+1
function crearJuegosEspeciales() {
  return {
    pega3mas:  { nombre:'Pega 3 Más',    empresa:'LEIDSA',  hora:'9:00 PM',  tipo:'pega3',   numeros:[], estado:'pendiente', rango:[0,50],  cant:3  }, // FIX: es 0-50, no 0-9
    superkino: { nombre:'Super Kino TV', empresa:'LEIDSA',  hora:'9:00 PM',  tipo:'kino',    numeros:[], estado:'pendiente', rango:[1,80],  cant:20 },
    loto:      { nombre:'Loto',          empresa:'LEIDSA',  hora:'9:00 PM',  tipo:'loto',    numeros:[], estado:'pendiente', rango:[1,40],  cant:6  },
    lotomas:   { nombre:'Loto Más',      empresa:'LEIDSA',  hora:'9:00 PM',  tipo:'lotomas', numeros:[], estado:'pendiente', rango:[1,40],  cant:7  },
    quemaito:  { nombre:'El Quemaito Mayor', empresa:'LOTEDOM', hora:'1:55 PM', tipo:'quiniela', numeros:[], estado:'pendiente', rango:[0,99], cant:1 }, // FIX: era Loteka/3 dígitos, es LoteDom/1 número,
    megachance:{ nombre:'Mega Chance',   empresa:'LOTEKA',  hora:'7:55 PM',  tipo:'chance',  numeros:[], estado:'pendiente', rango:[0,99],  cant:5  }, // FIX: 5 de 00-99, no 15 de 1-60,
    pega4king: { nombre:'Pega 4 Real',   empresa:'REAL',    hora:'12:55 PM', tipo:'pega4',   numeros:[], estado:'pendiente', rango:[0,9],   cant:4  }, // FIX v7.40: era 'King 7PM' mal etiquetado; es de Lotería REAL (clave interna se mantiene por compatibilidad de histórico)
  };
}

function crearSorteos() {
  return {
    anguila_m:   { nombre:'Anguila Mañana',   hora:'10:00 AM', numeros:[], estado:'pendiente' },
    laprimera:   { nombre:'La Primera Día',   hora:'12:00 PM', numeros:[], estado:'pendiente' },
    lotedom:     { nombre:'LoteDom',           hora:'12:00 PM', numeros:[], estado:'pendiente' },
    suerte:      { nombre:'La Suerte 12:30',  hora:'12:30 PM', numeros:[], estado:'pendiente' },
    king_t:      { nombre:'King Tarde',        hora:'12:30 PM', numeros:[], estado:'pendiente' },
    real_t:      { nombre:'Lotería Real',      hora:'1:00 PM',  numeros:[], estado:'pendiente' },
    anguila_t:   { nombre:'Anguila 1:00 PM',  hora:'1:00 PM',  numeros:[], estado:'pendiente' },
    gana_mas:    { nombre:'Gana Más',          hora:'2:30 PM',  numeros:[], estado:'pendiente' },
    new_york_t:  { nombre:'New York Tarde',    hora:'2:30 PM',  numeros:[], estado:'pendiente' },
    florida_d:   { nombre:'Florida Día',       hora:'2:00 PM',  numeros:[], estado:'pendiente' },
    suerte_t2:   { nombre:'La Suerte Tarde',  hora:'6:00 PM',  numeros:[], estado:'pendiente' },
    anguila_n:   { nombre:'Anguila 6:00 PM',  hora:'6:00 PM',  numeros:[], estado:'pendiente' },
    king_n:      { nombre:'King Noche',        hora:'7:00 PM',  numeros:[], estado:'pendiente' },
    loteka:      { nombre:'Loteka',            hora:'6:55 PM',  numeros:[], estado:'pendiente' },
    laprimera_n: { nombre:'La Primera Noche', hora:'7:00 PM',  numeros:[], estado:'pendiente' },
    leidsa:      { nombre:'Leidsa',            hora:'8:55 PM',  numeros:[], estado:'pendiente' },
    nacional:    { nombre:'Lotería Nacional',  hora:'9:00 PM',  numeros:[], estado:'pendiente' },
    anguila_nn:  { nombre:'Anguila 9:00 PM',  hora:'9:00 PM',  numeros:[], estado:'pendiente' },
    new_york_n:  { nombre:'New York Noche',    hora:'10:30 PM', numeros:[], estado:'pendiente' },
    florida_n:   { nombre:'Florida Noche',     hora:'10:30 PM', numeros:[], estado:'pendiente' }
  };
}

// ── MAPEO de nombres del sitio → clave interna ────────────────────────────────
// (Confirmado contra el HTML real de loteriasdominicanas.com)
const MAPA = {
  // ── Nombres de loteriasdominicanas.com ──
  'anguila mañana':       'anguila_m',
  'anguila medio día':    'anguila_t',
  'anguila medio dia':    'anguila_t',
  'anguila tarde':        'anguila_n',
  'anguila noche':        'anguila_nn',
  'la primera día':       'laprimera',
  'la primera dia':       'laprimera',
  'primera noche':        'laprimera_n',
  'quiniela lotedom':     'lotedom',
  'lotedom':              'lotedom',
  'la suerte 12:30':      'suerte',
  'la suerte 18:00':      'suerte_t2',
  'la suerte tarde':      'suerte_t2',
  'quiniela real':        'real_t',
  'lotería real':         'real_t',
  'loteria real':         'real_t',
  'gana más':             'gana_mas',
  'gana mas':             'gana_mas',
  'new york tarde':       'new_york_t',
  'new york noche':       'new_york_n',
  'quiniela leidsa':      'leidsa',
  'leidsa':               'leidsa',
  'lotería nacional':     'nacional',
  'loteria nacional':     'nacional',
  'quiniela loteka':      'loteka',
  'loteka':               'loteka',
  'king lottery 12:30':   'king_t',
  'king lottery 7:30':    'king_n',
  'king tarde':           'king_t',
  'king noche':           'king_n',

  // ── Nombres REALES de conectate.com.do (confirmados en /api/debug) ──
  'anguila 10:00 am':     'anguila_m',
  'anguila 10:00':        'anguila_m',
  'anguila 1:00 pm':      'anguila_t',
  'anguila 1:00':         'anguila_t',
  'anguila 6:00 pm':      'anguila_n',
  'anguila 6:00':         'anguila_n',
  'anguila 9:00 pm':      'anguila_nn',
  'anguila 9:00':         'anguila_nn',
  // Confirmados en logs de Render:
  'la suerte 6pm':        'suerte_t2',   // ← "La Suerte 6PM"
  'la suerte md':         'suerte',      // ← "La Suerte MD" (mediodía)
  'new york 3:30':        'new_york_t',  // ← "New York 3:30"
  'new york 11:30':       'new_york_t',
  'new york 2:30':        'new_york_t',
  'nueva york':           'new_york_t',
  // BUGFIX: Florida y New York son loterías AMERICANAS DISTINTAS (Florida
  // Lottery vs New York Lottery), ambas jugadas en RD. Antes "Florida Día"
  // apuntaba al mismo identificador que "New York Tarde", así que la que
  // llegara primero en el sync borraba/ocultaba a la otra. Ahora cada una
  // tiene su propia clave (florida_d / florida_n).
  'florida día':          'florida_d',
  'florida dia':          'florida_d',
  'florida 2:00':         'florida_d',
  'florida noche':        'florida_n',
  'florida 10:30':        'florida_n',
  'primera noche':        'laprimera_n',
  'la primera noche':     'laprimera_n',
  'la primera 12:00':     'laprimera',
  'primera día':          'laprimera',
  'primera dia':          'laprimera',
  'king lottery 7:30':    'king_n',
  'king lottery 12:30':   'king_t',
  'quiniela mega decenas': 'loteka',
  'quiniela loteka':      'loteka',
  'la suerte 12:30 pm':   'suerte',
  'suerte 12:30':         'suerte',
  'la suerte 6:00 pm':    'suerte_t2',
  'lotería real 1:00':    'real_t',
  'loto real':            'real_t',
};

// ── MAPEO de juegos especiales ─────────────────────────────────────────────────
const MAPA_ESPECIALES = {
  'pega 3 más':     'pega3mas',
  'pega 3 mas':     'pega3mas',
  'pega3más':       'pega3mas',
  'pega3mas':       'pega3mas',
  'super kino tv':  'superkino',
  'super kino':     'superkino',
  'kino tv':        'superkino',
  'loto más':       'lotomas',
  'loto mas':       'lotomas',
  'lotomas':        'lotomas',
  'loto':           'loto',
  'el quemaito':    'quemaito',
  'quemaito':       'quemaito',
  'mega chance':    'megachance',
  'megachance':     'megachance',
  'pega 4':         'pega4king',
  'pega4':          'pega4king',
};

function buscarClaveEspecial(texto) {
  const t = texto.toLowerCase().trim();
  // Loto Más debe ir antes que Loto para evitar match corto
  const orden = ['loto más','loto mas','lotomas','super kino tv','super kino','kino tv',
    'pega 3 más','pega 3 mas','pega3más','pega3mas','el quemaito','quemaito',
    'mega chance','megachance','pega 4','pega4','loto'];
  for (const k of orden) {
    if (t.includes(k)) return MAPA_ESPECIALES[k];
  }
  return null;
}

function buscarClave(texto) {
  const t = texto.toLowerCase().trim();
  for (const [k, v] of Object.entries(MAPA)) {
    if (t.includes(k)) return v;
  }
  return null;
}

// ── MAPEO de La Cuarteta (variante de 4 dígitos exclusiva de Anguila) ────────
// Confirmado vía búsqueda en loteriasdominicanas.com: La Cuarteta tiene 4
// sorteos diarios pareados con cada horario de Anguila (Mañana/Medio Día/
// Tarde/Noche). NO existe para las otras 17 loterías.
const MAPA_CUARTETA = {
  'la cuarteta mañana':    'cuarteta_m',
  'la cuarteta manana':    'cuarteta_m',
  'cuarteta mañana':       'cuarteta_m',
  'la cuarteta medio día': 'cuarteta_md',
  'la cuarteta medio dia': 'cuarteta_md',
  'cuarteta medio día':    'cuarteta_md',
  'cuarteta medio dia':    'cuarteta_md',
  'la cuarteta tarde':     'cuarteta_t',
  'cuarteta tarde':        'cuarteta_t',
  'la cuarteta noche':     'cuarteta_n',
  'cuarteta noche':        'cuarteta_n',
};

function buscarClaveCuarteta(texto) {
  const t = texto.toLowerCase().trim();
  for (const [k, v] of Object.entries(MAPA_CUARTETA)) {
    if (t.includes(k)) return v;
  }
  return null;
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-DO,es;q=0.9,en;q=0.8',
};

// ── SCRAPER PRINCIPAL: conectate.com.do widget API (JSON) ─────────────────────
// Estructura CONFIRMADA del /api/debug:
// {
//   "game_title": "Anguila 10:00 AM",
//   "permalink": "https://www.conectate.com.do/loterias/anguilla/anguila-10-am",
//   "update_date_time": "2026-06-15 14:00:10",
//   "score": ["03","91","75"],   ← AQUÍ están los números (strings)
//   "date": "15-06",
//   "today": true,               ← true = sorteo de HOY
//   "text_mode": 0
// }
async function scrapeConectateAPI() {
  try {
    console.log('📡 [PRIMARIO] Raspando conectate.com.do/loterias/api/widget...');
    const res = await axios.get('https://www.conectate.com.do/loterias/api/widget', {
      headers: { ...HEADERS, 'Accept': 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' },
      timeout: 10000
    });

    let items = res.data;
    if (!Array.isArray(items)) {
      // intentar extraer si viene envuelto
      items = res.data?.data || res.data?.results || res.data?.loterias || [];
    }

    console.log(`  → API devolvió ${items.length} items`);
    let conteo = 0;

    for (const item of items) {
      const nombre = (item.game_title || '').toString().trim();
      if (!nombre) continue;

      // Verificar si el resultado es de hoy usando AMBOS métodos:
      // 1. item.today === true  (campo directo de la API)
      // 2. item.date === "DD-MM" de hoy (fallback si el API cambia)
      const [año, mes, dia] = estado.fecha.split('-');
      const fechaHoyDDMM = `${dia}-${mes}`; // ej: "27-06"
      const esFechaHoy = item.date === fechaHoyDDMM;
      const esHoy = item.today === true || item.today === 1 || String(item.today).toLowerCase() === 'true' || esFechaHoy;

      if (!esHoy) {
        console.log(`  ⏭️  ${nombre}: hoy=false (today=${JSON.stringify(item.today)}, fecha=${item.date}, esperada=${fechaHoyDDMM})`);
        continue;
      }
      if (!item.today && esFechaHoy) {
        console.log(`  ⚠️  ${nombre}: today=${JSON.stringify(item.today)} pero fecha ${item.date} es hoy — aceptando por fecha`);
      }

      const scoreArr = item.score;
      if (!Array.isArray(scoreArr) || scoreArr.length === 0) continue;

      // ── ¿Es quiniela de 3 números? ─────────────────────────────────────────
      const clave = buscarClave(nombre);
      if (clave && estado.sorteos[clave] && estado.sorteos[clave].numeros.length < 3 && scoreArr.length >= 3) {
        const nums = scoreArr.slice(0,3).map(n=>parseInt(n,10)).filter(n=>!isNaN(n)&&n>=0&&n<=99);
        if (nums.length === 3) {
          if (nums.includes(0) && nums.includes(99)) {
            console.log(`  ⚠️  ${nombre}: patrón sospechoso ${nums.join('-')} - descartado`);
          } else {
            estado.sorteos[clave].numeros = nums;
            estado.sorteos[clave].estado = 'disponible';
            conteo++;
            console.log(`  ✓ [API] ${estado.sorteos[clave].nombre}: ${nums.join('-')} (hoy, ${item.date})`);
          }
        }
        continue;
      }

      // ── ¿Es juego especial? ────────────────────────────────────────────────
      const claveEsp = buscarClaveEspecial(nombre);
      if (claveEsp && estado.especiales[claveEsp]) {
        const juego = estado.especiales[claveEsp];
        if (juego.numeros.length >= juego.cant) continue;
        const [rMin, rMax] = juego.rango;

        let nums;
        const esDigitos = juego.tipo === 'pega3' || juego.tipo === 'pega4';
        if (esDigitos) {
          // Pega 3 / Pega 4 / El Quemaito: resultado son dígitos individuales 0-9
          // La API puede mandar en varios formatos:
          //   ["0","4","2"]  → 3 dígitos separados
          //   ["042"]        → string combinado
          //   ["42"]         → falta el 0 inicial → debe ser "042"
          //   ["4"]          → solo el último dígito → "004"
          // Solución robusta: unir todo, extraer solo dígitos,
          // rellenar con ceros a la izquierda hasta llegar a cant
          const raw = scoreArr.map(x => String(x)).join('').replace(/\D/g, '');
          const padded = raw.padStart(juego.cant, '0').slice(-juego.cant);
          nums = padded.split('').map(d => parseInt(d, 10));
        } else {
          nums = scoreArr.map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n >= juego.rango[0] && n <= juego.rango[1]);
        }

        if (nums.length >= juego.cant) {
          juego.numeros = nums.slice(0, juego.cant);
          juego.estado = 'disponible';
          conteo++;
          console.log(`  ✓ [API] ${juego.nombre}: ${juego.numeros.join('-')} (${juego.tipo})`);
        } else if (nums.length > 0) {
          // Resultado incompleto todavía (ej. solo salió 1 de 3 dígitos) —
          // NO se guarda a medias; se espera al próximo sync con el dato completo.
          console.log(`  ⏭️  ${juego.nombre}: solo ${nums.length}/${juego.cant} número(s) detectado(s) aún, esperando más`);
        }
        continue;
      }

      console.log(`  ⚠️  Sin mapeo para: "${nombre}"`);
    }

    console.log(`✅ [PRIMARIO] conectate API: ${conteo} sorteos`);
    return conteo;
  } catch (e) {
    console.error(`⚠️ [PRIMARIO] conectate API ERROR: ${e.message}`);
    return 0;
  }
}


// Estructura confirmada:
//   <a class="game-title" href="..."><span>Gana Más</span></a>
//   <div class="game-scores p-2 ball-mode">
//     <span class="score ">67</span><span class="score ">66</span><span class="score ">37</span>
//   </div>
async function scrapeLotDominicanas() {
  // loteriasdominicanas.com usa Nuxt.js — los resultados NO están en el HTML,
  // se cargan vía JS. Sin embargo, Nuxt SSR expone los datos en _payload.json.
  // Usamos ese endpoint JSON directamente para cada lotería pendiente.

  const pendientesMap = LOTS_SCRAPER_MAP.filter(([, k]) =>
    estado.sorteos[k] && estado.sorteos[k].numeros.length < 3
  );
  if (pendientesMap.length === 0) return 0;

  console.log(`📡 [RESPALDO] loteriasdominicanas.com _payload.json — ${pendientesMap.length} loterías pendientes...`);
  let conteo = 0;

  // Primero intentar la página principal (tiene todos los sorteos del día)
  try {
    const payloadUrl = 'https://loteriasdominicanas.com/_payload.json';
    const res = await axios.get(payloadUrl, {
      headers: { ...HEADERS, 'Accept': 'application/json' },
      timeout: 12000
    });

    // El payload.json de Nuxt es un array dehydratado — buscar scores
    const raw = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    const rawStr = JSON.stringify(raw);

    // Buscar patrones de scores: arrays de 3 números entre 0-99
    const matches = [];
    if (Array.isArray(raw)) {
      for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        if (Array.isArray(item) && item.length === 3) {
          const nums = item.map(Number);
          if (nums.every(n => !isNaN(n) && n >= 0 && n <= 99) && !(nums[0]===0&&nums[1]===0&&nums[2]===0)) {
            matches.push({ idx: i, nums });
          }
        }
      }
    }

    if (matches.length > 0) {
      console.log(`  📊 Encontrados ${matches.length} posibles resultados en payload.json`);
      // Por ahora logueamos — necesitamos confirmar la estructura
      matches.slice(0, 5).forEach(m => console.log(`    [${m.idx}] = ${m.nums.join('-')}`));
    } else {
      console.log(`  ⚠️  payload.json no tiene resultados en formato esperado`);
    }
  } catch (e) {
    console.log(`  ⚠️  _payload.json: ${e.message} — intentando páginas individuales`);
  }

  // Fallback: páginas individuales con el payload específico de cada una
  for (const [path, clave] of pendientesMap.slice(0, 5)) { // límite 5 para no saturar
    try {
      const payloadUrl = `https://loteriasdominicanas.com/${path}/_payload.json`;
      const res = await axios.get(payloadUrl, {
        headers: { ...HEADERS, 'Accept': 'application/json' },
        timeout: 10000
      });

      const raw = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      if (!Array.isArray(raw)) continue;

      // Buscar en el array del payload arrays de 3 números válidos
      for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        if (Array.isArray(item) && item.length === 3) {
          const nums = item.map(Number);
          if (nums.every(n => !isNaN(n) && n >= 0 && n <= 99) &&
              !(nums.includes(0) && nums.includes(99))) {
            // Verificar que es un resultado real (aparece después de metadata)
            if (i > 10) { // los primeros índices son navegación/config
              estado.sorteos[clave].numeros = nums;
              estado.sorteos[clave].estado = 'disponible';
              conteo++;
              console.log(`  ✓ [payload] ${estado.sorteos[clave].nombre}: ${nums.join('-')}`);
              break;
            }
          }
        }
      }

      await new Promise(r => setTimeout(r, 600));
    } catch (e) {
      console.log(`  ⚠️  [payload] ${clave}: ${e.message}`);
    }
  }

  console.log(`✅ loteriasdominicanas.com: ${conteo}/${pendientesMap.length} capturadas`);
  return conteo;
}

// ── SCRAPER: La Cuarteta (Anguila, 4 dígitos sin orden) ───────────────────────
// Mismo HTML/selector que scrapeLotDominicanas (.game-block / .game-title /
// .game-scores.ball-mode), pero aquí esperamos 4 bolas en vez de 3.
// ⚠️ Igual que con los otros scrapers: si loteriasdominicanas.com cambia su
// HTML, revisa /api/debug2 para confirmar que sigue encontrando los bloques.
async function scrapeCuartetaLotDominicanas() {
  try {
    console.log('📡 Raspando La Cuarteta (loteriasdominicanas.com)...');
    const res = await axios.get('https://loteriasdominicanas.com/', {
      headers: HEADERS, timeout: 10000
    });
    const $ = cheerio.load(res.data);
    let conteo = 0;

    $('.game-block').each((i, bloque) => {
      const tituloWeb = $(bloque).find('.game-title span').text().trim();
      if (!tituloWeb) return;

      const clave = buscarClaveCuarteta(tituloWeb);
      if (!clave || !estado.cuartetas[clave]) return;
      if (estado.cuartetas[clave].numeros.length >= 4) return;

      const contenedorBolas = $(bloque).find('.game-scores.ball-mode');
      if (contenedorBolas.length === 0) {
        console.log(`  ⏭️  [Cuarteta] ${tituloWeb}: sin .ball-mode aún`);
        return;
      }

      const nums = [];
      contenedorBolas.first().find('span.score').each((j, span) => {
        if (nums.length >= 4) return false;
        const raw = $(span).text().trim();
        if (!/^\d{1,2}$/.test(raw)) return;
        const n = parseInt(raw, 10);
        if (!isNaN(n) && n >= 0 && n <= 99) nums.push(n);
      });

      if (nums.length === 4) {
        estado.cuartetas[clave].numeros = nums;
        estado.cuartetas[clave].estado = 'disponible';
        conteo++;
        console.log(`  ✓ [Cuarteta] ${estado.cuartetas[clave].nombre}: ${nums.join('-')}`);
      } else {
        console.log(`  ⏭️  [Cuarteta] ${tituloWeb}: solo ${nums.length}/4 números válidos`);
      }
    });

    console.log(`✅ La Cuarteta: ${conteo} sorteos`);
    return conteo;
  } catch (e) {
    console.error(`⚠️ La Cuarteta ERROR: ${e.message}`);
    return 0;
  }
}

// ── SCRAPER RESPALDO: quinielasrd.com ──────────────────────────────────────────
// ⚠️ DESACTIVADO TEMPORALMENTE: está capturando datos basura (0-99-0) en vez de
// números reales de sorteo. Probablemente está leyendo paginación, años o IDs.
// No lo usamos hasta corregir el parser.
// ── SCRAPER PRIMARIO ALTERNATIVO: loteriasdominicanas.com ─────────────────────
// Se activa cuando conectate.com.do está caído.
// Esta página devuelve los números en el HTML estático (sin JS requerido).
// IDs: Anguila Mañana=2, La Primera Día=1, etc. (fuente: CarlsRemy/LotteryScraping-RD)
const LOTS_SCRAPER_MAP = [
  // [url_path, clave_interna]
  ['anguila/anguila-manana',         'anguila_m'],
  ['anguila/anguila-medio-dia',      'anguila_t'],
  ['anguila/anguila-tarde',          'anguila_n'],
  ['anguila/anguila-noche',          'anguila_nn'],
  ['la-primera/la-primera-dia',      'laprimera_d'],
  ['lotedom',                        'lotedom'],
  ['la-suerte-dominicana/la-suerte-12-30', 'suerte_m'],
  ['king-lottery/king-tarde',        'king_t'],
  ['loto-real/real-tarde',           'real_t'],
  ['la-primera/gana-mas',            'gana_mas'],
  ['nueva-york/new-york-tarde',      'new_york_t'],
  ['loteria-de-florida/florida-dia', 'florida_d'],
  ['la-suerte-dominicana/la-suerte-tarde', 'suerte_t2'],
  ['king-lottery/king-noche',        'king_n'],
  ['loteka',                         'loteka'],
  ['la-primera/la-primera-noche',    'laprimera_n'],
  ['leidsa',                         'leidsa'],
  ['loteria-nacional',               'nacional'],
  ['nueva-york/new-york-noche',      'new_york_n'],
  ['loteria-de-florida/florida-noche','florida_n'],
];

async function scrapeLoteriasDominicanas() {
  let conteo = 0;
  const pendientes = LOTS_SCRAPER_MAP.filter(([, k]) =>
    estado.sorteos[k] && estado.sorteos[k].numeros.length < 3
  );
  if (pendientes.length === 0) return 0;

  console.log(`📡 [RESPALDO] loteriasdominicanas.com — ${pendientes.length} loterías pendientes...`);

  for (const [path, clave] of pendientes) {
    try {
      const url = `https://loteriasdominicanas.com/${path}`;
      const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });
      const $ = cheerio.load(res.data);

      // Los números aparecen en el HTML como: General | 1 | 2 | 3 | num1 | num2 | num3
      // La estructura es: texto "General" seguido de los 3 números en spans/divs
      let nums = [];

      // Método 1: buscar en el contenido del body texto con patrón numérico de 2 dígitos
      const bodyText = $('body').text();
      // Buscar patrón: "General" seguido de números
      const generalMatch = bodyText.match(/General[\s\S]{1,50}?(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})/);
      if (generalMatch) {
        nums = [+generalMatch[1], +generalMatch[2], +generalMatch[3]];
      }

      // Método 2: buscar en elementos que contengan números del 00-99
      if (nums.length < 3) {
        const candidatos = [];
        $('strong, b, .numero, .result, [class*="num"], [class*="result"], td, span').each((i, el) => {
          const txt = $(el).text().trim();
          if (/^\d{1,2}$/.test(txt)) {
            const n = parseInt(txt, 10);
            if (n >= 0 && n <= 99) candidatos.push(n);
          }
        });
        // Tomar los primeros 3 únicos que aparecen cerca de "General"
        if (candidatos.length >= 3) nums = candidatos.slice(0, 3);
      }

      if (nums.length === 3 && estado.sorteos[clave]) {
        // Verificar que no sea el resultado de ayer (pattern: todos iguales o cero)
        if (!(nums[0] === 0 && nums[1] === 0 && nums[2] === 0)) {
          estado.sorteos[clave].numeros = nums;
          estado.sorteos[clave].estado = 'disponible';
          conteo++;
          console.log(`  ✓ [loteriasdominicanas] ${estado.sorteos[clave].nombre}: ${nums.join('-')}`);
        }
      }

      // Pausa para no saturar el sitio
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.log(`  ⚠️ [loteriasdominicanas] ${clave}: ${e.message}`);
    }
  }

  console.log(`✅ loteriasdominicanas.com: ${conteo}/${pendientes.length} capturadas`);
  return conteo;
}

async function scrapeQuinielasRD() {
  console.log('⏭️  quinielasrd.com DESACTIVADO (genera datos basura 0-99-0)');
  return 0;
}

// ── SCRAPER ESPECIALES: leidsa.com ─────────────────────────────────────────────
// Fuente oficial de LEIDSA para Pega 3 Más, Super Kino TV, Loto y Loto Más.
// Se activa solo cuando el conectate.com.do no ha capturado estos juegos todavía.
async function scrapeLeidsa() {
  try {
    const pendE = Object.entries(estado.especiales)
      .filter(([k, e]) => e.empresa === 'LEIDSA' && e.numeros.length === 0);
    if (pendE.length === 0) return 0;

    console.log('📡 Raspando leidsa.com para especiales...');
    const res = await axios.get('https://www.leidsa.com/', {
      headers: { ...HEADERS, 'Accept': 'text/html,application/xhtml+xml,*/*' },
      timeout: 12000
    });
    const $ = cheerio.load(res.data);
    let conteo = 0;

    // Buscar resultados en la página principal de leidsa.com
    // El HTML contiene bloques de juego con números
    $('[class*="result"], [class*="number"], [class*="kino"], [class*="pega"], [class*="loto"]').each((i, el) => {
      const texto = $(el).text().trim();
      const nums = texto.match(/\d+/g);
      if (!nums || nums.length === 0) return;

      const textoNorm = texto.toLowerCase();
      let clave = null;
      if (textoNorm.includes('pega 3') || textoNorm.includes('pega3')) clave = 'pega3mas';
      else if (textoNorm.includes('super kino') || textoNorm.includes('kino')) clave = 'superkino';
      else if (textoNorm.includes('loto más') || textoNorm.includes('loto mas')) clave = 'lotomas';
      else if (textoNorm.includes('loto')) clave = 'loto';

      if (clave && estado.especiales[clave] && estado.especiales[clave].numeros.length === 0) {
        const juego = estado.especiales[clave];
        const validos = nums.map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n >= juego.rango[0] && n <= juego.rango[1]);
        if (validos.length >= juego.cant) {
          juego.numeros = validos.slice(0, juego.cant);
          juego.estado = 'disponible';
          conteo++;
          console.log(`  ✓ [leidsa.com] ${juego.nombre}: ${juego.numeros.join('-')}`);
        }
      }
    });

    console.log(`✅ leidsa.com especiales: ${conteo} capturado(s)`);
    return conteo;
  } catch (e) {
    console.error(`⚠️ leidsa.com ERROR: ${e.message}`);
    return 0;
  }
}

async function scrapeQuinielasRD_DESACTIVADO() {
  try {
    console.log('📡 [respaldo] Raspando quinielasrd.com...');
    const res = await axios.get('https://quinielasrd.com/', {
      headers: HEADERS, timeout: 10000
    });
    const $ = cheerio.load(res.data);
    let conteo = 0;

    $('a[href]').each((i, el) => {
      const txt = $(el).text().trim().toLowerCase();
      if (!txt || txt.length > 40) return;
      const clave = buscarClave(txt);
      if (!clave || !estado.sorteos[clave]) return;
      if (estado.sorteos[clave].numeros.length >= 3) return;

      const parent = $(el).closest('div, li, span');
      const matches = parent.text().match(/\b(\d{2})\b/g);
      if (!matches || matches.length < 3) return;

      const nums = matches.slice(0, 3).map(Number).filter(n => n >= 0 && n <= 99);
      if (nums.length === 3) {
        estado.sorteos[clave].numeros = nums;
        estado.sorteos[clave].estado = 'disponible';
        conteo++;
        console.log(`  ✓ [Q] ${estado.sorteos[clave].nombre}: ${nums.join('-')}`);
      }
    });

    console.log(`✅ quinielasrd.com: ${conteo} sorteos`);
    return conteo;
  } catch (e) {
    console.error(`⚠️ quinielasrd.com ERROR: ${e.message}`);
    return 0;
  }
}

// ── Sincronización principal ───────────────────────────────────────────────────
let sincronizando = false;

// ── SCRAPER RESPALDO 2: enloteria.com ──────────────────────────────────────────
// Rails con SSR: los números SÍ vienen en el HTML (sin el problema Nuxt de
// loteriasdominicanas.com). Portada: /resultados-loterias-hoy (también -ayer
// y -antes-de-ayer para backfill).
// El parser NO depende de clases CSS: busca enlaces /resultados-{slug},
// sube al contenedor con fecha en español y extrae los números.
// Los slugs se identifican con reglas regex (ENLOTERIA_REGLAS) porque los
// slugs exactos del sitio no están confirmados — usar /api/test-enloteria
// para ver qué captura y ajustar.

const ENLOTERIA_REGLAS = [
  // [regex sobre el slug normalizado, clave interna]
  // (Anguila se maneja aparte en claveEnloteria con token exacto de hora,
  //  porque /1.*pm/ matcheaba también "12pm" y contaminaba anguila_t)
  [/primera.*noche/,          'laprimera_n'],
  [/primera/,                 'laprimera'],
  [/lotedom/,                 'lotedom'],
  [/suerte.*(6|18|tarde)/,    'suerte_t2'],
  [/suerte/,                  'suerte'],
  [/king.*(noche|7)/,         'king_n'],
  [/king/,                    'king_t'],
  [/^(quiniela )?real$/,      'real_t'],   // exacto: NO chance-real ni loto-real
  [/gana.*mas/,               'gana_mas'],
  [/(new.*york|nueva.*york).*(noche|10)/, 'new_york_n'],
  [/(new.*york|nueva.*york)/, 'new_york_t'],
  [/florida.*(noche|10)/,     'florida_n'],
  [/florida/,                 'florida_d'],
  [/^(quiniela )?loteka$/,    'loteka'],   // exacto: NO lotto-loteka
  [/^(quiniela )?leidsa$/,    'leidsa'],   // exacto: NO otros juegos leidsa
  [/nacional/,                'nacional'],
];

// Sorteos horarios de Anguila en enloteria.com → solo mapeamos los 4
// clásicos que rastrea el sistema. Los demás (8am, 9am, 11am, 12pm,
// 2pm...) quedan sin mapear a propósito (visibles en /api/test-enloteria).
const ANGUILA_HORAS = {
  '10am': 'anguila_m',
  '1pm':  'anguila_t',
  '6pm':  'anguila_n',
  '9pm':  'anguila_nn',
};

function claveEnloteria(slug) {
  const s = slug.toLowerCase().replace(/-/g, ' ');
  // Anguila: extraer token exacto de hora ("1pm" NO matchea "12pm")
  const ang = s.match(/anguil+a\s+(\d{1,2})\s*(am|pm)/);
  if (ang) return ANGUILA_HORAS[ang[1] + ang[2]] || null;
  if (/anguil/.test(s)) return null; // otras variantes anguila: no adivinar

  for (const [re, clave] of ENLOTERIA_REGLAS) {
    if (re.test(s)) return clave;
  }
  return null;
}

const MESES_ES = {
  enero:'01', febrero:'02', marzo:'03', abril:'04', mayo:'05', junio:'06',
  julio:'07', agosto:'08', septiembre:'09', octubre:'10', noviembre:'11', diciembre:'12'
};

// "Jue 02 de julio, 2026" -> "2026-07-02"
function fechaEnloteria(texto) {
  const m = texto.match(/(\d{1,2})\s+de\s+([a-záéíóú]+),?\s+(\d{4})/i);
  if (!m) return null;
  const mes = MESES_ES[m[2].toLowerCase()];
  return mes ? `${m[3]}-${mes}-${String(m[1]).padStart(2,'0')}` : null;
}

// Parser genérico de la portada de enloteria.com.
// Devuelve TODAS las tarjetas encontradas (mapeadas o no) para debug.
function parsearEnloteria(html) {
  const $ = cheerio.load(html);
  const tarjetas = [];
  const vistos = new Set();

  $('a[href*="/resultados-"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(/\/resultados-([a-z0-9-]+?)(?:-hoy|-ayer|-antes-de-ayer|-\d{4}-\d{2}-\d{2})?$/);
    if (!m) return;
    const slug = m[1];
    if (slug === 'loterias') return; // enlaces de navegación

    // Subir hasta el contenedor con fecha en español (máx 6 niveles)
    let $card = $(a).parent();
    let fecha = null;
    for (let i = 0; i < 6 && $card.length; i++) {
      fecha = fechaEnloteria($card.text());
      if (fecha) break;
      $card = $card.parent();
    }
    if (!fecha) return;

    const textoCard = $card.text();
    if (/Avísame cuando salga/i.test(textoCard)) return; // pendiente

    // Números: nodos de texto que son exactamente 1-2 dígitos
    const nums = [];
    $card.find('*').addBack().contents().each((_, node) => {
      if (node.type !== 'text') return;
      const t = $(node).text().trim();
      if (/^\d{1,2}$/.test(t)) {
        const n = parseInt(t, 10);
        if (n >= 0 && n <= 99) nums.push(n);
      }
    });
    if (nums.length < 3) return;

    const key = `${slug}|${fecha}`;
    if (vistos.has(key)) return; // tarjeta repetida en portada
    vistos.add(key);

    tarjetas.push({ slug, clave: claveEnloteria(slug), fecha, numeros: nums.slice(0, 6) });
  });

  return tarjetas;
}

async function scrapeEnloteria() {
  let conteo = 0;
  const pendientes = Object.entries(estado.sorteos)
    .filter(([, s]) => s.numeros.length < 3).length;
  if (pendientes === 0) return 0;

  console.log(`📡 [RESPALDO 2] enloteria.com — ${pendientes} loterías pendientes...`);
  try {
    const res = await axios.get('https://enloteria.com/resultados-loterias-hoy', {
      headers: HEADERS, timeout: 15000
    });
    const tarjetas = parsearEnloteria(res.data);
    const hoy = fechaRD();

    for (const t of tarjetas) {
      if (!t.clave || !estado.sorteos[t.clave]) continue;
      if (estado.sorteos[t.clave].numeros.length >= 3) continue;
      if (t.fecha !== hoy) continue; // solo resultados de HOY (honestidad)

      const nums = t.numeros.slice(0, 3);
      // Guard anti-placeholder (como el bug de quinielasrd: 0-99-0)
      if (nums.every(n => n === nums[0])) {
        console.log(`  ⏭️  [enloteria] ${t.slug}: patrón sospechoso ${nums.join('-')}`);
        continue;
      }
      estado.sorteos[t.clave].numeros = nums;
      estado.sorteos[t.clave].estado = 'disponible';
      conteo++;
      console.log(`  ✓ [enloteria] ${estado.sorteos[t.clave].nombre}: ${nums.join('-')}`);
    }
    console.log(`✅ [RESPALDO 2] enloteria.com: ${conteo} sorteos`);
    return conteo;
  } catch (e) {
    console.error(`⚠️ [RESPALDO 2] enloteria.com ERROR: ${e.message}`);
    return 0;
  }
}

// ── ESPECIALES desde enloteria.com (páginas por juego, SSR) ────────────────────
// Cada juego tiene su página /resultados-{slug} con la tarjeta de HOY primero
// y el historial con URLs por fecha (/resultados-{slug}-YYYY-MM-DD).
// NOTA HONESTIDAD: solo se mapean juegos inequívocos.
//  - pega3mas: NO existe en enloteria (Leidsa solo tiene quiniela/loto/kino/pool)
//  - quemaito: ambiguo (enloteria tiene "toca-3" en Loteka y
//    "el-quemaito-mayor" en LoteDom) — inspeccionar con
//    /api/test-enloteria?juego=toca-3 antes de mapear.
const ESPECIALES_ENLOTERIA = {
  superkino:  'super-kino-tv',
  loto:       'loto',
  lotomas:    'loto',        // misma página: Loto + Más (se toman 7 válidos)
  megachance: 'megachance',
  pega3mas:   'pega-3-mas',  // slug no confirmado en el menú: si da 404 se ignora
  pega4king:  'pega-4',      // slug no confirmado: si da 404 se ignora
  quemaito:   'el-quemaito-mayor', // RESUELTO: LoteDom, 1 número 00-99, 1:55 PM
};

// Filtro por nombre: en páginas con varias tarjetas evita capturar el juego
// equivocado (ej. que la quiniela Leidsa se cuele como Pega 3)
const ESPECIALES_ENLOTERIA_RE = {
  superkino:  /kino/i,
  loto:       /loto/i,
  lotomas:    /loto/i,
  megachance: /mega\s*chance/i,
  pega3mas:   /pega\s*3/i,
  pega4king:  /pega\s*4/i,
  quemaito:   /quemaito/i,
};

// Parser de página por juego: NO depende de anclas (la tarjeta de HOY no
// tiene link a sí misma). Busca cada <h5> del juego y sube hasta el
// contenedor con UNA sola fecha en español.
function parsearPaginaJuegoEnloteria(html, nombreRe) {
  const $ = cheerio.load(html);
  const tarjetas = [];

  $('h5').each((_, h) => {
    if (nombreRe && !nombreRe.test($(h).text())) return; // otro juego
    let $card = $(h).parent();
    let fecha = null;
    for (let i = 0; i < 6 && $card.length; i++) {
      fecha = fechaEnloteria($card.text());
      if (fecha) break;
      $card = $card.parent();
    }
    if (!fecha) return;

    const texto = $card.text();
    // Si el contenedor tiene más de una fecha, nos pasamos de nivel: descartar
    const fechas = texto.match(/\d{1,2}\s+de\s+[a-záéíóú]+,?\s+\d{4}/gi) || [];
    if (fechas.length !== 1) return;
    if (/Avísame cuando salga/i.test(texto)) return; // pendiente

    const nums = [];
    $card.find('*').addBack().contents().each((_, node) => {
      if (node.type !== 'text') return;
      const t = $(node).text().trim();
      if (/^\d{1,2}$/.test(t)) nums.push(parseInt(t, 10));
    });
    if (nums.length === 0) return;

    tarjetas.push({ fecha, numeros: nums });
  });

  return tarjetas;
}

async function scrapeEspecialesEnloteria() {
  const pendientes = Object.entries(estado.especiales)
    .filter(([k, e]) => e.numeros.length === 0 && ESPECIALES_ENLOTERIA[k]);
  if (pendientes.length === 0) return 0;

  console.log(`📡 [RESPALDO 2] enloteria.com especiales — ${pendientes.map(([k]) => k).join(', ')}...`);
  const hoy = fechaRD();
  let conteo = 0;
  const cachePaginas = {}; // loto y lotomas comparten página

  for (const [clave, juego] of pendientes) {
    const slug = ESPECIALES_ENLOTERIA[clave];
    try {
      const re = ESPECIALES_ENLOTERIA_RE[clave];
      const cacheKey = slug + '|' + (re ? re.source : '');
      if (!cachePaginas[cacheKey]) {
        const res = await axios.get(`https://enloteria.com/resultados-${slug}`, {
          headers: HEADERS, timeout: 15000
        });
        cachePaginas[cacheKey] = parsearPaginaJuegoEnloteria(res.data, re);
        await new Promise(r => setTimeout(r, 1200)); // pausa entre páginas
      }
      const tarjetaHoy = cachePaginas[cacheKey].find(t => t.fecha === hoy);
      if (!tarjetaHoy) continue; // aún no sale o no publicado: NO inventar

      // Validar contra rango del juego
      const validos = tarjetaHoy.numeros.filter(n => n >= juego.rango[0] && n <= juego.rango[1]);
      // Kino/loto exigen números únicos; pega3/pega4 permiten dígitos repetidos
      const esDigitos = juego.tipo === 'pega3' || juego.tipo === 'pega4';
      const usar = esDigitos ? validos : [...new Set(validos)];

      if (usar.length >= juego.cant) {
        juego.numeros = usar.slice(0, juego.cant);
        juego.estado = 'disponible';
        conteo++;
        console.log(`  ✓ [enloteria] ${juego.nombre}: ${juego.numeros.join('-')}`);
      } else {
        console.log(`  ⏭️  [enloteria] ${juego.nombre}: solo ${usar.length}/${juego.cant} números válidos, descartado`);
      }
    } catch (e) {
      console.error(`  ⚠️ [enloteria] ${clave} ERROR: ${e.message}`);
    }
  }
  console.log(`✅ [RESPALDO 2] enloteria especiales: ${conteo}`);
  return conteo;
}


// ── BACKFILL histórico desde enloteria.com ─────────────────────────────────
// Rellena el hueco de la caída de conectate (jun 23 - jul 1).
// NUNCA pisa datos existentes: solo llena sorteos vacíos.
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

    // 1) Leer lo que YA existe en Supabase para no pisarlo
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

    // 2) Quinielas: pagina por fecha /resultados-loterias-YYYY-MM-DD
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
        logBF(`${f}: ${n} quinielas`);
      } catch (e) {
        logBF(`${f}: AVISO ${e.response?.status || e.message} (pagina por fecha no disponible?)`);
      }
      await pausa(1300);
    }

    // 3) Especiales: una pagina por juego (traen ~10 dias de historial)
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
          if (!especialesPorDia[t.fecha]) continue; // fuera de rango
          const validos = t.numeros.filter(x => x >= juego.rango[0] && x <= juego.rango[1]);
          const esDig = juego.tipo === 'pega3' || juego.tipo === 'pega4';
          const usar = esDig ? validos : [...new Set(validos)];
          if (usar.length >= juego.cant) { especialesPorDia[t.fecha][clave] = usar.slice(0, juego.cant); n++; }
        }
        logBF(`especial ${clave} (${slug}): ${n} dias en rango`);
      } catch (e) {
        logBF(`especial ${clave} (${slug}): AVISO ${e.response?.status || e.message}`);
        slugsMalos.add(slug); // landing 404 = el juego no existe en enloteria
      }
    }

    // 3b) EXCAVACIÓN PROFUNDA: para fechas viejas que la página de aterrizaje
    // no cubre (~12 días), enloteria tiene URLs por fecha:
    // /resultados-{slug}-YYYY-MM-DD — se piden una a una, con pausa.
    // 404 en una fecha = ese día no hay página (ej. Loto en día sin sorteo):
    // se salta honestamente, no se inventa nada.
    for (const [clave, slug] of Object.entries(ESPECIALES_ENLOTERIA)) {
      const juego = plantilla[clave];
      if (!juego || slugsMalos.has(slug)) continue;
      const re = ESPECIALES_ENLOTERIA_RE[clave];
      let nProf = 0, n404 = 0;
      for (const f of fechas) {
        if (especialesPorDia[f][clave]) continue; // ya lo tenemos del landing
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
        } catch (e) {
          n404++;
        }
        await pausa(1100);
      }
      if (nProf > 0 || n404 > 0) logBF(`especial ${clave} EXCAVACION: +${nProf} fechas antiguas (${n404} sin pagina)`);
    }

    // 4) Fusionar SIN pisar datos + guardar
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
      logBF(`${f}: +${nuevos} sorteos nuevos${guardar ? (guardado ? ' -> GUARDADO' : (nuevos > 0 ? ' -> ERROR al guardar' : '')) : ' (simulacion)'}`);
    }
    estadoBackfill.resumen = resumen;
    logBF('LISTO Backfill terminado');
  } catch (e) {
    logBF(`ERROR GENERAL: ${e.message}`);
  } finally {
    estadoBackfill.activo = false;
  }
}


// ── SEMILLA GANAMAS (datos históricos raspados el 4 jul 2026) ──────────────
// ganamas.com.do bloquea la IP de Render (403), así que estos datos fueron
// extraídos externamente y verificados: Cuartetas (4 núm 00-99) y Pega 3 Más
// (3 núm 00-50), del 23 abr al 11 jun 2026. El sitio está congelado desde el
// 11 jun, por lo que esta semilla es estable y no necesita actualizarse.
const GANAMAS_SEED = {"cuarteta_m":{"2026-06-11":[94,30,5,83],"2026-06-10":[42,90,83,87],"2026-06-09":[59,89,94,56],"2026-06-08":[21,91,15,0],"2026-06-07":[39,46,60,30],"2026-06-06":[90,54,96,47],"2026-06-05":[69,32,56,8],"2026-06-04":[62,74,43,8],"2026-06-03":[21,38,99,17],"2026-06-02":[48,52,7,40],"2026-06-01":[24,86,12,93],"2026-05-31":[18,67,7,67],"2026-05-30":[45,93,99,56],"2026-05-29":[34,7,29,61],"2026-05-28":[78,21,71,10],"2026-05-27":[65,64,99,91],"2026-05-26":[62,98,99,87],"2026-05-25":[19,87,65,81],"2026-05-24":[99,66,27,58],"2026-05-23":[9,58,25,38],"2026-05-22":[92,46,87,91],"2026-05-21":[35,35,19,64],"2026-05-20":[86,36,15,33],"2026-05-19":[21,23,54,14],"2026-05-18":[96,17,67,82],"2026-05-17":[35,73,60,26],"2026-05-16":[34,49,11,3],"2026-05-15":[31,25,35,80],"2026-05-14":[12,18,32,56],"2026-05-13":[91,58,5,36],"2026-05-12":[35,42,64,91],"2026-05-11":[76,37,38,29],"2026-05-10":[42,61,20,89],"2026-05-09":[19,80,6,95],"2026-05-08":[70,81,99,84],"2026-05-07":[71,30,18,77],"2026-05-06":[34,39,23,72],"2026-05-05":[47,28,65,59],"2026-05-04":[72,84,29,72],"2026-05-03":[90,34,76,34],"2026-05-02":[63,62,3,48],"2026-05-01":[73,41,86,24],"2026-04-30":[69,75,77,47],"2026-04-29":[67,61,0,54],"2026-04-28":[68,31,10,26],"2026-04-27":[30,70,87,10],"2026-04-26":[73,35,97,43],"2026-04-25":[0,1,23,88]},"cuarteta_md":{"2026-06-11":[67,2,45,66],"2026-06-10":[70,90,18,35],"2026-06-09":[74,89,65,68],"2026-06-08":[11,7,11,84],"2026-06-07":[48,36,78,33],"2026-06-06":[49,83,62,99],"2026-06-05":[85,31,46,73],"2026-06-04":[19,4,93,78],"2026-06-03":[16,79,24,16],"2026-06-02":[74,17,83,82],"2026-06-01":[61,28,77,30],"2026-05-31":[14,56,53,53],"2026-05-30":[68,8,78,60],"2026-05-29":[17,51,51,12],"2026-05-28":[18,95,40,74],"2026-05-27":[3,56,39,52],"2026-05-26":[14,73,80,38],"2026-05-25":[96,64,37,54],"2026-05-24":[78,60,65,12],"2026-05-23":[18,20,81,40],"2026-05-22":[30,98,0,90],"2026-05-21":[67,64,3,33],"2026-05-20":[43,79,74,29],"2026-05-19":[38,72,15,67],"2026-05-18":[86,83,69,87],"2026-05-17":[88,49,98,59],"2026-05-16":[43,10,94,68],"2026-05-15":[13,15,5,51],"2026-05-14":[12,56,70,14],"2026-05-13":[11,94,82,87],"2026-05-12":[68,7,41,75],"2026-05-11":[66,97,40,18],"2026-05-10":[6,4,63,8],"2026-05-09":[68,36,71,92],"2026-05-08":[57,7,78,58],"2026-05-07":[92,64,18,93],"2026-05-06":[70,21,42,96],"2026-05-05":[60,92,49,99],"2026-05-04":[64,64,88,50],"2026-05-03":[49,76,72,36],"2026-05-02":[42,62,34,97],"2026-05-01":[53,14,39,69],"2026-04-30":[97,80,88,64],"2026-04-29":[27,90,18,42],"2026-04-28":[78,42,7,63],"2026-04-27":[75,11,36,66],"2026-04-26":[85,28,92,25],"2026-04-25":[33,7,99,43],"2026-04-24":[58,70,31,44]},"cuarteta_t":{"2026-06-11":[41,5,95,38],"2026-06-10":[93,98,63,75],"2026-06-09":[42,69,72,13],"2026-06-08":[70,43,96,89],"2026-06-07":[29,16,44,84],"2026-06-06":[33,82,0,3],"2026-06-05":[29,9,11,60],"2026-06-04":[43,39,81,99],"2026-06-03":[68,11,56,21],"2026-06-02":[1,60,44,30],"2026-06-01":[44,81,91,7],"2026-05-31":[18,87,0,67],"2026-05-30":[22,0,71,37],"2026-05-29":[4,69,8,39],"2026-05-28":[93,71,54,43],"2026-05-27":[40,48,83,41],"2026-05-26":[15,34,5,26],"2026-05-25":[82,94,75,80],"2026-05-24":[96,29,70,47],"2026-05-23":[62,44,99,90],"2026-05-22":[58,95,86,4],"2026-05-21":[51,68,91,34],"2026-05-20":[79,85,75,82],"2026-05-19":[74,34,58,64],"2026-05-18":[27,72,5,68],"2026-05-17":[99,90,60,80],"2026-05-16":[7,66,15,47],"2026-05-15":[19,9,70,11],"2026-05-14":[67,6,42,78],"2026-05-13":[37,95,0,15],"2026-05-12":[4,87,24,90],"2026-05-11":[29,67,49,41],"2026-05-10":[14,63,46,11],"2026-05-09":[80,33,23,5],"2026-05-08":[73,25,61,44],"2026-05-07":[81,57,50,55],"2026-05-06":[63,79,33,45],"2026-05-05":[38,89,84,61],"2026-05-04":[20,2,71,63],"2026-05-03":[94,94,22,52],"2026-05-02":[67,73,32,58],"2026-05-01":[33,48,38,12],"2026-04-30":[73,37,69,13],"2026-04-29":[83,84,31,93],"2026-04-28":[72,58,26,23],"2026-04-27":[22,94,31,91],"2026-04-26":[6,62,86,95],"2026-04-25":[19,83,44,43]},"cuarteta_n":{"2026-06-11":[59,59,62,30],"2026-06-10":[72,93,72,74],"2026-06-09":[61,16,85,44],"2026-06-08":[99,4,55,61],"2026-06-07":[55,7,4,76],"2026-06-06":[77,55,30,9],"2026-06-05":[39,79,43,83],"2026-06-04":[17,16,79,28],"2026-06-03":[19,7,97,36],"2026-06-02":[81,40,52,86],"2026-06-01":[11,1,21,15],"2026-05-31":[59,73,1,35],"2026-05-30":[36,26,1,7],"2026-05-29":[47,10,28,83],"2026-05-28":[5,63,48,83],"2026-05-27":[30,89,0,73],"2026-05-26":[17,62,66,93],"2026-05-25":[25,13,1,66],"2026-05-24":[86,45,72,76],"2026-05-23":[22,11,95,56],"2026-05-22":[95,6,87,45],"2026-05-21":[62,41,50,32],"2026-05-20":[20,8,44,46],"2026-05-19":[13,6,14,66],"2026-05-18":[93,9,40,95],"2026-05-17":[23,23,74,92],"2026-05-16":[37,4,78,39],"2026-05-15":[28,28,22,65],"2026-05-14":[29,67,32,7],"2026-05-13":[49,89,22,47],"2026-05-12":[18,79,61,53],"2026-05-11":[48,76,56,32],"2026-05-10":[19,90,94,65],"2026-05-09":[69,92,44,27],"2026-05-08":[52,31,72,94],"2026-05-07":[3,18,17,69],"2026-05-06":[4,6,31,25],"2026-05-05":[23,91,59,41],"2026-05-04":[97,85,30,59],"2026-05-03":[98,23,19,28],"2026-05-02":[57,33,53,56],"2026-05-01":[85,14,91,34],"2026-04-30":[67,66,11,43],"2026-04-29":[32,93,17,25],"2026-04-28":[36,35,98,88],"2026-04-27":[92,74,26,10],"2026-04-26":[98,14,46,49],"2026-04-25":[14,40,95,44],"2026-04-24":[37,17,38,46]},"pega3mas":{"2026-06-11":[14,32,8],"2026-06-10":[22,22,4],"2026-06-09":[46,13,38],"2026-06-08":[37,27,31],"2026-06-07":[48,45,16],"2026-06-06":[19,7,26],"2026-06-05":[22,37,40],"2026-06-04":[29,49,29],"2026-06-03":[30,10,3],"2026-06-02":[49,22,31],"2026-06-01":[10,38,16],"2026-05-31":[16,4,13],"2026-05-30":[6,14,38],"2026-05-29":[2,33,46],"2026-05-28":[43,6,30],"2026-05-27":[20,2,36],"2026-05-26":[21,7,15],"2026-05-25":[49,4,6],"2026-05-24":[14,49,0],"2026-05-23":[45,45,22],"2026-05-22":[6,29,47],"2026-05-21":[38,22,15],"2026-05-20":[23,24,38],"2026-05-19":[19,3,38],"2026-05-18":[32,22,41],"2026-05-17":[47,19,17],"2026-05-16":[33,29,42],"2026-05-15":[2,35,42],"2026-05-14":[7,19,42],"2026-05-13":[38,47,33],"2026-05-12":[10,18,12],"2026-05-11":[30,24,50],"2026-05-10":[20,43,32],"2026-05-09":[6,16,13],"2026-05-08":[8,43,1],"2026-05-07":[31,8,50],"2026-05-06":[21,39,41],"2026-05-05":[39,7,33],"2026-05-04":[18,37,1],"2026-05-03":[28,2,45],"2026-05-02":[13,39,43],"2026-05-01":[23,20,4],"2026-04-30":[27,7,19],"2026-04-29":[24,22,3],"2026-04-28":[10,39,36],"2026-04-27":[11,4,4],"2026-04-26":[48,28,0],"2026-04-25":[18,22,25],"2026-04-24":[29,13,41],"2026-04-23":[3,37,33]}};

async function ejecutarBackfillSeed(guardar) {
  estadoBackfill = { activo: true, inicio: new Date().toISOString(), log: [], resumen: null };
  try {
    const hoy = fechaRD();
    const fechasSet = new Set();
    for (const clave of Object.keys(GANAMAS_SEED)) {
      for (const f of Object.keys(GANAMAS_SEED[clave])) if (f < hoy) fechasSet.add(f);
    }
    const fechas = [...fechasSet].sort();
    logBF(`SEED: ${fechas.length} fechas (${fechas[0]} a ${fechas[fechas.length-1]}) - guardar=${guardar}`);

    const existentes = {};
    if (SUPABASE_ACTIVO) {
      try {
        const r = await axios.get(
          `${SUPABASE_URL}/rest/v1/historico?select=fecha,sorteos,cuartetas,especiales&fecha=gte.${fechas[0]}&fecha=lte.${fechas[fechas.length-1]}`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, timeout: 20000 }
        );
        for (const row of r.data) existentes[row.fecha] = row;
        logBF(`Supabase: ${r.data.length} dias ya existen en el rango`);
      } catch (e) { logBF(`AVISO no pude leer Supabase: ${e.message}`); }
    }

    let totalNuevos = 0, diasGuardados = 0;
    for (const f of fechas) {
      const base = existentes[f] || { fecha: f, sorteos: crearSorteos(), cuartetas: crearCuartetas(), especiales: crearJuegosEspeciales() };
      base.sorteos = base.sorteos || crearSorteos();
      base.cuartetas = base.cuartetas || crearCuartetas();
      base.especiales = base.especiales || crearJuegosEspeciales();
      let nuevos = 0;
      for (const clave of Object.keys(GANAMAS_SEED)) {
        const nums = GANAMAS_SEED[clave][f];
        if (!nums) continue;
        const dest = clave === 'pega3mas' ? base.especiales[clave] : base.cuartetas[clave];
        if (dest && (!dest.numeros || dest.numeros.length === 0)) {
          dest.numeros = nums;
          dest.estado = 'disponible';
          nuevos++;
        }
      }
      if (nuevos > 0) {
        totalNuevos += nuevos;
        if (guardar) {
          const ok = await guardarEnSupabase(base);
          if (ok) diasGuardados++;
          await new Promise(r => setTimeout(r, 150));
        }
      }
    }
    logBF(`RESUMEN SEED: +${totalNuevos} sorteos en ${fechas.length} fechas${guardar ? ` -> ${diasGuardados} dias GUARDADOS` : ' (simulacion)'}`);
    estadoBackfill.resumen = { fechas: fechas.length, nuevos: totalNuevos, guardados: diasGuardados, modo: guardar ? 'GUARDADO' : 'SIMULACION' };
    logBF('LISTO Backfill seed terminado');
  } catch (e) {
    logBF(`ERROR GENERAL: ${e.message}`);
  } finally {
    estadoBackfill.activo = false;
  }
}

// ── BACKFILL histórico desde ganamas.com.do ────────────────────────────────
// ganamas.com.do es SSR pero está CONGELADO desde el 11 jun 2026 — no sirve
// como fuente en vivo, pero tiene ~2 meses de historial real (abr → 11 jun)
// de las 4 Cuartetas y el Pega 3 Más, juegos que hoy tienen CERO historial.
// Parser lineal defensivo: recorre los nodos de texto en orden y agrupa
// "fecha → números" sin depender de clases CSS.

const GANAMAS_JUEGOS = {
  // clave interna -> { url, destino ('cuartetas'|'especiales'), cant, rango }
  cuarteta_m:  { slug: 'la-cuarteta-manana',    destino: 'cuartetas',  cant: 4, rango: [0, 99] },
  cuarteta_md: { slug: 'la-cuarteta-medio-dia', destino: 'cuartetas',  cant: 4, rango: [0, 99] },
  cuarteta_t:  { slug: 'la-cuarteta-tarde',     destino: 'cuartetas',  cant: 4, rango: [0, 99] },
  cuarteta_n:  { slug: 'la-cuarteta-noche',     destino: 'cuartetas',  cant: 4, rango: [0, 99] },
  pega3mas:    { slug: 'pega-3-mas-leidsa',     destino: 'especiales', cant: 3, rango: [0, 50] },
};

const MESES_ABREV = {
  ene:'01', feb:'02', mar:'03', abr:'04', may:'05', jun:'06',
  jul:'07', ago:'08', sep:'09', oct:'10', nov:'11', dic:'12'
};

// "jue, 11 jun 2026" -> "2026-06-11"
function fechaGanamas(texto) {
  const m = texto.match(/(\d{1,2})\s+(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*\.?,?\s+(\d{4})/i); // acepta 'jue, 11 jun 2026' (ganamas) y '17 de Julio 2026' (yelu)
  if (!m) return null;
  return `${m[3]}-${MESES_ABREV[m[2].toLowerCase()]}-${String(m[1]).padStart(2, '0')}`;
}

// Parser lineal: stream de nodos de texto en orden del documento.
// Una fecha abre una "tarjeta"; los números de 1-2 dígitos que siguen
// le pertenecen hasta la próxima fecha. Se toman máximo `cant`.
function parsearGanamas(html, cant, rango) {
  const $ = cheerio.load(html);
  const porFecha = {};
  let fechaActual = null;

  $('body *').addBack().contents().each((_, node) => {
    if (node.type !== 'text') return;
    const t = $(node).text().trim();
    if (!t) return;

    // Ignorar dígitos dentro de enlaces/nav/footer (paginación "2 3 4...8",
    // menús, etc.) — solo un número de paginación bastaría para completar
    // con basura una tarjeta incompleta
    let p = node.parent;
    let excluido = false;
    while (p && p.type === 'tag') {
      const tag = (p.tagName || p.name || '').toLowerCase();
      if (tag === 'a' || tag === 'nav' || tag === 'header' || tag === 'footer' || tag === 'script' || tag === 'style') { excluido = true; break; }
      p = p.parent;
    }

    const f = fechaGanamas(t);
    if (f) { fechaActual = f; if (!porFecha[f]) porFecha[f] = []; return; }
    if (excluido) return;

    if (fechaActual && /^\d{1,2}$/.test(t)) {
      const n = parseInt(t, 10);
      if (n >= rango[0] && n <= rango[1] && porFecha[fechaActual].length < cant) {
        porFecha[fechaActual].push(n);
      }
    }
  });

  // Solo tarjetas completas (cant exacto) — sin datos a medias
  const resultado = {};
  for (const [f, nums] of Object.entries(porFecha)) {
    if (nums.length === cant) resultado[f] = nums;
  }
  return resultado;
}

async function ejecutarBackfillGanamas(paginas, guardar) {
  estadoBackfill = { activo: true, inicio: new Date().toISOString(), log: [], resumen: null };
  const pausa = ms => new Promise(r => setTimeout(r, ms));
  try {
    logBF(`GANAMAS: hasta ${paginas} paginas por juego - guardar=${guardar}`);
    const hoy = fechaRD();

    // 1) Raspar cada juego, página por página
    const datos = {}; // clave -> { fecha: [nums] }
    for (const [clave, cfg] of Object.entries(GANAMAS_JUEGOS)) {
      datos[clave] = {};
      for (let p = 1; p <= paginas; p++) {
        const url = p === 1
          ? `https://ganamas.com.do/${cfg.slug}`
          : `https://ganamas.com.do/${cfg.slug}/pagina/${p}`;
        try {
          const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
          const tarjetas = parsearGanamas(res.data, cfg.cant, cfg.rango);
          let n = 0;
          for (const [f, nums] of Object.entries(tarjetas)) {
            if (f >= hoy) continue; // solo pasado
            if (!datos[clave][f]) { datos[clave][f] = nums; n++; }
          }
          logBF(`${clave} pag ${p}: +${n} fechas`);
          if (n === 0 && p > 1) break; // se acabó el historial
        } catch (e) {
          logBF(`${clave} pag ${p}: AVISO ${e.response?.status || e.message}`);
          break; // 404 en página = fin de paginación (o slug malo en pag 1)
        }
        await pausa(1300);
      }
      logBF(`${clave}: TOTAL ${Object.keys(datos[clave]).length} fechas`);
    }

    // 2) Consolidar el conjunto de fechas y leer lo existente en Supabase
    const fechasSet = new Set();
    for (const clave of Object.keys(datos)) {
      for (const f of Object.keys(datos[clave])) fechasSet.add(f);
    }
    const fechas = [...fechasSet].sort();
    if (fechas.length === 0) { logBF('Sin datos utilizables'); return; }
    logBF(`Rango encontrado: ${fechas[0]} a ${fechas[fechas.length - 1]} (${fechas.length} fechas)`);

    const existentes = {};
    if (SUPABASE_ACTIVO) {
      try {
        const r = await axios.get(
          `${SUPABASE_URL}/rest/v1/historico?select=fecha,sorteos,cuartetas,especiales&fecha=gte.${fechas[0]}&fecha=lte.${fechas[fechas.length - 1]}`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, timeout: 20000 }
        );
        for (const row of r.data) existentes[row.fecha] = row;
        logBF(`Supabase: ${r.data.length} dias ya existen en el rango`);
      } catch (e) { logBF(`AVISO no pude leer Supabase: ${e.message}`); }
    }

    // 3) Fusionar SIN pisar + guardar
    let totalNuevos = 0, diasGuardados = 0;
    for (const f of fechas) {
      const base = existentes[f] || { fecha: f, sorteos: crearSorteos(), cuartetas: crearCuartetas(), especiales: crearJuegosEspeciales() };
      base.sorteos = base.sorteos || crearSorteos();
      base.cuartetas = base.cuartetas || crearCuartetas();
      base.especiales = base.especiales || crearJuegosEspeciales();
      let nuevos = 0;
      for (const [clave, cfg] of Object.entries(GANAMAS_JUEGOS)) {
        const nums = datos[clave][f];
        if (!nums) continue;
        const dest = base[cfg.destino][clave];
        if (dest && (!dest.numeros || dest.numeros.length === 0)) {
          dest.numeros = nums;
          dest.estado = 'disponible';
          nuevos++;
        }
      }
      if (nuevos > 0) {
        totalNuevos += nuevos;
        if (guardar) {
          const ok = await guardarEnSupabase(base);
          if (ok) diasGuardados++;
          await pausa(150);
        }
      }
    }
    logBF(`RESUMEN: +${totalNuevos} sorteos en ${fechas.length} fechas${guardar ? ` -> ${diasGuardados} dias GUARDADOS` : ' (simulacion)'}`);
    estadoBackfill.resumen = { fechas: fechas.length, nuevos: totalNuevos, guardados: diasGuardados, modo: guardar ? 'GUARDADO' : 'SIMULACION' };
    logBF('LISTO Backfill ganamas terminado');
  } catch (e) {
    logBF(`ERROR GENERAL: ${e.message}`);
  } finally {
    estadoBackfill.activo = false;
  }
}


// ── RESPALDO 3: yelu.do ─────────────────────────────────────────────────────
// Activado tras la crisis del 17-jul (conectate muerto + enloteria congelado).
// yelu.do es SSR, auditado contra nuestros propios datos (coincidencia exacta
// en fechas de control). Reutiliza parsearGanamas (parser lineal blindado).
// v1: solo las 4 quinielas de un-sorteo-por-día (sin ambigüedad de horario).
const YELU_FUENTES = {
  gana_mas: 'lottery/results/gana-mas',
  nacional: 'lottery/results/loteria-nacional',
  leidsa:   'leidsa/results/quiniela-pale',
  loteka:   'loteria-loteka/results/quiniela-loteka',
};

async function scrapeYelu() {
  const objetivos = Object.entries(YELU_FUENTES)
    .filter(([k]) => estado.sorteos[k] && estado.sorteos[k].numeros.length < 3);
  if (!objetivos.length) return 0;
  console.log(`📡 [RESPALDO 3] yelu.do — ${objetivos.map(([k]) => k).join(', ')}...`);
  const hoy = fechaRD();
  let conteo = 0;
  for (const [clave, ruta] of objetivos) {
    try {
      const res = await axios.get(`https://www.yelu.do/${ruta}`, { headers: HEADERS, timeout: 15000 });
      const tarjetas = parsearGanamas(res.data, 3, [0, 99]);
      const nums = tarjetas[hoy];
      if (nums && nums.length === 3 && !nums.every(n => n === nums[0])) {
        estado.sorteos[clave].numeros = nums;
        estado.sorteos[clave].estado = 'disponible';
        conteo++;
        console.log(`  ✓ [yelu] ${estado.sorteos[clave].nombre}: ${nums.join('-')}`);
      }
    } catch (e) {
      console.error(`  ⚠️ [yelu] ${clave} ERROR: ${e.response?.status || e.message}`);
    }
    await new Promise(r => setTimeout(r, 1200));
  }
  console.log(`✅ [RESPALDO 3] yelu.do: ${conteo} sorteos`);
  return conteo;
}


// ── Pega 4 Real vía yelu.do (v7.40) ────────────────────────────────────────
// enloteria no publica el Pega 4; yelu sí: tabla SSR de fechas + 4 cifras 0-9.
async function scrapePega4Yelu() {
  const juego = estado.especiales.pega4king;
  if (!juego || juego.numeros.length > 0) return 0;
  try {
    const res = await axios.get('https://www.yelu.do/loteria-real/results/pega-4-real', { headers: HEADERS, timeout: 15000 });
    const tarjetas = parsearGanamas(res.data, 4, [0, 9]);
    const nums = tarjetas[fechaRD()];
    if (nums && nums.length === 4) {
      juego.numeros = nums;
      juego.estado = 'disponible';
      console.log(`  ✓ [yelu] Pega 4 Real: ${nums.join('-')}`);
      return 1;
    }
  } catch (e) {
    console.error(`  ⚠️ [yelu] pega4real ERROR: ${e.response?.status || e.message}`);
  }
  return 0;
}

async function sincronizar() {
  if (sincronizando) {
    console.log('⏭️  Sync ya en curso, saltando...');
    return;
  }
  sincronizando = true;
  try {
  const hoy = fechaRD();
  console.log(`\n🔄 [${horaRD()} RD] Sincronizando... (${hoy})`);

  // Nuevo día → guardar histórico (NO se borra, se preserva)
  if (hoy !== estado.fecha) {
    const snapshot = {
      fecha: estado.fecha,
      sorteos: JSON.parse(JSON.stringify(estado.sorteos)),
      cuartetas: JSON.parse(JSON.stringify(estado.cuartetas)),
      especiales: JSON.parse(JSON.stringify(estado.especiales))
    };
    estado.historico.unshift(snapshot);
    if (estado.historico.length > 90) estado.historico.pop();

    // Resumen nocturno antes de reiniciar
    const totalDia = Object.values(estado.sorteos).filter(s=>s.numeros.length>=3).length;
    const totalCuarteta = Object.values(estado.cuartetas).filter(c=>c.numeros.length>=4).length;
    const totalEsp = Object.values(estado.especiales).filter(e=>e.numeros.length>0).length;
    await enviarTelegram(
      `🌙 <b>RESUMEN DEL DÍA ${estado.fecha}</b>\n\n` +
      `✅ Sorteos capturados: <b>${totalDia}/${Object.keys(estado.sorteos).length}</b>\n` +
      `🎲 Cuartetas capturadas: <b>${totalCuarteta}/4</b>\n` +
      `🎰 Especiales capturados: <b>${totalEsp}/${Object.keys(estado.especiales).length}</b>\n\n` +
      `💾 Histórico guardado en Supabase.\n🔄 Iniciando nuevo día: <b>${hoy}</b>`
    );

    // Reiniciar estado del día
    estado.sorteos = crearSorteos();
    estado.cuartetas = crearCuartetas();
    estado.especiales = crearJuegosEspeciales();
    estado.fecha = hoy;
    // Limpiar notificados del día anterior
    Object.keys(yaNotificado).forEach(k => delete yaNotificado[k]);

    console.log(`📅 Nuevo día ${hoy}. Histórico preservado: ${estado.historico.length} días.`);
    guardarEnDisco();
    await guardarEnSupabase(snapshot);
  }

  // Intentar fuente primaria: API JSON de conectate
  await scrapeConectateAPI();

  // Si faltan, intentar HTML de loteriasdominicanas.com
  let pendientes = Object.values(estado.sorteos).filter(s => s.numeros.length < 3).length;
  if (pendientes > 0) await scrapeLotDominicanas();

  // Si aún faltan, intentar enloteria.com (SSR, números en el HTML)
  pendientes = Object.values(estado.sorteos).filter(s => s.numeros.length < 3).length;
  if (pendientes > 0) await scrapeEnloteria();

  // Si aún faltan, RESPALDO 3: yelu.do (crisis 17-jul: enloteria congelado)
  pendientes = Object.values(estado.sorteos).filter(s => s.numeros.length < 3).length;
  if (pendientes > 0) await scrapeYelu();

  pendientes = Object.values(estado.sorteos).filter(s => s.numeros.length < 3).length;
  if (pendientes > 8) await scrapeQuinielasRD();

  // La Cuarteta (Anguila, 4 dígitos)
  const pendCuarteta = Object.values(estado.cuartetas).filter(c => c.numeros.length < 4).length;
  if (pendCuarteta > 0) await scrapeCuartetaLotDominicanas();

  const pendEsp = Object.values(estado.especiales).filter(e => e.numeros.length === 0).length;
  if (pendEsp > 0) await scrapeLeidsa();

  // Especiales que leidsa.com no cubrió: enloteria.com (kino, loto, megachance)
  const pendEsp2 = Object.values(estado.especiales).filter(e => e.numeros.length === 0).length;
  if (pendEsp2 > 0) await scrapeEspecialesEnloteria();

  // Pega 4 Real: fuente propia en yelu (v7.40)
  await scrapePega4Yelu();

  estado.hora_actualizacion = horaRD();
  const disp = Object.values(estado.sorteos).filter(s => s.numeros.length >= 3).length;
  const dispC = Object.values(estado.cuartetas).filter(c => c.numeros.length >= 4).length;
  const dispE = Object.values(estado.especiales).filter(e => e.numeros.length > 0).length;
  console.log(`📊 RESULTADO: ${disp}/${Object.keys(estado.sorteos).length} sorteos · ${dispC}/4 cuartetas · ${dispE}/${Object.keys(estado.especiales).length} especiales\n`);
  guardarEnDisco();
  await guardarEnSupabase({ fecha: estado.fecha, sorteos: estado.sorteos, cuartetas: estado.cuartetas, especiales: estado.especiales });
  await notificarNuevosSorteos();
  await chequearEnvioAutomaticoPredicciones();
  } catch(e) {
    console.error('⚠️ Error en sincronizar:', e.message);
  } finally {
    sincronizando = false;
  }
}

// Auto-sync cada 15 minutos
setInterval(sincronizar, 15 * 60 * 1000);

// ── ENDPOINTS (formato esperado por el frontend v4.0-REAL) ─────────────────────

app.get('/api/hoy', async (req, res) => {
  await sincronizar();
  res.json({
    fecha: estado.fecha,
    hora_actualizacion: estado.hora_actualizacion,
    sorteos: estado.sorteos,
    cuartetas: estado.cuartetas,
    especiales: estado.especiales
  });
});

app.get('/api/radar', async (req, res) => {
  await sincronizar();
  res.json({
    fecha: estado.fecha,
    hora_actualizacion: estado.hora_actualizacion,
    sorteos: estado.sorteos,
    cuartetas: estado.cuartetas,
    especiales: estado.especiales
  });
});

app.get('/api/historico', (req, res) => {
  res.json({ historico: estado.historico, total: estado.historico.length });
});

app.get('/api/consultar', (req, res) => {
  const { loteria, fecha_inicio, fecha_fin } = req.query;
  const todos = [
    { fecha: estado.fecha, sorteos: { ...estado.sorteos, ...estado.cuartetas, ...estado.especiales } },
    ...estado.historico.map(h => ({ fecha: h.fecha, sorteos: { ...h.sorteos, ...(h.cuartetas || {}), ...(h.especiales || {}) } }))
  ];
  const todasLasClaves = [...Object.keys(estado.sorteos), ...Object.keys(estado.cuartetas), ...Object.keys(estado.especiales)];
  const resultados = [];
  for (const dia of todos) {
    if (fecha_inicio && dia.fecha < fecha_inicio) continue;
    if (fecha_fin   && dia.fecha > fecha_fin)     continue;
    const lotes = (loteria && loteria !== 'todas') ? [loteria] : todasLasClaves;
    for (const k of lotes) {
      const s = dia.sorteos[k];
      const minNum = k.startsWith('cuarteta_') ? 4 : (estado.especiales[k] ? 1 : 3);
      if (s && s.numeros && s.numeros.length >= minNum) {
        resultados.push({ fecha: dia.fecha, clave: k, nombre: s.nombre, numeros: s.numeros });
      }
    }
  }
  res.json({ resultados, total: resultados.length });
});

app.get('/api/estadisticas', (req, res) => {
  const { loteria } = req.query;
  const todos = [
    { fecha: estado.fecha, sorteos: estado.sorteos },
    ...estado.historico.map(h => ({ fecha: h.fecha, sorteos: h.sorteos }))
  ];
  const freq = {}, pares = {}, trips = {};
  let total = 0;
  for (const dia of todos) {
    const lotes = (loteria && loteria !== 'todas')
      ? [loteria] : Object.keys(estado.sorteos);
    for (const k of lotes) {
      const s = dia.sorteos[k];
      if (!s || s.numeros.length < 3) continue;
      total++;
      for (const n of s.numeros) freq[n] = (freq[n]||0) + 1;
      for (let i=0;i<s.numeros.length;i++) for (let j=i+1;j<s.numeros.length;j++) {
        const key = [s.numeros[i],s.numeros[j]].sort((a,b)=>a-b).join('-');
        pares[key] = (pares[key]||0) + 1;
      }
      const tk = s.numeros.slice(0,3).sort((a,b)=>a-b).join('-');
      trips[tk] = (trips[tk]||0) + 1;
    }
  }
  res.json({
    topNumeros: Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([n,f])=>({numero:+n,frecuencia:f})),
    topPares:   Object.entries(pares).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([p,f])=>({par:p,frecuencia:f})),
    topTrips:   Object.entries(trips).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([t,f])=>({tripleta:t,frecuencia:f})),
    total_sorteos: total
  });
});

// Endpoint de diagnóstico - SOLO conectate API (rápido)
app.get('/api/debug', async (req, res) => {
  try {
    const r1 = await axios.get('https://www.conectate.com.do/loterias/api/widget', {
      headers: { ...HEADERS, 'Accept': 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' },
      timeout: 8000
    });
    let items = r1.data;
    if (!Array.isArray(items)) items = r1.data?.data || r1.data?.results || [];
    res.json({
      status: r1.status,
      total_items: items.length,
      // Lista todos los game_title con su mapeo y scores
      todos_los_items: items.map(item => ({
        game_title: item.game_title,
        clave_mapeada: buscarClave(item.game_title || ''),
        score: item.score,
        today: item.today,
        date: item.date,
        update_date_time: item.update_date_time
      }))
    });
  } catch (e) {
    res.status(200).json({ error: e.message, code: e.code, status: e.response?.status });
  }
});

// Endpoint de diagnóstico - SOLO loteriasdominicanas.com (rápido)
app.get('/api/debug2', async (req, res) => {
  try {
    const r2 = await axios.get('https://loteriasdominicanas.com/', { headers: HEADERS, timeout: 8000 });
    const $ = cheerio.load(r2.data);
    const bloques = [];
    $('.game-block').each((i, b) => {
      const titulo = $(b).find('.game-title span').text().trim();
      const tieneBallMode = $(b).find('.game-scores.ball-mode').length > 0;
      const scores = [];
      $(b).find('.game-scores.ball-mode span.score').each((j, s) => scores.push($(s).text().trim()));
      const clave = buscarClave(titulo);
      const claveCuarteta = buscarClaveCuarteta(titulo);
      bloques.push({ titulo, clave, claveCuarteta, tieneBallMode, scores });
    });
    res.json({ total_bloques: bloques.length, bloques });
  } catch (e) {
    res.status(200).json({ error: e.message, code: e.code });
  }
});

app.get('/api/debug-db', async (req, res) => {
  if (!SUPABASE_ACTIVO) {
    return res.json({ activo: false, mensaje: 'SUPABASE_URL / SUPABASE_KEY no configuradas en Render todavía.' });
  }
  const datos = await cargarDeSupabase();
  if (datos === null) {
    return res.json({ activo: true, conectado: false, mensaje: 'Variables configuradas pero la conexión falló.' });
  }
  res.json({ activo: true, conectado: true, dias_guardados: datos.length, fechas: datos.slice(0, 5).map(d => d.fecha) });
});

// Ver exactamente lo que manda la API de conectate.com.do para cualquier juego
// Uso: /api/debug-api?filtro=pega  (filtra por nombre, vacío = todos)
app.get('/api/debug-api', async (req, res) => {
  try {
    const r = await axios.get('https://www.conectate.com.do/loterias/api/widget', {
      headers: { ...HEADERS, 'Accept': 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' },
      timeout: 10000
    });
    const items = r.data?.response?.data || r.data?.data || r.data || [];
    const filtro = (req.query.filtro || '').toLowerCase();
    const resultado = items
      .filter(i => !filtro || (i.game_title || '').toLowerCase().includes(filtro))
      .map(i => ({
        nombre: i.game_title,
        today: i.today,
        fecha: i.date,
        score_raw: i.score,
        score_tipo: Array.isArray(i.score) ? `array[${i.score.length}]` : typeof i.score,
        mapeado_como: buscarClave(i.game_title || '') || buscarClaveEspecial(i.game_title || '') || '⚠️ sin mapeo'
      }));
    res.json({ total_items_api: items.length, filtrados: resultado.length, resultado });
  } catch(e) {
    res.status(200).json({
      error: e.message,
      status_real: e.response?.status,
      data_real: e.response?.data,
      url_usada: 'https://www.conectate.com.do/loterias/api/widget'
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    version: 'v7.45-BARBAROLOGO',
    status: 'ok',
    persistencia: SUPABASE_ACTIVO ? 'supabase (permanente)' : 'solo disco local',
    telegram: TG_ACTIVO ? `activo ✅ (${TG_CHAT_IDS.length} destinatario(s))` : 'no configurado',
    fecha_rd: fechaRD(),
    hora_rd: horaRD(),
    sorteos_hoy: Object.values(estado.sorteos).filter(s=>s.numeros.length>=3).length,
    cuartetas_hoy: Object.values(estado.cuartetas).filter(c=>c.numeros.length>=4).length,
    especiales_hoy: Object.values(estado.especiales).filter(e=>e.numeros.length>0).length,
    historico_dias: estado.historico.length,
    endpoints: ['/api/hoy','/api/radar','/api/consultar','/api/estadisticas','/api/historico','/api/debug','/api/debug2','/api/debug-db','/api/test-telegram','/api/predicciones-telegram','/api/test-enloteria','/api/laboratorio']
  });
});


// Backfill desde la SEMILLA embebida (cuartetas + pega 3 mas, sin depender
// de la IP de Render). 1) Simulacion: /api/backfill-seed  2) /api/backfill-seed?guardar=1
app.get('/api/backfill-seed', (req, res) => {
  if (estadoBackfill.activo) {
    return res.status(409).json({ error: 'Ya hay un backfill corriendo', ver: '/api/backfill-estado' });
  }
  const guardar = req.query.guardar === '1';
  ejecutarBackfillSeed(guardar);
  res.json({
    iniciado: true,
    juegos: Object.keys(GANAMAS_SEED),
    registros: Object.values(GANAMAS_SEED).reduce((a, o) => a + Object.keys(o).length, 0),
    modo: guardar ? 'GUARDAR EN SUPABASE' : 'SIMULACION (agrega &guardar=1)',
    progreso: '/api/backfill-estado'
  });
});

// Backfill historico desde GANAMAS (cuartetas + pega 3 mas, abr - 11 jun)
// 1) Simulacion: /api/backfill-ganamas
// 2) Guardar:    /api/backfill-ganamas?guardar=1
// 3) Progreso:   /api/backfill-estado (compartido con el de enloteria)
app.get('/api/backfill-ganamas', (req, res) => {
  if (estadoBackfill.activo) {
    return res.status(409).json({ error: 'Ya hay un backfill corriendo', ver: '/api/backfill-estado' });
  }
  const paginas = Math.min(parseInt(req.query.paginas) || 8, 12);
  const guardar = req.query.guardar === '1';
  ejecutarBackfillGanamas(paginas, guardar); // sin await: segundo plano
  res.json({
    iniciado: true, paginas,
    juegos: Object.keys(GANAMAS_JUEGOS),
    modo: guardar ? 'GUARDAR EN SUPABASE' : 'SIMULACION (agrega &guardar=1 para guardar de verdad)',
    nota: 'ganamas.com.do esta congelado desde el 11 jun — esto es solo historial, tarda ~1-2 min',
    progreso: '/api/backfill-estado'
  });
});

// Backfill historico (corre en segundo plano, no bloquea el sync)
// 1) Simulacion: /api/backfill-enloteria?desde=2026-06-23&hasta=2026-07-01
// 2) Guardar:    agrega &guardar=1
// 3) Progreso:   /api/backfill-estado
app.get('/api/backfill-enloteria', (req, res) => {
  const { desde, hasta } = req.query;
  const reF = /^\d{4}-\d{2}-\d{2}$/;
  if (!reF.test(desde || '') || !reF.test(hasta || '')) {
    return res.status(400).json({ error: 'Usa ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD (max 15 dias)' });
  }
  if (hasta >= fechaRD()) {
    return res.status(400).json({ error: 'Solo dias pasados: hasta debe ser menor que hoy (el dia de hoy lo maneja el sync normal)' });
  }
  if (estadoBackfill.activo) {
    return res.status(409).json({ error: 'Ya hay un backfill corriendo', ver: '/api/backfill-estado' });
  }
  const guardar = req.query.guardar === '1';
  ejecutarBackfill(desde, hasta, guardar); // sin await: segundo plano
  res.json({
    iniciado: true, desde, hasta,
    modo: guardar ? 'GUARDAR EN SUPABASE' : 'SIMULACION (agrega &guardar=1 para guardar de verdad)',
    progreso: '/api/backfill-estado'
  });
});

app.get('/api/backfill-estado', (req, res) => res.json(estadoBackfill));

// Endpoint de prueba: ver TODO lo que enloteria.com devuelve (mapeado o no)
// Uso: /api/test-enloteria          → resultados de hoy
//      /api/test-enloteria?dia=ayer → resultados de ayer
//      /api/test-enloteria?dia=antes-de-ayer
app.get('/api/test-enloteria', async (req, res) => {
  try {
    // Modo juego: /api/test-enloteria?juego=super-kino-tv (o toca-3,
    // el-quemaito-mayor, loto, megachance...) — inspecciona la página del juego
    if (req.query.juego) {
      const slug = String(req.query.juego).replace(/[^a-z0-9-]/g, '');
      const r = await axios.get(`https://enloteria.com/resultados-${slug}`, {
        headers: HEADERS, timeout: 15000
      });
      const tarjetas = parsearPaginaJuegoEnloteria(r.data);
      return res.json({ juego: slug, fecha_rd: fechaRD(), total: tarjetas.length, tarjetas });
    }

    const dia = ['ayer','antes-de-ayer'].includes(req.query.dia) ? req.query.dia : 'hoy';
    const r = await axios.get(`https://enloteria.com/resultados-loterias-${dia}`, {
      headers: HEADERS, timeout: 15000
    });
    const tarjetas = parsearEnloteria(r.data);
    res.json({
      dia,
      fecha_rd: fechaRD(),
      total: tarjetas.length,
      mapeadas: tarjetas.filter(t => t.clave).length,
      sin_mapear: tarjetas.filter(t => !t.clave).map(t => t.slug),
      tarjetas
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint para probar el bot manualmente
app.get('/api/test-telegram', async (req, res) => {
  if (!TG_ACTIVO) return res.json({ activo: false, mensaje: 'Faltan TELEGRAM_TOKEN / TELEGRAM_CHAT_IDS en Render.' });
  await enviarTelegram(
    `✅ <b>REYDIS RADAR PRO</b> — Test de conexión\n\n` +
    `🤖 Bot conectado correctamente.\n` +
    `👥 Destinatarios: <b>${TG_CHAT_IDS.length}</b>\n` +
    `📅 Fecha RD: ${fechaRD()} ${horaRD()}\n` +
    `📊 Sorteos hoy: ${Object.values(estado.sorteos).filter(s=>s.numeros.length>=3).length}/${Object.keys(estado.sorteos).length}`
  );
  res.json({ activo: true, destinatarios: TG_CHAT_IDS.length, mensaje: `¡Mensaje enviado a ${TG_CHAT_IDS.length} destinatario(s)!` });
});

// Envía las predicciones del día manualmente, sin esperar a las 7 AM



// ── 🎫 GENERADOR DE JUGADAS (/jugada) ──────────────────────────────────────
// Genera hasta 5 jugadas para un juego usando el histórico, cada una con
// una estrategia distinta — incluida una de azar puro como control honesto.
const JUGADA_CFG = {
  // clave: [grupo, tamaño de jugada del apostador, rango]
  superkino:  ['especiales', 10, [1, 80]],
  loto:       ['especiales', 6,  [1, 40]],
  lotomas:    ['especiales', 6,  [1, 40]],
  pega3mas:   ['especiales', 3,  [0, 50]],
  megachance: ['especiales', 5,  [0, 99]],
  quemaito:   ['especiales', 1,  [0, 99]],
};
const JUGADA_ALIAS = {
  kino: 'superkino', superkino: 'superkino', loto: 'loto', lotomas: 'lotomas',
  pega3: 'pega3mas', pega3mas: 'pega3mas', mega: 'megachance', megachance: 'megachance',
  quemaito: 'quemaito',
};

function generarJugadas(juegoTxt, cantidad) {
  const txt = (juegoTxt || '').toLowerCase();
  let clave = JUGADA_ALIAS[txt] || null;
  let grupo = clave ? 'especiales' : null;
  if (!clave) { // ¿es una quiniela? buscar por clave o nombre
    for (const [k, s] of Object.entries(estado.sorteos)) {
      if (k === txt || (s.nombre || '').toLowerCase().includes(txt)) { clave = k; grupo = 'sorteos'; break; }
    }
  }
  if (!clave) {
    return `No conozco el juego "${juegoTxt}". Prueba: kino, loto, lotomas, pega3, mega, quemaito, o el nombre de una quiniela (ej: /jugada anguila 3).`;
  }
  const esQuiniela = grupo === 'sorteos';
  const [, tam, rango] = esQuiniela ? [null, 2, [0, 99]] : JUGADA_CFG[clave]; // quiniela: palé de 2
  const n = Math.min(Math.max(parseInt(cantidad) || 4, 1), 5);

  // Frecuencia ponderada + días sin salir, del histórico de ESTE juego
  const dias = [...estado.historico].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const pesos = {}, ultimaVez = {};
  let sorteosVistos = 0;
  for (let i = 0; i < dias.length; i++) {
    const s = dias[i][grupo] && dias[i][grupo][clave];
    if (!s || !s.numeros || !s.numeros.length) continue;
    sorteosVistos++;
    const w = 0.5 + 0.5 * (i + 1) / dias.length;
    s.numeros.forEach((num, pos) => {
      const v = Number(num);
      pesos[v] = (pesos[v] || 0) + w * (esQuiniela ? (pos === 0 ? 60 : pos === 1 ? 8 : 4) : 1);
      ultimaVez[v] = i;
    });
  }
  if (sorteosVistos < 3) return `Solo tengo ${sorteosVistos} sorteos de ese juego — muy poco para generar jugadas.`;

  const universo = [];
  for (let v = rango[0]; v <= rango[1]; v++) universo.push(v);
  const ranking = [...universo].sort((a, b) => (pesos[b] || 0) - (pesos[a] || 0));
  const frios = [...universo].sort((a, b) => (ultimaVez[a] ?? -1) - (ultimaVez[b] ?? -1));
  const alAzar = () => {
    const bolsa = [...universo], out = [];
    while (out.length < tam) out.push(bolsa.splice(Math.floor(Math.random() * bolsa.length), 1)[0]);
    return out.sort((a, b) => a - b);
  };
  const mezclar = (a, b) => {
    const out = [...new Set([...a.slice(0, Math.ceil(tam / 2)), ...b])].slice(0, tam);
    let i = 0; while (out.length < tam) { const c = ranking[i++]; if (!out.includes(c)) out.push(c); }
    return out.sort((x, y) => x - y);
  };

  const estrategias = [
    ['🔥 Caliente ponderada', ranking.slice(0, tam).sort((a, b) => a - b)],
    ['🎯 Segunda línea',      ranking.slice(tam, tam * 2).sort((a, b) => a - b)],
    ['❄️ Fríos por ciclo',    frios.slice(0, tam).sort((a, b) => a - b)],
    ['⚖️ Mixta (hot+frío)',   mezclar(ranking, frios.slice(0, tam))],
    ['🎲 Azar puro (control)', alAzar()],
  ].slice(0, n);

  const f2 = v => String(v).padStart(2, '0');
  const nombre = esQuiniela ? (estado.sorteos[clave].nombre + ' (palé)') : estado.especiales[clave].nombre;
  const lineas = estrategias.map(([tit, nums], i) => `${i + 1}. ${tit}\n    <b>${nums.map(f2).join(' - ')}</b>`);
  return `🎫 <b>${n} JUGADAS — ${nombre}</b>\n<i>(base: ${sorteosVistos} sorteos reales)</i>\n\n` +
    lineas.join('\n') +
    `\n\n⚖️ Honestidad de la casa: ante la tómbola las ${n} valen exactamente lo mismo ` +
    `(el Laboratorio lo certificó) — elige la que te haga sonreír y juega solo lo que puedas perder. 😄`;
}

// ── 🧪 LABORATORIO DE MÉTODOS ───────────────────────────────────────────────
// Backtest walk-forward HONESTO de métodos folclóricos + el del Radar sobre
// todo el histórico: cada predicción usa SOLO datos anteriores a ese sorteo.
// La quiniela es aleatoria por diseño — esto mide si algún método supera
// al azar de forma sostenida, con evidencia y no con fe.
const espejoNum = n => (n % 10) * 10 + Math.floor(n / 10); // 27 -> 72
// Código Q (del video): palé = [1ro de ayer + Q_A, 1ro de ayer + Q_B] mod 100.
// El "1220" del maestro: Q_A=12, Q_B=20. Si la regla del video resulta ser
// otra variante, se ajusta AQUÍ en una línea.
const Q_A = 12, Q_B = 20;
function paleCodigoQ(primeroAyer) {
  return [(primeroAyer + Q_A) % 100, (primeroAyer + Q_B) % 100];
}

function backtestLaboratorio(filtroLoteria) {
  const dias = [...estado.historico].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const met = {
    repite1ro:  { nombre: 'Repite el 1ro (punto)',    tipo: 'punto', ev: 0, punto: 0 },
    espejo1ro:  { nombre: 'Espejo del 1ro (punto)',   tipo: 'punto', ev: 0, punto: 0 },
    paleAyer:   { nombre: 'Pale de ayer (1ro-2do)',   tipo: 'pale',  ev: 0, pale: 0, medio: 0 },
    paleEspejo: { nombre: 'Pale espejo (1ro+espejo)', tipo: 'pale',  ev: 0, pale: 0, medio: 0 },
    radarTop2:  { nombre: 'Radar top-2 ponderado',    tipo: 'pale',  ev: 0, pale: 0, medio: 0 },
    jala5:      { nombre: 'Jaladera ±5 (1ro+comp)',   tipo: 'pale',  ev: 0, pale: 0, medio: 0 },
    jala45:     { nombre: 'Jaladera equiv +45',       tipo: 'pale',  ev: 0, pale: 0, medio: 0 },
    jala50:     { nombre: 'Jaladera atraccion +50',   tipo: 'pale',  ev: 0, pale: 0, medio: 0 },
    terminal:   { nombre: 'Terminal del 1ro (folclor)', tipo: 'punto', ev: 0, punto: 0, azar: '27.10%' }, // azar propio: 1-(9/10)^3
    codigoQ:    { nombre: 'Codigo Q (1ro ayer +12/+20)', tipo: 'pale', ev: 0, pale: 0, medio: 0 },
    codigoQ7:   { nombre: 'Ventana Q7 (7 pales x dia)',  tipo: 'pale', ev: 0, pale: 0, medio: 0 },
    barbarologo:{ nombre: 'Tabla Barbarologo (dia del mes)', tipo: 'punto', ev: 0, punto: 0 },
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

      met.repite1ro.ev++;
      if (hoy.has(ayer[0])) {
        met.repite1ro.punto++;
        porLoteriaM1[clave] = (porLoteriaM1[clave] || 0) + 1;
      }

      met.espejo1ro.ev++;
      if (hoy.has(espejoNum(ayer[0]))) met.espejo1ro.punto++;

      met.paleAyer.ev++;
      {
        const jug = [...new Set([ayer[0], ayer[1]])];
        const hits = jug.filter(n => hoy.has(n)).length;
        if (hits >= 2) met.paleAyer.pale++;
        if (hits >= 1) met.paleAyer.medio++;
      }

      met.paleEspejo.ev++;
      {
        const jug = [...new Set([ayer[0], espejoNum(ayer[0])])];
        const hits = jug.filter(n => hoy.has(n)).length;
        if (hits >= 2) met.paleEspejo.pale++;
        if (hits >= 1) met.paleEspejo.medio++;
      }

      met.codigoQ.ev++;
      {
        const jug = [...new Set([(ayer[0] + Q_A) % 100, (ayer[0] + Q_B) % 100])];
        const hits = jug.filter(n => hoy.has(n)).length;
        if (hits >= 2) met.codigoQ.pale++;
        if (hits >= 1) met.codigoQ.medio++;
      }

      if (clave === 'loteka') {
        met.codigoQ7.ev++;
        let mejor = 0;
        for (let j = Math.max(0, i - 7); j < i; j++) {
          const jug = [...new Set(paleCodigoQ(serie[j].nums[0]))];
          const hits = jug.filter(n => hoy.has(n)).length;
          if (hits > mejor) mejor = hits;
        }
        if (mejor >= 2) met.codigoQ7.pale++;
        if (mejor >= 1) met.codigoQ7.medio++;
      }

      // Terminal: ¿algún número de hoy comparte última cifra con el 1ro de ayer?
      // Barbarólogo: número del día del mes como punto (tabla del almanaque)
      met.barbarologo.ev++;
      {
        const dia = parseInt((serie[i].f || '').slice(-2), 10);
        if (!isNaN(dia) && hoy.has(dia)) met.barbarologo.punto++;
      }

      met.terminal.ev++;
      {
        const t = ayer[0] % 10;
        if ([...hoy].some(n => n % 10 === t)) met.terminal.punto++;
      }

      // Jaladera: la "tabla de compañeros" de las bancas, a juicio
      for (const [mk, delta] of [['jala5', 5], ['jala45', 45], ['jala50', 50]]) {
        met[mk].ev++;
        const jug = [...new Set([ayer[0], (ayer[0] + delta) % 100])];
        const hits = jug.filter(n => hoy.has(n)).length;
        if (hits >= 2) met[mk].pale++;
        if (hits >= 1) met[mk].medio++;
      }

      met.radarTop2.ev++;
      {
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
  }

  const pct = (a, b) => (b ? +((100 * a) / b).toFixed(2) : 0);
  const resumen = {};
  for (const [k, m] of Object.entries(met)) {
    if (m.tipo === 'punto') {
      resumen[k] = { metodo: m.nombre, evaluaciones: m.ev, aciertos: m.punto,
        tasa_real: pct(m.punto, m.ev) + '%', azar_espera: m.azar || '3.00%' };
    } else {
      const esQ7 = (k === 'codigoQ7');
      resumen[k] = { metodo: m.nombre, evaluaciones: m.ev,
        pales_completos: m.pale, tasa_pale: pct(m.pale, m.ev) + '%', azar_pale: esQ7 ? '0.42%' : '0.06%',
        medios_pale: m.medio, tasa_medio: pct(m.medio, m.ev) + '%', azar_medio: esQ7 ? '34%' : '5.94%',
        ...(esQ7 ? { nota: '7 pales/dia (RD$7) — el azar de 7 boletos ya es mas alto, por eso su vara de comparacion sube' } : {}) };
    }
  }
  const topM1 = Object.entries(porLoteriaM1).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([k, c]) => ({ loteria: (estado.sorteos[k] && estado.sorteos[k].nombre) || k, repeticiones: c }));

  return {
    dias_historial: dias.length,
    nota: 'Walk-forward honesto: cada prediccion usa SOLO datos anteriores. La quiniela es aleatoria por diseño — esto mide si algun metodo supera al azar de forma sostenida.',
    resumen,
    donde_mas_repite_el_1ro: topM1,
  };
}

// 🧪 /api/laboratorio          -> todos los métodos vs todo el histórico
//    /api/laboratorio?loteria=gana_mas -> solo una lotería

// 🔬 /backtesting — libreta de calificaciones: qué habría jugado cada método
// (walk-forward, solo con datos previos) vs lo que REALMENTE salió ese día.
function textoBacktesting(arg) {
  const dias = [...estado.historico].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  if (dias.length < 2) return 'Aún no hay suficiente historial para backtesting.';

  let objetivos = [];
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) {
    objetivos = [arg];
  } else {
    let n = parseInt(arg, 10);
    if (isNaN(n) || n < 1) n = 1;
    n = Math.min(n, 7); // tope: 7 días por mensaje
    objetivos = dias.slice(-n).map(d => d.fecha);
  }

  const claves = new Set();
  for (const d of dias) for (const k of Object.keys(d.sorteos || {})) claves.add(k);
  const seriePor = {};
  for (const clave of claves) {
    const serie = [];
    for (const d of dias) {
      const s = d.sorteos && d.sorteos[clave];
      if (s && s.numeros && s.numeros.length >= 3) {
        serie.push({ f: d.fecha, nums: s.numeros.map(Number), nombre: s.nombre || clave });
      }
    }
    seriePor[clave] = serie;
  }

  const f2 = x => String(x).padStart(2, '0');
  const bloques = [];
  for (const fecha of objetivos) {
    const agg = {
      rep: { h: 0, ev: 0, det: [] }, esp: { h: 0, det: [] },
      pAyer: { p: 0, m: 0, det: [] }, pEsp: { p: 0, m: 0 },
      radar: { p: 0, m: 0, det: [] },
    };
    let lineaQ = null;

    for (const [clave, serie] of Object.entries(seriePor)) {
      const i = serie.findIndex(x => x.f === fecha);
      if (i < 1) continue;
      const ayer = serie[i - 1].nums;
      const hoyArr = serie[i].nums;
      const hoy = new Set(hoyArr);
      const nom = serie[i].nombre;

      agg.rep.ev++;
      if (hoy.has(ayer[0])) { agg.rep.h++; agg.rep.det.push(`${nom}: ${f2(ayer[0])}`); }

      { const e = espejoNum(ayer[0]);
        if (hoy.has(e)) { agg.esp.h++; agg.esp.det.push(`${nom}: ${f2(e)}`); } }

      { const jug = [...new Set([ayer[0], ayer[1]])];
        const hits = jug.filter(n => hoy.has(n)).length;
        if (hits >= 2) { agg.pAyer.p++; agg.pAyer.det.push(`${nom} 🎯 ${jug.map(f2).join('-')}`); }
        else if (hits === 1) agg.pAyer.m++; }

      { const jug = [...new Set([ayer[0], espejoNum(ayer[0])])];
        const hits = jug.filter(n => hoy.has(n)).length;
        if (hits >= 2) agg.pEsp.p++; else if (hits === 1) agg.pEsp.m++; }

      { const pesos = {};
        for (let j = 0; j < i; j++) {
          const w = 0.5 + 0.5 * (j + 1) / i;
          serie[j].nums.forEach((n, pos) => {
            pesos[n] = (pesos[n] || 0) + w * (pos === 0 ? 60 : pos === 1 ? 8 : 4);
          });
        }
        const top = Object.entries(pesos).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => parseInt(x[0], 10));
        const hits = [...new Set(top)].filter(n => hoy.has(n)).length;
        if (hits >= 2) { agg.radar.p++; agg.radar.det.push(`${nom} 🎯`); }
        else if (hits === 1) agg.radar.m++; }

      if (clave === 'loteka') {
        const ganadores = [];
        let mediosQ = 0;
        const desde = Math.max(0, i - 7);
        for (let j = desde; j < i; j++) {
          const jug = [...new Set(paleCodigoQ(serie[j].nums[0]))];
          const hits = jug.filter(n => hoy.has(n)).length;
          if (hits >= 2) ganadores.push(`<b>${jug.map(f2).join('-')}</b> (nació ${serie[j].f.slice(5)}, pegó a los ${i - j} días) 🎯🎯`);
          else if (hits === 1) mediosQ++;
        }
        const nAct = i - desde;
        lineaQ = ganadores.length
          ? `🅠 Ventana Q7: ¡PALÉ! ${ganadores.join(' · ')} — salió ${hoyArr.map(f2).join('-')}`
          : `🅠 Ventana Q7 (${nAct} palés): ${mediosQ > 0 ? mediosQ + ' medio(s) ✳️' : 'sin acierto'} — salió ${hoyArr.map(f2).join('-')}`;
      }
    }

    if (!agg.rep.ev) { bloques.push(`📅 <b>${fecha}</b>: sin datos evaluables.`); continue; }
    // MODO LIMPIO HONESTO: los aciertos brillan con detalle; los métodos en
    // cero se comprimen en una línea (se mencionan SIEMPRE — ocultar los
    // fallos convertiría este informe en el truco de los vendehumo).
    const det = arr => (arr.length ? ` (${arr.slice(0, 3).join(' · ')})` : '');
    const conAcierto = [];
    const enCero = [];
    if (agg.rep.h > 0) conAcierto.push(`🏆 Repite 1ro: <b>${agg.rep.h}</b>${det(agg.rep.det)}`);
    else enCero.push('Repite 1ro');
    if (agg.esp.h > 0) conAcierto.push(`🏆 Espejo 1ro: <b>${agg.esp.h}</b>${det(agg.esp.det)}`);
    else enCero.push('Espejo 1ro');
    if (agg.pAyer.p > 0 || agg.pAyer.m > 0) conAcierto.push(`🏆 Palé de ayer: ${agg.pAyer.p} palés · ${agg.pAyer.m} medios${det(agg.pAyer.det)}`);
    else enCero.push('Palé ayer');
    if (agg.pEsp.p > 0 || agg.pEsp.m > 0) conAcierto.push(`🏆 Palé espejo: ${agg.pEsp.p} palés · ${agg.pEsp.m} medios`);
    else enCero.push('Palé espejo');
    if (agg.radar.p > 0 || agg.radar.m > 0) conAcierto.push(`🏆 Radar top-2: ${agg.radar.p} palés · ${agg.radar.m} medios${det(agg.radar.det)}`);
    else enCero.push('Radar top-2');

    let cuerpo = conAcierto.length ? conAcierto.join('\n') : '— Ningún método acertó este día —';
    if (enCero.length && conAcierto.length) cuerpo += `\n▫️ Sin aciertos: ${enCero.join(', ')}`;
    bloques.push(
      `📅 <b>${fecha}</b> — ${agg.rep.ev} loterías evaluadas\n` + cuerpo +
      (lineaQ ? `\n${lineaQ}` : '')
    );
  }

  return `🔬 <b>BACKTESTING</b> — cada método jugado con datos de ANTES vs lo que salió\n\n` +
    bloques.join('\n\n') +
    `\n\n⚖️ Referencia del azar (por 20 loterías/día): ~0.6 repetidos · ~1.2 medios palé.\n` +
    `Uso: /backtesting · /backtesting 2026-07-10 · /backtesting 5`;
}

// 🅠 VENTANA Q7: los 7 palés Q activos (uno por cada uno de los últimos 7
// sorteos de Loteka). Cada palé "vive" 7 días: hoy entra el nuevo y se jubila
// el número 8. Estrategia en prueba: 7 palés × RD$1 diario.
function palesQ7Activos() {
  const dias = [...estado.historico].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const serie = [];
  for (const d of dias) {
    const s = d.sorteos && d.sorteos.loteka;
    if (s && s.numeros && s.numeros.length >= 1) {
      serie.push({ f: d.fecha, primero: Number(s.numeros[0]) });
    }
  }
  return serie.slice(-7).map(x => ({ nacimiento: x.f, primero: x.primero, pale: paleCodigoQ(x.primero) }));
}

function textoCodigoQ() {
  const activos = palesQ7Activos();
  if (!activos.length) return '🅠 Aún no hay sorteos de Loteka en el histórico para la Ventana Q7.';
  const f2 = n => String(n).padStart(2, '0');

  // El palé DE HOY es el que nació del último premio mayor (el más reciente).
  const hoy = activos[activos.length - 1];
  // Los demás (del más nuevo al más viejo) siguen "vivos" en la ventana.
  const resto = activos.slice(0, -1).reverse();
  const lineasResto = resto.map((x, i) =>
    `${i + 2}. <b>${x.pale.map(f2).join('-')}</b>  <i>(1ro ${f2(x.primero)}, ${x.nacimiento.slice(5)})</i>`);

  return `🅠 <b>VENTANA Q7 — Loteka</b>\n\n` +
    `🎯 <b>PALÉ DE HOY: ${hoy.pale.map(f2).join('-')}</b>\n` +
    `<i>(del último premio mayor de Loteka: ${f2(hoy.primero)})</i>\n\n` +
    `— — — — —\n` +
    `<b>Ventana completa (${activos.length} palés vivos):</b>\n` +
    `1. <b>${hoy.pale.map(f2).join('-')}</b>  <i>(1ro ${f2(hoy.primero)}, ${hoy.nacimiento.slice(5)}) ← HOY</i>\n` +
    lineasResto.join('\n') +
    `\n\n🎫 Jugada completa: los ${activos.length} palés × RD$1 = RD$${activos.length}` +
    `\n♻️ Mañana el 1ro de hoy genera el palé nuevo y se jubila el más viejo.` +
    `\n\n⚗️ Estrategia en PRUEBA — auditada en /laboratorio. ` +
    `Juega solo lo que puedas permitirte perder.`;
}

app.get('/api/codigo-q', (req, res) => {
  res.json({ mensaje: textoCodigoQ().replace(/<[^>]+>/g, '') });
});

// 🧪 Texto del Laboratorio para el bot, con filtro opcional por lotería.
// Los métodos folclóricos (repite, espejo, jaladera, terminal, Q) son de
// QUINIELAS de 3 números — no aplican al Kino/Loto/especiales, que tienen
// otra mecánica. Si piden uno de esos, se explica en vez de confundir.
function textoLaboratorio(arg) {
  const alias = { kino: 'superkino', superkino: 'superkino', loto: 'loto', lotomas: 'lotomas',
    mega: 'megachance', megachance: 'megachance', pega3: 'pega3mas', quemaito: 'quemaito', pega4: 'pega4king' };
  const pedido = (arg || '').toLowerCase();

  // ¿Pidió un juego especial? El Laboratorio no lo cubre (aún).
  if (pedido && (alias[pedido] || pedido.includes('kino') || pedido.includes('loto'))) {
    return `🧪 <b>LABORATORIO</b>\n\nEl Laboratorio evalúa métodos de <b>quinielas</b> (punto/palé de 3 números): repite, espejo, jaladera, terminal, Código Q.\n\n` +
      `El <b>${arg}</b> es un juego de otra mecánica (más números por sorteo), así que esos métodos no aplican. ` +
      `Para el ${arg} usa <b>/jugada ${pedido} 5</b> — te da jugadas con estrategias (caliente, frío, mixta, azar).\n\n` +
      `⚖️ Recuerda: el Laboratorio ya probó que ningún método le gana al azar de forma sostenida.`;
  }

  // ¿Filtro por una quiniela concreta? Resolver su clave.
  let filtro = null;
  if (pedido) {
    for (const [k, s] of Object.entries(estado.sorteos)) {
      if (k === pedido || (s.nombre || '').toLowerCase().includes(pedido)) { filtro = k; break; }
    }
    if (!filtro) {
      return `🧪 No encontré la quiniela "${arg}". Prueba: /laboratorio (todas), o /laboratorio loteka, /laboratorio gana_mas, etc.`;
    }
  }

  const lab = backtestLaboratorio(filtro);
  const titulo = filtro ? (estado.sorteos[filtro].nombre) : 'TODAS las quinielas';
  const lineas = Object.values(lab.resumen).map(m =>
    m.aciertos !== undefined
      ? `• ${m.metodo}: <b>${m.tasa_real}</b> (azar: ${m.azar_espera}) en ${m.evaluaciones} pruebas`
      : `• ${m.metodo}: ${m.pales_completos} palés (<b>${m.tasa_pale}</b> vs azar ${m.azar_pale}) · medios ${m.tasa_medio}`);
  return `🧪 <b>LABORATORIO — ${titulo}</b> (${lab.dias_historial} días)\n\n` +
    lineas.join('\n') +
    `\n\n⚖️ Walk-forward honesto: cada método probado solo con datos anteriores a cada sorteo.` +
    (filtro ? '' : `\n💡 Filtra una sola: /laboratorio loteka`);
}


// ── 🔬 AUDITORÍA PROFUNDA: Jaladera +50 ─────────────────────────────────────
// La única que asomó sobre el azar. Aquí la disecamos con rigor:
// 1) Desglose lotería por lotería (¿el exceso está repartido o concentrado?)
// 2) Test binomial aproximado (z-score) para saber si es señal o ruido
// 3) Chequeo del "medio palé" que es donde apareció el exceso
function auditarJaladera50() {
  const dias = [...estado.historico].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const claves = new Set();
  for (const d of dias) for (const k of Object.keys(d.sorteos || {})) claves.add(k);

  const P_MEDIO = 1 - Math.pow(0.98, 3); // prob de que 1 nº fijo esté en 3 tómbolas ≈ 0.0594
  const porLot = [];
  let totEv = 0, totMedio = 0;

  for (const clave of claves) {
    const serie = [];
    for (const d of dias) {
      const s = d.sorteos && d.sorteos[clave];
      if (s && s.numeros && s.numeros.length >= 3) serie.push(s.numeros.map(Number));
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
    // z-score binomial: (observado - esperado) / sqrt(esp*(1-esp)/n)
    const z = (tasa - P_MEDIO) / Math.sqrt(P_MEDIO * (1 - P_MEDIO) / ev);
    porLot.push({
      loteria: (estado.sorteos[clave] && estado.sorteos[clave].nombre) || clave,
      evaluaciones: ev, aciertos: medio,
      tasa: (tasa * 100).toFixed(1) + '%',
      z_score: z.toFixed(2)
    });
  }
  porLot.sort((a, b) => parseFloat(b.z_score) - parseFloat(a.z_score));

  const tasaGlobal = totMedio / totEv;
  const zGlobal = (tasaGlobal - P_MEDIO) / Math.sqrt(P_MEDIO * (1 - P_MEDIO) / totEv);

  return {
    metodo: 'Jaladera atraccion +50 (medio pale: 1er premio de ayer +50 aparece hoy)',
    azar_esperado: (P_MEDIO * 100).toFixed(2) + '%',
    global: {
      evaluaciones: totEv, aciertos: totMedio,
      tasa_real: (tasaGlobal * 100).toFixed(2) + '%',
      z_score: zGlobal.toFixed(2),
      veredicto: Math.abs(zGlobal) < 2 ? 'RUIDO (dentro del azar, |z|<2)'
        : zGlobal >= 2 ? '⚠️ SEÑAL POSITIVA sostenida (|z|>=2) — investigar'
        : 'Por debajo del azar'
    },
    nota: 'z-score = cuántas desviaciones estándar sobre el azar. |z|<2 = ruido normal. z>=2 = ~97.5% de confianza de que NO es casualidad. z>=3 = casi seguro real. OJO: con muchas loterias, alguna saldra alta por puro azar (comparaciones multiples).',
    por_loteria: porLot
  };
}

app.get('/api/auditar-jaladera', (req, res) => {
  try { res.json(auditarJaladera50()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/laboratorio', (req, res) => {
  try {
    res.json(backtestLaboratorio(req.query.loteria || null));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── WEBHOOK del bot: el bot ESCUCHA y responde comandos ─────────────────────
// Un bot interactivo (que conversa) tiene el perfil sano para Telegram,
// a diferencia del broadcast puro que mató al bot anterior.
// Activación (una sola vez, ver instrucciones): setWebhook apuntando a
// https://reydis-bot-service.onrender.com/api/telegram-webhook
async function responderChat(chatId, texto) {
  try {
    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      chat_id: chatId, text: texto, parse_mode: 'HTML'
    }, { timeout: 10000 });
  } catch (e) {
    console.error(`⚠️ webhook respuesta ERROR: ${e.response?.data?.description || e.message}`);
  }
}

function comandoHoy() {
  const partes = [];
  const bloques = [
    ['✅ QUINIELAS', Object.values(estado.sorteos)],
    ['🎲 CUARTETAS', Object.values(estado.cuartetas)],
    ['🎰 ESPECIALES', Object.values(estado.especiales)],
  ];
  for (const [titulo, lista] of bloques) {
    const con = lista.filter(s => s.numeros && s.numeros.length > 0);
    if (!con.length) continue;
    partes.push(`<b>${titulo}</b> (${con.length}):`);
    for (const s of con) {
      partes.push(`  ${s.nombre}: <b>${s.numeros.map(n => String(n).padStart(2, '0')).join('-')}</b>`);
    }
  }
  if (!partes.length) return `🇩🇴 <b>${fechaRD()}</b>\n\nAún no hay resultados hoy. El primero cae ~10 AM.`;
  return `🇩🇴 <b>RESULTADOS DE HOY</b> — ${fechaRD()} ${horaRD ? horaRD() : ''}\n\n` + partes.join('\n');
}

function comandoRastrear(num) {
  const val = parseInt(num, 10);
  if (isNaN(val) || val < 0 || val > 99) return 'Uso: /rastrear 99 (número del 00 al 99)';
  const hallazgos = [];
  for (const dia of estado.historico) {
    for (const grupo of ['sorteos', 'cuartetas', 'especiales']) {
      if (!dia[grupo]) continue;
      for (const s of Object.values(dia[grupo])) {
        if (s.numeros && s.numeros.some(n => parseInt(n, 10) === val)) {
          hallazgos.push({ f: dia.fecha, n: s.nombre });
        }
      }
    }
  }
  if (!hallazgos.length) return `El <b>${String(val).padStart(2, '0')}</b> no aparece en ${estado.historico.length} días de historial.`;
  const porLot = {};
  for (const h of hallazgos) porLot[h.n] = (porLot[h.n] || 0) + 1;
  const top = Object.entries(porLot).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([n, c]) => `  ${n}: ${c}x`).join('\n');
  const ultimos = hallazgos.slice(-5).reverse().map(h => `  ${h.f} · ${h.n}`).join('\n');
  return `🔍 <b>El ${String(val).padStart(2, '0')}</b> ha salido <b>${hallazgos.length} veces</b> en ${estado.historico.length} días.\n\n<b>Donde más:</b>\n${top}\n\n<b>Últimas 5:</b>\n${ultimos}`;
}

function comandoEstado() {
  const q = Object.values(estado.sorteos).filter(s => s.numeros.length > 0).length;
  const c = Object.values(estado.cuartetas).filter(s => s.numeros.length > 0).length;
  const e = Object.values(estado.especiales).filter(s => s.numeros.length > 0).length;
  return `📡 <b>REYDIS RADAR PRO</b> v7.33\n\n` +
    `📅 ${fechaRD()}\n` +
    `✅ Hoy: ${q} quinielas · ${c} cuartetas · ${e} especiales\n` +
    `💾 Histórico: ${estado.historico.length} días\n` +
    `🤖 Sistema operando normal`;
}

app.post('/api/telegram-webhook', async (req, res) => {
  res.sendStatus(200); // responder YA a Telegram; procesamos aparte
  try {
    const msg = req.body && req.body.message;
    if (!msg || !msg.text) return;
    const chatId = msg.chat.id;
    const texto = msg.text.trim();
    const [cmd, ...args] = texto.split(/\s+/);
    const comando = cmd.toLowerCase().replace(/@\w+$/, ''); // quitar @NombreBot

    console.log(`💬 Comando recibido de ${chatId}: ${texto}`);

    if (comando === '/start') {
      await responderChat(chatId,
        `🇩🇴 <b>REYDIS RADAR PRO</b> 📡\n\nBienvenido. Comandos disponibles:\n\n` +
        `/hoy — resultados de hoy\n/predicciones — pistas del día\n` +
        `/rastrear 99 — dónde ha salido un número\n/backtesting — cómo nos fue (ayer o /backtesting 5)\n/estado — salud del sistema\n\n` +
        `⚠️ La lotería es aleatoria por diseño. Ningún sistema garantiza aciertos — ` +
        `los datos mostrados son históricos reales. Juega solo lo que puedas permitirte perder.\n\n` +
        `Tu chat ID: <code>${chatId}</code>`);
    } else if (comando === '/hoy') {
      await responderChat(chatId, comandoHoy());
    } else if (comando === '/predicciones') {
      if (TG_CHAT_IDS.includes(String(chatId))) {
        await enviarPrediccionesTelegram();
      } else {
        await responderChat(chatId, 'Las predicciones se envían solo a los destinatarios registrados del sistema.');
      }
    } else if (comando === '/rastrear') {
      await responderChat(chatId, comandoRastrear(args[0]));
    } else if (comando === '/estado') {
      await responderChat(chatId, comandoEstado());
    } else if (comando === '/backtesting' || comando === '/backtest') {
      await responderChat(chatId, textoBacktesting(args[0]));
    } else if (comando === '/jugada') {
      await responderChat(chatId, generarJugadas(args[0], args[1]));
    } else if (comando === '/codigoq') {
      await responderChat(chatId, textoCodigoQ());
    } else if (comando === '/jaladera') {
      const a = auditarJaladera50();
      const top = a.por_loteria.slice(0, 8).map(l =>
        `• ${l.loteria}: ${l.tasa} (z=${l.z_score}) en ${l.evaluaciones}`);
      await responderChat(chatId,
        `🔬 <b>AUDITORÍA JALADERA +50</b>\n<i>(1er premio de ayer +50, ¿aparece hoy?)</i>\n\n` +
        `<b>GLOBAL:</b> ${a.global.tasa_real} vs azar ${a.azar_esperado}\n` +
        `z-score: <b>${a.global.z_score}</b> → ${a.global.veredicto}\n` +
        `(${a.global.aciertos} aciertos en ${a.global.evaluaciones} pruebas)\n\n` +
        `<b>Por lotería (mayor z arriba):</b>\n${top.join('\n')}\n\n` +
        `⚖️ z entre -2 y 2 = ruido normal. Con 20 loterías, que 1 salga alta es esperable por azar puro.`);
    } else if (comando === '/laboratorio') {
      await responderChat(chatId, textoLaboratorio(args[0]));
    } else if (comando.startsWith('/')) {
      await responderChat(chatId, 'Comando no reconocido. Usa /start para ver el menú.');
    }
  } catch (e) {
    console.error(`⚠️ webhook ERROR: ${e.message}`);
  }
});

app.get('/api/predicciones-telegram', async (req, res) => {
  const resultado = await enviarPrediccionesTelegram();
  res.json(resultado);
});

// Prueba completa de notificación de resultado — muestra la respuesta exacta de Telegram
app.get('/api/test-resultado', async (req, res) => {
  if (!TG_ACTIVO) return res.json({ activo: false, mensaje: 'Telegram no configurado' });
  const resultados = [];
  for (const chatId of TG_CHAT_IDS) {
    try {
      const msg = `🇩🇴 <b>REYDIS RADAR PRO</b> — ${fechaRD()}\n\n` +
        `✅ <b>Gana Más</b> (2:30 PM) — RESULTADO REAL\n` +
        `🔢 <b>41 - 58 - 89</b>\n\n` +
        `<i>Este es un mensaje de prueba para verificar que las notificaciones llegan correctamente.</i>`;
      const r = await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        chat_id: chatId, text: msg, parse_mode: 'HTML'
      }, { timeout: 8000 });
      resultados.push({ chat_id: chatId, ok: r.data.ok, message_id: r.data.result?.message_id });
    } catch(e) {
      resultados.push({ chat_id: chatId, ok: false, error: e.response?.data || e.message });
    }
  }
  res.json({ resultados, chats_configurados: TG_CHAT_IDS });
});

// Fuerza el envío de notificaciones de TODOS los sorteos que ya tienen
// resultado hoy — útil si algo falló durante el día
app.get('/api/forzar-notif', async (req, res) => {
  if (!TG_ACTIVO) return res.json({ activo: false });
  // Limpiar yaNotificado para forzar reenvío
  Object.keys(yaNotificado).forEach(k => delete yaNotificado[k]);
  await notificarNuevosSorteos();
  res.json({
    enviado: true,
    sorteos_con_resultado: Object.entries(estado.sorteos)
      .filter(([,s]) => s.numeros.length >= 3)
      .map(([k,s]) => ({ k, nombre: s.nombre, numeros: s.numeros }))
  });
});

// Ver estado actual de yaNotificado (qué loterías ya fueron notificadas hoy)
app.get('/api/status-notif', (req, res) => {
  const sorteosConResultado = Object.entries(estado.sorteos)
    .filter(([,s]) => s.numeros.length >= 3)
    .map(([k,s]) => ({ clave: k, nombre: s.nombre, numeros: s.numeros, notificado: !!yaNotificado[k] }));
  res.json({
    telegram_activo: TG_ACTIVO,
    chat_ids: TG_CHAT_IDS,
    ya_notificados: Object.keys(yaNotificado),
    sorteos_con_resultado: sorteosConResultado,
    total_capturados: sorteosConResultado.length,
    total_notificados: sorteosConResultado.filter(s => s.notificado).length
  });
});

// ── Protección anti-crash global ──────────────────────────────────────────────
// Captura errores no manejados para que el servidor NO se caiga. Los loguea
// en consola sin detener el proceso — así los sorteos siguen capturándose.
process.on('uncaughtException', (err) => {
  console.error('⚠️ [uncaughtException]', err.stack || err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [unhandledRejection]', reason?.stack || reason);
});

app.listen(PORT, async () => {
  console.log(`\n🚀 Reydis Engine v7.12-STABLE en puerto ${PORT}`);
  console.log(`💾 Supabase: ${SUPABASE_ACTIVO ? '✅' : '❌ no configurado'}`);
  console.log(`📱 Telegram: ${TG_ACTIVO ? `✅ (${TG_CHAT_IDS.length} destinatario(s))` : '❌ no configurado'}`);

  await inicializarPersistenciaRemota();

  if (TG_ACTIVO) {
    await enviarTelegram(
      `🚀 <b>REYDIS RADAR PRO</b> — Servidor iniciado\n\n` +
      `📅 ${fechaRD()} ${horaRD()} RD\n` +
      `💾 Supabase: ${SUPABASE_ACTIVO ? '✅ conectado' : '❌ no configurado'}\n` +
      `🔄 Sincronizando sorteos...`
    );
  }

  await sincronizar();

  // ── Self-ping para evitar que Render duerma el servicio ──────────────────
  // Render free tier duerme el servidor tras ~15 min sin peticiones HTTP.
  // Cuando duerme, pierde todos los resultados en memoria y reinicia —
  // por eso aparecen tantos "Servidor iniciado" en Telegram.
  // Este ping propio cada 14 minutos mantiene el servidor despierto.
  const SELF_URL = process.env.RENDER_EXTERNAL_URL || `https://reydis-bot-service.onrender.com`;
  setInterval(async () => {
    try {
      await axios.get(`${SELF_URL}/`, { timeout: 5000 });
      // ping silencioso — solo loguea si falla
    } catch (e) {
      console.log(`⚠️ Self-ping falló: ${e.message}`);
    }
  }, 14 * 60 * 1000);

  console.log(`🏓 Self-ping activo cada 14 min → ${SELF_URL}`);
});
