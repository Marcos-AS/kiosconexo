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

// Editar total de una promoción combinada
app.put('/promociones-combinadas/:id', async (req, res) => {
    const { precio_total } = req.body;
    const { id } = req.params;
    if (!precio_total) return res.status(400).send('Falta precio_total');
    try {
        await pool.query(
            'UPDATE promocion SET precio_total = ? WHERE id = ?',
            [precio_total, id]
        );
        res.send('Promoción combinada actualizada');
    } catch (err) {
        res.status(500).send('Error al actualizar promoción combinada');
    }
});

// Eliminar una promoción combinada
app.delete('/promociones-combinadas/:id', async (req, res) => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM promocion_productos WHERE promocion_id = ?', [id]);
        await connection.query('DELETE FROM promocion WHERE id = ?', [id]);
        await connection.commit();
        res.send('Promoción combinada eliminada');
    } catch (err) {
        await connection.rollback();
        res.status(500).send('Error al eliminar promoción combinada');
    } finally {
        connection.release();
    }
});