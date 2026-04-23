import { GoldRushClient } from "./goldrushClient";
import { ChainName, TokenConfig } from "../types";
import { logger } from "../utils/logger";

interface PriceResult {
  contractAddress: string;
  date: string;
  priceUsd: number | null;
}

interface GoldRushPriceItem {
  contract_metadata: { contract_address: string };
  prices: Array<{ date: string; price: number | null }>;
}

/**
 * Fetches the historical USD price for a single token on a given date.
 * Used as a fallback when the balance response does not include a quote_rate.
 *
 * Assumption: For native tokens (ETH, xDAI), GoldRush uses a special address
 * like "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee". We pass the contract address
 * from config; for native tokens the caller should use the canonical native address.
 */
export async function fetchTokenPriceUsd(
  client: GoldRushClient,
  chain: ChainName,
  tokenConfig: TokenConfig,
  date: string,
): Promise<number | null> {
  // Only call pricing for ERC-20 tokens with a known contract address.
  // Native token prices are typically returned within the balance response itself.
  if (tokenConfig.type === "native" || !tokenConfig.contractAddress) {
    return null;
  }

  try {
    const resp = await (client as unknown as {
      get: (url: string, params: Record<string, string>) => Promise<GoldRushPriceItem[]>;
    }).get(
      `/pricing/historical_by_addresses_v2/eth-mainnet/USD/${tokenConfig.contractAddress}/`,
      { from: date, to: date },
    );

    if (!Array.isArray(resp) || resp.length === 0) return null;

    const item = resp[0];
    if (!item.prices || item.prices.length === 0) return null;

    return item.prices[0].price ?? null;
  } catch (err) {
    logger.warn(
      `Failed to fetch price for ${tokenConfig.symbol} on ${date}: ${String(err)}`,
    );
    return null;
  }
}

export type { PriceResult };
