export enum HealthStatus {
  OK = 'ok',
}

export interface HealthService {
  check(): Promise<void>;
}
