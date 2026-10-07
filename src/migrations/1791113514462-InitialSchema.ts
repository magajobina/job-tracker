import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1791113514462 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.users (
        id BIGSERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE public.jobs (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        created_by BIGINT NOT NULL
          REFERENCES public.users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE public.applications (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL
          REFERENCES public.users(id),
        job_id BIGINT NOT NULL
          REFERENCES public.jobs(id),
        status TEXT NOT NULL DEFAULT 'new'
          CHECK (
            status IN (
              'new',
              'screening',
              'interview',
              'offer',
              'rejected'
            )
          ),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, job_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE public.applications
    `);

    await queryRunner.query(`
      DROP TABLE public.jobs
    `);

    await queryRunner.query(`
      DROP TABLE public.users
    `);
  }
}
