import { NormalizedPrice } from './normalized-price.interface';

/**
 * Interface for aggregation strategy implementations
 * Each strategy implements a different method for calculating consensus price
 */
export interface IAggregator {
  /**
   * Calculate consensus price from multiple normalized prices
   * @param prices Array of normalized prices from different sources
   * @param weights Optional weights per source (key: source name, value: weight)
   * @returns The consensus price value
   */
  aggregate(prices: NormalizedPrice[], weights?: Map<string, number>): number;

  /**
   * Name of the aggregation method
   */
  readonly name: string;
}
