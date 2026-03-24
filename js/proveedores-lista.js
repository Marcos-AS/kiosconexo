document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-guardar')) {
        const id = e.target.dataset.id;

        const td = e.target.closest('td');
        const input = td.querySelector('.input-telefono');
        const link = td.querySelector('.btn-wsp');

        const telefono = input.value;

        fetch(`/proveedores/${id}/telefono`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ telefono })
        })
        .then(res => {
            if (!res.ok) throw new Error('Error al actualizar');

            // ✅ actualizar link WhatsApp
            link.href = generarLinkWhatsApp(telefono);

            // feedback visual
            e.target.textContent = '✔';
            setTimeout(() => e.target.textContent = '💾', 1500);
        })
        .catch(err => {
            console.error(err);
            alert('No se pudo actualizar');
        });
    }
});

const generarLinkWhatsApp = (telefono) => {
    if (!telefono) return '#';

    let numero = telefono.replace(/\D/g, '');

    // asumir Argentina si no tiene código
    if (!numero.startsWith('54')) {
        numero = '549' + numero;
    }

    return `https://wa.me/${numero}`;
};

document.addEventListener('DOMContentLoaded', () => {
    const tabla = document.getElementById('tabla-proveedores').querySelector('tbody');
    const form = document.getElementById('form-proveedor');

    const cargarProveedores = () => {
        fetch('/proveedores')
            .then(res => res.json())
            .then(proveedores => {
                tabla.innerHTML = '';
                proveedores.forEach(p => {
                    let tel = p.telefono 
                        ? `<a href="https://wa.me/${p.telefono.replace(/[^\d]/g, '')}" target="_blank">${p.telefono}</a>` 
                        : '';

                    const tr = document.createElement('tr');

                    tr.innerHTML = `
                        <td>${p.id}</td>
                        <td>${p.nombre}</td>
                        <td>${p.cuit || ''}</td>
                        <td>${p.ubicacion || ''}</td>
                        <td>
                            <input type="text" value="${p.telefono || ''}" data-id="${p.id}" class="input-telefono">
                            <button data-id="${p.id}" class="btn-guardar">💾</button>
                            <a href="#" target="_blank" class="btn-wsp">📱</a>
                        </td>
                    `;

                    // AHORA sí podés acceder
                    const link = tr.querySelector('.btn-wsp');
                    link.href = generarLinkWhatsApp(p.telefono);

                    tabla.appendChild(tr);
                });
            });
    };

    // cargar al inicio
    cargarProveedores();

    // submit del form
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const data = {
            nombre: document.getElementById('nombre').value,
            cuit: document.getElementById('cuit').value,
            ubicacion: document.getElementById('ubicacion').value,
            telefono: document.getElementById('telefono').value
        };

        fetch('/proveedores', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(res => res.json())
        .then(() => {
            form.reset();
            cargarProveedores(); // recargar tabla
        })
        .catch(err => console.error(err));
    });
});