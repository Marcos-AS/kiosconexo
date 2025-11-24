const { app, connection } = require('./db');

// Registrar una decomisación
app.post('/decomisaciones', (req, res) => {
    const { ean, cantidad, fecha } = req.body;

    if (!ean || !cantidad || cantidad <= 0) {
        return res.status(400).send('Datos inválidos');
    }

    // Usamos una transacción para asegurar que todo quede consistente
    connection.beginTransaction(err => {
        if (err) return res.status(500).send('Error al iniciar transacción');

        // 1. Insertar la decomisación
        const insertSql = 'INSERT INTO decomisacion (ean, cantidad, fecha) VALUES (?, ?, ?)';
        connection.query(insertSql, [ean, cantidad, fecha], (err, result) => {
            if (err) {
                return connection.rollback(() => {
                    console.error('Error al registrar decomisación:', err);
                    res.status(500).send('Error al registrar decomisación');
                });
            }

            // 2. Descontar del stock del producto
            const updateSql = 'UPDATE producto SET stock = stock - ? WHERE ean = ? AND stock >= ?';
            connection.query(updateSql, [cantidad, ean, cantidad], (err, result2) => {
                if (err || result2.affectedRows === 0) {
                    return connection.rollback(() => {
                        console.error('Error al descontar stock:', err);
                        res.status(400).send('Stock insuficiente o producto no encontrado');
                    });
                }

                // 3. Confirmar transacción
                connection.commit(err => {
                    if (err) {
                        return connection.rollback(() => {
                            console.error('Error al confirmar transacción:', err);
                            res.status(500).send('Error en la base de datos');
                        });
                    }
                    res.send('Decomisación registrada y stock actualizado');
                });
            });
        });
    });
});

// Obtener todas las decomisaciones (opcional filtro por fecha)
app.get('/decomisaciones', (req, res) => {
    const { fecha } = req.query;

    let sql = `
        SELECT d.ean, d.cantidad, d.fecha, p.nombre
        FROM decomisacion d
        JOIN producto p ON p.ean = d.ean
    `;
    const params = [];

    if (fecha) {
        sql += ' WHERE DATE(d.fecha) = ?';
        params.push(fecha);
    }

    sql += ' ORDER BY d.fecha DESC';

    connection.query(sql, params, (err, results) => {
        if (err) {
            console.error('Error al obtener decomisaciones:', err);
            return res.status(500).send('Error en la base de datos');
        }
        res.json(results);
    });
});