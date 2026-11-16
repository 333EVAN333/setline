"""
Generates Setline's app icons into ../icons/ (needs Pillow: pip install pillow).

The motif is three "set rows" like the workout screen: two checked off
(filled lime box with a tick), one still to do (outlined box).

Run from the project folder:   python tools/make_icons.py

Why several files?
  - icon-192 / icon-512 : used by Android/Chrome for the home screen + splash.
  - icon-maskable-512   : Android crops icons into circles/squircles; a
                          "maskable" icon keeps its artwork inside the middle
                          80% so nothing important gets cut off.
  - apple-touch-icon    : iPhone/iPad home-screen icon (180x180).
"""
import pathlib
from PIL import Image, ImageDraw

BG = (13, 14, 16)
LIME = (198, 242, 78)
LIME_DIM = (198, 242, 78, 90)  # translucent lime for the "line" part of each row
INK = (17, 21, 10)

OUT = pathlib.Path(__file__).resolve().parent.parent / "icons"
S = 1024  # draw big, then shrink for smooth edges


def draw_motif(img, scale):
    """Draw the three rows centred on the canvas. scale=1 fills ~62% of the width."""
    d = ImageDraw.Draw(img, "RGBA")
    c = S / 2
    box = 150 * scale         # check-box size
    gap = 64 * scale          # vertical gap between rows
    bar_w = 330 * scale       # length of the line next to each box
    bar_h = 64 * scale
    total_w = box + 44 * scale + bar_w
    left = c - total_w / 2
    top = c - (3 * box + 2 * gap) / 2
    radius = 34 * scale

    for i in range(3):
        y = top + i * (box + gap)
        bx0, by0, bx1, by1 = left, y, left + box, y + box
        checked = i < 2
        if checked:
            d.rounded_rectangle((bx0, by0, bx1, by1), radius, fill=LIME)
            # tick mark
            w = 22 * scale
            p1 = (bx0 + box * 0.26, by0 + box * 0.52)
            p2 = (bx0 + box * 0.44, by0 + box * 0.70)
            p3 = (bx0 + box * 0.76, by0 + box * 0.32)
            d.line([p1, p2, p3], fill=INK, width=int(w), joint="curve")
            for p in (p1, p3):  # round the tick's ends
                d.ellipse((p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2), fill=INK)
        else:
            d.rounded_rectangle((bx0, by0, bx1, by1), radius, outline=LIME, width=int(16 * scale))
        # the "set line" to the right of the box
        lx0 = bx1 + 44 * scale
        ly0 = y + (box - bar_h) / 2
        length = bar_w * (1.0, 0.8, 0.6)[i]
        d.rounded_rectangle((lx0, ly0, lx0 + length, ly0 + bar_h), bar_h / 2,
                            fill=LIME if checked else LIME_DIM)


def make(size, scale, name):
    img = Image.new("RGBA", (S, S), BG + (255,))
    draw_motif(img, scale)
    img.convert("RGB").resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
    print("wrote", OUT / name)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    make(192, 1.0, "icon-192.png")
    make(512, 1.0, "icon-512.png")
    make(512, 0.78, "icon-maskable-512.png")  # artwork kept inside the safe zone
    make(180, 1.0, "apple-touch-icon.png")
    make(32, 1.15, "favicon-32.png")
