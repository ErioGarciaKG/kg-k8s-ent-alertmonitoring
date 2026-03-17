
import { Command, Console } from 'nestjs-console';
import { AlertMonitoringService } from './alert-monitoring.service';

@Console()
export class AlertMonitoringCommand {
  constructor(private readonly service: AlertMonitoringService) {}

  @Command({
    command: 'alert:monitoring',
    description: 'Monitor the alerts queue and detect if any need to be updated.',
  })
  async handle(): Promise<void> {
    await this.service.run();
  }
}