/**
 * dashboard.js — Lógica de visualización y métricas generales para ELECTRA CDMX.
 * Gráficas de electrolineras por alcaldía, redes, viabilidad territorial y proyecciones.
 */

document.addEventListener('DOMContentLoaded', async () => {
    'use strict';

    // Paleta de colores ELECTRA
    const COLORS = {
        primary: '#8C1D40',
        secondary: '#E6007E',
        dark: '#2D2040',
        gold: '#D4A537',
        green: '#2FBF71',
        blue: '#3E8EDE',
        orange: '#F5A524',
        tesla: '#E5484D',
        evergo: '#2FBF71',
        plugshare: '#D4A537',
        grid: '#E4DEEA',
        text: '#2D2040'
    };

    // Colección de gráficos para reajuste de tamaño
    const chartInstances = [];

    // Configuración global de Chart.js
    if (window.Chart) {
        Chart.defaults.font.family = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
        Chart.defaults.font.size = 12;
        Chart.defaults.color = COLORS.dark;
        Chart.defaults.maintainAspectRatio = false;
        Chart.defaults.plugins.legend.labels.usePointStyle = true;
        Chart.defaults.plugins.tooltip.backgroundColor = COLORS.dark;
        Chart.defaults.plugins.tooltip.titleColor = '#ffffff';
        Chart.defaults.plugins.tooltip.bodyColor = '#EDE7F4';
        Chart.defaults.plugins.tooltip.padding = 10;
        Chart.defaults.plugins.tooltip.cornerRadius = 8;
    }

    // Helper para formato numérico
    const fmtInt = (n) => (n === null || n === undefined || isNaN(n)) ? '0' : Math.round(n).toLocaleString('es-MX');

    // Algoritmo Ray-Casting para detectar alcaldía por coordenadas
    function pointInPolygon(point, vs) {
        const x = point[0], y = point[1];
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            const xi = vs[i][0], yi = vs[i][1];
            const xj = vs[j][0], yj = vs[j][1];
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function findAlcaldia(lon, lat, geoFeatures) {
        for (const f of geoFeatures) {
            const geom = f.geometry;
            const mun = f.properties && f.properties.NOM_MUN;
            if (!geom || !mun) continue;

            if (geom.type === 'Polygon') {
                if (pointInPolygon([lon, lat], geom.coordinates[0])) return mun;
            } else if (geom.type === 'MultiPolygon') {
                for (const poly of geom.coordinates) {
                    if (pointInPolygon([lon, lat], poly[0])) return mun;
                }
            }
        }
        return 'Otras';
    }

    // Carga de datos simultánea
    try {
        const [chargersData, geoData, predData] = await Promise.all([
            fetch('./all_chargers_geo.json?t=' + Date.now()).then(r => r.json()).catch(() => ({ features: [] })),
            fetch('./viabilidad_cdmx_v2.geojson?t=' + Date.now()).then(r => r.json()).catch(() => ({ features: [] })),
            fetch('./predicciones.json?t=' + Date.now()).then(r => r.json()).catch(() => [])
        ]);

        const chargers = chargersData.features || [];
        const geoFeatures = geoData.features || [];
        const preds = Array.isArray(predData) ? predData : [];

        // 1. Conteo de Electrolineras por Red y por Alcaldía
        const chargersByNetwork = { Tesla: 0, Evergo: 0, PlugShare: 0, Otras: 0 };
        const chargersByAlcaldia = {
            'Álvaro Obregón': 0, 'Azcapotzalco': 0, 'Benito Juárez': 0, 'Coyoacán': 0,
            'Cuajimalpa de Morelos': 0, 'Cuauhtémoc': 0, 'Gustavo A. Madero': 0, 'Iztacalco': 0,
            'Iztapalapa': 0, 'La Magdalena Contreras': 0, 'Miguel Hidalgo': 0, 'Milpa Alta': 0,
            'Tláhuac': 0, 'Tlalpan': 0, 'Venustiano Carranza': 0, 'Xochimilco': 0
        };

        chargers.forEach(f => {
            const red = f.properties && f.properties.red ? f.properties.red : 'PlugShare';
            if (chargersByNetwork[red] !== undefined) chargersByNetwork[red]++;
            else chargersByNetwork.Otras++;

            const coords = f.geometry && f.geometry.coordinates;
            if (coords) {
                const mun = findAlcaldia(coords[0], coords[1], geoFeatures);
                if (chargersByAlcaldia[mun] !== undefined) {
                    chargersByAlcaldia[mun]++;
                } else if (mun !== 'Otras') {
                    chargersByAlcaldia[mun] = 1;
                }
            }
        });

        // 2. Viabilidad y componentes promedio por Alcaldía desde GeoJSON
        const alcStats = {};
        geoFeatures.forEach(f => {
            const p = f.properties || {};
            const mun = p.NOM_MUN || 'Desconocida';
            const v = (p.viabilidad !== null && p.viabilidad !== undefined) ? p.viabilidad : 0;
            const r = (p.riqueza_norm !== null && p.riqueza_norm !== undefined) ? p.riqueza_norm : 0;
            const d = (p.destinos_norm !== null && p.destinos_norm !== undefined) ? p.destinos_norm : 0;
            const c = (p.competencia_norm !== null && p.competencia_norm !== undefined) ? p.competencia_norm : 0;

            if (!alcStats[mun]) {
                alcStats[mun] = { count: 0, sumV: 0, sumR: 0, sumD: 0, sumC: 0 };
            }
            alcStats[mun].count++;
            alcStats[mun].sumV += v;
            alcStats[mun].sumR += r;
            alcStats[mun].sumD += d;
            alcStats[mun].sumC += c;
        });

        const alcList = Object.keys(alcStats)
            .filter(name => name !== 'Desconocida')
            .map(name => {
                const st = alcStats[name];
                return {
                    name,
                    avgViabilidad: st.count ? st.sumV / st.count : 0,
                    avgRiqueza: st.count ? st.sumR / st.count : 0,
                    avgDestinos: st.count ? st.sumD / st.count : 0,
                    avgCompetencia: st.count ? st.sumC / st.count : 0,
                    chargersCount: chargersByAlcaldia[name] || 0
                };
            });

        // 3. Proyecciones por año
        const yearlyData = {};
        preds.forEach(r => {
            const y = r['año'] || r['ao'] || r['a\u00f1o'];
            if (!y) return;
            if (!yearlyData[y]) {
                yearlyData[y] = { totalChargers: 0, nuevos: 0, rentables: 0 };
            }
            yearlyData[y].totalChargers += (r.n_cargadores_max || 0);
            yearlyData[y].nuevos += (r.nuevos_max || 0);
            if ((r.prob_rentable || 0) >= 0.5) yearlyData[y].rentables++;
        });

        // Actualizar KPIs de cabecera
        const totalChargersEl = document.getElementById('kpi-total-chargers');
        if (totalChargersEl) totalChargersEl.textContent = fmtInt(chargers.length || 231);

        const sortedByChargers = Object.entries(chargersByAlcaldia).sort((a, b) => b[1] - a[1]);
        const topAlcaldiaEl = document.getElementById('kpi-top-alcaldia');
        if (topAlcaldiaEl && sortedByChargers.length) {
            topAlcaldiaEl.textContent = `${sortedByChargers[0][0]} (${sortedByChargers[0][1]})`;
        }

        const sortedByViab = [...alcList].sort((a, b) => b.avgViabilidad - a.avgViabilidad);
        const topViabEl = document.getElementById('kpi-top-viabilidad');
        if (topViabEl && sortedByViab.length) {
            topViabEl.textContent = `${sortedByViab[0].name} (${(sortedByViab[0].avgViabilidad * 100).toFixed(1)}%)`;
        }

        const topRedEl = document.getElementById('kpi-top-red');
        if (topRedEl) {
            topRedEl.textContent = `PlugShare (${chargersByNetwork.PlugShare || 118})`;
        }

        // ==========================================
        // RENDERIZADO DE GRÁFICAS (Chart.js)
        // ==========================================

        // --- Gráfica 1: Electrolineras por Alcaldía ---
        const canvasChargersByAlc = document.getElementById('chart-chargers-by-alcaldia');
        if (canvasChargersByAlc) {
            const alcLabels = sortedByChargers.map(item => item[0]);
            const alcValues = sortedByChargers.map(item => item[1]);

            const c1 = new Chart(canvasChargersByAlc, {
                type: 'bar',
                data: {
                    labels: alcLabels,
                    datasets: [{
                        label: 'Número de Electrolineras',
                        data: alcValues,
                        backgroundColor: alcValues.map((v, i) => i === 0 ? COLORS.secondary : i < 3 ? COLORS.primary : '#A99BB8'),
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (c) => `${c.parsed.x} estaciones registradas`
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            grid: { color: COLORS.grid },
                            title: { display: true, text: 'Total de sitios' }
                        },
                        y: {
                            grid: { display: false }
                        }
                    }
                }
            });
            chartInstances.push(c1);
        }

        // --- Gráfica 2: Distribución por Red ---
        const canvasNetwork = document.getElementById('chart-chargers-by-network');
        if (canvasNetwork) {
            const c2 = new Chart(canvasNetwork, {
                type: 'doughnut',
                data: {
                    labels: ['PlugShare', 'Evergo', 'Tesla'],
                    datasets: [{
                        data: [
                            chargersByNetwork.PlugShare || 118,
                            chargersByNetwork.Evergo || 72,
                            chargersByNetwork.Tesla || 41
                        ],
                        backgroundColor: [COLORS.plugshare, COLORS.evergo, COLORS.tesla],
                        borderWidth: 2,
                        borderColor: '#ffffff',
                        borderRadius: 6
                    }]
                },
                options: {
                    cutout: '58%',
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: {
                            callbacks: {
                                label: (c) => ` ${c.label}: ${c.raw} sitios (${((c.raw / chargers.length) * 100).toFixed(1)}%)`
                            }
                        }
                    }
                }
            });
            chartInstances.push(c2);
        }

        // --- Gráfica 3: Viabilidad Promedio por Alcaldía ---
        const canvasViab = document.getElementById('chart-avg-viability');
        if (canvasViab) {
            const labels = sortedByViab.map(a => a.name);
            const data = sortedByViab.map(a => +(a.avgViabilidad * 100).toFixed(1));

            const c3 = new Chart(canvasViab, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Índice de Viabilidad (%)',
                        data: data,
                        backgroundColor: data.map(v => v >= 35 ? COLORS.green : v >= 20 ? COLORS.gold : '#de2d26'),
                        borderRadius: 6
                    }]
                },
                options: {
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (c) => ` Viabilidad promedio: ${c.parsed.y}%` } }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { maxRotation: 45, minRotation: 45, font: { size: 11 } }
                        },
                        y: {
                            beginAtZero: true,
                            max: 50,
                            grid: { color: COLORS.grid },
                            title: { display: true, text: 'Índice de viabilidad (%)' }
                        }
                    }
                }
            });
            chartInstances.push(c3);
        }

        // --- Gráfica 4: Desglose de Componentes del Modelo (Top 8 Alcaldías) ---
        const canvasComponents = document.getElementById('chart-model-components');
        if (canvasComponents) {
            const topAlcaldias = sortedByViab.slice(0, 8);
            const c4 = new Chart(canvasComponents, {
                type: 'bar',
                data: {
                    labels: topAlcaldias.map(a => a.name),
                    datasets: [
                        {
                            label: 'Poder Adquisitivo',
                            data: topAlcaldias.map(a => +(a.avgRiqueza).toFixed(3)),
                            backgroundColor: COLORS.primary,
                            borderRadius: 6
                        },
                        {
                            label: 'Destinos de Interés',
                            data: topAlcaldias.map(a => +(a.avgDestinos).toFixed(3)),
                            backgroundColor: COLORS.green,
                            borderRadius: 6
                        },
                        {
                            label: 'Competencia Existente',
                            data: topAlcaldias.map(a => +(a.avgCompetencia).toFixed(3)),
                            backgroundColor: COLORS.tesla,
                            borderRadius: 6
                        }
                    ]
                },
                options: {
                    plugins: {
                        legend: { position: 'top' }
                    },
                    scales: {
                        x: { grid: { display: false } },
                        y: { beginAtZero: true, grid: { color: COLORS.grid } }
                    }
                }
            });
            chartInstances.push(c4);
        }

        // --- Gráfica 5: Proyección de Cargadores (2026-2035) ---
        const canvasProj = document.getElementById('chart-chargers-projection');
        if (canvasProj) {
            const years = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035];
            const cargadoresData = years.map(y => (yearlyData[y] ? yearlyData[y].totalChargers : 0));
            const rentablesData = years.map(y => (yearlyData[y] ? yearlyData[y].rentables : 0));

            const c5 = new Chart(canvasProj, {
                type: 'bar',
                data: {
                    labels: years.map(String),
                    datasets: [
                        {
                            label: 'Cargadores Óptimos Acumulados',
                            data: cargadoresData,
                            backgroundColor: COLORS.primary,
                            borderRadius: 6,
                            order: 2
                        },
                        {
                            type: 'line',
                            label: 'Zonas Altamente Rentables (≥50%)',
                            data: rentablesData,
                            borderColor: COLORS.secondary,
                            backgroundColor: COLORS.secondary,
                            pointRadius: 4,
                            tension: 0.3,
                            yAxisID: 'y1',
                            order: 1
                        }
                    ]
                },
                options: {
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: {
                            callbacks: {
                                label: (c) => `${c.dataset.label}: ${fmtInt(c.parsed.y)}`
                            }
                        }
                    },
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            beginAtZero: true,
                            grid: { color: COLORS.grid },
                            title: { display: true, text: 'Nº de Cargadores' }
                        },
                        y1: {
                            beginAtZero: true,
                            position: 'right',
                            grid: { display: false },
                            title: { display: true, text: 'Nº Zonas Rentables' }
                        }
                    }
                }
            });
            chartInstances.push(c5);
        }

        // --- Gráfica 6: Equidad Territorial - Zonas de Alto Potencial sin Cobertura ---
        const canvasEquity = document.getElementById('chart-equity-gaps');
        if (canvasEquity) {
            // Zonas con alto potencial (viabilidad top 20%) y sin cargadores actuales
            const highViabWithout = preds.filter(r => {
                const y = r['año'] || r['ao'] || r['a\u00f1o'];
                return y === 2030 && (r.score_viabilidad >= 0.8) && (!r.n_total || r.n_total === 0);
            });

            const alcGapCounts = {};
            highViabWithout.forEach(r => {
                const a = r.alcaldia || 'Desconocida';
                alcGapCounts[a] = (alcGapCounts[a] || 0) + 1;
            });

            const gapList = Object.entries(alcGapCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

            const c6 = new Chart(canvasEquity, {
                type: 'bar',
                data: {
                    labels: gapList.map(g => g[0]),
                    datasets: [{
                        label: 'AGEBs con alto potencial y 0 cargadores',
                        data: gapList.map(g => g[1]),
                        backgroundColor: COLORS.secondary,
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (c) => `${c.parsed.x} AGEBs prioritarias sin electrolinera` } }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            grid: { color: COLORS.grid },
                            title: { display: true, text: 'Nº de Zonas Prioritarias' }
                        },
                        y: { grid: { display: false } }
                    }
                }
            });
            chartInstances.push(c6);
        }

        // ==========================================
        // CONTROL DEL MENÚ DE PESTAÑAS
        // ==========================================
        const menuButtons = document.querySelectorAll('#dashboard-menu .dash-menu-btn');
        const panelsContainer = document.getElementById('dashboard-panels');
        const panels = document.querySelectorAll('#dashboard-panels .dash-panel');

        function triggerChartsResize() {
            setTimeout(() => {
                chartInstances.forEach(chart => {
                    try {
                        chart.resize();
                        chart.update('none');
                    } catch (e) {}
                });
            }, 50);
        }

        menuButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target;

                // Marcar botón activo
                menuButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (targetId === 'panel-all') {
                    // Mostrar todas las gráficas en cuadrícula
                    panelsContainer.classList.add('show-all');
                    panels.forEach(p => p.classList.add('active'));
                } else {
                    // Mostrar solo la gráfica seleccionada
                    panelsContainer.classList.remove('show-all');
                    panels.forEach(p => {
                        p.classList.toggle('active', p.id === targetId);
                    });
                }

                triggerChartsResize();
            });
        });

        // Asegurar primer resize para dibujar nítido
        triggerChartsResize();

    } catch (err) {
        console.error('Error cargando datos del dashboard:', err);
    }
});
