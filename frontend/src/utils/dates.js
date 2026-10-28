import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { DISPLAY_TZ } from '../config'

dayjs.extend(utc)
dayjs.extend(timezone)

// Parse the instant natively first, then render in the display zone.
// dayjs.tz(stringWithExplicitOffset, tz) double-applies the offset
// (known dayjs quirk), which silently shifts times by the offset amount.
export const d = (value) => {
  if (!value) return null
  const str = String(value).trim()
  const instant = /(Z|[+-]\d{2}:?\d{2})$/i.test(str) ? new Date(str) : dayjs(str).toDate()
  return dayjs(instant).tz(DISPLAY_TZ)
}

export const fmtDateTime = (value) => (value ? d(value).format('DD MMM YYYY, h:mm A') : '—')
export const fmtDate = (value) => (value ? d(value).format('DD MMM YYYY') : '—')

export const isToday = (value) => (value ? d(value).format('YYYY-MM-DD') === dayjs().tz(DISPLAY_TZ).format('YYYY-MM-DD') : false)
export const isOverdue = (value) => (value ? new Date(value) < new Date() : false)

export const toLocalInput = (value) =>
  value ? d(value).format('YYYY-MM-DDTHH:mm') : ''

// datetime-local inputs carry wall-clock time in the display zone (IST)
export const fromLocalInput = (value) =>
  value ? dayjs.tz(value, DISPLAY_TZ).toISOString() : null

export const startOfDayIso = () => dayjs().tz(DISPLAY_TZ).startOf('day').toISOString()
export const endOfDayIso = () => dayjs().tz(DISPLAY_TZ).endOf('day').toISOString()

export const relative = (value) => {
  if (!value) return '—'
  const v = d(value)
  const diffMin = Math.round(v.diff(dayjs(), 'minute'))
  if (Math.abs(diffMin) < 1) return 'just now'
  if (Math.abs(diffMin) < 60) return diffMin > 0 ? `${diffMin}m from now` : `${-diffMin}m ago`
  const diffH = Math.round(v.diff(dayjs(), 'hour'))
  if (Math.abs(diffH) < 24) return diffH > 0 ? `in ${diffH}h` : `${-diffH}h ago`
  const diffD = Math.round(v.diff(dayjs(), 'day'))
  return diffD > 0 ? `in ${diffD}d` : `${-diffD}d ago`
}
