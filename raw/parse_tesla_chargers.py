import csv
import re
import os

input_file = r'd:\USER\OneDrive\Documentos\Progra\Hackathones\CDMX\tesla_chargues.txt'
output_file = r'd:\USER\OneDrive\Documentos\Progra\Hackathones\CDMX\tesla_chargers.csv'

with open(input_file, 'r', encoding='utf-8') as f:
    content = f.read()

# Dividir por dos o más saltos de línea
entries = re.split(r'\n\s*\n', content.strip())

csv_data = []
for entry in entries:
    lines = [line.strip() for line in entry.split('\n') if line.strip()]
    if len(lines) >= 3:
        nombre = lines[0]
        direccion = f"{lines[1]}, {lines[2]}"
        csv_data.append([nombre, direccion])

with open(output_file, 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['nombre', 'direccion'])
    writer.writerows(csv_data)

print(f"Proceso completado. Se extrajeron {len(csv_data)} ubicaciones.")
print(f"Archivo CSV guardado en: {output_file}")
