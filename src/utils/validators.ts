import { AppConfig, ChainName, WalletConfig } from "../types";
import { isValidYear } from "./dates";

const VALID_CHAINS: ChainName[] = ["ethereum", "arbitrum", "polygon", "gnosis"];
const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateWallets(wallets: WalletConfig[]): ValidationResult {
  const errors: string[] = [];
  if (!wallets || wallets.length === 0) {
    errors.push("No wallets configured.");
  }
  for (const w of wallets) {
    if (!w.name || w.name.trim() === "") {
      errors.push(`Wallet is missing a name: ${JSON.stringify(w)}`);
    }
    if (!ETH_ADDRESS_RE.test(w.address)) {
      errors.push(`Invalid address for wallet "${w.name}": ${w.address}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateAppConfig(config: AppConfig): ValidationResult {
  const errors: string[] = [];

  if (!config.years || config.years.length === 0) {
    errors.push("No years configured.");
  }
  for (const y of config.years ?? []) {
    if (!isValidYear(y)) {
      errors.push(`Invalid year: ${y}. Must be an integer between 2015 and the current year.`);
    }
  }

  if (!config.chains || config.chains.length === 0) {
    errors.push("No chains configured.");
  }
  for (const c of config.chains ?? []) {
    if (!VALID_CHAINS.includes(c)) {
      errors.push(`Unknown chain: "${c}". Supported: ${VALID_CHAINS.join(", ")}`);
    }
  }

  if (!config.tokens || config.tokens.length === 0) {
    errors.push("No tokens configured.");
  }

  return { ok: errors.length === 0, errors };
}
