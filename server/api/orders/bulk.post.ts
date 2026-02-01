import { defineEventHandler, readBody, createError } from "h3";
import { z } from "zod";
import { requireOrganizationContext } from "../../utils/session";
import { createOrderSchema, createOrdersBulk } from "../../utils/order-service";
import { notificationHelpers } from "../../utils/notification-helpers";

const bulkCreateSchema = z.object({
  orders: z.array(createOrderSchema).min(1, "At least one order is required"),
});

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);
  const rawBody = await readBody(event);
  const parsed = bulkCreateSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        parsed.error.flatten().formErrors.join(", ") || "Invalid payload",
      data: parsed.error.flatten().fieldErrors,
    });
  }

  const createdOrders = await createOrdersBulk(parsed.data.orders, {
    organizationId,
    userId: user.id,
  });

  // Send notifications for each created order (fire and forget)
  for (const order of createdOrders) {
    notificationHelpers
      .notifyOrderCreated(
        organizationId,
        order.id,
        order.partName,
        order.description,
        user.id,
      )
      .catch((err) =>
        console.error("Failed to send order creation notifications:", err),
      );
  }

  return { orders: createdOrders };
});
