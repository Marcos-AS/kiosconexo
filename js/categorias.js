const { app, connection } = require('./db');

app.get('/categorias', (req, res) => {
    connection.query('SELECT id, nombre FROM categoria', (err, results) => {
        if (err) return res.status(500).send('Error al obtener categorías');
        res.json(results);
    });
});
