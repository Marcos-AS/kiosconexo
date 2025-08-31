const { app, pool, connection } = require('./db');

app.post('/ventas', async (req, res) => {
  const { productos, medio_pago } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Reemplaza el cálculo de promociones por esta lógica antes de calcular el total:
    const [promosCombinadas] = await connection.query(
      `SELECT p.id, p.precio_total, pp.producto_ean, pp.cantidad
       FROM promocion p
       JOIN promocion_productos pp ON pp.promocion_id = p.id`
    );

    function encontrarPromocionAplicable(productosCarrito, promosCombinadas) {
      // Agrupa promociones por id
      const promos = {};
      for (const promo of promosCombinadas) {
        if (!promos[promo.id]) promos[promo.id] = { precio_total: promo.precio_total, productos: [] };
        promos[promo.id].productos.push({ ean: promo.producto_ean, cantidad: promo.cantidad });
      }
      // Busca si alguna promoción se puede aplicar
      for (const promoId in promos) {
        const promo = promos[promoId];
        let aplica = true;
        let veces = Infinity;
        for (const prod of promo.productos) {
          const enCarrito = productosCarrito.find(p => p.ean === prod.ean);
          if (!enCarrito || enCarrito.cantidad < prod.cantidad) {
            aplica = false;
            break;
          }
          veces = Math.min(veces, Math.floor(enCarrito.cantidad / prod.cantidad));
        }
        if (aplica && veces > 0) {
          return { promo, veces };
        }
      }
      return null;
    }

    // Aplica promociones combinadas primero
    let productosRestantes = [...productos];
    let total = 0;
    while (true) {
      const promoAplicable = encontrarPromocionAplicable(productosRestantes, promosCombinadas);
      if (!promoAplicable) break;
      total += promoAplicable.promo.precio_total * promoAplicable.veces;
      // Resta productos usados en la promoción
      for (const prod of promoAplicable.promo.productos) {
        const prodCarrito = productosRestantes.find(p => p.ean === prod.ean);
        prodCarrito.cantidad -= prod.cantidad * promoAplicable.veces;
      }
      // Elimina productos con cantidad 0
      productosRestantes = productosRestantes.filter(p => p.cantidad > 0);
    }

    // Luego calcula el resto como venta normal
    for (const { ean, cantidad } of productosRestantes) {
      // Obtener stock y precio_venta del producto
      const [productosDB] = await connection.query(
        'SELECT stock, precio_venta FROM producto WHERE ean = ?',
        [ean]
      );
      if (productosDB.length === 0) throw new Error(`Producto ${ean} no existe`);
      const { stock, precio_venta } = productosDB[0];

      if (stock < cantidad) throw new Error(`Stock insuficiente para el producto ${ean}`);

      // Consultar promoción
      const [promoDB] = await connection.query(
        'SELECT cantidad, precio_promocion FROM promociones WHERE producto_ean = ? ORDER BY cantidad DESC LIMIT 1',
        [ean]
      );
      let subtotal = 0;
      let precioUnitario = precio_venta;

      if (promoDB.length > 0 && cantidad >= promoDB[0].cantidad) {
        // Aplica precio unitario promocional a todas las unidades
        const precioUnitarioPromo = promoDB[0].precio_promocion / promoDB[0].cantidad;
        subtotal = cantidad * precioUnitarioPromo;
        precioUnitario = precioUnitarioPromo;
      } else {
        subtotal = cantidad * precio_venta;
        precioUnitario = precio_venta;
      }
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
        [ventaId, ean, cantidad, precioUnitario, compraId]
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

    // Si el medio de pago es efectivo, suma al efectivo en caja
    if ((medio_pago || 'efectivo') === 'efectivo') {
      const fechaHoy = new Date().toISOString().split('T')[0];
      await connection.query(
        'INSERT INTO caja (efectivo, fecha) VALUES (?, ?)',
        [total, fechaHoy]
      );
    }

    await connection.commit();
    res.json({ message: 'Venta registrada exitosamente', ventaId, total });
  } catch (err) {
    await connection.rollback();
    res.status(400).send(err.message);
  } finally {
    connection.release();
  }
});

app.get('/ventas', (req, res) => {
    let sql = `
        SELECT v.id AS venta_id, v.fecha, v.total, v.medio_pago,
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
        LIMIT 500
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
                    medio_pago: row.medio_pago, // 👈 Agregado
                    detalle: []
                };
                ventas.push(actual);
            }
            actual.detalle.push({
                producto: row.producto,
                producto_nombre: row.producto_nombre,
                cantidad: row.cantidad,
                precio_unitario: row.precio_unitario,
                precio_compra: row.precio_compra
            });
        });
        res.json(ventas);
    });
});

app.post('/ventas', async (req, res) => {
  const { productos, medio_pago } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Reemplaza el cálculo de promociones por esta lógica antes de calcular el total:
    const [promosCombinadas] = await connection.query(
      `SELECT p.id, p.precio_total, pp.producto_ean, pp.cantidad
       FROM promocion p
       JOIN promocion_productos pp ON pp.promocion_id = p.id`
    );

    function encontrarPromocionAplicable(productosCarrito, promosCombinadas) {
      // Agrupa promociones por id
      const promos = {};
      for (const promo of promosCombinadas) {
        if (!promos[promo.id]) promos[promo.id] = { precio_total: promo.precio_total, productos: [] };
        promos[promo.id].productos.push({ ean: promo.producto_ean, cantidad: promo.cantidad });
      }
      // Busca si alguna promoción se puede aplicar
      for (const promoId in promos) {
        const promo = promos[promoId];
        let aplica = true;
        let veces = Infinity;
        for (const prod of promo.productos) {
          const enCarrito = productosCarrito.find(p => p.ean === prod.ean);
          if (!enCarrito || enCarrito.cantidad < prod.cantidad) {
            aplica = false;
            break;
          }
          veces = Math.min(veces, Math.floor(enCarrito.cantidad / prod.cantidad));
        }
        if (aplica && veces > 0) {
          return { promo, veces };
        }
      }
      return null;
    }

    // Aplica promociones combinadas primero
    let productosRestantes = [...productos];
    let total = 0;
    while (true) {
      const promoAplicable = encontrarPromocionAplicable(productosRestantes, promosCombinadas);
      if (!promoAplicable) break;
      total += promoAplicable.promo.precio_total * promoAplicable.veces;
      // Resta productos usados en la promoción
      for (const prod of promoAplicable.promo.productos) {
        const prodCarrito = productosRestantes.find(p => p.ean === prod.ean);
        prodCarrito.cantidad -= prod.cantidad * promoAplicable.veces;
      }
      // Elimina productos con cantidad 0
      productosRestantes = productosRestantes.filter(p => p.cantidad > 0);
    }

    // Luego calcula el resto como venta normal
    for (const { ean, cantidad } of productosRestantes) {
      // Obtener stock y precio_venta del producto
      const [productosDB] = await connection.query(
        'SELECT stock, precio_venta FROM producto WHERE ean = ?',
        [ean]
      );
      if (productosDB.length === 0) throw new Error(`Producto ${ean} no existe`);
      const { stock, precio_venta } = productosDB[0];

      if (stock < cantidad) throw new Error(`Stock insuficiente para el producto ${ean}`);

      // Consultar promoción
      const [promoDB] = await connection.query(
        'SELECT cantidad, precio_promocion FROM promociones WHERE producto_ean = ? ORDER BY cantidad DESC LIMIT 1',
        [ean]
      );
      let subtotal = 0;
      let precioUnitario = precio_venta;

      if (promoDB.length > 0 && cantidad >= promoDB[0].cantidad) {
        // Aplica precio unitario promocional a todas las unidades
        const precioUnitarioPromo = promoDB[0].precio_promocion / promoDB[0].cantidad;
        subtotal = cantidad * precioUnitarioPromo;
        precioUnitario = precioUnitarioPromo;
      } else {
        subtotal = cantidad * precio_venta;
        precioUnitario = precio_venta;
      }
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
        [ventaId, ean, cantidad, precioUnitario, compraId]
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

    // Si el medio de pago es efectivo, suma al efectivo en caja
    if ((medio_pago || 'efectivo') === 'efectivo') {
      const fechaHoy = new Date().toISOString().split('T')[0];
      await connection.query(
        'INSERT INTO caja (efectivo, fecha) VALUES (?, ?)',
        [total, fechaHoy]
      );
    }

    await connection.commit();
    res.json({ message: 'Venta registrada exitosamente', ventaId, total });
  } catch (err) {
    await connection.rollback();
    res.status(400).send(err.message);
  } finally {
    connection.release();
  }
});