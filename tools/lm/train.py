"""Trains the resident model: `python3 tools/lm/train.py [steps]`. Writes tools/lm/ckpt.pt."""
import json, sys, time, pathlib, random, torch
from model import GPT

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
TIER_TOKENS = {"hot": "\x01", "warm": "\x02", "nice": "\x03", "cold": "\x04"}
EOS = "\n"

def main():
    steps = int(sys.argv[1]) if len(sys.argv) > 1 else 4000
    torch.manual_seed(1); random.seed(1)
    lines = [l.split("\t", 1) for l in (HERE / "corpus.txt").read_text().splitlines() if "\t" in l]
    texts = [TIER_TOKENS[t] + s + EOS for t, s in lines]
    chars = sorted(set("".join(texts)))
    stoi = {c: i for i, c in enumerate(chars)}
    ctx = 96
    data = [torch.tensor([stoi[c] for c in t], dtype=torch.long) for t in texts]
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    model = GPT(len(chars), d=128, h=4, layers=4, ctx=ctx).to(dev)
    print(f"vocab {len(chars)}, lines {len(data)}, params {sum(p.numel() for p in model.parameters())/1e6:.2f}M, device {dev}")
    opt = torch.optim.AdamW(model.parameters(), lr=3e-3, betas=(0.9, 0.95), weight_decay=0.05)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=3e-3, total_steps=steps, pct_start=0.08)
    B = 64
    pad = stoi[EOS]
    def batch():
        xs = torch.full((B, ctx), pad); ys = torch.full((B, ctx), -1)
        for i in range(B):
            # pack a few lines into each row so position embeddings see varied starts
            row = []
            while len(row) < ctx + 1:
                row += random.choice(data).tolist()
            row = row[: ctx + 1]
            xs[i] = torch.tensor(row[:-1]); ys[i] = torch.tensor(row[1:])
        return xs.to(dev), ys.to(dev)
    t0 = time.time()
    model.train()
    for step in range(1, steps + 1):
        x, y = batch()
        _, loss = model(x, y)
        opt.zero_grad(set_to_none=True); loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step(); sched.step()
        if step % 200 == 0 or step == 1:
            print(f"step {step:5d} loss {loss.item():.3f} lr {sched.get_last_lr()[0]:.2e} {time.time()-t0:.0f}s", flush=True)
    torch.save({"model": model.state_dict(), "chars": chars, "cfg": {"d": 128, "h": 4, "layers": 4, "ctx": ctx}, "tiers": TIER_TOKENS}, HERE / "ckpt.pt")
    print("saved", HERE / "ckpt.pt")

if __name__ == "__main__":
    main()
