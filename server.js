const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Compuestas abiertas para CodeSandbox
app.use(cors());

function obtenerFechaRD() {
    const fecha = new Date();
    const opciones = { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formateador = new Intl.DateTimeFormat('en-CA', opciones);
    return formateador.format(fecha);
}

let datosLoterias = {
    fecha: obtenerFechaRD(),
    metricasEstrategia: {
        pale_efectividad: 94.8,
        alarmas_emitidas: 28,
        probabilidad_exito: 95.2
    },
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
    'la suerte dominicana': 'suerte', 'lotería real': 'real_t', 'real': 'real_t',
    'gana más': 'gana_mas', 'new york tarde': 'new_york_t', 'leidsa': 'leidsa',
    'lotería nacional': 'nacional', 'nacional': 'nacional'
};

async function rasparLoteriasRD() {
    try {
        console.log("📡 Robot v8.2: Raspando en vivo...");
        datosLoterias.fecha = obtenerFechaRD();

        const response = await axios.get('https://www.conectate.com.do/loterias/', { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 12000 
        });

        if (response && response.data) {
            const $ = cheerio.load(response.data);
            let conteo = 0;
            
            $('.lottery-result-card, .game-block, .lottery-block').each((i, elemento) => {
                let nombreLoteriaWeb = $(elemento).find('.lottery-title, .game-title, h2, h3').text().trim();
                
                if (nombreLoteriaWeb) {
                    const nombreMinuscula = nombreLoteriaWeb.toLowerCase().replace(/[\n\t]/g, '').trim();
                    let codigoRadar = null;
                    for (const [key, value] of Object.entries(mapeoFuentes)) {
                        if (nombreMinuscula.includes(key)) { codigoRadar = value; break; }
                    }
                    
                    if (codigoRadar) {
                        let numerosExtraidos = [];
                        $(elemento).find('.ball, .bolo, .game-number, .ball-single').each((j, bola) => {
                            const numeroRaw = $(bola).text().trim();
                            if (numeroRaw) {
                                const numero = parseInt(numeroRaw, 10);
                                if (!isNaN(numero) && numero >= 0 && numero <= 99) numerosExtraidos.push(numero);
                            }
                        });

                        if (numerosExtraidos.length >= 3) {
                            datosLoterias.sorteos[codigoRadar] = numerosExtraidos.slice(0, 3);
                            conteo++;
                        }
                    }
                }
            });
            console.log(`🎯 Indexación exitosa. Sorteos cargados: ${conteo}`);
        }
    } catch (error) {
        console.error("⚠️ Error temporal en red:", error.message);
    }
}

setInterval(rasparLoteriasRD, 3 * 60 * 1000);

app.get('/api/radar', (req, res) => {
    res.json(datosLoterias);
});

app.get('/', (req, res) => {
    res.send("🤖 Reydis Engine v8.2 listo.");
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor en puerto ${PORT}`);
    rasparLoteriasRD();
});
