# Plan v7: polish from the persona play-tests

Approved 2026-10-12 with one change: agency and flat-count wording is kept short ("everything here is an estimate, for fun and educational value") rather than sourced in detail.

Three persona testers (an LLM recruiter, a friend on the MRT, a URA planner) read the draft LinkedIn post
(`docs/linkedin-post.md`) and walked through the v6 build. Headless wind numbers are not realistic, so their
feedback on flow, copy and layout is what counts. This plan keeps what all three agreed on and drops the rest.

## What landed well (keep)
- The loop reads: careless plan → your plan, blue/red field, end-card lesson ("the gaps between them are breezeways… a wind corridor") was the moment all three said they learned something.
- Title, town picker, plot card goal sentence, Singlish bubbles ("Sticky sia.") and the share text ("I cleared Punggol East… 95% breathable, 3,120 people housed") all worked.

## A. Education and accuracy (planner, recruiter)
1. **Source or soften agency claims.** Replace "HDB and URA run wind, sun and noise models…" and the Punggol tagline "A waterfront town HDB modelled for wind before building" with neutral, sourced wording: "Planners study wind, sun and noise with environmental models before a precinct is laid out" and an About card line that cites what is public (HDB's environmental modelling work, URA Master Plan plot ratio) only if I can verify a source; otherwise no attribution at all. Keep the non-affiliation line everywhere.
2. **Show the arithmetic on the plot card** and label it as our estimate: "3.9 ha × plot ratio 3.0 = 117,000 m² floor area ≈ 1,165 flats at ~100 m² each (our estimate). Your tray houses up to 3,328 people at 3.2 per flat; target 2,850." Fixes the "where does 2,850 come from" gap.
3. **No housing on Reserve Sites.** Ang Mo Kio plot 3 is a Reserve Site; swap it for a Residential parcel with a real plot ratio (e.g. the 6.2 ha, plot ratio 3.5 parcel at Ang Mo Kio Ave 3). Plot names become neutral ("Plot off Punggol East") with a one-line "plot names are ours" note on the town card.
4. **Teach void decks and height stepping in play, not only in the how-to.** Each plot gets a focus technique shown on its plot card and rewarded in the lesson: plot 1 corridors (rows along the wind), plot 2 void decks (bonus star needs ≥ half the blocks open), plot 3 height stepping (bonus star needs low blocks windward). Height stepping is worded as "one approach planners use", not a rule.
5. **Temperature display.** Replace "feels like 31.4 °C on the walkways" with a comparison the score is actually built on: "walkways 31.4 °C · careless 33.1 · empty 30.2 (model)". Frames it as a relative model, not a calibrated forecast.
6. **Residents' cold tier.** In Singapore's heat more breeze is good: re-word the cold-tier lines as delight ("Wah, got wind until shiok") and drop "Is this still Singapore?" and "Got jacket or not?".
7. **Star rules.** Align code with the plan: ★ clear, ★ 75 %+ breathable in every monsoon, ★ 90 %+ breathable or 15 % more homes, plus the plot's focus technique for plots 2 and 3.

## B. Clarity and fun (friend, recruiter)
8. **Empty plot must not read "100 %".** With no blocks placed the big number shows "—" and the line "careless plan 0 % · goal 60 % · empty plot 100 %"; the bar gets the three marks. The careless layout stays on screen 2.5 s longer in the intro with "This is 0 %" so nobody misses it.
9. **Layout overlaps** (all three): hint bar vs tray vs attribution, the fourth tray chip clipped, the resident comment strip covering the score card's monsoon and neighbour rows. Fix: hint bar moves above the tray with its own lane, the tray scrolls with an edge fade, the comment strip sits below the score card at a computed offset, attribution control moves above the hud.
10. **One goal checklist, stars elsewhere.** The score card keeps exactly the three clear conditions with ticks; star criteria appear only on the end card under a "Stars" heading. "breathable ≥ 60 %" row becomes "60 %+ breathable to clear".
11. **Monsoon chip.** Label "NE monsoon · tap to switch" on two-season plots; on single-season plots the chip shows the season without the switch affordance.
12. **Share first.** "Share image" becomes the primary button on the end card; share text gets a Singlish tail ("Can or not?"). End card and score card show the same rounded number.
13. **Tray chips** get the block size in the label ("Slab 54 m", "Point 26 m", "L 40 m", "Carpark") so the shapes make sense without the how-to.

## C. The LinkedIn post (your call, not code)
- Add a short screen recording or GIF of the careless plan turning red, then your plan turning blue (recruiter and friend both said they would scroll past text alone).
- Add one line of evidence on the model: corpus size (6,743 lines), training (4,000 steps, final loss 0.21 on a MacBook, ~8 min) and two sample outputs; link the repo. Recruiter: "I would want eval numbers, not just #LLM."

## Not doing
- "Add more resident lines": the tiny model already generates fresh lines once loaded; headless runs never load it.
- A tutorial overlay on the title screen: the why cards and plot card already carry the goal; one more layer would add friction.

## Delivery
One PR (`v7-polish`), merged to main when the headless walk-through passes, then a `?check=1` run per plot on your laptop to confirm the aligned plan still clears every plot after the Ang Mo Kio swap. Estimate: one session of work.
