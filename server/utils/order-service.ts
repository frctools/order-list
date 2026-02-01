import { z } from "zod";
import { useDB } from "./db";
import { orders, vendors, orderTags, tags } from "./schema";
import { user as authUser } from "./auth-schema";
import { eq, sql, and, inArray } from "drizzle-orm";

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
  unitPriceCents: z
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

export interface CreatedOrder {
  id: string;
  organizationId: string;
  partName: string;
  description: string | null;
  status: "to_order" | "ordered" | "arrived";
  quantity: number;
  unitPriceCents: number | null;
  variantId: string | null;
  variantTitle: string | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorType: "shopify" | "bigcommerce" | "amazon" | null;
  externalUrl: string | null;
  orderedAt: Date | null;
  arrivedAt: Date | null;
  requestedBy: string;
  requestedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
  tags: { id: string; name: string; color: string }[];
}

async function resolveVendor(
  db: ReturnType<typeof useDB>,
  vendorInput: string | null,
): Promise<{ vendorId: string | null; vendorName: string | null }> {
  if (!vendorInput) {
    return { vendorId: null, vendorName: null };
  }

  const vendorRecord = await db.query.vendors.findFirst({
    where: eq(vendors.id, vendorInput),
  });

  if (vendorRecord) {
    return { vendorId: vendorRecord.id, vendorName: null };
  }

  return { vendorId: null, vendorName: vendorInput };
}

async function insertOrderTags(
  db: ReturnType<typeof useDB>,
  orderId: string,
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

  const validTagIds = validTags.map((t) => t.id);
  if (validTagIds.length > 0) {
    await db.insert(orderTags).values(
      validTagIds.map((tagId) => ({
        orderId,
        tagId,
      })),
    );
  }
}

async function fetchOrderWithDetails(
  db: ReturnType<typeof useDB>,
  orderId: string,
): Promise<CreatedOrder> {
  const orderTagsData = await db
    .select({
      tagId: tags.id,
      tagName: tags.name,
      tagColor: tags.color,
    })
    .from(orderTags)
    .innerJoin(tags, eq(orderTags.tagId, tags.id))
    .where(eq(orderTags.orderId, orderId));

  const [createdOrder] = await db
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
    .where(eq(orders.id, orderId));

  return {
    ...createdOrder,
    tags: orderTagsData.map((t) => ({
      id: t.tagId,
      name: t.tagName,
      color: t.tagColor,
    })),
  };
}

export async function createOrder(
  payload: CreateOrderInput,
  context: OrderContext,
): Promise<CreatedOrder> {
  const db = useDB();
  const { organizationId, userId } = context;

  const { vendorId, vendorName } = await resolveVendor(db, payload.vendorId);

  const orderId = crypto.randomUUID();

  await db.insert(orders).values({
    id: orderId,
    organizationId,
    partName: payload.partName,
    description:
      payload.description && payload.description.length > 0
        ? payload.description
        : null,
    status: "to_order",
    quantity: payload.quantity,
    unitPriceCents:
      typeof payload.unitPriceCents === "number"
        ? payload.unitPriceCents
        : null,
    variantId: payload.variantId ?? null,
    variantTitle: payload.variantTitle ?? null,
    vendorId,
    vendorName,
    externalUrl: payload.externalUrl ?? null,
    requestedBy: userId,
  });

  await insertOrderTags(db, orderId, payload.tagIds, organizationId);

  return fetchOrderWithDetails(db, orderId);
}

export async function createOrdersBulk(
  payloads: CreateOrderInput[],
  context: OrderContext,
): Promise<CreatedOrder[]> {
  const db = useDB();
  const { organizationId, userId } = context;

  // Resolve all unique vendors in one go
  const uniqueVendorInputs = [
    ...new Set(payloads.map((p) => p.vendorId).filter(Boolean)),
  ] as string[];

  const vendorMap = new Map<
    string,
    { vendorId: string | null; vendorName: string | null }
  >();

  if (uniqueVendorInputs.length > 0) {
    const existingVendors = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(inArray(vendors.id, uniqueVendorInputs));

    const existingVendorIds = new Set(existingVendors.map((v) => v.id));

    for (const input of uniqueVendorInputs) {
      if (existingVendorIds.has(input)) {
        vendorMap.set(input, { vendorId: input, vendorName: null });
      } else {
        vendorMap.set(input, { vendorId: null, vendorName: input });
      }
    }
  }

  // Prepare all orders for bulk insert
  const orderValues = payloads.map((payload) => {
    const orderId = crypto.randomUUID();
    const vendor = payload.vendorId
      ? (vendorMap.get(payload.vendorId) ?? {
          vendorId: null,
          vendorName: null,
        })
      : { vendorId: null, vendorName: null };

    return {
      id: orderId,
      organizationId,
      partName: payload.partName,
      description:
        payload.description && payload.description.length > 0
          ? payload.description
          : null,
      status: "to_order" as const,
      quantity: payload.quantity,
      unitPriceCents:
        typeof payload.unitPriceCents === "number"
          ? payload.unitPriceCents
          : null,
      variantId: payload.variantId ?? null,
      variantTitle: payload.variantTitle ?? null,
      vendorId: vendor.vendorId,
      vendorName: vendor.vendorName,
      externalUrl: payload.externalUrl ?? null,
      requestedBy: userId,
      tagIds: payload.tagIds,
    };
  });

  // Bulk insert orders
  await db
    .insert(orders)
    .values(orderValues.map(({ tagIds, ...order }) => order));

  // Collect all tag assignments
  const allTagAssignments: { orderId: string; tagId: string }[] = [];
  const allTagIds = new Set<string>();

  for (const order of orderValues) {
    for (const tagId of order.tagIds) {
      allTagIds.add(tagId);
    }
  }

  // Validate all tags at once
  if (allTagIds.size > 0) {
    const validTags = await db
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(
          eq(tags.organizationId, organizationId),
          inArray(tags.id, [...allTagIds]),
        ),
      );

    const validTagIds = new Set(validTags.map((t) => t.id));

    for (const order of orderValues) {
      for (const tagId of order.tagIds) {
        if (validTagIds.has(tagId)) {
          allTagAssignments.push({ orderId: order.id, tagId });
        }
      }
    }

    if (allTagAssignments.length > 0) {
      await db.insert(orderTags).values(allTagAssignments);
    }
  }

  // Fetch all created orders with details
  const orderIds = orderValues.map((o) => o.id);

  const orderTagsData = await db
    .select({
      orderId: orderTags.orderId,
      tagId: tags.id,
      tagName: tags.name,
      tagColor: tags.color,
    })
    .from(orderTags)
    .innerJoin(tags, eq(orderTags.tagId, tags.id))
    .where(inArray(orderTags.orderId, orderIds));

  const tagsByOrderId = new Map<
    string,
    { id: string; name: string; color: string }[]
  >();
  for (const t of orderTagsData) {
    if (!tagsByOrderId.has(t.orderId)) {
      tagsByOrderId.set(t.orderId, []);
    }
    tagsByOrderId.get(t.orderId)!.push({
      id: t.tagId,
      name: t.tagName,
      color: t.tagColor,
    });
  }

  const createdOrders = await db
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
    .where(inArray(orders.id, orderIds));

  return createdOrders.map((order) => ({
    ...order,
    tags: tagsByOrderId.get(order.id) ?? [],
  }));
}
