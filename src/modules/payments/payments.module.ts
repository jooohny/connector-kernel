import { Module } from '@nestjs/common';

import { CreatePaymentUseCase } from './application-services/payments/use-cases/create-payment.use-case';
import { GetPaymentUseCase } from './application-services/payments/use-cases/get-payment.use-case';
import { PaymentOrchestrator } from './application-services/payment-orchestrator/payment-orchestrator';
import { PaymentWorkers } from './application-services/workers/payment-workers';
import { PaymentsServiceImplementation } from './application-services/payments/payments.service';
import { PAYMENTS_SERVICE } from './application-services/payments/payments.service.types';
import { ProcessWebhooksUseCase } from './application-services/workers/use-cases/process-webhooks.use-case';
import { VerifyWebhookUseCase } from './application-services/webhooks/use-cases/verify-webhook.use-case';
import { RecordWebhookUseCase } from './application-services/webhooks/use-cases/record-webhook.use-case';
import { RunStatusSweepUseCase } from './application-services/workers/use-cases/run-status-sweep.use-case';
import { WebhooksServiceImplementation } from './application-services/webhooks/webhooks.service';
import { WEBHOOKS_SERVICE } from './application-services/webhooks/webhooks.service.types';
import {
  ATTEMPT_REPOSITORY,
  AttemptTransitionPolicy,
  CONNECTORS,
  ConnectorRoutes,
  PAYMENT_REPOSITORY,
  PaymentDecider,
  PROVIDER_EVENT_REPOSITORY,
  REVIEW_REPOSITORY,
  SweepSchedule,
  WEBHOOK_DELIVERY_REPOSITORY,
} from './domain';
import { buildConnectorRegistry } from './infrastructure/connectors/connector-registry';
import { FetchHttpClient } from './infrastructure/connectors/fetch-http-client';
import { HTTP_CLIENT } from './infrastructure/connectors/http-client';
import { AttemptRepositoryImplementation } from './infrastructure/persistence/repositories/attempt.repository';
import { PaymentRepositoryImplementation } from './infrastructure/persistence/repositories/payment.repository';
import { ProviderEventRepositoryImplementation } from './infrastructure/persistence/repositories/provider-event.repository';
import { ReviewRepositoryImplementation } from './infrastructure/persistence/repositories/review.repository';
import { WebhookDeliveryRepositoryImplementation } from './infrastructure/persistence/repositories/webhook-delivery.repository';
import { PaymentsController } from './ui/http/payments/payments.controller';
import { PaymentsPresenter } from './ui/http/payments/payments.presenter';
import { WebhooksController } from './ui/http/webhooks/webhooks.controller';
import { WebhooksPresenter } from './ui/http/webhooks/webhooks.presenter';

import { WebhookSignatureGuard } from './ui/http/webhooks/webhook-signature.guard';

@Module({
  controllers: [PaymentsController, WebhooksController],
  providers: [
    PaymentsPresenter,
    WebhooksPresenter,
    { provide: PAYMENT_REPOSITORY, useClass: PaymentRepositoryImplementation },
    { provide: ATTEMPT_REPOSITORY, useClass: AttemptRepositoryImplementation },
    { provide: REVIEW_REPOSITORY, useClass: ReviewRepositoryImplementation },
    {
      provide: PROVIDER_EVENT_REPOSITORY,
      useClass: ProviderEventRepositoryImplementation,
    },
    {
      provide: WEBHOOK_DELIVERY_REPOSITORY,
      useClass: WebhookDeliveryRepositoryImplementation,
    },
    { provide: HTTP_CLIENT, useClass: FetchHttpClient },
    {
      provide: CONNECTORS,
      useFactory: buildConnectorRegistry,
      inject: [HTTP_CLIENT],
    },
    PaymentDecider,
    AttemptTransitionPolicy,
    ConnectorRoutes,
    SweepSchedule,
    PaymentOrchestrator,
    CreatePaymentUseCase,
    GetPaymentUseCase,
    RecordWebhookUseCase,
    VerifyWebhookUseCase,
    WebhookSignatureGuard,
    ProcessWebhooksUseCase,
    RunStatusSweepUseCase,
    { provide: PAYMENTS_SERVICE, useClass: PaymentsServiceImplementation },
    { provide: WEBHOOKS_SERVICE, useClass: WebhooksServiceImplementation },
    PaymentWorkers,
  ],
  exports: [PAYMENTS_SERVICE, WEBHOOKS_SERVICE],
})
export class PaymentsModule {}
