from train import train
from export import export
from plots import make_plots

if __name__ == "__main__":
    train()
    make_plots(export())