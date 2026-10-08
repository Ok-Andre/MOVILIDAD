import os
from pathlib import Path

# Raíz del proyecto = carpeta que contiene modelo/, html/, clean/, datasets/
BASE = Path(__file__).resolve().parents[1]
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
PRED_YEARS = list(range(2026, 2036))
SEED = 42

# ---- Supuestos de la simulación (EDITABLES; son SUPUESTOS, no datos) ----
# Adopción: logística  ADOPT_BASE + max / (1 + exp(-k (año - mid)))
ESCENARIOS_ADOPCION = {
    "baja":  dict(max=0.10, k=0.30, mid=2036),
    "media": dict(max=0.20, k=0.35, mid=2034),
    "alta":  dict(max=0.30, k=0.35, mid=2033),   # = supuesto original
}
ADOPT_BASE = 0.005       # PLACEHOLDER. Parque nacional BEV+PHEV ≈ 0.3% (EMA: 107,633 en 2024; parque total por confirmar en INEGI). CDMX es mayor.
ADOPT_MAX = ESCENARIOS_ADOPCION[ESCENARIO]["max"]
ADOPT_K   = ESCENARIOS_ADOPCION[ESCENARIO]["k"]
ADOPT_MID = ESCENARIOS_ADOPCION[ESCENARIO]["mid"]
ADOPT_REF = 0.30         # referencia FIJA para el tráfico de destino (no cambia con el escenario)

KWH_EV_ANIO = 2500       # kWh/año por EV
PUBLIC_SHARE = 0.20      # ~80% se carga en casa (ver README)
DEST_KWH_BASE = 300_000  # kWh/año de carga de destino con tráfico máximo
OPEX_FIJO = 60_000       # MXN/año POR CARGADOR (antes: por estación)

# ---- Margen = precio al público - costo de energía (MXN/kWh) ----
# Costo "max": precio medio comercial 2024 de la CFE (Informe Anual 2024, p.127).
# Costo "min": PLACEHOLDER (5.0) que supone cargos por demanda por poco uso; sin fuente.
COSTO_ENERGIA = {"max": 4.00, "min": 5.00}
COSTO_DERIVA = 0.0       # variación real anual del costo (0 = pesos reales constantes)
COSTO_BASE_YEAR = 2024
# Precio al público: Evergo ≈ 10.5 MXN/kWh (prensa, 2026); rango observado 7-15.
# No hay tarifa vigente de Tesla en México; 8.0 es un valor conservador. VERIFICAR.
PRECIO_PUBLICO = {"max": 10.5, "min": 8.0}
MARGEN = {k: PRECIO_PUBLICO[k] - COSTO_ENERGIA[k] for k in PRECIO_PUBLICO}  # a año base

# Captura = fracción de la demanda de la zona que llega a la estación.
# NUNCA > 1: la demanda total se conserva (antes max=1.25 "capturaba" 120% de la demanda).
# PLACEHOLDERS: calibrar con sesiones reales de algún operador.
CAPTURA = {"max": 1.0, "min": 0.5}
PESO_MARCA = {"Tesla": 1.5, "Evergo": 1.0, "PlugShare": 0.7}  # peso competitivo

# ---- Capacidad: cuántos cargadores caben en la demanda de una AGEB ----
KW_CARGADOR = 50          # kW de un cargador DC (p. ej. los 3 de 50 kW de Evergo en Metrópoli Patriotismo)

# ---- Indicadores de sustentabilidad y desarrollo económico ----
# --- CO2 evitado (con fuentes) ---
# Factor de emisión de la red (SEN) 2024: SEMARNAT, aviso del 28-feb-2025
# (usar el factor 2024 en el reporte COA 2026 mientras se publica el de 2025).
FACTOR_EMISION_SEN = 0.444            # kg CO2e/kWh
# CO2 por litro de gasolina: INECC / Ecovehículos = 2,331.65 g/L.
CO2_POR_LITRO_GASOLINA = 2.33         # kg CO2/L
# Rendimiento de autos ligeros nuevos a gasolina: promedio 2011 (ICCT) y meta
# NOM-163 para 2016. Equivale a ~178-160 g CO2/km, consistente con el 180 g/km
# del ICCT/INE (2.33 / 13.1 = 0.178 kg/km).
RENDIMIENTO_GASOLINA_KM_L = (13.1, 14.6)   # km/L
# Consumo de un EV: LEDS LAC (2017), movilidad eléctrica en México.
RENDIMIENTO_EV_KM_KWH = (5.4, 6.0)    # km/kWh
# CO2 NETO evitado por kWh servido = (gasolina kg/km - red kg/km) x km/kWh.
# Con los puntos medios (13.85 km/L y 5.7 km/kWh): (0.1682 - 0.0779) x 5.7
# = ~0.515 kg/kWh. El rango completo va de ~0.42 a ~0.62 kg/kWh.
CO2_KG_POR_KWH_EVITADO = round(
    (CO2_POR_LITRO_GASOLINA / (sum(RENDIMIENTO_GASOLINA_KM_L) / 2)
     - FACTOR_EMISION_SEN / (sum(RENDIMIENTO_EV_KM_KWH) / 2))
    * (sum(RENDIMIENTO_EV_KM_KWH) / 2), 3)
# SUPUESTO: empleos directos estimados por cargador instalado (operación y
# mantenimiento). Reemplazar con datos de algún operador o cotización real.
EMPLEOS_POR_CARGADOR = 0.5
# Utilización con la que se DIMENSIONA un sitio. Ojo: el punto de equilibrio es
# OPEX_FIJO / (margen * KW_CARGADOR * 8760) (≈4.6% en el caso min, ≈2.1% en el max).
# Si UTIL_OBJETIVO queda cerca del equilibrio, la ganancia es ~0 y muy sensible.
UTIL_OBJETIVO = 0.05      # fracción del año a potencia nominal (2%-8% en estaciones públicas; contexto europeo)
KWH_POR_CARGADOR = KW_CARGADOR * 8760 * UTIL_OBJETIVO   # = 21,900 kWh/año (tope: ignora el taper)

# ---- Inversión (PLACEHOLDERS: reemplazar con cotización real) ----
# Capex total de un sitio = CAPEX_SITIO + n_cargadores * CAPEX_CARGADOR
CAPEX_CARGADOR = 100_000  # MXN por cargador DC (Expansión 2021: equipo de 50 a 100 mil)
CAPEX_SITIO = 400_000     # MXN: transformador, obra y conexión (1 cargador + sitio = 500 mil)
CAPEX_FACTORES = (0.5, 1.0, 2.0)   # sensibilidad: 250 mil / 500 mil / 1 millón para 1 cargador
VIDA_UTIL = 10            # años
TASA_DESC = 0.12          # tasa de descuento anual