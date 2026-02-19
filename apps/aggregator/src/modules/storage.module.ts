import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from '../services/storage.service';
import { MetricsModule } from '../metrics/metrics.module';

/**
 * StorageModule
 *
 * Provides and exports StorageService for Redis-backed price persistence.
 * Import this module wherever StorageService is needed.
 */
@Module({
  imports: [
    ConfigModule,   // StorageService reads REDIS_* vars via ConfigService
    MetricsModule,  // StorageService optionally injects MetricsService
  ],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
