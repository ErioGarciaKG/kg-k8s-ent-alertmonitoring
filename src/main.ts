
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WorkerService } from './worker.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const worker = app.get(WorkerService);

  try {
    await worker.run();
  } finally {
    await app.close();
  }
}

bootstrap();