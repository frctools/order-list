// Unit prices are stored in micro-dollars (1e-6 USD) so sub-cent quantity
// break pricing survives a round trip. Order totals stay in whole cents —
// that's what actually gets paid.

export const MICROS_PER_CENT = 10_000
export const MICROS_PER_DOLLAR = 1_000_000

export function microsToCents(micros: number): number {
  return Math.round(micros / MICROS_PER_CENT)
}

export function dollarsToMicros(dollars: number): number {
  return Math.round(dollars * MICROS_PER_DOLLAR)
}

export function microsToDollars(micros: number): number {
  return micros / MICROS_PER_DOLLAR
}

function currency(value: number, maximumFractionDigits: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits
    }).format(value)
  } catch {
    return `$${value.toFixed(maximumFractionDigits)}`
  }
}

export function formatCents(value?: number | null): string | null {
  if (value === undefined || value === null) return null
  return currency(value / 100, 2)
}

// A unit price reads as plain money when it lands on whole cents ($2.40), and
// only spells out the extra digits when the price genuinely carries them
// ($0.231) — otherwise every price would grow a tail of zeros.
export function formatMicros(value?: number | null): string | null {
  if (value === undefined || value === null) return null
  const wholeCents = value % MICROS_PER_CENT === 0
  return currency(microsToDollars(value), wholeCents ? 2 : 6)
}

// What a line actually costs: exact in micros, rounded once at the end.
export function lineTotalCents(
  unitPriceMicros: number | null | undefined,
  quantity: number
): number {
  return microsToCents((unitPriceMicros ?? 0) * quantity)
}
