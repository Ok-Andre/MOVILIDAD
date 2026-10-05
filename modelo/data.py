import geopandas as gpd
import numpy as np
import pandas as pd
from config import *

def _minmax(s):
    r = s.max() - s.min()
    return (s - s.min()) / r if r else s * 0

def _load_census():
    """Misma lógica de llave CVEGEO que tu process_spatial.py."""
    df = pd.read_csv(CENSUS_CSV, dtype=str)
    df = df[(df["MZA"] == "000") & (df["AGEB"] != "0000")].copy()
    df["CVEGEO"] = (df["ENTIDAD"].str.zfill(2) + df["MUN"].str.zfill(3)
                    + df["LOC"].str.zfill(4) + df["AGEB"].str.zfill(4))
    df["poblacion"] = pd.to_numeric(df["POBTOT"].replace(["*", "N/D"], np.nan),
                                    errors="coerce")
    return df[["CVEGEO", "poblacion"]]

def _load_chargers():
    ch = gpd.read_file(CHARGERS_JSON)
    # Limpieza: Evergo trae sufijo ", México" y filas repetidas.
    ch["nombre_n"] = (ch["nombre"].fillna("").str.replace(", México", "", regex=False)
                      .str.strip().str.lower())
    ch["lon"] = ch.geometry.x.round(5)
    ch["lat"] = ch.geometry.y.round(5)
    # OJO: esto colapsa sitios multipuerto (ej. Metropoli Patriotismo x5).
    # Si luego tienen datos de puertos, cambia por conteo real.
    return ch.drop_duplicates(["red", "nombre_n", "lon", "lat"])

def _tipo_zona(r):
    if r["destinos_raw"] >= 3:
        return "comercial"
    if r["riqueza_norm"] >= 0.6:
        return "residencial_alto"
    if r["riqueza_norm"] >= 0.3:
        return "residencial_medio"
    return "periferia"

def build_zones() -> pd.DataFrame:
    """Una fila por AGEB con todas las features estáticas."""
    z = gpd.read_file(ZONES_GEOJSON)
    z = z.merge(_load_census(), on="CVEGEO", how="left")

    zm = z.to_crs(32614)  # UTM 14N para área en metros
    z["area_km2"] = zm.area / 1e6
    cent = zm.centroid.to_crs(4326)
    z["lat"], z["lon"] = cent.y, cent.x

    # Cargadores por AGEB y por marca
    ch = _load_chargers().to_crs(z.crs)
    sj = gpd.sjoin(ch, z[["CVEGEO", "geometry"]], how="inner", predicate="within")
    cnt = sj.groupby(["CVEGEO", "red"]).size().unstack(fill_value=0)
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

    z["vph_autom"] = z["VPH_AUTOM"].fillna(0)
    z["poblacion"] = z["poblacion"].fillna(z["poblacion"].median())
    z["tipo_zona"] = z.apply(_tipo_zona, axis=1)

    # TODO(tráfico): no hay dataset de aforos. Proxy = destinos + autos.
    # Reemplazar por aforos vehiculares SCT/CDMX o Waze si hay tiempo.
    z["traffic_idx"] = 0.5 * _minmax(np.log1p(z["destinos_raw"])) \
                     + 0.5 * _minmax(z["vph_autom"])

    z = z.rename(columns={"CVEGEO": "zona", "NOM_MUN": "alcaldia"})
    cols = ["zona", "alcaldia", "lat", "lon", "poblacion", "vph_autom",
            "destinos_raw", "riqueza_norm", "area_km2", "n_Tesla", "n_Evergo",
            "n_PlugShare", "n_total", "dens_cargadores", "marca_dom",
            "tipo_zona", "traffic_idx"]
    return pd.DataFrame(z[cols]).reset_index(drop=True)