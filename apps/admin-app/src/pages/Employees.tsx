import { useState, useEffect } from 'react'
import {
  Search,
  UserPlus,
  Monitor,
  Activity,
  Edit2,
  Eye,
  EyeOff,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  Shield,
  ShieldCheck,
  Laptop,
  Coffee,
  Calendar,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  X,
  Loader2,
  Check,
  ChevronRight,
  Info,
  Copy,
  CheckCheck,
  Key,
  KeyRound,
  RefreshCw,
} from 'lucide-react'
import { dataService, isLiveFirestoreActive } from '../services/dataService'
import { SkeletonTable } from '../components/Skeleton'
import StatusBadge, {
  AccountStatusBadge,
  DeviceApprovalBadge,
  PresenceBadge,
  SessionStateBadge,
} from '../components/StatusBadge'
import type {
  Employee,
  EmployeeRole,
  Device,
  DeviceRegistrationRecord,
  DeviceRegistrationStatus,
  WorkSession,
  EmployeeBreak,
  UserAccount,
  AccountStatus,
  DeviceApprovalState,
  PresenceStatus,
  SessionState,
} from '@worktrack-pro/shared'
import {
  generateSecurePassword,
  validatePasswordStrength,
  validateEmployeeId,
  deriveAccountStatus,
  deriveDeviceApprovalState,
  deriveEmployeePresence,
  deriveSessionState,
} from '@worktrack-pro/shared'

const DEPARTMENTS = [
  'Engineering',
  'Design',
  'Operations',
  'Marketing',
  'Product',
  'Sales',
  'Support',
  'General',
]

const ROLES: EmployeeRole[] = ['employee', 'manager', 'admin']

export default function Employees() {
  const [loading, setLoading] = useState(true)
  const [isLive, setIsLive] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [users, setUsers] = useState<UserAccount[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [registrations, setRegistrations] = useState<DeviceRegistrationRecord[]>([])
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [currentTime, setCurrentTime] = useState<Date>(new Date())
  const [listenerError, setListenerError] = useState<string | null>(null)

  // Search & Distinct Filters
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState<string>('all')
  const [regFilter, setRegFilter] = useState<string>('all')
  const [presenceFilter, setPresenceFilter] = useState<string>('all')
  const [workStatusFilter, setWorkStatusFilter] = useState<string>('all')

  // Modals & Panels
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null)
  const [showAddEditModal, setShowAddEditModal] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null)

  // Form State
  const [formId, setFormId] = useState('')
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formDept, setFormDept] = useState('Engineering')
  const [formRole, setFormRole] = useState<EmployeeRole>('employee')
  const [formPassword, setFormPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)

  // Reset Password Modal State
  const [showResetPwdModal, setShowResetPwdModal] = useState(false)
  const [resetPwdEmp, setResetPwdEmp] = useState<Employee | null>(null)
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const [showResetPasswordValue, setShowResetPasswordValue] = useState(false)
  const [resetPwdSubmitting, setResetPwdSubmitting] = useState(false)
  const [resetPwdError, setResetPwdError] = useState<string | null>(null)

  // One-time credential dialog state (wiped on close)
  const [oneTimeCredentials, setOneTimeCredentials] = useState<{
    employeeId: string
    password: string
    uid: string
    name: string
    type?: 'provision' | 'reset'
  } | null>(null)
  const [copiedField, setCopiedField] = useState<'id' | 'password' | 'all' | null>(null)

  // Feedback notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    const isLiveNow = isLiveFirestoreActive()
    setIsLive(isLiveNow)
    setLoading(true)

    // Recalculate presence expiry (3-minute heartbeat threshold) every 10 seconds
    // even if no new incoming Firestore snapshot arrives
    const tickInterval = setInterval(() => {
      setCurrentTime(new Date())
    }, 10000)

    let unsubEmps = () => {}
    let unsubUsers = () => {}
    let unsubDevices = () => {}
    let unsubSessions = () => {}

    const onListenerError = (err: Error) => {
      console.error('[Employees] Real-time Firestore sync error:', err)
      setListenerError(err.message || 'Real-time synchronization encountered an error.')
    }

    if (isLiveNow) {
      unsubEmps = dataService.subscribeToEmployees(emps => {
        setEmployees(emps)
        setLoading(false)
        setListenerError(null)
      }, onListenerError)

      unsubUsers = dataService.subscribeToUsers(usrs => {
        setUsers(usrs)
      }, onListenerError)

      unsubDevices = dataService.subscribeToDevices(devs => {
        setDevices(devs)
      }, onListenerError)

      unsubSessions = dataService.subscribeToSessions(sess => {
        setSessions(sess)
      }, onListenerError)

      dataService.getDeviceRegistrations()
        .then(setRegistrations)
        .catch(err => console.warn('[Employees] Failed to fetch device registrations:', err))
    } else {
      // Demo fallback mode
      Promise.all([
        dataService.getEmployees(),
        dataService.getDevices(),
        dataService.getDeviceRegistrations(),
        dataService.getSessions(),
      ]).then(([emps, devs, regs, sess]) => {
        setEmployees(emps)
        setDevices(devs)
        setRegistrations(regs)
        setSessions(sess)
      }).catch(err => {
        console.error('Failed to load employee data:', err)
      }).finally(() => {
        setLoading(false)
      })
    }

    return () => {
      clearInterval(tickInterval)
      unsubEmps()
      unsubUsers()
      unsubDevices()
      unsubSessions()
    }
  }, [])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  // ─── Helpers to look up associated employee records ────────
  const getEmployeeDevices = (empId: string): Device[] => {
    return devices.filter(d => d.employeeId === empId)
  }

  const getEmployeeDevice = (empId: string): Device | undefined => {
    return devices.find(d => d.employeeId === empId)
  }

  const getEmployeeUser = (emp: Employee): UserAccount | undefined => {
    return users.find(u => (emp.userId && u.uid === emp.userId) || (u.employeeId && u.employeeId === emp.id))
  }

  const getEmployeeRegistration = (empId: string): DeviceRegistrationRecord | undefined => {
    return registrations.find(r => r.employeeId === empId)
  }

  const getEmployeeActiveSession = (empId: string): WorkSession | undefined => {
    const active = sessions.filter(
      s => s.employeeId === empId && (s.status === 'working' || s.status === 'on_break' || s.status === 'active' || s.status === 'paused')
    )
    if (active.length === 0) return undefined
    active.sort((a, b) => {
      const aTime = a.startedAt instanceof Date ? a.startedAt.getTime() : new Date(a.startedAt).getTime()
      const bTime = b.startedAt instanceof Date ? b.startedAt.getTime() : new Date(b.startedAt).getTime()
      return bTime - aTime
    })
    return active[0]
  }

  const getEmployeeSessions = (empId: string): WorkSession[] => {
    return sessions.filter(s => s.employeeId === empId).sort((a, b) => {
      const aTime = a.startedAt instanceof Date ? a.startedAt.getTime() : new Date(a.startedAt).getTime()
      const bTime = b.startedAt instanceof Date ? b.startedAt.getTime() : new Date(b.startedAt).getTime()
      return bTime - aTime
    })
  }

  // ─── Pure State Derivations for an Employee ────────────────
  const getEmployeeStates = (emp: Employee) => {
    const empDevices = getEmployeeDevices(emp.id)
    const primaryDev = empDevices[0] || getEmployeeDevice(emp.id)
    const reg = getEmployeeRegistration(emp.id)
    const user = getEmployeeUser(emp)
    const activeSess = getEmployeeActiveSession(emp.id)

    const accountStatus: AccountStatus = deriveAccountStatus(emp, user)
    const deviceApproval: DeviceApprovalState = deriveDeviceApprovalState(primaryDev, reg)
    const presence: PresenceStatus = deriveEmployeePresence(empDevices, user?.lastActiveAt, currentTime)
    const sessionState: SessionState = deriveSessionState(activeSess)

    let lastHbDate: Date | undefined
    for (const d of empDevices) {
      const hb = d.lastHeartbeat || d.lastSeen
      if (hb) {
        const dt = hb instanceof Date ? hb : new Date(hb)
        if (!lastHbDate || dt > lastHbDate) {
          lastHbDate = dt
        }
      }
    }
    if (!lastHbDate && user?.lastActiveAt) {
      lastHbDate = user.lastActiveAt instanceof Date ? user.lastActiveAt : new Date(user.lastActiveAt)
    }

    return {
      empDevices,
      primaryDev,
      reg,
      user,
      activeSess,
      accountStatus,
      deviceApproval,
      presence,
      sessionState,
      lastHbDate,
    }
  }

  // ─── Filter Logic ──────────────────────────────────────────
  const filteredEmployees = employees.filter(emp => {
    const states = getEmployeeStates(emp)

    // 1. Search by name, employee ID, or email
    const q = search.trim().toLowerCase()
    const matchesSearch =
      !q ||
      emp.name.toLowerCase().includes(q) ||
      emp.id.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q) ||
      (emp.department || '').toLowerCase().includes(q)

    // 2. Account status filter
    const matchesAccount =
      accountFilter === 'all' ||
      states.accountStatus === accountFilter

    // 3. Device approval filter
    const matchesReg =
      regFilter === 'all' ||
      states.deviceApproval === regFilter

    // 4. Presence filter
    const matchesPresence =
      presenceFilter === 'all' ||
      states.presence === presenceFilter

    // 5. Work session filter
    const matchesWork =
      workStatusFilter === 'all' ||
      states.sessionState === workStatusFilter

    return matchesSearch && matchesAccount && matchesReg && matchesPresence && matchesWork
  })

  // ─── Form Handlers: Add & Edit ─────────────────────────────
  const openAddModal = () => {
    setModalMode('add')
    setEditingEmp(null)
    setFormId(`emp_${String(employees.length + 1).padStart(3, '0')}`)
    setFormName('')
    setFormEmail('')
    setFormDept('Engineering')
    setFormRole('employee')
    setFormPassword(generateSecurePassword(16))
    setShowPassword(false)
    setFormError(null)
    setShowAddEditModal(true)
  }

  const openActivateModal = (emp: Employee) => {
    setModalMode('add')
    setEditingEmp(emp)
    setFormId(emp.id)
    setFormName(emp.name)
    setFormEmail(emp.email)
    setFormDept(emp.department || 'Engineering')
    setFormRole(emp.role)
    setFormPassword(generateSecurePassword(16))
    setShowPassword(false)
    setFormError(null)
    setShowAddEditModal(true)
  }

  const openEditModal = (emp: Employee) => {
    setModalMode('edit')
    setEditingEmp(emp)
    setFormId(emp.id)
    setFormName(emp.name)
    setFormEmail(emp.email)
    setFormDept(emp.department || 'Engineering')
    setFormRole(emp.role)
    setFormPassword('')
    setFormError(null)
    setShowAddEditModal(true)
  }

  const openResetPasswordModal = (emp: Employee) => {
    setResetPwdEmp(emp)
    setResetPasswordValue(generateSecurePassword(16))
    setShowResetPasswordValue(false)
    setResetPwdError(null)
    setShowResetPwdModal(true)
  }

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetPwdEmp) return
    setResetPwdError(null)

    const pwdValidation = validatePasswordStrength(resetPasswordValue)
    if (!pwdValidation.valid) {
      setResetPwdError(`Password does not meet security requirements: ${pwdValidation.errors.join(' ')}`)
      return
    }

    setResetPwdSubmitting(true)
    try {
      const res = await dataService.resetEmployeePassword({
        employeeId: resetPwdEmp.id,
        newPassword: resetPasswordValue,
      })

      setShowResetPwdModal(false)
      setOneTimeCredentials({
        employeeId: resetPwdEmp.id,
        password: resetPasswordValue,
        uid: res.uid,
        name: resetPwdEmp.name,
        type: 'reset',
      })
      showToast(`✓ Password successfully reset for ${resetPwdEmp.name}`)
    } catch (err: any) {
      setResetPwdError(err?.message || 'Failed to reset employee password.')
    } finally {
      setResetPwdSubmitting(false)
    }
  }

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const idValidation = validateEmployeeId(formId)
    if (!idValidation.valid || !idValidation.normalized) {
      setFormError(
        idValidation.error ||
          'Invalid Employee ID format. Must be 3–32 characters (letters, numbers, hyphens, underscores).'
      )
      return
    }

    if (!formName.trim()) {
      setFormError('Employee Full Name is required.')
      return
    }
    if (!formEmail.trim() || !formEmail.includes('@') || !formEmail.includes('.')) {
      setFormError('Please enter a valid corporate or personal contact email address.')
      return
    }

    if (modalMode === 'add') {
      const pwdValidation = validatePasswordStrength(formPassword)
      if (!pwdValidation.valid) {
        setFormError(`Password does not meet requirements: ${pwdValidation.errors.join(' ')}`)
        return
      }
    }

    setFormSubmitting(true)
    try {
      if (modalMode === 'add') {
        const result = await dataService.provisionEmployee({
          employeeId: idValidation.normalized,
          name: formName.trim(),
          contactEmail: formEmail.trim(),
          department: formDept,
          role: formRole,
          initialPassword: formPassword,
        })

        // Real-time Firestore onSnapshot automatically receives the updated employee document.
        // Fallback fetch ensures UI updates immediately even if snapshots lag:
        dataService.getEmployees().then(setEmployees).catch(() => {})

        // Open one-time credential modal
        setOneTimeCredentials({
          employeeId: result.employeeId,
          password: formPassword,
          uid: result.uid,
          name: formName.trim(),
        })

        setShowAddEditModal(false)
        setFormPassword('')
        showToast(`✓ Account provisioned for ${formName.trim()}`)
      } else if (editingEmp) {
        const updated = await dataService.updateEmployee(editingEmp.id, {
          name: formName.trim(),
          email: formEmail.trim(),
          department: formDept,
          role: formRole,
        })
        setEmployees(prev => prev.map(e => (e.id === updated.id ? updated : e)))
        showToast(`✓ Employee "${updated.name}" updated successfully.`)
        setShowAddEditModal(false)
      }
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save employee record.')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleCopyCredential = (text: string, field: 'id' | 'password' | 'all') => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2500)
  }

  const handleCloseOneTimeCredentials = () => {
    setOneTimeCredentials(null)
    setFormPassword('')
    setCopiedField(null)
  }

  const resetAllFilters = () => {
    setSearch('')
    setAccountFilter('all')
    setRegFilter('all')
    setPresenceFilter('all')
    setWorkStatusFilter('all')
  }

  const selectedEmployee = selectedEmpId ? employees.find(e => e.id === selectedEmpId) : null
  const selectedDevice = selectedEmpId ? getEmployeeDevice(selectedEmpId) : undefined
  const selectedReg = selectedEmpId ? getEmployeeRegistration(selectedEmpId) : undefined
  const selectedSessions = selectedEmpId ? getEmployeeSessions(selectedEmpId) : []

  const formatSeconds = (s?: number) => {
    if (!s) return '0h 0m'
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return `${h}h ${m}m`
  }

  return (
    <div className="space-y-5 animate-fade-in select-none">
      {/* ── Toast Notification ──────────────────────────────── */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 animate-slide-up">
          <div className="bg-surface-800/95 border border-brand-500/40 shadow-glow-green/30 backdrop-blur-md rounded-xl p-3 flex items-center gap-2.5 text-xs text-white">
            <CheckCircle2 className="w-4 h-4 text-brand-400" />
            <span className="font-medium">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* ── Toolbar: Search, Filters & Add Employee ───────────── */}
      <div className="glass-card p-4 space-y-3 border-white/5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              id="employee-search-input"
              type="text"
              placeholder="Search by employee name, ID, or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-9 py-2 text-xs w-full"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              id="btn-add-employee"
              onClick={openAddModal}
              className="btn-primary py-2 px-3 text-xs font-semibold shadow-glow-brand flex items-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" />
              Add Employee
            </button>
          </div>
        </div>

        {/* Filter Dropdowns Bar */}
        <div className="flex items-center gap-2.5 flex-wrap pt-2 border-t border-white/5 text-xs">
          <div className="flex items-center gap-1.5 text-white/40 font-medium">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          {/* 1. Account Status Filter */}
          <div className="flex items-center gap-1 bg-surface-900 border border-white/10 rounded-lg px-2 py-1">
            <span className="text-[11px] text-white/40">Account:</span>
            <select
              id="filter-account"
              value={accountFilter}
              onChange={e => setAccountFilter(e.target.value)}
              className="bg-transparent text-white text-[11px] font-medium outline-none cursor-pointer"
            >
              <option value="all">All Accounts</option>
              <option value="activated">Activated</option>
              <option value="not_activated">Not Activated</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>

          {/* 2. Device Approval Filter */}
          <div className="flex items-center gap-1 bg-surface-900 border border-white/10 rounded-lg px-2 py-1">
            <span className="text-[11px] text-white/40">Device Approval:</span>
            <select
              id="filter-registration"
              value={regFilter}
              onChange={e => setRegFilter(e.target.value)}
              className="bg-transparent text-white text-[11px] font-medium outline-none cursor-pointer"
            >
              <option value="all">All Devices</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
              <option value="unregistered">Unregistered</option>
            </select>
          </div>

          {/* 3. Presence Status Filter */}
          <div className="flex items-center gap-1 bg-surface-900 border border-white/10 rounded-lg px-2 py-1">
            <span className="text-[11px] text-white/40">Presence:</span>
            <select
              id="filter-presence"
              value={presenceFilter}
              onChange={e => setPresenceFilter(e.target.value)}
              className="bg-transparent text-white text-[11px] font-medium outline-none cursor-pointer"
            >
              <option value="all">All Presence</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>

          {/* 4. Work Session Filter */}
          <div className="flex items-center gap-1 bg-surface-900 border border-white/10 rounded-lg px-2 py-1">
            <span className="text-[11px] text-white/40">Session:</span>
            <select
              id="filter-work"
              value={workStatusFilter}
              onChange={e => setWorkStatusFilter(e.target.value)}
              className="bg-transparent text-white text-[11px] font-medium outline-none cursor-pointer"
            >
              <option value="all">All Sessions</option>
              <option value="working">Working</option>
              <option value="on_break">On Break</option>
              <option value="ended">Ended</option>
              <option value="no_session">No Session</option>
            </select>
          </div>

          {(search || accountFilter !== 'all' || regFilter !== 'all' || presenceFilter !== 'all' || workStatusFilter !== 'all') && (
            <button
              onClick={resetAllFilters}
              className="text-[11px] text-brand-400 hover:text-brand-300 underline ml-auto flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ── Listener Error Banner (Shown when Firebase listener fails, no silent mock fallback) ── */}
      {listenerError && (
        <div className="p-3.5 rounded-xl bg-danger-500/15 border border-danger-500/30 flex items-center justify-between text-xs text-danger-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-danger-400 flex-shrink-0" />
            <span>Real-time subscription alert: {listenerError}. Live employee status may be interrupted.</span>
          </div>
          <button
            onClick={() => setListenerError(null)}
            className="btn-secondary py-1 px-2.5 text-xs text-danger-200 hover:text-white border-danger-500/30"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Main Employees Table ────────────────────────────── */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5">
          <div className="flex items-center gap-2">
            <h2 className="section-title">Directory of Employees</h2>
            <span className="text-xs text-white/40 font-mono">
              ({filteredEmployees.length} of {employees.length} shown)
            </span>
          </div>
          {isLive ? (
            <span className="live-banner text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Firestore Directory
            </span>
          ) : (
            <span className="mock-banner text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-warning-400" />
              Offline Demo Persistence
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-5">
            <SkeletonTable rows={6} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 text-[11px] font-medium text-white/40 uppercase tracking-wider bg-surface-900/40">
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Department & Role</th>
                  <th className="px-4 py-3">Registered Device</th>
                  <th className="px-4 py-3">Device Approval</th>
                  <th className="px-4 py-3">Presence</th>
                  <th className="px-4 py-3">Work Session</th>
                  <th className="px-4 py-3">Last Heartbeat</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {filteredEmployees.map(emp => {
                  const states = getEmployeeStates(emp)

                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-surface-800/40 transition-colors group cursor-pointer"
                      onClick={() => setSelectedEmpId(emp.id)}
                    >
                      {/* 1. Employee Info */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-brand-600/20 border border-brand-500/20 flex items-center justify-center text-xs font-bold text-brand-300 flex-shrink-0">
                            {emp.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-semibold text-white group-hover:text-brand-300 transition-colors">
                              {emp.name}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] text-white/40 bg-white/5 px-1.5 py-0.2 rounded">
                                {emp.id}
                              </span>
                              <span className="text-[10px] text-white/30 truncate max-w-[140px]" title={emp.email}>
                                {emp.email}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Account Status */}
                      <td className="px-4 py-3.5">
                        <AccountStatusBadge status={states.accountStatus} />
                      </td>

                      {/* 3. Department & Role */}
                      <td className="px-4 py-3.5">
                        <p className="text-white/80 font-medium">{emp.department || 'General'}</p>
                        <span className={`inline-block text-[10px] uppercase font-semibold mt-0.5 px-1.5 py-0.2 rounded border ${
                          emp.role === 'admin'
                            ? 'bg-brand-500/15 text-brand-400 border-brand-500/20'
                            : emp.role === 'manager'
                            ? 'bg-warning-500/15 text-warning-400 border-warning-500/20'
                            : 'bg-white/5 text-white/40 border-white/10'
                        }`}>
                          {emp.role}
                        </span>
                      </td>

                      {/* 4. Device Name & ID */}
                      <td className="px-4 py-3.5">
                        {states.primaryDev || states.reg ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-white font-mono text-[11px]">
                              <Monitor className="w-3 h-3 text-brand-400 flex-shrink-0" />
                              <span className="truncate max-w-[110px]" title={states.primaryDev?.name || states.reg?.deviceName}>
                                {states.primaryDev?.name || states.reg?.deviceName}
                              </span>
                            </div>
                            <p className="text-[10px] font-mono text-white/30 truncate max-w-[120px]" title={states.primaryDev?.id || states.reg?.deviceId}>
                              {states.primaryDev?.id || states.reg?.deviceId}
                            </p>
                          </div>
                        ) : (
                          <span className="text-white/30 text-[11px] italic">No device assigned</span>
                        )}
                      </td>

                      {/* 5. Device Approval Status */}
                      <td className="px-4 py-3.5">
                        <DeviceApprovalBadge status={states.deviceApproval} />
                      </td>

                      {/* 6. Presence Status */}
                      <td className="px-4 py-3.5">
                        <PresenceBadge
                          status={states.presence}
                          title={states.lastHbDate ? `Last heartbeat: ${states.lastHbDate.toLocaleTimeString()}` : undefined}
                        />
                      </td>

                      {/* 7. Work Session Status */}
                      <td className="px-4 py-3.5">
                        <SessionStateBadge status={states.sessionState} />
                      </td>

                      {/* 8. Last Heartbeat */}
                      <td className="px-4 py-3.5 text-[11px] font-mono text-white/50">
                        {states.lastHbDate
                          ? states.lastHbDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                          : '—'}
                      </td>

                      {/* 9. Action Buttons */}
                      <td className="px-5 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {states.accountStatus === 'not_activated' && (
                            <button
                              onClick={() => openActivateModal(emp)}
                              className="p-1.5 rounded-lg bg-amber-500/15 hover:bg-brand-600 hover:text-white text-amber-300 transition-colors"
                              title={`Activate ${emp.name}'s Employee Account & Login Credentials`}
                            >
                              <Key className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {states.accountStatus === 'activated' && (
                            <button
                              onClick={() => openResetPasswordModal(emp)}
                              className="p-1.5 rounded-lg bg-surface-700/60 hover:bg-amber-600 hover:text-white text-amber-400 transition-colors"
                              title={`Reset Password for ${emp.name}`}
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedEmpId(emp.id)}
                            className="p-1.5 rounded-lg bg-surface-700/60 hover:bg-surface-700 hover:text-white text-white/50 transition-colors"
                            title="View Employee Profile & Activity"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEditModal(emp)}
                            className="p-1.5 rounded-lg bg-surface-700/60 hover:bg-brand-600 hover:text-white text-white/50 transition-colors"
                            title="Edit Employee Details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredEmployees.length === 0 && (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-surface-800 border border-white/5 flex items-center justify-center mx-auto text-white/30">
              <Search className="w-6 h-6" />
            </div>
            <p className="text-white/60 text-sm font-medium">No matching employee records found.</p>
            <p className="text-white/30 text-xs">Try adjusting your search criteria or resetting filters.</p>
            <button
              onClick={resetAllFilters}
              className="btn-secondary py-1.5 px-3 text-xs inline-flex items-center gap-1.5 mt-2"
            >
              <RotateCcw className="w-3 h-3" />
              Clear Search & Filters
            </button>
          </div>
        )}
      </div>

      {/* ── MODAL: Employee Details View ─────────────────────── */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 bg-surface-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl glass-card p-6 space-y-5 animate-slide-up border-brand-500/30 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-brand-600/25 border border-brand-500/30 flex items-center justify-center text-base font-bold text-brand-300">
                  {selectedEmployee.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">{selectedEmployee.name}</h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/5 text-white/50 border border-white/10">
                      {selectedEmployee.id}
                    </span>
                    <span className="stat-badge capitalize bg-brand-500/15 text-brand-400 border border-brand-500/25 text-[10px]">
                      {selectedEmployee.role}
                    </span>
                  </div>
                  <p className="text-xs text-white/40 mt-0.5">{selectedEmployee.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    openEditModal(selectedEmployee)
                    setSelectedEmpId(null)
                  }}
                  className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" />
                  Edit Profile
                </button>
                <button
                  onClick={() => setSelectedEmpId(null)}
                  className="p-1 rounded-lg text-white/40 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 4 Distinct State Badges Grid & General Info */}
            {(() => {
              const selStates = getEmployeeStates(selectedEmployee)
              return (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-3 rounded-xl bg-surface-900 border border-white/5 space-y-1.5">
                      <p className="text-white/40 text-[10px] uppercase font-semibold">Account</p>
                      <div>
                        <AccountStatusBadge status={selStates.accountStatus} size="md" />
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-900 border border-white/5 space-y-1.5">
                      <p className="text-white/40 text-[10px] uppercase font-semibold">Presence</p>
                      <div>
                        <PresenceBadge
                          status={selStates.presence}
                          size="md"
                          title={selStates.lastHbDate ? `Last heartbeat: ${selStates.lastHbDate.toLocaleTimeString()}` : undefined}
                        />
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-900 border border-white/5 space-y-1.5">
                      <p className="text-white/40 text-[10px] uppercase font-semibold">Device Approval</p>
                      <div>
                        <DeviceApprovalBadge status={selStates.deviceApproval} size="md" />
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-900 border border-white/5 space-y-1.5">
                      <p className="text-white/40 text-[10px] uppercase font-semibold">Session</p>
                      <div>
                        <SessionStateBadge status={selStates.sessionState} size="md" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 text-xs">
                    <div className="p-3 rounded-xl bg-surface-900 border border-white/5">
                      <p className="text-white/40 text-[10px] uppercase font-semibold">Department</p>
                      <p className="font-semibold text-white mt-1">{selectedEmployee.department || 'General'}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-900 border border-white/5">
                      <p className="text-white/40 text-[10px] uppercase font-semibold">Joined Date</p>
                      <p className="font-semibold text-white mt-1">
                        {new Date(selectedEmployee.createdAt).toLocaleDateString([], { dateStyle: 'medium' })}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-900 border border-white/5">
                      <p className="text-white/40 text-[10px] uppercase font-semibold">Auth UID</p>
                      <p className="font-mono text-white/70 text-[11px] mt-1 truncate" title={selectedEmployee.userId || 'Not linked'}>
                        {selectedEmployee.userId || '—'}
                      </p>
                    </div>
                  </div>
                </>
              )
            })()}

            {/* Associated Device Card */}
            <div className="glass-card p-4 space-y-2.5 border-white/10 bg-surface-900/60">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5 text-brand-400" />
                  Associated Hardware Device
                </span>
                {selectedReg && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    selectedReg.status === 'approved'
                      ? 'bg-success-500/15 text-success-300 border-success-500/25'
                      : selectedReg.status === 'pending_approval'
                      ? 'bg-warning-500/15 text-warning-300 border-warning-500/25'
                      : selectedReg.status === 'rejected'
                      ? 'bg-danger-500/15 text-danger-300 border-danger-500/25'
                      : 'bg-white/5 text-white/40 border-white/10'
                  }`}>
                    Registration: {selectedReg.status.toUpperCase()}
                  </span>
                )}
              </div>

              {selectedDevice || selectedReg ? (
                <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-white/40 text-[11px]">Device Name / Hostname:</span>
                    <p className="font-mono font-semibold text-white">
                      {selectedDevice?.name || selectedReg?.deviceName}
                    </p>
                  </div>
                  <div>
                    <span className="text-white/40 text-[11px]">Device ID (Immutable UUID):</span>
                    <p className="font-mono text-[11px] text-brand-300 truncate" title={selectedDevice?.id || selectedReg?.deviceId}>
                      {selectedDevice?.id || selectedReg?.deviceId}
                    </p>
                  </div>
                  <div>
                    <span className="text-white/40 text-[11px]">OS & Architecture:</span>
                    <p className="text-white/80 font-mono text-[11px]">
                      {selectedDevice?.osVersion || 'Windows 11 Pro 64-bit'}
                    </p>
                  </div>
                  <div>
                    <span className="text-white/40 text-[11px]">Last Activity / Heartbeat:</span>
                    <p className="text-white/80 font-mono text-[11px]">
                      {selectedDevice?.lastHeartbeat || selectedDevice?.lastSeen
                        ? new Date(selectedDevice.lastHeartbeat || selectedDevice.lastSeen!).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                        : '—'}
                    </p>
                  </div>
                  {selectedReg?.rejectionReason && (
                    <div className="col-span-2 p-2 rounded-lg bg-danger-500/10 border border-danger-500/20 text-xs text-danger-300">
                      <span className="font-semibold">Rejection Note: </span>
                      {selectedReg.rejectionReason}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-white/40 italic py-2">
                  No registered hardware device is currently associated with this employee.
                </p>
              )}
            </div>

            {/* Work Sessions & Break Log */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-brand-400" />
                  Mock Work-Session & Break Log ({selectedSessions.length})
                </span>
                <span className="text-[10px] text-white/30 font-mono">⚠ Seeded Data</span>
              </div>

              {selectedSessions.length === 0 ? (
                <div className="p-4 rounded-xl bg-surface-900 border border-white/5 text-center text-xs text-white/40">
                  No work sessions logged for this employee.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedSessions.map(sess => (
                    <div
                      key={sess.id}
                      className="p-3 rounded-xl bg-surface-900 border border-white/5 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            sess.status === 'working' || sess.status === 'active'
                              ? 'bg-success-400 animate-pulse'
                              : sess.status === 'on_break'
                              ? 'bg-warning-400 animate-pulse'
                              : 'bg-white/30'
                          }`} />
                          <span className="font-semibold text-white capitalize">{sess.status} Session</span>
                          <span className="font-mono text-[10px] text-white/40">{sess.id}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-semibold text-brand-400">
                            Work: {formatSeconds(sess.workDurationSeconds || sess.durationSeconds)}
                          </span>
                          {sess.breakDurationSeconds ? (
                            <span className="font-mono text-[10px] text-warning-400 ml-2">
                              (Breaks: {formatSeconds(sess.breakDurationSeconds)})
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-white/40 font-mono pt-1 border-t border-white/5">
                        <span>Started: {new Date(sess.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span>Ended: {sess.endedAt ? new Date(sess.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'In Progress'}</span>
                      </div>

                      {/* Break history inside this session */}
                      {sess.breaks && sess.breaks.length > 0 && (
                        <div className="pt-1.5 space-y-1">
                          <p className="text-[10px] font-semibold text-white/40 uppercase">Breaks in this session:</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {sess.breaks.map((b: EmployeeBreak, bi: number) => (
                              <div
                                key={b.id || bi}
                                className="p-1.5 rounded-lg bg-surface-800 text-[11px] flex items-center justify-between text-white/70"
                              >
                                <span className="capitalize flex items-center gap-1">
                                  <Coffee className="w-2.5 h-2.5 text-warning-400" />
                                  {b.reason} {b.customReason ? `(${b.customReason})` : ''}
                                </span>
                                <span className="font-mono text-warning-400 text-[10px]">
                                  {b.durationSeconds ? `${Math.floor(b.durationSeconds / 60)}m` : 'Active'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-white/5">
              <div>
                {selectedEmployee.userId ? (
                  <button
                    onClick={() => {
                      const emp = selectedEmployee
                      setSelectedEmpId(null)
                      openResetPasswordModal(emp)
                    }}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 flex items-center gap-1.5 transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Reset Password
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const emp = selectedEmployee
                      setSelectedEmpId(null)
                      openActivateModal(emp)
                    }}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 flex items-center gap-1.5 transition-colors"
                  >
                    <Key className="w-3.5 h-3.5" />
                    Activate Account
                  </button>
                )}
              </div>
              <button
                onClick={() => setSelectedEmpId(null)}
                className="btn-secondary py-2 px-4 text-xs font-semibold"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Add / Edit Employee ───────────────────────── */}
      {showAddEditModal && (
        <div className="fixed inset-0 z-50 bg-surface-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-card p-6 space-y-4 animate-slide-up border-brand-500/30">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-brand-400" />
                <h3 className="text-sm font-bold text-white">
                  {modalMode === 'add'
                    ? editingEmp
                      ? `Activate Employee Account: ${editingEmp.name}`
                      : 'Add New Employee'
                    : `Edit Profile: ${editingEmp?.name}`}
                </h3>
              </div>
              <button
                onClick={() => setShowAddEditModal(false)}
                className="text-white/40 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editingEmp && modalMode === 'add' && (
              <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-xs text-brand-300 leading-relaxed">
                <span className="font-semibold text-white">Activating Existing Record:</span> This will create the secure login identity <span className="font-mono text-white">({formId}@worktrack.internal)</span> for {editingEmp.name} and generate a temporary password while preserving all directory details.
              </div>
            )}

            {formError && (() => {
              const match = formError.match(/^\[([^\]]+)\]\s*([\s\S]*)$/)
              const errorCode = match ? match[1] : null
              const errorText = match ? match[2] : formError

              return (
                <div className="p-3 rounded-xl bg-danger-500/15 border border-danger-500/30 flex items-start gap-2.5 text-xs text-danger-300">
                  <AlertTriangle className="w-4 h-4 text-danger-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed space-y-1">
                    {errorCode && (
                      <div>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-danger-500/20 text-danger-200 border border-danger-500/30">
                          {errorCode}
                        </span>
                      </div>
                    )}
                    <div>{errorText}</div>
                  </div>
                </div>
              )
            })()}

            <form onSubmit={handleSaveEmployee} className="space-y-3.5">
              {/* Employee ID */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">
                  Employee ID {modalMode === 'edit' && '(Immutable)'} *
                </label>
                <input
                  id="form-emp-id"
                  type="text"
                  placeholder="e.g. emp_008"
                  value={formId}
                  onChange={e => setFormId(e.target.value)}
                  disabled={modalMode === 'edit' || formSubmitting}
                  className="input-field py-2 text-xs font-mono disabled:opacity-50"
                  required
                />
              </div>

              {/* Full Name */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">
                  Full Name *
                </label>
                <input
                  id="form-emp-name"
                  type="text"
                  placeholder="e.g. Jane Doe"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  disabled={formSubmitting}
                  className="input-field py-2 text-xs"
                  required
                />
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">
                  Email Address *
                </label>
                <input
                  id="form-emp-email"
                  type="email"
                  placeholder="e.g. jane.doe@example.com"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  disabled={formSubmitting}
                  className="input-field py-2 text-xs"
                  required
                />
              </div>

              {/* Department & Role */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">
                    Department
                  </label>
                  <select
                    id="form-emp-dept"
                    value={formDept}
                    onChange={e => setFormDept(e.target.value)}
                    disabled={formSubmitting}
                    className="input-field py-2 text-xs cursor-pointer"
                  >
                    {DEPARTMENTS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">
                    System Role
                  </label>
                  <select
                    id="form-emp-role"
                    value={formRole}
                    onChange={e => setFormRole(e.target.value as EmployeeRole)}
                    disabled={formSubmitting}
                    className="input-field py-2 text-xs cursor-pointer capitalize"
                  >
                    {ROLES.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Initial Password Section (Add Mode Only) */}
              {modalMode === 'add' && (
                <div className="space-y-1.5 p-3 rounded-xl bg-surface-900 border border-white/10">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-white/70 uppercase tracking-wider flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-brand-400" />
                      Initial Password *
                    </label>
                    <button
                      type="button"
                      onClick={() => setFormPassword(generateSecurePassword(16))}
                      className="text-[11px] text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Regenerate
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="form-emp-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter strong password (min 8 chars)"
                      value={formPassword}
                      onChange={e => setFormPassword(e.target.value)}
                      disabled={formSubmitting}
                      className="input-field py-2 pr-9 text-xs font-mono"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
                      tabIndex={-1}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-white/40 leading-relaxed">
                    A Firebase Auth account will be created. The employee will sign in using their Employee ID + password.
                  </p>
                </div>
              )}

              <div className="pt-3 border-t border-white/5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  disabled={formSubmitting}
                  className="btn-secondary flex-1 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  id="btn-save-employee"
                  type="submit"
                  disabled={formSubmitting}
                  className="btn-primary flex-1 py-2 text-xs font-semibold shadow-glow-brand flex items-center justify-center gap-1.5"
                >
                  {formSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {modalMode === 'add' ? 'Provisioning Account...' : 'Saving...'}
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      {modalMode === 'add' ? 'Provision Account' : 'Save Changes'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Reset Password ──────────────────────────── */}
      {showResetPwdModal && resetPwdEmp && (
        <div className="fixed inset-0 z-50 bg-surface-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-card p-6 space-y-4 animate-slide-up border-amber-500/30">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Reset Employee Password</h3>
                  <p className="text-[11px] text-white/50">{resetPwdEmp.name} ({resetPwdEmp.id})</p>
                </div>
              </div>
              <button
                onClick={() => setShowResetPwdModal(false)}
                disabled={resetPwdSubmitting}
                className="text-white/40 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Identity Info */}
            <div className="p-3 rounded-xl bg-surface-900 border border-white/10 text-xs space-y-1.5 font-mono">
              <div className="flex justify-between items-center text-white/60">
                <span className="font-sans text-[11px] text-white/40">Employee ID:</span>
                <span className="text-white font-semibold">{resetPwdEmp.id}</span>
              </div>
              <div className="flex justify-between items-center text-white/60">
                <span className="font-sans text-[11px] text-white/40">Auth Identity:</span>
                <span className="text-white/80">{resetPwdEmp.id}@worktrack.internal</span>
              </div>
              <div className="flex justify-between items-center text-white/60">
                <span className="font-sans text-[11px] text-white/40">Department:</span>
                <span className="text-white/80 font-sans">{resetPwdEmp.department || 'General'}</span>
              </div>
            </div>

            {/* Warning Callout */}
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 space-y-1 leading-relaxed">
              <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Immediate Credential Revocation</span>
              </div>
              <p className="text-[11px] text-amber-200/80">
                Resetting will immediately invalidate this employee's previous password. The employee must use the new temporary password to sign into the Employee App.
              </p>
            </div>

            {/* Error Message */}
            {resetPwdError && (() => {
              const match = resetPwdError.match(/^\[([^\]]+)\]\s*([\s\S]*)$/)
              const errorCode = match ? match[1] : null
              const errorText = match ? match[2] : resetPwdError

              return (
                <div className="p-3 rounded-xl bg-danger-500/15 border border-danger-500/30 flex items-start gap-2.5 text-xs text-danger-300">
                  <AlertTriangle className="w-4 h-4 text-danger-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed space-y-1">
                    {errorCode && (
                      <div>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-danger-500/20 text-danger-200 border border-danger-500/30">
                          {errorCode}
                        </span>
                      </div>
                    )}
                    <div>{errorText}</div>
                  </div>
                </div>
              )
            })()}

            {/* Form */}
            <form onSubmit={handleConfirmResetPassword} className="space-y-4">
              <div className="space-y-1.5 p-3 rounded-xl bg-surface-900 border border-white/10">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-white/70 uppercase tracking-wider flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    New Temporary Password *
                  </label>
                  <button
                    type="button"
                    onClick={() => setResetPasswordValue(generateSecurePassword(16))}
                    disabled={resetPwdSubmitting}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Regenerate
                  </button>
                </div>

                <div className="relative">
                  <input
                    id="input-reset-password"
                    type={showResetPasswordValue ? 'text' : 'password'}
                    placeholder="Enter strong temporary password"
                    value={resetPasswordValue}
                    onChange={e => setResetPasswordValue(e.target.value)}
                    disabled={resetPwdSubmitting}
                    className="input-field py-2 pr-16 text-xs font-mono"
                    required
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCopyCredential(resetPasswordValue, 'password')}
                      tabIndex={-1}
                      className="p-1 rounded text-white/40 hover:text-white"
                      title="Copy temporary password"
                    >
                      {copiedField === 'password' ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResetPasswordValue(prev => !prev)}
                      tabIndex={-1}
                      className="p-1 rounded text-white/40 hover:text-white"
                      title={showResetPasswordValue ? 'Hide password' : 'Show password'}
                    >
                      {showResetPasswordValue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <p className="text-[10px] text-white/40 leading-relaxed">
                  Strong generated password: min 8 characters, with letters, numbers, and symbols.
                </p>
              </div>

              <div className="pt-2 border-t border-white/5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowResetPwdModal(false)}
                  disabled={resetPwdSubmitting}
                  className="btn-secondary flex-1 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  id="btn-confirm-reset-password"
                  type="submit"
                  disabled={resetPwdSubmitting}
                  className="btn-primary flex-1 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 shadow-glow-amber flex items-center justify-center gap-1.5"
                >
                  {resetPwdSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Resetting Password...
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-3.5 h-3.5" />
                      Confirm Reset
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: One-Time Credential Display ───────────────── */}
      {oneTimeCredentials && (
        <div className="fixed inset-0 z-50 bg-surface-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-card p-6 space-y-4 animate-slide-up border-emerald-500/40 shadow-glow-green/20">
            <div className="flex items-center gap-3 border-b border-white/10 pb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {oneTimeCredentials.type === 'reset' ? 'Password Reset Successfully' : 'Employee Account Provisioned'}
                </h3>
                <p className="text-xs text-white/50">
                  {oneTimeCredentials.type === 'reset'
                    ? `New login credentials generated for ${oneTimeCredentials.name}`
                    : `Authentication account created for ${oneTimeCredentials.name}`}
                </p>
              </div>
            </div>

            {/* Warning Alert */}
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 space-y-1.5 leading-relaxed">
              <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  {oneTimeCredentials.type === 'reset'
                    ? 'Important: Previous Password Invalidated'
                    : 'One-Time Credential Notice'}
                </span>
              </div>
              {oneTimeCredentials.type === 'reset' ? (
                <p className="text-[11px] text-amber-200/90 leading-normal">
                  The previous password <strong>no longer works</strong>. This new temporary password will <strong>never be shown again</strong> and is not stored in plaintext anywhere. Closing this dialog requires another reset if the new password was not saved.
                </p>
              ) : (
                <p className="text-[11px] text-amber-200/80 leading-normal">
                  This password will <strong>never be shown again</strong> and is not stored in plaintext anywhere. Copy these credentials now to share securely with the employee. Closing this dialog requires another reset if the password was not saved.
                </p>
              )}
            </div>

            {/* Credential Details */}
            <div className="space-y-2.5 p-3.5 rounded-xl bg-surface-900 border border-white/10 text-xs font-mono">
              {/* Employee ID */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-white/40 block font-sans">Employee Login ID:</span>
                  <span className="text-emerald-400 font-bold">{oneTimeCredentials.employeeId}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyCredential(oneTimeCredentials.employeeId, 'id')}
                  className="btn-secondary py-1 px-2.5 text-[11px] flex items-center gap-1"
                >
                  {copiedField === 'id' ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedField === 'id' ? 'Copied' : 'Copy ID'}</span>
                </button>
              </div>

              {/* Password */}
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <div>
                  <span className="text-[10px] text-white/40 block font-sans">
                    {oneTimeCredentials.type === 'reset' ? 'New Temporary Password:' : 'Initial Password:'}
                  </span>
                  <span className="text-white font-bold select-all">{oneTimeCredentials.password}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyCredential(oneTimeCredentials.password, 'password')}
                  className="btn-secondary py-1 px-2.5 text-[11px] flex items-center gap-1"
                >
                  {copiedField === 'password' ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedField === 'password' ? 'Copied' : 'Copy Password'}</span>
                </button>
              </div>

              {/* Auth UID */}
              <div className="pt-2 border-t border-white/5">
                <span className="text-[10px] text-white/40 block font-sans">Firebase Auth UID:</span>
                <span className="text-[11px] text-white/60 truncate block">{oneTimeCredentials.uid}</span>
              </div>
            </div>

            {/* Buttons */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() =>
                  handleCopyCredential(
                    `Employee ID: ${oneTimeCredentials.employeeId}\nPassword: ${oneTimeCredentials.password}`,
                    'all'
                  )
                }
                className="w-full py-2 px-3 rounded-lg bg-surface-800 hover:bg-surface-700 border border-white/10 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-all"
              >
                {copiedField === 'all' ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedField === 'all' ? 'All Credentials Copied!' : 'Copy All Credentials'}</span>
              </button>

              <button
                type="button"
                onClick={handleCloseOneTimeCredentials}
                className="btn-primary w-full py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20"
              >
                I Have Saved The Credentials
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
