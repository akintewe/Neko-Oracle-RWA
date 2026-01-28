import { AggregationService } from './services/aggregation.service';
import { NormalizedPrice } from './interfaces/normalized-price.interface';

/**
 * Demo script showcasing the Price Aggregation Engine
 * 
 * Run with: npx ts-node src/demo.ts
 */

async function demo() {
  console.log('='.repeat(70));
  console.log('🚀 Price Aggregation Engine Demo');
  console.log('='.repeat(70));
  console.log();

  const aggregationService = new AggregationService();

  // Scenario 1: Multiple sources with similar prices (high confidence)
  console.log('📊 Scenario 1: High Confidence - Closely Agreeing Sources');
  console.log('-'.repeat(70));
  
  const aaplPrices: NormalizedPrice[] = [
    { symbol: 'AAPL', price: 150.25, timestamp: Date.now(), source: 'Bloomberg' },
    { symbol: 'AAPL', price: 150.27, timestamp: Date.now(), source: 'AlphaVantage' },
    { symbol: 'AAPL', price: 150.23, timestamp: Date.now(), source: 'YahooFinance' },
    { symbol: 'AAPL', price: 150.26, timestamp: Date.now(), source: 'Finnhub' },
    { symbol: 'AAPL', price: 150.24, timestamp: Date.now(), source: 'Reuters' },
  ];

  const aaplResult = aggregationService.aggregate('AAPL', aaplPrices, {
    method: 'weighted-average',
  });

  console.log(`Symbol: ${aaplResult.symbol}`);
  console.log(`Consensus Price: $${aaplResult.price.toFixed(2)}`);
  console.log(`Method: ${aaplResult.method}`);
  console.log(`Confidence: ${aaplResult.confidence.toFixed(1)}%`);
  console.log(`Sources: ${aaplResult.sources.join(', ')}`);
  console.log(`Standard Deviation: $${aaplResult.metrics.standardDeviation.toFixed(4)}`);
  console.log(`Spread: ${aaplResult.metrics.spread.toFixed(2)}%`);
  console.log();

  // Scenario 2: Multiple sources with outlier (using median)
  console.log('📊 Scenario 2: Outlier Resistance - Using Median');
  console.log('-'.repeat(70));
  
  const googlPrices: NormalizedPrice[] = [
    { symbol: 'GOOGL', price: 2800.50, timestamp: Date.now(), source: 'Bloomberg' },
    { symbol: 'GOOGL', price: 2801.00, timestamp: Date.now(), source: 'AlphaVantage' },
    { symbol: 'GOOGL', price: 2799.75, timestamp: Date.now(), source: 'YahooFinance' },
    { symbol: 'GOOGL', price: 3500.00, timestamp: Date.now(), source: 'BadSource' }, // Outlier!
    { symbol: 'GOOGL', price: 2800.25, timestamp: Date.now(), source: 'Finnhub' },
  ];

  const googlMedian = aggregationService.aggregate('GOOGL', googlPrices, {
    method: 'median',
  });

  const googlAvg = aggregationService.aggregate('GOOGL', googlPrices, {
    method: 'weighted-average',
  });

  console.log(`Median Method (resistant to outliers):`);
  console.log(`  Price: $${googlMedian.price.toFixed(2)}`);
  console.log(`  Confidence: ${googlMedian.confidence.toFixed(1)}%`);
  console.log();
  console.log(`Weighted Average (affected by outlier):`);
  console.log(`  Price: $${googlAvg.price.toFixed(2)}`);
  console.log(`  Confidence: ${googlAvg.confidence.toFixed(1)}%`);
  console.log();
  console.log(`✅ Median protected us from the outlier!`);
  console.log();

  // Scenario 3: Using trimmed mean
  console.log('📊 Scenario 3: Balanced Approach - Trimmed Mean');
  console.log('-'.repeat(70));
  
  const msftPrices: NormalizedPrice[] = [
    { symbol: 'MSFT', price: 380.00, timestamp: Date.now(), source: 'Source1' },
    { symbol: 'MSFT', price: 385.00, timestamp: Date.now(), source: 'Source2' },
    { symbol: 'MSFT', price: 390.00, timestamp: Date.now(), source: 'Source3' },
    { symbol: 'MSFT', price: 395.00, timestamp: Date.now(), source: 'Source4' },
    { symbol: 'MSFT', price: 400.00, timestamp: Date.now(), source: 'Source5' },
  ];

  const msftTrimmed = aggregationService.aggregate('MSFT', msftPrices, {
    method: 'trimmed-mean',
    trimPercentage: 0.2, // Remove top and bottom 20%
  });

  console.log(`Symbol: ${msftTrimmed.symbol}`);
  console.log(`Consensus Price: $${msftTrimmed.price.toFixed(2)}`);
  console.log(`Method: ${msftTrimmed.method}`);
  console.log(`Trimmed: Top & bottom 20% removed`);
  console.log(`Used prices: $385, $390, $395 (middle 60%)`);
  console.log(`Confidence: ${msftTrimmed.confidence.toFixed(1)}%`);
  console.log();

  // Scenario 4: Multiple symbols at once
  console.log('📊 Scenario 4: Batch Processing - Multiple Symbols');
  console.log('-'.repeat(70));
  
  const pricesBySymbol = new Map<string, NormalizedPrice[]>([
    ['AAPL', aaplPrices],
    ['GOOGL', googlPrices],
    ['MSFT', msftPrices],
  ]);

  const batchResults = aggregationService.aggregateMultiple(pricesBySymbol, {
    method: 'weighted-average',
  });

  console.log('Aggregated Prices:');
  for (const [symbol, result] of batchResults) {
    console.log(`  ${symbol}: $${result.price.toFixed(2)} (confidence: ${result.confidence.toFixed(1)}%)`);
  }
  console.log();

  // Scenario 5: Low confidence demo
  console.log('📊 Scenario 5: Low Confidence - Divergent Sources');
  console.log('-'.repeat(70));
  
  const tslaPrices: NormalizedPrice[] = [
    { symbol: 'TSLA', price: 200.00, timestamp: Date.now(), source: 'Source1' },
    { symbol: 'TSLA', price: 250.00, timestamp: Date.now(), source: 'Source2' },
    { symbol: 'TSLA', price: 180.00, timestamp: Date.now(), source: 'Source3' },
  ];

  const tslaResult = aggregationService.aggregate('TSLA', tslaPrices);

  console.log(`Symbol: ${tslaResult.symbol}`);
  console.log(`Consensus Price: $${tslaResult.price.toFixed(2)}`);
  console.log(`Confidence: ${tslaResult.confidence.toFixed(1)}%`);
  console.log(`Spread: ${tslaResult.metrics.spread.toFixed(2)}%`);
  console.log(`⚠️  Low confidence due to high price variance!`);
  console.log();

  console.log('='.repeat(70));
  console.log('✅ Demo completed successfully!');
  console.log('='.repeat(70));
}

// Run demo
demo().catch(console.error);
