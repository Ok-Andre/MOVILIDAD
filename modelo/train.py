import json, pickle
import numpy as np
from sklearn.compose import ColumnTransformer, TransformedTargetRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from config import *
from data import build_zones
from simulate import simulate_targets

# vph_autom, riqueza_norm y destinos_raw son los motores de la fórmula de simulate.py:
# si el modelo no los ve, no puede aprender la relación.
NUM = ["year", "dens_cargadores", "n_Tesla", "n_Evergo", "n_PlugShare",
       "poblacion", "traffic_idx", "vph_autom", "riqueza_norm", "destinos_raw",
       "accesibilidad_pendiente"]
CAT = ["tipo_zona", "marca_dom", "alcaldia"]   # alcaldia = "zona" categórica
FEATURES = NUM + CAT
TARGETS = ["ganancia_max", "ganancia_min", "n_cargadores_max", "n_cargadores_min"]

def _pipe(model):
    pre = ColumnTransformer([
        ("num", StandardScaler(), NUM),
        ("cat", OneHotEncoder(handle_unknown="ignore"), CAT),
    ])
    pipe = Pipeline([("pre", pre), ("model", model)])
    # Objetivos en escalas muy distintas (MXN vs. # de cargadores): se estandarizan
    # para que el random forest los pese igual.
    return TransformedTargetRegressor(regressor=pipe, transformer=StandardScaler())

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
        yt = Y.iloc[te]
        metricas[nombre] = {
            "rmse_max": _rmse(yt["ganancia_max"], pred[:, 0]),
            "rmse_min": _rmse(yt["ganancia_min"], pred[:, 1]),
            "rmse_prom": _rmse(yt[["ganancia_max", "ganancia_min"]], pred[:, :2]),
            "rmse_n_cargadores_max": _rmse(yt["n_cargadores_max"], pred[:, 2]),
            "rmse_n_cargadores_min": _rmse(yt["n_cargadores_min"], pred[:, 3]),
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