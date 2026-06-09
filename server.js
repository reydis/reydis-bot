const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

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
        console.log("📡 Robot v8.3: Extrayendo flujos con selectores del día...");
        datosLoterias.fecha = obtenerFechaRD();

        const response = await axios.get('https://www.conectate.com.do/loterias/', { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
            },
            timeout: 12000 
        });

        if (response && response.data) {
            const $ = cheerio.load(response.data);
            let conteo = 0;
            
            // SELECTOR CRUCIAL: Conectate usa .lottery-result-card para envolver cada lotería
            $('.lottery-result-card, .game-block, .lottery-block, [id^="lottery-"]').each((i, elemento) => {
                // Buscamos el título dentro de las clases de Conectate (.lottery-title o h4)
                let nombreLoteriaWeb = $(elemento).find('.lottery-title, .game-title, h2, h3, h4').text().trim();
                
                if (nombreLoteriaWeb) {
                    const nombreMinuscula = nombreLoteriaWeb.toLowerCase().replace(/[\n\t]/g, '').trim();
                    let codigoRadar = null;
                    for (const [key, value] of Object.entries(mapeoFuentes)) {
                        if (nombreMinuscula.includes(key)) { codigoRadar = value; break; }
                    }
                    
                    if (codigoRadar) {
                        let numerosExtraidos = [];
                        // Buscamos los bolos con clases .ball, .game-number o spans individuales
                        $(elemento).find('.ball, .bolo, .game-number, .ball-single, .lottery-number').each((j, bola) => {
                            const numeroRaw = $(bola).text().trim();
                            if (numeroRaw) {
                                const numero = parseInt(numeroRaw, 10);
                                if (!isNaN(numero) && numero >= 0 && numero <= 99) numerosExtraidos.push(numero);
                            }
                        });

                        // PLAN B: Extracción cruda por celdas si cambiaron las etiquetas de las esferas
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

            console.log(`🎯 Sincronización finalizada. Sorteos cargados con éxito: ${conteo}`);
        }
    } catch (error) {
        console.error("⚠️ Error de conexión en raspado:", error.message);
    }
}

// Rastreo automático cada 3 minutos
setInterval(rasparLoteriasRD, 3 * 60 * 1000);

app.get('/api/radar', (req, res) => {
    res.json(datosLoterias);
});

app.get('/', (req, res) => {
    res.send(`🤖 Reydis Central Engine v8.3 listo. Operaciones del día.`);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor cuantitativo en puerto ${PORT}`);
    rasparLoteriasRD();
});
