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

All logging uses `console.log` with appropriate prefixes. Open Chrome DevTools (F12) on the CRM page to see:
- Extension initialization
- Module registration and initialization
- Handler events
- Field updates
- Errors

Service worker logs are in `chrome://extensions/` → "Inspect views: service worker"

## Architecture

### Modular Architecture (NEW)

The extension now uses a **self-registering module system** that makes adding new features trivial:

1. **Core Utilities** (loaded first):
   - `utils/base-handler.js` - Base class for all handlers
   - `utils/field-utils.js` - Reusable Dynamics 365 field operations
   - `utils/message-router.js` - Cross-frame messaging abstraction
   - `utils/observer.js` - DOM observation utilities
   - `utils/notifications.js` - Visual feedback system
   - `utils/module-registry.js` - Module discovery and initialization

2. **Handler Modules** (self-register):
   - `modules/case1.js` - Extends BaseHandler, self-registers with registry
   - `modules/case2.js` - (Future) Just create the file, it auto-registers
   - Each module extends BaseHandler and calls `moduleRegistry.register()`

3. **Orchestration**:
   - `content-script.js` - Calls `moduleRegistry.initializeAll()` - that's it!
   - No manual registration needed in content-script.js

4. **UI**:
   - `popup.html/js/css` - Per-feature toggles, automatically populated

### Script Load Order (Critical)

Defined in `manifest.json` `content_scripts.js` array:
1. `utils/base-handler.js` - Must load first (base class)
2. `utils/field-utils.js` - Standalone utility
3. `utils/message-router.js` - Standalone utility
4. `utils/observer.js` - DOM utilities
5. `utils/notifications.js` - Visual feedback
6. `utils/module-registry.js` - Must load before handlers
7. `modules/case1.js` - (and all case handlers)
8. `content-script.js` - Main orchestrator (loads last)

**This order must be maintained** - handlers depend on base class and utilities.

### Module Registry System

All handlers self-register on load. The registry:
- Auto-discovers all registered modules
- Initializes enabled modules based on user settings
- Supports per-module enable/disable
- Provides initialization context (isIframe)
- Handles errors gracefully

### Base Handler Pattern

All case handlers extend `BaseHandler` which provides:
- Cooldown protection via `executeWithCooldown()`
- Consistent initialization interface: `async init(context)`
- Standard lifecycle: `destroy()`
- Built-in error handling
- Message handling: `handleMessage(data)`

### Field Utils

Reusable utilities for Dynamics 365 Fluent UI:
- `getDropdownValue(selector)` - Get current dropdown value
- `setDropdownValue(selector, value, variants)` - Set dropdown (handles opening, finding options, clicking)
- `setTextValue(selector, value)` - Set text field
- `clickButton(selector)` - Click button
- `setCheckbox(selector, checked)` - Set checkbox state

This eliminates 80+ lines of boilerplate per handler.

### Message Router

Abstracts iframe/main window communication:
- `messageRouter.on(eventType, handler)` - Register listener
- `messageRouter.sendToMain(eventType, data)` - Send from iframe to main
- `messageRouter.sendToIframes(eventType, data)` - Send from main to iframes
- `messageRouter.broadcast(eventType, data)` - Send to all

Replaces manual `postMessage` boilerplate.

### Iframe Communication Pattern

Dynamics 365 runs email composer in iframe:

**In iframe:**
```javascript
// Detect event (e.g., send button click)
messageRouter.sendToMain('EMAIL_SENT', { timestamp: Date.now() });
```

**In main window:**
```javascript
// Register handler
messageRouter.on('EMAIL_SENT', async (data) => {
  await this.updateField();
});
```

Both contexts run full content script (`all_frames: true`), but `context.isIframe` differentiates behavior.

## Adding New Automation Cases

### Simple 3-Step Process

1. **Create handler file** `modules/case2.js`:

```javascript
class Case2Handler extends BaseHandler {
  constructor() {
    super({ id: 'case2', cooldownTime: 2000 });
  }

  async init(context) {
    if (context.isIframe) {
      // iframe-specific setup
    } else {
      // main window setup
      messageRouter.on('SOME_EVENT', (data) => {
        this.handleEvent(data);
      });
    }
    this.initialized = true;
  }

  async handleEvent(data) {
    await this.executeWithCooldown(async () => {
      // Use field utils
      await fieldUtils.setDropdownValue(
        '[data-id="somefield.fieldControl-option-set-select"]',
        'Value',
        ['Value', 'value', '1']
      );

      notificationManager.success('Done!', 3000);
    });
  }
}

// Self-register
moduleRegistry.register({
  id: 'case2',
  name: 'My New Feature',
  description: 'What it does',
  handler: new Case2Handler()
});
```

2. **Add to manifest.json** `content_scripts.js` array (before `content-script.js`):
```json
"modules/case2.js",
```

3. **Add to popup.js** modules array:
```javascript
{
  id: 'case2',
  name: 'My New Feature',
  description: 'What it does'
}
```

That's it! The module will:
- Auto-initialize on page load
- Appear in popup with individual toggle
- Support enable/disable without reload
- Use shared utilities (field ops, messaging, cooldown)

## Key Implementation Details

### Field Selection and Manipulation

Dynamics 365 uses Fluent UI components. Use `fieldUtils`:

```javascript
// Get value
const value = await fieldUtils.getDropdownValue('[data-id="field.fieldControl-option-set-select"]');

// Set value
await fieldUtils.setDropdownValue(
  '[data-id="field.fieldControl-option-set-select"]',
  'Yes',
  ['Yes', 'Ja', '1']  // variants to try
);
```

### Preventing Duplicate Processing

Use `executeWithCooldown()` from BaseHandler:
```javascript
await this.executeWithCooldown(async () => {
  // Your action here
  // Automatically protected by cooldown + isProcessing flag
});
```

### Timing Considerations

- Wait 1000ms after page load before initializing (allows CRM to load)
- Wait 2-3 seconds after init before marking `initialized = true` (ignores existing UI elements)
- Wait 3000ms after send button click before updating field (ensures email sent)
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
- Check console logs - field-utils includes debug output

**Module not initializing:**
- Check console for registration message: `[ModuleRegistry] Registered module: ...`
- Verify module is in manifest.json in correct position
- Check that BaseHandler is loaded first
- Look for initialization errors in console

**Per-feature toggle not working:**
- Module ID in popup.js must match ID in handler registration
- Check chrome.storage permissions
- Look for errors in popup console (right-click popup → Inspect)

**Iframe vs Main Window confusion:**
- Add logging: `context.isIframe ? '[IFRAME]' : '[MAIN]'`
- Email composer events happen in iframe
- Field updates happen in main window
- Use messageRouter for communication

## Performance Notes

- Singleton pattern used throughout (all utils are global instances)
- Cooldown protection prevents duplicate processing
- Module registry caches enabled state
- Field utils reuse common operations
- Message router handles origin validation

## Code Reduction Achieved

### Before refactoring:
- Case 1: 446 lines
- Manual manifest.json updates for each module
- Manual content-script.js updates
- Duplicate field manipulation code

### After refactoring:
- Case 1: 257 lines (43% reduction)
- No manifest.json handler registration needed
- No content-script.js updates needed
- Reusable field operations

**Adding Case 2:**
- Before: ~400+ lines (reimplementing everything)
- After: ~100 lines (using utilities)
