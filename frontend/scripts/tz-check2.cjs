try {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour12: false })
  console.log('Intl Kolkata OK:', f.formatToParts(new Date('2026-10-29T10:30:00Z')).filter(p => p.type !== 'literal').map(p => p.type + '=' + p.value).join(' '))
} catch (e) {
  console.log('Intl Kolkata FAILED:', e.message)
}

const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone')
console.log('before: typeof dayjs.tz =', typeof dayjs.tz)
dayjs.extend(utc)
console.log('after utc: typeof dayjs.utc =', typeof dayjs.utc)
dayjs.extend(timezone)
console.log('after timezone: typeof dayjs.tz =', typeof dayjs.tz)

try {
  const d = dayjs.tz('2026-10-29T10:30:00.000Z', 'Asia/Kolkata')
  console.log('tz result $isDayjsObject:', d && d.$isDayjsObject, '| $d:', d && d.$d, '| $x:', JSON.stringify(d && d.$x))
} catch (e) {
  console.log('tz() threw:', e.message)
}
try {
  const d2 = dayjs.utc('2026-10-29T10:30:00.000Z')
  console.log('utc result:', d2 && d2.format('HH:mm ZZ'))
} catch (e) {
  console.log('utc() threw:', e.message)
}
