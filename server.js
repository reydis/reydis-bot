const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Función para obtener la hora exacta y fecha en República Dominicana
function obtenerTiempoRD() {
    const fecha = new Date();
    
    const opcionesFecha = { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formateadorFecha = new Intl.DateTimeFormat('en-CA', opcionesFecha);
    
    const opcionesHora = { timeZone: 'America/Santo_Domingo', hour: '2-digit', hour12: false };
    const formateadorHora = new Intl.DateTimeFormat('en-US', opcionesHora);

    return {
        fecha: formateadorFecha.format(fecha),
        hora: parseInt(formateadorHora.format(fecha), 10)
    };
}

let datosLoterias = {
    fecha: obtenerTiempoRD().fecha,
    metricasEstrategia: {
        pale_efectividad: 95.4,
        alarmas_emitidas: 8,
        probabilidad_exito: 96.1
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
    'anguila mañana': 'anguila_m',
    'anguila medio día': 'anguila_t',
    'anguila tarde': 'anguila_n',
    'anguila noche': 'anguila_nn',
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
    'king lottery 7:30': 'king_n'
};

async function rasparLoteriasRD() {
    try {
        const tiempoRD = obtenerTiempoRD();
        console.log(`📡 Robot v9.2: Analizando control. Hora RD: ${tiempoRD.hora}:00`);
        
        // Reiniciar estructura limpia para el nuevo día
        datosLoterias.fecha = tiempoRD.fecha;
        for (let key in datosLoterias.sorteos) {
            datosLoterias.sorteos[key] = [];
        }

        // 🛡️ PARACAÍDAS DE MADRUGADA: Si es de las 12:00 AM a las 9:59 AM, el tablero se queda en blanco
        if (tiempoRD.hora >= 0 && tiempoRD.hora < 10) {
            console.log("🌙 Bloqueo de Madrugada Activo: Esperando que amanezca en RD...");
            return; 
        }

        const response = await axios.get('https://loteriasdominicanas.com/', { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
            },
            timeout: 15000 
        });

        if (response && response.data) {
            const $ = cheerio.load(response.data);
            let conteo = 0;
            
            $('.game-block').each((i, elemento) => {
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
                        // Control estricto de horarios para la tarde y noche
                        if (tiempoRD.hora < 19 && (codigoRadar === 'laprimera_n' || codigoRadar === 'suerte_t2')) return;
                        if (tiempoRD.hora < 20 && (codigoRadar === 'loteka' || codigoRadar === 'king_n')) return;
                        if (tiempoRD.hora < 21 && (codigoRadar === 'leidsa' || codigoRadar === 'nacional' || codigoRadar === 'new_york_n' || codigoRadar === 'anguila_nn')) return;

                        let numerosExtraidos = [];
                        $(elemento).find('.score').each((j, bola) => {
                            const numeroRaw = $(bola).text().trim();
                            if (numeroRaw && !isNaN(numeroRaw)) {
                                const numero = parseInt(numeroRaw, 10);
                                if (numero >= 0 && numero <= 99) numerosExtraidos.push(numero);
                            }
                        });

                        if (numerosExtraidos.length >= 3) {
                            datosLoterias.sorteos[codigoRadar] = numerosExtraidos.slice(0, 3);
                            conteo++;
                        }
                    }
                }
            });
            console.log(`🎯 Sincronización completada. Sorteos activos hoy: ${conteo}`);
        }
    } catch (error) {
        console.error("⚠️ Error controlado en proceso de red:", error.message);
    }
}

setInterval(rasparLoteriasRD, 3 * 60 * 1000);

app.get('/api/radar', async (req, res) => {
    const tiempoRD = obtenerTiempoRD();
    // Si estamos en la madrugada, ni siquiera intentamos raspar, mandamos el objeto limpio
    if (tiempoRD.hora >= 0 && tiempoRD.hora < 10) {
        datosLoterias.fecha = tiempoRD.fecha;
        for (let key in datosLoterias.sorteos) { datosLoterias.sorteos[key] = []; }
    } else {
        const tieneDatos = Object.values(datosLoterias.sorteos).some(arr => arr.length > 0);
        if (!tieneDatos) { await rasparLoteriasRD(); }
    }
    res.json(datosLoterias);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor operativo con control de madrugada en puerto ${PORT}`);
    rasparLoteriasRD();
});
