# ELECTRA CDMX

![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![Leaflet](https://img.shields.io/badge/Leaflet-199900?logo=leaflet&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?logo=chartdotjs&logoColor=white)
![GeoJSON](https://img.shields.io/badge/Datos%20geoespaciales-GeoJSON-2E8B57)

**ELECTRA** es una herramienta de análisis territorial para explorar la red de carga pública de vehículos eléctricos y evaluar dónde podría ser viable instalar electrolineras en la Ciudad de México. Combina un mapa interactivo, un dashboard y un modelo de simulación para comparar zonas y apoyar la planeación de nueva infraestructura.

## ¿Para qué sirve?

La aplicación permite consultar la distribución de cargadores existentes y explorar estimaciones de viabilidad por zona geoestadística (AGEB). El análisis combina información de población y viviendas, destinos económicos, ubicación y cantidad de cargadores, y un factor de accesibilidad asociado a la pendiente del terreno.

El modelo proyecta posibles escenarios de adopción de vehículos eléctricos entre 2026 y 2035. Para cada zona y año genera indicadores como demanda estimada, ganancia operativa, probabilidad de rentabilidad, número de cargadores, recuperación e inversión aproximadas y emisiones de CO₂ evitadas. Los resultados se muestran en el mapa y en las gráficas del dashboard para facilitar la comparación territorial.

> **Importante:** las ganancias y proyecciones son simulaciones basadas en supuestos editables, no resultados observados ni garantías de rentabilidad. Los datos disponibles no incluyen ingresos reales de estaciones; los resultados deben validarse con información de demanda, costos, tarifas y sitios concretos antes de tomar decisiones.

## Funcionalidades principales

- Explorar en el mapa la viabilidad de instalación por AGEB, año y escenario.
- Consultar, buscar y filtrar cargadores públicos de redes como Tesla, Evergo y PlugShare.
- Revisar en el dashboard la distribución de infraestructura y los indicadores territoriales.
- Comparar escenarios de adopción baja, media y alta para 2026–2035.
- Generar rangos de estimación mediante simulación Monte Carlo y exportar resultados en CSV y JSON.

## Tecnologías utilizadas

- **Interfaz:** HTML, CSS y JavaScript.
- **Mapas:** Leaflet y Leaflet.markercluster.
- **Gráficas:** Chart.js.
- **Procesamiento geoespacial:** GeoJSON y GeoPandas.
- **Análisis y simulación:** Python, NumPy y pandas.
- **Gráficas del procesamiento:** Matplotlib.
- **Iconografía:** Font Awesome.

La web se sirve como sitio estático y consume archivos GeoJSON/JSON. El procesamiento del modelo se ejecuta por separado en Python. `modelo/api.py` permite consultar las predicciones exportadas desde Python, pero no inicia un servidor web.

## Ejecutar la interfaz

Desde la carpeta raíz del proyecto, inicia un servidor local:

```bash
python3 -m http.server 8000
```

Abre [http://localhost:8000/html/index.html](http://localhost:8000/html/index.html). El servidor es necesario para que el navegador pueda leer los datos locales de mapas y predicciones. El dashboard está en `html/dashboard.html` y el listado de estaciones en `html/electrolineras.html`.

## Generar predicciones

El flujo de simulación está en `modelo/`. Requiere Python y las bibliotecas NumPy, pandas, GeoPandas y Matplotlib. Desde la carpeta raíz:

```bash
cd modelo
python run_all.py
```

Sin argumentos se usa el escenario configurado (actualmente `media`). También es posible elegir uno o ejecutar todos:

```bash
python run_all.py baja
python run_all.py media
python run_all.py alta
python run_all.py todos
```

La ejecución exporta predicciones y actualiza los archivos de datos consumidos por la interfaz. Los parámetros de los escenarios y los supuestos están en `modelo/config.py`.

## Autores

- Marco André García Carballo
- Uriel Natanael Mayorga García
- Alejandro Sánchez Cano

## Detalles técnicos

---

## Qué cambió en la v2 (y por qué)

Cada punto dice **qué se cambió**, **por qué** y **en qué archivo**.

### 1. El mapa ya no sale casi todo rojo
- **Antes:** los colores dependían del valor del puntaje. Unas pocas zonas con valores muy altos "estiraban" la escala y el resto se veía rojo (en las predicciones, casi el 99 % del mapa).
- **Ahora:** los colores se reparten por **percentil**. Verde = 20 % mejor, amarillo = 40 % a 80 %, rojo = 40 % inferior.
- **Por qué:** así el mapa sí muestra diferencias entre zonas y se puede usar en una presentación.
- **Archivos:** `export.py` (el puntaje ahora es percentil) y `html/index.html`.

### 2. Se dejaron de contar dos veces los mismos cargadores
- **Antes:** se juntaban Tesla, Evergo y PlugShare tal cual. Pero PlugShare también incluye sitios de Evergo y de Tesla, así que el mismo cargador podía contar dos veces.
- **Ahora:** se quitan duplicados por **distancia** (si dos puntos están a menos de 75 metros, se considera el mismo sitio).
- **Por qué:** contar doble hace parecer que una zona tiene más competencia de la real.
- **Archivo:** `build_chargers.py` (nuevo).

### 3. Ahora se cuentan puertos, no solo sitios
- **Antes:** un sitio con 8 cargadores contaba igual que un sitio con 1.
- **Ahora:** se usa el número de puertos que trae PlugShare (`station_count`). Los de Evergo y Tesla, que no traen ese dato, cuentan como 1.
- **Por qué:** un sitio grande compite más que uno chico.
- **Archivos:** `build_chargers.py` y `data.py`.

### 4. Se ignoran los cargadores "próximamente"
- **Antes:** entraban cargadores que todavía no existen.
- **Ahora:** los marcados `coming_soon` en PlugShare se excluyen.
- **Por qué:** no pueden competir si aún no están funcionando.
- **Archivo:** `build_chargers.py`.

### 5. Los datos "confidenciales" del censo ya no se vuelven cero
- **Antes:** en el censo, el símbolo `*` significa "dato protegido". El código lo convertía en **0 autos**, y esas zonas quedaban sin demanda.
- **Ahora:** se rellenan con la **mediana de su alcaldía**.
- **Por qué:** "dato protegido" no significa "cero". Eran 20 zonas afectadas.
- **Archivo:** `data.py`.

### 6. El modelo ahora ve las variables que usa la simulación
- **Antes:** la simulación usaba viviendas con auto, riqueza y destinos, pero el modelo no recibía esas columnas (usaba población como sustituto).
- **Ahora:** `vph_autom`, `riqueza_norm` y `destinos_raw` son entradas del modelo.
- **Por qué:** el modelo no puede aprender bien lo que no puede ver.
- **Archivo:** `train.py`.

### 7. Se corrigió un error al ejecutar
- **Antes:** `export.py` copiaba `predicciones.json` al importarse. En la primera corrida el archivo no existía y fallaba; en las siguientes copiaba la versión vieja.
- **Ahora:** la copia ocurre al final de `export()`, cuando el archivo ya está actualizado.
- **Archivo:** `export.py`.

### 8. Mejoras en el mapa web
- Se agregó una **leyenda** (qué significa cada color).
- Se agregó una **nota** que aclara que 2030 y 2035 son simulaciones con supuestos.
- Los popups muestran el **percentil** y "N/D" cuando falta el dato.
- Si haces clic en 2030 o 2035 antes de que cargue el archivo, el mapa espera en vez de salir vacío.
- **Archivo:** `html/index.html`.

### 9. Se agregó una forma de revisar si el modelo tiene sentido
- **Nuevo:** `validate.py` compara la demanda estimada con los cargadores que **ya existen** (correlación de Spearman) y lista zonas con mucha demanda y cero cargadores.
- **Por qué:** es la única prueba contra datos reales que tenemos; ayuda a saber si vamos bien encaminados.
- **Archivo:** `validate.py` (nuevo).

---

## Qué sigue igual (y hay que decirlo con honestidad)

- **La ganancia sigue siendo simulada.** No existen datos reales de ingresos de electrolineras. La fórmula está en `simulate.py` y sus supuestos en `config.py`.
- **Los rangos no son observaciones reales.** Los percentiles y la probabilidad de rentabilidad resumen la variabilidad de la simulación y de sus supuestos, no una garantía de resultados futuros.
- **Datos reales:** censo 2020, comercios y ubicación de cargadores. **Supuestos:** adopción de autos eléctricos, kWh por auto, margen por kWh, costos y captura de clientes.

## Mejoras futuras

- Reemplazar los supuestos de adopción, consumo y margen por datos de INEGI, AMDA y tarifas de CFE.
- Usar distancia al cargador más cercano, en lugar de contar solo los que están dentro de la misma AGEB.
- Conseguir datos reales de tráfico (hoy es un proxy) y de sesiones de carga.

---

## La fórmula del mapa de viabilidad

**Puntuación = (w₁ · Poder Adquisitivo) + (w₂ · Puntos de Atracción / Destino) − (w₃ · Saturación de Competencia)**

Todos los factores se normalizan con Min-Max (0 a 1) para poder compararlos.

### 1. Poder adquisitivo (proxy de adopción de autos eléctricos)
El censo no dice cuántos autos son eléctricos, así que se multiplica:
* `Tasa de Autos` (VPH_AUTOM / viviendas habitadas)
* `Tasa de Internet` (VPH_INTER / viviendas habitadas)
* `Escolaridad Promedio` (GRAPROES)

Se multiplica en lugar de sumar para que las zonas con muchos autos pero poco internet o escolaridad no salgan favorecidas.

### 2. Puntos de atracción (carga de oportunidad)
El 80 % o más de las recargas ocurre en casa, de noche. Quien vive en una zona rica normalmente ya carga en su garaje. La carga pública sirve sobre todo en lugares donde la gente se queda de 1 a 3 horas:
* Supermercados
* Tiendas departamentales
* Corporativos y oficinas
* Hospitales privados

### 3. Saturación de competencia (penalización)
Se resta puntaje si ya hay estaciones en la zona, para favorecer zonas desatendidas.

## Datasets

1. **Marco Geoestadístico (INEGI)** — `09a.json`: polígonos por AGEB.
2. **Censo 2020 (INEGI)** — `RESAGEBURB_09CSV20.csv`: población y viviendas por AGEB. Se ignoran los totales de alcaldía y de manzana.
3. **Directorio de Unidades Económicas** — `destinos_economicos_clean.json`: comercios de oportunidad.
4. **Cargadores:**
   * `tesla_chargers_geo.json`: cargadores de Tesla (en su mayoría de destino: hoteles y torres).
   * `evergo_cdmx.json`: red Evergo (solo ubicación).
   * `plug_share_cdmx.json`: PlugShare (trae número de estaciones por sitio).
   * Se unen y se limpian con `build_chargers.py` → `all_chargers_geo.json`.

## Cómo leer el mapa

* **Verde:** 20 % de zonas con mejor viabilidad.
* **Amarillo:** zonas intermedias (40 % a 80 %).
* **Rojo:** 40 % inferior (poca demanda o mucha competencia).

---

## Modelo predictivo

Simula la ganancia anual por AGEB para cada año de **2026 a 2035** y calcula rangos estadísticos (percentiles 10, 50 y 90), probabilidad de rentabilidad e indicadores complementarios.

>  **Aviso:** la ganancia es **simulada**. Validar los supuestos con tarifas y datos reales antes de tomar decisiones de negocio.

### Cómo correrlo

```bash
cd modelo
pip install geopandas pandas numpy scikit-learn matplotlib scipy rasterio
python pendiente.py        # 1) calcula la pendiente media por AGEB desde el DEM
python build_chargers.py   # 2) une y limpia los cargadores
python run_all.py          # 3) simula, predice y exporta
python validate.py         # 4) revisa contra cargadores reales
```

El flujo actual de `run_all.py` no entrena un modelo de Random Forest: genera resultados mediante simulación Monte Carlo. `train.py` está disponible para entrenar un modelo por separado.

`pendiente.py` busca el DEM GeoTIFF `09_Ciuda*r15m*.tif` dentro del proyecto y
genera `datasets/pendiente_ageb.csv`; coloca el DEM en `datasets/`. Las predicciones aplican una reducción
gradual de demanda por pendiente: como supuesto inicial, 15 % de pendiente media
reduce a la mitad la demanda accesible. Este factor es un proxy topográfico,
no una medición de caminos transitables, y debe calibrarse con datos viales.

El flujo actual genera `predicciones.csv`, `predicciones.json` y gráficas `.png` bajo `salidas/`. `export.py` también copia los JSON necesarios a `html/`. `modelo.pkl` y `metricas.json` corresponden al entrenamiento independiente de `train.py`, no a la ejecución normal de `run_all.py`.

Para ver el mapa, desde `html/`:

```bash
python3 -m http.server 8000
```

y abrir `http://localhost:8000`.

### Flujo

```
Tesla + Evergo + PlugShare ──> build_chargers.py ──> all_chargers_geo.json ─┐
                                                                            │
viabilidad_cdmx_v2.geojson ─┐                                               │
censo (POBTOT) ─────────────┼─> data.py <───────────────────────────────────┘
                            │      │
                            │      v
                            │   features por AGEB
                            │      │
                            │      v
                            │   simulate.py (ganancia sintética, 2025-2035)
                            │      │
                            │      v
                            │   incertidumbre.py (Monte Carlo)
                            │      │
                            │      v
                            │   export.py -> CSV + JSON (score en percentil)
                            │      │                 │
                            │      v                 v
                            │   plots.py        api.py / index.html
                            │
                            └─> validate.py (compara con cargadores reales)
```

### Archivos

| Archivo | Qué hace |
|---|---|
| `build_chargers.py` | **(nuevo)** Une cargadores, quita duplicados por distancia y cuenta puertos |
| `validate.py` | **(nuevo)** Compara demanda estimada vs. cargadores existentes |
| `config.py` | Rutas, switch `USE_RF` y supuestos de la simulación |
| `data.py` | Una fila por AGEB con las features (corregido: puertos y datos `*`) |
| `simulate.py` | Crea la ganancia sintética por zona y año |
| `train.py` | Entrena modelos opcionales de regresión; no forma parte del flujo actual de `run_all.py` |
| `incertidumbre.py` | Calcula rangos y probabilidad de rentabilidad mediante simulación Monte Carlo |
| `export.py` | Calcula y exporta predicciones 2026–2035 y las copia al html |
| `plots.py` | Gráficas de ganancia máx/mín |
| `api.py` | `get_predictions()` para consumir los datos |
| `run_all.py` | Ejecuta la simulación Monte Carlo, exporta predicciones y genera gráficas |

### Variables del modelo

- **Zona:** AGEB (`CVEGEO`) y alcaldía.
- **Cargadores:** densidad por km² y número de puertos por marca (Tesla, Evergo, PlugShare).
- **Demanda:** población, viviendas con auto, riqueza y destinos.
- **Accesibilidad:** pendiente media por AGEB convertida en un factor gradual de demanda.
- **Tipo de zona:** comercial, residencial alto, residencial medio o periferia.
- **Tráfico:** proxy (destinos + viviendas con auto). No hay datos de aforos.

### Cómo funciona la simulación

1. La adopción de autos eléctricos sigue una curva en S (`ADOPT_*`).
2. Demanda pública = autos eléctricos de la zona × kWh/año × 20 % (el 80 % se carga en casa) + carga de destino según tráfico.
3. Se divide entre la competencia (cada marca tiene su peso).
4. Ganancia = kWh × margen × captura − costo fijo, en dos escenarios (máx y mín).

Todos los valores se editan en `config.py`.

### Salida

Una fila por zona y año en `predicciones.json` / `.csv`:

```json
{"zona": "0901000011716", "año": 2030, "ganancia_max": 144150,
 "ganancia_min": -15708, "score_viabilidad": 0.0765,
 "alcaldia": "Álvaro Obregón", "lat": 19.32199, "lon": -99.26029}
```

- `zona` es el `CVEGEO` del polígono, así que se une directo con el GeoJSON.
- `score_viabilidad` es un **percentil** (0 a 1) dentro de cada año: 0.9 significa que la zona está mejor que el 90 % de las demás.

### Consumir los datos

**Python:**
```python
from api import get_predictions
get_predictions(año=2030, top=10)
get_predictions(año=2035, alcaldia="Coyoacán")
```

**Web:** `html/index.html` lee los JSON de predicciones y los une a las zonas por `CVEGEO`; incluye selección temporal para 2026–2035 y accesos a los escenarios 2030 y 2035. Hay que abrirlo con un servidor local.

### Modo sin tiempo

En `config.py`, `USE_RF = False` usa solo regresión lineal.

### Si después se agrega un servidor

- Envolver `api.get_predictions` en FastAPI (ejemplo en el docstring de `api.py`).
- Cargar el modelo una sola vez al iniciar.
- Quitar `lru_cache` o invalidarlo al reentrenar.
- Habilitar CORS para el origen del front.

## Buscador del mapa

Arriba a la izquierda del mapa (`html/index.html`) hay una barra de búsqueda que resalta los pines de electrolineras cercanos a lo que busques:

- **Coordenadas:** `19.4326, -99.1332` (también acepta `lon, lat` y lo corrige solo).
- **Dirección de texto:** se geocodifica con **Nominatim (OpenStreetMap)**, sesgado a la CDMX. Requiere internet.
- **Nombre de electrolinera:** busca sobre `all_chargers_geo.json` (sin acentos y sin importar mayúsculas).

Al elegir un resultado, el mapa vuela al punto y resalta con un anillo los pines que estén dentro del **radio de cercanía** (100 m, 300 m, 500 m o 1 km; por defecto 300 m). Si **no hay ningún pin** en ese radio, se crea un **punto personalizado** en el lugar buscado.

Los puntos personalizados se guardan en `localStorage` (clave `electra_puntos_personalizados`) y se vuelven a mostrar al recargar. **No** tienen pesos, viabilidad ni predicción, y **no** afectan las gráficas ni el modelo. La búsqueda de direcciones necesita el geocodificador en línea; las coordenadas y los nombres siguen funcionando sin internet.

## Limitaciones conocidas

- La ganancia es simulada, no real.
- El tráfico es un proxy.
- Evergo y Tesla no traen número de puertos (cuentan como 1); PlugShare sí, pero solo algunos conectores traen potencia en kW.
- Las zonas sin comercios (alrededor del 80 %) dependen casi solo de autos y riqueza.
- El censo es de 2020 y la población no se proyecta para los años futuros.
- Los resultados pueden cambiar al volver a ejecutar la simulación; guarda una copia de `predicciones.json` si quieres comparar versiones.

