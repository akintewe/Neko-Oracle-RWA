import { MedianAggregator } from './median.aggregator';
import { NormalizedPrice } from '../../interfaces/normalized-price.interface';

describe('MedianAggregator', () => {
  let aggregator: MedianAggregator;

  beforeEach(() => {
    aggregator = new MedianAggregator();
  });

  it('should have correct name', () => {
    expect(aggregator.name).toBe('median');
  });

  describe('aggregate', () => {
    it('should calculate median for odd number of prices', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 200, timestamp: Date.now(), source: 'Source2' },
        { symbol: 'AAPL', price: 300, timestamp: Date.now(), source: 'Source3' },
      ];

      const result = aggregator.aggregate(prices);
      expect(result).toBe(200);
    });

    it('should calculate median for even number of prices', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 200, timestamp: Date.now(), source: 'Source2' },
        { symbol: 'AAPL', price: 300, timestamp: Date.now(), source: 'Source3' },
        { symbol: 'AAPL', price: 400, timestamp: Date.now(), source: 'Source4' },
      ];

      const result = aggregator.aggregate(prices);
      // Median of [100, 200, 300, 400] = (200 + 300) / 2 = 250
      expect(result).toBe(250);
    });

    it('should handle unsorted input', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 300, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source2' },
        { symbol: 'AAPL', price: 200, timestamp: Date.now(), source: 'Source3' },
      ];

      const result = aggregator.aggregate(prices);
      expect(result).toBe(200);
    });

    it('should be resistant to outliers', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 101, timestamp: Date.now(), source: 'Source2' },
        { symbol: 'AAPL', price: 102, timestamp: Date.now(), source: 'Source3' },
        { symbol: 'AAPL', price: 1000000, timestamp: Date.now(), source: 'Source4' }, // Outlier
      ];

      const result = aggregator.aggregate(prices);
      // Median = (101 + 102) / 2 = 101.5, not affected by the outlier
      expect(result).toBe(101.5);
    });

    it('should handle single price', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 123.45, timestamp: Date.now(), source: 'Source1' },
      ];

      const result = aggregator.aggregate(prices);
      expect(result).toBe(123.45);
    });

    it('should handle two prices', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 200, timestamp: Date.now(), source: 'Source2' },
      ];

      const result = aggregator.aggregate(prices);
      expect(result).toBe(150);
    });

    it('should throw error for empty array', () => {
      expect(() => {
        aggregator.aggregate([]);
      }).toThrow('Cannot aggregate empty price array');
    });

    it('should handle all same values', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source2' },
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source3' },
      ];

      const result = aggregator.aggregate(prices);
      expect(result).toBe(100);
    });

    it('should ignore weights parameter (median does not use weights)', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: 100, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: 200, timestamp: Date.now(), source: 'Source2' },
        { symbol: 'AAPL', price: 300, timestamp: Date.now(), source: 'Source3' },
      ];

      const weights = new Map([
        ['Source1', 100],
        ['Source2', 1],
        ['Source3', 1],
      ]);

      const result = aggregator.aggregate(prices, weights);
      // Median should still be 200, weights are ignored
      expect(result).toBe(200);
    });

    it('should handle negative prices', () => {
      const prices: NormalizedPrice[] = [
        { symbol: 'AAPL', price: -300, timestamp: Date.now(), source: 'Source1' },
        { symbol: 'AAPL', price: -100, timestamp: Date.now(), source: 'Source2' },
        { symbol: 'AAPL', price: -200, timestamp: Date.now(), source: 'Source3' },
      ];

      const result = aggregator.aggregate(prices);
      expect(result).toBe(-200);
    });

    it('should handle large datasets', () => {
      const prices: NormalizedPrice[] = Array.from({ length: 1001 }, (_, i) => ({
        symbol: 'AAPL',
        price: i,
        timestamp: Date.now(),
        source: `Source${i}`,
      }));

      const result = aggregator.aggregate(prices);
      // Median of 0-1000 is 500
      expect(result).toBe(500);
    });
  });
});
