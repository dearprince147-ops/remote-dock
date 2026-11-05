# RemoteDock

<p align="center">
  <strong>Browse, preview, manage, and transfer files on remote devices over SSH/SFTP or ADB with a sleek, high-performance desktop interface.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.2-brightgreen.svg" alt="Version 1.0.2" />
  <img src="https://img.shields.io/badge/platform-Windows-blue.svg" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License" />
  <img src="https://img.shields.io/badge/Electron-45-informational.svg" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-blue.svg" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue.svg" alt="TypeScript" />
</p>

<p align="center">
  <img src="screenshot.png" alt="RemoteDock Interface" width="850" />
</p>

---

## What's new in 1.0.2

### In-app file previews

Double-clicking a file no longer starts a download. It opens a preview window instead:

- **Images** (JPG, PNG, GIF, WebP, BMP, AVIF, SVG and more) render directly in the app.
- **Videos** (MP4, WebM, MOV, MKV and more, subject to codec support) play in a native video player with seeking.
- **Audio** files play in an inline audio player.
- **Text files** (TXT, Markdown, JSON, logs, source code, config files, CSV and more) open in a readable monospace view with Unicode support.
- **Unsupported or binary files** show a clear message instead of opening a download.

Everything is streamed on demand from the remote device. A preview never creates a transfer, never writes to your Downloads folder, and never leaves a `.part` file. The preview footer always offers an explicit **Download** button if you do want to save the file.

### Grid thumbnails

Grid view now shows real thumbnails:

- **Images** are resized on demand in the main process and cached in memory, so large photo folders stay responsive.
- **Videos** show their first frame using the built-in media pipeline.
- Unsupported images or codecs fall back to the normal file icon.
- Thumbnails are served through a private `remotedock-preview://` stream that supports HTTP range requests, so video seeking works without buffering the entire file.

### Also included in this release

- Clearer SSH connection errors for missing key files, wrong passphrases, invalid key formats, host-key failures, and key-exchange problems.
- `~` expansion for SSH private-key paths.
- Existing transfer, queue, resume, hash-verification, settings, and saved-connection features are unchanged.

---

## Overview

**RemoteDock** is a modern desktop file manager for developers, power users, and sysadmins who work across physical devices. Whether you are managing files on an Android phone, a Raspberry Pi on your local network, or a remote Linux server, RemoteDock provides a unified, responsive interface without command-line tools or slow MTP connections.

RemoteDock natively supports two protocols:

1. **ADB (Android Debug Bridge):** Direct access to Android filesystems over USB or Wi-Fi, with ADB binaries bundled.
2. **SSH / SFTP (Secure File Transfer Protocol):** Encrypted remote filesystem access to Linux, Unix, macOS, and Termux environments.

---

## Screenshots

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>Device Manager (ADB &amp; SSH)</strong></td>
      <td align="center"><strong>File Explorer &amp; Transfers Drawer</strong></td>
    </tr>
    <tr>
      <td><img src="devices-final.png" width="420" alt="Device Connection Screen" /></td>
      <td><img src="explorer-final.png" width="420" alt="Explorer Screen" /></td>
    </tr>
  </table>
</div>

---

## How preview works

RemoteDock uses a custom Electron protocol (`remotedock-preview://`) registered in the main process:

- Every media request includes the device ID and remote path.
- The main process looks up the connected provider, verifies the file, and streams it back in chunks.
- `Range` requests are honored for video playback and seeking.
- Image thumbnails are generated with Electron's native image pipeline and cached in memory (up to 240 entries).
- Text previews read only the first 512 KB and report when the file was truncated.
- Nothing is written to local disk during preview. The only way a file is saved is through the explicit **Download** action.

---

## Key Features

### High-performance file explorer

- **Dual view modes:** toggle between a virtual list and a thumbnail grid.
- **Virtual scrolling:** powered by `@tanstack/react-virtual`, smooth even in folders with tens of thousands of files.
- **Quick links:** Home, Root, Internal Storage, Downloads, Pictures, DCIM Camera, Movies, and Music.
- **Breadcrumb navigation:** clickable path segments with a direct path input.
- **Sorting and filtering:** sort by name, size, or modified date; filter the current folder; toggle hidden files.
- **Context actions:** preview, download, download to a chosen folder, upload, new folder, rename, delete, and copy path.
- **Per-device state:** each device keeps its own path, selection, filter, and history.

### Resumable transfer engine

- **Bi-directional transfers:** upload files and folders, or download from the device.
- **Automatic resume (`.part` files):** interrupted or paused transfers resume from the exact byte offset.
- **Live speed and ETA metering:** switchable between `MB/s` and `Mbps`.
- **Bandwidth throttling:** cap transfer speed to avoid saturating the network.
- **Concurrency controls:** 1 to 8 parallel transfers.
- **Conflict policies:** rename, overwrite, or skip existing destination files.
- **Hash verification:** optional SHA-256 verification after each transfer.
- **Transfers drawer:** monitor active, queued, paused, completed, and failed jobs.

### Device and credential management

- **Dual SSH authentication:** password or OpenSSH private key with optional passphrase.
- **Saved connections:** one-click reconnect with encrypted credentials.
- **Auto-reconnect:** exponential backoff when Wi-Fi or SSH drops.
- **Known-hosts manager:** review and remove trusted host fingerprints.
- **Live ADB detection:** USB devices appear automatically; Wi-Fi debugging is supported.

### Clean, modern interface

- Dark-only UI with customizable accent colors.
- Confirmation guards for destructive actions.
- Keyboard navigation and accessible focus rings.

---

## Getting Started

### Option A: Install the setup executable (recommended)

1. Open the **[Releases](https://github.com/dearprince147-ops/remote-dock/releases)** tab.
2. Download `RemoteDock-Setup-1.0.2.exe`.
3. Run the installer. It upgrades an existing RemoteDock installation in place and keeps your settings, known hosts, and saved connections.

### Option B: Run from source

#### Prerequisites

- [Node.js](https://nodejs.org/) v20 or newer
- npm v10 or newer
- Windows 10/11 (64-bit)

#### Build and run

```bash
git clone https://github.com/dearprince147-ops/remote-dock.git
cd remote-dock

# Install dependencies (also provisions the bundled ADB binaries)
npm install

# Start the app in development mode
npm run dev
```

#### Build the installer

```bash
npm run typecheck
npm test
npm run dist
```

The NSIS installer is written to `release/RemoteDock-Setup-<version>.exe`.

---

## Connection Guides

### Connect to Android over ADB

1. **Enable Developer Options:** Settings > About Phone > tap **Build Number** seven times.
2. **Enable USB debugging:** Settings > Developer Options > **USB Debugging**.
3. **Connect by USB:** plug the phone in and accept the **Allow USB debugging** prompt. RemoteDock detects it automatically.
4. **Or use Wi-Fi debugging:** enable **Wireless Debugging**, then enter the phone's IP address and port in the ADB tab and click **Connect**.

### Connect over SSH / SFTP

1. Open the **SSH / SFTP** tab.
2. Enter the host, port, username, and authentication method.
   - Linux/Raspberry Pi usually uses port `22`.
   - Termux usually uses port `8022`.
3. Choose **Password** or browse for an OpenSSH private key. `~/` paths are expanded automatically.
4. Optionally enable **Save this connection**, then click **Connect**.
5. Approve the host-key fingerprint the first time you connect.

> **Termux tip:** if your shell startup file prints a banner, SFTP may fail. Set `Subsystem sftp internal-sftp` in `$PREFIX/etc/ssh/sshd_config`, then restart `sshd`.

---

## Architecture and Security

- **Sandboxed renderer:** the UI has no Node.js access. All filesystem and device operations go through a typed preload IPC bridge.
- **Streaming transfers:** files move in controlled 256 KB chunks, so large transfers do not buffer whole files in memory.
- **Streaming previews:** media is served through a registered custom protocol with range support; text previews are capped at 512 KB.
- **Encrypted secrets:** stored SSH passwords and passphrases are encrypted with the OS key store.
- **Host-key verification:** SHA-256 fingerprints are stored per host and checked on every SSH connection.

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| Double-click a file | Preview it in the app |
| Double-click a folder | Open the folder |
| `F5` | Refresh the current folder |
| `Ctrl + H` | Toggle hidden files |
| `Ctrl + Shift + N` | Create a new folder |
| `F2` | Rename the selected item |
| `Delete` | Delete the selected item |
| `Ctrl + D` | Download the selection |
| `Ctrl + U` | Upload files |
| `Backspace` / `Alt + Up` | Go to the parent folder |
| `Alt + Left` / `Alt + Right` | Navigate history |
| `Ctrl + F` | Filter the current folder |
| `Esc` | Close the preview or clear the selection |

---

## Tech Stack

- **Framework:** [Electron 45](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- **Frontend:** [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **State management:** [Zustand 5](https://github.com/pmndrs/zustand)
- **Virtualization:** [@tanstack/react-virtual](https://tanstack.com/virtual/latest)
- **Icons:** [Lucide](https://lucide.dev/)
- **SSH and SFTP:** [ssh2](https://github.com/mscdex/ssh2)
- **Packaging:** [electron-builder](https://www.electron.build/) (NSIS x64)

---

## Contributing

1. Fork the repository.
2. Create a branch: `git checkout -b feature/amazing-feature`.
3. Commit your changes.
4. Push the branch and open a pull request.

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.
