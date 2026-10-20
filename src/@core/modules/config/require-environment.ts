import { ConfigurationException } from '../../exceptions/classes/configuration.exception';

/** One variable from the environment its caller passes in; empty counts as missing. */
export function requireEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
): string {
  const value = environment[name];

  if (value === undefined || value.trim().length === 0) {
    throw new ConfigurationException({
      message: ConfigurationException.Message.MISSED_ENV_VALUE,
      description: `"${name}" is not defined`,
    });
  }

  return value;
}
