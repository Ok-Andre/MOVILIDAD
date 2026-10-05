import json
import os

input_file = r'd:\USER\OneDrive\Documentos\Progra\Hackathones\CDMX\plug_share_raw.json'
output_file = r'd:\USER\OneDrive\Documentos\Progra\Hackathones\CDMX\plug_share_cdmx.json'

with open(input_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

filtered_locations = []
for location in data:
    try:
        lat = float(location.get('latitude', 0))
        lng = float(location.get('longitude', 0))
        if 19.1 <= lat <= 19.6 and -99.3 <= lng <= -98.9:
            filtered_locations.append(location)
    except (ValueError, TypeError):
        pass

with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(filtered_locations, f, ensure_ascii=False, indent=4)

print(f"Filtrado completado. Se encontraron {len(filtered_locations)} ubicaciones en CDMX.")
print(f"Archivo guardado en: {output_file}")
