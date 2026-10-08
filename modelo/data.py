import geopandas as gpd
import numpy as np
import pandas as pd
from config import *

def _minmax(s):
    r = s.max() - s.min()
    return (s - s.min()) / r if r else s * 0

def _load_census():
    df = pd.read_csv(CENSUS_CSV, dtype=str)
    df = df[(df["MZA"] == "000") & (df["AGEB"] != "0000")].copy()
    df["CVEGEO"] = (df["ENTIDAD"].str.zfill(2) + df["MUN"].str.zfill(3)
                    + df["LOC"].str.zfill(4) + df["AGEB"].str.zfill(4))
    df["poblacion"] = pd.to_numeric(df["POBTOT"].replace(["*", "N/D"], np.nan),
                                    errors="coerce")
    return df[["CVEGEO", "poblacion"]]

def _load_chargers():
    """all_chargers_geo.json generado por build_chargers.py (ya sin duplicados)."""
    ch = gpd.read_file(CHARGERS_JSON)
    if "n_puertos" not in ch:
        ch["n_puertos"] = 1
    ch["n_puertos"] = ch["n_puertos"].fillna(1).clip(lower=1)
    return ch

def _load_pendiente():
    if not PENDIENTE_CSV.exists():
        raise FileNotFoundError(
            f"No encontré {PENDIENTE_CSV}. Genera el dataset primero con "
            "`python pendiente.py` desde la carpeta modelo."
        )
    pendiente = pd.read_csv(PENDIENTE_CSV, dtype={"zona": str})
    requeridas = {"zona", "pendiente_media"}
    if not requeridas.issubset(pendiente.columns):
        raise ValueError(
            f"{PENDIENTE_CSV} debe incluir las columnas "
            f"{', '.join(sorted(requeridas))}."
        )
    pendiente["zona"] = pendiente["zona"].str.zfill(13)
    if pendiente["zona"].duplicated().any():
        raise ValueError(f"{PENDIENTE_CSV} contiene zonas duplicadas.")
    pendiente["pendiente_media"] = pd.to_numeric(
        pendiente["pendiente_media"], errors="coerce"
    )
    if (~np.isfinite(pendiente["pendiente_media"])).any() or (
        pendiente["pendiente_media"] < 0
    ).any():
        raise ValueError(
            f"{PENDIENTE_CSV} contiene pendientes faltantes, no numéricas o negativas."
        )
    return pendiente[["zona", "pendiente_media"]]

def _tipo_zona(r):
    if r["destinos_raw"] >= 3:
        return "comercial"
    if r["riqueza_norm"] >= 0.6:
        return "residencial_alto"
    if r["riqueza_norm"] >= 0.3:
        return "residencial_medio"
    return "periferia"

def build_zones() -> pd.DataFrame:
    z = gpd.read_file(ZONES_GEOJSON)
    z["CVEGEO"] = z["CVEGEO"].astype(str).str.zfill(13)
    z = z.merge(_load_census(), on="CVEGEO", how="left")
    z = z.merge(
        _load_pendiente().rename(columns={"zona": "CVEGEO"}),
        on="CVEGEO",
        how="left",
    )
    sin_pendiente = z["pendiente_media"].isna()
    if sin_pendiente.any():
        zonas = z.loc[sin_pendiente, "CVEGEO"].tolist()
        raise ValueError(
            f"Falta pendiente para {len(zonas)} AGEB en {PENDIENTE_CSV}; "
            f"ejemplos: {', '.join(zonas[:5])}."
        )
    z["accesibilidad_pendiente"] = np.exp(
        -np.log(2) * z["pendiente_media"] / PENDIENTE_MITAD_ACCESIBILIDAD_PCT
    )

    zm = z.to_crs(32614)
    z["area_km2"] = zm.area / 1e6
    cent = zm.centroid.to_crs(4326)
    z["lat"], z["lon"] = cent.y, cent.x

    # Cargadores (en PUERTOS) por AGEB y por marca
    ch = _load_chargers().to_crs(z.crs)
    sj = gpd.sjoin(ch, z[["CVEGEO", "geometry"]], how="inner", predicate="within")
    cnt = sj.groupby(["CVEGEO", "red"])["n_puertos"].sum().unstack(fill_value=0)
    for marca in ["Tesla", "Evergo", "PlugShare"]:
        if marca not in cnt:
            cnt[marca] = 0
    cnt = cnt[["Tesla", "Evergo", "PlugShare"]].add_prefix("n_")
    z = z.merge(cnt, left_on="CVEGEO", right_index=True, how="left")

    ncols = ["n_Tesla", "n_Evergo", "n_PlugShare"]
    z[ncols] = z[ncols].fillna(0)
    z["n_total"] = z[ncols].sum(axis=1)
    z["dens_cargadores"] = z["n_total"] / z["area_km2"].clip(lower=0.05)
    z["marca_dom"] = np.where(z["n_total"] == 0, "Ninguna",
                              z[ncols].idxmax(axis=1).str.replace("n_", ""))

    # '*' del censo = dato confidencial, NO cero -> mediana de la alcaldía
    z["vph_autom"] = (z["VPH_AUTOM"]
                      .fillna(z.groupby("NOM_MUN")["VPH_AUTOM"].transform("median"))
                      .fillna(0))
    z["poblacion"] = z["poblacion"].fillna(z["poblacion"].median())
    z["tipo_zona"] = z.apply(_tipo_zona, axis=1)

    z["traffic_idx"] = 0.5 * _minmax(np.log1p(z["destinos_raw"])) \
                     + 0.5 * _minmax(z["vph_autom"])

    z = z.rename(columns={"CVEGEO": "zona", "NOM_MUN": "alcaldia"})
    cols = ["zona", "alcaldia", "lat", "lon", "poblacion", "vph_autom",
            "destinos_raw", "riqueza_norm", "area_km2", "n_Tesla", "n_Evergo",
            "n_PlugShare", "n_total", "dens_cargadores", "marca_dom",
            "tipo_zona", "traffic_idx", "pendiente_media",
            "accesibilidad_pendiente"]
    return pd.DataFrame(z[cols]).reset_index(drop=True)