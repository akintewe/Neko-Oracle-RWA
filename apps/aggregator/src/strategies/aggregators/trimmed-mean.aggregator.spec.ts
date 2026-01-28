import { TrimmedMeanAggregator } from './trimmed-mean.aggregator';
import { NormalizedPrice } from '../../interfaces/normalized-price.interface';

describe('TrimmedMeanAggregator', () => {
  let aggregator: TrimmedMeanAggregator;

  beforeEach(() => {
    aggregator = new TrimmedMeanAggregator(0.2);
  });

  it('should have correct name', () => {
    expect(aggregator.name).toBe('trimmed-mean');
  });

  describe('constructor', () => {
    it('should accept valid trim percentages', () => {
      expect(() => new TrimmedMeanAggregator(0)).not.toThrow();
      expect(() => new TrimmedMeanAggregator(0.25)).not.toThrow();
      expect(() => new TrimmedMeanAggregator(0.49)).not.toThrow();
    });

    it('should throw error for negative trim percentage', () => {
      expect(() => new TrimmedMeanAggregator(-0.1)).toThrow(
        'Trim percentage must be between 0 and 0.5',
      );
    });

    it('should throw error for trim percentage >= 0.5', () => {
      expect(() => new TrimmedMeanAggregator(0.5)).toThrow(
        'Trim percentage must be between 0 and 0.5',
      );
      expect(() => new TrimmedMeanAggregator(0.6)).toThrow(
        'Trim percentage must be between 0 and 0.5',
      );
    });
  });

  describe('aggregate', () => {
    it('should trim and average correctly', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 90, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 95, timestamp: Date.now(), source: 'Source2' },
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source3' },
        { symbol: 'AAPL', price: 105, timestamp: Date.now(), source: 'Source4' },
        { symbol: 'AAPL', price: 110, timestamp: Date.now(), source: 'Source5' },
      ];

      // 20% trim of 5 = 1 from each end
      // After trim: [95, 100, 105]
      // Average: 100
      const result = aggregator.aggregate(prices);
      expect(result).toBeCloseTo(100, 1);
    });

    it('should handle datasets too small to trim', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 200, timestamp: Date.now(), source: 'Source2' },
      ];

      // With 2 prices, should fall back to simple average
      const result = aggregator.aggregate(prices);
      expect(result).toBe(150);
    });

    it('should remove outliers effectively', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 10, timestamp: Date.now(), source: 'Source1' }, // Outlier
        { symbol: 'AAPL', price: 98, timestamp: Date.now(), source: 'Source2' },
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source3' },
        { symbol: 'AAPL', price: 102, timestamp: Date.now(), source: 'Source4' },
        { symbol: 'AAPL', price: 500, timestamp: Date.now(), source: 'Source5' }, // Outlier
      ];

      // 20% trim of 5 = 1 from each end
      // After trim: [98, 100, 102]
      // Average: 100
      const result = aggregator.aggregate(prices);
      expect(result).toBeCloseTo(100, 1);
    });

    it('should apply weights after trimming', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 90, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source2' },
        { symbol: 'AAPL', price: 110, timestamp: Date.now(), source: 'Source3' },
        { symbol: 'AAPL', price: 120, timestamp: Date.now(), source: 'Source4' },
        { symbol: 'AAPL', price: 130, timestamp: Date.now(), source: 'Source5' },
      ];

      const weights = new Map([
        ['Source2', 3], // 100 with weight 3
        ['Source3', 1], // 110 with weight 1
        ['Source4', 1], // 120 with weight 1
      ]);

      // 20% trim of 5 = 1 from each end
      // After trim: [100, 110, 120]
      // Weighted average: (100*3 + 110*1 + 120*1) / (3+1+1) = 530/5 = 106
      const result = aggregator.aggregate(prices, weights);
      expect(result).toBeCloseTo(106, 1);
    });

    it('should throw error for empty array', () => {
      expect(() => {
        aggregator.aggregate([]);
      }).toThrow('Cannot aggregate empty price array');
    });

    it('should handle single price', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 123.45, timestamp: Date.now(), source: 'Source1' },
      ];

      // Falls back to average with 1 price
      const result = aggregator.aggregate(prices);
      expect(result).toBe(123.45);
    });

    it('should handle 0% trim (equivalent to weighted average)', () => {
      const zeroTrimAggregator = new TrimmedMeanAggregator(0);
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 200, timestamp: Date.now(), source: 'Source2' },
        { symbol: 'AAPL', price: 300, timestamp: Date.now(), source: 'Source3' },
      ];

      // 0% trim = no trimming = average of all
      const result = zeroTrimAggregator.aggregate(prices);
      expect(result).toBeCloseTo(200, 1);
    });

    it('should handle 40% trim (most aggressive)', () => {
      const heavyTrimAggregator = new TrimmedMeanAggregator(0.4);
      const prices: NormalizedPrice[] = Array.from({ length: 10 }, (_, i) => ({
        symbol: 'AAPL',
        price: (i + 1) * 10,
        timestamp: Date.now(),
        source: `Source${i}`,
      }));
      // Prices: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

      // 40% trim of 10 = 4 from each end
      // After trim: [50, 60] (indices 4 and 5)
      // Average: 55
      const result = heavyTrimAggregator.aggregate(prices);
      expect(result).toBe(55);
    });

    it('should handle large datasets', () => {
      const prices: NormalizedPrice[] = Array.from({ length: 100 }, (_, i) => ({
        symbol: 'AAPL',
        price: 100 + i,
        timestamp: Date.now(),
        source: `Source${i}`,
      }));
      // Prices: [100, 101, ..., 199]

      // 20% trim of 100 = 20 from each end
      // After trim: [120, 121, ..., 179] (60 values)
      // Average: 149.5
      const result = aggregator.aggregate(prices);
      expect(result).toBeCloseTo(149.5, 1);
    });

    it('should handle all same values', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source2' },
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source3' },
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source4' },
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source5' },
      ];

      const result = aggregator.aggregate(prices);
      expect(result).toBe(100);
    });

    it('should respect individual price weights', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 90, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source2', weight: 5 },
        { symbol: 'AAPL', price: 110, timestamp: Date.now(), source: 'Source3' },
        { symbol: 'AAPL', price: 120, timestamp: Date.now(), source: 'Source4' },
        { symbol: 'AAPL', price: 130, timestamp: Date.now(), source: 'Source5' },
      ];

      // 20% trim of 5 = 1 from each end
      // After trim: [100 (weight 5), 110, 120]
      // Weighted average: (100*5 + 110*1 + 120*1) / (5+1+1) = 730/7 ≈ 104.29
      const result = aggregator.aggregate(prices);
      expect(result).toBeCloseTo(104.29, 2);
    });
  });
});
