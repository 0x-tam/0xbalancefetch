import {
  AppConfig,
  BalanceAdapter,
  BalanceRecord,
  ChainName,
  CliOptions,
  TokenMap,
  TokenTotalsRecord,
  WalletConfig,
  WalletTotalsRecord,
} from "../types";
import { snapshotDateForYear } from "../utils/dates";
import { fetchBalancesForWallet } from "./balanceService";
import { logger } from "../utils/logger";

export interface SnapshotRunResult {
  records: BalanceRecord[];
  walletTotals: WalletTotalsRecord[];
  tokenTotals: TokenTotalsRecord[];
}

/**
 * Orchestrates the full snapshot run: iterates over all years × wallets × chains
 * and aggregates the results into detailed records plus summary totals.
 */
export async function runSnapshot(
  appConfig: AppConfig,
  wallets: WalletConfig[],
  tokenMap: TokenMap,
  adapter: BalanceAdapter,
  cliOptions: CliOptions,
): Promise<SnapshotRunResult> {
  const useCache = !(cliOptions.noCache ?? false);
  const years = cliOptions.years ?? appConfig.years;
  const chains = cliOptions.chain ? [cliOptions.chain] : appConfig.chains;
  const filteredWallets = cliOptions.wallet
    ? wallets.filter((w) => w.name.toLowerCase() === cliOptions.wallet!.toLowerCase())
    : wallets;

  if (filteredWallets.length === 0) {
    throw new Error(`No wallets matched filter: "${cliOptions.wallet}"`);
  }

  const allRecords: BalanceRecord[] = [];

  // Total combinations for progress reporting.
  const total = years.length * filteredWallets.length * chains.length;
  let done = 0;

  for (const year of years) {
    const date = snapshotDateForYear(year);

    for (const wallet of filteredWallets) {
      for (const chain of chains as ChainName[]) {
        done++;
        logger.info(`[${done}/${total}] ${wallet.name} | ${chain} | ${date}`);

        const records = await fetchBalancesForWallet({
          wallet,
          chain,
          date,
          year,
          adapter,
          tokenMap,
          useCache,
        });

        allRecords.push(...records);
      }
    }
  }

  return {
    records: allRecords,
    walletTotals: computeWalletTotals(allRecords),
    tokenTotals: computeTokenTotals(allRecords),
  };
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

function computeWalletTotals(records: BalanceRecord[]): WalletTotalsRecord[] {
  const map = new Map<string, WalletTotalsRecord>();

  for (const r of records) {
    const key = `${r.year}|${r.walletAddress}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        year: r.year,
        snapshotDate: r.snapshotDate,
        walletName: r.walletName,
        walletAddress: r.walletAddress,
        totalUsdValue: 0,
      };
      map.set(key, entry);
    }
    entry.totalUsdValue += r.usdValue ?? 0;
  }

  return Array.from(map.values()).sort((a, b) => a.year - b.year || a.walletName.localeCompare(b.walletName));
}

function computeTokenTotals(records: BalanceRecord[]): TokenTotalsRecord[] {
  const map = new Map<string, TokenTotalsRecord>();

  for (const r of records) {
    const key = `${r.year}|${r.tokenSymbol}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        year: r.year,
        snapshotDate: r.snapshotDate,
        tokenSymbol: r.tokenSymbol,
        totalBalance: 0,
        totalUsdValue: 0,
      };
      map.set(key, entry);
    }
    entry.totalBalance += r.balance;
    entry.totalUsdValue += r.usdValue ?? 0;
  }

  return Array.from(map.values()).sort(
    (a, b) => a.year - b.year || a.tokenSymbol.localeCompare(b.tokenSymbol),
  );
}
