import json
import numpy as np
import pandas as pd
import geopandas as gpd
from scipy.spatial import cKDTree
from config import BASE, CHARGERS_JSON

RAW = BASE / "clean"          # <- donde están los 3 JSON originales
DEDUP_M = 75                     # metros: mismo sitio si están más cerca que esto


def _plugshare():
    rows = []
    for s in json.loads((RAW / "plug_share_cdmx.json").read_text(encoding="utf-8")):
        if s.get("coming_soon"):
            continue
        nombre = s.get("name") or ""
        low = nombre.lower()
        red = "Evergo" if "evergo" in low else "Tesla" if "tesla" in low else "PlugShare"
        rows.append(dict(nombre=nombre, red=red,
                         n_puertos=max(int(s.get("station_count") or 1), 1),
                         lat=s["latitude"], lon=s["longitude"]))
    return pd.DataFrame(rows)


def _evergo():
    j = json.loads((RAW / "evergo_cdmx.json").read_text(encoding="utf-8"))
    return pd.DataFrame([dict(nombre=m.get("title", ""), red="Evergo", n_puertos=1,
                              lat=float(m["lat"]), lon=float(m["lng"]))
                         for m in j["markers"]])


def _tesla():
    j = json.loads((RAW / "tesla_chargers_geo.json").read_text(encoding="utf-8"))
    return pd.DataFrame([dict(nombre=f["properties"]["nombre"], red="Tesla", n_puertos=1,
                              lon=f["geometry"]["coordinates"][0],
                              lat=f["geometry"]["coordinates"][1])
                         for f in j["features"]])


def _xy(df):
    p = gpd.GeoSeries(gpd.points_from_xy(df["lon"], df["lat"]), crs=4326).to_crs(32614)
    return np.c_[p.x, p.y]


def build():
    base = _plugshare()                       # PlugShare manda: trae # de puertos
    for extra in (_evergo(), _tesla()):
        dist, _ = cKDTree(_xy(base)).query(_xy(extra))
        nuevos = extra[dist > DEDUP_M]        # solo lo que PlugShare no tiene
        print(f"{extra['red'].iloc[0]}: {len(extra)} -> {len(nuevos)} nuevos")
        base = pd.concat([base, nuevos], ignore_index=True)

    gdf = gpd.GeoDataFrame(base[["nombre", "red", "n_puertos"]],
                           geometry=gpd.points_from_xy(base["lon"], base["lat"]),
                           crs=4326)
    CHARGERS_JSON.parent.mkdir(exist_ok=True)
    gdf.to_file(CHARGERS_JSON, driver="GeoJSON")
    print(gdf.groupby("red")["n_puertos"].agg(["count", "sum"]))
    return gdf


if __name__ == "__main__":
    build()