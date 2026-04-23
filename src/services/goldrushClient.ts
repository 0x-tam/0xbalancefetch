import axios, { AxiosInstance, AxiosResponse } from "axios";
import { sleep, withRetry } from "../utils/retry";
import { logger } from "../utils/logger";
import { AppConfig, ChainName } from "../types";

/** Maps our canonical chain names to GoldRush API chain identifiers. */
const CHAIN_ID_MAP: Record<ChainName, string> = {
  ethereum: "eth-mainnet",
  arbitrum: "arbitrum-mainnet",
  polygon:  "matic-mainnet",
  gnosis:   "gnosis-mainnet",
};

export function toGoldRushChain(chain: ChainName): string {
  return CHAIN_ID_MAP[chain];
}

// ─── Response shapes from GoldRush API ─────────────────────────────────────

export interface GoldRushTokenHolding {
  timestamp: string;
  quote_rate: number | null;
  open: {
    balance: string;
    quote: number | null;
  };
  high: {
    balance: string;
    quote: number | null;
  };
  low: {
    balance: string;
    quote: number | null;
  };
  close: {
    balance: string;
    quote: number | null;
  };
}

export interface GoldRushTokenItem {
  contract_decimals: number;
  contract_name: string;
  contract_ticker_symbol: string;
  contract_address: string;
  native_token: boolean;
  type: string;
  holdings: GoldRushTokenHolding[];
}

export interface GoldRushPortfolioResponse {
  address: string;
  updated_at: string;
  quote_currency: string;
  chain_id: number;
  chain_name: string;
  items: GoldRushTokenItem[];
  pagination: null;
}

export interface GoldRushHistoricalBalanceItem {
  contract_decimals: number;
  contract_name: string;
  contract_ticker_symbol: string;
  contract_address: string;
  native_token: boolean;
  type: string;
  balance: string;
  quote: number | null;
  quote_rate: number | null;
}

export interface GoldRushHistoricalBalanceResponse {
  address: string;
  updated_at: string;
  quote_currency: string;
  chain_id: number;
  chain_name: string;
  items: GoldRushHistoricalBalanceItem[];
  pagination: null;
}

// ─── Client ─────────────────────────────────────────────────────────────────

export class GoldRushClient {
  private readonly http: AxiosInstance;
  private lastRequestAt = 0;

  constructor(
    private readonly apiKey: string,
    private readonly rateLimitConfig: AppConfig["rateLimit"],
  ) {
    this.http = axios.create({
      baseURL: "https://api.covalenthq.com/v1",
      auth: { username: apiKey, password: "" },
      timeout: 30_000,
    });
  }

  /** Enforces minimum delay between requests to stay within rate limits. */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < this.rateLimitConfig.minDelayMs) {
      await sleep(this.rateLimitConfig.minDelayMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }

  private async get<T>(url: string, params: Record<string, string | number> = {}): Promise<T> {
    await this.throttle();
    const response: AxiosResponse<{ data: T; error: boolean; error_message: string | null }> =
      await withRetry(
        `GET ${url}`,
        () => this.http.get(url, { params }),
        {
          maxRetries: this.rateLimitConfig.maxRetries,
          backoffBaseMs: this.rateLimitConfig.backoffBaseMs,
          isRetryable: (err) => {
            if (err && typeof err === "object" && "response" in err) {
              const status = (err as { response?: { status?: number } }).response?.status;
              return status === 429 || (typeof status === "number" && status >= 500);
            }
            return true;
          },
        },
      );

    if (response.data.error) {
      throw new Error(`GoldRush API error on ${url}: ${response.data.error_message ?? "unknown"}`);
    }

    return response.data.data;
  }

  /**
   * Fetches the historical portfolio for a wallet on a specific date using portfolio_v2.
   * The GoldRush portfolio_v2 endpoint returns OHLC-style daily balance data for a date range.
   * We request a window that includes the target date and pick the matching day's "close" value.
   *
   * Assumption: The API's `days` parameter controls how many days back from "today" are returned.
   * For historical Dec 31 dates, we compute the number of days since then and add a small buffer.
   */
  async getHistoricalPortfolio(
    chain: ChainName,
    walletAddress: string,
    date: string, // YYYY-MM-DD
  ): Promise<GoldRushPortfolioResponse> {
    const chainId = toGoldRushChain(chain);
    const targetDate = new Date(date + "T00:00:00Z");
    const now = new Date();
    const daysDiff = Math.ceil((now.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
    // Request enough days to cover the target date, with a small buffer of 3 days.
    const days = Math.min(daysDiff + 3, 3650);

    logger.debug(`Fetching portfolio_v2 for ${walletAddress} on ${chain} (date=${date}, days=${days})`);

    return this.get<GoldRushPortfolioResponse>(
      `/${chainId}/address/${walletAddress}/portfolio_v2/`,
      { days: days.toString(), "quote-currency": "USD" },
    );
  }

  /**
   * Fetches historical token balances for a wallet at a specific date.
   * The historical_balances endpoint supports a `date` parameter (YYYY-MM-DD).
   * If no activity existed on that exact date, the API returns the most recent prior snapshot.
   *
   * Assumption: If the wallet had zero activity before the snapshot date, the API may return
   * an empty response. We treat all missing tokens as balance = 0.
   */
  async getHistoricalBalances(
    chain: ChainName,
    walletAddress: string,
    date: string, // YYYY-MM-DD
  ): Promise<GoldRushHistoricalBalanceResponse> {
    const chainId = toGoldRushChain(chain);

    logger.debug(`Fetching historical_balances for ${walletAddress} on ${chain} (date=${date})`);

    return this.get<GoldRushHistoricalBalanceResponse>(
      `/${chainId}/address/${walletAddress}/historical_balances/`,
      { date, "quote-currency": "USD" },
    );
  }
}
