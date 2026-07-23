import type {
  InvoiceItemCategory,
  InvoiceItemType,
  InvoiceStatus,
  PaymentMethod,
} from '@/api/invoices'

// A line item's type fixes its category (mirrors backend/src/routes/schemas.ts
// SWEEP_TYPES). Category and type are presented as one combined choice - there
// is no separate category control - so this pairing can never be gotten wrong
// through the UI.
export const INVOICE_ITEM_TYPE_OPTIONS: {
  value: InvoiceItemType
  label: string
  category: InvoiceItemCategory
}[] = [
  { value: 'new_business_sweep', label: 'New business sweep', category: 'sweep' },
  { value: 'new_business_fee', label: 'New business fee', category: 'agency' },
  { value: 'installment_payment_sweep', label: 'Installment payment sweep', category: 'sweep' },
  { value: 'installment_payment_fee', label: 'Installment payment fee', category: 'agency' },
  { value: 'endorsement_sweep', label: 'Endorsement sweep', category: 'sweep' },
  { value: 'endorsement_fee', label: 'Endorsement fee', category: 'agency' },
]

export const INVOICE_ITEM_TYPE_LABEL: Record<InvoiceItemType, string> = Object.fromEntries(
  INVOICE_ITEM_TYPE_OPTIONS.map((option) => [option.value, option.label])
) as Record<InvoiceItemType, string>

export function categoryForItemType(type: InvoiceItemType): InvoiceItemCategory {
  return INVOICE_ITEM_TYPE_OPTIONS.find((option) => option.value === type)!.category
}

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'debit_card', label: 'Debit card' },
]

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = Object.fromEntries(
  PAYMENT_METHOD_OPTIONS.map((option) => [option.value, option.label])
) as Record<PaymentMethod, string>

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  open: 'Open',
  closed: 'Closed',
  void: 'Void',
}

// Mirrors the semantic status tokens used for policy status (lib/policy-status.ts).
export const INVOICE_STATUS_TEXT_CLASS: Record<InvoiceStatus, string> = {
  open: 'text-warning',
  closed: 'text-success',
  void: 'text-muted-foreground',
}
