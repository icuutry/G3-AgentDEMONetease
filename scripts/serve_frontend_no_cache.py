"""Serve local frontend assets with explicit no-cache response headers."""

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHTTPRequestHandler(SimpleHTTPRequestHandler):
    """Simple static-file handler that prevents browser cache reuse."""

    def end_headers(self) -> None:
        self.send_header(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, max-age=0",
        )
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def create_server(
    directory: str | Path,
    bind: str,
    port: int,
) -> ThreadingHTTPServer:
    resolved_directory = Path(directory).resolve(strict=True)
    handler = partial(
        NoCacheHTTPRequestHandler,
        directory=str(resolved_directory),
    )
    return ThreadingHTTPServer((bind, port), handler)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Serve frontend assets with no-cache response headers.",
    )
    parser.add_argument("--directory", required=True)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5510)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    with create_server(args.directory, args.bind, args.port) as server:
        print(
            f"Serving frontend on http://{args.bind}:{server.server_port}",
            flush=True,
        )
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
