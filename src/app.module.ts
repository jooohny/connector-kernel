import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { buildDataSourceOptions } from './modules/payments/infrastructure/persistence/database/data-source-options';
import { ConfigModule } from '@core/modules/config';

import { HealthModule } from './modules/health';
import { PaymentsModule } from './modules/payments';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({ useFactory: buildDataSourceOptions }),
    HealthModule,
    PaymentsModule,
  ],
})
export class AppModule {}
