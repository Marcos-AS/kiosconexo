const { app, pool } = require('./db');

function getFechaLocal() {
    // Obtiene la fecha en zona horaria Argentina (GMT-3)
    const ahora = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    })
    return formatter.format(ahora);    
}

let efectivoCaja = 0;

app.post('/caja-inicial', async (req, res) => {
    const { efectivo } = req.body;
    const valor = parseFloat(efectivo) || 0;
    try {
        await pool.query('INSERT INTO caja (efectivo) VALUES (?)', [valor]);
        res.send('Efectivo inicial guardado');
    } catch (err) {
        console.error('Error al guardar efectivo inicial:', err);
        res.status(500).send('Error al guardar efectivo inicial');
    }
});

app.post('/abrir-caja', async (req, res) => {
    const { efectivo } = req.body;
    const fechaHoy = getFechaLocal();

    try {
        // Verifica si ya existe apertura para hoy
        const [rows] = await pool.query(
            'SELECT id FROM caja WHERE fecha = ? AND tipo = ?',
            [fechaHoy, 'APERTURA']
        );
        if (rows.length > 0) {
            return res.status(400).send('Ya se abrió la caja hoy');
        }
        // Inserta apertura con tipo APERTURA
        await pool.query(
            'INSERT INTO caja (efectivo, fecha, tipo) VALUES (?, ?, ?)',
            [efectivo, fechaHoy, 'APERTURA']
        );
        res.send('Caja abierta correctamente');
    } catch (err) {
        console.error('Error al abrir caja:', err);
        res.status(500).send('Error al abrir caja');
    }
});

app.post('/retiro-caja', async (req, res) => {
    const { retiro } = req.body;
    const monto = parseFloat(retiro) || 0;
    if (monto <= 0) return res.status(400).send('Monto inválido');
    const fechaHoy = getFechaLocal();
    try {
        await pool.query(
            'INSERT INTO caja (efectivo, fecha, tipo) VALUES (?, ?, ?)',
            [-monto, fechaHoy, 'EGRESO']
        );
        res.send('Retiro registrado correctamente');
    } catch (err) {
        console.error('Error al registrar retiro:', err);
        res.status(500).send('Error al registrar retiro');
    }
});

app.post('/agregar-caja', async (req, res) => {
    const { agregar } = req.body;
    const monto = parseFloat(agregar) || 0;
    if (monto <= 0) return res.status(400).send('Monto inválido');
    const fechaHoy = getFechaLocal();
    try {
        await pool.query(
            'INSERT INTO caja (efectivo, fecha, tipo) VALUES (?, ?, ?)',
            [monto, fechaHoy, 'INGRESO']
        );
        res.send('Monto agregado correctamente');
    } catch (err) {
        console.error('Error al registrar ingreso:', err);
        res.status(500).send('Error al registrar ingreso');
    }
});

app.get('/caja-abierta', async (req, res) => {
    const fecha = req.query.fecha;
    if (!fecha) return res.json({ abierta: false });
    try {
        const [rows] = await pool.query(
            'SELECT id FROM caja WHERE fecha = ? AND tipo = ?',
            [fecha, 'APERTURA']
        );
        res.json({ abierta: rows.length > 0 });
    } catch (err) {
        res.json({ abierta: false });
    }
});

// Endpoint para ver el total de caja (suma desde la última APERTURA)
app.get('/caja', async (req, res) => {
    try {
        // Obtener la última apertura
        const [ultimaApertura] = await pool.query(
            'SELECT id FROM caja WHERE tipo = ? ORDER BY fecha DESC, id DESC LIMIT 1',
            ['APERTURA']
        );
        
        let cajaTotal = 0;
        
        if (ultimaApertura.length > 0) {
            // Suma todos los movimientos desde la última apertura (incluyéndola)
            const [rows] = await pool.query(
                'SELECT SUM(efectivo) AS caja_total FROM caja WHERE id >= ?',
                [ultimaApertura[0].id]
            );
            cajaTotal = rows[0].caja_total || 0;
        }
        
        res.json({ caja: cajaTotal });
    } catch (err) {
        console.error('Error al consultar caja:', err);
        res.status(500).send('Error al consultar caja');
    }
});