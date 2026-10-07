import { MigrationInterface, QueryRunner } from "typeorm";

export class AddJobSalary1791113850789 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
      await queryRunner.query(`
        ALTER TABLE public.jobs
        ADD COLUMN salary INTEGER
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
      await queryRunner.query(`
        ALTER TABLE public.jobs
        DROP COLUMN salary
        `)
    }

}
