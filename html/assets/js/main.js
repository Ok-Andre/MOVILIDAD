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
    const simButton = document.getElementById('btn-simular');
    const clearSimButton = document.getElementById('btn-limpiar-simulacion');
    const simChargersInput = document.getElementById('sim-cargadores');

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

    const chargersCluster = L.markerClusterGroup({
        chunkedLoading: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        maxClusterRadius: 45
    });

    let CHARGERS_PROMISE = null;
    function getChargersGeo() {
        return CHARGERS_PROMISE ??= fetch('./all_chargers_geo.json')
            .then(res => {
                if (!res.ok) throw new Error('Error al cargar las electrolineras');
                return res.json();
            });
    }

    function loadChargersData() {
        getChargersGeo()
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
                });

                map.addLayer(chargersCluster);
                renderChargersPieChart(teslaCount, evergoCount, plugshareCount);
            })
            .catch(err => {
                console.error('Error cargando electrolineras:', err);
            });
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

    let MODEL_ZONES_PROMISE = null;
    const getModelZones = () => MODEL_ZONES_PROMISE ??= Promise.all([getGeo(), getChargersGeo()])
        .then(([geo, chargers]) => ElectraModelo.prepararZonas(geo, chargers));

    const mxn = n => (n === null || n === undefined) ? 'N/D'
        : (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-MX');
    // payback null = la ganancia operativa no es positiva
    const años = v => (v === null || v === undefined) ? 'No recupera' : v.toFixed(1) + ' años';

    let placingSimulation = false;
    let simulationMarker = null;
    let simulationZone = null;
    let simulationChargers = 1;

    function setPlacementMode(active) {
        placingSimulation = active;
        if (simButton) {
            simButton.classList.toggle('active', active);
            simButton.setAttribute('aria-pressed', String(active));
        }
        map.getContainer().style.cursor = active ? 'crosshair' : '';
        if (aviso) aviso.textContent = active ? 'Haz clic dentro de una zona para probar la ubicación.' : '';
    }

    function simulationPopup() {
        const esc = document.getElementById('sel-escenario').value;
        const estacion = ElectraModelo.estacion(
            simulationZone, predAño, esc, simulationChargers, simulationChargers
        );
        const restante = ElectraModelo.zonaPrediccion(simulationZone, predAño, esc, {
            extraComp: simulationChargers * ElectraModelo.PESO.Propia
        });
        const prob = (estacion.prob_rentable * 100).toFixed(0) + ' %';
        const probRestante = (restante.prob_rentable * 100).toFixed(0) + ' %';
        return `
            <div class="popup-title">Prueba de ubicación — ${simulationZone.alcaldia} (${predAño})</div>
            <div><b>Tu estación:</b> ${simulationChargers} cargador(es)</div>
            <div><b>Ganancia anual P10–P90:</b> ${mxn(estacion.ganancia_min)} a ${mxn(estacion.ganancia_max)}</div>
            <div><b>Ganancia neta mediana:</b> ${mxn(estacion.neta_p50)}</div>
            <div><b>Probabilidad de rentabilidad:</b> ${prob}</div>
            <div><b>Payback optimista:</b> ${años(estacion.payback_max)}</div>
            <div class="popup-sec">Oportunidad restante en la zona</div>
            <div><b>Cargadores recomendados adicionales:</b> ${restante.nBase}</div>
            <div><b>Probabilidad de rentabilidad restante:</b> ${probRestante}</div>
        `;
    }

    function refreshSimulationPopup() {
        if (!simulationMarker || !simulationZone || !predAño) return;
        simulationMarker.setPopupContent(simulationPopup());
    }

    function clearSimulation() {
        setPlacementMode(false);
        if (simulationMarker) map.removeLayer(simulationMarker);
        simulationMarker = null;
        simulationZone = null;
        if (clearSimButton) clearSimButton.disabled = true;
    }

    async function placeSimulation(event) {
        if (!placingSimulation) return;
        setPlacementMode(false);
        simulationChargers = Number.parseInt(simChargersInput.value, 10);
        if (!Number.isInteger(simulationChargers) || simulationChargers < 1 || simulationChargers > 20) {
            if (aviso) aviso.textContent = 'El número de cargadores debe estar entre 1 y 20.';
            return;
        }

        try {
            const { localizar } = await getModelZones();
            simulationZone = localizar(event.latlng.lat, event.latlng.lng);
            if (!simulationZone) {
                if (aviso) aviso.textContent = 'El punto está fuera de las zonas disponibles.';
                return;
            }

            if (simulationMarker) map.removeLayer(simulationMarker);
            simulationMarker = L.circleMarker(event.latlng, {
                radius: 8, color: '#075b48', weight: 2, fillColor: '#36a879', fillOpacity: 0.9
            }).addTo(map).bindPopup(simulationPopup()).openPopup();
            if (clearSimButton) clearSimButton.disabled = false;
            if (aviso) aviso.textContent = 'Simulación local: los resultados dependen de los supuestos del modelo.';
        } catch (error) {
            console.error('Error al preparar la simulación:', error);
            if (aviso) aviso.textContent = 'No se pudo preparar la simulación. Revisa los datos del modelo.';
        }
    }

    map.on('click', placeSimulation);

    function popupPrediccion(p, año) {
        const prob = (p.prob_rentable !== null && p.prob_rentable !== undefined)
            ? (p.prob_rentable * 100).toFixed(0) + ' %' : 'N/D';
        const obra = p.viable_max
            ? `<div class="popup-sec">Cargadores a construir</div><div>${p.n_cargadores_max} (nuevos netos: ${p.nuevos_max ?? 'N/D'})</div>`
            : `<div class="popup-no">Con el caso base no conviene construir aquí.</div>`;
        return `
            <div class="popup-title">${p.alcaldia} — ${año} (adopción ${p.escenario ?? ''})</div>
            <div><b>Probabilidad de ser rentable:</b> ${prob}</div>
            <div><b>Ganancia mediana:</b> ${mxn(p.ganancia_p50)}</div>
            <div><b>Ganancia P10 a P90:</b> ${mxn(p.ganancia_min)} a ${mxn(p.ganancia_max)}</div>
            <div><b>Percentil de viabilidad:</b> ${(p.score_viabilidad * 100).toFixed(0)}</div>
            ${obra}
            <div class="popup-sec">Payback (capex base)</div>
            <div>Optimista: ${años(p.payback_max)} · Pesimista: ${años(p.payback_min)}</div>
            <div class="popup-sec">Sensibilidad al capex (optimista)</div>
            <div>×0.5: ${años(p.payback_max_capex50)} · ×2: ${años(p.payback_max_capex200)}</div>
            <div class="popup-sec">Ganancia neta anualizada</div>
            <div>Mediana: ${mxn(p.neta_p50)}</div>
            <div>P10: ${mxn(p.neta_min)} · P90: ${mxn(p.neta_max)}</div>
        `;
    }

    async function loadPrediction(año) {
        predAño = año;
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
                    layer.on('click', event => {
                        if (placingSimulation) {
                            L.DomEvent.stopPropagation(event.originalEvent);
                            placeSimulation(event);
                            return;
                        }
                        L.popup().setLatLng(event.latlng).setContent(popupPrediccion(p, año)).openOn(map);
                    });
                }
            }).addTo(map);
            refreshSimulationPopup();
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
        clearSimulation();
        renderLegend('pct');
    }

    // ---------- Arranque ----------
    loadMapData('./viabilidad_cdmx_v2.geojson');
    loadChargersData();

    // ---------- Botones (solo en index.html) ----------
    if (document.getElementById('btn-original')) {
        document.getElementById('btn-original').addEventListener('click', function () {
            setActive('btn-original');
            modoOriginal();
            isSinDestinosMap = false;
            loadMapData('./viabilidad_cdmx_v2.geojson');
        });

        document.getElementById('btn-no-destinos').addEventListener('click', function () {
            setActive('btn-no-destinos');
            modoOriginal();
            isSinDestinosMap = true;
            loadMapData('./viabilidad_cdmx_v2_no_destinos.geojson');
        });

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

    if (simButton) {
        simButton.disabled = true;
        simButton.addEventListener('click', () => {
            if (!predAño) return;
            setPlacementMode(!placingSimulation);
        });
        clearSimButton.addEventListener('click', clearSimulation);
        document.getElementById('btn-2030').addEventListener('click', () => { simButton.disabled = false; });
        document.getElementById('btn-2035').addEventListener('click', () => { simButton.disabled = false; });
    }
});
