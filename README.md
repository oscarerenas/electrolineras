# Electrolineras España

A real-time map application to find EV charging stations across Spain.

**Author:** Oscar Erenas Rodriguez  
**Contact:** vibecoding@erenas.org  
**Development:** Built with the assistance of Claude AI (Anthropic)

## Features

- ⚡ Interactive map with EV charging station search
- 🔌 Filter by connector type (CCS, CHAdeMO, Type 2, etc.)
- 🔋 Filter by charging power (slow, semi-fast, fast, ultra-fast)
- 🏢 Filter by operator
- 📍 Geolocation support
- 🎨 Dark/light mode
- 🌐 10 languages (ES, EN, FR, CA, EU, GL, IT, PT, DE, AR)
- 📱 Mobile-friendly (Capacitor-enabled)

## Data Source

Charging station data sourced from:
- **API**: [Open Charge Map](https://openchargemap.org/)
- **Coverage**: Spain (country code: ES)
- **Data**: Location, connectors, power levels, operators, usage cost

## Technologies

### Frontend
- [Leaflet](https://leafletjs.com/) — Interactive mapping
- [Leaflet.MarkerCluster](https://github.com/Leaflet/Leaflet.markercluster) — Marker clustering

### Mobile
- [Apache Capacitor](https://capacitorjs.com/) — Native mobile framework
- [@capacitor/geolocation](https://capacitorjs.com/docs/apis/geolocation) — Device location

### Backend
- Node.js — Development server with API proxy and caching

### Map Tiles
- CartoDB Dark/Light — Base map tiles

## Getting Started

### Development
```bash
npm install
npm run serve
```
Then open http://localhost:3001 in your browser.

### Android Build
```bash
npm run sync
npm run android
```

### Production (Docker + Traefik)

Requires an external Docker network named `proxy` and a running Traefik instance.

```bash
docker compose up -d
```

The app will be available at `https://electrolineras.greenjo.net`.

## Disclaimer

This application provides EV charging station data sourced from Open Charge Map, an open community project. While we strive for accuracy, station availability, connector status, and pricing may vary. Always verify information directly with the charging network. The developer is not responsible for any inaccuracies.

## License

MIT — See LICENSE file for details
