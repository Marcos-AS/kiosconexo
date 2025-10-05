const { app, express } = require('./db');
require('./ventas');  // importa otros endpoints}
require('./caja');
require('./categorias');
require('./compras');
require('./decomisaciones');
require('./marcas');
require('./productos');
require('./promociones');
require('./proveedores');


app.use(express.static(__dirname));
app.listen(3000, () => {
    console.log('Servidor corriendo');
});