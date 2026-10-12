# LinkedIn post

what if you could bend the wind?

that was the title of a URA instagram story i swiped past last week, and it kind of stuck with me. turns out the little things we never notice, how tall a block is, which way it faces, how the blocks cluster, where the gaps are, decide whether the breeze actually reaches the void deck or dies behind a wall of flats.

i thought "damn, that would be a pretty sick game." then i remembered i had some spare claude credits before my reset this week. two days later, lo and behold:

HDBreeze: a little game where you lay out an actual HDB precinct on a real empty plot and try to keep the walkways breathable in both monsoons. plays in your phone browser, link in the comments.

how it goes: pick a town (punggol, tengah or ang mo kio), get a real plot and a tray of blocks sized to what the plot allows. first you watch the careless plan, walls across the wind, every block tall, and the streets turn red. then it's your turn: rows along the wind, gaps between them, void decks, heights stepping down. the residents strolling around will tell you in singlish whether it's shiok or sibei hot.

the part i actually care about: we walk past this stuff every day. the gap between two blocks, the void deck that always has a breeze, the corridor that never does. none of it is an accident, someone modelled it. i just think it's cool that our city gets built with the wind in mind, and a game felt like the easiest way to make that visible. next time you're at a bus stop that somehow always has a breeze, look at what's standing upwind.

nerdy bits, for those who want them:
• the wind is a 2d lattice-boltzmann fluid sim (d2q9) running on your phone's gpu in webgl2, with a simple heat model on top: the ground heats the air, the breeze carries it off, blocks cast wakes. not real cfd, but enough to show why layout matters.
• the buildings are real: hdb footprints and storeys from data.gov.sg, plot boundaries and plot ratios from the ura master plan, the rest from openstreetmap.
• the residents' complaints come from a tiny language model trained just for this: a 4-layer, 0.8m-parameter nanogpt-style character model, trained in a few minutes on a laptop on a few thousand singlish lines about being too hot, too cold or just nice. exported to fp16 (1.6 mb), it runs in a web worker in the browser, about 100 ms a line. nothing leaves your phone.
• no accounts, no analytics, no cookies beyond your own progress.

fan-made, everything in it is an estimate, not affiliated with hdb or ura. if you clear all three plots in tengah, tell me how.

#singapore #urbanplanning #hdb #webgl #gamedev #llm
