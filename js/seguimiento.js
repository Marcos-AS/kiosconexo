    // Autocompletado de productos
    const inputProducto = document.getElementById('producto_ean');
    const datalist = document.getElementById('productos-list');

    inputProducto.addEventListener('input', function() {
        const q = inputProducto.value;
        if (q.length < 2) return;
        fetch('/productos-autocomplete?q=' + encodeURIComponent(q))
            .then(res => res.json())
            .then(productos => {
                datalist.innerHTML = '';
                productos.forEach(prod => {
                    const option = document.createElement('option');
                    option.value = prod.ean;
                    option.label = prod.nombre + ' (' + prod.ean + ')';
                    datalist.appendChild(option);
                });
            });
    });
// js/seguimiento.js

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form-seguimiento');
    const tabla = document.getElementById('tabla-seguimiento').querySelector('tbody');

    function cargarProductos() {
        fetch('/productos-seguimiento')
            .then(res => res.json())
            .then(productos => {
                tabla.innerHTML = '';
                productos.forEach(prod => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td style="border:1px solid #333;">${prod.ean}</td>
                        <td style="border:1px solid #333;">${prod.nombre}</td>
                        <td style="border:1px solid #333;">${prod.stock}</td>
                        <td style="border:1px solid #333;">${prod.precio_compra ?? ''}</td>
                        <td style="border:1px solid #333;">${prod.lugares_compra ?? ''}</td>
                        <td style="border:1px solid #333;"><button data-id="${prod.id}" class="eliminar">Eliminar</button></td>
                    `;
                    tabla.appendChild(tr);
                });
            });
    }

    form.addEventListener('submit', e => {
        e.preventDefault();
        let eanIngresado = document.getElementById('producto_ean').value.trim();
        const data = {
            producto_ean: eanIngresado
        };
        fetch('/productos-seguimiento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(res => {
            if (!res.ok) throw new Error('Error al guardar');
            return res.text();
        })
        .then(() => {
            form.reset();
            cargarProductos();
        })
        .catch(alert);
    });

    tabla.addEventListener('click', e => {
        if (e.target.classList.contains('eliminar')) {
            const id = e.target.dataset.id;
            fetch(`/productos-seguimiento/${id}`, { method: 'DELETE' })
                .then(() => cargarProductos());
        }
    });

    cargarProductos();
});
