import numpy as np
import pandas as pd
from config import *

def adopcion(year):
    """Curva logística de adopción de EVs (supuesto; depende de ESCENARIO)."""
    year = np.asarray(year, dtype=float)
    return ADOPT_BASE + ADOPT_MAX / (1 + np.exp(-ADOPT_K * (year - ADOPT_MID)))

def margen(year, k):
    """Margen MXN/kWh = precio público - costo de energía de ese año."""
    year = np.asarray(year, dtype=float)
    costo = COSTO_ENERGIA * (1 + COSTO_DERIVA) ** (year - COSTO_BASE_YEAR)
    return PRECIO_PUBLICO[k] - costo

def anualidad(capex=None, tasa=TASA_DESC, n=VIDA_UTIL):
    """Costo anual equivalente de la inversión inicial."""
    capex = CAPEX_ESTACION if capex is None else capex
    return capex * tasa / (1 - (1 + tasa) ** -n)

def financieros(ganancia):
    """ganancia = ganancia operativa anual (MXN). Devuelve (payback en años, ganancia neta
    anualizada). Payback = NaN si la ganancia operativa no es positiva."""
    g = np.asarray(ganancia, dtype=float)
    with np.errstate(divide="ignore", invalid="ignore"):
        payback = np.where(g > 0, CAPEX_ESTACION / g, np.nan)
    return payback, g - anualidad()

def expand_years(zones: pd.DataFrame, years) -> pd.DataFrame:
    df = zones.loc[zones.index.repeat(len(years))].copy()
    df["year"] = np.tile(years, len(zones))
    return df.reset_index(drop=True)

def simulate_targets(zones: pd.DataFrame, years=TRAIN_YEARS, seed=SEED):
    """Panel zona×año con ganancia_max / ganancia_min SINTÉTICAS (MXN/año, antes de capex)."""
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
        df[f"ganancia_{k}"] = (kwh * captura * CAPTURA[k] * margen(df["year"], k) * ruido
                               - OPEX_FIJO)
    return df