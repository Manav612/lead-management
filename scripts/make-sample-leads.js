/**
 * Generates sample-leads.xlsx + sample-leads.csv in the project root.
 * Usage: node scripts/make-sample-leads.js
 * (uses the xlsx package installed in server/node_modules)
 */
import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(__dirname, '..', 'server', 'index.js'))
const XLSX = require('xlsx')

const HEADERS = [
  'Lead Name', 'Company Name', 'Phone Number', 'Email', 'City',
  'Lead Source', 'Interested Product/Service', 'Estimated Deal Value', 'Priority', 'Remarks'
]

// 12 rows; the last two share the same phone number on purpose
// so you can watch the duplicate detection in the Import wizard.
const ROWS = [
  ['Rohit Sharma', 'Sharma Traders', '+91 98123 45670', 'rohit@sharmatraders.in', 'Mumbai', 'Website', 'Annual Plan', 150000, 'high', 'Met at trade expo'],
  ['Sunita Patel', 'Patel Textiles', '+91 98220 11223', 'sunita@pateltextiles.in', 'Ahmedabad', 'Referral', 'Pro', 250000, 'high', 'Referred by existing client'],
  ['Vikram Rao', 'Rao Logistics', '+91 99870 55667', 'vikram@raologistics.in', 'Bengaluru', 'Cold Call', 'Starter', 50000, 'low', 'Second call scheduled'],
  ['Meena Iyer', 'Iyer Foods', '+91 98450 22334', 'meena@iyerfoods.in', 'Chennai', 'Social Media', 'Pro', 180000, 'medium', 'Inquired via Instagram ad'],
  ['Arif Khan', 'Khan Electronics', '+91 99010 33445', 'arif@khanelectronics.in', 'Hyderabad', 'Event', 'Annual Plan', 320000, 'high', 'Booth visitor at TechShow'],
  ['Deepa Nair', 'Nair Consulting', '+91 98730 66778', 'deepa@nairconsulting.in', 'Kochi', 'Website', 'Starter', 45000, 'low', 'Requested a demo'],
  ['Rajesh Gupta', 'Gupta Motors', '+91 98990 77889', 'rajesh@guptamotors.in', 'Pune', 'Advertisement', 'Pro', 200000, 'medium', 'Responded to Google ad'],
  ['Anjali Verma', 'Verma Healthcare', '+91 98110 88990', 'anjali@vermahealth.in', 'Jaipur', 'Referral', 'Annual Plan', 450000, 'high', 'Hospital chain expansion'],
  ['Karan Mehta', 'Mehta Retail', '+91 98330 99001', 'karan@mehtaretail.in', 'Indore', 'Website', 'Starter', 60000, 'medium', ''],
  ['Farida Sheikh', 'Sheikh Interiors', '+91 99220 10112', 'farida@sheikhinteriors.in', 'Surat', 'Social Media', 'Pro', 120000, 'low', 'Follow up next week'],
  ['Sameer Joshi', 'Joshi Analytics', '+91 98670 12134', 'sameer@joshianalytics.in', 'Nagpur', 'Cold Call', 'Annual Plan', 280000, 'high', 'Duplicate test row A'],
  ['Sameer Joshi', 'Joshi Analytics', '+91 98670 12134', 'sameer@joshianalytics.in', 'Nagpur', 'Cold Call', 'Annual Plan', 280000, 'high', 'Duplicate test row B (same phone as above)']
]

const root = path.join(__dirname, '..')

// ---- Excel ----
const wb = XLSX.utils.book_new()
const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...ROWS])
ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 18) }))
XLSX.utils.book_append_sheet(wb, ws, 'Leads')
const xlsxPath = path.join(root, 'sample-leads.xlsx')
XLSX.writeFile(wb, xlsxPath)

// ---- CSV ----
const csvCell = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csv = [HEADERS, ...ROWS].map((r) => r.map(csvCell).join(',')).join('\n')
const csvPath = path.join(root, 'sample-leads.csv')
fs.writeFileSync(csvPath, csv, 'utf8')

console.log('Created:')
console.log('  ' + path.relative(root, xlsxPath) + ` (${fs.statSync(xlsxPath).size} bytes)`)
console.log('  ' + path.relative(root, csvPath) + ` (${fs.statSync(csvPath).size} bytes)`)
