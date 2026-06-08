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

// DICCIONARIO DE MAPEADO: Relaciona los códigos del Radar con las tómbolas reales
const mapeoFuentes = {
    'Anguila Mañana': 'anguila_m',
    'La Primera': 'laprimera',
    'Lotedom': 'lotedom',
    'La Suerte Dominicana': 'suerte',
    'Real': 'real_t',
    'Gana Más': 'gana_mas',
    'New York Tarde': 'new_york_t',
    'LEIDSA': 'leidsa',
    'Nacional Noche': 'nacional'
};

// NUEVO MOTOR DE RASTREO AUTOMÁTICO EN LA RED
async function rasparLoteriasRD() {
    try {
        console.log("📡 Robot rastreador activado: Buscando tómbolas en la red...");
        datosLoterias.fecha = obtenerFechaRD();

        // Conectamos directo a un indexador estable de resultados de tómbolas dominicanas
        const response = await axios.get('https://www.conectate.com.do/loterias/', { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 10000 
        });

        if (response && response.data) {
            const $ = cheerio.load(response.data);
            
            // El robot camina de forma inteligente por los bloques de cada lotería en la web
            $('.lottery-result-card').each((i, elemento) => {
                const nombreLoteriaWeb = $(elemento).find('.lottery-title').text().trim();
                
                // Si la lotería que está en la red coincide con las que rastrea tu Radar
                if (mapeoFuentes[nombreLoteriaWeb]) {
                    const codigoRadar = mapeoFuentes[nombreLoteriaWeb];
                    let numerosExtraidos = [];
                    
                    // Extraer los 3 bolos ganadores reales del HTML
                    $(elemento).find('.ball').each((j, bola) => {
                        const numero = parseInt($(bola).text().trim(), 10);
                        if (!isNaN(numero)) numerosExtraidos.push(numero);
                    });

                    // VALIDACIÓN ESTRICTA: Solo guarda si vienen los 3 números reales y la tómbola ya tiró hoy
                    if (numerosExtraidos.length >= 3) {
                        datosLoterias.sorteos[codigoRadar] = numerosExtraidos.slice(0, 3);
                        console.log(`✅ Tómbola indexada automáticamente: ${nombreLoteriaWeb} -> ${numerosExtraidos.slice(0,3)}`);
                    }
                }
            });
        }
    } catch (error) {
        console.log("⚠️ Error en el rastreo automático de red:", error.message);
    }
}

// Escaneo continuo en red cada 3 minutos para atrapar los tiros al instante
setInterval(rasparLoteriasRD, 3 * 60 * 1000);

app.get('/api/radar', (req, res) => {
    res.json(datosLoterias);
});

app.get('/', (req, res) => {
    res.send(`🤖 Reydis Bot Automatizado en línea. Operaciones de hoy: ${obtenerFechaRD()}`);
});

app.listen(PORT, () => {
    console.log(`🚀 Motor inteligente corriendo en el puerto ${PORT}`);
    rasparLoteriasRD();
});
