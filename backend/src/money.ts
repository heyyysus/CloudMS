// Money is stored as numeric(12,2) and surfaced as decimal strings (drizzle
// returns numeric columns as strings). All arithmetic goes through integer
// cents so we never accumulate binary-float error, then formats back to a
// 2-decimal string for storage/serialization.

export function toCents(amount: string | number): number {
  return Math.round(Number(amount) * 100)
}

export function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2)
}

// Sum of decimal amounts, exact, returned as a 2-decimal string.
export function sumAmounts(amounts: (string | number)[]): string {
  return centsToAmount(amounts.reduce((acc: number, a) => acc + toCents(a), 0))
}
