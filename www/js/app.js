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
    updateFilterCount();
  });

  // Connector filter
  document.getElementById('connectorFilter').addEventListener('change', e => {
    filterConnector = e.target.value;
    savePrefs({ connector: filterConnector });
    renderStations();
    updateFilterCount();
  });

  // Operator filter
  document.getElementById('operatorFilter').addEventListener('change', e => {
    filterOperator = e.target.value;
    savePrefs({ operator: filterOperator });
    renderStations();
    updateFilterCount();
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
    updateFilterCount();
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

  // Filters drawer
  const drawer = document.getElementById('drawer');
  const drawerOverlay = document.getElementById('drawerOverlay');
  const openDrawer = () => {
    drawer.classList.add('open');
    drawerOverlay.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  };
  const closeDrawer = () => {
    drawer.classList.remove('open');
    drawerOverlay.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  };
  document.getElementById('filtersBtn').addEventListener('click', openDrawer);
  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
  });
}

// Update filter-count badge on the filters button
function updateFilterCount() {
  const btn = document.getElementById('filtersBtn');
  const countEl = document.getElementById('filterCount');
  if (!btn || !countEl) return;
  let n = 0;
  if (filterConnector) n++;
  if (filterPower) n++;
  if (filterOperator) n++;
  countEl.textContent = n;
  btn.classList.toggle('has-filters', n > 0);
}

// ── Apply translations ──
function applyTranslations() {
  document.title = t('title');
  document.getElementById('appTitle').textContent = t('title');
  document.getElementById('appSubtitle').textContent = t('subtitle');
  document.getElementById('searchInput').placeholder = t('search');
  document.getElementById('clearFilters').textContent = t('clearFilters');
  document.getElementById('refreshBtn').title = t('refresh');
  document.getElementById('refreshBtn').textContent = '🔄 ' + t('refresh');
  document.getElementById('aboutBtn').title = t('about');
  document.getElementById('filtersBtn').title = t('filters');
  document.getElementById('filtersBtnLabel').textContent = t('filters');
  document.getElementById('drawerTitle').textContent = t('filters');
  document.getElementById('labelConnector').textContent = t('connector');
  document.getElementById('labelPower').textContent = t('power');
  document.getElementById('labelOperator').textContent = t('operator');

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

  // Footer
  document.getElementById('footer').innerHTML =
    `${t('aboutData')} <a href="https://openchargemap.org" target="_blank">Open Charge Map</a> + <a href="https://www.openstreetmap.org" target="_blank">OpenStreetMap</a>`;

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
    updateFilterCount();
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
