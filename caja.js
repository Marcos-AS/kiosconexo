const { app, pool } = require('./db');

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
    const fechaHoy = new Date().toISOString().split('T')[0];

    try {
        // Verifica si ya existe apertura para hoy
        const [rows] = await pool.query(
            'SELECT id FROM caja WHERE fecha = ?',
            [fechaHoy]
        );
        if (rows.length > 0) {
            return res.status(400).send('Ya se abrió la caja hoy');
        }
        // Inserta apertura
        await pool.query(
            'INSERT INTO caja (efectivo, fecha) VALUES (?, ?)',
            [efectivo, fechaHoy]
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
    const fechaHoy = new Date().toISOString().split('T')[0];
    try {
        await pool.query(
            'INSERT INTO caja (efectivo, fecha) VALUES (?, ?)',
            [-monto, fechaHoy]
        );
        res.send('Retiro registrado correctamente');
    } catch (err) {
        console.error('Error al registrar retiro:', err);
        res.status(500).send('Error al registrar retiro');
    }
});

app.get('/caja-abierta', async (req, res) => {
    const fecha = req.query.fecha;
    if (!fecha) return res.json({ abierta: false });
    try {
        const [rows] = await pool.query('SELECT id FROM caja WHERE fecha = ?', [fecha]);
        res.json({ abierta: rows.length > 0 });
    } catch (err) {
        res.json({ abierta: false });
    }
});

// Endpoint para ver el total de caja
app.get('/caja', async (req, res) => {
    const fechaHoy = new Date().toISOString().split('T')[0];
    try {
        // Suma todos los movimientos de caja del día actual
        const [rows] = await pool.query(
            'SELECT SUM(efectivo) AS caja_total FROM caja WHERE fecha = ?',
            [fechaHoy]
        );
        res.json({ caja: rows[0].caja_total || 0 });
    } catch (err) {
        console.error('Error al consultar caja:', err);
        res.status(500).send('Error al consultar caja');
    }
});