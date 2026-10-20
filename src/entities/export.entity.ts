import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
  Unique,
} from "typeorm";
import { User } from "./user.entity.js";
import type { Relation } from "typeorm";

export const EXPORT_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
] as const;

export const FORMATS = ["csv"] as const;

export type ExportStatus = (typeof EXPORT_STATUSES)[number];
export type ExportFormat = (typeof FORMATS)[number];

@Entity({ name: "exports", schema: "public" })
@Unique("UQ_exports_user_operation_idempotency_key", [
  "user",
  "operation",
  "idempotencyKey",
])
export class ExportRecord {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @ManyToOne(() => User, {
    nullable: false,
  })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @RelationId((exportRecord: ExportRecord) => exportRecord.user)
  userId!: string;

  @Column({ type: "text" })
  operation!: string;

  @Column({
    type: "text",
    default: "csv",
  })
  format!: ExportFormat;

  @Column({
    type: "text",
    default: "queued",
  })
  status!: ExportStatus;

  @Column({ type: "varchar", length: 128, name: "idempotency_key" })
  idempotencyKey!: string;

  @Column({ type: "varchar", length: 64, name: "request_fingerprint" })
  requestFingerprint!: string;

  @Column({ type: "text", name: "file_path", nullable: true })
  filePath!: string | null;

  @Column({ type: "text", name: "error_message", nullable: true })
  errorMessage!: string | null;

  @Column({
    name: "created_at",
    type: "timestamptz",
    default: () => "now()",
  })
  createdAt!: Date;
}
