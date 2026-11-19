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

function mensajeCanal(nuevos, fecha) {
  const f2 = x => String(x).padStart(2, '0');
  const lineas = nuevos.map(n => {
    const etiqueta = n.tipo === 'cuarteta' ? '🎲' : n.tipo === 'especial' ? '🎰' : '✅';
    return `${etiqueta} <b>${n.nombre}</b> — <b>${n.numeros.map(f2).join('-')}</b> <i>(${n.hora})</i>`;
  });
  return `🇩🇴 <b>Resultados</b> — ${fecha}\n\n${lineas.join('\n')}\n\n🌐 Todos los resultados y estadísticas: ${SITIO_URL_PUBLICO}/\n<i>Solo informativo. Mayores de 18. Juega con responsabilidad.</i>`;
}

module.exports = { enviarCanal, mensajeCanal };
