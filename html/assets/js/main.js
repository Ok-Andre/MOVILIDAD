/**
 * Main Application Script for Viabilidad Estaciones de Carga - CDMX
 * Leaflet Map with CARTO Positron clean tiles, custom EV charger SVGs, CDMX bounds, and Chart.js.
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Coordenadas y Límites Geográficos (CDMX y alrededores metropolitanos)
    // Permite ver todos los alrededores de la CDMX pero restringe alejarse más allá del área metropolitana
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

    // Capa de Mapa: Esri World Light Gray (Completamente gratuita, limpia y sin requerir API Key)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
        maxZoom: 16
    }).addTo(map);

    // 3. Iconos SVG personalizados para las electrolineras
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

    // 4. Degradado continuo de color (Rojo -> Amarillo -> Verde)
    function getColorGradient(val) {
        if (val === null || val === undefined || isNaN(val)) return '#cccccc';

        // Escala: 0.0 (Rojo) -> 0.35 (Naranja) -> 0.55 (Amarillo) -> 0.75 (Verde claro) -> 1.0 (Verde)
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

    function style(feature) {
        return {
            fillColor: getColorGradient(feature.properties.viabilidad),
            weight: 1,
            opacity: 1,
            color: 'white',
            fillOpacity: 0.7
        };
    }

    let currentLayer = null;
    let isSinDestinosMap = false;

    // Instancias de Gráficas Chart.js
    let alcaldiaChart = null;
    let chargersPieChart = null;
    let componentsChart = null;

    function onEachFeature(feature, layer) {
        if (feature.properties) {
            const props = feature.properties;
            const alcaldia = props.NOM_MUN || 'Desconocida';
            const viviendasAuto = props.VPH_AUTOM !== null ? props.VPH_AUTOM : 'N/D';
            const viabilidad = (props.viabilidad !== null && props.viabilidad !== undefined)
                ? props.viabilidad.toFixed(4) : 'N/D';

            let popupContent = `
                <div class="popup-title">Alcaldía: ${alcaldia}</div>
                <div><b>Viviendas con auto:</b> ${viviendasAuto}</div>
            `;

            if (!isSinDestinosMap) {
                const destinos = props.destinos_raw !== null ? props.destinos_raw : 'N/D';
                popupContent += `<div><b>Destinos contados:</b> ${destinos}</div>`;
            }

            popupContent += `<div><b>Puntaje de viabilidad:</b> ${viabilidad}</div>`;

            layer.bindPopup(popupContent);
        }
    }

    // Cargar capa GeoJSON de viabilidad
    function loadMapData(filename) {
        if (currentLayer) {
            map.removeLayer(currentLayer);
        }
        fetch(filename)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Error al cargar el archivo GeoJSON');
                }
                return response.json();
            })
            .then(data => {
                currentLayer = L.geoJSON(data, {
                    style: style,
                    onEachFeature: onEachFeature
                }).addTo(map);

                // Actualizar gráficas con datos cargados
                updateChartsData(data.features);
            })
            .catch(error => {
                console.error('Hubo un problema con la petición Fetch:', error);
            });
    }

    // 5. Grupo de Agrupamiento (Marker Clustering) para Electrolineras
    const chargersCluster = L.markerClusterGroup({
        chunkedLoading: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        maxClusterRadius: 45
    });

    // Cargar cargadores (Tesla, Evergo, PlugShare)
    function loadChargersData() {
        fetch('./all_chargers_geo.json')
            .then(res => res.json())
            .then(data => {
                let teslaCount = 0;
                let evergoCount = 0;
                let plugshareCount = 0;

                data.features.forEach(feature => {
                    const coords = feature.geometry.coordinates;
                    const lat = coords[1];
                    const lng = coords[0];
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

                    const marker = L.marker([lat, lng], { icon: iconToUse })
                        .bindPopup(popupHtml);

                    chargersCluster.addLayer(marker);
                });

                map.addLayer(chargersCluster);

                renderChargersPieChart(teslaCount, evergoCount, plugshareCount);
            })
            .catch(err => {
                console.error('Error cargando electrolineras:', err);
            });
    }

    // Leyenda flotante en el mapa
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'map-legend');
        div.innerHTML = `
            <div class="legend-title">Viabilidad</div>
            <div class="gradient-bar"></div>
            <div class="gradient-labels">
                <span>0.0 (Baja)</span>
                <span>0.5</span>
                <span>1.0 (Alta)</span>
            </div>
        `;
        return div;
    };
    legend.addTo(map);

    // Lógica de actualización de gráficas
    function updateChartsData(features) {
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
        const ctx = document.getElementById('chart-chargers').getContext('2d');

        if (chargersPieChart) chargersPieChart.destroy();

        chargersPieChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Tesla', 'Evergo', 'PlugShare'],
                datasets: [{
                    data: [tesla, evergo, plugshare],
                    backgroundColor: ['#e82127', '#00a859', '#f59e0b']
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
                    { label: 'Poder Adquisitivo', data: riqueza, backgroundColor: '#007bff' },
                    { label: 'Destinos', data: destinos, backgroundColor: '#28a745' },
                    { label: 'Competencia', data: competencia, backgroundColor: '#dc3545' }
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

    // Cargar datos iniciales
    loadMapData('./viabilidad_cdmx_v2.geojson');
    loadChargersData();

    // Lógica de los botones
    document.getElementById('btn-original').addEventListener('click', function () {
        document.getElementById('btn-original').classList.add('active');
        document.getElementById('btn-no-destinos').classList.remove('active');
        isSinDestinosMap = false;
        loadMapData('./viabilidad_cdmx_v2.geojson');
    });

    document.getElementById('btn-no-destinos').addEventListener('click', function () {
        document.getElementById('btn-no-destinos').classList.add('active');
        document.getElementById('btn-original').classList.remove('active');
        isSinDestinosMap = true;
        loadMapData('./viabilidad_cdmx_v2_no_destinos.geojson');
    });
});
