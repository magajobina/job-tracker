import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
} from "typeorm";
import { User } from "./user.entity.js";
import type { Relation } from "typeorm";
import { Job } from "./job.entity.js";

export const APPLICATION_STATUSES = [
  "new",
  "screening",
  "interview",
  "offer",
  "rejected",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

@Entity({ name: "applications", schema: "public" })
export class Application {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @ManyToOne(() => User, {
    nullable: false,
  })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @RelationId((application: Application) => application.user)
  userId!: string;

  @ManyToOne(() => Job, {
    nullable: false,
  })
  @JoinColumn({ name: "job_id" })
  job!: Relation<Job>;

  @RelationId((application: Application) => application.job)
  jobId!: string;

  @Column({
    type: "text",
    default: "new",
  })
  status!: ApplicationStatus;

  @Column({
    name: "created_at",
    type: "timestamptz",
    default: () => "now()",
  })
  createdAt!: Date;
}
