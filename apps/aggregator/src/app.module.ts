import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NormalizationModule } from './modules/normalization.module';
import { StorageModule } from './modules/storage.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { DebugModule } from './debug/debug.module';
import { DataReceptionService } from './services/data-reception.service';
import { AggregationService } from './services/aggregation.service';
import { WeightedAverageAggregator } from './strategies/aggregators/weighted-average.aggregator';
import { MedianAggregator } from './strategies/aggregators/median.aggregator';
import { TrimmedMeanAggregator } from './strategies/aggregators/trimmed-mean.aggregator';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    NormalizationModule,
    HealthModule,
    MetricsModule,
    DebugModule,
    StorageModule,
    HttpModule,
    EventEmitterModule.forRoot(),
  ],
  controllers: [],
  providers: [
    DataReceptionService,
    AggregationService,
    WeightedAverageAggregator,
    MedianAggregator,
    TrimmedMeanAggregator,
  ],
  exports: [AggregationService],
})
export class AppModule {}
