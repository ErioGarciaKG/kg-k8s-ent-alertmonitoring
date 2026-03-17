import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AlertQueue } from './alert-queue.entity';
import { AlertMeta } from './alert-meta.entity';
import { SqsService } from './sqs.service';

const ALERT_SQS_QUEUE = 'mobile-organization-alert-post';
const LOOP_DURATION_MS = 45_000;
const POLL_INTERVAL_MS = 10_000;
const THUMB_THRESHOLD_SECS = 20;
const META_THRESHOLD_SECS = 15;
const MAX_ALERT_META_RETRIES = 5;

@Injectable()
export class AlertMonitoringService {
  private readonly logger = new Logger(AlertMonitoringService.name);

  constructor(
    @InjectRepository(AlertQueue)
    private readonly alertQueueRepo: Repository<AlertQueue>,
    @InjectRepository(AlertMeta)
    private readonly alertMetaRepo: Repository<AlertMeta>,
    private readonly dataSource: DataSource,
    private readonly sqsService: SqsService,
  ) {}

  async run(): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < LOOP_DURATION_MS) {
      const thumbThreshold = new Date(Date.now() - THUMB_THRESHOLD_SECS * 1000);
      const metaThreshold = new Date(Date.now() - META_THRESHOLD_SECS * 1000);

      const alerts = await this.fetchAlerts(thumbThreshold, metaThreshold);

      for (const alert of alerts) {
        // Raw UNION query returns prefixed columns (aq_alert_id) — normalize them
        const alertId = alert.alert_id ?? (alert as any).aq_alert_id;

        alert.status = 'alert';
        await this.sqsService.send(ALERT_SQS_QUEUE, alert);
        await this.alertMetaRepo.save(
          this.alertMetaRepo.create({ alert_id: alertId, status: 'alert_monitoring' }),
        );
      }

      await this.sleep(POLL_INTERVAL_MS);
    }
  }

  private async fetchAlerts(
    thumbThreshold: Date,
    metaThreshold: Date,
  ): Promise<AlertQueue[]> {
    const selectedCols = [
      'aq.alert_id          AS alert_id',
      'aq.user_id           AS user_id',
      'aq.type              AS type',
      'aq.lat               AS lat',
      'aq.lon               AS lon',
      'aq.status            AS status',
      'aq.organization_id   AS organization_id',
      'aq.monitoring_seconds AS monitoring_seconds',
      'aq.minutes           AS minutes',
      'aq.seconds           AS seconds',
    ];

    // 1. Thumb alerts past the threshold
    const thumbQuery = this.dataSource
      .createQueryBuilder(AlertQueue, 'aq')
      .innerJoin(AlertMeta, 'am', 'am.alert_id = aq.alert_id')
      .select(selectedCols)
      .where('aq.status = :status', { status: 'armed' })
      .andWhere('am.status = :amStatus', { amStatus: 'armed' })
      .andWhere('aq.type = :type', { type: 'thumb' })
      .andWhere('am.created_at <= :threshold', { threshold: thumbThreshold });

    // 2. Timer alerts whose countdown (minutes + seconds) has elapsed
    const currentTime = new Date();
    const timerQuery = this.dataSource
      .createQueryBuilder(AlertQueue, 'aq')
      .innerJoin(AlertMeta, 'am', 'am.alert_id = aq.alert_id')
      .select(selectedCols)
      .where('aq.status = :status', { status: 'armed' })
      .andWhere('am.status = :amStatus', { amStatus: 'armed' })
      .andWhere('aq.type = :type', { type: 'timer' })
      .andWhere(
        `DATE_ADD(am.created_at, INTERVAL (COALESCE(aq.minutes, 0) * 60 + COALESCE(aq.seconds, 0)) SECOND) <= :currentTime`,
        { currentTime },
      );

    // 3. Active alerts with missing geocode / PSAP / hospital / cc data
    const missingDataQuery = this.dataSource
      .createQueryBuilder(AlertQueue, 'aq')
      .select(selectedCols)
      .where('aq.status = :status', { status: 'alert' })
      .andWhere(
        `(
          aq.address IS NULL
          OR COALESCE(aq.psap_id_1, aq.psap_id_2, aq.psap_id_3,
                      aq.police_id_1, aq.police_id_2, aq.police_id_3) IS NULL
          OR ((aq.cc_sent IS NULL OR aq.cc_sent <> 1) AND aq.cc_attempt <= :maxCc)
          OR COALESCE(aq.h_psap_id_1, aq.h_psap_id_2, aq.h_psap_id_3,
                      aq.hospital_id_1, aq.hospital_id_2, aq.hospital_id_3) IS NULL
        )`,
        { maxCc: MAX_ALERT_META_RETRIES },
      )
      // Exclude alerts with a recent alert_meta processing entry
      .andWhere(qb => {
        const sub = qb
          .subQuery()
          .select('1')
          .from(AlertMeta, 'am')
          .where('am.alert_id = aq.alert_id')
          .andWhere('am.created_at >= :metaThreshold', { metaThreshold })
          .andWhere("am.status IN ('alert_monitoring','police','hospitals','geocode_address')")
          .getQuery();
        return `NOT EXISTS ${sub}`;
      })
      // Exclude alerts that have exceeded the retry cap
      .andWhere(qb => {
        const sub = qb
          .subQuery()
          .select('1')
          .from(AlertMeta, 'am')
          .where('am.alert_id = aq.alert_id')
          .andWhere("am.status = 'alert_monitoring'")
          .groupBy('am.alert_id')
          .having('COUNT(am.id) > :maxRetries', { maxRetries: MAX_ALERT_META_RETRIES })
          .getQuery();
        return `NOT EXISTS ${sub}`;
      });

    const [thumbSql, thumbParams] = thumbQuery.getQueryAndParameters();
    const [timerSql, timerParams] = timerQuery.getQueryAndParameters();
    const [missSql, missParams] = missingDataQuery.getQueryAndParameters();

    const raw = await this.dataSource.query(
      `(${thumbSql}) UNION (${timerSql}) UNION (${missSql})`,
      [...thumbParams, ...timerParams, ...missParams],
    );

    return raw as AlertQueue[];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}