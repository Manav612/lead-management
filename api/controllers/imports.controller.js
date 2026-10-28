import multer from 'multer'
import { asyncHandler, ApiError } from '../lib/utils.js'
import { importConfirmSchema } from '../lib/validators.js'
import { buildXlsxTemplate, buildCsvTemplate } from '../services/importService.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
})

export function buildImportsController(ctx) {
  const { store, importService, config } = ctx

  const template = asyncHandler(async (req, res) => {
    const format = (req.query.format || 'xlsx').toLowerCase()
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="leadflow-template.csv"')
      return res.send(buildCsvTemplate())
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="leadflow-template.xlsx"')
    res.send(buildXlsxTemplate())
  })

  const validate = (req, res, next) =>
    upload.single('file')(req, res, (err) => {
      if (err) return next(err)
      if (!req.file) return next(new ApiError(400, 'No file uploaded. Send the file in the "file" form field.'))
      next()
    })

  const validateFile = asyncHandler(async (req, res) => {
    const result = await importService.validateUpload(
      req.file.buffer, req.file.originalname, req.user)
    res.json(result)
  })

  const confirm = asyncHandler(async (req, res) => {
    const data = importConfirmSchema.parse(req.body)
    try {
      const batch = await importService.confirmImport(data, req.user)
      res.status(201).json({ batch })
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.batch) {
        res.status(409).json({ error: e.message, batch: e.batch })
      } else {
        throw e
      }
    }
  })

  const list = asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || '1', 10))
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize || '20', 10)))
    const result = await store.imports.listBatches(page, pageSize)
    res.json(result)
  })

  const get = asyncHandler(async (req, res) => {
    const batch = await store.imports.getBatch(req.params.id)
    if (!batch) throw new ApiError(404, 'Import batch not found')
    res.json({ batch })
  })

  const errors = asyncHandler(async (req, res) => {
    const batch = await store.imports.getBatch(req.params.id)
    if (!batch) throw new ApiError(404, 'Import batch not found')
    const result = await store.imports.listErrors(req.params.id, 1, 500)
    res.json(result)
  })

  const errorReport = asyncHandler(async (req, res) => {
    const batch = await store.imports.getBatch(req.params.id)
    if (!batch) throw new ApiError(404, 'Import batch not found')
    const { rows } = await store.imports.listErrors(req.params.id, 1, 5000)
    const esc = (v) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = ['Row Number,Error Messages,Raw Row Data (JSON)']
    for (const e of rows) {
      lines.push([e.row_number, esc((e.error_messages || []).join('; ')), esc(JSON.stringify(e.raw_row_data || {}))].join(','))
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="import-errors-${req.params.id}.csv"`)
    res.send(lines.join('\n'))
  })

  return { template, validate, validateFile, confirm, list, get, errors, errorReport }
}
