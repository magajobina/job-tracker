import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Job } from "./job.entity.js";
import type { Relation } from "typeorm";

@Entity({ name: "users", schema: "public" })
export class User {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ type: "text", unique: true })
  email!: string;

  @Column({ name: "password_hash", type: "text", nullable: true })
  passwordHash!: string | null;

  @Column({ type: "text" })
  name!: string;

  @OneToMany(() => Job, (job) => job.createdBy)
  jobs!: Relation<Job[]>;
}
