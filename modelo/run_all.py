
import os, subprocess, sys
 
# Uso:  python run_all.py            -> escenario "media"
#       python run_all.py baja|alta  -> ese escenario (salidas en salidas/<escenario>/)
#       python run_all.py todos      -> corre los tres
if len(sys.argv) > 1 and sys.argv[1] == "todos":
    for e in ("baja", "media", "alta"):
        subprocess.run([sys.executable, __file__, e], check=True)
    sys.exit()
if len(sys.argv) > 1:
    os.environ["ESCENARIO"] = sys.argv[1]
 
from train import train
from export import export
from plots import make_plots
 
if __name__ == "__main__":
    train()
    make_plots(export())
 