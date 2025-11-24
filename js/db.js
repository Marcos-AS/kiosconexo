const mysql = require('mysql2');
const express = require('express');
const app = express();

app.use(express.json());

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'notalokos',
    database: 'inventario'
})

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

module.exports = { app, pool, connection, express };