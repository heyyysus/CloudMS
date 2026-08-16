// Files the auto-generated invoice and receipt PDFs as policy attachments,
// and hides them again when the record they document is voided. Called from
// routes/invoices.ts and routes/payments.ts.
//
// Everything here is best-effort, mirroring recordPolicyChangeForm in
// routes/policies.ts: the accounting write has already committed by the time
// these run, so nothing may throw. Every failure - most commonly R2 being
// unconfigured, but also a bug in this code - is logged and swallowed rather
// than turning a successful invoice or payment into a failed request.
import { Request } from "express"
import {
  buildAccountingDocumentPdf,
  formatDocumentNumber,
  type InvoiceDetail,
} from "../accountingDocuments"
import {
  findAutoPolicyById,
  getClientWithDetails,
  getInvoiceWithDetails,
  getReceiptWithDetails,
  markAttachmentsVoidedBySource,
  storeGeneratedPolicyAttachment,
} from "../repositories"
import type { AttachmentSourceType } from "../types"

async function bestEffort(req: Request, what: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    req.log.error(err, `Failed to ${what}`)
  }
}

// The header fields the PDF needs that aren't on the invoice row itself.
async function documentHeader(
  invoice: InvoiceDetail
): Promise<{ clientName: string; policyNumber: string }> {
  const [client, policy] = await Promise.all([
    getClientWithDetails(invoice.clientId),
    findAutoPolicyById(invoice.policyId),
  ])
  return {
    clientName: client
      ? `${client.namedInsured.firstName} ${client.namedInsured.lastName}`
      : "Unknown client",
    policyNumber: policy?.policyNumber ?? "Unknown policy",
  }
}

export async function recordInvoiceDocument(req: Request, invoice: InvoiceDetail): Promise<void> {
  await bestEffort(req, "record the invoice document", async () => {
    const header = await documentHeader(invoice)
    const pdf = await buildAccountingDocumentPdf({
      kind: "invoice",
      invoice,
      generatedAt: new Date(),
      ...header,
    })
    await storeGeneratedPolicyAttachment({
      policyId: invoice.policyId,
      pdf,
      fileName: `Invoice ${formatDocumentNumber(invoice.id)}.pdf`,
      keySlug: "invoice",
      description: "Auto-generated invoice",
      sourceType: "invoice",
      sourceId: invoice.id,
      createdBy: req.user!.id,
    })
  })
}

export async function recordReceiptDocument(req: Request, receiptId: number): Promise<void> {
  await bestEffort(req, "record the receipt document", async () => {
    const receipt = await getReceiptWithDetails(receiptId)
    if (!receipt) return
    // The receipt's own `invoice` relation lacks the sibling payments the
    // document lists, so the full invoice detail is fetched separately.
    const invoice = await getInvoiceWithDetails(receipt.invoiceId)
    if (!invoice) return

    const header = await documentHeader(invoice)
    const pdf = await buildAccountingDocumentPdf({
      kind: "receipt",
      invoice,
      receipt: { id: receipt.id, paymentId: receipt.paymentId },
      generatedAt: new Date(),
      ...header,
    })
    await storeGeneratedPolicyAttachment({
      policyId: receipt.policyId,
      pdf,
      fileName: `Receipt ${formatDocumentNumber(receipt.id)}.pdf`,
      keySlug: "receipt",
      description: "Auto-generated receipt",
      sourceType: "receipt",
      sourceId: receipt.id,
      createdBy: req.user!.id,
    })
  })
}

export async function voidAccountingDocument(
  req: Request,
  sourceType: AttachmentSourceType,
  sourceId: number
): Promise<void> {
  await bestEffort(req, `void the ${sourceType} document`, () =>
    markAttachmentsVoidedBySource(sourceType, sourceId)
  )
}
