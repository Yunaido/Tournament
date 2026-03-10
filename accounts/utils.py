"""Utilities for image processing and serving."""
import io

import qrcode
import qrcode.image.svg
from PIL import Image

# Hard limit on user-uploaded file size (checked before any processing).
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB

# Allowlist of Pillow format strings accepted from user uploads.
ALLOWED_FORMATS = {"JPEG", "PNG", "GIF", "WEBP"}

# Cap Pillow's decompression limit to ~50 megapixels (≈ 7070 × 7070 px).
# Default is ~178 MP which is too permissive for user uploads.
Image.MAX_IMAGE_PIXELS = 50_000_000


def make_qr_svg(url: str) -> str:
    """Generate a QR code as an SVG string for the given URL."""
    img = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage)
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue().decode()


def _is_svg(data: bytes) -> bool:
    """Return True if the raw bytes look like an SVG document."""
    head = data.lstrip()[:64].lower()
    return head.startswith(b"<svg") or (head.startswith(b"<?xml") and b"svg" in head)


def get_image_content_type(data: bytes) -> str:
    """Sniff the content type of stored image bytes."""
    if _is_svg(data):
        return "image/svg+xml"
    return "image/webp"


def process_image(uploaded_file, max_size=(800, 800), quality=85):
    """
    Validate and convert a user-uploaded image to WebP bytes.

    Security checks performed (in order):
      1. File size ≤ MAX_UPLOAD_BYTES (5 MB)
      2. SVG uploads are rejected — they can carry inline scripts (stored XSS)
      3. Pillow must be able to open the file (decompression bomb check included)
      4. Pillow format must be in ALLOWED_FORMATS allowlist

    Raises ValueError with a user-friendly message on any check failure.
    Returns bytes (WebP), or None if no file was provided.
    """
    if not uploaded_file:
        return None

    uploaded_file.seek(0)
    raw = uploaded_file.read()
    if not raw:
        return None

    # 1. Size guard — before any CPU-intensive work.
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ValueError(
            f"Image must be smaller than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
        )

    # 2. Reject SVG uploads — an SVG served inline can execute JavaScript.
    if _is_svg(raw):
        raise ValueError(
            "SVG files cannot be uploaded. Please use JPEG, PNG, GIF, or WebP."
        )

    # 3. Open with Pillow (raises DecompressionBombError if > MAX_IMAGE_PIXELS).
    try:
        img = Image.open(io.BytesIO(raw))
        # Force-decode non-animated images to catch corrupt / bomb files early.
        if not getattr(img, "is_animated", False):
            img.load()
    except Image.DecompressionBombError:
        raise ValueError("Image dimensions are too large.")
    except Exception:
        raise ValueError("Uploaded file is not a valid image.")

    # 4. Format allowlist.
    if img.format not in ALLOWED_FORMATS:
        raise ValueError(
            f"Unsupported format '{img.format or 'unknown'}'. "
            "Please upload a JPEG, PNG, GIF, or WebP."
        )

    # Re-open after load() so animated detection still works correctly.
    img = Image.open(io.BytesIO(raw))
    buffer = io.BytesIO()

    # Handle animated images (GIF, APNG, animated WebP)
    is_animated = getattr(img, "is_animated", False)

    if is_animated:
        frames = []
        durations = []
        n_frames = getattr(img, "n_frames", 1)

        for i in range(n_frames):
            img.seek(i)
            frame = img.copy()
            frame.thumbnail(max_size, Image.LANCZOS)
            if frame.mode != "RGBA":
                frame = frame.convert("RGBA")
            frames.append(frame)
            durations.append(img.info.get("duration", 100))

        frames[0].save(
            buffer,
            format="WEBP",
            save_all=True,
            append_images=frames[1:],
            duration=durations,
            loop=img.info.get("loop", 0),
            quality=quality,
        )
    else:
        if img.mode in ("RGBA", "P", "PA", "LA"):
            img = img.convert("RGBA")
        else:
            img = img.convert("RGB")

        img.thumbnail(max_size, Image.LANCZOS)
        img.save(buffer, format="WEBP", quality=quality)

    return buffer.getvalue()
