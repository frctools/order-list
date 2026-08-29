import { defineEventHandler, createError, readMultipartFormData } from "h3";
import { requireOrganizationContext } from "../../../../utils/session";
import { getOrder } from "../../../../utils/order-service";
import {
  addReceipt,
  MAX_RECEIPT_BYTES,
  ACCEPTED_MIME_TYPES
} from "../../../../utils/receipt-service";

const REASONS = {
  "not-found": { statusCode: 404, statusMessage: "Order not found" },
  empty: { statusCode: 400, statusMessage: "The file is empty" },
  "too-large": {
    statusCode: 413,
    statusMessage: `File is larger than ${MAX_RECEIPT_BYTES / (1024 * 1024)} MB`
  },
  "unsupported-type": {
    statusCode: 415,
    statusMessage: `Only ${ACCEPTED_MIME_TYPES.join(", ")} are accepted`
  }
} as const;

export default defineEventHandler(async (event) => {
  const { organizationId, user } = await requireOrganizationContext(event);
  const orderId = event.context.params?.id;
  if (!orderId) {
    throw createError({ statusCode: 400, statusMessage: "Order id is required" });
  }

  const form = await readMultipartFormData(event);
  // A part without a filename is an ordinary field, not an upload.
  const file = form?.find(part => part.name === "file" && part.filename);
  if (!file) {
    throw createError({ statusCode: 400, statusMessage: "No file was uploaded" });
  }

  const result = await addReceipt({ organizationId, userId: user.id }, orderId, {
    filename: file.filename ?? "receipt",
    content: file.data
  });

  if (!result.ok) throw createError(REASONS[result.reason]);

  // Return the whole order too: the dashboard patches its local state from
  // mutation responses rather than refetching.
  return {
    receipt: result.receipt,
    order: await getOrder(orderId, organizationId)
  };
});
