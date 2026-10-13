/** Shared, allocation-free input state written by UIScene's on-screen controls and read by Player. */
export const TouchInput = {
  /** True while the on-screen controls are shown; hidden again as soon as a keyboard key is used. */
  active: false,
  /** Analog stick vector, each axis in -1..1. */
  x: 0,
  y: 0,
  /** Set by the dash button; consumed by Player. */
  dashRequested: false,
  /** Set by the air support button or F key; consumed by GameScene. */
  airRequested: false,
};
