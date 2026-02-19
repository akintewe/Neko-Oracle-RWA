import { Module } from '@nestjs/common';
import { PricesController } from '../controllers/prices.controller';
import { PriceFetcherService } from '../services/price-fetcher.service';
import { SchedulerService } from '../services/scheduler.service';
import { StockService } from '../services/stock.service';
import { FinnhubAdapter } from '../providers/finnhub.adapter';

@Module({
  controllers: [PricesController],
  providers: [
    PriceFetcherService, 
    StockService,        
    FinnhubAdapter,
    SchedulerService
  ],
  exports: [PriceFetcherService, StockService, SchedulerService], 
})
export class PricesModule {}
