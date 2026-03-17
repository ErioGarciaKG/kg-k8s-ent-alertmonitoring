import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import { AlertMonitoringService } from './alert-monitoring.service';
import { QueueMessage } from './queue-message.interface';

@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);
  private readonly queueKey: string;

  constructor(
    private readonly redis: RedisService,
    private readonly alertMonitoring: AlertMonitoringService,
    private readonly config: ConfigService,
  ) {
    this.queueKey = this.config.get<string>('REDIS_QUEUE_KEY', 'alert:queue');
  }

  async run(): Promise<void> {
    this.logger.log(`Waiting for message on queue "${this.queueKey}"...`);

    const msg = await this.redis.pop(this.queueKey);

    if (!msg) {
      this.logger.warn('No message received — exiting.');
      return;
    }

    if (msg.state !== 'ready') {
      this.logger.warn(`Skipping message with state "${msg.state}"`);
      return;
    }

    // Mark as started
    msg.state = 'started';
    msg['starting-time'] = new Date().toISOString();
    await this.redis.updateMessage(msg);
    this.logger.log(`[${msg.id}] Started`);

    const startTime = Date.now();

    try {
      await this.alertMonitoring.run();

      // Mark as completed
      const duration = (Date.now() - startTime) / 1000;
      msg.state = 'completed';
      msg['ending-time'] = new Date().toISOString();
      msg.duration = duration;
      await this.redis.updateMessage(msg);
      await this.redis.saveToHistory(msg);
      this.logger.log(`[${msg.id}] Completed in ${duration.toFixed(2)}s`);

    } catch (err) {
      // Mark as error
      const duration = (Date.now() - startTime) / 1000;
      msg.state = 'error';
      msg['ending-time'] = new Date().toISOString();
      msg.duration = duration;
      await this.redis.updateMessage(msg);
      await this.redis.saveToHistory(msg);
      this.logger.error(`[${msg.id}] Error after ${duration.toFixed(2)}s`, err);
    }
  }
}