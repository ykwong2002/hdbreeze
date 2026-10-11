/** What residents say, by comfort tier. Keep it light; gentle gahmen jokes only, nothing aimed at any group. */
export type Tier = "miserable" | "warm" | "pleasant" | "cold";

export const LINES: Record<Tier, string[]> = {
  miserable: [
    "Why so hot ah?",
    "Can't the government install aircon on the street??",
    "I melting already lah.",
    "Walk to MRT only, shirt wet.",
    "Eh, this corner got no wind one.",
    "Sibei hot, cannot tahan.",
    "Who design this place ah? No breeze at all.",
    "My ice kacang melted before I sat down.",
    "Need a sweater? No lah, need a fan.",
    "Standing here like inside a wok.",
    "Even the mynahs looking for shade.",
    "Walk two minutes, bathe again.",
    "This block trap the heat like a kueh steamer.",
  ],
  warm: [
    "Still a bit warm leh.",
    "Where got wind?",
    "Aiyo, no breeze one.",
    "Okay lah, but can be better.",
    "Got shade, but the air not moving.",
    "Kopi peng weather, this one.",
    "Hmm, warm. Hawker centre better maybe.",
    "Uncle at the corner also fanning himself.",
    "Sticky sia.",
    "If got a bit of wind, perfect already.",
    "Not bad, not great. Singapore standard.",
    "Can walk, just slowly.",
  ],
  pleasant: [
    "Eh, not bad ah, got wind.",
    "Wah, shiok.",
    "Today can walk to hawker.",
    "This void deck damn nice sia.",
    "Breeze come through here, best.",
    "Can sit here whole afternoon.",
    "Who plan this? Give them a raise.",
    "Finally a corridor that breathes.",
    "Nice wind. Mahjong at the pavilion later?",
    "Okay this one I approve.",
    "Walk to MRT no sweat. Literally.",
    "The kids can play outside today.",
  ],
  cold: [
    "Finally can wear sweater outside.",
    "Since when Singapore so cold one.",
    "Who on the aircon outside?",
    "Brrr. Got jacket or not?",
    "Eh, this is like Genting lah.",
    "My teh tarik cooling too fast.",
    "Wind so strong, umbrella also scared.",
    "Confirm this block got the best breeze.",
    "Cold until I want to order hot soup.",
    "Is this still Singapore? Wah.",
    "Auntie downstairs wearing jacket, can you believe.",
    "Okay now too shiok already.",
  ],
};

export function tierFor(comfort: number): Tier {
  if (comfort < 0.3) return "miserable";
  if (comfort < 0.6) return "warm";
  if (comfort < 0.97) return "pleasant";
  return "cold";
}

const recent: string[] = [];
/** Random line from the tier, avoiding anything said in the last 8 bubbles. */
export function pickLine(tier: Tier, avoid?: string): string {
  const pool = LINES[tier].filter((l) => !recent.includes(l) && l !== avoid);
  const from = pool.length ? pool : LINES[tier];
  const line = from[Math.floor(Math.random() * from.length)]!;
  recent.push(line);
  if (recent.length > 8) recent.shift();
  return line;
}
