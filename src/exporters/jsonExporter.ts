import fs from "fs";
import path from "path";
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

function writeJson(filename: string, data: unknown): string {
  ensureOutputDir();
  const filePath = path.join(outputDir(), filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  logger.info(`Exported: ${filePath}`);
  return filePath;
}

export interface SnapshotJsonOutput {
  generatedAt: string;
  records: BalanceRecord[];
  walletTotals: WalletTotalsRecord[];
  tokenTotals: TokenTotalsRecord[];
}

export function exportJson(
  records: BalanceRecord[],
  walletTotals: WalletTotalsRecord[],
  tokenTotals: TokenTotalsRecord[],
  filename = "snapshot_full.json",
): string {
  const output: SnapshotJsonOutput = {
    generatedAt: new Date().toISOString(),
    records,
    walletTotals,
    tokenTotals,
  };
  return writeJson(filename, output);
}
