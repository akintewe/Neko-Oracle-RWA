/**
 * Configuration for the aggregation service
 */
export interface AggregationConfig {
  /** Minimum number of sources required to produce a valid result */
  minSources: number;

  /** Time window for aggregation in milliseconds (e.g., 30000 for 30 seconds) */
  timeWindowMs: number;

  /** Default aggregation method to use */
  defaultMethod: 'weighted-average' | 'median' | 'trimmed-mean';

  /** Percentage of extremes to trim in trimmed-mean (0.0 to 0.5) */
  trimmedMeanPercentage: number;

  /** Source weights configuration */
  sourceWeights: Record<string, number>;
}
