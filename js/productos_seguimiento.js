const { app, pool, connection } = require('./db');

// Endpoint para autocompletado de productos (EAN y nombre)
app.get('/productos-autocomplete', async (req, res) => {
    const { q } = req.query;
    try {
        let sql = 'SELECT ean, nombre FROM producto';
        let params = [];
        if (q) {
            sql += ' WHERE nombre LIKE ? OR ean LIKE ?';
            params = [`%${q}%`, `%${q}%`];
        }
        sql += ' ORDER BY nombre LIMIT 20';
        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).send('Error al buscar productos');
    }
});

// Obtener todos los productos a seguir, mostrando la info real de la tabla producto
app.get('/productos-seguimiento', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM productos_seguimiento ORDER BY id');
        const productos = [];
        for (const row of rows) {
            // Info básica del producto
            const [prod] = await pool.query('SELECT ean, nombre, stock FROM producto WHERE ean = ? LIMIT 1', [row.producto_ean]);
            if (prod.length === 0) continue;

            // Último precio de compra
            const [compras] = await pool.query('SELECT precio_compra FROM compras WHERE producto = ? ORDER BY fecha DESC LIMIT 1', [row.producto_ean]);
            const precio_compra = compras.length > 0 ? compras[0].precio_compra : null;

            // Lista de lugares de compra (proveedores distintos)
            const [proveedores] = await pool.query('SELECT DISTINCT p.nombre FROM compras c JOIN proveedor p ON c.proveedor = p.id WHERE c.producto = ?', [row.producto_ean]);
            const lugares_compra = proveedores.map(p => p.nombre).join(', ');

            productos.push({
                id: row.id,
                ean: prod[0].ean,
                nombre: prod[0].nombre,
                stock: prod[0].stock,
                precio_compra,
                lugares_compra
            });
        }
        res.json(productos);
    } catch (err) {
        console.error('Error al obtener productos a seguir:', err);
        res.status(500).send('Error al obtener productos a seguir');
    }
});

// Agregar un producto a seguir (solo EAN, validando existencia)
app.post('/productos-seguimiento', async (req, res) => {
    let { producto_ean } = req.body;
    if (!producto_ean) return res.status(400).send('Falta el EAN del producto');
    producto_ean = producto_ean.trim();
    try {
        // Validar que el EAN existe en producto exactamente como está
        const [rows] = await pool.query('SELECT ean FROM producto WHERE ean = ? LIMIT 1', [producto_ean]);
        if (rows.length === 0) {
            return res.status(400).send('El EAN ingresado no existe en productos.');
        }
        await pool.query(
            'INSERT INTO productos_seguimiento (producto_ean) VALUES (?)',
            [producto_ean]
        );
        res.send('Producto guardado');
    } catch (err) {
        console.error('Error al guardar producto a seguir:', err);
        res.status(500).send('Error al guardar producto');
    }
});

// Eliminar producto a seguir
app.delete('/productos-seguimiento/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM productos_seguimiento WHERE id = ?', [id]);
        res.send('Producto eliminado');
    } catch (err) {
        console.error('Error al eliminar producto a seguir:', err);
        res.status(500).send('Error al eliminar producto');
    }
});
