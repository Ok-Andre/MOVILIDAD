import numpy as np
import pandas as pd
from config import *

def adopcion(year):
    """Curva logística de adopción de EVs (supuesto; depende de ESCENARIO)."""
    year = np.asarray(year, dtype=float)
    return ADOPT_BASE + ADOPT_MAX / (1 + np.exp(-ADOPT_K * (year - ADOPT_MID)))

def margen(year, k):
    """Margen MXN/kWh = precio público - costo de energía de ese caso y año."""
    year = np.asarray(year, dtype=float)
    costo = COSTO_ENERGIA[k] * (1 + COSTO_DERIVA) ** (year - COSTO_BASE_YEAR)
    return PRECIO_PUBLICO[k] - costo

def capex_total(n_cargadores, factor=1.0):
    """Inversión de un sitio con n cargadores (MXN). Si n = 0 no se construye: 0."""
    n = np.asarray(n_cargadores, dtype=float)
    return np.where(n > 0, factor * (CAPEX_SITIO + n * CAPEX_CARGADOR), 0.0)

def anualidad(capex, tasa=TASA_DESC, n=VIDA_UTIL):
    """Costo anual equivalente de la inversión inicial."""
    return np.asarray(capex, dtype=float) * tasa / (1 - (1 + tasa) ** -n)

def financieros(ganancia, n_cargadores, factor=1.0):
    """ganancia = ganancia operativa anual del sitio (MXN). Devuelve (payback en años,
    ganancia neta anualizada). Payback = NaN si la ganancia operativa no es positiva."""
    g = np.asarray(ganancia, dtype=float)
    capex = capex_total(n_cargadores, factor)
    with np.errstate(divide="ignore", invalid="ignore"):
        payback = np.where(g > 0, capex / g, np.nan)
    return payback, g - anualidad(capex)

def expand_years(zones: pd.DataFrame, years) -> pd.DataFrame:
    df = zones.loc[zones.index.repeat(len(years))].copy()
    df["year"] = np.tile(years, len(zones))
    return df.reset_index(drop=True)

def simulate_targets(zones: pd.DataFrame, years=TRAIN_YEARS, seed=SEED):
    """Panel zona×año con objetivos SINTÉTICOS por escenario max/min:
      - n_cargadores: cuántos cargadores se construirían (0 = no conviene)
      - ganancia: operativa anual (MXN) si se construye (>= 0 por construcción)
    Regla: solo se construye si la demanda captada cubre el OPEX de al menos un
    cargador; no hay cargadores 'a medias' (antes np.ceil inflaba el total y hacía
    negativas casi todas las ganancias del caso min)."""
    rng = np.random.default_rng(seed)
    df = expand_years(zones, years)
    ad = adopcion(df["year"])

    evs = df["vph_autom"] * ad * (1 + df["riqueza_norm"])
    kwh = (evs * KWH_EV_ANIO * PUBLIC_SHARE
           + df["traffic_idx"] * DEST_KWH_BASE * (ad / ADOPT_REF))

    comp = (df["n_Tesla"] * PESO_MARCA["Tesla"]
            + df["n_Evergo"] * PESO_MARCA["Evergo"]
            + df["n_PlugShare"] * PESO_MARCA["PlugShare"])
    captura = 1 / (1 + 0.3 * comp)

    for k in ("max", "min"):
        ruido = rng.lognormal(0, 0.08, len(df))
        kwh_k = kwh * captura * CAPTURA[k] * ruido             # kWh/año captados
        m = np.maximum(margen(df["year"], k), 0.01)            # MXN/kWh
        kwh_be = OPEX_FIJO / m                                 # kWh/año para que 1 cargador cubra su OPEX
        por_cargador = np.maximum(KWH_POR_CARGADOR, kwh_be)    # nunca dimensionar bajo el equilibrio
        n_k = np.where(kwh_k >= kwh_be,
                       np.maximum(1, np.floor(kwh_k / por_cargador)), 0)
        df[f"n_cargadores_{k}"] = n_k
        df[f"ganancia_{k}"] = kwh_k * m - n_k * OPEX_FIJO
    return df