import { registerAs } from '@nestjs/config';

/**
 * Redis configuration factory.
 * Reads REDIS_* environment variables and exposes them as a typed config namespace.
 *
 * Usage: configService.get<ReturnType<typeof redisConfig>>('redis')
 */
export const redisConfig = registerAs('redis', () => ({
  url: process.env.REDIS_URL ?? '',
  priceTtlSeconds: parseInt(process.env.REDIS_PRICE_TTL_SECONDS ?? '300', 10),
  historyMaxEntries: parseInt(process.env.REDIS_HISTORY_MAX_ENTRIES ?? '100', 10),
  keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'price',
}));
