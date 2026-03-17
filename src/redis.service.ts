import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { QueueMessage } from './queue-message.interface';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD', ''),
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
  }

  onModuleInit() {
    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error('Redis error', err));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  /**
   * Block-pop one message ID from the list, then read the full
   * message hash — leaving the hash intact in Redis.
   */
  async pop(queueKey: string): Promise<QueueMessage | null> {
    // BRPOP only removes the ID from the list, not the hash
    const res = await this.client.brpop(queueKey, 5);
    if (!res) return null;

    const raw = res[1];

    // Support both formats:
    // - legacy: full JSON object pushed directly into the list
    // - new:    just an ID string, with data stored in a hash
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        // Legacy full-object format — store it as a hash for consistency
        if (!parsed.id) parsed.id = `msg-${Date.now()}`;
        await this.saveMessage(parsed);
        return parsed as QueueMessage;
      }
    } catch {
      // Not JSON — treat raw value as an ID
    }

    // ID-only format: fetch the hash
    const id = raw.trim();
    const data = await this.client.hgetall(`alert:${id}`);
    if (!data || Object.keys(data).length === 0) {
      this.logger.error(`No hash found for key alert:${id}`);
      return null;
    }

    return {
      id,
      state:           data['state'] as QueueMessage['state'],
      'starting-time': data['starting-time'],
      'ending-time':   data['ending-time'],
      duration:        parseFloat(data['duration'] ?? '0'),
    };
  }

  /** Save or update a message hash in Redis. */
  async updateMessage(msg: QueueMessage): Promise<void> {
    await this.saveMessage(msg);
    this.logger.log(`[${msg.id}] State updated to "${msg.state}"`);
  }

  /** Append the final message state to the history list. */
  async saveToHistory(msg: QueueMessage): Promise<void> {
    await this.client.lpush('alert:queue-history', JSON.stringify(msg));
    this.logger.log(`[${msg.id}] Saved to alert:queue-history`);
  }

  private async saveMessage(msg: QueueMessage): Promise<void> {
    const key = `alert:${msg.id}`;
    await Promise.all([
      this.client.hset(key, 'state',         msg.state),
      this.client.hset(key, 'starting-time', msg['starting-time']),
      this.client.hset(key, 'ending-time',   msg['ending-time']),
      this.client.hset(key, 'duration',      String(msg.duration)),
    ]);
  }
}