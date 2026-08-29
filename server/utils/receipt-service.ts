import { and, asc, eq } from "drizzle-orm";
import { useDB } from "./db";
import { orderReceipts, orders } from "./schema";
import { user as authUser } from "./auth-schema";
import type { OrderContext } from "./order-service";

// 10 MB. A scanned multi-page invoice lands around 1-2 MB and a phone photo
// under 5 MB, so this leaves headroom without letting one upload dominate the
// nightly pg_dump these rows ride along in.
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export interface OrderReceiptRecord {
  id: string;
  orderId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedByName: string | null;
  createdAt: Date;
}

export interface ReceiptFile extends OrderReceiptRecord {
  content: Buffer;
}

type DB = ReturnType<typeof useDB>;

// Sniffed from the bytes rather than trusted from the multipart headers, which
// the client controls: a declared "application/pdf" says nothing about what was
// actually sent. The canonical type returned here is what gets stored and what
// is later echoed back as the download's Content-Type.
const SIGNATURES: { mime: string; matches: (b: Buffer) => boolean }[] = [
  {
    mime: "application/pdf",
    matches: b => b.subarray(0, 5).toString("latin1") === "%PDF-"
  },
  {
    mime: "image/jpeg",
    matches: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  },
  {
    mime: "image/png",
    matches: b =>
      b.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      )
  },
  {
    mime: "image/webp",
    matches: b =>
      b.subarray(0, 4).toString("latin1") === "RIFF"
      && b.subarray(8, 12).toString("latin1") === "WEBP"
  }
];

export const ACCEPTED_MIME_TYPES = SIGNATURES.map(s => s.mime);

/** The real type of these bytes, or null if it is not one we accept. */
export function detectMimeType(content: Buffer): string | null {
  if (content.length < 12) return null;
  return SIGNATURES.find(s => s.matches(content))?.mime ?? null;
}

/**
 * Strip anything that would let a filename escape its own header or the page
 * that renders it. Content-Disposition is quoted, so quotes, backslashes and
 * newlines are the dangerous characters; path separators matter because the
 * name is only ever a label but may be used as a download's default.
 */
export function sanitizeFilename(raw: string, mimeType: string): string {
  const fallbackExt = mimeType === "application/pdf"
    ? "pdf"
    : mimeType.replace("image/", "");

  const base = raw
    .split(/[\\/]/)
    .pop()
    // Stripping control characters is the entire purpose of this pass: they
    // are exactly what would let a filename break out of the quoted
    // Content-Disposition header it ends up in.
    // eslint-disable-next-line no-control-regex
    ?.replace(/[\u0000-\u001f\u007f"\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return base && base !== "." && base !== ".."
    ? base
    : `receipt.${fallbackExt}`;
}

/**
 * Confirms the order exists inside the caller's organization. Every receipt
 * route goes through this first: the receipt id alone must never be enough to
 * reach a file, or one organization could read another's audit trail.
 */
async function assertOrderInOrg(
  db: DB,
  ctx: OrderContext,
  orderId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.organizationId, ctx.organizationId)))
    .limit(1);

  return Boolean(row);
}

/** Metadata only -- the content column is deliberately never selected here. */
export async function listReceipts(
  ctx: OrderContext,
  orderId: string
): Promise<OrderReceiptRecord[] | null> {
  const db = useDB();
  if (!(await assertOrderInOrg(db, ctx, orderId))) return null;

  return db
    .select({
      id: orderReceipts.id,
      orderId: orderReceipts.orderId,
      filename: orderReceipts.filename,
      mimeType: orderReceipts.mimeType,
      sizeBytes: orderReceipts.sizeBytes,
      uploadedBy: orderReceipts.uploadedBy,
      uploadedByName: authUser.name,
      createdAt: orderReceipts.createdAt
    })
    .from(orderReceipts)
    .leftJoin(authUser, eq(orderReceipts.uploadedBy, authUser.id))
    .where(eq(orderReceipts.orderId, orderId))
    .orderBy(asc(orderReceipts.createdAt));
}

export type AddReceiptResult =
  | { ok: true, receipt: OrderReceiptRecord }
  | { ok: false, reason: "not-found" | "too-large" | "unsupported-type" | "empty" };

export async function addReceipt(
  ctx: OrderContext,
  orderId: string,
  file: { filename: string, content: Buffer }
): Promise<AddReceiptResult> {
  const db = useDB();
  if (!(await assertOrderInOrg(db, ctx, orderId))) {
    return { ok: false, reason: "not-found" };
  }

  if (file.content.length === 0) return { ok: false, reason: "empty" };
  if (file.content.length > MAX_RECEIPT_BYTES) {
    return { ok: false, reason: "too-large" };
  }

  const mimeType = detectMimeType(file.content);
  if (!mimeType) return { ok: false, reason: "unsupported-type" };

  const id = crypto.randomUUID();
  const filename = sanitizeFilename(file.filename, mimeType);

  await db.insert(orderReceipts).values({
    id,
    orderId,
    filename,
    mimeType,
    sizeBytes: file.content.length,
    content: file.content,
    uploadedBy: ctx.userId
  });

  const [row] = await db
    .select({
      id: orderReceipts.id,
      orderId: orderReceipts.orderId,
      filename: orderReceipts.filename,
      mimeType: orderReceipts.mimeType,
      sizeBytes: orderReceipts.sizeBytes,
      uploadedBy: orderReceipts.uploadedBy,
      uploadedByName: authUser.name,
      createdAt: orderReceipts.createdAt
    })
    .from(orderReceipts)
    .leftJoin(authUser, eq(orderReceipts.uploadedBy, authUser.id))
    .where(eq(orderReceipts.id, id))
    .limit(1);

  return { ok: true, receipt: row! };
}

/** The one place `content` is read, for the authenticated download route. */
export async function getReceiptFile(
  ctx: OrderContext,
  orderId: string,
  receiptId: string
): Promise<ReceiptFile | null> {
  const db = useDB();
  if (!(await assertOrderInOrg(db, ctx, orderId))) return null;

  const [row] = await db
    .select({
      id: orderReceipts.id,
      orderId: orderReceipts.orderId,
      filename: orderReceipts.filename,
      mimeType: orderReceipts.mimeType,
      sizeBytes: orderReceipts.sizeBytes,
      content: orderReceipts.content,
      uploadedBy: orderReceipts.uploadedBy,
      uploadedByName: authUser.name,
      createdAt: orderReceipts.createdAt
    })
    .from(orderReceipts)
    .leftJoin(authUser, eq(orderReceipts.uploadedBy, authUser.id))
    .where(and(eq(orderReceipts.id, receiptId), eq(orderReceipts.orderId, orderId)))
    .limit(1);

  return row ?? null;
}

export async function deleteReceipt(
  ctx: OrderContext,
  orderId: string,
  receiptId: string
): Promise<boolean> {
  const db = useDB();
  if (!(await assertOrderInOrg(db, ctx, orderId))) return false;

  const deleted = await db
    .delete(orderReceipts)
    .where(and(eq(orderReceipts.id, receiptId), eq(orderReceipts.orderId, orderId)))
    .returning({ id: orderReceipts.id });

  return deleted.length > 0;
}
