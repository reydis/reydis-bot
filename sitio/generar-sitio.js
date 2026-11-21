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
.bola.ya{border-color:var(--bien);color:#03150e;background:radial-gradient(circle at 32% 28%,#6ee7b7,#059669);box-shadow:0 0 14px rgba(52,211,153,.4)} .celebra{display:flex;gap:12px;align-items:center;background:linear-gradient(180deg,rgba(5,150,105,.22),rgba(5,150,105,.08));border:1px solid var(--bien);border-radius:var(--r);padding:14px 16px;margin:18px 0}.celebra .fiesta{font-size:1.8rem;animation:salto 1.6s ease-in-out infinite}@keyframes salto{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}.radar-cta .bola.ya{animation:brilla 2s ease-in-out infinite}@keyframes brilla{0%,100%{box-shadow:0 0 14px rgba(52,211,153,.4)}50%{box-shadow:0 0 26px rgba(52,211,153,.9)}}
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
<meta name="google-site-verification" content="6MC7HwNcVNURJxS10NwuWc8ULNkpL6qQSwQKE6moCt8" /><link rel="stylesheet" href="${url('/estilos.css')}">${ads}<script data-goatcounter="https://reydisradar.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
</head><body>
<header class="cab"><div class="in"><a class="logo" href="${url('/')}">Reydis <span>Radar</span></a>
<nav class="menu"><a href="${url('/')}">Hoy</a><a href="${url('/jugadas/')}">Jugadas</a><a href="${url('/loterias/')}">Loterías</a><a href="${url('/numeros/')}">Números</a><a href="${url('/resultados/')}">Historial</a><a href="${url('/guias/')}">Guías</a><a href="${url('/como-funciona/')}">Cómo funciona</a></nav></div></header>
<main>${cuerpo}</main>
<footer><div class="in"><p><strong>${NOMBRE_SITIO}</strong> · Resultados y estadísticas reales de las loterías dominicanas. Vende claridad, no esperanza.</p>
<p>Los resultados se publican tal como los dan las fuentes; ante cualquier duda, el resultado oficial es el de cada lotería. Las estadísticas describen el pasado y <strong>no predicen</strong> el próximo sorteo. Juega con responsabilidad y solo lo que puedas perder. Solo mayores de 18 años.</p>
<p><a href="${url('/guias/')}">Guías</a> · <a href="${url('/lectura/')}">Lecturas</a> · <a href="${url('/como-funciona/')}">Cómo funciona</a> · <a href="${url('/sobre-nosotros/')}">Sobre nosotros</a> · <a href="${url('/contacto/')}">Contacto</a> · <a href="${url('/terminos/')}">Términos</a> · <a href="${url('/privacidad/')}">Privacidad</a> · Actualizado: ${esc(fechaCorta(fechaRD()))}, ${esc(horaRD())} (hora RD)</p></div></footer>
</body></html>`;
}

const ctaTelegram = () => `<div class="cta"><strong>📲 Resultados por Telegram.</strong> Únete a nuestro canal gratis y recibe los resultados apenas salen. Solo información, sin predicciones. <a href="https://t.me/reydis_resultados" target="_blank" rel="noopener">Unirme al canal</a></div>`;
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
// 🎲 Palés: todas las parejas entre los 5 números del día (10 parejas). Un palé sale si los dos números caen en el mismo sorteo.
const PARES_PROB = 3 / 4950; // en un sorteo salen 3 números = 3 parejas posibles de las 4,950 que existen
const paresDe = a => { const o = []; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) o.push([a[i], a[j]]); return o; };
const parSalio = (par, quin) => Object.entries(quin).filter(([, nums]) => nums.includes(par[0]) && nums.includes(par[1])).map(([k]) => nombreLoteria(k));

function calcularRadar(dias) {
  const hoy = fechaRD();
  const idxHoy = dias.findIndex(d => d.fecha === hoy);
  const fin = idxHoy >= 0 ? idxHoy : dias.length; // el marcador solo usa días ya terminados
  const diaHoy = idxHoy >= 0 ? dias[idxHoy] : null;
  const hoyNums = fin >= 10 ? topN(puntajes(dias, fin)) : [];
  const yaSalio = n => diaHoy ? Object.entries(diaHoy.quinielas).filter(([, nums]) => nums.includes(n)).map(([k]) => nombreLoteria(k)) : [];
  const picks = hoyNums.map(n => ({ n, yaSalio: yaSalio(n) }));
  const pales = paresDe(hoyNums).map(p => ({ p, salio: diaHoy ? parSalio(p, diaHoy.quinielas) : [] }));
  const detalle = [];
  let sumHits = 0, sumEsp = 0, palesHits = 0, palesEsp = 0;
  for (let i = Math.max(10, fin - DIAS_MARCADOR); i < fin; i++) {
    const L = Object.keys(dias[i].quinielas).length;
    if (L < 8) continue; // día incompleto
    const top = topN(puntajes(dias, i));
    const salidos = new Set(Object.values(dias[i].quinielas).flat());
    const hits = top.filter(n => salidos.has(n));
    const esp = K_RADAR * (1 - Math.pow(1 - PL, L));
    sumHits += hits.length; sumEsp += esp;
    const prs = paresDe(top); palesHits += prs.filter(p => parSalio(p, dias[i].quinielas).length).length; palesEsp += prs.length * (1 - Math.pow(1 - PARES_PROB, L));
    detalle.push({ fecha: dias[i].fecha, top, hits, esp });
  }
  return { hoy: picks, pales, palesHits, palesEsp, dias: detalle.length, sumHits, sumEsp, detalle };
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

const palTxtLista = (pales, grande) => pales.map(x => { const t = f2(x.p[0]) + '-' + f2(x.p[1]); return x.salio.length ? `<strong style="color:#34d399;white-space:nowrap">${t} ✅</strong>` : `<strong style="white-space:nowrap">${t}</strong>`; }).join(', ');
function teaserRadar(dias) {
  const r = calcularRadar(dias);
  if (!r.hoy.length) return '';
  const acert = r.pales.filter(x => x.salio.length);
  const acertTxt = acert.length ? acert.map(x => `<strong>${f2(x.p[0])}-${f2(x.p[1])}</strong> en ${x.salio.map(esc).join(', ')}`).join(' · ') : 'ninguno todavía';
  const palesHtml = r.pales.length ? `<div style="flex-basis:100%"><strong>🎲 Palés del día</strong><div style="font-size:1.05rem;line-height:1.9">${palTxtLista(r.pales)}</div><small class="leyenda">Palés acertados hoy: ${acertTxt}</small></div>` : '';
  return `<div class="radar-cta"><strong>🎯 Números del día</strong><span class="bolas">${r.hoy.map(x => bola(f2(x.n), x.yaSalio.length ? ' ya' : '')).join('')}</span><a href="${url('/jugadas/')}">Ver jugadas y marcador →</a>${palesHtml}</div>`;
}
// 🎉 Celebración: avisa cuando alguno de los números del día ya salió hoy (sin prometer nada)
function bannerCelebra(r) {
  const salidos = r.hoy.filter(x => x.yaSalio.length);
  if (!salidos.length) return '';
  const titulo = salidos.length === 1 ? 'Ya salió 1 de los 5 números del día' : `Ya salieron ${salidos.length} de los 5 números del día`;
  const lista = salidos.map(x => `<strong>${f2(x.n)}</strong> en ${x.yaSalio.map(esc).join(' y ')}`).join(' · ');
  const pal = r.pales.filter(x => x.salio.length);
  const palTxt = pal.length ? `<br>🎲 <strong>¡${pal.length === 1 ? 'Palé acertado' : 'Palés acertados'}!</strong> ${pal.map(x => `<strong>${f2(x.p[0])}-${f2(x.p[1])}</strong> en ${x.salio.map(esc).join(', ')}`).join(' · ')}` : '';
  return `<div class="celebra"><span class="fiesta">🎉</span><div><strong>¡${titulo}!</strong><br>${lista}${palTxt}<br><small class="leyenda">Con unas 20 loterías al día, cada número sale casi la mitad de los días solo por azar. Es información, no una promesa.</small></div></div>`;
}
function teaserCelebra(dias) { return bannerCelebra(calcularRadar(dias)) + teaserRadar(dias); }
// 📊 Página privada (sin enlace, noindex): ¿dónde y a qué hora salen más los 5 números del Radar? Siempre contra lo que esperaba el azar.
function minLoteria(hora) {
  const m = /(\d{1,2}):(\d{2})\s*([AP]M)/i.exec(hora); if (!m) return 0;
  let h = parseInt(m[1], 10) % 12; if (m[3].toUpperCase() === 'PM') h += 12;
  return h * 60 + parseInt(m[2], 10);
}
const FRANJAS = [
  ['Mañana (antes de las 12:00 PM)', 0, 720], ['Mediodía (12:00 – 1:59 PM)', 720, 840], ['Tarde (2:00 – 5:59 PM)', 840, 1080],
  ['Noche temprana (6:00 – 8:59 PM)', 1080, 1260], ['Noche (9:00 PM en adelante)', 1260, 1441],
];
function calcularAciertosPorLoteria(dias) {
  const hoy = fechaRD();
  const fin = dias.findIndex(d => d.fecha === hoy) >= 0 ? dias.findIndex(d => d.fecha === hoy) : dias.length;
  const acc = {}; for (const l of LOTERIAS) acc[l.clave] = { l, sorteos: 0, hits: 0, esp: 0, pHits: 0, pEsp: 0 };
  let ndias = 0; const detalle = []; const regs = [];
  for (let i = 10; i < fin; i++) {
    if (Object.keys(dias[i].quinielas).length < 8) continue; // día incompleto
    ndias++;
    const top = topN(puntajes(dias, i)), prs = paresDe(top);
    detalle.push({ fecha: dias[i].fecha, top, donde: top.map(n => Object.entries(dias[i].quinielas).filter(([, nums]) => nums.includes(n)).map(([k]) => LOTERIAS.find(l => l.clave === k)).filter(Boolean).sort((a, b) => minLoteria(a.hora) - minLoteria(b.hora))) });
    for (const [k, nums] of Object.entries(dias[i].quinielas)) {
      const a = acc[k]; if (!a) continue;
      regs.push({ k, n: ndias, hits: top.filter(n => nums.includes(n)).length });
      a.sorteos++; a.hits += top.filter(n => nums.includes(n)).length; a.esp += K_RADAR * PL;
      a.pHits += prs.filter(p => nums.includes(p[0]) && nums.includes(p[1])).length; a.pEsp += prs.length * PARES_PROB;
    }
  }
  return { ndias, detalle, regs, filas: Object.values(acc).filter(a => a.sorteos > 0) };
}
// 🔁 Prueba de consistencia: ¿lo que se ve en la primera mitad de los días se repite en la segunda?
function consistenciaAciertos(ndias, regs, filas) {
  const mid = Math.floor(ndias / 2);
  const acc = {};
  for (const r of regs) {
    const a = acc[r.k] || (acc[r.k] = { s1: 0, h1: 0, s2: 0, h2: 0 });
    if (r.n <= mid) { a.s1++; a.h1 += r.hits; } else { a.s2++; a.h2 += r.hits; }
  }
  const zz = (o, sorteos) => { const e = sorteos * K_RADAR * PL; return e > 0 ? (o - e) / Math.sqrt(e * (1 - PL)) : 0; };
  const lista = filas.map(f => { const a = acc[f.l.clave]; if (!a) return null; return { l: f.l, z1: zz(a.h1, a.s1), z2: zz(a.h2, a.s2), e1: a.s1 * K_RADAR * PL, e2: a.s2 * K_RADAR * PL, h1: a.h1, h2: a.h2 }; }).filter(Boolean);
  const n = lista.length;
  let corr = null;
  if (n > 2) {
    const mx = lista.reduce((t, x) => t + x.z1, 0) / n, my = lista.reduce((t, x) => t + x.z2, 0) / n;
    let sxy = 0, sxx = 0, syy = 0; for (const x of lista) { sxy += (x.z1 - mx) * (x.z2 - my); sxx += (x.z1 - mx) ** 2; syy += (x.z2 - my) ** 2; }
    corr = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  }
  const repiten = lista.filter(x => x.z1 >= 1 && x.z2 >= 1).length;
  const esperadas = lista.length * 0.1587 * 0.1587; // si todo fuera azar: P(z>=1)^2 por lotería
  return { mid, lista, corr, repiten, esperadas, n };
}
function paginaAciertos(dias) {
  const { ndias, filas, detalle, regs } = calcularAciertosPorLoteria(dias);
  const cons = consistenciaAciertos(ndias, regs, filas);
  const z = (o, e) => e > 0 ? (o - e) / Math.sqrt(e * (1 - PL)) : 0;
  const fila = (nombre, hora, a) => `<tr><td>${esc(nombre)}</td><td>${esc(hora)}</td><td>${a.sorteos}</td><td><strong>${a.hits}</strong></td><td>${a.esp.toFixed(1)}</td><td>${a.esp ? (a.hits / a.esp).toFixed(2) : '–'}×</td><td>${z(a.hits, a.esp).toFixed(1)}</td><td>${a.pHits}</td><td>${a.pEsp.toFixed(1)}</td></tr>`;
  const porLot = [...filas].sort((x, y) => z(y.hits, y.esp) - z(x.hits, x.esp)).map(a => fila(a.l.nombre, a.l.hora, a)).join('');
  const franjas = FRANJAS.map(([nombre, d, h]) => {
    const g = filas.filter(a => { const m = minLoteria(a.l.hora); return m >= d && m < h; });
    if (!g.length) return '';
    const t = g.reduce((s, a) => ({ sorteos: s.sorteos + a.sorteos, hits: s.hits + a.hits, esp: s.esp + a.esp, pHits: s.pHits + a.pHits, pEsp: s.pEsp + a.pEsp }), { sorteos: 0, hits: 0, esp: 0, pHits: 0, pEsp: 0 });
    return fila(nombre, `${g.length} loterías`, t);
  }).join('');
  const filasDia = [...detalle].reverse().slice(0, 30).map(d => `<tr><td>${esc(fechaMini(d.fecha))}</td><td>${d.top.map((n, j) => d.donde[j].length ? `<div><span class="bolas">${bola(f2(n), ' ya')}</span> ${d.donde[j].map(l => `${esc(l.nombre)}${l.nombre.includes(l.hora) ? '' : ` <small class="leyenda">(${esc(l.hora)})</small>`}`).join(' · ')}</div>` : `<div><span class="bolas">${bola(f2(n))}</span> <small class="leyenda">no salió</small></div>`).join('')}</td></tr>`).join('');
  const cab = '<tr><th>Lotería / franja</th><th>Hora</th><th>Sorteos</th><th>Números que salieron</th><th>Azar esperaba</th><th>Veces el azar</th><th>z</th><th>Palés salidos</th><th>Palés azar</th></tr>';
  const cuerpo = `<section class="hero"><h1>¿Dónde salen más los números del Radar?</h1>
<p class="sub">Página privada de trabajo. Usa los ${ndias} días completos con historial (cada día calculado solo con los días anteriores, igual que el marcador).</p></section>
<h2>Día por día: dónde y a qué hora salió cada número</h2>
<div class="tabla"><table><tr><th>Día</th><th>Número → lotería (hora)</th></tr>${filasDia}</table></div>
<h2>Por franja de horario</h2>
<div class="tabla"><table>${cab}${franjas}</table></div>
<h2>Por lotería (de más a menos sobre el azar)</h2>
<div class="tabla"><table>${cab}${porLot}</table></div>
<h2>Prueba de consistencia: ¿se repite en la segunda mitad?</h2>
<p class="sub">Dividimos los ${ndias} días en dos mitades (${cons.mid} y ${ndias - cons.mid}) y miramos cada lotería por separado. Si el Radar tuviera una ventaja real en alguna lotería, debería verse en las dos mitades. Si solo aparece en una, fue casualidad.</p>
<div class="tabla"><table><tr><th>Lotería</th><th>Aciertos 1.ª mitad</th><th>z 1.ª</th><th>Aciertos 2.ª mitad</th><th>z 2.ª</th><th>¿Se repite?</th></tr>${[...cons.lista].sort((x, y) => (Math.min(y.z1, y.z2)) - (Math.min(x.z1, x.z2))).map(x => `<tr><td>${esc(x.l.nombre)}</td><td>${x.h1} <small class="leyenda">(azar ${x.e1.toFixed(1)})</small></td><td>${x.z1.toFixed(1)}</td><td>${x.h2} <small class="leyenda">(azar ${x.e2.toFixed(1)})</small></td><td>${x.z2.toFixed(1)}</td><td>${x.z1 >= 1 && x.z2 >= 1 ? '<strong>sí (en ambas arriba del azar)</strong>' : 'no'}</td></tr>`).join('')}</table></div>
<p class="leyenda"><strong>Veredicto de la prueba:</strong> ${cons.repiten} lotería(s) quedaron arriba del azar en las dos mitades; por pura casualidad se esperaban unas ${cons.esperadas.toFixed(1)}. Correlación entre mitades: ${cons.corr === null ? 'sin datos suficientes' : cons.corr.toFixed(2)} (cerca de 0 = lo que se ve en una mitad no predice la otra; una ventaja real daría un valor claramente positivo).</p>
<p class="leyenda"><strong>Cómo leerlo:</strong> "Números que salieron" cuenta cada vez que uno de los 5 números del día cayó en ese sorteo. "Azar esperaba" es lo que habría salido sin ninguna ventaja (5 números × 3 de 100 por sorteo). "z" mide cuántas desviaciones se alejó del azar: con 20 loterías mirándolas a la vez, es normal que alguna llegue a +2 solo por casualidad, y solo algo muy por encima y sostenido merece atención. Los palés son casi todos 0 o 1 por lotería, así que no dicen nada todavía.</p>`;
  return pagina({ ruta: '/aciertos/', titulo: `Aciertos del Radar por lotería y horario | ${NOMBRE_SITIO}`, descripcion: 'Página privada de análisis.', indexar: false, cuerpo });
}

// 🔬 Página privada (sin enlace, noindex): ¿alguna lotería tiene un sesgo real? Prueba chi-cuadrado por lotería, corrigiendo por mirar muchas a la vez.
function lgamma(z) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = z, t = z + 5.5; t -= (z + 0.5) * Math.log(t);
  let ser = 1.000000000190015; for (const cj of c) ser += cj / ++y;
  return -t + Math.log(2.5066282746310005 * ser / z);
}
function gammaQ(a, x) { // gamma incompleta regularizada superior Q(a, x)
  if (x <= 0) return 1;
  const gln = lgamma(a);
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-12) break; }
    return Math.min(1, Math.max(0, 1 - sum * Math.exp(-x + a * Math.log(x) - gln)));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-12) break;
  }
  return Math.min(1, Math.max(0, Math.exp(-x + a * Math.log(x) - gln) * h));
}
const pChi = (chi, df) => gammaQ(df / 2, chi / 2);
function chiCuadrado(conteos, esperado) { return conteos.reduce((s, c) => s + (c - esperado) * (c - esperado) / esperado, 0); }
function calcularSesgos(dias) {
  const filas = [];
  for (const l of LOTERIAS) {
    const sorteos = dias.map(d => d.quinielas[l.clave]).filter(x => Array.isArray(x) && x.length === 3);
    if (sorteos.length < 60) continue;
    const total = sorteos.length * 3;
    const c100 = Array(100).fill(0), cDec = Array(10).fill(0), cUni = Array(10).fill(0);
    for (const nums of sorteos) for (const n of nums) { c100[n]++; cDec[Math.floor(n / 10)]++; cUni[n % 10]++; }
    const e100 = total / 100;
    let mejor = { n: 0, p: 1, c: 0 };
    c100.forEach((c, n) => { // cola exacta de Poisson (más fiable que z cuando se esperan pocas salidas), de dos lados
      const cola = c >= e100 ? 1 - gammaQ(c, e100) : gammaQ(c + 1, e100);
      const pn = Math.min(1, 2 * cola); if (pn < mejor.p) mejor = { n, p: pn, c };
    });
    filas.push({ l, sorteos: sorteos.length, p100: pChi(chiCuadrado(c100, e100), 99), pDec: pChi(chiCuadrado(cDec, total / 10), 9), pUni: pChi(chiCuadrado(cUni, total / 10), 9), mejor, e100 });
  }
  return filas;
}
// 💵 Cartera virtual: las hipótesis se escogen con los sorteos ANTERIORES a esta fecha y se prueban solo con los que salgan desde ella.
const SEGUIMIENTO_DESDE = process.env.SEGUIMIENTO_DESDE || '2026-11-22';
const BANCA_VIRTUAL = 1000;          // pesos virtuales para estas pruebas
const PAGOS_QUINIELA = [60, 8, 4];   // pago por peso: 1.er, 2.º y 3.er premio (ajustable según la banca)
const SEGUIMIENTO_LOTERIAS = ['florida_d', 'new_york_n'];
function hipotesisDe(clave, pre) {
  const total = pre.length * 3, c100 = Array(100).fill(0), cDec = Array(10).fill(0), cUni = Array(10).fill(0);
  for (const nums of pre) for (const n of nums) { c100[n]++; cDec[Math.floor(n / 10)]++; cUni[n % 10]++; }
  const mejor = (arr, e) => arr.reduce((b, c, i) => (c - e) / Math.sqrt(e) > b.z ? { i, c, z: (c - e) / Math.sqrt(e) } : b, { i: 0, c: arr[0], z: -Infinity });
  const n = mejor(c100, total / 100), d = mejor(cDec, total / 10), u = mejor(cUni, total / 10);
  return [
    { clave, tipo: 'número', etiqueta: `el ${f2(n.i)}`, nums: [n.i], antes: `${n.c} veces, esperaba ${(total / 100).toFixed(1)}` },
    { clave, tipo: 'decena', etiqueta: `la decena ${d.i}0–${d.i}9`, nums: Array.from({ length: 10 }, (_, k) => d.i * 10 + k), antes: `${d.c} veces, esperaba ${(total / 10).toFixed(1)}` },
    { clave, tipo: 'unidad', etiqueta: `terminados en ${u.i}`, nums: Array.from({ length: 10 }, (_, k) => k * 10 + u.i), antes: `${u.c} veces, esperaba ${(total / 10).toFixed(1)}` },
  ];
}
function seguimientoVirtual(dias) {
  const filas = [];
  for (const clave of SEGUIMIENTO_LOTERIAS) {
    const l = LOTERIAS.find(x => x.clave === clave); if (!l) continue;
    const quin = f => dias.filter(d => f(d.fecha)).map(d => d.quinielas[clave]).filter(x => Array.isArray(x) && x.length === 3);
    const pre = quin(f => f < SEGUIMIENTO_DESDE), post = quin(f => f >= SEGUIMIENTO_DESDE);
    if (pre.length < 60) continue;
    for (const h of hipotesisDe(clave, pre)) {
      let gastado = 0, ganado = 0, aciertos = 0;
      for (const nums of post) {
        gastado += 1;
        for (const n of h.nums) { const pos = nums.indexOf(n); if (pos >= 0) { ganado += (1 / h.nums.length) * PAGOS_QUINIELA[pos]; aciertos++; } }
      }
      filas.push({ ...h, lot: l.nombre, sorteos: post.length, gastado, ganado, aciertos, esperados: post.length * 3 * h.nums.length / 100 });
    }
  }
  return filas;
}

function paginaSesgos(dias) {
  const filas = calcularSesgos(dias);
  const pruebas = filas.length * 3, alfa = pruebas ? 0.05 / pruebas : 0.05, alfaNum = filas.length ? 0.05 / (filas.length * 100) : 0.05;
  const todos = filas.flatMap(f => [f.p100, f.pDec, f.pUni]);
  const bajo05 = todos.filter(p => p < 0.05).length, fuertes = todos.filter(p => p < alfa).length;
  const marca = p => `${p < alfa ? '🚨 ' : p < 0.01 ? '👀 ' : ''}${p < 0.001 ? p.toExponential(1) : p.toFixed(3)}`;
  const orden = [...filas].sort((a, b) => Math.min(a.p100, a.pDec, a.pUni, a.mejor.p * 100) - Math.min(b.p100, b.pDec, b.pUni, b.mejor.p * 100));
  const tabla = orden.map(f => `<tr><td>${esc(f.l.nombre)}</td><td>${f.sorteos}</td><td>${marca(f.p100)}</td><td>${marca(f.pDec)}</td><td>${marca(f.pUni)}</td><td>${f2(f.mejor.n)} <small class="leyenda">(${f.mejor.c} veces, esperaba ${f.e100.toFixed(1)}; p ${f.mejor.p < 0.001 ? f.mejor.p.toExponential(1) : f.mejor.p.toFixed(3)}${f.mejor.p < alfaNum ? ' 🚨' : ''})</small></td></tr>`).join('');
  const hayFuerte = fuertes > 0 || filas.some(f => f.mejor.p < alfaNum);
  const veredicto = !filas.length ? 'Todavía no hay datos suficientes.'
    : hayFuerte ? '<strong>Hay al menos una señal que pasa la regla estricta.</strong> Antes de creerla, hay que confirmarla con datos nuevos que no se hayan usado aquí.'
    : `Ninguna lotería pasa la regla estricta. De ${pruebas} pruebas, ${bajo05} dieron p menor a 0.05; por puro azar se esperaban unas ${(pruebas * 0.05).toFixed(1)}. <strong>No hay evidencia de sesgo en ninguna lotería.</strong>`;
  const seg = seguimientoVirtual(dias);
  const gastoT = seg.reduce((a, f) => a + f.gastado, 0), ganT = seg.reduce((a, f) => a + f.ganado, 0), saldo = BANCA_VIRTUAL - gastoT + ganT;
  const pesos = x => 'RD$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const filasSeg = seg.map(f => `<tr><td>${esc(f.lot)}</td><td>${esc(f.tipo)}: ${esc(f.etiqueta)}<br><small class="leyenda">hasta el ${esc(fechaMini(SEGUIMIENTO_DESDE))}: ${esc(f.antes)}</small></td><td>${f.sorteos}</td><td>${f.aciertos} <small class="leyenda">(azar ${f.esperados.toFixed(1)})</small></td><td>${pesos(f.gastado)}</td><td>${pesos(f.ganado)}</td><td>${pesos(f.ganado - f.gastado)}</td></tr>`).join('');
  const seguimiento = seg.length ? `<h2>💵 Cartera virtual de ${pesos(BANCA_VIRTUAL)}</h2>
<p>Las hipótesis (el número, la decena y el dígito final más desviados de Florida Día y New York Noche) se escogieron con los sorteos <strong>anteriores al ${esc(fechaMini(SEGUIMIENTO_DESDE))}</strong>. Desde esa fecha el sistema "juega" cada una en papel: RD$1 por sorteo por hipótesis (repartido en partes iguales entre sus números) y paga ${PAGOS_QUINIELA.join(' / ')} por peso a 1.er, 2.º y 3.er premio. Solo cuentan sorteos que no se usaron para escogerlas.</p>
<p><strong>Saldo virtual: ${pesos(saldo)}</strong> de ${pesos(BANCA_VIRTUAL)} (gastado ${pesos(gastoT)}, ganado ${pesos(ganT)}).${gastoT ? ` Devolvió ${(100 * ganT / gastoT).toFixed(0)}% de lo gastado; sin ninguna ventaja, la quiniela devuelve en promedio ${PAGOS_QUINIELA.reduce((a, b) => a + b, 0)}%.` : ' Todavía no hay sorteos desde esa fecha: empieza a llenarse con el primero.'}</p>
<div class="tabla"><table><tr><th>Lotería</th><th>Hipótesis</th><th>Sorteos</th><th>Aciertos</th><th>Gastado</th><th>Ganado</th><th>Balance</th></tr>${filasSeg}</table></div>
<p class="leyenda">Cómo leerlo: si no hay ventaja real, lo normal es que se gaste más de lo que se gana: la quiniela devuelve en promedio 72 de cada 100 pesos jugados, así que perder cerca del 28% es el azar. Solo si dentro de muchas semanas la cartera devuelve más del 100% de lo gastado, de forma sostenida y con muchos sorteos, habría algo que investigar. Con pocos sorteos, cualquier resultado es suerte.</p>` : '';
  const cuerpo = `<section class="hero"><h1>¿Hay algún sesgo en alguna lotería?</h1>
<p class="sub">Página privada de trabajo. Para cada lotería se prueba si sus números salen parejos: los 100 números a la vez, las decenas (0–9) y las unidades (0–9).</p></section>
<h2>Veredicto</h2>
<p>${veredicto}</p>
<div class="tabla"><table><tr><th>Lotería</th><th>Sorteos</th><th>p (100 números)</th><th>p (decenas)</th><th>p (unidades)</th><th>Número más desviado</th></tr>${tabla}</table></div>
<p class="leyenda"><strong>Cómo leerlo:</strong> p mide qué tan raro sería ver ese reparto si la lotería fuera perfectamente pareja. Un p de 0.03 suena raro, pero con ${pruebas} pruebas es normal que unas ${(pruebas * 0.05).toFixed(0)} den menos de 0.05 por casualidad. Por eso solo cuenta como señal fuerte 🚨 un p menor a ${alfa.toExponential(1)} (0.05 repartido entre todas las pruebas), o un número cuyo p sea menor a ${alfaNum.toExponential(1)} (0.05 repartido entre los 100 números de cada lotería). 👀 es "cerca, pero puede ser suerte". Ordenadas de la que más se aleja a la que menos. Una señal fuerte habría que confirmarla con sorteos nuevos antes de creerla.</p>${seguimiento}`;
  return pagina({ ruta: '/sesgos/', titulo: `Sesgos por lotería | ${NOMBRE_SITIO}`, descripcion: 'Página privada de análisis.', indexar: false, cuerpo });
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
${r.pales.length ? `<h2>🎲 Palés con los números del día</h2>
<p>Un palé son dos números que salen juntos en el mismo sorteo. Con los 5 números del día se arman 10 parejas. En verde, las que ya salieron hoy.</p>
<p style="font-size:1.35rem;line-height:2">${palTxtLista(r.pales)}</p>
<p class="leyenda">${r.pales.some(x => x.salio.length) ? `Ya salió hoy: ${r.pales.filter(x => x.salio.length).map(x => `<strong>${f2(x.p[0])}-${f2(x.p[1])}</strong> en ${x.salio.map(esc).join(', ')}`).join(' · ')}. ` : 'Todavía no ha salido ninguna pareja hoy. '}Por azar, una pareja concreta sale en un sorteo concreto 1 de cada 1,650 veces: paga mucho cuando sale, pero sale muy pocas veces.</p>` : ''}
<h2>¿Qué tan bien le ha ido?</h2>
<p>${r.dias ? `En los últimos <strong>${r.dias}</strong> días completos, los 5 números del Radar salieron en promedio <strong>${prom.toFixed(2)}</strong> por día. El azar esperaba <strong>${esp.toFixed(2)}</strong>. ${veredicto}` : veredicto}</p>
${r.dias ? `<p>Con los palés pasa igual: de <strong>${r.dias * 10}</strong> parejas armadas en esos días, salieron <strong>${r.palesHits}</strong> veces y el azar esperaba <strong>${r.palesEsp.toFixed(1)}</strong>.</p>` : ''}
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
  const ultimo = dias[dias.length - 1];
  const esHoy = !!(ultimo && ultimo.fecha === hoy);
  const dia = esHoy ? ultimo : null;      // lo de HOY: si aún no sale nada, las tarjetas dicen "Pendiente"
  const prev = esHoy ? null : ultimo;     // el último día con resultados, abajo y bien rotulado
  const nombre = k => (LOTERIAS.find(l => l.clave === k) || { nombre: k }).nombre;
  const conteoDe = d => { const c = {}; if (d) for (const [k, nums] of Object.entries(d.quinielas)) new Set(nums).forEach(n => (c[n] = c[n] || []).push(k)); return c; };
  const repetidosDe = c => Object.entries(c).filter(([, ks]) => ks.length >= 2).sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
  const tarjetasDe = (d, c) => LOTERIAS.filter(l => series[l.clave].length).map(l => {
    const nums = d && d.quinielas[l.clave];
    const cont = nums ? `<span class="bolas">${nums.map(n => bola(f2(n), c[n] && c[n].length >= 2 ? ' rep' : '')).join('')}</span>` : `<span class="pend">Pendiente</span>`;
    return `<div class="tarjeta"><h3><a href="${url(`/loterias/${l.slug}/`)}">${esc(l.nombre)}</a></h3><div class="hora">${esc(horaHoy(l))}</div><p>${cont}</p></div>`;
  }).join('');
  const repsDe = (rep, cuando) => rep.length ? `<h2>⚡ Repetidos en varias loterías ${cuando}</h2><div class="tabla"><table><tr><th>Número</th><th>Salió en</th></tr>${rep.map(([n, ks]) => `<tr><td><a href="${url(`/numeros/${f2(n)}/`)}">${bola(f2(n), ' rep')}</a></td><td>${ks.map(k => esc(nombre(k))).join(', ')}</td></tr>`).join('')}</table></div>` : '';

  const conteo = conteoDe(dia);
  const tarjetas = tarjetasDe(dia, conteo);
  const otros = dia && dia.otros.length ? `<h2>Otros juegos</h2><div class="rejilla">${dia.otros.map(o => `<div class="tarjeta"><h3>${esc(o.nombre)}</h3><div class="hora">${esc([o.empresa, o.hora].filter(Boolean).join(' · '))}</div><p>${numerosJuego(o)}</p></div>`).join('')}</div>` : '';
  const reps = repsDe(repetidosDe(conteo), 'hoy');

  let previo = '';
  if (prev) {
    const ayer = new Date(hoy + 'T12:00:00Z'); ayer.setUTCDate(ayer.getUTCDate() - 1);
    const rotulo = prev.fecha === ayer.toISOString().slice(0, 10) ? 'Resultados de ayer' : 'Últimos resultados publicados';
    const cp = conteoDe(prev);
    previo = `<h2>${rotulo} · ${esc(fechaLarga(prev.fecha))}</h2><div class="rejilla">${tarjetasDe(prev, cp)}</div>${repsDe(repetidosDe(cp), 'ese día')}`;
  }

  const titulo = `Resultados de la lotería de hoy, ${fechaLarga(hoy)}`;
  const cuerpo = `<section class="hero"><span class="vivo">En vivo · se actualiza minutos después de cada sorteo</span>
<h1>${esc(titulo)}</h1>
<p class="sub">Quinielas dominicanas y de afuera con estadísticas reales de los últimos ${VENTANA} sorteos. Sin promesas, solo datos.</p></section>
${teaserCelebra(dias)}
<div class="rejilla">${tarjetas || '<p>Todavía no hay resultados.</p>'}</div>
${reps}${otros}${previo}
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
<p>Para saber cuántas personas visitan el sitio y qué páginas leen, usamos GoatCounter, un contador de visitas sin cookies que no guarda datos personales ni te sigue entre sitios. Solo cuenta visitas y páginas vistas de forma agregada.</p>
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
    ['/guias/leidsa/', 'Leidsa: horario y resultados de la Quiniela Palé', 'A qué hora sortea Leidsa, el cambio del domingo y lo que salió en los últimos sorteos.'],
    ['/guias/loteka/', 'Loteka: horario y resultados de la quiniela', 'A qué hora sortea Loteka y los últimos números que salieron.'],
    ['/laboratorio/', 'El laboratorio: ¿algo le gana al azar?', 'Cómo probamos ideas para predecir la lotería y qué resultados dieron.'],
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

function paginaGuiaLeidsa(series) {
  const l = lotPorSlug('leidsa');
  const sn = series[l.clave] || [];
  const ult = sn[sn.length - 1];
  const desde = sn[0];
  const cuerpo = `${migasGuia('Leidsa')}<h1>Leidsa: horario y resultados de la Quiniela Palé</h1>
<p class="sub">Cómo encontrar rápido el resultado de la Quiniela Palé de Leidsa y a qué hora sale.</p>
<h2>Qué es</h2>
<p>Leidsa es una de las loterías privadas más conocidas de República Dominicana y tiene varios juegos. Aquí nos fijamos en su sorteo de <strong>Quiniela Palé</strong>, que saca tres números del 00 al 99, igual que las demás quinielas.</p>
<h2>A qué hora juega</h2>
<p>De lunes a sábado, la Quiniela Palé de Leidsa sortea a las <strong>${esc(l.hora)}</strong> de la noche. Los <strong>domingos</strong> sortea más temprano, a las <strong>${esc(HORA_DOMINGO.leidsa)}</strong>. En días feriados el horario puede cambiar, así que confírmalo con la lotería.</p>
<h2>Lo que salió en Leidsa</h2>
${ult ? `<p>El último sorteo registrado fue el ${esc(fechaLarga(ult.fecha))}: ${bolas(ult.nums)}</p>` : ''}
${tablaUltimos(series, l.clave, 10)}
<p>Para ver cualquier otro día usa el <a href="${url('/resultados/')}">historial por fecha</a>. ${desde ? `Nuestro archivo de Leidsa empieza el ${esc(fechaLarga(desde.fecha))} y crece todos los días.` : ''}</p>
<h2>Cómo se juega</h2>
<p>Las jugadas son las mismas de toda quiniela: quiniela, palé y tripleta. Si no las tienes claras, lee la <a href="${url('/guias/como-jugar-quiniela-pale-tripleta/')}">guía de cómo se juega</a>. Y recuerda que cada sorteo es independiente: lo que salió ayer no cambia lo que sale hoy.</p>
<p>Más datos en la página de ${enlaceLoteria(l)}: mapa de números, más salidos, menos salidos y atrasados.</p>
${pieGuia()}`;
  return pagina({ ruta: '/guias/leidsa/', titulo: `Leidsa hoy: horario de la Quiniela Palé y resultados | ${NOMBRE_SITIO}`, descripcion: 'Horario de la Quiniela Palé de Leidsa (incluido el cambio del domingo), últimos resultados y cómo ver días anteriores.', cuerpo });
}
function paginaGuiaLoteka(series) {
  const l = lotPorSlug('loteka');
  const sn = series[l.clave] || [];
  const ult = sn[sn.length - 1];
  const desde = sn[0];
  const cuerpo = `${migasGuia('Loteka')}<h1>Loteka: horario y resultados de la quiniela</h1>
<p class="sub">A qué hora sortea Loteka y dónde ver lo que salió en los últimos sorteos.</p>
<h2>Qué es</h2>
<p>Loteka es una de las loterías privadas de República Dominicana. Su quiniela saca tres números del 00 al 99, y se juega con las mismas jugadas de siempre: quiniela, palé y tripleta.</p>
<h2>A qué hora juega</h2>
<p>La quiniela de Loteka sortea a las <strong>${esc(l.hora)}</strong> de la noche. Según las fuentes que revisamos, sortea a la misma hora el domingo. En días feriados el horario puede cambiar, así que confírmalo con la lotería.</p>
<h2>Lo que salió en Loteka</h2>
${ult ? `<p>El último sorteo registrado fue el ${esc(fechaLarga(ult.fecha))}: ${bolas(ult.nums)}</p>` : ''}
${tablaUltimos(series, l.clave, 10)}
<p>Para ver cualquier otro día usa el <a href="${url('/resultados/')}">historial por fecha</a>. ${desde ? `Nuestro archivo de Loteka empieza el ${esc(fechaLarga(desde.fecha))} y crece todos los días.` : ''}</p>
<h2>Cómo se juega</h2>
<p>Consulta la <a href="${url('/guias/como-jugar-quiniela-pale-tripleta/')}">guía de cómo se juega</a> para entender cada jugada y qué tan probable es. Cada sorteo es independiente: un número no está "atrasado" ni "caliente" por lo que pasó antes.</p>
<p>Más datos en la página de ${enlaceLoteria(l)}: mapa de números, más salidos, menos salidos y atrasados.</p>
${pieGuia()}`;
  return pagina({ ruta: '/guias/loteka/', titulo: `Loteka hoy: horario de la quiniela y resultados | ${NOMBRE_SITIO}`, descripcion: 'Horario de la quiniela de Loteka, últimos resultados y cómo ver días anteriores.', cuerpo });
}
// 🧪 Laboratorio público: ideas nuevas probadas con las mismas reglas estrictas del Explorador del bot
// (buscar en el 60% viejo del historial, confirmar en el 40% nuevo, exigir más según cuántas ideas se probaron)
// y un control con datos inventados al azar para ver cuántas "candidatas" aparecen solas por pura casualidad.
function normInvSitio(p) { // inversa de la normal (Acklam)
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572], c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = p < 0.5 ? Math.sqrt(-2 * Math.log(p)) : Math.sqrt(-2 * Math.log(1 - p));
  const x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  return p < 0.5 ? x : -x;
}
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function evaluarIdeasLab(D) {
  const ideas = [];
  for (const l of LOTERIAS) {
    for (let dow = 0; dow < 7; dow++) for (let d = 0; d < 10; d++) {
      ideas.push({ fam: 'dia', clave: l.clave, nombre: l.nombre, texto: `${l.nombre} · ${DIAS_SEMANA[dow]} · terminación en ${d}`, dow, S: new Set(Array.from({ length: 10 }, (_, k) => k * 10 + d)) });
      ideas.push({ fam: 'dia', clave: l.clave, nombre: l.nombre, texto: `${l.nombre} · ${DIAS_SEMANA[dow]} · decena de los ${d}0`, dow, S: new Set(Array.from({ length: 10 }, (_, k) => d * 10 + k)) });
    }
    ideas.push({ fam: 'repite', clave: l.clave, nombre: l.nombre, texto: `${l.nombre} · los números de ayer vuelven hoy` });
  }
  const corte = Math.floor(D.length * 0.6);
  const stats = (id, a0, a1) => {
    let h = 0, ex = 0, v = 0;
    for (let i = a0; i < a1; i++) {
      const b = D[i].q[id.clave]; if (!b) continue;
      let S;
      if (id.fam === 'dia') { if (D[i].dow !== id.dow) continue; S = id.S; }
      else { if (i === 0 || D[i].t - D[i - 1].t !== 86400000) continue; const a = D[i - 1].q[id.clave]; if (!a) continue; S = new Set(a); }
      const B = new Set(b), p = B.size / 100;
      for (const x of S) if (B.has(x)) h++;
      ex += S.size * p; v += S.size * p * (1 - p);
    }
    return v > 0 ? { h, ex, z: (h - ex) / Math.sqrt(v) } : null;
  };
  const porFam = { dia: { ideas: 0, cand: 0, conf: 0 }, repite: { ideas: 0, cand: 0, conf: 0 } };
  const cands = [];
  for (const id of ideas) { const r = stats(id, 0, corte); if (!r) continue; porFam[id.fam].ideas++; if (r.z >= 3) { cands.push({ id, busqueda: r }); porFam[id.fam].cand++; } }
  const umbral = cands.length ? -normInvSitio(0.05 / cands.length) : 2;
  for (const c of cands) { c.confirmacion = stats(c.id, corte, D.length); c.ok = !!c.confirmacion && c.confirmacion.z >= umbral; if (c.ok) porFam[c.id.fam].conf++; }
  const total = porFam.dia.ideas + porFam.repite.ideas;
  return { total, candidatas: cands.length, confirmadas: cands.filter(c => c.ok), umbral, porFam, corte, n: D.length,
    mejores: cands.filter(c => !c.ok).sort((x, y) => y.busqueda.z - x.busqueda.z).slice(0, 5) };
}
function paginaLaboratorio(dias) {
  const hoy = fechaRD();
  const D = dias.filter(d => d.fecha < hoy && Object.keys(d.quinielas).length >= 8).map(d => ({ fecha: d.fecha, t: dUTC(d.fecha).getTime(), dow: dUTC(d.fecha).getUTCDay(), q: d.quinielas }));
  if (D.length < 60) return pagina({ ruta: '/laboratorio/', titulo: `El laboratorio | ${NOMBRE_SITIO}`, descripcion: 'Cómo probamos si algo le gana al azar.', cuerpo: `<h1>El laboratorio</h1><p>Todavía no hay suficientes días de historial para probar ideas.</p>${pieGuia()}` });
  const real = evaluarIdeasLab(D);
  const rnd = mulberry32(20261121);
  const D2 = D.map(d => { const q = {}; for (const k of Object.keys(d.q)) { const s = new Set(); while (s.size < 3) s.add(Math.floor(rnd() * 100)); q[k] = [...s]; } return { fecha: d.fecha, t: d.t, dow: d.dow, q }; });
  const sim = evaluarIdeasLab(D2);
  const fmt = n => n.toLocaleString('es-DO');
  const fila = (nombre, r) => `<tr><td>${esc(nombre)}</td><td>${fmt(r.ideas)}</td><td>${r.cand}</td><td><strong>${r.conf}</strong></td></tr>`;
  const mejores = real.mejores.map(c => `<tr><td>${esc(c.id.texto)}</td><td>${c.busqueda.h} <small class="leyenda">(azar ${c.busqueda.ex.toFixed(1)})</small></td><td>${c.confirmacion ? `${c.confirmacion.h} <small class="leyenda">(azar ${c.confirmacion.ex.toFixed(1)})</small>` : '–'}</td><td>no se confirmó</td></tr>`).join('');
  const conf = real.confirmadas.length ? `<p><strong>Ideas que pasaron las dos pruebas:</strong> ${real.confirmadas.map(c => esc(c.id.texto)).join('; ')}. Se siguen midiendo hacia adelante antes de creerles.</p>` : '<p><strong>Ideas que pasaron las dos pruebas: ninguna.</strong></p>';
  const cuerpo = `<section class="hero"><h1>El laboratorio: cómo probamos si algo le gana al azar</h1>
<p class="sub">Aquí mostramos cómo se prueba una idea para predecir la lotería y qué resultados dio hasta hoy. Sin humo: lo que no aguanta la prueba, se dice.</p></section>
<h2>Las reglas del juego</h2>
<ul>
<li><strong>Dos tramos del historial.</strong> Cada idea se busca en el 60% más viejo de los días y solo cuenta si se repite en el 40% más nuevo, que no se tocó mientras se buscaba.</li>
<li><strong>Más ideas, más exigencia.</strong> Cuantas más ideas se prueban, más fácil es que alguna parezca buena por pura casualidad. Por eso la vara para confirmar sube con el número de candidatas.</li>
<li><strong>Un control con datos inventados.</strong> Corremos exactamente la misma prueba con sorteos generados al azar, para ver cuántas "candidatas" aparecen solas.</li>
<li><strong>Después, en vivo.</strong> Lo que pase todo eso todavía tiene que aguantar semanas de sorteos nuevos antes de creerle.</li>
</ul>
<h2>Lo que probamos con los ${real.n} días de historial completo</h2>
<p class="sub">Ideas nuevas: terminaciones y decenas según el día de la semana en cada lotería, y la idea de que los números de ayer vuelven hoy en la misma lotería. Historial dividido así: ${real.corte} días para buscar y ${real.n - real.corte} para confirmar.</p>
<div class="tabla"><table><tr><th>Qué se probó</th><th>Ideas probadas</th><th>Brillaron en la búsqueda</th><th>Se confirmaron</th></tr>
${fila('Terminación o decena según el día de la semana', real.porFam.dia)}${fila('Los números de ayer vuelven hoy', real.porFam.repite)}
<tr><td><strong>Total con datos reales</strong></td><td><strong>${fmt(real.total)}</strong></td><td><strong>${real.candidatas}</strong></td><td><strong>${real.confirmadas.length}</strong></td></tr>
<tr><td><strong>Control con datos inventados</strong></td><td>${fmt(sim.total)}</td><td>${sim.candidatas}</td><td>${sim.confirmadas.length}</td></tr></table></div>
${conf}
<p>${sim.candidatas > 0 ? `Mira la última fila: en un mundo donde todo es azar puro, igual aparecen ${sim.candidatas} idea(s) que "brillan" en la búsqueda. Eso es exactamente lo que pasa con los métodos milagrosos: se escogen mirando el pasado y parecen funcionar.` : 'Mira la última fila: con datos inventados al azar, esta vez ninguna idea brilló. Pero con miles de ideas probadas, a veces alguna parece buena por pura casualidad, y por eso se exige confirmar.'}</p>
${mejores ? `<h2>Las que más brillaron y qué les pasó después</h2>
<div class="tabla"><table><tr><th>Idea</th><th>Aciertos en la búsqueda</th><th>Aciertos en la confirmación</th><th>Resultado</th></tr>${mejores}</table></div>
<p class="leyenda">Cuando una idea "brilla" en una parte del historial y se apaga en la otra, es casi siempre casualidad.</p>` : ''}
<h2>Lo que ya habíamos probado</h2>
<ul>
<li>Un <strong>Explorador</strong> que cruza las 20 loterías entre sí (qué sale en una y qué sale en otra, hoy o ayer) con transformaciones como equivalentes y espejos. En su revisión del 19 de noviembre de 2026, con más de 4,600 ideas probadas, ninguna de las candidatas se confirmó. Se vuelve a correr cada semana.</li>
<li>Un laboratorio con <strong>12 métodos populares</strong> (calientes, atrasados, jaladeras, espejos, efemérides y más) medidos día por día contra el azar: ninguno le ganó.</li>
<li>Un <strong>detector de sesgos</strong> por lotería: ninguna lotería sacó números de forma desigual más allá de lo que explica el azar.</li>
<li>Nuestras <strong>cinco jugadas diarias del Radar</strong>, que aciertan casi lo mismo que acertaría un número escogido al azar. Puedes ver el marcador en <a href="${url('/jugadas/')}">Jugadas</a>.</li>
</ul>
<h2>Qué sigue</h2>
<p>Dejamos fijadas unas pocas hipótesis con los datos hasta el 21 de noviembre de 2026 y las seguimos hacia adelante con una banca virtual, sin dinero real. Si alguna aguanta con evidencia fuerte, lo vamos a decir aquí. Si no, también.</p>
<p>La lotería es entretenimiento, no una inversión. Más en <a href="${url('/lectura/numero-atrasado-chance/')}">¿Un número atrasado tiene más chance?</a> y <a href="${url('/lectura/probamos-4672-ideas-ninguna-le-gano-al-azar/')}">Probamos 4,672 ideas: ninguna le ganó al azar</a>.</p>
${pieGuia()}`;
  return pagina({ ruta: '/laboratorio/', titulo: `El laboratorio: ¿hay algo que le gane al azar en la lotería? | ${NOMBRE_SITIO}`, descripcion: 'Cómo probamos ideas para predecir la lotería con reglas estrictas y qué resultados dieron: ninguna le ganó al azar.', cuerpo });
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
].concat(require('./lecturas-extra.js')(url));
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
  escribir(path.join('/aciertos/', 'index.html'), paginaAciertos(dias)); // privada
  escribir(path.join('/sesgos/', 'index.html'), paginaSesgos(dias)); // privada: sin enlace, noindex y fuera del sitemap // privada: sin enlace, noindex y fuera del sitemap
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
  guardar('/guias/leidsa/', paginaGuiaLeidsa(series));
  guardar('/guias/loteka/', paginaGuiaLoteka(series));
  guardar('/guias/preguntas-frecuentes/', paginaGuiaFAQ());
  guardar('/laboratorio/', paginaLaboratorio(dias));

  escribir('404.html', pagina({ ruta: '/404.html', titulo: `Página no encontrada | ${NOMBRE_SITIO}`, descripcion: 'Página no encontrada.', indexar: false, cuerpo: `<h1>Esa página no existe</h1><p><a href="${url('/')}">Ver los resultados de hoy</a></p>` }));
  const hoy = fechaRD();
  escribir('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rutas.map(r => `<url><loc>${SITE_URL}${r}</loc><lastmod>${/\/resultados\/\d{4}/.test(r) ? r.slice(12, 22) : hoy}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  { const rd = calcularRadar(dias); if (rd.hoy.length) escribir('radar-hoy.json', JSON.stringify({ fecha: hoy, numeros: rd.hoy.map(x => x.n), pales: rd.pales.map(x => x.p) })); }
  escribir('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  if (ADSENSE_CLIENT) escribir('ads.txt', `google.com, ${ADSENSE_CLIENT.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);

  console.log(`✅ ${rutas.length} páginas en ${SALIDA} · ${dias.length} días (${dias[0].fecha} → ${dias[dias.length - 1].fecha}) · ${((Date.now() - t0) / 1000).toFixed(1)}s${DEMO ? ' · MODO DEMO' : ''}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
