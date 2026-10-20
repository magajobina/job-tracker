import { MigrationInterface, QueryRunner } from "typeorm";

export class AddExports1792234009388 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.exports (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL
          REFERENCES public.users(id),
        operation TEXT NOT NULL,
        format TEXT NOT NULL DEFAULT 'csv'
          CHECK (format IN ('csv')),
        status TEXT NOT NULL DEFAULT 'queued'
          CHECK (
            status IN (
              'queued',
              'processing',
              'completed',
              'failed'
            )
          ),
        idempotency_key VARCHAR(128) NOT NULL,
        request_fingerprint VARCHAR(64) NOT NULL,
        file_path TEXT,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        
        CONSTRAINT "UQ_exports_user_operation_idempotency_key"
          UNIQUE (user_id, operation, idempotency_key)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        DROP TABLE public.exports
        `);
  }
}
