#!/usr/bin/env python3
"""Render changed .gdl files and emit an artifact manifest for PR previews."""

import argparse
import base64
import hashlib
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import quote
import zlib
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parent.parent
PLAYGROUND = "https://www.siddharthaprasad.com/spytial-gdl/playground/"
MAX_SOURCE_BYTES = 24_000


def share_url(source):
    # Match playground/index.html's #z= codec: JSON, raw DEFLATE, base64url.
    payload = json.dumps({"m": source}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    compressor = zlib.compressobj(wbits=-15)
    compressed = compressor.compress(payload) + compressor.flush()
    token = base64.urlsafe_b64encode(compressed).decode("ascii").rstrip("=")
    return PLAYGROUND + "#z=" + token


def changed_files(base):
    result = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=ACMRT", f"{base}...HEAD"],
        cwd=ROOT, check=True, capture_output=True, text=True,
    )
    return [Path(line) for line in result.stdout.splitlines() if line.endswith(".gdl")]


def source_file(path):
    full = (ROOT / path).resolve()
    if os.path.commonpath((str(ROOT), str(full))) != str(ROOT) or full.suffix != ".gdl":
        raise ValueError(f"Not a repository .gdl file: {path}")
    data = full.read_bytes()
    if len(data) > MAX_SOURCE_BYTES:
        raise ValueError(f"{path} exceeds {MAX_SOURCE_BYTES} bytes")
    return data.decode("utf-8")


def start_server():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    process = subprocess.Popen(
        ["node", "scripts/preview-server.mjs"], cwd=ROOT,
        env={**os.environ, "PORT": str(port)}, stdout=subprocess.DEVNULL,
    )
    url = f"http://127.0.0.1:{port}/playground/"
    for _ in range(100):
        if process.poll() is not None:
            raise RuntimeError("Preview server exited before becoming ready")
        try:
            urllib.request.urlopen(url, timeout=0.5).close()
            return process, url
        except (OSError, urllib.error.URLError, TimeoutError):
            time.sleep(0.1)
    process.terminate()
    raise RuntimeError("Preview server did not become ready")


def render(paths, output, pr_number, head_sha):
    output.mkdir(parents=True, exist_ok=True)
    server, local_url = start_server()
    diagrams = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                for path in paths:
                    page = browser.new_page(viewport={"width": 1500, "height": 900}, device_scale_factor=1)
                    source = source_file(path)
                    if not source.strip():
                        raise ValueError(f"{path} is empty")
                    live_url = share_url(source)
                    if len(live_url) > 8000:
                        raise ValueError(f"{path}: share URL exceeds 8000 characters")
                    stem = re.sub(r"[^a-zA-Z0-9-]+", "-", path.stem).strip("-") or "diagram"
                    filename = f"{stem}-{hashlib.sha256(str(path).encode()).hexdigest()[:10]}.png"
                    image = output / filename
                    page.goto(local_url + "#" + live_url.partition("#")[2], wait_until="domcontentloaded")
                    page.wait_for_function(
                        """() => {
                          const status = document.querySelector('#status');
                          return status && (status.textContent.trim().startsWith('Rendered ') ||
                            status.classList.contains('error'));
                        }""", timeout=45000,
                    )
                    status = page.locator("#status").inner_text().strip()
                    if not status.startswith("Rendered "):
                        raise RuntimeError(f"{path}: {status}")
                    if page.locator("#source-input").input_value() != source:
                        raise RuntimeError(f"{path}: share URL did not restore the source")
                    # The graph's own fit pass runs again at 450 ms and 1000 ms.
                    page.wait_for_timeout(1400)
                    page.locator("#graph").screenshot(path=str(image), animations="disabled")
                    diagrams.append({"path": str(path), "image": filename, "live_url": live_url})
                    page.close()
            finally:
                browser.close()
    finally:
        server.terminate()
        server.wait(timeout=5)
    manifest = {"pr": pr_number, "head_sha": head_sha, "diagrams": diagrams}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--changed-from", help="Base commit for changed .gdl files")
    parser.add_argument("--files", nargs="*", type=Path, help="Specific repository .gdl files")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--pr", type=int, default=0)
    parser.add_argument("--sha", default="local")
    parser.add_argument("--image-url-prefix", help="Public URL prefix for copy-ready PR Markdown")
    args = parser.parse_args()
    if (args.changed_from is None) == (args.files is None):
        parser.error("Specify exactly one of --changed-from or --files")
    paths = changed_files(args.changed_from) if args.changed_from else args.files
    if not paths:
        print("No .gdl files to preview")
        args.output.mkdir(parents=True, exist_ok=True)
        (args.output / "manifest.json").write_text(json.dumps({"pr": args.pr, "head_sha": args.sha, "diagrams": []}) + "\n")
        return
    manifest = render(paths, args.output.resolve(), args.pr, args.sha)
    print(json.dumps(manifest, indent=2))
    if args.image_url_prefix:
        print("\nPR Markdown:\n")
        for item in manifest["diagrams"]:
            image_url = args.image_url_prefix.rstrip("/") + "/" + quote(item["image"])
            print(f"[![Preview of {item['path']}]({image_url})]({item['live_url']})")
            print(f"[Open interactive diagram]({item['live_url']})\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"GDL preview failed: {error}", file=sys.stderr)
        sys.exit(1)
