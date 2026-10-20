import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Job } from './entities/job.entity.js';
import { User } from './entities/user.entity.js';
import { Application } from './entities/application.entity.js';
import { ExportRecord } from './entities/export.entity.js';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  schema: 'public',
  entities: [User, Job, Application, ExportRecord],
  migrations: ['dist/src/migrations/*.js'],
  synchronize: false,
  logging: false,
});