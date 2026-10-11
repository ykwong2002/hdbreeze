"""Samples lines from the checkpoint per tier: `python3 tools/lm/sample.py [n] [temperature]`."""
import sys, pathlib, torch
from model import GPT

HERE = pathlib.Path(__file__).resolve().parent

def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    temp = float(sys.argv[2]) if len(sys.argv) > 2 else 0.9
    ck = torch.load(HERE / "ckpt.pt", map_location="cpu")
    chars = ck["chars"]; stoi = {c: i for i, c in enumerate(chars)}; cfg = ck["cfg"]
    model = GPT(len(chars), **cfg); model.load_state_dict(ck["model"]); model.eval()
    torch.manual_seed(int(sys.argv[3]) if len(sys.argv) > 3 else 0)
    for tier, tok in ck["tiers"].items():
        print(f"== {tier}")
        for _ in range(n):
            idx = torch.tensor([[stoi[tok]]])
            out = ""
            for _ in range(80):
                logits, _ = model(idx[:, -cfg["ctx"]:])
                logits = logits[0, -1] / temp
                top = torch.topk(logits, 20)
                probs = torch.zeros_like(logits).scatter_(0, top.indices, top.values.softmax(0))
                nxt = torch.multinomial(probs, 1)
                c = chars[nxt.item()]
                if c == "\n": break
                out += c
                idx = torch.cat([idx, nxt.view(1, 1)], 1)
            print("  ", out)

if __name__ == "__main__":
    main()
