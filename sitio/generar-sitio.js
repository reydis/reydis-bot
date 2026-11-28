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
      superkino: { nombre: 'Super Kino TV', empresa: 'LEIDSA', hora: '8:55 PM', tipo: 'kino', numeros: (() => { const R = fecha >= '2026-09-20' ? 84 : 80, set = new Set(); while (set.size < 20) set.add(1 + rnd(R)); return [...set]; })() }, // 80 bolas antes del 20 sept, 84 después
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
        const horaReal = /kino|pega ?3/i.test(j.nombre || k) ? '8:55 PM' : (j.hora || ''); // horas oficiales de Leidsa
        otros.push({ clave: k, nombre: j.nombre || k, empresa: j.empresa || '', hora: horaReal, tipo: j.tipo || grupo, numeros: nums });
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
.rejilla{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));grid-auto-flow:dense}.tarjeta.alta{grid-row:span 3}.tarjeta.herr{display:block;text-decoration:none;border-color:rgba(56,189,248,.35);background:linear-gradient(160deg,rgba(56,189,248,.10),rgba(129,140,248,.08))}.tarjeta.herr:hover{border-color:#38bdf8}.tarjeta.herr h3{font-size:.98rem}
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
.chips .chip,.mn-fila .chip,button.chip{background:var(--panel2);border:1px solid var(--borde);border-radius:999px;padding:8px 16px;color:var(--texto);font:inherit;cursor:pointer}button.chip[aria-pressed=true]{border-color:var(--acento);color:var(--acento)}
a.boton{display:inline-block;background:linear-gradient(135deg,var(--acento),var(--acento2));color:#04121c;font-weight:800;padding:10px 18px;border-radius:999px}button.boton{display:inline-block;border:0;cursor:pointer;font:inherit;background:linear-gradient(135deg,var(--acento),var(--acento2));color:#04121c;font-weight:800;padding:10px 18px;border-radius:999px;justify-self:start;transition:transform .15s,filter .15s}button.boton:hover{transform:translateY(-2px);filter:brightness(1.1)}a.boton:hover{text-decoration:none;filter:brightness(1.08)}
.mn-grid{display:grid;grid-template-columns:repeat(10,1fr);gap:5px;max-width:600px;margin:12px 0}.mn-grid button{aspect-ratio:1;border-radius:8px;border:1px solid var(--borde);background:var(--panel2);color:var(--texto);font:inherit;font-weight:700;font-size:.85rem;cursor:pointer;padding:0}.mn-grid button[aria-pressed=true]{background:radial-gradient(circle at 32% 28%,#fde68a,#f59e0b);color:#1a1200;border-color:var(--ojo)}.mn-grid button.hoy{outline:2px solid var(--bien);outline-offset:-2px}
.mn-tarj{background:var(--panel);border:1px solid var(--borde);border-radius:var(--r);padding:14px 16px;margin:12px 0}.mn-cab{display:flex;gap:14px;align-items:center;margin-bottom:8px}.mn-resumen{font-weight:700;margin:14px 0}.mn-fila{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.gen-form{background:var(--panel);border:1px solid var(--borde);border-radius:var(--r);padding:16px;margin:14px 0;display:grid;gap:12px;max-width:640px}.gen-form label{display:grid;gap:6px;font-size:.9rem}.gen-form label.chk{display:flex;gap:8px;align-items:center;font-size:.85rem;color:var(--suave)}.gen-form select,.gen-form input[type=number]{background:var(--panel2);border:1px solid var(--borde);border-radius:10px;padding:10px 12px;color:var(--texto);font:inherit;width:100%}.gen-tk{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--panel);border:1px solid var(--borde);border-radius:var(--r);padding:10px 14px;margin:8px 0;max-width:640px}.gen-tk .gen-n{color:var(--suave);font-size:.8rem;min-width:26px}.gen-acc{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}.gen-nota{max-width:640px}
.bola.nuevo{background:linear-gradient(135deg,#38bdf8,#0284c7);color:#04121f;border-color:#7dd3fc;box-shadow:0 0 12px rgba(56,189,248,.45)}.tarjeta.hoy{border-color:#38bdf8;box-shadow:0 0 18px rgba(56,189,248,.25)}.insignia{display:inline-block;background:#38bdf8;color:#04121f;font-size:.7rem;font-weight:800;border-radius:999px;padding:2px 8px;margin-left:6px;vertical-align:middle}tr.fila-hoy td{background:rgba(56,189,248,.08)}
.pales{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.pal{display:inline-flex;align-items:center;gap:5px;background:var(--panel2);border:1px solid var(--borde);border-radius:999px;padding:4px 10px 4px 5px}.pal .bola{min-width:2em;height:2em;font-size:.82rem}.pal.medio{border-color:#10b981}.pal.completo{border-color:var(--ojo);box-shadow:0 0 14px rgba(251,191,36,.4);background:rgba(251,191,36,.08)}.pal small{color:var(--suave);font-size:.72rem}.pal.completo small{color:var(--ojo);font-weight:700}
@keyframes meneo{0%,100%{transform:rotate(0)}25%{transform:rotate(-7deg) scale(1.12)}75%{transform:rotate(7deg) scale(1.12)}}
@media(hover:hover){
.bola{transition:transform .18s,box-shadow .18s}.bola:hover{transform:translateY(-3px) scale(1.14);box-shadow:0 8px 18px -4px rgba(34,211,238,.55);cursor:default}
.tarjeta:hover .bola{animation:meneo .5s ease-in-out 1}
.tarjeta{transition:transform .18s,border-color .18s,box-shadow .18s}.tarjeta:hover{transform:translateY(-4px) scale(1.015);border-color:var(--acento);box-shadow:0 16px 34px -14px rgba(34,211,238,.5)}
.tarjeta h3 a,.tarjeta .hora{transition:color .15s}.tarjeta:hover h3 a{color:var(--acento)}
tbody tr{transition:background .15s}tbody tr:hover{background:rgba(34,211,238,.07)}
a.boton{transition:transform .15s,filter .15s,box-shadow .15s}a.boton:hover{transform:translateY(-2px);box-shadow:0 10px 22px -10px rgba(34,211,238,.7)}
.chips a,button.chip{transition:transform .15s,border-color .15s,box-shadow .15s}.chips a:hover,button.chip:hover{transform:translateY(-2px);border-color:var(--acento);box-shadow:0 8px 18px -12px rgba(34,211,238,.6)}
.pal{transition:transform .15s,box-shadow .15s}.pal:hover{transform:translateY(-2px) scale(1.04);box-shadow:0 8px 16px -10px rgba(34,211,238,.6)}
.dato,.lectura,.gen-tk,.celebra{transition:transform .18s,border-color .18s,box-shadow .18s}.dato:hover,.lectura:hover,.gen-tk:hover,.celebra:hover{transform:translateY(-2px);border-color:#36507f;box-shadow:0 12px 26px -16px rgba(34,211,238,.45)}
}
.menu .mas{position:relative}.menu .mas summary{list-style:none;cursor:pointer;color:var(--suave);padding:6px 12px;border-radius:999px;transition:background .15s,color .15s}.menu .mas summary::-webkit-details-marker{display:none}.menu .mas summary:hover,.menu .mas[open] summary{color:#fff;background:rgba(255,255,255,.07)}.menu .mas div{position:absolute;right:0;top:calc(100% + 6px);min-width:170px;background:var(--panel2);border:1px solid var(--borde);border-radius:14px;padding:6px;display:flex;flex-direction:column;box-shadow:0 14px 30px -10px rgba(0,0,0,.6);z-index:20}.menu .mas div a{white-space:nowrap}.tarjeta.compacta{min-height:0}.tarjeta.compacta:hover{transform:none}
.muro-urg{border:1px solid var(--ojo);background:linear-gradient(180deg,rgba(251,191,36,.14),rgba(251,191,36,.04));border-radius:var(--r);padding:14px 16px;margin:14px 0}.muro-urg ul,.muro-lista{margin:8px 0 0;padding-left:18px}.muro-lista li{margin:6px 0}.muro-urg a,.muro-hoy a{display:inline-block;margin-top:8px}.muro-hoy{border:1px solid var(--borde);background:var(--panel);border-radius:var(--r);padding:12px 16px;margin:14px 0}.muro-hoy p{margin:6px 0}
.menu .amplio{display:none}@media(min-width:1100px){.menu .amplio{display:inline-block}.menu .estrecho{display:none}}
@media(max-width:560px){.menu{font-size:.88rem;gap:0}.menu a,.menu .mas summary{padding:6px 8px}.menu .mas div{left:0;right:auto}}
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
<meta name="google-site-verification" content="6MC7HwNcVNURJxS10NwuWc8ULNkpL6qQSwQKE6moCt8" /><link rel="stylesheet" href="${url('/estilos.css')}?v=${require('crypto').createHash('md5').update(CSS).digest('hex').slice(0,8)}">${ads}<script data-goatcounter="https://reydisradar.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
</head><body>
<header class="cab"><div class="in"><a class="logo" href="${url('/')}">Reydis <span>Radar</span></a>
<nav class="menu"><a href="${url('/')}">Hoy</a><a href="${url('/muro/')}">Muro</a><a href="${url('/jugadas/')}">Jugadas</a><a href="${url('/pales/')}">Palés</a><a href="${url('/loterias/')}">Loterías</a><a href="${url('/juegos/')}">Kino y más</a><a class="amplio" href="${url('/numeros/')}">Números</a><a class="amplio" href="${url('/repeticiones/')}">Repetidos</a><a class="amplio" href="${url('/resultados/')}">Historial</a><a class="amplio" href="${url('/guias/')}">Guías</a><a class="amplio" href="${url('/como-funciona/')}">Cómo funciona</a><details class="mas estrecho"><summary>Más ▾</summary><div><a href="${url('/numeros/')}">Números</a><a href="${url('/repeticiones/')}">Repetidos</a><a href="${url('/resultados/')}">Historial</a><a href="${url('/guias/')}">Guías</a><a href="${url('/como-funciona/')}">Cómo funciona</a></div></details></nav></div></header>
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

const TOP_RADAR = new Map(); // fecha → Set de los números del día del Radar (para marcarlos en verde donde salgan)
const marcadosRadar = fecha => TOP_RADAR.get(fecha) || new Set();
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
    detalle.push({ fecha: dias[i].fecha, top, hits, esp, pales: prs.map(p => ({ p, salio: parSalio(p, dias[i].quinielas) })).filter(x => x.salio.length) });
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

const palFichas = (pales, picks) => {
  const sale = new Set((picks || []).filter(h => h.yaSalio.length).map(h => h.n));
  return '<div class="pales">' + pales.map(x => {
    const [a, b] = x.p, completo = x.salio.length > 0, medio = !completo && sale.has(a) && sale.has(b);
    const nota = completo ? '✅ ' + x.salio.map(esc).join(', ') : (medio ? 'salieron, pero separados' : '');
    return '<span class="pal' + (completo ? ' completo' : (medio ? ' medio' : '')) + '">' + bola(f2(a), sale.has(a) ? ' ya' : '') + bola(f2(b), sale.has(b) ? ' ya' : '') + (nota ? '<small>' + nota + '</small>' : '') + '</span>';
  }).join('') + '</div>';
};
const palLeyenda = '<p class="leyenda">Verde: el número ya salió hoy en alguna lotería. <strong style="color:var(--ojo)">Borde dorado ✅</strong>: el palé completo salió junto, en el mismo sorteo (eso es lo que paga).</p>';
const palTxtLista = (pales, grande) => pales.map(x => { const t = f2(x.p[0]) + '-' + f2(x.p[1]); return x.salio.length ? `<strong style="color:#34d399;white-space:nowrap">${t} ✅</strong>` : `<strong style="white-space:nowrap">${t}</strong>`; }).join(', ');
function teaserRadar(dias) {
  const r = calcularRadar(dias);
  if (!r.hoy.length) return '';
  const acert = r.pales.filter(x => x.salio.length);
  const acertTxt = acert.length ? acert.map(x => `<strong>${f2(x.p[0])}-${f2(x.p[1])}</strong> en ${x.salio.map(esc).join(', ')}`).join(' · ') : 'ninguno todavía';
  const palesHtml = r.pales.length ? `<div style="flex-basis:100%"><strong>🎲 Palés del día</strong>${palFichas(r.pales, r.hoy)}<small class="leyenda">Palés acertados hoy: ${acertTxt}</small></div>` : '';
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
  // 7.ª hipótesis (salió del laboratorio, fijada con los sorteos anteriores a SEGUIMIENTO_DESDE): LoteDom, solo domingos, los 10 terminados en 5
  { const l = LOTERIAS.find(x => x.clave === 'lotedom');
    if (l) {
      const domingo = f => dUTC(f).getUTCDay() === 0;
      const lista = f => dias.filter(d => domingo(d.fecha) && f(d.fecha)).map(d => d.quinielas.lotedom).filter(x => Array.isArray(x) && x.length === 3);
      const pre = lista(f => f < SEGUIMIENTO_DESDE), post = lista(f => f >= SEGUIMIENTO_DESDE);
      if (pre.length >= 20) {
        const nums = Array.from({ length: 10 }, (_, k) => k * 10 + 5);
        const hitsPre = pre.reduce((t, x) => t + x.filter(n => n % 10 === 5).length, 0);
        let gastado = 0, ganado = 0, aciertos = 0;
        for (const x of post) { gastado += 1; for (const n of nums) { const pos = x.indexOf(n); if (pos >= 0) { ganado += (1 / nums.length) * PAGOS_QUINIELA[pos]; aciertos++; } } }
        filas.push({ clave: 'lotedom', tipo: 'unidad (solo domingos)', etiqueta: 'terminados en 5', nums, antes: `${hitsPre} veces en ${pre.length} domingos, esperaba ${(pre.length * 0.3).toFixed(1)}`, lot: l.nombre, sorteos: post.length, gastado, ganado, aciertos, esperados: post.length * 3 * nums.length / 100 });
      }
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
<p>Las hipótesis (el número, la decena y el dígito final más desviados de Florida Día y New York Noche) se escogieron con los sorteos <strong>anteriores al ${esc(fechaMini(SEGUIMIENTO_DESDE))}</strong>. Desde esa fecha el sistema "juega" cada una en papel: RD$1 por sorteo por hipótesis (repartido en partes iguales entre sus números) y paga ${PAGOS_QUINIELA.join(' / ')} por peso a 1.er, 2.º y 3.er premio. Solo cuentan sorteos que no se usaron para escogerlas. La séptima salió del <a href="${url('/laboratorio/')}">laboratorio</a>: LoteDom, solo los domingos, los 10 números terminados en 5.</p>
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
  const filasDia = [...r.detalle].reverse().slice(0, 14).map(d => `<tr><td>${esc(fechaMini(d.fecha))}</td><td><span class="bolas">${d.top.map(n => bola(f2(n), d.hits.includes(n) ? ' ya' : '')).join('')}</span></td><td>${d.hits.length}</td><td>${d.esp.toFixed(1)}</td><td>${d.pales.length ? d.pales.map(x => `<strong style="color:#34d399;white-space:nowrap">${f2(x.p[0])}-${f2(x.p[1])} ✅</strong>`).join(', ') : '<span class="leyenda">ninguno</span>'}</td></tr>`).join('');
  const filasJal = jal.map(j => `<tr><td>${bola(f2(j.a))}</td><td><span class="bolas">${j.top.map(t => `${bola(f2(t.b))}<small class="leyenda">${t.c}×</small>`).join(' ')}</span></td><td>${j.M}</td></tr>`).join('');
  const cuerpo = `<section class="hero"><h1>Números del día y jaladeras</h1>
<p class="sub">Lo que dicen las estadísticas del Radar para hoy, sin dividir por lotería. Es información y entretenimiento: <strong>no es una ventaja</strong>, y abajo te mostramos cuánto le ha ido contra el azar.</p></section>
<h2>🎯 Números del día</h2>
${r.hoy.length ? `<div class="rejilla">${tarjetas}</div><p class="leyenda">Son los 5 números con más peso en los últimos ${VENT_RADAR} días (el 1.er premio pesa más que el 2.º y el 3.º). En verde, los que ya salieron hoy en alguna lotería: si no salió en una, puede salir en otra.</p>` : '<p>Todavía no hay suficientes días de historial para calcularlos.</p>'}
${r.pales.length ? `<h2>🎲 Palés con los números del día</h2>
<p>Un palé son dos números que salen juntos en el mismo sorteo. Con los 5 números del día se arman 10 parejas. </p>
${palFichas(r.pales, r.hoy)}${palLeyenda}
<p class="leyenda">${r.pales.some(x => x.salio.length) ? `Ya salió hoy: ${r.pales.filter(x => x.salio.length).map(x => `<strong>${f2(x.p[0])}-${f2(x.p[1])}</strong> en ${x.salio.map(esc).join(', ')}`).join(' · ')}. ` : 'Todavía no ha salido ninguna pareja hoy. '}Por azar, una pareja concreta sale en un sorteo concreto 1 de cada 1,650 veces: paga mucho cuando sale, pero sale muy pocas veces.</p>` : ''}
<h2>¿Qué tan bien le ha ido?</h2>
<p>${r.dias ? `En los últimos <strong>${r.dias}</strong> días completos, los 5 números del Radar salieron en promedio <strong>${prom.toFixed(2)}</strong> por día. El azar esperaba <strong>${esp.toFixed(2)}</strong>. ${veredicto}` : veredicto}</p>
${r.dias ? `<p>Con los palés pasa igual: de <strong>${r.dias * 10}</strong> parejas armadas en esos días, salieron <strong>${r.palesHits}</strong> veces y el azar esperaba <strong>${r.palesEsp.toFixed(1)}</strong>.</p>` : ''}
<p class="leyenda">Con unas 20 loterías al día, cualquier número sale en alguna casi la mitad de los días solo por azar. Por eso el marcador compara contra eso y no contra cero. Cada día se calcula usando solo los días anteriores.</p>
${r.dias ? `<div class="tabla"><table><tr><th>Día</th><th>Números del Radar</th><th>Salieron</th><th>Azar esperaba</th><th>Palés salidos</th></tr>${filasDia}</table></div>` : ''}
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
    const marc = d ? marcadosRadar(d.fecha) : new Set();
    const cont = nums ? `<span class="bolas">${nums.map(n => bola(f2(n), marc.has(n) ? ' ya' : (c[n] && c[n].length >= 2 ? ' rep' : ''))).join('')}</span>` : `<span class="pend">Pendiente</span>`;
    return `<div class="tarjeta"><h3><a href="${url(`/loterias/${l.slug}/`)}">${esc(l.nombre)}</a></h3><div class="hora">${esc(horaHoy(l))}</div><p>${cont}</p></div>`;
  }).join('');
  const repsDe = (rep, cuando, marc = new Set()) => rep.length ? `<h2>⚡ Repetidos en varias loterías ${cuando}</h2><div class="tabla"><table><tr><th>Número</th><th>Salió en</th></tr>${rep.map(([n, ks]) => `<tr><td><a href="${url(`/numeros/${f2(n)}/`)}">${bola(f2(n), marc.has(+n) ? ' ya' : ' rep')}</a></td><td>${ks.map(k => esc(nombre(k))).join(', ')}</td></tr>`).join('')}</table></div>` : '';

  const conteo = conteoDe(dia);
  const kinoClave = (() => { for (let i = dias.length - 1; i >= 0; i--) { const o = dias[i].otros.find(x => /kino/i.test(x.nombre)); if (o) return o; } return null; })();
  const tarjetaKino = kinoClave ? (() => {
    const hoyK = dia && dia.otros.find(x => x.clave === kinoClave.clave);
    return `<div class="tarjeta alta" style="grid-row:span __SPAN__"><h3><a href="${url('/juegos/' + slugJuego(kinoClave.clave) + '/')}">${esc(kinoClave.nombre)}</a></h3><div class="hora">${esc([kinoClave.empresa, kinoClave.hora || '8:55 PM'].filter(Boolean).join(' · '))}</div><p>${hoyK ? numerosJuegoHoy(hoyK) : '<span class="pend">Pendiente</span>'}</p></div>`;
  })() : '';
    const esKino = o => /kino/i.test(o.nombre);
  const otros = (() => {
    const hechos = new Set(dia ? dia.otros.map(o => o.clave) : []);
    const otrosHoy = dia ? dia.otros.filter(o => !esKino(o)) : [];
    const desde = dias.slice(-14), vistos = new Map();
    desde.forEach(d => d.otros.forEach(o => { if (!esKino(o) && !hechos.has(o.clave) && !vistos.has(o.clave)) vistos.set(o.clave, o); }));
    const hechas = otrosHoy.map(o => `<div class="tarjeta"><h3><a href="${url('/juegos/' + slugJuego(o.clave) + '/')}">${esc(o.nombre)}</a></h3><div class="hora">${esc([o.empresa, o.hora].filter(Boolean).join(' · '))}</div><p>${numerosJuego(o)}</p></div>`);
    const pend = [...vistos.values()].map(o => `<div class="tarjeta"><h3><a href="${url('/juegos/' + slugJuego(o.clave) + '/')}">${esc(o.nombre)}</a></h3><div class="hora">${esc([o.empresa, o.hora].filter(Boolean).join(' · '))}</div><p><span class="pend">Pendiente</span></p></div>`);
    const todas = hechas.concat(pend);
    return todas;
  })();
  const tarjetas = tarjetasDe(dia, conteo);
  const herr = (ico, t, d, r) => `<a class="tarjeta herr" href="${url(r)}"><h3>${ico} ${esc(t)}</h3><p class="hora">${esc(d)}</p></a>`;
  const seccionEspeciales = (tarjetaKino || otros.length) ? `<h2>🎰 Kino y juegos especiales</h2>
<p class="leyenda">Super Kino TV, Loto, Pega 3 Más y los demás juegos de bolillas, con las herramientas para armar tus tickets.</p>
<div class="rejilla">${tarjetaKino.replace('__SPAN__', Math.min(3, Math.ceil((otros.length + 4) / 4)))}${otros.join('')}${herr('🎯', 'Jugadas de Kino y Loto 5', 'Los números calientes de cada juego, con su récord real contra el azar.', '/jugadas-especiales/')}${herr('🎟️', 'Generador de tickets', 'Combinaciones al azar, calientes o atrasadas, ya con el rango de cada juego.', '/generador/')}${herr('🔬', '¿Le ganan al azar?', 'El laboratorio prueba cada juego contra el azar puro, sin promesas.', '/laboratorio/')}${herr('📚', 'Todos los juegos', 'Historial y últimos sorteos de Kino, Loto, Loto 5, Pega 3 y las cuartetas.', '/juegos/')}</div>
` : '';
  const reps = repsDe(repetidosDe(conteo), 'hoy', marcadosRadar(hoy));

  let previo = '';
  if (prev) {
    const ayer = new Date(hoy + 'T12:00:00Z'); ayer.setUTCDate(ayer.getUTCDate() - 1);
    const rotulo = prev.fecha === ayer.toISOString().slice(0, 10) ? 'Resultados de ayer' : 'Últimos resultados publicados';
    const cp = conteoDe(prev);
    previo = `<h2>${rotulo} · ${esc(fechaLarga(prev.fecha))}</h2><div class="rejilla">${tarjetasDe(prev, cp)}</div>${repsDe(repetidosDe(cp), 'ese día', marcadosRadar(prev.fecha))}`;
  }

  const titulo = `Resultados de la lotería de hoy, ${fechaLarga(hoy)}`;
  const cuerpo = `<section class="hero"><span class="vivo">En vivo · se actualiza minutos después de cada sorteo</span>
<h1>${esc(titulo)}</h1>
<p class="sub">Quinielas dominicanas y de afuera con estadísticas reales de los últimos ${VENTANA} sorteos. Sin promesas, solo datos.</p></section>
${muroTeaser(dias)}${teaserCelebra(dias)}
${TOP_RADAR.has(hoy) ? '<p class="leyenda">🟢 Los números en verde son los <strong>Números del día</strong> del Radar cuando salen en una lotería.</p>' : ''}<div class="rejilla">${tarjetas || '<p>Todavía no hay resultados.</p>'}</div>
${reps}${seccionEspeciales}${previo}
${tarjetaLectura(dias)}
${ctaTelegram()}
<h2>Busca tu número</h2>
<form class="buscar" onsubmit="var n=parseInt(this.n.value,10);if(n>=0&&n<=99){location.href='${url('/numeros/')}'+String(n).padStart(2,'0')+'/'}return false"><input name="n" inputmode="numeric" maxlength="2" placeholder="Ej: 27" aria-label="Número del 00 al 99"><button>Ver</button></form>
<p class="leyenda">Te dice cuándo salió por última vez en cada lotería y cuántas veces ha salido.</p>
<p><a class="boton" href="${url('/mis-numeros/')}">⭐ Sigue tus propios números</a></p>
${avisoHonesto()}`;
  return pagina({ ruta: '/', titulo: `${titulo} | ${NOMBRE_SITIO}`, descripcion: `Resultados de hoy de Leidsa, Loteka, Nacional, Real, La Primera, LoteDom, Anguila, King Lottery, New York y Florida, con estadísticas reales y sin promesas.`, cuerpo });
}

function numerosJuego(o) {
  if (o.tipo === 'pega3' || o.tipo === 'pega4') return `<span class="bolas">${o.numeros.map(n => bola(n)).join('')}</span>`;
  return bolas(o.numeros);
}

const numerosJuegoHoy = o => `<span class="bolas">${o.numeros.map(n => bola(o.tipo === 'pega3' || o.tipo === 'pega4' ? n : f2(n), ' nuevo')).join('')}</span>`;

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

// ── Mapa de calor honesto y "Mis números" ─────────────────────────────────────
const JS_MAPA = String.raw`(function(){
var D=JSON.parse(document.getElementById('mapa-datos').textContent);
var cont=document.getElementById('mapa-calor'),txt=document.getElementById('mapa-texto'),bs=document.querySelectorAll('[data-per]');
function pintar(k){
  var P=D[k]; if(!P||!P.tot){return;}
  var p=1-Math.pow(0.99,3),E=P.tot*p,sd=Math.sqrt(P.tot*p*(1-p)),lo=Math.round(E-2*sd),hi=Math.round(E+2*sd),fuera=0,html='';
  for(var n=0;n<100;n++){
    var v=P.v[n],z=sd?(v-E)/sd:0,bg,col='#fff';
    if(z>=2){fuera++;bg='hsl('+Math.max(8,28-Math.round((z-2)*14))+' 85% 42%)';}
    else if(z<=-2){fuera++;bg='hsl(212 75% 36%)';}
    else{bg='hsl(222 24% '+(20+Math.round(Math.max(-1,Math.min(1,z/2))*4))+'%)';}
    var s=(n<10?'0':'')+n;
    html+='<a href="'+D.base+s+'/" style="background:'+bg+';color:'+col+'" title="'+s+': '+v+' veces (lo normal: '+lo+' a '+hi+')">'+s+'<small>'+v+'</small></a>';
  }
  cont.innerHTML=html;
  txt.textContent='En estos '+P.tot+' sorteos, cada número debería salir unas '+E.toFixed(1)+' veces; entre '+lo+' y '+hi+' es lo normal por azar. '+fuera+' de 100 números quedaron fuera de ese rango (naranja = más de lo normal, azul = menos). Por pura casualidad se esperan unos 4 o 5, así que no significa que vayan a salir más ni menos.';
  for(var i=0;i<bs.length;i++){bs[i].setAttribute('aria-pressed',bs[i].getAttribute('data-per')===k?'true':'false');}
}
for(var i=0;i<bs.length;i++){bs[i].addEventListener('click',function(){pintar(this.getAttribute('data-per'));});}
pintar('p90');
})();`;

const JS_MIS_NUMEROS = String.raw`(function(){
var D=JSON.parse(document.getElementById('mn-datos').textContent),MAX=10,KEY='reydis_mis_numeros';
var grid=document.getElementById('mn-grid'),res=document.getElementById('mn-res'),cnt=document.getElementById('mn-cont'),borrar=document.getElementById('mn-borrar');
var sel=[];
function f2(n){return (n<10?'0':'')+n;}
function cargar(){
  var h=(location.hash||'').replace('#','');
  if(h){sel=h.split(',').map(function(x){return parseInt(x,10);}).filter(function(x){return x>=0&&x<=99;});}
  else{try{var r=localStorage.getItem(KEY);if(r){sel=JSON.parse(r).filter(function(x){return x>=0&&x<=99;});}}catch(e){}}
  var u=[];sel.forEach(function(x){if(u.indexOf(x)<0&&u.length<MAX){u.push(x);}});sel=u;
}
function guardar(){
  try{localStorage.setItem(KEY,JSON.stringify(sel));}catch(e){}
  try{history.replaceState(null,'',sel.length?'#'+sel.join(','):location.pathname+location.search);}catch(e){}
}
function hace(d){return d===0?'hoy':(d===1?'ayer':'hace '+d+' días');}
function dibujaGrid(){
  var h='';
  for(var n=0;n<100;n++){
    var on=sel.indexOf(n)>=0,hoy=D.t[n]&&D.t[n].length;
    h+='<button type="button" data-n="'+n+'" aria-pressed="'+on+'" class="'+(hoy?'hoy':'')+'" aria-label="Número '+f2(n)+'">'+f2(n)+'</button>';
  }
  grid.innerHTML=h;
  cnt.textContent='Elegidos: '+sel.length+' de '+MAX;
  borrar.style.display=sel.length?'inline-block':'none';
}
function card(n){
  var salio=D.t[n]||[],tot=0,filas=[],sorteos=0,i;
  for(i=0;i<D.l.length;i++){
    var c=D.c[i][n],d=D.d[i][n];sorteos+=D.n[i];
    if(c>0){tot+=c;filas.push({l:D.l[i],c:c,d:d});}
  }
  filas.sort(function(a,b){return a.d-b.d||b.c-a.c;});
  var esp=sorteos*(1-Math.pow(0.99,3));
  var div=document.createElement('div');div.className='mn-tarj';
  var cab='<div class="mn-cab"><span class="bola'+(salio.length?' ya':'')+'">'+f2(n)+'</span><div>';
  cab+=salio.length?'<strong>Hoy salió en:</strong> '+salio.map(function(i){return D.l[i];}).join(', '):'<strong>Hoy todavía no ha salido.</strong>';
  cab+='<br><span class="leyenda">En el historial guardado: '+tot+' veces en '+sorteos+' sorteos (por azar se esperan unas '+esp.toFixed(0)+').</span></div></div>';
  var tabla='<table><tr><th>Lotería</th><th>Veces</th><th>Última vez</th></tr>';
  filas.slice(0,8).forEach(function(f){tabla+='<tr><td>'+f.l+'</td><td>'+f.c+'</td><td>'+hace(f.d)+'</td></tr>';});
  tabla+='</table>';
  div.innerHTML=cab+(filas.length?'<div class="tabla">'+tabla+'</div>':'<p class="leyenda">Todavía no ha salido en las loterías guardadas.</p>');
  return div;
}
function dibujaRes(){
  res.innerHTML='';
  if(!sel.length){var p=document.createElement('p');p.className='leyenda';p.textContent='Toca hasta 10 números arriba. Se guardan en este teléfono, sin crear cuenta.';res.appendChild(p);return;}
  var hoy=sel.filter(function(n){return D.t[n]&&D.t[n].length;});
  var r=document.createElement('p');r.className='mn-resumen';
  r.textContent=hoy.length?'Hoy ya salieron '+hoy.length+' de tus '+sel.length+' números: '+hoy.map(f2).join(', ')+'.':'Hoy todavía no ha salido ninguno de tus '+sel.length+' números.';
  res.appendChild(r);
  sel.slice().sort(function(a,b){return a-b;}).forEach(function(n){res.appendChild(card(n));});
}
grid.addEventListener('click',function(e){
  var b=e.target.closest('button');if(!b){return;}
  var n=parseInt(b.getAttribute('data-n'),10),i=sel.indexOf(n);
  if(i>=0){sel.splice(i,1);}else if(sel.length<MAX){sel.push(n);}
  guardar();dibujaGrid();dibujaRes();
});
borrar.addEventListener('click',function(){sel=[];guardar();dibujaGrid();dibujaRes();});
cargar();dibujaGrid();dibujaRes();
})();`;

const JS_GENERADOR = String.raw`(function(){
var D=JSON.parse(document.getElementById('gen-datos').textContent);
var sel=document.getElementById('gen-juego'),cant=document.getElementById('gen-cant'),pop=document.getElementById('gen-pop');
var btn=document.getElementById('gen-go'),out=document.getElementById('gen-out'),nota=document.getElementById('gen-nota'),acc=document.getElementById('gen-acc'),info=document.getElementById('gen-info');
var exl=document.getElementById('gen-extra-l'),ex=document.getElementById('gen-extra');
var chips=document.querySelectorAll('#gen-modos .chip'),modo='azar',ult=[];
function rnd(n){var a=new Uint32Array(1),lim=Math.floor(4294967296/n)*n;do{crypto.getRandomValues(a);}while(a[0]>=lim);return a[0]%n;}
function fmt(g,x){return g.hi>9?(x<10?'0'+x:''+x):''+x;}
function fp(p){return p<0.001?'menor a 0.001':p.toFixed(3);}
function muestra(pool,m){var r=[],b=pool.slice(),i,j,t;for(i=0;i<m;i++){j=i+rnd(b.length-i);t=b[i];b[i]=b[j];b[j]=t;r.push(b[i]);}return r;}
function popular(g,t){if(t.length<3)return false;var s=t.slice().sort(function(a,b){return a-b;}),run=1,i,j,d,k,n,alto=0;
  for(i=1;i<s.length;i++){run=(s[i]===s[i-1]+1)?run+1:1;if(run>=3)return true;}
  var has={};for(i=0;i<s.length;i++)has[s[i]]=1;
  for(i=0;i<s.length;i++){for(j=i+1;j<s.length;j++){d=s[j]-s[i];n=2;k=s[j]+d;while(has[k]){n++;k+=d;}if(n>=4)return true;}}
  if(g.hi>31){for(i=0;i<s.length;i++){if(s[i]>31)alto++;}if(alto<(t.length>=5?2:1))return true;}
  return false;}
function juego(){return D[+sel.value];}
function texto(){var g=juego();
  if(modo!=='azar'&&!g.cal.length)return 'Para este juego solo hay modo al azar por ahora: todavía no hay sorteos suficientes guardados.';
  if(modo==='azar')return 'Al azar puro: toda combinación tiene exactamente la misma probabilidad de salir. Es la forma más honesta de jugar.';
  if(modo==='calientes'){
    if(!g.vent)return 'Calientes con los últimos '+g.W+' sorteos. Todavía hay pocos sorteos guardados ('+g.n+') para probar si esto funciona; úsalo solo como criterio personal.';
    if(g.pasa)return 'Calientes con ventana de '+g.W+' sorteos. Pasó la prueba con sorteos no vistos (p = '+fp(g.wfp)+'). Es una señal que seguimos confirmando; no garantiza premios.';
    return 'Calientes con los últimos '+g.W+' sorteos. En la prueba con sorteos no vistos no le ganó al azar (p = '+fp(g.wfp)+'). Úsalo solo como criterio personal.';}
  if(g.pa<g.alfa)return 'Atrasados: el laboratorio vio algo raro (p = '+fp(g.pa)+') que hay que confirmar con datos nuevos. No garantiza premios.';
  return 'Atrasados: en el laboratorio no le ganó al azar (p = '+fp(g.pa)+'). Que un número lleve tiempo sin salir no cambia su probabilidad.';}
function popnota(){var g=juego();return pop.checked?(g.comparte?' Con "poco populares" evitamos secuencias, progresiones y combinaciones de puras fechas: no sube tu probabilidad, pero si sale, lo más probable es que compartas el premio con menos gente.':' Ojo: en este juego el premio es fijo, así que evitar combinaciones populares no cambia lo que cobras.'):'';}
function actualizar(){var g=juego();
  info.textContent=g.nota+(g.oficial?'':' (Regla no verificada: revisa con tu agencia.)');
  exl.style.display=g.extra?'flex':'none';if(g.extra)document.getElementById('gen-extra-t').textContent='Incluir el bolo adicional del '+g.extra.nombre+' ('+fmt({hi:99},g.extra.lo)+' al '+fmt({hi:99},g.extra.hi)+')';
  nota.textContent=texto()+popnota();}
function generar(){var g=juego(),m=g.pick,c=Math.max(1,Math.min(10,parseInt(cant.value,10)||1)),todos=[],x,i;
  for(x=g.lo;x<=g.hi;x++)todos.push(x);
  var rank=modo==='calientes'?g.cal:(modo==='atrasados'?g.atr:null);if(rank&&!rank.length)rank=null;
  var pool=rank?rank.slice(0,Math.min(todos.length,Math.max(m*2,6))):todos;
  ult=[];
  for(i=0;i<c;i++){var t,n=0;
    do{t=(rank&&i===0)?rank.slice(0,m):muestra(pool,m);n++;}while(pop.checked&&popular(g,t)&&n<60);
    t.sort(function(a,b){return a-b;});
    var b=null;if(g.extra&&ex.checked)b=g.extra.lo+rnd(g.extra.hi-g.extra.lo+1);
    ult.push({t:t,b:b});}
  var h='';
  ult.forEach(function(u,i){h+='<div class="gen-tk"><span class="gen-n">#'+(i+1)+'</span><span class="bolas">'+u.t.map(function(v){return '<span class="bola">'+fmt(g,v)+'</span>';}).join('')+'</span>'+(u.b!==null?'<span class="gen-n">+ '+g.extra.nombre+'</span><span class="bolas"><span class="bola ya">'+fmt({hi:99},u.b)+'</span></span>':'')+'</div>';});
  out.innerHTML=h;acc.style.display='flex';nota.textContent=texto()+popnota();}
function plano(){var g=juego();return g.nombre+' ('+modo+')\n'+ult.map(function(u,i){return (i+1)+': '+u.t.map(function(v){return fmt(g,v);}).join('-')+(u.b!==null?' + '+g.extra.nombre+' '+fmt({hi:99},u.b):'');}).join('\n')+'\nreydis.github.io/reydis-bot/generador/';}
chips.forEach(function(b){b.addEventListener('click',function(){modo=b.getAttribute('data-modo');chips.forEach(function(o){o.setAttribute('aria-pressed',o===b?'true':'false');});nota.textContent=texto()+popnota();});});
pop.addEventListener('change',function(){nota.textContent=texto()+popnota();});
sel.addEventListener('change',function(){out.innerHTML='';acc.style.display='none';actualizar();});
btn.addEventListener('click',generar);
document.getElementById('gen-copiar').addEventListener('click',function(){var t=plano(),b=this;
  function ok(){b.textContent='¡Copiado!';setTimeout(function(){b.textContent='Copiar';},1500);}
  try{navigator.clipboard.writeText(t).then(ok);}catch(e){var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy');ok();}catch(e2){}document.body.removeChild(a);}});
document.getElementById('gen-wa').addEventListener('click',function(){window.open('https://wa.me/?text='+encodeURIComponent(plano()),'_blank');});
var h0=(location.hash||'').replace('#','');if(h0){for(var q=0;q<D.length;q++){if(D[q].slug===h0){sel.value=String(q);break;}}}
actualizar();
})();`;
function jsonSeguro(o) { return JSON.stringify(o).replace(/</g, '\\u003c'); }

function paginaNumeros(series) {
  const hoy = fechaRD();
  const corte = dias => new Date(dUTC(hoy) - dias * 86400000).toISOString().slice(0, 10);
  const periodos = { p30: corte(30), p90: corte(90), todo: '0000-00-00' };
  const datos = { base: url('/numeros/'), p30: { tot: 0, v: Array(100).fill(0) }, p90: { tot: 0, v: Array(100).fill(0) }, todo: { tot: 0, v: Array(100).fill(0) } };
  for (const l of LOTERIAS) for (const s of (series[l.clave] || [])) {
    for (const [k, desde] of Object.entries(periodos)) {
      if (s.fecha < desde) continue;
      datos[k].tot++; new Set(s.nums).forEach(n => datos[k].v[n]++);
    }
  }
  const tot = datos.todo.tot, veces = datos.todo.v, max = Math.max(...veces);
  const mapa = veces.map((v, n) => `<a href="${url(`/numeros/${f2(n)}/`)}" style="background:${colorMapa(v, max)}" title="${f2(n)}: ${v} veces">${f2(n)}<small>${v}</small></a>`).join('');
  const cuerpo = `<h1>Números del 00 al 99</h1><p class="sub">Veces que salió cada número sumando todas las loterías. Toca uno para ver su detalle.</p>
<p class="chips"><button type="button" class="chip" data-per="p30" aria-pressed="false">Últimos 30 días</button><button type="button" class="chip" data-per="p90" aria-pressed="true">Últimos 90 días</button><button type="button" class="chip" data-per="todo" aria-pressed="false">Todo el historial</button></p>
<div class="mapa" id="mapa-calor">${mapa}</div>
<p class="leyenda" id="mapa-texto">En total hay ${tot} sorteos guardados. Lo esperado por azar: ~${(tot * (1 - Math.pow(0.99, 3))).toFixed(0)} veces cada número.</p>
<p><a class="boton" href="${url('/mis-numeros/')}">⭐ Sigue tus propios números</a> <a class="boton" href="${url('/generador/')}">🎟️ Generador de tickets</a></p>${avisoHonesto()}
<script type="application/json" id="mapa-datos">${jsonSeguro(datos)}</script><script>${JS_MAPA}</script>`;
  return pagina({ ruta: '/numeros/', titulo: `Mapa de calor de los números de la lotería dominicana (00-99) | ${NOMBRE_SITIO}`, descripcion: 'Mapa de los 100 números de la quiniela con las veces que ha salido cada uno en los últimos 30 días, 90 días o todo el historial, y cuánto varía por puro azar.', cuerpo });
}

function paginaMisNumeros(dias, series) {
  const hoy = fechaRD();
  const lots = LOTERIAS.filter(l => (series[l.clave] || []).length);
  const D = { l: lots.map(l => l.nombre), n: [], c: [], d: [], t: {} };
  lots.forEach((l, i) => {
    const s = series[l.clave], c = Array(100).fill(0), d = Array(100).fill(-1);
    D.n.push(s.length);
    for (const x of s) {
      const dd = Math.round((dUTC(hoy) - dUTC(x.fecha)) / 86400000);
      new Set(x.nums).forEach(n => { c[n]++; if (d[n] < 0 || dd < d[n]) d[n] = dd; });
    }
    D.c.push(c); D.d.push(d.map(v => v < 0 ? 9999 : v));
  });
  const hd = dias.find(x => x.fecha === hoy);
  for (let n = 0; n < 100; n++) D.t[n] = [];
  if (hd) lots.forEach((l, i) => { const q = hd.quinielas[l.clave]; if (q) new Set(q).forEach(n => D.t[n].push(i)); });
  const cuerpo = `<h1>Mis números</h1>
<p class="sub">Marca hasta 10 números y mira si salieron hoy, cuántas veces han salido y cuándo fue la última vez en cada lotería. Se guardan en este teléfono: sin cuenta, sin contraseña.</p>
<p class="mn-fila"><span id="mn-cont" class="leyenda">Elegidos: 0 de 10</span> <button type="button" id="mn-borrar" class="chip" style="display:none">Borrar todos</button></p>
<div class="mn-grid" id="mn-grid"></div>
<p class="leyenda">El borde verde marca los números que ya salieron hoy en alguna lotería.</p>
<div id="mn-res"></div>
<p class="leyenda">Esto describe lo que ya pasó: que un número salga seguido o lleve días sin salir no cambia su chance en el próximo sorteo. Para que te avisemos cuando sale cada resultado, únete al canal de Telegram.</p>
${ctaTelegram()}${avisoHonesto()}
<script type="application/json" id="mn-datos">${jsonSeguro(D)}</script><script>${JS_MIS_NUMEROS}</script>`;
  return pagina({ ruta: '/mis-numeros/', titulo: `Mis números: sigue tus números de la lotería | ${NOMBRE_SITIO}`, descripcion: 'Marca hasta 10 números y mira si salieron hoy, cuántas veces han salido y cuándo fue la última vez en cada lotería dominicana. Sin cuenta, se guarda en tu teléfono.', cuerpo });
}

function paginaGenerador(dias) {
  const ev = evaluarEspeciales(dias), G = ev.salida.length, alfa = 0.05 / (Math.max(G, 1) * 4);
  const prioridad = nombre => (/kino/i.test(nombre) ? 0 : /loto ?5/i.test(nombre) ? 1 : 2);
  const juegos = [...ev.salida].sort((a, b) => prioridad(a.nombre) - prioridad(b.nombre) || b.real.n - a.real.n);
  if (!juegos.length) return pagina({ ruta: '/generador/', titulo: `Generador de tickets de juegos especiales | ${NOMBRE_SITIO}`, descripcion: 'Generador de tickets para Kino, Loto 5 y otros juegos especiales de la lotería dominicana.', cuerpo: `<h1>Generador de tickets</h1><p>Todavía no hay suficientes sorteos guardados de los juegos especiales. Cuando los haya, podrás generar tickets aquí.</p>${avisoHonesto()}` });
  const D = juegos.map(s => {
    const r = s.regla, pick = r ? r.pick : Math.min(s.k, 10);
    return { nombre: s.nombre, slug: slugJuego(s.nombre), lo: s.lo, hi: s.hi, pick, oficial: !!r, nota: r ? r.nota : `Eliges ${pick} números del ${s.lo} al ${s.hi}.`, extra: r && r.extra ? r.extra : null, n: s.real.n, W: s.W, pasa: s.pasa, vent: !!s.vent, wfp: s.vent ? s.vent.wf.p : null, pa: s.real.pA, alfa, cal: s.cal.slice(0, 30), atr: s.atr.slice(0, 30) };
  });
  if (!D.some(d => /^loto$/i.test(d.nombre.trim()))) D.push({ nombre: 'Loto', slug: 'loto', lo: 1, hi: 40, pick: 6, oficial: false, nota: 'Eliges 6 números del 1 al 40 (jugada principal del Loto de Leidsa).', extra: null, n: 0, W: 30, vent: false, pasa: false, wfp: 1, pa: 1, alfa, cal: [], atr: [] });
  D.forEach(d => { d.comparte = /^loto$/i.test(d.nombre.trim()); });
  const opciones = D.map((d, i) => `<option value="${i}">${esc(d.nombre)}</option>`).join('');
  const cuerpo = `<h1>Generador de tickets · juegos especiales</h1>
<p class="sub">Genera combinaciones para Kino, Loto 5 y otros juegos especiales. Elige el juego y el modo: el generador ya sabe cuántos números lleva cada ticket y de qué rango. Sin cuenta, sin promesas.</p>
<div class="gen-form">
<label>Juego <select id="gen-juego" autocomplete="off">${opciones}</select></label>
<p class="leyenda" id="gen-info"></p>
<div class="chips" id="gen-modos"><button type="button" class="chip" data-modo="azar" aria-pressed="true">🎲 Al azar</button><button type="button" class="chip" data-modo="calientes" aria-pressed="false">🔥 Calientes</button><button type="button" class="chip" data-modo="atrasados" aria-pressed="false">⏳ Atrasados</button></div>
<label>Cantidad de tickets (hasta 10) <input type="number" id="gen-cant" min="1" max="10" value="3" inputmode="numeric" autocomplete="off"></label>
<label class="chk" id="gen-extra-l" style="display:none"><input type="checkbox" id="gen-extra" autocomplete="off"> <span id="gen-extra-t"></span></label>
<label class="chk"><input type="checkbox" id="gen-pop" autocomplete="off"> Números poco populares (sin secuencias ni solo fechas)</label>
<button type="button" id="gen-go" class="boton">Generar tickets</button>
</div>
<div id="gen-out"></div>
<div class="gen-acc" id="gen-acc" style="display:none"><button type="button" class="chip" id="gen-copiar">Copiar</button><button type="button" class="chip" id="gen-wa">Enviar por WhatsApp</button></div>
<p class="leyenda gen-nota" id="gen-nota"></p>
<h2>Cómo funcionan los modos</h2>
<ul>
<li><strong>Al azar:</strong> el modo principal. Cada combinación tiene exactamente la misma probabilidad que cualquier otra.</li>
<li><strong>Calientes:</strong> el primer ticket usa los números que más han salido en la ventana de sorteos que mejor nos ha funcionado en el laboratorio (30 si ninguna pasó la prueba); los demás se sacan al azar entre los más calientes.</li>
<li><strong>Atrasados:</strong> igual, pero con los números que más llevan sin salir.</li>
<li><strong>Números poco populares:</strong> no sube la probabilidad de ganar: toda combinación sale con la misma chance. Solo importa en juegos donde el premio mayor se reparte entre quienes aciertan, como el Loto de Leidsa: en 2023, siete personas acertaron 1-2-3-4-5-9 y se repartieron el premio (<a href="https://www.diariolibre.com/revista/sociales/2023/08/08/leidsa-entrega-29-millones-a-cinco-de-siete-ganadores/2426611" rel="noopener">Diario Libre</a>). En Kino, Loto 5 y los demás juegos el premio es fijo y esta opción no cambia lo que cobras. Evitamos secuencias, progresiones (5-10-15-20) y combinaciones de puras fechas (hasta 31).</li>
</ul>
<p>Las reglas de cada juego (cuántos números y de qué rango) vienen de las páginas oficiales de Leidsa, Loteka y La Primera; confírmalas con tu agencia antes de jugar. El <a href="${url('/laboratorio/')}">laboratorio</a> prueba estos criterios con sorteos reales, contra el azar. Si algún día encuentra algo que funcione de verdad, aparecerá allí con su valor p, antes que en ninguna promesa.</p>
${ctaTelegram()}${avisoHonesto()}
<script type="application/json" id="gen-datos">${jsonSeguro(D)}</script><script>${JS_GENERADOR}</script>`;
  return pagina({ ruta: '/generador/', titulo: `Generador de tickets de Kino, Loto 5 y juegos especiales | ${NOMBRE_SITIO}`, descripcion: 'Genera tickets al azar, con los números calientes o con los atrasados para Kino, Loto 5 y otros juegos especiales dominicanos, con el resultado honesto del laboratorio.', cuerpo });
}

// ── Juegos especiales: resultados (Súper Kino TV, Loto, Loto 5, Pega 3 Más, cuartetas…) ──
const slugJuego = clave => String(clave).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'juego';
function juegosDe(dias) {
  const m = new Map();
  for (const d of dias) for (const o of d.otros) {
    if (!m.has(o.clave)) m.set(o.clave, { clave: o.clave, slug: slugJuego(o.clave), nombre: o.nombre, empresa: o.empresa, hora: o.hora, tipo: o.tipo, sorteos: [] });
    const j = m.get(o.clave); j.nombre = o.nombre || j.nombre; j.empresa = o.empresa || j.empresa; j.hora = o.hora || j.hora; j.tipo = o.tipo || j.tipo;
    j.sorteos.push({ fecha: d.fecha, numeros: o.numeros, o });
  }
  const orden = n => (/kino/i.test(n) ? 0 : /loto ?5/i.test(n) ? 1 : /^loto\b|loto pool|pega/i.test(n) ? 2 : 3);
  return [...m.values()].sort((a, b) => orden(a.nombre) - orden(b.nombre) || b.sorteos.length - a.sorteos.length);
}
const principalesDe = (reg, nums) => (reg && reg.extra && nums.length > reg.pick ? nums.slice(0, reg.pick) : nums); // sin la bola extra (Loto 5+)
// Jugada del día de un juego especial (números calientes + récord real contra el azar). Devuelve '' si no hay datos suficientes.
function jugadaDeJuego(j, dias, h2) {
  const reg = reglaDe(j.nombre);
  const validos = j.sorteos.map(x => ({ ...x, numeros: principalesDe(reg, x.numeros) })).filter(x => enRegla(reg, x));
  if (!reg || validos.length < 40) return '';

    const evj = evaluarEspeciales(dias).salida.find(x => x.nombre === j.nombre);
    const W = evj && evj.pasa && evj.W ? evj.W : 30;
    const pick = reg.pick, drawn = validos[0].numeros.length, rango = reg.hi - reg.lo + 1;
    const calientes = (hist, w) => { const c = new Map(); hist.slice(-w).forEach(x => new Set(x.numeros).forEach(n => c.set(n, (c.get(n) || 0) + 1))); return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, pick).map(e => e[0]).sort((a, b) => a - b); };
    const ticket = calientes(validos, W);
    let aciertos = 0, n = 0;
    for (let i = Math.max(W, 20); i < validos.length; i++) { const t = calientes(validos.slice(0, i), W), sal = new Set(validos[i].numeros); aciertos += t.filter(x => sal.has(x)).length; n++; }
    const prom = n ? aciertos / n : 0, esp = pick * drawn / rango;
    return `${h2 ? `<h2>🎯 Jugada del día (${esc(j.nombre)})</h2>` : `<h3>${esc(j.nombre)}</h3>`}<p><span class="bolas">${ticket.map(x => bola(f2(x))).join('')}</span></p><p class="leyenda">${pick === 1 ? 'Es el número que más ha salido' : `Son los ${pick} números que más han salido`} en los últimos ${W} sorteos. No es una predicción: es información.</p><p>Récord real de este método en los últimos ${n} sorteos: acertó en promedio <strong>${prom.toFixed(2)}</strong> números por sorteo y el azar esperaba <strong>${esp.toFixed(2)}</strong>. ${Math.abs(prom - esp) < 0.15 * esp ? 'Prácticamente igual que el azar.' : (prom > esp * 1.3 ? 'Bastante por encima del azar en este tramo. Eso es raro: antes de confiar, mira si aguanta la prueba honesta del laboratorio.' : prom > esp ? 'Un poco por encima del azar, pero con tan pocos sorteos puede ser casualidad.' : 'Por debajo del azar.')}</p><p><a href="${url('/generador/')}#${slugJuego(j.nombre)}">🎟️ Generar tickets con otros modos</a> · <a href="${url('/laboratorio/')}">🔬 Ver el laboratorio</a></p>`;
  return '';
}
function paginaJugadasEspeciales(dias) {
  const juegos = juegosDe(dias), prio = n => (/kino/i.test(n) ? 0 : /loto ?5/i.test(n) ? 1 : 2);
  const orden = juegos.slice().sort((a, b) => prio(a.nombre) - prio(b.nombre));
  const bloques = orden.map(g => {
    const h = jugadaDeJuego(g, dias, false);
    const link = `<a href="${url('/juegos/' + g.slug + '/')}">Ver resultados de ${esc(g.nombre)} →</a>`;
    if (h) return `<div class="tarjeta" style="margin-bottom:14px">${h}<p>${link}</p></div>`;
    const reg = reglaDe(g.nombre), val = g.sorteos.filter(x => enRegla(reg, x)).length;
    return /cuarteta/i.test(g.nombre) || !reg ? '' : `<div class="tarjeta" style="margin-bottom:14px"><h3>${esc(g.nombre)}</h3><p class="leyenda">Todavía no hay suficientes sorteos válidos para probar la jugada (hay ${val}, hacen falta 40).</p><p>${link}</p></div>`;
  }).join('');
  const cuerpo = `<h1>🎯 Jugadas de los juegos especiales</h1>
<p class="sub">Kino y Loto 5 primero, luego los demás. Esta sección es nueva y la vamos mejorando: cada jugada trae su récord real contra el azar.</p>
${bloques || '<p>Todavía no hay datos suficientes de los juegos especiales.</p>'}
<p class="leyenda">Son los números que más han salido en el tramo reciente de cada juego. Es información, no una predicción: hasta hoy, ningún método le ha ganado al azar en el laboratorio.</p>
<p><a class="boton" href="${url('/generador/')}">🎟️ Generador de tickets</a> <a class="boton" href="${url('/laboratorio/')}">🔬 El laboratorio</a> <a class="boton" href="${url('/jugadas/')}">🎲 Jugadas de las quinielas</a></p>${ctaTelegram()}${avisoHonesto()}`;
  return pagina({ ruta: '/jugadas-especiales/', titulo: `Jugadas de Kino, Loto 5 y juegos especiales | ${NOMBRE_SITIO}`, descripcion: 'Los números calientes de Súper Kino TV, Loto 5 y otros juegos especiales, con su récord real contra el azar.', cuerpo });
}

function paginaJuegos(dias) {
  const juegos = juegosDe(dias), hoy = fechaRD();
  if (!juegos.length) return pagina({ ruta: '/juegos/', titulo: `Resultados de Kino, Loto y juegos especiales | ${NOMBRE_SITIO}`, descripcion: 'Resultados de Súper Kino TV, Loto, Loto 5, Pega 3 Más y otros juegos especiales de la lotería dominicana.', cuerpo: '<h1>Kino y juegos especiales</h1><p>Todavía no hay resultados guardados de estos juegos.</p>' + avisoHonesto() });
  const tarjetas = juegos.map(j => {
    const u = j.sorteos[j.sorteos.length - 1], hoyS = u.fecha === hoy;
    return `<div class="tarjeta"><h3><a href="${url('/juegos/' + j.slug + '/')}">${esc(j.nombre)}</a></h3><div class="hora">${esc([j.empresa, j.hora].filter(Boolean).join(' · '))}</div><p>${hoyS ? numerosJuegoHoy(u.o) : '<span class="pend">Pendiente hoy</span>'}</p>${hoyS ? '' : `<div class="hora">Último: ${esc(fechaCorta(u.fecha))}</div>`}<p><a href="${url('/juegos/' + j.slug + '/')}">Ver resultados →</a></p></div>`;
  }).join('');
  const cuerpo = `<h1>Kino y juegos especiales</h1>
<p class="sub">Los resultados de Súper Kino TV, Loto, Loto 5, Pega 3 Más, las cuartetas y los demás juegos de bolillas, con su historial. Toca un juego para ver los últimos sorteos.</p>
<div class="rejilla">${tarjetas}</div>
<p><a class="boton" href="${url('/jugadas-especiales/')}">🎯 Jugadas de Kino y Loto 5</a> <a class="boton" href="${url('/generador/')}">🎟️ Generador de tickets</a> <a class="boton" href="${url('/laboratorio/')}">🔬 ¿Le ganan al azar?</a></p>${avisoHonesto()}`;
  return pagina({ ruta: '/juegos/', titulo: `Resultados de Súper Kino TV, Loto, Loto 5 y juegos especiales | ${NOMBRE_SITIO}`, descripcion: 'Resultados de hoy y últimos sorteos de Súper Kino TV, Loto, Loto 5, Pega 3 Más, Loto Pool y las cuartetas de la lotería dominicana.', cuerpo });
}
// ── Página extra del Kino: estadísticas contra el azar, calculadora y revisar ticket ──
const KINO_PAGOS = { 0: 80, 5: 60, 6: 300, 7: 1000, 8: 10000, 9: 150000, 10: 25000000 };
const KINO_PRECIO = 25;
const JS_KINO = String.raw`(function(){
var D=window.KD,P=window.KP,PRECIO=window.KPRECIO,HI=window.KHI;
function $(i){return document.getElementById(i);}
function f2(n){return (n<10?'0':'')+n;}
function fc(f){var p=f.split('-');return p[2]+'/'+p[1];}
function nums(t){var m=(t||'').match(/\d+/g)||[];return m.map(Number);}
function premio(k){return P[k]||0;}
function dinero(n){return 'RD$ '+n.toLocaleString('es-DO');}
$('k-buscar').addEventListener('click',function(){
  var n=nums($('k-n').value)[0],o=$('k-res-n');
  if(!n||n<1||n>HI){o.innerHTML='<p class="leyenda">Escribe un número del 1 al '+HI+'.</p>';return;}
  var veces=0,v30=0,ult=[],desde=-1;
  for(var i=D.length-1;i>=0;i--){if(D[i][1].indexOf(n)>=0){veces++;if(D.length-1-i<30)v30++;if(ult.length<5)ult.push(D[i][0]);if(desde<0)desde=D.length-1-i;}}
  var esp=D.length*20/HI,esp30=Math.min(30,D.length)*20/HI;
  o.innerHTML='<div class="tarjeta"><h3><span class="bola">'+f2(n)+'</span> en el Kino</h3><p>Salió <strong>'+veces+'</strong> veces en '+D.length+' sorteos (por azar: unas '+esp.toFixed(1)+'). En los últimos '+Math.min(30,D.length)+': <strong>'+v30+'</strong> (esperado '+esp30.toFixed(1)+').</p><p>'+(desde<0?'No ha salido en ninguno de los sorteos guardados.':(desde===0?'Salió en el último sorteo.':'Lleva '+desde+' sorteos sin salir.'))+(ult.length?' Últimas veces: '+ult.map(fc).join(', ')+'.':'')+'</p><p class="leyenda">Que lleve mucho sin salir no lo hace más probable: la tómbola no tiene memoria.</p></div>';
});
$('k-revisar').addEventListener('click',function(){
  var a=nums($('k-t').value),o=$('k-res-t'),u={},bad=false;
  a.forEach(function(x){if(x<1||x>HI||u[x])bad=true;u[x]=1;});
  if(a.length!==10||bad){o.innerHTML='<p class="leyenda">Escribe 10 números distintos entre 1 y '+HI+' (separados por espacio o coma). Llevas '+a.length+'.</p>';return;}
  var filas='',tot=0,mejor=0,ult=D.slice(-10).reverse();
  ult.forEach(function(d){
    var h=a.filter(function(x){return d[1].indexOf(x)>=0;}),p=premio(h.length);tot+=p;if(h.length>mejor)mejor=h.length;
    filas+='<tr><td>'+fc(d[0])+'</td><td><span class="bolas" style="display:flex;flex-wrap:wrap;gap:4px;max-width:340px">'+d[1].map(function(x){return '<span class="bola'+(a.indexOf(x)>=0?' acierto':'')+'" style="'+(a.indexOf(x)>=0?'outline:2px solid var(--bien)':'opacity:.55')+'">'+f2(x)+'</span>';}).join('')+'</span></td><td><strong>'+h.length+'</strong></td><td>'+(p?dinero(p):'—')+'</td></tr>';
  });
  var gasto=ult.length*PRECIO;
  o.innerHTML='<div class="tabla" style="overflow-x:auto"><table><tr><th>Sorteo</th><th>Números (en verde, tus aciertos)</th><th>Aciertos</th><th>Premio</th></tr>'+filas+'</table></div><p>En estos '+ult.length+' sorteos habrías gastado '+dinero(gasto)+' y recibido '+dinero(tot)+'. Mejor resultado: '+mejor+' aciertos.</p><p class="leyenda">Los premios son los de nuestra tabla (ver abajo); confirma siempre con Leidsa. No guardamos tus números.</p>';
});
$('k-calc').addEventListener('click',function(){
  var t=Math.max(1,Math.floor(+$('k-tk').value||1)),d=Math.max(1,Math.floor(+$('k-dias').value||1)),rtp=window.KRTP;
  var gasto=t*d*PRECIO;
  $('k-res-c').innerHTML='<p>Jugando '+t+' ticket'+(t>1?'s':'')+' por sorteo durante '+d+' día'+(d>1?'s':'')+': gastas <strong>'+dinero(gasto)+'</strong> y, en promedio, recuperas <strong>'+dinero(Math.round(gasto*rtp))+'</strong> (pérdida esperada: '+dinero(Math.round(gasto*(1-rtp)))+'). El promedio no garantiza nada: puedes ganar más o mucho menos.</p>';
});
})();`;

function kinoExtra(validos, reg) {
  const HI = reg.hi, K = 20, S = reg.pick;
  const D = validos.map(x => ({ f: x.fecha, n: [...new Set(x.numeros)].sort((a, b) => a - b) })).filter(x => x.n.length === K);
  if (D.length < 10) return '';
  const comb = (n, k) => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };
  const total = comb(HI, S);
  const prob = k => comb(K, k) * comb(HI - K, S - k) / total;
  let rtp = 0;
  const filasP = [];
  for (let k = S; k >= 0; k--) {
    const p = prob(k), pago = KINO_PAGOS[k] || 0;
    rtp += p * pago / KINO_PRECIO;
    if (pago || k >= 5) filasP.push(`<tr><td>${k} aciertos</td><td>${pago ? 'RD$ ' + pago.toLocaleString('es-DO') : '—'}</td><td>1 de ${Math.round(1 / p).toLocaleString('es-DO')}</td><td>${(p * 100).toFixed(p < 0.0001 ? 7 : 3)} %</td></tr>`);
  }
  const ventanas = [{ n: 30, t: 'últimos 30 sorteos' }, { n: 60, t: 'últimos 60 sorteos' }, { n: D.length, t: `todos desde el ${fechaCorta(D[0].f)} (${D.length})` }]
    .filter((v, i, a) => v.n <= D.length && (i === 2 || v.n < D.length));
  const ult = new Map(); D.forEach((x, i) => x.n.forEach(n => ult.set(n, i)));
  const bloqueV = v => {
    const sub = D.slice(-v.n), c = new Array(HI + 1).fill(0);
    sub.forEach(x => x.n.forEach(n => c[n]++));
    const esp = sub.length * K / HI, sd = Math.sqrt(sub.length * (K / HI) * (1 - K / HI));
    const ord = Array.from({ length: HI }, (_, i) => i + 1).sort((a, b) => c[b] - c[a] || a - b);
    const li = (arr) => arr.map(n => `<span class="bola">${f2(n)}</span> <small>${c[n]}×</small>`).join(' &nbsp; ');
    return `<h3>${esc(v.t)}</h3><p><strong>Más salidos:</strong> ${li(ord.slice(0, 8))}</p><p><strong>Menos salidos:</strong> ${li(ord.slice(-8).reverse())}</p><p class="leyenda">Por azar cada número sale unas ${esp.toFixed(1)} veces (±${sd.toFixed(1)} es lo normal). Con ${HI} números, que algunos se alejen del promedio es de esperarse.</p>`;
  };
  const atras = Array.from({ length: HI }, (_, i) => i + 1).map(n => ({ n, g: ult.has(n) ? D.length - 1 - ult.get(n) : D.length })).sort((a, b) => b.g - a.g || a.n - b.n).slice(0, 8);
  const par = D.map(x => x.n.filter(n => n % 2 === 0).length), parProm = par.reduce((s, v) => s + v, 0) / D.length;
  const nPar = Math.floor(HI / 2), espPar = K * nPar / HI;
  const suma = D.map(x => x.n.reduce((s, v) => s + v, 0)), sumaProm = suma.reduce((s, v) => s + v, 0) / D.length, espSuma = K * (HI + 1) / 2;
  const pc = new Map(); D.forEach(x => { for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) { const k = x.n[i] * 100 + x.n[j]; pc.set(k, (pc.get(k) || 0) + 1); } });
  const topPar = [...pc.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 5);
  const espPareja = D.length * (K * (K - 1)) / (HI * (HI - 1));
  const datos = JSON.stringify(D.map(x => [x.f, x.n]));
  return `<h2>Estadísticas del Kino (${HI} bolas)</h2>
<p class="leyenda">Usamos solo los ${D.length} sorteos desde el ${esc(fechaLarga(D[0].f))}. Junto a cada dato ponemos lo que el azar puro daría, para que veas si algo es raro de verdad.</p>
${ventanas.map(bloqueV).join('')}
<h3>Más atrasados (sorteos sin salir)</h3><p>${atras.map(a => `<span class="bola">${f2(a.n)}</span> <small>${a.g}</small>`).join(' &nbsp; ')}</p><p class="leyenda">Con ${K} bolas de ${HI} por sorteo, un número se pierde en promedio ${(HI / K - 1).toFixed(1)} sorteos seguidos y a veces bastantes más. Eso no lo hace "debido".</p>
<h3>Pares, suma y parejas</h3>
<ul><li>Pares por sorteo: promedio <strong>${parProm.toFixed(1)}</strong> (azar: ${espPar.toFixed(1)}).</li><li>Suma de los ${K} números: promedio <strong>${Math.round(sumaProm)}</strong> (azar: ${Math.round(espSuma)}).</li><li>Parejas que más se repitieron: ${topPar.map(([k, v]) => `<span class="bola">${f2(Math.floor(k / 100))}</span><span class="bola">${f2(k % 100)}</span> <small>${v}×</small>`).join(' &nbsp; ')} <small>(por azar cada pareja sale ${espPareja.toFixed(1)} veces en ${D.length} sorteos)</small></li></ul>
<h2>Busca un número</h2>
<div class="gen-form"><label>Número (1 al ${HI})<input id="k-n" inputmode="numeric" placeholder="Ej: 37" style="padding:10px;border-radius:10px;border:1px solid var(--borde);background:var(--panel2);color:var(--texto)"></label><button class="boton" id="k-buscar" type="button">Buscar</button></div><div id="k-res-n"></div>
<h2>Revisa tu ticket</h2>
<p>Escribe los ${S} números de tu ticket y mira cuántos habrías acertado en los últimos 10 sorteos. Sin cuenta, sin guardar nada.</p>
<div class="gen-form"><label>Tus ${S} números<input id="k-t" placeholder="Ej: 3 12 25 31 40 47 52 66 71 80" style="padding:10px;border-radius:10px;border:1px solid var(--borde);background:var(--panel2);color:var(--texto)"></label><button class="boton" id="k-revisar" type="button">Revisar</button></div><div id="k-res-t"></div>
<h2>Calculadora de probabilidades y premios</h2>
<p>Eliges ${S} números de ${HI} y salen ${K}. Estas son las probabilidades reales de cada resultado:</p>
<div class="tabla"><table><tr><th>Resultado</th><th>Premio (RD$${KINO_PRECIO})</th><th>Probabilidad</th><th>En %</th></tr>${filasP.join('')}</table></div>
<p><strong>Retorno esperado:</strong> por cada RD$${KINO_PRECIO} que juegas, el azar te devuelve en promedio unos <strong>RD$${(rtp * KINO_PRECIO).toFixed(2)}</strong> (${(rtp * 100).toFixed(1)} %). Es la matemática del juego, no depende de qué números elijas.</p>
<div class="gen-form"><label>Tickets por sorteo<input id="k-tk" type="number" min="1" value="1" style="padding:10px;border-radius:10px;border:1px solid var(--borde);background:var(--panel2);color:var(--texto)"></label><label>Días jugando<input id="k-dias" type="number" min="1" value="30" style="padding:10px;border-radius:10px;border:1px solid var(--borde);background:var(--panel2);color:var(--texto)"></label><button class="boton" id="k-calc" type="button">Calcular</button></div><div id="k-res-c"></div>
<p class="leyenda">Los premios son los de nuestra tabla y pueden cambiar; confirma siempre con Leidsa.</p>
<script>window.KD=${datos};window.KP=${JSON.stringify(KINO_PAGOS)};window.KPRECIO=${KINO_PRECIO};window.KHI=${HI};window.KRTP=${rtp};</script><script>${JS_KINO}</script>`;
}

function paginaJuego(j, todos, dias) {
  const hoy = fechaRD(), ult = j.sorteos[j.sorteos.length - 1], hoyS = ult.fecha === hoy;
  const reg = reglaDe(j.nombre), recientes = j.sorteos.slice(-60).reverse();
  const fuera = reg ? j.sorteos.filter(x => x.numeros.some(n => n < reg.lo || n > reg.hi)).length : 0;
  const filas = recientes.map(x => { const h = x.fecha === hoy; return `<tr${h ? ' class="fila-hoy"' : ''}><td><a href="${url('/resultados/' + x.fecha + '/')}">${esc(fechaCorta(x.fecha))}</a>${h ? '<span class="insignia">HOY</span>' : ''}</td><td>${h ? numerosJuegoHoy(x.o) : numerosJuego(x.o)}</td></tr>`; }).join('');
  // Frecuencia honesta en los últimos 30 sorteos válidos
  const validos = j.sorteos.map(x => ({ ...x, numeros: principalesDe(reg, x.numeros) })).filter(x => enRegla(reg, x));
  const val = validos.slice(-30);
  let frec = '';
  if (reg && val.length >= 10) {
    const c = new Map(); val.forEach(x => new Set(x.numeros).forEach(n => c.set(n, (c.get(n) || 0) + 1)));
    const k = val[0].numeros.length, rango = reg.hi - reg.lo + 1, esp = val.length * k / rango;
    const top = [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 8);
    frec = `<h2>Los que más han salido (últimos ${val.length} sorteos)</h2><p>${top.map(([n, v]) => `<span class="bola">${f2(n)}</span> <small>${v}×</small>`).join(' &nbsp; ')}</p><p class="leyenda">Por azar, cada número salía unas ${esp.toFixed(1)} veces en ese tramo. Que uno haya salido más no lo hace más probable en el próximo sorteo.</p>`;
  }
  const jugada = jugadaDeJuego(j, dias, true);
  const avisoDesde = reg && reg.desde ? `<p class="leyenda">Desde el ${esc(fechaLarga(reg.desde))} este juego se juega con ${reg.hi} bolas (antes eran menos). Las estadísticas y la jugada del día usan solo los sorteos desde esa fecha, para no mezclar dos bolilleros distintos.</p>` : '';
  const aviso = avisoDesde + (fuera ? `<p class="leyenda">Nota: ${fuera} sorteo${fuera > 1 ? 's' : ''} de este juego traen números fuera del rango oficial (${reg.lo}–${reg.hi}); se muestran tal como llegaron, pero no se usan en las estadísticas.</p>` : '');
  const cuerpo = `<h1>${esc(j.nombre)}: resultados y últimos sorteos</h1>
<p class="sub">${esc([j.empresa, j.hora].filter(Boolean).join(' · '))}${reg ? ' · ' + esc(reg.nota) : ''}</p>
<div class="tarjeta${hoyS ? ' hoy' : ''}"><h3>${hoyS ? 'Resultado de hoy <span class="insignia">HOY</span>' : 'Hoy: pendiente'}</h3>${hoyS ? '' : `<div class="hora">Último resultado: ${esc(fechaLarga(ult.fecha))}</div>`}<p>${hoyS ? numerosJuegoHoy(ult.o) : numerosJuego(ult.o)}</p></div>
<h2>Últimos sorteos</h2><div class="tabla"><table><tr><th>Día</th><th>Números</th></tr>${filas}</table></div>
${jugada}${frec}${reg && /kino/i.test(j.nombre) ? kinoExtra(validos, reg) : ''}${aviso}
<p><a href="${url('/juegos/')}">← Todos los juegos</a> · <a class="boton" href="${url('/generador/')}#${slugJuego(j.nombre)}">🎟️ Generador de tickets</a></p>${ctaTelegram()}${avisoHonesto()}`;
  return pagina({ ruta: '/juegos/' + j.slug + '/', titulo: `${j.nombre} hoy: resultados y últimos sorteos | ${NOMBRE_SITIO}`, descripcion: `Resultado de ${j.nombre} de hoy y de los últimos sorteos, con los números que más han salido.`, cuerpo });
}

function paginaFecha(dia, anterior, siguiente) {
  const marc = marcadosRadar(dia.fecha);
  const filas = LOTERIAS.filter(l => dia.quinielas[l.clave]).map(l => `<tr><td><a href="${url(`/loterias/${l.slug}/`)}">${esc(l.nombre)}</a></td><td>${esc(l.hora)}</td><td>${marc.size ? `<span class="bolas">${dia.quinielas[l.clave].map(n => bola(f2(n), marc.has(n) ? ' ya' : '')).join('')}</span>` : bolas(dia.quinielas[l.clave])}</td></tr>`).join('');
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
// ── Juegos especiales (Kino, Loto, Loto 5, Pega 3, cuartetas…) en el laboratorio ──
function pNormal2(z) { // p de dos colas de una normal estándar
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.5 * x);
  const r = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return Math.min(1, r);
}
function muestraEsp(rnd, N, k, repl) { // un sorteo al azar: k bolas de N, con o sin repetición
  if (repl) return Array.from({ length: k }, () => Math.floor(rnd() * N));
  const bolsa = Array.from({ length: N }, (_, i) => i), r = [];
  for (let i = 0; i < k; i++) { const j = i + Math.floor(rnd() * (N - i)); [bolsa[i], bolsa[j]] = [bolsa[j], bolsa[i]]; r.push(bolsa[i]); }
  return r;
}
// sorteos: lista de arreglos de números (0..N-1 ya recentrados), en orden cronológico.
function analizarEspecial(sorteos, N, k, repl, rnd) {
  const n = sorteos.length, W = 30;
  const conjuntos = sorteos.map(s => new Set(s));
  // 1) ¿Salen parejos? Pearson contra el azar, p por simulación.
  const pearson = lista => { const c = new Array(N).fill(0); for (const s of lista) for (const x of s) c[x]++; const E = lista.length * k / N; let X = 0; for (const v of c) X += (v - E) * (v - E) / E; return X; };
  const Xobs = pearson(sorteos), B = 500; let mayores = 0;
  for (let b = 0; b < B; b++) { const sim = []; for (let i = 0; i < n; i++) sim.push(muestraEsp(rnd, N, k, repl)); if (pearson(sim) >= Xobs) mayores++; }
  const pU = (1 + mayores) / (B + 1);
  // medias y varianzas del azar para "cuántas bolas de un conjunto de k salen en un sorteo"
  let mu, vr;
  if (repl) { const q = 1 - Math.pow(1 - 1 / N, k); mu = k * q; vr = k * q * (1 - q); }
  else { mu = k * k / N; vr = N > 1 ? k * (k / N) * (1 - k / N) * ((N - k) / (N - 1)) : 0; }
  const zDe = (suma, T, m, v) => (T > 0 && v > 0) ? (suma - T * m) / Math.sqrt(T * v) : 0;
  // 2) ¿Se repiten las bolas del sorteo anterior?
  let ov = 0;
  for (let i = 1; i < n; i++) for (const x of conjuntos[i]) if (conjuntos[i - 1].has(x)) ov++;
  let muR, vrR;
  if (repl) { const q = 1 - Math.pow(1 - 1 / N, k); muR = N * q * q; vrR = N * q * q * (1 - q * q); } else { muR = mu; vrR = vr; }
  const zR = zDe(ov, n - 1, muR, vrR);
  // 3) "Calientes": las k bolas más frecuentes de los últimos 30 sorteos. 4) "Atrasados": las k que más llevan sin salir.
  let hC = 0, hA = 0, T = 0;
  const ultima = new Array(N).fill(-1);
  for (let i = 0; i < n; i++) {
    if (i >= W) {
      const c = new Array(N).fill(0);
      for (let j = i - W; j < i; j++) for (const x of conjuntos[j]) c[x]++;
      const idx = Array.from({ length: N }, (_, x) => x);
      const calientes = idx.slice().sort((a, b) => c[b] - c[a] || a - b).slice(0, k);
      const atrasados = idx.slice().sort((a, b) => ultima[a] - ultima[b] || a - b).slice(0, k);
      for (const x of calientes) if (conjuntos[i].has(x)) hC++;
      for (const x of atrasados) if (conjuntos[i].has(x)) hA++;
      T++;
    }
    for (const x of conjuntos[i]) ultima[x] = i;
  }
  const expectedPerDraw = repl ? k * (1 - Math.pow(1 - 1 / N, k)) : k * k / N;
  return { n, k, N, repl, pU, pR: pNormal2(zR), pC: pNormal2(zDe(hC, T, mu, vr)), pA: pNormal2(zDe(hA, T, mu, vr)), T, hC, hA, esperado: T * expectedPerDraw, sobreR: ov, esperadoR: (n - 1) * muR };
}
// ── Ventanas de "calientes": ¿hay una ventana que funcione? Se elige con el pasado y se evalúa con sorteos NO vistos ──
const VENTANAS = [5, 7, 10, 15, 20, 30, 60];
function analizarVentanas(sorteos, N, k, repl) {
  const W0 = 60, CALENTAR = 30;
  if (sorteos.length > 1500) sorteos = sorteos.slice(-1500);
  const n = sorteos.length;
  if (n < W0 + CALENTAR + 20) return null;
  const conj = sorteos.map(x => new Set(x));
  let mu, vr;
  if (repl) { const q = 1 - Math.pow(1 - 1 / N, k); mu = k * q; vr = k * q * (1 - q); }
  else { mu = k * k / N; vr = N > 1 ? k * (k / N) * (1 - k / N) * ((N - k) / (N - 1)) : 0; }
  const idx = Array.from({ length: N }, (_, x) => x);
  const h = VENTANAS.map(() => new Array(n).fill(0));
  for (let i = W0; i < n; i++) VENTANAS.forEach((W, wi) => {
    const c = new Array(N).fill(0);
    for (let j = i - W; j < i; j++) for (const x of conj[j]) c[x]++;
    const top = idx.slice().sort((a, b) => c[b] - c[a] || a - b).slice(0, k);
    let g = 0; for (const x of top) if (conj[i].has(x)) g++;
    h[wi][i] = g;
  });
  const zDe = (suma, T) => (T > 0 && vr > 0) ? (suma - T * mu) / Math.sqrt(T * vr) : 0;
  const T = n - W0;
  const ventanas = VENTANAS.map((W, wi) => { let suma = 0; for (let i = W0; i < n; i++) suma += h[wi][i]; const z = zDe(suma, T); return { W, hits: suma, z, p: pNormal2(z) }; });
  // Camino en vivo: cada día se escoge la ventana que mejor le fue ANTES de ese día y se mide qué tal le va ESE día.
  const acum = VENTANAS.map(() => 0), elegidas = {}; let hits = 0, Twf = 0;
  for (let i = W0; i < n; i++) {
    if (i >= W0 + CALENTAR) {
      let mejor = VENTANAS.length - 1;
      for (let wi = VENTANAS.length - 1; wi >= 0; wi--) if (acum[wi] > acum[mejor]) mejor = wi;
      hits += h[mejor][i]; Twf++; elegidas[VENTANAS[mejor]] = (elegidas[VENTANAS[mejor]] || 0) + 1;
    }
    VENTANAS.forEach((W, wi) => { acum[wi] += h[wi][i]; });
  }
  const zw = zDe(hits, Twf);
  let Wmas = 30, mx = -1; for (const [W, v] of Object.entries(elegidas)) if (v > mx || (v === mx && +W > Wmas)) { mx = v; Wmas = +W; }
  return { n, T, ventanas, wf: { T: Twf, hits, esperado: Twf * mu, z: zw, p: pNormal2(zw) }, Wmas, mejorW: ventanas.slice().sort((a, b) => b.z - a.z)[0].W };
}
// Reglas oficiales de cada juego (según las páginas de Leidsa, Loteka y La Primera): cuántos números se juegan y de qué rango.
const REGLAS_ESPECIALES = [
  { re: /kino/i, pick: 10, lo: 1, hi: 84, desde: '2026-09-20', nota: 'Eliges 10 números del 1 al 84. En cada sorteo salen 20.' }, // desde el 20 de sept. de 2026 el Kino se juega con 84 bolas (antes 80)
  { re: /loto ?5/i, pick: 5, lo: 1, hi: 38, extra: { lo: 1, hi: 10, nombre: 'Loto 5+' }, nota: 'Eliges 5 números del 01 al 38. Opcional: el bolo adicional del Loto 5+ (01 al 10), que se paga aparte.' },
  { re: /loto ?pool.*real/i, pick: 4, lo: 0, hi: 99, nota: 'Eliges 4 números del 00 al 99.' },
  { re: /loto ?pool/i, pick: 5, lo: 1, hi: 31, nota: 'Eliges 5 números del 01 al 31.' },
  { re: /pega ?3/i, pick: 3, lo: 0, hi: 50, nota: 'Eliges 3 números del 00 al 50 (tres tómbolas con bolos del 0 al 50).' },
  { re: /mega ?chance/i, pick: 5, lo: 0, hi: 99, nota: 'Eliges 5 números del 00 al 99.' },
  { re: /quemaito/i, pick: 1, lo: 0, hi: 99, nota: 'Eliges 1 número del 00 al 99.' },
  { re: /cuarteta/i, pick: 4, lo: 0, hi: 99, nota: 'Eliges 4 números del 00 al 99.' }
];
const reglaDe = nombre => REGLAS_ESPECIALES.find(r => r.re.test(nombre)) || null;
const enRegla = (reg, x) => !reg || ((!reg.desde || x.fecha >= reg.desde) && x.numeros.every(n => n >= reg.lo && n <= reg.hi)); // sorteo válido: del bolillero vigente y dentro del rango oficial
let _memoEsp = null;
function evaluarEspeciales(dias) {
  if (_memoEsp && _memoEsp.dias === dias) return _memoEsp.val;
  const val = evaluarEspeciales0(dias);
  _memoEsp = { dias, val };
  return val;
}
function evaluarEspeciales0(dias) {
  const juegos = new Map();
  for (const d of dias) for (const o of d.otros) {
    if (/loto.*m[aá]s|s[uú]per ?m[aá]s/i.test(o.nombre + ' ' + o.clave)) continue; // bolas de rangos distintos: no se puede probar como un solo bolillero
    if (!juegos.has(o.clave)) juegos.set(o.clave, { clave: o.clave, nombre: o.nombre, tipo: o.tipo, empresa: o.empresa, lista: [], fechas: [] });
    juegos.get(o.clave).lista.push(o.numeros); juegos.get(o.clave).fechas.push(d.fecha);
  }
  const salida = [], pocos = [];
  let idx = 0;
  for (const j of [...juegos.values()].sort((a, b) => b.lista.length - a.lista.length)) {
    idx++;
    const largos = {}; for (const s of j.lista) largos[s.length] = (largos[s.length] || 0) + 1;
    let k = +Object.entries(largos).sort((a, b) => b[1] - a[1])[0][0];
    let lista = j.lista.filter(s => s.length === k);
    let fl = j.fechas.filter((_, i) => j.lista[i].length === k);
    { const r0 = reglaDe(j.nombre); if (r0 && r0.desde) { const keep = fl.map(f => f >= r0.desde); lista = lista.filter((_, i) => keep[i]); fl = fl.filter((_, i) => keep[i]); } } // solo el bolillero vigente
    if (lista.length < 60) { pocos.push({ nombre: j.nombre, n: lista.length }); continue; }
    const dup = s => new Set(s).size < s.length;
    let bonus = false;
    // Si solo se repite cuando se cuenta la última bola, esa última es una bola extra de otro bolillero: se prueba sin ella.
    if (!/^pega/.test(j.tipo) && k > 2 && lista.some(dup) && lista.every(s => !dup(s.slice(0, -1)))) { lista = lista.map(s => s.slice(0, -1)); k -= 1; bonus = true; }
    const repl = /^pega/.test(j.tipo) || lista.some(dup);
    // Si conocemos la regla oficial del juego, el rango es el oficial y los sorteos con números fuera de ese rango (error de la fuente) se descartan.
    const regla = reglaDe(j.nombre);
    let fuera = 0, fueraFechas = [];
    let lo = Math.min(...lista.map(s => Math.min(...s))), hi = Math.max(...lista.map(s => Math.max(...s)));
    if (regla) {
      const bien = lista.map(s => s.every(x => x >= regla.lo && x <= regla.hi));
      fueraFechas = fl.filter((_, i) => !bien[i]);
      fuera = fueraFechas.length; lista = lista.filter((_, i) => bien[i]); fl = fl.filter((_, i) => bien[i]); lo = regla.lo; hi = regla.hi;
      if (lista.length < 60) { pocos.push({ nombre: j.nombre, n: lista.length }); continue; }
    } else {
      // Sin regla conocida el rango sale de lo que realmente ha salido: solo se completa a 0-9 o 00-99 cuando es claro.
      if (/^pega/.test(j.tipo) && hi <= 9) { lo = 0; hi = 9; } else if (lo <= 9 && hi >= 90 && hi <= 99) { lo = 0; hi = 99; }
    }
    const N = hi - lo + 1;
    if (N < 5 || k >= N) { pocos.push({ nombre: j.nombre, n: lista.length }); continue; }
    const norm = lista.map(s => s.map(x => x - lo));
    const real = analizarEspecial(norm, N, k, repl, mulberry32(20261124 + idx));
    const rc = mulberry32(777000 + idx);
    const controlNorm = norm.map(() => muestraEsp(rc, N, k, repl));
    const control = analizarEspecial(controlNorm, N, k, repl, mulberry32(555000 + idx));
    const vent = analizarVentanas(norm, N, k, repl), ventC = analizarVentanas(controlNorm, N, k, repl);
    salida.push({ nombre: j.nombre, empresa: j.empresa, lo, hi, bonus, real, control, vent, ventC, norm, N, k, repl, regla, fuera, fueraFechas, porDia: fl.length / Math.max(1, Math.round((dUTC(fl[fl.length - 1]) - dUTC(fl[0])) / 86400000) + 1) });
  }
  // Veredicto de la prueba con sorteos no vistos (una por juego) y datos para el generador
  const G = salida.length;
  for (const s of salida) {
    const pasa = v => !!v && v.wf.z > 0 && v.wf.p < 0.05 / G;
    s.pasa = pasa(s.vent); s.pasaC = pasa(s.ventC);
    s.W = s.pasa ? s.vent.Wmas : 30;
    const cuenta = new Array(s.N).fill(0);
    for (const x of s.norm.slice(-s.W)) for (const b of new Set(x)) cuenta[b]++;
    const orden = Array.from({ length: s.N }, (_, x) => x);
    s.cal = orden.slice().sort((a, b) => cuenta[b] - cuenta[a] || a - b).map(x => x + s.lo);
    const ult = new Array(s.N).fill(-1); s.norm.forEach((x, i) => { for (const b of x) ult[b] = i; });
    s.atr = orden.slice().sort((a, b) => ult[a] - ult[b] || a - b).map(x => x + s.lo);
  }
  return { salida, pocos };
}
function seccionVentanas(ev) {
  const G = ev.salida.length, conV = ev.salida.filter(s => s.vent);
  if (!conV.length) return `<h3>¿Y si buscamos la ventana de "calientes" que mejor funcione?</h3><p>Para probar varias ventanas con sorteos que todavía no se han visto hacen falta al menos 110 sorteos de un juego. Todavía ningún juego llega a esa cantidad; cuando llegue, aparecerá aquí.</p>`;
  const alfaV = 0.05 / (conV.length * VENTANAS.length), fp = p => p < 0.001 ? '&lt;0.001' : p.toFixed(3);
  const celda = v => `<td>${fp(v.p)}${v.z > 0 ? ' ↑' : ' ↓'}${v.p < alfaV && v.z > 0 ? ' 🚨' : (v.p < 0.05 && v.z > 0 ? ' 👀' : '')}</td>`;
  const filas = ev.salida.map(s => {
    if (!s.vent) return `<tr><td>${esc(s.nombre)}</td><td colspan="${VENTANAS.length + 2}">Pocos sorteos para esta prueba (${s.real.n}; hacen falta 110)</td></tr>`;
    const w = s.vent.wf;
    const dps = s.porDia > 0 ? 1 / s.porDia : 1;
    return `<tr><td>${esc(s.nombre)}<br><small class="leyenda">1 sorteo ≈ ${dps < 1.15 ? '1 día' : dps.toFixed(1).replace(/\.0$/, '') + ' días'}</small></td>${s.vent.ventanas.map(celda).join('')}<td>${w.hits} aciertos vs ${w.esperado.toFixed(0)} esperados · p=${fp(w.p)}</td><td>${s.pasa ? '<strong>Señal: seguir confirmando</strong>' : 'Sin ventaja comprobada'}</td></tr>`;
  }).join('');
  const bajoR = conV.reduce((t, s) => t + s.vent.ventanas.filter(v => v.p < 0.05 && v.z > 0).length, 0);
  const bajoC = conV.reduce((t, s) => t + (s.ventC ? s.ventC.ventanas.filter(v => v.p < 0.05 && v.z > 0).length : 0), 0);
  const pasanR = conV.filter(s => s.pasa).length, pasanC = conV.filter(s => s.pasaC).length;
  return `<h3>¿Y si buscamos la ventana de "calientes" que mejor funcione?</h3>
<p>Los "calientes" de arriba usan los últimos 30 sorteos. Probamos también ventanas de ${VENTANAS.join(', ')} sorteos. Ojo con la trampa: si escogemos la ventana que mejor le atinó al pasado, siempre habrá una que se ve bien por pura suerte. Por eso hacemos dos cosas:</p>
<ul>
<li>Cada ventana se mide con una vara más estricta, porque son más pruebas: solo cuenta (🚨) lo que baja de ${alfaV.toFixed(4)}. La flecha ↑ dice que acertó más que el azar y ↓ que acertó menos.</li>
<li><strong>Prueba con sorteos no vistos:</strong> el laboratorio juega "en vivo". Cada día escoge la ventana que mejor le había ido hasta el día anterior y mide cómo le va ese día. Los primeros 90 sorteos solo sirven para calentar. Si una ventana solo funciona mirando atrás, aquí se cae.</li>
</ul>
<div class="tabla"><table><tr><th>Juego</th>${VENTANAS.map(W => `<th>${W}</th>`).join('')}<th>Prueba con sorteos no vistos</th><th>Lectura</th></tr>${filas}</table></div>
<p><strong>Contra el control:</strong> con datos reales, ${bajoR} ventanas dieron p menor a 0.05 a favor de los calientes y ${pasanR} de ${conV.length} juegos pasaron la prueba con sorteos no vistos. Con sorteos inventados al azar dieron ${bajoC} y ${pasanC}. Si los números reales se parecen a los del control, es azar.</p>
<p><a class="boton" href="${url('/generador/')}">🎟️ Generador de tickets de juegos especiales</a></p>`;
}
function seccionEspeciales(dias) {
  const ev = evaluarEspeciales(dias);
  if (!ev.salida.length) return `<h2>Los juegos especiales: Kino, Loto, Loto 5 y compañía</h2><p>Todavía no hay suficientes sorteos guardados de estos juegos para probarlos (se necesitan al menos 60 de cada uno). Cuando los haya, aparecerán aquí con las mismas reglas.</p>`;
  const G = ev.salida.length, alfa = 0.05 / (G * 4);
  const fp = p => p < 0.001 ? '&lt;0.001' : p.toFixed(3);
  const marca = p => p < alfa ? ' 🚨' : (p < 0.05 ? ' 👀' : '');
  const filas = ev.salida.map(s => {
    const r = s.real, ps = [r.pU, r.pR, r.pC, r.pA];
    const lectura = ps.some(p => p < alfa) ? '<strong>Revisar y confirmar con datos nuevos</strong>' : (ps.some(p => p < 0.05) ? 'Algo "cerca", normal por casualidad' : 'Como el azar');
    return `<tr><td>${esc(s.nombre)}</td><td>${r.n}</td><td>${r.k} de ${r.N}${s.bonus ? ' + bola extra' : ''}${r.repl ? ' (pueden repetirse)' : ''}</td><td>${fp(r.pU)}${marca(r.pU)}</td><td>${fp(r.pR)}${marca(r.pR)}</td><td>${fp(r.pC)}${marca(r.pC)}</td><td>${fp(r.pA)}${marca(r.pA)}</td><td>${lectura}</td></tr>`;
  }).join('');
  const pruebas = ev.salida.reduce((t, s) => t + 4, 0);
  const bajoReal = ev.salida.reduce((t, s) => t + [s.real.pU, s.real.pR, s.real.pC, s.real.pA].filter(p => p < 0.05).length, 0);
  const bajoCtrl = ev.salida.reduce((t, s) => t + [s.control.pU, s.control.pR, s.control.pC, s.control.pA].filter(p => p < 0.05).length, 0);
  const fuertes = ev.salida.reduce((t, s) => t + [s.real.pU, s.real.pR, s.real.pC, s.real.pA].filter(p => p < alfa).length, 0);
  const descartados = ev.salida.filter(x => x.fuera > 0);
  const avisoFuera = descartados.length ? `<p class="leyenda">Se descartaron sorteos con números fuera del rango oficial del juego (casi seguro un error de la fuente): ${descartados.map(x => `${esc(x.nombre)} (${x.fuera})`).join(', ')}. La prueba usa el rango oficial de cada juego.</p>${descartados.map(x => `<details><summary>Ver las fechas descartadas de ${esc(x.nombre)}</summary><p class="leyenda">${x.fueraFechas.slice(-80).join(', ')}</p></details>`).join('')}` : '';
  const pocos = ev.pocos.length ? `<p class="leyenda">Todavía con pocos sorteos guardados (menos de 60) y por eso sin probar: ${ev.pocos.map(p => `${esc(p.nombre)} (${p.n})`).join(', ')}.</p>` : '';
  return `<h2>Los juegos especiales: Kino, Loto, Loto 5 y compañía</h2>
<p>Además de las quinielas, el Radar guarda juegos de bolillas como Super Kino TV, Loto, Loto 5, Pega 3 Más, las cuartetas y los Loto Pool. A cada uno le hacemos cuatro pruebas contra el azar puro:</p>
<ul>
<li><strong>Reparto:</strong> ¿alguna bola sale bastante más o menos que las demás?</li>
<li><strong>Repite:</strong> ¿las bolas del sorteo anterior vuelven al siguiente más de lo normal?</li>
<li><strong>Calientes:</strong> si cada vez apostáramos a las bolas más frecuentes de los últimos 30 sorteos, ¿acertaríamos más que al azar?</li>
<li><strong>Atrasados:</strong> si apostáramos a las que más llevan sin salir, ¿acertaríamos más que al azar?</li>
</ul>
<p>Cada celda es un <strong>p</strong>: mide qué tan raro sería ver ese resultado si el juego fuera puro azar. Un p chiquito (👀 menos de 0.05) llama la atención, pero con tantas pruebas siempre aparecen algunos por casualidad. Solo cuenta como señal fuerte (🚨) lo que baja de ${alfa.toFixed(4)}, que es 0.05 repartido entre las ${pruebas} pruebas.</p>
<div class="tabla"><table><tr><th>Juego</th><th>Sorteos</th><th>Cómo se saca</th><th>Reparto</th><th>Repite</th><th>Calientes</th><th>Atrasados</th><th>Lectura</th></tr>${filas}</table></div>
<p><strong>Cómo se ve contra un control:</strong> de las ${pruebas} pruebas con datos reales, ${bajoReal} dieron p menor a 0.05 y ${fuertes} pasaron la vara estricta. Con sorteos inventados al azar, con el mismo número de sorteos y bolas, dieron p menor a 0.05 ${bajoCtrl} de ${pruebas}. Por pura casualidad se esperan unas ${(pruebas * 0.05).toFixed(1)}.</p>
<p class="leyenda">Cómo se hizo: se supone que todas las bolas de un sorteo salen del mismo bolillero, del menor al mayor número que ha salido. Si un juego mezcla bolillas distintas (por ejemplo una extra), la prueba puede salir rara por eso y no por un sesgo. Loto Más y Súper Más no se prueban por ese motivo. El p de "Reparto" se calcula simulando el juego al azar 500 veces.</p>
${avisoFuera}
${seccionVentanas(ev)}
${pocos}`;
}

// 🔁 Repeticiones entre loterías: ¿los mismos números salen en varias loterías el mismo día más de lo que daría el azar?
function paginaRepeticiones(dias) {
  const q = 1 - Math.pow(0.99, 3); // probabilidad de que un número dado aparezca en una quiniela (3 números de 100)
  const lots = [...LOTERIAS].sort((a, b) => minLoteria(a.hora) - minLoteria(b.hora));
  const compl = dias.filter(d => Object.keys(d.quinielas).length >= 8);
  const hoy = fechaRD();
  const pasado = compl.filter(d => d.fecha < hoy);
  const conj = d => { const o = {}; for (const l of lots) { const a = d.quinielas[l.clave]; if (Array.isArray(a) && a.length === 3) o[l.clave] = new Set(a); } return o; };
  const base = pasado.map(d => ({ fecha: d.fecha, s: conj(d) }));
  const pSup = (c, lam) => c <= 0 ? 1 : Math.min(1, Math.max(0, 1 - gammaQ(c, lam)));
  // semilla fija para que el resultado sea reproducible
  let semilla = 20261126; const rnd = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 4294967296; };
  const sim = d0 => { const o = {}; for (const k of Object.keys(d0)) o[k] = new Set([Math.floor(rnd() * 100), Math.floor(rnd() * 100), Math.floor(rnd() * 100)]); return o; };
  const repetidosDia = s => { const c = new Array(100).fill(0); for (const k in s) for (const n of s[k]) c[n]++; return c.filter(x => x >= 2).length; };
  const enMasDe = s => { const c = new Array(100).fill(0); for (const k in s) for (const n of s[k]) c[n]++; return c; };
  // 1) Resumen diario contra Monte Carlo
  const obs = base.map(b => repetidosDia(b.s)), obsTot = obs.reduce((a, b) => a + b, 0);
  const N = 600, tots = [];
  for (let i = 0; i < N; i++) { let t = 0; for (const b of base) t += repetidosDia(sim(b.s)); tots.push(t); }
  const media = tots.reduce((a, b) => a + b, 0) / (N || 1), sd = Math.sqrt(tots.reduce((a, b) => a + (b - media) ** 2, 0) / (N || 1)) || 1;
  const pDiario = (tots.filter(t => t >= obsTot).length + 1) / (N + 1);
  const nd = base.length;
  const prom = nd ? obsTot / nd : 0, promAzar = nd ? media / nd : 0;
  // 2) Pares de loterías
  const calcPares = datos => {
    const filas = [];
    for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) {
      const A = lots[i].clave, B = lots[j].clave; let juntos = 0, rep = 0;
      for (const b of datos) { if (b.s[A] && b.s[B]) { juntos++; for (const n of b.s[A]) if (b.s[B].has(n)) rep++; } }
      if (juntos < 30) continue;
      const lam = juntos * 100 * q * q; filas.push({ A: lots[i], B: lots[j], juntos, rep, lam, p: pSup(rep, lam) });
    }
    return filas;
  };
  const pares = calcPares(base).sort((a, b) => a.p - b.p);
  const alfaB = pares.length ? 0.05 / pares.length : 0.05;
  const bajo05 = pares.filter(x => p05(x)).length; function p05(x) { return x.p < 0.05; }
  const fuertes = pares.filter(x => x.p < alfaB).length;
  let ctrl = 0; const R = 20; for (let r = 0; r < R; r++) ctrl += calcPares(base.map(b => ({ fecha: b.fecha, s: sim(b.s) }))).filter(x => x.p < 0.05).length;
  const ctrlProm = ctrl / R;
  // 3) Misma lotería, día siguiente
  const mis = [];
  for (const l of lots) {
    let juntos = 0, rep = 0;
    for (let i = 1; i < base.length; i++) {
      const a = base[i - 1], b = base[i]; const dd = (new Date(b.fecha) - new Date(a.fecha)) / 864e5; if (dd !== 1) continue;
      if (a.s[l.clave] && b.s[l.clave]) { juntos++; for (const n of b.s[l.clave]) if (a.s[l.clave].has(n)) rep++; }
    }
    if (juntos < 30) continue; const lam = juntos * 100 * q * q; mis.push({ l, juntos, rep, lam, p: pSup(rep, lam) });
  }
  mis.sort((a, b) => a.p - b.p);
  const alfaM = mis.length ? 0.05 / mis.length : 0.05;
  // 4) Por lotería: repeticiones con todas las demás
  const porLot = lots.map(l => {
    let juntosTot = 0, rep = 0, lam = 0;
    for (const b of base) { if (!b.s[l.clave]) continue; for (const o of lots) { if (o.clave === l.clave || !b.s[o.clave]) continue; juntosTot++; lam += 100 * q * q; for (const n of b.s[l.clave]) if (b.s[o.clave].has(n)) rep++; } }
    return { l, rep, lam, p: pSup(rep, lam) };
  }).filter(x => x.lam > 0).sort((a, b) => (b.rep / b.lam) - (a.rep / a.lam));
  const marca = (p, a) => `${p < a ? '🚨 ' : p < 0.05 ? '👀 ' : ''}${p < 0.001 ? p.toExponential(1) : p.toFixed(3)}`;
  const veces = (r, l) => l ? (r / l).toFixed(2) + '×' : '–';
  const filaPar = x => `<tr><td>${esc(x.A.nombre)} → ${esc(x.B.nombre)}</td><td>${x.juntos}</td><td>${x.rep}</td><td>${x.lam.toFixed(1)}</td><td>${veces(x.rep, x.lam)}</td><td>${marca(x.p, alfaB)}</td></tr>`;
  const tPares = pares.slice(0, 15).map(filaPar).join('');
  const tMis = mis.map(x => `<tr><td>${esc(x.l.nombre)}</td><td>${x.juntos}</td><td>${x.rep}</td><td>${x.lam.toFixed(1)}</td><td>${veces(x.rep, x.lam)}</td><td>${marca(x.p, alfaM)}</td></tr>`).join('');
  const tLot = porLot.map(x => `<tr><td>${esc(x.l.nombre)}</td><td>${x.rep}</td><td>${x.lam.toFixed(0)}</td><td>${veces(x.rep, x.lam)}</td></tr>`).join('');
  // número que más se repite entre loterías (conteo bruto, con su esperado)
  const cnt = new Array(100).fill(0); let lotSalidas = 0;
  for (const b of base) { const c = enMasDe(b.s); for (let n = 0; n < 100; n++) if (c[n] >= 2) cnt[n]++; }
  const topNum = cnt.map((c, n) => ({ n, c })).sort((a, b) => b.c - a.c).slice(0, 10);
  const esperadoNum = nd ? media / 100 : 0;
  const tNum = topNum.map(x => `<tr><td>${bola(x.n)}</td><td>${x.c}</td><td>${esperadoNum.toFixed(1)}</td><td>${veces(x.c, esperadoNum)}</td></tr>`).join('');
  const veredicto = !nd ? 'Todavía no hay suficientes días completos.'
    : (fuertes > 0 || pDiario < 0.01) ? '<strong>Hay una señal que pasa la regla estricta.</strong> Antes de creerla, hay que confirmarla con datos nuevos que no se hayan usado aquí.'
    : `<strong>Los números sí se repiten entre loterías, pero ni más ni menos de lo que el azar dice que deben repetirse.</strong> Con ${lots.length} loterías al día, es normal que muchos números salgan en dos o más. De ${pares.length} pares revisados, ${bajo05} dieron p menor a 0.05; por pura casualidad se esperaban unos ${(pares.length * 0.05).toFixed(1)} (en datos inventados salen unos ${ctrlProm.toFixed(1)}). Ningún par pasa la regla estricta.`;
  const cuerpo = `<h1>🔁 ¿Se repiten los mismos números entre loterías?</h1>
<p>Es lo que se ve a simple vista: un número sale en la mañana y vuelve a salir en otra lotería más tarde. La pregunta honesta es si eso pasa <strong>más de lo que pasaría con números sorteados al azar</strong>. Aquí se mide, con ${nd} días completos, contra lo que daría el azar puro.</p>
<div class="tarjeta compacta"><h2>Veredicto</h2><p>${veredicto}</p></div>
<h2>1. Números que salen en 2 o más loterías el mismo día</h2>
<div class="tarjeta compacta"><p>Promedio real: <strong>${prom.toFixed(1)} números por día</strong>. Lo esperado por azar (simulando ${N} veces el mismo calendario): <strong>${promAzar.toFixed(1)}</strong>. Diferencia: ${nd ? ((obsTot - media) / sd).toFixed(2) : '0'} desviaciones; probabilidad de ver algo igual o mayor por casualidad: <strong>${pDiario.toFixed(3)}</strong>.</p></div>
<h2>2. ¿Qué pares de loterías se repiten más?</h2>
<p class="leyenda">Cada par cuenta cuántos números comparten el mismo día. Por azar, dos loterías comparten en promedio ${(100 * q * q).toFixed(3)} números por día. 🚨 = pasa la regla estricta (corregida por mirar ${pares.length} pares, umbral ${alfaB.toExponential(1)}); 👀 = solo llama la atención.</p>
<div class="tabla" style="overflow-x:auto"><table><tr><th>Par (de más temprano a más tarde)</th><th>Días juntos</th><th>Repetidos</th><th>Esperado azar</th><th>Real / azar</th><th>p</th></tr>${tPares}</table></div>
<h2>3. La misma lotería, de un día al siguiente</h2>
<div class="tabla" style="overflow-x:auto"><table><tr><th>Lotería</th><th>Pares de días</th><th>Repetidos</th><th>Esperado azar</th><th>Real / azar</th><th>p</th></tr>${tMis}</table></div>
<h2>4. ¿Qué lotería repite más con las demás?</h2>
<div class="tabla" style="overflow-x:auto"><table><tr><th>Lotería</th><th>Repetidos con otras</th><th>Esperado azar</th><th>Real / azar</th></tr>${tLot}</table></div>
<h2>5. Números que más veces se repitieron entre loterías</h2>
<div class="tabla"><table><tr><th>Número</th><th>Días repetido</th><th>Esperado azar</th><th>Real / azar</th></tr>${tNum}</table></div>
<p class="leyenda">Cómo leerlo: «Real / azar» cerca de 1.00× es lo normal. Con tantos números y pares, algunos siempre se ven por encima solo por suerte; por eso se exige pasar el umbral corregido. Esto es información, no una predicción.</p>
${avisoHonesto()}${ctaTelegram()}`;
  return pagina({ ruta: '/repeticiones/', titulo: 'Números repetidos entre loterías: ¿más que el azar?', descripcion: 'Medimos si los mismos números se repiten entre loterías dominicanas más de lo que daría el azar.', cuerpo });
}

// 💰 Cartera virtual de palés: ¿ayuda elegir las loterías donde más han salido los palés del Radar? Todo se calcula con los datos, sin guardar nada.
const pesosP = x => 'RD$' + Math.round(x).toLocaleString('en-US');
const PAGO_PALE = 1000;            // pago por peso jugado en un palé (ajustable según la banca)
const CARTERA_PALES_DESDE = process.env.CARTERA_DESDE || '2026-11-28';
const BANCA_PALES = 1000, N_LOT_PALES = 5, VENT_LOT_PALES = 14, INI_PALES = 30;
function histPales(dias) {
  const hoy = fechaRD(); const idxHoy = dias.findIndex(d => d.fecha === hoy); const fin = idxHoy >= 0 ? idxHoy : dias.length;
  const hist = [];
  for (let i = 10; i < fin; i++) {
    const q = dias[i].quinielas; const claves = Object.keys(q); if (claves.length < 8) continue;
    const top = topN(puntajes(dias, i)); const prs = paresDe(top); const por = {}, nh = {};
    for (const k of claves) { const nums = q[k]; por[k] = prs.filter(p => nums.includes(p[0]) && nums.includes(p[1])).length; nh[k] = top.filter(n => nums.includes(n)).length; }
    hist.push({ fecha: dias[i].fecha, por, nh, claves });
  }
  return hist;
}
function eligeLots(hist, j, n, W = VENT_LOT_PALES, wNum = 1) { // las n loterías donde más están saliendo los palés (x10) y los números del Radar en los W días anteriores a j
  const sc = {}; for (const l of LOTERIAS) sc[l.clave] = 0;
  for (let t = Math.max(0, j - W); t < j; t++) for (const k in hist[t].por) sc[k] += hist[t].por[k] * 10 + wNum * (hist[t].nh[k] || 0);
  return LOTERIAS.map(l => l.clave).sort((a, b) => sc[b] - sc[a]).slice(0, n);
}
function carteraPales(dias) {
  const hist = histPales(dias); const hoy = fechaRD();
  const gS = gammaQ; const pSup = (c, lam) => c <= 0 ? 1 : Math.min(1, Math.max(0, 1 - gS(c, lam)));
  const nombre = k => esc(nombreLoteria(k));
  // 1) dónde han salido más (todo el historial)
  const tot = {}, expo = {};
  for (const h of hist) for (const k of h.claves) { tot[k] = (tot[k] || 0) + h.por[k]; expo[k] = (expo[k] || 0) + 10; }
  const filas = LOTERIAS.filter(l => expo[l.clave]).map(l => { const lam = expo[l.clave] * PARES_PROB; return { k: l.clave, c: tot[l.clave], lam, p: pSup(tot[l.clave], lam) }; }).sort((a, b) => b.c / b.lam - a.c / a.lam);
  const alfa = filas.length ? 0.05 / filas.length : 0.05; const pasa = filas.filter(f => f.p < alfa).length;
  const tDonde = filas.slice(0, 8).map(f => `<tr><td>${nombre(f.k)}</td><td>${f.c}</td><td>${f.lam.toFixed(1)}</td><td>${(f.c / f.lam).toFixed(2)}×</td><td>${f.p < alfa ? '🚨 ' : f.p < 0.05 ? '👀 ' : ''}${f.p < 0.001 ? f.p.toExponential(1) : f.p.toFixed(3)}</td></tr>`).join('');
  // 2) prueba hacia adelante sobre el historial (elige con datos anteriores, nunca con el futuro)
  const ini = INI_PALES; let gasto = 0, ret = 0, hits = 0, gTodas = 0, rTodas = 0;
  for (let j = ini; j < hist.length; j++) {
    const sel = eligeLots(hist, j, N_LOT_PALES).filter(k => hist[j].claves.includes(k));
    gasto += 10 * sel.length; for (const k of sel) { ret += hist[j].por[k] * PAGO_PALE; hits += hist[j].por[k]; }
    gTodas += 10 * hist[j].claves.length; for (const k of hist[j].claves) rTodas += hist[j].por[k] * PAGO_PALE;
  }
  const nDias = Math.max(0, hist.length - ini);
  const variantes = [['Solo palés, 30 días', 30, 0], ['Palés + números del día, 30 días', 30, 1], ['Palés + números del día, 14 días', 14, 1], ['Palés + números del día, 7 días', 7, 1]].map(([nom, W, wn]) => {
    let g = 0, x = 0, h = 0;
    for (let j = ini; j < hist.length; j++) { const sel = eligeLots(hist, j, N_LOT_PALES, W, wn).filter(k => hist[j].claves.includes(k)); g += 10 * sel.length; for (const k of sel) { x += hist[j].por[k] * PAGO_PALE; h += hist[j].por[k]; } }
    return { nom, g, x, h };
  });
  const compN = [1, 3, 5, 10, 20].map(n => {
    let g = 0, x = 0, h = 0;
    for (let j = ini; j < hist.length; j++) { const sel = eligeLots(hist, j, n).filter(k => hist[j].claves.includes(k)); g += 10 * sel.length; for (const k of sel) { x += hist[j].por[k] * PAGO_PALE; h += hist[j].por[k]; } }
    return { n, g, x, h, dias: Math.floor(BANCA_PALES / (10 * n)) };
  });
  let sem = 20261127; const rnd = () => { sem = (sem * 1664525 + 1013904223) >>> 0; return sem / 4294967296; };
  const medianaN = n => { const rs = []; for (let r = 0; r < 150; r++) { let g = 0, x = 0; for (let j = ini; j < hist.length; j++) { const c = hist[j].claves.slice(); for (let t = 0; t < n && c.length; t++) { const k = c.splice(Math.floor(rnd() * c.length), 1)[0]; g += 10; x += hist[j].por[k] * PAGO_PALE; } } rs.push(g ? x / g : 0); } rs.sort((a, b) => a - b); return rs[Math.floor(rs.length / 2)]; };
  const R = 400, rois = [];
  for (let r = 0; r < R; r++) { let g = 0, x = 0; for (let j = ini; j < hist.length; j++) { const c = hist[j].claves.slice(); for (let t = 0; t < N_LOT_PALES && c.length; t++) { const k = c.splice(Math.floor(rnd() * c.length), 1)[0]; g += 10; x += hist[j].por[k] * PAGO_PALE; } } rois.push(g ? x / g : 0); }
  rois.sort((a, b) => a - b);
  const roi = gasto ? ret / gasto : 0, perc = rois.length ? Math.round(100 * rois.filter(x => x < roi).length / rois.length) : 0, mediana = rois.length ? rois[Math.floor(rois.length / 2)] : 0;
  const esperadoHits = gasto * PARES_PROB;
  // 3) cartera virtual hacia adelante desde CARTERA_PALES_DESDE
  let saldo = BANCA_PALES, gast = 0, gan = 0, jug = 0, acier = 0, agotada = null; const log = [];
  for (let j = 0; j < hist.length; j++) {
    if (hist[j].fecha < CARTERA_PALES_DESDE) continue;
    const sel = eligeLots(hist, j, N_LOT_PALES).filter(k => hist[j].claves.includes(k)); const cost = 10 * sel.length;
    if (saldo < cost && !agotada) agotada = hist[j].fecha; // la banca se agotó: la prueba sigue contando lo jugado y lo devuelto
    let g = 0, h = 0; for (const k of sel) { g += hist[j].por[k] * PAGO_PALE; h += hist[j].por[k]; }
    saldo += g - cost; gast += cost; gan += g; jug++; acier += h; log.push({ f: hist[j].fecha, sel, h, g });
  }
  const selHoy = hist.length ? eligeLots(hist, hist.length, N_LOT_PALES) : [];
  const empieza = hoy < CARTERA_PALES_DESDE;
  const ultimos = log.slice(-7).reverse().map(x => `<tr><td>${esc(fechaMini(x.f))}</td><td>${x.sel.map(nombre).join(', ')}</td><td>${x.h ? `<strong style="color:var(--bien)">${x.h} palé${x.h > 1 ? 's' : ''}</strong>` : '—'}</td><td>${x.g ? pesosP(x.g) : '—'}</td></tr>`).join('');
  return `<h2>💰 ¿Y si se juegan RD$1,000 en palés? Primero, a prueba y sin gastar</h2>
<div class="tarjeta compacta"><p>Antes de poner dinero de verdad, probamos la idea con una <strong>cartera virtual</strong> de ${pesosP(BANCA_PALES)}. La regla: cada día se juega RD$1 en cada uno de los 10 palés, <strong>solo en las ${N_LOT_PALES} loterías donde más están saliendo los palés y los números del Radar en los ${VENT_LOT_PALES} días anteriores</strong> (${10 * N_LOT_PALES} pesos al día). Se supone un pago de ${PAGO_PALE.toLocaleString('es-DO')} por 1 (confírmalo con tu banca).</p>
<p class="leyenda">Cuenta rápida: cada palé tiene 3 de 4,950 oportunidades por sorteo. A ${PAGO_PALE} por 1, lo normal es que de cada ${pesosP(1000)} jugados vuelvan unos <strong>${pesosP(Math.round(1000 * PARES_PROB * PAGO_PALE))}</strong>; la diferencia es lo que gana la banca. La pregunta es si elegir bien la lotería mejora eso.</p></div>
<h3>Prueba con el historial (${nDias} días, eligiendo siempre con datos anteriores)</h3>
<div class="tarjeta compacta"><p>Jugado: <strong>${pesosP(gasto)}</strong> · devuelto: <strong>${pesosP(ret)}</strong> (<strong>${(100 * roi).toFixed(0)}%</strong>) · palés acertados: <strong>${hits}</strong> contra ${esperadoHits.toFixed(1)} esperados por azar.</p>
<p>Jugando en ${N_LOT_PALES} loterías escogidas al azar, la mediana devuelve <strong>${(100 * mediana).toFixed(0)}%</strong>. Elegir por dónde estaban saliendo quedó por encima de <strong>${perc}%</strong> de esas pruebas al azar.</p>
<p class="leyenda">${perc >= 97 && hits >= 8 ? 'Esto llama la atención, pero con tan pocos aciertos hay que confirmarlo con datos nuevos.' : 'Con tan pocos aciertos (cada uno vale 1,000×) el resultado depende de la suerte: un solo palé más o menos cambia todo. No es prueba de que elegir la lotería sirva.'}</p></div>
<h3>¿Cuántas loterías conviene cubrir?</h3>
<div class="tabla" style="overflow-x:auto"><table><tr><th>Loterías por día</th><th>Pesos al día</th><th>Días que dura la banca</th><th>Jugado en la prueba</th><th>Devuelto</th><th>Palés</th><th>Con loterías al azar</th></tr>${compN.map(c => `<tr><td>${c.n === 20 ? 'Todas (20)' : c.n === 1 ? 'La 1 donde más sale' : 'Las ' + c.n + ' donde más salen'}</td><td>${pesosP(10 * c.n)}</td><td>${c.dias}</td><td>${pesosP(c.g)}</td><td>${c.g ? (100 * c.x / c.g).toFixed(0) : 0}%</td><td>${c.h}</td><td>${(100 * (c.n === N_LOT_PALES ? mediana : medianaN(c.n))).toFixed(0)}%</td></tr>`).join('')}</table></div>
<p class="leyenda">Cubrir más loterías sube las probabilidades de que algún palé salga, pero también gasta la banca más rápido. Jugando en todas, el resultado es simplemente lo que da el azar (~60%): ahí no influye la lotería que elijas. La cartera de abajo usa las ${N_LOT_PALES} donde más están saliendo.</p>
<h3>¿Cómo medir «dónde están saliendo»?</h3>
<div class="tabla" style="overflow-x:auto"><table><tr><th>Criterio (${N_LOT_PALES} loterías por día)</th><th>Jugado</th><th>Devuelto</th><th>Palés</th></tr>${variantes.map(v => `<tr><td>${v.nom}</td><td>${pesosP(v.g)}</td><td>${v.g ? (100 * v.x / v.g).toFixed(0) : 0}%</td><td>${v.h}</td></tr>`).join('')}</table></div>
<p class="leyenda">Escogí de antemano el de <strong>${VENT_LOT_PALES} días con palés y números del día</strong> para la cartera (mide dónde están saliendo ahora, con más datos que mirar solo palés). Las otras filas son para comparar: probar muchas formas y quedarse con la que salió mejor sería hacerse trampa.</p>
<h3>Cartera virtual en vivo ${empieza ? `(arranca el ${esc(fechaLarga(CARTERA_PALES_DESDE))})` : ''}</h3>
<div class="tarjeta compacta">${empieza ? `<p>Empieza mañana con ${pesosP(BANCA_PALES)}. Para hoy, las loterías elegidas serían: <strong>${selHoy.map(nombre).join(', ')}</strong>.</p>`
    : `<p><strong>Saldo virtual: ${pesosP(saldo)}</strong> (empezó con ${pesosP(BANCA_PALES)}). Jugado ${pesosP(gast)}, ganado ${pesosP(gan)}, ${jug} días, ${acier} palés acertados.${agotada ? ` <strong>La banca de ${pesosP(BANCA_PALES)} se agotó el ${esc(fechaMini(agotada))}</strong>: la prueba sigue contando lo jugado y lo devuelto, que es lo que de verdad importa.` : ''}</p><p>Devuelto: <strong>${gast ? (100 * gan / gast).toFixed(0) : 0}%</strong> de lo jugado (el azar da cerca de ${(100 * PARES_PROB * PAGO_PALE).toFixed(0)}%). Palés acertados: <strong>${acier}</strong> contra ${(gast * PARES_PROB).toFixed(1)} esperados.</p><p>Loterías de hoy: <strong>${selHoy.map(nombre).join(', ')}</strong>.</p>${ultimos ? `<div class="tabla" style="overflow-x:auto"><table><tr><th>Día</th><th>Loterías jugadas</th><th>Aciertos</th><th>Ganado</th></tr>${ultimos}</table></div>` : ''}`}</div>
<h3>¿Dónde han salido más los palés del Radar?</h3>
<div class="tabla" style="overflow-x:auto"><table><tr><th>Lotería</th><th>Palés acertados</th><th>Esperado azar</th><th>Real / azar</th><th>p</th></tr>${tDonde}</table></div>
<p class="leyenda">${pasa ? `🚨 ${pasa} lotería(s) pasa(n) la regla estricta (umbral ${alfa.toExponential(1)} por mirar ${filas.length} loterías).` : `Ninguna lotería pasa la regla estricta (umbral ${alfa.toExponential(1)} por mirar ${filas.length} loterías): las diferencias son las que da la suerte.`} Los palés pagan mucho pero salen poco; no hay forma de saber en cuál lotería saldrán.</p>`;
}

// 🎲 Página de palés: los 10 palés del día, dónde salió cada número, aciertos recientes y récord contra el azar
function paginaPales(dias) {
  const r = calcularRadar(dias);
  const hoy = fechaRD();
  const diaHoy = dias.find(d => d.fecha === hoy);
  const dondeNum = n => diaHoy ? Object.entries(diaHoy.quinielas).filter(([, nums]) => nums.includes(n)).map(([k]) => nombreLoteria(k)) : [];
  const filasHoy = r.pales.map(x => {
    const [a, b] = x.p, la = dondeNum(a), lb = dondeNum(b);
    const est = x.salio.length ? `<strong style="color:var(--bien)">✅ Acertado</strong> en ${x.salio.map(esc).join(', ')}` : (la.length && lb.length ? 'Salieron los dos, pero en loterías distintas' : (la.length || lb.length ? 'Ha salido uno solo' : 'Todavía no sale'));
    return `<tr><td>${bola(f2(a), la.length ? ' ya' : '')}${bola(f2(b), lb.length ? ' ya' : '')}</td><td><small>${f2(a)}: ${la.length ? la.map(esc).join(', ') : '—'}<br>${f2(b)}: ${lb.length ? lb.map(esc).join(', ') : '—'}</small></td><td>${est}</td></tr>`;
  }).join('');
  const recientes = [...r.detalle].reverse().slice(0, 14);
  const filasRec = recientes.map(d => `<tr><td>${esc(fechaCorta ? fechaCorta(d.fecha) : d.fecha)}</td><td>${d.pales.length ? d.pales.map(x => `<strong>${f2(x.p[0])}-${f2(x.p[1])}</strong> en ${x.salio.map(esc).join(', ')}`).join('<br>') : '<span class="leyenda">ninguno</span>'}</td></tr>`).join('');
  const porLot = {};
  for (const d of r.detalle) for (const x of d.pales) for (const k of x.salio) porLot[k] = (porLot[k] || 0) + 1;
  const tLot = Object.entries(porLot).sort((a, b) => b[1] - a[1]).map(([k, c]) => `<tr><td>${esc(k)}</td><td>${c}</td></tr>`).join('');
  const veces = r.palesEsp ? (r.palesHits / r.palesEsp).toFixed(2) + '×' : '–';
  const acert = r.pales.filter(x => x.salio.length).length;
  const cuerpo = `<h1>🎲 Palés del día</h1>
<p>Un palé es una pareja de números que sale <strong>junta en el mismo sorteo</strong>. Aquí se arman las 10 parejas posibles entre los 5 números del día y se sigue dónde sale cada uno.</p>
${r.pales.length ? `<div class="tarjeta compacta"><h2>Hoy: ${acert} de 10 palés acertados</h2><div class="tabla" style="overflow-x:auto"><table><tr><th>Palé</th><th>Dónde salió cada número</th><th>Estado</th></tr>${filasHoy}</table></div>${palLeyenda}</div>` : '<div class="tarjeta compacta"><p>Todavía no hay datos suficientes para armar los palés de hoy.</p></div>'}
<h2>Palés acertados, últimos 14 días</h2>
<div class="tabla" style="overflow-x:auto"><table><tr><th>Día</th><th>Palés que salieron juntos</th></tr>${filasRec || '<tr><td colspan="2">Sin datos todavía.</td></tr>'}</table></div>
${carteraPales(dias)}
<h2>Récord contra el azar (${r.dias} días)</h2>
<div class="tarjeta compacta"><p>Palés acertados: <strong>${r.palesHits}</strong>. Lo esperado si los números fueran al azar: <strong>${r.palesEsp.toFixed(1)}</strong>. Resultado real / azar: <strong>${veces}</strong>.</p><p class="leyenda">Cerca de 1.00× significa que el método no hace nada distinto al azar. Un palé es difícil: cada sorteo trae solo 3 de las 4,950 parejas posibles.</p></div>
${tLot ? `<h2>¿En qué loterías han salido los palés acertados?</h2><div class="tabla"><table><tr><th>Lotería</th><th>Palés</th></tr>${tLot}</table></div><p class="leyenda">Ojo: con 20 loterías al día, algunas van a acumular más aciertos solo por suerte. No es una pista de dónde saldrá el próximo.</p>` : ''}
${avisoHonesto()}${ctaTelegram()}`;
  return pagina({ ruta: '/pales/', titulo: 'Palés del día: dónde salió cada número', descripcion: 'Los 10 palés del día, en qué lotería salió cada número y cuántos palés se han acertado frente al azar.', cuerpo });
}

// 📰 Muro de noticias: todo se arma solo con los datos del día. Lo urgente aparece apenas ocurre; "Un día como hoy" cambia cada día.
const EFEMERIDES = {
  '01-01': 'Año Nuevo', '01-06': 'Día de los Santos Reyes', '01-21': 'Día de la Altagracia', '01-26': 'el Natalicio de Juan Pablo Duarte',
  '02-14': 'el Día del Amor y la Amistad', '02-27': 'el Día de la Independencia Nacional', '03-08': 'el Día Internacional de la Mujer',
  '05-01': 'el Día del Trabajo', '08-16': 'el Día de la Restauración', '09-24': 'el Día de las Mercedes', '10-31': 'Halloween',
  '11-01': 'el Día de Todos los Santos', '11-02': 'el Día de los Fieles Difuntos', '11-06': 'el Día de la Constitución',
  '12-08': 'el Día de la Inmaculada Concepción', '12-24': 'Nochebuena', '12-25': 'Navidad', '12-28': 'el Día de los Santos Inocentes', '12-31': 'Fin de Año',
};
function efemerideDe(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  const fijo = EFEMERIDES[fecha.slice(5)];
  if (fijo) return fijo;
  const dow = dUTC(fecha).getUTCDay(); // 0 = domingo
  const ultimoDom = mes => { let x = new Date(Date.UTC(y, mes, 0, 12)); while (x.getUTCDay() !== 0) x = new Date(x - 864e5); return x.getUTCDate(); };
  if (dow === 0 && m === 5 && d === ultimoDom(5)) return 'el Día de las Madres';
  if (dow === 0 && m === 7 && d === ultimoDom(7)) return 'el Día de los Padres';
  return '';
}
const numerosFecha = fecha => { const [y, m, d] = fecha.split('-').map(Number); return [...new Set([d, m, y % 100])]; };
const lotsOrden = () => [...LOTERIAS].sort((a, b) => minLoteria(a.hora) - minLoteria(b.hora));
function noticiasDia(d, rad, esHoy) {
  const urg = [], tit = [];
  const orden = lotsOrden(); const pos = k => orden.findIndex(l => l.clave === k);
  const cont = {};
  for (const [k, nums] of Object.entries(d.quinielas)) for (const n of new Set(nums)) (cont[n] = cont[n] || []).push(k);
  const quien = arr => [...arr].sort((a, b) => pos(a) - pos(b)).map(k => esc(nombreLoteria(k))).join(', ');
  const ultima = arr => { const k = [...arr].sort((a, b) => pos(a) - pos(b)).pop(); const l = LOTERIAS.find(x => x.clave === k); return l ? ` <small class="leyenda">(después de ${esc(l.nombre)}, ${esc(l.hora)})</small>` : ''; };
  Object.entries(cont).map(([n, a]) => ({ n: +n, a })).filter(x => x.a.length >= 3).sort((x, y) => y.a.length - x.a.length || x.n - y.n).slice(0, 3).forEach(x => {
    const t = `El <strong>${f2(x.n)}</strong> salió en <strong>${x.a.length} loterías</strong>: ${quien(x.a)}.`;
    if (x.a.length >= 5) urg.push(`🔥 ${t}${ultima(x.a)}`); else tit.push(`${x.a.length >= 4 ? '🔥' : '🔁'} ${t}`);
  });
  for (const [k, nums] of Object.entries(d.quinielas)) {
    const u = new Set(nums);
    if (nums.length === 3 && u.size === 1) urg.push(`🤯 ¡Triple! En <strong>${esc(nombreLoteria(k))}</strong> salió el <strong>${f2(nums[0])}-${f2(nums[0])}-${f2(nums[0])}</strong>.`);
    else if (u.size < nums.length) tit.push(`👯 En ${esc(nombreLoteria(k))} el <strong>${f2(nums.find((x, i) => nums.indexOf(x) !== i))}</strong> salió dos veces en el mismo sorteo.`);
  }
  for (const x of (rad.pales || []).filter(x => x.salio.length)) {
    const t = `🎲 Palé acertado: <strong>${f2(x.p[0])}-${f2(x.p[1])}</strong> salió junto en ${x.salio.map(esc).join(', ')}.`;
    if (esHoy) urg.push(t); else tit.push(t);
  }
  const hits = (rad.top || []).filter(n => cont[n]);
  if (hits.length) tit.push(`🎯 De los 5 números del día salieron ${hits.length}: ${hits.map(n => `<strong>${f2(n)}</strong> (${quien(cont[n])})`).join(' · ')}.`);
  const fn = numerosFecha(d.fecha).filter(n => cont[n]);
  if (fn.length) tit.push(`📅 Números de la fecha: ${fn.map(n => `el <strong>${f2(n)}</strong> salió en ${cont[n].length} ${cont[n].length === 1 ? 'lotería' : 'loterías'}`).join(' · ')}.`);
  return { urg, tit };
}
function datosMuro(dias) {
  const hoy = fechaRD(), r = calcularRadar(dias);
  const detalle = Object.fromEntries(r.detalle.map(x => [x.fecha, { top: x.top, pales: x.pales }]));
  const diaHoy = dias.find(d => d.fecha === hoy);
  const hoyN = diaHoy ? noticiasDia(diaHoy, { top: r.hoy.map(x => x.n), pales: r.pales }, true) : { urg: [], tit: [] };
  const pasados = dias.filter(d => d.fecha < hoy && Object.keys(d.quinielas).length >= 8).slice(-7).reverse()
    .map(d => ({ fecha: d.fecha, ...noticiasDia(d, detalle[d.fecha] || {}, false) }));
  const hace = n => { const f = new Date(dUTC(hoy) - n * 864e5).toISOString().slice(0, 10); const d = dias.find(x => x.fecha === f); if (!d || Object.keys(d.quinielas).length < 8) return ''; const c = {}; for (const nums of Object.values(d.quinielas)) for (const x of new Set(nums)) c[x] = (c[x] || 0) + 1; const top = Object.entries(c).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]; return top && top[1] >= 2 ? `Hace ${n} días (${esc(fechaMini(f))}) el número más repetido fue el <strong>${f2(top[0])}</strong>, en ${top[1]} loterías.` : ''; };
  const ef = efemerideDe(hoy);
  const nf = numerosFecha(hoy);
  const contHoy = {}; if (diaHoy) for (const [k, nums] of Object.entries(diaHoy.quinielas)) for (const x of new Set(nums)) (contHoy[x] = contHoy[x] || []).push(k);
  const salio = nf.map(n => contHoy[n] ? `el <strong>${f2(n)}</strong> ya salió en ${contHoy[n].map(k => esc(nombreLoteria(k))).join(', ')}` : `el <strong>${f2(n)}</strong> todavía no sale hoy`).join('; ');
  const dicen = `${ef ? `Hoy se celebra <strong>${ef}</strong>. ` : ''}Hoy es <strong>${esc(fechaLarga(hoy))}</strong>, y mucha gente juega la fecha: ${nf.map(f2).join(', ')}. Hasta ahora ${salio}.`;
  return { hoy, urg: hoyN.urg, tit: hoyN.tit, pasados, dicen, hace: [7, 30, 90].map(hace).filter(Boolean), ef };
}
function muroTeaser(dias) {
  const m = datosMuro(dias);
  if (m.urg.length) return `<div class="muro-urg"><strong>🚨 Urgente</strong><ul>${m.urg.slice(0, 2).map(x => `<li>${x}</li>`).join('')}</ul><a href="${url('/muro/')}">Ver el muro de noticias →</a></div>`;
  return `<div class="muro-hoy"><strong>📅 Un día como hoy</strong><p>${m.dicen}</p><a href="${url('/muro/')}">Ver el muro de noticias →</a></div>`;
}
function paginaMuro(dias) {
  const m = datosMuro(dias);
  const lista = a => `<ul class="muro-lista">${a.map(x => `<li>${x}</li>`).join('')}</ul>`;
  const urgente = m.urg.length
    ? `<div class="muro-urg"><strong>🚨 Urgente · hoy</strong>${lista(m.urg)}</div>`
    : '';
  const semana = m.pasados.map(d => `<div class="tarjeta compacta" style="margin-bottom:10px"><strong>${esc(fechaLarga(d.fecha))}</strong>${lista([...d.urg, ...d.tit].length ? [...d.urg, ...d.tit] : ['Un día tranquilo: nada fuera de lo normal.'])}</div>`).join('');
  const cuerpo = `<h1>📰 Muro de noticias</h1>
<p>Lo que pasa con los números, día a día: lo urgente apenas ocurre y lo de siempre cada mañana. Todo sale de los resultados reales; son coincidencias, no pistas.</p>
${urgente}
<h2>📅 Un día como hoy</h2>
<div class="tarjeta compacta"><p>${m.dicen}</p>${m.hace.length ? lista(m.hace) : ''}<p class="leyenda">Con unas 20 loterías al día, cada número sale cerca de la mitad de los días solo por azar. Que salga la fecha es una coincidencia curiosa, no una señal.</p></div>
${m.tit.length ? `<h2>Hoy, hasta ahora</h2><div class="tarjeta compacta">${lista(m.tit)}</div>` : ''}
<h2>Últimos días</h2>
${semana || '<p>Todavía no hay suficientes días.</p>'}
${avisoHonesto()}${ctaTelegram()}`;
  return pagina({ ruta: '/muro/', titulo: 'Muro de noticias de la lotería: un día como hoy y lo urgente', descripcion: 'Lo que pasa con los números cada día: números repetidos, triples, palés acertados y qué salió un día como hoy.', cuerpo });
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
  const conf = real.confirmadas.length ? `<div class="tabla"><table><tr><th>Idea que pasó las dos pruebas</th><th>Aciertos en la búsqueda</th><th>Aciertos en la confirmación</th><th>z de confirmación</th></tr>${real.confirmadas.map(c => `<tr><td><strong>${esc(c.id.texto)}</strong></td><td>${c.busqueda.h} <small class="leyenda">(azar ${c.busqueda.ex.toFixed(1)})</small></td><td>${c.confirmacion.h} <small class="leyenda">(azar ${c.confirmacion.ex.toFixed(1)})</small></td><td>${c.confirmacion.z.toFixed(1)} <small class="leyenda">(vara: ${real.umbral.toFixed(1)})</small></td></tr>`).join('')}</table></div>
<p><strong>Cómo leer esto con cuidado:</strong> se probaron ${fmt(real.total)} ideas, y la vara está puesta para que una idea pase las dos pruebas por pura casualidad solo en más o menos 1 de cada 20 corridas. Que una pase no es una predicción ni una garantía: es una candidata para vigilar. Ahora tiene que aguantar semanas de sorteos nuevos, que no se han visto todavía. Si se apaga, lo diremos aquí.</p>
${real.confirmadas.filter(c => c.id.fam === 'dia').map(c => {
    const filas = D.map((d, i) => ({ d, i })).filter(x => x.d.dow === c.id.dow && x.d.q[c.id.clave]).map(x => {
      const nums = x.d.q[c.id.clave], aciertos = nums.filter(n => c.id.S.has(n)).length;
      return `<tr><td>${esc(fechaMini(x.d.fecha))}</td><td><span class="bolas">${nums.map(n => bola(f2(n), c.id.S.has(n) ? ' ya' : '')).join('')}</span></td><td>${aciertos}</td><td>${x.i < real.corte ? 'búsqueda' : 'confirmación'}</td></tr>`;
    }).join('');
    return `<details><summary>Ver los sorteos detrás de "${esc(c.id.texto)}" (los números marcados cumplen la idea)</summary><div class="tabla"><table><tr><th>Día</th><th>Números</th><th>Aciertos</th><th>Tramo</th></tr>${filas}</table></div></details>`;
  }).join('')}` : '<p><strong>Ideas que pasaron las dos pruebas: ninguna.</strong></p>';
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
${seccionEspeciales(dias)}
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
  { const rd = calcularRadar(dias); rd.detalle.forEach(x => TOP_RADAR.set(x.fecha, new Set(x.top))); if (rd.hoy.length) TOP_RADAR.set(fechaRD(), new Set(rd.hoy.map(x => x.n))); }
  guardar('/', paginaInicio(dias, series));
  guardar('/loterias/', paginaLoterias(series));
  for (const l of LOTERIAS) if (series[l.clave].length) guardar(`/loterias/${l.slug}/`, paginaLoteria(l, series[l.clave]));
  guardar('/jugadas/', paginaJugadas(dias, series));
  escribir(path.join('/aciertos/', 'index.html'), paginaAciertos(dias)); // privada
  escribir(path.join('/sesgos/', 'index.html'), paginaSesgos(dias)); // privada: sin enlace, noindex y fuera del sitemap // privada: sin enlace, noindex y fuera del sitemap
  guardar('/numeros/', paginaNumeros(series));
  guardar('/mis-numeros/', paginaMisNumeros(dias, series));
  guardar('/generador/', paginaGenerador(dias));
  { const js = juegosDe(dias); guardar('/jugadas-especiales/', paginaJugadasEspeciales(dias)); guardar('/juegos/', paginaJuegos(dias)); for (const j of js) guardar('/juegos/' + j.slug + '/', paginaJuego(j, js, dias)); }
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
  guardar('/repeticiones/', paginaRepeticiones(dias));
  guardar('/pales/', paginaPales(dias));
  guardar('/muro/', paginaMuro(dias));

  escribir('404.html', pagina({ ruta: '/404.html', titulo: `Página no encontrada | ${NOMBRE_SITIO}`, descripcion: 'Página no encontrada.', indexar: false, cuerpo: `<h1>Esa página no existe</h1><p><a href="${url('/')}">Ver los resultados de hoy</a></p>` }));
  const hoy = fechaRD();
  escribir('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rutas.map(r => `<url><loc>${SITE_URL}${r}</loc><lastmod>${/\/resultados\/\d{4}/.test(r) ? r.slice(12, 22) : hoy}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  { const rd = calcularRadar(dias); if (rd.hoy.length) escribir('radar-hoy.json', JSON.stringify({ fecha: hoy, numeros: rd.hoy.map(x => x.n), pales: rd.pales.map(x => x.p) })); }
  escribir('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  if (ADSENSE_CLIENT) escribir('ads.txt', `google.com, ${ADSENSE_CLIENT.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);

  console.log(`✅ ${rutas.length} páginas en ${SALIDA} · ${dias.length} días (${dias[0].fecha} → ${dias[dias.length - 1].fecha}) · ${((Date.now() - t0) / 1000).toFixed(1)}s${DEMO ? ' · MODO DEMO' : ''}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
