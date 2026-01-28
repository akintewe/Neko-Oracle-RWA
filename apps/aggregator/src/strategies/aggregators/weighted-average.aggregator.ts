import { Injectable } from '@nestjs/common';
import { IAggregator } from '../../interfaces/aggregator.interface';
import { NormalizedPrice } from '../../interfaces/normalized-price.interface';

/**
 * Weighted Average Aggregator
 * 
 * Calculates the weighted average of prices where more reliable sources
 * have higher weights. The formula is:
 * 
 * Weighted Average = Σ(price_i * weight_i) / Σ(weight_i)
 * 
 * Use case: When you trust certain sources more than others and want
 * their prices to have more influence on the final result.
 * 
 * Pros:
 * - Rewards trusted sources
 * - Smooth consensus price
 * - Good for stable markets
 * 
 * Cons:
 * - Susceptible to manipulation if a high-weight source is compromised
 * - Not resistant to outliers
 */
@Injectable()
export class WeightedAverageAggregator implements IAggregator {
  readonly name = 'weighted-average';

  aggregate(prices: NormalizedPrice[], weights?: Map<string, number>): number {
    if (prices.length === 0) {
      throw new Error('Cannot aggregate empty price array');
    }

    let weightedSum = 0;
    let totalWeight = 0;

    for (const priceData of prices) {
      // Use individual weight if provided, otherwise use source weight, default to 1
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
