const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ─── Fecha en zona horaria RD ───────────────────────────────────────────────
function obtenerFechaRD() {
    const opciones = { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' };
    return new Intl.DateTimeFormat('en-CA', opciones).format(new Date());
}

function obtenerHoraRD() {
    const opciones = { timeZone: 'America/Santo_Domingo', hour: '2-digit', minute: '2-digit', hour12: false };
    return new Intl.DateTimeFormat('es-DO', opciones).format(new Date());
}

// ─── Estructura de datos principal ──────────────────────────────────────────
let datosLoterias = {
    fecha: obtenerFechaRD(),
    hora_actualizacion: obtenerHoraRD(),
    sorteos: {
        anguila_m:   { nombre: 'Anguila Mañana',    hora: '10:00', numeros: [], estado: 'pendiente' },
        laprimera:   { nombre: 'La Primera',         hora: '10:30', numeros: [], estado: 'pendiente' },
        lotedom:     { nombre: 'Lotedom',            hora: '11:30', numeros: [], estado: 'pendiente' },
        suerte:      { nombre: 'La Suerte',          hora: '12:00', numeros: [], estado: 'pendiente' },
        king_t:      { nombre: 'King Lottery Tarde', hora: '12:30', numeros: [], estado: 'pendiente' },
        real_t:      { nombre: 'Lotería Real',       hora: '12:30', numeros: [], estado: 'pendiente' },
        anguila_t:   { nombre: 'Anguila Tarde',      hora: '01:00', numeros: [], estado: 'pendiente' },
        gana_mas:    { nombre: 'Gana Más',           hora: '01:00', numeros: [], estado: 'pendiente' },
        new_york_t:  { nombre: 'New York Tarde',     hora: '02:30', numeros: [], estado: 'pendiente' },
        suerte_t2:   { nombre: 'La Suerte Tarde 2',  hora: '03:00', numeros: [], estado: 'pendiente' },
        anguila_n:   { nombre: 'Anguila Noche',      hora: '06:00', numeros: [], estado: 'pendiente' },
        king_n:      { nombre: 'King Lottery Noche', hora: '07:00', numeros: [], estado: 'pendiente' },
        loteka:      { nombre: 'Loteka',             hora: '07:30', numeros: [], estado: 'pendiente' },
        laprimera_n: { nombre: 'La Primera Noche',   hora: '08:00', numeros: [], estado: 'pendiente' },
        leidsa:      { nombre: 'Leidsa',             hora: '08:55', numeros: [], estado: 'pendiente' },
        nacional:    { nombre: 'Nacional',           hora: '09:00', numeros: [], estado: 'pendiente' },
        anguila_nn:  { nombre: 'Anguila Noche 2',    hora: '09:00', numeros: [], estado: 'pendiente' },
        new_york_n:  { nombre: 'New York Noche',     hora: '10:30', numeros: [], estado: 'pendiente' }
    },
    historico: [] // Guardado en memoria durante uptime
};

// ─── Headers anti-bloqueo ───────────────────────────────────────────────────
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-DO,es;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache'
};

// ─── SCRAPER 1: quinielasrd.com ─────────────────────────────────────────────
async function rasparQuinielasRD() {
    try {
        const res = await axios.get('https://www.quinielasrd.com/', { headers: HEADERS, timeout: 15000 });
        const $ = cheerio.load(res.data);
        let conteo = 0;

        const mapeo = {
            'anguila mañana': 'anguila_m', 'anguila manana': 'anguila_m',
            'la primera': 'laprimera', 'primera mañana': 'laprimera',
            'lotedom': 'lotedom',
            'la suerte': 'suerte', 'suerte dominicana': 'suerte',
            'king lottery tarde': 'king_t', 'king tarde': 'king_t',
            'lotería real': 'real_t', 'loteria real': 'real_t', 'real tarde': 'real_t',
            'anguila tarde': 'anguila_t',
            'gana mas': 'gana_mas', 'gana más': 'gana_mas',
            'new york tarde': 'new_york_t',
            'la suerte tarde': 'suerte_t2',
            'anguila noche': 'anguila_n',
            'king lottery noche': 'king_n', 'king noche': 'king_n',
            'loteka': 'loteka',
            'la primera noche': 'laprimera_n', 'primera noche': 'laprimera_n',
            'leidsa': 'leidsa',
            'lotería nacional': 'nacional', 'loteria nacional': 'nacional', 'nacional': 'nacional',
            'new york noche': 'new_york_n'
        };

        $('div, section, article').each((i, el) => {
            const titulo = $(el).find('h2, h3, h4, .title, .nombre').first().text().toLowerCase().trim();
            if (!titulo) return;

            let codigo = null;
            for (const [key, val] of Object.entries(mapeo)) {
                if (titulo.includes(key)) { codigo = val; break; }
            }
            if (!codigo) return;

            let nums = [];
            $(el).find('.numero, .ball, .bola, .number, [class*="ball"], [class*="num"]').each((j, b) => {
                const n = parseInt($(b).text().trim(), 10);
                if (!isNaN(n) && n >= 0 && n <= 99) nums.push(n);
            });

            if (nums.length < 3) {
                $(el).find('span, td, div').each((j, c) => {
                    const t = $(c).text().trim();
                    if (/^\d{1,2}$/.test(t)) {
                        const n = parseInt(t, 10);
                        if (!isNaN(n) && n >= 0 && n <= 99 && !nums.includes(n)) nums.push(n);
                    }
                });
            }

            if (nums.length >= 3 && datosLoterias.sorteos[codigo]) {
                datosLoterias.sorteos[codigo].numeros = nums.slice(0, 3);
                datosLoterias.sorteos[codigo].estado = 'disponible';
                conteo++;
            }
        });

        console.log(`✅ quinielasrd.com: ${conteo} sorteos actualizados`);
        return conteo;
    } catch (e) {
        console.log(`⚠️ quinielasrd.com falló: ${e.message}`);
        return 0;
    }
}

// ─── SCRAPER 2: enloteria.com ───────────────────────────────────────────────
async function rasparEnloteria() {
    try {
        const res = await axios.get('https://www.enloteria.com/resultados/', { headers: HEADERS, timeout: 15000 });
        const $ = cheerio.load(res.data);
        let conteo = 0;

        const mapeo = {
            'gana mas': 'gana_mas', 'gana más': 'gana_mas',
            'leidsa': 'leidsa',
            'nacional': 'nacional', 'loteria nacional': 'nacional',
            'loteka': 'loteka',
            'la primera': 'laprimera',
            'new york': 'new_york_n',
            'real': 'real_t',
            'anguila': 'anguila_m'
        };

        $('.lottery-result, .result-block, .sorteo-block, .game-result').each((i, el) => {
            const titulo = $(el).find('h2, h3, h4, .lottery-name, .name').first().text().toLowerCase().trim();
            if (!titulo) return;

            let codigo = null;
            for (const [key, val] of Object.entries(mapeo)) {
                if (titulo.includes(key)) { codigo = val; break; }
            }
            if (!codigo) return;
            if (datosLoterias.sorteos[codigo].numeros.length >= 3) return; // Ya tenemos datos

            let nums = [];
            $(el).find('.ball, .bola, .number, span').each((j, b) => {
                const t = $(b).text().trim();
                if (/^\d{1,2}$/.test(t)) {
                    const n = parseInt(t, 10);
                    if (!isNaN(n) && n >= 0 && n <= 99) nums.push(n);
                }
            });

            if (nums.length >= 3) {
                datosLoterias.sorteos[codigo].numeros = nums.slice(0, 3);
                datosLoterias.sorteos[codigo].estado = 'disponible';
                conteo++;
            }
        });

        console.log(`✅ enloteria.com: ${conteo} sorteos complementados`);
        return conteo;
    } catch (e) {
        console.log(`⚠️ enloteria.com falló: ${e.message}`);
        return 0;
    }
}

// ─── SCRAPER 3: conectate.com.do (respaldo) ─────────────────────────────────
async function rasparConectate() {
    try {
        const res = await axios.get('https://www.conectate.com.do/loterias/', { headers: HEADERS, timeout: 15000 });
        const $ = cheerio.load(res.data);
        let conteo = 0;

        const mapeo = {
            'gana mas': 'gana_mas', 'gana más': 'gana_mas',
            'leidsa': 'leidsa',
            'nacional': 'nacional',
            'loteka': 'loteka',
            'new york tarde': 'new_york_t',
            'new york noche': 'new_york_n',
            'anguila': 'anguila_m',
            'real': 'real_t'
        };

        $('.lottery-result-card, .game-block, .lottery-block').each((i, el) => {
            const titulo = $(el).find('.lottery-title, .game-title, h2, h3, h4').text().toLowerCase().trim();
            if (!titulo) return;

            let codigo = null;
            for (const [key, val] of Object.entries(mapeo)) {
                if (titulo.includes(key)) { codigo = val; break; }
            }
            if (!codigo) return;
            if (datosLoterias.sorteos[codigo].numeros.length >= 3) return;

            let nums = [];
            $(el).find('.ball, .bolo, .game-number, .ball-single, .lottery-number').each((j, b) => {
                const n = parseInt($(b).text().trim(), 10);
                if (!isNaN(n) && n >= 0 && n <= 99) nums.push(n);
            });

            if (nums.length >= 3) {
                datosLoterias.sorteos[codigo].numeros = nums.slice(0, 3);
                datosLoterias.sorteos[codigo].estado = 'disponible';
                conteo++;
            }
        });

        console.log(`✅ conectate.com.do: ${conteo} sorteos complementados`);
        return conteo;
    } catch (e) {
        console.log(`⚠️ conectate.com.do falló: ${e.message}`);
        return 0;
    }
}

// ─── Función principal de sincronización ────────────────────────────────────
async function sincronizarTodo() {
    console.log(`\n📡 [${obtenerHoraRD()} RD] Iniciando sincronización multi-fuente...`);
    
    const fechaActual = obtenerFechaRD();
    
    // Si cambió el día, guardar histórico y resetear
    if (fechaActual !== datosLoterias.fecha) {
        const entrada = {
            fecha: datosLoterias.fecha,
            sorteos: JSON.parse(JSON.stringify(datosLoterias.sorteos))
        };
        datosLoterias.historico.unshift(entrada);
        if (datosLoterias.historico.length > 60) datosLoterias.historico.pop(); // Máx 60 días
        
        // Resetear sorteos del nuevo día
        for (const key of Object.keys(datosLoterias.sorteos)) {
            datosLoterias.sorteos[key].numeros = [];
            datosLoterias.sorteos[key].estado = 'pendiente';
        }
        datosLoterias.fecha = fechaActual;
        console.log(`📅 Nuevo día: ${fechaActual}. Histórico guardado.`);
    }

    // Ejecutar scrapers en paralelo
    await Promise.allSettled([
        rasparQuinielasRD(),
        rasparEnloteria(),
        rasparConectate()
    ]);

    datosLoterias.hora_actualizacion = obtenerHoraRD();
    
    const disponibles = Object.values(datosLoterias.sorteos).filter(s => s.numeros.length >= 3).length;
    console.log(`🎯 Total disponibles: ${disponibles}/18\n`);
}

// ─── Sincronización automática cada 20 minutos ──────────────────────────────
setInterval(sincronizarTodo, 20 * 60 * 1000);

// ─── ENDPOINTS ──────────────────────────────────────────────────────────────

// Resultados del día actual
app.get('/api/hoy', async (req, res) => {
    await sincronizarTodo();
    res.json({
        fecha: datosLoterias.fecha,
        hora_actualizacion: datosLoterias.hora_actualizacion,
        sorteos: datosLoterias.sorteos
    });
});

// Histórico completo (últimos 60 días)
app.get('/api/historico', (req, res) => {
    res.json({
        historico: datosLoterias.historico,
        dias_disponibles: datosLoterias.historico.length
    });
});

// Consultar lotería específica por fecha
app.get('/api/consultar', (req, res) => {
    const { loteria, fecha_inicio, fecha_fin } = req.query;
    
    let resultados = [];
    
    // Incluir hoy
    const todasFechas = [
        { fecha: datosLoterias.fecha, sorteos: datosLoterias.sorteos },
        ...datosLoterias.historico
    ];

    for (const dia of todasFechas) {
        if (fecha_inicio && dia.fecha < fecha_inicio) continue;
        if (fecha_fin && dia.fecha > fecha_fin) continue;
        
        if (loteria && loteria !== 'todas') {
            if (dia.sorteos[loteria]) {
                resultados.push({
                    fecha: dia.fecha,
                    loteria: loteria,
                    nombre: dia.sorteos[loteria].nombre,
                    numeros: dia.sorteos[loteria].numeros
                });
            }
        } else {
            for (const [key, sorteo] of Object.entries(dia.sorteos)) {
                if (sorteo.numeros.length > 0) {
                    resultados.push({
                        fecha: dia.fecha,
                        loteria: key,
                        nombre: sorteo.nombre,
                        numeros: sorteo.numeros
                    });
                }
            }
        }
    }

    res.json({ resultados, total: resultados.length });
});

// Estadísticas para backtesting
app.get('/api/estadisticas', (req, res) => {
    const { loteria } = req.query;
    
    const todasFechas = [
        { fecha: datosLoterias.fecha, sorteos: datosLoterias.sorteos },
        ...datosLoterias.historico
    ];
    
    const frecuencia = {};
    const pares = {};
    const tripletas = {};
    
    for (const dia of todasFechas) {
        const sorteos = loteria && loteria !== 'todas' 
            ? (dia.sorteos[loteria] ? [dia.sorteos[loteria]] : [])
            : Object.values(dia.sorteos);
        
        for (const s of sorteos) {
            if (!s.numeros || s.numeros.length < 3) continue;
            const nums = s.numeros;
            
            // Frecuencia individual
            for (const n of nums) {
                frecuencia[n] = (frecuencia[n] || 0) + 1;
            }
            
            // Pares
            for (let i = 0; i < nums.length; i++) {
                for (let j = i+1; j < nums.length; j++) {
                    const key = [nums[i], nums[j]].sort((a,b)=>a-b).join('-');
                    pares[key] = (pares[key] || 0) + 1;
                }
            }
            
            // Tripletas
            const tk = nums.slice(0,3).sort((a,b)=>a-b).join('-');
            tripletas[tk] = (tripletas[tk] || 0) + 1;
        }
    }
    
    // Top resultados
    const topNumeros = Object.entries(frecuencia)
        .sort((a,b) => b[1]-a[1]).slice(0, 20)
        .map(([n, f]) => ({ numero: parseInt(n), frecuencia: f }));
    
    const topPares = Object.entries(pares)
        .sort((a,b) => b[1]-a[1]).slice(0, 10)
        .map(([par, f]) => ({ par, frecuencia: f }));
    
    const topTripletas = Object.entries(tripletas)
        .sort((a,b) => b[1]-a[1]).slice(0, 5)
        .map(([trip, f]) => ({ tripleta: trip, frecuencia: f }));
    
    res.json({ topNumeros, topPares, topTripletas, dias_analizados: todasFechas.length });
});

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        version: '2.0',
        mensaje: 'Reydis Engine v2.0 activo',
        fecha_rd: obtenerFechaRD(),
        hora_rd: obtenerHoraRD(),
        sorteos_hoy: Object.values(datosLoterias.sorteos).filter(s => s.numeros.length >= 3).length
    });
});

// ─── Arranque ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Reydis Engine v2.0 corriendo en puerto ${PORT}`);
    sincronizarTodo(); // Primera sincronización al arrancar
});
