import { useDB } from "./db";
import { emailService } from "./email-service";
import { useAuth } from "./auth";
import { member } from "./auth-schema";
import { eq } from "drizzle-orm";
import OrderCreatedEmail from "./OrderCreatedEmail.vue";
import OrderStatusChangedEmail from "./OrderStatusChangedEmail.vue";

export const notificationHelpers = {
  async notifyOrderCreated(
    organizationId: string,
    orderId: string,
    partName: string,
    description?: string | null,
    creatorId?: string,
  ) {
    const db = useDB();
    const event = useEvent();
    const organization = await useAuth().api.getFullOrganization({
      query: { organizationId },
      headers: Object.entries(await getHeaders(event)) as [string, string][],
    });
    const members = await db.query.member.findMany({
      where: eq(member.organizationId, organizationId),
      with: {
        user: true,
      },
    });

    const batch = members
      .filter((m) => !(creatorId && m.userId === creatorId))
      .map((m) => ({
        to: m.user.email,
        subject: `New order: ${partName}`,
        component: OrderCreatedEmail,
        props: {
          userName: m.user.name,
          orderPartName: partName,
          orderDescription: description,
          organizationName: organization?.name || "",
          orderId,
        },
        organizationId,
        userId: m.userId,
        notificationType: "order_created" as const,
      }));

    await emailService.sendNotificationEmailBatch(batch);
  },

  /**
   * Notify all members when an order status changes
   */
  async notifyOrderStatusChanged(
    organizationId: string,
    orderId: string,
    partName: string,
    oldStatus: string,
    newStatus: string,
  ) {
    const db = useDB();
    const event = useEvent();
    const organization = await useAuth().api.getFullOrganization({
      query: { organizationId },
      headers: Object.entries(await getHeaders(event)) as [string, string][],
    });

    const members = await db.query.member.findMany({
      where: eq(member.organizationId, organizationId),
      with: {
        user: true,
      },
    });
    const statusLookup: Record<string, string> = {
      to_order: "To Order",
      ordered: "Ordered",
      arrived: "Arrived",
    };
    const batch = members.map((m) => ({
      to: m.user.email,
      subject: `Order status updated: ${partName}`,
      component: OrderStatusChangedEmail,
      props: {
        userName: m.user.name,
        orderPartName: partName,
        oldStatus: statusLookup[oldStatus] || oldStatus,
        newStatus: statusLookup[newStatus] || newStatus,
        organizationName: organization?.name || "",
        orderId,
      },
      organizationId,
      userId: m.userId,
      notificationType: "order_status_changed" as const,
    }));

    await emailService.sendNotificationEmailBatch(batch);
  },

};
