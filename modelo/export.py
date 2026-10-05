import json, pickle
import numpy as np
import pandas as pd
import shutil
from config import *
from data import build_zones
from simulate import expand_years

shutil.copy(PRED_JSON, BASE / "html" / "predicciones.json")

def predict_all(zones=None) -> pd.DataFrame:
    zones = build_zones() if zones is None else zones
    with open(MODEL_PKL, "rb") as f:
        art = pickle.load(f)

    df = expand_years(zones, PRED_YEARS)
    p = art["model"].predict(df[art["features"]])
    mx, mn = p[:, 0], p[:, 1]
    df["ganancia_max"] = np.maximum(mx, mn)   # garantiza max >= min
    df["ganancia_min"] = np.minimum(mx, mn)

    # score 0-1 por año (comparable entre zonas del mismo año)
    prom = (df["ganancia_max"] + df["ganancia_min"]) / 2
    df["score_viabilidad"] = prom.groupby(df["year"]).transform(
        lambda s: (s - s.min()) / (s.max() - s.min()))

    out = df.rename(columns={"zona": "zona", "year": "año"})
    cols = ["zona", "año", "ganancia_max", "ganancia_min", "score_viabilidad",
            "alcaldia", "lat", "lon"]   # alcaldia/lat/lon extra: útiles para el mapa
    return out[cols].round({"ganancia_max": 0, "ganancia_min": 0,
                            "score_viabilidad": 4, "lat": 5, "lon": 5})

def export():
    df = predict_all()
    df.to_csv(PRED_CSV, index=False, encoding="utf-8")
    PRED_JSON.write_text(df.to_json(orient="records", force_ascii=False),
                         encoding="utf-8")
    print(f"{len(df)} filas -> {PRED_CSV.name}, {PRED_JSON.name}")
    return df

if __name__ == "__main__":
    export()