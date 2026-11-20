// 📢 Canal público de Telegram: resultados + los "números del día" y palés (lo mismo que ya es público en el sitio). Nunca el laboratorio.
// Variable en Render: TELEGRAM_CANAL=@reydis_resultados  (el bot debe ser administrador del canal).
// Sin esa variable no publica nada.
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TG_TOKEN = process.env.TELEGRAM_TOKEN || '';
const TG_CANAL = (process.env.TELEGRAM_CANAL || '').trim();
const SITIO_URL_PUBLICO = (process.env.SITE_URL || 'https://reydis.github.io/reydis-bot').replace(/\/$/, '');

const TG_API = `https://api.telegram.org/bot${TG_TOKEN}`;

async function enviarCanal(mensaje) {
  if (!TG_TOKEN || !TG_CANAL) return;
  if (mensaje && typeof mensaje === 'object' && mensaje.resultados) return acumularResultados(mensaje.nuevos, mensaje.fecha);
  try {
    await axios.post(`${TG_API}/sendMessage`,
      { chat_id: TG_CANAL, text: mensaje, parse_mode: 'HTML', disable_web_page_preview: true }, { timeout: 8000 });
  } catch (e) { console.error('⚠️ [canal]', e.response && e.response.data ? JSON.stringify(e.response.data) : e.message); }
}

// 📋 RESULTADOS EN BLOQUES: en vez de un mensaje por sorteo, cada franja del día (mañana, tarde, noche) es UN solo mensaje
// que se va EDITANDO: cada sorteo nuevo se agrega como una línea debajo de la anterior, sin encabezado ni repetir nombre.
// Los mensajes de la tarde y de la noche llevan al final el enlace al sitio = el enlace sale solo 2 veces al día.
// (Editar un mensaje no hace sonar el celular; el primer resultado de cada franja sí, porque abre un mensaje nuevo.)
const ESTADO_ARCHIVO = path.join(__dirname, 'data', 'canal-bloque.json');
let bloque = { fecha: '', franja: '', id: null, lineas: [] };
try { bloque = Object.assign(bloque, JSON.parse(fs.readFileSync(ESTADO_ARCHIVO, 'utf8'))); } catch (e) {}
const guardarBloque = () => { try { fs.mkdirSync(path.dirname(ESTADO_ARCHIVO), { recursive: true }); fs.writeFileSync(ESTADO_ARCHIVO, JSON.stringify(bloque)); } catch (e) {} };

const franjaActual = () => {
  const hora = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santo_Domingo', hour: '2-digit', hour12: false }).format(new Date()), 10) % 24;
  return hora < 12 ? 'manana' : hora < 18 ? 'tarde' : 'noche';
};

function lineaResultado(n) {
  const f2 = x => String(x).padStart(2, '0');
  const etiqueta = n.tipo === 'cuarteta' ? '🎲' : n.tipo === 'especial' ? '🎰' : '✅';
  return { clave: `${n.nombre}|${n.hora}`, texto: `${etiqueta} <b>${n.nombre}</b> — <b>${n.numeros.map(f2).join('-')}</b> <i>(${n.hora})</i>` };
}

function textoBloque() {
  const enlace = bloque.franja === 'manana' ? '' : `\n\n🌐 Todos los resultados y estadísticas: ${SITIO_URL_PUBLICO}/`;
  return bloque.lineas.map(l => l.texto).join('\n') + enlace;
}

let colaCanal = Promise.resolve();
function acumularResultados(nuevos, fecha) {
  colaCanal = colaCanal.then(() => acumular(nuevos, fecha)).catch(e => console.error('⚠️ [canal]', e.message));
  return colaCanal;
}

async function acumular(nuevos, fecha) {
  const franja = franjaActual();
  if (bloque.fecha !== fecha || bloque.franja !== franja || !bloque.id) bloque = { fecha, franja, id: null, lineas: [] };
  for (const n of nuevos) {
    const l = lineaResultado(n);
    const i = bloque.lineas.findIndex(x => x.clave === l.clave);
    if (i >= 0) bloque.lineas[i] = l; else bloque.lineas.push(l);
  }
  const texto = textoBloque();
  const base = { chat_id: TG_CANAL, text: texto, parse_mode: 'HTML', disable_web_page_preview: true };
  try {
    if (bloque.id) {
      try { await axios.post(`${TG_API}/editMessageText`, { ...base, message_id: bloque.id }, { timeout: 8000 }); guardarBloque(); return; }
      catch (e) {
        const d = e.response && e.response.data && e.response.data.description || e.message;
        if (/not modified/i.test(d)) return;           // mismo texto: nada que hacer
        bloque.id = null;                              // no se pudo editar (borrado, muy viejo...): se abre uno nuevo
      }
    }
    const r = await axios.post(`${TG_API}/sendMessage`, base, { timeout: 8000 });
    bloque.id = r.data && r.data.result && r.data.result.message_id || null;
    guardarBloque();
  } catch (e) { console.error('⚠️ [canal]', e.response && e.response.data ? JSON.stringify(e.response.data) : e.message); }
}

// Mantiene la misma firma de antes: server.js llama enviarCanal(mensajeCanal(nuevos, fecha)) y no hace falta tocarlo.
function mensajeCanal(nuevos, fecha) { return { resultados: true, nuevos, fecha }; }

// 🎯 Números del día + palés: UN mensaje al inicio del día (desde las 8:00 AM, hora RD), tomados del mismo sitio público
// (radar-hoy.json, que genera sitio/generar-sitio.js) para que el canal y la página siempre digan lo mismo.
// Sin enlace ni nombre en este mensaje: el enlace sigue saliendo solo 2 veces al día, en los resultados de la tarde y la noche.
const RADAR_ARCHIVO = path.join(__dirname, 'data', 'radar-canal.json');
let radarPublicado = '';
try { radarPublicado = (JSON.parse(fs.readFileSync(RADAR_ARCHIVO, 'utf8')) || {}).fecha || ''; } catch (e) {}

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const minutosRDCanal = () => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santo_Domingo', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  return (parseInt(p.find(x => x.type === 'hour').value, 10) % 24) * 60 + parseInt(p.find(x => x.type === 'minute').value, 10);
};

function mensajeRadar(datos, fecha) {
  const f2 = x => String(x).padStart(2, '0');
  const dia = new Intl.DateTimeFormat('es-DO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(fecha + 'T12:00:00Z'));
  const pales = (datos.pales || []).map(p => `${f2(p[0])}-${f2(p[1])}`).join(', ');
  return `🎯 <b>Números del día</b> — ${dia}\n\n<b>${datos.numeros.map(f2).join(' · ')}</b>\n\n🎲 <b>Palés</b> (las parejas con esos 5):\n${pales}\n\n<i>Son los más frecuentes de los últimos 30 días: estadística, no una garantía. El azar manda.</i>`;
}

async function publicarRadarDelDia() {
  if (!TG_TOKEN || !TG_CANAL) return;
  const hoy = hoyRD();
  if (radarPublicado === hoy) return;
  const min = minutosRDCanal();
  if (min < 8 * 60 || min > 15 * 60) return; // ventana: 8:00 AM a 3:00 PM
  try {
    const r = await axios.get(`${SITIO_URL_PUBLICO}/radar-hoy.json?x=${Date.now()}`, { timeout: 10000 });
    const d = r.data;
    if (!d || d.fecha !== hoy || !Array.isArray(d.numeros) || d.numeros.length < 5) return; // el sitio aún no tiene lo de hoy: reintenta en 10 min
    radarPublicado = hoy;
    try { fs.mkdirSync(path.dirname(RADAR_ARCHIVO), { recursive: true }); fs.writeFileSync(RADAR_ARCHIVO, JSON.stringify({ fecha: hoy })); } catch (e) {}
    await enviarCanal(mensajeRadar(d, hoy));
  } catch (e) { console.error('⚠️ [canal-radar]', e.message); }
}
const relojRadar = setInterval(publicarRadarDelDia, 10 * 60 * 1000);
if (relojRadar.unref) relojRadar.unref();
setTimeout(publicarRadarDelDia, 60 * 1000);

module.exports = { enviarCanal, mensajeCanal, mensajeRadar, publicarRadarDelDia };
