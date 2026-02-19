import {
  Injectable,
  Logger,
  Optional,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AggregatedPrice } from '../interfaces/aggregated-price.interface';
import { MetricsService } from '../metrics/metrics.service';
import { ResolvedStorageOptions } from '../interfaces/storage-options.interface';

/**
 * StorageService
 *
 * Persists aggregated prices to Redis using three data structures:
 *
 *   STRING  {prefix}:latest:{SYMBOL}   Latest AggregatedPrice (JSON), with TTL
 *   ZSET    {prefix}:history:{SYMBOL}  Time-series (score = computedAt ms), bounded length
 *   SET     {prefix}:symbols           Index of all tracked symbols
 *
 * When REDIS_URL is not set the service operates in no-op mode:
 * all public methods return safe empty values without throwing.
 *
 * Auto-reconnection is handled by ioredis retryStrategy with
 * exponential back-off (up to 3 s, max 20 attempts).
 *
 * maxRetriesPerRequest is set to null so commands issued while
 * Redis is temporarily unreachable are queued internally instead of
 * failing immediately — fulfilling requirement #6 (auto-reconnection).
 */
@Injectable()
export class StorageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  private client: Redis | null = null;
  private opts: ResolvedStorageOptions;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  onModuleInit(): void {
    this.opts = this.resolveOptions();
    if (!this.opts.redisUrl) {
      this.logger.warn('REDIS_URL not set — StorageService running in no-op mode');
      return;
    }
    this.connect();
  }

  onModuleDestroy(): void {
    if (this.client) {
      this.client.disconnect();
      this.logger.log('Redis connection closed on shutdown');
    }
  }

  // ---------------------------------------------------------------------------
  // Connection management (private)
  // ---------------------------------------------------------------------------

  private resolveOptions(): ResolvedStorageOptions {
    return {
      redisUrl: this.configService.get<string>('REDIS_URL') ?? '',
      priceTtlSeconds: parseInt(
        this.configService.get<string>('REDIS_PRICE_TTL_SECONDS') ?? '300',
        10,
      ),
      historyMaxEntries: parseInt(
        this.configService.get<string>('REDIS_HISTORY_MAX_ENTRIES') ?? '100',
        10,
      ),
      keyPrefix: this.configService.get<string>('REDIS_KEY_PREFIX') ?? 'price',
    };
  }

  private connect(): void {
    this.client = new Redis(this.opts.redisUrl, {
      // null = queue commands during reconnect rather than failing immediately
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times: number): number | null => {
        if (times > 20) {
          this.logger.error(`Redis retry limit reached after ${times} attempts — giving up`);
          return null;
        }
        const delay = Math.min(times * 100, 3000);
        this.logger.warn(`Redis reconnect attempt ${times}, retrying in ${delay}ms`);
        return delay;
      },
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });

    this.client.on('ready', () => {
      this.logger.log('Redis ready');
    });

    this.client.on('error', (err: Error) => {
      this.logger.error(`Redis error: ${err.message}`);
    });

    this.client.on('close', () => {
      this.logger.warn('Redis connection closed');
    });

    this.client.on('reconnecting', () => {
      this.logger.log('Redis reconnecting...');
    });
  }

  // ---------------------------------------------------------------------------
  // Key builders (private)
  // ---------------------------------------------------------------------------

  private latestKey(symbol: string): string {
    return `${this.opts.keyPrefix}:latest:${symbol.toUpperCase()}`;
  }

  private historyKey(symbol: string): string {
    return `${this.opts.keyPrefix}:history:${symbol.toUpperCase()}`;
  }

  private symbolsKey(): string {
    return `${this.opts.keyPrefix}:symbols`;
  }

  // ---------------------------------------------------------------------------
  // Metrics helpers (private)
  // ---------------------------------------------------------------------------

  private recordCacheAccess(hit: boolean): void {
    if (!this.metricsService) return;
    if (hit) {
      this.metricsService.storageCacheHits.inc(1);
    } else {
      this.metricsService.storageCacheMisses.inc(1);
    }
  }

  private recordDuration(operation: string, durationMs: number): void {
    this.metricsService?.storageOperationDuration.observe(
      { operation },
      durationMs / 1000,
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Store one aggregated price.
   *
   * Executes a single pipeline (one network round-trip) that:
   *   1. Sets the latest price key with TTL (STRING + EXPIRE).
   *   2. Appends to the history sorted set (ZADD, score = computedAt).
   *   3. Trims history to the configured max entries (ZREMRANGEBYRANK).
   *   4. Records the symbol in the global index (SADD).
   */
  async storePrice(price: AggregatedPrice): Promise<void> {
    if (!this.client) return;

    const start = Date.now();
    const symbol = price.symbol.toUpperCase();
    const serialized = JSON.stringify(price);

    const pipeline = this.client.pipeline();
    pipeline.set(this.latestKey(symbol), serialized, 'EX', this.opts.priceTtlSeconds);
    pipeline.zadd(this.historyKey(symbol), price.computedAt, serialized);
    // Keep only the newest historyMaxEntries — remove all entries below that rank
    pipeline.zremrangebyrank(this.historyKey(symbol), 0, -(this.opts.historyMaxEntries + 1));
    pipeline.sadd(this.symbolsKey(), symbol);

    await pipeline.exec();
    this.recordDuration('write', Date.now() - start);
    this.logger.debug(`Stored price for ${symbol}`);
  }

  /**
   * Retrieve the latest aggregated price for a symbol.
   *
   * Returns null if the key does not exist, has expired, or Redis is unavailable.
   */
  async getLatestPrice(symbol: string): Promise<AggregatedPrice | null> {
    if (!this.client) return null;

    const start = Date.now();
    const raw = await this.client.get(this.latestKey(symbol));
    const hit = raw !== null;

    this.recordCacheAccess(hit);
    this.recordDuration('read', Date.now() - start);

    if (!raw) return null;
    return JSON.parse(raw) as AggregatedPrice;
  }

  /**
   * Retrieve price history for a symbol within an optional time range.
   *
   * Uses ZRANGEBYSCORE on the history sorted set (scored by computedAt ms).
   *
   * @param symbol  Trading symbol (e.g., 'AAPL')
   * @param fromMs  Start timestamp inclusive, Unix ms. Default: 0 (all history)
   * @param toMs    End timestamp inclusive, Unix ms or '+inf'. Default: '+inf'
   * @param limit   Maximum number of entries returned. Default: all
   */
  async getPriceHistory(
    symbol: string,
    fromMs: number = 0,
    toMs: number | '+inf' = '+inf',
    limit?: number,
  ): Promise<AggregatedPrice[]> {
    if (!this.client) return [];

    const start = Date.now();
    let raw: string[];

    if (limit !== undefined) {
      raw = await this.client.zrangebyscore(
        this.historyKey(symbol),
        fromMs,
        toMs,
        'LIMIT',
        0,
        limit,
      );
    } else {
      raw = await this.client.zrangebyscore(this.historyKey(symbol), fromMs, toMs);
    }

    this.recordDuration('read', Date.now() - start);
    return raw.map((r) => JSON.parse(r) as AggregatedPrice);
  }

  /**
   * Store latest prices for multiple symbols in a single pipeline (batch write).
   *
   * Executes one network round-trip regardless of how many symbols are provided.
   */
  async storePriceBatch(prices: AggregatedPrice[]): Promise<void> {
    if (!this.client || prices.length === 0) return;

    const start = Date.now();
    const pipeline = this.client.pipeline();

    for (const price of prices) {
      const symbol = price.symbol.toUpperCase();
      const serialized = JSON.stringify(price);
      pipeline.set(this.latestKey(symbol), serialized, 'EX', this.opts.priceTtlSeconds);
      pipeline.zadd(this.historyKey(symbol), price.computedAt, serialized);
      pipeline.zremrangebyrank(this.historyKey(symbol), 0, -(this.opts.historyMaxEntries + 1));
      pipeline.sadd(this.symbolsKey(), symbol);
    }

    await pipeline.exec();
    this.recordDuration('write', Date.now() - start);
    this.logger.debug(`Batch stored ${prices.length} prices`);
  }

  /**
   * Retrieve latest prices for multiple symbols (batch read).
   *
   * Uses MGET for a single network round-trip.
   * Symbols with no data (expired or never written) are omitted from the result.
   */
  async getLatestPriceBatch(symbols: string[]): Promise<Map<string, AggregatedPrice>> {
    if (!this.client || symbols.length === 0) return new Map();

    const start = Date.now();
    const upperSymbols = symbols.map((s) => s.toUpperCase());
    const keys = upperSymbols.map((s) => this.latestKey(s));
    const values = await this.client.mget(...keys);

    const results = new Map<string, AggregatedPrice>();
    for (let i = 0; i < upperSymbols.length; i++) {
      const raw = values[i];
      this.recordCacheAccess(raw !== null);
      if (raw) {
        results.set(upperSymbols[i], JSON.parse(raw) as AggregatedPrice);
      }
    }

    this.recordDuration('read', Date.now() - start);
    return results;
  }

  /**
   * Return all symbols that have been stored at least once.
   */
  async getTrackedSymbols(): Promise<string[]> {
    if (!this.client) return [];
    return this.client.smembers(this.symbolsKey());
  }

  /**
   * Delete all data for a symbol (latest key, history sorted set, symbol index entry).
   * Primarily used for testing and administrative operations.
   */
  async deleteSymbol(symbol: string): Promise<void> {
    if (!this.client) return;

    const s = symbol.toUpperCase();
    const pipeline = this.client.pipeline();
    pipeline.del(this.latestKey(s));
    pipeline.del(this.historyKey(s));
    pipeline.srem(this.symbolsKey(), s);
    await pipeline.exec();
    this.logger.debug(`Deleted all data for ${s}`);
  }
}
