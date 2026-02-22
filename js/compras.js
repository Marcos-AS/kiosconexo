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
    let sql = `
        SELECT c.fecha, p.id as proveedor_id, p.nombre as proveedor_nombre, pr.ean as producto_ean, pr.nombre as producto_nombre, pr.gramos, c.cantidad, c.precio_compra, c.id, c.fecha_vencimiento, cat.nombre as categoria_nombre
        FROM compras c
        JOIN proveedor p ON c.proveedor = p.id
        JOIN producto pr ON c.producto = pr.ean
        LEFT JOIN categoria cat ON pr.categoriaId = cat.id
        WHERE 1=1
    `;
    const params = [];
    if (req.query.desde && req.query.hasta) {
        sql += ' AND c.fecha >= ? AND c.fecha < ?';
        params.push(req.query.desde + ' 00:00:00', req.query.hasta + ' 00:00:00');
    }
    sql += ' ORDER BY c.fecha DESC';
    connection.query(sql, params, (err, results) => {
        if (err) {
            console.error('Error SQL en /compras:', err); // <-- Agrega esto
            return res.status(500).json({ error: 'Error al obtener compras' });
        }
        res.json(results);
    });
});

// Registrar una compra
app.post('/compras', async (req, res) => {
    const { proveedor, producto, cantidad, precio_compra, fecha_compra, fecha_vencimiento, medio_pago, aumentar_stock } = req.body;
    if (!proveedor || !producto || !cantidad || !precio_compra || !fecha_compra) {
        return res.status(400).send('Faltan datos');
    }

    try {
        await pool.query(
            'INSERT INTO compras (fecha, proveedor, producto, cantidad, precio_compra, fecha_vencimiento) VALUES (?, ?, ?, ?, ?, ?)',
            [fecha_compra + ' 00:00:00', proveedor, producto, cantidad, precio_compra, fecha_vencimiento || null]
        );

        // Si el pago fue en efectivo, descuenta de caja
        if (medio_pago === 'efectivo') {
            await pool.query(
                'INSERT INTO caja (efectivo, fecha) VALUES (?, ?)',
                [-precio_compra * cantidad, fecha_compra]
            );
        }

        // Aumentar stock solo si el checkbox está tildado (por defecto true)
        if (aumentar_stock === undefined || aumentar_stock === true || aumentar_stock === 'true') {
            await pool.query(
                'UPDATE producto SET stock = stock + ? WHERE ean = ?',
                [cantidad, producto]
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

app.put('/compras/:id/fecha-vencimiento', async (req, res) => {
    const { id } = req.params;
    const { fecha_vencimiento } = req.body;
    try {
        await pool.query(
            'UPDATE compras SET fecha_vencimiento = ? WHERE id = ?',
            [fecha_vencimiento || null, id]
        );
        res.send('Fecha de vencimiento actualizada');
    } catch (err) {
        res.status(500).send('Error al actualizar fecha de vencimiento');
    }
});

app.get('/compras/ultimas', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                c.producto AS producto_ean,
                c.precio_compra,
                p.nombre AS proveedor_nombre
            FROM compras c
            JOIN proveedor p ON c.proveedor = p.id
            INNER JOIN (
                SELECT producto, MAX(fecha) AS ultima_fecha
                FROM compras
                GROUP BY producto
            ) ult ON c.producto = ult.producto AND c.fecha = ult.ultima_fecha
        `);
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener últimas compras:', err);
        res.status(500).send('Error al obtener últimas compras');
    }
});
