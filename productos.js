const { app, pool, connection } = require('./db');

function generarEAN13() {
    let ean = '';
    for (let i = 0; i < 13; i++) {
        ean += Math.floor(Math.random() * 10);
    }
    return ean;
}

app.get('/productos', (req, res) => {
    const { categoriaId, proveedorId, marcaId, ean, nombre } = req.query;

    let sql = `
        SELECT p.ean, p.nombre, p.stock, p.precio_venta, p.gramos, p.descripcion,
               m.nombre AS marca_nombre, c.nombre AS categoria_nombre
        FROM producto p
        JOIN marca m ON p.marca = m.id
        JOIN categoria c ON p.categoriaId = c.id
    `;
    const params = [];
    const conditions = [];

    if (categoriaId) {
        conditions.push('c.id = ?');
        params.push(categoriaId);
    }
    if (proveedorId) {
        conditions.push('pr.proveedor = ?');
        params.push(proveedorId);
    }
    if (marcaId) {
        conditions.push('m.id = ?');
        params.push(marcaId);
    }
    if (ean) {
        conditions.push('p.ean = ?');
        params.push(ean);
    }
    if (nombre) {
        conditions.push('p.nombre LIKE ?');
        params.push(`%${nombre}%`);
    }

    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' GROUP BY p.ean, p.nombre, p.gramos, p.descripcion, m.nombre, c.nombre';

    connection.query(sql, params, (error, results) => {
        if (error) {
            console.error('Error al obtener productos con filtros:', error);
            return res.status(500).send('Error en la base de datos');
        }
        res.json(results);
    });
});

app.post('/productos', (req, res) => {
    const { ean, nombre, stock, gramos, descripcion, marca, categoria } = req.body;

    if (!nombre || !marca || !categoria) {
        return res.status(400).send('Faltan campos obligatorios');
    }

    let eanFinal = ean || generarEAN13();

    console.log(req.body);
    

        connection.query('SELECT id FROM marca WHERE nombre = ?', [marca], (err, resultsMarca) => {
        if (err) return res.status(500).send('Error al buscar marca');

        const manejarMarca = (idMarca) => {
            // Buscar o insertar categoría
            connection.query('SELECT id FROM categoria WHERE nombre = ?', [categoria], (err2, resultsCategoria) => {
                if (err2) return res.status(500).send('Error al buscar categoría');

                const manejarCategoria = (idCategoria) => {
                    // Insertar producto con ambos IDs
                    const sql = 'INSERT INTO producto (ean, nombre, stock, gramos, descripcion, marca, categoriaId) VALUES (?, ?, ?, ?, ?, ?, ?)';
                    const valores = [eanFinal, nombre, stock, gramos || null, descripcion || null, idMarca, idCategoria];

                    connection.query(sql, valores, (err3, result) => {
                        if (err3) {
                            console.error('Error al insertar producto:', err3);
                            return res.status(500).send('Error al insertar producto');
                        }
                        res.status(201).send('Producto ingresado correctamente');
                    });
                };

                if (resultsCategoria.length > 0) {
                    manejarCategoria(resultsCategoria[0].id);
                } else {
                    connection.query('INSERT INTO categoria (nombre) VALUES (?)', [categoria], (err4, result2) => {
                        if (err4) return res.status(500).send('Error al insertar categoría');
                        manejarCategoria(result2.insertId);
                    });
                }
            });
        };

        if (resultsMarca.length > 0) {
            manejarMarca(resultsMarca[0].id);
        } else {
            connection.query('INSERT INTO marca (nombre) VALUES (?)', [marca], (err5, result3) => {
                if (err5) return res.status(500).send('Error al insertar marca');
                manejarMarca(result3.insertId);
            });
        }
    });
});

app.put('/productos/:ean/nombre', async (req, res) => {
    const { ean } = req.params;
    const { nombre } = req.body;

    if (!nombre) {
        return res.status(400).send("El nombre no puede estar vacío");
    }

    try {
        await pool.query("UPDATE producto SET nombre = ? WHERE ean = ?", [nombre, ean]);
        res.send("Nombre actualizado correctamente");
    } catch (err) {
        console.error("Error al actualizar nombre:", err);
        res.status(500).send("Error al actualizar nombre");
    }
});

app.put('/productos/:ean/precio-venta', (req, res) => {
    const { ean } = req.params;
    const { precio_venta } = req.body;

    if (precio_venta === undefined || isNaN(precio_venta)) {
        return res.status(400).send('Precio de venta inválido');
    }

    connection.query(
        'UPDATE producto SET precio_venta = ? WHERE ean = ?',
        [precio_venta, ean],
        (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Error al actualizar el precio de venta');
            }
            res.send('Precio de venta actualizado correctamente');
        }
    );
});

app.put('/productos/:ean/stock', (req, res) => {
    const { ean } = req.params;
    const { stock } = req.body;

    if (stock === undefined || isNaN(stock)) {
        return res.status(400).json({ mensaje: 'Stock inválido.' });
    }

    connection.query('UPDATE producto SET stock = ? WHERE ean = ?', [stock, ean], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ mensaje: 'Error al actualizar el stock.' });
        }
        res.json({ mensaje: 'Stock actualizado correctamente.' });
    });
});

app.put('/productos/:ean/marca', (req, res) => {
    const { ean } = req.params;
    const { nombreMarca } = req.body;

    if (!nombreMarca) {
        return res.status(400).json({ mensaje: 'El nombre de la marca es obligatorio.' });
    }

    // Paso 1: Buscar si la marca ya existe
    connection.query('SELECT id FROM marca WHERE nombre = ?', [nombreMarca], (err, results) => {
        if (err) return res.status(500).json({ mensaje: 'Error al buscar la marca.' });

        const actualizarMarca = (marcaId) => {
            // Paso 3: Actualizar el producto con el nuevo ID de marca
            connection.query('UPDATE producto SET marca = ? WHERE ean = ?', [marcaId, ean], (err2) => {
                if (err2) return res.status(500).json({ mensaje: 'Error al actualizar la marca del producto.' });
                res.json({ mensaje: 'Marca actualizada correctamente.' });
            });
        };

        if (results.length > 0) {
            // Paso 2a: Si la marca existe, usar su ID
            actualizarMarca(results[0].id);
        } else {
            // Paso 2b: Si no existe, insertarla primero
            connection.query('INSERT INTO marca (nombre) VALUES (?)', [nombreMarca], (err2, resultInsert) => {
                if (err2) return res.status(500).json({ mensaje: 'Error al insertar la nueva marca.' });
                actualizarMarca(resultInsert.insertId);
            });
        }
    });
});

app.put('/productos/:ean/categoria', (req, res) => {
    const { ean } = req.params;
    const { nombreCategoria } = req.body;

    if (!nombreCategoria) {
        return res.status(400).json({ mensaje: 'El nombre de la categoría es obligatorio.' });
    }

    // Buscar si la categoría ya existe
    connection.query('SELECT id FROM categoria WHERE nombre = ?', [nombreCategoria], (err, results) => {
        if (err) return res.status(500).json({ mensaje: 'Error al buscar la categoría.' });

        const actualizarCategoria = (categoriaId) => {
            connection.query('UPDATE producto SET categoriaId = ? WHERE ean = ?', [categoriaId, ean], (err2) => {
                if (err2) return res.status(500).json({ mensaje: 'Error al actualizar la categoría del producto.' });
                res.json({ mensaje: 'Categoría actualizada correctamente.' });
            });
        };

        if (results.length > 0) {
            actualizarCategoria(results[0].id);
        } else {
            connection.query('INSERT INTO categoria (nombre) VALUES (?)', [nombreCategoria], (err2, resultInsert) => {
                if (err2) return res.status(500).json({ mensaje: 'Error al insertar la nueva categoría.' });
                actualizarCategoria(resultInsert.insertId);
            });
        }
    });
});

app.put('/productos/:ean/gramos', (req, res) => {
    const { ean } = req.params;
    const { gramos } = req.body;

    if (typeof gramos !== 'number' || gramos <= 0) {
        return res.status(400).json({ mensaje: 'Los gramos deben ser un número válido mayor a cero.' });
    }

    connection.query(
        'UPDATE producto SET gramos = ? WHERE ean = ?',
        [gramos, ean],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ mensaje: 'Error al actualizar los gramos del producto.' });
            }

            res.send('Gramos actualizados correctamente.');
        }
    );
});

app.get('/productos-bajo-stock', (req, res) => {
    const sql = `
        SELECT p.ean, p.nombre, p.stock, p.precio_venta, p.gramos, p.descripcion,
               m.nombre AS marca_nombre, c.nombre AS categoria_nombre
        FROM producto p
        JOIN marca m ON p.marca = m.id
        JOIN categoria c ON p.categoriaId = c.id
        WHERE p.precio_venta IS NOT NULL
          AND p.precio_venta != 0
          AND p.stock < 3
    `;
    connection.query(sql, [], (error, results) => {
        if (error) {
            console.error('Error al obtener productos bajo stock:', error);
            return res.status(500).send('Error en la base de datos');
        }
        res.json(results);
    });
});

app.delete('/productos/:ean', (req, res) => {
    const { ean } = req.params;
    connection.query('DELETE FROM producto WHERE ean = ?', [ean], (err, result) => {
        if (err) {
            console.error('Error al eliminar producto:', err);
            return res.status(500).send('Error al eliminar producto');
        }
        res.send('Producto eliminado correctamente');
    });
});