# LinkedIn post (final)

"What if we could bend the wind to bring more breeze into the city?"

that was an instagram story by the Urban Redevelopment Authority (URA) i swiped past last week, and it stuck with me. the things we never notice, how tall a block is, which way it faces, how the blocks cluster, decide whether the breeze reaches the heart of a neighbourhood or dies behind a wall of flats.

i thought "damn, that would be a pretty sick game." i had some spare fable credits before my reset this week. two days later, lo and behold:

HDBreeze: lay out a real HDB project on a real empty plot, and keep the walkways breathable in both monsoons.

pick a town (punggol, tengah, ang mo kio). watch the careless plan first: walls across the wind, every block tall, streets turn red. then it's your turn: rows along the wind, gaps, void decks, heights stepping down. the residents walking by will tell you in singlish whether it's shiok or sibei hot.

we walk past this every day. the void deck that always has a breeze, the corridor that never does. none of it is an accident. next time you're at a bus stop that somehow always has wind, look at what's standing upwind.

nerdy bits:
• the wind is a 2d lattice-boltzmann sim running on your phone's gpu (webgl2), with a simple heat model on top. not real cfd, but enough to show why layout matters.
• real buildings: hdb footprints and storeys from data.gov.sg, plot ratios from the ura master plan, the rest from openstreetmap.
• the singlish complaints come from a 0.8m-parameter nanogpt-style model i trained for this, 1.6 mb, running in your browser. nothing leaves your phone.

fan-made, everything is an estimate, not affiliated with hdb or ura. if you clear all three plots in tengah, tell me how.

#singapore #urbanplanning #hdb #webgl #gamedev #llm
