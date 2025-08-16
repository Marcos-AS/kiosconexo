const mysql = require('mysql2');
const express = require('express');
const app = express();
app.use(express.json());
const port = 3000;

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'notalokos',
    database: 'inventario'
})

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
               m.nombre AS marca_nombre, c.nombre AS categoria_nombre,
               MAX(pr.precio) AS precio
        FROM producto p
        JOIN marca m ON p.marca = m.id
        JOIN categoria c ON p.categoriaId = c.id
        LEFT JOIN precios pr ON pr.producto = p.ean
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

app.get('/categorias', (req, res) => {
    connection.query('SELECT id, nombre FROM categoria', (err, results) => {
        if (err) return res.status(500).send('Error al obtener categorías');
        res.json(results);
    });
});

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


app.get('/proveedores', (req, res) => {
    connection.query('SELECT id, nombre FROM proveedor', (err, results) => {
        if (err) return res.status(500).send('Error al obtener proveedores');
        res.json(results);
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

// Tabla ventas: id, fecha, total
// Tabla detalle_venta: id, venta_id, producto, cantidad, precio_unitario


const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',        // 👈 tu usuario
  password: 'notalokos',    // 👈 tu password
  database: 'inventario',  // 👈 tu base de datos
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
}).promise();

app.post('/ventas', async (req, res) => {
  const { productos } = req.body; // productos = [{ ean, cantidad }]
  console.log('Productos recibidos:', productos);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let total = 0;

    // Insertar venta temporal con total 0, lo actualizamos después
    const [ventaResult] = await connection.query(
      'INSERT INTO ventas (fecha, total) VALUES (NOW(), 0)'
    );
    const ventaId = ventaResult.insertId;

    for (const { ean, cantidad } of productos) {
      // Obtener stock y precio_venta del producto
      const [productosDB] = await connection.query(
        'SELECT stock, precio_venta FROM producto WHERE ean = ?',
        [ean]
      );
      if (productosDB.length === 0) throw new Error(`Producto ${ean} no existe`);
      const { stock, precio_venta } = productosDB[0];

      if (stock < cantidad) throw new Error(`Stock insuficiente para el producto ${ean}`);

      // Tomar precio_compra más reciente
      const [comprasDB] = await connection.query(
        'SELECT id, precio_compra FROM compras WHERE producto = ? ORDER BY fecha DESC LIMIT 1',
        [ean]
      );
      const compraId = comprasDB.length > 0 ? comprasDB[0].id : null;
      const precioCompra = comprasDB.length > 0 ? comprasDB[0].precio_compra : null;

      const subtotal = cantidad * precio_venta;
      total += subtotal;

      // Insertar detalle_venta
      await connection.query(
        `INSERT INTO detalle_venta
          (venta_id, producto, cantidad, precio_unitario, compra_id)
         VALUES (?, ?, ?, ?, ?)`,
        [ventaId, ean, cantidad, precio_venta, compraId]
      );

      // Actualizar stock
      await connection.query(
        'UPDATE producto SET stock = stock - ? WHERE ean = ?',
        [cantidad, ean]
      );
    }

    // Actualizar total en la venta
    await connection.query(
      'UPDATE ventas SET total = ? WHERE id = ?',
      [total, ventaId]
    );

    await connection.commit();
    res.json({ message: 'Venta registrada exitosamente', ventaId, total });
  } catch (err) {
    await connection.rollback();
    res.status(400).send(err.message);
  } finally {
    connection.release();
  }
});






// Endpoint para ver el total de caja
app.get('/caja', (req, res) => {
    connection.query('SELECT SUM(total) as caja FROM ventas', (err, results) => {
        if (err) return res.status(500).send('Error al consultar caja');
        res.json({ caja: results[0].caja ?? 0 });
    });
});

// Registrar una compra
app.post('/compras', (req, res) => {
    const { proveedor, producto, cantidad, precio_compra } = req.body;
    if (!proveedor || !producto || !cantidad || !precio_compra) {
        return res.status(400).send('Faltan datos');
    }
    const fecha = new Date();
    connection.query(
        'INSERT INTO compras (fecha, proveedor, producto, cantidad, precio_compra) VALUES (?, ?, ?, ?, ?)',
        [fecha, proveedor, producto, cantidad, precio_compra],
        (err) => {
            if (err) return res.status(500).send('Error al registrar compra');
            // Actualizar stock del producto
            // connection.query(
            //     'UPDATE producto SET stock = stock + ? WHERE ean = ?',
            //     [cantidad, producto],
            //     (err2) => {
            //         if (err2) return res.status(500).send('Error al actualizar stock');
            //         res.send('Compra registrada correctamente');
            //     }
            // );
        }
    );
});

// Listar compras recientes
app.get('/compras', (req, res) => {
    connection.query(
        `SELECT c.fecha, p.nombre as proveedor_nombre, pr.nombre as producto_nombre, c.cantidad, c.precio_compra
         FROM compras c
         JOIN proveedor p ON c.proveedor = p.id
         JOIN producto pr ON c.producto = pr.ean
         ORDER BY c.fecha DESC
         LIMIT 500`,
        (err, results) => {
            if (err) return res.status(500).send('Error al obtener compras');
            res.json(results);
        }
    );
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

app.get('/ventas', (req, res) => {
    let sql = `
        SELECT v.id AS venta_id, v.fecha, v.total,
               dv.producto, p.nombre AS producto_nombre, dv.cantidad, dv.precio_unitario,
               dv.compra_id, c.precio_compra
        FROM ventas v
        JOIN detalle_venta dv ON dv.venta_id = v.id
        LEFT JOIN producto p ON dv.producto = p.ean
        LEFT JOIN compras c ON dv.compra_id = c.id
    `;
    const params = [];
    if (req.query.fecha) {
        sql += ' WHERE DATE(v.fecha) = ?';
        params.push(req.query.fecha);
    }
    sql += `
        ORDER BY v.fecha DESC, v.id DESC
        LIMIT 100
    `;
    connection.query(sql, params, (err, results) => {
        if (err) return res.status(500).send('Error al obtener ventas');
        // Agrupar por venta
        const ventas = [];
        let actual = null;
        results.forEach(row => {
            if (!actual || actual.venta_id !== row.venta_id) {
                actual = {
                    venta_id: row.venta_id,
                    fecha: row.fecha,
                    total: row.total,
                    detalle: []
                };
                ventas.push(actual);
            }
            actual.detalle.push({
                producto: row.producto,
                producto_nombre: row.producto_nombre,
                cantidad: row.cantidad,
                precio_unitario: row.precio_unitario,
                // compra_id: row.compra_id, // Ya no lo necesitas en frontend
                precio_compra: row.precio_compra
            });
        });
        res.json(ventas);
    });
});

app.get('/ganancias-por-lote', (req, res) => {
    const sql = `
        SELECT 
            c.id AS compra_id,
            c.fecha,
            p.nombre AS producto,
            c.precio_compra,
            SUM(dv.cantidad) AS cantidad_vendida,
            AVG(dv.precio_unitario) AS precio_venta_promedio,
            SUM((dv.precio_unitario - c.precio_compra) * dv.cantidad) AS ganancia
        FROM compras c
        LEFT JOIN detalle_venta dv ON dv.compra_id = c.id
        LEFT JOIN producto p ON c.producto = p.ean
        GROUP BY c.id, c.fecha, p.nombre, c.precio_compra
        ORDER BY c.fecha DESC
        LIMIT 50
    `;
    connection.query(sql, (err, results) => {
        if (err) return res.status(500).send('Error al obtener ganancias por lote');
        res.json(results);
    });
});

app.use(express.static(__dirname));
app.listen(port, () => {
    console.log('servidor corriendo');
})
