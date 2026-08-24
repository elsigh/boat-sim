"""Render a quick PNG of each cached DEM so scene windows can be eyeballed."""

from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scenes import SCENES  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
OUT = os.path.join(HERE, "preview")


def colorize(grid):
    h, w = grid.shape
    rgb = np.zeros((h, w, 3), dtype=np.uint8)
    land = np.nan_to_num(grid, nan=0.0) >= 0
    depth = -np.nan_to_num(grid, nan=0.0)

    # water ramp: pale in the shallows, dark navy offshore
    t = np.clip(depth / 60.0, 0, 1)
    rgb[..., 0] = np.where(land, 0, (200 - 180 * t)).astype(np.uint8)
    rgb[..., 1] = np.where(land, 0, (225 - 170 * t)).astype(np.uint8)
    rgb[..., 2] = np.where(land, 0, (240 - 130 * t)).astype(np.uint8)

    elev = np.clip(np.nan_to_num(grid, nan=0.0) / 120.0, 0, 1)
    rgb[..., 0] = np.where(land, (90 + 120 * elev), rgb[..., 0]).astype(np.uint8)
    rgb[..., 1] = np.where(land, (105 + 110 * elev), rgb[..., 1]).astype(np.uint8)
    rgb[..., 2] = np.where(land, (80 + 100 * elev), rgb[..., 2]).astype(np.uint8)
    return rgb


def main():
    os.makedirs(OUT, exist_ok=True)
    for scene in SCENES:
        path = os.path.join(CACHE, f"{scene['id']}.npy")
        grid = np.load(path)
        image = Image.fromarray(colorize(grid))
        draw = ImageDraw.Draw(image)
        h, w = grid.shape
        draw.line([(w // 2, 0), (w // 2, h)], fill=(255, 0, 0), width=1)
        draw.line([(0, h // 2), (w, h // 2)], fill=(255, 0, 0), width=1)
        draw.text((6, 6), f"{scene['id']}  {scene['half_w_m']}x{scene['half_h_m']} m", fill=(255, 255, 0))
        image.save(os.path.join(OUT, f"{scene['id']}.png"))
        print("wrote", scene["id"], grid.shape)


if __name__ == "__main__":
    main()
