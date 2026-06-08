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

// Diccionario corregido con los nombres exactos que usa la web en su HTML
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
        console.log("📡 Robot rastreador activado: Buscando tómbolas en la red...");
        datosLoterias.fecha = obtenerFechaRD();

        const response = await axios.get('https://www.conectate.com.do/loterias/', { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
            },
            timeout: 12000 
        });

        if (response && response.data) {
            const $ = cheerio.load(response.data);
            
            // Caminamos por cada bloque de lotería usando la estructura exacta de la web
            $('.game-block').each((i, elemento) => {
                let nombreLoteriaWeb = $(elemento).find('.game-title').text().trim();
                if (!nombreLoteriaWeb) {
                    nombreLoteriaWeb = $(elemento).find('.lottery-title').text().trim();
                }

                if (nombreLoteriaWeb) {
                    const nombreMinuscula = nombreLoteriaWeb.toLowerCase().replace(/[\n\t]/g, '');
                    
                    // Buscar coincidencia en nuestro diccionario
                    let codigoRadar = null;
                    for (const [key, value] of Object.entries(mapeoFuentes)) {
                        if (nombreMinuscula.includes(key)) {
                            codigoRadar = value;
                            break;
                        }
                    }
                    
                    if (codigoRadar) {
                        let numerosExtraidos = [];
                        
                        // Buscamos los bolos en las diferentes clases que usa la web (.ball, .bolo, o .number)
                        $(elemento).find('.ball, .bolo, .game-number').each((j, bola) => {
                            const numeroRaw = $(bola).text().trim();
                            if (numeroRaw) {
                                const numero = parseInt(numeroRaw, 10);
                                if (!isNaN(numero) && numero >= 0 && numero <= 99) {
                                    numerosExtraidos.push(numero);
                                }
                            }
                        });

                        // Si el raspado falló por cambios de diseño, usamos un plan B leyendo las celdas directamente
                        if (numerosExtraidos.length < 3) {
                            numerosExtraidos = [];
                            $(elemento).find('td, span').each((j, celda) => {
                                const textoCelda = $(celda).text().trim();
                                if (textoCelda.length === 2 && !isNaN(textoCelda)) {
                                    numerosExtraidos.push(parseInt(textoCelda, 10));
                                }
                            });
                        }

                        // Guardar solo si el dato es real y consistente
                        if (numerosExtraidos.length >= 3) {
                            datosLoterias.sorteos[codigoRadar] = numerosExtraidos.slice(0, 3);
                            console.log(`✅ Indexado con éxito: ${nombreLoteriaWeb} -> ${numerosExtraidos.slice(0, 3)}`);
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.log("⚠️ Nota en el rastreo:", error.message);
    }
}

// Escaneo automático en red cada 3 minutos
setInterval(rasparLoteriasRD, 3 * 60 * 1000);

app.get('/api/radar', (req, res) => {
    res.json(datosLoterias);
});

app.get('/', (req, res) => {
    res.send(`🤖 Reydis Bot en línea y corregido. Operaciones: ${obtenerFechaRD()}`);
});

app.listen(PORT, () => {
    console.log(`🚀 Motor inteligente corriendo en el puerto ${PORT}`);
    rasparLoteriasRD();
});
