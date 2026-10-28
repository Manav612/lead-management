export const formatCurrency = (v, { compact = false } = {}) => {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? 'compact' : 'standard'
  }).format(n)
}

export const formatNumber = (v) => {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return v
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(n)
}
