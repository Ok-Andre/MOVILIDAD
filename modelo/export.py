# -*- coding: utf-8 -*-
import json
import numpy as np
import pandas as pd
import shutil
from config import *
from data import build_zones
from simulate import financieros, capex_total
from incertidumbre import tabla_zonas, reporte

def predict_all(zones=None, resumen_out=None) -> pd.DataFrame:
    """Predicciones 2026..2035 con rangos estadisticos (Monte Carlo).
    ganancia_max / ganancia_min = percentiles 90 / 10 (se conservan los nombres para el front)."""
    zones = build_zones() if zones is None else zones
    t, resumen_dict = tabla_zonas(zones, PRED_YEARS)
    if resumen_out is not None:
        resumen_out.update(resumen_dict)
    df = t.merge(zones[["zona", "alcaldia", "lat", "lon", "n_total", "poblacion"]], on="zona", how="left")

    df["ganancia_max"], df["ganancia_min"] = df["ganancia_p90"], df["ganancia_p10"]
    # Cargadores = DECISION con el caso base (igual en max y min); 0 = no conviene.
    df["n_cargadores_max"] = df["n_base"].astype(int)
    df["n_cargadores_min"] = df["n_base"].astype(int)
    df["neta_max"], df["neta_min"] = df["neta_p90"], df["neta_p10"]

    # ---- Indicadores para las gráficas temáticas (sustentabilidad/economía) ----
    # Inversión del sitio (0 si el caso base no construiría). Coincide con simulate.capex_total.
    df["capex_total"] = capex_total(df["n_cargadores_max"])
    # Empleos directos estimados (SUPUESTO: config.EMPLEOS_POR_CARGADOR).
    df["empleo_est"] = df["n_cargadores_max"] * EMPLEOS_POR_CARGADOR
    # CO2 evitado (SUPUESTO: config.CO2_KG_POR_KWH_EVITADO) a partir del kWh servido.
    df["co2_evitado"] = df["kwh_p50"] * CO2_KG_POR_KWH_EVITADO
    df["poblacion"] = df["poblacion"].fillna(0)

    for k in ("max", "min"):
        g, n, ne = df[f"ganancia_{k}"], df[f"n_cargadores_{k}"], df["n_eval"]
        df[f"viable_{k}"] = n >= 1
        df[f"nuevos_{k}"] = np.maximum(0, n - df["n_total"]).astype(int)
        df[f"payback_{k}"], _ = financieros(g, ne)
        for f in CAPEX_FACTORES:
            if f != 1.0:
                df[f"payback_{k}_capex{int(f * 100)}"], _ = financieros(g, ne, f)
    df["escenario"] = ESCENARIO

    df["score_viabilidad"] = df["neta_p50"].groupby(df["year"]).rank(pct=True)

    out = df.rename(columns={"year": "a\u00f1o"})
    sens = [f"payback_{k}_capex{int(f * 100)}" for f in CAPEX_FACTORES if f != 1.0
            for k in ("max", "min")]
    cols = ["zona", "a\u00f1o", "ganancia_max", "ganancia_min", "ganancia_p50",
            "prob_rentable", "score_viabilidad",
            "n_cargadores_max", "n_cargadores_min", "viable_max", "viable_min",
            "nuevos_max", "nuevos_min", "n_total", "poblacion",
            "payback_max", "payback_min", "neta_max", "neta_min", "neta_p50", *sens,
            "kwh_p10", "kwh_p50", "kwh_p90", "co2_evitado", "capex_total", "empleo_est",
            "escenario", "alcaldia", "lat", "lon"]
    return out[cols].round({"ganancia_max": 0, "ganancia_min": 0, "ganancia_p50": 0,
                            "neta_max": 0, "neta_min": 0, "neta_p50": 0,
                            "kwh_p10": 0, "kwh_p50": 0, "kwh_p90": 0,
                            "co2_evitado": 0, "capex_total": 0, "empleo_est": 1,
                            "poblacion": 0,
                            "payback_max": 1, "payback_min": 1, **{c: 1 for c in sens},
                            "prob_rentable": 3,
                            "score_viabilidad": 4, "lat": 5, "lon": 5})

def resumen(df: pd.DataFrame):
    print(f"Cargadores existentes dentro de las AGEB: {int(df.drop_duplicates('zona')['n_total'].sum())}")
    col_year = "a\u00f1o" if "a\u00f1o" in df.columns else "year"
    for y_val, d in df.groupby(col_year):
        o = d[d.viable_max]
        print(f"{y_val}: se construirian {d.n_cargadores_max.sum()} cargadores en {len(o)} zonas "
              f"(nuevos netos: {d.nuevos_max.sum()}) | prob_rentable>=80%: {(o.prob_rentable >= 0.8).sum()} | "
              f"20%-80%: {((o.prob_rentable > 0.2) & (o.prob_rentable < 0.8)).sum()} | <=20%: {(o.prob_rentable <= 0.2).sum()}")

def export():
    zones = build_zones()
    res = {}
    df = predict_all(zones, res)
    reporte(zones, res)
    df.to_csv(PRED_CSV, index=False, encoding="utf-8")
    PRED_JSON.write_text(df.to_json(orient="records", force_ascii=False),
                         encoding="utf-8")
    html_dir = BASE / "html"
    if html_dir.exists():
        shutil.copy(PRED_JSON, html_dir / f"predicciones_{ESCENARIO}.json")
        if ESCENARIO == ESCENARIO_FRONT:
            shutil.copy(PRED_JSON, html_dir / "predicciones.json")

        pred_dir = html_dir / "predicciones"
        pred_dir.mkdir(parents=True, exist_ok=True)

        col_year = "a\u00f1o" if "a\u00f1o" in df.columns else "year"
        for y_val, df_year in df.groupby(col_year):
            year_records = df_year.to_dict(orient="records")
            year_json = json.dumps(year_records, ensure_ascii=False, indent=2)
            (pred_dir / f"predicciones_{y_val}.json").write_text(year_json, encoding="utf-8")
            (pred_dir / f"{y_val}.json").write_text(year_json, encoding="utf-8")
            (pred_dir / f"predicciones_{ESCENARIO}_{y_val}.json").write_text(year_json, encoding="utf-8")

        shutil.copy(PRED_JSON, pred_dir / f"predicciones_{ESCENARIO}.json")
        if ESCENARIO == ESCENARIO_FRONT:
            shutil.copy(PRED_JSON, pred_dir / "predicciones.json")

    print(f"{len(df)} filas -> {PRED_CSV.name}, {PRED_JSON.name}")
    resumen(df)
    return df

if __name__ == "__main__":
    export()
