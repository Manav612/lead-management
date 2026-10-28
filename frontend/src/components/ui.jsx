import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableSortLabel from '@mui/material/TableSortLabel'
import TablePagination from '@mui/material/TablePagination'
import TableContainer from '@mui/material/TableContainer'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import Skeleton from '@mui/material/Skeleton'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Tooltip from '@mui/material/Tooltip'
import Checkbox from '@mui/material/Checkbox'
import SearchIcon from '@mui/icons-material/Search'
import ClearIcon from '@mui/icons-material/Clear'
import InboxIcon from '@mui/icons-material/Inbox'
import { STATUS_META, PRIORITY_META } from '../theme'
import { fmtDateTime } from '../utils/dates'

export function StatusChip({ status, size = 'small' }) {
  const m = STATUS_META[status] || { label: status, color: 'default' }
  return <Chip label={m.label} color={m.color} size={size} variant={m.color === 'default' ? 'outlined' : 'filled'} />
}

export function PriorityChip({ priority, size = 'small' }) {
  const m = PRIORITY_META[priority] || { label: priority, color: 'default' }
  return <Chip label={m.label} color={m.color} size={size} variant={m.color === 'default' ? 'outlined' : 'filled'} />
}

export function StatCard({ title, value, sub, icon, tone = 'primary', to }) {
  const body = (
    <Card sx={{ height: '100%', minWidth: 180 }}>
      <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center', p: 2 }}>
        {icon && (
          <Box sx={{
            bgcolor: `${tone}.main`, color: 'white', borderRadius: 2, p: 1.5, display: 'flex',
            opacity: 0.9
          }}>
            {icon}
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary">{title}</Typography>
          <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
          {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
        </Box>
      </CardContent>
    </Card>
  )
  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{body}</Link> : body
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} component="div">{subtitle}</Typography>}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}
    </Box>
  )
}

export function EmptyState({ icon, title, hint, action, sx }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6, px: 2, textAlign: 'center', ...sx }}>
      {icon || <InboxIcon color="disabled" sx={{ fontSize: 44, mb: 1 }} />}
      <Typography variant="subtitle1" fontWeight={600}>{title}</Typography>
      {hint && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 420 }}>{hint}</Typography>}
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Box>
  )
}

export function LoadingBlock({ rows = 5, sx }) {
  return (
    <Box sx={{ p: 2, ...sx }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={40} sx={{ mb: 1.5 }} />
      ))}
    </Box>
  )
}

export function ErrorBlock({ message, onRetry }) {
  return (
    <Alert severity="error" sx={{ my: 2 }} action={onRetry && (
      <Button color="inherit" size="small" onClick={onRetry}>Retry</Button>
    )}>
      {message || 'Something went wrong while loading data.'}
    </Alert>
  )
}

export function ConfirmDialog({ open, title, confirmText = 'Confirm', danger = false, onConfirm, onClose, children, busy }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>{children}</DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button variant="contained" color={danger ? 'error' : 'primary'} onClick={onConfirm} disabled={busy}>
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export function SearchField({ value, onChange, placeholder = 'Search…', sx }) {
  const [text, setText] = useState(value || '')
  const timer = useRef(null)
  useEffect(() => { setText(value || '') }, [value])
  const handle = (v) => {
    setText(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange(v), 350)
  }
  return (
    <TextField
      size="small"
      placeholder={placeholder}
      value={text}
      onChange={(e) => handle(e.target.value)}
      InputProps={{
        startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
        endAdornment: text && (
          <InputAdornment position="end">
            <IconButton size="small" onClick={() => { setText(''); onChange('') }}>
              <ClearIcon fontSize="small" />
            </IconButton>
          </InputAdornment>
        )
      }}
      sx={{ minWidth: 220, ...sx }}
      aria-label={placeholder}
    />
  )
}

/**
 * Generic data table with server-side pagination, optional sorting and
 * optional row selection. `columns`: [{label, key, render?, width?, sortable?, align?}]
 * `pagination`: {page, pageSize, total, onPageChange, onPageSizeChange}
 */
export function DataGrid({ columns, rows, loading, empty, pagination, onRowClick, sortKey, sortDir, onSort, selectable, selected, onToggleSelect, onToggleAll }) {
  const page = pagination?.page || 1
  const pageSize = pagination?.pageSize || 20
  const total = pagination?.total || 0
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  const allChecked = selectable && rows.length > 0 && rows.every((r) => selected?.[r.id])

  return (
    <TableContainer component={Card} sx={{ minWidth: 0 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {selectable && (
              <TableCell padding="checkbox" sx={{ width: 44 }}>
                <Checkbox checked={allChecked} indeterminate={!allChecked && selected && Object.keys(selected).length > 0}
                  onChange={() => onToggleAll(rows)} aria-label="Select all rows" />
              </TableCell>
            )}
            {columns.map((c) => (
              <TableCell key={c.key} sx={{ width: c.width, whiteSpace: 'nowrap' }} align={c.align}>
                {c.sortable ? (
                  <TableSortLabel active={sortKey === c.key} direction={sortKey === c.key ? sortDir : 'asc'}
                    onClick={() => onSort?.(c.key)}>
                    {c.label}
                  </TableSortLabel>
                ) : c.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {loading && Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={`sk-${i}`}>
              {selectable && <TableCell padding="checkbox"><Skeleton width={16} height={16} /></TableCell>}
              {columns.map((c) => (
                <TableCell key={c.key}><Skeleton width="70%" /></TableCell>
              ))}
            </TableRow>
          ))}
          {!loading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length + (selectable ? 1 : 0)}>
                {empty || <EmptyState title="No records found" hint="Try adjusting your search or filters." />}
              </TableCell>
            </TableRow>
          )}
          {!loading && rows.map((r) => (
            <TableRow key={r.id} hover sx={onRowClick && { cursor: 'pointer' }}
              onClick={() => onRowClick?.(r)}>
              {selectable && (
                <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={Boolean(selected?.[r.id])} onChange={() => onToggleSelect(r)} aria-label={`Select ${r.name || r.lead_code || 'row'}`} />
                </TableCell>
              )}
              {columns.map((c) => (
                <TableCell key={c.key} align={c.align}>
                  {c.render ? c.render(r) : (r[c.key] ?? '—')}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pagination && total > 0 && (
        <TablePagination
          component="div"
          count={total}
          page={page - 1}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[10, 20, 50]}
          onPageChange={(_e, p) => pagination.onPageChange(p + 1)}
          onRowsPerPageChange={(e) => { pagination.onPageSizeChange?.(Number(e.target.value)); pagination.onPageChange(1) }}
          labelRowsPerPage="Rows per page"
        />
      )}
    </TableContainer>
  )
}

export function Spinner({ sx }) {
  return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4, ...sx }}><CircularProgress size={28} /></Box>
}

export function DateTimeCell({ value }) {
  return <Typography variant="body2" color={value ? 'text.primary' : 'text.secondary'}>{fmtDateTime(value)}</Typography>
}

export function TooltipButton({ icon, title, onClick, disabled }) {
  return (
    <Tooltip title={title}>
      <span>
        <IconButton size="small" onClick={onClick} disabled={disabled} aria-label={title}>{icon}</IconButton>
      </span>
    </Tooltip>
  )
}
