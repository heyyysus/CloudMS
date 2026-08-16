// Builds the auto-generated "policy change form": a plain-English summary of
// what an edit changed, plus a one-page PDF rendering of that summary. Wired
// into PATCH /policies/:id (routes/policies.ts), which logs the summary as a
// policy log and uploads the PDF as a policy attachment.
import PDFDocument from "pdfkit"
import type { getPolicyWithDetails } from "./repositories"
import type { UpdatePolicyInput } from "./repositories/autoPolicies"

export type PolicyDetail = NonNullable<Awaited<ReturnType<typeof getPolicyWithDetails>>>

const FIELD_LABELS: Record<string, string> = {
  carrierId: "Carrier",
  policyNumber: "Policy number",
  policyAddress1: "Policy address line 1",
  policyAddress2: "Policy address line 2",
  policyCity: "Policy city",
  policyState: "Policy state",
  policyZip: "Policy ZIP",
  effectiveDate: "Effective date",
  expirationDate: "Expiration date",
  status: "Status",
}

// Scalar policy fields compared directly by value; carrierId is handled
// separately below so the summary shows carrier names, not ids.
const SCALAR_FIELDS = Object.keys(FIELD_LABELS).filter((key) => key !== "carrierId") as Array<
  keyof PolicyDetail
>

function driverName(driver: PolicyDetail["policyDrivers"][number]): string {
  return `${driver.driver.person.firstName} ${driver.driver.person.lastName}`
}

function vehicleLabel(vehicle: PolicyDetail["vehicles"][number]): string {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model} (VIN ${vehicle.vin})`
}

// Fields compared on a vehicle that survives the edit (matched by VIN), so
// changes like a deductible or coverage limit - or a make/model/year
// correction - are reported even though the vehicle itself wasn't added or
// removed.
const VEHICLE_FIELD_LABELS: Record<string, string> = {
  make: "Make",
  model: "Model",
  year: "Year",
  garagingZip: "Garaging ZIP",
  coverageBi: "Bodily injury coverage",
  coveragePd: "Property damage coverage",
  coverageUmbi: "UM/BI coverage",
  coverageUmpd: "UM/PD coverage",
  coverageCdw: "CDW",
  coverageMedpay: "Med pay coverage",
  coverageColl: "Collision deductible",
  coverageComp: "Comprehensive deductible",
  coverageRentalReimbursement: "Rental reimbursement",
  coverageTowing: "Towing coverage",
}

const VEHICLE_FIELDS = Object.keys(VEHICLE_FIELD_LABELS) as Array<
  keyof PolicyDetail["vehicles"][number]
>

// Compares `before` and `after` policy details, but only for the fields the
// caller actually sent (`input`) - untouched fields never produce a line,
// even if the two detail objects differ for unrelated reasons (they never
// should, but this keeps the summary strictly about what was requested).
// Vehicles/drivers use the update body's replace-all semantics: they're only
// compared when the corresponding key is present in `input`.
export function summarizePolicyChanges(
  before: PolicyDetail,
  after: PolicyDetail,
  input: UpdatePolicyInput
): string[] {
  const lines: string[] = []

  for (const field of SCALAR_FIELDS) {
    if (!(field in input)) continue
    const from = before[field]
    const to = after[field]
    if (from === to) continue
    lines.push(`${FIELD_LABELS[field]}: ${from ?? "(none)"} → ${to ?? "(none)"}`)
  }

  if ("carrierId" in input && before.carrier.id !== after.carrier.id) {
    lines.push(`Carrier: ${before.carrier.name} → ${after.carrier.name}`)
  }

  if ("vehicles" in input) {
    const beforeByVin = new Map(before.vehicles.map((v) => [v.vin, v]))
    const afterByVin = new Map(after.vehicles.map((v) => [v.vin, v]))
    for (const vehicle of after.vehicles) {
      const prior = beforeByVin.get(vehicle.vin)
      if (!prior) {
        lines.push(`Vehicle added: ${vehicleLabel(vehicle)}`)
        continue
      }
      for (const field of VEHICLE_FIELDS) {
        const from = prior[field]
        const to = vehicle[field]
        if (from === to) continue
        lines.push(
          `${vehicleLabel(vehicle)} — ${VEHICLE_FIELD_LABELS[field]}: ${from ?? "(none)"} → ${to ?? "(none)"}`
        )
      }
    }
    for (const vehicle of before.vehicles) {
      if (!afterByVin.has(vehicle.vin)) lines.push(`Vehicle removed: ${vehicleLabel(vehicle)}`)
    }
  }

  if ("drivers" in input) {
    const beforeByPerson = new Map(before.policyDrivers.map((d) => [d.driver.person.id, d]))
    const afterByPerson = new Map(after.policyDrivers.map((d) => [d.driver.person.id, d]))
    for (const driver of after.policyDrivers) {
      if (!beforeByPerson.has(driver.driver.person.id))
        lines.push(`Driver added: ${driverName(driver)}`)
    }
    for (const driver of before.policyDrivers) {
      if (!afterByPerson.has(driver.driver.person.id))
        lines.push(`Driver removed: ${driverName(driver)}`)
    }
  }

  return lines
}

export interface PolicyChangeFormMeta {
  policy: PolicyDetail
  clientName: string
  editedBy: { name: string | null; email: string }
  editedAt: Date
  // The date this endorsement takes effect - distinct from the policy's own
  // effectiveDate/expirationDate, and not persisted (see routes/policies.ts).
  endorsementEffectiveDate: string
}

// PDFKit's standard fonts only support WinAnsi encoding, which doesn't
// include the unicode arrow used in "from → to" lines - it renders as
// garbage glyphs. Swap in an ASCII arrow for the PDF only; the plain-text
// policy log keeps the real character.
function sanitizeForPdf(text: string): string {
  return text.replace(/→/g, "->")
}

// Reformats a stored 'YYYY-MM-DD' date as 'MM/DD/YYYY'. Splits the string
// rather than using `new Date(...)`, which parses as UTC midnight and can
// shift a day in western timezones.
function formatMmDdYyyy(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return iso
  const [, year, month, day] = match
  return `${month}/${day}/${year}`
}

// The server runs in UTC (no TZ set), so formatting with the ambient/local
// timezone - as the frontend does correctly in the browser for the policy
// log's timestamp - would print the wrong wall-clock time here. There's no
// browser to inherit a timezone from during server-side PDF generation, so
// the agency's timezone is named explicitly instead.
const GENERATED_ON_TIME_ZONE = "America/Los_Angeles"

function formatGeneratedOn(date: Date): string {
  const datePart = date.toLocaleDateString("en-US", {
    timeZone: GENERATED_ON_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  })
  const timePart = date.toLocaleTimeString("en-US", {
    timeZone: GENERATED_ON_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  })
  return `${datePart} ${timePart}`
}

// Groups the flat change lines by vehicle so a vehicle with several changed
// fields shows its label once, with each change nested underneath, instead
// of repeating the full vehicle label on every line. Per-vehicle field-change
// lines are the only ones shaped "label — rest" (see the " — " join above),
// and are pushed contiguously per vehicle, so a simple linear scan groups
// them correctly.
interface ChangeGroup {
  label: string | null
  lines: string[]
}

function groupChangeLines(changes: string[]): ChangeGroup[] {
  const groups: ChangeGroup[] = []
  for (const line of changes) {
    const match = line.match(/^(.+?) — (.+)$/)
    if (match) {
      const [, label, rest] = match
      const last = groups[groups.length - 1]
      if (last?.label === label) {
        last.lines.push(rest)
      } else {
        groups.push({ label, lines: [rest] })
      }
    } else {
      groups.push({ label: null, lines: [line] })
    }
  }
  return groups
}

// Renders a single-page PDF summarizing the changes. Collects the PDFKit
// output stream into a Buffer rather than writing to disk, since the caller
// uploads it straight to R2.
export function buildPolicyChangeFormPdf(
  meta: PolicyChangeFormMeta,
  changes: string[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const left = doc.page.margins.left
    const right = doc.page.width - doc.page.margins.right

    // Draws "Label: ____ Date: ____" on one line, with the signer's printed
    // name beneath the signature blank. Defined here (rather than as a
    // module-level function taking `doc` as a parameter) so it can close
    // over `doc` without needing PDFKit's document type name.
    function renderSignatureField(label: string, name: string): void {
      const dateLabel = "Date:"
      const dateBlankWidth = 100
      const gap = 20

      doc.fontSize(11)
      const sigLabelWidth = doc.widthOfString(`${label} `)
      const dateLabelWidth = doc.widthOfString(`${dateLabel} `)
      const dateBlankLeft = right - dateBlankWidth
      const dateLabelX = dateBlankLeft - dateLabelWidth - gap
      const sigBlankLeft = left + sigLabelWidth
      const sigBlankRight = dateLabelX - gap

      const y = doc.y
      const lineHeight = doc.currentLineHeight()
      const lineY = y + lineHeight - 2

      doc.text(label, left, y)
      doc.text(dateLabel, dateLabelX, y)
      doc.moveTo(sigBlankLeft, lineY).lineTo(sigBlankRight, lineY).stroke()
      doc.moveTo(dateBlankLeft, lineY).lineTo(right, lineY).stroke()

      doc.fontSize(9).text(name, left, y + lineHeight + 2)
      doc.fontSize(11)
      doc.y = y + lineHeight + 2 + doc.currentLineHeight()
    }

    doc.font("Times-Roman")

    doc.font("Times-Bold").fontSize(18).text("Policy Change Request", { align: "center" })
    doc.font("Times-Roman")
    doc.moveDown()

    doc.fontSize(11)
    doc.text(`Policy number: ${meta.policy.policyNumber}`)
    doc.text(`Effective Date: ${formatMmDdYyyy(meta.endorsementEffectiveDate)}`)
    doc.text(`Client: ${meta.clientName}`)
    doc.text(`Agent: ${meta.editedBy.name ?? meta.editedBy.email}`)
    doc.text(`Carrier: ${meta.policy.carrier.name}`)
    doc.text(`Generated on: ${formatGeneratedOn(meta.editedAt)}`)
    doc.moveDown()

    doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke()
    doc.moveDown(0.5)

    doc.fontSize(13).text("Summary of Changes:")
    doc.moveDown(0.5)
    doc.fontSize(11)
    for (const group of groupChangeLines(changes)) {
      if (group.label === null) {
        doc.text(`• ${sanitizeForPdf(group.lines[0])}`)
        continue
      }
      doc.text(`• ${sanitizeForPdf(group.label)}`)
      for (const rest of group.lines) {
        doc.text(`- ${sanitizeForPdf(rest)}`, { indent: 20 })
      }
    }
    doc.moveDown(3)

    renderSignatureField("Insured Signature:", meta.clientName)
    doc.moveDown()
    renderSignatureField("Agent Signature:", meta.editedBy.name ?? meta.editedBy.email)

    doc.end()
  })
}
