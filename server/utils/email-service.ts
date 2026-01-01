import { Resend } from "resend";
import { render } from "@vue-email/render";
import { useDB } from "./db";
import { eq, and } from "drizzle-orm";
import type { Component } from "vue";
import { notificationLog, notificationPreferences } from "./schema";

interface EmailOptions {
  to: string;
  subject: string;
  component: Component;
  props: Record<string, any>;
  organizationId: string;
  userId: string;
  notificationType: string;
}

type NotificationType =
  | "order_created"
  | "order_status_changed"
  | "order_deleted"

const notificationPreferenceDefaults: Record<
  keyof typeof notificationPreferences.$inferSelect,
  boolean | string | Date
> = {
  id: "",
  userId: "",
  organizationId: "",
  orderCreated: false,
  orderStatusChanged: false,
  orderDeleted: false,
  dailyDigest: false,
  digestTime: "09:00",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const notificationTypeToPreferenceKey: Record<
  NotificationType,
  keyof typeof notificationPreferences.$inferSelect
> = {
  order_created: "orderCreated",
  order_status_changed: "orderStatusChanged",
  order_deleted: "orderDeleted",
};

const isNotificationEnabled = (
  prefs: typeof notificationPreferences.$inferSelect | undefined,
  notificationType: NotificationType,
) => {
  const prefKey = notificationTypeToPreferenceKey[notificationType];
  const value = prefs?.[prefKey];
  if (typeof value === "boolean") return value;
  const fallback = notificationPreferenceDefaults[prefKey];
  return typeof fallback === "boolean" ? fallback : true;
};

const renderEmail = async (options: EmailOptions) => {
  const html = await render(options.component, options.props, {
    pretty: true,
  });
  const text = await render(options.component, options.props, {
    plainText: true,
  });

  return { html, text };
};

const getResendClient = () => new Resend(process.env.RESEND_KEY);

export const emailService = {

  async sendNotificationEmailBatch(optionsList: EmailOptions[]) {
    const db = useDB();
    const resend = getResendClient();

    try {
      const prepared: Array<
        EmailOptions & {
          html: string;
          text: string;
          notificationType: NotificationType;
        }
      > = [];

      // Prepare and filter based on preferences
      for (const options of optionsList) {
        const notificationType = options.notificationType as NotificationType;

        const prefs = await db.query.notificationPreferences.findFirst({
          where: and(
            eq(notificationPreferences.userId, options.userId),
            eq(notificationPreferences.organizationId, options.organizationId),
          ),
        });

        if (!isNotificationEnabled(prefs || undefined, notificationType)) {
          continue;
        }

        const { html, text } = await renderEmail(options);
        prepared.push({ ...options, html, text, notificationType });
      }

      if (!prepared.length) {
        return { sent: 0, failed: 0, skipped: optionsList.length };
      }

      const payload = prepared.map((entry) => ({
        from: "notifications@orders.frctools.com",
        to: entry.to,
        subject: entry.subject,
        html: entry.html,
        text: entry.text,
      }));

      const { data, error } = await resend.batch.send(payload as any);

      if (error) {
        for (const entry of prepared) {
          await db.insert(notificationLog).values({
            id: crypto.randomUUID(),
            userId: entry.userId,
            organizationId: entry.organizationId,
            type: entry.notificationType,
            subject: entry.subject,
            recipientEmail: entry.to,
            status: "failed",
            createdAt: new Date(),
          });
        }

        return {
          sent: 0,
          failed: prepared.length,
          skipped: optionsList.length - prepared.length,
        };
      }

      let sent = 0;
      let failed = 0;
      prepared.forEach((entry, index) => {
        const id = data?.data?.[index]?.id;
        const isSuccess = Boolean(id);

        if (isSuccess) sent += 1;
        else failed += 1;

        db.insert(notificationLog)
          .values({
            id: crypto.randomUUID(),
            userId: entry.userId,
            organizationId: entry.organizationId,
            type: entry.notificationType,
            subject: entry.subject,
            recipientEmail: entry.to,
            status: isSuccess ? "sent" : "failed",
            errorMessage: isSuccess ? null : "Batch send returned no id",
            createdAt: new Date(),
          })
          .catch(() => {}
          );
      });

      return { sent, failed, skipped: optionsList.length - prepared.length };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      for (const options of optionsList) {
        await db.insert(notificationLog).values({
          id: crypto.randomUUID(),
          userId: options.userId,
          organizationId: options.organizationId,
          type: options.notificationType,
          subject: options.subject,
          recipientEmail: options.to,
          status: "failed",
          errorMessage,
          createdAt: new Date(),
        });
      }
      return { sent: 0, failed: optionsList.length, skipped: 0 };
    }
  },

  async getOrCreatePreferences(
    userId: string,
    organizationId: string,
  ): Promise<any> {
    const db = useDB();

    let prefs = await db.query.notificationPreferences.findFirst({
      where: and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.organizationId, organizationId),
      ),
    });

    if (!prefs) {
      const id = crypto.randomUUID();
      await db.insert(notificationPreferences).values({
        id,
        userId,
        organizationId,
        orderCreated: true,
        orderStatusChanged: true,
        orderDeleted: false,
        dailyDigest: false,
        digestTime: "09:00",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      prefs = await db.query.notificationPreferences.findFirst({
        where: eq(notificationPreferences.id, id),
      });
    }

    return prefs;
  },

  async updatePreferences(
    userId: string,
    organizationId: string,
    updates: Partial<typeof notificationPreferences.$inferInsert>,
  ): Promise<any> {
    const db = useDB();

    const updated = await db
      .update(notificationPreferences)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.organizationId, organizationId),
        ),
      )
      .returning();

    return updated[0] || null;
  },

  async getNotificationLog(
    userId: string,
    organizationId: string,
    limit: number = 20,
  ): Promise<any[]> {
    const db = useDB();

    return db.query.notificationLog.findMany({
      where: and(
        eq(notificationLog.userId, userId),
        eq(notificationLog.organizationId, organizationId),
      ),
      limit,
      orderBy: (log) => [log.createdAt],
    });
  },
};
