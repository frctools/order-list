import { z } from "zod";
import { useDB } from "./db";
import {
  orders,
  orderItems,
  orderPayments,
  orderReceipts,
  vendors,
  orderTags,
  tags,
} from "./schema";
import { user as authUser } from "./auth-schema";
import type { OrderReceiptRecord } from "./receipt-service";
import { eq, and, inArray, isNull, sql, desc, asc, type SQL } from "drizzle-orm";

// A line item (part) is added with a vendor; the vendor determines which
// per-vendor purchase order it groups into.
export const createOrderSchema = z.object({
  partName: z.string().min(1, "Part name is required"),
  description: z.string().trim().optional(),
  quantity: z.coerce.number().int().min(1).default(1),
  vendorId: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === undefined || value === null) return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }),
  unitPriceMicros: z
    .union([
      z.coerce.number().int().min(0, "Price must be zero or more"),
      z.literal(""),
    ])
    .optional()
    .transform((value) => (typeof value === "number" ? value : undefined)),
  variantId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  variantTitle: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  externalUrl: z
    .string()
    .trim()
    .url("Enter a valid URL")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null)),
  tagIds: z.array(z.string()).optional().default([]),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export interface OrderContext {
  organizationId: string;
  userId: string;
}

export interface OrderItemRecord {
  id: string;
  orderId: string;
  partName: string;
  description: string | null;
  quantity: number;
  unitPriceMicros: number | null;
  variantId: string | null;
  variantTitle: string | null;
  externalUrl: string | null;
  requestedBy: string;
  requestedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
  tags: { id: string; name: string; color: string }[];
}

export type PaymentType = "credit_card" | "voucher" | "coupon" | "other";

export interface OrderPaymentRecord {
  id: string;
  type: PaymentType;
  label: string;
  amountCents: number;
}

export interface OrderRecord {
  id: string;
  organizationId: string;
  vendorId: string | null;
  vendorName: string | null;
  vendorType: "shopify" | "bigcommerce" | "amazon" | null;
  // The vendor's storefront host, used to build a one-click cart link.
  vendorHostname: string | null;
  status: "to_order" | "ordered" | "arrived";
  requestedBy: string;
  requestedByName: string | null;
  orderedAt: Date | null;
  arrivedAt: Date | null;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  shippingCents: number | null;
  taxCents: number | null;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemRecord[];
  itemCount: number;
  totalCents: number;
  payments: OrderPaymentRecord[];
  paidCents: number;
  // Metadata only. The bytes are fetched one at a time by the download route,
  // so listing orders never drags receipt content through memory.
  receipts: OrderReceiptRecord[];
  // Items + shipping + tax.
  grandTotalCents: number;
}

type DB = ReturnType<typeof useDB>;

// --- shared helpers -------------------------------------------------------

async function resolveVendor(
  db: DB,
  vendorInput: string | null,
): Promise<{ vendorId: string | null; vendorName: string | null }> {
  if (!vendorInput) return { vendorId: null, vendorName: null };
  const vendorRecord = await db.query.vendors.findFirst({
    where: eq(vendors.id, vendorInput),
  });
  if (vendorRecord) return { vendorId: vendorRecord.id, vendorName: null };
  return { vendorId: null, vendorName: vendorInput };
}

// Find the org's open (to_order) order for this vendor, or create one.
async function findOrCreatePendingOrder(
  db: DB,
  ctx: OrderContext,
  vendor: { vendorId: string | null; vendorName: string | null },
): Promise<string> {
  const existing = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, ctx.organizationId),
        eq(orders.status, "to_order"),
        vendor.vendorId
          ? eq(orders.vendorId, vendor.vendorId)
          : isNull(orders.vendorId),
        vendor.vendorName
          ? eq(orders.vendorName, vendor.vendorName)
          : isNull(orders.vendorName),
      ),
    )
    .limit(1);

  if (existing[0]) return existing[0].id;

  const orderId = crypto.randomUUID();
  await db.insert(orders).values({
    id: orderId,
    organizationId: ctx.organizationId,
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName,
    status: "to_order",
    requestedBy: ctx.userId,
  });
  return orderId;
}

async function insertItemTags(
  db: DB,
  orderItemId: string,
  tagIds: string[],
  organizationId: string,
): Promise<void> {
  if (tagIds.length === 0) return;
  const validTags = await db
    .select({ id: tags.id })
    .from(tags)
    .where(
      and(eq(tags.organizationId, organizationId), inArray(tags.id, tagIds)),
    );
  const valid = validTags.map((t) => t.id);
  if (valid.length > 0) {
    await db
      .insert(orderTags)
      .values(valid.map((tagId) => ({ orderItemId, tagId })));
  }
}

// Assemble full order records (header + items + item tags + total) for the
// orders matched by `where`.
async function fetchOrders(db: DB, where: SQL | undefined): Promise<OrderRecord[]> {
  const orderRows = await db
    .select({
      id: orders.id,
      organizationId: orders.organizationId,
      vendorId: orders.vendorId,
      vendorName: sql<
        string | null
      >`coalesce(${vendors.name}, ${orders.vendorName})`,
      vendorType: vendors.type,
      vendorHostname: vendors.hostname,
      status: orders.status,
      requestedBy: orders.requestedBy,
      requestedByName: authUser.name,
      orderedAt: orders.orderedAt,
      arrivedAt: orders.arrivedAt,
      trackingCarrier: orders.trackingCarrier,
      trackingNumber: orders.trackingNumber,
      shippingCents: orders.shippingCents,
      taxCents: orders.taxCents,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .leftJoin(vendors, eq(orders.vendorId, vendors.id))
    .leftJoin(authUser, eq(orders.requestedBy, authUser.id))
    .where(where)
    .orderBy(desc(orders.createdAt));

  if (orderRows.length === 0) return [];

  const orderIds = orderRows.map((o) => o.id);

  const paymentRows = await db
    .select({
      id: orderPayments.id,
      orderId: orderPayments.orderId,
      type: orderPayments.type,
      label: orderPayments.label,
      amountCents: orderPayments.amountCents,
    })
    .from(orderPayments)
    .where(inArray(orderPayments.orderId, orderIds))
    .orderBy(asc(orderPayments.createdAt));

  const paymentsByOrder = new Map<string, OrderPaymentRecord[]>();
  for (const p of paymentRows) {
    const list = paymentsByOrder.get(p.orderId) ?? [];
    list.push({ id: p.id, type: p.type, label: p.label, amountCents: p.amountCents });
    paymentsByOrder.set(p.orderId, list);
  }

  const receiptRows = await db
    .select({
      id: orderReceipts.id,
      orderId: orderReceipts.orderId,
      filename: orderReceipts.filename,
      mimeType: orderReceipts.mimeType,
      sizeBytes: orderReceipts.sizeBytes,
      uploadedBy: orderReceipts.uploadedBy,
      uploadedByName: authUser.name,
      createdAt: orderReceipts.createdAt,
    })
    .from(orderReceipts)
    .leftJoin(authUser, eq(orderReceipts.uploadedBy, authUser.id))
    .where(inArray(orderReceipts.orderId, orderIds))
    .orderBy(asc(orderReceipts.createdAt));

  const receiptsByOrder = new Map<string, OrderReceiptRecord[]>();
  for (const r of receiptRows) {
    const list = receiptsByOrder.get(r.orderId) ?? [];
    list.push(r);
    receiptsByOrder.set(r.orderId, list);
  }

  const itemRows = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      partName: orderItems.partName,
      description: orderItems.description,
      quantity: orderItems.quantity,
      unitPriceMicros: orderItems.unitPriceMicros,
      variantId: orderItems.variantId,
      variantTitle: orderItems.variantTitle,
      externalUrl: orderItems.externalUrl,
      requestedBy: orderItems.requestedBy,
      requestedByName: authUser.name,
      createdAt: orderItems.createdAt,
      updatedAt: orderItems.updatedAt,
    })
    .from(orderItems)
    .leftJoin(authUser, eq(orderItems.requestedBy, authUser.id))
    .where(inArray(orderItems.orderId, orderIds))
    .orderBy(asc(orderItems.createdAt));

  const itemIds = itemRows.map((i) => i.id);
  const tagRows =
    itemIds.length > 0
      ? await db
          .select({
            orderItemId: orderTags.orderItemId,
            tagId: tags.id,
            tagName: tags.name,
            tagColor: tags.color,
          })
          .from(orderTags)
          .innerJoin(tags, eq(orderTags.tagId, tags.id))
          .where(inArray(orderTags.orderItemId, itemIds))
      : [];

  const tagsByItem = new Map<string, { id: string; name: string; color: string }[]>();
  for (const t of tagRows) {
    const list = tagsByItem.get(t.orderItemId) ?? [];
    list.push({ id: t.tagId, name: t.tagName, color: t.tagColor });
    tagsByItem.set(t.orderItemId, list);
  }

  const itemsByOrder = new Map<string, OrderItemRecord[]>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push({ ...item, tags: tagsByItem.get(item.id) ?? [] });
    itemsByOrder.set(item.orderId, list);
  }

  return orderRows.map((order) => {
    const items = itemsByOrder.get(order.id) ?? [];
    // Sum in micro-dollars so sub-cent unit prices stay exact, and round to
    // cents once at the end rather than per line.
    const totalMicros = items.reduce(
      (sum, item) => sum + (item.unitPriceMicros ?? 0) * item.quantity,
      0,
    );
    const totalCents = Math.round(totalMicros / 10_000);
    const payments = paymentsByOrder.get(order.id) ?? [];
    const paidCents = payments.reduce((sum, p) => sum + p.amountCents, 0);
    return {
      ...order,
      items,
      itemCount: items.length,
      totalCents,
      payments,
      paidCents,
      receipts: receiptsByOrder.get(order.id) ?? [],
      grandTotalCents:
        totalCents + (order.shippingCents ?? 0) + (order.taxCents ?? 0),
    };
  });
}

// --- public API -----------------------------------------------------------

export async function listOrders(organizationId: string): Promise<OrderRecord[]> {
  const db = useDB();
  return fetchOrders(db, eq(orders.organizationId, organizationId));
}

// Distinct payment labels the org has used before (e.g. saved credit cards),
// so they can be reused as suggestions on new orders.
export async function listPaymentMethods(
  organizationId: string,
): Promise<{ type: PaymentType; label: string }[]> {
  const db = useDB();
  return db
    .selectDistinct({ type: orderPayments.type, label: orderPayments.label })
    .from(orderPayments)
    .innerJoin(orders, eq(orderPayments.orderId, orders.id))
    .where(eq(orders.organizationId, organizationId))
    .orderBy(asc(orderPayments.label));
}

export async function getOrder(
  orderId: string,
  organizationId: string,
): Promise<OrderRecord | null> {
  const db = useDB();
  const result = await fetchOrders(
    db,
    and(eq(orders.id, orderId), eq(orders.organizationId, organizationId)),
  );
  return result[0] ?? null;
}

async function insertLineItem(
  db: DB,
  orderId: string,
  payload: CreateOrderInput,
  userId: string,
  organizationId: string,
): Promise<string> {
  const itemId = crypto.randomUUID();
  await db.insert(orderItems).values({
    id: itemId,
    orderId,
    partName: payload.partName,
    description:
      payload.description && payload.description.length > 0
        ? payload.description
        : null,
    quantity: payload.quantity,
    unitPriceMicros:
      typeof payload.unitPriceMicros === "number"
        ? payload.unitPriceMicros
        : null,
    variantId: payload.variantId ?? null,
    variantTitle: payload.variantTitle ?? null,
    externalUrl: payload.externalUrl ?? null,
    requestedBy: userId,
  });
  await insertItemTags(db, itemId, payload.tagIds, organizationId);
  return itemId;
}

// Add a part; it auto-groups into the vendor's open order (creating one if
// needed). Returns the affected order with all its items + total.
export async function addLineItem(
  payload: CreateOrderInput,
  ctx: OrderContext,
): Promise<OrderRecord> {
  const db = useDB();
  const vendor = await resolveVendor(db, payload.vendorId);
  const orderId = await findOrCreatePendingOrder(db, ctx, vendor);
  await insertLineItem(db, orderId, payload, ctx.userId, ctx.organizationId);
  const order = await getOrder(orderId, ctx.organizationId);
  if (!order) throw new Error("Order not found after insert");
  return order;
}

// Add many parts, grouping each into its vendor's open order. Returns every
// affected order (deduplicated).
export async function addLineItemsBulk(
  payloads: CreateOrderInput[],
  ctx: OrderContext,
): Promise<OrderRecord[]> {
  const db = useDB();
  const affected = new Set<string>();
  for (const payload of payloads) {
    const vendor = await resolveVendor(db, payload.vendorId);
    const orderId = await findOrCreatePendingOrder(db, ctx, vendor);
    await insertLineItem(db, orderId, payload, ctx.userId, ctx.organizationId);
    affected.add(orderId);
  }
  return fetchOrders(
    db,
    and(
      eq(orders.organizationId, ctx.organizationId),
      inArray(orders.id, [...affected]),
    ),
  );
}

// Move selected items out of an order into a brand-new pending order for the
// same vendor (used for "ship separately" — the new order advances on its own).
// Deletes the source order if it ends up empty.
export async function splitItemsToNewOrder(
  sourceOrderId: string,
  itemIds: string[],
  ctx: OrderContext,
): Promise<{ source: OrderRecord | null; created: OrderRecord | null }> {
  const db = useDB();
  const source = await db.query.orders.findFirst({
    where: and(
      eq(orders.id, sourceOrderId),
      eq(orders.organizationId, ctx.organizationId),
    ),
  });
  if (!source) throw new Error("Order not found");

  const newOrderId = crypto.randomUUID();
  await db.insert(orders).values({
    id: newOrderId,
    organizationId: ctx.organizationId,
    vendorId: source.vendorId,
    vendorName: source.vendorName,
    status: "to_order",
    requestedBy: ctx.userId,
  });

  await db
    .update(orderItems)
    .set({ orderId: newOrderId })
    .where(
      and(
        eq(orderItems.orderId, sourceOrderId),
        inArray(orderItems.id, itemIds),
      ),
    );

  const remaining = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.orderId, sourceOrderId))
    .limit(1);

  if (remaining.length === 0) {
    await db.delete(orders).where(eq(orders.id, sourceOrderId));
    return {
      source: null,
      created: await getOrder(newOrderId, ctx.organizationId),
    };
  }

  return {
    source: await getOrder(sourceOrderId, ctx.organizationId),
    created: await getOrder(newOrderId, ctx.organizationId),
  };
}

// Stable key identifying a vendor so orders can be compared. Mirrors
// findOrCreatePendingOrder's grouping (id, else manual name, else none).
function vendorKey(vendorId: string | null, vendorName: string | null): string {
  if (vendorId) return `id:${vendorId}`;
  if (vendorName) return `name:${vendorName.toLowerCase()}`;
  return "none";
}

// Move line items into another open order (used to "join" not-yet-ordered
// parts into the same order). Only works between `to_order` orders of the SAME
// vendor. Source orders left empty are deleted. Returns every affected order
// still standing plus the ids of any that were removed.
export async function moveItemsToOrder(
  itemIds: string[],
  targetOrderId: string,
  ctx: OrderContext,
): Promise<{ orders: OrderRecord[]; removedOrderIds: string[] }> {
  const db = useDB();
  const target = await db.query.orders.findFirst({
    where: and(
      eq(orders.id, targetOrderId),
      eq(orders.organizationId, ctx.organizationId),
    ),
  });
  if (!target) throw new Error("Order not found");
  if (target.status !== "to_order") {
    throw new Error("Can only move parts into an order that hasn't been placed");
  }

  const targetKey = vendorKey(target.vendorId, target.vendorName);

  // Only items that belong to the org's open orders may move.
  const items = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      vendorId: orders.vendorId,
      vendorName: orders.vendorName,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        inArray(orderItems.id, itemIds),
        eq(orders.organizationId, ctx.organizationId),
        eq(orders.status, "to_order"),
      ),
    );

  // Parts can only be combined within the same vendor.
  if (items.some((i) => vendorKey(i.vendorId, i.vendorName) !== targetKey)) {
    throw new Error("Parts can only be combined within the same vendor");
  }

  const moveIds = items.map((i) => i.id);
  const sourceOrderIds = [...new Set(items.map((i) => i.orderId))].filter(
    (id) => id !== targetOrderId,
  );

  if (moveIds.length > 0) {
    await db
      .update(orderItems)
      .set({ orderId: targetOrderId })
      .where(inArray(orderItems.id, moveIds));
  }

  const removedOrderIds: string[] = [];
  for (const sid of sourceOrderIds) {
    const remaining = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.orderId, sid))
      .limit(1);
    if (remaining.length === 0) {
      await db.delete(orders).where(eq(orders.id, sid));
      removedOrderIds.push(sid);
    }
  }

  const surviving = sourceOrderIds.filter((id) => !removedOrderIds.includes(id));
  const orderRecords = await fetchOrders(
    db,
    and(
      eq(orders.organizationId, ctx.organizationId),
      inArray(orders.id, [targetOrderId, ...surviving]),
    ),
  );
  return { orders: orderRecords, removedOrderIds };
}

async function requireOrder(db: DB, orderId: string, organizationId: string) {
  const order = await db.query.orders.findFirst({
    where: and(
      eq(orders.id, orderId),
      eq(orders.organizationId, organizationId),
    ),
  });
  if (!order) throw new Error("Order not found");
  return order;
}

// Add a part to a specific existing order.
export async function addItemToOrder(
  orderId: string,
  payload: CreateOrderInput,
  ctx: OrderContext,
): Promise<OrderRecord> {
  const db = useDB();
  await requireOrder(db, orderId, ctx.organizationId);
  await insertLineItem(db, orderId, payload, ctx.userId, ctx.organizationId);
  const order = await getOrder(orderId, ctx.organizationId);
  if (!order) throw new Error("Order not found after insert");
  return order;
}

export interface UpdateLineItemInput {
  partName?: string;
  description?: string | null;
  quantity?: number;
  unitPriceMicros?: number | null;
  variantId?: string | null;
  variantTitle?: string | null;
  externalUrl?: string | null;
  tagIds?: string[];
}

export async function updateLineItem(
  orderId: string,
  itemId: string,
  updates: UpdateLineItemInput,
  ctx: OrderContext,
): Promise<OrderRecord> {
  const db = useDB();
  await requireOrder(db, orderId, ctx.organizationId);

  const set: Partial<typeof orderItems.$inferInsert> = {};
  if (updates.partName !== undefined) set.partName = updates.partName;
  if (updates.description !== undefined) set.description = updates.description;
  if (updates.quantity !== undefined) set.quantity = updates.quantity;
  if (updates.unitPriceMicros !== undefined)
    set.unitPriceMicros = updates.unitPriceMicros;
  if (updates.variantId !== undefined) set.variantId = updates.variantId;
  if (updates.variantTitle !== undefined)
    set.variantTitle = updates.variantTitle;
  if (updates.externalUrl !== undefined) set.externalUrl = updates.externalUrl;

  if (Object.keys(set).length > 0) {
    await db
      .update(orderItems)
      .set(set)
      .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)));
  }

  if (updates.tagIds !== undefined) {
    await db.delete(orderTags).where(eq(orderTags.orderItemId, itemId));
    await insertItemTags(db, itemId, updates.tagIds, ctx.organizationId);
  }

  const order = await getOrder(orderId, ctx.organizationId);
  if (!order) throw new Error("Order not found after update");
  return order;
}

// Delete a line item. If the order is left empty, delete the order too and
// return `{ order: null }`.
export async function deleteLineItem(
  orderId: string,
  itemId: string,
  ctx: OrderContext,
): Promise<{ order: OrderRecord | null }> {
  const db = useDB();
  await requireOrder(db, orderId, ctx.organizationId);

  await db
    .delete(orderItems)
    .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)));

  const remaining = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .limit(1);

  if (remaining.length === 0) {
    await db.delete(orders).where(eq(orders.id, orderId));
    return { order: null };
  }

  return { order: await getOrder(orderId, ctx.organizationId) };
}

export interface OrderDetailsInput {
  trackingCarrier?: string | null;
  trackingNumber?: string | null;
  shippingCents?: number | null;
  taxCents?: number | null;
  // When provided, replaces the whole set of payment lines for the order.
  payments?: { type: PaymentType; label: string; amountCents: number }[];
}

// Update post-order fulfilment details (tracking, shipping cost, and the split
// of how it was paid for).
export async function updateOrderDetails(
  orderId: string,
  details: OrderDetailsInput,
  ctx: OrderContext,
): Promise<OrderRecord> {
  const db = useDB();
  await requireOrder(db, orderId, ctx.organizationId);

  const set: Partial<typeof orders.$inferInsert> = {};
  if (details.trackingCarrier !== undefined)
    set.trackingCarrier = details.trackingCarrier;
  if (details.trackingNumber !== undefined)
    set.trackingNumber = details.trackingNumber;
  if (details.shippingCents !== undefined)
    set.shippingCents = details.shippingCents;
  if (details.taxCents !== undefined) set.taxCents = details.taxCents;
  if (Object.keys(set).length > 0) {
    await db.update(orders).set(set).where(eq(orders.id, orderId));
  }

  if (details.payments !== undefined) {
    await db.delete(orderPayments).where(eq(orderPayments.orderId, orderId));
    if (details.payments.length > 0) {
      await db.insert(orderPayments).values(
        details.payments.map((p) => ({
          id: crypto.randomUUID(),
          orderId,
          type: p.type,
          label: p.label,
          amountCents: p.amountCents,
        })),
      );
    }
  }

  const order = await getOrder(orderId, ctx.organizationId);
  if (!order) throw new Error("Order not found after update");
  return order;
}
