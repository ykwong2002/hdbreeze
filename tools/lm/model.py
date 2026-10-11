"""A nanoGPT-style character-level transformer (after karpathy/nanoGPT, MIT), small enough to run in a browser."""
import math, torch, torch.nn as nn, torch.nn.functional as F

class Block(nn.Module):
    def __init__(self, d, h, ctx):
        super().__init__()
        self.ln1 = nn.LayerNorm(d); self.ln2 = nn.LayerNorm(d)
        self.qkv = nn.Linear(d, 3 * d); self.proj = nn.Linear(d, d)
        self.fc = nn.Linear(d, 4 * d); self.fc2 = nn.Linear(4 * d, d)
        self.h = h
        self.register_buffer("mask", torch.tril(torch.ones(ctx, ctx)).view(1, 1, ctx, ctx))
    def forward(self, x):
        B, T, D = x.shape
        q, k, v = self.qkv(self.ln1(x)).split(D, dim=2)
        q = q.view(B, T, self.h, D // self.h).transpose(1, 2)
        k = k.view(B, T, self.h, D // self.h).transpose(1, 2)
        v = v.view(B, T, self.h, D // self.h).transpose(1, 2)
        att = (q @ k.transpose(-2, -1)) / math.sqrt(D // self.h)
        att = att.masked_fill(self.mask[:, :, :T, :T] == 0, float("-inf")).softmax(-1)
        y = (att @ v).transpose(1, 2).reshape(B, T, D)
        x = x + self.proj(y)
        x = x + self.fc2(F.gelu(self.fc(self.ln2(x))))
        return x

class GPT(nn.Module):
    def __init__(self, vocab, d=128, h=4, layers=4, ctx=96):
        super().__init__()
        self.ctx = ctx
        self.tok = nn.Embedding(vocab, d); self.pos = nn.Embedding(ctx, d)
        self.blocks = nn.ModuleList(Block(d, h, ctx) for _ in range(layers))
        self.lnf = nn.LayerNorm(d); self.head = nn.Linear(d, vocab, bias=False)
        self.head.weight = self.tok.weight  # weight tying keeps the export small
    def forward(self, idx, targets=None):
        B, T = idx.shape
        x = self.tok(idx) + self.pos(torch.arange(T, device=idx.device))
        for b in self.blocks: x = b(x)
        logits = self.head(self.lnf(x))
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1) if targets is not None else None
        return logits, loss
