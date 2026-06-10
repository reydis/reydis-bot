const express = require('express');
const axios   = require('axios');
const cheerio = require('cheerio');
const cors    = require('cors');
const app     = express();
const PORT    = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.options('*', cors());
app.use(express.json());

// ── Zona horaria RD ──────────────────────────────────────────────
function fechaRD() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}
function horaRD() {
  return new Intl.DateTimeFormat('es-DO', {
    timeZone: 'America/Santo_Domingo', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
}

// ── Estado ───────────────────────────────────────────────────────
let estado = {
  fecha: fechaRD(),
  hora_actualizacion: horaRD(),
  sorteos: crearSorteos(),
  historico: []   // hasta 90 días en memoria
};

function crearSorteos() {
  return {
    anguila_m:   { nombre:'Anguila Mañana',    hora:'10:00 AM', numeros:[], estado:'pendiente' },
    laprimera:   { nombre:'La Primera Día',    hora:'10:30 AM', numeros:[], estado:'pendiente' },
    lotedom:     { nombre:'LoteDom',           hora:'11:30 AM', numeros:[], estado:'pendiente' },
    suerte:      { nombre:'La Suerte 12:30',   hora:'12:30 PM', numeros:[], estado:'pendiente' },
    king_t:      { nombre:'King Tarde',        hora:'12:30 PM', numeros:[], estado:'pendiente' },
    real_t:      { nombre:'Lotería Real',      hora:'12:30 PM', numeros:[], estado:'pendiente' },
    anguila_t:   { nombre:'Anguila 1:00 PM',   hora:'1:00 PM',  numeros:[], estado:'pendiente' },
    gana_mas:    { nombre:'Gana Más',          hora:'2:30 PM',  numeros:[], estado:'pendiente' },
    new_york_t:  { nombre:'New York Tarde',    hora:'3:30 PM',  numeros:[], estado:'pendiente' },
    suerte_t2:   { nombre:'La Suerte Tarde',   hora:'6:00 PM',  numeros:[], estado:'pendiente' },
    anguila_n:   { nombre:'Anguila 6:00 PM',   hora:'6:00 PM',  numeros:[], estado:'pendiente' },
    king_n:      { nombre:'King Noche',        hora:'7:00 PM',  numeros:[], estado:'pendiente' },
    loteka:      { nombre:'Loteka',            hora:'7:30 PM',  numeros:[], estado:'pendiente' },
    laprimera_n: { nombre:'La Primera Noche',  hora:'8:00 PM',  numeros:[], estado:'pendiente' },
    leidsa:      { nombre:'Leidsa',            hora:'8:55 PM',  numeros:[], estado:'pendiente' },
    nacional:    { nombre:'Lotería Nacional',  hora:'9:00 PM',  numeros:[], estado:'pendiente' },
    anguila_nn:  { nombre:'Anguila 9:00 PM',   hora:'9:00 PM',  numeros:[], estado:'pendiente' },
    new_york_n:  { nombre:'New York Noche',    hora:'10:30 PM', numeros:[], estado:'pendiente' }
  };
}

// ── MAPEO de nombres del sitio → clave interna ───────────────────
// Basado en los nombres exactos que usa quinielasrd.com
const MAPA = {
  'anguila 10:00 am': 'anguila_m',
  'anguila mañana':   'anguila_m',
  'primera día':      'laprimera',
  'la primera día':   'laprimera',
  'la primera dia':   'laprimera',
  'lotedom':          'lotedom',
  'la suerte 12:30':  'suerte',
  'la suerte 12:30 pm': 'suerte',
  'king tarde':       'king_t',
  'lotería real':     'real_t',
  'loteria real':     'real_t',
  'anguila 1:00 pm':  'anguila_t',
  'anguila mediodía': 'anguila_t',
  'anguila mediodia': 'anguila_t',
  'gana más':         'gana_mas',
  'gana mas':         'gana_mas',
  'new york 3:30':    'new_york_t',
  'new york tarde':   'new_york_t',
  'la suerte tarde':  'suerte_t2',
  'anguila 6:00 pm':  'anguila_n',
  'anguila tarde':    'anguila_n',
  'king noche':       'king_n',
  'loteka':           'loteka',
  'la primera noche': 'laprimera_n',
  'leidsa':           'leidsa',
  'lotería nacional': 'nacional',
  'loteria nacional': 'nacional',
  'anguila 9:00 pm':  'anguila_nn',
  'anguila noche':    'anguila_nn',
  'new york 10:30 pm':'new_york_n',
  'new york noche':   'new_york_n',
};

function buscarClave(texto) {
  const t = texto.toLowerCase().trim();
  for (const [k, v] of Object.entries(MAPA)) {
    if (t.includes(k)) return v;
  }
  return null;
}

function extraerNumeros(texto) {
  // Busca grupos de exactamente 2 dígitos separados por espacios
  const matches = texto.match(/\b\d{2}\b/g);
  if (!matches) return [];
  const nums = matches.map(Number).filter(n => n >= 0 && n <= 99);
  // Devolver solo únicos, máx 3
  return [...new Set(nums)].slice(0, 3);
}

// ── SCRAPER PRINCIPAL: quinielasrd.com ───────────────────────────
async function scrapeQuinielasRD(targetFecha) {
  try {
    console.log('📡 Raspando quinielasrd.com...');
    const res = await axios.get('https://quinielasrd.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-DO,es;q=0.9',
      },
      timeout: 20000
    });

    const $ = cheerio.load(res.data);
    let capturados = 0;
    let diaActual = null;
    let capturandoHoy = false;

    // El sitio tiene secciones por día con h2 de fecha y luego links con los sorteos
    // Estructura: <h2>martes 10 junio 2026</h2> ... <a href="/...">Nombre Sorteo</a> ... <span>52 14 98</span>

    // Estrategia: leer el texto completo y parsear línea por línea
    const textoCompleto = $('body').text();
    const lineas = textoCompleto.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // También intentar con el HTML estructurado
    // Buscar bloques de sorteo: cada sorteo tiene un <a> con el nombre y cerca los números
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const texto = $(el).text().trim();
      if (!href.includes('quinielasrd.com') && !href.startsWith('/')) return;
      
      const clave = buscarClave(texto);
      if (!clave) return;
      if (estado.sorteos[clave] && estado.sorteos[clave].numeros.length >= 3) return;

      // Buscar números cerca de este elemento (siguiente sibling o parent)
      let contenedor = $(el).parent();
      let numTexto = contenedor.text().replace(texto, '').trim();
      
      // Si no hay números aquí, buscar en el siguiente elemento
      if (!numTexto || numTexto.length < 6) {
        const next = $(el).parent().next();
        numTexto = (next.text() || '').trim();
      }

      const nums = extraerNumeros(numTexto);
      if (nums.length === 3) {
        estado.sorteos[clave].numeros = nums;
        estado.sorteos[clave].estado = 'disponible';
        capturados++;
        console.log(`  ✓ ${texto}: ${nums.join('-')}`);
      }
    });

    // Método 2: leer el texto del body y buscar patrones "Nombre\nNN NN NN"
    if (capturados < 5) {
      console.log('  → Usando parser de texto plano...');
      for (let i = 0; i < lineas.length - 1; i++) {
        const clave = buscarClave(lineas[i]);
        if (!clave) continue;
        if (estado.sorteos[clave] && estado.sorteos[clave].numeros.length >= 3) continue;

        // Los números pueden estar en la misma línea o en las 2 siguientes
        for (let j = i + 1; j <= Math.min(i + 3, lineas.length - 1); j++) {
          const nums = extraerNumeros(lineas[j]);
          if (nums.length === 3) {
            estado.sorteos[clave].numeros = nums;
            estado.sorteos[clave].estado = 'disponible';
            capturados++;
            console.log(`  ✓ [txt] ${lineas[i]}: ${nums.join('-')}`);
            break;
          }
        }
      }
    }

    console.log(`✅ quinielasrd.com: ${capturados} sorteos capturados`);
    return capturados;
  } catch (e) {
    console.error('⚠️ quinielasrd.com error:', e.message);
    return 0;
  }
}

// ── SCRAPER RESPALDO: loteriasdominicanas.com ────────────────────
async function scrapeRespaldo() {
  try {
    const res = await axios.get('https://loteriasdominicanas.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36' },
      timeout: 20000
    });
    const $ = cheerio.load(res.data);
    let capturados = 0;

    // Este sitio también tiene estructura simple de texto
    const lineas = $('body').text().split('\n').map(l => l.trim()).filter(l => l);
    for (let i = 0; i < lineas.length - 1; i++) {
      const clave = buscarClave(lineas[i]);
      if (!clave) continue;
      if (estado.sorteos[clave] && estado.sorteos[clave].numeros.length >= 3) continue;
      for (let j = i + 1; j <= Math.min(i + 3, lineas.length - 1); j++) {
        const nums = extraerNumeros(lineas[j]);
        if (nums.length === 3) {
          estado.sorteos[clave].numeros = nums;
          estado.sorteos[clave].estado = 'disponible';
          capturados++;
          break;
        }
      }
    }
    console.log(`✅ respaldo: ${capturados} sorteos`);
    return capturados;
  } catch (e) {
    console.error('⚠️ respaldo error:', e.message);
    return 0;
  }
}

// ── Sincronización principal ─────────────────────────────────────
async function sincronizar() {
  const hoy = fechaRD();
  console.log(`\n🔄 [${horaRD()}] Sincronizando... fecha RD: ${hoy}`);

  // Si cambió el día → guardar histórico y resetear
  if (hoy !== estado.fecha) {
    const entrada = {
      fecha: estado.fecha,
      sorteos: JSON.parse(JSON.stringify(estado.sorteos))
    };
    estado.historico.unshift(entrada);
    if (estado.historico.length > 90) estado.historico.pop();
    estado.sorteos = crearSorteos();
    estado.fecha = hoy;
    console.log(`📅 Nuevo día: ${hoy}. Histórico guardado (${estado.historico.length} días).`);
  }

  await scrapeQuinielasRD(hoy);
  
  // Si faltaron sorteos, intentar respaldo
  const pendientes = Object.values(estado.sorteos).filter(s => s.numeros.length < 3).length;
  if (pendientes > 10) {
    await scrapeRespaldo();
  }

  estado.hora_actualizacion = horaRD();
  const disp = Object.values(estado.sorteos).filter(s => s.numeros.length >= 3).length;
  console.log(`📊 Resultado: ${disp}/18 sorteos disponibles\n`);
}

// ── Auto-sync cada 15 minutos ────────────────────────────────────
setInterval(sincronizar, 15 * 60 * 1000);

// ── ENDPOINTS ────────────────────────────────────────────────────

// Resultados de hoy (fuerza sync)
app.get('/api/hoy', async (req, res) => {
  await sincronizar();
  res.json({
    fecha: estado.fecha,
    hora_actualizacion: estado.hora_actualizacion,
    sorteos: estado.sorteos
  });
});

// Histórico completo
app.get('/api/historico', (req, res) => {
  res.json({ historico: estado.historico, total: estado.historico.length });
});

// Consultar por lotería y rango de fecha
app.get('/api/consultar', (req, res) => {
  const { loteria, fecha_inicio, fecha_fin } = req.query;
  const todos = [
    { fecha: estado.fecha, sorteos: estado.sorteos },
    ...estado.historico.map(h => ({ fecha: h.fecha, sorteos: h.sorteos }))
  ];
  
  const resultados = [];
  for (const dia of todos) {
    if (fecha_inicio && dia.fecha < fecha_inicio) continue;
    if (fecha_fin   && dia.fecha > fecha_fin)   continue;
    const lotes = (loteria && loteria !== 'todas')
      ? [loteria]
      : Object.keys(estado.sorteos);
    for (const k of lotes) {
      const s = dia.sorteos[k];
      if (s && s.numeros && s.numeros.length >= 3) {
        resultados.push({ fecha: dia.fecha, clave: k, nombre: s.nombre, numeros: s.numeros });
      }
    }
  }
  res.json({ resultados, total: resultados.length });
});

// Estadísticas para backtesting
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
      ? [loteria]
      : ['gana_mas','leidsa','nacional','loteka'];
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
  
  const topNumeros = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([n,f])=>({numero:+n,frecuencia:f}));
  const topPares   = Object.entries(pares).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([p,f])=>({par:p,frecuencia:f}));
  const topTrips   = Object.entries(trips).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([t,f])=>({tripleta:t,frecuencia:f}));
  res.json({ topNumeros, topPares, topTrips, total_sorteos: total });
});

// Health
app.get('/', (req, res) => {
  res.json({
    version: 'v3.0',
    status: 'ok',
    fecha_rd: fechaRD(),
    hora_rd: horaRD(),
    sorteos_hoy: Object.values(estado.sorteos).filter(s=>s.numeros.length>=3).length,
    historico_dias: estado.historico.length
  });
});

// ── Arranque ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Reydis Engine v3.0 corriendo en puerto ${PORT}`);
  sincronizar();
});
