import { db } from "./db";
import { automationJobs, automationLogs } from "@shared/schema";
import { eq, and, lt, gte, lte, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export type JobType = typeof import("@shared/schema").automationJobTypes[number];

export interface EnqueueJobOptions {
  jobType: string;
  companyId: string;
  payload?: Record<string, unknown>;
  maxRetries?: number;
  scheduledAt?: string;
  createdBy?: string;
}

export interface JobRecord {
  id: string;
  companyId: string;
  jobType: string;
  status: string;
  payload: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  screenshotPath?: string | null;
  errorMessage?: string | null;
  retryCount: number;
  maxRetries: number;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export class QueueService {
  async enqueueJob(options: EnqueueJobOptions): Promise<JobRecord> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const [row] = await db
      .insert(automationJobs)
      .values({
        id,
        companyId: options.companyId,
        jobType: options.jobType,
        status: "pending",
        payload: options.payload ?? {},
        retryCount: 0,
        maxRetries: options.maxRetries ?? 3,
        scheduledAt: options.scheduledAt ?? null,
        createdBy: options.createdBy ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return row as JobRecord;
  }

  async claimNextJob(): Promise<JobRecord | null> {
    const now = new Date().toISOString();
    try {
      const rows = await db.execute(sql`
        UPDATE automation_jobs
        SET status = 'running',
            started_at = ${now},
            updated_at = ${now}
        WHERE id = (
          SELECT id FROM automation_jobs
          WHERE status = 'pending'
            AND (scheduled_at IS NULL OR scheduled_at <= ${now})
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `);
      const row = (rows as any).rows?.[0] ?? null;
      if (!row) return null;
      return this._mapRow(row);
    } catch {
      return null;
    }
  }

  async markJobPaused(id: string, screenshotPath: string): Promise<void> {
    await db
      .update(automationJobs)
      .set({
        status: "paused",
        screenshotPath,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(automationJobs.id, id));
  }

  async markJobResumed(id: string): Promise<void> {
    await db
      .update(automationJobs)
      .set({
        status: "running",
        screenshotPath: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(automationJobs.id, id));
  }

  async markJobCompleted(id: string, result?: Record<string, unknown>): Promise<void> {
    const now = new Date().toISOString();
    await db
      .update(automationJobs)
      .set({
        status: "completed",
        result: result ?? {},
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(automationJobs.id, id));
  }

  async markJobFailed(id: string, errorMessage: string): Promise<void> {
    const now = new Date().toISOString();
    // Increment retry count
    await db.execute(sql`
      UPDATE automation_jobs
      SET status = CASE
            WHEN retry_count + 1 < max_retries THEN 'pending'
            ELSE 'failed'
          END,
          retry_count = retry_count + 1,
          error_message = ${errorMessage},
          completed_at = CASE WHEN retry_count + 1 >= max_retries THEN ${now} ELSE NULL END,
          updated_at = ${now}
      WHERE id = ${id}
    `);
  }

  async retryJob(id: string): Promise<void> {
    const now = new Date().toISOString();
    await db
      .update(automationJobs)
      .set({
        status: "pending",
        retryCount: 0,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        updatedAt: now,
      })
      .where(and(eq(automationJobs.id, id), inArray(automationJobs.status, ["failed", "cancelled"])));
  }

  async cancelJob(id: string): Promise<void> {
    await db
      .update(automationJobs)
      .set({ status: "cancelled", updatedAt: new Date().toISOString() })
      .where(and(eq(automationJobs.id, id), eq(automationJobs.status, "pending")));
  }

  /**
   * Force-cancel a job in ANY non-terminal state (pending, running, or paused).
   * Used by the "Kill" action so a stuck/long-running job can be stopped on demand
   * instead of waiting for the 15-minute recovery cron.
   */
  async forceCancelJob(id: string): Promise<void> {
    const now = new Date().toISOString();
    await db
      .update(automationJobs)
      .set({ status: "cancelled", completedAt: now, updatedAt: now })
      .where(and(eq(automationJobs.id, id), inArray(automationJobs.status, ["pending", "running", "paused"])));
  }

  /**
   * Cancel ALL pending + paused jobs for a given company whose jobType starts
   * with the portal prefix (e.g. "epfo" cancels all epfo_* jobs).
   * Called before a fresh login test so the queue is clean.
   * Returns the number of rows cancelled.
   */
  async cancelPortalJobs(companyId: string, portal: string): Promise<number> {
    const now = new Date().toISOString();
    const result = await db.execute(sql`
      UPDATE automation_jobs
      SET status = 'cancelled', updated_at = ${now}
      WHERE company_id = ${companyId}
        AND status IN ('pending', 'paused')
        AND job_type LIKE ${portal + "_%"}
    `);
    return (result as any).rowCount ?? 0;
  }

  /**
   * Cancel ONLY paused (stuck) jobs for a portal — preserves pending jobs so
   * they can execute immediately after login completes.
   * Returns the number of rows cancelled.
   */
  async cancelStuckPortalJobs(companyId: string, portal: string): Promise<number> {
    const now = new Date().toISOString();
    const result = await db.execute(sql`
      UPDATE automation_jobs
      SET status = 'cancelled', updated_at = ${now}
      WHERE company_id = ${companyId}
        AND status = 'paused'
        AND job_type LIKE ${portal + "_%"}
    `);
    return (result as any).rowCount ?? 0;
  }

  /** Permanently delete a job and all its logs. Running/paused jobs cannot be deleted. */
  async deleteJob(id: string): Promise<{ deleted: boolean; reason?: string }> {
    const rows = await db.select().from(automationJobs).where(eq(automationJobs.id, id));
    if (!rows.length) return { deleted: false, reason: "not_found" };
    const job = rows[0];
    if (["running", "paused"].includes(job.status as string)) {
      return { deleted: false, reason: "job_active" };
    }
    await db.delete(automationLogs).where(eq(automationLogs.jobId, id));
    await db.delete(automationJobs).where(eq(automationJobs.id, id));
    return { deleted: true };
  }

  /**
   * Retry all failed jobs that still have remaining retries.
   * Resets retry_count to 0 so they get a fresh attempt cycle.
   * Returns the number of jobs re-queued.
   */
  async retryFailedJobs(companyId?: string): Promise<number> {
    const now = new Date().toISOString();
    const conditions = [eq(automationJobs.status, "failed")];
    if (companyId) conditions.push(eq(automationJobs.companyId, companyId));
    const result = await db.execute(sql`
      UPDATE automation_jobs
      SET status = 'pending',
          retry_count = 0,
          error_message = NULL,
          started_at = NULL,
          completed_at = NULL,
          updated_at = ${now}
      WHERE status = 'failed'
        ${companyId ? sql`AND company_id = ${companyId}` : sql``}
    `);
    return (result as any).rowCount ?? 0;
  }

  /** Reset stuck "running" jobs older than `stuckMinutes` back to pending */
  async recoverStuckJobs(stuckMinutes = 15): Promise<number> {
    const cutoff = new Date(Date.now() - stuckMinutes * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const result = await db.execute(sql`
      UPDATE automation_jobs
      SET status = 'pending',
          started_at = NULL,
          updated_at = ${now}
      WHERE status = 'running'
        AND updated_at < ${cutoff}
    `);
    return (result as any).rowCount ?? 0;
  }

  async getJob(id: string): Promise<JobRecord | null> {
    const rows = await db
      .select()
      .from(automationJobs)
      .where(eq(automationJobs.id, id))
      .limit(1);
    return rows[0] ? (rows[0] as JobRecord) : null;
  }

  async listJobs(filters: {
    companyId?: string;
    status?: string;
    jobType?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<JobRecord[]> {
    let query = db.select().from(automationJobs).$dynamic();
    const conditions = [];
    if (filters.companyId) conditions.push(eq(automationJobs.companyId, filters.companyId));
    if (filters.status) conditions.push(eq(automationJobs.status, filters.status));
    if (filters.jobType) conditions.push(eq(automationJobs.jobType, filters.jobType));
    if (filters.from) conditions.push(gte(automationJobs.createdAt, filters.from));
    if (filters.to) conditions.push(lte(automationJobs.createdAt, filters.to));
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    query = query.orderBy(sql`${automationJobs.createdAt} DESC`);
    if (filters.limit) query = query.limit(filters.limit);
    if (filters.offset !== undefined) query = query.offset(filters.offset);
    return (await query) as JobRecord[];
  }

  async addLog(
    jobId: string,
    companyId: string,
    level: "info" | "warn" | "error" | "debug",
    message: string,
    meta?: Record<string, unknown>,
    createdBy?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    await db.insert(automationLogs).values({
      id: randomUUID(),
      jobId,
      companyId,
      level,
      message,
      meta: meta ?? null,
      createdBy: createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async getLogs(jobId: string, limit = 200): Promise<typeof automationLogs.$inferSelect[]> {
    return db
      .select()
      .from(automationLogs)
      .where(eq(automationLogs.jobId, jobId))
      .orderBy(sql`${automationLogs.createdAt} ASC`)
      .limit(limit);
  }

  async getRecentLogs(companyId: string, limit = 100): Promise<typeof automationLogs.$inferSelect[]> {
    return db
      .select()
      .from(automationLogs)
      .where(eq(automationLogs.companyId, companyId))
      .orderBy(sql`${automationLogs.createdAt} DESC`)
      .limit(limit);
  }

  private _mapRow(row: Record<string, unknown>): JobRecord {
    return {
      id: row.id as string,
      companyId: row.company_id as string,
      jobType: row.job_type as string,
      status: row.status as string,
      payload: (row.payload as Record<string, unknown>) ?? {},
      result: row.result as Record<string, unknown> | null,
      screenshotPath: row.screenshot_path as string | null,
      errorMessage: row.error_message as string | null,
      retryCount: row.retry_count as number,
      maxRetries: row.max_retries as number,
      scheduledAt: row.scheduled_at as string | null,
      startedAt: row.started_at as string | null,
      completedAt: row.completed_at as string | null,
      createdBy: row.created_by as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

export const queueService = new QueueService();
