/**
 * Final aggregated price result with confidence metrics
 * This is the output of the aggregation engine
 */
export interface AggregatedPrice {
  /** Trading symbol (e.g., AAPL, GOOGL) */
  symbol: string;

  /** Consensus price calculated from multiple sources */
  price: number;

  /** Method used for aggregation */
  method: 'weighted-average' | 'median' | 'trimmed-mean';

  /** Confidence score (0-100) based on agreement between sources */
  confidence: number;

  /** Statistical metrics */
  metrics: {
    /** Standard deviation of source prices */
    standardDeviation: number;
    /** Spread between min and max prices (as percentage) */
    spread: number;
    /** Number of sources used in calculation */
    sourceCount: number;
    /** Variance of the prices */
    variance: number;
  };

  /** Timestamp of the aggregation window start */
  startTimestamp: number;

  /** Timestamp of the aggregation window end */
  endTimestamp: number;

  /** Sources included in the aggregation */
  sources: string[];

  /** Timestamp when this aggregation was computed */
  computedAt: number;
}
