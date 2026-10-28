import React from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line
} from 'recharts'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { CHART_COLORS } from '../theme'
import { EmptyState } from './ui'

const chartHeight = 280

function ChartCard({ title, children, height = chartHeight }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>{title}</Typography>
        <div style={{ height }}>{children}</div>
      </CardContent>
    </Card>
  )
}

const tooltipStyle = { borderRadius: 8, border: '1px solid #E5E9F0', fontSize: 13 }

export function StatusPie({ data, height }) {
  const rows = data.map((d) => ({ name: (d.status || d.label || '').replace('_', ' '), value: d.count ?? d.value }))
  const hasData = rows.some((r) => r.value > 0)
  if (!hasData) return <ChartCard title="Leads by Status" height={height}><EmptyState title="No data yet" /></ChartCard>
  return (
    <ChartCard title="Leads by Status" height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45} paddingAngle={2}>
            {rows.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

export function SourceBar({ data, height }) {
  const rows = data.map((d) => ({ name: d.source || d.label || '—', count: d.count ?? d.value }))
  const hasData = rows.some((r) => r.count > 0)
  if (!hasData) return <ChartCard title="Leads by Source" height={height}><EmptyState title="No data yet" /></ChartCard>
  return (
    <ChartCard title="Leads by Source" height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF1F7" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={50} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={30} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#F1F5F9' }} />
          <Bar dataKey="count" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} maxBarSize={42} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

export function TrendLine({ data, height, title = 'Leads Over Time' }) {
  const hasData = data.some((d) => d.count > 0)
  if (!hasData) return <ChartCard title={title} height={height}><EmptyState title="No data in this period" /></ChartCard>
  return (
    <ChartCard title={title} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF1F7" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={30} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey="count" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

export function GenericBar({ data, height, title = 'Overview', xKey, bars = [{ key: 'value', fill: CHART_COLORS[0], name: 'Value' }] }) {
  const hasData = data.some((d) => bars.some((b) => d[b.key] > 0))
  if (!hasData) return <ChartCard title={title} height={height}><EmptyState title="No data yet" /></ChartCard>
  return (
    <ChartCard title={title} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF1F7" />
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} interval={0} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={30} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#F1F5F9' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {bars.map((b) => (
            <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.fill} radius={[6, 6, 0, 0]} maxBarSize={40} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
