import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return hello message', () => {
    expect(service.getHello()).toBe('Oracle Stock Price API');
  });

  it('should return health status', () => {
    const health = service.getHealth();
    expect(health.status).toBe('ok');
    expect(health.timestamp).toBeGreaterThan(0);
  });
});
