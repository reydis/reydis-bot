const express = require('express');
const axios   = require('axios');
const cheerio = require('cheerio');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3000;

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
      { fecha: snapshot.fecha, sorteos: snapshot.sorteos, cuartetas: snapshot.cuartetas },
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
      `${SUPABASE_URL}/rest/v1/historico?select=fecha,sorteos,cuartetas&order=fecha.desc&limit=90`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, timeout: 10000 }
    );
    return res.data.map(r => ({ fecha: r.fecha, sorteos: r.sorteos, cuartetas: r.cuartetas }));
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
  // Si el archivo en disco trae historico de una fecha distinta a hoy,
  // lo restauramos. Si por alguna razón coincide con "hoy" (servidor se
  // reinició el mismo día), igual lo restauramos: no hace daño, sincronizar()
  // lo vuelve a actualizar con datos frescos.
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
    suerte_t2:   { nombre:'La Suerte Tarde',  hora:'6:00 PM',  numeros:[], estado:'pendiente' },
    anguila_n:   { nombre:'Anguila 6:00 PM',  hora:'6:00 PM',  numeros:[], estado:'pendiente' },
    king_n:      { nombre:'King Noche',        hora:'7:00 PM',  numeros:[], estado:'pendiente' },
    loteka:      { nombre:'Loteka',            hora:'6:55 PM',  numeros:[], estado:'pendiente' },
    laprimera_n: { nombre:'La Primera Noche', hora:'7:00 PM',  numeros:[], estado:'pendiente' },
    leidsa:      { nombre:'Leidsa',            hora:'8:55 PM',  numeros:[], estado:'pendiente' },
    nacional:    { nombre:'Lotería Nacional',  hora:'9:00 PM',  numeros:[], estado:'pendiente' },
    anguila_nn:  { nombre:'Anguila 9:00 PM',  hora:'9:00 PM',  numeros:[], estado:'pendiente' },
    new_york_n:  { nombre:'New York Noche',    hora:'10:30 PM', numeros:[], estado:'pendiente' }
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
  'florida día':          'new_york_t',  // ← "Florida Día" = New York Tarde americana
  'florida dia':          'new_york_t',
  'florida noche':        'new_york_n',  // ← "Florida Noche" = New York Noche
  'new york 11:30':       'new_york_t',
  'new york 2:30':        'new_york_t',
  'nueva york':           'new_york_t',
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

      const clave = buscarClave(nombre);
      if (!clave || !estado.sorteos[clave]) {
        console.log(`  ⚠️  Sin mapeo para: "${nombre}"`);
        continue;
      }
      if (estado.sorteos[clave].numeros.length >= 3) continue;

      // CRÍTICO: solo aceptar resultados marcados como "today: true".
      // Si today=false, ese número es de un sorteo anterior (ayer u otro día)
      // y NO debe mostrarse como resultado de hoy.
      if (item.today !== true) {
        console.log(`  ⏭️  ${nombre}: today=false (es de ${item.date || 'fecha anterior'}), aún no salió hoy`);
        continue;
      }

      // score es array de strings ["03","91","75"]
      const scoreArr = item.score;
      if (!Array.isArray(scoreArr) || scoreArr.length < 3) continue;

      const nums = scoreArr
        .slice(0, 3)
        .map(n => parseInt(n, 10))
        .filter(n => !isNaN(n) && n >= 0 && n <= 99);

      if (nums.length === 3) {
        // Rechazar placeholder 0+99
        if (nums.includes(0) && nums.includes(99)) {
          console.log(`  ⚠️  ${nombre}: patrón sospechoso ${nums.join('-')} - descartado`);
          continue;
        }
        estado.sorteos[clave].numeros = nums;
        estado.sorteos[clave].estado = 'disponible';
        conteo++;
        console.log(`  ✓ [API] ${estado.sorteos[clave].nombre}: ${nums.join('-')} (hoy confirmado, fecha:${item.date})`);
      }
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
async function sincronizar() {
  const hoy = fechaRD();
  console.log(`\n🔄 [${horaRD()} RD] Sincronizando... (${hoy})`);

  // Nuevo día → guardar histórico (NO se borra, se preserva)
  if (hoy !== estado.fecha) {
    const snapshot = {
      fecha: estado.fecha,
      sorteos: JSON.parse(JSON.stringify(estado.sorteos)),
      cuartetas: JSON.parse(JSON.stringify(estado.cuartetas))
    };
    estado.historico.unshift(snapshot);
    if (estado.historico.length > 90) estado.historico.pop();
    estado.sorteos = crearSorteos();
    estado.cuartetas = crearCuartetas();
    estado.fecha = hoy;
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

  estado.hora_actualizacion = horaRD();
  const disp = Object.values(estado.sorteos).filter(s => s.numeros.length >= 3).length;
  const dispC = Object.values(estado.cuartetas).filter(c => c.numeros.length >= 4).length;
  console.log(`📊 RESULTADO: ${disp}/18 sorteos · ${dispC}/4 cuartetas\n`);
  guardarEnDisco();
  await guardarEnSupabase({ fecha: estado.fecha, sorteos: estado.sorteos, cuartetas: estado.cuartetas });
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
    cuartetas: estado.cuartetas
  });
});

// Compatibilidad: también respondemos /api/radar con el mismo formato
app.get('/api/radar', async (req, res) => {
  await sincronizar();
  res.json({
    fecha: estado.fecha,
    hora_actualizacion: estado.hora_actualizacion,
    sorteos: estado.sorteos,
    cuartetas: estado.cuartetas
  });
});

app.get('/api/historico', (req, res) => {
  res.json({ historico: estado.historico, total: estado.historico.length });
});

app.get('/api/consultar', (req, res) => {
  const { loteria, fecha_inicio, fecha_fin } = req.query;
  const todos = [
    { fecha: estado.fecha, sorteos: { ...estado.sorteos, ...estado.cuartetas } },
    ...estado.historico.map(h => ({ fecha: h.fecha, sorteos: { ...h.sorteos, ...(h.cuartetas || {}) } }))
  ];
  const todasLasClaves = [...Object.keys(estado.sorteos), ...Object.keys(estado.cuartetas)];
  const resultados = [];
  for (const dia of todos) {
    if (fecha_inicio && dia.fecha < fecha_inicio) continue;
    if (fecha_fin   && dia.fecha > fecha_fin)     continue;
    const lotes = (loteria && loteria !== 'todas') ? [loteria] : todasLasClaves;
    for (const k of lotes) {
      const s = dia.sorteos[k];
      const minNum = k.startsWith('cuarteta_') ? 4 : 3;
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
    return res.json({ activo: true, conectado: false, mensaje: 'Variables configuradas pero la conexión falló. Revisa la URL y la service_role key.' });
  }
  res.json({ activo: true, conectado: true, dias_guardados: datos.length, fechas: datos.slice(0, 5).map(d => d.fecha) });
});

app.get('/', (req, res) => {
  res.json({
    version: 'v7.1-SUPABASE',
    status: 'ok',
    persistencia: SUPABASE_ACTIVO ? 'supabase (permanente)' : 'solo disco local (no sobrevive redeploys)',
    fecha_rd: fechaRD(),
    hora_rd: horaRD(),
    sorteos_hoy: Object.values(estado.sorteos).filter(s=>s.numeros.length>=3).length,
    cuartetas_hoy: Object.values(estado.cuartetas).filter(c=>c.numeros.length>=4).length,
    historico_dias: estado.historico.length,
    endpoints: ['/api/hoy', '/api/radar', '/api/consultar', '/api/estadisticas', '/api/historico', '/api/debug', '/api/debug2', '/api/debug-db']
  });
});

app.listen(PORT, async () => {
  console.log(`\n🚀 Reydis Engine v7.1-SUPABASE en puerto ${PORT}`);
  console.log(`✅ Solo acepta resultados con today:true (rechaza datos de ayer)`);
  console.log(`🎲 Ahora también rastrea La Cuarteta (Anguila, 4 dígitos)`);
  console.log(`💾 Persistencia: ${SUPABASE_ACTIVO ? 'Supabase (permanente, sobrevive redeploys)' : 'solo disco local (configura SUPABASE_URL/SUPABASE_KEY para hacerla permanente)'}`);
  console.log(`📋 Respaldo: loteriasdominicanas.com (.game-scores.ball-mode)`);
  await inicializarPersistenciaRemota();
  sincronizar();
});
