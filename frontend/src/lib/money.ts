// Money is numeric(12,2) on the backend, surfaced as decimal strings that may
// drop trailing zeros in nested objects ("300" == "300.00"). All arithmetic
// here goes through integer cents to avoid binary-float error, mirroring
// backend/src/money.ts.
import { z } from 'zod'

export function toCents(amount: string | number): number {
  return Math.round(Number(amount) * 100)
}

export function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2)
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

export function formatMoney(amount: string | number): string {
  return currencyFormatter.format(typeof amount === 'number' ? amount : Number(amount))
}

// UX-level validation only; the server is the source of truth for what a
// valid amount is (positive, <= numeric(12,2)).
export const moneyAmountSchema = z
  .string()
  .trim()
  .min(1, 'Enter an amount')
  .regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid amount')
  .refine((value) => Number(value) > 0, 'Must be greater than 0')
