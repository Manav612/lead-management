const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone')
dayjs.extend(utc); dayjs.extend(timezone)
console.log('version:', dayjs.version)
const v = '2026-10-29T10:30:00.000Z'
console.log('CJS tz Kolkata:', dayjs.tz(v, 'Asia/Kolkata').format('YYYY-MM-DD h:mm A z'))
console.log('CJS tz UTC:    ', dayjs.tz(v, 'UTC').format('YYYY-MM-DD h:mm A z'))
console.log('CJS offset min:', dayjs.tz(v, 'Asia/Kolkata').offset())
