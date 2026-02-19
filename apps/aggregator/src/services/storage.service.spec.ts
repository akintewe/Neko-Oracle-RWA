import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { MetricsService } from '../metrics/metrics.service';
import { AggregatedPrice } from '../interfaces/aggregated-price.interface';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockAggregatedPrice(symbol = 'AAPL'): AggregatedPrice {
  return {
    symbol,
    price: 182.35,
    method: 'weighted-average',
    confidence: 88,
    metrics: {
      standardDeviation: 0.12,
      spread: 0.5,
      sourceCount: 4,
      variance: 0.0144,
    },
    startTimestamp: 1700000000000,
    endTimestamp: 1700000030000,
    sources: ['finnhub', 'alpha_vantage'],
    computedAt: 1700000030000,
  };
}

// ---------------------------------------------------------------------------
// Mock pipeline and Redis client
// ---------------------------------------------------------------------------

const mockPipelineExec = jest.fn().mockResolvedValue([]);

const mockPipeline = {
  set: jest.fn().mockReturnThis(),
  zadd: jest.fn().mockReturnThis(),
  zremrangebyrank: jest.fn().mockReturnThis(),
  sadd: jest.fn().mockReturnThis(),
  del: jest.fn().mockReturnThis(),
  srem: jest.fn().mockReturnThis(),
  exec: mockPipelineExec,
};

const mockOn = jest.fn();
const mockDisconnect = jest.fn();
const mockGet = jest.fn();
const mockMget = jest.fn();
const mockZrangebyscore = jest.fn();
const mockSmembers = jest.fn();
const mockPipelineFactory = jest.fn().mockReturnValue(mockPipeline);

const mockRedisInstance = {
  on: mockOn,
  disconnect: mockDisconnect,
  get: mockGet,
  mget: mockMget,
  zrangebyscore: mockZrangebyscore,
  smembers: mockSmembers,
  pipeline: mockPipelineFactory,
};

// Mock ioredis so StorageService receives our fake client.
// Must be declared before the module is loaded by the test runner.
// We use a factory that returns mockRedisInstance for every `new Redis(...)` call.
jest.mock('ioredis', () => {
  // Track constructor calls for assertion in tests
  const MockRedis = jest.fn().mockImplementation(() => mockRedisInstance);
  (MockRedis as any).default = MockRedis;
  return MockRedis;
});

// Capture constructor call args for retryStrategy tests
const RedisMock = jest.requireMock<jest.Mock>('ioredis');

// ---------------------------------------------------------------------------
// Mock MetricsService
// ---------------------------------------------------------------------------

const mockCacheHitsInc = jest.fn();
const mockCacheMissesInc = jest.fn();
const mockDurationObserve = jest.fn();

const mockMetricsService = {
  storageCacheHits: { inc: mockCacheHitsInc },
  storageCacheMisses: { inc: mockCacheMissesInc },
  storageOperationDuration: { observe: mockDurationObserve },
};

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

async function buildService(redisUrl: string | undefined): Promise<StorageService> {
  const configGetFn = jest.fn((key: string): string | undefined => {
    if (key === 'REDIS_URL') return redisUrl;
    if (key === 'REDIS_PRICE_TTL_SECONDS') return '300';
    if (key === 'REDIS_HISTORY_MAX_ENTRIES') return '100';
    if (key === 'REDIS_KEY_PREFIX') return 'price';
    return undefined;
  });

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      StorageService,
      { provide: ConfigService, useValue: { get: configGetFn } },
      { provide: MetricsService, useValue: mockMetricsService },
    ],
  }).compile();

  const service = module.get<StorageService>(StorageService);
  service.onModuleInit();
  return service;
}

async function buildServiceNoMetrics(redisUrl: string | undefined): Promise<StorageService> {
  const configGetFn = jest.fn((key: string): string | undefined => {
    if (key === 'REDIS_URL') return redisUrl;
    if (key === 'REDIS_PRICE_TTL_SECONDS') return '300';
    if (key === 'REDIS_HISTORY_MAX_ENTRIES') return '100';
    if (key === 'REDIS_KEY_PREFIX') return 'price';
    return undefined;
  });

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      StorageService,
      { provide: ConfigService, useValue: { get: configGetFn } },
    ],
  }).compile();

  const service = module.get<StorageService>(StorageService);
  service.onModuleInit();
  return service;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPipelineExec.mockResolvedValue([]);
  });

  // -------------------------------------------------------------------------
  // 1. Initialization
  // -------------------------------------------------------------------------

  describe('initialization', () => {
    it('should be defined', async () => {
      const service = await buildService('redis://localhost:6379');
      expect(service).toBeDefined();
    });

    it('should create a Redis client when REDIS_URL is set', async () => {
      await buildService('redis://localhost:6379');
      expect(RedisMock).toHaveBeenCalledWith('redis://localhost:6379', expect.objectContaining({
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        lazyConnect: false,
      }));
    });

    it('should NOT create a Redis client when REDIS_URL is absent', async () => {
      await buildService(undefined);
      expect(RedisMock).not.toHaveBeenCalled();
    });

    it('should attach event listeners on the Redis client', async () => {
      await buildService('redis://localhost:6379');
      expect(mockOn).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('reconnecting', expect.any(Function));
    });

    it('should configure retryStrategy that backs off and caps at 3 seconds', async () => {
      await buildService('redis://localhost:6379');
      const calls = RedisMock.mock.calls as unknown[][];
      const options = calls[0][1] as any;
      expect(options.retryStrategy).toBeDefined();
      // Back-off increases with attempts (delay = times * 100, capped at 3000ms)
      expect(options.retryStrategy(1)).toBe(100);
      expect(options.retryStrategy(10)).toBe(1000);
      expect(options.retryStrategy(20)).toBe(2000);
      // Returns null (stop retrying) after more than 20 attempts
      expect(options.retryStrategy(21)).toBeNull();
      expect(options.retryStrategy(30)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 2. onModuleDestroy
  // -------------------------------------------------------------------------

  describe('onModuleDestroy', () => {
    it('should disconnect the Redis client', async () => {
      const service = await buildService('redis://localhost:6379');
      service.onModuleDestroy();
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('should not throw when client is null (no-op mode)', async () => {
      const service = await buildService(undefined);
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 3. storePrice
  // -------------------------------------------------------------------------

  describe('storePrice', () => {
    it('should write the latest key with correct TTL', async () => {
      const service = await buildService('redis://localhost:6379');
      const price = makeMockAggregatedPrice('AAPL');
      await service.storePrice(price);

      expect(mockPipeline.set).toHaveBeenCalledWith(
        'price:latest:AAPL',
        JSON.stringify(price),
        'EX',
        300,
      );
    });

    it('should add to history sorted set with computedAt as score', async () => {
      const service = await buildService('redis://localhost:6379');
      const price = makeMockAggregatedPrice('AAPL');
      await service.storePrice(price);

      expect(mockPipeline.zadd).toHaveBeenCalledWith(
        'price:history:AAPL',
        price.computedAt,
        JSON.stringify(price),
      );
    });

    it('should trim history with ZREMRANGEBYRANK using correct rank bounds', async () => {
      const service = await buildService('redis://localhost:6379');
      const price = makeMockAggregatedPrice('AAPL');
      await service.storePrice(price);

      // Keep newest 100 entries: remove rank 0 to -(100+1) = -101
      expect(mockPipeline.zremrangebyrank).toHaveBeenCalledWith(
        'price:history:AAPL',
        0,
        -(100 + 1),
      );
    });

    it('should add symbol to the symbols index set', async () => {
      const service = await buildService('redis://localhost:6379');
      const price = makeMockAggregatedPrice('AAPL');
      await service.storePrice(price);

      expect(mockPipeline.sadd).toHaveBeenCalledWith('price:symbols', 'AAPL');
    });

    it('should execute the pipeline', async () => {
      const service = await buildService('redis://localhost:6379');
      const price = makeMockAggregatedPrice('AAPL');
      await service.storePrice(price);

      expect(mockPipelineExec).toHaveBeenCalled();
    });

    it('should uppercase the symbol in all keys', async () => {
      const service = await buildService('redis://localhost:6379');
      const price = makeMockAggregatedPrice('aapl');
      await service.storePrice(price);

      expect(mockPipeline.set).toHaveBeenCalledWith(
        'price:latest:AAPL',
        expect.any(String),
        'EX',
        expect.any(Number),
      );
      expect(mockPipeline.zadd).toHaveBeenCalledWith(
        'price:history:AAPL',
        expect.any(Number),
        expect.any(String),
      );
    });

    it('should be a no-op when client is null (no-op mode)', async () => {
      const service = await buildService(undefined);
      await expect(service.storePrice(makeMockAggregatedPrice())).resolves.toBeUndefined();
      expect(mockPipelineFactory).not.toHaveBeenCalled();
    });

    it('should record write duration metric', async () => {
      const service = await buildService('redis://localhost:6379');
      await service.storePrice(makeMockAggregatedPrice());
      expect(mockDurationObserve).toHaveBeenCalledWith({ operation: 'write' }, expect.any(Number));
    });
  });

  // -------------------------------------------------------------------------
  // 4. getLatestPrice
  // -------------------------------------------------------------------------

  describe('getLatestPrice', () => {
    it('should return null in no-op mode', async () => {
      const service = await buildService(undefined);
      await expect(service.getLatestPrice('AAPL')).resolves.toBeNull();
    });

    it('should return null on cache miss', async () => {
      const service = await buildService('redis://localhost:6379');
      mockGet.mockResolvedValueOnce(null);
      await expect(service.getLatestPrice('AAPL')).resolves.toBeNull();
    });

    it('should return parsed AggregatedPrice on cache hit', async () => {
      const service = await buildService('redis://localhost:6379');
      const price = makeMockAggregatedPrice('AAPL');
      mockGet.mockResolvedValueOnce(JSON.stringify(price));

      const result = await service.getLatestPrice('AAPL');
      expect(result).toEqual(price);
    });

    it('should call GET with the correct key', async () => {
      const service = await buildService('redis://localhost:6379');
      mockGet.mockResolvedValueOnce(null);
      await service.getLatestPrice('GOOGL');
      expect(mockGet).toHaveBeenCalledWith('price:latest:GOOGL');
    });

    it('should increment cache hits metric on hit', async () => {
      const service = await buildService('redis://localhost:6379');
      const price = makeMockAggregatedPrice();
      mockGet.mockResolvedValueOnce(JSON.stringify(price));

      await service.getLatestPrice('AAPL');
      expect(mockCacheHitsInc).toHaveBeenCalledWith(1);
      expect(mockCacheMissesInc).not.toHaveBeenCalled();
    });

    it('should increment cache misses metric on miss', async () => {
      const service = await buildService('redis://localhost:6379');
      mockGet.mockResolvedValueOnce(null);

      await service.getLatestPrice('AAPL');
      expect(mockCacheMissesInc).toHaveBeenCalledWith(1);
      expect(mockCacheHitsInc).not.toHaveBeenCalled();
    });

    it('should record read duration metric', async () => {
      const service = await buildService('redis://localhost:6379');
      mockGet.mockResolvedValueOnce(null);
      await service.getLatestPrice('AAPL');
      expect(mockDurationObserve).toHaveBeenCalledWith({ operation: 'read' }, expect.any(Number));
    });

    it('should not throw when MetricsService is not injected', async () => {
      const service = await buildServiceNoMetrics('redis://localhost:6379');
      mockGet.mockResolvedValueOnce(null);
      await expect(service.getLatestPrice('AAPL')).resolves.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 5. getPriceHistory
  // -------------------------------------------------------------------------

  describe('getPriceHistory', () => {
    it('should return empty array in no-op mode', async () => {
      const service = await buildService(undefined);
      await expect(service.getPriceHistory('AAPL')).resolves.toEqual([]);
    });

    it('should call ZRANGEBYSCORE with correct key and default range', async () => {
      const service = await buildService('redis://localhost:6379');
      mockZrangebyscore.mockResolvedValueOnce([]);
      await service.getPriceHistory('AAPL');
      expect(mockZrangebyscore).toHaveBeenCalledWith('price:history:AAPL', 0, '+inf');
    });

    it('should call ZRANGEBYSCORE with custom time range', async () => {
      const service = await buildService('redis://localhost:6379');
      mockZrangebyscore.mockResolvedValueOnce([]);
      await service.getPriceHistory('AAPL', 1000, 2000);
      expect(mockZrangebyscore).toHaveBeenCalledWith('price:history:AAPL', 1000, 2000);
    });

    it('should pass LIMIT clause when limit argument is provided', async () => {
      const service = await buildService('redis://localhost:6379');
      mockZrangebyscore.mockResolvedValueOnce([]);
      await service.getPriceHistory('AAPL', 0, '+inf', 10);
      expect(mockZrangebyscore).toHaveBeenCalledWith(
        'price:history:AAPL',
        0,
        '+inf',
        'LIMIT',
        0,
        10,
      );
    });

    it('should parse and return all JSON members', async () => {
      const service = await buildService('redis://localhost:6379');
      const p1 = makeMockAggregatedPrice('AAPL');
      const p2 = { ...p1, computedAt: p1.computedAt + 1000 };
      mockZrangebyscore.mockResolvedValueOnce([JSON.stringify(p1), JSON.stringify(p2)]);

      const result = await service.getPriceHistory('AAPL');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(p1);
      expect(result[1]).toEqual(p2);
    });

    it('should return empty array when ZRANGEBYSCORE returns no results', async () => {
      const service = await buildService('redis://localhost:6379');
      mockZrangebyscore.mockResolvedValueOnce([]);
      await expect(service.getPriceHistory('AAPL')).resolves.toEqual([]);
    });

    it('should record read duration metric', async () => {
      const service = await buildService('redis://localhost:6379');
      mockZrangebyscore.mockResolvedValueOnce([]);
      await service.getPriceHistory('AAPL');
      expect(mockDurationObserve).toHaveBeenCalledWith({ operation: 'read' }, expect.any(Number));
    });
  });

  // -------------------------------------------------------------------------
  // 6. storePriceBatch
  // -------------------------------------------------------------------------

  describe('storePriceBatch', () => {
    it('should be a no-op in no-op mode', async () => {
      const service = await buildService(undefined);
      await expect(
        service.storePriceBatch([makeMockAggregatedPrice()]),
      ).resolves.toBeUndefined();
      expect(mockPipelineFactory).not.toHaveBeenCalled();
    });

    it('should be a no-op when prices array is empty', async () => {
      const service = await buildService('redis://localhost:6379');
      await service.storePriceBatch([]);
      expect(mockPipelineFactory).not.toHaveBeenCalled();
    });

    it('should pipeline writes for each price', async () => {
      const service = await buildService('redis://localhost:6379');
      const p1 = makeMockAggregatedPrice('AAPL');
      const p2 = makeMockAggregatedPrice('GOOGL');
      await service.storePriceBatch([p1, p2]);

      expect(mockPipeline.set).toHaveBeenCalledTimes(2);
      expect(mockPipeline.zadd).toHaveBeenCalledTimes(2);
      expect(mockPipeline.zremrangebyrank).toHaveBeenCalledTimes(2);
      expect(mockPipeline.sadd).toHaveBeenCalledTimes(2);
      expect(mockPipelineExec).toHaveBeenCalledTimes(1);
    });

    it('should use correct keys for each symbol in the batch', async () => {
      const service = await buildService('redis://localhost:6379');
      const p1 = makeMockAggregatedPrice('AAPL');
      const p2 = makeMockAggregatedPrice('TSLA');
      await service.storePriceBatch([p1, p2]);

      expect(mockPipeline.set).toHaveBeenCalledWith(
        'price:latest:AAPL',
        expect.any(String),
        'EX',
        300,
      );
      expect(mockPipeline.set).toHaveBeenCalledWith(
        'price:latest:TSLA',
        expect.any(String),
        'EX',
        300,
      );
    });

    it('should record write duration metric', async () => {
      const service = await buildService('redis://localhost:6379');
      await service.storePriceBatch([makeMockAggregatedPrice()]);
      expect(mockDurationObserve).toHaveBeenCalledWith({ operation: 'write' }, expect.any(Number));
    });
  });

  // -------------------------------------------------------------------------
  // 7. getLatestPriceBatch
  // -------------------------------------------------------------------------

  describe('getLatestPriceBatch', () => {
    it('should return empty map in no-op mode', async () => {
      const service = await buildService(undefined);
      const result = await service.getLatestPriceBatch(['AAPL', 'GOOGL']);
      expect(result.size).toBe(0);
    });

    it('should return empty map when symbols array is empty', async () => {
      const service = await buildService('redis://localhost:6379');
      const result = await service.getLatestPriceBatch([]);
      expect(result.size).toBe(0);
      expect(mockMget).not.toHaveBeenCalled();
    });

    it('should use MGET for a single round-trip', async () => {
      const service = await buildService('redis://localhost:6379');
      mockMget.mockResolvedValueOnce([null, null]);
      await service.getLatestPriceBatch(['AAPL', 'GOOGL']);
      expect(mockMget).toHaveBeenCalledWith('price:latest:AAPL', 'price:latest:GOOGL');
    });

    it('should return only symbols present in Redis (filter nulls)', async () => {
      const service = await buildService('redis://localhost:6379');
      const price = makeMockAggregatedPrice('AAPL');
      mockMget.mockResolvedValueOnce([JSON.stringify(price), null]);

      const result = await service.getLatestPriceBatch(['AAPL', 'GOOGL']);
      expect(result.size).toBe(1);
      expect(result.get('AAPL')).toEqual(price);
      expect(result.has('GOOGL')).toBe(false);
    });

    it('should record a hit metric for each found symbol', async () => {
      const service = await buildService('redis://localhost:6379');
      const price = makeMockAggregatedPrice('AAPL');
      mockMget.mockResolvedValueOnce([JSON.stringify(price), JSON.stringify(price)]);

      await service.getLatestPriceBatch(['AAPL', 'MSFT']);
      expect(mockCacheHitsInc).toHaveBeenCalledTimes(2);
    });

    it('should record a miss metric for each symbol not in cache', async () => {
      const service = await buildService('redis://localhost:6379');
      mockMget.mockResolvedValueOnce([null, null]);

      await service.getLatestPriceBatch(['AAPL', 'MSFT']);
      expect(mockCacheMissesInc).toHaveBeenCalledTimes(2);
    });

    it('should record read duration metric', async () => {
      const service = await buildService('redis://localhost:6379');
      mockMget.mockResolvedValueOnce([]);
      await service.getLatestPriceBatch(['AAPL']);
      expect(mockDurationObserve).toHaveBeenCalledWith({ operation: 'read' }, expect.any(Number));
    });
  });

  // -------------------------------------------------------------------------
  // 8. getTrackedSymbols
  // -------------------------------------------------------------------------

  describe('getTrackedSymbols', () => {
    it('should return empty array in no-op mode', async () => {
      const service = await buildService(undefined);
      await expect(service.getTrackedSymbols()).resolves.toEqual([]);
    });

    it('should call SMEMBERS on the symbols key', async () => {
      const service = await buildService('redis://localhost:6379');
      mockSmembers.mockResolvedValueOnce(['AAPL', 'GOOGL']);
      const result = await service.getTrackedSymbols();
      expect(mockSmembers).toHaveBeenCalledWith('price:symbols');
      expect(result).toEqual(['AAPL', 'GOOGL']);
    });

    it('should return empty array when no symbols have been tracked', async () => {
      const service = await buildService('redis://localhost:6379');
      mockSmembers.mockResolvedValueOnce([]);
      await expect(service.getTrackedSymbols()).resolves.toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // 9. deleteSymbol
  // -------------------------------------------------------------------------

  describe('deleteSymbol', () => {
    it('should be a no-op in no-op mode', async () => {
      const service = await buildService(undefined);
      await expect(service.deleteSymbol('AAPL')).resolves.toBeUndefined();
      expect(mockPipelineFactory).not.toHaveBeenCalled();
    });

    it('should DEL the latest key', async () => {
      const service = await buildService('redis://localhost:6379');
      await service.deleteSymbol('AAPL');
      expect(mockPipeline.del).toHaveBeenCalledWith('price:latest:AAPL');
    });

    it('should DEL the history key', async () => {
      const service = await buildService('redis://localhost:6379');
      await service.deleteSymbol('AAPL');
      expect(mockPipeline.del).toHaveBeenCalledWith('price:history:AAPL');
    });

    it('should SREM the symbol from the symbols index', async () => {
      const service = await buildService('redis://localhost:6379');
      await service.deleteSymbol('AAPL');
      expect(mockPipeline.srem).toHaveBeenCalledWith('price:symbols', 'AAPL');
    });

    it('should execute the pipeline', async () => {
      const service = await buildService('redis://localhost:6379');
      await service.deleteSymbol('AAPL');
      expect(mockPipelineExec).toHaveBeenCalled();
    });

    it('should uppercase the symbol', async () => {
      const service = await buildService('redis://localhost:6379');
      await service.deleteSymbol('aapl');
      expect(mockPipeline.del).toHaveBeenCalledWith('price:latest:AAPL');
      expect(mockPipeline.del).toHaveBeenCalledWith('price:history:AAPL');
    });
  });

  // -------------------------------------------------------------------------
  // 10. Key prefix customization
  // -------------------------------------------------------------------------

  describe('key prefix', () => {
    it('should use a custom key prefix from config', async () => {
      const configGetFn = jest.fn((key: string): string | undefined => {
        if (key === 'REDIS_URL') return 'redis://localhost:6379';
        if (key === 'REDIS_KEY_PREFIX') return 'oracle';
        if (key === 'REDIS_PRICE_TTL_SECONDS') return '300';
        if (key === 'REDIS_HISTORY_MAX_ENTRIES') return '100';
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StorageService,
          { provide: ConfigService, useValue: { get: configGetFn } },
          { provide: MetricsService, useValue: mockMetricsService },
        ],
      }).compile();

      const service = module.get<StorageService>(StorageService);
      service.onModuleInit();

      const price = makeMockAggregatedPrice('AAPL');
      await service.storePrice(price);

      expect(mockPipeline.set).toHaveBeenCalledWith(
        'oracle:latest:AAPL',
        expect.any(String),
        'EX',
        expect.any(Number),
      );
      expect(mockPipeline.zadd).toHaveBeenCalledWith(
        'oracle:history:AAPL',
        expect.any(Number),
        expect.any(String),
      );
      expect(mockPipeline.sadd).toHaveBeenCalledWith('oracle:symbols', 'AAPL');
    });
  });
});
