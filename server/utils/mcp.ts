import { and, desc, eq } from "drizzle-orm";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { member, organization } from "./auth-schema";
import { orders, projects } from "./schema";
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

export function createOrderrMcpServer(userId: string) {
  const server = new McpServer({
    name: "orderr",
    version: "1.0.0",
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

  return server;
}
