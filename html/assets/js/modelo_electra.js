/**
 * Modelo de viabilidad en el navegador (port de incertidumbre.py).
 * Sirve para recalcular una zona cuando el usuario agrega electrolineras.
 * Los supuestos DEBEN coincidir con config.py / incertidumbre.py.
 */
(function (root) {
    'use strict';

    const K = {
        ADOPT_BASE: 0.005, ADOPT_REF: 0.30,
        KWH_EV: 2500, PUBLIC: 0.20, DEST: 300000, COMP_K: 0.3,
        PRECIO: (10.5 + 8.0) / 2, COSTO: (4.0 + 5.0) / 2, CAPTURA: (1.0 + 0.5) / 2,
        OPEX: 60000, CAPEX_SITIO: 400000, CAPEX_CARGADOR: 100000, TASA: 0.12, VIDA: 10,
        KW: 50, UTIL_OBJ: 0.05, UTIL_MAX: 0.25, SEED: 42, N_SIM: 500
    };
    K.KWH_CARGADOR = K.KW * 8760 * K.UTIL_OBJ;
    const ESCENARIOS = {
        baja: { max: 0.10, k: 0.30, mid: 2036 },
        media: { max: 0.20, k: 0.35, mid: 2034 },
        alta: { max: 0.30, k: 0.35, mid: 2033 }
    };
    const PESO = { Tesla: 1.5, Evergo: 1.0, PlugShare: 0.7, Propia: 1.0 };
    // [mínimo, máximo]; la adopción se centra en el escenario (ver rangos())
    const RANGOS = {
        kwh_ev: [2000, 3000], public_share: [0.10, 0.30], dest_kwh: [150000, 450000],
        comp_k: [0.10, 0.50], precio: [8, 12], costo: [3.5, 5.5], captura: [0.5, 1.0],
        opex: [40000, 90000], capex_sitio: [250000, 600000], capex_cargador: [70000, 150000],
        tasa: [0.08, 0.16]
    };
    const CAPEX_FACTORES = [0.5, 2.0];

    const anual = t => t / (1 - Math.pow(1 + t, -K.VIDA));
    const maxN = (a, b) => (a > b ? a : b);

    function base(esc) {
        const E = ESCENARIOS[esc] || ESCENARIOS.media;
        return {
            adopt_max: E.max, adopt_k: E.k, adopt_mid: E.mid, kwh_ev: K.KWH_EV,
            public_share: K.PUBLIC, dest_kwh: K.DEST, comp_k: K.COMP_K, precio: K.PRECIO,
            costo: K.COSTO, captura: K.CAPTURA, opex: K.OPEX, capex_sitio: K.CAPEX_SITIO,
            capex_cargador: K.CAPEX_CARGADOR, tasa: K.TASA
        };
    }

    function rangos(esc) {
        const E = ESCENARIOS[esc] || ESCENARIOS.media;
        return Object.assign({}, RANGOS, {
            adopt_max: [0.5 * E.max, 1.5 * E.max], adopt_mid: [E.mid - 1.5, E.mid + 1.5]
        });
    }

    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Mismos sorteos para todas las zonas de un (escenario, año): resultados comparables
    const DRAWS = {};
    function draws(esc, year, n) {
        const key = `${esc}|${year}|${n}`;
        if (DRAWS[key]) return DRAWS[key];
        const rng = mulberry32(K.SEED + year), R = rangos(esc), b = base(esc), out = [];
        for (let i = 0; i < n; i++) {
            const p = Object.assign({}, b);
            for (const k in R) p[k] = R[k][0] + rng() * (R[k][1] - R[k][0]);
            out.push(p);
        }
        return (DRAWS[key] = out);
    }

    function percentil(arr, q) {
        const s = Array.from(arr).sort((a, b) => a - b), i = (q / 100) * (s.length - 1);
        const lo = Math.floor(i), hi = Math.ceil(i);
        return s[lo] + (s[hi] - s[lo]) * (i - lo);
    }

    // kWh/año que llegan a una estación nueva en la zona (compet. = puertos ponderados)
    function kwhCaptado(z, year, p, comp) {
        const ad = K.ADOPT_BASE + p.adopt_max / (1 + Math.exp(-p.adopt_k * (year - p.adopt_mid)));
        const kwh = z.V * ad * (1 + z.R) * p.kwh_ev * p.public_share
            + z.T * p.dest_kwh * (ad / K.ADOPT_REF);
        return kwh / (1 + p.comp_k * comp) * p.captura;
    }

    // DECISIÓN con el caso base: nBase = cargadores a construir (0 = no conviene)
    function dimensionar(z, year, p, comp) {
        const kwh = kwhCaptado(z, year, p, comp);
        const m = maxN(p.precio - p.costo, 0.01), fa = anual(p.tasa);
        const costoC = p.opex + p.capex_cargador * fa;
        const n = maxN(1, Math.floor(kwh / maxN(K.KWH_CARGADOR, costoC / m)));
        const neta = kwh * m - n * costoC - p.capex_sitio * fa;
        return { nBase: neta > 0 ? n : 0, nEval: n };
    }

    // Resultado real con n cargadores ya decididos (share = fracción de la demanda servida)
    function simular(z, year, p, n, comp, sitios, share) {
        const kwh = kwhCaptado(z, year, p, comp);
        const m = maxN(p.precio - p.costo, 0.01);
        const servido = Math.min(kwh, n * K.KW * 8760 * K.UTIL_MAX) * (share === undefined ? 1 : share);
        const g = servido * m - n * p.opex;
        const capex = (sitios === undefined ? 1 : sitios) * p.capex_sitio + n * p.capex_cargador;
        return { g, neta: g - capex * anual(p.tasa) };
    }

    function resumir(G, NE, nEval, sitios) {
        const g10 = percentil(G, 10), g50 = percentil(G, 50), g90 = percentil(G, 90);
        const pay = (factor, g) => g > 0 ? factor * (sitios * K.CAPEX_SITIO + nEval * K.CAPEX_CARGADOR) / g : null;
        let pos = 0; for (const v of NE) if (v > 0) pos++;
        return {
            ganancia_min: g10, ganancia_p50: g50, ganancia_max: g90,
            neta_min: percentil(NE, 10), neta_p50: percentil(NE, 50), neta_max: percentil(NE, 90),
            prob_rentable: pos / NE.length,
            payback_max: pay(1, g90), payback_min: pay(1, g10),
            payback_max_capex50: pay(0.5, g90), payback_max_capex200: pay(2, g90),
            payback_min_capex50: pay(0.5, g10), payback_min_capex200: pay(2, g10)
        };
    }

    /** Oportunidad restante de una zona (lo que muestra el mapa), con competencia extra
     *  (p. ej. las electrolineras del usuario). Equivale a una fila de predicciones.json. */
    function zonaPrediccion(z, year, esc, opts) {
        const comp = z.comp + ((opts && opts.extraComp) || 0), N = (opts && opts.n) || K.N_SIM;
        const d = dimensionar(z, year, base(esc), comp);
        const G = [], NE = [];
        for (const p of draws(esc, year, N)) {
            const r = simular(z, year, p, d.nEval, comp, 1, 1);
            G.push(r.g); NE.push(r.neta);
        }
        return Object.assign({ nBase: d.nBase, nEval: d.nEval }, resumir(G, NE, d.nEval, 1));
    }

    /** Economía de TU estación: nEsta cargadores en una zona donde tú pones nGrupo en total.
     *  La demanda se reparte entre tus estaciones de la zona según sus cargadores. */
    function estacion(z, year, esc, nGrupo, nEsta) {
        const N = K.N_SIM, share = nEsta / nGrupo, G = [], NE = [];
        for (const p of draws(esc, year, N)) {
            const kwh = kwhCaptado(z, year, p, z.comp);
            const m = maxN(p.precio - p.costo, 0.01);
            const servidoGrupo = Math.min(kwh, nGrupo * K.KW * 8760 * K.UTIL_MAX);
            const g = servidoGrupo * share * m - nEsta * p.opex;
            const capex = p.capex_sitio + nEsta * p.capex_cargador;
            G.push(g); NE.push(g - capex * anual(p.tasa));
        }
        const rec = dimensionar(z, year, base(esc), z.comp);
        return Object.assign({ recomendados: rec.nBase }, resumir(G, NE, nEsta, 1));
    }

    // ---------- Zonas: features estáticas + localización de puntos ----------
    function anillos(geom) {
        return geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    }
    function dentro(x, y, poly) {
        let ins = false;
        for (const r of poly) {
            for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
                const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
                if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
            }
        }
        return ins;
    }

    /** Replica data.py: imputa VPH_AUTOM con la mediana de la alcaldía, traffic_idx y
     *  competencia ponderada por puertos. geo = GeoJSON de zonas; chargers = all_chargers_geo. */
    function prepararZonas(geo, chargers) {
        const feats = geo.features;
        const porMun = {};
        feats.forEach(f => {
            const v = f.properties.VPH_AUTOM;
            if (v !== null && v !== undefined) (porMun[f.properties.NOM_MUN] = porMun[f.properties.NOM_MUN] || []).push(v);
        });
        const med = {};
        for (const m in porMun) med[m] = percentil(porMun[m], 50);

        const zs = feats.map(f => {
            const pr = f.properties, polys = anillos(f.geometry);
            let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
            polys.forEach(P => P[0].forEach(c => {
                if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0];
                if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1];
            }));
            const V = (pr.VPH_AUTOM !== null && pr.VPH_AUTOM !== undefined) ? pr.VPH_AUTOM : (med[pr.NOM_MUN] || 0);
            return {
                cve: pr.CVEGEO, alcaldia: pr.NOM_MUN, V, R: pr.riqueza_norm || 0,
                D: pr.destinos_raw || 0, comp: 0, nTotal: 0, polys, bbox: [x0, y0, x1, y1]
            };
        });
        const mm = arr => { const lo = Math.min(...arr), hi = Math.max(...arr); return arr.map(v => hi > lo ? (v - lo) / (hi - lo) : 0); };
        const a = mm(zs.map(z => Math.log1p(z.D))), b = mm(zs.map(z => z.V));
        zs.forEach((z, i) => { z.T = 0.5 * a[i] + 0.5 * b[i]; });

        const zonas = new Map(zs.map(z => [z.cve, z]));
        const localizar = (lat, lon) => {
            for (const z of zs) {
                const bb = z.bbox;
                if (lon < bb[0] || lon > bb[2] || lat < bb[1] || lat > bb[3]) continue;
                if (z.polys.some(P => dentro(lon, lat, P))) return z;
            }
            return null;
        };
        (chargers.features || []).forEach(f => {
            const pr = f.properties || {}, z = localizar(f.geometry.coordinates[1], f.geometry.coordinates[0]);
            if (!z) return;
            const n = Math.max(pr.n_puertos || 1, 1);
            z.comp += n * (PESO[pr.red] !== undefined ? PESO[pr.red] : PESO.PlugShare);
            z.nTotal += n;
        });
        return { zonas, localizar };
    }

    const api = { K, ESCENARIOS, PESO, base, rangos, kwhCaptado, dimensionar, simular, zonaPrediccion, estacion, prepararZonas, percentil, CAPEX_FACTORES };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.ElectraModelo = api;
})(typeof window !== 'undefined' ? window : globalThis);
