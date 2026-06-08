const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

function obtenerFechaRD(fechaObjeto = new Date()) {
    const opciones = { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formateador = new Intl.DateTimeFormat('en-CA', opciones);
    return formateador.format(fechaObjeto);
}

// Banco de datos en memoria para el día de hoy
let datosLoteriasHoy = {
    fecha: obtenerFechaRD(),
    sorteos: {
        anguila_m: [], laprimera: [], lotedom: [], suerte: [],
        king_t: [], real_t: [], anguila_t: [], gana_mas: [],
        new_york_t: [], suerte_t2: [], anguila_n: [], king_n: [],
        loteka: [], laprimera_n: [], leidsa: [], nacional: [],
        anguila_nn: [], new_york_n: []
    }
};

const mapeoFuentes = {
    'anguila mañana': 'anguila_m', 'la primera': 'laprimera', 'lotedom': 'lotedom',
    'la suerte dominicana': 'suerte', 'lotería real': 'real_t', 'gana más': 'gana_mas',
    'new york tarde': 'new_york_t', 'leidsa': 'leidsa', 'lotería nacional': 'nacional'
};

// FUNCIÓN DE RASPADO INTEGRADA CON PROXIES ROTATIVOS (Para evitar bloqueos de Cloudflare)
async function rasparLoteriasPorFecha(fechaDestino) {
    let resultados = {
        fecha: fechaDestino,
        sorteos: {
            anguila_m: [], laprimera: [], lotedom: [], suerte: [],
            king_t: [], real_t: [], anguila_t: [], gana_mas: [],
            new_york_t: [], suerte_t2: [], anguila_n: [], king_n: [],
            loteka: [], laprimera_n: [], leidsa: [], nacional: [],
            anguila_nn: [], new_york_n: []
        }
    };

    try {
        const apiKey = '5177894a861dcf3a8d1674db4015f8a0'; 
        // Si la fecha buscada es la de hoy, vamos a la principal, si no, construimos la ruta histórica de la web
        const urlBase = fechaDestino === obtenerFechaRD() 
            ? 'https://loteriasdominicanas.com/' 
            : `https://loteriasdominicanas.com/resultados/${fechaDestino}`;

        const urlProxy = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(urlBase)}`;
        const response = await axios.get(urlProxy, { timeout: 20000 });

        if (response && response.data) {
            const $ = cheerio.load(response.data);

            $('.lottery-block, .game-block, .session-block').each((i, elemento) => {
                let nombreLoteriaWeb = $(elemento).find('h2, h3, .title, .lottery-title').text().trim();
                if (nombreLoteriaWeb) {
                    const nombreMinuscula = nombreLoteriaWeb.toLowerCase().replace(/[\n\t]/g, '').trim();
                    let codigoRadar = null;
                    for (const [key, value] of Object.entries(mapeoFuentes)) {
                        if (nombreMinuscula.includes(key)) { codigoRadar = value; break; }
                    }

                    if (codigoRadar) {
                        let numerosExtraidos = [];
                        $(elemento).find('.ball, .bolo, .number-ball').each((j, bola) => {
                            const num = parseInt($(bola).text().trim(), 10);
                            if (!isNaN(num) && num >= 0 && num <= 99) numerosExtraidos.push(num);
                        });

                        if (numerosExtraidos.length >= 3) {
                            resultados.sorteos[codigoRadar] = numerosExtraidos.slice(0, 3);
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.log(`⚠️ Nota en rastreo histórico (${fechaDestino}):`, error.message);
    }
    return resultados;
}

// Tarea automática: Sigue actualizando los datos de HOY cada 4 minutos solo si es necesario
async function sincronizarHoy() {
    console.log("📡 Ejecutando rastreo automático del día...");
    const datosFrescos = await rasparLoteriasPorFecha(obtenerFechaRD());
    
    // Solo sobreescribimos si encontramos datos reales para no borrar lo que ya tenemos
    for (const loteria in datosFrescos.sorteos) {
        if (datosFrescos.sorteos[loteria].length >= 3) {
            datosLoteriasHoy.sorteos[loteria] = datosFrescos.sorteos[loteria];
        }
    }
}
setInterval(sincronizarHoy, 4 * 60 * 1000);
setTimeout(sincronizarHoy, 5000); // Primera carga al encender

// =====================================
// 📡 ENDPOINTS DE TU API (CÓMO LE PEDIRÁS LOS DATOS)
// =====================================

// 1. Endpoint flexible: Soporta filtro por FECHA y por LOTERÍA INDIVIDUAL o TODAS
app.get('/api/radar', async (req, res) => {
    const queryFecha = req.query.fecha; // Ejemplo: ?fecha=2026-06-07
    const queryLoteria = req.query.loteria; // Ejemplo: &loteria=gana_mas o &loteria=todas

    let fechaABuscar = queryFecha ? queryFecha : obtenerFechaRD();

    // Si pide la fecha de hoy y no especificó lotería, devolvemos rápido lo que hay en memoria
    if (fechaABuscar === obtenerFechaRD() && (!queryLoteria || queryLoteria === 'todas')) {
        return res.json(datosLoteriasHoy);
    }

    console.log(`🔍 Buscando datos históricos en red para la fecha: ${fechaABuscar}`);
    const datosHistoricos = await rasparLoteriasPorFecha(fechaABuscar);

    // Si el usuario pidió una lotería específica (Ej: /api/radar?fecha=2026-06-05&loteria=gana_mas)
    if (queryLoteria && queryLoteria !== 'todas') {
        if (datosHistoricos.sorteos[queryLoteria]) {
            return res.json({
                fecha: fechaABuscar,
                loteria: queryLoteria,
                sorteos: { [queryLoteria]: datosHistoricos.sorteos[queryLoteria] }
            });
        } else {
            return res.status(404).json({ error: "Lotería no encontrada o sin sorteos para esa fecha." });
        }
    }

    // Si no pide lotería individual o pide "todas", devuelve el mapa completo de esa fecha
    res.json(datosHistoricos);
});

app.get('/', (req, res) => {
    res.send(`🤖 Motor de Análisis Histórico Reydis v7 en línea. Fecha del sistema: ${obtenerFechaRD()}`);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor de Análisis Inteligente corriendo en el puerto ${PORT}`);
});
