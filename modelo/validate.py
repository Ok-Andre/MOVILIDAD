from scipy.stats import spearmanr
from data import build_zones

z = build_zones()
z["demanda"] = (z["vph_autom"] * (1 + z["riqueza_norm"])
                * z["accesibilidad_pendiente"])
z["trafico_accesible"] = z["traffic_idx"] * z["accesibilidad_pendiente"]

for col in ["demanda", "trafico_accesible", "riqueza_norm"]:
    rho, p = spearmanr(z[col], z["n_total"])
    print(f"{col:14s} vs puertos instalados: rho={rho:.3f}  p={p:.2g}")

# Cuántos AGEB con alta demanda no tienen oferta (candidatos reales)
top = z[z["demanda"] >= z["demanda"].quantile(0.9)]
print(f"\nTop 10% demanda: {len(top)} AGEB, {(top['n_total'] == 0).mean():.0%} sin cargadores")
print(top[top["n_total"] == 0].nlargest(10, "demanda")[["zona", "alcaldia", "demanda"]])