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

function obtenerFechaRD() {
    const fecha = new Date();
    const opciones = { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formateador = new Intl.DateTimeFormat('en-CA', opciones);
    return formateador.format(fecha);
}

let datosLoterias = {
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
    'anguila mañana': 'anguila_m',
    'la primera': 'laprimera',
    'lotedom': 'lotedom',
    'la suerte dominicana': 'suerte',
    'lotería real': 'real_t',
    'gana más': 'gana_mas',
    'new york tarde': 'new_york_t',
    'leidsa': 'leidsa',
    'lotería nacional': 'nacional'
};

async function rasparLoteriasRD() {
    try {
        console.log("📡 Robot Premium activado: Solicitando túnel con Proxy Rotativo...");
        datosLoterias.fecha = obtenerFechaRD();

        // 🔑 CLAVE DE ACCESO GRATUITA DE RESPALDO PARA TU SCRAPERAPI
        const apiKey = '5177894a861dcf3a8d1674db4015f8a0'; 
        const urlDestino = encodeURIComponent('https://loteriasdominicanas.com/');
        
        // El robot ya no va directo a la web, pasa a través del túnel blindado de ScraperAPI
        const urlProxy = `http://api.scraperapi.com?api_key=${apiKey}&url=${urlDestino}`;

        const response = await axios.get(urlProxy, { timeout: 25000 });

        if (response && response.data) {
            const $ = cheerio.load(response.data);
            console.log("✅ Túnel establecido: Evadiendo Cloudflare con éxito.");

            $('.lottery-block, .game-block, .session-block').each((i, elemento) => {
                let nombreLoteriaWeb = $(elemento).find('h2, h3, .title, .lottery-title').text().trim();
                
                if (nombreLoteriaWeb) {
                    const nombreMinuscula = nombreLoteriaWeb.toLowerCase().replace(/[\n\t]/g, '').trim();
                    let codigoRadar = null;
                    
                    for (const [key, value] of Object.entries(mapeoFuentes)) {
                        if (nombreMinuscula.includes(key)) {
                            codigoRadar = value;
                            break;
                        }
                    }
                    
                    if (codigoRadar) {
                        let numerosExtraidos = [];
                        
                        // Raspado de bolos tradicional
                        $(elemento).find('.ball, .bolo, .number-ball, .ball-single').each((j, bola) => {
                            const numeroRaw = $(bola).text().trim();
                            if (numeroRaw) {
                                const numero = parseInt(numeroRaw, 10);
                                if (!isNaN(numero) && numero >= 0 && numero <= 99) {
                                    numerosExtraidos.push(numero);
                                }
                            }
                        });

                        // Plan B: Extracción cruda por celdas por si cambiaron el estilo visual
                        if (numerosExtraidos.length < 3) {
                            numerosExtraidos = [];
                            $(elemento).find('span, div, td').each((j, celda) => {
                                const textoCelda = $(celda).text().trim();
                                if (textoCelda.length === 2 && !isNaN(textoCelda)) {
                                    numerosExtraidos.push(parseInt(textoCelda, 10));
                                }
                            });
                        }

                        if (numerosExtraidos.length >= 3) {
                            datosLoterias.sorteos[codigoRadar] = numerosExtraidos.slice(0, 3);
                            console.log(`🚀 ¡Bingo de Red Automático! Indexado: ${nombreLoteriaWeb} -> ${numerosExtraidos.slice(0, 3)}`);
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.log("⚠️ Nota del proxy en Render:", error.message);
    }
}

// Escaneo automático cada 4 minutos para optimizar los créditos gratuitos
setInterval(rasparLoteriasRD, 4 * 60 * 1000);

app.get('/api/radar', (req, res) => {
    res.json(datosLoterias);
});

app.get('/', (req, res) => {
    res.send(`🤖 Reydis Bot Anti-Bloqueo Pro v5 en línea. Operaciones de hoy: ${obtenerFechaRD()}`);
});

app.listen(PORT, () => {
    console.log(`🚀 Motor Pro con Proxy corriendo en el puerto ${PORT}`);
    rasparLoteriasRD();
});
