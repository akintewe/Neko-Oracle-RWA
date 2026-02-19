/**
 * Options for StorageModule / StorageService configuration.
 * All fields are optional; defaults are safe for a local Redis instance.
 */
export interface StorageModuleOptions {
  /** Redis connection URL. If absent, StorageService runs in no-op mode. */
  redisUrl?: string;

  /** TTL in seconds for price:latest keys. Default: 300 (5 minutes). */
  priceTtlSeconds?: number;

  /**
   * Maximum number of history entries kept per symbol in the Sorted Set.
   * Older entries are removed by ZREMRANGEBYRANK after each write.
   * Default: 100.
   */
  historyMaxEntries?: number;

  /**
   * Prefix for all Redis keys. Default: "price".
   * Useful for namespace isolation in shared Redis instances.
   * Keys will be: {prefix}:latest:{SYMBOL}, {prefix}:history:{SYMBOL}, {prefix}:symbols
   */
  keyPrefix?: string;
}

/** Resolved, fully-defaulted options used internally by StorageService. */
export interface ResolvedStorageOptions {
  redisUrl: string;
  priceTtlSeconds: number;
  historyMaxEntries: number;
  keyPrefix: string;
}
