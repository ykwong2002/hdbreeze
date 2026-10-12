# LinkedIn post (draft for the owner to edit)

I built a small game about something most of us never see: the wind studies behind an HDB town.

🌬️ HDBreeze — plan a liveable HDB precinct

Singapore is hot, and the cheapest cooling we have is the breeze. Before HDB lays out a new precinct, planners model wind, sun and noise so that thousands of homes fit on the plot the Master Plan allows *and* the streets between them still breathe.

In the game you get a real empty plot in Punggol, Tengah or Ang Mo Kio, the full tray of blocks its plot ratio calls for, and a live wind simulation on the map. First you see what a careless plan does (walls across the wind, every block tall: the streets turn red). Then it's your turn: turn slabs along the monsoon, leave gaps, step the heights, open void decks. Some plots must pass both the NE and SW monsoons. Clear all three plots and you've planned a town.

A few things under the hood, for the curious:
• The wind is a 2D lattice-Boltzmann flow running on your phone's GPU (WebGL2), not real CFD, but enough to show why layout matters.
• Buildings and storeys come from data.gov.sg (HDB Existing Building + Property Information, 99% joined), plots and plot ratios from URA's Master Plan land use, footpaths from OpenStreetMap.
• The residents walking around complain in Singlish. Those lines come from a tiny language model I trained for this: a 4-layer, 0.8M-parameter character-level transformer (nanoGPT-style, PyTorch on a MacBook) on a few thousand hand-written and templated lines about being too hot, too cold or just nice. It's exported to fp16 (1.6 MB) and runs in a Web Worker in the browser, about 100 ms per line. No API calls, nothing leaves your phone.
• No analytics, no accounts, no cookies beyond your own progress.

Fan-made and educational; not affiliated with HDB or URA. Works best on a phone in Chrome or Safari. Link in the comments. I'd love to hear from planners and architects whether the lessons ring true, and from everyone else which plot was hardest.

#UrbanPlanning #Singapore #HDB #WebGL #GameDev #LLM
