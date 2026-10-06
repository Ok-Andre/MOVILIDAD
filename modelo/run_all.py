import os, subprocess, sys

# Uso:  python run_all.py            -> escenario "media"
#       python run_all.py baja|alta  -> ese escenario (salidas en salidas/<escenario>/)
#       python run_all.py todos      -> corre los tres
# Ya no se entrena el Random Forest: las cifras salen de la simulación Monte Carlo
# (incertidumbre.py). train.py queda disponible por separado: python train.py
if len(sys.argv) > 1 and sys.argv[1] == "todos":
    for e in ("baja", "media", "alta"):
        subprocess.run([sys.executable, __file__, e], check=True)
    sys.exit()
if len(sys.argv) > 1:
    os.environ["ESCENARIO"] = sys.argv[1]

from export import export
from plots import make_plots

if __name__ == "__main__":
    make_plots(export())