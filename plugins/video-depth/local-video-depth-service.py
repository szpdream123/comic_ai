"""Loopback companion service for local video-to-grayscale-depth inference.

The service deliberately has a small HTTP contract so the web app can use a
user-owned GPU without uploading the source video to the application server.
It reuses scripts/video-depth-infer.py and runs one inference job at a time.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from email.parser import BytesParser
from email.policy import default
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4


def load_plugin_environment() -> None:
    config_path = Path(__file__).with_name("plugin.env")
    if not config_path.is_file():
        return
    for raw_line in config_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() and key.strip() not in os.environ:
            os.environ[key.strip()] = value.strip()


load_plugin_environment()

MAX_UPLOAD_BYTES = int(os.environ.get("VIDEO_DEPTH_PLUGIN_MAX_BYTES", str(500 * 1024 * 1024)))
RESULT_TTL_SECONDS = int(os.environ.get("VIDEO_DEPTH_PLUGIN_RESULT_TTL", "3600"))
DEFAULT_ALLOWED_ORIGINS = {
    item.strip()
    for item in os.environ.get(
        "VIDEO_DEPTH_ALLOWED_ORIGINS",
        "http://localhost:4310,http://127.0.0.1:4310,http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if item.strip()
}


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, dict] = {}
        self._lock = threading.Lock()
        self._slot = threading.Semaphore(1)

    def create(self, input_path: Path, output_path: Path, file_name: str) -> str:
        job_id = uuid4().hex
        with self._lock:
            self._jobs[job_id] = {
                "id": job_id,
                "status": "queued",
                "fileName": f"{Path(file_name).stem}-depth.mp4",
                "inputPath": str(input_path),
                "outputPath": str(output_path),
                "createdAt": time.time(),
                "error": None,
            }
        threading.Thread(target=self._run, args=(job_id,), daemon=True).start()
        return job_id

    def get(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job else None

    def _run(self, job_id: str) -> None:
        with self._slot:
            with self._lock:
                job = self._jobs.get(job_id)
                if not job:
                    return
                job["status"] = "running"
            bundled_script = Path(__file__).with_name("video-depth-infer.py")
            script = bundled_script if bundled_script.is_file() else Path(__file__).resolve().parents[2] / "scripts" / "video-depth-infer.py"
            command = [
                sys.executable,
                str(script),
                "--input",
                job["inputPath"],
                "--output",
                job["outputPath"],
                "--model",
                os.environ.get("VIDEO_DEPTH_MODEL", "depth-anything/Depth-Anything-V2-Small-hf"),
                "--device",
                os.environ.get("VIDEO_DEPTH_DEVICE", "cuda"),
            ]
            try:
                subprocess.run(
                    command,
                    check=True,
                    timeout=int(os.environ.get("VIDEO_DEPTH_MAX_SECONDS", "3600")),
                    cwd=str(script.parent.parent),
                    env=os.environ.copy(),
                    capture_output=True,
                    text=True,
                )
                if not Path(job["outputPath"]).is_file() or Path(job["outputPath"]).stat().st_size == 0:
                    raise RuntimeError("video_depth_output_empty")
            except Exception as error:  # noqa: BLE001 - job errors are returned to the client
                with self._lock:
                    if job_id in self._jobs:
                        self._jobs[job_id]["status"] = "failed"
                        self._jobs[job_id]["error"] = str(error)[:500]
                return
            with self._lock:
                if job_id in self._jobs:
                    self._jobs[job_id]["status"] = "succeeded"

    def cleanup(self) -> None:
        cutoff = time.time() - RESULT_TTL_SECONDS
        with self._lock:
            expired = [job_id for job_id, job in self._jobs.items() if job["createdAt"] < cutoff]
            jobs = [self._jobs.pop(job_id) for job_id in expired]
        for job in jobs:
            shutil.rmtree(Path(job["inputPath"]).parent, ignore_errors=True)


STORE = JobStore()


def json_bytes(value: dict) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    server_version = "ComicAI-VideoDepth/1"

    def _origin(self) -> str:
        return self.headers.get("Origin", "")

    def _authorized(self) -> bool:
        expected = os.environ.get("VIDEO_DEPTH_PLUGIN_TOKEN", "").strip()
        return not expected or self.headers.get("X-Comic-AI-Plugin-Token", "") == expected

    def _headers(self, status: int, content_type: str = "application/json") -> None:
        origin = self._origin()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        if origin in DEFAULT_ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Comic-AI-Plugin-Token")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def _write_json(self, status: int, value: dict) -> None:
        body = json_bytes(value)
        self._headers(status)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._headers(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            STORE.cleanup()
            self._write_json(HTTPStatus.OK, {
                "ok": True,
                "plugin": "video-depth",
                "version": "1.0.0",
                "model": os.environ.get("VIDEO_DEPTH_MODEL", "depth-anything/Depth-Anything-V2-Small-hf"),
                "device": os.environ.get("VIDEO_DEPTH_DEVICE", "cuda"),
                "authRequired": bool(os.environ.get("VIDEO_DEPTH_PLUGIN_TOKEN", "").strip()),
            })
            return
        if not self._authorized():
            self._write_json(HTTPStatus.UNAUTHORIZED, {"error": "plugin_token_required"})
            return
        prefix = "/jobs/"
        if parsed.path.startswith(prefix):
            job_path = parsed.path[len(prefix):].strip("/")
            is_output = job_path.endswith("/output")
            job_id = job_path[:-len("/output")].strip("/") if is_output else job_path
            job = STORE.get(job_id)
            if not job:
                self._write_json(HTTPStatus.NOT_FOUND, {"error": "job_not_found"})
                return
            if is_output:
                if job["status"] != "succeeded":
                    self._write_json(HTTPStatus.CONFLICT, {"error": "job_not_ready", "status": job["status"]})
                    return
                output = Path(job["outputPath"])
                if not output.is_file():
                    self._write_json(HTTPStatus.NOT_FOUND, {"error": "output_not_found"})
                    return
                self._headers(HTTPStatus.OK, "video/mp4")
                self.send_header("Content-Length", str(output.stat().st_size))
                self.send_header("Content-Disposition", f'attachment; filename="{job["fileName"].replace(chr(34), "")}"')
                self.end_headers()
                with output.open("rb") as stream:
                    shutil.copyfileobj(stream, self.wfile)
                return
            self._write_json(HTTPStatus.OK, {
                "id": job["id"], "status": job["status"], "fileName": job["fileName"],
                "error": job["error"],
            })
            return
        self._write_json(HTTPStatus.NOT_FOUND, {"error": "route_not_found"})

    def do_POST(self) -> None:  # noqa: N802
        if urlparse(self.path).path != "/jobs":
            self._write_json(HTTPStatus.NOT_FOUND, {"error": "route_not_found"})
            return
        if not self._authorized():
            self._write_json(HTTPStatus.UNAUTHORIZED, {"error": "plugin_token_required"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_UPLOAD_BYTES:
            self._write_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "video_too_large"})
            return
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self._write_json(HTTPStatus.BAD_REQUEST, {"error": "multipart_file_required"})
            return
        raw = self.rfile.read(length)
        message = BytesParser(policy=default).parsebytes(b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + raw)
        part = next((item for item in message.iter_attachments() if item.get_param("name", header="content-disposition") == "file"), None)
        if part is None:
            self._write_json(HTTPStatus.BAD_REQUEST, {"error": "multipart_file_required"})
            return
        file_name = part.get_filename() or "input.mp4"
        suffix = Path(file_name).suffix.lower()
        if suffix not in {".mp4", ".webm", ".mov"}:
            self._write_json(HTTPStatus.BAD_REQUEST, {"error": "video_format_not_supported"})
            return
        work = Path(tempfile.mkdtemp(prefix="comic-ai-video-depth-plugin-"))
        input_path, output_path = work / f"input{suffix}", work / "depth.mp4"
        input_path.write_bytes(part.get_payload(decode=True) or b"")
        job_id = STORE.create(input_path, output_path, file_name)
        self._write_json(HTTPStatus.ACCEPTED, {"id": job_id, "status": "queued", "statusUrl": f"/jobs/{job_id}", "outputUrl": f"/jobs/{job_id}/output"})

    def log_message(self, format: str, *args: object) -> None:
        print(f"[video-depth] {format % args}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Comic AI local video depth plugin")
    parser.add_argument("--host", default=os.environ.get("VIDEO_DEPTH_PLUGIN_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("VIDEO_DEPTH_PLUGIN_PORT", "48123")))
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("refusing to bind outside loopback")
    print(f"video-depth plugin listening on http://{args.host}:{args.port}", flush=True)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
