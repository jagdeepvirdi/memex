"""Build every Memex brand asset from the two supplied master logos.

Masters (committed, never edited by this script):
  brand/source/memex-logo-dark.png   lockup on the dark ground
  brand/source/memex-logo-light.png  lockup on the light ground

Run from anywhere:  python brand/generate-assets.py
Needs: pillow, numpy, scipy.

Outputs go to brand/ and are copied to client/public/brand and site/brand;
the PWA / touch icons go to client/public (and site/brand for the touch icon).
"""
from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
SRC = BRAND / "source"
CLIENT_BRAND = ROOT / "client" / "public" / "brand"
CLIENT_PUBLIC = ROOT / "client" / "public"
SITE_BRAND = ROOT / "site" / "brand"

# Mark occupies roughly x 185..740 of the 2172px-wide masters; the wordmark starts near x 830.
MARK_SPLIT_X = 785
DARK_GROUND = (2, 2, 28)      # sampled from the dark master
LIGHT_GROUND = (250, 250, 253)


def cut_out(path: Path, ground: tuple[int, int, int], threshold: float) -> Image.Image:
    """Remove the flat background and return an RGBA image.

    The mark is isolated by flood fill from the border, so light details inside it (the cream
    fold on the light master) stay opaque. The wordmark has enclosed counters, so it uses a soft
    distance ramp instead.
    """
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    dist = np.sqrt(((rgb - np.array(ground, dtype=np.float32)) ** 2).sum(axis=2))

    outside_candidate = dist < threshold
    labels, _ = ndimage.label(outside_candidate)
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    outside = np.isin(labels, border[border != 0])

    # Mark region: opaque everywhere not outside, with a soft 2px edge band.
    near_edge = ndimage.binary_dilation(outside, iterations=2) & ~outside
    ramp = np.clip((dist - threshold * 0.4) / (threshold * 3.0), 0, 1)
    mark_alpha = np.where(outside, 0.0, np.where(near_edge, ramp, 1.0))

    # Wordmark region: pure distance ramp (keeps counters of e / a transparent).
    text_alpha = np.clip((dist - threshold * 0.5) / (threshold * 4.0), 0, 1)

    alpha = mark_alpha.copy()
    alpha[:, MARK_SPLIT_X:] = text_alpha[:, MARK_SPLIT_X:]
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def crop_to_content(img: Image.Image, pad: int = 0) -> Image.Image:
    box = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    assert box, "image is fully transparent"
    left, top, right, bottom = box
    return img.crop((max(left - pad, 0), max(top - pad, 0), right + pad, bottom + pad))


def square(img: Image.Image, side: int, fill: float = 1.0) -> Image.Image:
    """Centre `img` on a transparent square; `fill` is the share of the side its width may use."""
    scale = min(side * fill / img.width, side * fill / img.height)
    resized = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((side - resized.width) // 2, (side - resized.height) // 2))
    return canvas


def tile(mark: Image.Image, side: int, ground: tuple[int, int, int], fill: float, radius: float) -> Image.Image:
    """App icon: solid ground with the mark centred. radius is a share of the side (0 = full bleed)."""
    base = Image.new("RGBA", (side, side), (*ground, 255))
    base.alpha_composite(square(mark, side, fill))
    if radius <= 0:
        return base
    mask = Image.new("L", (side * 4, side * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, side * 4 - 1, side * 4 - 1), radius=int(side * 4 * radius), fill=255)
    base.putalpha(mask.resize((side, side), Image.LANCZOS))
    return base


def main() -> None:
    dark_src, light_src = SRC / "memex-logo-dark.png", SRC / "memex-logo-light.png"
    dark = cut_out(dark_src, DARK_GROUND, threshold=14)
    light = cut_out(light_src, LIGHT_GROUND, threshold=10)

    def mark_of(img: Image.Image) -> Image.Image:
        return crop_to_content(img.crop((0, 0, MARK_SPLIT_X, img.height)), pad=0)

    mark_dark, mark_light = mark_of(dark), mark_of(light)

    outputs: dict[str, Image.Image] = {}

    # Lockups (mark + wordmark + tagline), transparent, 1600px wide.
    for name, img in (("dark", dark), ("light", light)):
        lockup = crop_to_content(img, pad=12)
        outputs[f"memex-lockup-{name}.png"] = lockup.resize((1600, round(lockup.height * 1600 / lockup.width)), Image.LANCZOS)

    # Standalone marks on a square canvas so existing width == height layouts keep working.
    outputs["memex-mark.png"] = square(mark_dark, 512, 0.98)
    outputs["memex-mark-light.png"] = square(mark_light, 512, 0.98)

    # App icon masters.
    outputs["memex-icon-dark.png"] = tile(mark_dark, 1024, DARK_GROUND, 0.62, 0.22)
    outputs["memex-icon-light.png"] = tile(mark_light, 1024, LIGHT_GROUND, 0.62, 0.22)

    # Favicons: the mark alone on transparent, so it reads on light and dark browser chrome.
    for size in (16, 32, 48):
        outputs[f"favicon-{size}.png"] = square(mark_dark, size, 1.0)

    # Social preview 1200x630.
    card = Image.new("RGBA", (1200, 630), (*DARK_GROUND, 255))
    lockup = outputs["memex-lockup-dark.png"]
    w = 940
    lockup_small = lockup.resize((w, round(lockup.height * w / lockup.width)), Image.LANCZOS)
    card.alpha_composite(lockup_small, ((1200 - w) // 2, (630 - lockup_small.height) // 2))
    outputs["social-preview.png"] = card

    for name, img in outputs.items():
        img.save(BRAND / name, optimize=True)

    # ICO from the three favicon sizes.
    ico_base = square(mark_dark, 256, 1.0)
    ico_base.save(BRAND / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    # PWA / touch icons (client/public root, as the manifest expects).
    dark_tile_rounded = outputs["memex-icon-dark.png"]
    for size in (192, 512):
        dark_tile_rounded.resize((size, size), Image.LANCZOS).save(CLIENT_PUBLIC / f"pwa-{size}x{size}.png", optimize=True)
    # Maskable: full bleed, mark inside the 80% safe zone (platform applies its own mask).
    tile(mark_dark, 512, DARK_GROUND, 0.56, 0).save(CLIENT_PUBLIC / "pwa-maskable-512x512.png", optimize=True)
    touch = tile(mark_dark, 180, DARK_GROUND, 0.62, 0)  # iOS applies its own rounding
    touch.convert("RGB").save(CLIENT_PUBLIC / "apple-touch-icon.png", optimize=True)

    # Deployment copies.
    for target in (CLIENT_BRAND, SITE_BRAND):
        target.mkdir(parents=True, exist_ok=True)
        for old in target.glob("*.svg"):
            old.unlink()
        for name in [*outputs, "favicon.ico"]:
            shutil.copyfile(BRAND / name, target / name)
    shutil.copyfile(CLIENT_PUBLIC / "apple-touch-icon.png", SITE_BRAND / "apple-touch-icon.png")
    # Browsers request /favicon.ico from the root regardless of <link>.
    shutil.copyfile(BRAND / "favicon.ico", CLIENT_PUBLIC / "favicon.ico")

    print(f"wrote {len(outputs) + 1} brand files + PWA icons")


if __name__ == "__main__":
    main()
