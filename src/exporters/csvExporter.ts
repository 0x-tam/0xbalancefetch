import fs from "fs";
import path from "path";
import { stringify } from "csv-stringify/sync";
import { BalanceRecord, TokenTotalsRecord, WalletTotalsRecord } from "../types";
import { logger } from "../utils/logger";

const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "data/output");

function outputDir(): string {
  return process.env.OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
}

function ensureOutputDir(): void {
  const dir = outputDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeFile(filename: string, content: string): string {
  ensureOutputDir();
  const filePath = path.join(outputDir(), filename);
  fs.writeFileSync(filePath, content, "utf-8");
  logger.info(`Exported: ${filePath}`);
  return filePath;
}

/** Main detailed CSV with one row per (year, wallet, chain, token). */
export function exportDetailedCsv(records: BalanceRecord[], filename = "snapshot_detailed.csv"): string {
  const rows = records.map((r) => ({
    year: r.year,
    snapshot_date: r.snapshotDate,
    wallet_name: r.walletName,
    wallet_address: r.walletAddress,
    chain: r.chain,
    token_symbol: r.tokenSymbol,
    token_type: r.tokenType,
    token_contract: r.tokenContract ?? "",
    balance: r.balance,
    usd_value: r.usdValue ?? "",
    source: r.source,
    fetched_at: r.fetchedAt,
  }));

  const csv = stringify(rows, { header: true });
  return writeFile(filename, csv);
}

/** Wallet totals CSV: one row per (year, wallet). */
export function exportWalletTotalsCsv(
  totals: WalletTotalsRecord[],
  filename = "snapshot_wallet_totals.csv",
): string {
  const rows = totals.map((t) => ({
    year: t.year,
    snapshot_date: t.snapshotDate,
    wallet_name: t.walletName,
    wallet_address: t.walletAddress,
    total_usd_value: t.totalUsdValue.toFixed(2),
  }));

  const csv = stringify(rows, { header: true });
  return writeFile(filename, csv);
}

/** Token totals CSV: one row per (year, token) across all wallets and chains. */
export function exportTokenTotalsCsv(
  totals: TokenTotalsRecord[],
  filename = "snapshot_token_totals.csv",
): string {
  const rows = totals.map((t) => ({
    year: t.year,
    snapshot_date: t.snapshotDate,
    token_symbol: t.tokenSymbol,
    total_balance: t.totalBalance,
    total_usd_value: t.totalUsdValue.toFixed(2),
  }));

  const csv = stringify(rows, { header: true });
  return writeFile(filename, csv);
}
