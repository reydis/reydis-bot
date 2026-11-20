// 📢 Canal público de Telegram: SOLO resultados (información pública). Nunca predicciones ni laboratorio.
// Variable en Render: TELEGRAM_CANAL=@reydis_resultados  (el bot debe ser administrador del canal).
// Sin esa variable no publica nada.
const axios = require('axios');

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

module.exports = { enviarCanal, mensajeCanal };
