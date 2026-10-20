import { Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';

import { ConfigService } from '@core/modules/config/index';

import { ProcessWebhooksUseCase } from './use-cases/process-webhooks.use-case';
import { RunStatusSweepUseCase } from './use-cases/run-status-sweep.use-case';

@Injectable()
export class PaymentWorkers implements OnApplicationBootstrap {
  public constructor(
    private readonly processWebhooksUseCase: ProcessWebhooksUseCase,
    private readonly runStatusSweepUseCase: RunStatusSweepUseCase,
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  public onApplicationBootstrap(): void {
    if (this.config.workersEnabled) {
      for (const name of ['payments-inbox', 'payments-sweep']) {
        this.scheduler.getCronJob(name).start();
      }
    }
  }

  @Cron('* * * * * *', {
    name: 'payments-inbox',
    waitForCompletion: true,
    disabled: true,
  })
  public async processWebhooks(): Promise<void> {
    return this.processWebhooksUseCase.run(new Date());
  }

  @Cron('*/5 * * * * *', {
    name: 'payments-sweep',
    waitForCompletion: true,
    disabled: true,
  })
  public async runStatusSweep(): Promise<void> {
    return this.runStatusSweepUseCase.run(new Date());
  }
}
