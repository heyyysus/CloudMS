// Frontend help + preview data for correspondence-template merge fields. The
// authoritative field *names* come from the server (GET
// /correspondence-templates → mergeFields); this module supplies the human
// grouping/label for the editor chips and the static sample values used to
// render the live preview (templates aren't attached to a real client/policy
// yet, so preview substitutes representative placeholders).

export type MergeFieldGroup = 'Client' | 'Policy' | 'Agent'

export interface MergeFieldHelp {
  group: MergeFieldGroup
  label: string
  sample: string
}

export const MERGE_FIELD_HELP: Record<string, MergeFieldHelp> = {
  // Client profile
  clientFirstName: { group: 'Client', label: 'Client first name', sample: 'Jane' },
  clientLastName: { group: 'Client', label: 'Client last name', sample: 'Doe' },
  clientFullName: { group: 'Client', label: 'Client full name', sample: 'Jane A. Doe' },
  clientEmail: { group: 'Client', label: 'Client email', sample: 'jane.doe@example.com' },
  clientPhone: { group: 'Client', label: 'Client phone', sample: '(555) 123-4567' },
  clientAddress: { group: 'Client', label: 'Client street address', sample: '123 Main St' },
  clientCity: { group: 'Client', label: 'Client city', sample: 'Springfield' },
  clientState: { group: 'Client', label: 'Client state', sample: 'CA' },
  clientZip: { group: 'Client', label: 'Client ZIP', sample: '90001' },
  // Policy
  policyNumber: { group: 'Policy', label: 'Policy number', sample: 'POL-100482' },
  carrierName: { group: 'Policy', label: 'Carrier name', sample: 'Progressive' },
  policyEffectiveDate: { group: 'Policy', label: 'Effective date', sample: '2026-01-01' },
  policyExpirationDate: { group: 'Policy', label: 'Expiration date', sample: '2027-01-01' },
  policyStatus: { group: 'Policy', label: 'Policy status', sample: 'active' },
  // Sending agent (current user)
  agentName: { group: 'Agent', label: 'Your name', sample: 'Alex Agent' },
  agentEmail: { group: 'Agent', label: 'Your email', sample: 'alex.agent@example.com' },
}

export const MERGE_FIELD_GROUP_ORDER: MergeFieldGroup[] = ['Client', 'Policy', 'Agent']

// Builds the sample-value map for a preview, overriding the agent fields with
// the signed-in user's real details when available.
export function buildPreviewSamples(fields: string[], agent?: {
  name: string | null
  email: string
}): Record<string, string> {
  const samples: Record<string, string> = {}
  for (const field of fields) {
    samples[field] = MERGE_FIELD_HELP[field]?.sample ?? ''
  }
  if (agent) {
    if ('agentName' in samples) samples.agentName = agent.name ?? agent.email
    if ('agentEmail' in samples) samples.agentEmail = agent.email
  }
  return samples
}

// Substitutes {{field}} tokens with sample values for the live preview,
// mirroring the backend renderTemplate: same token regex, unknown → ''.
export function renderPreview(text: string, samples: Record<string, string>): string {
  return text.replace(
    /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g,
    (_match, field: string) => samples[field] ?? ''
  )
}
