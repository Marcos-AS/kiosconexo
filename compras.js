const { app, pool, connection } = require('./db');

// PUT /compras/:id/precio
app.put('/compras/:id/precio', async (req, res) => {
    try {
        const { id } = req.params;
        const { precio_compra } = req.body;

        if (!id || !precio_compra) {
            return res.status(400).send("Faltan datos");
        }

        await pool.query(
            "UPDATE compras SET precio_compra = ? WHERE id = ?",
            [precio_compra, id]
        );

        res.send("Precio actualizado correctamente");
    } catch (err) {
        console.error("Error al actualizar precio:", err);
        res.status(500).send("Error al actualizar precio");
    }
});

// Listar compras recientes
app.get('/compras', (req, res) => {
    connection.query(
        `SELECT c.fecha, p.nombre as proveedor_nombre, pr.nombre as producto_nombre, pr.gramos, c.cantidad, c.precio_compra, c.id
         FROM compras c
         JOIN proveedor p ON c.proveedor = p.id
         JOIN producto pr ON c.producto = pr.ean
         ORDER BY c.fecha DESC
         LIMIT 1000`,
        (err, results) => {
            if (err) return res.status(500).send('Error al obtener compras');
            res.json(results);
        }
    );
});


// Registrar una compra
app.post('/compras', async (req, res) => {
    const { proveedor, producto, cantidad, precio_compra, medio_pago } = req.body;
    if (!proveedor || !producto || !cantidad || !precio_compra) {
        return res.status(400).send('Faltan datos');
    }
    const fecha = new Date();

    try {
        // Registrar la compra
        await pool.query(
            'INSERT INTO compras (fecha, proveedor, producto, cantidad, precio_compra) VALUES (?, ?, ?, ?, ?)',
            [fecha, proveedor, producto, cantidad, precio_compra]
        );

        // Si el pago fue en efectivo, descuenta de caja
        if (medio_pago === 'efectivo') {
            const fechaHoy = new Date().toISOString().split('T')[0];
            await pool.query(
                'INSERT INTO caja (efectivo, fecha) VALUES (?, ?)',
                [-precio_compra * cantidad, fechaHoy]
            );
        }

        res.send('Compra registrada correctamente');
    } catch (err) {
        console.error('Error al registrar compra:', err);
        res.status(500).send('Error al registrar compra');
    }
});

app.get('/compras/precio-ultimo', async (req, res) => {
    const { producto } = req.query;
    if (!producto) return res.status(400).send('Falta producto');
    try {
        const [rows] = await pool.query(
            'SELECT precio_compra FROM compras WHERE producto = ? ORDER BY fecha DESC LIMIT 1',
            [producto]
        );
        res.json({ precio_compra: rows.length > 0 ? rows[0].precio_compra : 0 });
    } catch (err) {
        res.status(500).send('Error al obtener precio');
    }
});