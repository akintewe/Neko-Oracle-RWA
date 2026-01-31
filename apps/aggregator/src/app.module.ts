import { Module } from '@nestjs/common';
import { NormalizationModule } from './modules/normalization.module';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DataReceptionService } from './services/data-reception.service';
import { AggregationService } from './services/aggregation.service';
import { WeightedAverageAggregator } from './strategies/aggregators/weighted-average.aggregator';
import { MedianAggregator } from './strategies/aggregators/median.aggregator';
import { TrimmedMeanAggregator } from './strategies/aggregators/trimmed-mean.aggregator';

@Module({
  imports: [
    NormalizationModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
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
export class AppModule { }
