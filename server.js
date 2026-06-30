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

  console.log(`📱 Notificando ${nuevos.length} resultado(s) a Telegram con pausa de 1.2s entre cada uno...`);

  // Marcar todos como notificados ANTES de enviar para evitar duplicados
  // si el servidor es llamado de nuevo antes de que terminen los envíos
  for (const n of nuevos) yaNotificado[n.clave] = true;

  // Enviar UNO POR UNO con pausa — Telegram permite ~1 msg/seg al mismo chat
  for (let i = 0; i < nuevos.length; i++) {
    const n = nuevos[i];
    const nums = n.numeros.map(x => String(x).padStart(2, '0')).join(' - ');
    const etiqueta = n.tipo === 'cuarteta' ? '🎲' : n.tipo === 'especial' ? '🎰' : '✅';
    const extra = n.empresa ? ` [${n.empresa}]` : '';
    const msg = `🇩🇴 <b>REYDIS RADAR PRO</b> — ${fechaRD()}\n\n` +
      `${etiqueta} <b>${n.nombre}</b>${extra} (${n.hora}) — RESULTADO REAL\n` +
      `🔢 <b>${nums}</b>`;
    await enviarTelegram(msg);
    console.log(`  ✅ Enviado: ${n.nombre} → ${n.numeros.join('-')}`);
    // Pausa de 1.2 segundos entre mensajes para respetar el límite de Telegram
    if (i < nuevos.length - 1) await new Promise(r => setTimeout(r, 1200));
  }

  console.log(`📱 Completado: ${nuevos.length} resultado(s) notificado(s)`);
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
    pega3mas:  { nombre:'Pega 3 Más',    empresa:'LEIDSA',  hora:'9:00 PM',  tipo:'pega3',   numeros:[], estado:'pendiente', rango:[0,9],   cant:3  },
    superkino: { nombre:'Super Kino TV', empresa:'LEIDSA',  hora:'9:00 PM',  tipo:'kino',    numeros:[], estado:'pendiente', rango:[1,80],  cant:20 },
    loto:      { nombre:'Loto',          empresa:'LEIDSA',  hora:'9:00 PM',  tipo:'loto',    numeros:[], estado:'pendiente', rango:[1,38],  cant:6  },
    lotomas:   { nombre:'Loto Más',      empresa:'LEIDSA',  hora:'9:00 PM',  tipo:'lotomas', numeros:[], estado:'pendiente', rango:[1,38],  cant:7  },
    quemaito:  { nombre:'El Quemaito',   empresa:'Loteka',  hora:'6:55 PM',  tipo:'pega3',   numeros:[], estado:'pendiente', rango:[0,9],   cant:3  },
    megachance:{ nombre:'Mega Chance',   empresa:'Loteka',  hora:'6:55 PM',  tipo:'kino',    numeros:[], estado:'pendiente', rango:[1,60],  cant:15 },
    pega4king: { nombre:'Pega 4',        empresa:'King',    hora:'7:00 PM',  tipo:'pega4',   numeros:[], estado:'pendiente', rango:[0,9],   cant:4  },
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
  try {
    console.log('📡 Raspando loteriasdominicanas.com...');
    const res = await axios.get('https://loteriasdominicanas.com/', {
      headers: HEADERS, timeout: 10000
    });
    const $ = cheerio.load(res.data);
    let conteo = 0;

    $('.game-block').each((i, bloque) => {
      const tituloWeb = $(bloque).find('.game-title span').text().trim();
      if (!tituloWeb) return;

      const clave = buscarClave(tituloWeb);
      if (!clave || !estado.sorteos[clave]) return;
      if (estado.sorteos[clave].numeros.length >= 3) return; // ya tenemos

      // ESTRICTO: solo el contenedor .game-scores.ball-mode (modo quiniela 3 bolas)
      // Esto evita capturar Pega 3 Más, Mega Chance, Loto, etc. que tienen otros formatos
      const contenedorBolas = $(bloque).find('.game-scores.ball-mode');
      if (contenedorBolas.length === 0) {
        console.log(`  ⏭️  ${tituloWeb}: sin .ball-mode (probablemente sin resultado aún o formato distinto)`);
        return;
      }

      const nums = [];
      contenedorBolas.first().find('span.score').each((j, span) => {
        if (nums.length >= 3) return false;
        const raw = $(span).text().trim();
        // Validar que sea solo dígitos (rechazar vacíos, "--", "?", etc.)
        if (!/^\d{1,2}$/.test(raw)) return;
        const n = parseInt(raw, 10);
        if (!isNaN(n) && n >= 0 && n <= 99) nums.push(n);
      });

      // Rechazar patrones sospechosos: 00-99 + algo, o menos de 3 números válidos
      if (nums.length === 3) {
        // Filtro adicional: si los 3 números son exactamente 0, 99 y otro, es sospechoso
        // (probablemente placeholder / sin sorteo todavía)
        const sospechoso = nums.includes(0) && nums.includes(99);
        if (sospechoso) {
          console.log(`  ⚠️  ${tituloWeb}: patrón sospechoso ${nums.join('-')} (0 y 99 juntos) - descartado`);
          return;
        }
        estado.sorteos[clave].numeros = nums;
        estado.sorteos[clave].estado = 'disponible';
        conteo++;
        console.log(`  ✓ ${estado.sorteos[clave].nombre}: ${nums.join('-')}`);
      } else {
        console.log(`  ⏭️  ${tituloWeb}: solo ${nums.length} números válidos encontrados`);
      }
    });

    console.log(`✅ loteriasdominicanas.com: ${conteo} sorteos`);
    return conteo;
  } catch (e) {
    console.error(`⚠️ loteriasdominicanas.com ERROR: ${e.message}`);
    return 0;
  }
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

  pendientes = Object.values(estado.sorteos).filter(s => s.numeros.length < 3).length;
  if (pendientes > 8) await scrapeQuinielasRD();

  // La Cuarteta (Anguila, 4 dígitos)
  const pendCuarteta = Object.values(estado.cuartetas).filter(c => c.numeros.length < 4).length;
  if (pendCuarteta > 0) await scrapeCuartetaLotDominicanas();

  const pendEsp = Object.values(estado.especiales).filter(e => e.numeros.length === 0).length;
  if (pendEsp > 0) await scrapeLeidsa();

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
    const r = await axios.get('https://www.conectate.com.do/loterias/api/widget', { headers: HEADERS, timeout: 10000 });
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
    res.status(200).json({ error: e.message, url_usada: 'https://www.conectate.com.do/loterias/api/widget' });
  }
});

app.get('/', (req, res) => {
  res.json({
    version: 'v7.22-FIX-DEBUG-URL',
    status: 'ok',
    persistencia: SUPABASE_ACTIVO ? 'supabase (permanente)' : 'solo disco local',
    telegram: TG_ACTIVO ? `activo ✅ (${TG_CHAT_IDS.length} destinatario(s))` : 'no configurado',
    fecha_rd: fechaRD(),
    hora_rd: horaRD(),
    sorteos_hoy: Object.values(estado.sorteos).filter(s=>s.numeros.length>=3).length,
    cuartetas_hoy: Object.values(estado.cuartetas).filter(c=>c.numeros.length>=4).length,
    especiales_hoy: Object.values(estado.especiales).filter(e=>e.numeros.length>0).length,
    historico_dias: estado.historico.length,
    endpoints: ['/api/hoy','/api/radar','/api/consultar','/api/estadisticas','/api/historico','/api/debug','/api/debug2','/api/debug-db','/api/test-telegram','/api/predicciones-telegram']
  });
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
