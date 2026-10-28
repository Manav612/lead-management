import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Freeze the clock for deterministic date tests (IST display zone)
const FIXED = '2026-03-15T10:30:00+05:30'
beforeEach(() => {
  vi.useFakeTimers().setSystemTime(new Date(FIXED))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('formatCurrency', () => {
  it('formats INR values', async () => {
    const { formatCurrency } = await import('../src/utils/format')
    expect(formatCurrency(1200000)).toBe('₹12,00,000')
  })
  it('returns dash for null/empty', async () => {
    const { formatCurrency } = await import('../src/utils/format')
    expect(formatCurrency(null)).toBe('—')
    expect(formatCurrency('')).toBe('—')
  })
  it('handles compact notation', async () => {
    const { formatCurrency } = await import('../src/utils/format')
    expect(formatCurrency(150000, { compact: true })).toBe('₹1.5L')
    expect(formatCurrency(1500000, { compact: true })).toBe('₹15L')
  })
})

describe('formatNumber', () => {
  it('formats numbers with en-IN grouping', async () => {
    const { formatNumber } = await import('../src/utils/format')
    expect(formatNumber(1234567)).toBe('12,34,567')
  })
  it('returns dash for null', async () => {
    const { formatNumber } = await import('../src/utils/format')
    expect(formatNumber(null)).toBe('—')
  })
})

describe('csv toCsv', () => {
  it('escapes commas, quotes and newlines', async () => {
    const { toCsv } = await import('../src/utils/csv')
    const csv = toCsv(
      [{ name: 'A, B', note: 'He said "hi"', city: 'Mumbai' }],
      [{ label: 'Name', key: 'name' }, { label: 'Note', key: 'note' }, { label: 'City', key: 'city' }]
    )
    expect(csv).toBe('Name,Note,City\n"A, B","He said ""hi""",Mumbai')
  })
  it('supports function-valued columns', async () => {
    const { toCsv } = await import('../src/utils/csv')
    const csv = toCsv([{ n: 5 }], [{ label: 'Name', key: 'n' }, { label: 'Double', value: (r) => r.n * 2 }])
    expect(csv).toBe('Name,Double\n5,10')
  })
})

describe('date helpers', () => {
  it('isToday recognizes the current IST date', async () => {
    const { isToday, d } = await import('../src/utils/dates')
    expect(isToday(FIXED)).toBe(true)
    expect(isToday('2026-03-14T10:00:00+05:30')).toBe(false)
  })
  it('isOverdue flags past dates', async () => {
    const { isOverdue } = await import('../src/utils/dates')
    expect(isOverdue('2026-03-14T10:00:00+05:30')).toBe(true)
    expect(isOverdue('2026-03-16T10:00:00+05:30')).toBe(false)
  })
  it('toLocalInput converts ISO to local input format', async () => {
    const { toLocalInput } = await import('../src/utils/dates')
    expect(toLocalInput(FIXED)).toBe('2026-03-15T10:30')
  })
  it('d parses or returns null', async () => {
    const { d } = await import('../src/utils/dates')
    expect(d(FIXED).year()).toBe(2026)
    expect(d(null)).toBeNull()
  })
})
