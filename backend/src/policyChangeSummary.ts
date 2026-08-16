// Builds the auto-generated "policy change form": a plain-English summary of
// what an edit changed, plus a one-page PDF rendering of that summary. Wired
// into PATCH /policies/:id (routes/policies.ts), which logs the summary as a
// policy log and uploads the PDF as a policy attachment.
import PDFDocument from "pdfkit"
import {
  formatGeneratedOn,
  formatMmDdYyyy,
  PDF_FONT,
  PDF_FONT_BOLD,
  sanitizeForPdf,
} from "./pdfFormat"
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

// The subset listed under a newly added vehicle: everything except the three
// fields vehicleLabel() already prints.
const VEHICLE_DETAIL_FIELDS = VEHICLE_FIELDS.filter(
  (field) => field !== "make" && field !== "model" && field !== "year"
)

// Coverage columns are nullable free text, and the edit form can submit an
// empty string, so both count as "not carried" and are left off the form.
function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== ""
}

type DriverRow = PolicyDetail["policyDrivers"][number]["driver"]
type PersonRow = DriverRow["person"]

const MARITAL_STATUS_LABELS: Record<NonNullable<PersonRow["maritalStatus"]>, string> = {
  single: "Single",
  married: "Married",
  divorced: "Divorced",
  widowed: "Widowed",
  separated: "Separated",
}

const RELATION_LABELS: Record<PersonRow["relationToInsured"], string> = {
  self: "Self",
  spouse: "Spouse",
  child: "Child",
  sibling: "Sibling",
  "significant-other": "Significant other",
  "other-related": "Other related",
  other: "Other",
}

const DRIVER_RATING_LABELS: Record<DriverRow["rating"], string> = {
  rated: "Rated",
  excluded: "Excluded",
}

// The details listed under a newly added driver, in a fixed order. Nullable
// fields are omitted when empty, matching how a new vehicle's unpurchased
// coverages are left off.
function driverDetailLines(policyDriver: PolicyDetail["policyDrivers"][number]): string[] {
  const { person, dlNumber, rating, sr22 } = policyDriver.driver
  const lines = [
    `Date of birth: ${formatMmDdYyyy(person.dateOfBirth)}`,
    `Relation to insured: ${RELATION_LABELS[person.relationToInsured]}`,
  ]
  if (person.maritalStatus) {
    lines.push(`Marital status: ${MARITAL_STATUS_LABELS[person.maritalStatus]}`)
  }
  if (hasValue(dlNumber)) lines.push(`DL number: ${dlNumber}`)
  lines.push(`Rating: ${DRIVER_RATING_LABELS[rating]}`)
  lines.push(`SR-22: ${sr22 ? "Yes" : "No"}`)
  return lines
}

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
        // An added vehicle always lists the coverage it's carrying, not just
        // its name - the signed form is the record of what was bound. Only
        // the "label — detail" lines are pushed (never a bare label line as
        // well), so groupChangeLines nests them under a single bullet.
        const details = VEHICLE_DETAIL_FIELDS.filter((field) => hasValue(vehicle[field]))
        if (details.length === 0) {
          lines.push(`Vehicle added: ${vehicleLabel(vehicle)}`)
          continue
        }
        for (const field of details) {
          lines.push(
            `Vehicle added: ${vehicleLabel(vehicle)} — ${VEHICLE_FIELD_LABELS[field]}: ${vehicle[field]}`
          )
        }
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
      if (beforeByPerson.has(driver.driver.person.id)) continue
      // Same shape as an added vehicle: the driver's identifying details are
      // nested under one bullet.
      const details = driverDetailLines(driver)
      if (details.length === 0) {
        lines.push(`Driver added: ${driverName(driver)}`)
        continue
      }
      for (const detail of details) {
        lines.push(`Driver added: ${driverName(driver)} — ${detail}`)
      }
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

// The plain-text rendering of the same grouping the PDF uses, for the policy
// log body. Nesting matters there beyond readability: an added vehicle or
// driver repeats its label on every line, which would otherwise eat into the
// log's 5000-character cap (see routes/policies.ts).
export function formatChangeSummaryText(changes: string[]): string {
  const out: string[] = []
  for (const group of groupChangeLines(changes)) {
    if (group.label === null) {
      out.push(`- ${group.lines[0]}`)
      continue
    }
    out.push(`- ${group.label}`)
    for (const rest of group.lines) out.push(`  - ${rest}`)
  }
  return out.join("\n")
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

    doc.font(PDF_FONT)

    doc.font(PDF_FONT_BOLD).fontSize(18).text("Policy Change Request", { align: "center" })
    doc.font(PDF_FONT)
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
