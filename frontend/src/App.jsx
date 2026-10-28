import React from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { Spinner } from './components/ui'
import Layout from './components/Layout'
import { LoginPage, ForgotPasswordPage, ResetPasswordPage } from './pages/auth'
import {
  AdminDashboard, AdminLeads, AdminLeadNew, AdminLeadDetail, ImportPage,
  ImportHistory, AdminReports, UsersPage, SettingsPage
} from './pages/admin'
import {
  UserDashboard, UserLeads, UserLeadNew, UserLeadDetail,
  UserFollowUps, UserCalendar, NotificationsPage, ProfilePage
} from './pages/user'
import FollowUpsShared from './features/FollowUpsShared'
import CalendarShared from './features/CalendarShared'

function RequireAuth({ children }) {
  const { status } = useAuth()
  if (status === 'loading') return <Spinner sx={{ mt: 8 }} />
  if (status !== 'authed') return <Navigate to="/login" replace />
  return children
}

// Pathless guard for one panel. Used as <Route element={<RoleRoute admin />}> —
// renders <Outlet /> (i.e. the matched child route) when the role matches.
function RoleRoute({ admin, children }) {
  const { status, isAdmin } = useAuth()
  if (status === 'loading') return <Spinner sx={{ mt: 8 }} />
  if (status !== 'authed') return <Navigate to="/login" replace />
  if (admin && !isAdmin) return <Navigate to="/app/dashboard" replace />
  if (!admin && isAdmin) return <Navigate to="/admin/dashboard" replace />
  return children ?? <Outlet />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        {/* admin panel */}
        <Route element={<RoleRoute admin />}>
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/leads" element={<AdminLeads />} />
          <Route path="/admin/leads/new" element={<AdminLeadNew />} />
          <Route path="/admin/leads/:id" element={<AdminLeadDetail />} />
          <Route path="/admin/import" element={<ImportPage />} />
          <Route path="/admin/import/history" element={<ImportHistory />} />
          <Route path="/admin/follow-ups" element={<FollowUpsShared isAdmin />} />
          <Route path="/admin/calendar" element={<CalendarShared isAdmin />} />
          <Route path="/admin/reports" element={<AdminReports />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
        </Route>

        {/* user panel */}
        <Route element={<RoleRoute />}>
          <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />
          <Route path="/app/dashboard" element={<UserDashboard />} />
          <Route path="/app/leads" element={<UserLeads />} />
          <Route path="/app/leads/new" element={<UserLeadNew />} />
          <Route path="/app/leads/:id" element={<UserLeadDetail />} />
          <Route path="/app/follow-ups" element={<UserFollowUps />} />
          <Route path="/app/calendar" element={<UserCalendar />} />
          <Route path="/app/notifications" element={<NotificationsPage />} />
          <Route path="/app/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

function NotFound() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 8 }}>
      <h1 style={{ fontSize: 64, margin: 0, color: '#2563EB', fontWeight: 800 }}>404</h1>
      <p style={{ color: '#64748B' }}>This page does not exist.</p>
      <a href="/login" style={{ color: '#2563EB' }}>Go to sign in</a>
    </div>
  )
}
