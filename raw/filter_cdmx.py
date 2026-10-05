import json
import os

input_file = r'd:\USER\OneDrive\Documentos\Progra\Hackathones\CDMX\evergo_raw.json'
output_file = r'd:\USER\OneDrive\Documentos\Progra\Hackathones\CDMX\evergo_cdmx.json'

with open(input_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

filtered_markers = []
for marker in data.get('markers', []):
    address = marker.get('address', '')
    if address == 'México' or address == 'M\u00e9xico':
        try:
            lat = float(marker.get('lat', 0))
            lng = float(marker.get('lng', 0))
            if 19.1 <= lat <= 19.6 and -99.3 <= lng <= -98.9:
                filtered_markers.append(marker)
        except ValueError:
            pass

data['markers'] = filtered_markers

with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=4)

print(f"Filtrado completado. Se encontraron {len(filtered_markers)} marcadores en CDMX.")
print(f"Archivo guardado en: {output_file}")
