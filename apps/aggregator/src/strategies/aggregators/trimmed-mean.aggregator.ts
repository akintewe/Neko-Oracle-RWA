import { Injectable } from '@nestjs/common';
import { IAggregator } from '../../interfaces/aggregator.interface';
import { NormalizedPrice } from '../../interfaces/normalized-price.interface';

/**
 * Trimmed Mean Aggregator
 * 
 * Calculates the mean after removing a percentage of the highest and
 * lowest values. For example, with a 20% trim, the highest 20% and
 * lowest 20% of prices are discarded before calculating the average.
 * 
 * Use case: Balanced approach between mean and median. Removes outliers
 * while still using most of the data.
 * 
 * Pros:
 * - Resistant to outliers (discards extremes)
 * - Uses more data than median
 * - Good balance between robustness and sensitivity
 * - Can be weighted after trimming
 * 
 * Cons:
 * - Requires sufficient data points to trim effectively
 * - Trim percentage needs careful tuning
 * - May discard valid extreme prices in volatile markets
 */
@Injectable()
export class TrimmedMeanAggregator implements IAggregator {
  readonly name = 'trimmed-mean';

  constructor(private readonly trimPercentage: number = 0.2) {
    if (trimPercentage < 0 || trimPercentage >= 0.5) {
      throw new Error('Trim percentage must be between 0 and 0.5');
    }
  }

  aggregate(prices: NormalizedPrice[], weights?: Map<string, number>): number {
    if (prices.length === 0) {
      throw new Error('Cannot aggregate empty price array');
    }

    // Need at least 3 prices to trim meaningfully
    if (prices.length < 3) {
      // Fall back to simple average for small datasets
      return this.calculateWeightedAverage(prices, weights);
    }

    // Sort prices by value
    const sortedPrices = [...prices].sort((a, b) => a.price - b.price);

    // Calculate number of prices to trim from each end
    const trimCount = Math.floor(sortedPrices.length * this.trimPercentage);

    // Trim extreme values from both ends
    const trimmedPrices = sortedPrices.slice(trimCount, sortedPrices.length - trimCount);

    // Calculate weighted average of trimmed prices
    return this.calculateWeightedAverage(trimmedPrices, weights);
  }

  private calculateWeightedAverage(
    prices: NormalizedPrice[],
    weights?: Map<string, number>,
  ): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const priceData of prices) {
      const weight = priceData.weight ?? weights?.get(priceData.source) ?? 1;
      weightedSum += priceData.price * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) {
      throw new Error('Total weight cannot be zero');
    }

    return weightedSum / totalWeight;
  }
}
