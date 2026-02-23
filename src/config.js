// ============================================================
//  src/config.js — single source of truth for all defaults
//  Edit here; changes propagate to both 3D materials and UI.
// ============================================================

export const COLORS = {
  gateSlats:  '#b8a832',  // Gate — repeating slat panels
  gateBorder: '#5a5a2e',  // Gate — thick outer border frame
  frame:      '#8899bb',  // Fixed structural frame
  mech:       '#cc8833',  // Drive unit mechanisms
  motor:      '#ee4444',  // Motor box (hidden by default)
  background: '#0b0b0e',  // Scene background
  edges:      '#224466',  // Edge overlay lines
};

export const GATE_TRAVEL_MM = 7200;  // mm — matches 7.2 m opening in engineering drawing
export const PAUSE_DURATION = 1.5;   // seconds to hold at each animation endpoint
export const DEFAULT_SPEED  = 0.8;   // initial animation speed multiplier (range 0.1–2.0)
