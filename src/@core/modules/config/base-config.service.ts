import type { ConfigService as NestConfigService } from '@nestjs/config';

import { ConfigurationException } from '../../exceptions/classes/configuration.exception';

export abstract class BaseConfigService<T> {
  protected abstract readonly KeyToEnvNameMap: { [key in keyof T]: string };
  protected abstract readonly nestConfigService: NestConfigService;

  protected failWithConfigError(description: string): never {
    throw new ConfigurationException({
      message: ConfigurationException.Message.WRONG_ENV_VALUE,
      description,
    });
  }

  protected failWithMissingEnv(environmentName: string): never {
    throw new ConfigurationException({
      message: ConfigurationException.Message.MISSED_ENV_VALUE,
      description: `"${environmentName}" is not defined`,
    });
  }

  protected get config(): Map<keyof T & string, string | undefined> {
    return new Map(
      Object.entries(this.KeyToEnvNameMap).map(([key, environmentName]) => [
        <keyof T & string>key,
        this.nestConfigService.get<string>(<string>environmentName),
      ]),
    );
  }
}
