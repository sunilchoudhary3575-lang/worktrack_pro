# WorkTrack Pro

> Professional Employee Monitoring Desktop Suite — Two independent Windows desktop applications managed in a single monorepo.

---

## Project Structure

```
worktrack-pro/
├── apps/
│   ├── admin-app/          # Admin desktop application (Electron + React + Vite + TypeScript)
│   └── employee-app/       # Employee desktop application (Electron + React + Vite + TypeScript)
├── packages/
│   └── shared/             # Shared TypeScript types and interfaces
├── package.json            # Root workspace config
├── .gitignore
└── README.md
```

---

## Applications

### Admin App (`apps/admin-app`)
Installed on the **administrator's Windows desktop/laptop**. Provides:
- **Executive Dark Theme**: Slate/charcoal/indigo aesthetic with glassmorphism and custom frameless titlebar with window controls (Minimize, Maximize/Restore, Close).
- **Dashboard Overview**: Live stats on total employees, online devices, active sessions, and today's screenshots.
- **Live Monitoring Grid**: Visual status cards for all devices, with interactive "Live Watch" viewer modal requiring employee approval.
- **Employee Directory**: Searchable and filterable employee list with department, device mapping, and online/idle/offline status.
- **Screenshot Gallery**: Filter by employee and date, interactive lightbox with metadata and zoom.
- **Work Sessions**: Chronological session logs with durations, active/idle time, and device names.
- **Activity & Productivity Analytics**:
  - Hourly active vs idle area chart
  - Keystroke & mouse movement activity rhythm
  - Daily & weekly session summaries with CSV export and printable PDF preview
- **Application & Website Usage**: Top application time tracking and top domains visited with productivity scoring.
- **Remote Approvals & Alerts Queue**: Interactive approval management for access requests, overtime, privacy review/redactions, and off-track alerts.
- **Policy Settings**: Configurable screenshot interval, quality, data retention, tracking schedules, and privacy controls.

### Employee App (`apps/employee-app`)
Installed on each **employee's Windows desktop/laptop**. Provides:
- **Transparent & Trustworthy UI**: Dark emerald / neutral dark theme with custom frameless titlebar and window controls.
- **Device Registration**: First-run setup linking agent ID, employee ID, and machine hostname.
- **Work Session Control**: Clock In / Clock Out with real-time session duration counter.
- **Break Mode**: Pause tracking with reason selector (Lunch, Coffee, Offline Meeting, Personal).
- **Live Status Strips**: Real-time indicators showing session status, screenshot capture status, and screen share status.
- **Privacy Transparency Guarantee**: Expandable card outlining exactly what is monitored vs what is NEVER monitored (no passwords, no webcam, no off-hours).
- **Today's Summary**: Hours worked, productivity score (96%), active time vs idle/break time.
- **Recent Activity Feed**: Timeline showing recent events (captures, breaks, app activity).
- **Explicit Screen View Approval**: Mandatory modal requiring employee consent before any live screen view starts.
- **Instant Kill Switch**: "Stop Screen Sharing" button always accessible when sharing is active.
- **Desktop Notification Simulator**: In-app toast alerts for screenshot captures and idle notices.
- **System Tray Ready**: Minimize to system tray workflow.

---

## Quick Start

### Prerequisites
- Node.js >= 18
- npm >= 9

### Install dependencies
```bash
npm install
```

### Run Admin App (development)
```bash
npm run dev:admin
```

### Run Employee App (development)
```bash
npm run dev:employee
```

### Build Admin App (Windows installer)
```bash
npm run build:admin
```

### Build Employee App (Windows installer)
```bash
npm run build:employee
```

---

## Build Output
| Installer | Location |
|---|---|
| `WorkTrackPro-Admin-Setup.exe` | `apps/admin-app/dist/` |
| `WorkTrackPro-Employee-Setup.exe` | `apps/employee-app/dist/` |

---

## Development Phases

| Phase | Status | Description |
|---|---|---|
| Phase 1 | ✅ Complete | Project scaffold, UI foundations, mock data, shared types |
| Phase 2 | 🔜 Pending | Firebase integration (Auth, Firestore, Storage) |
| Phase 3 | 🔜 Pending | Real-time screen streaming (WebRTC / Firebase) |
| Phase 4 | 🔜 Pending | Production packaging and installer signing |

---

## Privacy & Ethics

- **No stealth monitoring** — all capture activity shows a visible indicator on the employee app.
- **Live screen sharing requires explicit employee approval** — the employee must actively approve each request.
- **Employee can stop sharing at any time** — a prominent Stop Sharing button is always accessible.
- **No keylogging, password collection, webcam or microphone capture.**
- **No hidden processes or background services without employee knowledge.**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop framework | Electron 28 |
| UI framework | React 18 |
| Build tool | Vite 5 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| Icons | Lucide React |
| Packaging | electron-builder |
| Monorepo | npm workspaces |

---

## Notes
- Firebase, PostgreSQL and any backend server are **not configured in Phase 1**.
- All data shown in Phase 1 is clearly labelled mock data.
- Data service layer is designed for clean Firebase drop-in in Phase 2.
