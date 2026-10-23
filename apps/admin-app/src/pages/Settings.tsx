import { useState, useEffect } from 'react'
import { Save, RotateCcw, Clock, Shield, Calendar, Database, CheckCircle, Sun, Moon } from 'lucide-react'
import { dataService } from '../services/dataService'
import type { MonitoringSettings } from '@worktrack-pro/shared'
import { useTheme } from '../context/ThemeContext'

const DAY_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
]

export default function Settings() {
  const { theme, setTheme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [settings, setSettings] = useState<MonitoringSettings | null>(null)

  useEffect(() => {
    dataService.getSettings().then(s => { setSettings(s); setLoading(false) })
  }, [])

  const toggleDay = (day: string) => {
    if (!settings) return
    const days = settings.schedule.enabledDays
    const next = days.includes(day as any)
      ? days.filter(d => d !== day)
      : [...days, day as any]
    setSettings({ ...settings, schedule: { ...settings.schedule, enabledDays: next } })
  }

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    await dataService.updateSettings(settings)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading || !settings) {
    return <div className="shimmer rounded-2xl h-96 animate-fade-in" />
  }

  return (
    <div className="max-w-2xl space-y-5 animate-fade-in">
      {/* Theme / Appearance Settings */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Sun className="w-4 h-4 text-amber-400" />
          <h2 className="section-title">Appearance & Theme</h2>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">
            Admin Console Mode
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              id="theme-select-dark"
              onClick={() => setTheme('dark')}
              className={`flex-1 py-3 px-4 rounded-xl text-xs font-medium border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                theme === 'dark'
                  ? 'bg-brand-600 text-white border-brand-500 shadow-glow-brand font-semibold'
                  : 'bg-surface-700/60 border-white/10 text-white/70 hover:text-white hover:bg-surface-700'
              }`}
            >
              <Moon className="w-4 h-4 text-indigo-400" />
              <span>Dark Mode</span>
            </button>
            <button
              type="button"
              id="theme-select-light"
              onClick={() => setTheme('light')}
              className={`flex-1 py-3 px-4 rounded-xl text-xs font-medium border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                theme === 'light'
                  ? 'bg-brand-600 text-white border-brand-500 shadow-glow-brand font-semibold'
                  : 'bg-surface-700/60 border-white/10 text-white/70 hover:text-white hover:bg-surface-700'
              }`}
            >
              <Sun className="w-4 h-4 text-amber-400" />
              <span>Light Mode</span>
            </button>
          </div>
          <p className="text-[11px] text-white/60 pt-1">
            Toggle between high-contrast Dark Mode and modern Light Mode across the entire executive admin console.
          </p>
        </div>
      </div>

      {/* Screenshot interval */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-4 h-4 text-brand-400" />
          <h2 className="section-title">Screenshot Settings</h2>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">
            Screenshot Interval
          </label>
          <div className="flex items-center gap-3">
            <input
              id="screenshot-interval"
              type="range"
              min={30}
              max={3600}
              step={30}
              value={settings.screenshotIntervalSeconds}
              onChange={e => setSettings({ ...settings, screenshotIntervalSeconds: +e.target.value })}
              className="flex-1 accent-brand-500"
            />
            <span className="text-sm font-mono text-white w-20 text-right">
              {settings.screenshotIntervalSeconds >= 60
                ? `${Math.floor(settings.screenshotIntervalSeconds / 60)}m ${settings.screenshotIntervalSeconds % 60}s`
                : `${settings.screenshotIntervalSeconds}s`}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">Quality</label>
          <div className="flex gap-2">
            {(['low', 'medium', 'high'] as const).map(q => (
              <button
                key={q}
                id={`quality-${q}`}
                onClick={() => setSettings({ ...settings, screenshotQuality: q })}
                className={`flex-1 py-2 rounded-xl text-sm font-medium capitalize border transition-all ${
                  settings.screenshotQuality === q
                    ? 'bg-brand-600 text-white border-brand-500 shadow-sm font-semibold'
                    : 'bg-surface-700/80 border-white/10 text-white/70 hover:text-white'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-4 h-4 text-accent-400" />
          <h2 className="section-title">Monitoring Schedule</h2>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">Active Days</label>
          <div className="flex gap-2">
            {DAY_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                id={`day-${key}`}
                onClick={() => toggleDay(key)}
                className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${
                  settings.schedule.enabledDays.includes(key as any)
                    ? 'bg-brand-600 text-white border-brand-500 shadow-sm font-semibold'
                    : 'bg-surface-700/80 border-white/10 text-white/70 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Start Time</label>
            <input
              id="schedule-start"
              type="time"
              value={settings.schedule.startTime}
              onChange={e => setSettings({ ...settings, schedule: { ...settings.schedule, startTime: e.target.value } })}
              className="input-field"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-white/50 uppercase tracking-wider">End Time</label>
            <input
              id="schedule-end"
              type="time"
              value={settings.schedule.endTime}
              onChange={e => setSettings({ ...settings, schedule: { ...settings.schedule, endTime: e.target.value } })}
              className="input-field"
            />
          </div>
        </div>
      </div>

      {/* Data retention */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Database className="w-4 h-4 text-warning-400" />
          <h2 className="section-title">Data Retention</h2>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
            Keep screenshots for
          </label>
          <div className="flex items-center gap-3">
            <input
              id="retention-days"
              type="range"
              min={7}
              max={365}
              step={7}
              value={settings.dataRetentionDays}
              onChange={e => setSettings({ ...settings, dataRetentionDays: +e.target.value })}
              className="flex-1 accent-warning-500"
            />
            <span className="text-sm font-mono text-white w-16 text-right">
              {settings.dataRetentionDays}d
            </span>
          </div>
        </div>
      </div>

      {/* Privacy */}
      <div className="glass-card p-6 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-4 h-4 text-success-400" />
          <h2 className="section-title">Privacy & Consent</h2>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-xl bg-success-500/10 border border-success-500/20">
          <CheckCircle className="w-4 h-4 text-success-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-success-300">Employee Approval Required for Live View</p>
            <p className="text-xs text-white/40 mt-0.5">
              This setting is permanently enforced and cannot be disabled.
              Every live screen view requires explicit employee consent.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl bg-surface-700/50">
          <span className="text-sm text-white/70">Live Screen Viewing</span>
          <button
            id="toggle-live-view"
            onClick={() => setSettings({ ...settings, enableLiveScreenView: !settings.enableLiveScreenView })}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              settings.enableLiveScreenView ? 'bg-brand-600' : 'bg-surface-600'
            }`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              settings.enableLiveScreenView ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          id="save-settings"
          onClick={handleSave}
          disabled={saving}
          className={`btn-primary ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </button>
        <button
          id="reset-settings"
          onClick={() => dataService.getSettings().then(setSettings)}
          className="btn-secondary"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        <p className="text-xs text-white/30 ml-2">
          ⚠ Phase 1: Settings saved to mock service only
        </p>
      </div>
    </div>
  )
}
