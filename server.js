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

// DICCIONARIO MATRIZ: Adaptado a los nombres exactos de loteriasdominicanas.com
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
        console.log("📡 Robot rastreador activado: Indexando directo desde LoteriasDominicanas.com...");
        datosLoterias.fecha = obtenerFechaRD();

        // Conexión directa a la nueva fuente recomendada
        const response = await axios.get('https://loteriasdominicanas.com/', { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
            },
            timeout: 10000 
        });

        if (response && response.data) {
            const $ = cheerio.load(response.data);
            
            // Caminamos por los bloques principales de resultados de la nueva web
            $('.lottery-block, .game-block, .session-block').each((i, elemento) => {
                let nombreLoteriaWeb = $(elemento).find('h2, h3, .title, .lottery-title').text().trim();
                
                if (nombreLoteriaWeb) {
                    // Limpiar el texto para que el robot lo lea limpio sin espacios raros
                    const nombreMinuscula = nombreLoteriaWeb.toLowerCase().replace(/[\n\t]/g, '').trim();
                    
                    let codigoRadar = null;
                    for (const [key, value] of Object.entries(mapeoFuentes)) {
                        if (nombreMinuscula.includes(key)) {
                            codigoRadar = value;
                            break;
                        }
                    }
                    
                    // Si encontramos la tómbola en el Radar, extraemos sus tres bolos
                    if (codigoRadar) {
                        let numerosExtraidos = [];
                        
                        // En esta web los bolos suelen venir en elementos con clases como .ball, .bolo o .number-ball
                        $(elemento).find('.ball, .bolo, .number-ball, .ball-single').each((j, bola) => {
                            const numeroRaw = $(bola).text().trim();
                            if (numeroRaw) {
                                const numero = parseInt(numeroRaw, 10);
                                if (!isNaN(numero) && numero >= 0 && numero <= 99) {
                                    numerosExtraidos.push(numero);
                                }
                            }
                        });

                        // Plan B de respaldo por si la web usa un diseño de celdas o divs planos
                        if (numerosExtraidos.length < 3) {
                            numerosExtraidos = [];
                            $(elemento).find('span, div').each((j, celda) => {
                                const textoCelda = $(celda).text().trim();
                                if (textoCelda.length === 2 && !isNaN(textoCelda)) {
                                    numerosExtraidos.push(parseInt(textoCelda, 10));
                                }
                            });
                        }

                        // Guardamos de forma estricta los 3 primeros bolos del día de hoy lunes
                        if (numerosExtraidos.length >= 3) {
                            datosLoterias.sorteos[codigoRadar] = numerosExtraidos.slice(0, 3);
                            console.log(`✅ ¡Éxito de Red! Indexado: ${nombreLoteriaWeb} -> ${numerosExtraidos.slice(0, 3)}`);
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.log("⚠️ Nota del bot rastreando la nueva web:", error.message);
    }
}

// Escaneo automático continuo cada 3 minutos para atrapar los tiros al instante
setInterval(rasparLoteriasRD, 3 * 60 * 1000);

app.get('/api/radar', (req, res) => {
    res.json(datosLoterias);
});

app.get('/', (req, res) => {
    res.send(`🤖 Reydis Bot Autónomo v3 en línea. Fuente: LoteriasDominicanas. Operaciones: ${obtenerFechaRD()}`);
});

app.listen(PORT, () => {
    console.log(`🚀 Motor inteligente corriendo nítido en el puerto ${PORT}`);
    rasparLoteriasRD();
});
