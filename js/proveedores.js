const { app, pool, connection } = require('./db');
app.use(require('express').json()); // importante para leer JSON

// Endpoint para lista de proveedores (para HTML)
app.get('/proveedores', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM proveedor ORDER BY nombre');
        res.json(rows);
    } catch (err) {
        res.status(500).send('Error al obtener proveedores');
    }
});

// app.post('/proveedores', async (req, res) => {
//     try {
//         const { nombre, cuit, ubicacion, telefono } = req.body;

//         if (!nombre) {
//             return res.status(400).json({ error: 'El nombre es obligatorio' });
//         }

//         const [result] = await pool.query(
//             'INSERT INTO proveedor (nombre, cuit, ubicacion, telefono) VALUES (?, ?, ?, ?)',
//             [nombre, cuit || null, ubicacion || null, telefono || null]
//         );

//         res.json({ id: result.insertId });
//     } catch (err) {
//         console.error(err);
//         res.status(500).send('Error al crear proveedor');
//     }
// });

app.put('/proveedores/:id/telefono', async (req, res) => {
    try {
        const { id } = req.params;
        const { telefono } = req.body;

        await pool.query(
            'UPDATE proveedor SET telefono = ? WHERE id = ?',
            [telefono, id]
        );

        res.sendStatus(200);
    } catch (err) {
        res.status(500).send('Error al actualizar teléfono');
    }
});
