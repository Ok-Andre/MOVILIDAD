import os
from pathlib import Path

BASE = Path(r"/Users/andre/Documents/ELECTROMOV/Electrolineras")
ZONES_GEOJSON = BASE / "html" / "viabilidad_cdmx_v2.geojson"
CENSUS_CSV    = BASE / "clean" / "RESAGEBURB_09CSV20.csv"
CHARGERS_JSON = BASE / "datasets" / "all_chargers_geo.json"

# ---- Escenario de adopción de EVs: "baja" | "media" | "alta" ----
# Se elige con la variable de entorno ESCENARIO o con `python run_all.py baja`.
ESCENARIO_FRONT = "media"                      # el que se copia a html/ para el front
ESCENARIO = os.environ.get("ESCENARIO", ESCENARIO_FRONT)

OUT_ROOT = BASE / "salidas"
OUT = OUT_ROOT if ESCENARIO == ESCENARIO_FRONT else OUT_ROOT / ESCENARIO
OUT.mkdir(parents=True, exist_ok=True)
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
# Adopción: logística  ADOPT_BASE + max / (1 + exp(-k (año - mid)))
ESCENARIOS_ADOPCION = {
    "baja":  dict(max=0.10, k=0.30, mid=2036),
    "media": dict(max=0.20, k=0.35, mid=2034),
    "alta":  dict(max=0.30, k=0.35, mid=2033),   # = supuesto original
}
ADOPT_BASE = 0.01        # % de autos eléctricos hoy
ADOPT_MAX = ESCENARIOS_ADOPCION[ESCENARIO]["max"]
ADOPT_K   = ESCENARIOS_ADOPCION[ESCENARIO]["k"]
ADOPT_MID = ESCENARIOS_ADOPCION[ESCENARIO]["mid"]
ADOPT_REF = 0.30         # referencia FIJA para el tráfico de destino (no cambia con el escenario)

KWH_EV_ANIO = 2500       # kWh/año por EV
PUBLIC_SHARE = 0.20      # ~80% se carga en casa (ver README)
DEST_KWH_BASE = 300_000  # kWh/año de carga de destino con tráfico máximo
OPEX_FIJO = 60_000       # MXN/año por estación

# ---- Margen = precio al público - costo de energía (MXN/kWh) ----
# Costo: precio medio comercial 2024 de la CFE (Informe Anual 2024, p.127).
# OJO: es promedio nacional; un cargador con poco uso paga cargos por demanda
# que encarecen el kWh efectivo.
COSTO_ENERGIA = 4.00
COSTO_DERIVA = 0.0       # variación real anual del costo (0 = pesos reales constantes)
COSTO_BASE_YEAR = 2024
# PLACEHOLDER: precios al público por VERIFICAR (Evergo/Tesla/PlugShare).
# Estos valores reproducen los márgenes anteriores (5.5 y 2.5).
PRECIO_PUBLICO = {"max": 10.5, "min": 8.0}
MARGEN = {k: PRECIO_PUBLICO[k] - COSTO_ENERGIA for k in PRECIO_PUBLICO}  # a año base
CAPTURA = {"max": 1.25, "min": 0.60}     # multiplicador de captura
PESO_MARCA = {"Tesla": 1.5, "Evergo": 1.0, "PlugShare": 0.7}  # peso competitivo

# ---- Inversión (PLACEHOLDERS sin fuente: reemplazar con cotización real) ----
CAPEX_ESTACION = 500_000  # MXN por estación (hardware + instalación + conexión)
VIDA_UTIL = 10            # años
TASA_DESC = 0.12          # tasa de descuento anual