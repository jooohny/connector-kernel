import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import type {
  DeepPartial,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
} from 'typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { DatabaseException } from '@core/exceptions/classes/database.exception';

import type { ConstraintViolationError } from './repository.types';
import { SqlState } from './sql-state';

export abstract class BaseRepository<
  Entity extends ObjectLiteral,
> extends Repository<Entity> {
  protected constructor(entity: EntityTarget<Entity>, manager: EntityManager) {
    super(entity, manager);
  }

  /** INSERT ... ON CONFLICT (<unique columns>) [WHERE <partial index predicate>] DO NOTHING. */
  protected async insertOrIgnore(
    manager: EntityManager,
    values: QueryDeepPartialEntity<Entity>,
    unique: { readonly columns: string[]; readonly where?: string },
  ): Promise<Entity | null> {
    const columns = this.metadata
      .mapPropertyPathsToColumns(unique.columns)
      .map((column) => column.databaseName)
      .join(', ');
    const predicate =
      unique.where === undefined ? '' : ` WHERE ${unique.where}`;
    const [sql, parameters] = manager
      .createQueryBuilder()
      .insert()
      .into(this.target)
      .values(values)
      .updateEntity(false)
      .getQueryAndParameters();
    const raw: unknown = await manager.query(
      `${sql} ON CONFLICT (${columns})${predicate} DO NOTHING RETURNING *`,
      parameters,
    );

    return this.restoreOptionalFromRaw({ raw });
  }

  protected isConstraintViolationError(
    error: unknown,
  ): error is ConstraintViolationError {
    return (
      error instanceof QueryFailedError &&
      'constraint' in error &&
      typeof error.constraint === 'string'
    );
  }

  protected hasSqlState(error: unknown, sqlState: SqlState): boolean {
    if (error instanceof QueryFailedError) {
      const driverError: unknown = error.driverError;

      return (
        typeof driverError === 'object' &&
        driverError !== null &&
        'code' in driverError &&
        driverError.code === sqlState
      );
    }

    return false;
  }

  protected handleError(error: unknown): never {
    if (this.hasSqlState(error, SqlState.LOCK_NOT_AVAILABLE)) {
      throw new DatabaseException(
        DatabaseException.Message.QUERIED_ROWS_ARE_LOCKED,
      );
    }

    if (this.isConstraintViolationError(error)) {
      this.processConstraintViolationError(error);
    }

    throw error;
  }

  protected abstract processConstraintViolationError(
    error: ConstraintViolationError,
  ): never;

  protected restoreFromRaw(raw: Record<string, unknown>): Entity {
    const plain: Record<string, unknown> = {};

    for (const column of this.metadata.columns) {
      if (column.databaseName in raw) {
        // The driver applies column transformers, as for any hydrated row.
        plain[column.propertyName] =
          this.manager.connection.driver.prepareHydratedValue(
            raw[column.databaseName],
            column,
          );
      }
    }

    return this.create(<DeepPartial<Entity>>plain);
  }

  protected restoreSingleFromRaw(result: { raw: unknown }): Entity {
    const entity: Entity | null = this.restoreOptionalFromRaw(result);

    if (entity === null) {
      throw new DatabaseException(
        DatabaseException.Message.UNEXPECTED_EMPTY_RESULT,
      );
    }

    return entity;
  }

  protected restoreOptionalFromRaw(result: { raw: unknown }): Entity | null {
    const rows: unknown = result.raw;

    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    if (rows.length > 1) {
      throw new DatabaseException(DatabaseException.Message.UNEXPECTED_RESULT);
    }

    return this.restoreFromRaw(<Record<string, unknown>>rows[0]);
  }
}
