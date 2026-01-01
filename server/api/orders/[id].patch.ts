import { defineEventHandler, readBody, createError } from "h3";
import { and, eq, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { useDB } from "../../utils/db";
import { orders, vendors, orderTags, tags } from "../../utils/schema";
import { user as authUser } from "../../utils/auth-schema";
import { requireOrganizationContext } from "../../utils/session";
import { notificationHelpers } from "../../utils/notification-helpers";

type OrderInsert = typeof orders.$inferInsert;

const updateOrderSchema = z
  .object({
    partName: z.string().min(1).optional(),
    description: z.string().trim().optional().nullable(),
    quantity: z.coerce.number().int().min(1).optional(),
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
    unitPriceCents: z
      .union([
        z.coerce.number().int().min(0, "Price must be zero or more"),
        z.literal(""),
        z.null(),
      ])
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        if (typeof value === "number") return value;
        return null;
      }),
    variantId: z
      .string()
      .trim()
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        return value.length > 0 ? value : null;
      }),
    variantTitle: z
      .string()
      .trim()
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        return value.length > 0 ? value : null;
      }),
    externalUrl: z
      .string()
      .trim()
      .url("Enter a valid URL")
      .optional()
      .or(z.literal(""))
      .or(z.null())
      .transform((value) => {
        if (value === undefined) return undefined;
        return value ? value : null;
      }),
    tagIds: z.array(z.string()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No updates provided",
  });

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireOrganizationContext(event);
  const db = useDB();
  const id = event.context.params?.id;

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Order id is required",
    });
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

  if (payload.partName && payload.partName !== existingOrder.partName) {
    updates.partName = payload.partName;
  }

  if (payload.description !== undefined) {
    const normalizedDescription =
      payload.description && payload.description.length > 0
        ? payload.description
        : null;
    updates.description = normalizedDescription;
  }

  if (
    payload.quantity !== undefined &&
    payload.quantity !== existingOrder.quantity
  ) {
    updates.quantity = payload.quantity;
  }

  if (payload.vendorId !== undefined) {
    let nextVendorId: string | null = null;
    let nextVendorName: string | null = null;

    if (payload.vendorId) {
      const vendorRecord = await db.query.vendors.findFirst({
        where: eq(vendors.id, payload.vendorId),
      });

      if (vendorRecord) {
        nextVendorId = vendorRecord.id;
        nextVendorName = null;
      } else {
        nextVendorName = payload.vendorId;
      }
    }

    if (nextVendorId !== existingOrder.vendorId) {
      updates.vendorId = nextVendorId;
    }

    if (nextVendorName !== existingOrder.vendorName) {
      updates.vendorName = nextVendorName;
    }
  }

  if (payload.unitPriceCents !== undefined) {
    updates.unitPriceCents = payload.unitPriceCents;
  }

  if (payload.variantId !== undefined) {
    updates.variantId = payload.variantId;
  }

  if (payload.variantTitle !== undefined) {
    updates.variantTitle = payload.variantTitle;
  }

  if (payload.externalUrl !== undefined) {
    updates.externalUrl = payload.externalUrl;
  }

  if (payload.status && payload.status !== existingOrder.status) {
    updates.status = payload.status;

    if (payload.status === "ordered") {
      updates.orderedAt = existingOrder.orderedAt ?? new Date();
      updates.arrivedAt = existingOrder.arrivedAt ?? null;
    } else if (payload.status === "arrived") {
      updates.arrivedAt = new Date();
      updates.orderedAt = existingOrder.orderedAt ?? new Date();
    } else if (payload.status === "to_order") {
      updates.orderedAt = null;
      updates.arrivedAt = null;
    }
  }

  let tagsUpdated = false;
  if (payload.tagIds !== undefined) {
    await db.delete(orderTags).where(eq(orderTags.orderId, id));

    if (payload.tagIds.length > 0) {
      const validTags = await db
        .select({ id: tags.id })
        .from(tags)
        .where(
          and(
            eq(tags.organizationId, organizationId),
            inArray(tags.id, payload.tagIds),
          ),
        );

      const validTagIds = validTags.map((t) => t.id);
      if (validTagIds.length > 0) {
        await db.insert(orderTags).values(
          validTagIds.map((tagId) => ({
            orderId: id,
            tagId,
          })),
        );
      }
    }
    tagsUpdated = true;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(orders).set(updates).where(eq(orders.id, id));
  }

  // Send status change notification if status was updated
  if (updates.status && updates.status !== existingOrder.status) {
    notificationHelpers
      .notifyOrderStatusChanged(
        organizationId,
        id,
        existingOrder.partName,
        existingOrder.status,
        updates.status,
      )
      .catch((err) =>
        console.error("Failed to send status change notifications:", err),
      );
  }

  const orderTagsData = await db
    .select({
      tagId: tags.id,
      tagName: tags.name,
      tagColor: tags.color,
    })
    .from(orderTags)
    .innerJoin(tags, eq(orderTags.tagId, tags.id))
    .where(eq(orderTags.orderId, id));

  const [updatedOrder] = await db
    .select({
      id: orders.id,
      organizationId: orders.organizationId,
      partName: orders.partName,
      description: orders.description,
      status: orders.status,
      quantity: orders.quantity,
      unitPriceCents: orders.unitPriceCents,
      variantId: orders.variantId,
      variantTitle: orders.variantTitle,
      vendorId: orders.vendorId,
      vendorName: sql<
        string | null
      >`coalesce(${vendors.name}, ${orders.vendorName})`,
      vendorType: vendors.type,
      externalUrl: orders.externalUrl,
      orderedAt: orders.orderedAt,
      arrivedAt: orders.arrivedAt,
      requestedBy: orders.requestedBy,
      requestedByName: authUser.name,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .leftJoin(vendors, eq(orders.vendorId, vendors.id))
    .leftJoin(authUser, eq(orders.requestedBy, authUser.id))
    .where(eq(orders.id, id));

  return {
    order: {
      ...updatedOrder,
      tags: orderTagsData.map((t) => ({
        id: t.tagId,
        name: t.tagName,
        color: t.tagColor,
      })),
    },
    unchanged: Object.keys(updates).length === 0 && !tagsUpdated,
  };
});
