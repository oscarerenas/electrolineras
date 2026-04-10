// ── Initialization ──
document.addEventListener('DOMContentLoaded', () => {
  // Language
  currentLang = detectLang();
  initFilters();
  initMap();
  setupUI();
  applyTranslations();
  loadStations();
});

// ── UI setup ──
function setupUI() {
  // Language selector
  const langSel = document.getElementById('langSelect');
  Object.entries(LANGS).forEach(([code, { name, flag }]) => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = `${flag} ${name}`;
    if (code === currentLang) opt.selected = true;
    langSel.appendChild(opt);
  });
  langSel.addEventListener('change', e => {
    currentLang = e.target.value;
    savePrefs({ lang: currentLang });
    applyTranslations();
    if (allStations.length) {
      populateFilters(allStations);
      renderStations();
    }
  });

  // Power filter
  const powerSel = document.getElementById('powerFilter');
  powerSel.addEventListener('change', e => {
    filterPower = e.target.value;
    savePrefs({ power: filterPower });
    legendFilter = filterPower || null;
    renderStations();
  });

  // Connector filter
  document.getElementById('connectorFilter').addEventListener('change', e => {
    filterConnector = e.target.value;
    savePrefs({ connector: filterConnector });
    renderStations();
  });

  // Operator filter
  document.getElementById('operatorFilter').addEventListener('change', e => {
    filterOperator = e.target.value;
    savePrefs({ operator: filterOperator });
    renderStations();
  });

  // Clear filters
  document.getElementById('clearFilters').addEventListener('click', () => {
    filterConnector = '';
    filterPower = '';
    filterOperator = '';
    legendFilter = null;
    document.getElementById('connectorFilter').value = '';
    document.getElementById('powerFilter').value = '';
    document.getElementById('operatorFilter').value = '';
    savePrefs({ connector: '', power: '', operator: '' });
    renderStations();
  });

  // Refresh
  document.getElementById('refreshBtn').addEventListener('click', async () => {
    await fetch('/api/refresh', { method: 'POST' }).catch(() => {});
    loadStations();
  });

  // About modal
  document.getElementById('aboutBtn').addEventListener('click', () => {
    document.getElementById('aboutModal').classList.add('show');
    renderAboutModal();
  });
  document.getElementById('aboutClose').addEventListener('click', () => {
    document.getElementById('aboutModal').classList.remove('show');
  });
  document.getElementById('aboutModal').addEventListener('click', e => {
    if (e.target.id === 'aboutModal') e.target.classList.remove('show');
  });

  // Search
  let searchTimeout;
  document.getElementById('searchInput').addEventListener('input', e => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => searchLocation(e.target.value), 500);
  });
}

// ── Apply translations ──
function applyTranslations() {
  document.title = t('title');
  document.getElementById('appTitle').textContent = t('title');
  document.getElementById('appSubtitle').textContent = t('subtitle');
  document.getElementById('searchInput').placeholder = t('search');
  document.getElementById('clearFilters').textContent = t('clearFilters');
  document.getElementById('refreshBtn').title = t('refresh');
  document.getElementById('aboutBtn').title = t('about');

  // Power filter options
  const powerSel = document.getElementById('powerFilter');
  const curPower = powerSel.value;
  powerSel.innerHTML = `
    <option value="">${t('allPowers')}</option>
    <option value="slow">${t('slow')}</option>
    <option value="semiRapid">${t('semiRapid')}</option>
    <option value="rapid">${t('rapid')}</option>
    <option value="ultra">${t('ultra')}</option>
  `;
  powerSel.value = curPower;

  // Update legend and zoom control
  renderLegend();
  if (map) createZoomControl();
}

// ── Load stations from API ──
async function loadStations() {
  const loading = document.getElementById('loading');
  loading.style.display = 'flex';

  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(res.status);
    allStations = await res.json();
    populateFilters(allStations);
    renderStations();
  } catch (e) {
    console.error('Error loading stations:', e);
    document.getElementById('stationCount').textContent = t('error');
  } finally {
    loading.style.display = 'none';
  }
}

// ── Search via Nominatim ──
async function searchLocation(query) {
  if (!query || query.length < 3) return;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&countrycodes=es&q=${encodeURIComponent(query)}`
    );
    const results = await res.json();
    if (results.length > 0) {
      map.setView([parseFloat(results[0].lat), parseFloat(results[0].lon)], 13);
    }
  } catch (e) {
    console.error('Search error:', e);
  }
}

// ── About modal ──
function renderAboutModal() {
  document.getElementById('aboutBody').innerHTML = `
    <h2>${t('aboutTitle')}</h2>
    <p>${t('aboutDesc')}</p>
    <p>${t('aboutData')}
      <a href="https://openchargemap.org" target="_blank">Open Charge Map</a> +
      <a href="https://www.openstreetmap.org" target="_blank">OpenStreetMap</a> (Overpass API)</p>
    <hr>
    <h3>${t('aboutLicense')}</h3>
    <p>MIT License &copy; 2026</p>
    <hr>
    <p>${t('aboutAuthor')} <strong>Oscar Erenas Rodriguez</strong><br>
    <a href="mailto:vibecoding@erenas.org">vibecoding@erenas.org</a></p>
    <p><em>${t('aboutAI')}</em></p>
    <p><a href="https://github.com/oscarerenas/electrolineras" target="_blank">GitHub</a></p>
    <hr>
    <h3>Tecnologias</h3>
    <ul>
      <li><a href="https://leafletjs.com" target="_blank">Leaflet</a> — Interactive maps</li>
      <li><a href="https://github.com/Leaflet/Leaflet.markercluster" target="_blank">MarkerCluster</a> — Marker clustering</li>
      <li><a href="https://openchargemap.org" target="_blank">Open Charge Map</a> — Charging station data (API)</li>
      <li><a href="https://www.openstreetmap.org" target="_blank">OpenStreetMap</a> — Charging station data (Overpass API)</li>
      <li><a href="https://capacitorjs.com" target="_blank">Apache Capacitor</a> — Native mobile</li>
      <li><a href="https://carto.com" target="_blank">CARTO</a> — Map tiles</li>
    </ul>
  `;
}
