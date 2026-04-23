import fs from "fs";
import path from "path";
import { AppConfig, TokenMap, WalletConfig } from "../types";

const CONFIG_DIR = path.resolve(process.cwd(), "config");

function readJson<T>(filename: string): T {
  const filePath = path.join(CONFIG_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

export function loadWallets(): WalletConfig[] {
  return readJson<WalletConfig[]>("wallets.json");
}

export function loadAppConfig(): AppConfig {
  return readJson<AppConfig>("app.config.json");
}

export function loadTokenMap(): TokenMap {
  const raw = readJson<Record<string, unknown>>("tokenMap.json");
  // Strip the _comment key that's used only for documentation.
  const { _comment: _, ...rest } = raw;
  return rest as TokenMap;
}
