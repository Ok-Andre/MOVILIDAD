import json, pickle
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from config import *
from data import build_zones
from simulate import simulate_targets

NUM = ["year", "dens_cargadores", "n_Tesla", "n_Evergo", "n_PlugShare",
       "poblacion", "traffic_idx"]
CAT = ["tipo_zona", "marca_dom", "alcaldia"]   # alcaldia = "zona" categórica
FEATURES = NUM + CAT
TARGETS = ["ganancia_max", "ganancia_min"]

def _pipe(model):
    pre = ColumnTransformer([
        ("num", StandardScaler(), NUM),
        ("cat", OneHotEncoder(handle_unknown="ignore"), CAT),
    ])
    return Pipeline([("pre", pre), ("model", model)])

def _rmse(y, p):
    return float(np.sqrt(mean_squared_error(y, p)))

def train():
    zones = build_zones()
    df = simulate_targets(zones)
    X, Y = df[FEATURES], df[TARGETS]

    # Split por ZONA (no por fila) para evitar fuga entre años de la misma zona
    gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=SEED)
    tr, te = next(gss.split(X, Y, groups=df["zona"]))

    candidatos = {"regresion_lineal": _pipe(LinearRegression())}
    if USE_RF:
        candidatos["random_forest"] = _pipe(RandomForestRegressor(
            n_estimators=200, min_samples_leaf=3, n_jobs=-1, random_state=SEED))

    metricas = {}
    for nombre, pipe in candidatos.items():
        pipe.fit(X.iloc[tr], Y.iloc[tr])
        pred = pipe.predict(X.iloc[te])
        metricas[nombre] = {
            "rmse_max": _rmse(Y.iloc[te]["ganancia_max"], pred[:, 0]),
            "rmse_min": _rmse(Y.iloc[te]["ganancia_min"], pred[:, 1]),
            "rmse_prom": _rmse(Y.iloc[te], pred),
        }
        print(nombre, metricas[nombre])

    mejor = min(metricas, key=lambda n: metricas[n]["rmse_prom"])
    print(f"-> ganador: {mejor}")
    final = candidatos[mejor].fit(X, Y)   # reentrena con todo

    with open(MODEL_PKL, "wb") as f:
        pickle.dump({"model": final, "name": mejor, "features": FEATURES,
                     "targets": TARGETS}, f)
    METRICS_JSON.write_text(json.dumps({"ganador": mejor, "metricas": metricas},
                                       indent=2))
    return final, zones

if __name__ == "__main__":
    train()