import { Test, TestingModule } from '@nestjs/testing';
import { AggregationService } from './aggregation.service';
import { NormalizedPrice } from '../interfaces/normalized-price.interface';

describe('AggregationService', () => {
  let service: AggregationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AggregationService],
    }).compile();

    service = module.get<AggregationService>(AggregationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('aggregate', () => {
    const createMockPrices = (symbol: string, basePrices: number[]): NormalizedPrice[] => {
      const sources = ['AlphaVantage', 'YahooFinance', 'Finnhub', 'Bloomberg', 'Reuters'];
      return basePrices.map((price, index) => ({
        symbol,
        price,
        timestamp: Date.now() - 1000 * index,
        source: sources[index % sources.length],
      }));
    };

    describe('weighted-average method', () => {
      it('should calculate weighted average correctly with equal weights', () => {
        const prices = createMockPrices('AAPL', [100, 102, 98]);
        const result = service.aggregate('AAPL', prices, { method: 'weighted-average' });

        expect(result.symbol).toBe('AAPL');
        expect(result.method).toBe('weighted-average');
        expect(result.price).toBeCloseTo(100, 1);
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.metrics.sourceCount).toBe(3);
      });

      it('should apply source weights correctly', () => {
        const prices = createMockPrices('GOOGL', [100, 110]);
        const weights = new Map([
          ['AlphaVantage', 3], // 100 with weight 3
          ['YahooFinance', 1], // 110 with weight 1
        ]);

        const result = service.aggregate('GOOGL', prices, {
          method: 'weighted-average',
          customWeights: weights,
          minSources: 2,
        });

        // Weighted average: (100*3 + 110*1) / (3+1) = 410/4 = 102.5
        expect(result.price).toBeCloseTo(102.5, 1);
      });

      it('should handle single source with sufficient min sources set to 1', () => {
        const prices = createMockPrices('TSLA', [250]);
        const result = service.aggregate('TSLA', prices, {
          method: 'weighted-average',
          minSources: 1,
        });

        expect(result.price).toBe(250);
        expect(result.metrics.sourceCount).toBe(1);
      });

      it('should calculate high confidence for closely agreeing prices', () => {
        const prices = createMockPrices('MSFT', [100, 100.5, 99.5, 100, 100.2]);
        const result = service.aggregate('MSFT', prices, {
          method: 'weighted-average',
          minSources: 3,
        });

        expect(result.confidence).toBeGreaterThan(80);
      });

      it('should calculate low confidence for divergent prices', () => {
        const prices = createMockPrices('AAPL', [100, 150, 80, 120, 90]);
        const result = service.aggregate('AAPL', prices, {
          method: 'weighted-average',
          minSources: 3,
        });

        expect(result.confidence).toBeLessThan(50);
      });
    });

    describe('median method', () => {
      it('should calculate median correctly with odd number of prices', () => {
        const prices = createMockPrices('AAPL', [98, 100, 102]);
        const result = service.aggregate('AAPL', prices, { method: 'median' });

        expect(result.price).toBe(100);
        expect(result.method).toBe('median');
      });

      it('should calculate median correctly with even number of prices', () => {
        const prices = createMockPrices('GOOGL', [98, 100, 102, 104]);
        const result = service.aggregate('GOOGL', prices, { method: 'median' });

        // Median of [98, 100, 102, 104] = (100 + 102) / 2 = 101
        expect(result.price).toBe(101);
      });

      it('should be resistant to outliers', () => {
        const prices = createMockPrices('TSLA', [100, 101, 99, 1000]); // 1000 is outlier
        const result = service.aggregate('TSLA', prices, { method: 'median' });

        // Median should be close to 100, not affected by outlier
        expect(result.price).toBeCloseTo(100.5, 1);
      });
    });

    describe('trimmed-mean method', () => {
      it('should calculate trimmed mean correctly', () => {
        const prices = createMockPrices('AAPL', [90, 95, 100, 105, 110]);
        
        // Disable weights for predictable results
        const result = service.aggregate('AAPL', prices, {
          method: 'trimmed-mean',
          trimPercentage: 0.2,
          customWeights: new Map([
            ['AlphaVantage', 1],
            ['YahooFinance', 1],
            ['Finnhub', 1],
            ['Bloomberg', 1],
            ['Reuters', 1],
          ]),
        });

        // After trimming 20%: [95, 100, 105]
        // Average: 100
        expect(result.price).toBeCloseTo(100, 1);
      });

      it('should handle small datasets by falling back to average', () => {
        const prices = createMockPrices('MSFT', [100, 102]);
        
        const result = service.aggregate('MSFT', prices, {
          method: 'trimmed-mean',
          minSources: 2,
          customWeights: new Map([
            ['AlphaVantage', 1],
            ['YahooFinance', 1],
          ]),
        });

        // Too few to trim, should average
        expect(result.price).toBeCloseTo(101, 1);
      });

      it('should remove outliers effectively', () => {
        const prices = createMockPrices('GOOGL', [50, 98, 100, 102, 150]);
        
        const result = service.aggregate('GOOGL', prices, {
          method: 'trimmed-mean',
          trimPercentage: 0.2,
          customWeights: new Map([
            ['AlphaVantage', 1],
            ['YahooFinance', 1],
            ['Finnhub', 1],
            ['Bloomberg', 1],
            ['Reuters', 1],
          ]),
        });

        // After trimming 20%: [98, 100, 102]
        // Average: 100
        expect(result.price).toBeCloseTo(100, 1);
      });
    });

    describe('time window filtering', () => {
      it('should filter out old prices outside time window', () => {
        const now = Date.now();
        const prices: NormalizedPrice[] = [
          { symbol: 'AAPL', price: 100, timestamp: now - 1000, source: 'Source1' },
          { symbol: 'AAPL', price: 101, timestamp: now - 2000, source: 'Source2' },
          { symbol: 'AAPL', price: 102, timestamp: now - 50000, source: 'Source3' }, // Too old
          { symbol: 'AAPL', price: 103, timestamp: now - 60000, source: 'Source4' }, // Too old
        ];

        const result = service.aggregate('AAPL', prices, {
          timeWindowMs: 30000, // 30 seconds
          minSources: 2,
        });

        // Should only use the 2 recent prices
        expect(result.metrics.sourceCount).toBe(2);
        expect(result.price).toBeCloseTo(100.5, 1);
      });

      it('should throw error if insufficient recent sources', () => {
        const now = Date.now();
        const prices: NormalizedPrice[] = [
          { symbol: 'AAPL', price: 100, timestamp: now - 50000, source: 'Source1' }, // Too old
          { symbol: 'AAPL', price: 101, timestamp: now - 60000, source: 'Source2' }, // Too old
        ];

        expect(() => {
          service.aggregate('AAPL', prices, {
            timeWindowMs: 30000,
            minSources: 2,
          });
        }).toThrow(/Insufficient recent sources/);
      });
    });

    describe('validation', () => {
      it('should throw error for empty symbol', () => {
        const prices = createMockPrices('AAPL', [100, 101, 102]);
        expect(() => {
          service.aggregate('', prices);
        }).toThrow(/Symbol cannot be empty/);
      });

      it('should throw error for empty prices array', () => {
        expect(() => {
          service.aggregate('AAPL', []);
        }).toThrow(/Prices array cannot be empty/);
      });

      it('should throw error if below minimum sources', () => {
        const prices = createMockPrices('AAPL', [100, 101]);
        expect(() => {
          service.aggregate('AAPL', prices, { minSources: 3 });
        }).toThrow(/Insufficient sources/);
      });

      it('should throw error for mismatched symbols', () => {
        const prices: NormalizedPrice[] = [
          { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
          { symbol: 'GOOGL', price: 101, timestamp: Date.now(), source: 'Source2' },
          { symbol: 'AAPL', price: 102, timestamp: Date.now(), source: 'Source3' },
        ];

        expect(() => {
          service.aggregate('AAPL', prices);
        }).toThrow(/All prices must be for symbol AAPL/);
      });

      it('should throw error for invalid price values', () => {
        const prices: NormalizedPrice[] = [
          { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
          { symbol: 'AAPL', price: -50, timestamp: Date.now(), source: 'Source2' },
          { symbol: 'AAPL', price: 102, timestamp: Date.now(), source: 'Source3' },
        ];

        expect(() => {
          service.aggregate('AAPL', prices);
        }).toThrow(/invalid price values/);
      });

      it('should throw error for unknown aggregation method', () => {
        const prices = createMockPrices('AAPL', [100, 101, 102]);
        expect(() => {
          service.aggregate('AAPL', prices, { method: 'unknown' as any });
        }).toThrow(/Unknown aggregation method/);
      });
    });

    describe('metrics calculation', () => {
      it('should calculate standard deviation correctly', () => {
        const prices = createMockPrices('AAPL', [100, 100, 100]);
        const result = service.aggregate('AAPL', prices);

        // All same prices = 0 standard deviation
        expect(result.metrics.standardDeviation).toBe(0);
      });

      it('should calculate spread correctly', () => {
        const prices = createMockPrices('AAPL', [90, 100, 110]);
        const result = service.aggregate('AAPL', prices);

        // Spread = (110 - 90) / 100 * 100 = 20%
        expect(result.metrics.spread).toBeCloseTo(20, 0);
      });

      it('should include source count', () => {
        const prices = createMockPrices('AAPL', [100, 101, 102, 103, 104]);
        const result = service.aggregate('AAPL', prices);

        expect(result.metrics.sourceCount).toBe(5);
      });

      it('should calculate variance', () => {
        const prices = createMockPrices('AAPL', [100, 100, 100]);
        const result = service.aggregate('AAPL', prices);

        expect(result.metrics.variance).toBe(0);
      });
    });

    describe('result structure', () => {
      it('should include all required fields', () => {
        const prices = createMockPrices('AAPL', [100, 101, 102]);
        const result = service.aggregate('AAPL', prices);

        expect(result).toHaveProperty('symbol');
        expect(result).toHaveProperty('price');
        expect(result).toHaveProperty('method');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('metrics');
        expect(result).toHaveProperty('startTimestamp');
        expect(result).toHaveProperty('endTimestamp');
        expect(result).toHaveProperty('sources');
        expect(result).toHaveProperty('computedAt');
      });

      it('should include unique sources list', () => {
        const prices = createMockPrices('AAPL', [100, 101, 102]);
        const result = service.aggregate('AAPL', prices);

        expect(result.sources).toBeInstanceOf(Array);
        expect(result.sources.length).toBeGreaterThan(0);
        expect(new Set(result.sources).size).toBe(result.sources.length);
      });

      it('should have timestamps in correct order', () => {
        const prices = createMockPrices('AAPL', [100, 101, 102]);
        const result = service.aggregate('AAPL', prices);

        expect(result.startTimestamp).toBeLessThanOrEqual(result.endTimestamp);
        expect(result.computedAt).toBeGreaterThanOrEqual(result.endTimestamp);
      });
    });
  });

  describe('aggregateMultiple', () => {
    it('should aggregate multiple symbols successfully', () => {
      const pricesBySymbol = new Map<string, NormalizedPrice[]>([
        [
          'AAPL',
          [
            { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
            { symbol: 'AAPL', price: 101, timestamp: Date.now(), source: 'Source2' },
            { symbol: 'AAPL', price: 102, timestamp: Date.now(), source: 'Source3' },
          ],
        ],
        [
          'GOOGL',
          [
            { symbol: 'GOOGL', price: 200, timestamp: Date.now(), source: 'Source1' },
            { symbol: 'GOOGL', price: 201, timestamp: Date.now(), source: 'Source2' },
            { symbol: 'GOOGL', price: 202, timestamp: Date.now(), source: 'Source3' },
          ],
        ],
      ]);

      const results = service.aggregateMultiple(pricesBySymbol);

      expect(results.size).toBe(2);
      expect(results.get('AAPL')).toBeDefined();
      expect(results.get('GOOGL')).toBeDefined();
      expect(results.get('AAPL')?.price).toBeCloseTo(101, 1);
      expect(results.get('GOOGL')?.price).toBeCloseTo(201, 1);
    });

    it('should skip symbols with errors and continue', () => {
      const pricesBySymbol = new Map<string, NormalizedPrice[]>([
        [
          'AAPL',
          [
            { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
            { symbol: 'AAPL', price: 101, timestamp: Date.now(), source: 'Source2' },
            { symbol: 'AAPL', price: 102, timestamp: Date.now(), source: 'Source3' },
          ],
        ],
        ['GOOGL', []], // Empty array - should fail
        [
          'MSFT',
          [
            { symbol: 'MSFT', price: 300, timestamp: Date.now(), source: 'Source1' },
            { symbol: 'MSFT', price: 301, timestamp: Date.now(), source: 'Source2' },
            { symbol: 'MSFT', price: 302, timestamp: Date.now(), source: 'Source3' },
          ],
        ],
      ]);

      const results = service.aggregateMultiple(pricesBySymbol);

      // Should have 2 results, GOOGL should be skipped
      expect(results.size).toBe(2);
      expect(results.get('AAPL')).toBeDefined();
      expect(results.get('GOOGL')).toBeUndefined();
      expect(results.get('MSFT')).toBeDefined();
    });
  });

  describe('confidence scoring', () => {
    it('should give higher confidence with more sources', () => {
      const prices3 = Array.from({ length: 3 }, (_, i) => ({
        symbol: 'AAPL',
        price: 100,
        timestamp: Date.now(),
        source: `Source${i + 1}`,
      }));

      const prices10 = Array.from({ length: 10 }, (_, i) => ({
        symbol: 'AAPL',
        price: 100,
        timestamp: Date.now(),
        source: `Source${i + 1}`,
      }));

      const result3 = service.aggregate('AAPL', prices3);
      const result10 = service.aggregate('AAPL', prices10, { minSources: 5 });

      expect(result10.confidence).toBeGreaterThan(result3.confidence);
    });

    it('should give higher confidence with lower spread', () => {
      const lowSpreadPrices = [
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 100.5, timestamp: Date.now(), source: 'Source2' },
        { symbol: 'AAPL', price: 99.5, timestamp: Date.now(), source: 'Source3' },
      ];

      const highSpreadPrices = [
        { symbol: 'AAPL', price: 80, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source2' },
        { symbol: 'AAPL', price: 120, timestamp: Date.now(), source: 'Source3' },
      ];

      const lowSpreadResult = service.aggregate('AAPL', lowSpreadPrices);
      const highSpreadResult = service.aggregate('AAPL', highSpreadPrices);

      expect(lowSpreadResult.confidence).toBeGreaterThan(highSpreadResult.confidence);
    });

    it('should clamp confidence between 0 and 100', () => {
      const prices = [
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source2' },
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source3' },
      ];

      const result = service.aggregate('AAPL', prices);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });
  });
});
