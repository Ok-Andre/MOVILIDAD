# Viabilidad para Estaciones de Carga (Electrolineras) en la CDMX


## La Fórmula Matemática 

El modelo de viabilidad se basa en la siguiente ecuación:
**Puntuación = (w₁ · Poder Adquisitivo) + (w₂ · Puntos de Atracción / Destino) - (w₃ · Saturación de Competencia)**

Todos los factores son normalizados usando una escala Min-Max (de 0 a 1) para que sean comparables entre sí. 

### 1. Poder Adquisitivo (Proxy para adopción de vehículos eléctricos)
Como el censo no desglosa "autos 100% eléctricos", el algoritmo construye un proxy multiplicando las variables clave que definen a los adoptantes tempranos de esta tecnología:
* `Tasa de Autos` (VPH_AUTOM / Viviendas Habitadas)
* `Tasa de Internet` (VPH_INTER / Viviendas Habitadas)
* `Escolaridad Promedio` (GRAPROES)

Al multiplicar (en lugar de sumar) estas variables, el algoritmo castiga severamente a las zonas periféricas que tienen muchos autos pero bajo acceso a internet o escolaridad, premiando a las zonas ricas (como Polanco, Santa Fe, Del Valle).

### 2. Puntos de Atracción (Carga de Oportunidad)
Se prioriza la **Carga de Oportunidad / Destino**. El algoritmo cuenta los comercios dentro del polígono donde un usuario típicamente se detiene de 1 a 3 horas. Los puntos que suma esta variable incluyen:
* Supermercados
* Tiendas departamentales
* Corporativos y oficinas administrativas
* Hospitales privados

¿Porque se hizo asi y porque hay dos mapas?

El 80% o más de las recargas ocurren en casa durante la noche. Quien vive en Polanco o Bosques ya tiene su cargador en el garaje. No va a salir a sentarse 40 minutos en una estación de servicio en su propia colonia para pagar una tarifa comercial más cara que la tarifa CFE de su hogar.

La recarga pública sirve a dos propósitos específicos:

Carga de oportunidad / destino: Lugares donde el usuario ya planea quedarse detenido de 1 a 3 horas (centros comerciales, supermercados, clubes deportivos, corporativos, hospitales privados).



### 3. Saturación de Competencia (Penalización)
El algoritmo resta la viabilidad de un polígono si ya existen estaciones de carga operando, para evitar zonas saturadas e incentivar nuevas zonas desatendidas.


## Datasets Utilizados

El análisis fusiona información demográfica, económica y de infraestructura de movilidad:

1. **Marco Geoestadístico Nacional (INEGI)** (`09a.json`): Provee los polígonos geográficos a nivel de AGEB (Área Geoestadística Básica).
2. **Censo de Población y Vivienda 2020 (INEGI)** (`RESAGEBURB_09CSV20.csv`): Nos da la demografía cuadra por cuadra. Se aplicaron cruces limpios y filtros para ignorar los totales por alcaldía y concentrarse en métricas locales.
3. **Directorio de Unidades Económicas** (`destinos_economicos_raw.json`): Base de datos de comercios filtrada por giros de oportunidad (Supermercados, Corporativos, etc.) mediante `filter_destinos.py`.
4. **Competencia / Electrolineras**:
   * `tesla_chargers_geo.json`: Superchargers y cargadores de destino de Tesla.
   * `evergo_cdmx.json`: Red de carga pública de Evergo.
   * `plug_share_cdmx.json`: Estaciones mapeadas por la comunidad en PlugShare.
   * *Todos estos se unen en un solo archivo unificado (`all_chargers_geo.json`)*.

---

## Estructura del Mapa

El resultado final se visualiza en un mapa web (Leaflet) que permite interactuar con los polígonos:
* **Color Verde**: Zonas de alta viabilidad (Puntaje cercano a 1.0)
* **Color Amarillo**: Viabilidad media.
* **Color Rojo**: Baja viabilidad, zonas saturadas de competencia o bajo poder adquisitivo.

# Modelo predictivo — Electrolineras CFE

Predice la ganancia anual (máxima y mínima) de una electrolinera por zona
(AGEB de CDMX) para **2030 y 2035**, y un score de viabilidad de 0 a 1.

> ⚠️ **Aviso importante:** no existen datos reales de ingresos de
> electrolineras. La variable objetivo se **simula** con una fórmula con
> supuestos editables (`config.py`). El modelo aprende esa fórmula, así que el
> RMSE mide qué tan bien reproduce nuestros supuestos, no la realidad.
> Validar los supuestos con tarifas y datos reales de CFE antes de usar los
> números como decisión de negocio.

## Cómo correrlo

```bash
cd modelo
pip install geopandas pandas numpy scikit-learn matplotlib
python run_all.py
```

Genera en `salidas/`: `modelo.pkl`, `metricas.json`, `predicciones.csv`,
`predicciones.json` y las gráficas `.png`.

## Flujo

```
viabilidad_cdmx_v2.geojson ─┐
censo (POBTOT) ─────────────┼─> data.py ──> features por AGEB
all_chargers_geo.json ──────┘                    │
                                                 v
                                   simulate.py (ganancia sintética
                                   por zona x año, 2025-2035)
                                                 │
                                                 v
                            train.py: Regresión lineal vs Random Forest
                            (elige menor RMSE, guarda pickle)
                                                 │
                                                 v
                      export.py: predice 2030 y 2035 -> CSV + JSON
                                       │                  │
                                       v                  v
                                  plots.py             api.py / html
```

## Archivos

| Archivo | Qué hace |
|---|---|
| `config.py` | Rutas, switch `USE_RF` y supuestos de la simulación |
| `data.py` | Construye una fila por AGEB con las features |
| `simulate.py` | Crea la ganancia sintética por zona y año |
| `train.py` | Entrena y compara modelos, guarda el mejor |
| `export.py` | Predice 2030/2035 y exporta CSV/JSON |
| `plots.py` | Gráficas de ganancia máx/mín |
| `api.py` | `get_predictions()` para consumir los datos |
| `run_all.py` | Ejecuta todo en orden |

## Features

- **zona:** AGEB (`CVEGEO`) y alcaldía
- **densidad de cargadores:** cargadores por km², cruce espacial con `all_chargers`
- **marca:** conteo de Tesla, Evergo y PlugShare, y marca dominante
- **población:** `POBTOT` del censo 2020
- **tipo de zona:** comercial, residencial alto, residencial medio o periferia
- **tráfico:** *proxy* (destinos + viviendas con auto). No hay dataset de aforos (`TODO` en `data.py`)

## Cómo funciona la simulación

1. La adopción de EVs sigue una curva logística (`ADOPT_*`).
2. Demanda pública = EVs de la zona × kWh/año × 20% (el 80% se carga en casa) + carga de destino según tráfico.
3. Se divide entre la competencia (peso por marca, Tesla pesa más).
4. Ganancia = kWh × margen × captura − costo fijo. Se calcula en dos escenarios, `max` y `min`.

Todos los valores están en `config.py`.

## Salida

`predicciones.json` / `.csv`, una fila por zona y año:

```json
{"zona": "090020001234", "año": 2030, "ganancia_max": 850000,
 "ganancia_min": 310000, "score_viabilidad": 0.8123,
 "alcaldia": "Miguel Hidalgo", "lat": 19.43, "lon": -99.2}
```

- `zona` es el `CVEGEO` del polígono, así que se une directo con el GeoJSON.
- `score_viabilidad` va de 0 a 1 y es relativo dentro de cada año.

## Consumir los datos

**Python:**
```python
from api import get_predictions
get_predictions(año=2030, top=10)
get_predictions(año=2035, alcaldia="Coyoacán")
```

**Front (HTML):** leer `html/predicciones.json` con `fetch` y unir por
`CVEGEO` (ver `html/index.html`, botones 2030/2035). Requiere servir con
`python -m http.server` desde `html/`.

## Modo sin tiempo

En `config.py` pon `USE_RF = False` para usar solo regresión lineal.

## Si después se agrega servidor

- Envolver `api.get_predictions` en FastAPI (ejemplo en el docstring de `api.py`).
- Cargar el pickle una sola vez al iniciar y predecir bajo demanda.
- Quitar `lru_cache` o invalidarlo al reentrenar.
- Habilitar CORS para el origen del front.

## Limitaciones conocidas

- Ganancia sintética, no real.
- Tráfico es un proxy.
- `all_chargers` se deduplica por (red, nombre, coordenadas), así que un sitio con varios puertos cuenta como uno.
- El censo es de 2020 y la población no se proyecta a 2030/2035.