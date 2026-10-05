import numpy as np
import pandas as pd
from config import *

def adopcion(year):
    """Curva logística de adopción de EVs (supuesto)."""
    year = np.asarray(year, dtype=float)
    return ADOPT_BASE + ADOPT_MAX / (1 + np.exp(-ADOPT_K * (year - ADOPT_MID)))

def expand_years(zones: pd.DataFrame, years) -> pd.DataFrame:
    df = zones.loc[zones.index.repeat(len(years))].copy()
    df["year"] = np.tile(years, len(zones))
    return df.reset_index(drop=True)

def simulate_targets(zones: pd.DataFrame, years=TRAIN_YEARS, seed=SEED):
    """Panel zona×año con ganancia_max / ganancia_min SINTÉTICAS (MXN/año)."""
    rng = np.random.default_rng(seed)
    df = expand_years(zones, years)
    ad = adopcion(df["year"])

    evs = df["vph_autom"] * ad * (1 + df["riqueza_norm"])
    kwh = (evs * KWH_EV_ANIO * PUBLIC_SHARE
           + df["traffic_idx"] * DEST_KWH_BASE * (ad / ADOPT_MAX))

    comp = (df["n_Tesla"] * PESO_MARCA["Tesla"]
            + df["n_Evergo"] * PESO_MARCA["Evergo"]
            + df["n_PlugShare"] * PESO_MARCA["PlugShare"])
    captura = 1 / (1 + 0.3 * comp)

    for k in ("max", "min"):
        ruido = rng.lognormal(0, 0.08, len(df))
        df[f"ganancia_{k}"] = (kwh * captura * CAPTURA[k] * MARGEN[k] * ruido
                               - OPEX_FIJO)
    return df