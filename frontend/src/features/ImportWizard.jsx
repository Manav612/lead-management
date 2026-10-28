import React, { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Stepper from '@mui/material/Stepper'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableContainer from '@mui/material/TableContainer'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Alert from '@mui/material/Alert'
import LinearProgress from '@mui/material/LinearProgress'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import DownloadIcon from '@mui/icons-material/Download'
import { api, downloadFile } from '../services/api'
import { useToast } from '../context/ToastContext'
import { PageHeader, ErrorBlock } from '../components/ui'
import { fmtDateTime } from '../utils/dates'

export default function ImportWizard({ onImported }) {
  const [step, setStep] = useState(0)
  const [fileName, setFileName] = useState('')
  const [validation, setValidation] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [batch, setBatch] = useState(null)
  const [includeDuplicates, setIncludeDuplicates] = useState(false)
  const fileRef = useRef(null)

  const upload = async (file) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const data = await api.postForm('/api/imports/validate', fd)
      setValidation(data)
      setStep(1)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      const data = await api.post('/api/imports/confirm', {
        payload: validation.payload,
        signature: validation.signature,
        include_duplicates: includeDuplicates
      })
      setBatch(data.batch)
      setStep(2)
      onImported?.()
    } catch (e) {
      if (e.status === 409 && e.batch) {
        setBatch(e.batch)
        setStep(2)
        onImported?.()
      } else {
        setError(e.message)
      }
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setStep(0); setValidation(null); setBatch(null); setFileName('')
    setError(null); setIncludeDuplicates(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const previewRows = validation ? validation.rows.slice(0, 100) : []
  const s = validation?.summary

  return (
    <Box sx={{ maxWidth: 980, mx: 'auto' }}>
      <PageHeader title="Import Leads" subtitle="Upload an Excel or CSV file with your leads. We validate first, then you confirm."
        actions={batch && <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={reset}>Import Another File</Button>} />

      <Card sx={{ p: 2, mb: 3 }}>
        <Stepper activeStep={step} alternativeLabel>
          <Step><StepLabel>Upload File</StepLabel></Step>
          <Step><StepLabel>Review & Validate</StepLabel></Step>
          <Step><StepLabel>Result</StepLabel></Step>
        </Stepper>
      </Card>

      {error && <ErrorBlock message={error} onRetry={() => setError(null)} />}

      {step === 0 && (
        <Card sx={{ p: 4, textAlign: 'center', mt: 3 }}>
          <UploadFileIcon color="action" sx={{ fontSize: 56 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 1 }}>Choose a file to import</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
            Accepted: .xlsx, .xls, .csv (max 5 MB, max 2,000 rows).
            Required columns: <b>Full Name</b> and <b>Phone Number</b>.
          </Typography>
          <Button variant="contained" size="large" component="label" startIcon={<AttachFileIcon />} disabled={busy}>
            Select File
            <input ref={fileRef} type="file" hidden accept=".xlsx,.xls,.csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFileName(f.name); upload(f) } }} />
          </Button>
          <Box sx={{ mt: 2 }}>
            <Button variant="text" color="primary" onClick={() => downloadFile('/api/imports/template', 'leadflow-template.xlsx')}>
              <DownloadIcon fontSize="small" sx={{ mr: 0.5 }} />Download Excel Template
            </Button>
            <Button variant="text" color="primary" sx={{ ml: 2 }}
              onClick={() => downloadFile('/api/imports/template?format=csv', 'leadflow-template.csv')}>
              <DownloadIcon fontSize="small" sx={{ mr: 0.5 }} />Download CSV Template
            </Button>
          </Box>
          {busy && <LinearProgress sx={{ mt: 3 }} />}
        </Card>
      )}

      {step === 1 && s && (
        <Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            <Chip label={`File: ${fileName || 'upload'}`} variant="outlined" />
            <Chip label={`Total: ${s.total_rows}`} variant="outlined" />
            <Chip label={`Valid: ${s.valid_rows}`} color="success" />
            <Chip label={`Invalid: ${s.invalid_rows}`} color={s.invalid_rows ? 'error' : 'default'} variant={s.invalid_rows ? 'filled' : 'outlined'} />
            <Chip label={`Duplicates: ${s.duplicate_rows}`} color={s.duplicate_rows ? 'warning' : 'default'} variant={s.duplicate_rows ? 'filled' : 'outlined'} />
          </Box>

          {s.valid_rows === 0 && (
            <Alert severity="error" sx={{ mb: 2 }}>
              No valid rows found. Fix the errors below and upload again.
            </Alert>
          )}
          {s.duplicate_rows > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }} icon={<WarningAmberIcon />}>
              {s.duplicate_rows} rows match an existing lead by phone or email.
              {!includeDuplicates && ' By default duplicates are skipped. '}
            </Alert>
          )}

          <TableContainer component={Card} sx={{ maxHeight: 420 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Row</TableCell><TableCell>Name</TableCell><TableCell>Phone</TableCell>
                  <TableCell>Email</TableCell><TableCell>Deal Value</TableCell><TableCell>Status</TableCell><TableCell>Errors</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {previewRows.map((r) => (
                  <TableRow key={r.row_number} sx={{ bgcolor: r.status === 'invalid' ? 'rgba(239,68,68,0.05)' : r.status === 'duplicate' ? 'rgba(245,158,11,0.06)' : undefined }}>
                    <TableCell>{r.row_number}</TableCell>
                    <TableCell>{r.name || '—'}</TableCell>
                    <TableCell>{r.phone || '—'}</TableCell>
                    <TableCell>{r.email || '—'}</TableCell>
                    <TableCell>{r.estimated_deal_value ?? '—'}</TableCell>
                    <TableCell>
                      <Chip size="small" label={r.status} color={r.status === 'valid' ? 'success' : r.status === 'duplicate' ? 'warning' : 'error'} />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 260 }}>
                      <Typography variant="caption" color="text.secondary">{(r.errors || []).join('; ') || '—'}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {validation.rows.length > previewRows.length && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Showing first {previewRows.length} of {validation.rows.length} rows.
            </Typography>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3, alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <FormControlLabel
              control={<Checkbox checked={includeDuplicates} onChange={(e) => setIncludeDuplicates(e.target.checked)} />}
              label={<Typography variant="body2">Import rows that are duplicates too (only valid ones, same phone/email as existing)</Typography>}
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button onClick={reset} color="inherit" disabled={busy}>Back</Button>
              <Button variant="contained" disabled={busy || s.valid_rows === 0} onClick={confirm}
                startIcon={<CheckCircleIcon />}>
                {busy ? 'Importing…' : `Import ${s.valid_rows + (includeDuplicates ? s.duplicate_rows : 0)} Leads`}
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {step === 2 && batch && (
        <Card sx={{ p: 4, mt: 3, textAlign: 'center' }}>
          <CheckCircleIcon color="success" sx={{ fontSize: 56 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 1 }}>Import complete</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Batch {batch.id} · {fmtDateTime(batch.created_at)}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', mt: 3, flexWrap: 'wrap' }}>
            <Chip size="medium" label={`Total: ${batch.total_rows}`} variant="outlined" />
            <Chip size="medium" label={`Imported: ${batch.imported_count}`} color="success" />
            <Chip size="medium" label={`Skipped duplicates: ${batch.skipped_duplicates}`} color={batch.skipped_duplicates ? 'warning' : 'default'} variant={batch.skipped_duplicates ? 'filled' : 'outlined'} />
            <Chip size="medium" label={`Failed: ${batch.failed_count}`} color={batch.failed_count ? 'error' : 'default'} variant={batch.failed_count ? 'filled' : 'outlined'} />
          </Box>
          {batch.failed_count > 0 && (
            <Box sx={{ mt: 3 }}>
              <Button variant="outlined" color="error" startIcon={<DownloadIcon />}
                onClick={() => downloadFile(`/api/imports/${batch.id}/error-report`, `import-errors-${batch.id}.csv`)}>
                Download Error Report
              </Button>
            </Box>
          )}
          <Box sx={{ mt: 3 }}>
            <Button onClick={reset}>Import Another File</Button>
          </Box>
        </Card>
      )}
    </Box>
  )
}
