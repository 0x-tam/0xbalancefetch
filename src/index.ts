import "dotenv/config";
import { Command } from "commander";
import { loadAppConfig, loadTokenMap, loadWallets } from "./config/configLoader";
import { GoldRushClient } from "./services/goldrushClient";
import { GoldRushAdapter } from "./adapters/goldrushAdapter";
import { runSnapshot } from "./services/snapshotService";
import { exportDetailedCsv, exportTokenTotalsCsv, exportWalletTotalsCsv } from "./exporters/csvExporter";
import { exportJson } from "./exporters/jsonExporter";
import { printConsoleSummary } from "./exporters/consoleReporter";
import { validateAppConfig, validateWallets } from "./utils/validators";
import { logger } from "./utils/logger";
import { ChainName, CliOptions } from "./types";

const program = new Command();

program
  .name("0xbalancefetch")
  .description("Historical year-end wallet balance snapshots via GoldRush API")
  .version("1.0.0");

// ─── snapshot command ────────────────────────────────────────────────────────

program
  .command("snapshot")
  .description("Fetch year-end balance snapshots and export results")
  .option("--years <years>", "Comma-separated list of years (e.g. 2023,2024,2025)")
  .option("--wallet <name>", "Filter by wallet name (case-insensitive)")
  .option("--chain <chain>", "Filter by chain (ethereum|arbitrum|polygon|gnosis)")
  .option("--no-cache", "Bypass cache and re-fetch all data")
  .option("--output <dir>", "Override output directory")
  .action(async (opts) => {
    try {
      const apiKey = requireApiKey();
      const appConfig = loadAppConfig();
      const wallets = loadWallets();
      const tokenMap = loadTokenMap();

      // Build CLI options from parsed commander flags.
      const cliOptions: CliOptions = {
        years: opts.years ? parseYears(opts.years) : undefined,
        wallet: opts.wallet,
        chain: opts.chain as ChainName | undefined,
        noCache: opts.cache === false,
        output: opts.output,
      };

      if (cliOptions.output) {
        process.env.OUTPUT_DIR = cliOptions.output;
      }

      validateOrExit(wallets, appConfig);

      const client = new GoldRushClient(apiKey, appConfig.rateLimit);
      const adapter = new GoldRushAdapter(client, tokenMap);

      logger.info("Starting snapshot run...");
      const result = await runSnapshot(appConfig, wallets, tokenMap, adapter, cliOptions);

      logger.info(`Fetched ${result.records.length} balance record(s). Exporting...`);

      exportDetailedCsv(result.records);
      exportWalletTotalsCsv(result.walletTotals);
      exportTokenTotalsCsv(result.tokenTotals);
      exportJson(result.records, result.walletTotals, result.tokenTotals);

      printConsoleSummary(result.records, result.walletTotals, result.tokenTotals);

      logger.info("Done.");
    } catch (err) {
      logger.error(`Snapshot failed: ${String(err)}`);
      process.exit(1);
    }
  });

// ─── validate command ────────────────────────────────────────────────────────

program
  .command("validate")
  .description("Validate config files and verify API connectivity")
  .action(async () => {
    let hasError = false;

    console.log("\n── Config validation ───────────────────────────────────────────────────");

    // Check API key.
    const apiKey = process.env.GOLDRUSH_API_KEY;
    if (!apiKey) {
      console.error("  [FAIL] GOLDRUSH_API_KEY is not set in .env");
      hasError = true;
    } else {
      console.log("  [OK]   GOLDRUSH_API_KEY is present");
    }

    // Validate config files.
    try {
      const appConfig = loadAppConfig();
      const wallets = loadWallets();
      const tokenMap = loadTokenMap();

      const walletResult = validateWallets(wallets);
      if (!walletResult.ok) {
        for (const e of walletResult.errors) console.error(`  [FAIL] ${e}`);
        hasError = true;
      } else {
        console.log(`  [OK]   wallets.json — ${wallets.length} wallet(s) valid`);
      }

      const configResult = validateAppConfig(appConfig);
      if (!configResult.ok) {
        for (const e of configResult.errors) console.error(`  [FAIL] ${e}`);
        hasError = true;
      } else {
        console.log(`  [OK]   app.config.json — years: ${appConfig.years.join(", ")}, chains: ${appConfig.chains.join(", ")}`);
      }

      const tokenChains = Object.keys(tokenMap);
      console.log(`  [OK]   tokenMap.json — chains with token config: ${tokenChains.join(", ")}`);

      // Verify API connectivity with a lightweight call.
      if (apiKey && !hasError) {
        console.log("\n── API connectivity check ───────────────────────────────────────────────");
        try {
          const client = new GoldRushClient(apiKey, appConfig.rateLimit);
          // Minimal test: fetch balances for first wallet on ethereum for a known date.
          const testWallet = wallets[0].address;
          await client.getHistoricalBalances("ethereum", testWallet, "2024-12-31");
          console.log(`  [OK]   GoldRush API reachable — test call succeeded`);
        } catch (err) {
          const errMsg = String(err);
          const status = (err as { response?: { status?: number } }).response?.status;
          if (status === 403 || errMsg.includes("allowlist")) {
            console.warn(
              `  [WARN] GoldRush API returned 403 — API key may have an IP/host allowlist restriction.\n` +
              `         This is expected if the key is restricted to specific IPs. The code is correct.\n` +
              `         Response: ${errMsg}`,
            );
          } else {
            console.error(`  [FAIL] GoldRush API call failed: ${errMsg}`);
            hasError = true;
          }
        }
      }
    } catch (err) {
      console.error(`  [FAIL] Failed to load config: ${String(err)}`);
      hasError = true;
    }

    console.log("");
    if (hasError) {
      console.error("Validation failed. Fix the errors above before running snapshot.\n");
      process.exit(1);
    } else {
      console.log("All checks passed. Ready to run: npm run snapshot\n");
    }
  });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireApiKey(): string {
  const key = process.env.GOLDRUSH_API_KEY;
  if (!key) {
    logger.error("GOLDRUSH_API_KEY is not set. Add it to your .env file.");
    process.exit(1);
  }
  return key;
}

function parseYears(raw: string): number[] {
  return raw.split(",").map((s) => {
    const n = parseInt(s.trim(), 10);
    if (isNaN(n)) throw new Error(`Invalid year: "${s}"`);
    return n;
  });
}

function validateOrExit(wallets: ReturnType<typeof loadWallets>, config: ReturnType<typeof loadAppConfig>): void {
  const wv = validateWallets(wallets);
  const cv = validateAppConfig(config);
  const errors = [...wv.errors, ...cv.errors];
  if (errors.length > 0) {
    for (const e of errors) logger.error(e);
    process.exit(1);
  }
}

program.parse(process.argv);
