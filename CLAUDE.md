# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StarBase Optimizer is a Chrome extension (Manifest V3) that automates workflows in Microsoft Dynamics 365 CRM for the StarBase support team. It runs exclusively on `https://starbase.crm4.dynamics.com/*`.

**Current Features:**
- Case 1: Automatically sets "First Response Sent" field to "Yes" when sending emails in support cases

## Development Environment

### Loading the Extension

1. Generate icons first time only:
   - Open `icons/generate-icons.html` in browser
   - Generate and save: `icon16.png`, `icon48.png`, `icon128.png`

2. Load in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project root directory

3. After code changes:
   - Go to `chrome://extensions/`
   - Click reload button on the extension
   - Refresh any open CRM tabs

### No Build System

This is vanilla JavaScript with no build process, bundler, or package manager. All files are loaded directly by the browser as specified in `manifest.json`.

### Debugging

All logging uses `console.log` with `[StarBase Optimizer]` prefix. Open Chrome DevTools (F12) on the CRM page to see:
- Extension initialization
- Case handler events
- Field updates
- Errors

Service worker logs are in `chrome://extensions/` → "Inspect views: service worker"

## Architecture

### Three-Layer Design

1. **Service Worker** (`background.js`)
   - Manages extension state (enabled/disabled) via `chrome.storage.sync`
   - Handles Chrome notifications
   - Broadcasts state changes to all CRM tabs

2. **Content Scripts** (injected into CRM pages)
   - **Utils Layer**: `observer.js`, `notifications.js` - reusable utilities
   - **Modules Layer**: `case1.js`, etc. - individual automation handlers
   - **Orchestration**: `content-script.js` - initializes everything

3. **Popup UI** (`popup.html`, `popup.js`, `popup.css`)
   - Toggle extension on/off
   - Shows current status

### Script Load Order (Critical)

Defined in `manifest.json` `content_scripts.js` array:
1. `utils/observer.js` - DOM utilities
2. `utils/notifications.js` - visual feedback
3. `modules/case1.js` - case handlers
4. `content-script.js` - main orchestrator

**This order must be maintained** - later scripts depend on earlier ones creating singleton instances.

### Iframe Communication Pattern

Dynamics 365 CRM runs the email composer in an iframe separate from the main case form. This requires cross-frame messaging:

- **Iframe context**: `case1Handler.watchSendButton()` detects send button clicks → sends `postMessage` to parent
- **Main window**: Receives message → updates the "First Response Sent" field

Both main window and iframes run the full content script (`all_frames: true` in manifest), but initialize differently based on `window.self !== window.top` check.

### Singleton Pattern

All utilities and handlers are singletons created at module load:
```javascript
const case1Handler = new Case1Handler();
const domObserver = new DOMObserver();
const notificationManager = new NotificationManager();
```

These are global and shared across the module that imports them.

### Initialization Flow

1. `content-script.js` loads and waits for page ready
2. Checks `chrome.storage.sync` for enabled state
3. If iframe: only watches send button
4. If main window:
   - Initializes `case1Handler.init()`
   - Sets up message listener for iframe events
   - Waits 3 seconds before marking initialized (prevents processing existing timeline items)

### DOMObserver Utility (`utils/observer.js`)

Provides:
- `waitForElement(selector, timeout)`: Returns promise that resolves when element appears
- `observeElement(element, callback, options)`: Watch for mutations on specific element
- `watchTimelineActivities(callback)`: Monitor CRM timeline for new activities

### NotificationManager Utility (`utils/notifications.js`)

Provides:
- In-page notifications: Animated overlays in top-right corner
- `success()`, `error()`, `info()`, `warning()` methods
- `sendChromeNotification()`: Sends OS-level notification via background worker

## Adding New Automation Cases

To add Case 2, Case 3, etc:

1. Create `modules/case2.js`:
   ```javascript
   class Case2Handler {
     constructor() {
       // Initialize properties
     }

     async init() {
       // Setup logic - wait for elements, attach listeners
     }
   }

   const case2Handler = new Case2Handler();
   ```

2. Add to `manifest.json` `content_scripts.js` array (before `content-script.js`):
   ```json
   "js": [
     "utils/observer.js",
     "utils/notifications.js",
     "modules/case1.js",
     "modules/case2.js",  // Add here
     "content-script.js"
   ]
   ```

3. Initialize in `content-script.js`:
   ```javascript
   if (isEnabled) {
     if (isInIframe) {
       case1Handler.watchSendButton();
       case2Handler.watchSomething();  // Add here
     } else {
       await case1Handler.init();
       await case2Handler.init();  // Add here
     }
   }
   ```

4. Update `popup.html` to list the new feature

## Key Implementation Details

### Field Selection and Manipulation

Dynamics 365 uses Fluent UI components. Fields are accessed via `data-id` attributes:
```javascript
const field = document.querySelector('[data-id="fieldname.fieldControl-option-set-select"]');
```

To change dropdown values:
1. Click/focus the dropdown button to open it (check `aria-expanded="true"`)
2. Find the option with `[role="option"]`
3. Click the option element

### Preventing Duplicate Processing

Case handlers use:
- `isProcessing` flag
- `lastEmailTime` timestamp
- `emailCooldown` period
- `initialized` flag (prevents processing existing UI elements on page load)

### Timing Considerations

- Wait 1000ms after page load before initializing
- Wait 3000ms after init before marking `initialized = true` (ignores pre-existing timeline items)
- Wait 3000ms after send button click before updating field (ensures email is sent)
- Wait 200-300ms intervals when checking if dropdowns opened

These delays are tuned for Dynamics 365 CRM's loading and rendering behavior.

## Common Issues

**Extension not working after code changes:**
- Reload extension in chrome://extensions/
- Refresh all CRM tabs
- Check DevTools console for errors

**Field selector not found:**
- Dynamics 365 may change `data-id` attributes between versions
- Use DevTools to inspect the actual field and update selectors
- Check console logs - code includes debug output for missing fields

**Iframe vs Main Window confusion:**
- Add `frameInfo` logging to identify context: `[IFRAME]` or `[MAIN WINDOW]`
- Email composer events happen in iframe
- Field updates happen in main window
- Use `postMessage` to bridge the gap

**Extension loads but doesn't activate:**
- Check `chrome.storage.sync` - extension may be disabled
- Click popup to verify enabled state
- Check that URL matches `https://starbase.crm4.dynamics.com/*`
