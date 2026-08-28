import { defineEventHandler, readBody, createError } from "h3";
import { requireOrganizationContext } from "../../utils/session";
import { createOrderSchema, addLineItem } from "../../utils/order-service";
import { notificationHelpers } from "../../utils/notification-helpers";

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);
  const rawBody = await readBody(event);
  const parsed = createOrderSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        parsed.error.flatten().formErrors.join(", ") || "Invalid payload",
      data: parsed.error.flatten().fieldErrors,
    });
  }

  // Adds the part to the vendor's open order (creating one if needed).
  const order = await addLineItem(parsed.data, {
    organizationId,
    userId: user.id,
  });

  notificationHelpers
    .notifyOrderCreated(
      organizationId,
      order.id,
      parsed.data.partName,
      parsed.data.description ?? null,
      user.id,
    )
    .catch((err) =>
      console.error("Failed to send order creation notifications:", err),
    );

  return { order };
});
