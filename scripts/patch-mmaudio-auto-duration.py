"""Enable duration=0 (automatic) in the original MMAudio ComfyUI wrapper.

Run explicitly with --pack. Saves the original file and refuses an unknown
wrapper version rather than rewriting arbitrary custom code.
"""
import argparse
import datetime
from pathlib import Path


def patch(root):
    file = root / "comfy_nodes.py"
    text = file.read_text(encoding="utf-8")
    if "# qamba: automatic source-video duration" in text:
        return
    declaration = '"duration": ("FLOAT", {"default": 8.0, "min": 0.5, "max": 60.0, "step": 0.1})'
    anchor = '        device = "cuda" if torch.cuda.is_available() else "cpu"'
    if declaration not in text or anchor not in text:
        raise RuntimeError("Unknown MMAudio wrapper version; no file changed")
    updated = text.replace(declaration,
        '"duration": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 60.0, "step": 0.1, "tooltip": "0 detects the input video duration automatically; positive values override it."})')
    updated = updated.replace(anchor, '''        # qamba: automatic source-video duration
        import math
        if duration == 0:
            duration = float(video.get_duration())
        if not math.isfinite(duration) or not 0.5 <= duration <= 60:
            raise ValueError("MMAudio supports videos from 0.5 to 60 seconds; trim longer clips before generating audio")
''' + anchor, 1)
    backup = file.with_suffix(".py.before-auto-duration-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S") + ".bak")
    backup.write_text(text, encoding="utf-8")
    compile(updated, str(file), "exec")
    file.write_text(updated, encoding="utf-8")
    print(f"Patched {file}; backup {backup}. Restart ComfyUI to load automatic duration.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pack", type=Path, required=True)
    patch(parser.parse_args().pack.resolve())
