import { and, desc, eq, inArray } from "drizzle-orm";
import { McpServer } from "@modelcontextprotocol/server";
import { Meilisearch } from "meilisearch";
import { z } from "zod";
import { member, organization } from "./auth-schema";
import { createOrder, createOrderSchema } from "./order-service";
import { slugifyProjectName } from "./project-service";
import { orders, orderTags, projects, tags, vendors } from "./schema";
import { useDB } from "./db";

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

async function requireMembership(userId: string, organizationId: string) {
  const membership = await useDB().query.member.findFirst({
    where: and(
      eq(member.userId, userId),
      eq(member.organizationId, organizationId),
    ),
  });

  if (!membership) {
    throw new Error("You do not have access to this organization.");
  }
}

async function requireOrder(userId: string, organizationId: string, orderId: string) {
  await requireMembership(userId, organizationId);
  const order = await useDB().query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.organizationId, organizationId)),
  });
  if (!order) throw new Error("Order not found.");
  return order;
}

async function validateTagIds(organizationId: string, tagIds: string[]) {
  if (tagIds.length === 0) return [];
  const rows = await useDB()
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.organizationId, organizationId), inArray(tags.id, tagIds)));
  if (rows.length !== new Set(tagIds).size) {
    throw new Error("One or more tag IDs do not belong to this organization.");
  }
  return rows.map((row) => row.id);
}

export function createOrderrMcpServer(userId: string) {
  const server = new McpServer({
    name: "orderr",
    version: "1.0.0",
  }, {
    instructions: `Use this server to manage FRCTools Orders data for the signed-in user. Start with list_organizations, then use its organization ID for all organization-scoped tools. Use list_projects and list_tags to find IDs before creating or updating orders. To add a catalog item, call search_products first, then create_order with the selected product details. New orders start as to_order; update_order moves them to ordered or arrived and manages their timestamps automatically. Confirm with the user before calling delete_order because it permanently removes an order. Never guess organization, project, order, or tag IDs.`,
  });

  server.registerTool(
    "list_organizations",
    {
      description: "List the Orderr organizations available to the signed-in user.",
      inputSchema: {},
    },
    async () => {
      const rows = await useDB()
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          role: member.role,
        })
        .from(member)
        .innerJoin(organization, eq(member.organizationId, organization.id))
        .where(eq(member.userId, userId));

      return textResult(rows);
    },
  );

  server.registerTool(
    "list_projects",
    {
      description: "List active projects in an Orderr organization.",
      inputSchema: {
        organizationId: z.string().min(1).describe("Organization ID from list_organizations"),
      },
    },
    async ({ organizationId }) => {
      await requireMembership(userId, organizationId);
      const rows = await useDB()
        .select({
          id: projects.id,
          name: projects.name,
          slug: projects.slug,
          description: projects.description,
          color: projects.color,
        })
        .from(projects)
        .where(
          and(
            eq(projects.organizationId, organizationId),
            eq(projects.isArchived, false),
          ),
        );

      return textResult(rows);
    },
  );

  server.registerTool(
    "list_orders",
    {
      description: "List recent orders in an Orderr organization, optionally filtered by project and status.",
      inputSchema: {
        organizationId: z.string().min(1).describe("Organization ID from list_organizations"),
        projectId: z.string().min(1).optional(),
        status: z.enum(["to_order", "ordered", "arrived"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      },
    },
    async ({ organizationId, projectId, status, limit }) => {
      await requireMembership(userId, organizationId);
      const conditions = [eq(orders.organizationId, organizationId)];
      if (projectId) conditions.push(eq(orders.projectId, projectId));
      if (status) conditions.push(eq(orders.status, status));

      const rows = await useDB()
        .select({
          id: orders.id,
          projectId: orders.projectId,
          partName: orders.partName,
          description: orders.description,
          status: orders.status,
          quantity: orders.quantity,
          unitPriceCents: orders.unitPriceCents,
          vendorName: orders.vendorName,
          externalUrl: orders.externalUrl,
          requestedBy: orders.requestedBy,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
        })
        .from(orders)
        .where(and(...conditions))
        .orderBy(desc(orders.updatedAt))
        .limit(limit);

      return textResult(rows);
    },
  );

  server.registerTool(
    "create_project",
    {
      description: "Create a project in an Orderr organization.",
      inputSchema: {
        organizationId: z.string().min(1),
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().max(500).optional(),
        color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
      },
    },
    async ({ organizationId, name, description, color }) => {
      await requireMembership(userId, organizationId);
      const db = useDB();
      const baseSlug = slugifyProjectName(name) || "project";
      let slug = baseSlug;
      let suffix = 2;
      while (
        await db.query.projects.findFirst({
          where: and(
            eq(projects.organizationId, organizationId),
            eq(projects.slug, slug),
          ),
        })
      ) {
        slug = `${baseSlug}-${suffix++}`;
      }
      const [project] = await db
        .insert(projects)
        .values({
          id: crypto.randomUUID(),
          organizationId,
          name,
          slug,
          description: description || null,
          color,
        })
        .returning();
      return textResult({ project });
    },
  );

  server.registerTool(
    "update_project",
    {
      description: "Update a project's details or archive state.",
      inputSchema: {
        organizationId: z.string().min(1),
        projectId: z.string().min(1),
        name: z.string().trim().min(1).max(80).optional(),
        description: z.string().trim().max(500).nullable().optional(),
        color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
        isArchived: z.boolean().optional(),
      },
    },
    async ({ organizationId, projectId, ...updates }) => {
      await requireMembership(userId, organizationId);
      if (Object.keys(updates).length === 0) throw new Error("No updates provided.");
      const db = useDB();
      const existing = await db.query.projects.findFirst({
        where: and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)),
      });
      if (!existing) throw new Error("Project not found.");
      if (updates.isArchived && !existing.isArchived) {
        const active = await db
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.organizationId, organizationId), eq(projects.isArchived, false)));
        if (active.length <= 1) throw new Error("An organization must have at least one active project.");
      }
      const [project] = await db
        .update(projects)
        .set(updates)
        .where(eq(projects.id, projectId))
        .returning();
      return textResult({ project });
    },
  );

  server.registerTool(
    "create_order",
    {
      description: "Create an order in an organization. New orders start in the to_order status.",
      inputSchema: {
        organizationId: z.string().min(1),
        ...createOrderSchema.shape,
      },
    },
    async ({ organizationId, ...input }) => {
      await requireMembership(userId, organizationId);
      const order = await createOrder(createOrderSchema.parse(input), { organizationId, userId });
      return textResult({ order });
    },
  );

  server.registerTool(
    "update_order",
    {
      description: "Update an order's details, tags, price, vendor, URL, quantity, or status.",
      inputSchema: {
        organizationId: z.string().min(1),
        orderId: z.string().min(1),
        partName: z.string().trim().min(1).optional(),
        description: z.string().trim().nullable().optional(),
        quantity: z.number().int().min(1).optional(),
        status: z.enum(["to_order", "ordered", "arrived"]).optional(),
        vendorId: z.string().trim().nullable().optional(),
        unitPriceCents: z.number().int().min(0).nullable().optional(),
        variantId: z.string().trim().nullable().optional(),
        variantTitle: z.string().trim().nullable().optional(),
        externalUrl: z.string().trim().url().nullable().optional(),
        tagIds: z.array(z.string().min(1)).optional(),
      },
    },
    async ({ organizationId, orderId, tagIds, vendorId, status, ...updates }) => {
      const existing = await requireOrder(userId, organizationId, orderId);
      if (Object.keys(updates).length === 0 && tagIds === undefined && vendorId === undefined && status === undefined) {
        throw new Error("No updates provided.");
      }
      const db = useDB();
      const orderUpdates: Record<string, unknown> = { ...updates };
      if (updates.description !== undefined) orderUpdates.description = updates.description || null;
      for (const key of ["variantId", "variantTitle", "externalUrl"] as const) {
        if (updates[key] === "") orderUpdates[key] = null;
      }
      if (vendorId !== undefined) {
        const vendor = vendorId
          ? await db.query.vendors.findFirst({ where: eq(vendors.id, vendorId) })
          : null;
        orderUpdates.vendorId = vendor?.id ?? null;
        orderUpdates.vendorName = vendorId && !vendor ? vendorId : null;
      }
      if (status !== undefined) {
        orderUpdates.status = status;
        if (status === "to_order") Object.assign(orderUpdates, { orderedAt: null, arrivedAt: null });
        if (status === "ordered") Object.assign(orderUpdates, { orderedAt: existing.orderedAt ?? new Date(), arrivedAt: null });
        if (status === "arrived") Object.assign(orderUpdates, { orderedAt: existing.orderedAt ?? new Date(), arrivedAt: new Date() });
      }
      if (tagIds !== undefined) {
        const validTagIds = await validateTagIds(organizationId, tagIds);
        await db.delete(orderTags).where(eq(orderTags.orderId, orderId));
        if (validTagIds.length) {
          await db.insert(orderTags).values(validTagIds.map((tagId) => ({ orderId, tagId })));
        }
      }
      if (Object.keys(orderUpdates).length) {
        await db.update(orders).set(orderUpdates).where(eq(orders.id, orderId));
      }
      const order = await db.query.orders.findFirst({
        where: eq(orders.id, orderId),
        with: { orderTags: { with: { tag: true } } },
      });
      return textResult({ order: order && { ...order, tags: order.orderTags.map(({ tag }) => tag) } });
    },
  );

  server.registerTool(
    "delete_order",
    {
      description: "Permanently delete an order from an organization.",
      inputSchema: { organizationId: z.string().min(1), orderId: z.string().min(1) },
    },
    async ({ organizationId, orderId }) => {
      await requireOrder(userId, organizationId, orderId);
      await useDB().delete(orders).where(eq(orders.id, orderId));
      return textResult({ success: true, id: orderId });
    },
  );

  server.registerTool(
    "list_tags",
    {
      description: "List tags in an Orderr organization.",
      inputSchema: { organizationId: z.string().min(1) },
    },
    async ({ organizationId }) => {
      await requireMembership(userId, organizationId);
      const rows = await useDB().select().from(tags).where(eq(tags.organizationId, organizationId));
      return textResult(rows);
    },
  );

  server.registerTool(
    "create_tag",
    {
      description: "Create a tag in an Orderr organization.",
      inputSchema: {
        organizationId: z.string().min(1),
        name: z.string().trim().min(1).max(50),
        color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#6366f1"),
      },
    },
    async ({ organizationId, name, color }) => {
      await requireMembership(userId, organizationId);
      const [tag] = await useDB()
        .insert(tags)
        .values({ id: crypto.randomUUID(), organizationId, name, color })
        .returning();
      return textResult({ tag });
    },
  );

  server.registerTool(
    "search_products",
    {
      description: "Search the indexed vendor product catalog by product name, SKU, or description.",
      inputSchema: {
        query: z.string().trim().min(1),
        limit: z.number().int().min(1).max(100).default(10),
        vendorNames: z.array(z.string().min(1)).optional(),
        sort: z.enum(["relevance", "price-asc", "price-desc"]).default("relevance"),
      },
    },
    async ({ query, limit, vendorNames, sort }) => {
      const host = process.env.MEILISEARCH_HOST;
      if (!host) throw new Error("Product search is not configured.");
      const filter = vendorNames?.length
        ? vendorNames
            .map((name) => `vendorName = '${name.replace(/'/g, "\\'")}'`)
            .join(" OR ")
        : undefined;
      const index = new Meilisearch({
        host,
        apiKey: process.env.MEILISEARCH_API_KEY,
      }).index(process.env.MEILISEARCH_INDEX || "products");
      const result = await index.search(query, {
        limit,
        filter,
        sort: sort === "relevance" ? undefined : [sort === "price-asc" ? "price:asc" : "price:desc"],
        hybrid: { embedder: "default", semanticRatio: 0.5 },
      });
      return textResult({
        hits: result.hits,
        query: result.query,
        estimatedTotalHits: result.estimatedTotalHits,
      });
    },
  );

  return server;
}
