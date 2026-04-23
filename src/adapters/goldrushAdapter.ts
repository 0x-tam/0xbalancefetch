import {
  BalanceAdapter,
  BalanceFetchParams,
  ChainName,
  RawTokenBalance,
  TokenConfig,
  TokenMap,
} from "../types";
import {
  GoldRushClient,
  GoldRushHistoricalBalanceItem,
  GoldRushTokenHolding,
  GoldRushTokenItem,
} from "../services/goldrushClient";
import { logger } from "../utils/logger";

/**
 * GoldRush adapter — implements BalanceAdapter using the GoldRush (Covalent) API.
 *
 * Strategy:
 *  1. Try the historical_balances endpoint first (direct date-based snapshot).
 *  2. If that returns no items or fails, fall back to portfolio_v2 and pick the Dec 31 close.
 *
 * Only tokens present in tokenMap for the given chain are returned.
 * Tokens not found in the response are returned with balance "0".
 */
export class GoldRushAdapter implements BalanceAdapter {
  readonly name = "goldrush";

  constructor(
    private readonly client: GoldRushClient,
    private readonly tokenMap: TokenMap,
  ) {}

  async fetchBalances(params: BalanceFetchParams): Promise<RawTokenBalance[]> {
    const { walletAddress, chain, date } = params;
    const chainTokens = this.tokenMap[chain];

    if (!chainTokens || Object.keys(chainTokens).length === 0) {
      logger.debug(`No tokens configured for chain ${chain}, skipping.`);
      return [];
    }

    // Try historical_balances first — it's more precise for snapshot queries.
    let results = await this.tryHistoricalBalances(walletAddress, chain, date, chainTokens);

    // Fall back to portfolio_v2 if historical_balances returned nothing useful.
    if (results === null) {
      logger.debug(`Falling back to portfolio_v2 for ${walletAddress} on ${chain} (${date})`);
      results = await this.tryPortfolioV2(walletAddress, chain, date, chainTokens);
    }

    return results;
  }

  // ─── Primary: historical_balances ─────────────────────────────────────────

  private async tryHistoricalBalances(
    walletAddress: string,
    chain: ChainName,
    date: string,
    chainTokens: Record<string, TokenConfig>,
  ): Promise<RawTokenBalance[] | null> {
    try {
      const resp = await this.client.getHistoricalBalances(chain, walletAddress, date);

      if (!resp.items || resp.items.length === 0) {
        logger.debug(`historical_balances returned 0 items for ${walletAddress} on ${chain} (${date})`);
        return null;
      }

      return this.extractFromHistoricalBalances(resp.items, chainTokens);
    } catch (err) {
      logger.warn(
        `historical_balances failed for ${walletAddress} on ${chain} (${date}): ${String(err)}`,
      );
      return null;
    }
  }

  private extractFromHistoricalBalances(
    items: GoldRushHistoricalBalanceItem[],
    chainTokens: Record<string, TokenConfig>,
  ): RawTokenBalance[] {
    const results: RawTokenBalance[] = [];

    for (const [symbol, tokenConfig] of Object.entries(chainTokens)) {
      const item = this.matchToken(items, tokenConfig);

      if (!item) {
        // Token not present in wallet on this date — report zero balance.
        results.push(zeroBalance(tokenConfig));
        continue;
      }

      results.push({
        symbol,
        isNative: tokenConfig.type === "native",
        contractAddress: tokenConfig.contractAddress ?? null,
        rawBalance: item.balance ?? "0",
        decimals: item.contract_decimals ?? tokenConfig.decimals,
        usdValue: item.quote ?? null,
        quoteRate: item.quote_rate ?? null,
      });
    }

    return results;
  }

  // ─── Fallback: portfolio_v2 ────────────────────────────────────────────────

  private async tryPortfolioV2(
    walletAddress: string,
    chain: ChainName,
    date: string,
    chainTokens: Record<string, TokenConfig>,
  ): Promise<RawTokenBalance[]> {
    try {
      const resp = await this.client.getHistoricalPortfolio(chain, walletAddress, date);

      if (!resp.items || resp.items.length === 0) {
        logger.debug(`portfolio_v2 returned 0 items for ${walletAddress} on ${chain} (${date})`);
        return this.allZeroBalances(chainTokens);
      }

      return this.extractFromPortfolioV2(resp.items, chainTokens, date);
    } catch (err) {
      logger.warn(
        `portfolio_v2 also failed for ${walletAddress} on ${chain} (${date}): ${String(err)}. Returning zeros.`,
      );
      return this.allZeroBalances(chainTokens);
    }
  }

  /**
   * From portfolio_v2 response, pick the holding entry whose timestamp matches the snapshot date.
   * portfolio_v2 returns OHLC-style daily holdings; we use the "close" balance for that day.
   * If no exact match, use the closest earlier date (most recent snapshot before the target date).
   */
  private extractFromPortfolioV2(
    items: GoldRushTokenItem[],
    chainTokens: Record<string, TokenConfig>,
    targetDate: string,
  ): RawTokenBalance[] {
    const results: RawTokenBalance[] = [];

    for (const [symbol, tokenConfig] of Object.entries(chainTokens)) {
      const item = items.find((i) => this.matchesTokenConfig(i, tokenConfig));

      if (!item || !item.holdings || item.holdings.length === 0) {
        results.push(zeroBalance(tokenConfig));
        continue;
      }

      const holding = this.pickHolding(item.holdings, targetDate);

      if (!holding) {
        results.push(zeroBalance(tokenConfig));
        continue;
      }

      results.push({
        symbol,
        isNative: tokenConfig.type === "native",
        contractAddress: tokenConfig.contractAddress ?? null,
        // portfolio_v2 uses the "close" value for end-of-day balance.
        rawBalance: holding.close.balance ?? "0",
        decimals: item.contract_decimals ?? tokenConfig.decimals,
        usdValue: holding.close.quote ?? null,
        quoteRate: holding.quote_rate ?? null,
      });
    }

    return results;
  }

  /**
   * Finds the holding entry for the target date, or the closest prior date if no exact match.
   * Assumption: if the wallet had no activity on Dec 31 (e.g. weekend), the most recent
   * prior snapshot reflects the actual balance as of that date.
   */
  private pickHolding(
    holdings: GoldRushTokenHolding[],
    targetDate: string,
  ): GoldRushTokenHolding | null {
    const target = new Date(targetDate + "T00:00:00Z").getTime();

    // Sort descending by timestamp so the first match is the closest prior or equal date.
    const sorted = [...holdings].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    for (const h of sorted) {
      const ts = new Date(h.timestamp).getTime();
      if (ts <= target) return h;
    }

    return null;
  }

  // ─── Token matching helpers ──────────────────────────────────────────────

  /**
   * Matches a token config against historical_balances items.
   * Native tokens are matched by ticker symbol; ERC-20s by contract address.
   */
  private matchToken(
    items: GoldRushHistoricalBalanceItem[],
    config: TokenConfig,
  ): GoldRushHistoricalBalanceItem | undefined {
    if (config.type === "native") {
      // Native tokens: match by the native_token flag and symbol.
      return items.find(
        (i) =>
          i.native_token &&
          i.contract_ticker_symbol.toLowerCase() === config.symbol.toLowerCase(),
      );
    }
    // ERC-20: match by contract address (case-insensitive).
    return items.find(
      (i) =>
        !i.native_token &&
        i.contract_address?.toLowerCase() === config.contractAddress?.toLowerCase(),
    );
  }

  private matchesTokenConfig(item: GoldRushTokenItem, config: TokenConfig): boolean {
    if (config.type === "native") {
      return (
        item.native_token &&
        item.contract_ticker_symbol.toLowerCase() === config.symbol.toLowerCase()
      );
    }
    return (
      !item.native_token &&
      item.contract_address?.toLowerCase() === config.contractAddress?.toLowerCase()
    );
  }

  private allZeroBalances(chainTokens: Record<string, TokenConfig>): RawTokenBalance[] {
    return Object.values(chainTokens).map(zeroBalance);
  }
}

function zeroBalance(config: TokenConfig): RawTokenBalance {
  return {
    symbol: config.symbol,
    isNative: config.type === "native",
    contractAddress: config.contractAddress ?? null,
    rawBalance: "0",
    decimals: config.decimals,
    usdValue: null,
    quoteRate: null,
  };
}
