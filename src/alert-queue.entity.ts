import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('alert_queue')
export class AlertQueue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column() alert_id: string;
  @Column() user_id: string;
  @Column() type: 'thumb' | 'timer';
  @Column('decimal', { precision: 10, scale: 7, nullable: true }) lat: number;
  @Column('decimal', { precision: 10, scale: 7, nullable: true }) lon: number;
  @Column() status: string;
  @Column({ nullable: true }) organization_id: string;
  @Column({ nullable: true }) monitoring_seconds: number;
  @Column({ nullable: true }) minutes: number;
  @Column({ nullable: true }) seconds: number;
  @Column({ nullable: true }) address: string;
  @Column({ nullable: true }) psap_id_1: string;
  @Column({ nullable: true }) psap_id_2: string;
  @Column({ nullable: true }) psap_id_3: string;
  @Column({ nullable: true }) police_id_1: string;
  @Column({ nullable: true }) police_id_2: string;
  @Column({ nullable: true }) police_id_3: string;
  @Column({ nullable: true }) h_psap_id_1: string;
  @Column({ nullable: true }) h_psap_id_2: string;
  @Column({ nullable: true }) h_psap_id_3: string;
  @Column({ nullable: true }) hospital_id_1: string;
  @Column({ nullable: true }) hospital_id_2: string;
  @Column({ nullable: true }) hospital_id_3: string;
  @Column({ nullable: true }) cc_sent: number;
  @Column({ nullable: true }) cc_attempt: number;

  @CreateDateColumn() created_at: Date;
}