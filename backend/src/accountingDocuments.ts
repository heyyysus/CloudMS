// Builds the auto-generated accounting documents: a one-page PDF for an
// invoice when it is created, and one for each receipt a payment mints. Wired
// into POST /invoices and POST /payments (routes/accountingDocuments.ts),
// which upload the PDF as a policy attachment.
//
// The layout deliberately mirrors the on-screen printable receipt
// (frontend/src/components/clients/invoice-receipt-dialog.tsx) so the filed
// PDF and the browser print-out say the same thing.
import PDFDocument from "pdfkit"
import {
  formatUsd,
  INVOICE_ITEM_TYPE_LABEL,
  INVOICE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
} from "./invoiceLabels"
import { centsToAmount, toCents } from "./money"
import { formatGeneratedOn, PDF_FONT, PDF_FONT_BOLD, sanitizeForPdf } from "./pdfFormat"
import type { getInvoiceWithDetails } from "./repositories"

export type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoiceWithDetails>>>

// Invoice and receipt numbers are the rows' serial ids (see db/schema.ts), so
// they're padded here rather than stored. Ids past 99999 simply get longer.
export function formatDocumentNumber(id: number): string {
  return `#${String(id).padStart(5, "0")}`
}

export interface AccountingDocumentMeta {
  // "invoice" is filed when the invoice is created; "receipt" when a payment
  // is recorded, and then `receipt` names which payment it acknowledges.
  kind: "invoice" | "receipt"
  invoice: InvoiceDetail
  receipt?: { id: number; paymentId: number }
  clientName: string
  policyNumber: string
  generatedAt: Date
}

// Amount still owed on the invoice, floored at 0. Mirrors amountDueCents in
// frontend/src/api/invoices.ts, via integer cents so no binary-float error
// creeps into a printed figure.
function amountDue(invoice: InvoiceDetail): string {
  return centsToAmount(Math.max(toCents(invoice.total) - toCents(invoice.amountPaid), 0))
}

export function buildAccountingDocumentPdf(meta: AccountingDocumentMeta): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const left = doc.page.margins.left
    const right = doc.page.width - doc.page.margins.right
    const amountWidth = 90
    const labelWidth = right - left - amountWidth - 10

    // A "description ......... $0.00" line: label wrapping on the left, amount
    // right-aligned in its own column. Both cells are drawn at the same y and
    // doc.y is advanced past whichever wrapped further. Defined here (rather
    // than as a module-level function taking `doc`) so it can close over `doc`
    // without needing PDFKit's document type name.
    //
    // Both helpers reset doc.x to the left margin on the way out: PDFKit keeps
    // the x of the last text it drew, so without this the next plain doc.text
    // call would start in the amount column and wrap off the page.
    function renderAmountRow(label: string, amount: string, bold = false): void {
      const y = doc.y
      doc.font(bold ? PDF_FONT_BOLD : PDF_FONT)
      doc.text(sanitizeForPdf(label), left, y, { width: labelWidth })
      const afterLabelY = doc.y
      doc.text(amount, right - amountWidth, y, { width: amountWidth, align: "right" })
      doc.y = Math.max(afterLabelY, doc.y)
      doc.x = left
      doc.font(PDF_FONT)
    }

    // A smaller, indented note under the row just drawn (line-item
    // descriptions, payment notes, change given).
    function renderSubLine(text: string): void {
      doc.fontSize(9).text(sanitizeForPdf(text), left + 14, doc.y, { width: labelWidth })
      doc.x = left
      doc.fontSize(11)
    }

    function renderRule(): void {
      doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke()
      doc.moveDown(0.5)
    }

    const { invoice } = meta
    const title =
      meta.kind === "receipt" && meta.receipt
        ? `Receipt ${formatDocumentNumber(meta.receipt.id)}`
        : `Invoice ${formatDocumentNumber(invoice.id)}`

    doc.font(PDF_FONT)

    doc.font(PDF_FONT_BOLD).fontSize(18).text(title, { align: "center" })
    doc.font(PDF_FONT)
    doc.moveDown(0.5)

    doc.fontSize(11)
    doc.text(`Generated on: ${formatGeneratedOn(meta.generatedAt)}`)
    doc.moveDown()

    doc.text(meta.clientName)
    doc.text(`Client #${invoice.clientId}`)
    doc.text(`Policy #${meta.policyNumber}`)
    doc.moveDown(0.5)

    renderAmountRow(
      `Invoice ${formatDocumentNumber(invoice.id)}`,
      INVOICE_STATUS_LABEL[invoice.status],
      true
    )
    doc.moveDown(0.5)

    renderRule()

    for (const item of invoice.items) {
      const carrier = item.carrier ? ` — ${item.carrier.name}` : ""
      renderAmountRow(`${INVOICE_ITEM_TYPE_LABEL[item.type]}${carrier}`, formatUsd(item.amount))
      if (item.description) renderSubLine(item.description)
    }
    doc.moveDown(0.25)
    renderRule()
    renderAmountRow("Total", formatUsd(invoice.total), true)
    doc.moveDown()

    // Voided payments had their money reversed and no longer count toward
    // amountPaid, so they must not appear on the document either.
    const activePayments = invoice.payments.filter((payment) => payment.voidedAt === null)
    if (activePayments.length > 0) {
      doc.font(PDF_FONT_BOLD).fontSize(13).text("Payments")
      doc.font(PDF_FONT).fontSize(11)
      doc.moveDown(0.25)

      for (const payment of activePayments) {
        const receipt = invoice.receipts.find((r) => r.paymentId === payment.id)
        const receiptSuffix = receipt ? ` — Receipt ${formatDocumentNumber(receipt.id)}` : ""
        // On a receipt document, mark the one payment this receipt covers so
        // the reader can tell it apart from the invoice's other payments.
        const thisOne = meta.receipt?.paymentId === payment.id ? " (this receipt)" : ""
        renderAmountRow(
          `${PAYMENT_METHOD_LABEL[payment.method]}${receiptSuffix}${thisOne}`,
          formatUsd(payment.amountApplied)
        )
        if (payment.note) renderSubLine(payment.note)
        if (toCents(payment.changeGiven) > 0) {
          renderSubLine(`Change given: ${formatUsd(payment.changeGiven)}`)
        }
      }
      doc.moveDown(0.5)
    }

    renderRule()
    renderAmountRow("Amount due", formatUsd(amountDue(invoice)), true)

    if (invoice.note) {
      doc.moveDown()
      doc.font(PDF_FONT_BOLD).text("Notes")
      doc.font(PDF_FONT).text(sanitizeForPdf(invoice.note), { width: right - left })
    }

    doc.end()
  })
}
