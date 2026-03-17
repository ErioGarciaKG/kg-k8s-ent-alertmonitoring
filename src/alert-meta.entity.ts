import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('alert_meta')
export class AlertMeta {
  @PrimaryGeneratedColumn()
  id: number;

  @Column() alert_id: string;
  @Column() status: string;

  @CreateDateColumn() created_at: Date;
}