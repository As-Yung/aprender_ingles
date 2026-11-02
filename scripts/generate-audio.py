#!/usr/bin/env python3
"""
Genera los audios de pronunciación con Kokoro (voz neuronal libre, licencia Apache 2.0).

Uso:
  python scripts/generate-audio.py build/speech.json public/audio --model DIR

- Lee la lista de frases que produce scripts/collect-speech.mjs.
- Crea un MP3 por frase y voz: <sha256(voz + "\\n" + texto)[:16]>.mp3
  (la app calcula el mismo nombre para encontrar el audio).
- Solo genera los que faltan (la carpeta se guarda en caché en GitHub Actions) y borra los que
  ya no se usan. Escribe manifest.json con las voces y la lista de archivos.
"""
import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

# Voz 0 = principal (femenina, EE. UU.); voz 1 = segundo personaje (masculina, EE. UU.).
VOICES = {"0": "af_heart", "1": "am_michael"}


def file_id(voice: str, text: str) -> str:
    return hashlib.sha256(f"{voice}\n{text}".encode("utf-8")).hexdigest()[:16]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("speech_json")
    ap.add_argument("out_dir")
    ap.add_argument("--model", default="build/kokoro")
    ap.add_argument("--limit", type=int, default=0, help="máximo de audios nuevos (0 = todos)")
    args = ap.parse_args()

    items = json.loads(Path(args.speech_json).read_text(encoding="utf-8"))
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    wanted = {}
    for it in items:
        voice = VOICES[str(it["voice"])]
        wanted[file_id(voice, it["text"])] = (voice, it["text"])

    # Borrar audios que ya no se usan.
    removed = 0
    for f in out.glob("*.mp3"):
        if f.stem not in wanted:
            f.unlink()
            removed += 1

    todo = [(fid, v, t) for fid, (v, t) in wanted.items() if not (out / f"{fid}.mp3").exists()]
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(wanted)} audios en total · {len(todo)} por generar · {removed} borrados", flush=True)

    if todo:
        model = Path(args.model)
        kokoro = Kokoro(str(model / "kokoro-v1.0.int8.onnx"), str(model / "voices-v1.0.bin"))
        start = time.time()
        for n, (fid, voice, text) in enumerate(todo, 1):
            samples, rate = kokoro.create(text, voice=voice, speed=1.0, lang="en-us")
            tmp = out / f"{fid}.tmp.mp3"
            sf.write(tmp, samples, rate, format="MP3")
            tmp.rename(out / f"{fid}.mp3")
            if n % 50 == 0 or n == len(todo):
                print(f"  {n}/{len(todo)} · {time.time() - start:.0f}s", flush=True)

    files = sorted(f.stem for f in out.glob("*.mp3"))
    manifest = {"engine": "kokoro-v1.0", "voices": VOICES, "files": files}
    (out / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
    print(f"✔ manifest.json con {len(files)} audios", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
