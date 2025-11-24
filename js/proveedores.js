const { app, connection } = require('./db');

app.get('/proveedores', (req, res) => {
    connection.query('SELECT id, nombre FROM proveedor', (err, results) => {
        if (err) return res.status(500).send('Error al obtener proveedores');
        res.json(results);
    });
});
