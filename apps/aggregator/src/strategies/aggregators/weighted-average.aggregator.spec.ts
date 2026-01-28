import { WeightedAverageAggregator } from './weighted-average.aggregator';
import { NormalizedPrice } from '../../interfaces/normalized-price.interface';

describe('WeightedAverageAggregator', () => {
  let aggregator: WeightedAverageAggregator;

  beforeEach(() => {
    aggregator = new WeightedAverageAggregator();
  });

  it('should have correct name', () => {
    expect(aggregator.name).toBe('weighted-average');
  });

  describe('aggregate', () => {
    it('should calculate simple average with equal weights', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 200, timestamp: Date.now(), source: 'Source2' },
      ];

      const result = aggregator.aggregate(prices);
      expect(result).toBe(150);
    });

    it('should apply weights from map', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 200, timestamp: Date.now(), source: 'Source2' },
      ];

      const weights = new Map([
        ['Source1', 3],
        ['Source2', 1],
      ]);

      // (100*3 + 200*1) / (3+1) = 500/4 = 125
      const result = aggregator.aggregate(prices, weights);
      expect(result).toBe(125);
    });

    it('should use individual price weight if provided', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1', weight: 5 },
        { symbol: 'AAPL', price: 200, timestamp: Date.now(), source: 'Source2' },
      ];

      const weights = new Map([
        ['Source1', 1], // Should be overridden by individual weight
        ['Source2', 1],
      ]);

      // (100*5 + 200*1) / (5+1) = 700/6 = 116.67
      const result = aggregator.aggregate(prices, weights);
      expect(result).toBeCloseTo(116.67, 2);
    });

    it('should default to weight 1 for unknown sources', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'UnknownSource' },
        { symbol: 'AAPL', price: 200, timestamp: Date.now(), source: 'AnotherUnknown' },
      ];

      const result = aggregator.aggregate(prices);
      expect(result).toBe(150);
    });

    it('should throw error for empty array', () => {
      expect(() => {
        aggregator.aggregate([]);
      }).toThrow('Cannot aggregate empty price array');
    });

    it('should throw error if total weight is zero', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1', weight: 0 },
        { symbol: 'AAPL', price: 200, timestamp: Date.now(), source: 'Source2', weight: 0 },
      ];

      expect(() => {
        aggregator.aggregate(prices);
      }).toThrow('Total weight cannot be zero');
    });

    it('should handle single price', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 123.45, timestamp: Date.now(), source: 'Source1' },
      ];

      const result = aggregator.aggregate(prices);
      expect(result).toBe(123.45);
    });

    it('should handle many prices', () => {
      const prices: NormalizedPrice[] = Array.from({ length: 100 }, (_, i) => ({
        symbol: 'AAPL',
        price: 100 + i,
        timestamp: Date.now(),
        source: `Source${i}`,
      }));

      const result = aggregator.aggregate(prices);
      // Average of 100, 101, ..., 199 = 149.5
      expect(result).toBeCloseTo(149.5, 1);
    });

    it('should handle decimal weights', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 200, timestamp: Date.now(), source: 'Source2' },
      ];

      const weights = new Map([
        ['Source1', 0.25],
        ['Source2', 0.75],
      ]);

      // (100*0.25 + 200*0.75) / (0.25+0.75) = 175/1 = 175
      const result = aggregator.aggregate(prices, weights);
      expect(result).toBe(175);
    });
  });
});
