// ============================================================
//  src/config.js — single source of truth for all defaults
//  Edit here; changes propagate to both 3D materials and UI.
// ============================================================

export const COLORS = {
  gateSlats:  '#ffe100',  // Gate — repeating slat panels
  gateBorder: '#374151',  // Gate — thick outer border frame
  frame:      '#374151',  // Fixed structural frame
  mech:       '#374151',  // Drive unit mechanisms
  motor:      '#374151',  // Motor box (hidden by default)
  background: '#ffffff',  // Scene background
  edges:      '#224466',  // Edge overlay lines
};

export const GATE_TRAVEL_MM = 7200;  // mm — matches 7.2 m opening in engineering drawing
export const PAUSE_DURATION = 1.5;   // seconds to hold at each animation endpoint
export const DEFAULT_SPEED  = 0.8;   // initial animation speed multiplier (range 0.1–2.0)
