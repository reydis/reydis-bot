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

// ARRANCA TOTALMENTE LIMPIO (Sin números ficticios falsos)
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

// Mapeo exacto de los nombres de clase que usa Conectate en su HTML
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
        console.log("📡 Robot activado: Raspando Conectate en tiempo real...");
        datosLoterias.fecha = obtenerFechaRD();

        // Entramos directo a la fuente que me pasaste
        const response = await axios.get('https://www.conectate.com.do/loterias/', { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
            },
            timeout: 10000 
        });

        if (response && response.data) {
            const $ = cheerio.load(response.data);
            
            // Recorremos los bloques de resultados de Conectate
            $('.lottery-result-card, .game-block').each((i, elemento) => {
                let nombreLoteriaWeb = $(elemento).find('.lottery-title, .game-title').text().trim();
                
                if (nombreLoteriaWeb) {
                    const nombreMinuscula = nombreLoteriaWeb.toLowerCase().trim();
                    let codigoRadar = null;
                    
                    for (const [key, value] of Object.entries(mapeoFuentes)) {
                        if (nombreMinuscula.includes(key)) {
                            codigoRadar = value;
                            break;
                        }
                    }
                    
                    if (codigoRadar) {
                        let numerosExtraidos = [];
                        
                        // Buscamos los bolos de Conectate (.ball o .bolo o .number)
                        $(elemento).find('.ball, .bolo, .game-number').each((j, bola) => {
                            const numeroRaw = $(bola).text().trim();
                            if (numeroRaw) {
                                const numero = parseInt(numeroRaw, 10);
                                if (!isNaN(numero) && numero >= 0 && numero <= 99) {
                                    numerosExtraidos.push(numero);
                                }
                            }
                        });

                        // Si encontramos los 3 números reales del día de HOY, los guardamos
                        if (numerosExtraidos.length >= 3) {
                            datosLoterias.sorteos[codigoRadar] = numerosExtraidos.slice(0, 3);
                            console.log(`✅ Datos Reales Capturados: ${nombreLoteriaWeb} -> ${numerosExtraidos.slice(0, 3)}`);
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.log("⚠️ Error de conexión con la red:", error.message);
    }
}

// Forzar al robot a buscar actualizaciones reales cada 2 minutos
setInterval(rasparLoteriasRD, 2 * 60 * 1000);

app.get('/api/radar', (req, res) => {
    res.json(datosLoterias);
});

app.get('/', (req, res) => {
    res.send(`🤖 Reydis Bot Conectate Automatizado en línea. Fecha Dominicana: ${obtenerFechaRD()}`);
});

app.listen(PORT, () => {
    console.log(`🚀 Motor inteligente corriendo nítido en el puerto ${PORT}`);
    rasparLoteriasRD(); // Primera corrida al encender
});
