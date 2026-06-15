export type KitItemInput = {
  partName: string;
  description?: string | null;
  quantity: number;
  unitPriceCents?: number | null;
  variantId?: string | null;
  variantTitle?: string | null;
  vendorId?: string | null;
  vendorName?: string | null;
  externalUrl?: string | null;
  imageUrl?: string | null;
};

export type SaveKitInput = {
  title: string;
  description?: string | null;
  items: KitItemInput[];
};

export type SharedKitItem = {
  id: string;
  sortOrder: number;
} & Required<Pick<KitItemInput, "partName" | "quantity">> &
  Omit<KitItemInput, "partName" | "quantity">;

export type SharedKit = {
  id: string;
  shareId: string;
  title: string;
  description: string | null;
  organizationId: string;
  organizationName: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  items: SharedKitItem[];
};
