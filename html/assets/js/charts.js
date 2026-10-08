/**
 * charts.js — Tema gráfico ELECTRA, panel inferior de zona (bottom sheet) y
 * gráficas temáticas (económico / sustentabilidad / equidad).
 *
 * Se apoya en Chart.js (CDN) y en la paleta de assets/css/base.css.
 * El DOM del panel se inyecta aquí para no tocar el HTML compartido.
 */
(function () {
    'use strict';

    const C = {
        econ: '#D4A537', sust: '#2FBF71', eq: '#E6007E',
        guinda: '#8C1D40', dark: '#2D2040', muted: '#7A6E8A',
        grid: '#E4DEEA', green: '#2ca25f', yellow: '#ffeda0',
        red: '#de2d26', grey: '#bdbdbd'
    };
    window.ELECTRA_COLORS = C;

    function hexToRgba(hex, a) {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
    }

    const fmtMX = (n) => (n === null || n === undefined || isNaN(n)) ? 'N/D'
        : (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-MX');
    const fmtCompact = (n) => (n === null || n === undefined || isNaN(n)) ? 'N/D'
        : new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
    const fmtInt = (n) => (n === null || n === undefined || isNaN(n)) ? 'N/D'
        : Math.round(n).toLocaleString('es-MX');
    const años = (v) => (v === null || v === undefined || isNaN(v)) ? 'No recupera' : v.toFixed(1) + ' años';
    const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

    function setupTheme() {
        if (!window.Chart) return;
        Chart.defaults.font.family = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
        Chart.defaults.font.size = 12;
        Chart.defaults.color = C.dark;
        Chart.defaults.maintainAspectRatio = false;
        Chart.defaults.plugins.legend.labels.boxWidth = 12;
        Chart.defaults.plugins.legend.labels.usePointStyle = true;
        Chart.defaults.plugins.tooltip.backgroundColor = C.dark;
        Chart.defaults.plugins.tooltip.titleColor = '#fff';
        Chart.defaults.plugins.tooltip.bodyColor = '#EDE7F4';
        Chart.defaults.plugins.tooltip.padding = 10;
        Chart.defaults.plugins.tooltip.cornerRadius = 8;
        Chart.defaults.plugins.tooltip.displayColors = true;
    }

    // ---------------------------------------------------------------
    // Panel inferior de zona
    // ---------------------------------------------------------------
    const ZonePanel = {
        _geo: null,
        _rows: null,
        _year: null,
        _props: null,
        _charts: {},
        _built: {},

        init() {
            if (document.getElementById('zone-panel')) return;
            const el = document.createElement('div');
            el.id = 'zone-panel';
            el.className = 'zone-panel';
            el.setAttribute('role', 'dialog');
            el.setAttribute('aria-hidden', 'true');
            el.innerHTML = `
                <div class="zone-panel__handle"></div>
                <header class="zone-panel__header">
                    <div>
                        <h2 id="zp-title">Zona</h2>
                        <p class="zone-panel__subtitle" id="zp-subtitle"></p>
                    </div>
                    <button type="button" class="zone-panel__close" id="zp-close" aria-label="Cerrar">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </header>
                <nav class="zone-panel__tabs">
                    <button type="button" data-tab="economico" class="active">Económico</button>
                    <button type="button" data-tab="sustentabilidad">Sustentabilidad</button>
                    <button type="button" data-tab="equidad">Equidad</button>
                </nav>
                <div class="zone-panel__body">
                    <div class="zp-pane active" data-pane="economico">
                        <div class="zp-kpis" id="zp-kpis-economico"></div>
                        <div class="zp-chart"><canvas id="zp-chart-economico"></canvas></div>
                    </div>
                    <div class="zp-pane" data-pane="sustentabilidad">
                        <div class="zp-kpis" id="zp-kpis-sustentabilidad"></div>
                        <div class="zp-chart"><canvas id="zp-chart-sustentabilidad"></canvas></div>
                    </div>
                    <div class="zp-pane" data-pane="equidad">
                        <div class="zp-kpis" id="zp-kpis-equidad"></div>
                        <div class="zp-chart"><canvas id="zp-chart-equidad"></canvas></div>
                    </div>
                    <p class="zp-note">Simulación Monte Carlo con supuestos provisionales. La ganancia, el CO₂
                        evitado y el empleo son estimaciones (rangos P10–P90); no son datos reales.</p>
                </div>`;
            const host = document.getElementById('station-zone-section') || document.body;
            host.appendChild(el);
            this._el = el;

            el.querySelector('#zp-close').addEventListener('click', () => {
                this.close();
                if (window.StationPanel) window.StationPanel.close();
            });
            el.querySelectorAll('.zone-panel__tabs button').forEach(btn => {
                btn.addEventListener('click', () => this.showTab(btn.dataset.tab));
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen()) this.close();
            });
        },

        setGeo(features) { this._geo = features || []; },

        isOpen() { return this._el && this._el.classList.contains('open'); },

        open({ rows, year, props }) {
            if (!this._el || !rows || !rows.length) return;
            this._rows = rows;
            this._year = year;
            this._props = props || {};

            const byYear = {};
            rows.forEach(r => { byYear[r['año']] = r; });
            this._byYear = byYear;

            const row = byYear[this._year] || rows[0];
            document.getElementById('zp-title').textContent =
                `${this._props.NOM_MUN || row.alcaldia || 'Zona'} — AGEB ${row.zona}`;
            document.getElementById('zp-subtitle').textContent =
                `Año ${this._year} · adopción ${row.escenario || 'N/D'} · ` +
                `prob. rentable ${(row.prob_rentable * 100).toFixed(0)}%`;

            this._built = {};
            this._destroyCharts();
            this._el.classList.add('open');
            this._el.setAttribute('aria-hidden', 'false');
            this.showTab('economico');
        },

        close() {
            if (!this._el) return;
            this._el.classList.remove('open');
            this._el.setAttribute('aria-hidden', 'true');
            this._destroyCharts();
        },

        _destroyCharts() {
            Object.keys(this._charts).forEach(k => {
                try { this._charts[k].destroy(); } catch (e) {}
                delete this._charts[k];
            });
        },

        showTab(tab) {
            this._el.querySelectorAll('.zp-pane').forEach(p =>
                p.classList.toggle('active', p.dataset.pane === tab));
            this._el.querySelectorAll('.zone-panel__tabs button').forEach(b =>
                b.classList.toggle('active', b.dataset.tab === tab));
            if (!this._built[tab]) {
                this._built[tab] = true;
                if (tab === 'economico') this._renderEconomico();
                else if (tab === 'sustentabilidad') this._renderSustentabilidad();
                else if (tab === 'equidad') this._renderEquidad();
            }
        },

        _kpis(containerId, items) {
            document.getElementById(containerId).innerHTML = items.map(it => `
                <div class="zp-kpi">
                    <span class="zp-kpi__label">${it.label}</span>
                    <span class="zp-kpi__value">${it.value}</span>
                </div>`).join('');
        },

        _years() { return [2030, 2035].filter(y => this._byYear[y]); },

        _renderEconomico() {
            const row = this._byYear[this._year];
            this._kpis('zp-kpis-economico', [
                { label: 'Inversión del sitio', value: fmtMX(row.capex_total) },
                { label: 'Empleos estimados', value: (row.empleo_est ?? 0).toFixed(1) },
                { label: 'Ganancia neta (mediana)', value: fmtMX(row.neta_p50) },
                { label: 'Payback optimista', value: años(row.payback_max) },
                { label: 'Cargadores a construir', value: fmtInt(row.n_cargadores_max) }
            ]);

            const years = this._years();
            const labels = years.map(String);
            const mk = (label, key, alpha) => ({
                label, data: years.map(y => this._byYear[y][key]),
                backgroundColor: hexToRgba(C.econ, alpha), borderRadius: 6, maxBarThickness: 46
            });
            this._charts.economico = new Chart(document.getElementById('zp-chart-economico'), {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        mk('P10 (pesimista)', 'ganancia_min', 0.35),
                        mk('P50 (mediana)', 'ganancia_p50', 1),
                        mk('P90 (optimista)', 'ganancia_max', 0.65)
                    ]
                },
                options: {
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtMX(c.parsed.y)}` } }
                    },
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            grid: { color: C.grid },
                            ticks: { callback: (v) => fmtCompact(v) },
                            title: { display: true, text: 'Ganancia anual (MXN)' }
                        }
                    }
                }
            });
        },

        _renderSustentabilidad() {
            const row = this._byYear[this._year];
            this._kpis('zp-kpis-sustentabilidad', [
                { label: 'CO₂ evitado', value: `${fmtCompact((row.co2_evitado || 0) / 1000)} t/año` },
                { label: 'Energía servida', value: `${fmtCompact(row.kwh_p50)} kWh/año` },
                { label: 'Cargadores', value: fmtInt(row.n_cargadores_max) },
                { label: 'Prob. rentable', value: `${(row.prob_rentable * 100).toFixed(0)}%` }
            ]);

            const years = this._years();
            const labels = years.map(String);
            const mk = (label, key, alpha) => ({
                label, data: years.map(y => this._byYear[y][key]),
                backgroundColor: hexToRgba(C.sust, alpha), borderRadius: 6, maxBarThickness: 46
            });
            this._charts.sustentabilidad = new Chart(document.getElementById('zp-chart-sustentabilidad'), {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        mk('P10', 'kwh_p10', 0.35),
                        mk('P50', 'kwh_p50', 1),
                        mk('P90', 'kwh_p90', 0.65)
                    ]
                },
                options: {
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtInt(c.parsed.y)} kWh/año` } }
                    },
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            grid: { color: C.grid },
                            ticks: { callback: (v) => fmtCompact(v) },
                            title: { display: true, text: 'Energía servida (kWh/año)' }
                        }
                    }
                }
            });
        },

        _renderEquidad() {
            const props = this._props;
            const alcaldia = props.NOM_MUN;
            const geo = this._geo || [];
            const viabsCity = [], viabsAlc = [];
            geo.forEach(f => {
                const v = f.properties && f.properties.viabilidad;
                if (typeof v === 'number') {
                    viabsCity.push(v);
                    if (f.properties.NOM_MUN === alcaldia) viabsAlc.push(v);
                }
            });
            const zoneViab = typeof props.viabilidad === 'number' ? props.viabilidad : 0;
            const row = this._byYear[this._year];

            this._kpis('zp-kpis-equidad', [
                { label: 'Población', value: fmtInt(row.poblacion) },
                { label: 'Autos por vivienda', value: fmtInt(props.VPH_AUTOM) },
                { label: 'Cargadores existentes', value: fmtInt(row.n_total) },
                { label: 'Percentil viabilidad', value: `${Math.round((row.score_viabilidad || 0) * 100)}` }
            ]);

            const labels = ['Tu zona', 'Tu alcaldía', 'CDMX'];
            const data = [zoneViab, mean(viabsAlc), mean(viabsCity)].map(v => +(v * 100).toFixed(2));
            this._charts.equidad = new Chart(document.getElementById('zp-chart-equidad'), {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Oportunidad (índice de viabilidad)',
                        data,
                        backgroundColor: [C.eq, hexToRgba(C.eq, 0.55), hexToRgba(C.eq, 0.3)],
                        borderRadius: 6,
                        maxBarThickness: 60
                    }]
                },
                options: {
                    indexAxis: 'y',
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (c) => `${c.parsed.x} / 100` } }
                    },
                    scales: {
                        x: {
                            beginAtZero: true, max: 100, grid: { color: C.grid },
                            title: { display: true, text: 'Índice de viabilidad (0–100)' }
                        },
                        y: { grid: { display: false } }
                    }
                }
            });
        }
    };
    window.ZonePanel = ZonePanel;

    // ---------------------------------------------------------------
    // Panel lateral derecho: formulario / gráficas
    // ---------------------------------------------------------------
    const StationPanel = {
        init() {
            this._el = document.getElementById('station-side-panel');
            if (!this._el) return;
            this._wrapper = document.querySelector('.map-wrapper');
            this._title = document.getElementById('station-panel-title');

            const btnAdd = document.getElementById('btn-add-station-demo');
            const btnClose = document.getElementById('station-panel-close');
            const btnToggle = document.getElementById('station-form-toggle');
            const formSection = document.getElementById('station-form-section');

            if (btnAdd) btnAdd.addEventListener('click', () => this.open('form'));
            if (btnClose) btnClose.addEventListener('click', () => this.close());
            if (btnToggle && formSection) {
                btnToggle.addEventListener('click', () => {
                    const collapsed = formSection.classList.toggle('collapsed');
                    btnToggle.setAttribute('aria-expanded', String(!collapsed));
                });
            }
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen()) this.close();
            });
        },

        isOpen() {
            return this._el && this._el.classList.contains('open');
        },

        open(mode) {
            if (!this._el) return;
            const m = (mode === 'zone' || mode === 'charts') ? 'zone' : 'form';
            this._el.dataset.mode = m;
            if (this._title) {
                this._title.textContent = m === 'zone' ? 'Análisis de zona' : 'Nueva Electrolinera';
            }
            this._el.classList.add('open');
            this._el.setAttribute('aria-hidden', 'false');
            if (this._wrapper) this._wrapper.classList.add('panel-open');
            // Chart.js recalcula sobre el contenedor ya visible
            setTimeout(() => window.dispatchEvent(new Event('resize')), 380);
        },

        close() {
            if (!this._el) return;
            this._el.classList.remove('open');
            this._el.setAttribute('aria-hidden', 'true');
            if (this._wrapper) this._wrapper.classList.remove('panel-open');
        }
    };
    window.StationPanel = StationPanel;

    // ---------------------------------------------------------------
    // Gráficas agregadas temáticas (bajo el mapa)
    // ---------------------------------------------------------------
    const Agg = {
        _charts: {},
        render(PRED) {
            if (!window.Chart || !PRED || !PRED.length) return;
            this._renderSustentabilidad(PRED);
            this._renderEquidad(PRED);
        },

        _renderSustentabilidad(PRED) {
            const canvas = document.getElementById('chart-sustentabilidad');
            if (!canvas) return;
            if (this._charts.sust) { this._charts.sust.destroy(); this._charts.sust = null; }
            const years = [2030, 2035];
            const co2 = years.map(y => PRED.filter(r => r['año'] === y)
                .reduce((s, r) => s + (r.co2_evitado || 0), 0) / 1000);
            this._charts.sust = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: years.map(String),
                    datasets: [{
                        label: 'CO₂ evitado (toneladas/año)',
                        data: co2.map(v => +v.toFixed(0)),
                        backgroundColor: [hexToRgba(C.sust, 0.6), C.sust],
                        borderRadius: 6, maxBarThickness: 80
                    }]
                },
                options: {
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (c) => `${fmtInt(c.parsed.y)} t/año` } }
                    },
                    scales: {
                        x: { grid: { display: false } },
                        y: { grid: { color: C.grid }, ticks: { callback: (v) => fmtCompact(v) } }
                    }
                }
            });
        },

        _renderEquidad(PRED) {
            const canvas = document.getElementById('chart-equidad');
            if (!canvas) return;
            if (this._charts.eq) { this._charts.eq.destroy(); this._charts.eq = null; }

            // Zonas de alto potencial (top 20% por viabilidad) que NO tienen cargadores.
            const top = PRED.filter(r => r['año'] === 2030 && r.score_viabilidad >= 0.8);
            const porAlc = {};
            top.forEach(r => {
                const a = r.alcaldia || 'N/D';
                porAlc[a] = porAlc[a] || { total: 0, sin: 0 };
                porAlc[a].total++;
                if ((r.n_total || 0) === 0) porAlc[a].sin++;
            });
            const filas = Object.keys(porAlc)
                .map(a => ({ a, sin: porAlc[a].sin, total: porAlc[a].total }))
                .filter(f => f.sin > 0)
                .sort((x, y) => y.sin - x.sin)
                .slice(0, 10);

            this._charts.eq = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: filas.map(f => f.a),
                    datasets: [{
                        label: 'Zonas de alto potencial sin cargadores',
                        data: filas.map(f => f.sin),
                        backgroundColor: C.eq,
                        borderRadius: 6, maxBarThickness: 26
                    }]
                },
                options: {
                    indexAxis: 'y',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (c) => `${c.parsed.x} de ${filas[c.dataIndex].total} zonas`
                            }
                        }
                    },
                    scales: {
                        x: { beginAtZero: true, grid: { color: C.grid }, title: { display: true, text: 'Nº de AGEB' } },
                        y: { grid: { display: false } }
                    }
                }
            });
        }
    };
    window.ELECTRA_AGG = Agg;

    document.addEventListener('DOMContentLoaded', () => {
        setupTheme();
        ZonePanel.init();
        StationPanel.init();
    });
})();
