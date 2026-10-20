import { CreateDateColumn, UpdateDateColumn } from 'typeorm';

export abstract class BaseEntity {
  public static get TABLE_NAME(): string {
    throw new Error(
      `Implementation error. Override TABLE_NAME getter in ${this.name} class`,
    );
  }

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
