const { app, connection } = require('./db');

app.post('/precios', (req, res) => {
    const { producto, proveedor, precio } = req.body;

    if (!producto || !proveedor || !precio) {
        return res.status(400).send('Faltan campos');
    }

    const fecha = new Date().toISOString().split('T')[0]; // yyyy-mm-dd

    // Primero intenta actualizar el precio si ya existe para ese producto, proveedor y fecha
    const updateSql = 'UPDATE precios SET precio = ? WHERE producto = ? AND proveedor = ? AND fecha = ?';
    connection.query(updateSql, [precio, producto, proveedor, fecha], (err, result) => {
        if (err) {
            console.error('Error al actualizar precio:', err);
            return res.status(500).send('Error al actualizar precio');
        }
        if (result.affectedRows > 0) {
            return res.status(200).send('Precio actualizado correctamente');
        }
        // Si no existía, inserta uno nuevo
        const insertSql = 'INSERT INTO precios (producto, proveedor, precio, fecha) VALUES (?, ?, ?, ?)';
        connection.query(insertSql, [producto, proveedor, precio, fecha], (err2) => {
            if (err2) {
                console.error('Error al asignar precio:', err2);
                return res.status(500).send('Error al asignar precio');
            }
            res.status(201).send('Precio asignado correctamente');
        });
    });
});





app.get('/precios-todos', (req, res) => {
    connection.query(
        'SELECT producto, proveedor, precio FROM precios',
        (err, results) => {
            if (err) return res.status(500).send('Error al obtener precios');
            res.json(results);
        }
    );
});

app.delete('/precios', (req, res) => {
    const { producto, proveedor } = req.body;
    if (!producto || !proveedor) {
        return res.status(400).send('Faltan datos');
    }
    connection.query(
        'DELETE FROM precios WHERE producto = ? AND proveedor = ?',
        [producto, proveedor],
        (err, result) => {
            if (err) {
                console.error('Error al eliminar precio:', err);
                return res.status(500).send('Error al eliminar precio');
            }
            if (result.affectedRows === 0) {
                return res.status(404).send('No se encontró el precio para eliminar');
            }
            res.send('Precio eliminado correctamente');
        }
    );
});