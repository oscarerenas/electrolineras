// ── Platform detection ──
const NATIVE = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
const API_URL = NATIVE ? 'https://electrolineras.greenjo.net/api/stations' : '/api/stations';

// ── Power categories (kW) ──
const POWER = {
  SLOW:       { max: 7,    label: 'slow',      color: '#9e9e9e' },  // gray
  SEMI_RAPID: { max: 22,   label: 'semiRapid',  color: '#2196f3' },  // blue
  RAPID:      { max: 50,   label: 'rapid',      color: '#ff9800' },  // orange
  ULTRA:      { max: Infinity, label: 'ultra',   color: '#4caf50' },  // green
};

function getPowerCategory(kw) {
  if (kw <= POWER.SLOW.max) return POWER.SLOW;
  if (kw <= POWER.SEMI_RAPID.max) return POWER.SEMI_RAPID;
  if (kw <= POWER.RAPID.max) return POWER.RAPID;
  return POWER.ULTRA;
}

// ── Connector type names ──
const CONNECTOR_NAMES = {
  1:  'Type 1 (J1772)',
  2:  'CHAdeMO',
  25: 'Type 2 (Mennekes)',
  27: 'Tesla Supercharger',
  28: 'Schuko',
  33: 'CCS (Combo 2)',
  36: 'Type 2 (Socket)',
  1036: 'CCS (Combo 1)',
};

function connectorName(typeId) {
  return CONNECTOR_NAMES[typeId] || `Tipo ${typeId}`;
}

// ── Map tiles ──
const TILES = {
  dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
};
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

// ── Price tier colors ──
const PRICE_COLORS = {
  free:      '#4caf50',  // green
  cheap:     '#8bc34a',  // light green
  mid:       '#ffc107',  // amber
  expensive: '#f44336',  // red
};

// ── Spain center ──
const SPAIN_CENTER = [40.0, -3.7];
const SPAIN_ZOOM = 6;
