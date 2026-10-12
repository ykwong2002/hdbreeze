/** Small inline SVG icons (stroke, currentColor) so the UI does not lean on emoji. */
const svg = (body: string, vb = "0 0 24 24"): string => `<svg class="ico" viewBox="${vb}" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  wind: svg('<path d="M3 8h9a3 3 0 1 0-3-3"/><path d="M3 13h13a3 3 0 1 1-3 3"/><path d="M3 18h6"/>'),
  home: svg('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  blocks: svg('<rect x="3" y="12" width="7" height="8" rx="1"/><rect x="14" y="8" width="7" height="12" rx="1"/><rect x="8" y="3" width="7" height="6" rx="1"/>'),
  flame: svg('<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 1-6 1-9z"/>'),
  bulb: svg('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M8 13a5 5 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3z"/>'),
  target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>'),
  star: svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>'),
  city: svg('<path d="M3 21h18"/><path d="M5 21V8h5v13"/><path d="M10 21V4h6v17"/><path d="M16 21v-9h3v9"/><path d="M12 8h2M12 12h2M12 16h2"/>'),
  hand: svg('<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6"/><path d="M11 10V4a1.5 1.5 0 0 1 3 0v7"/><path d="M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.6-1.5L8 13"/>'),
  rotate: svg('<path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 4v5h-5"/>'),
  sound: svg('<path d="M4 10v4h3l5 4V6L7 10z"/><path d="M15 9a4 4 0 0 1 0 6"/><path d="M17.5 6.5a8 8 0 0 1 0 11"/>'),
  mute: svg('<path d="M4 10v4h3l5 4V6L7 10z"/><path d="m16 9 5 6M21 9l-5 6"/>'),
  speech: svg('<path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7"/><path d="M12 17h.01"/>'),
  pin: svg('<path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>'),
  cloud: svg('<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4 4 0 0 1-1 9z"/>'),
  faceHappy: svg('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2"/><path d="M9 9.5h.01M15 9.5h.01"/>'),
  faceNeutral: svg('<circle cx="12" cy="12" r="9"/><path d="M8.5 15h7"/><path d="M9 9.5h.01M15 9.5h.01"/>'),
  faceSad: svg('<circle cx="12" cy="12" r="9"/><path d="M8.5 16c1-1.3 2.2-2 3.5-2s2.5.7 3.5 2"/><path d="M9 9.5h.01M15 9.5h.01"/>'),
  faceCool: svg('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2"/><path d="M7 9.5h4M13 9.5h4"/>'),
  fingers2: svg('<path d="M9 14V6a1.5 1.5 0 0 1 3 0v8"/><path d="M12 13V5a1.5 1.5 0 0 1 3 0v9"/><path d="M15 14v-1a6 6 0 0 1-12 0v-2a1.5 1.5 0 0 1 3 0v3"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  fingers3: svg('<path d="M7 13V7a1.5 1.5 0 0 1 3 0v6"/><path d="M10 12V5a1.5 1.5 0 0 1 3 0v7"/><path d="M13 12V6a1.5 1.5 0 0 1 3 0v7"/><path d="M16 13a5 5 0 0 1-10 0"/>'),
} as const;
export type IconName = keyof typeof ICON;
