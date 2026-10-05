import geopandas as gpd
import pandas as pd
import os
import numpy as np

def min_max_scale(series):
    s_min = series.min()
    s_max = series.max()
    if s_max - s_min == 0:
        return pd.Series(np.zeros(len(series)), index=series.index)
    return (series - s_min) / (s_max - s_min)

def main():
    base_dir = r"d:\USER\OneDrive\Documentos\Progra\Hackathones\CDMX"
    clean_dir = os.path.join(base_dir, "clean")
    datasets_dir = os.path.join(base_dir, "datasets")
    html_dir = os.path.join(base_dir, "html")
    
    os.makedirs(html_dir, exist_ok=True)
    
    poly_path = os.path.join(clean_dir, "09a.json")
    print("Cargando polígonos AGEB...")
    gdf_poly = gpd.read_file(poly_path)
    
    iter_path = os.path.join(clean_dir, "RESAGEBURB_09CSV20.csv")
    print("Cargando Censo...")
    df_iter = pd.read_csv(iter_path, dtype=str)
    
    # Paso 1: Filtrar el nivel correcto (Solo AGEBs)
    df_iter = df_iter[(df_iter['MZA'] == '000') & (df_iter['AGEB'] != '0000')].copy()
    
    # Paso 2: Construir la llave para el Mapa (CVEGEO)
    df_iter['ENTIDAD_str'] = df_iter['ENTIDAD'].astype(str).str.zfill(2)
    df_iter['MUN_str'] = df_iter['MUN'].astype(str).str.zfill(3)
    df_iter['LOC_str'] = df_iter['LOC'].astype(str).str.zfill(4)
    df_iter['AGEB_str'] = df_iter['AGEB'].astype(str).str.zfill(4)
    df_iter['CVEGEO'] = df_iter['ENTIDAD_str'] + df_iter['MUN_str'] + df_iter['LOC_str'] + df_iter['AGEB_str']
    
    cols_to_numeric = ['TVIVHAB', 'VPH_AUTOM', 'VPH_INTER', 'GRAPROES']
    for c in cols_to_numeric:
        if c in df_iter.columns:
            df_iter[c] = pd.to_numeric(df_iter[c].replace(['*', 'N/D'], np.nan), errors='coerce')
        else:
            print(f"Advertencia: No se encontró la columna {c}")
            df_iter[c] = np.nan
    
    print("Realizando Join socioeconómico...")
    gdf_poly = gdf_poly.merge(
        df_iter[['CVEGEO', 'NOM_MUN'] + cols_to_numeric],
        on='CVEGEO',
        how='left'
    )
    
    # Paso 3: Matemáticas del Modelo (Quitando el sesgo)
    gdf_poly['pct_autos'] = (gdf_poly['VPH_AUTOM'] / gdf_poly['TVIVHAB']).fillna(0)
    gdf_poly['pct_internet'] = (gdf_poly['VPH_INTER'] / gdf_poly['TVIVHAB']).fillna(0)
    gdf_poly['escolaridad'] = gdf_poly['GRAPROES'].fillna(0)
    
    # La corrección del sesgo: Multiplicar en lugar de sumar
    gdf_poly['riqueza_raw'] = gdf_poly['pct_autos'] * gdf_poly['pct_internet'] * gdf_poly['escolaridad']
    
    comercios_path = os.path.join(datasets_dir, "destinos_economicos_clean.json")
    print("Cargando destinos económicos...")
    gdf_comercios = gpd.read_file(comercios_path)
    
    if gdf_comercios.crs != gdf_poly.crs:
        gdf_comercios = gdf_comercios.to_crs(gdf_poly.crs)
        
    print("Spatial Join: Contando destinos por AGEB...")
    sj_comercios = gpd.sjoin(gdf_comercios, gdf_poly[['CVEGEO', 'geometry']], how='inner', predicate='intersects')
    counts_com = sj_comercios.groupby('CVEGEO').size().reset_index(name='destinos_raw')
    
    gdf_poly = gdf_poly.merge(counts_com, on='CVEGEO', how='left')
    gdf_poly['destinos_raw'] = gdf_poly['destinos_raw'].fillna(0)
    
    chargers_path = os.path.join(datasets_dir, "all_chargers_geo.json")
    print("Cargando cargadores existentes (Competencia)...")
    gdf_chargers = gpd.read_file(chargers_path)
    
    if gdf_chargers.crs != gdf_poly.crs:
        gdf_chargers = gdf_chargers.to_crs(gdf_poly.crs)
        
    print("Spatial Join: Contando competencia por AGEB...")
    sj_chargers = gpd.sjoin(gdf_chargers, gdf_poly[['CVEGEO', 'geometry']], how='inner', predicate='intersects')
    counts_char = sj_chargers.groupby('CVEGEO').size().reset_index(name='competencia_raw')
    
    gdf_poly = gdf_poly.merge(counts_char, on='CVEGEO', how='left')
    gdf_poly['competencia_raw'] = gdf_poly['competencia_raw'].fillna(0)
    
    print("Normalizando variables (Min-Max Scaling 0 a 1)...")
    gdf_poly['riqueza_norm'] = min_max_scale(gdf_poly['riqueza_raw'])
    gdf_poly['destinos_norm'] = min_max_scale(gdf_poly['destinos_raw'])
    gdf_poly['competencia_norm'] = min_max_scale(gdf_poly['competencia_raw'])
    
    print("Calculando Índice Final de Viabilidad...")
    # Pesos configurables
    w_riqueza = 0.4
    w_destinos = 0.4
    w_competencia = 0.2
    
    gdf_poly['viabilidad'] = (gdf_poly['riqueza_norm'] * w_riqueza) + (gdf_poly['destinos_norm'] * w_destinos) - (gdf_poly['competencia_norm'] * w_competencia)
    
    # Acotamos el límite inferior a 0 (por la resta) y re-normalizamos el índice final a (0,1)
    gdf_poly['viabilidad'] = gdf_poly['viabilidad'].clip(lower=0)
    gdf_poly['viabilidad'] = min_max_scale(gdf_poly['viabilidad'])
    
    keep_cols = ['CVEGEO', 'riqueza_norm', 'destinos_norm', 'competencia_norm', 'viabilidad', 'NOM_MUN', 'VPH_AUTOM', 'destinos_raw', 'geometry']
    gdf_final = gdf_poly[keep_cols]
    
    out_path = os.path.join(html_dir, "viabilidad_cdmx_v2.geojson")
    print(f"Guardando {out_path} ...")
    
    gdf_final.to_file(out_path, driver='GeoJSON')
    print("¡Proceso completado exitosamente!")

if __name__ == '__main__':
    main()
