import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { useDB } from "./db";
import { organization, user as authUser } from "./auth-schema";
import { kitItems, kits, vendors } from "./schema";

const kitItemSchema = z.object({
  partName: z.string().trim().min(1, "Part name is required"),
  description: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (value && value.length > 0 ? value : null)),
  quantity: z.coerce.number().int().min(1).default(1),
  unitPriceCents: z
    .union([z.coerce.number().int().min(0), z.null(), z.undefined()])
    .transform((value) => (typeof value === "number" ? value : null)),
  variantId: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (value && value.length > 0 ? value : null)),
  variantTitle: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (value && value.length > 0 ? value : null)),
  vendorId: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (value && value.length > 0 ? value : null)),
  vendorName: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (value && value.length > 0 ? value : null)),
  externalUrl: z
    .union([z.string().url("Enter a valid URL"), z.literal(""), z.null(), z.undefined()])
    .transform((value) => (value && value.length > 0 ? value : null)),
  imageUrl: z
    .union([
      z.string().url("Enter a valid image URL"),
      z.literal(""),
      z.null(),
      z.undefined(),
    ])
    .transform((value) => (value && value.length > 0 ? value : null)),
});

export const saveKitSchema = z.object({
  title: z.string().trim().min(1, "Kit title is required").max(120),
  description: z
    .union([z.string().max(1000, "Description must be 1000 characters or less"), z.null(), z.undefined()])
    .transform((value) => (value && value.length > 0 ? value : null)),
  items: z.array(kitItemSchema).min(1, "At least one product is required"),
});

export const createKitSchema = saveKitSchema;
export const updateKitSchema = saveKitSchema;

export type SaveKitInput = z.infer<typeof saveKitSchema>;
export type CreateKitInput = SaveKitInput;
export type SharedKitItem = z.infer<typeof kitItemSchema> & {
  id: string;
  sortOrder: number;
};

export type SharedKit = {
  id: string;
  shareId: string;
  title: string;
  description: string | null;
  organizationId: string;
  organizationName: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: SharedKitItem[];
};

function createShareId() {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function createKit(
  payload: SaveKitInput,
  context: { organizationId: string; userId: string },
): Promise<SharedKit> {
  const db = useDB();
  const kitId = crypto.randomUUID();
  const shareId = createShareId();

  await db.transaction(async (tx) => {
    await tx.insert(kits).values({
      id: kitId,
      organizationId: context.organizationId,
      createdBy: context.userId,
      shareId,
      title: payload.title,
      description: payload.description ?? null,
    });

    await tx.insert(kitItems).values(toKitItemRows(payload.items, kitId));
  });

  const createdKit = await getSharedKitByShareId(shareId);
  if (!createdKit) {
    throw new Error("Failed to load newly created kit");
  }

  return createdKit;
}

export async function listOwnedKits(
  context: { organizationId: string; userId: string },
): Promise<SharedKit[]> {
  const db = useDB();

  const kitRecords = await db
    .select({
      id: kits.id,
      shareId: kits.shareId,
      title: kits.title,
      description: kits.description,
      organizationId: kits.organizationId,
      organizationName: organization.name,
      createdBy: kits.createdBy,
      createdByName: authUser.name,
      createdAt: kits.createdAt,
      updatedAt: kits.updatedAt,
    })
    .from(kits)
    .leftJoin(organization, eq(kits.organizationId, organization.id))
    .leftJoin(authUser, eq(kits.createdBy, authUser.id))
    .where(
      and(
        eq(kits.organizationId, context.organizationId),
        eq(kits.createdBy, context.userId),
      ),
    )
    .orderBy(desc(kits.updatedAt), desc(kits.createdAt));

  const itemsByKit = await getItemsForKitIds(kitRecords.map((kit) => kit.id));

  return kitRecords.map((kit) => ({
    ...kit,
    items: itemsByKit.get(kit.id) ?? [],
  }));
}

export async function updateOwnedKit(
  shareId: string,
  payload: SaveKitInput,
  context: { organizationId: string; userId: string },
): Promise<SharedKit | null> {
  const db = useDB();

  const [existingKit] = await db
    .select({
      id: kits.id,
    })
    .from(kits)
    .where(
      and(
        eq(kits.shareId, shareId),
        eq(kits.organizationId, context.organizationId),
        eq(kits.createdBy, context.userId),
      ),
    );

  if (!existingKit) return null;

  await db.transaction(async (tx) => {
    await tx
      .update(kits)
      .set({
        title: payload.title,
        description: payload.description ?? null,
        updatedAt: new Date(),
      })
      .where(eq(kits.id, existingKit.id));

    await tx.delete(kitItems).where(eq(kitItems.kitId, existingKit.id));
    await tx.insert(kitItems).values(toKitItemRows(payload.items, existingKit.id));
  });

  return getSharedKitByShareId(shareId);
}

export async function getSharedKitByShareId(
  shareId: string,
): Promise<SharedKit | null> {
  const db = useDB();

  const [kitRecord] = await db
    .select({
      id: kits.id,
      shareId: kits.shareId,
      title: kits.title,
      description: kits.description,
      organizationId: kits.organizationId,
      organizationName: organization.name,
      createdBy: kits.createdBy,
      createdByName: authUser.name,
      createdAt: kits.createdAt,
      updatedAt: kits.updatedAt,
    })
    .from(kits)
    .leftJoin(organization, eq(kits.organizationId, organization.id))
    .leftJoin(authUser, eq(kits.createdBy, authUser.id))
    .where(eq(kits.shareId, shareId));

  if (!kitRecord) return null;

  const itemsByKit = await getItemsForKitIds([kitRecord.id]);

  return {
    ...kitRecord,
    items: itemsByKit.get(kitRecord.id) ?? [],
  };
}

async function getItemsForKitIds(kitIds: string[]) {
  const db = useDB();
  const itemRecords =
    kitIds.length > 0
      ? await db
          .select({
            kitId: kitItems.kitId,
            id: kitItems.id,
            sortOrder: kitItems.sortOrder,
            partName: kitItems.partName,
            description: kitItems.description,
            quantity: kitItems.quantity,
            unitPriceCents: kitItems.unitPriceCents,
            variantId: kitItems.variantId,
            variantTitle: kitItems.variantTitle,
            vendorId: kitItems.vendorId,
            vendorName: sql<string | null>`coalesce(${vendors.name}, ${kitItems.vendorName})`,
            externalUrl: kitItems.externalUrl,
            imageUrl: kitItems.imageUrl,
          })
          .from(kitItems)
          .leftJoin(vendors, eq(kitItems.vendorId, vendors.id))
          .where(inArray(kitItems.kitId, kitIds))
          .orderBy(asc(kitItems.sortOrder), asc(kitItems.createdAt))
      : [];

  const itemsByKit = new Map<string, SharedKitItem[]>();
  for (const item of itemRecords) {
    const existing = itemsByKit.get(item.kitId) ?? [];
    existing.push({
      id: item.id,
      sortOrder: item.sortOrder,
      partName: item.partName,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      variantId: item.variantId,
      variantTitle: item.variantTitle,
      vendorId: item.vendorId,
      vendorName: item.vendorName,
      externalUrl: item.externalUrl,
      imageUrl: item.imageUrl,
    });
    itemsByKit.set(item.kitId, existing);
  }

  return itemsByKit;
}

function toKitItemRows(items: SaveKitInput["items"], kitId: string) {
  return items.map((item, index) => ({
    id: crypto.randomUUID(),
    kitId,
    sortOrder: index,
    partName: item.partName,
    description: item.description ?? null,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents ?? null,
    variantId: item.variantId ?? null,
    variantTitle: item.variantTitle ?? null,
    vendorId: item.vendorId ?? null,
    vendorName: item.vendorName ?? null,
    externalUrl: item.externalUrl ?? null,
    imageUrl: item.imageUrl ?? null,
  }));
}
