const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

// Configuración avanzada de CORS para que CodeSandbox lea sin bloqueos
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
});

function obtenerFechaRD() {
    const fecha = new Date();
    const opciones = { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formateador = new Intl.DateTimeFormat('en-CA', opciones);
    return formateador.format(fecha);
}

// Estructura limpia que espera tu frontend para no dar undefined
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
    'real': 'real_t',
    'gana más': 'gana_mas',
    'new york tarde': 'new_york_t',
    'leidsa': 'leidsa',
    'lotería nacional': 'nacional',
    'nacional': 'nacional'
};

async function rasparLoteriasRD() {
    try {
        console.log("📡 Robot extractor activado: Conectando a la tómbola central...");
        datosLoterias.fecha = obtenerFechaRD();

        // Petición directa con cabecera de navegador real para evitar bloqueos básicos
        const response = await axios.get('https://www.conectate.com.do/loterias/', { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' 
            },
            timeout: 12000 
        });

        if (response && response.data) {
            const $ = cheerio.load(response.data);
            let conteoExitoso = 0;
            
            // Selector Universal: Buscamos cualquier contenedor de sorteo
            $('.lottery-result-card, .game-block, .lottery-block').each((i, elemento) => {
                let nombreLoteriaWeb = $(elemento).find('.lottery-title, .game-title, h2, h3').text().trim();
                
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
                        
                        // PLAN A: Buscar bolos con clases estándar de esferas
                        $(elemento).find('.ball, .bolo, .game-number, .ball-single').each((j, bola) => {
                            const numeroRaw = $(bola).text().trim();
                            if (numeroRaw) {
                                const numero = parseInt(numeroRaw, 10);
                                if (!isNaN(numero) && numero >= 0 && numero <= 99) {
                                    numerosExtraidos.push(numero);
                                }
                            }
                        });

                        // PLAN B: Extracción cruda de texto si cambiaron el diseño de los círculos
                        if (numerosExtraidos.length < 3) {
                            numerosExtraidos = [];
                            $(elemento).find('span, div, td').each((j, celda) => {
                                const textoCelda = $(celda).text().trim();
                                if (textoCelda.length === 2 && !isNaN(textoCelda)) {
                                    numerosExtraidos.push(parseInt(textoCelda, 10));
                                }
                            });
                        }

                        // Guardamos de manera estricta solo si tenemos los 3 bolos ganadores de hoy
                        if (numerosExtraidos.length >= 3) {
                            datosLoterias.sorteos[codigoRadar] = numerosExtraidos.slice(0, 3);
                            conteoExitoso++;
                        }
                    }
                }
            });
            console.log(`🎯 Raspado finalizado. Tómbolas indexadas con éxito hoy: ${conteoExitoso}`);
        }
    } catch (error) {
        console.error("⚠️ Nota en el módulo de extracción:", error.message);
    }
}

// Rastreo automático continuo cada 3 minutos
setInterval(rasparLoteriasRD, 3 * 60 * 1000);

app.get('/api/radar', (req, res) => {
    res.json(datosLoterias);
});

app.get('/', (req, res) => {
    res.send(`🤖 Reydis Central Engine v7 en línea. Estatus de Red: Conectado. Fecha: ${obtenerFechaRD()}`);
});

app.listen(PORT, () => {
    console.log(`🚀 Motor Reydis activo de forma exacta en puerto ${PORT}`);
    rasparLoteriasRD();
});
