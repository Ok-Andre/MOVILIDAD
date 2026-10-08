"""Incertidumbre: reemplaza 'máximo / mínimo' fijos por rangos estadísticos.


1) Tornado: cambia UN supuesto a la vez (de su mínimo a su máximo) y mide cuánto
   se mueve la ganancia neta total. Dice qué supuesto importa más.
2) Monte Carlo: sortea TODOS los supuestos a la vez N veces y guarda, por zona,
   percentiles 10/50/90 y la probabilidad de que la zona sea rentable.

Los RANGOS son PLACEHOLDERS: reemplazar con datos reales (tarifas CFE, cotizaciones,
precios de la competencia, INEGI).

Lógica: el número de cargadores es una DECISIÓN que se toma con el caso base
(dimensionar). Después se sortea qué pasa en la realidad con esa decisión fija
(demanda, precio, costos...). Por eso la ganancia puede salir negativa en el
peor caso y prob_rentable = probabilidad de que la neta sea > 0.
"""
import json
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from config import *
from simulate import anualidad

# (mínimo, máximo) de cada supuesto incierto
RANGOS = {
    "adopt_max":      (0.10, 0.30),      # techo de adopción (escenarios baja y alta)
    "adopt_mid":      (2033, 2036),      # año de despegue
    "kwh_ev":         (2000, 3000),      # kWh/año por EV
    "public_share":   (0.10, 0.30),      # fracción que carga en público
    "dest_kwh":       (150_000, 450_000),# kWh/año de carga de destino con tráfico máx.
    "comp_k":         (0.10, 0.50),      # qué tanto pesa la competencia
    "precio":         (8.0, 12.0),       # MXN/kWh al público
    "costo":          (3.5, 5.5),        # MXN/kWh costo de energía
    "captura":        (0.50, 1.00),      # fracción de la demanda que llega a la estación
    "opex":           (40_000, 90_000),  # MXN/año por cargador
    "capex_sitio":    (250_000, 600_000),
    "capex_cargador": (70_000, 150_000),
    "tasa":           (0.08, 0.16),      # tasa de descuento
}
NOMBRES = {
    "adopt_max": "Adopción máxima de EVs", "adopt_mid": "Año de despegue de la adopción",
    "kwh_ev": "kWh por EV al año", "public_share": "% que carga en público",
    "dest_kwh": "Carga de destino (kWh)", "comp_k": "Efecto de la competencia",
    "precio": "Precio al público", "costo": "Costo de energía",
    "captura": "Captura de demanda", "opex": "OPEX por cargador",
    "capex_sitio": "Capex del sitio", "capex_cargador": "Capex por cargador",
    "tasa": "Tasa de descuento",
}
def rangos() -> dict:
    """RANGOS con la adopción centrada en el ESCENARIO elegido (baja/media/alta).
    Así el escenario define la adopción y el Monte Carlo solo la sacude (±50 % y ±1.5 años);
    si no, 'baja' y 'alta' quedarían en el borde del rango y sus probabilidades no serían comparables."""
    r = dict(RANGOS)
    r["adopt_max"] = (0.5 * ADOPT_MAX, 1.5 * ADOPT_MAX)
    r["adopt_mid"] = (ADOPT_MID - 1.5, ADOPT_MID + 1.5)
    return r


N_SIM = 500
UTIL_MAX = 0.25   # PLACEHOLDER: tope de utilización; un cargador no vende más que esto


def base_params() -> dict:
    """Caso base = valores de config.py (punto medio donde hay max/min)."""
    return dict(adopt_max=ADOPT_MAX, adopt_mid=ADOPT_MID, kwh_ev=KWH_EV_ANIO,
                public_share=PUBLIC_SHARE, dest_kwh=DEST_KWH_BASE, comp_k=0.3,
                precio=float(np.mean(list(PRECIO_PUBLICO.values()))),
                costo=float(np.mean(list(COSTO_ENERGIA.values()))),
                captura=float(np.mean(list(CAPTURA.values()))), opex=OPEX_FIJO,
                capex_sitio=CAPEX_SITIO, capex_cargador=CAPEX_CARGADOR, tasa=TASA_DESC)


def _arrays(z: pd.DataFrame) -> dict:
    comp = (z["n_Tesla"] * PESO_MARCA["Tesla"] + z["n_Evergo"] * PESO_MARCA["Evergo"]
            + z["n_PlugShare"] * PESO_MARCA["PlugShare"])
    return dict(V=z["vph_autom"].to_numpy(float), R=z["riqueza_norm"].to_numpy(float),
                T=z["traffic_idx"].to_numpy(float), comp=comp.to_numpy(float),
                acceso=z["accesibilidad_pendiente"].to_numpy(float))


def _anual(tasa):
    return tasa / (1 - (1 + tasa) ** -VIDA_UTIL)


def _kwh_captado(a: dict, year: int, p: dict):
    ad = ADOPT_BASE + p["adopt_max"] / (1 + np.exp(-ADOPT_K * (year - p["adopt_mid"])))
    kwh = (a["V"] * ad * (1 + a["R"]) * p["kwh_ev"] * p["public_share"]
           + a["T"] * p["dest_kwh"] * (ad / ADOPT_REF))
    return kwh * a["acceso"] / (1 + p["comp_k"] * a["comp"]) * p["captura"]


def dimensionar(a: dict, year: int, p: dict):
    """DECISIÓN con el caso base. Devuelve (n_base, n_eval):
    n_base = cargadores que se construirían (0 si la zona no conviene);
    n_eval = max(1, tamaño) para evaluar cómo le iría a la zona si se construyera.
    Cada cargador adicional debe cubrir su OPEX y su cuota de inversión."""
    kwh_k = _kwh_captado(a, year, p)
    m, fa = max(p["precio"] - p["costo"], 0.01), _anual(p["tasa"])
    costo_carg = p["opex"] + p["capex_cargador"] * fa
    n = np.maximum(1, np.floor(kwh_k / max(KWH_POR_CARGADOR, costo_carg / m)))
    neta = kwh_k * m - n * costo_carg - p["capex_sitio"] * fa
    return np.where(neta > 0, n, 0), n


def simular(a: dict, year: int, p: dict, n):
    """Resultado REAL con n cargadores ya decididos.
    Devuelve (ganancia, neta, kwh_servido)."""
    kwh_k = _kwh_captado(a, year, p)
    m = max(p["precio"] - p["costo"], 0.01)
    servido = np.minimum(kwh_k, n * KW_CARGADOR * 8760 * UTIL_MAX)
    g = servido * m - n * p["opex"]
    capex = p["capex_sitio"] + n * p["capex_cargador"]
    return g, g - anualidad(capex, p["tasa"]), servido


def tornado(z: pd.DataFrame, year: int):
    a, base = _arrays(z), base_params()
    n_base, n_eval = dimensionar(a, year, base)
    obra = n_base > 0                                   # zonas que se construirían
    neta0 = simular(a, year, base, n_eval)[1][obra].sum() / 1e6
    filas = []
    for k, (lo, hi) in rangos().items():
        v_lo = simular(a, year, {**base, k: lo}, n_eval)[1][obra].sum() / 1e6
        v_hi = simular(a, year, {**base, k: hi}, n_eval)[1][obra].sum() / 1e6
        filas.append((NOMBRES[k], min(v_lo, v_hi), max(v_lo, v_hi)))
    t = pd.DataFrame(filas, columns=["supuesto", "neta_total_min_MM", "neta_total_max_MM"])
    t["rango_MM"] = t["neta_total_max_MM"] - t["neta_total_min_MM"]
    return t.sort_values("rango_MM", ascending=False).reset_index(drop=True), neta0


def montecarlo(z: pd.DataFrame, year: int, n_sim=N_SIM, seed=SEED):
    a, rng = _arrays(z), np.random.default_rng(seed + year)
    n_base, n_eval = dimensionar(a, year, base_params())
    G, NE, K = [], [], []
    for _ in range(n_sim):
        p = {**base_params(), **{k: rng.uniform(lo, hi) for k, (lo, hi) in rangos().items()}}
        g, ne, kwh = simular(a, year, p, n_eval)
        G.append(g); NE.append(ne); K.append(kwh)
    return n_base, n_eval, np.array(G), np.array(NE), np.array(K)


def tabla_zonas(z: pd.DataFrame, years=PRED_YEARS, n_sim=N_SIM):
    """Una fila por zona y año con percentiles y probabilidades. Devuelve (df, resumen)."""
    partes, resumen = [], {}
    for y in years:
        n_base, n_eval, G, NE, K = montecarlo(z, y, n_sim)
        pc = lambda M, q: np.percentile(M, q, axis=0)
        prob = (NE > 0).mean(axis=0)
        kwh_p50 = pc(K, 50)
        partes.append(pd.DataFrame({
            "zona": z["zona"].to_numpy(), "year": y, "n_base": n_base, "n_eval": n_eval,
            "ganancia_p10": pc(G, 10), "ganancia_p50": pc(G, 50), "ganancia_p90": pc(G, 90),
            "neta_p10": pc(NE, 10), "neta_p50": pc(NE, 50), "neta_p90": pc(NE, 90),
            "prob_rentable": prob,
            "kwh_p10": pc(K, 10), "kwh_p50": kwh_p50, "kwh_p90": pc(K, 90),
            "co2_evitado_p50": kwh_p50 * CO2_KG_POR_KWH_EVITADO}))
        obra = n_base > 0
        tot = NE[:, obra].sum(axis=1) / 1e6
        resumen[str(y)] = {
            "zonas_que_se_construirian": int(obra.sum()),
            "cargadores_a_construir": int(n_base.sum()),
            "neta_total_MM": {q: float(np.percentile(tot, v)) for q, v in (("p10", 10), ("p50", 50), ("p90", 90))},
            "prob_neta_total_positiva": float((tot > 0).mean()),
            "entre_las_que_se_construirian": {
                "prob_rentable_ge_80": int((prob[obra] >= 0.8).sum()),
                "prob_rentable_20_80": int(((prob[obra] > 0.2) & (prob[obra] < 0.8)).sum()),
                "prob_rentable_le_20": int((prob[obra] <= 0.2).sum())}}
    return pd.concat(partes, ignore_index=True), resumen


def _plot_tornado(t: pd.DataFrame, neta0: float, year: int, path):
    t = t.iloc[::-1]
    y = np.arange(len(t))
    fig, ax = plt.subplots(figsize=(9, 0.42 * len(t) + 1.6))
    ax.barh(y, t["rango_MM"], left=t["neta_total_min_MM"], color="#2b7bba")
    ax.axvline(neta0, color="k", lw=1, ls="--", label=f"Caso base: {neta0:,.0f} M")
    ax.axvline(0, color="#de2d26", lw=0.8)
    ax.set_yticks(y, t["supuesto"])
    ax.set_xlabel("Ganancia neta total anualizada (millones MXN)")
    ax.set_title(f"Qué supuesto mueve más el resultado — {year}\n(zonas que se construirían en el caso base)", fontsize=10)
    ax.legend(loc="lower right")
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def reporte(z: pd.DataFrame, resumen: dict | None = None):
    """Guarda tornado (csv + png) y resumen JSON en OUT."""
    for y in PRED_YEARS:
        t, neta0 = tornado(z, y)
        t.round(1).to_csv(OUT / f"tornado_{y}.csv", index=False, encoding="utf-8")
        _plot_tornado(t, neta0, y, OUT / f"tornado_{y}.png")
        if resumen is not None:
            resumen[str(y)]["neta_total_caso_base_MM"] = float(neta0)
            resumen[str(y)]["supuesto_que_mas_pesa"] = t.loc[0, "supuesto"]
    if resumen is not None:
        (OUT / "resumen_incertidumbre.json").write_text(
            json.dumps(resumen, indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    from data import build_zones
    zones = build_zones()
    _, res = tabla_zonas(zones)
    reporte(zones, res)
    print(json.dumps(res, indent=2, ensure_ascii=False))