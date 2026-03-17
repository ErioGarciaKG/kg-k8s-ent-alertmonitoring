import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertMonitoringService } from './alert-monitoring.service';
import { AlertMonitoringCommand } from './alert-monitoring.command';
import { AlertQueue } from './alert-queue.entity';
import { AlertMeta } from './alert-meta.entity';
import { SqsService } from './sqs.service';

@Module({
  imports: [TypeOrmModule.forFeature([AlertQueue, AlertMeta])],
  providers: [AlertMonitoringService, AlertMonitoringCommand, SqsService],
  exports: [AlertMonitoringService],
})
export class AlertMonitoringModule {}