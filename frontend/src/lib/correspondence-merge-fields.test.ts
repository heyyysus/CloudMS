import { describe, expect, it } from 'vitest'
import { buildPreviewSamples, renderPreview } from './correspondence-merge-fields'

describe('buildPreviewSamples', () => {
  it('maps known fields to their sample values', () => {
    const samples = buildPreviewSamples(['clientFullName', 'policyNumber'])
    expect(samples.clientFullName).toBe('Jane A. Doe')
    expect(samples.policyNumber).toBe('POL-100482')
  })

  it('falls back to empty string for unknown fields', () => {
    const samples = buildPreviewSamples(['mysteryField'])
    expect(samples.mysteryField).toBe('')
  })

  it('overrides agent fields with the signed-in user when present', () => {
    const samples = buildPreviewSamples(['agentName', 'agentEmail'], {
      name: 'Dana Broker',
      email: 'dana@agency.example',
    })
    expect(samples.agentName).toBe('Dana Broker')
    expect(samples.agentEmail).toBe('dana@agency.example')
  })

  it('uses the agent email when their name is null', () => {
    const samples = buildPreviewSamples(['agentName'], { name: null, email: 'x@y.z' })
    expect(samples.agentName).toBe('x@y.z')
  })
})

describe('renderPreview', () => {
  it('substitutes tokens with sample values', () => {
    const out = renderPreview('Hi {{clientFullName}} on {{policyNumber}}', {
      clientFullName: 'Jane A. Doe',
      policyNumber: 'POL-1',
    })
    expect(out).toBe('Hi Jane A. Doe on POL-1')
  })

  it('renders unknown tokens as empty string', () => {
    expect(renderPreview('a {{nope}} b', {})).toBe('a  b')
  })

  it('tolerates inner whitespace in tokens', () => {
    expect(renderPreview('{{ clientFullName }}', { clientFullName: 'X' })).toBe('X')
  })
})
