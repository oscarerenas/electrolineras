# Electrolineras España

## Project overview

Real-time map of EV charging stations in Spain. Combines data from Open Charge Map (OCM) API and OpenStreetMap (Overpass) with deduplication, operator inference, and price tier classification.

**Production URL:** https://electrolineras.greenjo.net
**Repo:** https://github.com/oscarerenas/electrolineras

## Architecture

### Backend — `server.js`
- Plain Node.js HTTP server (no framework), port 3001
- Two data sources fetched in parallel: OCM API + OSM Overpass (Spain split into 5 bbox regions)
- OSM data converted to OCM format via `osmToOCM()`
- Deduplication via spatial grid (50m haversine threshold)
- Operator inference from station titles against `KNOWN_OPERATORS` list
- Price parsing + tercile-based tier assignment (free/cheap/mid/expensive) per power category
- In-memory cache with 1h TTL; manual refresh via `POST /api/refresh` (5min cooldown)
- Serves static files from `www/`

### Frontend — `www/`
- Vanilla JS (no build step, no bundler)
- `index.html` — main HTML, loads Leaflet + MarkerCluster from CDN
- `js/config.js` — constants: power categories, connector names, tile URLs, price colors, Spain center
- `js/i18n.js` — 10-language translation system (ES, EN, FR, CA, EU, GL, IT, PT, DE, AR)
- `js/filters.js` — sidebar filter logic (connector type, power, operator, price tier)
- `js/map.js` — Leaflet map, markers, popups, clustering, geolocation
- `js/app.js` — initialization, theme toggle (auto/dark/light), language selector
- `css/app.css` — all styles, dark/light theme via CSS variables

### Mobile — Capacitor
- App ID: `net.greenjo.electrolineras`
- `capacitor.config.json` — webDir: `www`, androidScheme: `https`
- Native platform detected via `Capacitor.isNativePlatform()`, API URL switches to absolute

### Deployment — Docker + Traefik
- `docker-compose.yml` — node:22-alpine, Traefik reverse proxy with auto TLS
- External network `proxy` required

## Commands

```bash
npm install          # install deps (capacitor only)
npm run serve        # dev server at localhost:3001
npm run sync         # capacitor sync
npm run android      # open Android project
docker compose up -d # production deploy
```

## Key conventions

- Power thresholds must match between `server.js` (`POWER_LIMITS`) and `www/js/config.js` (`POWER`)
- Connector type IDs are shared between server OSM mapping and client `CONNECTOR_NAMES`
- OCM API key is in `server.js` (hardcoded, public key)
- OSM-sourced stations get `ID: "osm-{id}"` and `_source: "osm"` to distinguish from OCM data
- Price tiers computed server-side, consumed client-side for marker coloring
- No test suite currently exists
- Commits use conventional commits format (feat/fix/docs/refactor)

## Git workflow

- Never push directly to main — always use feature branches + PRs
- Branch naming: `feat/`, `fix/`, `docs/` prefixes
