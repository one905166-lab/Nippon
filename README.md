# nippon

A minimal Electron application with JavaScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

### Database

```bash
# Create/update database schema
$ npm run db:init

# Add anime data from Jikan API (keeps existing anime rows)
$ npm run db:seed

# Rebuild anime-related content from scratch and seed again
$ npm run db:prepare

# Wipe all table data and keep only top-rated anime seed
$ npm run db:top-rated-only

# Validate import payload only (no DB writes)
$ npm run db:import:check -- --file=imports/anime-import.sample.json

# Import anime JSON into local database
$ npm run db:import -- --file=imports/anime-import.sample.json

# Optional: reset anime-related tables before import
$ npm run db:import -- --file=path/to/your-data.json --reset
```

Importer accepts either:

- `[{ ...anime }]`
- `{ "animes": [{ ...anime }] }`

Sample payload template is available at `imports/anime-import.sample.json`.

### Manual JSON Import Only

Edit `imports/anime-import.sample.json` manually and add your episodes/links.

```bash
# Fill missing anime metadata from API (title-based)
$ npm run db:enrich

# Validate enriched payload (no DB writes)
$ npm run db:import:check -- --file=imports/anime-import.enriched.json

# Import enriched JSON into the database
$ npm run db:import -- --file=imports/anime-import.enriched.json
```

You only need to provide title + episode links in `imports/anime-import.sample.json`; metadata is auto-filled from Jikan API.

### Incremental Additions (Recommended)

Use this when you want to add only new anime/episodes each time, then auto-clear the input file:

```bash
$ npm run db:add
```

What it does:

1. enriches metadata from API
2. imports new additions into DB
3. clears `imports/anime-import.sample.json` back to `{ "animes": [] }`

Easy input syntax (you can use either style):

```json
{
	"title": "Anime Name",
	"add": [
		"1|1080p|https://.../ep1-1080p.m3u8",
		"1|720p|https://.../ep1-720p.m3u8"
	]
}
```

```json
{
	"title": "Anime Name",
	"eps": {
		"1": {
			"1080p": "https://.../ep1-1080p.m3u8",
			"720p": "https://.../ep1-720p.m3u8"
		}
	}
}
```

Strict validation is enabled: `npm run db:add` will block non-direct links (like `mega.nz/file/...`) and only allow direct media URLs (`.m3u8`, `.mp4`, `.mkv`, `.webm`).

### Link DB To App

```bash
# 1) Put your DB file in the app database folder (dev)
#    src/renderer/database/anime.db

# 2) Start app (it auto-opens that DB now)
$ npm run dev

# 3) Optional: use a custom DB path
$ NIPPON_DB_PATH=/absolute/path/to/your.db npm run dev
```

In packaged builds, DB is loaded from `resources/database` automatically.

### Arabic Scraper Bridge (Builder Checklist)

This project now includes the Electron bridge for scraping with Arabic-only source policy.

Files:

- `src/main/scraper/arabic-sources.js` (allowed Arabic sources registry)
- `src/main/scraper/scraper-service.js` (search/episodes/stream service contract)
- `src/main/index.js` (IPC handlers + header interceptor)
- `src/preload/index.js` (renderer API bridge)

Renderer API:

- `window.api.scraper.listSources()`
- `window.api.scraper.searchAnime(query, sourceId)`
- `window.api.scraper.getEpisodes(animeId, sourceId)`
- `window.api.scraper.resolveStream(episodeId, sourceId)`

Arabic-only guard:

- Only sources listed in `src/main/scraper/arabic-sources.js` are accepted.
- Outgoing requests to those hosts get `Referer` and `User-Agent` injected via Electron `session.defaultSession.webRequest.onBeforeSendHeaders`.

Builder note:

`src/main/scraper/scraper-service.js` currently defines stable function contracts and Arabic-source validation. Fill in the provider-specific extraction logic inside that service.
