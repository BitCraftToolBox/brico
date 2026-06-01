"""
avg-colors.py
Reads each item-frame-{rarity}-{theme}.png in the same directory,
discards fully- or partially-transparent pixels (alpha < 255),
and prints the average RGB color per rarity per theme.
"""

import os
from pathlib import Path
from PIL import Image

DIR = Path(__file__).parent

RARITIES = ["basic", "common", "uncommon", "rare", "epic", "legendary", "mythic"]
THEMES   = ["light", "dark"]


def avg_color(path: Path) -> str:
    img = Image.open(path).convert("RGBA")
    pixels = list(img.getdata())
    opaque = [(r, g, b) for r, g, b, a in pixels if a == 255]
    if not opaque:
        return "(no opaque pixels)"
    n = len(opaque)
    r = round(sum(p[0] for p in opaque) / n)
    g = round(sum(p[1] for p in opaque) / n)
    b = round(sum(p[2] for p in opaque) / n)
    return f"#{r:02x}{g:02x}{b:02x}"


for theme in THEMES:
    print(f"{theme} theme")
    for rarity in RARITIES:
        fname = DIR / f"item-frame-{rarity}-{theme}.png"
        if fname.exists():
            color = avg_color(fname)
            # print(f"        --bc-rarity-color-{RARITIES.index(rarity)}: {color};")
            print(f"  {rarity}: {color}")
        else:
            print(f"  {rarity}: (file not found)")
    print()
