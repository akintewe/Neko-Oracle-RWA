import { Injectable } from '@nestjs/common';
import { IAggregator } from '../../interfaces/aggregator.interface';
import { NormalizedPrice } from '../../interfaces/normalized-price.interface';

/**
 * Median Aggregator
 * 
 * Calculates the median (middle value) of all prices. If there's an even
 * number of prices, returns the average of the two middle values.
 * 
 * Use case: When you want to be resistant to outliers and potential
 * manipulation attempts. The median is not affected by extreme values.
 * 
 * Pros:
 * - Highly resistant to outliers
 * - Not affected by a single manipulated source
 * - Good for volatile markets or when source reliability varies
 * 
 * Cons:
 * - Ignores the majority of data points
 * - Doesn't account for source reliability/weights
 * - Can be manipulated if >50% of sources are compromised
 */
@Injectable()
export class MedianAggregator implements IAggregator {
  readonly name = 'median';

  aggregate(prices: NormalizedPrice[], _weights?: Map<string, number>): number {
    if (prices.length === 0) {
      throw new Error('Cannot aggregate empty price array');
    }

    // Extract and sort prices
    const sortedPrices = prices.map(p => p.price).sort((a, b) => a - b);

    const length = sortedPrices.length;
    const middle = Math.floor(length / 2);

    // If odd number of prices, return the middle one
    if (length % 2 === 1) {
      return sortedPrices[middle];
    }

    // If even number of prices, return average of two middle values
    return (sortedPrices[middle - 1] + sortedPrices[middle]) / 2;
  }
}
