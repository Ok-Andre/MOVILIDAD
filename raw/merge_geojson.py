import json
import os

tesla_file = r'd:\USER\OneDrive\Documentos\Progra\Hackathones\CDMX\clean\tesla_chargers_geo.json'
evergo_file = r'd:\USER\OneDrive\Documentos\Progra\Hackathones\CDMX\clean\evergo_cdmx.json'
plugshare_file = r'd:\USER\OneDrive\Documentos\Progra\Hackathones\CDMX\clean\plug_share_cdmx.json'
output_file = r'd:\USER\OneDrive\Documentos\Progra\Hackathones\CDMX\clean\all_chargers_geo.json'

merged_features = []

# 1. Cargar Tesla
try:
    with open(tesla_file, 'r', encoding='utf-8') as f:
        tesla_data = json.load(f)
        for feature in tesla_data.get('features', []):
            feature['properties']['red'] = 'Tesla'
            merged_features.append(feature)
    print(f"Cargados {len(tesla_data.get('features', []))} de Tesla.")
except Exception as e:
    print(f"Error cargando Tesla: {e}")

# 2. Cargar Evergo
try:
    with open(evergo_file, 'r', encoding='utf-8') as f:
        evergo_data = json.load(f)
        
        markers = evergo_data.get('markers', []) if isinstance(evergo_data, dict) else evergo_data
        count = 0
        for marker in markers:
            lat = float(marker.get('lat', 0))
            lng = float(marker.get('lng', 0))
            nombre = marker.get('title', '')
            if not nombre:
                nombre = marker.get('description', 'Estación Evergo')
                
            feature = {
                "type": "Feature",
                "properties": {
                    "nombre": nombre,
                    "red": "Evergo"
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [lng, lat]
                }
            }
            merged_features.append(feature)
            count += 1
    print(f"Cargados {count} de Evergo.")
except Exception as e:
    print(f"Error cargando Evergo: {e}")

# 3. Cargar PlugShare
try:
    with open(plugshare_file, 'r', encoding='utf-8') as f:
        plugshare_data = json.load(f)
        
        count = 0
        for location in plugshare_data:
            lat = float(location.get('latitude', 0))
            lng = float(location.get('longitude', 0))
            nombre = location.get('name', 'Estación PlugShare')
            
            feature = {
                "type": "Feature",
                "properties": {
                    "nombre": nombre,
                    "red": "PlugShare"
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [lng, lat]
                }
            }
            merged_features.append(feature)
            count += 1
    print(f"Cargados {count} de PlugShare.")
except Exception as e:
    print(f"Error cargando PlugShare: {e}")

# Crear el GeoJSON final
final_geojson = {
    "type": "FeatureCollection",
    "features": merged_features
}

with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(final_geojson, f, ensure_ascii=False, indent=2)

print(f"\nProceso completado. Se combinaron {len(merged_features)} ubicaciones en total.")
print(f"Archivo guardado en: {output_file}")
