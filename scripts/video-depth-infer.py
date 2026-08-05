"""Generate a grayscale relative-depth video with Depth Anything V2 Small."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image
from transformers import pipeline


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="depth-anything/Depth-Anything-V2-Small-hf")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--max-side", type=int, default=1280)
    parser.add_argument("--target-fps", type=float, default=0)
    return parser.parse_args()


def resolve_device(value: str) -> int | str:
    normalized = value.strip().lower()
    if normalized in {"cuda", "gpu", "0"}:
        if not torch.cuda.is_available():
            raise RuntimeError("video_depth_cuda_unavailable")
        return 0
    return -1


def fit_size(width: int, height: int, max_side: int) -> tuple[int, int]:
    if max(width, height) <= max_side:
        return width, height
    scale = max_side / max(width, height)
    return max(2, int(width * scale) // 2 * 2), max(2, int(height * scale) // 2 * 2)


def normalize_depth(depth: np.ndarray) -> np.ndarray:
    finite = depth[np.isfinite(depth)]
    if finite.size == 0:
        return np.zeros(depth.shape, dtype=np.uint8)
    low, high = np.percentile(finite, (2, 98))
    if high <= low:
        low, high = float(finite.min()), float(finite.max())
    if high <= low:
        return np.zeros(depth.shape, dtype=np.uint8)
    normalized = np.clip((depth - low) / (high - low), 0, 1)
    return (normalized * 255).astype(np.uint8)


def main() -> None:
    args = parse_args()
    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        raise RuntimeError("video_depth_input_unreadable")
    source_width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    source_height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    source_fps = float(capture.get(cv2.CAP_PROP_FPS)) or 24.0
    width, height = fit_size(source_width, source_height, max(480, args.max_side))
    fps = args.target_fps if args.target_fps > 0 else source_fps

    depth_pipe = pipeline(
        "depth-estimation",
        model=os.environ.get("VIDEO_DEPTH_MODEL", args.model),
        device=resolve_device(os.environ.get("VIDEO_DEPTH_DEVICE", args.device)),
    )
    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height),
        True,
    )
    if not writer.isOpened():
        capture.release()
        raise RuntimeError("video_depth_output_unwritable")

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            prediction = depth_pipe(Image.fromarray(rgb))["predicted_depth"]
            depth = prediction.detach().float().cpu().numpy().squeeze()
            gray = normalize_depth(depth)
            gray = cv2.resize(gray, (width, height), interpolation=cv2.INTER_LINEAR)
            writer.write(cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR))
    finally:
        capture.release()
        writer.release()

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError("video_depth_output_empty")


if __name__ == "__main__":
    main()
