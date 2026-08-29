import { defineEventHandler, createError, getQuery, setResponseHeaders } from "h3";
import { requireOrganizationContext } from "../../../../utils/session";
import { getReceiptFile } from "../../../../utils/receipt-service";

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);
  const orderId = event.context.params?.id;
  const receiptId = event.context.params?.receiptId;
  if (!orderId || !receiptId) {
    throw createError({ statusCode: 400, statusMessage: "Missing id" });
  }

  const receipt = await getReceiptFile(
    { organizationId, userId: user.id },
    orderId,
    receiptId
  );
  if (!receipt) {
    throw createError({ statusCode: 404, statusMessage: "Receipt not found" });
  }

  // Default to inline so a receipt can be previewed in the browser, which is
  // most of the point of keeping them; ?download=1 forces a save instead.
  const disposition = getQuery(event).download ? "attachment" : "inline";
  // The filename is already stripped of quotes, backslashes and control
  // characters; filename* carries anything non-ASCII that survived.
  const encoded = encodeURIComponent(receipt.filename);

  setResponseHeaders(event, {
    "Content-Type": receipt.mimeType,
    "Content-Length": String(receipt.sizeBytes),
    "Content-Disposition":
      `${disposition}; filename="${receipt.filename}"; filename*=UTF-8''${encoded}`,
    // These bytes came from a user and are served from the app's own origin.
    // nosniff keeps the browser on the type we sniffed rather than guessing
    // its way to HTML, and the sandboxed, source-less CSP neutralises anything
    // active inside a PDF.
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
    // Receipts are organization data, so no shared cache may keep a copy.
    "Cache-Control": "private, max-age=0, no-store"
  });

  return receipt.content;
});
