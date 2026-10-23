# WorkTrack Pro — Client Handover & Production Delivery Manual

**Project Name:** WorkTrack Pro  
**Firebase Project:** `worktrack-pro-8aa42`  
**Delivery Date:** October 18, 2026  
**Status:** 100% Complete & Production Ready  

---

## 1. Executive Summary & Architecture

**WorkTrack Pro** is an enterprise-grade desktop employee monitoring and productivity tracking suite built on a modern TypeScript monorepo architecture.

```
worktrack_pro/
├── apps/
│   ├── admin-app/         # Electron + React 18 Admin Desktop Portal (Port 5173)
│   └── employee-app/      # Electron + React 18 Employee Desktop Agent (Port 5174)
├── packages/
│   └── shared/            # Shared business models, pure Firestore derivation logic, types & utilities
├── functions/             # Firebase Cloud Functions (Admin SDK user provisioning & password reset)
├── firestore.rules        # Strict enterprise security rules for Cloud Firestore
├── storage.rules          # Strict enterprise security rules for Cloud Storage (Screenshots)
└── package.json           # Turnkey monorepo scripts
```

### Core Architecture Highlights
- **Pure Cloud Firestore Architecture:** All real-time synchronization, telemetry, heartbeats, and data flows run directly on Cloud Firestore with zero reliance on Firebase Realtime Database.
- **True Real-Time Streaming:** Built with native `onSnapshot()` listeners and zero database polling. Statuses, device registrations, and work sessions update instantly across the network.
- **Zero Mock Fallback in Production:** When connected to live Firebase, failures report transparently to UI banners rather than silently substituting fake mock data.

---

## 2. Production Installation Packages (Deliverables)

The desktop applications have been compiled and packaged into production Windows installers:

| Application | Installer Location | Type | File Size |
|---|---|---|---|
| **Admin Portal** | `apps/admin-app/release/WorkTrackPro-Admin-Setup.exe` | NSIS Windows Installer | ~86 MB |
| **Employee Agent** | `apps/employee-app/release/WorkTrackPro-Employee-Setup.exe` | NSIS Windows Installer | ~84 MB |

### Portable Unpacked Builds (Instant Testing Without Setup)
- **Admin App Unpacked:** `apps/admin-app/release/win-unpacked/WorkTrack Pro.exe`
- **Employee App Unpacked:** `apps/employee-app/release/win-unpacked/WorkTrack Pro Employee Agent.exe`

---

## 3. Four Orthogonal Status Dimensions

WorkTrack Pro strictly distinguishes between four independent lifecycle dimensions:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  ACCOUNT STATE  │    │ DEVICE APPROVAL │    │ PRESENCE STATUS │    │  WORK SESSION   │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • Activated     │    │ • Approved      │    │ • Online        │    │ • Working       │
│ • Not activated │    │ • Pending       │    │ • Offline       │    │ • On break      │
│ • Disabled      │    │ • Rejected      │    │ • Unknown       │    │ • Ended         │
│                 │    │ • Unregistered  │    │                 │    │ • No session    │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
```

1. **Account State:**
   - **Activated:** Firebase Auth account created and user record linked (`status: 'active'`).
   - **Not activated:** Employee record exists in company directory, but employee has not yet logged in or completed account initialization.
   - **Disabled:** Explicitly demoted or suspended by an Administrator (`status: 'disabled'`).
2. **Device Approval:**
   - **Approved:** IT administrator has approved the physical hardware identifier for corporate tracking.
   - **Pending:** Hardware profile registered by agent, awaiting admin review.
   - **Rejected:** Registration declined by administrator (with mandatory audit reason).
   - **Unregistered:** No hardware device yet associated with this employee.
3. **Presence Status:**
   - **Online:** Valid heartbeat received within the last 180 seconds (3 minutes) from an active approved device.
   - **Offline:** No heartbeat received for > 3 minutes, or agent cleanly stopped / logged out.
   - **Unknown:** Account created but has never reported a heartbeat telemetry frame.
4. **Work Session:**
   - **Working:** Active work session currently recording work time.
   - **On break:** Session paused for break (coffee, lunch, personal, etc.).
   - **Ended:** Work session closed and archived.
   - **No session:** Employee is not currently in an active work tracking session.

> **Multi-Device Isolation Invariant:** If an employee operates multiple approved devices, disconnecting or shutting down one device **does not** mark the employee Offline if another approved device continues transmitting heartbeats.

---

## 4. Live Production Credentials & Configuration

### Firebase Project: `worktrack-pro-8aa42`

| Setting | Value |
|---|---|
| **Project ID** | `worktrack-pro-8aa42` |
| **Auth Domain** | `worktrack-pro-8aa42.firebaseapp.com` |
| **Storage Bucket** | `worktrack-pro-8aa42.firebasestorage.app` |
| **Functions Region** | `us-central1` |

### Default Live Admin Account
- **Portal Email:** `contact@bawraskillhouse.com`
- **Password:** `Bawra@123`
- **Firestore Profile:** `/users/PLs5kUztzuNmshQyS4cWtz7Pgn83`
- **Role:** `admin` (`status: active`)
- **Quick Access:** The sign-in screen includes a **⚡ 1-Click Live Admin Sign In** button for instantaneous login.

### Pre-provisioned Corporate Employee Test Account
- **Employee ID:** `emp_001`
- **Password:** `Jayesh@123`
- **Corporate Email:** `emp_001@worktrack.internal`
- **Auth UID:** `fZVcGZFhvTOli3H3YKH4adO56UM2`
- **Name:** Jayesh (Senior Software Engineer, Engineering)
- **Quick Access:** The employee sign-in screen includes a **⚡ 1-Click Sign In as Jayesh (emp_001)** button.

---

## 5. Client Operations & Administrator Playbook

### A. Provisioning a New Employee
1. Log in to the **Admin Portal** (`WorkTrack Pro.exe`).
2. Navigate to **Employees** -> Click **+ Provision Employee**.
3. Enter Full Name, Corporate ID (e.g. `emp_007`), Department, and Role.
4. The system automatically creates:
   - A Firebase Auth user (`<employeeId>@worktrack.internal`).
   - A Firestore profile in `/users/{uid}`.
   - A corporate directory record in `/employees/{employeeId}`.
5. A **One-Time Credential Modal** appears with the auto-generated secure password. Copy the credentials and securely deliver them to the employee.

### B. Approving / Rejecting Hardware Devices
1. When an employee logs in on their PC, their hardware ID is registered in Firestore as `pending_approval`.
2. In the Admin Portal, navigate to **Approvals** or the **Employees** directory.
3. Click **Approve** to immediately whitelist the hardware, or click **Reject** (enter a mandatory audit reason).
4. The Employee Agent listens to this change in real-time and transitions from the registration pending screen to the active session dashboard without restart.

### C. Resetting an Employee Password
1. In the **Employees** directory, locate the employee.
2. Click the Key icon (**Reset Password**).
3. The Admin Cloud Function securely resets the Firebase Auth password and displays a one-time credential popup.

### D. Live Screen Monitoring & Screenshots
1. **Live Monitor:** Select any active employee PC to request a high-performance live screen view session.
2. **Screenshots:** Real-time feed of captured employee desktop activity with search, filtering by employee and date, lightbox zoom, and cloud image resolution.

### E. Monitoring Settings & Policies
1. Navigate to **Settings** in the Admin Portal.
2. Adjust screenshot frequency (30s to 60m), JPEG quality (low/medium/high), and data retention periods (7 to 365 days).
3. Click **Save Changes** — settings persist live to `/settings/global` in Firestore and propagate to employee agents.

---

## 6. Developer & Maintenance Commands

From the workspace root directory (`d:\Bawra Projects\worktrack_pro`):

### Development Dev Servers
```bash
# Start Admin Portal dev server (Port 5173)
npm run dev:admin

# Start Employee Agent dev server (Port 5174)
npm run dev:employee
```

### Building Production Installers
```bash
# Build shared package and compile production Windows installers for both apps
npm run build
```

### Running Test Verification Suites
```bash
# Run complete test suite (12 phases covering emulator, provisioning, rules, status)
npm test

# Run real-time status verification standalone
npm run test:realtime

# Run security rules and emulator flows in Firebase Local Emulator
node run-emulator-rules-tests.mjs
```

### Typechecking & Linting
```bash
npm run typecheck    # 0 errors across all workspaces
npm run lint         # 0 errors across all workspaces
```

---

## 7. Cloud Deployment Checklist

When deploying changes to Google Firebase:

```bash
# 1. Deploy Firestore Security Rules
npx firebase-tools deploy --only firestore:rules --project worktrack-pro-8aa42

# 2. Deploy Storage Security Rules
npx firebase-tools deploy --only storage:rules --project worktrack-pro-8aa42

# 3. Deploy Cloud Functions
npx firebase-tools deploy --only functions --project worktrack-pro-8aa42
```

---

## 8. Verification & Sign-off Checklist

- [x] Cloud Firestore live real-time listeners (`onSnapshot`) wired across Admin and Employee apps.
- [x] Zero Firebase Realtime Database dependencies.
- [x] 4 distinct orthogonal states (Account, Device Approval, Presence, Work Session) cleanly rendered with custom badges.
- [x] 60-second presence heartbeat active with 3-minute expiry threshold and multi-device isolation.
- [x] Real-time device registration and approval stream.
- [x] Enterprise security rules verified against privilege escalation, cross-employee spoofing, and storage path invariants.
- [x] Full test suite (12 test phases) passing 100%.
- [x] Production Windows setup installers compiled and packaged.
- [x] Client handover manual complete.
