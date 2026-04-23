import fs from "fs";
import path from "path";
import { CacheEntry } from "../types";
import { logger } from "../utils/logger";

const DEFAULT_CACHE_DIR = path.resolve(process.cwd(), "data/cache");

function cacheDir(): string {
  return process.env.CACHE_DIR ?? DEFAULT_CACHE_DIR;
}

function ensureCacheDir(): void {
  const dir = cacheDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Cache key: year + wallet address (lowercased) + chain + token symbol. */
export function buildCacheKey(
  year: number,
  walletAddress: string,
  chain: string,
  tokenSymbol: string,
): string {
  return `${year}_${walletAddress.toLowerCase()}_${chain}_${tokenSymbol}`;
}

/** Derives the file path for a cache key. */
function cacheFilePath(key: string): string {
  return path.join(cacheDir(), `${key}.json`);
}

export function readCache<T>(key: string): T | null {
  const filePath = cacheFilePath(key);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const entry: CacheEntry<T> = JSON.parse(raw);
    logger.debug(`Cache hit: ${key}`);
    return entry.data;
  } catch {
    logger.warn(`Failed to parse cache file: ${filePath}. Treating as miss.`);
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  ensureCacheDir();
  const entry: CacheEntry<T> = { cachedAt: new Date().toISOString(), data };
  const filePath = cacheFilePath(key);
  try {
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf-8");
    logger.debug(`Cache written: ${key}`);
  } catch (err) {
    logger.warn(`Failed to write cache for key "${key}": ${String(err)}`);
  }
}

export function clearCache(key?: string): void {
  if (key) {
    const filePath = cacheFilePath(key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }
  const dir = cacheDir();
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const f of files) fs.unlinkSync(path.join(dir, f));
    logger.info(`Cache cleared: ${files.length} file(s) removed.`);
  }
}
