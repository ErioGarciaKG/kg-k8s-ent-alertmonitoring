import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SQSClient,
  GetQueueUrlCommand,
  SendMessageCommand,
} from '@aws-sdk/client-sqs';

@Injectable()
export class SqsService {
  private readonly logger = new Logger(SqsService.name);
  private readonly client: SQSClient;
  private readonly env: string;

  constructor(private readonly config: ConfigService) {
    this.client = new SQSClient({
      region: this.config.get<string>('AWS_REGION', 'us-west-2'),
    });
    this.env = this.config.get<string>('ENV', 'local');
  }

  async send(queueName: string, payload: unknown): Promise<void> {
    if (this.env === 'local') {
      this.logger.debug(`[SQS SKIPPED] ${queueName}: ${JSON.stringify(payload)}`);
      return;
    }

    try {
      const prefixedName = `${this.env}-${queueName}`;

      const { QueueUrl } = await this.client.send(
        new GetQueueUrlCommand({ QueueName: prefixedName }),
      );

      await this.client.send(
        new SendMessageCommand({
          QueueUrl,
          MessageBody: JSON.stringify(payload),
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to send message to SQS queue "${queueName}"`, err);
      throw err;
    }
  }
}