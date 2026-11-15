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
  ['real_t', 'loteria-real', 'Lotería Real', '12:30 PM'],
  ['anguila_t', 'anguila-1pm', 'Anguila 1:00 PM', '1:00 PM'],
  ['florida_d', 'florida-dia', 'Florida Día', '2:00 PM'],
  ['gana_mas', 'gana-mas', 'Gana Más', '2:30 PM'],
  ['new_york_t', 'new-york-tarde', 'New York Tarde', '3:30 PM'],
  ['suerte_t2', 'la-suerte-tarde', 'La Suerte Tarde', '6:00 PM'],
  ['anguila_n', 'anguila-6pm', 'Anguila 6:00 PM', '6:00 PM'],
  ['loteka', 'loteka', 'Loteka', '6:55 PM'],
  ['king_n', 'king-lottery-noche', 'King Lottery Noche', '7:00 PM'],
  ['laprimera_n', 'la-primera-noche', 'La Primera Noche', '8:00 PM'],
  ['leidsa', 'leidsa', 'Leidsa (Quiniela Palé)', '8:55 PM'],
  ['nacional', 'loteria-nacional', 'Lotería Nacional', '9:00 PM'],
  ['anguila_nn', 'anguila-9pm', 'Anguila 9:00 PM', '9:00 PM'],
  ['new_york_n', 'new-york-noche', 'New York Noche', '10:30 PM'],
  ['florida_n', 'florida-noche', 'Florida Noche', '10:30 PM'],
].map(([clave, slug, nombre, hora]) => ({ clave, slug, nombre, hora }));
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
:root{--fondo:#0b1220;--panel:#121a2b;--borde:#22304a;--texto:#e6edf7;--suave:#9fb0c8;--acento:#22d3ee;--acento2:#a78bfa;--bien:#34d399;--ojo:#fbbf24}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--fondo);color:var(--texto);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--acento);text-decoration:none}a:hover{text-decoration:underline}
.cab{background:linear-gradient(135deg,#0f1b33,#1a1040);border-bottom:1px solid var(--borde)}
.cab .in{max-width:1080px;margin:auto;padding:14px 16px;display:flex;flex-wrap:wrap;gap:10px 20px;align-items:center}
.logo{font-weight:800;font-size:1.25rem;color:#fff;letter-spacing:.3px}.logo span{color:var(--acento)}
.menu{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:.95rem}.menu a{color:var(--suave)}.menu a:hover{color:#fff}
main{max-width:1080px;margin:auto;padding:18px 16px 40px}
h1{font-size:1.7rem;line-height:1.25;margin:.3em 0 .2em}h2{font-size:1.25rem;margin:1.6em 0 .6em}h3{font-size:1.05rem;margin:0 0 .4em}
.sub{color:var(--suave);margin:0 0 1em}
.rejilla{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
.tarjeta{background:var(--panel);border:1px solid var(--borde);border-radius:12px;padding:12px}.tarjeta p{margin:.5em 0 0}
.tarjeta .hora{color:var(--suave);font-size:.85rem}
.bolas{display:inline-flex;flex-wrap:wrap;gap:6px}
.bola{display:inline-grid;place-items:center;min-width:2.3em;height:2.3em;padding:0 .3em;border-radius:999px;background:#1d2a44;border:1px solid #2d4166;font-weight:700;font-variant-numeric:tabular-nums}
.bola.rep{border-color:var(--ojo);color:var(--ojo)}.pend{color:var(--suave);font-style:italic}
.aviso{background:#131c2e;border-left:4px solid var(--acento2);padding:12px 14px;border-radius:8px;color:#cfd8e6;margin:16px 0}
.cta{background:linear-gradient(135deg,#0e7490,#6d28d9);border-radius:12px;padding:16px;margin:22px 0;color:#fff}
.cta a{color:#fff;font-weight:700;text-decoration:underline}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{padding:8px 6px;border-bottom:1px solid var(--borde);text-align:left}th{color:var(--suave);font-weight:600;font-size:.9rem}
.tabla{overflow-x:auto;background:var(--panel);border:1px solid var(--borde);border-radius:12px;padding:4px 10px}
.mapa{display:grid;grid-template-columns:repeat(10,1fr);gap:4px;max-width:560px}
.mapa a{display:grid;place-items:center;aspect-ratio:1;border-radius:6px;font-size:.8rem;font-weight:700;color:#fff;line-height:1.1;text-align:center}
.mapa small{display:block;font-weight:400;opacity:.85;font-size:.7rem}
.leyenda{color:var(--suave);font-size:.85rem;margin-top:6px}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chips a{background:var(--panel);border:1px solid var(--borde);border-radius:999px;padding:6px 12px;color:var(--texto)}
form.buscar{display:flex;gap:8px;max-width:340px}
form.buscar input{flex:1;padding:10px;border-radius:8px;border:1px solid var(--borde);background:var(--panel);color:#fff;font-size:1rem}
form.buscar button{padding:10px 16px;border:0;border-radius:8px;background:var(--acento);color:#04131a;font-weight:700;cursor:pointer}
.migas{font-size:.85rem;color:var(--suave)}.ok{color:var(--bien)}.ojo{color:var(--ojo)}
footer{border-top:1px solid var(--borde);color:var(--suave);font-size:.88rem}
footer .in{max-width:1080px;margin:auto;padding:20px 16px}
@media(max-width:520px){h1{font-size:1.4rem}.bola{min-width:2.1em;height:2.1em}}
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
<nav class="menu"><a href="${url('/')}">Hoy</a><a href="${url('/loterias/')}">Loterías</a><a href="${url('/numeros/')}">Números</a><a href="${url('/resultados/')}">Historial</a><a href="${url('/como-funciona/')}">Cómo funciona</a></nav></div></header>
<main>${cuerpo}</main>
<footer><div class="in"><p><strong>${NOMBRE_SITIO}</strong> · Resultados y estadísticas reales de las loterías dominicanas. Vende claridad, no esperanza.</p>
<p>Los resultados se publican tal como los dan las fuentes; ante cualquier duda, el resultado oficial es el de cada lotería. Las estadísticas describen el pasado y <strong>no predicen</strong> el próximo sorteo. Juega con responsabilidad y solo lo que puedas perder. Solo mayores de 18 años.</p>
<p><a href="${url('/como-funciona/')}">Cómo funciona</a> · <a href="${url('/privacidad/')}">Privacidad</a> · <a href="https://t.me/${esc(TELEGRAM_BOT)}" rel="noopener">Telegram</a> · Actualizado: ${esc(fechaCorta(fechaRD()))}, ${esc(horaRD())} (hora RD)</p></div></footer>
</body></html>`;
}

const ctaTelegram = () => `<div class="cta"><strong>📲 Recibe cada resultado al instante en Telegram.</strong> Sin entrar a la web: <a href="https://t.me/${esc(TELEGRAM_BOT)}" rel="noopener">abrir @${esc(TELEGRAM_BOT)}</a></div>`;
const avisoHonesto = () => `<div class="aviso">🔎 <strong>Claro y sin cuentos:</strong> cada sorteo es independiente. Que un número esté "caliente" o "atrasado" describe lo que ya pasó, no lo que va a salir. Nuestro laboratorio probó 12 métodos con datos reales y ninguno le ganó al azar. Usa estos datos para informarte, no como garantía.</div>`;

function colorMapa(v, max) {
  const t = max ? v / max : 0;
  const h = 220 - Math.round(t * 200); // azul (frío) → rojo (caliente)
  return `hsl(${h} 70% ${22 + Math.round(t * 20)}%)`;
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
    return `<div class="tarjeta"><h3><a href="${url(`/loterias/${l.slug}/`)}">${esc(l.nombre)}</a></h3><div class="hora">${esc(l.hora)}</div><p>${cont}</p></div>`;
  }).join('');

  const otros = dia && dia.otros.length ? `<h2>Otros juegos</h2><div class="rejilla">${dia.otros.map(o => `<div class="tarjeta"><h3>${esc(o.nombre)}</h3><div class="hora">${esc([o.empresa, o.hora].filter(Boolean).join(' · '))}</div><p>${numerosJuego(o)}</p></div>`).join('')}</div>` : '';

  const reps = repetidos.length ? `<h2>⚡ Repetidos en varias loterías ${esHoy ? 'hoy' : 'ese día'}</h2><div class="tabla"><table><tr><th>Número</th><th>Salió en</th></tr>${repetidos.map(([n, ks]) => `<tr><td><a href="${url(`/numeros/${f2(n)}/`)}">${bola(f2(n), ' rep')}</a></td><td>${ks.map(k => esc(nombre(k))).join(', ')}</td></tr>`).join('')}</table></div>` : '';

  const titulo = esHoy ? `Resultados de la lotería de hoy, ${fechaLarga(hoy)}` : `Últimos resultados de la lotería · ${dia ? fechaLarga(dia.fecha) : ''}`;
  const cuerpo = `<h1>${esc(titulo)}</h1>
<p class="sub">Quinielas dominicanas y de afuera con estadísticas reales de los últimos ${VENTANA} sorteos. ${esHoy ? 'Esta página se actualiza durante el día.' : ''}</p>
<div class="rejilla">${tarjetas || '<p>Todavía no hay resultados.</p>'}</div>
${reps}${otros}
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
    return `<tr><td><a href="${url(`/loterias/${l.slug}/`)}">${esc(l.nombre)}</a></td><td>${esc(l.hora)}</td><td>${bolas(u.nums)}</td><td>${esc(fechaCorta(u.fecha))}</td></tr>`;
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
<p class="sub">Sorteo de las ${esc(l.hora)}. Último resultado (${esc(fechaLarga(u.fecha))}): ${bolas(u.nums)}</p>
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
  return pagina({ ruta: `/loterias/${l.slug}/`, titulo: `${l.nombre} hoy: resultados y números más salidos | ${NOMBRE_SITIO}`, descripcion: `Último resultado de ${l.nombre} (${l.hora}), historial de los últimos sorteos, números más salidos, menos salidos y atrasados. Estadística real, sin promesas.`, cuerpo });
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
<p>No. Nuestro laboratorio probó 12 métodos populares (jaladera, espejo, gemelos, calientes, atrasados y otros) contra datos reales sorteo por sorteo, y ninguno le ganó al azar. Por eso no vendemos "números fuertes": te damos los datos claros para que decidas tú.</p>
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
<p>Para cualquier consulta, escríbenos por <a href="https://t.me/${esc(TELEGRAM_BOT)}" rel="noopener">Telegram</a>.</p>
<p class="leyenda">Última actualización: ${esc(fechaLarga(fechaRD()))}.</p>`;
  return pagina({ ruta: '/privacidad/', titulo: `Política de privacidad | ${NOMBRE_SITIO}`, descripcion: `Política de privacidad de ${NOMBRE_SITIO}.`, cuerpo });
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
  guardar('/numeros/', paginaNumeros(series));
  for (let n = 0; n < 100; n++) guardar(`/numeros/${f2(n)}/`, paginaNumero(n, series));
  guardar('/resultados/', paginaHistorial(dias));
  dias.forEach((d, i) => guardar(`/resultados/${d.fecha}/`, paginaFecha(d, dias[i - 1]?.fecha, dias[i + 1]?.fecha)));
  guardar('/como-funciona/', paginaComoFunciona());
  guardar('/privacidad/', paginaPrivacidad());

  escribir('404.html', pagina({ ruta: '/404.html', titulo: `Página no encontrada | ${NOMBRE_SITIO}`, descripcion: 'Página no encontrada.', indexar: false, cuerpo: `<h1>Esa página no existe</h1><p><a href="${url('/')}">Ver los resultados de hoy</a></p>` }));
  const hoy = fechaRD();
  escribir('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rutas.map(r => `<url><loc>${SITE_URL}${r}</loc><lastmod>${/\/resultados\/\d{4}/.test(r) ? r.slice(12, 22) : hoy}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  escribir('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  if (ADSENSE_CLIENT) escribir('ads.txt', `google.com, ${ADSENSE_CLIENT.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);

  console.log(`✅ ${rutas.length} páginas en ${SALIDA} · ${dias.length} días (${dias[0].fecha} → ${dias[dias.length - 1].fecha}) · ${((Date.now() - t0) / 1000).toFixed(1)}s${DEMO ? ' · MODO DEMO' : ''}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
