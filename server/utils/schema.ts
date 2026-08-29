import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  integer,
  bigint,
  primaryKey,
  index,
  boolean,
  customType
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { organization, user } from './auth-schema'

export const vendors = pgTable('vendors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull().$type<'shopify' | 'bigcommerce' | 'amazon'>(),
  config: text('config').notNull(),
  hostname: text('hostname').notNull()
})

export const tags = pgTable('tags', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6366f1'),
  createdAt: timestamp('created_at').defaultNow().notNull()
})

export const orderStatusEnum = pgEnum('order_status', [
  'to_order',
  'ordered',
  'arrived'
])

// An order is a per-vendor purchase order (the header). Parts live in
// `order_items`. Status and vendor live here; the order advances as a unit.
export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    vendorId: text('vendor_id').references(() => vendors.id, {
      onDelete: 'set null'
    }),
    vendorName: text('vendor_name'),
    status: orderStatusEnum('status').default('to_order').notNull(),
    requestedBy: text('requested_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    orderedAt: timestamp('ordered_at'),
    arrivedAt: timestamp('arrived_at'),
    // Post-order fulfilment details.
    trackingCarrier: text('tracking_carrier'),
    trackingNumber: text('tracking_number'),
    shippingCents: integer('shipping_cents'),
    taxCents: integer('tax_cents'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull()
  },
  table => [
    index('orders_organizationId_idx').on(table.organizationId),
    index('orders_status_idx').on(table.status)
  ]
)

// A single part (line item) within an order.
export const orderItems = pgTable(
  'order_items',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    partName: text('part_name').notNull(),
    description: text('description'),
    quantity: integer('quantity').default(1).notNull(),
    // Micro-dollars (1e-6 USD). Distributors quote sub-cent unit prices at
    // quantity breaks — DigiKey goes to five decimals — so whole cents would
    // round the real price away. Integer keeps the arithmetic exact.
    unitPriceMicros: bigint('unit_price_micros', { mode: 'number' }),
    variantId: text('variant_id'),
    variantTitle: text('variant_title'),
    externalUrl: text('external_url'),
    requestedBy: text('requested_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull()
  },
  table => [index('order_items_orderId_idx').on(table.orderId)]
)

// Tags are attached to individual parts (line items).
export const orderTags = pgTable(
  'order_tags',
  {
    orderItemId: text('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' })
  },
  table => [primaryKey({ columns: [table.orderItemId, table.tagId] })]
)

// How an order was paid for — supports split payments (e.g. part on a credit
// card, part via a Kit of Parts voucher, part off a coupon code).
export const orderPayments = pgTable(
  'order_payments',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    type: text('type')
      .notNull()
      .$type<'credit_card' | 'voucher' | 'coupon' | 'other'>(),
    label: text('label').notNull(),
    amountCents: integer('amount_cents').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => [index('order_payments_orderId_idx').on(table.orderId)]
)

// Drizzle has no bytea column, and node-postgres already maps the type to a
// Buffer in both directions, so the custom type only has to name it.
const bytea = customType<{ data: Buffer, driverData: Buffer }>({
  dataType() {
    return 'bytea'
  }
})

// Receipts attached to a purchase order, for the audit trail. Several per
// order is normal: a vendor invoice plus a packing slip, or one per shipment
// when an order splits.
//
// The bytes live in Postgres rather than on disk deliberately. The nightly
// backup is a pg_dump and nothing else -- anything on the filesystem is
// covered only by the weekly droplet snapshot, so a receipt uploaded and lost
// inside the same week would be unrecoverable. Storing it here gives receipts
// the same restore guarantee as the orders they document.
export const orderReceipts = pgTable(
  'order_receipts',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    content: bytea('content').notNull(),
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => [index('order_receipts_orderId_idx').on(table.orderId)]
)

export const ordersRelations = relations(orders, ({ one, many }) => ({
  organization: one(organization, {
    fields: [orders.organizationId],
    references: [organization.id]
  }),
  vendor: one(vendors, {
    fields: [orders.vendorId],
    references: [vendors.id]
  }),
  items: many(orderItems),
  payments: many(orderPayments),
  receipts: many(orderReceipts)
}))

export const orderReceiptsRelations = relations(orderReceipts, ({ one }) => ({
  order: one(orders, {
    fields: [orderReceipts.orderId],
    references: [orders.id]
  }),
  uploader: one(user, {
    fields: [orderReceipts.uploadedBy],
    references: [user.id]
  })
}))

export const orderPaymentsRelations = relations(orderPayments, ({ one }) => ({
  order: one(orders, {
    fields: [orderPayments.orderId],
    references: [orders.id]
  })
}))

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id]
  }),
  orderTags: many(orderTags)
}))

export const tagsRelations = relations(tags, ({ one, many }) => ({
  organization: one(organization, {
    fields: [tags.organizationId],
    references: [organization.id]
  }),
  orderTags: many(orderTags)
}))

export const orderTagsRelations = relations(orderTags, ({ one }) => ({
  orderItem: one(orderItems, {
    fields: [orderTags.orderItemId],
    references: [orderItems.id]
  }),
  tag: one(tags, {
    fields: [orderTags.tagId],
    references: [tags.id]
  })
}))

export const productCache = pgTable('product_cache', {
  id: text('id').primaryKey(),
  productJson: text('product_json').notNull(),
  vendorId: text('vendor_id').notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull()
})

export const productCacheRelations = relations(productCache, ({ one }) => ({
  vendor: one(vendors, {
    fields: [productCache.vendorId],
    references: [vendors.id]
  })
}))

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    orderCreated: boolean("order_created").default(true).notNull(),
    orderStatusChanged: boolean("order_status_changed").default(true).notNull(),
    orderDeleted: boolean("order_deleted").default(false).notNull(),
    dailyDigest: boolean("daily_digest").default(false).notNull(),
    digestTime: text("digest_time").default("09:00").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("notification_preferences_userId_idx").on(table.userId),
    index("notification_preferences_organizationId_idx").on(
      table.organizationId,
    ),
  ],
);

export const notificationLog = pgTable(
  "notification_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    subject: text("subject").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    status: text("status").default("sent").notNull(),
    errorMessage: text("error_message"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notification_log_userId_idx").on(table.userId),
    index("notification_log_organizationId_idx").on(table.organizationId),
    index("notification_log_type_idx").on(table.type),
    index("notification_log_createdAt_idx").on(table.createdAt),
  ],
);

export const notificationPreferencesRelations = relations(
  notificationPreferences,
  ({ one }) => ({
    user: one(user, {
      fields: [notificationPreferences.userId],
      references: [user.id],
    }),
    organization: one(organization, {
      fields: [notificationPreferences.organizationId],
      references: [organization.id],
    }),
  }),
);

export const notificationLogRelations = relations(
  notificationLog,
  ({ one }) => ({
    user: one(user, {
      fields: [notificationLog.userId],
      references: [user.id],
    }),
    organization: one(organization, {
      fields: [notificationLog.organizationId],
      references: [organization.id],
    }),
  }),
);
