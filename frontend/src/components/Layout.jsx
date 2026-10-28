import React, { useCallback, useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Toolbar from '@mui/material/Toolbar'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Chip from '@mui/material/Chip'
import Badge from '@mui/material/Badge'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Divider from '@mui/material/Divider'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import DashboardIcon from '@mui/icons-material/Dashboard'
import PeopleIcon from '@mui/icons-material/People'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import HistoryIcon from '@mui/icons-material/History'
import EventNoteIcon from '@mui/icons-material/EventNote'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import BarChartIcon from '@mui/icons-material/BarChart'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import NotificationsIcon from '@mui/icons-material/Notifications'
import SettingsIcon from '@mui/icons-material/Settings'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuIcon from '@mui/icons-material/Menu'
import BusinessIcon from '@mui/icons-material/Business'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { fmtDateTime, relative } from '../utils/dates'

const DRAWER_W = 248

const adminNav = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { to: '/admin/leads', label: 'Leads', icon: <PeopleIcon /> },
  { to: '/admin/import', label: 'Import Leads', icon: <UploadFileIcon /> },
  { to: '/admin/import/history', label: 'Import History', icon: <HistoryIcon /> },
  { to: '/admin/follow-ups', label: 'Follow-ups', icon: <EventNoteIcon /> },
  { to: '/admin/calendar', label: 'Calendar', icon: <CalendarMonthIcon /> },
  { to: '/admin/reports', label: 'Reports', icon: <BarChartIcon /> },
  { to: '/admin/users', label: 'Users', icon: <PersonOutlineIcon /> },
  { to: '/admin/settings', label: 'Settings', icon: <SettingsIcon /> }
]

const userNav = [
  { to: '/app/dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { to: '/app/leads', label: 'My Leads', icon: <PeopleIcon /> },
  { to: '/app/follow-ups', label: 'Follow-ups', icon: <EventNoteIcon /> },
  { to: '/app/calendar', label: 'Calendar', icon: <CalendarMonthIcon /> },
  { to: '/app/notifications', label: 'Notifications', icon: <NotificationsIcon /> },
  { to: '/app/profile', label: 'Profile', icon: <PersonOutlineIcon /> }
]

function SideNav({ items, open, onClose }) {
  const navigate = useNavigate()
  const location = useLocation()
  const isActive = (to) =>
    to === '/admin/leads' || to === '/app/leads'
      ? location.pathname.startsWith(to)
      : location.pathname === to
  return (
    <Drawer
      variant={open === undefined ? 'permanent' : 'temporary'}
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      sx={{
        width: DRAWER_W, flexShrink: 0,
        '& .MuiDrawer-paper': { width: DRAWER_W, boxSizing: 'border-box', borderRight: '1px solid #E5E9F0' }
      }}
    >
      <Toolbar sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <BusinessIcon color="primary" />
        <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main' }}>LeadFlow</Typography>
      </Toolbar>
      <Divider />
      <List sx={{ px: 1 }}>
        {items.map((it) => (
          <ListItemButton key={it.to} selected={isActive(it.to)} onClick={() => { navigate(it.to); onClose?.() }}
            sx={{ borderRadius: 2, mb: 0.5, '&.Mui-selected': { bgcolor: 'primary.main', color: 'white',
              '& .MuiListItemIcon-root': { color: 'white' },
              '&:hover': { bgcolor: 'primary.dark' } }}}>
            <ListItemIcon sx={{ minWidth: 38 }}>{it.icon}</ListItemIcon>
            <ListItemText primary={it.label} primaryTypographyProps={{ fontSize: 14, fontWeight: 500 }} />
          </ListItemButton>
        ))}
      </List>
    </Drawer>
  )
}

function NotificationBell() {
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const navigate = useNavigate()
  const { user } = useAuth()

  const loadCount = useCallback(async () => {
    try { setCount((await api.get('/api/notifications/unread-count')).count) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadCount()
    const t = setInterval(loadCount, 30000)
    return () => clearInterval(t)
  }, [loadCount])

  const openDrawer = async () => {
    setOpen(true)
    try {
      const data = await api.get('/api/notifications?pageSize=10')
      setItems(data.rows)
    } catch { setItems([]) }
  }

  const markRead = async (n) => {
    try {
      await api.patch(`/api/notifications/${n.id}/read`)
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
      loadCount()
    } catch { /* ignore */ }
  }

  return (
    <>
      <Tooltip title="Notifications">
        <Badge badgeContent={count} color="error">
          <IconButton onClick={openDrawer} aria-label="Notifications"><NotificationsIcon /></IconButton>
        </Badge>
      </Tooltip>
      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}
        sx={{ '& .MuiDrawer-paper': { width: 360 } }}>
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" fontWeight={700}>Notifications</Typography>
          {user?.role === 'user' && (
            <Typography variant="body2" color="primary" sx={{ cursor: 'pointer' }}
              onClick={() => { setOpen(false); navigate('/app/notifications') }}>
              View all
            </Typography>
          )}
        </Box>
        <Divider />
        {items.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>No notifications yet.</Typography>}
        {items.map((n) => (
          <Box key={n.id} onClick={() => { markRead(n); if (n.lead_id) { setOpen(false); navigate(user?.role === 'admin' ? `/admin/leads/${n.lead_id}` : `/app/leads/${n.lead_id}`) } }}
            sx={{ p: 2, borderLeft: n.is_read ? '3px solid transparent' : '3px solid primary.main', cursor: n.lead_id ? 'pointer' : 'default',
              '&:hover': { bgcolor: 'action.hover' } }}>
            <Typography variant="body2" fontWeight={600}>{n.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{n.message}</Typography>
            <Typography variant="caption" color="text.secondary">{relative(n.created_at)} · {fmtDateTime(n.created_at)}</Typography>
          </Box>
        ))}
      </Drawer>
    </>
  )
}

export default function Layout() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState(null)
  const navigate = useNavigate()
  const { user, mode, logout, isAdmin } = useAuth()
  const nav = isAdmin ? adminNav : userNav

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {!isMobile && <SideNav items={nav} />}
      {isMobile && <SideNav items={nav} open={mobileOpen} onClose={() => setMobileOpen(false)} />}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid #E5E9F0', bgcolor: 'background.paper' }}>
          <Toolbar>
            {isMobile && (
              <IconButton edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }} aria-label="Open menu">
                <MenuIcon />
              </IconButton>
            )}
            <Box sx={{ flexGrow: 1 }} />
            <NotificationBell />
            <Tooltip title="Account menu">
              <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} sx={{ ml: 1 }} aria-label="Account menu">
                <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: 15 }}>
                  {(user?.full_name || 'U').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                </Avatar>
              </IconButton>
            </Tooltip>
            <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
              <Box sx={{ px: 2, py: 1 }}>
                <Typography variant="body2" fontWeight={700}>{user?.full_name}</Typography>
                <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
                <Chip label={user?.role === 'admin' ? 'Administrator' : 'Employee'} size="small" color="primary" sx={{ mt: 0.5 }} />
              </Box>
              <Divider />
              <MenuItem onClick={() => { setMenuAnchor(null); navigate(isAdmin ? '/admin/settings' : '/app/profile') }}>
                {isAdmin ? 'Settings' : 'My Profile'}
              </MenuItem>
              <MenuItem onClick={logout}><LogoutIcon fontSize="small" sx={{ mr: 1 }} />Logout</MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>
        {mode === 'local-dev' && (
          <Alert severity="warning" icon={false} sx={{ py: 0.5, fontWeight: 500, fontSize: 13 }}>
            Local demo mode — data is stored in memory and resets on restart. Connect Supabase for real data (see README).
          </Alert>
        )}
        <Box sx={{ flexGrow: 1, p: { xs: 2, md: 3 }, maxWidth: 1440, width: '100%', margin: '0 auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}
