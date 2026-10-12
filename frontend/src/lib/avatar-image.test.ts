import { describe, expect, it } from 'vitest'
import { fitWithin } from './avatar-image'

describe('fitWithin', () => {
  it('scales the longer side down to the limit and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000, 512)).toEqual({ width: 512, height: 384 })
    expect(fitWithin(3000, 4000, 512)).toEqual({ width: 384, height: 512 })
  })

  it('never upscales', () => {
    expect(fitWithin(100, 80, 512)).toEqual({ width: 100, height: 80 })
  })

  it('never rounds a side down to zero', () => {
    expect(fitWithin(10000, 1, 512)).toEqual({ width: 512, height: 1 })
  })
})
