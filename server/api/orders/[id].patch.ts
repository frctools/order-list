import { defineEventHandler, readBody, createError } from "h3";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { useDB } from "../../utils/db";
import { orders, vendors } from "../../utils/schema";
import { requireOrganizationContext } from "../../utils/session";
import { getOrder } from "../../utils/order-service";
import { notificationHelpers } from "../../utils/notification-helpers";

type OrderInsert = typeof orders.$inferInsert;

const updateOrderSchema = z
  .object({
    status: z.enum(["to_order", "ordered", "arrived"]).optional(),
    vendorId: z
      .union([z.string(), z.null()])
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        if (value === null) return null;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      }),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No updates provided",
  });

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireOrganizationContext(event);
  const db = useDB();
  const id = event.context.params?.id;

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Order id is required" });
  }

  const payloadResult = updateOrderSchema.safeParse(await readBody(event));
  if (!payloadResult.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        payloadResult.error.flatten().formErrors.join(", ") ||
        "Invalid payload",
      data: payloadResult.error.flatten().fieldErrors,
    });
  }
  const payload = payloadResult.data;

  const existingOrder = await db.query.orders.findFirst({
    where: and(eq(orders.id, id), eq(orders.organizationId, organizationId)),
  });
  if (!existingOrder) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  const updates: Partial<OrderInsert> = {};

  if (payload.vendorId !== undefined) {
    let nextVendorId: string | null = null;
    let nextVendorName: string | null = null;
    if (payload.vendorId) {
      const vendorRecord = await db.query.vendors.findFirst({
        where: eq(vendors.id, payload.vendorId),
      });
      if (vendorRecord) {
        nextVendorId = vendorRecord.id;
      } else {
        nextVendorName = payload.vendorId;
      }
    }
    updates.vendorId = nextVendorId;
    updates.vendorName = nextVendorName;
  }

  if (payload.status && payload.status !== existingOrder.status) {
    updates.status = payload.status;
    if (payload.status === "ordered") {
      updates.orderedAt = existingOrder.orderedAt ?? new Date();
      updates.arrivedAt = null;
    } else if (payload.status === "arrived") {
      updates.arrivedAt = new Date();
      updates.orderedAt = existingOrder.orderedAt ?? new Date();
    } else if (payload.status === "to_order") {
      updates.orderedAt = null;
      updates.arrivedAt = null;
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.update(orders).set(updates).where(eq(orders.id, id));
  }

  if (updates.status && updates.status !== existingOrder.status) {
    notificationHelpers
      .notifyOrderStatusChanged(
        organizationId,
        id,
        existingOrder.vendorName ?? "Order",
        existingOrder.status,
        updates.status,
      )
      .catch((err) =>
        console.error("Failed to send status change notifications:", err),
      );
  }

  const order = await getOrder(id, organizationId);
  return {
    order,
    unchanged: Object.keys(updates).length === 0,
  };
});
