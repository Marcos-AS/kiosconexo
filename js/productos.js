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
          AND c.nombre NOT IN ('Accesorio', 'Cartera', 'Joyería', 'Mochilas', 'Tecnología')
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

app.get('/productos-precios', async (req, res) => {
    try {
        // Obtenemos los productos y categorías
        const [productos] = await pool.query(`
            SELECT p.ean, p.nombre, p.precio_venta, p.stock, c.nombre AS categoria
            FROM producto p
            JOIN categoria c ON p.categoriaId = c.id
        `);

        // Obtenemos el último precio_compra y la fecha de cada producto
        const [ultimasCompras] = await pool.query(`
            SELECT 
                producto AS ean,
                precio_compra,
                fecha AS fecha_ultima_compra
            FROM compras
            WHERE (producto, fecha) IN (
                SELECT producto, MAX(fecha)
                FROM compras
                GROUP BY producto
            )
        `);

        // Creamos un mapa para acceder rápido
        const mapaCompras = {};
        ultimasCompras.forEach(row => {
            mapaCompras[row.ean] = {
                precio_compra: row.precio_compra,
                fecha_ultima_compra: row.fecha_ultima_compra
            };
        });

        // Combinamos datos
        const resultado = productos.map(prod => {
            const infoCompra = mapaCompras[prod.ean] || {};
            const precioCompra = infoCompra.precio_compra || null;
            const fechaCompra = infoCompra.fecha_ultima_compra || null;

            let porcentaje = null;
            if (precioCompra && prod.precio_venta) {
                porcentaje = ((prod.precio_venta - precioCompra) / precioCompra * 100).toFixed(2);
            }

            return {
                nombre: prod.nombre,
                precio_venta: prod.precio_venta,
                precio_compra: precioCompra,
                diferencia: porcentaje,
                categoria: prod.categoria,
                stock: prod.stock,
                fecha_ultima_compra: fechaCompra
            };
        });

        res.json(resultado);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al obtener precios');
    }
});

app.get('/stock-seccion/:seccion', async (req, res) => {
    const { seccion } = req.params;
    let categorias = [];
    let marcaCondicion = '';
    let params = [];
    
    if (seccion === 'heladera-blanca') {
        categorias = ['jugo', 'cerveza', 'agua', 'energizante', 'gaseosa', 'pebete', 'hamburguesa'];
        marcaCondicion = 'AND m.nombre != ?';
        params = [...categorias, 'Coca Cola'];
    } else if (seccion === 'heladera-coca-cola') {
        categorias = ['jugo', 'cerveza', 'agua', 'agua saborizada', 'agua tónica', 'energizante', 'gaseosa', 'pebete', 'hamburguesa'];
        marcaCondicion = 'AND m.nombre = ?';
        params = [...categorias, 'Coca Cola'];
    } else if (seccion === 'mostrador-golosinas') {
        categorias = ['chicles', 'pastillas', 'alfajor', 'barra de cereal', 'turrón'];
        marcaCondicion = '';
        params = categorias;
    } else if (seccion === 'mostrador-chocolates') {
        categorias = ['chocolate', 'bombón', 'cubanito', 'bocadito', 'huevos de chocolate'];
        marcaCondicion = '';
        params = categorias;
    } else if (seccion === 'isla-galletas') {
        categorias = ['galletas', 'confites', 'obleas'];
        marcaCondicion = 'AND m.nombre != ?';
        params = [...categorias, 'Milka'];
    } else if (seccion === 'estanteria-snacks') {
        categorias = ['chisitos', 'nachos', 'papitas', 'snack salado', 'palitos salados', 'semillas', 'malvaviscos', 'azúcar', 'infusión', 'mayonesa', 'jugo en polvo', 'yerba', 'papel higiénico', 'servilletas'];
        marcaCondicion = '';
        params = categorias;
    } else if (seccion === 'cigarrillos') {
        categorias = ['cigarrillos', 'tabaco', 'encendedor', 'fósforos', 'preservativos'];
        marcaCondicion = '';
        params = categorias;
    } else {
        return res.status(400).send('Sección no válida');
    }

    try {
        const placeholders = categorias.map(() => '?').join(',');

        const sql = `
            SELECT 
                p.ean,
                p.nombre,
                p.stock,
                p.precio_venta,
                c.nombre AS categoria,
                m.nombre AS marca
            FROM producto p
            JOIN categoria c ON p.categoriaId = c.id
            JOIN marca m ON p.marca = m.id
            WHERE c.nombre IN (${placeholders})
            ${marcaCondicion}
            ORDER BY c.nombre, p.nombre
        `;

        const [productos] = await pool.query(sql, params);

        // Obtenemos la última compra de cada producto con el proveedor
        const [ultimasCompras] = await pool.query(`
            SELECT 
                c.producto AS ean,
                c.precio_compra,
                p.nombre AS proveedor_nombre
            FROM compras c
            JOIN proveedor p ON c.proveedor = p.id
            WHERE (c.producto, c.fecha) IN (
                SELECT producto, MAX(fecha)
                FROM compras
                GROUP BY producto
            )
        `);

        // Crear mapa para acceso rápido
        const mapaCompras = {};
        ultimasCompras.forEach(row => {
            mapaCompras[row.ean] = {
                precio_compra: row.precio_compra,
                proveedor_nombre: row.proveedor_nombre
            };
        });

        // Combinar datos
        const resultado = productos.map(prod => {
            const infoCompra = mapaCompras[prod.ean] || {};
            return {
                ean: prod.ean,
                nombre: prod.nombre,
                stock: prod.stock,
                precio_venta: prod.precio_venta,
                categoria: prod.categoria,
                marca: prod.marca,
                precio_compra: infoCompra.precio_compra || null,
                proveedor: infoCompra.proveedor_nombre || 'N/A'
            };
        });

        res.json(resultado);
    } catch (err) {
        console.error('Error al obtener stock de sección:', err);
        res.status(500).send('Error al obtener stock');
    }
});


