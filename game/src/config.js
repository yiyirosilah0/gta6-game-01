// Meridian Heat — configuration: world size, streets, tuning, keys, colours.
// A sun-soaked open-world crime game in the city of Meridian Bay.
export const STEP = 1 / 60;
export const WORLD = { width: 2560, height: 1920 };
// Streets form the city grid. Roads are ROAD_W wide; the strip below the last
// horizontal street is the beach, and the far south edge is the sea.
export const ROAD_W = 72;
export const VERTICAL_X = [160, 480, 800, 1120, 1440, 1760, 2080, 2400];
export const HORIZONTAL_Y = [160, 480, 800, 1120, 1440, 1760];
export const BEACH_Y = 1800;
export const WATER_Y = 1884;
// Fixed places in the story.
export const SAFEHOUSE = { x: 640, y: 640 };
export const DOCKS = { x: 2440, y: 960 };
export const WAREHOUSE = { x: 1120, y: 1440 };
export const HOSPITAL = { x: 1760, y: 160 };
export const POLICE_HQ = { x: 2080, y: 1760 };
// Player and car tuning.
export const PLAYER = {
  radius: 13,
  walk: 175,
  run: 265,
  health: 100,
  punchRange: 36,
  punchDamage: 34,
  punchCooldown: 0.45,
};
export const CAR = {
  length: 46,
  width: 24,
  accel: 380,
  maxSpeed: 430,
  maxReverse: 150,
  brake: 560,
  health: 100,
};
export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 22;
export const WANTED_DECAY_SECONDS = 12;
export const SAVE_KEY = 'meridian-heat-save-v1';
export const BEST_KEY = 'meridian-heat-best-v1';
// Colours: a sun-soaked coastal city — warm walls, teal sea, amber sun.
export const COLORS = {
  grass: '#7fae62',
  grassDark: '#74a258',
  road: '#3c3f46',
  roadEdge: '#2f3238',
  sidewalk: '#b9b3a4',
  sand: '#e8d39a',
  water: '#2f8fb5',
  waterDeep: '#22779b',
  building: ['#e8b04b', '#d97b4f', '#e6d6b8', '#5fa8a0', '#c65b5b', '#f2e3c6', '#7fa8d9', '#e0913f'],
  park: '#5d9b4a',
  tree: '#3f7d33',
  treeDark: '#2f6126',
  container: ['#c65b3f', '#4f7fa8', '#7fa34f', '#c9a13f'],
  player: '#ffd94a',
  cop: '#2b4acb',
  marker: '#ffd94a',
  markerBlue: '#57b6ff',
};
export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  enterCar: ['KeyE'],
  punch: ['KeyF'],
  pause: ['KeyP', 'Escape'],
  confirm: ['Enter', 'Space'],
  mute: ['KeyM'],
};
