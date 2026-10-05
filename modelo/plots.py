import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from config import *

def _bars(d, label_col, title, path):
    d = d.sort_values("ganancia_max")
    y = np.arange(len(d))
    fig, ax = plt.subplots(figsize=(9, max(4, 0.35 * len(d))))
    ax.barh(y + 0.2, d["ganancia_max"] / 1e6, 0.4, label="Máxima", color="#2ca25f")
    ax.barh(y - 0.2, d["ganancia_min"] / 1e6, 0.4, label="Mínima", color="#de2d26")
    ax.set_yticks(y, d[label_col])
    ax.axvline(0, color="k", lw=0.8)
    ax.set_xlabel("Ganancia anual (millones MXN)")
    ax.set_title(title)
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)

def make_plots(df: pd.DataFrame):
    for año in PRED_YEARS:
        d = df[df["año"] == año]
        # 1) por alcaldía (promedio por AGEB) — legible en la demo
        a = d.groupby("alcaldia")[["ganancia_max", "ganancia_min"]].mean().reset_index()
        _bars(a, "alcaldia", f"Ganancia promedio por AGEB y alcaldía — {año}",
              OUT / f"ganancia_alcaldia_{año}.png")
        # 2) top 15 AGEBs
        t = d.nlargest(15, "ganancia_max")
        _bars(t, "zona", f"Top 15 zonas (AGEB) — {año}",
              OUT / f"ganancia_top15_{año}.png")

if __name__ == "__main__":
    make_plots(pd.read_csv(PRED_CSV, dtype={"zona": str}))