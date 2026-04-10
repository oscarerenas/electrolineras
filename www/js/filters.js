// ── Preferences persistence ──
function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem('electroPrefs') || '{}');
  } catch { return {}; }
}

function savePrefs(patch) {
  const prefs = { ...loadPrefs(), ...patch };
  localStorage.setItem('electroPrefs', JSON.stringify(prefs));
}

// ── Favorites ──
let favorites = new Set(loadPrefs().favorites || []);

function toggleFavorite(id) {
  if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
  savePrefs({ favorites: [...favorites] });
}

function isFavorite(id) {
  return favorites.has(id);
}

// ── Filter state ──
let filterConnector = '';
let filterPower = '';
let filterOperator = '';
let legendFilter = null; // active legend category key or null

function initFilters() {
  const prefs = loadPrefs();
  filterConnector = prefs.connector || '';
  filterPower = prefs.power || '';
  filterOperator = prefs.operator || '';
}

function applyFilters(stations) {
  return stations.filter(s => {
    const conns = s.Connections || [];
    if (conns.length === 0) return false;

    // Connector type filter
    if (filterConnector) {
      const hasType = conns.some(c => String(c.ConnectionTypeID) === filterConnector);
      if (!hasType) return false;
    }

    // Power category filter
    if (filterPower) {
      const maxKw = Math.max(...conns.map(c => c.PowerKW || 0));
      const cat = getPowerCategory(maxKw);
      if (cat.label !== filterPower) return false;
    }

    // Operator filter (by name, works for both OCM and OSM stations)
    if (filterOperator) {
      const opName = s.OperatorInfo ? s.OperatorInfo.Title : '';
      if (opName !== filterOperator) return false;
    }

    // Legend filter (exclusive — only show this category)
    if (legendFilter) {
      const maxKw = Math.max(...conns.map(c => c.PowerKW || 0));
      const cat = getPowerCategory(maxKw);
      if (cat.label !== legendFilter) return false;
    }

    return true;
  });
}

// ── Build filter dropdowns ──
function populateFilters(stations) {
  const connectorSelect = document.getElementById('connectorFilter');
  const operatorSelect = document.getElementById('operatorFilter');
  if (!connectorSelect || !operatorSelect) return;

  // Collect unique connector types
  const connTypes = new Map();
  const operators = new Map();

  stations.forEach(s => {
    (s.Connections || []).forEach(c => {
      if (c.ConnectionTypeID && !connTypes.has(c.ConnectionTypeID)) {
        connTypes.set(c.ConnectionTypeID, connectorName(c.ConnectionTypeID));
      }
    });
    if (s.OperatorInfo && s.OperatorInfo.Title) {
      const name = s.OperatorInfo.Title;
      operators.set(name, (operators.get(name) || 0) + 1);
    }
  });

  // Connector dropdown
  connectorSelect.innerHTML = `<option value="">${t('allConnectors')}</option>`;
  [...connTypes.entries()].sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, name]) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = name;
    if (String(id) === filterConnector) opt.selected = true;
    connectorSelect.appendChild(opt);
  });

  // Operator dropdown — only show networks with 10+ stations (real networks, not random venues)
  operatorSelect.innerHTML = `<option value="">${t('allOperators')}</option>`;
  [...operators.entries()]
    .filter(([, count]) => count >= 10)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([name, count]) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = `${name} (${count})`;
      if (name === filterOperator) opt.selected = true;
      operatorSelect.appendChild(opt);
    });
}
