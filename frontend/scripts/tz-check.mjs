import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const resolved = require.resolve('dayjs')
console.log('resolved:', resolved)
console.log('pkg version:', JSON.parse(require('fs').readFileSync(require.resolve('dayjs/package.json'), 'utf8')).version)

import dayjs from 'dayjs'
console.log('typeof dayjs:', typeof dayjs)
console.log('dayjs.name:', dayjs.name)
console.log('dayjs.version:', dayjs.version)
console.log('keys:', Object.keys(dayjs).slice(0, 20).join(', '))
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
console.log('typeof utc:', typeof utc, 'typeof timezone:', typeof timezone)
dayjs.extend(utc); dayjs.extend(timezone)
console.log('after extend, dayjs.tz type:', typeof dayjs.tz)
const d = dayjs.tz('2026-10-29T10:30:00.000Z', 'Asia/Kolkata')
console.log('result type:', typeof d, 'isDayjs:', d && d.$isDayjs)
console.log('result:', d && d.toISOString ? d.toISOString() : JSON.stringify(d).slice(0, 200))
