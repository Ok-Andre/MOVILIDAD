import json
from functools import lru_cache
from config import PRED_JSON

@lru_cache(maxsize=1)
def _load():
    return json.loads(PRED_JSON.read_text(encoding="utf-8"))

def get_predictions(año=None, zona=None, alcaldia=None, top=None) -> list[dict]:
    """Devuelve [{zona, año, ganancia_max, ganancia_min, score_viabilidad, ...}].

    Uso desde el front (sin servidor): leer predicciones.json directo, o
    importar esta función si el front también es Python.

    SI DESPUÉS METEN SERVIDOR (FastAPI, ~5 líneas):
        @app.get("/predicciones")
        def pred(año: int | None = None, zona: str | None = None,
                 alcaldia: str | None = None, top: int | None = None):
            return get_predictions(año, zona, alcaldia, top)
      - Quitar lru_cache o invalidarlo al reentrenar.
      - Cargar el pickle UNA vez al arrancar y predecir bajo demanda
        (export.predict_all) en vez de leer el JSON precalculado.
      - Habilitar CORS para el origen del front.
    """
    rows = _load()
    if año is not None:
        rows = [r for r in rows if r["año"] == año]
    if zona is not None:
        rows = [r for r in rows if r["zona"] == zona]
    if alcaldia is not None:
        rows = [r for r in rows if r["alcaldia"].lower() == alcaldia.lower()]
    if top:
        rows = sorted(rows, key=lambda r: r["score_viabilidad"], reverse=True)[:top]
    return rows