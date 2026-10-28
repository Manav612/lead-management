import { createTheme } from '@mui/material/styles'

export const STATUS_META = {
  new: { label: 'New', color: 'default' },
  contacted: { label: 'Contacted', color: 'info' },
  qualified: { label: 'Qualified', color: 'primary' },
  follow_up: { label: 'Follow-up', color: 'warning' },
  proposal_sent: { label: 'Proposal Sent', color: 'secondary' },
  won: { label: 'Won', color: 'success' },
  lost: { label: 'Lost', color: 'error' },
  on_hold: { label: 'On Hold', color: 'default' }
}

export const PRIORITY_META = {
  high: { label: 'High', color: 'error' },
  medium: { label: 'Medium', color: 'warning' },
  low: { label: 'Low', color: 'default' }
}

export const STATUS_OPTIONS = Object.entries(STATUS_META).map(([value, m]) => ({ value, label: m.label }))
export const PRIORITY_OPTIONS = Object.entries(PRIORITY_META).map(([value, m]) => ({ value, label: m.label }))

export const CHART_COLORS = ['#2563EB', '#60A5FA', '#0EA5E9', '#34D399', '#F59E0B', '#EF4444', '#A78BFA', '#94A3B8']

export const theme = createTheme({
  palette: {
    primary: { main: '#2563EB', dark: '#1E40AF', light: '#60A5FA' },
    secondary: { main: '#0EA5E9' },
    background: { default: '#F5F7FA', paper: '#FFFFFF' }
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: "'Inter','Segoe UI',system-ui,-apple-system,sans-serif",
    h6: { fontWeight: 700 },
    body1: { fontSize: 14 }
  },
  components: {
    MuiPaper: {
      styleOverrides: { root: { borderColor: '#E5E9F0' } },
      defaultProps: { elevation: 0 }
    },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none' } } },
    MuiTableCell: { styleOverrides: { head: { fontWeight: 600, color: '#475569', backgroundColor: '#F8FAFC' } } },
    MuiLinearProgress: { defaultProps: { color: 'primary' } }
  }
})
