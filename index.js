const { app, express } = require('./js/db');
require('./js/ventas');  // importa otros endpoints}
require('./js/caja');
require('./js/categorias');
require('./js/compras');
require('./js/decomisaciones');
require('./js/marcas');
require('./js/productos');
require('./js/promociones');
require('./js/proveedores');


app.use(express.static(__dirname));
app.listen(3000, () => {
    console.log('Servidor corriendo');
});