// Meridian Heat — tuning constants for the whole game. One place holds every
// number the city, the simulation and the renderer agree on, so a tweak here
// moves the whole game at once and nothing is duplicated across files.
export const WORLD = { width: 2560, height: 1920 };
export const STEP = 1 / 60;
export const SAVE_KEY = 'meridian-heat-save-v1';
export const BEST_KEY = 'meridian-heat-best-v1';

// The street grid: avenues run north-south, streets east-west. Road width 64,
// so a block is the gap between two neighbouring streets minus the road.
export const ROAD_W = 64;
export const AVENUES = [160, 480, 800, 1120, 1440, 1760, 2080, 2400];
export const STREETS = [160, 480, 800, 1120, 1440, 1760];
export const BEACH_TOP = 1760; // south of the last street: sand, then sea.

// Landmarks, placed on the grid so the missions and the minimap can name them.
export const LANDMARKS = {
  safehouse: { x: 320, y: 320, label: 'Safehouse' },
  warehouse: { x: 2240, y: 320, label: 'Warehouse' },
  hospital: { x: 1280, y: 960, label: 'Hospital' },
  policeHq: { x: 2080, y: 1280, label: 'Police HQ' },
  docks: { x: 2240, y: 1440, label: 'Docks' },
};

// Player on foot.
export const PLAYER = {
  walkSpeed: 170,
  runSpeed: 265,
  radius: 11,
  health: 100,
  punchRange: 34,
  punchArc: 1.1, // radians either side of facing
  punchDamage: 34,
  punchCooldown: 0.45,
  enterRange: 46,
};

// Cars: the player's arcade handling, traffic and the police.
export const CAR = {
  length: 46,
  width: 22,
  accel: 340,
  brake: 520,
  reverseAccel: 180,
  maxSpeed: 430,
  maxReverse: 140,
  turnRate: 2.6, // radians per second at full lock, scaled by speed
  grip: 3.2, // how fast lateral velocity dies
  health: 100,
  ramDamage: 26, // to a pedestrian hit at speed
  crashDamage: 14, // to a car hit hard
};

// Traffic and pedestrians.
export const TRAFFIC_COUNT = 26;
export const TRAFFIC_SPEED = 150;
export const PARKED_COUNT = 14;
export const PED_COUNT = 34;
export const PED_SPEED = 62;

// Wanted level: 0 to 5 stars. Heat decays once the police lose sight.
export const WANTED = {
  max: 5,
  decayDelay: 12, // seconds out of sight before a star drops
  decayStep: 6, // seconds per star after the delay
  steal: 1,
  punch: 1,
  runOver: 2,
  copRam: 1,
};

// Police.
export const COP = {
  carSpeed: 470, // a touch faster than the player's car at 3+ stars
  footSpeed: 185,
  arrestTime: 1.2, // seconds of contact before the arrest lands
  punchDamage: 12,
  punchCooldown: 0.8,
  fine: 120, // cash lost on arrest / respawn
  spawnGap: 7, // seconds between cop spawns at the same wanted level
};

// The story arc, then the courier jobs that repeat in free roam.
export const MISSIONS = [
  {
    id: 'hot-wheels',
    name: 'Hot Wheels',
    brief: 'Steal a car, then drive to the Docks marker.',
    pay: 150,
    start: { x: 320, y: 320 },
    target: { x: 2240, y: 1440 },
    needsCar: true,
  },
  {
    id: 'the-package',
    name: 'The Package',
    brief: 'On foot: fetch the package, deliver it to the safehouse.',
    pay: 250,
    start: { x: 2240, y: 320 },
    target: { x: 320, y: 320 },
    needsCar: false,
  },
  {
    id: 'lose-the-heat',
    name: 'Lose the Heat',
    brief: 'You start at 3 stars. Lose the cops, then reach the safehouse.',
    pay: 400,
    start: { x: 1280, y: 960 },
    target: { x: 320, y: 320 },
    needsCar: false,
    startWanted: 3,
  },
];
export const JOB_PAY = [100, 120, 140, 160];

// The in-game clock: one game minute per real second, starting at 08:00.
export const CLOCK_START_MINUTES = 8 * 60;
export const CLOCK_RATE = 1;

// Screens the renderer draws.
export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_DOWN = 'down';

// Colours for the sun-soaked city. Warm asphalt, pale sidewalks, flat roofs in
// a handful of pastel tones, turquoise sea at the south edge.
export const COLORS = {
  grass: '#7fb069',
  grassDark: '#74a35e',
  road: '#3d3a38',
  roadEdge: '#57534f',
  dash: '#e8d44d',
  sidewalk: '#c9c2b4',
  sea: '#2e86ab',
  sand: '#e6cf9a',
  buildingRoof: ['#b8574e', '#4e7fb8', '#c98a3d', '#6a8f5f', '#8a6fb8', '#b8b0a0', '#4e9a8a'],
  buildingEdge: '#2b2b2b',
  park: '#5d9e4d',
  tree: '#2f6b2f',
  container: ['#c65a3a', '#3a7fc6', '#4e9a5a', '#c6a23a'],
  player: '#ff8c1a',
  playerCar: '#ff8c1a',
  copCar: '#1d4ed8',
  cop: '#1d4ed8',
  trafficCar: ['#d9d9d9', '#5b7fa6', '#a65b5b', '#5ba66e', '#c9b458', '#8a8a8a'],
  ped: ['#e8b48a', '#8a6fb8', '#4e7fb8', '#c98a3d', '#6a8f5f', '#b8574e'],
  marker: '#ffd23f',
  safehouse: '#3ddc84',
  hud: '#101014',
};
