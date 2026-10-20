import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

import { BaseConfigService } from './base-config.service';

const DEFAULT_PORT = '3000';

const OPTIONAL_DEFAULTS: Readonly<Record<string, string>> = {
  port: DEFAULT_PORT,
  workersEnabled: 'true',
};

type ConfigKey = keyof ConfigService;

const NUMERIC_KEYS: readonly string[] = ['port'];
const BOOLEAN_KEYS: readonly string[] = ['workersEnabled'];
const BOOLEAN_VALUES: ReadonlyMap<string, boolean> = new Map([
  ['true', true],
  ['false', false],
]);

@Injectable()
export class ConfigService extends BaseConfigService<ConfigService> {
  public readonly port!: number;
  /** In-app inbox and sweep loops; tests turn them off. */
  public readonly workersEnabled!: boolean;

  protected readonly KeyToEnvNameMap: { [key in keyof ConfigService]: string } =
    {
      port: 'PORT',
      workersEnabled: 'WORKERS_ENABLED',
    };

  public constructor(protected readonly nestConfigService: NestConfigService) {
    super();

    for (const [key, rawValue] of this.config.entries()) {
      const environmentName = this.KeyToEnvNameMap[key];
      const value = this.applyDefault(key, rawValue);

      if (value === undefined) {
        this.failWithMissingEnv(environmentName);
      }

      if (NUMERIC_KEYS.includes(key)) {
        this.assignPositiveInteger(key, value, environmentName);

        continue;
      }

      if (BOOLEAN_KEYS.includes(key)) {
        this.assignBoolean(key, value, environmentName);

        continue;
      }

      this.assign(key, value);
    }
  }

  private applyDefault(
    key: string,
    value: string | undefined,
  ): string | undefined {
    if (value !== undefined && value.trim().length > 0) {
      return value;
    }

    return OPTIONAL_DEFAULTS[key];
  }

  private assignPositiveInteger(
    key: ConfigKey,
    value: string,
    environmentName: string,
  ): void {
    if (/^\d+$/.test(value) === false) {
      this.failWithConfigError(
        `"${environmentName}" must be a positive integer representation`,
      );
    }

    const parsed = Number(value);

    if (Number.isSafeInteger(parsed) === false || parsed <= 0) {
      this.failWithConfigError(
        `"${environmentName}" must be a positive integer representation`,
      );
    }

    this.assign(key, parsed);
  }

  private assignBoolean(
    key: ConfigKey,
    value: string,
    environmentName: string,
  ): void {
    const parsed = BOOLEAN_VALUES.get(value);

    if (parsed === undefined) {
      this.failWithConfigError(`"${environmentName}" must be true or false`);
    }

    this.assign(key, parsed);
  }

  private assign(key: ConfigKey, value: unknown): void {
    Object.defineProperty(this, key, {
      configurable: false,
      enumerable: true,
      value,
      writable: false,
    });
  }
}
