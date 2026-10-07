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

@Entity({ name: "jobs", schema: "public" })
export class Job {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ type: "text" })
  title!: string;

  @Column({ type: "integer", nullable: true })
  salary!: number | null;

  @Column({ type: "text" })
  company!: string;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @ManyToOne(() => User, (user) => user.jobs, {
    nullable: false,
  })
  @JoinColumn({ name: "created_by" })
  createdBy!: Relation<User>;

  @RelationId((job: Job) => job.createdBy)
  createdById!: string;
}
