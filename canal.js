// 📢 Canal público de Telegram: resultados + los "números del día" y palés (lo mismo que ya es público en el sitio). Nunca el laboratorio.
// Variable en Render: TELEGRAM_CANAL=@reydis_resultados  (el bot debe ser administrador del canal).
// Sin esa variable no publica nada.
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TG_TOKEN = process.env.TELEGRAM_TOKEN || '';
const TG_CANAL = (process.env.TELEGRAM_CANAL || '').trim();
const SITIO_URL_PUBLICO = (process.env.SITE_URL || 'https://reydis.github.io/reydis-bot').replace(/\/$/, '');

async function enviarCanal(mensaje) {
  if (!TG_TOKEN || !TG_CANAL) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
      { chat_id: TG_CANAL, text: mensaje, parse_mode: 'HTML', disable_web_page_preview: true }, { timeout: 8000 });
  } catch (e) { console.error('⚠️ [canal]', e.response && e.response.data ? JSON.stringify(e.response.data) : e.message); }
}

// 🔗 El enlace al sitio va solo en el primer mensaje de la tarde y en el primero de la noche = 2 veces al día.
// Los demás mensajes salen limpios: solo resultados (el aviso de +18 / juego responsable va en la descripción del canal).
let slotsConEnlace = { fecha: '', usados: {} };
function franjaConEnlace(fecha) {
  const hora = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santo_Domingo', hour: '2-digit', hour12: false }).format(new Date()), 10) % 24;
  const franja = hora < 12 ? 'manana' : hora < 18 ? 'tarde' : 'noche';
  if (slotsConEnlace.fecha !== fecha) slotsConEnlace = { fecha, usados: {} };
  if (franja === 'manana') return false;
  if (slotsConEnlace.usados[franja]) return false;
  slotsConEnlace.usados[franja] = true;
  return true;
}

function mensajeCanal(nuevos, fecha) {
  const f2 = x => String(x).padStart(2, '0');
  const lineas = nuevos.map(n => {
    const etiqueta = n.tipo === 'cuarteta' ? '🎲' : n.tipo === 'especial' ? '🎰' : '✅';
    return `${etiqueta} <b>${n.nombre}</b> — <b>${n.numeros.map(f2).join('-')}</b> <i>(${n.hora})</i>`;
  });
  const enlace = franjaConEnlace(fecha) ? `\n\n🌐 Todos los resultados y estadísticas: ${SITIO_URL_PUBLICO}/` : '';
  return `🇩🇴 <b>Resultados</b> — ${fecha}\n\n${lineas.join('\n')}${enlace}`;
}

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
