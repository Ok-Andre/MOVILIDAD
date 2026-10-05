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
