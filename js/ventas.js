const { app, pool, connection } = require('./db');

app.post('/ventas', async (req, res) => {
  const { productos, medio_pago } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Crear la venta y obtener el id
    const [ventaResult] = await connection.query(
      'INSERT INTO ventas (fecha, medio_pago, total) VALUES (NOW(), ?, 0)',
      [medio_pago || 'efectivo']
    );
    const ventaId = ventaResult.insertId;

    // Obtener TODAS las promociones (combinadas e individuales)
    const [promosCombinadas] = await connection.query(
      `SELECT p.id, p.nombre, p.precio_total, pp.producto_ean, pp.cantidad
       FROM promocion p
       JOIN promocion_productos pp ON pp.promocion_id = p.id`
    );

    // Agrupa promociones por id
    function agruparPromos(promosCombinadas) {
      const promos = {};
      for (const promo of promosCombinadas) {
        if (!promos[promo.id]) promos[promo.id] = { precio_total: promo.precio_total, productos: [] };
        promos[promo.id].productos.push({ ean: promo.producto_ean, cantidad: promo.cantidad });
      }
      return promos;
    }

    // Busca si alguna promoción se puede aplicar
    function encontrarPromocionAplicable(productosCarrito, promosCombinadas) {
      const promos = agruparPromos(promosCombinadas);
      for (const promoId in promos) {
        const promo = promos[promoId];
        // Busca cuántos productos del carrito coinciden con la promo
        let productosCoinciden = 0;
        let veces = Infinity;
        for (const prod of promo.productos) {
          const enCarrito = productosCarrito.find(p => p.ean === prod.ean);
          if (enCarrito && enCarrito.cantidad >= prod.cantidad) {
            productosCoinciden++;
            veces = Math.min(veces, Math.floor(enCarrito.cantidad / prod.cantidad));
          }
        }
        // Si hay al menos 2 productos que cumplen la cantidad mínima, aplica la promo
        if (productosCoinciden >= 2 && veces > 0) {
          // Solo toma los productos que cumplen
          const productosAplicados = promo.productos.filter(prod => {
            const enCarrito = productosCarrito.find(p => p.ean === prod.ean);
            return enCarrito && enCarrito.cantidad >= prod.cantidad;
          });
          return { promo: { ...promo, productos: productosAplicados }, veces };
        }
      }
      return null;
    }

    // Aplica promociones combinadas primero
    let productosRestantes = productos.map(p => ({ ...p })); // copia profunda
    let total = 0;
    while (true) {
      const promoAplicable = encontrarPromocionAplicable(productosRestantes, promosCombinadas);
      if (!promoAplicable) break;
      const { promo, veces } = promoAplicable;
      total += promo.precio_total * veces;

      // Calcula precio unitario para cada producto de la promo combinada
      const totalUnidades = promo.productos.reduce((acc, prod) => acc + prod.cantidad, 0);
      const precioUnitarioPromo = promo.precio_total / totalUnidades;

      for (const prod of promo.productos) {
        const prodCarrito = productosRestantes.find(p => p.ean === prod.ean);
        // Tomar precio_compra más reciente
        const [comprasDB] = await connection.query(
          'SELECT id, precio_compra FROM compras WHERE producto = ? ORDER BY fecha DESC LIMIT 1',
          [prod.ean]
        );
        const compraId = comprasDB.length > 0 ? comprasDB[0].id : null;

        // Insertar detalle_venta por cada producto de la promo
        await connection.query(
          `INSERT INTO detalle_venta
            (venta_id, producto, cantidad, precio_unitario, compra_id)
           VALUES (?, ?, ?, ?, ?)`,
          [ventaId, prod.ean, prod.cantidad * veces, precioUnitarioPromo, compraId]
        );

        // Actualizar stock
        await connection.query(
          'UPDATE producto SET stock = stock - ? WHERE ean = ?',
          [prod.cantidad * veces, prod.ean]
        );

        // Resta productos usados en la promoción
        prodCarrito.cantidad -= prod.cantidad * veces;
      }
      // Elimina productos con cantidad 0
      productosRestantes = productosRestantes.filter(p => p.cantidad > 0);
    }

    // Luego calcula el resto como venta normal (sin promociones)
    for (const { ean, cantidad, precio_unitario } of productosRestantes) {
      // Obtener stock del producto
      const [productosDB] = await connection.query(
        'SELECT stock FROM producto WHERE ean = ?',
        [ean]
      );
      if (productosDB.length === 0) throw new Error(`Producto ${ean} no existe`);
      const { stock } = productosDB[0];

      if (stock < cantidad) throw new Error(`Stock insuficiente para el producto ${ean}`);

      const subtotal = cantidad * precio_unitario;
      total += subtotal;

      // Tomar precio_compra más reciente
      const [comprasDB] = await connection.query(
        'SELECT id, precio_compra FROM compras WHERE producto = ? ORDER BY fecha DESC LIMIT 1',
        [ean]
      );
      const compraId = comprasDB.length > 0 ? comprasDB[0].id : null;

      // Insertar detalle_venta
      await connection.query(
        `INSERT INTO detalle_venta
          (venta_id, producto, cantidad, precio_unitario, compra_id)
         VALUES (?, ?, ?, ?, ?)`,
        [ventaId, ean, cantidad, precio_unitario, compraId]
      );

      // Actualizar stock
      await connection.query(
        'UPDATE producto SET stock = stock - ? WHERE ean = ?',
        [cantidad, ean]
      );
    }

    // Actualizar total en la venta
    let totalFinal = total;
    if ((medio_pago || 'efectivo') === 'debito') {
      totalFinal = +(total * (1 - 0.0362)).toFixed(2);
    } else if ((medio_pago || 'efectivo') === 'qr') {
      totalFinal = +(total * (1 - 0.0097)).toFixed(2);
    } else if ((medio_pago || 'efectivo') === 'credito') {
      totalFinal = +(total * (1 - 0.0531)).toFixed(2);
    }
    await connection.query(
      'UPDATE ventas SET total = ? WHERE id = ?',
      [totalFinal, ventaId]
    );

    // Si el medio de pago es efectivo, suma al efectivo en caja
    if ((medio_pago || 'efectivo') === 'efectivo') {
      const fechaHoy = new Date().toISOString().split('T')[0];
      await connection.query(
        'INSERT INTO caja (efectivo, fecha) VALUES (?, ?)',
        [total, fechaHoy]
      );
    }

    await connection.commit();
    res.json({ message: 'Venta registrada exitosamente', ventaId, total: totalFinal });
  } catch (err) {
    await connection.rollback();
    res.status(400).send(err.message);
  } finally {
    connection.release();
  }
});

app.get('/ventas', (req, res) => {
    let sql = `
        SELECT 
            v.id AS venta_id, 
            v.fecha, 
            v.total, 
            v.medio_pago,
            dv.producto, 
            p.nombre AS producto_nombre, 
            cat.nombre AS categoria,
            dv.cantidad, 
            dv.precio_unitario,
            dv.compra_id, 
            c.precio_compra
        FROM ventas v
        JOIN detalle_venta dv ON dv.venta_id = v.id
        LEFT JOIN producto p ON dv.producto = p.ean
        LEFT JOIN categoria cat ON p.categoriaId = cat.id
        LEFT JOIN compras c ON dv.compra_id = c.id
        WHERE 1=1
    `;
    const params = [];

    if (req.query.fecha) {
        sql += ' AND DATE(v.fecha) = ?';
        params.push(req.query.fecha);
    }

    if (req.query.desde && req.query.hasta) {
        const desde = req.query.desde + ' 00:00:00';
        let hastaDate = new Date(req.query.hasta);
        hastaDate.setDate(hastaDate.getDate() + 1);
        const hasta = hastaDate.toISOString().slice(0, 10) + ' 00:00:00';
        sql += ' AND v.fecha >= ? AND v.fecha < ?';
        params.push(desde, hasta);
    }

    if (req.query.medio_pago) {
        sql += ' AND v.medio_pago = ?';
        params.push(req.query.medio_pago);
    }

    // Orden y límite: por defecto limitamos a 500 para consultas generales,
    // pero si se pasa un rango (desde/hasta) o se solicita no_limit=1, no aplicamos LIMIT.
    sql += ' ORDER BY v.fecha DESC, v.id DESC ';
    if (!(req.query.desde && req.query.hasta) && req.query.no_limit !== '1') {
      sql += ' LIMIT 500';
    }

    connection.query(sql, params, (err, results) => {
        if (err) res.status(500).send(err.message);

        const ventas = [];
        let actual = null;

        results.forEach(row => {
            if (!actual || actual.venta_id !== row.venta_id) {
                actual = {
                    venta_id: row.venta_id,
                    fecha: row.fecha,
                    total: row.total,
                    medio_pago: row.medio_pago,
                    detalles: []
                };
                ventas.push(actual);
            }
            actual.detalles.push({
                producto: row.producto,
                producto_nombre: row.producto_nombre,
                categoria: row.categoria,
                cantidad: row.cantidad,
                precio_unitario: row.precio_unitario,
                compra_id: row.compra_id,
                precio_compra: row.precio_compra
            });
        });

        res.json(ventas);
    });
});


app.get('/top-productos-vendidos', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT dv.producto, p.nombre, p.gramos, SUM(dv.cantidad) AS total_vendido
            FROM detalle_venta dv
            JOIN producto p ON dv.producto = p.ean
            GROUP BY dv.producto, p.nombre, p.gramos
            ORDER BY total_vendido DESC
            LIMIT 20
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).send('Error al obtener el top de productos vendidos');
    }
});

app.get('/top-productos-vendidos-por-categoria', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT c.nombre AS categoria, p.nombre, p.gramos, SUM(dv.cantidad) AS total_vendido
            FROM detalle_venta dv
            JOIN producto p ON dv.producto = p.ean
            JOIN categoria c ON p.categoriaId = c.id
            GROUP BY c.id, p.ean, p.nombre, p.gramos
            ORDER BY c.nombre, total_vendido DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).send('Error al obtener el top por categoría');
    }
});

app.get('/ventas-por-dia', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        DATE(fecha) AS fecha,
        SUM(total) AS total_dia,
        COUNT(id) AS cantidad_ventas
      FROM ventas
      GROUP BY DATE(fecha)
      ORDER BY fecha DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener totales de ventas por día');
  }
});



app.get('/ventas-por-semana', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        anio,
        semana,
        MIN(inicio) AS inicio_semana,
        MAX(fin) AS fin_semana,
        SUM(total_semana) AS total_semana,
        COUNT(*) AS cantidad_ventas
      FROM (
        SELECT 
          YEAR(fecha) AS anio,
          WEEK(fecha, 1) AS semana,
          DATE(fecha) AS inicio,
          DATE(fecha) AS fin,
          total AS total_semana
        FROM ventas
      ) AS sub
      GROUP BY anio, semana
      ORDER BY anio DESC, semana DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error('❌ Error en /ventas-por-semana:', err.message);
    res.status(500).send('Error al obtener totales de ventas por semana');
  }
});

app.get('/ventas-por-mes', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        anio,
        mes_numero,
        CONCAT(MONTHNAME(STR_TO_DATE(mes_numero, '%m')), ' ', anio) AS mes_nombre,
        SUM(total) AS total_mes,
        COUNT(*) AS cantidad_ventas
      FROM (
        SELECT 
          YEAR(fecha) AS anio,
          MONTH(fecha) AS mes_numero,
          total
        FROM ventas
      ) AS sub
      GROUP BY anio, mes_numero
      ORDER BY anio DESC, mes_numero DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error('❌ Error en /ventas-por-mes:', err.message);
    res.status(500).send('Error al obtener totales de ventas por mes');
  }
});

app.get('/ventas-por-categoria', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        c.id,
        c.nombre AS categoria,
        SUM(v.total) AS total_categoria,
        COUNT(v.id) AS cantidad_ventas
      FROM ventas v
      JOIN detalle_venta dv ON dv.venta_id = v.id
      JOIN producto p ON dv.producto = p.ean
      JOIN categoria c ON p.categoriaId = c.id
      GROUP BY c.id, c.nombre
      ORDER BY total_categoria DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('❌ Error en /ventas-por-categoria:', err.message);
    res.status(500).send('Error al obtener ventas por categoría');
  }
});

app.get('/ganancia-por-categoria', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        c.id AS categoria_id,
        c.nombre AS categoria,
        SUM((dv.precio_unitario - co.precio_compra) * dv.cantidad) AS ganancia_total,
        COUNT(DISTINCT dv.venta_id) AS cantidad_ventas
      FROM detalle_venta dv
      JOIN producto p ON dv.producto = p.ean
      JOIN categoria c ON p.categoriaId = c.id
      LEFT JOIN (
        SELECT producto, precio_compra
        FROM compras
        WHERE (producto, fecha) IN (
          SELECT producto, MAX(fecha)
          FROM compras
          GROUP BY producto
        )
      ) co ON co.producto = dv.producto
      GROUP BY c.id, c.nombre
      ORDER BY ganancia_total DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error('❌ Error en /ganancia-por-categoria:', err.message);
    res.status(500).send('Error al calcular ganancias por categoría');
  }
});

