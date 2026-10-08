# -*- coding: utf-8 -*-
"""Pendiente media por AGEB a partir del DEM (INEGI, 15 m).

Uso:  python pendiente.py        -> genera datasets/pendiente_ageb.csv
      (requisito para ejecutar las predicciones)

Dos detalles que NO se pueden saltar (por eso no es la fórmula "directa"):
1) UNIDADES: el TIF está en grados (EPSG:6365), cada píxel = 0.000139 grados.
   np.gradient debe recibir el tamaño del píxel en METROS (dx != dy en CDMX).
   Si se calcula en píxeles/grados, la pendiente sale ~15x más grande (mediana ~160 %).
2) CUANTIZACIÓN: la elevación viene en metros enteros. En zonas planas (lago:
   Azcapotzalco, Iztacalco) un escalón de 1 m da una pendiente falsa de ~4.7 %.
   Se suaviza con un gaussiano (SIGMA px) antes de derivar. Con SIGMA=2 las zonas
   planas bajan a ~2 % y las de barranca casi no cambian.
"""
import numpy as np
import pandas as pd
import geopandas as gpd
import rasterio
from rasterio import features
from scipy import ndimage as ndi
from config import BASE, ZONES_GEOJSON

DEM = next(BASE.rglob("09_Ciuda*r15m*.tif"))   # lo busca dentro del proyecto
OUT_CSV = BASE / "datasets" / "pendiente_ageb.csv"
SIGMA = 2          # píxeles (~30 m) de suavizado
M_POR_GRADO = 111_320.0


def pendiente_pct(z, transform):
    """Raster de pendiente en % (NaN donde no hay dato)."""
    mask = ~np.isnan(z)
    lat0 = transform.f + transform.e * z.shape[0] / 2          # latitud central
    dy = abs(transform.e) * M_POR_GRADO
    dx = abs(transform.a) * M_POR_GRADO * np.cos(np.radians(lat0))
    # gaussiano que ignora los píxeles sin dato (no los "contamina" con ceros)
    num = ndi.gaussian_filter(np.where(mask, z, 0.0), SIGMA)
    den = ndi.gaussian_filter(mask.astype(float), SIGMA)
    zs = np.where(den > 0, num / np.where(den > 0, den, 1), np.nan)
    zs[~mask] = np.nan
    gy, gx = np.gradient(zs, dy, dx)       # eje 0 = norte-sur, eje 1 = este-oeste
    return np.hypot(gx, gy) * 100


def pendiente_por_zona():
    with rasterio.open(DEM) as r:
        z = r.read(1).astype("float64")
        z[z == r.nodata] = np.nan
        sl = pendiente_pct(z, r.transform)
        zonas = gpd.read_file(ZONES_GEOJSON)[["CVEGEO", "geometry"]].to_crs(r.crs)
        # Rasteriza cada AGEB con un id y promedia con bincount (rápido, sin loops)
        ids = np.arange(1, len(zonas) + 1)
        lab = features.rasterize(zip(zonas.geometry, ids), out_shape=z.shape,
                                 transform=r.transform, fill=0, dtype="int32")
        elev = z
    ok = (lab > 0) & ~np.isnan(sl)
    n = np.bincount(lab[ok], minlength=len(ids) + 1)
    s_sl = np.bincount(lab[ok], weights=sl[ok], minlength=len(ids) + 1)
    s_el = np.bincount(lab[ok], weights=elev[ok], minlength=len(ids) + 1)
    with np.errstate(invalid="ignore", divide="ignore"):
        out = pd.DataFrame({"zona": zonas["CVEGEO"].to_numpy(),
                            "pendiente_media": (s_sl / n)[1:],
                            "elevacion_media": (s_el / n)[1:],
                            "px": n[1:]})
    # AGEB más pequeña que un píxel: sin dato -> se rellena con el centroide
    falta = out["pendiente_media"].isna()
    if falta.any():
        with rasterio.open(DEM) as r:
            c = zonas.geometry[falta.values].centroid
            idx = [r.index(p.x, p.y) for p in c]
        out.loc[falta, "pendiente_media"] = [sl[i] if 0 <= i[0] < sl.shape[0]
                                             and 0 <= i[1] < sl.shape[1] else np.nan
                                             for i in idx]
    return out


if __name__ == "__main__":
    df = pendiente_por_zona()
    OUT_CSV.parent.mkdir(exist_ok=True)
    df.to_csv(OUT_CSV, index=False)
    print(df["pendiente_media"].describe(percentiles=[.5, .9, .95]).round(2))
    print(f"AGEB sin dato: {int(df['pendiente_media'].isna().sum())}  -> {OUT_CSV}")
