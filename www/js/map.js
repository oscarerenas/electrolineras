// ── Map state ──
let map = null;
let tileLayer = null;
let markers = null;
let allStations = [];
let lastCount = null;
let legendDiv = null;
let zoomControl = null;
let isDark = true;

// ── Initialize map ──
function initMap() {
  const prefs = loadPrefs();
  isDark = prefs.dark !== false;
  document.body.classList.toggle('light', !isDark);

  map = L.map('map', { zoomControl: false }).setView(SPAIN_CENTER, SPAIN_ZOOM);
  tileLayer = L.tileLayer(isDark ? TILES.dark : TILES.light, { attribution: TILE_ATTR }).addTo(map);

  markers = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    iconCreateFunction: cluster => {
      const count = cluster.getChildCount();
      const size = count < 20 ? 'small' : count < 100 ? 'medium' : 'large';
      return L.divIcon({
        html: `<div><span>${count}</span></div>`,
        className: `marker-cluster marker-cluster-${size}`,
        iconSize: [40, 40]
      });
    }
  });
  map.addLayer(markers);

  createZoomControl();
  createLegend();
  geolocate();
}

// ── Custom zoom control ──
function createZoomControl() {
  if (zoomControl) map.removeControl(zoomControl);
  zoomControl = L.control({ position: 'bottomright' });
  zoomControl.onAdd = function () {
    const div = L.DomUtil.create('div', 'custom-zoom');
    div.innerHTML = `
      <button onclick="map.zoomIn()" title="Zoom in">+</button>
      <button onclick="map.zoomOut()" title="Zoom out">−</button>
      <button onclick="geolocate()" title="Mi ubicación">◎</button>
      <button onclick="toggleDarkMode()" id="darkModeBtn" title="${isDark ? t('lightMode') : t('darkMode')}">
        ${isDark ? '☀️' : '🌙'}
      </button>
    `;
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  zoomControl.addTo(map);
}

// ── Legend ──
function createLegend() {
  if (legendDiv) map.removeControl(legendDiv);
  legendDiv = L.control({ position: 'bottomleft' });
  legendDiv.onAdd = function () {
    const div = L.DomUtil.create('div', 'legend');
    renderLegend(div);
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  legendDiv.addTo(map);
}

function renderLegend(container) {
  if (!container) container = document.querySelector('.legend');
  if (!container) return;

  const cats = [
    { key: 'ultra',     ...POWER.ULTRA },
    { key: 'rapid',     ...POWER.RAPID },
    { key: 'semiRapid', ...POWER.SEMI_RAPID },
    { key: 'slow',      ...POWER.SLOW },
  ];

  container.innerHTML = `<strong>${t('legend')}</strong>` + cats.map(c => {
    const active = legendFilter === c.label;
    return `<div class="legend-item${active ? ' active' : ''}" onclick="toggleLegendFilter('${c.label}')">
      <span class="legend-dot" style="background:${c.color}"></span> ${t(c.label)}
    </div>`;
  }).join('');

  if (lastCount !== null) {
    container.innerHTML += `<div class="legend-count">${lastCount} ${t('stations')}</div>`;
  }
}

function toggleLegendFilter(label) {
  legendFilter = legendFilter === label ? null : label;
  renderStations();
  renderLegend();
}

// ── Dark/light mode ──
function toggleDarkMode() {
  isDark = !isDark;
  document.body.classList.toggle('light', !isDark);
  tileLayer.setUrl(isDark ? TILES.dark : TILES.light);
  savePrefs({ dark: isDark });
  createZoomControl();
}

// ── Geolocation ──
function geolocate() {
  if (NATIVE) {
    Capacitor.Plugins.Geolocation.getCurrentPosition().then(pos => {
      map.setView([pos.coords.latitude, pos.coords.longitude], 13);
    }).catch(() => {});
  } else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      map.setView([pos.coords.latitude, pos.coords.longitude], 13);
    }, () => {});
  }
}

// ── Marker creation ──
function createMarker(station) {
  const addr = station.AddressInfo;
  if (!addr || !addr.Latitude || !addr.Longitude) return null;

  const conns = station.Connections || [];
  const maxKw = Math.max(...conns.map(c => c.PowerKW || 0), 0);
  const cat = getPowerCategory(maxKw);

  const icon = L.divIcon({
    className: 'charger-marker',
    html: `<div style="background:${cat.color}" class="marker-dot"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

  const marker = L.marker([addr.Latitude, addr.Longitude], { icon });
  marker.bindPopup(() => buildPopup(station, maxKw, cat), { maxWidth: 300 });
  return marker;
}

function buildPopup(station, maxKw, cat) {
  const addr = station.AddressInfo;
  const conns = station.Connections || [];
  const op = station.OperatorInfo ? station.OperatorInfo.Title : t('unknown');
  const favId = String(station.ID);
  const isFav = isFavorite(favId);

  const connList = conns.map(c => {
    const name = connectorName(c.ConnectionTypeID);
    const pw = c.PowerKW ? `${c.PowerKW} kW` : '';
    const qty = c.Quantity ? ` x${c.Quantity}` : '';
    return `<div class="conn-item">${name} ${pw}${qty}</div>`;
  }).join('');

  const costText = station.UsageCost || t('unknown');
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${addr.Latitude},${addr.Longitude}`;

  return `
    <div class="popup-content">
      <h3>${addr.Title || t('unknown')}</h3>
      <div class="popup-address">${addr.AddressLine1 || ''}, ${addr.Town || ''}</div>
      <div class="popup-field"><strong>${t('operatorLabel')}:</strong> ${op}</div>
      <div class="popup-field"><strong>${t('maxPower')}:</strong> <span style="color:${cat.color};font-weight:bold">${maxKw} kW</span></div>
      <div class="popup-field"><strong>${t('cost')}:</strong> ${costText}</div>
      <div class="popup-connectors">
        <strong>${t('connectors')}:</strong>
        ${connList}
      </div>
      <div class="popup-actions">
        <a href="${navUrl}" target="_blank" class="popup-btn nav-btn">${t('navigate')}</a>
        <button onclick="toggleFavorite('${favId}');this.textContent=isFavorite('${favId}')?'★':'☆'" class="popup-btn fav-btn">${isFav ? '★' : '☆'}</button>
      </div>
    </div>
  `;
}

// ── Render stations on map ──
function renderStations() {
  markers.clearLayers();
  const filtered = applyFilters(allStations);
  filtered.forEach(s => {
    const m = createMarker(s);
    if (m) markers.addLayer(m);
  });
  lastCount = filtered.length;
  renderLegend();
  document.getElementById('stationCount').textContent = `${filtered.length} ${t('stations')}`;
}
