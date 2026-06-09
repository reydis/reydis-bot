const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

function obtenerFechaRD() {
    const fecha = new Date();
    const opciones = { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formateador = new Intl.DateTimeFormat('en-CA', opciones);
    return formateador.format(fecha);
}

// Estructura maestra blindada contra valores nulos
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
        console.log("📡 Robot extractor v8.1: Analizando flujos en tiempo real...");
        datosLoterias.fecha = obtenerFechaRD();

        const response = await axios.get('https://www.conectate.com.do/loterias/', { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 12000 
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
                        if (nombreMinuscula.includes(key)) { codigoRadar = value; break; }
                    }
                    
                    if (codigoRadar) {
                        let numerosExtraidos = [];
                        $(elemento).find('.ball, .
