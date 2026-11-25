"""
Generates Setline's app icons into ../icons/ from the 💪 artwork in
icons/source/twemoji-1f4aa.svg, by screenshotting tools/icon.html with
headless Microsoft Edge (installed on every Windows PC).

Run from the project folder:   python tools/make_icons.py

Why several files?
  - icon-192 / icon-512 : used by Android/Chrome for the home screen + splash.
  - icon-maskable-512   : Android crops icons into circles/squircles; a
                          "maskable" icon keeps its artwork inside the middle
                          80% so nothing important gets cut off.
  - apple-touch-icon    : iPhone/iPad home-screen icon (180x180).
  - favicon-32          : browser tab icon.

The 💪 artwork is Twemoji by Twitter, Inc. and other contributors,
licensed CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
"""
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
PAGE = (ROOT / "tools" / "icon.html").as_uri()
EDGE_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

# file name, size in px, emoji size as a share of the icon
ICONS = [
    ("icon-192.png", 192, 0.66),
    ("icon-512.png", 512, 0.66),
    ("icon-maskable-512.png", 512, 0.50),
    ("apple-touch-icon.png", 180, 0.66),
    ("favicon-32.png", 32, 0.86),
]


def find_edge():
    for p in EDGE_PATHS:
        if pathlib.Path(p).exists():
            return p
    raise SystemExit("Microsoft Edge not found; install it or edit EDGE_PATHS.")


def render(edge, name, size, share):
    target = OUT / name
    subprocess.run([
        edge, "--headless", "--disable-gpu", "--hide-scrollbars",
        "--force-device-scale-factor=1", "--allow-file-access-from-files",
        f"--window-size={size},{size}", f"--screenshot={target}",
        f"{PAGE}?share={share}",
    ], check=True, capture_output=True, timeout=60)
    print("wrote", target)


if __name__ == "__main__":
    edge = find_edge()
    for name, size, share in ICONS:
        render(edge, name, size, share)
