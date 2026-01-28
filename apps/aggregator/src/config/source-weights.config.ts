/**
 * Source weight configuration
 * 
 * Higher weights = more trusted sources
 * These weights are used in weighted average and trimmed mean calculations
 * 
 * Weight Guidelines:
 * - 1.0: Standard reliability (default)
 * - 1.5-2.0: High reliability (major exchanges, premium APIs)
 * - 0.5-0.8: Lower reliability (free APIs, less established sources)
 * - 0.0: Disabled source (ignored in calculations)
 */
export const SOURCE_WEIGHTS: Record<string, number> = {
  // Premium financial data providers
  'Bloomberg': 2.0,
  'Reuters': 2.0,
  'AlphaVantage': 1.5,
  
  // Major financial data APIs
  'YahooFinance': 1.2,
  'Finnhub': 1.2,
  'IEX Cloud': 1.2,
  
  // Standard sources
  'Polygon': 1.0,
  'Twelve Data': 1.0,
  'MarketStack': 1.0,
  
  // Lower priority sources (free tier, rate-limited)
  'WorldTradingData': 0.8,
  'CryptoCompare': 0.8,
  
  // Default weight for unknown sources
  'default': 1.0,
};

/**
 * Get weight for a source, returns default if not found
 */
export function getSourceWeight(source: string): number {
  return SOURCE_WEIGHTS[source] ?? SOURCE_WEIGHTS['default'];
}
