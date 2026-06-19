import { db } from "../db";
import { aiFollowUpTasks } from "@shared/schema";
import { and, eq } from "drizzle-orm";

// AiFollowUpRepository — DB access for AI follow-up task persistence (Task #5 Phase D).
// Encapsulates the self-contained upsert performed by createFollowUpTask so the
// service-level helper no longer reaches into `db` directly. Queries are moved
// verbatim; behavior is unchanged.
export class AiFollowUpRepository {
  async findPending(employeeId: string, taskType: string) {
    return await db
      .select()
      .from(aiFollowUpTasks)
      .where(
        and(
          eq(aiFollowUpTasks.employeeId, employeeId),
          eq(aiFollowUpTasks.taskType, taskType),
          eq(aiFollowUpTasks.status, "pending"),
        ),
      )
      .limit(1);
  }

  async resetPending(id: string, set: Partial<typeof aiFollowUpTasks.$inferInsert>): Promise<void> {
    await db.update(aiFollowUpTasks).set(set).where(eq(aiFollowUpTasks.id, id));
  }

  async create(values: typeof aiFollowUpTasks.$inferInsert): Promise<void> {
    await db.insert(aiFollowUpTasks).values(values);
  }
}
