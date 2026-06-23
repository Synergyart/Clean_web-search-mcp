# Web Search MCP Server

A TypeScript MCP (Model Context Protocol) server for web search. No API keys required. Three specialised tools: full-content search, lightweight summaries, and single-page extraction.

> **Upstream:** [mrkrsl/web-search-mcp](https://github.com/mrkrsl/web-search-mcp) — original project by Mark Russell. This fork adds adblocking, StartPage search, pnpm migration, and expanded engine coverage.

## Quick Install

**Linux / macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/Synergyart/Clean_web-search-mcp/refs/heads/master/install.sh | bash
```

**Windows:** Download and run [`install.bat`](https://raw.githubusercontent.com/Synergyart/Clean_web-search-mcp/refs/heads/master/install.bat).

---

## Features

- **Multi-engine fallback chain**: StartPage → Bing → Brave → DuckDuckGo.
- **Axios-first strategy**: StartPage and DuckDuckGo use fast HTTP requests. Bing and Brave use headless Chromium only when needed.
- **Built-in adblocker**: Ghostery (`@ghostery/adblocker-playwright`) blocks ads, trackers, and malware on all browser-based searches.
- **Concurrent content extraction**: Fetches full page content from multiple results in parallel.
- **HTTP/2 fallback**: Automatically retries with HTTP/1.1 when protocol errors occur.
- **Zero API keys**: All engines are accessed directly. No Google/Bing/SerpAPI keys required.

---

## Compatibility

This MCP server works with any client that supports the Model Context Protocol over stdio, including **LM Studio**, **LibreChat**, **Kilo**, **Claude Desktop**, and **Continue**.

### Model Requirements

Any modern model with tool-calling support should work. As of mid-2026, current-generation models handle tool calls reliably. If you notice erratic behavior, ensure you are using a recent model with explicit tool-use or function-calling capabilities.

---

## Manual Installation

### Requirements

- Node.js 18 or higher
- pnpm (the install script installs it automatically)

### Steps

1. Clone the repository:

   ```bash
   git clone https://github.com/Synergyart/Clean_web-search-mcp.git
   cd Clean_web-search-mcp
   ```

2. Run the install script:

   **Linux / macOS:**
   ```bash
   ./install.sh
   ```

   **Windows:**
   ```cmd
   install.bat
   ```

   Or run the steps manually:

   ```bash
   pnpm install --frozen-lockfile
   pnpx playwright install chromium
   pnpm run build
   ```

3. Configure your MCP client to point to `dist/index.js`:

   ```json
   {
     "mcpServers": {
       "web-search": {
         "command": "node",
         "args": ["/absolute/path/to/Clean_web-search-mcp/dist/index.js"]
       }
     }
   }
   ```

   **Example paths:**
   - macOS / Linux: `~/mcp/Clean_web-search-mcp/dist/index.js`
   - Windows: `C:\\mcp\\Clean_web-search-mcp\\dist\\index.js`

### LibreChat (Docker)

Mount the server directory in `docker-compose.override.yml`:

```yaml
services:
  api:
    volumes:
      - type: bind
        source: /path/to/Clean_web-search-mcp
        target: /app/mcp
```

In `librechat.yaml`:

```yaml
mcpServers:
  web-search:
    type: stdio
    command: node
    args:
      - /app/mcp/Clean_web-search-mcp/dist/index.js
    serverInstructions: true
```

---

## Tools

### `full-web-search`

Comprehensive search with full page content extraction.

1. Accepts a query and optional result count (1–10, default 5).
2. Searches across engines: StartPage → Bing → Brave → DuckDuckGo.
3. Extracts full page content from each result URL concurrently.
4. Returns structured results with title, URL, description, extracted content, and word count.

```json
{
  "name": "full-web-search",
  "arguments": {
    "query": "TypeScript MCP server",
    "limit": 3,
    "includeContent": true
  }
}
```

### `get-web-search-summaries`

Lightweight search returning only snippets — no content extraction. Faster for quick lookups.

```json
{
  "name": "get-web-search-summaries",
  "arguments": {
    "query": "TypeScript MCP server",
    "limit": 5
  }
}
```

### `get-single-web-page-content`

Extract content from a single URL. Useful when you already know the target page.

```json
{
  "name": "get-single-web-page-content",
  "arguments": {
    "url": "https://example.com/article",
    "maxContentLength": 5000
  }
}
```

---

## Configuration

All settings are optional and set via environment variables in your MCP client configuration:

```json
{
  "mcpServers": {
    "web-search": {
      "command": "node",
      "args": ["/path/to/Clean_web-search-mcp/dist/index.js"],
      "env": {
        "MAX_CONTENT_LENGTH": "50000",
        "DEFAULT_TIMEOUT": "6000",
        "MAX_BROWSERS": "3",
        "BROWSER_HEADLESS": "true"
      }
    }
  }
}
```

| Variable | Default | Description |
|---|---|---|
| `MAX_CONTENT_LENGTH` | `500000` | Max characters per extracted page |
| `DEFAULT_TIMEOUT` | `6000` | Request timeout in milliseconds |
| `MAX_BROWSERS` | `3` | Max concurrent Chromium instances |
| `BROWSER_TYPES` | `chromium,firefox` | Browser rotation (chromium, firefox, webkit) |
| `BROWSER_HEADLESS` | `true` | Run browsers in headless mode |
| `BROWSER_FALLBACK_THRESHOLD` | `3` | Axios failures before switching to browser |
| `RELEVANCE_THRESHOLD` | `0.3` | Minimum result quality score (0.0–1.0) |
| `FORCE_MULTI_ENGINE_SEARCH` | `false` | Try all engines regardless of quality |
| `DEBUG_BROWSER_LIFECYCLE` | `false` | Verbose browser lifecycle logging |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| **Slow responses** | Set `DEFAULT_TIMEOUT=4000` or reduce `MAX_BROWSERS` to 1 |
| **Search returns no results** | Run `pnpx playwright install chromium` to ensure the browser is available |
| **Browser fails to start** | Set `BROWSER_TYPES=chromium` if Firefox/WebKit are not installed |
| **Build errors** | Delete `node_modules/` and `dist/`, then re-run `./install.sh` |
| **Content truncated** | Increase `MAX_CONTENT_LENGTH` or reduce `limit` to fetch fewer pages |
| **Bot detection** | Some search engines (notably DuckDuckGo) may block datacenter IPs; the server falls back to the next engine automatically |

---

## Development

```bash
git clone https://github.com/Synergyart/Clean_web-search-mcp.git
cd Clean_web-search-mcp
pnpm install --frozen-lockfile
pnpx playwright install chromium
pnpm run build
```

Available scripts:

```bash
pnpm run dev     # Watch mode with hot reload
pnpm run build   # TypeScript compilation
pnpm run lint    # ESLint
pnpm run format  # Prettier
pnpm start       # Run the compiled server
```

---

## Documentation

- [API Reference](./docs/API.md)
- [Changelog](./CHANGELOG.md)
- [Postmortem: Chromium Unification + Adblocker Integration](./docs/POSTMORTEM-2026-06-08.md)

---

## Acknowledgments

This project is a fork of [mrkrsl/web-search-mcp](https://github.com/mrkrsl/web-search-mcp) by **Mark Russell**. The original MCP server, multi-engine search strategy, and core architecture were created by Mark. This fork extends the upstream with StartPage search, Ghostery adblocker integration, pnpm migration, and security hardening.

---

## License

MIT. See [LICENSE](./LICENSE).
