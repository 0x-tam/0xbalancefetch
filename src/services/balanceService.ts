import {
  BalanceAdapter,
  BalanceFetchParams,
  BalanceRecord,
  ChainName,
  RawTokenBalance,
  TokenMap,
  WalletConfig,
} from "../types";
import { buildCacheKey, readCache, writeCache } from "./cacheService";
import { logger } from "../utils/logger";

/**
 * Converts a raw bigint-style balance string to a human-readable float.
 * Division by 10^decimals converts from the token's smallest unit.
 */
export function toHumanBalance(rawBalance: string, decimals: number): number {
  if (!rawBalance || rawBalance === "0") return 0;
  try {
    const raw = BigInt(rawBalance);
    const divisor = BigInt(10 ** decimals);
    const whole = raw / divisor;
    const remainder = raw % divisor;
    return Number(whole) + Number(remainder) / 10 ** decimals;
  } catch {
    logger.warn(`Failed to parse raw balance "${rawBalance}" with decimals=${decimals}`);
    return 0;
  }
}

export interface FetchBalancesForWalletParams {
  wallet: WalletConfig;
  chain: ChainName;
  date: string; // YYYY-MM-DD
  year: number;
  adapter: BalanceAdapter;
  tokenMap: TokenMap;
  useCache: boolean;
}

/**
 * Fetches and normalizes all configured token balances for a single wallet/chain/date.
 *
 * Cache strategy: each (year, wallet, chain, token) is cached individually.
 * We check cache for every token first; only tokens not found in cache trigger an API call.
 * The adapter fetches all tokens for the wallet/chain in a single API request.
 */
export async function fetchBalancesForWallet(
  params: FetchBalancesForWalletParams,
): Promise<BalanceRecord[]> {
  const { wallet, chain, date, year, adapter, tokenMap, useCache } = params;
  const chainTokens = tokenMap[chain] ?? {};
  const tokenSymbols = Object.keys(chainTokens);

  if (tokenSymbols.length === 0) {
    logger.debug(`No tokens configured for chain ${chain}, skipping.`);
    return [];
  }

  // Check cache for each token individually.
  const cachedRecords: BalanceRecord[] = [];
  const missingSymbols: string[] = [];

  for (const symbol of tokenSymbols) {
    if (useCache) {
      const cacheKey = buildCacheKey(year, wallet.address, chain, symbol);
      const cached = readCache<BalanceRecord>(cacheKey);
      if (cached) {
        cachedRecords.push(cached);
        continue;
      }
    }
    missingSymbols.push(symbol);
  }

  // All tokens were served from cache — skip the API call entirely.
  if (missingSymbols.length === 0) {
    return cachedRecords;
  }

  logger.info(
    `Fetching ${wallet.name} | ${chain} | ${date} | tokens: ${missingSymbols.join(", ")}`,
  );

  const fetchParams: BalanceFetchParams = {
    walletAddress: wallet.address,
    chain,
    date,
  };

  let rawBalances: RawTokenBalance[];
  try {
    // The adapter fetches all tokens for this wallet/chain in one batch call.
    rawBalances = await adapter.fetchBalances(fetchParams);
  } catch (err) {
    logger.error(
      `Failed to fetch balances for ${wallet.name} on ${chain} (${date}): ${String(err)}`,
    );
    // Return zero records for all missing tokens rather than failing the entire run.
    rawBalances = missingSymbols.map((sym) => ({
      symbol: sym,
      isNative: chainTokens[sym].type === "native",
      contractAddress: chainTokens[sym].contractAddress ?? null,
      rawBalance: "0",
      decimals: chainTokens[sym].decimals,
      usdValue: null,
      quoteRate: null,
    }));
  }

  const fetchedAt = new Date().toISOString();
  const apiRecords: BalanceRecord[] = [];

  for (const raw of rawBalances) {
    // Only process tokens that were not served from cache.
    if (!missingSymbols.includes(raw.symbol)) continue;

    const tokenConfig = chainTokens[raw.symbol];
    if (!tokenConfig) continue;

    const balance = toHumanBalance(raw.rawBalance, raw.decimals);

    const record: BalanceRecord = {
      year,
      snapshotDate: date,
      walletName: wallet.name,
      walletAddress: wallet.address,
      chain,
      tokenSymbol: raw.symbol,
      tokenType: tokenConfig.type,
      tokenContract: raw.contractAddress,
      balance,
      usdValue: raw.usdValue,
      source: adapter.name,
      fetchedAt,
    };

    if (useCache) {
      writeCache(buildCacheKey(year, wallet.address, chain, raw.symbol), record);
    }

    apiRecords.push(record);
  }

  // Ensure every missing symbol has a record, even if not returned by the adapter.
  for (const sym of missingSymbols) {
    if (!apiRecords.some((r) => r.tokenSymbol === sym)) {
      const tokenConfig = chainTokens[sym];
      const record: BalanceRecord = {
        year,
        snapshotDate: date,
        walletName: wallet.name,
        walletAddress: wallet.address,
        chain,
        tokenSymbol: sym,
        tokenType: tokenConfig.type,
        tokenContract: tokenConfig.contractAddress ?? null,
        balance: 0,
        usdValue: null,
        source: adapter.name,
        fetchedAt,
      };
      apiRecords.push(record);
    }
  }

  return [...cachedRecords, ...apiRecords];
}
