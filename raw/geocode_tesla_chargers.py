import csv
import json
import time
import requests
import urllib.parse

input_file = r'd:\USER\OneDrive\Documentos\Progra\Hackathones\CDMX\raw\tesla_chargers.csv'
output_file = r'd:\USER\OneDrive\Documentos\Progra\Hackathones\CDMX\clean\tesla_chargers_geo.json'

geojson = {
    "type": "FeatureCollection",
    "features": []
}

headers = {
    "User-Agent": "HackathonCDMX_ChargersScript/1.0 (contacto@ejemplo.com)"
}

with open(input_file, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    locations = list(reader)

print(f"Iniciando geolocalizacion de {len(locations)} ubicaciones...")

import re

for index, row in enumerate(locations):
    nombre = row['nombre']
    direccion_original = row['direccion']
    
    # Limpiar dirección: extraer hasta el primer número o s/n
    match = re.search(r'^.*?(?:\d+|s/n|S/N)', direccion_original)
    if match:
        direccion_limpia = match.group(0).strip() + ", Ciudad de Mexico, Mexico"
    else:
        # Fallback si no tiene número
        direccion_limpia = direccion_original.split(',')[0] + ", Ciudad de Mexico, Mexico"
    
    # Preparamos la consulta
    query = urllib.parse.quote(direccion_limpia)
    url = f"https://nominatim.openstreetmap.org/search?q={query}&format=json&countrycodes=mx&limit=1"
    
    try:
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            data = response.json()
            if len(data) > 0:
                lat = float(data[0]['lat'])
                lon = float(data[0]['lon'])
                
                feature = {
                    "type": "Feature",
                    "properties": {
                        "nombre": nombre,
                        "red": "Tesla"
                    },
                    "geometry": {
                        "type": "Point",
                        "coordinates": [lon, lat]  # GeoJSON requiere [longitud, latitud]
                    }
                }
                geojson['features'].append(feature)
                print(f"[{index+1}/{len(locations)}] Exito: {nombre.encode('ascii', 'ignore').decode()}")
            else:
                print(f"[{index+1}/{len(locations)}] No encontrado: {nombre.encode('ascii', 'ignore').decode()} ({direccion_limpia.encode('ascii', 'ignore').decode()})")
        else:
            print(f"[{index+1}/{len(locations)}] Error HTTP {response.status_code} para {nombre.encode('ascii', 'ignore').decode()}")
    except Exception as e:
        print(f"[{index+1}/{len(locations)}] Error para {nombre.encode('ascii', 'ignore').decode()}: {e}")
        
    time.sleep(1.2)

with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(geojson, f, ensure_ascii=False, indent=2)

print(f"\nProceso completado. Se geolocalizaron {len(geojson['features'])} de {len(locations)} ubicaciones.")
print(f"Archivo guardado en: {output_file}")
