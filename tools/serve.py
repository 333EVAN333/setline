"""
Local development server for Setline.

Same as `python -m http.server`, but tells the browser never to cache files,
so every reload picks up your latest edits.

Run from the project folder:   python tools/serve.py
Then open:                      http://localhost:5173
"""
import functools
import http.server
import pathlib

PORT = 5173
ROOT = pathlib.Path(__file__).resolve().parent.parent  # the project folder


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as server:
        print(f"Setline running at http://localhost:{PORT}  (Ctrl+C to stop)")
        server.serve_forever()
