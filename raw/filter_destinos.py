import json
import os
import shutil

def main():
    base_dir = r"d:\USER\OneDrive\Documentos\Progra\Hackathones\CDMX"
    raw_path = os.path.join(base_dir, "raw", "destinos_economicos_raw.json")
    clean_dir = os.path.join(base_dir, "clean")
    datasets_dir = os.path.join(base_dir, "datasets")
    output_name = "destinos_economicos_clean.json"
    
    clean_path = os.path.join(clean_dir, output_name)
    datasets_path = os.path.join(datasets_dir, output_name)
    
    if not os.path.exists(raw_path):
        print(f"Error: El archivo {raw_path} no existe.")
        return
        
    if os.path.getsize(raw_path) == 0:
        print(f"Error: El archivo {raw_path} está vacío. Asegúrate de guardar los cambios en tu editor (CTRL+S).")
        return
        
    print(f"Cargando archivo: {raw_path}")
    with open(raw_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    is_geojson = isinstance(data, dict) and "features" in data
    records = data.get("features", []) if is_geojson else data
    
    filtered_records = []
    
    for item in records:
        props = item.get("properties", item) if is_geojson else item
        
        tp_cnt = str(props.get("tp_cnt_") or "").upper()
        activdd = str(props.get("activdd") or "").upper()
        ctgr_ct = str(props.get("ctgr_ct") or "").upper()
        prsns_c = str(props.get("prsns_c") or "").upper()
        
        is_valid_act = False
        if any(term in activdd for term in ["SUPERMERCADO", "DEPARTAMENTAL", "HOSPITAL", "CORPORATIVO", "ADMINISTRA"]):
            is_valid_act = True
            
        keep = False
        if is_valid_act:
            keep = True
                
        if keep:
            filtered_records.append(item)
            
    print(f"Registros originales: {len(records)}")
    print(f"Registros filtrados: {len(filtered_records)}")
    
    if is_geojson:
        output_data = {
            "type": "FeatureCollection",
            "features": filtered_records
        }
    else:
        output_data = filtered_records
        
    os.makedirs(clean_dir, exist_ok=True)
    os.makedirs(datasets_dir, exist_ok=True)
    
    print(f"Guardando en {clean_path} ...")
    with open(clean_path, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
        
    print(f"Copiando a {datasets_path} ...")
    shutil.copy2(clean_path, datasets_path)
    
    print("¡Proceso completado con éxito!")

if __name__ == '__main__':
    main()
