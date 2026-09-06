import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  integer,
  primaryKey,
  index,
  boolean,
  uniqueIndex
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

export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    color: text('color').default('#2563eb').notNull(),
    isArchived: boolean('is_archived').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull()
  },
  table => [
    index('projects_organizationId_idx').on(table.organizationId),
    uniqueIndex('projects_organizationId_slug_unique').on(
      table.organizationId,
      table.slug
    )
  ]
)

export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    partName: text('part_name').notNull(),
    description: text('description'),
    status: orderStatusEnum('status').default('to_order').notNull(),
    quantity: integer('quantity').default(1).notNull(),
    unitPriceCents: integer('unit_price_cents'),
    variantId: text('variant_id'),
    variantTitle: text('variant_title'),
    vendorId: text('vendor_id'),
    vendorName: text('vendor_name'),
    externalUrl: text('external_url'),
    orderedAt: timestamp('ordered_at'),
    arrivedAt: timestamp('arrived_at'),
    requestedBy: text('requested_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull()
  },
  table => [
    index('orders_organizationId_projectId_idx').on(
      table.organizationId,
      table.projectId
    )
  ]
)

export const orderTags = pgTable(
  'order_tags',
  {
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' })
  },
  table => [primaryKey({ columns: [table.orderId, table.tagId] })]
)

export const tagsRelations = relations(tags, ({ one, many }) => ({
  organization: one(organization, {
    fields: [tags.organizationId],
    references: [organization.id]
  }),
  orderTags: many(orderTags)
}))

export const orderTagsRelations = relations(orderTags, ({ one }) => ({
  order: one(orders, {
    fields: [orderTags.orderId],
    references: [orders.id]
  }),
  tag: one(tags, {
    fields: [orderTags.tagId],
    references: [tags.id]
  })
}))

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organization, {
    fields: [projects.organizationId],
    references: [organization.id]
  }),
  orders: many(orders)
}))

export const ordersRelations = relations(orders, ({ one, many }) => ({
  project: one(projects, {
    fields: [orders.projectId],
    references: [projects.id]
  }),
  orderTags: many(orderTags)
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

export const productSnapshots = pgTable(
  'product_snapshots',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => productCache.id, { onDelete: 'cascade' }),
    vendorId: text('vendor_id').notNull(),
    priceCents: integer('price_cents'),
    stockQuantity: integer('stock_quantity'),
    currency: text('currency'),
    capturedAt: timestamp('captured_at').defaultNow().notNull()
  },
  table => [
    index('product_snapshots_productId_capturedAt_idx').on(
      table.productId,
      table.capturedAt
    ),
    index('product_snapshots_vendorId_idx').on(table.vendorId)
  ]
)

export const productSnapshotsRelations = relations(
  productSnapshots,
  ({ one }) => ({
    product: one(productCache, {
      fields: [productSnapshots.productId],
      references: [productCache.id]
    })
  })
)

export const kits = pgTable(
  'kits',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    shareId: text('share_id').notNull().unique(),
    title: text('title').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull()
  },
  table => [
    index('kits_organizationId_idx').on(table.organizationId),
    index('kits_shareId_idx').on(table.shareId)
  ]
)

export const kitItems = pgTable(
  'kit_items',
  {
    id: text('id').primaryKey(),
    kitId: text('kit_id')
      .notNull()
      .references(() => kits.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').default(0).notNull(),
    partName: text('part_name').notNull(),
    description: text('description'),
    quantity: integer('quantity').default(1).notNull(),
    unitPriceCents: integer('unit_price_cents'),
    variantId: text('variant_id'),
    variantTitle: text('variant_title'),
    vendorId: text('vendor_id'),
    vendorName: text('vendor_name'),
    externalUrl: text('external_url'),
    imageUrl: text('image_url'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => [
    index('kit_items_kitId_idx').on(table.kitId),
    index('kit_items_vendorId_idx').on(table.vendorId)
  ]
)

export const kitsRelations = relations(kits, ({ one, many }) => ({
  organization: one(organization, {
    fields: [kits.organizationId],
    references: [organization.id]
  }),
  creator: one(user, {
    fields: [kits.createdBy],
    references: [user.id]
  }),
  items: many(kitItems)
}))

export const kitItemsRelations = relations(kitItems, ({ one }) => ({
  kit: one(kits, {
    fields: [kitItems.kitId],
    references: [kits.id]
  }),
  vendor: one(vendors, {
    fields: [kitItems.vendorId],
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
    invitationReceived: boolean("invitation_received").default(true).notNull(),
    memberJoined: boolean("member_joined").default(true).notNull(),
    tagCreated: boolean("tag_created").default(false).notNull(),
    tagModified: boolean("tag_modified").default(false).notNull(),
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
