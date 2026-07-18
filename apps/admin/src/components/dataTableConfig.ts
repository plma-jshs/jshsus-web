export const ADMIN_PAGE_SIZES = [20, 50, 100] as const;

export type AdminPageSize = (typeof ADMIN_PAGE_SIZES)[number];

export const ADMIN_DEFAULT_PAGE_SIZE: AdminPageSize = ADMIN_PAGE_SIZES[0];

export function isAdminPageSize(value: number): value is AdminPageSize {
  return ADMIN_PAGE_SIZES.some((pageSize) => pageSize === value);
}

export function normalizeAdminPageSize(value: number): AdminPageSize {
  return isAdminPageSize(value) ? value : ADMIN_DEFAULT_PAGE_SIZE;
}

export const DATA_TABLE_COLUMN_WIDTHS = {
  selection: 52,
  index: 68,
  short: 96,
  status: 108,
  action: 88,
} as const;

export type DataTableWidthPreset = keyof typeof DATA_TABLE_COLUMN_WIDTHS;
