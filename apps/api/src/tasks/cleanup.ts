/**
 * src/tasks/cleanup.ts
 *
 * Trigger.dev scheduled task running nightly at 02:00 UTC.
 */

import { schedules } from "@trigger.dev/sdk/v3";
import { db } from "../config/db.js";
import { logger } from "../config/logger.js";

export const nightlyCleanup = schedules.task({
  id: "nightly-cleanup",
  cron: "0 2 * * *", // 02:00 UTC
  run: async (payload) => {
    logger.info(
      { scheduledTime: payload.timestamp },
      "[Task:nightlyCleanup] starting nightly cleanup run"
    );

    const now = new Date();

    try {
      // 1. Soft-delete expired messages
      const msgRes = await db.message.updateMany({
        where: {
          expiresAt: { lt: now },
          isDeleted: false,
        },
        data: {
          isDeleted: true,
        },
      });

      // 2. Hard-delete expired jobs
      // Deletes Content row (onDelete: Cascade cleans up companion Job row)
      const jobsRes = await db.content.deleteMany({
        where: {
          contentType: "JOB",
          job: {
            expiresAt: { lt: now },
          },
        },
      });

      // 3. Hard-delete users requesting deletion > 30 days ago
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const usersToPurge = await db.user.findMany({
        where: {
          userSettings: {
            deletionRequestedAt: { lt: thirtyDaysAgo },
          },
        },
        select: { userId: true },
      });

      let usersPurgedCount = 0;
      const purgedUserIds = usersToPurge.map((u) => u.userId);
      if (purgedUserIds.length > 0) {
        const usersRes = await db.user.deleteMany({
          where: {
            userId: { in: purgedUserIds },
          },
        });
        usersPurgedCount = usersRes.count;
      }

      logger.info(
        {
          messagesSoftDeleted: msgRes.count,
          jobsHardDeleted: jobsRes.count,
          usersPurged: usersPurgedCount,
        },
        "[Task:nightlyCleanup] run completed successfully"
      );
    } catch (err) {
      logger.error({ err }, "[Task:nightlyCleanup] run failed with error");
      throw err;
    }
  },
});
