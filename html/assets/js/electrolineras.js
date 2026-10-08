/**
 * Dashboard de electrolineras: KPIs, filtro/búsqueda y tabla.
 * El botón de pin regresa al mapa (index.html) con la electrolinera seleccionada
 * por query params, donde main.js la ubica y resalta.
 */

document.addEventListener('DOMContentLoaded', () => {
    const tbody = document.getElementById('tabla-body');
    const vacia = document.getElementById('tabla-vacia');
    const buscador = document.getElementById('buscador');
    const filtroRed = document.getElementById('filtro-red');
    const contador = document.getElementById('contador');

    let sitios = [];

    // Normaliza texto: minúsculas y sin acentos
    function norm(s) {
        return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    }

    function badgeClass(red) {
        if (red === 'Tesla') return 'badge-red--tesla';
        if (red === 'Evergo') return 'badge-red--evergo';
        return 'badge-red--plugshare';
    }

    function setKpis() {
        const elTotal = document.getElementById('kpi-total');
        if (!elTotal) return;
        const conteo = { Tesla: 0, Evergo: 0, PlugShare: 0 };
        sitios.forEach(s => {
            if (conteo[s.red] === undefined) conteo[s.red] = 0;
            conteo[s.red]++;
        });
        elTotal.textContent = sitios.length;
        const elT = document.getElementById('kpi-tesla');
        if (elT) elT.textContent = conteo.Tesla || 0;
        const elE = document.getElementById('kpi-evergo');
        if (elE) elE.textContent = conteo.Evergo || 0;
        const elP = document.getElementById('kpi-plugshare');
        if (elP) elP.textContent = conteo.PlugShare || 0;
    }

    function renderTabla() {
        const nq = norm(buscador.value);
        const red = filtroRed.value;

        const lista = sitios.filter(s => {
            if (red !== 'todas' && s.red !== red) return false;
            if (nq && !norm(s.nombre).includes(nq)) return false;
            return true;
        });

        tbody.innerHTML = '';
        const frag = document.createDocumentFragment();

        lista.forEach((s, i) => {
            const tr = document.createElement('tr');

            const tdNum = document.createElement('td');
            tdNum.className = 'col-num';
            tdNum.textContent = i + 1;

            const tdNombre = document.createElement('td');
            tdNombre.textContent = s.nombre;

            const tdRed = document.createElement('td');
            tdRed.className = 'col-red';
            const badge = document.createElement('span');
            badge.className = 'badge-red ' + badgeClass(s.red);
            badge.textContent = s.red;
            tdRed.appendChild(badge);

            const tdCoords = document.createElement('td');
            tdCoords.className = 'cell-coords';
            tdCoords.textContent = `${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}`;

            const tdPin = document.createElement('td');
            tdPin.className = 'col-pin';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-pin';
            btn.title = 'Ver en el mapa';
            btn.innerHTML = '<i class="fa-solid fa-map-pin"></i><span>Pin</span>';
            btn.addEventListener('click', () => {
                const params = new URLSearchParams({
                    lat: s.lat,
                    lon: s.lon,
                    nombre: s.nombre
                });
                window.location.href = 'index.html?' + params.toString();
            });
            tdPin.appendChild(btn);

            tr.append(tdNum, tdNombre, tdRed, tdCoords, tdPin);
            frag.appendChild(tr);
        });

        tbody.appendChild(frag);
        contador.textContent = `${lista.length} de ${sitios.length} sitios`;

        if (lista.length === 0) {
            vacia.hidden = false;
            vacia.textContent = sitios.length ? 'Sin resultados para tu búsqueda.' : 'No se encontraron electrolineras.';
        } else {
            vacia.hidden = true;
        }
    }

    fetch('./all_chargers_geo.json')
        .then(res => {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(data => {
            sitios = (data.features || []).map(f => {
                const c = f.geometry.coordinates;
                const p = f.properties || {};
                return {
                    nombre: p.nombre || 'Estación de Carga',
                    red: p.red || 'PlugShare',
                    lon: c[0],
                    lat: c[1]
                };
            });
            sitios.sort((a, b) => {
                if (a.red !== b.red) return a.red.localeCompare(b.red);
                return a.nombre.localeCompare(b.nombre, 'es');
            });
            setKpis();
            renderTabla();
        })
        .catch(err => {
            console.error('Error cargando electrolineras:', err);
            vacia.hidden = false;
            vacia.textContent = 'No se pudo cargar all_chargers_geo.json.';
        });

    buscador.addEventListener('input', renderTabla);
    filtroRed.addEventListener('change', renderTabla);
});
