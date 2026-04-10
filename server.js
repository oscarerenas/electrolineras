const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const API_KEY = '4307d589-f6d8-44c6-9841-d29698b188fd';
const OCM_URL = `https://api.openchargemap.io/v3/poi/?output=json&countrycode=ES&maxresults=10000&compact=true&verbose=false&key=${API_KEY}`;
const OSM_HOST = 'overpass.kumi.systems';
const OSM_UA = 'ElectrolinerasEspana/1.0 (https://electrolineras.greenjo.net)';
// Spain split into 5 regions to avoid Overpass timeouts
const OSM_REGIONS = [
  '41.0,-9.5,43.9,4.5',    // North
  '38.5,-9.5,41.0,-2.5',   // Center-West (densest: Madrid, Lisboa corridor)
  '38.5,-2.5,41.0,4.5',    // Center-East (Valencia, Barcelona south)
  '36.0,-9.5,38.5,4.5',    // South (Andalucía, Murcia)
  '27.5,-18.5,36.0,4.5',   // Islands + Ceuta/Melilla
];
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

let cache = null;

// ── HTTP helpers ──

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Invalid JSON from ${url.slice(0, 60)}: ${data.slice(0, 100)}`)); }
      });
    }).on('error', reject);
  });
}

function fetchOSMRegion(bbox) {
  const query = `[out:json][timeout:60];node["amenity"="charging_station"](${bbox});out body;`;
  const postData = `data=${encodeURIComponent(query)}`;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: OSM_HOST,
      path: '/api/interpreter',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': OSM_UA,
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.elements || []);
        } catch (e) {
          reject(new Error(`Overpass ${res.statusCode} for bbox ${bbox}`));
        }
      });
    });
    req.on('error', reject);
    req.end(postData);
  });
}

function fetchAllOSM() {
  // Fetch all regions in parallel, tolerate individual failures
  return Promise.all(
    OSM_REGIONS.map(bbox =>
      fetchOSMRegion(bbox).catch(e => { console.error('  OSM region error:', e.message); return []; })
    )
  ).then(results => results.flat());
}

// ── OSM → OpenChargeMap format ──

const OSM_SOCKET_MAP = {
  'socket:type2':        { id: 25, name: 'Type 2 (Mennekes)' },
  'socket:type2_combo':  { id: 33, name: 'CCS (Combo 2)' },
  'socket:chademo':      { id: 2,  name: 'CHAdeMO' },
  'socket:schuko':       { id: 28, name: 'Schuko' },
  'socket:type1':        { id: 1,  name: 'Type 1 (J1772)' },
  'socket:type1_combo':  { id: 1036, name: 'CCS (Combo 1)' },
  'socket:tesla_supercharger': { id: 27, name: 'Tesla Supercharger' },
};

function parseSocketPower(tags, socketKey) {
  // e.g. "socket:type2_combo:output" = "350 kW"
  const raw = tags[`${socketKey}:output`] || '';
  const m = raw.match(/([\d.]+)\s*kw/i);
  return m ? parseFloat(m[1]) : null;
}

function osmToOCM(el) {
  const tags = el.tags || {};

  // Build connections from socket:* tags
  const connections = [];
  for (const [key, mapping] of Object.entries(OSM_SOCKET_MAP)) {
    const qty = parseInt(tags[key], 10);
    if (!qty || qty <= 0) continue;
    const powerKW = parseSocketPower(tags, key);
    connections.push({
      ConnectionTypeID: mapping.id,
      Quantity: qty,
      PowerKW: powerKW,
    });
  }

  const addr = tags['addr:street'] || '';
  const num = tags['addr:housenumber'] || '';
  const street = num ? `${addr} ${num}` : addr;

  return {
    ID: `osm-${el.id}`,
    _source: 'osm',
    AddressInfo: {
      Title: tags.name || tags.operator || street || `OSM ${el.id}`,
      AddressLine1: street || null,
      Town: tags['addr:city'] || null,
      StateOrProvince: tags['addr:state'] || null,
      Postcode: tags['addr:postcode'] || null,
      CountryID: 210,
      Latitude: el.lat,
      Longitude: el.lon,
    },
    OperatorInfo: tags.operator ? { Title: tags.operator } : null,
    Connections: connections,
    UsageCost: tags.fee === 'no' ? 'Gratuito' : null,
    NumberOfPoints: parseInt(tags.capacity, 10) || null,
  };
}

// ── Deduplication ──

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mergeStations(ocmStations, osmStations) {
  // Build spatial index: bucket OCM stations by rounded coords (~111m grid)
  const grid = new Map();
  const GRID_SIZE = 0.001; // ~111m

  for (const s of ocmStations) {
    const a = s.AddressInfo;
    if (!a || !a.Latitude || !a.Longitude) continue;
    const key = `${Math.round(a.Latitude / GRID_SIZE)},${Math.round(a.Longitude / GRID_SIZE)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(s);
  }

  const DEDUP_DIST = 50; // meters
  let added = 0;

  for (const osm of osmStations) {
    const lat = osm.AddressInfo.Latitude;
    const lon = osm.AddressInfo.Longitude;
    const gx = Math.round(lat / GRID_SIZE);
    const gy = Math.round(lon / GRID_SIZE);

    // Check neighboring grid cells
    let isDuplicate = false;
    for (let dx = -1; dx <= 1 && !isDuplicate; dx++) {
      for (let dy = -1; dy <= 1 && !isDuplicate; dy++) {
        const nearby = grid.get(`${gx + dx},${gy + dy}`);
        if (!nearby) continue;
        for (const ocm of nearby) {
          const dist = haversineM(lat, lon, ocm.AddressInfo.Latitude, ocm.AddressInfo.Longitude);
          if (dist < DEDUP_DIST) { isDuplicate = true; break; }
        }
      }
    }

    if (!isDuplicate) {
      ocmStations.push(osm);
      added++;
    }
  }

  console.log(`  OSM: ${osmStations.length} stations, ${added} unique added after dedup`);
  return ocmStations;
}

// ── Operator inference ──

// Only well-known charging networks in Spain/Portugal — no municipalities or random venues
const KNOWN_OPERATORS = [
  'Endolla Barcelona', 'Shell Recharge', 'Endesa X', 'Acciona Energía',
  'TotalEnergies', 'ChargePoint', 'Factor Energia', 'Feníe Energía',
  'Iberdrola', 'Mercadona', 'Powerdot', 'Atlante', 'Etecnic', 'Ionity',
  'Endesa', 'Repsol', 'Zunder', 'Wenea', 'Acciona', 'Allego', 'Cepsa',
  'Tesla', 'Lidl', 'Shell', 'Porsche', 'IBIL', 'EVCE', 'Galp', 'EDP',
  'BP', 'Ballenoil', 'Carrefour', 'Parkia', 'Mobiletric', 'Eranovum',
].sort((a, b) => b.length - a.length); // longer names first to avoid partial matches

function inferOperator(station) {
  if (station.OperatorInfo && station.OperatorInfo.Title) return;

  const title = (station.AddressInfo && station.AddressInfo.Title) || '';
  const titleLower = title.toLowerCase();

  for (const op of KNOWN_OPERATORS) {
    if (titleLower.includes(op.toLowerCase())) {
      station.OperatorInfo = { Title: op };
      return;
    }
  }
}

// ── Price parsing & ranking ──

const FREE_KEYWORDS = ['free', 'gratuito', 'gratuit', 'gratis', 'kostenlos', 'gratuït'];

function parsePrice(costStr) {
  if (!costStr) return null;
  if (FREE_KEYWORDS.includes(costStr.toLowerCase().trim())) return 0;
  // Match "0,39€/kWh" or "0.47€/kWh" patterns — take the first price found
  const m = costStr.match(/([\d]+[.,][\d]+)\s*€?\s*\/?\s*kWh/i);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

// Power category thresholds (must match client-side config.js)
const POWER_LIMITS = [
  { label: 'slow',      max: 7 },
  { label: 'semiRapid', max: 22 },
  { label: 'rapid',     max: 50 },
  { label: 'ultra',     max: Infinity },
];

function getPowerLabel(kw) {
  for (const p of POWER_LIMITS) {
    if (kw <= p.max) return p.label;
  }
  return 'ultra';
}

function enrichPriceData(stations) {
  // 1. Parse price and compute max kW for each station
  for (const s of stations) {
    const conns = s.Connections || [];
    const maxKw = Math.max(...conns.map(c => c.PowerKW || 0), 0);
    s._maxKw = maxKw;
    s._powerLabel = getPowerLabel(maxKw);
    s._price = parsePrice(s.UsageCost);
  }

  // 2. Compute tercile thresholds per power category
  const byCategory = {};
  for (const s of stations) {
    if (s._price === null || s._price < 0) continue;
    if (!byCategory[s._powerLabel]) byCategory[s._powerLabel] = [];
    byCategory[s._powerLabel].push(s._price);
  }

  const thresholds = {};
  for (const [cat, prices] of Object.entries(byCategory)) {
    prices.sort((a, b) => a - b);
    thresholds[cat] = {
      p33: prices[Math.floor(prices.length * 0.33)] || 0,
      p66: prices[Math.floor(prices.length * 0.66)] || 0,
    };
    console.log(`  Price ${cat}: n=${prices.length}, p33=${thresholds[cat].p33.toFixed(2)}€, p66=${thresholds[cat].p66.toFixed(2)}€`);
  }

  // 3. Assign price tier: "free", "cheap", "mid", "expensive", or null (unknown)
  for (const s of stations) {
    if (s._price === null) {
      s._priceTier = null;
    } else if (s._price === 0) {
      s._priceTier = 'free';
    } else {
      const t = thresholds[s._powerLabel];
      if (!t) { s._priceTier = null; continue; }
      s._priceTier = s._price <= t.p33 ? 'cheap' : s._price <= t.p66 ? 'mid' : 'expensive';
    }
  }
}

// ── Fetch & merge ──

async function fetchAllStations() {
  console.log('Fetching fresh data…');

  const [ocmData, osmElements] = await Promise.all([
    fetchJSON(OCM_URL).catch(e => { console.error('OCM error:', e.message); return []; }),
    fetchAllOSM().catch(e => { console.error('OSM error:', e.message); return []; }),
  ]);

  const ocmStations = Array.isArray(ocmData) ? ocmData : [];
  const osmStations = osmElements
    .filter(el => el.lat && el.lon)
    .map(osmToOCM);

  console.log(`  OCM: ${ocmStations.length} stations`);
  console.log(`  OSM: ${osmStations.length} stations (pre-dedup)`);

  const merged = mergeStations(ocmStations, osmStations);

  // Infer missing operators from station titles
  let inferred = 0;
  for (const s of merged) {
    const had = !!(s.OperatorInfo && s.OperatorInfo.Title);
    inferOperator(s);
    if (!had && s.OperatorInfo && s.OperatorInfo.Title) inferred++;
  }
  console.log(`  Operators inferred from titles: ${inferred}`);

  // Enrich with price tiers
  enrichPriceData(merged);

  return merged;
}

// ── Server ──

const REFRESH_COOLDOWN = 5 * 60 * 1000; // 5 minutes
let lastRefresh = 0;
let fetchInProgress = null; // prevent parallel fetches from concurrent requests

http.createServer(async (req, res) => {
  if (req.url === '/api/refresh' && req.method === 'POST') {
    const now = Date.now();
    if (now - lastRefresh < REFRESH_COOLDOWN) {
      const wait = Math.ceil((REFRESH_COOLDOWN - (now - lastRefresh)) / 1000);
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too soon', retryIn: wait }));
      return;
    }
    lastRefresh = now;
    cache = null;
    console.log('Cache cleared by user request.');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }

  if (req.url === '/api/stations') {
    try {
      if (!cache || Date.now() - cache.ts > CACHE_TTL) {
        // Single fetch at a time — concurrent requests wait for the same promise
        if (!fetchInProgress) {
          fetchInProgress = fetchAllStations()
            .then(stations => { cache = { ts: Date.now(), body: JSON.stringify(stations) }; })
            .finally(() => { fetchInProgress = null; });
        }
        await fetchInProgress;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(cache.body);
    } catch (e) {
      console.error('API error:', e.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end('{"error":"API error"}');
    }
    return;
  }

  // Static files from www/
  const file = path.join(__dirname, 'www', req.url === '/' ? 'index.html' : req.url);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(file);
    const types = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
