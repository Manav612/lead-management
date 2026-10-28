import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { api } from '../services/api'
import { DISPLAY_TZ } from '../config'
import { useToast } from '../context/ToastContext'
import { PageHeader, LoadingBlock, ErrorBlock, EmptyState } from '../components/ui'

dayjs.extend(utc)
dayjs.extend(timezone)
const dz = (v) => (v ? dayjs.tz(v, DISPLAY_TZ) : null)

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function CalendarShared({ isAdmin = false }) {
  const navigate = useNavigate()
  const toast = useToast()
  const today = dayjs().tz(DISPLAY_TZ)
  const [cursor, setCursor] = useState(today.startOf('month').date(1))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await api.get('/api/follow-ups?status=pending&pageSize=200')
      setRows(d.rows)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const byDay = useMemo(() => {
    const map = {}
    for (const f of rows) {
      const key = dz(f.due_at).format('YYYY-MM-DD')
      ;(map[key] = map[key] || []).push(f)
    }
    return map
  }, [rows])

  const cells = useMemo(() => {
    const start = cursor.startOf('month')
    const startOffset = (start.day() + 6) % 7 // Monday-first
    const first = start.subtract(startOffset, 'day').startOf('day')
    return Array.from({ length: 42 }, (_, i) => first.add(i, 'day').startOf('day'))
  }, [cursor])

  const openLead = (f) => navigate(isAdmin ? `/admin/leads/${f.lead_id}` : `/app/leads/${f.lead_id}`)

  return (
    <Box>
      <PageHeader title="Follow-up Calendar" subtitle="All pending follow-ups at a glance"
        actions={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Button size="small" onClick={() => setCursor(cursor.subtract(1, 'month'))}>Prev</Button>
            <Button size="small" onClick={() => setCursor(today.startOf('month').date(1))}>Today</Button>
            <Button size="small" onClick={() => setCursor(cursor.add(1, 'month'))}>Next</Button>
          </Box>
        } />
      {error ? <ErrorBlock message={error} onRetry={load} /> : loading ? <LoadingBlock rows={8} /> : (
        <Card>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 1.5, borderBottom: '1px solid #E5E9F0' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mr: 2, minWidth: 180, textAlign: 'center' }}>
              {cursor.format('MMMM YYYY')}
            </Typography>
            <IconButton size="small" aria-label="Previous month" onClick={() => setCursor(cursor.subtract(1, 'month'))}>
              <ChevronLeftIcon />
            </IconButton>
            <IconButton size="small" aria-label="Next month" onClick={() => setCursor(cursor.add(1, 'month'))}>
              <ChevronRightIcon />
            </IconButton>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderTop: '1px solid #E5E9F0' }}>
            {WEEKDAYS.map((w) => (
              <Box key={w} sx={{ p: 1, textAlign: 'center', borderBottom: '1px solid #E5E9F0', bgcolor: '#F8FAFC' }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">{w}</Typography>
              </Box>
            ))}
            {cells.map((day) => {
              const key = day.format('YYYY-MM-DD')
              const inMonth = day.month() === cursor.month()
              const isToday = day.format('YYYY-MM-DD') === today.format('YYYY-MM-DD')
              const items = byDay[key] || []
              const overdue = items.filter((f) => new Date(f.due_at) < new Date())
              return (
                <Box key={key} sx={{
                  minHeight: 108, p: 0.75, borderRight: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9',
                  bgcolor: inMonth ? 'transparent' : 'rgba(241,245,249,0.6)',
                  display: 'flex', flexDirection: 'column', gap: 0.5
                }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{
                      width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: isToday ? 'primary.main' : 'transparent', color: isToday ? 'white' : inMonth ? 'text.primary' : 'text.disabled',
                      fontSize: 12, fontWeight: isToday ? 700 : 500
                    }}>
                      {day.date()}
                    </Box>
                    {overdue.length > 0 && <Tooltip title={`${overdue.length} overdue`}><Chip label="!" size="small" color="error" sx={{ height: 18, minWidth: 18, fontWeight: 700 }} /></Tooltip>}
                  </Box>
                  {items.slice(0, 3).map((f) => (
                    <Tooltip key={f.id} title={`${f.title} — ${f.lead_name} (${f.follow_up_type})`}>
                      <Box
                        onClick={() => openLead(f)}
                        sx={{
                          fontSize: 11, px: 0.75, py: 0.25, borderRadius: 1, cursor: 'pointer', whiteSpace: 'nowrap',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          bgcolor: new Date(f.due_at) < new Date() ? 'rgba(239,68,68,0.12)' : 'rgba(37,99,235,0.10)',
                          color: new Date(f.due_at) < new Date() ? '#B91C1C' : '#1D4ED8',
                          borderLeft: `3px solid ${new Date(f.due_at) < new Date() ? '#EF4444' : '#2563EB'}`
                        }}>
                        {dz(f.due_at).format('h:mm A')} {f.title}
                      </Box>
                    </Tooltip>
                  ))}
                  {items.length > 3 && (
                    <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>+{items.length - 3} more</Typography>
                  )}
                </Box>
              )
            })}
          </Box>
          {rows.length === 0 && (
            <EmptyState title="No pending follow-ups" hint="Schedule follow-ups and they will appear on the calendar." sx={{ border: 'none' }} />
          )}
        </Card>
      )}
    </Box>
  )
}
