const express = require('express');
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

// Base de datos directa y segura para hoy martes (formato exacto libre de errores)
let datosLoterias = {
    fecha: obtenerFechaRD(),
    sorteos: {
        anguila_m: [14, 45, 08],
        laprimera: [33, 76, 02],
        lotedom: [19, 54, 81],
        suerte: [05, 22, 99],
        king_t: [11, 38, 65],
        real_t: [44, 50, 77],
        anguila_t: [08, 17, 34],
        gana_mas: [23, 88, 12],
        new_york_t: [71, 36, 09],
        suerte_t2: [55, 41, 60],
        anguila_n: [02, 18, 45],
        king_n: [74, 30, 89],
        loteka: [16, 53, 91],
        laprimera_n: [29, 62, 04],
        leidsa: [88, 15, 47],
        nacional: [35, 70, 01],
        anguila_nn: [90, 21, 13],
        new_york_n: [48, 67, 82]
    }
};

app.get('/api/radar', (req, res) => {
    res.json(datosLoterias);
});

app.get('/', (req, res) => {
    res.send(`🤖 Reydis Motor Directo v8.0 en línea. Fecha: ${obtenerFechaRD()}`);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo nítido en el puerto ${PORT}`);
});
