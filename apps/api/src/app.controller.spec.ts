import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    controller = module.get<AppController>(AppController);
    service = module.get<AppService>(AppService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return hello message', () => {
    expect(controller.getHello()).toBe('Oracle Stock Price API');
  });

  it('should return health status', () => {
    const health = controller.getHealth();
    expect(health.status).toBe('ok');
    expect(health.timestamp).toBeGreaterThan(0);
  });
});
