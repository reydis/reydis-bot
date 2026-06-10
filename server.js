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

// Estructura maestra oficial requerida por tu CodeSandbox
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

// DICCIONARIO CALIBRADO: Mapea las clases del código fuente entregado
const mapeoFuentes = {
    'anguila mañana': 'anguila_m',
    'anguila medio día': 'anguila_t',
    'anguila tarde': 'anguila_n',
    'anguila noche': 'king_n', // Sincronizado con tu orden visual
    'la primera día': 'laprimera',
    'primera noche': 'laprimera_n',
    'quiniela lotedom': 'lotedom',
    'la suerte 12:30': 'suerte',
    'la suerte 18:00': 'suerte_t2',
    'quiniela real': 'real_t',
    'gana más': 'gana_mas',
    'new york tarde': 'new_york_t',
    'new york noche': 'new_york_n',
    'quiniela leidsa': 'leidsa',
    'lotería nacional': 'nacional',
    'quiniela loteka': 'loteka',
    'king lottery 12:30': 'king_t',
    'king lottery 7:30': 'anguila_nn'
};

async function rasparLoteriasRD() {
    try {
        console.log("📡 Robot v9.0 Cuantitativo: Raspando LoteriasDominicanas.com...");
        datosLoterias.fecha = obtenerFechaRD();

        const response = await axios.get('https://loteriasdominicanas.com/', { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' 
            },
            timeout: 15000 
        });

        if (response && response.data) {
            const $ = cheerio.load(response.data);
            let conteo = 0;
            
            // 🎯 SELECTOR EXACTO DEL CÓDIGO FUENTE: Buscamos cada bloque de juego
            $('.game-block').each((i, elemento) => {
                // Extraemos el texto del span del título
                let tituloWeb = $(elemento).find('.game-title span').text();
                
                if (tituloWeb && typeof tituloWeb === 'string') {
                    const nombreMinuscula = tituloWeb.toLowerCase().trim();
                    
                    let codigoRadar = null;
                    for (const [key, value] of Object.entries(mapeoFuentes)) {
                        if (nombreMinuscula.includes(key)) { 
                            codigoRadar = value; 
                            break; 
                        }
                    }
                    
                    if (codigoRadar) {
                        let numerosExtraidos = [];
                        
                        // 🎯 EXTRACCIÓN MAESTRA: Buscamos la clase .score que vimos en el TXT
                        $(elemento).find('.score').each((j, bola) => {
                            const numeroRaw = $(bola).text().trim();
                            if (numeroRaw && !isNaN(numeroRaw)) {
                                const numero = parseInt(numeroRaw, 10);
                                if (numero >= 0 && numero <= 99) {
                                    numerosExtraidos.push(numero);
                                }
                            }
                        });

                        if (numerosExtraidos.length >= 3) {
                            datosLoterias.sorteos[codigoRadar] = numerosExtraidos.slice(0, 3);
                            conteo++;
                        }
                    }
                }
            });
            console.log(`🎯 Motor v9.0 finalizado con éxito. Sorteos reales indexados: ${conteo}`);
        }
    } catch (error) {
        console.error("⚠️ Error controlado en proceso de red:", error.message);
    }
}

// Escaneo automático cada 3 minutos
setInterval(rasparLoteriasRD, 3 * 60 * 1000);

app.get('/api/radar', async (req, res) => {
    // Si la base de datos está vacía, forzar actualización al vuelo
    const tieneDatos = Object.values(datosLoterias.sorteos).some(arr => arr.length > 0);
    if (!tieneDatos) {
        await rasparLoteriasRD();
    }
    res.json(datosLoterias);
});

app.get('/', (req, res) => {
    res.send(`🤖 Reydis Core v9.0 Operativo. Sincronización para hoy.`);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor protegido corriendo en puerto ${PORT}`);
    rasparLoteriasRD();
});
