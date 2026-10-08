import json
import re
import numpy as np
import pandas as pd
import geopandas as gpd
from scipy.spatial import cKDTree
from config import BASE, CHARGERS_JSON, ZONES_GEOJSON

DEDUP_M = 75   # metros: dos puntos más cerca que esto = mismo sitio


def _find(nombre):
    hits = [p for p in BASE.rglob(nombre) if CHARGERS_JSON.name not in p.name]
    if not hits:
        raise FileNotFoundError(f"No encontré {nombre} dentro de {BASE}")
    return hits[0]


def _limpia(s):
    """Quita el sufijo ', México' que trae Evergo."""
    return re.sub(r",\s*México\s*$", "", (s or "").strip(), flags=re.I).strip()


def _xy(df):
    p = gpd.GeoSeries(gpd.points_from_xy(df["lon"], df["lat"]), crs=4326).to_crs(32614)
    return np.c_[p.x, p.y]


def _dedup(df, m=DEDUP_M):
    """Quita repetidos DENTRO de una misma fuente (Evergo trae filas repetidas)."""
    df = df.reset_index(drop=True)
    P = _xy(df)
    tree = cKDTree(P)
    keep = np.ones(len(df), bool)
    for i in range(len(df)):
        if not keep[i]:
            continue
        for j in tree.query_ball_point(P[i], m):
            if j > i:
                keep[j] = False
    return df[keep]


def _plugshare():
    rows = []
    for s in json.loads(_find("plug_share_cdmx.json").read_text(encoding="utf-8")):
        if s.get("coming_soon"):
            continue
        nombre = s.get("name") or ""
        low = nombre.lower()
        red = "Evergo" if "evergo" in low else "Tesla" if "tesla" in low else "PlugShare"
        rows.append(dict(nombre=_limpia(nombre), red=red,
                         n_puertos=max(int(s.get("station_count") or 1), 1),
                         lat=s["latitude"], lon=s["longitude"]))
    return pd.DataFrame(rows)


def _evergo():
    j = json.loads(_find("evergo_cdmx.json").read_text(encoding="utf-8"))
    return pd.DataFrame([dict(nombre=_limpia(m.get("title", "")), red="Evergo",
                              n_puertos=1, lat=float(m["lat"]), lon=float(m["lng"]))
                         for m in j["markers"]])


def _tesla():
    j = json.loads(_find("tesla_chargers_geo.json").read_text(encoding="utf-8"))
    return pd.DataFrame([dict(nombre=f["properties"]["nombre"], red="Tesla", n_puertos=1,
                              lon=f["geometry"]["coordinates"][0],
                              lat=f["geometry"]["coordinates"][1])
                         for f in j["features"]])


def build():
    # 1. Cargar polígono exacto de la CDMX (unión de AGEBs)
    zones = gpd.read_file(ZONES_GEOJSON)
    cdmx_poly = zones.union_all() if hasattr(zones, "union_all") else zones.unary_union

    base = _dedup(_plugshare())              # PlugShare manda: trae # de puertos
    for extra in (_evergo(), _tesla()):
        red = extra["red"].iloc[0]
        extra = _dedup(extra)                # 1) quita repetidos de la propia fuente
        dist, _ = cKDTree(_xy(base)).query(_xy(extra))
        nuevos = extra[dist > DEDUP_M]       # 2) quita los que PlugShare ya tiene
        print(f"{red}: {len(extra)} únicos -> {len(nuevos)} nuevos")
        base = pd.concat([base, nuevos], ignore_index=True)

    gdf = gpd.GeoDataFrame(base[["nombre", "red", "n_puertos"]],
                           geometry=gpd.points_from_xy(base["lon"], base["lat"]),
                           crs=4326)

    # Filtrar estrictamente a los puntos que caen dentro del polígono de la CDMX
    dentro = gdf.within(cdmx_poly)
    fuera = (~dentro).sum()
    print(f"Filtrando cargadores: {len(gdf)} totales -> {dentro.sum()} dentro de CDMX ({fuera} descartados fuera de CDMX)")
    gdf = gdf[dentro].reset_index(drop=True)

    for output in (CHARGERS_JSON, BASE / "html" / "all_chargers_geo.json"):
        output.parent.mkdir(exist_ok=True)
        output.unlink(missing_ok=True)        # to_file no sobrescribe bien en algunos casos
        gdf.to_file(output, driver="GeoJSON")
    print(gdf.groupby("red")["n_puertos"].agg(["count", "sum"]))
    print(f"Total final: {len(gdf)} sitios, {int(gdf['n_puertos'].sum())} puertos dentro de la CDMX")
    return gdf


if __name__ == "__main__":
    build()