"""Render the *generated* chart data so the output can be checked by eye."""

from __future__ import annotations

import base64
import json
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.abspath(os.path.join(HERE, "..", "..", "src", "lib", "charts", "generated"))
OUT = os.path.join(HERE, "preview")

sys.path.insert(0, HERE)
from scenes import SCENES  # noqa: E402

SIZE = 900


def load_chart(scene_id):
    with open(os.path.join(GEN, f"{scene_id}.ts")) as handle:
        text = handle.read()
    match = re.search(r"= (\{.*\}) as ChartData;", text, re.S)
    return json.loads(match.group(1))


def make_projector(chart, width, height):
    hw, hh = chart["halfWidthM"], chart["halfHeightM"]

    def project(x, z):
        return (
            (x + hw) / (2 * hw) * width,
            (hh - z) / (2 * hh) * height,
        )

    return project


def main():
    os.makedirs(OUT, exist_ok=True)
    for scene in SCENES:
        chart = load_chart(scene["id"])
        aspect = chart["halfHeightM"] / chart["halfWidthM"]
        width, height = SIZE, int(SIZE * aspect)
        project = make_projector(chart, width, height)

        image = Image.new("RGB", (width, height), (10, 26, 38))
        draw = ImageDraw.Draw(image)

        # depth raster
        grid = chart["depth"]
        raw = np.frombuffer(base64.b64decode(grid["data"]), dtype="<i2").reshape(
            grid["rows"], grid["cols"]
        ) / 10.0
        shade = np.clip(raw / 40.0, 0, 1)
        rgb = np.zeros((grid["rows"], grid["cols"], 3), dtype=np.uint8)
        rgb[..., 0] = (150 - 130 * shade).clip(0, 255)
        rgb[..., 1] = (190 - 150 * shade).clip(0, 255)
        rgb[..., 2] = (215 - 140 * shade).clip(0, 255)
        rgb[raw < 0] = (28, 40, 30)
        image.paste(
            Image.fromarray(rgb).resize((width, height), Image.BILINEAR), (0, 0)
        )

        for level in chart["contours"]:
            tone = int(90 + 120 * min(1.0, level["depthM"] / 40))
            for line in level["lines"]:
                pts = [project(x, z) for x, z in line]
                if len(pts) > 1:
                    draw.line(pts, fill=(tone, tone, 255 - tone // 2), width=1)

        for ring in chart["land"]:
            pts = [project(x, z) for x, z in ring["points"]]
            if len(pts) < 3:
                continue
            draw.polygon(pts, fill=(74, 84, 62) if not ring["hole"] else (40, 70, 110))
            draw.line(pts + [pts[0]], fill=(220, 214, 180), width=1)

        for structure in chart["structures"]:
            pts = [project(x, z) for x, z in structure["points"]]
            if len(pts) > 1:
                draw.line(pts, fill=(255, 120, 60), width=2)

        for sounding in chart["soundings"]:
            x, z, depth = sounding
            px, py = project(x, z)
            draw.text((px - 6, py - 4), f"{depth:.0f}", fill=(40, 60, 80))

        for label in chart["labels"]:
            px, py = project(label["x"], label["z"])
            draw.ellipse([px - 2, py - 2, px + 2, py + 2], fill=(255, 240, 120))
            draw.text((px + 5, py - 5), label["name"], fill=(255, 240, 120))

        draw.text((6, 6), f"{chart['id']}  ±{chart['halfWidthM']}x{chart['halfHeightM']} m", fill=(255, 255, 255))
        image.save(os.path.join(OUT, f"gen-{scene['id']}.png"))
        print("wrote", scene["id"])


if __name__ == "__main__":
    main()
