// ─── Chain & Token config types ────────────────────────────────────────────

export type ChainName = "ethereum" | "arbitrum" | "polygon" | "gnosis";

export type TokenType = "native" | "erc20";

export interface TokenConfig {
  symbol: string;
  type: TokenType;
  /** Undefined for native tokens — they are identified by ticker_symbol in the API response. */
  contractAddress?: string;
  decimals: number;
}

/** Per-chain token map: symbol → config */
export type ChainTokenMap = Record<string, TokenConfig>;

/** Full token map: chainName → symbol → config */
export type TokenMap = Record<ChainName, ChainTokenMap>;

// ─── App config types ───────────────────────────────────────────────────────

export interface WalletConfig {
  name: string;
  address: string;
}

export interface AppConfig {
  years: number[];
  chains: ChainName[];
  tokens: string[];
  rateLimit: {
    /** Minimum ms between API requests. */
    minDelayMs: number;
    /** Max retry attempts on transient failures. */
    maxRetries: number;
    /** Base backoff ms (doubles each retry). */
    backoffBaseMs: number;
  };
}

// ─── Snapshot result types ──────────────────────────────────────────────────

export interface BalanceRecord {
  year: number;
  snapshotDate: string; // YYYY-MM-DD
  walletName: string;
  walletAddress: string;
  chain: ChainName;
  tokenSymbol: string;
  tokenType: TokenType;
  /** null for native tokens */
  tokenContract: string | null;
  /** Human-readable balance (already divided by decimals). */
  balance: number;
  /** USD value on the snapshot date. null if unavailable. */
  usdValue: number | null;
  source: string;
  fetchedAt: string; // ISO timestamp
}

export interface WalletTotalsRecord {
  year: number;
  snapshotDate: string;
  walletName: string;
  walletAddress: string;
  totalUsdValue: number;
}

export interface TokenTotalsRecord {
  year: number;
  snapshotDate: string;
  tokenSymbol: string;
  totalBalance: number;
  totalUsdValue: number;
}

// ─── Adapter interface ──────────────────────────────────────────────────────

export interface RawTokenBalance {
  symbol: string;
  isNative: boolean;
  contractAddress: string | null;
  rawBalance: string; // bigint-as-string from API
  decimals: number;
  usdValue: number | null;
  quoteRate: number | null;
}

export interface BalanceFetchParams {
  walletAddress: string;
  chain: ChainName;
  date: string; // YYYY-MM-DD
}

/** Swappable adapter interface — implement this to support a different data source. */
export interface BalanceAdapter {
  readonly name: string;
  fetchBalances(params: BalanceFetchParams): Promise<RawTokenBalance[]>;
}

// ─── Cache types ────────────────────────────────────────────────────────────

export interface CacheEntry<T> {
  cachedAt: string;
  data: T;
}

// ─── CLI options ────────────────────────────────────────────────────────────

export interface CliOptions {
  years?: number[];
  wallet?: string;
  chain?: ChainName;
  noCache?: boolean;
  output?: string;
}
