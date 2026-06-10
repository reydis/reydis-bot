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

// ── Estado en memoria ─────────────────────────────────────────────────────────
let estado = {
  fecha: fechaRD(),
  hora_actualizacion: horaRD(),
  sorteos: crearSorteos(),
  historico: []
};

function crearSorteos() {
  return {
    anguila_m:   { nombre:'Anguila Mañana',   hora:'10:00 AM', numeros:[], estado:'pendiente' },
    laprimera:   { nombre:'La Primera Día',   hora:'10:30 AM', numeros:[], estado:'pendiente' },
    lotedom:     { nombre:'LoteDom',           hora:'11:30 AM', numeros:[], estado:'pendiente' },
    suerte:      { nombre:'La Suerte 12:30',  hora:'12:30 PM', numeros:[], estado:'pendiente' },
    king_t:      { nombre:'King Tarde',        hora:'12:30 PM', numeros:[], estado:'pendiente' },
    real_t:      { nombre:'Lotería Real',      hora:'12:30 PM', numeros:[], estado:'pendiente' },
    anguila_t:   { nombre:'Anguila 1:00 PM',  hora:'1:00 PM',  numeros:[], estado:'pendiente' },
    gana_mas:    { nombre:'Gana Más',          hora:'2:30 PM',  numeros:[], estado:'pendiente' },
    new_york_t:  { nombre:'New York Tarde',    hora:'3:30 PM',  numeros:[], estado:'pendiente' },
    suerte_t2:   { nombre:'La Suerte Tarde',  hora:'6:00 PM',  numeros:[], estado:'pendiente' },
    anguila_n:   { nombre:'Anguila 6:00 PM',  hora:'6:00 PM',  numeros:[], estado:'pendiente' },
    king_n:      { nombre:'King Noche',        hora:'7:00 PM',  numeros:[], estado:'pendiente' },
    loteka:      { nombre:'Loteka',            hora:'7:30 PM',  numeros:[], estado:'pendiente' },
    laprimera_n: { nombre:'La Primera Noche', hora:'8:00 PM',  numeros:[], estado:'pendiente' },
    leidsa:      { nombre:'Leidsa',            hora:'8:55 PM',  numeros:[], estado:'pendiente' },
    nacional:    { nombre:'Lotería Nacional',  hora:'9:00 PM',  numeros:[], estado:'pendiente' },
    anguila_nn:  { nombre:'Anguila 9:00 PM',  hora:'9:00 PM',  numeros:[], estado:'pendiente' },
    new_york_n:  { nombre:'New York Noche',    hora:'10:30 PM', numeros:[], estado:'pendiente' }
  };
}

// ── MAPEO: href del sitio → clave interna ─────────────────────────────────────
// Basado en los hrefs reales de loteriasdominicanas.com
const HREF_MAPA = {
  '/loteria-nacional/gana-mas':           'gana_mas',
  '/loteria-nacional/quiniela':           'nacional',
  '/leidsa/quiniela-pale':               'leidsa',
  '/loteka/quiniela':                    'loteka',
  '/loto-real/quiniela':                 'real_t',
  '/la-primera/quiniela':               'laprimera',
  '/la-primera/quiniela-noche':         'laprimera_n',
  '/la-suerte-dominicana/quiniela':     'suerte',
  '/la-suerte-dominicana/quiniela-tarde':'suerte_t2',
  '/lotedom/quiniela':                  'lotedom',
  '/anguila/anguila-manana':            'anguila_m',
  '/anguila/anguila-medio-dia':         'anguila_t',
  '/anguila/anguila-tarde':             'anguila_n',
  '/anguila/anguila-noche':             'anguila_nn',
  '/americanas/new-york-tarde':         'new_york_t',
  '/americanas/new-york-noche':         'new_york_n',
};

// También mapeo por nombre (para quinielasrd.com)
const NOMBRE_MAPA = {
  'gana más':           'gana_mas',
  'gana mas':           'gana_mas',
  'lotería nacional':   'nacional',
  'loteria nacional':   'nacional',
  'quiniela leidsa':    'leidsa',
  'leidsa':             'leidsa',
  'loteka':             'loteka',
  'lotería real':       'real_t',
  'loteria real':       'real_t',
  'quiniela real':      'real_t',
  'la primera día':     'laprimera',
  'primera día':        'laprimera',
  'la primera dia':     'laprimera',
  'primera dia':        'laprimera',
  'la primera noche':   'laprimera_n',
  'la suerte 12:30':    'suerte',
  'la suerte 12:30 pm': 'suerte',
  'la suerte tarde':    'suerte_t2',
  'lotedom':            'lotedom',
  'anguila 10:00 am':   'anguila_m',
  'anguila mañana':     'anguila_m',
  'anguila 1:00 pm':    'anguila_t',
  'anguila mediodía':   'anguila_t',
  'anguila mediodia':   'anguila_t',
  'anguila 6:00 pm':    'anguila_n',
  'anguila tarde':      'anguila_n',
  'anguila 9:00 pm':    'anguila_nn',
  'anguila noche':      'anguila_nn',
  'new york tarde':     'new_york_t',
  'new york 3:30':      'new_york_t',
  'new york noche':     'new_york_n',
  'new york 10:30 pm':  'new_york_n',
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-DO,es;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};

// ── SCRAPER 1: loteriasdominicanas.com ────────────────────────────────────────
// Estructura confirmada del HTML:
//   <a class="game-title" href="/loteria-nacional/gana-mas"><span>Gana Más</span></a>
//   <div class="game-scores p-2 ball-mode">
//     <span class="score ">67</span>
//     <span class="score ">66</span>
//     <span class="score ">37</span>
//   </div>
async function scrapeLotDominicanas() {
  try {
    console.log('📡 [1] Raspando loteriasdominicanas.com...');
    const res = await axios.get('https://loteriasdominicanas.com/', {
      headers: HEADERS, timeout: 20000
    });
    const $ = cheerio.load(res.data);
    let conteo = 0;

    // Cada sorteo está en un .game-block
    $('.game-block').each((i, bloque) => {
      // Obtener href del game-title para identificar el sorteo
      const enlace = $(bloque).find('a.game-title').first();
      const href   = enlace.attr('href') || '';
      const nombre = enlace.find('span').first().text().trim().toLowerCase();

      // Identificar clave por href primero, luego por nombre
      let clave = HREF_MAPA[href];
      if (!clave) {
        for (const [k, v] of Object.entries(NOMBRE_MAPA)) {
          if (nombre.includes(k)) { clave = v; break; }
        }
      }
      if (!clave || !estado.sorteos[clave]) return;
      if (estado.sorteos[clave].numeros.length >= 3) return; // ya tenemos

      // Extraer los números: solo los primeros 3 span.score del .game-scores ball-mode
      const nums = [];
      $(bloque).find('.game-scores.ball-mode span.score').each((j, span) => {
        if (nums.length >= 3) return false; // solo quiniela (3 nums)
        const txt = $(span).text().trim();
        const n = parseInt(txt, 10);
        if (!isNaN(n) && n >= 0 && n <= 99) nums.push(n);
      });

      if (nums.length === 3) {
        estado.sorteos[clave].numeros = nums;
        estado.sorteos[clave].estado = 'disponible';
        conteo++;
        console.log(`  ✓ ${estado.sorteos[clave].nombre}: ${nums.join('-')}`);
      }
    });

    console.log(`✅ [1] loteriasdominicanas.com: ${conteo} sorteos`);
    return conteo;
  } catch (e) {
    console.error(`⚠️ [1] loteriasdominicanas.com ERROR: ${e.message}`);
    return 0;
  }
}

// ── SCRAPER 2: quinielasrd.com (respaldo) ────────────────────────────────────
// Estructura: texto plano — nombre del sorteo seguido de "NN NN NN"
async function scrapeQuinielasRD() {
  try {
    console.log('📡 [2] Raspando quinielasrd.com...');
    const res = await axios.get('https://quinielasrd.com/', {
      headers: HEADERS, timeout: 20000
    });
    const $ = cheerio.load(res.data);
    let conteo = 0;

    // quinielasrd usa links con el nombre y los números cerca
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const txt  = $(el).text().trim().toLowerCase();
      if (!txt || txt.length > 40) return;

      // Buscar clave por href o nombre
      let clave = null;
      for (const [k, v] of Object.entries(HREF_MAPA)) {
        if (href.includes(k.replace('/','')) || href === k) { clave = v; break; }
      }
      if (!clave) {
        for (const [k, v] of Object.entries(NOMBRE_MAPA)) {
          if (txt.includes(k)) { clave = v; break; }
        }
      }
      if (!clave || !estado.sorteos[clave]) return;
      if (estado.sorteos[clave].numeros.length >= 3) return;

      // Buscar números en el texto del elemento padre y sus hermanos
      const parent = $(el).closest('div, li, span');
      const textoBloque = parent.text();
      const matches = textoBloque.match(/\b(\d{2})\b/g);
      if (!matches || matches.length < 3) return;

      const nums = matches.slice(0, 3).map(Number).filter(n => n >= 0 && n <= 99);
      if (nums.length === 3) {
        estado.sorteos[clave].numeros = nums;
        estado.sorteos[clave].estado = 'disponible';
        conteo++;
        console.log(`  ✓ [Q] ${estado.sorteos[clave].nombre}: ${nums.join('-')}`);
      }
    });

    console.log(`✅ [2] quinielasrd.com: ${conteo} sorteos`);
    return conteo;
  } catch (e) {
    console.error(`⚠️ [2] quinielasrd.com ERROR: ${e.message}`);
    return 0;
  }
}

// ── SCRAPER 3: conectate.com.do (respaldo 2) ─────────────────────────────────
// Similar estructura a loteriasdominicanas.com (mismo proveedor kiskoo)
async function scrapeConectate() {
  try {
    console.log('📡 [3] Raspando conectate.com.do...');
    const res = await axios.get('https://www.conectate.com.do/loterias/', {
      headers: HEADERS, timeout: 20000
    });
    const $ = cheerio.load(res.data);
    let conteo = 0;

    // Igual estructura .game-block / .game-title / .game-scores .score
    $('.game-block').each((i, bloque) => {
      const enlace = $(bloque).find('a.game-title, .game-title a').first();
      const href   = enlace.attr('href') || '';
      const nombre = $(bloque).find('.game-title span, .company-title a').first().text().trim().toLowerCase();

      let clave = null;
      for (const [k, v] of Object.entries(NOMBRE_MAPA)) {
        if (nombre.includes(k)) { clave = v; break; }
      }
      if (!clave || !estado.sorteos[clave]) return;
      if (estado.sorteos[clave].numeros.length >= 3) return;

      const nums = [];
      $(bloque).find('.game-scores span.score, .ball-single, .lottery-number').each((j, s) => {
        if (nums.length >= 3) return false;
        const n = parseInt($(s).text().trim(), 10);
        if (!isNaN(n) && n >= 0 && n <= 99) nums.push(n);
      });

      if (nums.length === 3) {
        estado.sorteos[clave].numeros = nums;
        estado.sorteos[clave].estado = 'disponible';
        conteo++;
        console.log(`  ✓ [C] ${estado.sorteos[clave].nombre}: ${nums.join('-')}`);
      }
    });

    console.log(`✅ [3] conectate.com.do: ${conteo} sorteos`);
    return conteo;
  } catch (e) {
    console.error(`⚠️ [3] conectate.com.do ERROR: ${e.message}`);
    return 0;
  }
}

// ── Sincronización principal ──────────────────────────────────────────────────
async function sincronizar() {
  const hoy = fechaRD();
  console.log(`\n🔄 [${horaRD()} RD] Sincronizando... (${hoy})`);

  // Nuevo día → guardar histórico y resetear
  if (hoy !== estado.fecha) {
    const snapshot = { fecha: estado.fecha, sorteos: JSON.parse(JSON.stringify(estado.sorteos)) };
    estado.historico.unshift(snapshot);
    if (estado.historico.length > 90) estado.historico.pop();
    estado.sorteos = crearSorteos();
    estado.fecha = hoy;
    console.log(`📅 Nuevo día ${hoy}. Histórico: ${estado.historico.length} días.`);
  }

  // Scraper 1 primero (mejor fuente — HTML confirmado)
  const c1 = await scrapeLotDominicanas();

  // Scraper 2 si faltan sorteos
  const pendientes = Object.values(estado.sorteos).filter(s => s.numeros.length < 3).length;
  if (pendientes > 8) await scrapeQuinielasRD();

  // Scraper 3 si aún faltan
  const pendientes2 = Object.values(estado.sorteos).filter(s => s.numeros.length < 3).length;
  if (pendientes2 > 8) await scrapeConectate();

  estado.hora_actualizacion = horaRD();
  const disp = Object.values(estado.sorteos).filter(s => s.numeros.length >= 3).length;
  console.log(`📊 RESULTADO FINAL: ${disp}/18 sorteos con números\n`);
}

// Auto-sync cada 15 minutos
setInterval(sincronizar, 15 * 60 * 1000);

// ── ENDPOINTS ─────────────────────────────────────────────────────────────────

app.get('/api/hoy', async (req, res) => {
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

app.get('/', (req, res) => {
  res.json({
    version: 'v4.0-REAL',
    status: 'ok',
    fecha_rd: fechaRD(),
    hora_rd: horaRD(),
    sorteos_hoy: Object.values(estado.sorteos).filter(s=>s.numeros.length>=3).length,
    historico_dias: estado.historico.length,
    fuente: 'loteriasdominicanas.com (selectores confirmados del HTML real)'
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Reydis Engine v4.0-REAL en puerto ${PORT}`);
  console.log(`📋 Selectores: .game-block > a.game-title[href] + .game-scores.ball-mode span.score`);
  sincronizar();
});
