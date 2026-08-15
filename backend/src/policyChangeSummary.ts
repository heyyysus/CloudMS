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

    doc.fontSize(18).text("Policy Change Form", { align: "center" })
    doc.moveDown()

    doc.fontSize(11)
    doc.text(`Policy number: ${meta.policy.policyNumber}`)
    doc.text(`Client: ${meta.clientName}`)
    doc.text(`Carrier: ${meta.policy.carrier.name}`)
    doc.text(`Edited by: ${meta.editedBy.name ?? meta.editedBy.email}`)
    doc.text(`Edited at: ${meta.editedAt.toISOString()}`)
    doc.moveDown()

    doc.fontSize(13).text("Changes")
    doc.moveDown(0.5)
    doc.fontSize(11)
    for (const line of changes) {
      doc.text(`• ${line}`)
    }

    doc.end()
  })
}
