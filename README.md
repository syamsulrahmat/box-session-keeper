# Box Session Keeper & Auto-Login

> A lightweight Chromium extension and Tampermonkey userscript that prevents Box idle logouts, isolates deep folder paths per tab, and auto-restores sessions seamlessly.

---

## ✨ Features

* **Silent Keep-Alive Heartbeat:** Sends a non-destructive background ping every 3 minutes to keep Box's session active, preventing the annoying ~10-minute idle logout during work.
* **Drag-and-Drop & Upload Protection:** Automatically freezes background activity whenever files are dragged into the browser or uploaded, guaranteeing zero flickering or disrupted uploads.
* **Per-Tab Deep Folder Memory:** Each tab isolates its own folder or file link using `sessionStorage` and `window.name`. If you have multiple Box tabs open in different folders, they will never collide or overwrite each other upon reload.
* **Seamless Login Overlay:** Conceals the raw login form behind a clean *"Resuming Box Session..."* screen.
* **Progressive Watchdog:** If Box validates session cookies via AJAX without moving the frontend page, the script force-routes to the destination folder after 3.2s, with a hard reload fallback at 5.2s and an absolute failsafe at 6.5s.
* **2FA & Authentication Challenge Guard:** Instantly detects two-factor authentication (SMS, TOTP, email codes) or CAPTCHAs, halting auto-submission and revealing the page so you can enter your verification code safely.
* **Clean Popup Settings:** Easy ON/OFF toggle switch with local credential storage—no need to touch any code files.

---

## 🚀 Installation

### Option 1: Chrome / Microsoft Edge Extension (Recommended)

1. Clone or download this repository to your computer:
   ```bash
   git clone https://github.com/syamsulrahmat/box-session-keeper.git
   ```
2. Open your browser and navigate to:
   * **Chrome:** `chrome://extensions`
   * **Edge:** `edge://extensions`
3. Toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked** (top-left).
5. Select the `box-auto-login` folder.
6. Click the extension icon in your browser toolbar to enter your Box email, password, and toggle it **ON**.

---

### Option 2: Tampermonkey Userscript

If you prefer using Tampermonkey or Violentmonkey:
1. Install [Tampermonkey](https://www.tampermonkey.net/) from your browser's store.
2. Open `box-userscript.user.js` in this repository (or create a new script in Tampermonkey).
3. Replace the `BOX_EMAIL` and `BOX_PASSWORD` placeholders with your Box credentials.
4. Save the script (**Ctrl + S**).

---

## 🔒 Security & Privacy

* Credentials entered in the extension popup are stored exclusively in your browser's local sandbox storage (`chrome.storage.local`).
* No data or credentials are ever sent to third-party servers. All operations occur strictly between your browser and `box.com`.

---

## 📄 License

MIT License. Feel free to use and modify for your office or personal workflow.
