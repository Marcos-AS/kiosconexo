const { app, connection, pool } = require('./db');

app.post('/promociones', (req, res) => {
    const { producto_ean, cantidad, precio_promocion } = req.body;
    if (!producto_ean || !cantidad || !precio_promocion) {
        return res.status(400).send('Faltan datos');
    }
    connection.query(
        'INSERT INTO promociones (producto_ean, cantidad, precio_promocion) VALUES (?, ?, ?)',
        [producto_ean, cantidad, precio_promocion],
        (err) => {
            if (err) {
                console.error('Error al agregar promoción:', err);
                return res.status(500).send('Error al agregar promoción');
            }
            res.send('Promoción agregada correctamente');
        }
    );
});

app.get('/promociones', (req, res) => {
    connection.query(
        'SELECT producto_ean, cantidad, precio_promocion FROM promociones',
        (err, results) => {
            if (err) return res.status(500).send('Error al obtener promociones');
            res.json(results);
        }
    );
});

app.post('/promociones-combinadas', async (req, res) => {
    const { nombre, precio_promocion, productos } = req.body;
    if (!nombre || !precio_promocion || !Array.isArray(productos) ) {
        return res.status(400).send('Datos insuficientes');
    }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [promoResult] = await connection.query(
            'INSERT INTO promocion (nombre, precio_total) VALUES (?, ?)',
            [nombre, precio_promocion]
        );
        const promocionId = promoResult.insertId;
        for (const { ean, cantidad } of productos) {
            await connection.query(
                'INSERT INTO promocion_productos (promocion_id, producto_ean, cantidad) VALUES (?, ?, ?)',
                [promocionId, ean, cantidad]
            );
        }
        await connection.commit();
        res.send('Promoción combinada agregada correctamente');
    } catch (err) {
        await connection.rollback();
        res.status(500).send('Error al agregar promoción combinada');
    } finally {
        connection.release();
    }
});

app.get('/promociones-combinadas', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            `SELECT p.id, p.nombre, p.precio_total, pp.producto_ean, pp.cantidad
             FROM promocion p
             JOIN promocion_productos pp ON pp.promocion_id = p.id`
        );
        // Agrupa por promoción
        const promos = {};
        for (const row of rows) {
            if (!promos[row.id]) {
                promos[row.id] = {
                    id: row.id,
                    nombre: row.nombre,
                    precio_total: row.precio_total,
                    productos: []
                };
            }
            promos[row.id].productos.push({
                producto_ean: row.producto_ean,
                cantidad: row.cantidad
            });
        }
        res.json(Object.values(promos));
    } catch (err) {
        res.status(500).send('Error al obtener promociones combinadas');
    } finally {
        connection.release();
    }
});