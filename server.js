const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

// Habilitar CORS total para permitir la lectura desde CodeSandbox
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

function obtenerFechaRD() {
    const fecha = new Date();
    const opciones = { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formateador = new Intl.DateTimeFormat('en-CA', opciones);
    return formateador.format(fecha);
}

// Estructura limpia y estricta inicializada con arrays vacíos para evitar 'undefined'
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

// Mapeo preciso adaptado al HTML de la tómbola central
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
        console.log("📡 Robot extractor: Conectando y raspando tómbolas en tiempo real...");
        datosLoterias.fecha = obtenerFechaRD();

        const response = await axios.get('https://www.conectate.com.do/loterias/', { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' 
            },
            timeout: 15000 
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
                        if (nombreMinuscula.includes(key)) {
                            codigoRadar = value;
                            break;
                        }
                    }
                    
                    if (codigoRadar) {
                        let numerosExtraidos = [];
                        
                        // Capturar bolos numéricos estándar
                        $(elemento).find('.ball, .bolo, .game-number, .ball-single').each((j, bola) => {
                            const numeroRaw = $(bola).text().trim();
                            if (numeroRaw) {
                                const numero = parseInt(numeroRaw, 10);
                                if (!isNaN(numero) && numero >= 0 && numero <= 99) {
                                    numerosExtraidos.push(numero);
                                }
                            }
                        });

                        // Plan B de respaldo estructural
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
                            conteo++;
                        }
                    }
                }
            });
            console.log(`🎯 Proceso concluido con éxito. Tómbolas indexadas: ${conteo}`);
        }
    } catch (error) {
        console.error("⚠️ Nota en el módulo de raspado:", error.message);
    }
}

// Escaneo automático cada 3 minutos
setInterval(rasparLoteriasRD, 3 * 60 * 1000);

// RUTA CLAVE: Asegura la respuesta exacta en formato JSON puro
app.get('/api/radar', (req, res) => {
    res.json(datosLoterias);
});

app.get('/', (req, res) => {
    res.send(`🤖 Motor Reydis Pro v7.2 activo para el día de hoy: ${obtenerFechaRD()}`);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor Reydis escuchando en puerto ${PORT}`);
    rasparLoteriasRD();
});
