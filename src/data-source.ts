import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Job } from './entities/job.entity.js';
import { User } from './entities/user.entity.js';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  schema: 'public',
  entities: [User, Job],
  migrations: ['dist/src/migrations/*.js'],
  synchronize: false,
  logging: true,
});