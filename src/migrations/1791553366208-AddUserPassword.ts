import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserPassword1791553366208 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
          ALTER TABLE public.users
          ADD COLUMN password_hash TEXT NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
          ALTER TABLE public.users
          DROP COLUMN password_hash
        `);
  }
}
