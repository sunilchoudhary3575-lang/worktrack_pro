# WorkTrack Pro — macOS Employee App Production Build Guide

This guide explains how to build, run, and test the production macOS version of the Employee App.

---

## 1. Prerequisites on macOS

Make sure the Mac machine has:
1. **Node.js** (v18.x or v20.x recommended)
2. **Xcode Command Line Tools**:
   ```bash
   xcode-select --install
   ```

---

## 2. Testing in Development Mode on Mac

Before generating the final installer, you can test the native Mac application directly:

```bash
# In the root repository directory
npm install
npm run dev:employee
```
* The native macOS window will open.
* Login with the employee credentials.
* Check that session starts and events sync to the Admin Panel.

---

## 3. Building Production App (`.dmg` & `.zip`)

To package the production installer on macOS:

### Option A: From root directory
```bash
npm run build:employee:mac
```

### Option B: Directly from `apps/employee-app`
```bash
cd apps/employee-app
npm run build:mac
```

### Build Artifacts Output
The generated production packages will be placed in:
`apps/employee-app/release-mac/`
- `WorkTrackPro-Employee-Mac-arm64.dmg` (For Apple Silicon: M1, M2, M3, M4 Macs)
- `WorkTrackPro-Employee-Mac-x64.dmg` (For Intel Macs)
- `.zip` archives for standalone distribution.

---

## 4. Crucial macOS Permission Setup (Screen Recording)

macOS enforces strict Transparency, Consent, and Control (TCC) rules.

### For Screen Capture & Monitoring:
1. When the app first attempts to take a screenshot or track windows, macOS will display a permission prompt.
2. If not prompted automatically, open:
   **System Settings → Privacy & Security → Screen Recording**
3. Ensure **WorkTrack Pro Employee** is toggled **ON** (enabled).
4. Restart the app if prompted by macOS.

---

## 5. macOS Gatekeeper (Unsigned App Troubleshooting)

If distributing without an Apple Developer certificate:
1. macOS Gatekeeper may show: *"WorkTrack Pro cannot be opened because Apple cannot check it for malicious software"*.
2. Right-click the application in `/Applications` and select **Open**, then click **Open** in the dialog.
3. Or run this one-time command in Mac Terminal to remove the quarantine flag:
   ```bash
   xattr -cr /Applications/"WorkTrack Pro Employee.app"
   ```

