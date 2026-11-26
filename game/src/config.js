// Skylark Archipelago — tuning constants and shared palette.
// One job: every number the flight model, world and renderer agree on.

export const WORLD = {
  size: 6000, // world spans -3000..3000 on x and z; sea everywhere else
  seaLevel: 0,
  seed: 20261126,
};

export const PLANE = {
  maxSpeed: 96, // m/s at full throttle (~187 kt)
  cruiseSpeed: 62,
  stallSpeed: 27, // below this the wing stops flying and the nose drops
  accel: 14, // m/s^2 toward the throttle target speed
  maxPitch: 0.42, // rad, about 24 degrees
  maxBank: 1.05, // rad, about 60 degrees
  pitchRate: 0.85, // rad/s toward the commanded pitch
  bankRate: 1.9, // rad/s toward the commanded bank
  turnRate: 0.55, // heading rad/s at full bank and cruise speed
  climbFactor: 0.9, // fraction of speed turned into climb at full pitch
  sinkStall: 9, // m/s sink when stalled
  fuelCapacity: 100,
  fuelBurn: 0.28, // per second at full throttle: ~6 minutes of full power, so a
  fuelBurnIdle: 0.02, // 5–7 minute mission flown flat-out runs dry — throttle is a decision
  damageStorm: 9, // damage per second inside a storm cloud
  landingMaxSpeed: 58, // touch down faster than this on a strip and it counts as a crash
  landingMaxSink: 7, // m/s of descent at touchdown that is still a landing
  takeoffSpeed: 34, // wheels leave the ground above this
};

export const CAMERA = {
  distance: 17, // metres behind the aircraft
  height: 5.2, // metres above the aircraft
  fov: 1.22, // rad, about 70 degrees
  pitchFollow: 0.55, // camera follows this much of the plane's pitch
  rollFollow: 0.65, // camera follows this much of the plane's bank
};

export const SCORE = {
  ring: 100,
  ringTimeBonus: 40, // extra when a ring is flown cleanly through the middle
  landing: 250,
  landingSmoothBonus: 150, // gentle touchdown
  cargo: 400,
  missionComplete: 500,
};

export const PALETTE = {
  skyTop: '#274b7d',
  skyMid: '#7fa8c9',
  skyHorizon: '#ffb37a',
  sunCore: '#fff3c4',
  sunGlow: 'rgba(255, 190, 110, 0.55)',
  seaDeep: '#14506e',
  seaShallow: '#2e86a8',
  seaGlitter: 'rgba(255, 235, 180, 0.5)',
  sand: '#e8d29a',
  grass: '#5d9b4a',
  forest: '#2f6b34',
  rock: '#7d7468',
  snow: '#eef2f5',
  runway: '#33373d',
  runwayLine: '#f2f2e8',
  ringGold: '#ffc93c',
  ringGlow: 'rgba(255, 201, 60, 0.55)',
  ringNext: '#ffd94d',
  hudInk: '#eaf4ff',
  hudDim: 'rgba(234, 244, 255, 0.62)',
  hudAmber: '#ffb020',
  hudRed: '#ff5252',
  hudGreen: '#58d68d',
  panel: 'rgba(10, 22, 38, 0.62)',
  panelEdge: 'rgba(234, 244, 255, 0.35)',
};
