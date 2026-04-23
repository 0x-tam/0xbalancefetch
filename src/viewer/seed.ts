/**
 * Generates realistic sample snapshot output for the viewer preview.
 * Run with: npm run seed
 */
import fs from "fs";
import path from "path";
import { BalanceRecord, TokenTotalsRecord, WalletTotalsRecord } from "../types";

const OUTPUT_DIR = path.resolve(process.cwd(), "data/output");

const wallets = [
  { name: "Safewallet",       address: "0x5322bff39339eda261bf878fa7d92791cc969bb0" },
  { name: "SafeWallet 2",     address: "0x2A581895e181A62C12b3150235D88DE73B8D9FF5" },
  { name: "Monerium",         address: "0x76a90d3b5050e5a139987f74c72e63c17f5b36e6" },
  { name: "Monerium 2",       address: "0x9258d94c334cb1974e16ba02310fd83d47582ab5" },
  { name: "Treasury Wallet",  address: "0x2c349022df145c1a2ed895b5577905e6f1bc7881" },
  { name: "Multisig Wallet",  address: "0x0d0a6e5ff546d06b43279188dd8112bac6ad424d" },
];

// Approximate ETH/USD prices at Dec 31 of each year
const ETH_PRICE: Record<number, number> = { 2023: 2281, 2024: 3329, 2025: 3412 };
const XDAI_PRICE = 1.0;
const USDC_PRICE = 1.0;
const USDT_PRICE = 1.0;
// EURe ≈ EUR/USD rate at year-end
const EURE_PRICE: Record<number, number> = { 2023: 1.105, 2024: 1.038, 2025: 1.072 };

// Seed balances per wallet × chain × token (only non-zero entries defined here)
type SeedEntry = { balance: number; chain: string; token: string };
const SEEDS: Record<string, SeedEntry[]> = {
  "Safewallet": [
    { chain: "ethereum", token: "ETH",  balance: 4.812 },
    { chain: "ethereum", token: "USDC", balance: 14250 },
    { chain: "arbitrum", token: "ETH",  balance: 1.2 },
    { chain: "arbitrum", token: "USDC", balance: 5000 },
    { chain: "gnosis",   token: "EURe", balance: 8200 },
  ],
  "SafeWallet 2": [
    { chain: "ethereum", token: "ETH",  balance: 2.5 },
    { chain: "ethereum", token: "USDT", balance: 30000 },
    { chain: "polygon",  token: "USDC", balance: 12500 },
    { chain: "gnosis",   token: "xDAI", balance: 3100 },
  ],
  "Monerium": [
    { chain: "ethereum", token: "EURe", balance: 50000 },
    { chain: "gnosis",   token: "EURe", balance: 25000 },
    { chain: "polygon",  token: "EURe", balance: 10000 },
  ],
  "Monerium 2": [
    { chain: "ethereum", token: "EURe", balance: 22000 },
    { chain: "gnosis",   token: "EURe", balance: 18500 },
  ],
  "Treasury Wallet": [
    { chain: "ethereum", token: "ETH",  balance: 12.75 },
    { chain: "ethereum", token: "USDC", balance: 95000 },
    { chain: "ethereum", token: "USDT", balance: 48000 },
    { chain: "arbitrum", token: "ETH",  balance: 3.4 },
    { chain: "arbitrum", token: "USDC", balance: 22000 },
    { chain: "gnosis",   token: "xDAI", balance: 8800 },
    { chain: "gnosis",   token: "EURe", balance: 30000 },
  ],
  "Multisig Wallet": [
    { chain: "ethereum", token: "ETH",  balance: 6.0 },
    { chain: "ethereum", token: "USDC", balance: 40000 },
    { chain: "polygon",  token: "USDC", balance: 8000 },
    { chain: "gnosis",   token: "xDAI", balance: 2500 },
    { chain: "gnosis",   token: "EURe", balance: 12000 },
  ],
};

const ALL_CHAINS = ["ethereum", "arbitrum", "polygon", "gnosis"] as const;
const TOKEN_CONTRACT: Record<string, Record<string, string | null>> = {
  ethereum: { ETH: null,  USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", USDT: "0xdac17f958d2ee523a2206206994597c13d831ec7", EURe: "0x3231cb76718cdef2155fc47b5286d82e6eda273f", xDAI: null },
  arbitrum: { ETH: null,  USDC: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", USDT: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", EURe: "0xcb7f1ef7246d1497b985f7fc45a1a31f04346133", xDAI: null },
  polygon:  { ETH: null,  USDC: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", USDT: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", EURe: "0x18ec0a6e18e5bc3784fdd3a3634b31245ab704f6", xDAI: null },
  gnosis:   { xDAI: null, USDC: "0xddafbb505ad214d7b80b1f830fccc89b60fb7a83", USDT: "0x4ecaba5870353805a9f068101a40e0f32ed605c6", EURe: "0xcb444e90d8198701b7c2cb4e4e32cba0a7e428b2", ETH: null },
};
const NATIVE: Record<string, Record<string, boolean>> = {
  ethereum: { ETH: true },
  arbitrum: { ETH: true },
  gnosis:   { xDAI: true },
  polygon:  {},
};

function usdPrice(token: string, year: number): number {
  if (token === "ETH")  return ETH_PRICE[year] ?? 2500;
  if (token === "USDC") return USDC_PRICE;
  if (token === "USDT") return USDT_PRICE;
  if (token === "xDAI") return XDAI_PRICE;
  if (token === "EURe") return EURE_PRICE[year] ?? 1.05;
  return 0;
}

// Apply mild year-over-year variation so numbers aren't identical across years
function yearVariance(walletName: string, token: string, year: number): number {
  const base = (walletName.charCodeAt(0) + token.charCodeAt(0)) % 20;
  const shift = (year - 2023) * 0.08;
  return 1 + (base / 100) + shift;
}

const records: BalanceRecord[] = [];
const YEARS = [2023, 2024, 2025];

for (const year of YEARS) {
  const snapshotDate = `${year}-12-31`;
  const fetchedAt = `${year}-12-31T23:59:59.000Z`;

  for (const wallet of wallets) {
    const seeds = SEEDS[wallet.name] ?? [];

    for (const chain of ALL_CHAINS) {
      const chainTokens = chain === "gnosis"
        ? ["xDAI", "USDC", "USDT", "EURe"]
        : chain === "polygon"
        ? ["USDC", "USDT", "EURe"]
        : ["ETH", "USDC", "USDT", "EURe"];

      for (const token of chainTokens) {
        const seed = seeds.find((s) => s.chain === chain && s.token === token);
        const rawBalance = seed
          ? seed.balance * yearVariance(wallet.name, token, year)
          : 0;
        const balance = Math.round(rawBalance * 1e6) / 1e6;
        const price   = usdPrice(token, year);
        const usdValue = balance > 0 ? Math.round(balance * price * 100) / 100 : 0;
        const isNative = !!(NATIVE[chain]?.[token]);

        records.push({
          year,
          snapshotDate,
          walletName:    wallet.name,
          walletAddress: wallet.address,
          chain:         chain as BalanceRecord["chain"],
          tokenSymbol:   token,
          tokenType:     isNative ? "native" : "erc20",
          tokenContract: TOKEN_CONTRACT[chain]?.[token] ?? null,
          balance,
          usdValue: balance > 0 ? usdValue : null,
          source:    "goldrush (sample)",
          fetchedAt,
        });
      }
    }
  }
}

// Wallet totals
const walletTotalsMap = new Map<string, WalletTotalsRecord>();
for (const r of records) {
  const key = `${r.year}|${r.walletAddress}`;
  if (!walletTotalsMap.has(key)) {
    walletTotalsMap.set(key, {
      year: r.year, snapshotDate: r.snapshotDate,
      walletName: r.walletName, walletAddress: r.walletAddress, totalUsdValue: 0,
    });
  }
  walletTotalsMap.get(key)!.totalUsdValue += r.usdValue ?? 0;
}
const walletTotals: WalletTotalsRecord[] = Array.from(walletTotalsMap.values())
  .sort((a, b) => a.year - b.year || a.walletName.localeCompare(b.walletName));

// Token totals
const tokenTotalsMap = new Map<string, TokenTotalsRecord>();
for (const r of records) {
  const key = `${r.year}|${r.tokenSymbol}`;
  if (!tokenTotalsMap.has(key)) {
    tokenTotalsMap.set(key, {
      year: r.year, snapshotDate: r.snapshotDate,
      tokenSymbol: r.tokenSymbol, totalBalance: 0, totalUsdValue: 0,
    });
  }
  tokenTotalsMap.get(key)!.totalBalance  += r.balance;
  tokenTotalsMap.get(key)!.totalUsdValue += r.usdValue ?? 0;
}
const tokenTotals: TokenTotalsRecord[] = Array.from(tokenTotalsMap.values())
  .sort((a, b) => a.year - b.year || a.tokenSymbol.localeCompare(b.tokenSymbol));

// Write output
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const output = { generatedAt: new Date().toISOString(), records, walletTotals, tokenTotals };
fs.writeFileSync(path.join(OUTPUT_DIR, "snapshot_full.json"), JSON.stringify(output, null, 2));
console.log(`Seed complete — ${records.length} records written to data/output/snapshot_full.json`);
