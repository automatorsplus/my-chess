#!/usr/bin/env python3
"""Serve MyChess on this Mac only (http://127.0.0.1), so Stockfish's WebAssembly can load.

    python3 serve.py              # start, open the browser, stop with Ctrl+C
    python3 serve.py --app        # open in a Chrome app window if Chrome is installed
    python3 serve.py --idle-exit 600 --no-browser   # how the MyChess.app launcher runs it

The page pings /__alive every 30 seconds; with --idle-exit the server stops by
itself once nothing has pinged for that many seconds (the app window was closed).
"""
import argparse
import http.server
import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
last_seen = time.monotonic()


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".wasm": "application/wasm",
        ".js": "text/javascript",
        ".webmanifest": "application/manifest+json",
        ".json": "application/json",
        ".svg": "image/svg+xml",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Cross-origin isolation lets the multi-threaded Stockfish build use SharedArrayBuffer.
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-MyChess", "1")  # lets the launcher recognise an already-running MyChess server
        super().end_headers()

    def do_GET(self):
        global last_seen
        last_seen = time.monotonic()
        if self.path.split("?")[0] == "/__alive":
            self.send_response(204)
            self.end_headers()
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        pass


def port_is_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def open_ui(url, app_window):
    chrome = "/Applications/Google Chrome.app"
    if app_window and sys.platform == "darwin" and os.path.isdir(chrome):
        subprocess.Popen(["open", "-na", chrome, "--args", f"--app={url}"])
    else:
        webbrowser.open(url)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8971)
    ap.add_argument("--no-browser", action="store_true", help="do not open a browser window")
    ap.add_argument("--app", action="store_true", help="open in a Chrome app window when available")
    ap.add_argument("--idle-exit", type=int, default=0, metavar="SECONDS", help="stop after this long without the app open")
    args = ap.parse_args()

    port = args.port
    while not port_is_free(port):
        port += 1
        if port > args.port + 20:
            sys.exit("No free port found near %d" % args.port)

    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}/"
    print(f"MyChess is running at {url}  (Ctrl+C to stop)", flush=True)

    if args.idle_exit > 0:
        def watchdog():
            while True:
                time.sleep(15)
                if time.monotonic() - last_seen > args.idle_exit:
                    server.shutdown()
                    return
        threading.Thread(target=watchdog, daemon=True).start()

    if not args.no_browser:
        threading.Timer(0.4, open_ui, args=(url, args.app)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
