// ═══════════════════════════════════════════════════════════════════════════
//  REYDIS RADAR · SITIO PÚBLICO  v1.0
//  Lee la tabla `historico` de Supabase y genera páginas HTML fijas
//  (resultados, estadísticas por lotería, por número y por fecha).
//  Filosofía: "vende claridad, no esperanza".
//
//  Uso:
//    node sitio/generar-sitio.js            → lee Supabase (SUPABASE_URL + SUPABASE_KEY)
//    node sitio/generar-sitio.js --demo     → datos inventados, para probar sin Supabase
//
//  Variables opcionales:
//    SITE_URL        dirección pública del sitio (por defecto GitHub Pages del repo)
//    ADSENSE_CLIENT  ca-pub-XXXXXXXXXXXXXXXX  (vacío = sin anuncios)
//    CONTACTO_EMAIL  correo público para la página de Contacto (vacío = aviso de que viene pronto)
//    TELEGRAM_BOT    usuario del bot sin @ (por defecto ReydisRadarProV2Bot)
//    SALIDA          carpeta de salida (por defecto sitio-publico)
//  Sin dependencias: solo Node 18+.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const DEMO = process.argv.includes('--demo');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const SITE_URL = (process.env.SITE_URL || 'https://reydis.github.io/reydis-bot').replace(/\/$/, '');
const ADSENSE_CLIENT = (process.env.ADSENSE_CLIENT || '').trim();
// ▼▼ PON AQUÍ EL CORREO DEL SITIO entre las comillas (ejemplo: 'contacto@tudominio.com'). Vacío = la página Contacto dice que viene pronto.
const CORREO_DEL_SITIO = 'reydis@gmail.com';
const CONTACTO_EMAIL = (process.env.CONTACTO_EMAIL || CORREO_DEL_SITIO).trim();
const TELEGRAM_BOT = (process.env.TELEGRAM_BOT || 'ReydisRadarProV2Bot').replace(/^@/, '');
const SALIDA = path.resolve(process.env.SALIDA || 'sitio-publico');
const BASE = new URL(SITE_URL + '/').pathname.replace(/\/$/, ''); // '' con dominio propio, '/reydis-bot' en GitHub Pages
const NOMBRE_SITIO = 'Reydis Radar';
const VENTANA = 90; // sorteos que se usan para las estadísticas

// ── Catálogo de quinielas (mismas claves que server.js) ─────────────────────
const LOTERIAS = [
  ['anguila_m', 'anguila-manana', 'Anguila Mañana', '10:00 AM'],
  ['laprimera', 'la-primera-dia', 'La Primera Día', '10:30 AM'],
  ['lotedom', 'lotedom', 'LoteDom', '12:00 PM'],
  ['suerte', 'la-suerte-1230', 'La Suerte 12:30', '12:30 PM'],
  ['king_t', 'king-lottery-tarde', 'King Lottery Tarde', '12:30 PM'],
  ['real_t', 'loteria-real', 'Lotería Real', '12:55 PM'],
  ['anguila_t', 'anguila-1pm', 'Anguila 1:00 PM', '1:00 PM'],
  ['florida_d', 'florida-dia', 'Florida Día', '2:00 PM'],
  ['gana_mas', 'gana-mas', 'Gana Más', '2:30 PM'],
  ['new_york_t', 'new-york-tarde', 'New York Tarde', '3:30 PM'],
  ['suerte_t2', 'la-suerte-tarde', 'La Suerte Tarde', '6:00 PM'],
  ['anguila_n', 'anguila-6pm', 'Anguila 6:00 PM', '6:00 PM'],
  ['king_n', 'king-lottery-noche', 'King Lottery Noche', '7:00 PM'],
  ['loteka', 'loteka', 'Loteka', '7:55 PM'],
  ['laprimera_n', 'la-primera-noche', 'La Primera Noche', '8:00 PM'],
  ['leidsa', 'leidsa', 'Leidsa (Quiniela Palé)', '8:55 PM'],
  ['nacional', 'loteria-nacional', 'Lotería Nacional', '9:00 PM'],
  ['anguila_nn', 'anguila-9pm', 'Anguila 9:00 PM', '9:00 PM'],
  ['new_york_n', 'new-york-noche', 'New York Noche', '10:30 PM'],
  ['florida_n', 'florida-noche', 'Florida Noche', '10:30 PM'],
].map(([clave, slug, nombre, hora]) => ({ clave, slug, nombre, hora }));
// Horarios de domingo CONFIRMADOS en fuentes públicas (otros medios + el calendario de cada lotería).
// Las que no están aquí no tienen horario de domingo confirmado todavía.
const HORA_DOMINGO = { leidsa: '3:55 PM', nacional: '6:00 PM' };
const IGUAL_DOMINGO = new Set(['gana_mas', 'real_t', 'loteka']); // confirmadas: sortean a la misma hora el domingo
const esDomingoRD = () => new Date(fechaRD() + 'T12:00:00Z').getUTCDay() === 0;
const horaHoy = l => (esDomingoRD() && HORA_DOMINGO[l.clave]) || l.hora;
const ALIAS = { laprimera_d: 'laprimera', suerte_m: 'suerte' };

// ── Utilidades ──────────────────────────────────────────────────────────────
const f2 = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const url = p => `${BASE}${p}`;
const fechaRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const horaRD = () => new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());
const dUTC = f => new Date(f + 'T12:00:00Z');
const fechaLarga = f => new Intl.DateTimeFormat('es-DO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(dUTC(f));
const fechaCorta = f => new Intl.DateTimeFormat('es-DO', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(dUTC(f));
const fechaMini = f => new Intl.DateTimeFormat('es-DO', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(dUTC(f));
const diasEntre = (a, b) => Math.round((dUTC(b) - dUTC(a)) / 86400000);
const bola = (n, extra = '') => `<span class="bola${extra}">${esc(n)}</span>`;
const bolas = nums => `<span class="bolas">${nums.map(n => bola(f2(n))).join('')}</span>`;

function escribir(rel, contenido) {
  const dest = path.join(SALIDA, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, contenido);
}

// ── Lectura de datos ────────────────────────────────────────────────────────
async function leerSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan SUPABASE_URL y SUPABASE_KEY (o use --demo).');
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const filas = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/historico?select=fecha,sorteos,cuartetas,especiales&order=fecha.asc&limit=1000&offset=${off}`, { headers });
    if (!r.ok) throw new Error(`Supabase respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const lote = await r.json();
    filas.push(...lote);
    if (lote.length < 1000) break;
  }
  return filas;
}

function datosDemo() {
  const filas = [];
  const hoy = fechaRD();
  let seed = 7;
  const rnd = k => { seed = (seed * 16807) % 2147483647; return seed % k; };
  for (let i = 119; i >= 0; i--) {
    const fecha = new Date(dUTC(hoy) - i * 86400000).toISOString().slice(0, 10);
    const sorteos = {};
    LOTERIAS.forEach((l, j) => {
      const pendiente = i === 0 && j > 12; // hoy: las de la noche todavía no han salido
      sorteos[l.clave] = { nombre: l.nombre, hora: l.hora, numeros: pendiente ? [] : [rnd(100), rnd(100), rnd(100)], estado: pendiente ? 'pendiente' : 'disponible' };
    });
    const especiales = i === 0 ? {} : {
      loto: { nombre: 'Loto', empresa: 'LEIDSA', hora: '9:00 PM', tipo: 'loto', numeros: Array.from({ length: 6 }, () => 1 + rnd(40)) },
      pega3mas: { nombre: 'Pega 3 Más', empresa: 'LEIDSA', hora: '9:00 PM', tipo: 'pega3', numeros: [rnd(10), rnd(10), rnd(10)] },
    };
    filas.push({ fecha, sorteos, cuartetas: {}, especiales });
  }
  return filas;
}

// ── Limpieza y armado de series ─────────────────────────────────────────────
function numsValidos(arr, cant = 3, min = 0, max = 99) {
  if (!Array.isArray(arr) || arr.length < cant) return null;
  const n = arr.slice(0, cant).map(x => parseInt(x, 10));
  return n.every(x => Number.isInteger(x) && x >= min && x <= max) ? n : null;
}

function preparar(filas) {
  const porClave = Object.fromEntries(LOTERIAS.map(l => [l.clave, l]));
  const dias = [];
  for (const f of filas) {
    if (!f || !/^\d{4}-\d{2}-\d{2}$/.test(f.fecha || '')) continue;
    const quinielas = {};
    for (const [k0, s] of Object.entries(f.sorteos || {})) {
      const k = ALIAS[k0] || k0;
      const nums = numsValidos(s && s.numeros);
      if (!nums) continue;
      if (!porClave[k]) { // lotería nueva que no está en el catálogo
        const nuevo = { clave: k, slug: k.replace(/_/g, '-'), nombre: s.nombre || k, hora: s.hora || '' };
        LOTERIAS.push(nuevo); porClave[k] = nuevo;
      }
      quinielas[k] = nums;
    }
    const otros = [];
    for (const grupo of ['cuartetas', 'especiales']) {
      for (const [k, j] of Object.entries(f[grupo] || {})) {
        if (!j || !Array.isArray(j.numeros) || !j.numeros.length) continue;
        const nums = j.numeros.map(x => parseInt(x, 10)).filter(Number.isInteger);
        if (!nums.length) continue;
        otros.push({ clave: k, nombre: j.nombre || k, empresa: j.empresa || '', hora: j.hora || '', tipo: j.tipo || grupo, numeros: nums });
      }
    }
    if (Object.keys(quinielas).length || otros.length) dias.push({ fecha: f.fecha, quinielas, otros });
  }
  dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const series = {};
  for (const l of LOTERIAS) series[l.clave] = dias.filter(d => d.quinielas[l.clave]).map(d => ({ fecha: d.fecha, nums: d.quinielas[l.clave] }));
  return { dias, series };
}

// Estadística honesta de una serie: en cada sorteo salen 3 números de 00 a 99,
// así que cada número "debería" salir ~3 veces cada 100 sorteos.
function estadisticas(serie) {
  const ult = serie.slice(-VENTANA);
  const N = ult.length;
  const veces = Array(100).fill(0), primera = Array(100).fill(0);
  for (const s of ult) {
    new Set(s.nums).forEach(n => veces[n]++);
    primera[s.nums[0]]++;
  }
  const ultimaFecha = Array(100).fill(null), sinSalir = Array(100).fill(null);
  for (let i = serie.length - 1; i >= 0; i--) {
    for (const n of serie[i].nums) if (sinSalir[n] === null) { sinSalir[n] = serie.length - 1 - i; ultimaFecha[n] = serie[i].fecha; }
  }
  const p = 1 - Math.pow(0.99, 3); // prob. de que un número salga en un sorteo (3 tómbolas)
  const esperado = N * p, sd = Math.sqrt(N * p * (1 - p));
  const fuera = veces.map((v, n) => ({ n, v, z: sd ? (v - esperado) / sd : 0 })).filter(x => Math.abs(x.z) >= 2);
  const orden = veces.map((v, n) => ({ n, v }));
  return {
    N, veces, primera, ultimaFecha, sinSalir, esperado, sd, fuera,
    calientes: [...orden].sort((a, b) => b.v - a.v || a.n - b.n).slice(0, 10),
    frios: [...orden].sort((a, b) => a.v - b.v || a.n - b.n).slice(0, 10),
    atrasados: sinSalir.map((s, n) => ({ n, s: s === null ? serie.length : s, nunca: s === null })).sort((a, b) => b.s - a.s || a.n - b.n).slice(0, 10),
  };
}

// ── Plantilla ───────────────────────────────────────────────────────────────
const CSS = `
:root{--fondo:#070c18;--panel:#0f1729;--panel2:#141e36;--borde:#1f2d4a;--texto:#e8eef9;--suave:#93a4c0;--acento:#22d3ee;--acento2:#a78bfa;--bien:#34d399;--ojo:#fbbf24;--r:16px}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;min-height:100vh;color:var(--texto);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background-color:var(--fondo);background-image:radial-gradient(900px 420px at 12% -8%,rgba(34,211,238,.13),transparent 60%),radial-gradient(800px 420px at 92% -4%,rgba(167,139,250,.15),transparent 60%);background-repeat:no-repeat}
a{color:var(--acento);text-decoration:none}a:hover{text-decoration:underline}
.cab{position:sticky;top:0;z-index:10;background:rgba(7,12,24,.82);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-bottom:1px solid var(--borde)}
.cab .in{max-width:1120px;margin:auto;padding:14px 18px;display:flex;flex-wrap:wrap;gap:8px 24px;align-items:center;justify-content:space-between}
.logo{font-weight:800;font-size:1.3rem;color:#fff;letter-spacing:.2px}.logo span{background:linear-gradient(90deg,var(--acento),var(--acento2));-webkit-background-clip:text;background-clip:text;color:transparent}
.logo:hover{text-decoration:none}
.menu{display:flex;flex-wrap:wrap;gap:2px 6px;font-size:.95rem}.menu a{color:var(--suave);padding:6px 12px;border-radius:999px;transition:background .15s,color .15s}.menu a:hover{color:#fff;background:rgba(255,255,255,.07);text-decoration:none}
main{max-width:1120px;margin:auto;padding:12px 18px 56px}
.hero{padding:44px 0 26px}
.hero h1{font-size:clamp(1.9rem,4.6vw,3rem);line-height:1.12;letter-spacing:-.02em;margin:.1em 0 .35em;font-weight:800}
.hero .sub{font-size:1.08rem;max-width:720px;margin:0 0 1.1em}
.vivo{display:inline-flex;align-items:center;gap:8px;font-size:.85rem;color:var(--bien);background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.28);padding:5px 12px;border-radius:999px}
.vivo:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--bien);box-shadow:0 0 0 0 rgba(52,211,153,.6);animation:pulso 2s infinite}
@keyframes pulso{70%{box-shadow:0 0 0 9px rgba(52,211,153,0)}100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}
h1{font-size:1.9rem;line-height:1.2;margin:.4em 0 .25em;letter-spacing:-.01em}
h2{font-size:1.3rem;margin:2.4em 0 .9em;display:flex;align-items:center;gap:10px;letter-spacing:-.005em}
h2:before{content:"";width:4px;height:1.1em;border-radius:3px;background:linear-gradient(var(--acento),var(--acento2))}
h3{font-size:1.02rem;margin:0 0 .15em;font-weight:700}h3 a{color:var(--texto)}
.sub{color:var(--suave);margin:0 0 1.2em}
.rejilla{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(170px,1fr))}
.tarjeta{background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--borde);border-radius:var(--r);padding:18px 16px;min-height:128px;transition:transform .18s,border-color .18s,box-shadow .18s}
.tarjeta:hover{transform:translateY(-3px);border-color:#36507f;box-shadow:0 12px 30px -14px rgba(34,211,238,.35)}
.tarjeta p{margin:.8em 0 0}.tarjeta .hora{color:var(--suave);font-size:.82rem}
.bolas{display:inline-flex;flex-wrap:wrap;gap:7px}
.bola{display:inline-grid;place-items:center;min-width:2.45em;height:2.45em;padding:0 .35em;border-radius:999px;background:radial-gradient(circle at 32% 28%,#2c4270,#16223d);border:1px solid #35508a;font-weight:800;font-variant-numeric:tabular-nums;box-shadow:0 2px 8px rgba(0,0,0,.35)}
.bola.rep{border-color:var(--ojo);color:#1a1200;background:radial-gradient(circle at 32% 28%,#fde68a,#f59e0b);box-shadow:0 0 14px rgba(251,191,36,.45)}
.pend{color:var(--suave);font-style:italic;font-size:.92rem}
.aviso{background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.25);border-left:4px solid var(--acento2);padding:16px 18px;border-radius:12px;color:#d3dbea;margin:26px 0}
.cta{background:linear-gradient(120deg,#0e7490,#6d28d9);border-radius:var(--r);padding:20px 22px;margin:34px 0;color:#fff;box-shadow:0 18px 40px -22px rgba(109,40,217,.7)}
.cta a{color:#fff;font-weight:800;text-decoration:underline}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{padding:12px 10px;border-bottom:1px solid var(--borde);text-align:left}tr:last-child td{border-bottom:0}th{color:var(--suave);font-weight:600;font-size:.88rem}
.tabla{overflow-x:auto;background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--borde);border-radius:var(--r);padding:6px 14px}
.mapa{display:grid;grid-template-columns:repeat(10,1fr);gap:5px;max-width:600px}
.mapa a{display:grid;place-items:center;aspect-ratio:1;border-radius:8px;font-size:.82rem;font-weight:700;color:#fff;line-height:1.1;text-align:center;transition:transform .12s}.mapa a:hover{transform:scale(1.12);text-decoration:none}
.mapa small{display:block;font-weight:400;opacity:.85;font-size:.7rem}
.leyenda{color:var(--suave);font-size:.86rem;margin-top:8px}
.chips{display:flex;flex-wrap:wrap;gap:10px}.chips a{background:var(--panel2);border:1px solid var(--borde);border-radius:999px;padding:8px 16px;color:var(--texto);transition:border-color .15s}.chips a:hover{border-color:var(--acento);text-decoration:none}
form.buscar{display:flex;gap:10px;max-width:380px}
form.buscar input{flex:1;padding:13px 14px;border-radius:12px;border:1px solid var(--borde);background:var(--panel);color:#fff;font-size:1.05rem}
form.buscar input:focus{outline:2px solid var(--acento);outline-offset:1px}
form.buscar button{padding:13px 22px;border:0;border-radius:12px;background:linear-gradient(120deg,var(--acento),#60a5fa);color:#04131a;font-weight:800;cursor:pointer}
.migas{font-size:.85rem;color:var(--suave)}.ok{color:var(--bien)}.ojo{color:var(--ojo)}
footer{border-top:1px solid var(--borde);color:var(--suave);font-size:.88rem;background:rgba(0,0,0,.18)}
footer .in{max-width:1120px;margin:auto;padding:28px 18px}
.bola.ya{border-color:var(--bien);color:#03150e;background:radial-gradient(circle at 32% 28%,#6ee7b7,#059669);box-shadow:0 0 14px rgba(52,211,153,.4)}
.lectura h3{margin:0 0 .3em}.dato{background:var(--panel);border:1px solid var(--borde);border-radius:var(--r);padding:12px 16px;margin:14px 0}a.tarjeta{display:block;color:inherit;text-decoration:none}
.radar{text-align:center;min-height:0}.radar p{margin:.6em 0 0}.radar .bola{width:3.2em;height:3.2em;font-size:1.15rem}
.radar-cta{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--borde);border-radius:var(--r);padding:16px 18px;margin:30px 0}
details{margin:12px 0}summary{cursor:pointer;color:var(--acento);font-weight:700;padding:10px 0}
@media(max-width:560px){.hero{padding:26px 0 14px}.rejilla{gap:12px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}.bola{min-width:2.25em;height:2.25em}.cab .in{justify-content:center}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

function pagina({ ruta, titulo, descripcion, cuerpo, indexar = true }) {
  const canon = SITE_URL + ruta;
  const ads = ADSENSE_CLIENT ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(ADSENSE_CLIENT)}" crossorigin="anonymous"></script>` : '';
  return `<!DOCTYPE html>
<html lang="es-DO"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><meta name="description" content="${esc(descripcion)}">
<link rel="canonical" href="${esc(canon)}">${indexar ? '' : '<meta name="robots" content="noindex">'}
<meta property="og:type" content="website"><meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descripcion)}"><meta property="og:url" content="${esc(canon)}"><meta property="og:site_name" content="${NOMBRE_SITIO}">
<link rel="stylesheet" href="${url('/estilos.css')}">${ads}
</head><body>
<header class="cab"><div class="in"><a class="logo" href="${url('/')}">Reydis <span>Radar</span></a>
<nav class="menu"><a href="${url('/')}">Hoy</a><a href="${url('/jugadas/')}">Jugadas</a><a href="${url('/loterias/')}">Loterías</a><a href="${url('/numeros/')}">Números</a><a href="${url('/resultados/')}">Historial</a><a href="${url('/guias/')}">Guías</a><a href="${url('/como-funciona/')}">Cómo funciona</a></nav></div></header>
<main>${cuerpo}</main>
<footer><div class="in"><p><strong>${NOMBRE_SITIO}</strong> · Resultados y estadísticas reales de las loterías dominicanas. Vende claridad, no esperanza.</p>
<p>Los resultados se publican tal como los dan las fuentes; ante cualquier duda, el resultado oficial es el de cada lotería. Las estadísticas describen el pasado y <strong>no predicen</strong> el próximo sorteo. Juega con responsabilidad y solo lo que puedas perder. Solo mayores de 18 años.</p>
<p><a href="${url('/guias/')}">Guías</a> · <a href="${url('/lectura/')}">Lecturas</a> · <a href="${url('/como-funciona/')}">Cómo funciona</a> · <a href="${url('/sobre-nosotros/')}">Sobre nosotros</a> · <a href="${url('/contacto/')}">Contacto</a> · <a href="${url('/terminos/')}">Términos</a> · <a href="${url('/privacidad/')}">Privacidad</a> · Actualizado: ${esc(fechaCorta(fechaRD()))}, ${esc(horaRD())} (hora RD)</p></div></footer>
</body></html>`;
}

const ctaTelegram = () => `<div class="cta"><strong>📲 Próximamente: avisos de resultados por Telegram.</strong> Mientras tanto, esta página se actualiza sola después de cada sorteo. <a href="${url('/guias/')}">Mira nuestras guías</a></div>`;
const avisoHonesto = () => `<div class="aviso">🔎 <strong>Claro y sin cuentos:</strong> cada sorteo es independiente. Que un número esté "caliente" o "atrasado" describe lo que ya pasó, no lo que va a salir. Nuestro laboratorio probó 12 métodos con datos reales y ninguno le ganó al azar. Usa estos datos para informarte, no como garantía.</div>`;

function colorMapa(v, max) {
  const t = max ? v / max : 0;
  const h = 220 - Math.round(t * 200); // azul (frío) → rojo (caliente)
  return `hsl(${h} 70% ${22 + Math.round(t * 20)}%)`;
}

// ── Radar: números del día, marcador contra el azar y jaladeras ────────────
const PESOS = [60, 8, 4];          // 1.er, 2.º y 3.er premio (como el motor del bot)
const PL = 1 - Math.pow(0.99, 3);  // prob. de que un número salga en un sorteo
const VENT_RADAR = 30, K_RADAR = 5, DIAS_MARCADOR = 60;

function puntajes(dias, hasta) {
  const pts = Array(100).fill(0);
  for (const d of dias.slice(Math.max(0, hasta - VENT_RADAR), hasta))
    for (const nums of Object.values(d.quinielas)) nums.forEach((n, i) => { pts[n] += PESOS[i] || 0; });
  return pts;
}
const topN = (pts, k = K_RADAR) => pts.map((p, n) => ({ n, p })).sort((a, b) => b.p - a.p || a.n - b.n).slice(0, k).map(x => x.n);
const nombreLoteria = k => (LOTERIAS.find(l => l.clave === k) || { nombre: k }).nombre;

function calcularRadar(dias) {
  const hoy = fechaRD();
  const idxHoy = dias.findIndex(d => d.fecha === hoy);
  const fin = idxHoy >= 0 ? idxHoy : dias.length; // el marcador solo usa días ya terminados
  const diaHoy = idxHoy >= 0 ? dias[idxHoy] : null;
  const hoyNums = fin >= 10 ? topN(puntajes(dias, fin)) : [];
  const yaSalio = n => diaHoy ? Object.entries(diaHoy.quinielas).filter(([, nums]) => nums.includes(n)).map(([k]) => nombreLoteria(k)) : [];
  const picks = hoyNums.map(n => ({ n, yaSalio: yaSalio(n) }));
  const detalle = [];
  let sumHits = 0, sumEsp = 0;
  for (let i = Math.max(10, fin - DIAS_MARCADOR); i < fin; i++) {
    const L = Object.keys(dias[i].quinielas).length;
    if (L < 8) continue; // día incompleto
    const top = topN(puntajes(dias, i));
    const salidos = new Set(Object.values(dias[i].quinielas).flat());
    const hits = top.filter(n => salidos.has(n));
    const esp = K_RADAR * (1 - Math.pow(1 - PL, L));
    sumHits += hits.length; sumEsp += esp;
    detalle.push({ fecha: dias[i].fecha, top, hits, esp });
  }
  return { hoy: picks, dias: detalle.length, sumHits, sumEsp, detalle };
}

function calcularJaladeras(series) {
  const M = Array(100).fill(0);
  const sig = Array.from({ length: 100 }, () => Array(100).fill(0));
  for (const l of LOTERIAS) {
    const s = series[l.clave] || [];
    for (let i = 0; i < s.length - 1; i++) {
      if (diasEntre(s[i].fecha, s[i + 1].fecha) !== 1) continue; // solo sorteos de días seguidos
      for (const a of new Set(s[i].nums)) { M[a]++; for (const b of new Set(s[i + 1].nums)) sig[a][b]++; }
    }
  }
  return Array.from({ length: 100 }, (_, a) => ({ a, M: M[a], top: sig[a].map((c, b) => ({ b, c })).sort((x, y) => y.c - x.c || x.b - y.b).slice(0, 3) }));
}

function teaserRadar(dias) {
  const r = calcularRadar(dias);
  if (!r.hoy.length) return '';
  return `<div class="radar-cta"><strong>🎯 Números del día</strong><span class="bolas">${r.hoy.map(x => bola(f2(x.n), x.yaSalio.length ? ' ya' : '')).join('')}</span><a href="${url('/jugadas/')}">Ver jugadas y marcador →</a></div>`;
}

function paginaJugadas(dias, series) {
  const r = calcularRadar(dias);
  const jal = calcularJaladeras(series);
  const tarjetas = r.hoy.map(x => `<div class="tarjeta radar"><div>${bola(f2(x.n), x.yaSalio.length ? ' ya' : '')}</div><p class="hora">${x.yaSalio.length ? `Ya salió hoy en: <strong>${x.yaSalio.map(esc).join(', ')}</strong>` : 'Todavía no ha salido hoy'}</p></div>`).join('');
  const prom = r.dias ? r.sumHits / r.dias : 0, esp = r.dias ? r.sumEsp / r.dias : 0;
  const veredicto = !r.dias ? 'Todavía no hay suficientes días para medirlo.'
    : Math.abs(prom - esp) < 0.2 ? 'Prácticamente igual que el azar.'
    : prom > esp ? 'Un poco por encima del azar, aunque con tan pocos días puede ser casualidad.'
    : 'Un poco por debajo del azar.';
  const filasDia = [...r.detalle].reverse().slice(0, 14).map(d => `<tr><td>${esc(fechaMini(d.fecha))}</td><td><span class="bolas">${d.top.map(n => bola(f2(n), d.hits.includes(n) ? ' ya' : '')).join('')}</span></td><td>${d.hits.length}</td><td>${d.esp.toFixed(1)}</td></tr>`).join('');
  const filasJal = jal.map(j => `<tr><td>${bola(f2(j.a))}</td><td><span class="bolas">${j.top.map(t => `${bola(f2(t.b))}<small class="leyenda">${t.c}×</small>`).join(' ')}</span></td><td>${j.M}</td></tr>`).join('');
  const cuerpo = `<section class="hero"><h1>Números del día y jaladeras</h1>
<p class="sub">Lo que dicen las estadísticas del Radar para hoy, sin dividir por lotería. Es información y entretenimiento: <strong>no es una ventaja</strong>, y abajo te mostramos cuánto le ha ido contra el azar.</p></section>
<h2>🎯 Números del día</h2>
${r.hoy.length ? `<div class="rejilla">${tarjetas}</div><p class="leyenda">Son los 5 números con más peso en los últimos ${VENT_RADAR} días (el 1.er premio pesa más que el 2.º y el 3.º). En verde, los que ya salieron hoy en alguna lotería: si no salió en una, puede salir en otra.</p>` : '<p>Todavía no hay suficientes días de historial para calcularlos.</p>'}
<h2>¿Qué tan bien le ha ido?</h2>
<p>${r.dias ? `En los últimos <strong>${r.dias}</strong> días completos, los 5 números del Radar salieron en promedio <strong>${prom.toFixed(2)}</strong> por día. El azar esperaba <strong>${esp.toFixed(2)}</strong>. ${veredicto}` : veredicto}</p>
<p class="leyenda">Con unas 20 loterías al día, cualquier número sale en alguna casi la mitad de los días solo por azar. Por eso el marcador compara contra eso y no contra cero. Cada día se calcula usando solo los días anteriores.</p>
${r.dias ? `<div class="tabla"><table><tr><th>Día</th><th>Números del Radar</th><th>Salieron</th><th>Azar esperaba</th></tr>${filasDia}</table></div>` : ''}
<h2>🔗 Jaladeras</h2>
<p>La jaladera es la idea de que un número "jala" a otro. Esto es lo que dicen los datos: cuando un número sale en una lotería, lo que más salió en el siguiente sorteo de esa misma lotería (al día siguiente).</p>
<p class="leyenda">Cuidado al leerlo: por azar, cada número aparece en el siguiente sorteo unas 3 de cada 100 veces. Con tan pocas repeticiones, casi todo lo que se ve aquí es casualidad.</p>
<details><summary>Ver las 100 jaladeras</summary><div class="tabla"><table><tr><th>Si sale</th><th>Después salió más</th><th>Veces vistas</th></tr>${filasJal}</table></div></details>
${avisoHonesto()}
<p class="leyenda">Juega con responsabilidad, solo lo que puedas perder. Solo mayores de 18 años.</p>
${ctaTelegram()}`;
  return pagina({ ruta: '/jugadas/', titulo: `Números del día y jaladeras de la lotería dominicana | ${NOMBRE_SITIO}`, descripcion: 'Números del día según las estadísticas, marcador contra el azar y jaladeras de la lotería dominicana, con datos reales.', cuerpo });
}

// ── Páginas ─────────────────────────────────────────────────────────────────
function paginaInicio(dias, series) {
  const hoy = fechaRD();
  const dia = dias[dias.length - 1];
  const esHoy = dia && dia.fecha === hoy;
  const conteo = {};
  if (dia) for (const [k, nums] of Object.entries(dia.quinielas)) new Set(nums).forEach(n => (conteo[n] = conteo[n] || []).push(k));
  const repetidos = Object.entries(conteo).filter(([, ks]) => ks.length >= 2).sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
  const nombre = k => (LOTERIAS.find(l => l.clave === k) || { nombre: k }).nombre;

  const tarjetas = LOTERIAS.filter(l => series[l.clave].length).map(l => {
    const nums = dia && dia.quinielas[l.clave];
    const cont = nums ? `<span class="bolas">${nums.map(n => bola(f2(n), conteo[n] && conteo[n].length >= 2 ? ' rep' : '')).join('')}</span>` : `<span class="pend">Pendiente</span>`;
    return `<div class="tarjeta"><h3><a href="${url(`/loterias/${l.slug}/`)}">${esc(l.nombre)}</a></h3><div class="hora">${esc(horaHoy(l))}</div><p>${cont}</p></div>`;
  }).join('');

  const otros = dia && dia.otros.length ? `<h2>Otros juegos</h2><div class="rejilla">${dia.otros.map(o => `<div class="tarjeta"><h3>${esc(o.nombre)}</h3><div class="hora">${esc([o.empresa, o.hora].filter(Boolean).join(' · '))}</div><p>${numerosJuego(o)}</p></div>`).join('')}</div>` : '';

  const reps = repetidos.length ? `<h2>⚡ Repetidos en varias loterías ${esHoy ? 'hoy' : 'ese día'}</h2><div class="tabla"><table><tr><th>Número</th><th>Salió en</th></tr>${repetidos.map(([n, ks]) => `<tr><td><a href="${url(`/numeros/${f2(n)}/`)}">${bola(f2(n), ' rep')}</a></td><td>${ks.map(k => esc(nombre(k))).join(', ')}</td></tr>`).join('')}</table></div>` : '';

  const titulo = esHoy ? `Resultados de la lotería de hoy, ${fechaLarga(hoy)}` : `Últimos resultados de la lotería · ${dia ? fechaLarga(dia.fecha) : ''}`;
  const cuerpo = `<section class="hero"><span class="vivo">En vivo · se actualiza minutos después de cada sorteo</span>
<h1>${esc(titulo)}</h1>
<p class="sub">Quinielas dominicanas y de afuera con estadísticas reales de los últimos ${VENTANA} sorteos. Sin promesas, solo datos.</p></section>
<div class="rejilla">${tarjetas || '<p>Todavía no hay resultados.</p>'}</div>
${reps}${otros}
${teaserRadar(dias)}
${tarjetaLectura(dias)}
${ctaTelegram()}
<h2>Busca tu número</h2>
<form class="buscar" onsubmit="var n=parseInt(this.n.value,10);if(n>=0&&n<=99){location.href='${url('/numeros/')}'+String(n).padStart(2,'0')+'/'}return false"><input name="n" inputmode="numeric" maxlength="2" placeholder="Ej: 27" aria-label="Número del 00 al 99"><button>Ver</button></form>
<p class="leyenda">Te dice cuándo salió por última vez en cada lotería y cuántas veces ha salido.</p>
${avisoHonesto()}`;
  return pagina({ ruta: '/', titulo: `${titulo} | ${NOMBRE_SITIO}`, descripcion: `Resultados de hoy de Leidsa, Loteka, Nacional, Real, La Primera, LoteDom, Anguila, King Lottery, New York y Florida, con estadísticas reales y sin promesas.`, cuerpo });
}

function numerosJuego(o) {
  if (o.tipo === 'pega3' || o.tipo === 'pega4') return `<span class="bolas">${o.numeros.map(n => bola(n)).join('')}</span>`;
  return bolas(o.numeros);
}

function paginaLoterias(series) {
  const filas = LOTERIAS.filter(l => series[l.clave].length).map(l => {
    const s = series[l.clave], u = s[s.length - 1];
    return `<tr><td><a href="${url(`/loterias/${l.slug}/`)}">${esc(l.nombre)}</a></td><td>${esc(horaHoy(l))}</td><td>${bolas(u.nums)}</td><td>${esc(fechaCorta(u.fecha))}</td></tr>`;
  }).join('');
  const cuerpo = `<h1>Loterías y quinielas</h1><p class="sub">Último resultado de cada una. Entra a cualquiera para ver su historial y sus estadísticas.</p>
<div class="tabla"><table><tr><th>Lotería</th><th>Hora</th><th>Último</th><th>Fecha</th></tr>${filas}</table></div>${ctaTelegram()}`;
  return pagina({ ruta: '/loterias/', titulo: `Todas las loterías dominicanas: últimos resultados | ${NOMBRE_SITIO}`, descripcion: 'Últimos resultados y estadísticas de cada quiniela: Leidsa, Loteka, Nacional, Real, La Primera, LoteDom, La Suerte, Anguila, King Lottery, New York y Florida.', cuerpo });
}

function paginaLoteria(l, serie) {
  const e = estadisticas(serie);
  const u = serie[serie.length - 1];
  const max = Math.max(...e.veces);
  const mapa = e.veces.map((v, n) => `<a href="${url(`/numeros/${f2(n)}/`)}" style="background:${colorMapa(v, max)}" title="${f2(n)}: ${v} veces">${f2(n)}<small>${v}</small></a>`).join('');
  const lista = (arr, campo, etiqueta) => arr.map(x => `<a href="${url(`/numeros/${f2(x.n)}/`)}">${bola(f2(x.n))}</a> <small class="leyenda">${x.nunca ? 'nunca en el historial' : `${x[campo]} ${x[campo] === 1 ? etiqueta.replace(/^veces$/, 'vez').replace(/^sorteos /, 'sorteo ') : etiqueta}`}</small>`).join('<br>');
  const fueraTxt = e.fuera.length
    ? `En ${e.N} sorteos, ${e.fuera.length} número(s) se salen del rango normal (${e.fuera.map(x => `<strong>${f2(x.n)}</strong> ${x.v}×`).join(', ')}). Ojo: con 100 números, que unos 5 se salgan es lo normal por puro azar.`
    : `Ningún número se sale del rango normal en ${e.N} sorteos. Así se ve una lotería que se comporta como azar.`;
  const ultimos = serie.slice(-30).reverse().map(s => `<tr><td><a href="${url(`/resultados/${s.fecha}/`)}">${esc(fechaCorta(s.fecha))}</a></td><td>${bolas(s.nums)}</td></tr>`).join('');

  const cuerpo = `<p class="migas"><a href="${url('/loterias/')}">Loterías</a> › ${esc(l.nombre)}</p>
<h1>${esc(l.nombre)}: resultados y estadísticas</h1>
<p class="sub">Sorteo de las ${esc(l.hora)}${HORA_DOMINGO[l.clave] ? ` (los domingos, a las ${esc(HORA_DOMINGO[l.clave])})` : ''}. Último resultado (${esc(fechaLarga(u.fecha))}): ${bolas(u.nums)}</p>
<h2>Mapa de los últimos ${e.N} sorteos</h2>
<div class="mapa">${mapa}</div>
<p class="leyenda">Cada casilla: el número y cuántas veces salió. Lo esperado por azar es ~${e.esperado.toFixed(1)} veces (lo normal va de ${Math.max(0, e.esperado - 2 * e.sd).toFixed(0)} a ${(e.esperado + 2 * e.sd).toFixed(0)}). Azul = menos, rojo = más.</p>
<p>${fueraTxt}</p>
<div class="rejilla">
<div class="tarjeta"><h3>🔥 Más salidos</h3>${lista(e.calientes, 'v', 'veces')}</div>
<div class="tarjeta"><h3>🧊 Menos salidos</h3>${lista(e.frios, 'v', 'veces')}</div>
<div class="tarjeta"><h3>⏳ Más atrasados</h3>${lista(e.atrasados, 's', 'sorteos sin salir')}</div>
</div>
${avisoHonesto()}
<h2>Últimos 30 resultados</h2>
<div class="tabla"><table><tr><th>Fecha</th><th>Números</th></tr>${ultimos}</table></div>
${ctaTelegram()}`;
  return pagina({ ruta: `/loterias/${l.slug}/`, titulo: `${l.nombre} hoy (${l.hora}): resultados y números más salidos | ${NOMBRE_SITIO}`, descripcion: `Último resultado de ${l.nombre} (${l.hora}), historial de los últimos sorteos, números más salidos, menos salidos y atrasados. Estadística real, sin promesas.`, cuerpo });
}

function paginaNumero(n, series) {
  const filas = [];
  let total = 0, totalSorteos = 0;
  for (const l of LOTERIAS) {
    const s = series[l.clave];
    if (!s.length) continue;
    const e = estadisticas(s);
    total += e.veces[n]; totalSorteos += e.N;
    filas.push(`<tr><td><a href="${url(`/loterias/${l.slug}/`)}">${esc(l.nombre)}</a></td><td>${e.ultimaFecha[n] ? `<a href="${url(`/resultados/${e.ultimaFecha[n]}/`)}">${esc(fechaMini(e.ultimaFecha[n]))}</a>` : '—'}</td><td>${e.sinSalir[n] === null ? '—' : e.sinSalir[n]}</td><td>${e.veces[n]} <span class="leyenda">/ ~${e.esperado.toFixed(1)}</span></td><td>${e.primera[n]}</td></tr>`);
  }
  const esperado = totalSorteos * (1 - Math.pow(0.99, 3));
  const nn = f2(n), inv = f2(Number(String(nn).split('').reverse().join('')));
  const vecinos = [n - 1, n + 1].filter(x => x >= 0 && x <= 99);
  const cuerpo = `<p class="migas"><a href="${url('/numeros/')}">Números</a> › ${nn}</p>
<h1>El número ${nn} en la lotería</h1>
<p class="sub">En los últimos ${VENTANA} sorteos de cada lotería, el ${nn} salió <strong>${total}</strong> veces en total. Por puro azar se esperaban unas <strong>${esperado.toFixed(1)}</strong>.</p>
<div class="tabla"><table><tr><th>Lotería</th><th>Última vez</th><th>Sorteos sin salir</th><th>Veces / esperado</th><th>1er premio</th></tr>${filas.join('')}</table></div>
<p class="chips" style="margin-top:14px">${inv !== nn ? `<a href="${url(`/numeros/${inv}/`)}">Volteado: ${inv}</a>` : ''}${vecinos.map(v => `<a href="${url(`/numeros/${f2(v)}/`)}">${f2(v)}</a>`).join('')}<a href="${url('/numeros/')}">Todos los números</a></p>
${avisoHonesto()}${ctaTelegram()}`;
  return pagina({ ruta: `/numeros/${nn}/`, titulo: `Número ${nn}: cuándo salió por última vez en cada lotería | ${NOMBRE_SITIO}`, descripcion: `¿Cuándo salió el ${nn}? Última fecha y veces que ha salido el ${nn} en Leidsa, Loteka, Nacional, Real, La Primera, LoteDom, Anguila y más.`, cuerpo });
}

function paginaNumeros(series) {
  const veces = Array(100).fill(0);
  let tot = 0;
  for (const l of LOTERIAS) { const s = series[l.clave]; if (!s.length) continue; const e = estadisticas(s); e.veces.forEach((v, n) => (veces[n] += v)); tot += e.N; }
  const max = Math.max(...veces);
  const mapa = veces.map((v, n) => `<a href="${url(`/numeros/${f2(n)}/`)}" style="background:${colorMapa(v, max)}" title="${f2(n)}: ${v} veces">${f2(n)}<small>${v}</small></a>`).join('');
  const cuerpo = `<h1>Números del 00 al 99</h1><p class="sub">Veces que salió cada número sumando todas las loterías (${tot} sorteos). Toca uno para ver su detalle.</p>
<div class="mapa">${mapa}</div><p class="leyenda">Lo esperado por azar: ~${(tot * (1 - Math.pow(0.99, 3))).toFixed(0)} veces cada número.</p>${avisoHonesto()}`;
  return pagina({ ruta: '/numeros/', titulo: `Números más salidos en la lotería dominicana (00-99) | ${NOMBRE_SITIO}`, descripcion: 'Mapa de los 100 números de la quiniela con las veces que ha salido cada uno en todas las loterías. Datos reales.', cuerpo });
}

function paginaFecha(dia, anterior, siguiente) {
  const filas = LOTERIAS.filter(l => dia.quinielas[l.clave]).map(l => `<tr><td><a href="${url(`/loterias/${l.slug}/`)}">${esc(l.nombre)}</a></td><td>${esc(l.hora)}</td><td>${bolas(dia.quinielas[l.clave])}</td></tr>`).join('');
  const otros = dia.otros.length ? `<h2>Otros juegos</h2><div class="tabla"><table><tr><th>Juego</th><th>Números</th></tr>${dia.otros.map(o => `<tr><td>${esc(o.nombre)}${o.empresa ? ` <span class="leyenda">${esc(o.empresa)}</span>` : ''}</td><td>${numerosJuego(o)}</td></tr>`).join('')}</table></div>` : '';
  const nav = `<p class="chips">${anterior ? `<a href="${url(`/resultados/${anterior}/`)}">← ${esc(fechaCorta(anterior))}</a>` : ''}${siguiente ? `<a href="${url(`/resultados/${siguiente}/`)}">${esc(fechaCorta(siguiente))} →</a>` : ''}</p>`;
  const cuerpo = `<p class="migas"><a href="${url('/resultados/')}">Historial</a> › ${esc(fechaCorta(dia.fecha))}</p>
<h1>Resultados de la lotería del ${esc(fechaLarga(dia.fecha))}</h1>
<div class="tabla"><table><tr><th>Lotería</th><th>Hora</th><th>Números</th></tr>${filas}</table></div>${otros}${nav}${ctaTelegram()}`;
  return pagina({ ruta: `/resultados/${dia.fecha}/`, titulo: `Resultados lotería ${fechaLarga(dia.fecha)} | ${NOMBRE_SITIO}`, descripcion: `Todos los resultados de la lotería del ${fechaLarga(dia.fecha)}: Leidsa, Loteka, Nacional, Real, La Primera, LoteDom, Anguila y más.`, cuerpo });
}

function paginaHistorial(dias) {
  const porMes = {};
  for (const d of [...dias].reverse()) (porMes[d.fecha.slice(0, 7)] = porMes[d.fecha.slice(0, 7)] || []).push(d.fecha);
  const bloques = Object.entries(porMes).map(([mes, fs]) => {
    const nom = new Intl.DateTimeFormat('es-DO', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(dUTC(mes + '-15'));
    return `<h2>${esc(nom)}</h2><p class="chips">${fs.map(f => `<a href="${url(`/resultados/${f}/`)}">${Number(f.slice(8))}</a>`).join('')}</p>`;
  }).join('');
  const cuerpo = `<h1>Historial de resultados</h1><p class="sub">Todos los días que tenemos guardados, de más reciente a más viejo.</p>${bloques}`;
  return pagina({ ruta: '/resultados/', titulo: `Historial de resultados de la lotería dominicana | ${NOMBRE_SITIO}`, descripcion: 'Resultados de la lotería por fecha: busca lo que salió cualquier día en todas las loterías dominicanas.', cuerpo });
}

function paginaComoFunciona() {
  const cuerpo = `<h1>Cómo funciona ${NOMBRE_SITIO}</h1>
<p>${NOMBRE_SITIO} recoge cada día los resultados de las loterías dominicanas y de las quinielas de afuera que se juegan en las bancas, y los guarda en un historial. Con ese historial calculamos estadísticas sencillas y honestas.</p>
<h2>¿Qué significan los números?</h2>
<p><strong>Veces que salió:</strong> cuántas veces apareció un número (en cualquiera de los 3 premios) en los últimos ${VENTANA} sorteos de esa lotería.</p>
<p><strong>Esperado:</strong> en cada sorteo salen 3 números del 00 al 99, así que cada número sale por azar unas 3 veces cada 100 sorteos. Si un número salió cerca de lo esperado, no tiene nada de especial.</p>
<p><strong>Rango normal:</strong> el azar nunca reparte parejo. Marcamos los números que se alejan mucho de lo esperado, pero con 100 números lo normal es que unos 5 se alejen por pura casualidad.</p>
<p><strong>Atrasados:</strong> cuántos sorteos lleva un número sin salir. Un número atrasado <em>no</em> tiene más chance de salir: las tómbolas no tienen memoria.</p>
<h2>¿Ustedes predicen números?</h2>
<p>No. Nuestro laboratorio probó 12 métodos populares (jaladera, espejo, gemelos, calientes, atrasados y otros) contra datos reales sorteo por sorteo, y ninguno le ganó al azar. Por eso no prometemos nada. Aun así, en la página <a href="${url('/jugadas/')}">Jugadas</a> mostramos los "números del día" y las "jaladeras" porque mucha gente los consulta, siempre con un marcador contra el azar para que veas cuándo es suerte y cuándo no.</p>
<h2>Juego responsable</h2>
<p>La lotería es entretenimiento. Juega solo lo que puedas perder, ponte un límite y no intentes recuperar lo perdido apostando más. Solo para mayores de 18 años.</p>
${ctaTelegram()}`;
  return pagina({ ruta: '/como-funciona/', titulo: `Cómo funciona y juego responsable | ${NOMBRE_SITIO}`, descripcion: 'Cómo calculamos las estadísticas de la lotería, qué significan y por qué no vendemos predicciones.', cuerpo });
}

function paginaPrivacidad() {
  const cuerpo = `<h1>Política de privacidad</h1>
<p>${NOMBRE_SITIO} no pide registro ni guarda datos personales de quienes visitan este sitio.</p>
<p>Este sitio puede mostrar anuncios de Google AdSense. Google y sus socios usan cookies para mostrar anuncios según las visitas anteriores a este y otros sitios. Puedes desactivar los anuncios personalizados en la <a href="https://adssettings.google.com" rel="noopener">configuración de anuncios de Google</a>, y conocer más en <a href="https://policies.google.com/technologies/ads" rel="noopener">cómo usa Google la información</a>.</p>
<p>El sitio está alojado en un servicio externo que puede registrar datos técnicos de las visitas (como la dirección IP) por razones de seguridad.</p>
<p>Para cualquier consulta, usa la página de <a href="${url('/contacto/')}">Contacto</a>.</p>
<p class="leyenda">Última actualización: ${esc(fechaLarga(fechaRD()))}.</p>`;
  return pagina({ ruta: '/privacidad/', titulo: `Política de privacidad | ${NOMBRE_SITIO}`, descripcion: `Política de privacidad de ${NOMBRE_SITIO}.`, cuerpo });
}

// ── Guías y páginas informativas ───────────────────────────────────────────
const lotPorSlug = slug => LOTERIAS.find(l => l.slug === slug);
const enlaceLoteria = l => `<a href="${url(`/loterias/${l.slug}/`)}">${esc(l.nombre)}</a>`;
function tablaUltimos(series, clave, n = 7) {
  const filas = (series[clave] || []).slice(-n).reverse().map(x => `<tr><td><a href="${url(`/resultados/${x.fecha}/`)}">${esc(fechaCorta(x.fecha))}</a></td><td>${bolas(x.nums)}</td></tr>`).join('');
  return filas ? `<div class="tabla"><table><tr><th>Fecha</th><th>Números</th></tr>${filas}</table></div>` : '';
}
const juegoResp = () => `<h2>Juego responsable</h2>
<p>La lotería es entretenimiento, no una forma de ganar dinero. Juega solo lo que puedas perder, ponte un límite antes de empezar y no intentes recuperar lo perdido apostando más. Solo para mayores de 18 años.</p>`;
const pieGuia = () => `${avisoHonesto()}${juegoResp()}<p class="leyenda">Los resultados se publican tal como los dan las fuentes. Ante cualquier duda, el resultado oficial es el de cada lotería.</p>`;
const migasGuia = t => `<p class="migas"><a href="${url('/guias/')}">Guías</a> › ${esc(t)}</p>`;

function paginaGuias() {
  const items = [
    ['/guias/como-jugar-quiniela-pale-tripleta/', 'Cómo se juega la quiniela, el palé y la tripleta', 'Qué es cada jugada, cuántos números salen y qué tan probable es cada una.'],
    ['/guias/horarios-loterias-dominicanas/', 'Horarios de las loterías dominicanas', 'A qué hora sortea cada lotería y quiniela, de la mañana a la noche.'],
    ['/guias/loteria-nacional/', 'Lotería Nacional: sorteos, horarios y resultados', 'Gana Más y Lotería Nacional, cuándo juegan y dónde ver lo que salió anoche.'],
    ['/guias/anguila/', 'Anguila: sorteos y resultados', 'Los cuatro sorteos de Anguila al día y sus últimos números.'],
    ['/guias/preguntas-frecuentes/', 'Preguntas frecuentes', 'Respuestas cortas a lo que más se pregunta sobre las loterías.'],
  ];
  const cuerpo = `<section class="hero"><h1>Guías de la lotería dominicana</h1>
<p class="sub">Explicaciones claras, sin promesas ni trucos: cómo funcionan las jugadas, los horarios y cada lotería.</p></section>
<p><a href="${url('/lectura/')}">📖 Lecturas cortas sobre el azar y el juego responsable →</a></p>
<div class="rejilla">${items.map(([r, t, d]) => `<a class="tarjeta" href="${url(r)}"><h3>${esc(t)}</h3><p class="hora">${esc(d)}</p></a>`).join('')}</div>
${pieGuia()}`;
  return pagina({ ruta: '/guias/', titulo: `Guías de la lotería dominicana | ${NOMBRE_SITIO}`, descripcion: 'Guías claras sobre la lotería dominicana: cómo se juega la quiniela, el palé y la tripleta, horarios de cada sorteo y preguntas frecuentes.', cuerpo });
}

function paginaGuiaJugar() {
  const cuerpo = `${migasGuia('Cómo se juega')}<h1>Cómo se juega la quiniela, el palé y la tripleta</h1>
<p class="sub">Las tres jugadas más comunes en las bancas dominicanas, explicadas sin enredos y con las probabilidades reales.</p>
<h2>La quiniela</h2>
<p>Eliges un número del <strong>00 al 99</strong>. En cada sorteo salen <strong>tres números</strong>: el primer, el segundo y el tercer premio. Si el tuyo es uno de ellos, ganas, y cada premio paga distinto según la lotería y la banca. Por eso conviene preguntar en tu banca cuánto paga cada posición y guardar siempre el recibo.</p>
<h2>El palé</h2>
<p>Apuestas a <strong>dos números</strong> a la vez. Para ganar, los dos tienen que salir entre los tres números del sorteo. Las reglas del orden y lo que paga cambian según la lotería, así que confirma las condiciones con tu banca antes de jugar.</p>
<h2>La tripleta</h2>
<p>Apuestas a <strong>tres números</strong> y tienen que salir los tres. Es la jugada más difícil de las tres, y por eso suele ser la que más paga.</p>
<h2>Súper palé</h2>
<p>Según Leidsa, el Súper Palé consiste en acertar el primer número del sorteo de Quiniela Palé Electrónico y el primer número del sorteo de la Lotería Nacional. Revisa siempre las reglas vigentes con la lotería.</p>
<h2>¿Qué tan probable es cada una?</h2>
<p>En cada sorteo salen tres números del 00 al 99. Haciendo la cuenta:</p>
<div class="tabla"><table><tr><th>Jugada</th><th>Probabilidad aproximada</th></tr>
<tr><td>Un número específico como primer premio</td><td>1 en 100 (1%)</td></tr>
<tr><td>Un número específico en cualquiera de los tres premios</td><td>1 en 34 (casi 3%)</td></tr>
<tr><td>Un palé específico</td><td>menos de 1 en 1,000</td></tr>
<tr><td>Una tripleta específica</td><td>menos de 1 en 100,000</td></tr></table></div>
<p>Mientras más números juntos pides que coincidan, más difícil es y más paga. Ninguna jugada tiene trucos: cada sorteo es independiente de los anteriores.</p>
<h2>Cómo usar nuestras estadísticas</h2>
<p>En ${NOMBRE_SITIO} puedes ver los <a href="${url('/loterias/')}">resultados de cada lotería</a>, cuántas veces ha salido cada <a href="${url('/numeros/')}">número</a> y el <a href="${url('/resultados/')}">historial por fecha</a>. Sirve para informarte y entretenerte, no para predecir: un número que lleva muchos sorteos sin salir no tiene más chance de salir.</p>
${pieGuia()}`;
  return pagina({ ruta: '/guias/como-jugar-quiniela-pale-tripleta/', titulo: `Cómo se juega la quiniela, el palé y la tripleta | ${NOMBRE_SITIO}`, descripcion: 'Qué es la quiniela, el palé y la tripleta en República Dominicana, cuántos números salen en cada sorteo y qué tan probable es cada jugada.', cuerpo });
}

function paginaGuiaHorarios() {
  const dom = l => HORA_DOMINGO[l.clave] || (IGUAL_DOMINGO.has(l.clave) ? 'igual' : 'por confirmar');
  const filas = LOTERIAS.map(l => `<tr><td>${esc(l.hora)}</td><td>${enlaceLoteria(l)}</td><td>${esc(dom(l))}</td></tr>`).join('');
  const cuerpo = `${migasGuia('Horarios')}<h1>Horarios de las loterías dominicanas</h1>
<p class="sub">A qué hora sortea cada lotería y quiniela, ordenadas de la mañana a la noche.</p>
<div class="tabla"><table><tr><th>Hora (lunes a sábado)</th><th>Lotería</th><th>Domingo</th></tr>${filas}</table></div>
<p class="leyenda">En la columna Domingo solo ponemos los horarios que hemos confirmado: Leidsa sortea a las 3:55 PM y la Lotería Nacional a las 6:00 PM. "Por confirmar" significa que todavía no tenemos el dato seguro del domingo. Los días feriados también pueden cambiar la hora, así que confírmalo con la lotería o con tu banca. Los resultados aparecen en la web unos minutos después de cada sorteo.</p>
<p>¿Buscas lo que salió? Mira los <a href="${url('/')}">resultados de hoy</a> o el <a href="${url('/resultados/')}">historial por fecha</a>.</p>
${pieGuia()}`;
  return pagina({ ruta: '/guias/horarios-loterias-dominicanas/', titulo: `Horarios de las loterías dominicanas: a qué hora sortea cada una | ${NOMBRE_SITIO}`, descripcion: 'Horario de los sorteos de Leidsa, Loteka, Lotería Nacional, Real, La Primera, LoteDom, Anguila, King Lottery, New York y Florida.', cuerpo });
}

function paginaGuiaNacional(series) {
  const nac = lotPorSlug('loteria-nacional'), gm = lotPorSlug('gana-mas');
  const sn = series[nac.clave] || [];
  const ult = sn[sn.length - 1];
  const desde = sn[0];
  const cuerpo = `${migasGuia('Lotería Nacional')}<h1>Lotería Nacional: sorteos, horarios y resultados</h1>
<p class="sub">Lo que necesitas saber para encontrar rápido el resultado de la Lotería Nacional y de Gana Más.</p>
<h2>Qué es</h2>
<p>La Lotería Nacional es una institución del Estado dominicano fundada en 1882. Hoy se conoce sobre todo por dos sorteos diarios: <strong>Gana Más</strong> y <strong>Lotería Nacional</strong>.</p>
<h2>A qué hora juega</h2>
<p>Gana Más sortea a las <strong>${esc(gm.hora)}</strong> y la Lotería Nacional a las <strong>${esc(nac.hora)}</strong> de la noche, de lunes a sábado. Los <strong>domingos</strong> Gana Más sigue a las 2:30 PM, pero la Lotería Nacional sortea más temprano, a las <strong>6:00 PM</strong>. En días feriados el horario puede cambiar, así que confírmalo con la lotería.</p>
<h2>Lo que salió en la Lotería Nacional</h2>
${ult ? `<p>El último sorteo registrado fue el ${esc(fechaLarga(ult.fecha))}: ${bolas(ult.nums)}</p>` : ''}
${tablaUltimos(series, nac.clave, 10)}
<p>Para ver cualquier otro día usa el <a href="${url('/resultados/')}">historial por fecha</a>. ${desde ? `Nuestro archivo de Lotería Nacional empieza el ${esc(fechaLarga(desde.fecha))} y crece todos los días.` : ''}</p>
<h2>Lo que salió en Gana Más</h2>
${tablaUltimos(series, gm.clave, 7)}
<p>Más datos en las páginas de ${enlaceLoteria(nac)} y ${enlaceLoteria(gm)}: mapa de números, más salidos, menos salidos y atrasados.</p>
${pieGuia()}`;
  return pagina({ ruta: '/guias/loteria-nacional/', titulo: `Lotería Nacional hoy: horario, sorteos y resultados de anoche | ${NOMBRE_SITIO}`, descripcion: 'Horario de Gana Más y Lotería Nacional, qué salió en el último sorteo y cómo ver los resultados de días anteriores.', cuerpo });
}

function paginaGuiaAnguila(series) {
  const ang = LOTERIAS.filter(l => l.slug.startsWith('anguila'));
  const bloques = ang.map(l => { const sr = series[l.clave] || []; const u = sr[sr.length - 1]; return `<h3>${enlaceLoteria(l)} · ${esc(l.hora)}</h3>${u ? `<p>Último resultado (${esc(fechaLarga(u.fecha))}): ${bolas(u.nums)}</p>` : ''}`; }).join('');
  const cuerpo = `${migasGuia('Anguila')}<h1>Anguila: sorteos y resultados</h1>
<p class="sub">Anguila es una de las quinielas de afuera que más se juegan en las bancas dominicanas. Aquí están sus horarios y sus últimos números.</p>
<h2>Cuántos sorteos tiene</h2>
<p>Anguila tiene <strong>${ang.length} sorteos al día</strong>: ${ang.map(l => esc(l.hora)).join(', ')}. Cada sorteo saca tres números del 00 al 99, igual que las demás quinielas, y se juega con las mismas jugadas: quiniela, palé y tripleta. Consulta nuestra <a href="${url('/guias/como-jugar-quiniela-pale-tripleta/')}">guía de cómo se juega</a>.</p>
<h2>Últimos resultados de cada sorteo</h2>
${bloques}
<p>Si tu número sale en un sorteo de Anguila y también en otra lotería el mismo día, lo verás marcado en la sección de repetidos de los <a href="${url('/')}">resultados de hoy</a>.</p>
<p class="leyenda">Las loterías de afuera se juegan en las bancas dominicanas, pero no las organiza ni las respalda este sitio. Confirma siempre el resultado y las condiciones con tu banca.</p>
${pieGuia()}`;
  return pagina({ ruta: '/guias/anguila/', titulo: `Anguila lotería hoy: horarios y resultados de los 4 sorteos | ${NOMBRE_SITIO}`, descripcion: 'Horarios de los sorteos de Anguila (10:00 AM, 1:00 PM, 6:00 PM y 9:00 PM) y últimos resultados de cada uno.', cuerpo });
}

function paginaGuiaFAQ() {
  const q = [
    ['¿Cuántos números salen en cada sorteo?', 'Tres, del 00 al 99: el primer, el segundo y el tercer premio. Pueden repetirse en el mismo sorteo.'],
    ['¿A qué hora salen los resultados?', `Cada lotería sortea a su hora, desde las 10:00 de la mañana hasta las 10:30 de la noche. Mira la <a href="${url('/guias/horarios-loterias-dominicanas/')}">tabla de horarios</a>.`],
    ['¿Los resultados de esta página son oficiales?', 'Los publicamos tal como los dan las fuentes, pero el resultado oficial es siempre el de cada lotería. Si hay una diferencia, vale el de la lotería.'],
    ['¿Se puede predecir qué número va a salir?', 'No. Cada sorteo es independiente. Probamos 12 métodos populares contra datos reales y ninguno le ganó al azar. Más detalle en <a href="' + url('/como-funciona/') + '">Cómo funciona</a>.'],
    ['¿Qué significa un número atrasado?', 'Que lleva muchos sorteos sin salir. No tiene más posibilidades de salir: las bolas no tienen memoria.'],
    ['¿Cuánto paga cada jugada?', 'Depende de la lotería y de la banca donde juegues. Pregunta antes de jugar y guarda tu recibo.'],
    ['¿Cómo veo lo que salió otro día?', `En el <a href="${url('/resultados/')}">historial por fecha</a> puedes abrir cualquier día guardado y ver todas las loterías.`],
    ['¿Venden boletos o reciben apuestas?', 'No. Este sitio solo informa. No vendemos boletos, no recibimos apuestas y no tenemos relación con ninguna lotería o banca.'],
  ];
  const cuerpo = `${migasGuia('Preguntas frecuentes')}<h1>Preguntas frecuentes sobre la lotería</h1>
${q.map(([a, b]) => `<h2>${esc(a)}</h2><p>${b}</p>`).join('')}
${pieGuia()}`;
  return pagina({ ruta: '/guias/preguntas-frecuentes/', titulo: `Preguntas frecuentes sobre la lotería dominicana | ${NOMBRE_SITIO}`, descripcion: 'Respuestas claras a las preguntas más comunes sobre la lotería dominicana: cuántos números salen, horarios, resultados oficiales y juego responsable.', cuerpo });
}

function paginaSobre() {
  const cuerpo = `<h1>Sobre ${NOMBRE_SITIO}</h1>
<p>${NOMBRE_SITIO} es un proyecto independiente hecho en República Dominicana por un desarrollador dominicano. Empezó como una herramienta personal para llevar el historial de las loterías y hoy lo ponemos al alcance de todos.</p>
<h2>Qué hacemos</h2>
<p>Publicamos los resultados de las loterías y quinielas que se juegan en las bancas dominicanas, los guardamos en un historial y calculamos estadísticas sencillas: qué números han salido más, cuáles menos y cuánto llevan sin salir.</p>
<h2>Qué no hacemos</h2>
<p>No vendemos boletos, no recibimos apuestas, no tenemos relación con ninguna lotería ni banca y no prometemos números ganadores. Nuestro laboratorio probó 12 métodos populares contra datos reales y ninguno le ganó al azar. Por eso nuestra regla es simple: <strong>vendemos claridad, no esperanza</strong>.</p>
<h2>De dónde salen los datos</h2>
<p>Los resultados se toman de fuentes públicas y se publican tal como las dan. Ante cualquier duda, el resultado oficial es el de cada lotería. Si ves un error, avísanos desde <a href="${url('/contacto/')}">Contacto</a>.</p>
<h2>Cómo se financia</h2>
<p>El sitio es gratuito. Más adelante puede mostrar anuncios para cubrir sus costos. Nunca recibirás de nosotros promesas de premios.</p>
${avisoHonesto()}
<p class="leyenda">Solo para mayores de 18 años. Juega con responsabilidad.</p>`;
  return pagina({ ruta: '/sobre-nosotros/', titulo: `Sobre ${NOMBRE_SITIO} | ${NOMBRE_SITIO}`, descripcion: `Quiénes somos y qué hace ${NOMBRE_SITIO}: resultados y estadísticas de la lotería dominicana, sin promesas.`, cuerpo });
}

function paginaContacto() {
  const via = CONTACTO_EMAIL
    ? `<p>Escríbenos a <a href="mailto:${esc(CONTACTO_EMAIL)}">${esc(CONTACTO_EMAIL)}</a>.</p>`
    : `<p>Estamos habilitando nuestro correo de contacto. Vuelve pronto.</p>`;
  const cuerpo = `<h1>Contacto</h1>
<p>¿Viste un resultado equivocado, tienes una sugerencia o una duda sobre el sitio? Cuéntanos.</p>
${via}
<p>Para errores en un resultado, indica la lotería, la fecha y lo que ves en la página, para revisarlo más rápido.</p>
<p class="leyenda">No podemos ayudar con reclamos de premios ni con apuestas: eso se hace directamente con la lotería o con tu banca.</p>`;
  return pagina({ ruta: '/contacto/', titulo: `Contacto | ${NOMBRE_SITIO}`, descripcion: `Cómo contactar a ${NOMBRE_SITIO}: errores en resultados, sugerencias y consultas.`, cuerpo });
}

function paginaTerminos() {
  const cuerpo = `<h1>Términos de uso</h1>
<p>Al usar ${NOMBRE_SITIO} aceptas estos términos.</p>
<h2>Solo información</h2>
<p>Este sitio ofrece resultados y estadísticas de loterías con fines informativos y de entretenimiento. No es una casa de apuestas, no vende boletos y no recibe apuestas. No tiene relación con ninguna lotería, banca o institución de sorteos.</p>
<h2>Resultados</h2>
<p>Los resultados se publican tal como los dan las fuentes y pueden tener errores o retrasos. El resultado oficial es siempre el de cada lotería. No nos hacemos responsables de decisiones tomadas con base en lo que muestra el sitio.</p>
<h2>Estadísticas</h2>
<p>Las estadísticas describen lo que ya pasó y no predicen lo que va a salir. Cada sorteo es independiente. Nada en este sitio garantiza ganancias.</p>
<h2>Mayores de 18 años</h2>
<p>El sitio es solo para mayores de 18 años. Juega con responsabilidad y solo lo que puedas perder.</p>
<h2>Contenido</h2>
<p>El texto, el diseño y los cálculos de este sitio son propios. Puedes citar una parte indicando la fuente y un enlace. No está permitido copiar el sitio completo.</p>
<h2>Cambios</h2>
<p>Podemos actualizar estos términos. La versión vigente es la publicada aquí. Más sobre privacidad en la <a href="${url('/privacidad/')}">política de privacidad</a>.</p>
<p class="leyenda">Última actualización: ${esc(fechaLarga(fechaRD()))}.</p>`;
  return pagina({ ruta: '/terminos/', titulo: `Términos de uso | ${NOMBRE_SITIO}`, descripcion: `Términos de uso de ${NOMBRE_SITIO}: sitio informativo, sin venta de boletos ni apuestas.`, cuerpo });
}

// ── Lectura del día + dato del día ─────────────────────────────────────────
const LECTURAS = [
  { slug: 'numero-atrasado-chance', titulo: '¿Un número atrasado tiene más chance de salir?', resumen: 'No: las bolas no recuerdan lo que pasó en los sorteos anteriores.', cuerpo: `<p>Mucha gente piensa que si un número lleva semanas sin salir, "ya le toca". Esa idea tiene nombre: la falacia del jugador, y es de las creencias más comunes sobre el azar.</p>
<p>No funciona porque cada sorteo es un hecho nuevo. Las bolas no saben qué salió ayer ni hace un mes. Si el 37 llevaba 150 sorteos sin salir, su chance de salir hoy sigue siendo la de siempre: casi 3% en un sorteo de tres números.</p>
<p>Lo que sí pasa es que, con 100 números, siempre hay alguno que lleva mucho tiempo sin aparecer, por pura casualidad. Ver un número atrasado es normal. Esperar que por eso salga, no.</p>
<p>En nuestras páginas verás la lista de "más atrasados" como un dato curioso, no como una pista.</p>` },
  { slug: 'por-que-el-azar-parece-tener-patrones', titulo: 'Por qué el azar parece tener patrones', resumen: 'Las rachas, las repeticiones y las escaleras de números son normales.', cuerpo: `<p>Si lanzas una moneda 20 veces, es muy común ver tramos de 4 o más caras seguidas. A simple vista parece una "racha", pero es lo que hace el azar de verdad.</p>
<p>Con la lotería pasa igual. Ver dos números seguidos como el 12 y el 13, un número que sale dos días seguidos o parejas de números gemelos no significa que haya un truco. Con cientos de resultados cada mes, esas cosas tienen que aparecer.</p>
<p>Nuestro cerebro está hecho para buscar patrones, y muchas veces los encuentra donde no los hay. Por eso es buena idea contrastar lo que "se ve" con lo que el azar esperaría, que es justo lo que hacemos en la página de <a href="${url('/jugadas/')}">Jugadas</a>.</p>` },
  { slug: 'por-que-unos-numeros-no-salen', titulo: 'Con 100 números, siempre hay unos que no salen', resumen: 'En 90 sorteos, lo normal es que unos 6 o 7 números no salgan ni una vez.', cuerpo: `<p>En cada sorteo salen tres números del 00 al 99. En 90 sorteos de una misma lotería, cada número "debería" salir unas 2.7 veces, pero eso es solo el promedio.</p>
<p>En la práctica, el azar reparte desigual. Haciendo la cuenta, lo normal es que unos 6 o 7 números de los 100 no salgan ni una sola vez en esos 90 sorteos, y que alrededor de 2 salgan 7 veces o más.</p>
<p>Por eso, cuando veas en el <a href="${url('/numeros/')}">mapa de números</a> uno en rojo y otro en azul, no es un misterio: es la forma normal en que se ve una lotería honesta. Con muchos más sorteos, las diferencias se van achicando en proporción.</p>` },
  { slug: 'numero-repetido-mismo-sorteo', titulo: '¿Por qué a veces un número sale dos veces en el mismo sorteo?', resumen: 'Pasa en cerca de 3 de cada 100 sorteos, y es normal.', cuerpo: `<p>Seguramente lo has visto: resultados como 34-96-34, donde un número aparece dos veces. ¿Es un error? No.</p>
<p>Cada uno de los tres números del sorteo sale de forma independiente, así que puede repetirse. Haciendo la cuenta, la probabilidad de que los tres sean distintos es 0.99 × 0.98, o sea 97%. Lo contrario, que se repita al menos uno, ocurre en casi 3 de cada 100 sorteos.</p>
<p>Con unos 20 sorteos al día, ver un número repetido dentro de un sorteo cada pocos días es lo esperado. En el <a href="${url('/resultados/')}">historial</a> puedes buscar ejemplos.</p>` },
  { slug: 'como-ponerte-un-limite', titulo: 'Cómo ponerte un límite antes de jugar', resumen: 'Decidir cuánto vas a gastar antes de empezar protege tu bolsillo.', cuerpo: `<p>La lotería es entretenimiento, y como cualquier entretenimiento tiene que tener un tope. Lo más útil es decidirlo antes de jugar, no mientras estás jugando.</p>
<ul><li>Define una cantidad que puedas perder sin que afecte la comida, el alquiler, las cuentas ni a tu familia.</li>
<li>Sepárala del resto del dinero desde el principio.</li>
<li>Cuando se acabe, se acabó. No la repongas y no pidas prestado para seguir.</li>
<li>No intentes recuperar lo perdido apostando más: es el camino más rápido a perder más.</li></ul>
<p>Si ganas, también ayuda decidir de antemano qué parte guardas. Y recuerda que es solo para mayores de 18 años.</p>` },
  { slug: 'cuanto-paga-contra-que-tan-probable', titulo: 'Lo que paga una jugada contra lo probable que es', resumen: 'Si una jugada paga menos de lo que su probabilidad pide, a la larga se pierde.', cuerpo: `<p>Hay una idea sencilla para entender cualquier juego de azar: comparar lo que paga con lo difícil que es ganar.</p>
<p>Un ejemplo con números inventados, solo para explicar: si una jugada tiene 1 chance entre 100 de ganar y pagara 50 veces lo apostado, por cada 100 pesos jugados recibirías en promedio 50. A la larga pierdes la mitad. Para que el juego fuera "justo", tendría que pagar 100 veces.</p>
<p>Por eso la banca y las loterías ganan con el tiempo: pagan menos de lo que la probabilidad pediría. Cuánto paga cada jugada en la vida real depende de la lotería y de la banca, así que pregunta antes de jugar.</p>
<p>No es para asustar a nadie: es para jugar sabiendo que el azar no regala, y que lo que se juega es diversión.</p>` },
  { slug: 'numero-popular-o-numero-raro', titulo: '¿Conviene más jugar un número popular o uno raro?', resumen: 'Depende del juego: en los que el premio se reparte, importa que no lo juegue mucha gente.', cuerpo: `<p>Si una jugada paga un monto fijo por cada peso apostado, no importa si el número es popular o raro: la probabilidad de que salga es la misma.</p>
<p>En cambio, en los juegos donde el premio se reparte entre todos los ganadores, sí hay una diferencia. Si sale una combinación que muchísima gente jugó, el premio se divide en más partes. Por eso, en esos juegos, elegir combinaciones poco comunes (no solo fechas de cumpleaños o números "bonitos") no te hace ganar más seguido, pero sí puede hacer que, si ganas, compartas menos.</p>
<p>Ninguna combinación tiene más chance que otra. Antes de jugar, confirma con tu banca cómo se paga cada juego.</p>` },
  { slug: 'senales-de-que-el-juego-se-te-va-de-las-manos', titulo: 'Señales de que el juego se te está yendo de las manos', resumen: 'Reconocerlas a tiempo ayuda a parar antes de que haga daño.', cuerpo: `<p>Jugar de vez en cuando por diversión es una cosa. Estas señales indican que ya es un problema:</p>
<ul><li>Juegas más dinero o más seguido de lo que habías pensado.</li>
<li>Pides prestado o dejas de pagar algo para poder jugar.</li>
<li>Intentas recuperar lo perdido jugando más.</li>
<li>Escondes a tu familia cuánto juegas o gastas.</li>
<li>Piensas en la lotería casi todo el día, o te pones de mal humor cuando no puedes jugar.</li></ul>
<p>Si te reconoces en alguna, no estás solo y tiene solución. Habla con alguien de confianza y, si puedes, con un profesional de salud mental. Dar el primer paso es lo más difícil, y también lo más importante.</p>` },
  { slug: 'como-leer-el-mapa-de-numeros', titulo: 'Cómo leer el mapa de números de cada lotería', resumen: 'Qué significan los colores, los números chiquitos y el "rango normal".', cuerpo: `<p>En la página de cada lotería verás un mapa con los 100 números del 00 al 99. Cada casilla muestra el número y, abajo, cuántas veces salió en los últimos sorteos.</p>
<p>El color va de azul (salió menos) a rojo (salió más). Pero ojo: el azar nunca reparte parejo, así que siempre habrá azules y rojos. Para eso incluimos el <strong>rango normal</strong>, que marca hasta dónde llega la variación esperada solo por casualidad.</p>
<p>Solo si un número se sale mucho de ese rango vale la pena fijarse, y aun así, con 100 números, unos 5 se salen por pura casualidad. El mapa es para informarte, no para predecir.</p>
<p>Puedes ver el mapa de todas las loterías juntas en la página de <a href="${url('/numeros/')}">Números</a>.</p>` },
  { slug: 'guarda-tu-recibo', titulo: 'Guarda tu recibo y verifica el resultado oficial', resumen: 'Dos hábitos sencillos que te evitan problemas.', cuerpo: `<p>Cuando juegas en una banca, el recibo es tu comprobante. Guárdalo hasta que salga el resultado, y revisa que tenga bien el número, la lotería y el sorteo.</p>
<p>Al verificar si ganaste, usa el resultado oficial de la lotería. Nosotros publicamos los resultados tal como los dan las fuentes, pero pueden tener errores o retrasos, y el que vale es el oficial.</p>
<p>Si tienes dudas sobre un premio o un reclamo, se resuelven con la banca o con la propia lotería. Este sitio no puede ayudar con cobros ni reclamos. Y nunca des tu recibo ni tus datos a personas que te escriban ofreciéndote "ayuda" para cobrar.</p>` },
  { slug: 'suenos-y-numeros-tradicion', titulo: 'Los sueños y los números: una tradición popular', resumen: 'Una costumbre muy viva en la cultura dominicana, aunque no predice nada.', cuerpo: `<p>En la cultura popular dominicana, los sueños y los números de la lotería están muy ligados. Mucha gente despierta, recuerda lo que soñó y lo traduce a un número para jugar. Es una costumbre que se pasa de familia en familia.</p>
<p>Es una tradición bonita y parte de la vida cotidiana, pero no hay ninguna evidencia de que los sueños predigan lo que va a salir. Cada sorteo es independiente de lo que se sueñe, se piense o se desee.</p>
<p>Si disfrutas de la tradición, tómala como lo que es: parte del entretenimiento, y juega solo lo que puedas perder. Por ahora no publicamos listas de "significados", porque no tenemos una fuente confiable para ellas.</p>` },
  { slug: 'que-son-los-numeros-del-dia', titulo: 'Qué son los "números del día" y por qué no son una predicción', resumen: 'Cómo se calculan y cuánto aciertan comparados con el azar.', cuerpo: `<p>En la página de <a href="${url('/jugadas/')}">Jugadas</a> mostramos 5 "números del día". Salen de un cálculo simple: damos más peso a los números que salieron como primer premio en los últimos 30 días, y menos a los de segundo y tercer premio.</p>
<p>Eso describe lo que ya pasó, no lo que va a pasar. Para que se vea con honestidad, publicamos un marcador: cuántos de esos 5 números salieron cada día en alguna lotería, comparado con lo que el azar esperaba.</p>
<p>Como hay unas 20 loterías al día, casi cualquier número aparece en alguna la mitad de los días solo por casualidad. Por eso nos importa más comparar contra el azar que contar aciertos sueltos.</p>
<p>El marcador está ahí para que juzgues tú: si algún día supera al azar de forma clara y sostenida, lo verás. Mientras tanto, es entretenimiento.</p>` },
];

function lecturaDeHoy() {
  const dia = Math.floor(Date.parse(fechaRD() + 'T00:00:00Z') / 86400000);
  return LECTURAS[((dia % LECTURAS.length) + LECTURAS.length) % LECTURAS.length];
}

function datoDelDia(dias) {
  const hoy = fechaRD();
  const d = [...dias].reverse().find(x => x.fecha < hoy && Object.keys(x.quinielas).length >= 8);
  if (!d) return '';
  const cont = {};
  let dup = null;
  for (const [k, nums] of Object.entries(d.quinielas)) {
    for (const n of new Set(nums)) (cont[n] = cont[n] || []).push(k);
    if (!dup && new Set(nums).size < nums.length) dup = { k, n: nums.find((x, i) => nums.indexOf(x) !== i) };
  }
  const max = Math.max(...Object.values(cont).map(a => a.length));
  const tops = Object.entries(cont).filter(([, a]) => a.length === max).map(([n]) => f2(n));
  const L = Object.keys(d.quinielas).length;
  const rep = max >= 2 ? `El número que más se repitió entre loterías fue el ${tops.slice(0, 3).join(', ')}, en ${max} loterías.` : 'Ningún número se repitió entre loterías.';
  const dupTxt = dup ? ` En ${esc(nombreLoteria(dup.k))} el ${f2(dup.n)} salió dos veces en el mismo sorteo.` : '';
  return `<strong>📊 Dato del día.</strong> Ayer (${esc(fechaLarga(d.fecha))}) se registraron ${L} sorteos. ${rep}${dupTxt} <span class="leyenda">Es solo un dato, no una señal.</span>`;
}

function tarjetaLectura(dias) {
  const l = lecturaDeHoy();
  const dato = datoDelDia(dias);
  return `<h2>📖 Lectura del día</h2>
<div class="tarjeta lectura"><h3><a href="${url(`/lectura/${l.slug}/`)}">${esc(l.titulo)}</a></h3><p class="hora">${esc(l.resumen)}</p><p><a href="${url(`/lectura/${l.slug}/`)}">Leer →</a> · <a href="${url('/lectura/')}">Ver todas las lecturas</a></p></div>
${dato ? `<p class="dato">${dato}</p>` : ''}`;
}

function paginaLecturas() {
  const hoy = lecturaDeHoy();
  const cuerpo = `<section class="hero"><h1>Lecturas cortas sobre la lotería</h1>
<p class="sub">Temas breves y claros sobre el azar, las probabilidades y el juego responsable. La de hoy aparece primero.</p></section>
<div class="rejilla">${[hoy, ...LECTURAS.filter(x => x !== hoy)].map(l => `<a class="tarjeta" href="${url(`/lectura/${l.slug}/`)}"><h3>${esc(l.titulo)}</h3><p class="hora">${esc(l.resumen)}</p></a>`).join('')}</div>
${avisoHonesto()}`;
  return pagina({ ruta: '/lectura/', titulo: `Lecturas cortas sobre la lotería, el azar y el juego responsable | ${NOMBRE_SITIO}`, descripcion: 'Lecturas breves sobre la lotería dominicana: cómo funciona el azar, probabilidades, mitos comunes y juego responsable.', cuerpo });
}

function paginaLectura(l, i) {
  const ant = LECTURAS[(i - 1 + LECTURAS.length) % LECTURAS.length], sig = LECTURAS[(i + 1) % LECTURAS.length];
  const cuerpo = `<p class="migas"><a href="${url('/lectura/')}">Lecturas</a> › ${esc(l.titulo)}</p>
<h1>${esc(l.titulo)}</h1>
${l.cuerpo}
<p class="leyenda">Solo informativo. Mayores de 18 años. Juega con responsabilidad y solo lo que puedas perder.</p>
<p>← <a href="${url(`/lectura/${ant.slug}/`)}">${esc(ant.titulo)}</a><br>→ <a href="${url(`/lectura/${sig.slug}/`)}">${esc(sig.titulo)}</a></p>`;
  return pagina({ ruta: `/lectura/${l.slug}/`, titulo: `${l.titulo} | ${NOMBRE_SITIO}`, descripcion: l.resumen, cuerpo });
}

// ── Principal ───────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  const filas = DEMO ? datosDemo() : await leerSupabase();
  const { dias, series } = preparar(filas);
  if (!dias.length) throw new Error('No hay días con resultados válidos en historico.');

  fs.rmSync(SALIDA, { recursive: true, force: true });
  fs.mkdirSync(SALIDA, { recursive: true });
  const rutas = [];
  const guardar = (ruta, html) => { escribir(path.join(ruta, 'index.html'), html); rutas.push(ruta); };

  escribir('estilos.css', CSS.trim());
  escribir('.nojekyll', '');
  guardar('/', paginaInicio(dias, series));
  guardar('/loterias/', paginaLoterias(series));
  for (const l of LOTERIAS) if (series[l.clave].length) guardar(`/loterias/${l.slug}/`, paginaLoteria(l, series[l.clave]));
  guardar('/jugadas/', paginaJugadas(dias, series));
  guardar('/numeros/', paginaNumeros(series));
  for (let n = 0; n < 100; n++) guardar(`/numeros/${f2(n)}/`, paginaNumero(n, series));
  guardar('/resultados/', paginaHistorial(dias));
  dias.forEach((d, i) => guardar(`/resultados/${d.fecha}/`, paginaFecha(d, dias[i - 1]?.fecha, dias[i + 1]?.fecha)));
  guardar('/como-funciona/', paginaComoFunciona());
  guardar('/privacidad/', paginaPrivacidad());
  guardar('/sobre-nosotros/', paginaSobre());
  guardar('/contacto/', paginaContacto());
  guardar('/terminos/', paginaTerminos());
  guardar('/guias/', paginaGuias());
  guardar('/lectura/', paginaLecturas());
  LECTURAS.forEach((l, i) => guardar(`/lectura/${l.slug}/`, paginaLectura(l, i)));
  guardar('/guias/como-jugar-quiniela-pale-tripleta/', paginaGuiaJugar());
  guardar('/guias/horarios-loterias-dominicanas/', paginaGuiaHorarios());
  guardar('/guias/loteria-nacional/', paginaGuiaNacional(series));
  guardar('/guias/anguila/', paginaGuiaAnguila(series));
  guardar('/guias/preguntas-frecuentes/', paginaGuiaFAQ());

  escribir('404.html', pagina({ ruta: '/404.html', titulo: `Página no encontrada | ${NOMBRE_SITIO}`, descripcion: 'Página no encontrada.', indexar: false, cuerpo: `<h1>Esa página no existe</h1><p><a href="${url('/')}">Ver los resultados de hoy</a></p>` }));
  const hoy = fechaRD();
  escribir('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rutas.map(r => `<url><loc>${SITE_URL}${r}</loc><lastmod>${/\/resultados\/\d{4}/.test(r) ? r.slice(12, 22) : hoy}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  escribir('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  if (ADSENSE_CLIENT) escribir('ads.txt', `google.com, ${ADSENSE_CLIENT.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);

  console.log(`✅ ${rutas.length} páginas en ${SALIDA} · ${dias.length} días (${dias[0].fecha} → ${dias[dias.length - 1].fecha}) · ${((Date.now() - t0) / 1000).toFixed(1)}s${DEMO ? ' · MODO DEMO' : ''}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
