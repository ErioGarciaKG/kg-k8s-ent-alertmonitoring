import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkerService } from './worker.service';
import { RedisService } from './redis.service';
import { AlertMonitoringModule } from './alert-monitoring.module';
import { AlertQueue } from './alert-queue.entity';
import { AlertMeta } from './alert-meta.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host:     config.get<string>('DB_HOST'),
        port:     config.get<number>('DB_PORT', 3306),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        entities: [AlertQueue, AlertMeta],
        synchronize: false,
      }),
    }),

    AlertMonitoringModule,
  ],
  providers: [RedisService, WorkerService],
})
export class AppModule {}