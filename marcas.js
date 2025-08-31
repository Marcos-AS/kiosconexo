const { app, connection, express } = require('./db');

app.get('/buscar-marcas', (req, res) => {
    const query = req.query.q || '';
    connection.query(
        'SELECT nombre FROM marca WHERE nombre LIKE ?',
        [`%${query}%`],
        (error, results) => {
            if (error) return res.status(500).send('Error en la base de datos');
            res.json(results.map(row => row.nombre));
        }
    );
});

app.get('/marcas', (req, res) => {
    connection.query('SELECT id, nombre FROM marca', (err, results) => {
        if (err) {
            console.error('Error al obtener todas las marcas:', err);
            return res.status(500).send('Error en la base de datos');
        }
        res.json(results);
    });
});

app.post('/agregar-marca', express.json(), (req, res) => {
    const nombre = req.body.nombre;

    if (!nombre) return res.status(400).send('Nombre requerido');

    connection.query('SELECT * FROM marca WHERE nombre = ?', [nombre], (err, results) => {
        if (err) return res.status(500).send('Error al verificar');
        if (results.length > 0) return res.status(200).send('La marca ya existe');

        connection.query('INSERT INTO marca (nombre) VALUES (?)', [nombre], (err2) => {
            if (err2) return res.status(500).send('Error al insertar');
            res.status(201).send('Marca insertada');
        });
    });
});