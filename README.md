# 0xbalancefetch

Historical year-end wallet balance snapshots using the [GoldRush (Covalent) API](https://goldrush.dev/).

Fetches token balances as of **December 31** of each configured year, across multiple chains and wallets. Exports results as CSV, JSON, and a readable console summary.

---

## Features

- Snapshot balances as of December 31 for any set of years (2015–present)
- Supports Ethereum, Arbitrum, Polygon, and Gnosis chains
- Tracks ETH (native), xDAI (native), USDC, USDT, and EURe
- Handles native tokens and ERC-20 tokens separately via a config-driven token map
- Caches API responses locally — same wallet/chain/year/token is never fetched twice
- Three output formats: detailed CSV, wallet totals CSV, token totals CSV, and full JSON
- Retry with exponential backoff for transient API errors
- Rate-limit-aware request throttling (respects GoldRush free tier limits)
- CLI filters by year, wallet, chain
- Dry-run validation command checks config and API connectivity before running

---

## Project Structure

```
src/
  index.ts                    CLI entry point
  config/
    configLoader.ts           Reads and parses JSON config files
  services/
    goldrushClient.ts         GoldRush HTTP client (rate limiting, retry)
    balanceService.ts         Balance fetching and normalization
    pricingService.ts         Historical USD price lookup (fallback)
    cacheService.ts           File-based cache (keyed per year/wallet/chain/token)
    snapshotService.ts        Orchestrates the full snapshot run
  adapters/
    goldrushAdapter.ts        GoldRush-specific BalanceAdapter implementation
  utils/
    logger.ts                 Leveled logger
    retry.ts                  withRetry() with exponential backoff
    dates.ts                  Snapshot date helpers
    validators.ts             Config validation
  types/
    index.ts                  All shared TypeScript types
  exporters/
    csvExporter.ts            CSV file writers
    jsonExporter.ts           JSON file writer
    consoleReporter.ts        Formatted console summary

config/
  wallets.json               List of wallets to snapshot
  app.config.json            Years, chains, tokens, rate limit settings
  tokenMap.json              Token contract addresses per chain

data/
  cache/                     Cached API responses (auto-created)
  output/                    Generated CSVs and JSON (auto-created)
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and add your GoldRush API key:

```
GOLDRUSH_API_KEY=your_api_key_here
```

Get a free key at https://goldrush.dev/.

### 3. Review config files

**`config/wallets.json`** — wallets to include in snapshots:
```json
[
  { "name": "Treasury", "address": "0x..." },
  { "name": "Multisig", "address": "0x..." }
]
```

**`config/app.config.json`** — years, chains, tokens to fetch:
```json
{
  "years": [2023, 2024, 2025],
  "chains": ["ethereum", "arbitrum", "polygon", "gnosis"],
  "tokens": ["ETH", "USDC", "USDT", "EURe", "xDAI"]
}
```

**`config/tokenMap.json`** — token contract addresses per chain (pre-configured, edit if needed).

---

## Usage

### Validate config and API connectivity

```bash
npm run validate
```

Checks that all config files are valid and that the GoldRush API is reachable. Run this before your first snapshot.

### Run a full snapshot

```bash
npm run snapshot
```

Fetches balances for all wallets, chains, and years defined in config. Exports results to `data/output/`.

### Filter options

```bash
# Specific years only
npm run snapshot -- --years 2024,2025

# Single wallet (name must match wallets.json, case-insensitive)
npm run snapshot -- --wallet "Treasury Wallet"

# Single chain
npm run snapshot -- --chain ethereum

# Combine filters
npm run snapshot -- --years 2024 --wallet "Safewallet" --chain arbitrum

# Skip cache and re-fetch everything
npm run snapshot -- --no-cache

# Custom output directory
npm run snapshot -- --output ./exports
```

---

## Output Files

All outputs are written to `data/output/` (or `--output` directory).

### `snapshot_detailed.csv`
One row per (year × wallet × chain × token):

| Column | Description |
|--------|-------------|
| `year` | Calendar year |
| `snapshot_date` | Always `YYYY-12-31` |
| `wallet_name` | Name from config |
| `wallet_address` | Ethereum address |
| `chain` | `ethereum` / `arbitrum` / `polygon` / `gnosis` |
| `token_symbol` | `ETH`, `USDC`, `USDT`, `EURe`, `xDAI` |
| `token_type` | `native` or `erc20` |
| `token_contract` | Contract address (empty for native tokens) |
| `balance` | Human-readable token balance |
| `usd_value` | USD value on snapshot date (empty if unavailable) |
| `source` | API adapter used (`goldrush`) |
| `fetched_at` | ISO timestamp of API call |

### `snapshot_wallet_totals.csv`
One row per (year × wallet), summing USD value across all chains and tokens.

### `snapshot_token_totals.csv`
One row per (year × token), summing balance and USD value across all wallets and chains.

### `snapshot_full.json`
Complete structured output with all three datasets in a single JSON file.

---

## Caching

Successful API responses are cached in `data/cache/` as individual JSON files, keyed by:
```
{year}_{walletAddress}_{chain}_{tokenSymbol}.json
```

If the same combination is requested again, the cached value is returned without an API call. Use `--no-cache` to force a fresh fetch.

---

## API Approach

### Primary endpoint
```
GET /v1/{chainName}/address/{walletAddress}/historical_balances/?date=YYYY-MM-DD
```
Returns token balances at a specific date. Used first for all queries.

### Fallback endpoint
```
GET /v1/{chainName}/address/{walletAddress}/portfolio_v2/?days=N
```
Returns daily OHLC-style portfolio data for the past N days. The `close` value for the Dec 31 entry (or the most recent prior day) is used when the primary endpoint returns no data.

### Native vs ERC-20 tokens

- **Native tokens** (ETH on Ethereum/Arbitrum, xDAI on Gnosis) have no contract address. They are identified in API responses by the `native_token: true` flag and matched by `ticker_symbol`.
- **ERC-20 tokens** (USDC, USDT, EURe) are identified by their contract address, which is stored in `config/tokenMap.json` per chain. Matching is case-insensitive.

If a token does not appear in the API response for a given wallet/chain/date (never held or zero balance), a `balance: 0` record is returned rather than failing.

### Rate limits

The GoldRush free tier allows ~5 requests per second. The client enforces a minimum delay between requests (configurable in `app.config.json` → `rateLimit.minDelayMs`). Transient failures (429, 5xx) are retried with exponential backoff.

---

## Swapping the API Adapter

The `BalanceAdapter` interface in `src/types/index.ts` defines a single method:

```typescript
interface BalanceAdapter {
  readonly name: string;
  fetchBalances(params: BalanceFetchParams): Promise<RawTokenBalance[]>;
}
```

To use a different data source, implement this interface and pass it to `runSnapshot()`. No other code needs to change.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOLDRUSH_API_KEY` | Yes | — | GoldRush API key |
| `OUTPUT_DIR` | No | `./data/output` | Output directory |
| `CACHE_DIR` | No | `./data/cache` | Cache directory |
| `LOG_LEVEL` | No | `info` | `debug` / `info` / `warn` / `error` |
