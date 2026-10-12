# Walkthrough video and screenshots

`tools/shoot/record-walkthrough.mjs` drives a real, visible Chrome window (GPU rendering) through the
title tour, the town list and the demo autoplay, and records the tab with Puppeteer's screencast:

    npx vite preview --port 4318 &
    node tools/shoot/record-walkthrough.mjs http://localhost:4318/ out/
    ffmpeg -ss 9 -i out/walkthrough.webm -vf "scale=1080:-2,format=yuv420p" -r 30 -c:v libx264 -crf 20 -movflags +faststart out/walkthrough.mp4

The browser window must stay visible and the Mac unlocked while it records (about 100 s). The PNGs in
this folder are frames from that recording; `?demo=1&level=<plot>` plays the five captioned sections.
Any plot works: `tengah-p1` has a neighbour hot spot, `angmokio-p3` needs both monsoons.
