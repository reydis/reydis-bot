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

// Diccionario extendido y corregido para evitar fallos de lectura
const mapeoFuentes = {
    'anguila mañana': 'anguila_m',
    'la primera': 'laprimera',
    'lotedom': 'lotedom',
    'la suerte dominicana': 'suerte',
    'real': 'real_t',
    'gana más': 'gana_mas',
    'new york tarde': 'new_york_t',
    'leidsa': 'leidsa',
    'nacional noche': 'nacional'
};

async function rasparLoteriasRD() {
    try {
        console.log("📡 Robot rastreador activado: Buscando tómbolas en la red...");
        datosLoterias.fecha = obtenerFechaRD();

        const response = await axios.get('https://www.conectate.com.do/loterias/', { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 10000 
        });

        if (response && response.data) {
            const $ = cheerio.load(response.data);
            
            $('.lottery-result-card').each((i, elemento) => {
                const nombreLoteriaWeb = $(elemento).find('.lottery-title').text().trim();
                
                // 🛑 FILTRO DE SEGURIDAD CRÍTICO: Validamos que el nombre exista antes de procesarlo
                if (nombreLoteriaWeb) {
                    const nombreMinuscula = nombreLoteriaWeb.toLowerCase();
                    const codigoRadar = mapeoFuentes[nombreMinuscula];
                    
                    // Si el código existe en nuestro radar, extraemos los bolos
                    if (codigoRadar) {
                        let numerosExtraidos = [];
                        $(elemento).find('.ball').each((j, bola) => {
                            const numero = parseInt($(bola).text().trim(), 10);
                            if (!isNaN(numero)) numerosExtraidos.push(numero);
                        });

                        if (numerosExtraidos.length >= 3) {
                            datosLoterias.sorteos[codigoRadar] = numerosExtraidos.slice(0, 3);
                            console.log(`✅ Indexado automático: ${nombreLoteriaWeb} -> ${numerosExtraidos.slice(0,3)}`);
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.log("⚠️ Error en el rastreo automático de red:", error.message);
    }
}

// Escaneo continuo en red cada 3 minutos
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
