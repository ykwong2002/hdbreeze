"""Builds the training corpus for the resident language model.

Lines are `<tier>\t<text>` with tier in hot / warm / nice / cold (the game's comfort tiers).
Sources: the handwritten lines in src/game/lines.ts plus a Singlish template grammar below.
No third-party Singlish corpus with a usable licence was found, so this is all our own text.
"""
import random, re, sys, pathlib

random.seed(7)
ROOT = pathlib.Path(__file__).resolve().parents[2]
TIER_MAP = {"miserable": "hot", "warm": "warm", "pleasant": "nice", "cold": "cold"}

def handwritten():
    src = (ROOT / "src/game/lines.ts").read_text()
    out = []
    for tier, block in re.findall(r'(miserable|warm|pleasant|cold): \[(.*?)\]', src, re.S):
        for line in re.findall(r'"([^"]+)"', block):
            out.append((TIER_MAP[tier], line))
    return out

PLACES = ["at the void deck", "at the bus stop", "along the corridor", "at the lift lobby", "at the playground", "outside the kopitiam",
          "on the way to MRT", "at the market", "near the carpark", "at the hawker centre", "downstairs", "at the pavilion",
          "along the sheltered walkway", "behind block 268", "at the bus interchange", "in the courtyard", "near the linkway",
          "under the block", "at the coffee shop", "outside Sheng Siong", "at the fitness corner", "by the canal"]
PEOPLE = ["Uncle", "Auntie", "the kopi uncle", "my neighbour", "the mynahs", "the whole block", "my grandma", "the kids", "the delivery rider",
          "the cleaner uncle", "the taxi driver", "the ah ma downstairs", "the ice cream uncle", "everybody"]
PARTS = ["lah", "leh", "lor", "sia", "ah", "one", "liao", "already", "hor", "meh", "can"]
TIME = ["this afternoon", "today", "now", "at 2 pm", "after lunch", "in the evening", "the whole day", "every day", "just now"]

HOT = {
  "feel": ["so hot", "damn hot", "sibei hot", "hot until cannot", "like sauna", "like inside a wok", "no air at all", "stuffy like anything",
           "the air not moving", "sweating buckets", "melting", "cooking", "steaming like bao", "like standing behind an aircon compressor",
           "hot until my slippers also soft", "warm like a kueh steamer", "no wind one", "like a hairdryer blowing"],
  "do": ["cannot tahan", "shirt wet already", "want to faint", "need iced Milo", "want to go back home", "cannot walk", "need to find shade",
         "the sweat drip into my eye", "my specs also fog", "I give up", "wait for bus like being baked", "walking also pant", "can fry egg on the floor"],
  "ask": ["why so hot ah?", "where is the wind?", "who turn off the breeze?", "can the gahmen install aircon on the street or not?",
          "got breeze or not?", "which block is blocking the wind?", "why build like that?", "the wind go where?", "who design this?",
          "why this corner always no wind one?", "the slab block kena wall up the breeze is it?"],
  "wish": ["if only got some wind", "hope the breeze come back", "wait for the monsoon", "dreaming of aircon", "wish the block had a void deck",
           "wish they turn the block the other way", "somebody open a window please"],
}
WARM = {
  "feel": ["a bit warm", "still warm", "not much wind", "so so only", "sticky", "a bit stuffy", "little bit humid", "okay but warm",
           "the breeze come and go", "warmish", "can feel the sun", "meh", "not bad but hot still", "tolerable only"],
  "do": ["can walk, just slowly", "need to fan myself", "kopi peng weather", "better bring a towel", "can sit but not long",
         "find a shady spot first", "okay lah, can manage", "need teh peng", "walk faster to reach shade"],
  "ask": ["where got wind?", "got breeze or not?", "can be better or not?", "a bit more wind can?", "why this side no breeze?",
          "aiyo, no breeze one?", "maybe later got wind?"],
  "wish": ["if got a bit of wind, perfect", "a small breeze would be nice", "hope the wind pick up", "if only the block open the ground floor"],
}
NICE = {
  "feel": ["got wind", "so shiok", "nice and breezy", "the breeze come through", "cooling", "fresh air", "so comfortable", "like the beach",
           "wind blowing nicely", "the corridor breathes", "the void deck is cool", "the air is moving", "windy in a good way", "damn shiok sia",
           "like got natural aircon", "breezy like Sentosa"],
  "do": ["can sit here whole afternoon", "can walk to hawker", "no need aircon", "the kids can play outside", "can take a nap here",
         "mahjong at the pavilion later", "can dry clothes fast", "walk to MRT no sweat", "can lepak here", "can jog also"],
  "ask": ["who plan this? give them a raise", "why other blocks not like this?", "eh, who design this?", "how come this side so nice?"],
  "wish": ["hope it stays like this", "every block should be like this", "this is how HDB should be", "finally got a nice corner"],
}
COLD = {
  "feel": ["so cold", "like Genting", "like Cameron Highlands", "wind so strong", "cold until shiver", "like aircon on full blast",
           "chilly sia", "breezy until cannot", "like inside NTUC frozen section", "wind blowing my hair everywhere", "colder than the mall",
           "like got snow coming", "brrr", "windy like crazy", "cold enough for a jacket"],
  "do": ["can wear sweater outside", "need jacket", "my teh tarik cooling too fast", "umbrella also scared", "want hot soup", "hug myself",
         "order bak kut teh", "wear socks with slippers", "the laundry fly away", "need a scarf", "my ice kacang not melting at all"],
  "ask": ["since when Singapore so cold one?", "who on the aircon outside?", "is this still Singapore?", "got jacket or not?",
          "eh, we in Singapore or Genting?", "why so windy ah?", "where the wind come from?"],
  "wish": ["okay now too shiok already", "a bit less wind can?", "can off the aircon a bit?", "nice but my teh is cold"],
}
TIERS = {"hot": HOT, "warm": WARM, "nice": NICE, "cold": COLD}

def cap(s):
    return s[0].upper() + s[1:]

def gen(tier, n):
    g = TIERS[tier]
    out = set()
    forms = [
        lambda: f"{cap(random.choice(g['feel']))} {random.choice(PLACES)} {random.choice(PARTS)}.",
        lambda: f"{cap(random.choice(g['feel']))} {random.choice(TIME)}, {random.choice(g['do'])}.",
        lambda: f"{cap(random.choice(g['ask']))}",
        lambda: f"{cap(random.choice(g['feel']))} {random.choice(PARTS)}, {random.choice(g['do'])} {random.choice(PARTS)}.",
        lambda: f"{random.choice(PEOPLE)} say {random.choice(g['feel'])} {random.choice(PLACES)}.",
        lambda: f"{cap(random.choice(g['do']))} {random.choice(PARTS)}. {cap(random.choice(g['ask']))}",
        lambda: f"{cap(random.choice(g['wish']))} {random.choice(PARTS)}.",
        lambda: f"Eh, {random.choice(g['feel'])} {random.choice(PLACES)} {random.choice(TIME)} {random.choice(PARTS)}.",
        lambda: f"Wah, {random.choice(g['feel'])} {random.choice(PARTS)}. {cap(random.choice(g['do']))}.",
        lambda: f"Aiyo, {random.choice(g['feel'])} {random.choice(PARTS)}, {random.choice(g['wish'])}.",
        lambda: f"{cap(random.choice(g['ask']))} {cap(random.choice(g['feel']))} {random.choice(PLACES)}.",
        lambda: f"Walk {random.choice(PLACES)} {random.choice(TIME)}, {random.choice(g['feel'])} {random.choice(PARTS)}.",
    ]
    while len(out) < n:
        s = random.choice(forms)()
        s = s.replace("..", ".").replace(" ,", ",")
        if 12 <= len(s) <= 72:
            out.add(s)
    return sorted(out)

def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 1600
    lines = handwritten()
    hand = len(lines)
    for tier in TIERS:
        lines += [(tier, s) for s in gen(tier, n)]
    # handwritten lines are the gold standard: repeat them so the model sees them often
    lines += handwritten() * 6
    random.shuffle(lines)
    out = ROOT / "tools/lm/corpus.txt"
    out.write_text("\n".join(f"{t}\t{s}" for t, s in lines) + "\n")
    chars = sorted(set("".join(s for _, s in lines)))
    print(f"corpus: {len(lines)} lines ({hand} handwritten x7, {n} templated per tier), {len(chars)} chars, {sum(len(s) for _, s in lines)} characters total")

if __name__ == "__main__":
    main()
