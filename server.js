const express = require('express');
const axios   = require('axios');
const cheerio = require('cheerio');
const cors    = require('cors');
const app     = express();
const PORT    = process.env.PORT || 3000;

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

// ── Estado en memoria (con histórico persistente) ─────────────────────────────
let estado = {
  fecha: fechaRD(),
  hora_actualizacion: horaRD(),
  sorteos: crearSorteos(),
  historico: []
};

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
};

function buscarClave(texto) {
  const t = texto.toLowerCase().trim();
  for (const [k, v] of Object.entries(MAPA)) {
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
// Este endpoint devuelve JSON estructurado, mucho más confiable que parsear HTML.
// Encontrado en el código fuente: data-url="https://www.conectate.com.do/loterias/api/widget"
async function scrapeConectateAPI() {
  try {
    console.log('📡 [PRIMARIO] Raspando conectate.com.do/loterias/api/widget...');
    const res = await axios.get('https://www.conectate.com.do/loterias/api/widget', {
      headers: { ...HEADERS, 'Accept': 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' },
      timeout: 20000
    });

    let data = res.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { /* no es JSON puro */ }
    }

    let conteo = 0;
    // La estructura puede variar; intentamos varios formatos comunes
    const items = Array.isArray(data) ? data
                 : Array.isArray(data?.data) ? data.data
                 : Array.isArray(data?.results) ? data.results
                 : Array.isArray(data?.loterias) ? data.loterias
                 : [];

    console.log(`  → API devolvió ${items.length} items`);

    for (const item of items) {
      // Buscar nombre en varios campos posibles
      const nombre = (item.name || item.nombre || item.title || item.game || '').toString();
      if (!nombre) continue;

      const clave = buscarClave(nombre);
      if (!clave || !estado.sorteos[clave]) continue;
      if (estado.sorteos[clave].numeros.length >= 3) continue;

      // Buscar números en varios campos posibles
      let nums = [];
      const camposNumeros = item.numbers || item.numeros || item.results || item.scores || item.balls;
      if (Array.isArray(camposNumeros)) {
        nums = camposNumeros.map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n >= 0 && n <= 99).slice(0, 3);
      }

      if (nums.length === 3) {
        const sospechoso = nums.includes(0) && nums.includes(99);
        if (sospechoso) continue;
        estado.sorteos[clave].numeros = nums;
        estado.sorteos[clave].estado = 'disponible';
        conteo++;
        console.log(`  ✓ [API] ${estado.sorteos[clave].nombre}: ${nums.join('-')}`);
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
      headers: HEADERS, timeout: 20000
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

// ── SCRAPER RESPALDO: quinielasrd.com ──────────────────────────────────────────
async function scrapeQuinielasRD() {
  try {
    console.log('📡 [respaldo] Raspando quinielasrd.com...');
    const res = await axios.get('https://quinielasrd.com/', {
      headers: HEADERS, timeout: 20000
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
    const snapshot = { fecha: estado.fecha, sorteos: JSON.parse(JSON.stringify(estado.sorteos)) };
    estado.historico.unshift(snapshot);
    if (estado.historico.length > 90) estado.historico.pop();
    estado.sorteos = crearSorteos();
    estado.fecha = hoy;
    console.log(`📅 Nuevo día ${hoy}. Histórico preservado: ${estado.historico.length} días.`);
  }

  // Intentar fuente primaria: API JSON de conectate
  await scrapeConectateAPI();

  // Si faltan, intentar HTML de loteriasdominicanas.com
  let pendientes = Object.values(estado.sorteos).filter(s => s.numeros.length < 3).length;
  if (pendientes > 0) await scrapeLotDominicanas();

  pendientes = Object.values(estado.sorteos).filter(s => s.numeros.length < 3).length;
  if (pendientes > 8) await scrapeQuinielasRD();

  estado.hora_actualizacion = horaRD();
  const disp = Object.values(estado.sorteos).filter(s => s.numeros.length >= 3).length;
  console.log(`📊 RESULTADO: ${disp}/18 sorteos con números\n`);
}

// Auto-sync cada 15 minutos
setInterval(sincronizar, 15 * 60 * 1000);

// ── ENDPOINTS (formato esperado por el frontend v4.0-REAL) ─────────────────────

app.get('/api/hoy', async (req, res) => {
  await sincronizar();
  res.json({
    fecha: estado.fecha,
    hora_actualizacion: estado.hora_actualizacion,
    sorteos: estado.sorteos
  });
});

// Compatibilidad: también respondemos /api/radar con el mismo formato
app.get('/api/radar', async (req, res) => {
  await sincronizar();
  res.json({
    fecha: estado.fecha,
    hora_actualizacion: estado.hora_actualizacion,
    sorteos: estado.sorteos
  });
});

app.get('/api/historico', (req, res) => {
  res.json({ historico: estado.historico, total: estado.historico.length });
});

app.get('/api/consultar', (req, res) => {
  const { loteria, fecha_inicio, fecha_fin } = req.query;
  const todos = [
    { fecha: estado.fecha, sorteos: estado.sorteos },
    ...estado.historico.map(h => ({ fecha: h.fecha, sorteos: h.sorteos }))
  ];
  const resultados = [];
  for (const dia of todos) {
    if (fecha_inicio && dia.fecha < fecha_inicio) continue;
    if (fecha_fin   && dia.fecha > fecha_fin)     continue;
    const lotes = (loteria && loteria !== 'todas') ? [loteria] : Object.keys(estado.sorteos);
    for (const k of lotes) {
      const s = dia.sorteos[k];
      if (s && s.numeros && s.numeros.length >= 3) {
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
      ? [loteria] : ['gana_mas','leidsa','nacional','loteka'];
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

// Endpoint de diagnóstico: muestra qué encuentra cada scraper
app.get('/api/debug', async (req, res) => {
  const resultado = {};

  // 1. Probar API de conectate
  try {
    const r1 = await axios.get('https://www.conectate.com.do/loterias/api/widget', {
      headers: { ...HEADERS, 'Accept': 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' },
      timeout: 20000
    });
    resultado.conectate_api = {
      status: r1.status,
      content_type: r1.headers['content-type'],
      data_preview: JSON.stringify(r1.data).slice(0, 3000)
    };
  } catch (e) {
    resultado.conectate_api = { error: e.message, status: e.response?.status };
  }

  // 2. Probar HTML de loteriasdominicanas.com
  try {
    const r2 = await axios.get('https://loteriasdominicanas.com/', { headers: HEADERS, timeout: 20000 });
    const $ = cheerio.load(r2.data);
    const bloques = [];
    $('.game-block').each((i, b) => {
      const titulo = $(b).find('.game-title span').text().trim();
      const tieneBallMode = $(b).find('.game-scores.ball-mode').length > 0;
      const scores = [];
      $(b).find('.game-scores.ball-mode span.score').each((j, s) => scores.push($(s).text().trim()));
      const clave = buscarClave(titulo);
      bloques.push({ titulo, clave, tieneBallMode, scores });
    });
    resultado.loteriasdominicanas = { total_bloques: bloques.length, bloques };
  } catch (e) {
    resultado.loteriasdominicanas = { error: e.message };
  }

  res.json(resultado);
});

app.get('/', (req, res) => {
  res.json({
    version: 'v5.2-API',
    status: 'ok',
    fecha_rd: fechaRD(),
    hora_rd: horaRD(),
    sorteos_hoy: Object.values(estado.sorteos).filter(s=>s.numeros.length>=3).length,
    historico_dias: estado.historico.length,
    endpoints: ['/api/hoy', '/api/radar', '/api/consultar', '/api/estadisticas', '/api/historico', '/api/debug']
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Reydis Engine v5.2-API en puerto ${PORT}`);
  console.log(`📋 Fuente primaria: conectate.com.do/loterias/api/widget (JSON)`);
  console.log(`📋 Respaldo: loteriasdominicanas.com (.game-scores.ball-mode)`);
  sincronizar();
});
