from pathlib import Path

BASE = Path(r"/Users/andre/Documents/ELECTROMOV/Electrolineras")
ZONES_GEOJSON = BASE / "html" / "viabilidad_cdmx_v2.geojson"
CENSUS_CSV    = BASE / "clean" / "RESAGEBURB_09CSV20.csv"
CHARGERS_JSON = BASE / "datasets" / "all_chargers_geo.json"

OUT = BASE / "salidas"
OUT.mkdir(exist_ok=True)
MODEL_PKL = OUT / "modelo.pkl"
PRED_CSV  = OUT / "predicciones.csv"
PRED_JSON = OUT / "predicciones.json"
METRICS_JSON = OUT / "metricas.json"

# ---- Switches ----
USE_RF = True            # False => solo regresión lineal (modo "sin tiempo")
TRAIN_YEARS = list(range(2025, 2036))
PRED_YEARS = [2030, 2035]
SEED = 42

# ---- Supuestos de la simulación (EDITABLES; son SUPUESTOS, no datos) ----
ADOPT_BASE = 0.01        # % de autos eléctricos hoy
ADOPT_MAX = 0.30         # techo de la curva logística
ADOPT_K, ADOPT_MID = 0.35, 2033
KWH_EV_ANIO = 2500       # kWh/año por EV
PUBLIC_SHARE = 0.20      # ~80% se carga en casa (ver README)
DEST_KWH_BASE = 300_000  # kWh/año de carga de destino con tráfico máximo
OPEX_FIJO = 60_000       # MXN/año por estación
MARGEN = {"max": 5.5, "min": 2.5}        # MXN/kWh
CAPTURA = {"max": 1.25, "min": 0.60}     # multiplicador de captura
PESO_MARCA = {"Tesla": 1.5, "Evergo": 1.0, "PlugShare": 0.7}  # peso competitivo