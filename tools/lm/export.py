"""Exports the checkpoint to public/models/resident.bin: a JSON header (length-prefixed) + fp16 weights in a fixed order."""
import json, struct, pathlib, numpy as np, torch

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
ORDER = ["tok.weight", "pos.weight"]
for i in range(64):
    ORDER += [f"blocks.{i}.ln1.weight", f"blocks.{i}.ln1.bias", f"blocks.{i}.qkv.weight", f"blocks.{i}.qkv.bias", f"blocks.{i}.proj.weight", f"blocks.{i}.proj.bias",
              f"blocks.{i}.ln2.weight", f"blocks.{i}.ln2.bias", f"blocks.{i}.fc.weight", f"blocks.{i}.fc.bias", f"blocks.{i}.fc2.weight", f"blocks.{i}.fc2.bias"]
ORDER += ["lnf.weight", "lnf.bias"]

def main():
    ck = torch.load(HERE / "ckpt.pt", map_location="cpu")
    sd = ck["model"]; cfg = ck["cfg"]
    names = [n for n in ORDER if n in sd]
    tensors = [sd[n].detach().float().numpy().astype(np.float16) for n in names]
    header = {"cfg": cfg, "chars": ck["chars"], "tiers": ck["tiers"], "tensors": [{"name": n, "shape": list(t.shape)} for n, t in zip(names, tensors)], "dtype": "float16", "note": "HDBreeze resident model: nanoGPT-style char transformer trained on Singlish temperature complaints"}
    hb = json.dumps(header).encode()
    out = ROOT / "public/models/resident.bin"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "wb") as f:
        f.write(b"HDBR"); f.write(struct.pack("<I", len(hb))); f.write(hb)
        for t in tensors: f.write(np.ascontiguousarray(t).tobytes())
    print(f"wrote {out} ({out.stat().st_size/1024:.0f} KB, {len(names)} tensors, {sum(t.size for t in tensors)/1e6:.2f}M params)")

if __name__ == "__main__":
    main()
