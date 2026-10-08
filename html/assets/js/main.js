/**
 * Main Application Script for Viabilidad Estaciones de Carga - CDMX
 * Leaflet map con viabilidad, predicciones 2030/2035, electrolineras agrupadas y graficas Chart.js.
 */

document.addEventListener('DOMContentLoaded', () => {
    // ---------- Mapa ----------
    const cdmxBounds = L.latLngBounds(
        L.latLng(18.80, -99.65), // Suroeste (alrededores sur/poniente)
        L.latLng(19.85, -98.65)  // Noreste (alrededores norte/oriente)
    );

    const map = L.map('map', {
        center: [19.38, -99.15],
        zoom: 11,
        minZoom: 10,
        maxZoom: 18,
        maxBounds: cdmxBounds,
        maxBoundsViscosity: 0.75
    });

    // El zoom va a la derecha para dejar libre la esquina superior izquierda (búsqueda)
    map.zoomControl.setPosition('topright');

    // Capa de Mapa: Esri World Light Gray (gratuita, limpia y sin API Key)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
        maxZoom: 16
    }).addTo(map);

    // ---------- Leyenda (cambia según lo que se colorea) ----------
    let legendDiv = null;
    function renderLegend(kind) {
        if (!legendDiv) return;
        const filas = {
            pb: [['#2ca25f', 'Payback ≤ 3 años'], ['#ffeda0', 'Payback de 3 a 6 años'],
                 ['#de2d26', 'Más de 6 años o no recupera']],
            prob: [['#2ca25f', 'Rentable en ≥ 80 % de los casos'], ['#ffeda0', 'Rentable en 50–80 %'],
                   ['#de2d26', 'Rentable en < 50 %'], ['#bdbdbd', 'No se construiría']],
            pct: [['#2ca25f', 'Alta (top 20 %)'], ['#ffeda0', 'Media (40–80 %)'],
                  ['#de2d26', 'Baja (40 % inferior)']]
        }[kind];
        legendDiv.innerHTML = filas.map(([c, t]) => `<div><i style="background:${c}"></i>${t}</div>`).join('');
    }
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
        legendDiv = L.DomUtil.create('div', 'legend');
        renderLegend('pct');
        return legendDiv;
    };
    legend.addTo(map);

    // ---------- Utilidades ----------
    // pct = percentil 0-1 (no el valor crudo)
    function getColor(pct) {
        if (pct > 0.8) return '#2ca25f';   // Verde (alta)
        if (pct > 0.4) return '#ffeda0';   // Amarillo (media)
        return '#de2d26';                  // Rojo (baja)
    }

    // Payback en años; null/undefined = la ganancia no cubre la inversión
    function colorPayback(v) {
        if (v === null || v === undefined) return '#de2d26';
        if (v <= 3) return '#2ca25f';
        if (v <= 6) return '#ffeda0';
        return '#de2d26';
    }
    // Probabilidad de ganancia neta > 0 (solo zonas que se construirían en el caso base)
    function colorProb(p) {
        if (!p || !p.viable_max) return '#bdbdbd';
        if (p.prob_rentable >= 0.8) return '#2ca25f';
        if (p.prob_rentable >= 0.5) return '#ffeda0';
        return '#de2d26';
    }

    // Degradado continuo de color (Rojo -> Amarillo -> Verde), para las gráficas
    function getColorGradient(val) {
        if (val === null || val === undefined || isNaN(val)) return '#cccccc';

        const stops = [
            { pos: 0.00, r: 222, g: 45, b: 38 },   // #de2d26 Rojo
            { pos: 0.35, r: 244, g: 162, b: 97 },   // #f4a261 Naranja
            { pos: 0.55, r: 255, g: 237, b: 160 },  // #ffeda0 Amarillo
            { pos: 0.75, r: 120, g: 198, b: 121 },  // #78c679 Verde claro
            { pos: 1.00, r: 44, g: 162, b: 95 }    // #2ca25f Verde
        ];

        let lower = stops[0];
        let upper = stops[stops.length - 1];

        for (let i = 0; i < stops.length - 1; i++) {
            if (val >= stops[i].pos && val <= stops[i + 1].pos) {
                lower = stops[i];
                upper = stops[i + 1];
                break;
            }
        }

        const range = upper.pos - lower.pos;
        const pct = range === 0 ? 0 : (val - lower.pos) / range;

        const r = Math.round(lower.r + pct * (upper.r - lower.r));
        const g = Math.round(lower.g + pct * (upper.g - lower.g));
        const b = Math.round(lower.b + pct * (upper.b - lower.b));

        return `rgb(${r}, ${g}, ${b})`;
    }

    // Calcula el percentil de `key` entre todos los polígonos y lo guarda en _pct
    function addPct(data, key) {
        const vals = data.features
            .map(f => f.properties[key] ?? 0)
            .sort((a, b) => a - b);
        const n = Math.max(vals.length - 1, 1);
        data.features.forEach(f => {
            const v = f.properties[key] ?? 0;
            let lo = 0, hi = vals.length;
            while (lo < hi) {
                const m = (lo + hi) >> 1;
                if (vals[m] < v) lo = m + 1; else hi = m;
            }
            f.properties._pct = lo / n;
        });
    }

    // Si la feature trae _fill (predicciones) se usa; si no, el percentil
    function style(feature) {
        return {
            fillColor: feature.properties._fill ?? getColor(feature.properties._pct ?? 0),
            weight: 1,
            opacity: 1,
            color: 'white',
            fillOpacity: 0.7
        };
    }

    // ---------- Estado de la interfaz ----------
    const btnIds = ['btn-original', 'btn-no-destinos', 'btn-2030', 'btn-2035'];
    const aviso = document.getElementById('aviso');
    const opciones = document.getElementById('opciones');

    function setActive(id) {
        btnIds.forEach(b => document.getElementById(b).classList.remove('active'));
        document.getElementById(id).classList.add('active');
    }

    // ---------- Electrolineras (clúster) ----------
    const teslaIcon = L.icon({
        iconUrl: 'assets/img/pin_tesla.svg',
        iconSize: [50, 50],
        iconAnchor: [25, 50],
        popupAnchor: [0, -45],
        className: 'custom-pin-icon'
    });

    const evergoIcon = L.icon({
        iconUrl: 'assets/img/pin_evergo.svg',
        iconSize: [50, 50],
        iconAnchor: [25, 50],
        popupAnchor: [0, -45],
        className: 'custom-pin-icon'
    });

    const plugshareIcon = L.icon({
        iconUrl: 'assets/img/pin_plugshare.svg',
        iconSize: [50, 50],
        iconAnchor: [25, 50],
        popupAnchor: [0, -45],
        className: 'custom-pin-icon'
    });

    // Pin para puntos creados desde la búsqueda (sin datos de predicción)
    const pinPersonalizadoIcon = L.icon({
        iconUrl: 'assets/img/pin_personalizado.svg',
        iconSize: [50, 50],
        iconAnchor: [25, 50],
        popupAnchor: [0, -45],
        className: 'custom-pin-icon'
    });

    // Marcador temporal del punto buscado
    const searchPointIcon = L.divIcon({
        className: 'search-point-icon',
        html: '<i class="fa-solid fa-crosshairs" style="color:#E6007E;font-size:28px;text-shadow:0 0 4px #fff, 0 0 2px #fff;"></i>',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });

    const chargersCluster = L.markerClusterGroup({
        chunkedLoading: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        maxClusterRadius: 45
    });

    // Datos de todos los pines (incluye los personalizados) para búsqueda y distancias
    const chargersData = [];

    function loadChargersData() {
        return fetch('./all_chargers_geo.json')
            .then(res => res.json())
            .then(data => {
                let teslaCount = 0;
                let evergoCount = 0;
                let plugshareCount = 0;

                data.features.forEach(feature => {
                    const coords = feature.geometry.coordinates;
                    const props = feature.properties || {};
                    const red = props.red || 'PlugShare';
                    const nombre = props.nombre || 'Estación de Carga';

                    let iconToUse = plugshareIcon;
                    if (red === 'Tesla') {
                        iconToUse = teslaIcon;
                        teslaCount++;
                    } else if (red === 'Evergo') {
                        iconToUse = evergoIcon;
                        evergoCount++;
                    } else {
                        plugshareCount++;
                    }

                    const popupHtml = `
                        <div class="popup-title">${nombre}</div>
                        <div><b>Red:</b> ${red}</div>
                    `;

                    const marker = L.marker([coords[1], coords[0]], { icon: iconToUse })
                        .bindPopup(popupHtml);

                    chargersCluster.addLayer(marker);
                    chargersData.push({
                        nombre: nombre,
                        red: red,
                        lat: coords[1],
                        lon: coords[0],
                        marker: marker,
                        custom: false
                    });
                });

                // Puntos personalizados guardados en el navegador (no cuentan en la gráfica)
                leerPuntosPersonalizados().forEach(punto => {
                    if (typeof punto.lat !== 'number' || typeof punto.lon !== 'number') return;
                    const marker = crearMarcadorPunto(punto);
                    chargersCluster.addLayer(marker);
                    chargersData.push({
                        nombre: punto.nombre || 'Punto buscado',
                        red: 'Personalizado',
                        lat: punto.lat,
                        lon: punto.lon,
                        marker: marker,
                        custom: true
                    });
                });

                map.addLayer(chargersCluster);
                renderChargersPieChart(teslaCount, evergoCount, plugshareCount);
            })
            .catch(err => {
                console.error('Error cargando electrolineras:', err);
            });
    }

    // Vuelve desde el dashboard de electrolineras: index.html?lat=..&lon=..&nombre=..
    function applyPinFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const lat = parseFloat(params.get('lat'));
        const lon = parseFloat(params.get('lon'));
        if (!isFinite(lat) || !isFinite(lon)) return;
        const nombre = params.get('nombre') || 'Electrolinera';

        // Busca el marcador exacto del clúster (mismo sitio)
        let encontrado = null;
        let mejor = Infinity;
        chargersData.forEach(c => {
            const d = haversine(lat, lon, c.lat, c.lon);
            if (d < mejor) { mejor = d; encontrado = c; }
        });

        const highlight = L.layerGroup().addTo(map);

        if (encontrado && mejor <= 30) {
            L.circle([encontrado.lat, encontrado.lon], {
                radius: 25,
                color: '#E6007E',
                weight: 3,
                opacity: 1,
                fillColor: '#E6007E',
                fillOpacity: 0.25,
                interactive: false,
                className: 'search-ring'
            }).addTo(highlight);
            chargersCluster.zoomToShowLayer(encontrado.marker, () => encontrado.marker.openPopup());
        } else {
            const marker = L.marker([lat, lon], { icon: searchPointIcon, zIndexOffset: 1000 })
                .bindPopup(`<div class="popup-title">${escapeHtml(nombre)}</div>
                    <div><b>Coordenadas:</b> ${lat.toFixed(5)}, ${lon.toFixed(5)}</div>`)
                .addTo(map);
            map.setView([lat, lon], 16);
            marker.openPopup();
        }

        // Limpia los params para no re-disparar al recargar
        history.replaceState(null, '', window.location.pathname);
    }

    // ---------- Búsqueda: dirección, coordenadas o electrolinera ----------
    const LS_KEY = 'electra_puntos_personalizados';
    const RADIO_DEFAULT = 300;
    const CDMX_VIEWBOX = [-99.65, 19.85, -98.65, 18.80]; // oeste, norte, este, sur

    function leerPuntosPersonalizados() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            console.warn('No se pudieron leer los puntos personalizados:', e);
            return [];
        }
    }

    function guardarPuntosPersonalizados(arr) {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(arr));
        } catch (e) {
            console.warn('No se pudieron guardar los puntos personalizados:', e);
        }
    }

    function crearMarcadorPunto(punto) {
        const marker = L.marker([punto.lat, punto.lon], { icon: pinPersonalizadoIcon });
        marker.bindPopup(`
            <div class="popup-title">${escapeHtml(punto.nombre || 'Punto buscado')}</div>
            <div><b>Red:</b> Personalizado</div>
            <div><b>Coordenadas:</b> ${punto.lat.toFixed(5)}, ${punto.lon.toFixed(5)}</div>
            <div class="popup-no">Punto creado desde la búsqueda. Sin datos de pesos ni predicción.</div>
        `);
        return marker;
    }

    function guardarPunto(punto) {
        const arr = leerPuntosPersonalizados();
        arr.push(punto);
        guardarPuntosPersonalizados(arr);
        const marker = crearMarcadorPunto(punto);
        chargersCluster.addLayer(marker);
        chargersData.push({
            nombre: punto.nombre,
            red: 'Personalizado',
            lat: punto.lat,
            lon: punto.lon,
            marker: marker,
            custom: true
        });
        return marker;
    }

    // Normaliza texto: minúsculas y sin acentos
    function norm(s) {
        return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    }

    function escapeHtml(s) {
        return (s === null || s === undefined ? '' : String(s))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function haversine(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const rad = d => d * Math.PI / 180;
        const dLat = rad(lat2 - lat1);
        const dLon = rad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(a));
    }

    function fmtDist(m) {
        return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km';
    }

    function debounce(fn, ms) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    // Acepta "lat, lon" o "lat lon" y corrige el orden si viene "lon, lat"
    function parseCoords(q) {
        const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
        if (!m) return null;
        let a = parseFloat(m[1]);
        let b = parseFloat(m[2]);
        if (Math.abs(a) > 90 && Math.abs(b) <= 90) { const t = a; a = b; b = t; }
        if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
        return { lat: a, lon: b };
    }

    function buscarPorNombre(q, limit) {
        limit = limit || 6;
        const nq = norm(q);
        if (nq.length < 2) return [];
        const tokens = nq.split(/\s+/).filter(Boolean);
        const scored = [];
        chargersData.forEach(c => {
            const n = norm(c.nombre);
            let score = -1;
            if (n === nq) score = 100;
            else if (n.startsWith(nq)) score = 80;
            else if (n.includes(nq)) score = 60;
            else if (tokens.length && tokens.every(t => n.includes(t))) score = 40;
            if (score > 0) scored.push({ c: c, score: score });
        });
        scored.sort((x, y) => y.score - x.score);
        return scored.slice(0, limit).map(s => s.c);
    }

    function pinesCercanos(lat, lon, radio) {
        return chargersData
            .map(c => ({
                nombre: c.nombre,
                red: c.red,
                lat: c.lat,
                lon: c.lon,
                marker: c.marker,
                custom: c.custom,
                dist: haversine(lat, lon, c.lat, c.lon)
            }))
            .filter(c => c.dist <= radio)
            .sort((a, b) => a.dist - b.dist);
    }

    function initSearch() {
        let input, btn, suggestions, statusEl, radiusSelect;
        let searchMarker = null;
        let highlightLayer = null;
        let geoCtl = null;

        function setStatus(msg, cls) {
            if (!statusEl) return;
            statusEl.textContent = msg || '';
            statusEl.className = 'map-search__status' +
                (msg ? ' show' : '') + (cls ? ' ' + cls : '');
        }

        function ocultarSugerencias() {
            if (suggestions) {
                suggestions.innerHTML = '';
                suggestions.classList.remove('show');
            }
        }

        function limpiarResaltado() {
            if (highlightLayer) { map.removeLayer(highlightLayer); highlightLayer = null; }
            if (searchMarker) { map.removeLayer(searchMarker); searchMarker = null; }
        }

        function renderSugerencias(items) {
            suggestions.innerHTML = '';
            if (!items.length) {
                const li = document.createElement('li');
                li.className = 'map-search__empty';
                li.textContent = 'Sin sugerencias.';
                suggestions.appendChild(li);
                suggestions.classList.add('show');
                return;
            }
            items.forEach(it => {
                const li = document.createElement('li');
                li.className = 'map-search__item';
                const sub = it.sub ? `<span class="map-search__sub">${escapeHtml(it.sub)}</span>` : '';
                const dist = (typeof it.dist === 'number') ? `<span class="map-search__dist">${fmtDist(it.dist)}</span>` : '';
                li.innerHTML = `<i class="fa-solid ${it.icon || 'fa-location-dot'}"></i><span>${escapeHtml(it.label)}${sub}</span>${dist}`;
                li.addEventListener('click', () => {
                    ocultarSugerencias();
                    if (it.type === 'address') {
                        input.value = it.query;
                        buscarDireccion(it.query);
                    } else {
                        input.value = it.label;
                        ejecutarBusqueda(it.lat, it.lon, it.label, it.type);
                    }
                });
                suggestions.appendChild(li);
            });
            suggestions.classList.add('show');
        }

        function dibujarRadio(lat, lon, radio) {
            L.circle([lat, lon], {
                radius: radio,
                color: '#8C1D40',
                weight: 1.5,
                dashArray: '5,6',
                fillColor: '#8C1D40',
                fillOpacity: 0.06,
                interactive: false
            }).addTo(highlightLayer);
        }

        function mostrarCercanos(cerca, radio) {
            suggestions.innerHTML = '';
            cerca.forEach(c => {
                const li = document.createElement('li');
                li.className = 'map-search__item';
                li.innerHTML = `<i class="fa-solid fa-location-dot"></i>
                    <span>${escapeHtml(c.nombre)}<span class="map-search__sub">${escapeHtml(c.red)}</span></span>
                    <span class="map-search__dist">${fmtDist(c.dist)}</span>`;
                li.addEventListener('click', () => {
                    chargersCluster.zoomToShowLayer(c.marker, () => c.marker.openPopup());
                });
                suggestions.appendChild(li);
            });
            suggestions.classList.add('show');
        }

        function ejecutarBusqueda(lat, lon, etiqueta, origen) {
            limpiarResaltado();
            highlightLayer = L.layerGroup().addTo(map);
            const radio = parseInt(radiusSelect.value, 10) || RADIO_DEFAULT;

            searchMarker = L.marker([lat, lon], { icon: searchPointIcon, zIndexOffset: 1000 })
                .bindPopup(`<div class="popup-title">${escapeHtml(etiqueta || 'Punto buscado')}</div>
                    <div><b>Coordenadas:</b> ${lat.toFixed(5)}, ${lon.toFixed(5)}</div>`)
                .addTo(map);

            if (cdmxBounds.contains(L.latLng(lat, lon))) {
                map.flyTo([lat, lon], Math.max(map.getZoom(), 15), { duration: 0.6 });
            } else {
                map.setView([lat, lon], 15);
            }

            dibujarRadio(lat, lon, radio);

            const cerca = pinesCercanos(lat, lon, radio);

            if (cerca.length > 0) {
                cerca.forEach(c => {
                    L.circle([c.lat, c.lon], {
                        radius: 25,
                        color: '#E6007E',
                        weight: 3,
                        opacity: 1,
                        fillColor: '#E6007E',
                        fillOpacity: 0.25,
                        interactive: false,
                        className: 'search-ring'
                    }).addTo(highlightLayer);
                });
                chargersCluster.zoomToShowLayer(cerca[0].marker, () => cerca[0].marker.openPopup());
                mostrarCercanos(cerca, radio);
                setStatus(`${cerca.length} pin(es) dentro de ${fmtDist(radio)}.`, 'is-ok');
            } else {
                const punto = {
                    nombre: (etiqueta || `Punto ${lat.toFixed(4)}, ${lon.toFixed(4)}`).slice(0, 120),
                    red: 'Personalizado',
                    custom: true,
                    lat: lat,
                    lon: lon,
                    origen: origen || 'desconocido',
                    fecha: new Date().toISOString()
                };
                guardarPunto(punto);
                setStatus(`Sin pines en ${fmtDist(radio)} — se agregó un punto personalizado.`, 'is-warn');
            }
        }

        async function geocodificar(q) {
            if (geoCtl) geoCtl.abort();
            geoCtl = new AbortController();
            const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5'
                + '&countrycodes=mx&accept-language=es'
                + '&viewbox=' + CDMX_VIEWBOX.join(',') + '&bounded=1'
                + '&q=' + encodeURIComponent(q);
            const res = await fetch(url, { signal: geoCtl.signal, headers: { 'Accept': 'application/json' } });
            if (!res.ok) throw new Error('Nominatim HTTP ' + res.status);
            return res.json();
        }

        async function buscarDireccion(q) {
            setStatus('Buscando dirección…', '');
            try {
                const resultados = await geocodificar(q);
                if (!resultados.length) {
                    ocultarSugerencias();
                    setStatus('No se encontró esa dirección.', 'is-warn');
                    return;
                }
                if (resultados.length === 1) {
                    const r = resultados[0];
                    ejecutarBusqueda(parseFloat(r.lat), parseFloat(r.lon), r.display_name || q, 'texto');
                    return;
                }
                renderSugerencias(resultados.map(r => ({
                    type: 'texto',
                    icon: 'fa-location-dot',
                    label: r.display_name,
                    lat: parseFloat(r.lat),
                    lon: parseFloat(r.lon)
                })));
                setStatus(resultados.length + ' resultados.', '');
            } catch (e) {
                if (e.name === 'AbortError') return;
                console.error('Geocodificación:', e);
                ocultarSugerencias();
                setStatus('No se pudo consultar el geocodificador (¿sin internet?). Usa coordenadas o nombres de electrolineras.', 'is-error');
            }
        }

        function onInput() {
            const q = input.value.trim();
            if (!q) { ocultarSugerencias(); setStatus('', ''); return; }

            const coords = parseCoords(q);
            if (coords) {
                renderSugerencias([{
                    type: 'coords',
                    icon: 'fa-crosshairs',
                    label: `Ir a ${coords.lat}, ${coords.lon}`,
                    lat: coords.lat,
                    lon: coords.lon
                }]);
                return;
            }

            const items = buscarPorNombre(q).map(c => ({
                type: 'electrolinera',
                icon: 'fa-charging-station',
                label: c.nombre,
                sub: 'Electrolinera · ' + c.red,
                lat: c.lat,
                lon: c.lon
            }));
            items.push({
                type: 'address',
                icon: 'fa-map-location-dot',
                label: `Buscar dirección: "${q}"`,
                query: q
            });
            renderSugerencias(items);
        }

        function onSubmit() {
            const q = input.value.trim();
            if (!q) return;
            const coords = parseCoords(q);
            if (coords) {
                ejecutarBusqueda(coords.lat, coords.lon, `Coordenadas ${coords.lat}, ${coords.lon}`, 'coords');
                ocultarSugerencias();
                return;
            }
            const nombres = buscarPorNombre(q, 1);
            if (nombres.length) {
                ejecutarBusqueda(nombres[0].lat, nombres[0].lon, nombres[0].nombre, 'electrolinera');
                ocultarSugerencias();
                return;
            }
            buscarDireccion(q);
        }

        const control = L.control({ position: 'topleft' });
        control.onAdd = function () {
            const cont = L.DomUtil.create('div', 'map-search');
            cont.innerHTML = `
                <div class="map-search__form">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text" class="map-search__input" autocomplete="off" spellcheck="false"
                        placeholder="Dirección, coordenadas o electrolinera…">
                    <button type="button" class="map-search__btn" title="Buscar">
                        <i class="fa-solid fa-arrow-right"></i>
                    </button>
                </div>
                <div class="map-search__radius">
                    <label>Radio de cercanía
                        <select class="map-search__radius-select">
                            <option value="100">100 m</option>
                            <option value="300" selected>300 m</option>
                            <option value="500">500 m</option>
                            <option value="1000">1 km</option>
                        </select>
                    </label>
                </div>
                <div class="map-search__status" role="status"></div>
                <ul class="map-search__suggestions"></ul>
            `;

            input = cont.querySelector('.map-search__input');
            btn = cont.querySelector('.map-search__btn');
            suggestions = cont.querySelector('.map-search__suggestions');
            statusEl = cont.querySelector('.map-search__status');
            radiusSelect = cont.querySelector('.map-search__radius-select');

            L.DomEvent.disableClickPropagation(cont);
            L.DomEvent.disableScrollPropagation(cont);
            L.DomEvent.on(input, 'keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); onSubmit(); }
                else if (e.key === 'Escape') { ocultarSugerencias(); }
            });
            L.DomEvent.on(btn, 'click', e => { L.DomEvent.stop(e); onSubmit(); });
            L.DomEvent.on(input, 'input', debounce(onInput, 250));
            return cont;
        };
        control.addTo(map);
    }

    // ---------- Gráficas (Chart.js) ----------
    let alcaldiaChart = null;
    let chargersPieChart = null;
    let componentsChart = null;

    function updateChartsData(features) {
        if (!document.getElementById('chart-alcaldia')) return;

        const alcaldiaStats = {};

        features.forEach(f => {
            const props = f.properties;
            const mun = props.NOM_MUN || 'Desconocida';
            const v = props.viabilidad || 0;
            const r = props.riqueza_norm || 0;
            const d = props.destinos_norm || 0;
            const c = props.competencia_norm || 0;

            if (!alcaldiaStats[mun]) {
                alcaldiaStats[mun] = {
                    count: 0,
                    sumViabilidad: 0,
                    sumRiqueza: 0,
                    sumDestinos: 0,
                    sumCompetencia: 0
                };
            }

            alcaldiaStats[mun].count++;
            alcaldiaStats[mun].sumViabilidad += v;
            alcaldiaStats[mun].sumRiqueza += r;
            alcaldiaStats[mun].sumDestinos += d;
            alcaldiaStats[mun].sumCompetencia += c;
        });

        const list = Object.keys(alcaldiaStats).map(name => {
            const st = alcaldiaStats[name];
            return {
                name: name,
                avgViabilidad: st.sumViabilidad / st.count,
                avgRiqueza: st.sumRiqueza / st.count,
                avgDestinos: st.sumDestinos / st.count,
                avgCompetencia: st.sumCompetencia / st.count
            };
        });

        list.sort((a, b) => b.avgViabilidad - a.avgViabilidad);

        renderAlcaldiaBarChart(list);
        renderComponentsChart(list.slice(0, 8));
    }

    function renderAlcaldiaBarChart(list) {
        const labels = list.map(a => a.name);
        const data = list.map(a => +(a.avgViabilidad.toFixed(4)));

        const ctx = document.getElementById('chart-alcaldia').getContext('2d');

        if (alcaldiaChart) alcaldiaChart.destroy();

        alcaldiaChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Viabilidad Promedio',
                    data: data,
                    backgroundColor: data.map(val => getColorGradient(val)),
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, max: 1.0 },
                    x: { ticks: { font: { size: 10 } } }
                }
            }
        });
    }

    function renderChargersPieChart(tesla, evergo, plugshare) {
        if (!document.getElementById('chart-chargers')) return;

        const ctx = document.getElementById('chart-chargers').getContext('2d');

        if (chargersPieChart) chargersPieChart.destroy();

        chargersPieChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Tesla', 'Evergo', 'PlugShare'],
                datasets: [{
                    data: [tesla, evergo, plugshare],
                    backgroundColor: ['#E5484D', '#2FBF71', '#D4A537']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    function renderComponentsChart(topAlcaldias) {
        const labels = topAlcaldias.map(a => a.name);
        const riqueza = topAlcaldias.map(a => +(a.avgRiqueza.toFixed(3)));
        const destinos = topAlcaldias.map(a => +(a.avgDestinos.toFixed(3)));
        const competencia = topAlcaldias.map(a => +(a.avgCompetencia.toFixed(3)));

        const ctx = document.getElementById('chart-components').getContext('2d');

        if (componentsChart) componentsChart.destroy();

        componentsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Poder Adquisitivo', data: riqueza, backgroundColor: '#8C1D40' },
                    { label: 'Destinos', data: destinos, backgroundColor: '#2FBF71' },
                    { label: 'Competencia', data: competencia, backgroundColor: '#E5484D' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    // ---------- Mapas de viabilidad (originales) ----------
    let isSinDestinosMap = false;
    let currentLayer = null;
    let predAño = null;          // año de la predicción activa (null = mapa original)
    let reqId = 0;               // descarta respuestas viejas si el usuario hace clic rápido

    function onEachFeature(feature, layer) {
        if (feature.properties) {
            const props = feature.properties;
            const alcaldia = props.NOM_MUN || 'Desconocida';
            const viviendasAuto = (props.VPH_AUTOM !== null && props.VPH_AUTOM !== undefined)
                ? props.VPH_AUTOM : 'N/D';
            const viabilidad = (props.viabilidad !== null && props.viabilidad !== undefined)
                ? props.viabilidad.toFixed(4) : 'N/D';
            const pct = (props._pct !== undefined)
                ? Math.round(props._pct * 100) : 'N/D';

            let popupContent = `
                <div class="popup-title">Alcaldía: ${alcaldia}</div>
                <div><b>Viviendas con auto:</b> ${viviendasAuto}</div>
            `;

            if (!isSinDestinosMap) {
                const destinos = (props.destinos_raw !== null && props.destinos_raw !== undefined)
                    ? props.destinos_raw : 'N/D';
                popupContent += `<div><b>Destinos contados:</b> ${destinos}</div>`;
            }

            popupContent += `<div><b>Puntaje de viabilidad:</b> ${viabilidad}</div>`;
            popupContent += `<div><b>Percentil:</b> ${pct}</div>`;

            layer.bindPopup(popupContent);
        }
    }

    function loadMapData(filename) {
        if (currentLayer) {
            map.removeLayer(currentLayer);
        }
        if (window.ZonePanel) window.ZonePanel.close();
        const id = ++reqId;
        fetch(filename)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Error al cargar el archivo GeoJSON');
                }
                return response.json();
            })
            .then(data => {
                if (id !== reqId) return;
                addPct(data, 'viabilidad');
                currentLayer = L.geoJSON(data, {
                    style: style,
                    onEachFeature: onEachFeature
                }).addTo(map);
                updateChartsData(data.features);
            })
            .catch(error => {
                console.error('Hubo un problema con la petición Fetch:', error);
            });
    }

    // ---------- Predicciones 2030 / 2035 (modelo) ----------
    // Un archivo por escenario. "media" es el predicciones.json de siempre;
    // baja/alta son predicciones_baja.json / predicciones_alta.json (los copia export.py).
    const PRED_CACHE = {};
    function getPred(esc) {
        if (!PRED_CACHE[esc]) {
            const url = esc === 'media' ? './predicciones.json' : `./predicciones_${esc}.json`;
            PRED_CACHE[esc] = fetch(url)
                .then(r => {
                    if (!r.ok) throw new Error('No se encontró ' + url);
                    return r.json();
                })
                .catch(e => {
                    console.error(e);
                    delete PRED_CACHE[esc];      // permite reintentar
                    return null;
                });
        }
        return PRED_CACHE[esc];
    }

    let GEO_PROMISE = null;
    const getGeo = () => GEO_PROMISE ??= fetch('./viabilidad_cdmx_v2.geojson')
        .then(r => {
            if (!r.ok) throw new Error('Error al cargar el GeoJSON');
            return r.json();
        });

    const mxn = n => (n === null || n === undefined) ? 'N/D'
        : (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-MX');
    // payback null = la ganancia operativa no es positiva
    const años = v => (v === null || v === undefined) ? 'No recupera' : v.toFixed(1) + ' años';

    function popupPrediccion(p, año) {
        const prob = (p.prob_rentable !== null && p.prob_rentable !== undefined)
            ? (p.prob_rentable * 100).toFixed(0) + ' %' : 'N/D';
        const probPct = (p.prob_rentable !== null && p.prob_rentable !== undefined)
            ? Math.max(0, Math.min(100, p.prob_rentable * 100)) : 0;
        const obra = p.viable_max
            ? `<div class="popup-sec">Cargadores a construir</div><div>${p.n_cargadores_max} (nuevos netos: ${p.nuevos_max ?? 'N/D'})</div>`
            : `<div class="popup-no">Con el caso base no conviene construir aquí.</div>`;

        // Barra de rango P10–P90 de la ganancia (con marca en 0 si aplica)
        let rango = '';
        if (p.ganancia_min !== null && p.ganancia_max !== null &&
            p.ganancia_min !== undefined && p.ganancia_max !== undefined) {
            const lo = Math.min(0, p.ganancia_min);
            const hi = Math.max(0, p.ganancia_max);
            const span = (hi - lo) || 1;
            const left = ((p.ganancia_min - lo) / span) * 100;
            const width = Math.max(((p.ganancia_max - p.ganancia_min) / span) * 100, 0.5);
            const zero = ((0 - lo) / span) * 100;
            rango = `
                <div class="range-bar" title="Rango P10–P90 de la ganancia">
                    <span class="range-bar__fill" style="left:${left}%;width:${width}%"></span>
                    <span class="range-bar__zero" style="left:${zero}%"></span>
                </div>
                <div class="range-legend"><span>${mxn(p.ganancia_min)}</span><span>P50 ${mxn(p.ganancia_p50)}</span><span>${mxn(p.ganancia_max)}</span></div>`;
        }

        const co2 = (p.co2_evitado !== null && p.co2_evitado !== undefined)
            ? (p.co2_evitado / 1000).toFixed(1) + ' t/año' : 'N/D';

        return `
            <div class="popup-title">${p.alcaldia} — ${año} (adopción ${p.escenario ?? ''})</div>
            <div><b>Probabilidad de ser rentable:</b> ${prob}</div>
            <div class="prob-bar"><span style="width:${probPct}%"></span></div>
            <div><b>Ganancia mediana:</b> ${mxn(p.ganancia_p50)}</div>
            ${rango}
            <div class="popup-kpis">
                <span class="popup-chip"><b>Inversión:</b> ${mxn(p.capex_total)}</span>
                <span class="popup-chip"><b>CO₂:</b> ${co2}</span>
                <span class="popup-chip"><b>Empleos:</b> ${p.empleo_est ?? 'N/D'}</span>
            </div>
            <div><b>Percentil de viabilidad:</b> ${(p.score_viabilidad * 100).toFixed(0)}</div>
            ${obra}
            <div class="popup-sec">Payback (capex base)</div>
            <div>Optimista: ${años(p.payback_max)} · Pesimista: ${años(p.payback_min)}</div>
            <div class="popup-hint"><i class="fa-solid fa-chart-simple"></i> Clic en la zona para ver el análisis</div>
        `;
    }

    
    // ---------- Sincronización con la Línea de Tiempo ----------
    const sliderTiempo = document.getElementById('slider-tiempo');
    const labelTiempo = document.getElementById('linea_tiempo_label');

    function sincronizarTimeline(año) {
        if (sliderTiempo && parseInt(sliderTiempo.value) !== año) {
            sliderTiempo.value = año;
        }
        if (labelTiempo) {
            labelTiempo.textContent = año;
        }
    }

    async function loadPrediction(año) {
        predAño = año;
        sincronizarTimeline(año);
        if (año === 2030) setActive('btn-2030');
        else if (año === 2035) setActive('btn-2035');
        else if (año === 2026) setActive('btn-original');
        else {
            btnIds.forEach(b => {
                const el = document.getElementById(b);
                if (el) el.classList.remove('active');
            });
        }
        const id = ++reqId;
        aviso.textContent = '';
        opciones.classList.remove('off');
        if (currentLayer) {
            map.removeLayer(currentLayer);
            currentLayer = null;
        }

        const esc = document.getElementById('sel-escenario').value;
        const metrica = document.getElementById('sel-metrica').value;

        try {
            const [PRED, geo] = await Promise.all([getPred(esc), getGeo()]);
            if (id !== reqId) return;     // el usuario ya pidió otra cosa

            if (!PRED) {
                aviso.textContent = `No se pudo cargar el escenario "${esc}". ` +
                    `Revisa que exista su archivo de predicciones en esta carpeta (lo copia export.py).`;
                return;
            }

            // Índice rápido: CVEGEO -> predicción de ese año
            const porZona = {};
            PRED.filter(r => r['año'] === año).forEach(r => { porZona[r.zona] = r; });

            // Geo para las comparaciones de equidad en el panel de zona
            if (window.ZonePanel) window.ZonePanel.setGeo(geo.features);

            geo.features.forEach(f => {
                const p = porZona[f.properties.CVEGEO];
                if (metrica === 'score') {
                    // score_viabilidad ya es un percentil (0-1) calculado en export.py
                    f.properties._pct = p ? p.score_viabilidad : 0;
                    f.properties._fill = undefined;
                } else if (metrica === 'prob') {
                    f.properties._fill = colorProb(p);
                } else {
                    f.properties._fill = p ? colorPayback(p[metrica]) : '#de2d26';
                }
            });
            renderLegend(metrica === 'score' ? 'pct' : metrica === 'prob' ? 'prob' : 'pb');

            currentLayer = L.geoJSON(geo, {
                style: style,
                onEachFeature: (f, layer) => {
                    const p = porZona[f.properties.CVEGEO];
                    if (!p) return;
                    layer.bindPopup(popupPrediccion(p, año));
                    layer.on('click', () => {
                        const rows = PRED.filter(r => r.zona === f.properties.CVEGEO);
                        if (window.ZonePanel) window.ZonePanel.open({ rows, year: año, props: f.properties });
                        if (window.StationPanel) window.StationPanel.open('charts');
                    });
                }
            }).addTo(map);

            // Gráficas temáticas agregadas (CO₂ y equidad de cobertura)
            if (window.ELECTRA_AGG) window.ELECTRA_AGG.render(PRED);
        } catch (e) {
            console.error('Error al cargar la predicción:', e);
            aviso.textContent = 'Error al cargar la predicción. Revisa la consola.';
        }
    }

    // Al volver a un mapa original: quita los colores de predicción y restaura la leyenda
    function modoOriginal() {
        predAño = null;
        aviso.textContent = '';
        opciones.classList.add('off');
        renderLegend('pct');
        if (window.ZonePanel) window.ZonePanel.close();
    }

    // ---------- Arranque ----------
    loadMapData('./viabilidad_cdmx_v2.geojson');
    loadChargersData().then(applyPinFromUrl);
    initSearch();

    // Gráficas temáticas con el escenario por defecto (aunque no se abra la predicción)
    getPred('media').then(PRED => {
        if (PRED && window.ELECTRA_AGG) window.ELECTRA_AGG.render(PRED);
    });

    // ---------- Botones (solo en index.html) ----------
    if (document.getElementById('btn-original')) {
        document.getElementById('btn-original').addEventListener('click', function () {
            setActive('btn-original');
            sincronizarTimeline(2026);
            modoOriginal();
            isSinDestinosMap = false;
            loadMapData('./viabilidad_cdmx_v2.geojson');
        });

        if (document.getElementById('btn-no-destinos')) {
            document.getElementById('btn-no-destinos').addEventListener('click', function () {
                setActive('btn-no-destinos');
                sincronizarTimeline(2026);
                modoOriginal();
                isSinDestinosMap = true;
                loadMapData('./viabilidad_cdmx_v2_no_destinos.geojson');
            });
        }

        // Listener de la Línea de Tiempo (slider 2026 a 2035)
        if (sliderTiempo) {
            const containerTiempo = document.querySelector('.linea_tiempo');
            if (containerTiempo && window.L) {
                L.DomEvent.disableClickPropagation(containerTiempo);
                L.DomEvent.disableScrollPropagation(containerTiempo);
            }

            sliderTiempo.addEventListener('input', function (e) {
                const año = parseInt(e.target.value);
                if (labelTiempo) labelTiempo.textContent = año;
                loadPrediction(año);
            });
        }

        document.getElementById('btn-2030').addEventListener('click', function () {
            setActive('btn-2030');
            loadPrediction(2030);
        });

        document.getElementById('btn-2035').addEventListener('click', function () {
            setActive('btn-2035');
            loadPrediction(2035);
        });

        // Cambiar escenario o métrica reaplica la predicción activa
        ['sel-escenario', 'sel-metrica'].forEach(id =>
            document.getElementById(id).addEventListener('change', () => {
                if (predAño) loadPrediction(predAño);
            }));
    }
});
