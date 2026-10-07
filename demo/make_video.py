"""Render a short, factual API Bridge demo from verified browser captures.

Pass --cloud-screenshot only after the Agent37 cloud agent has run successfully.
The local-only cut is a preparation artifact, not a hackathon submission.
"""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[3]
OUTPUTS = ROOT / "outputs"
CANVAS = (1280, 720)
BACKGROUND = "#070c1d"
ACCENT = "#a4f4b0"
WHITE = "#f4f8ff"
MUTED = "#a9b5c9"
FONT_PATH = Path("C:/Windows/Fonts/segoeui.ttf")
FONT_BOLD_PATH = Path("C:/Windows/Fonts/segoeuib.ttf")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_BOLD_PATH if bold else FONT_PATH), size)


def render_card(number: str, title: str, detail: str, screenshot: Path, target: Path) -> None:
    frame = Image.new("RGB", CANVAS, BACKGROUND)
    draw = ImageDraw.Draw(frame)
    draw.rounded_rectangle((32, 20, 1248, 86), radius=16, fill="#111b33")
    draw.text((54, 34), "API BRIDGE", font=font(22, True), fill=ACCENT)
    draw.text((1168, 35), number, font=font(20, True), fill=MUTED)

    source = Image.open(screenshot).convert("RGB")
    preview = ImageOps.contain(source, (1200, 530), Image.Resampling.LANCZOS)
    x = (CANVAS[0] - preview.width) // 2
    y = 101 + (530 - preview.height) // 2
    frame.paste(preview, (x, y))
    draw.rounded_rectangle((x - 2, y - 2, x + preview.width + 2, y + preview.height + 2), radius=4, outline="#344463", width=3)

    draw.rectangle((0, 642, 1280, 720), fill="#111b33")
    draw.text((42, 649), title, font=font(26, True), fill=WHITE)
    draw.text((43, 684), detail, font=font(16), fill=MUTED)
    frame.save(target, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cloud-screenshot", type=Path)
    args = parser.parse_args()
    cards = [
        ("01", "From an API description to approved tools", "Three read-only tools across two public APIs", OUTPUTS / "api-bridge-hero.png", 5),
        ("02", "Choose the exact GET operations to expose", "The browser exports a trusted-origin MCP configuration", OUTPUTS / "api-bridge-config-export.png", 6),
        ("03", "Verify the tool against a live public API", "GitHub Issues returned HTTP 200 for nodejs/node issue 66560", OUTPUTS / "api-bridge-current-issue.png", 7),
        ("04", "Inspect the implementation and safeguards", "Typed inputs, fixed HTTPS origins, no redirects, bounded responses", OUTPUTS / "api-bridge-repo-latest.png", 5),
    ]
    if args.cloud_screenshot:
        if not args.cloud_screenshot.is_file():
            parser.error("cloud screenshot does not exist")
        cards.append(("05", "Delegate to an OpenAI model on Agent37", "The model selects one approved tool and answers from its verified result", args.cloud_screenshot, 8))

    frames_dir = OUTPUTS / "video-frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    concat_lines = []
    for index, (number, title, detail, screenshot, duration) in enumerate(cards):
        if not screenshot.is_file():
            parser.error(f"missing verified screenshot: {screenshot}")
        path = frames_dir / f"card-{index:02d}.png"
        render_card(number, title, detail, screenshot, path)
        concat_lines.extend([f"file '{path.as_posix()}'", f"duration {duration}"])
    concat_lines.append(f"file '{path.as_posix()}'")
    playlist = frames_dir / "playlist.txt"
    playlist.write_text("\n".join(concat_lines) + "\n", encoding="utf-8")

    try:
        import imageio_ffmpeg

        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        parser.error("imageio-ffmpeg is required")
    output = OUTPUTS / ("api-bridge-hackathon-demo.mp4" if args.cloud_screenshot else "api-bridge-local-preview.mp4")
    subprocess.run(
        [ffmpeg, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(playlist), "-t", str(sum(card[4] for card in cards)), "-vf", "fps=24,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-movflags", "+faststart", str(output)],
        check=True,
    )
    print(f"Wrote {output} ({output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()

