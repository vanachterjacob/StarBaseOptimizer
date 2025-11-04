# Refactoring Opportunities

This document outlines architectural improvements to make adding new use cases (features) easier and more maintainable.

## Current Architecture Issues

### 1. Manual Module Registration
**Problem:** Each new case requires manual updates in multiple places:
- Add to `manifest.json` content_scripts array
- Import and initialize in `content-script.js`
- Add to `popup.html` features list

**Impact:** Error-prone, easy to forget a step, not scalable

### 2. No Standardized Interface
**Problem:** Case handlers follow convention but no enforced contract:
- Each case implements its own `init()` method differently
- No standard lifecycle hooks
- Inconsistent error handling

### 3. Hardcoded Iframe Logic
**Problem:** Each case must handle iframe/main window communication:
- Duplicate `postMessage` boilerplate
- Each case checks `window.self !== window.top`
- No abstraction for cross-frame events

### 4. Duplicated Field Manipulation
**Problem:** Dynamics 365 field operations will be repeated across cases:
- Opening dropdowns
- Clicking options
- Waiting for UI state changes
- Finding fields by data-id

**Evidence:** See `case1.js:300-393` - 93 lines just to set one dropdown field

### 5. All-or-Nothing Toggle
**Problem:** Users can only enable/disable the entire extension, not individual features

**Impact:** Can't selectively use features or disable problematic ones

---

## Recommended Refactoring

### 1. Module Registry System

**Create:** `utils/module-registry.js`

```javascript
class ModuleRegistry {
  constructor() {
    this.modules = new Map();
  }

  /**
   * Register a case handler module
   * @param {Object} config - Module configuration
   */
  register(config) {
    const { id, name, description, handler, enabled = true } = config;

    if (!id || !handler) {
      throw new Error('Module must have id and handler');
    }

    this.modules.set(id, {
      id,
      name,
      description,
      handler,
      enabled,
      initialized: false
    });

    console.log(`[ModuleRegistry] Registered module: ${name}`);
  }

  /**
   * Initialize all enabled modules
   */
  async initializeAll(context) {
    const settings = await chrome.storage.sync.get(['enabledModules']);
    const enabledModules = settings.enabledModules || {};

    for (const [id, module] of this.modules) {
      // Check if module is enabled (default to true for backward compatibility)
      const isEnabled = enabledModules[id] !== false;

      if (isEnabled) {
        try {
          console.log(`[ModuleRegistry] Initializing ${module.name}...`);
          await module.handler.init(context);
          module.initialized = true;
        } catch (error) {
          console.error(`[ModuleRegistry] Failed to initialize ${module.name}:`, error);
        }
      }
    }
  }

  /**
   * Get all registered modules for UI display
   */
  getModules() {
    return Array.from(this.modules.values());
  }

  /**
   * Handle message for a specific module
   */
  async handleMessage(moduleId, message) {
    const module = this.modules.get(moduleId);
    if (module && module.handler.handleMessage) {
      return await module.handler.handleMessage(message);
    }
  }
}

const moduleRegistry = new ModuleRegistry();
```

**Update:** `modules/case1.js` to self-register:

```javascript
class Case1Handler {
  constructor() {
    this.fieldSelector = '[data-id="firstresponsesent.fieldControl-option-set-select"]';
    this.isProcessing = false;
    this.lastEmailTime = 0;
    this.emailCooldown = 2000;
    this.initialized = false;
  }

  async init(context) {
    console.log('[Case 1] Initializing...');

    if (context.isIframe) {
      this.watchSendButton();
      setTimeout(() => {
        this.initialized = true;
      }, 2000);
    } else {
      await domObserver.waitForElement('[data-id^="firstresponsesent"]', 15000);
      this.watchForEmailSends();
      setTimeout(() => {
        this.initialized = true;
      }, 3000);
    }
  }

  // ... rest of methods
}

// Self-register the module
if (typeof moduleRegistry !== 'undefined') {
  moduleRegistry.register({
    id: 'case1',
    name: 'Auto-set First Response Sent',
    description: 'Automatically sets "First Response Sent" to "Yes" when sending emails',
    handler: new Case1Handler()
  });
}
```

**Update:** `content-script.js` to use registry:

```javascript
(function() {
  'use strict';

  const isInIframe = window.self !== window.top;
  let isInitialized = false;

  async function initialize() {
    if (isInitialized) return;

    const result = await chrome.storage.sync.get(['enabled']);
    const isEnabled = result.enabled !== false;

    if (isEnabled) {
      const context = { isIframe: isInIframe };
      await moduleRegistry.initializeAll(context);

      if (!isInIframe) {
        notificationManager.info('StarBase Optimizer is active', 2000);
      }
    }

    isInitialized = true;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOGGLE_ENABLED') {
      // Handle toggle
    }
    return true;
  });

  function waitForPageReady() {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(initialize, 1000);
    } else {
      window.addEventListener('load', () => setTimeout(initialize, 1000));
    }
  }

  waitForPageReady();
})();
```

**Benefits:**
- Add new case by just creating the file - it self-registers
- No more manual manifest.json updates beyond adding the script path
- No more editing content-script.js
- Central initialization logic

---

### 2. Base Handler Class

**Create:** `utils/base-handler.js`

```javascript
class BaseHandler {
  constructor(config = {}) {
    this.id = config.id || this.constructor.name;
    this.isProcessing = false;
    this.initialized = false;
    this.cooldownTime = config.cooldownTime || 2000;
    this.lastActionTime = 0;
  }

  /**
   * Initialize the handler - must be implemented by subclass
   */
  async init(context) {
    throw new Error('init() must be implemented by subclass');
  }

  /**
   * Check if action is within cooldown period
   */
  isInCooldown() {
    const now = Date.now();
    return (now - this.lastActionTime) < this.cooldownTime;
  }

  /**
   * Execute action with cooldown protection
   */
  async executeWithCooldown(action) {
    if (this.isProcessing || this.isInCooldown()) {
      console.log(`[${this.id}] Action skipped - cooldown active`);
      return false;
    }

    this.isProcessing = true;
    this.lastActionTime = Date.now();

    try {
      await action();
      return true;
    } catch (error) {
      console.error(`[${this.id}] Error executing action:`, error);
      return false;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Handle messages from other contexts (optional)
   */
  async handleMessage(message) {
    console.log(`[${this.id}] Received message:`, message);
  }

  /**
   * Cleanup when handler is disabled (optional)
   */
  destroy() {
    console.log(`[${this.id}] Cleaning up...`);
  }
}
```

**Update:** `modules/case1.js` to extend base:

```javascript
class Case1Handler extends BaseHandler {
  constructor() {
    super({
      id: 'case1',
      cooldownTime: 2000
    });
    this.fieldSelector = '[data-id="firstresponsesent.fieldControl-option-set-select"]';
  }

  async init(context) {
    console.log('[Case 1] Initializing...');

    if (context.isIframe) {
      this.watchSendButton();
    } else {
      await domObserver.waitForElement('[data-id^="firstresponsesent"]', 15000);
      this.watchForEmailSends();
    }

    setTimeout(() => {
      this.initialized = true;
    }, 3000);
  }

  async handleEmailSent() {
    await this.executeWithCooldown(async () => {
      console.log('[Case 1] Processing email send event...');
      const currentValue = await this.getFieldValue();

      if (currentValue === 'No' || currentValue === '0' || currentValue === null) {
        const success = await fieldUtils.setDropdownValue(
          this.fieldSelector,
          'Yes',
          ['Yes', 'Ja', '1']
        );

        if (success) {
          notificationManager.success('First Response Sent set to "Yes"', 3000);
        } else {
          notificationManager.warning('Could not update First Response Sent field', 3000);
        }
      }
    });
  }

  // ... other methods
}
```

**Benefits:**
- Consistent interface across all handlers
- Shared cooldown logic
- Standard error handling
- Easier testing

---

### 3. Field Utilities

**Create:** `utils/field-utils.js`

```javascript
class FieldUtils {
  /**
   * Get dropdown field value
   */
  async getDropdownValue(selector) {
    const field = document.querySelector(selector);
    if (!field) {
      console.warn('[FieldUtils] Field not found:', selector);
      return null;
    }

    return field.getAttribute('value') ||
           field.getAttribute('title') ||
           field.textContent.trim();
  }

  /**
   * Set dropdown field to a specific value
   * @param {string} selector - Field selector
   * @param {string} targetValue - Value to set
   * @param {Array} valueVariants - Possible text representations of the value
   */
  async setDropdownValue(selector, targetValue, valueVariants = []) {
    try {
      const field = document.querySelector(selector);
      if (!field) {
        console.error('[FieldUtils] Field not found:', selector);
        return false;
      }

      // Open the dropdown
      const opened = await this.openDropdown(field);
      if (!opened) {
        return false;
      }

      // Wait for options to render
      await this.sleep(300);

      // Find and click the option
      const option = this.findOption(valueVariants);
      if (option) {
        console.log('[FieldUtils] Clicking option:', targetValue);
        option.click();
        await this.sleep(500);
        return true;
      } else {
        console.error('[FieldUtils] Option not found:', targetValue);
        return false;
      }
    } catch (error) {
      console.error('[FieldUtils] Error setting dropdown:', error);
      return false;
    }
  }

  /**
   * Open a Fluent UI dropdown
   */
  async openDropdown(field, maxAttempts = 10) {
    // Try clicking
    field.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    field.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    field.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    // Wait for dropdown to open
    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(200);
      if (field.getAttribute('aria-expanded') === 'true') {
        return true;
      }
    }

    // Try with keyboard
    field.focus();
    await this.sleep(100);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(200);
      if (field.getAttribute('aria-expanded') === 'true') {
        return true;
      }
    }

    return false;
  }

  /**
   * Find option in dropdown by text variants
   */
  findOption(textVariants) {
    const selectors = [
      '[role="option"]',
      '[role="listitem"]',
      '.fui-Option'
    ];

    for (const selector of selectors) {
      const options = document.querySelectorAll(selector);

      for (const option of options) {
        const text = option.textContent.trim();
        const dataValue = option.getAttribute('data-value');

        if (textVariants.some(variant =>
          text === variant ||
          dataValue === variant ||
          text === String(variant) ||
          dataValue === String(variant)
        )) {
          return option;
        }
      }
    }

    return null;
  }

  /**
   * Set text field value
   */
  async setTextValue(selector, value) {
    const field = document.querySelector(selector);
    if (!field) {
      return false;
    }

    field.focus();
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  /**
   * Click a button
   */
  async clickButton(selector) {
    const button = document.querySelector(selector);
    if (!button) {
      return false;
    }

    button.click();
    return true;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const fieldUtils = new FieldUtils();
```

**Benefits:**
- Reusable Dynamics 365 field operations
- Tested once, used everywhere
- Reduces code duplication from 93 lines to ~10 lines per case
- Easier to fix bugs (fix once, benefits all cases)

---

### 4. Message Router for Iframe Communication

**Create:** `utils/message-router.js`

```javascript
class MessageRouter {
  constructor() {
    this.handlers = new Map();
    this.isIframe = window.self !== window.top;
    this.setupListener();
  }

  /**
   * Register a message handler
   */
  on(eventType, handler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType).push(handler);
  }

  /**
   * Send message from iframe to main window
   */
  sendToMain(eventType, data = {}) {
    if (!this.isIframe) {
      console.warn('[MessageRouter] sendToMain called from main window');
      return;
    }

    window.top.postMessage({
      type: eventType,
      source: 'starbase-optimizer',
      data: data
    }, 'https://starbase.crm4.dynamics.com');

    console.log('[MessageRouter] Message sent to main window:', eventType);
  }

  /**
   * Send message from main window to iframes
   */
  sendToIframes(eventType, data = {}) {
    if (this.isIframe) {
      console.warn('[MessageRouter] sendToIframes called from iframe');
      return;
    }

    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      try {
        iframe.contentWindow.postMessage({
          type: eventType,
          source: 'starbase-optimizer',
          data: data
        }, 'https://starbase.crm4.dynamics.com');
      } catch (error) {
        console.log('[MessageRouter] Could not send to iframe:', error);
      }
    });
  }

  /**
   * Setup message listener
   */
  setupListener() {
    window.addEventListener('message', (event) => {
      // Verify origin
      if (event.origin !== 'https://starbase.crm4.dynamics.com') {
        return;
      }

      // Check if it's our message
      if (event.data && event.data.source === 'starbase-optimizer') {
        const eventType = event.data.type;
        const handlers = this.handlers.get(eventType);

        if (handlers) {
          handlers.forEach(handler => {
            try {
              handler(event.data.data);
            } catch (error) {
              console.error(`[MessageRouter] Error in handler for ${eventType}:`, error);
            }
          });
        }
      }
    });
  }
}

const messageRouter = new MessageRouter();
```

**Update:** `modules/case1.js` to use router:

```javascript
class Case1Handler extends BaseHandler {
  async init(context) {
    if (context.isIframe) {
      // In iframe: watch send button and notify main window
      this.watchSendButton();
    } else {
      // In main window: listen for iframe messages
      messageRouter.on('EMAIL_SENT', () => {
        this.updateField();
      });

      await domObserver.waitForElement('[data-id^="firstresponsesent"]', 15000);
    }

    setTimeout(() => {
      this.initialized = true;
    }, 3000);
  }

  watchSendButton() {
    document.addEventListener('click', (event) => {
      if (!this.initialized) return;

      if (this.isSendButton(event.target)) {
        setTimeout(() => {
          // Send message to main window via router
          messageRouter.sendToMain('EMAIL_SENT', {
            timestamp: Date.now()
          });
        }, 3000);
      }
    }, true);
  }

  // ... rest of methods
}
```

**Benefits:**
- Single place to handle iframe communication
- Type-safe message routing
- Easy to add new cross-frame events
- Reduces boilerplate in each case handler

---

### 5. Per-Feature Settings

**Update:** `popup.html` to show individual toggles:

```html
<div class="features">
  <h3>Features</h3>
  <div id="featuresList">
    <!-- Dynamically populated by popup.js -->
  </div>
</div>
```

**Update:** `popup.js`:

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  // Load modules configuration
  const modules = [
    {
      id: 'case1',
      name: 'Auto-set First Response Sent',
      description: 'Automatically sets "First Response Sent" to "Yes" when sending emails'
    }
    // Future modules added here or loaded dynamically
  ];

  const settings = await chrome.storage.sync.get(['enabledModules']);
  const enabledModules = settings.enabledModules || {};

  const featuresList = document.getElementById('featuresList');

  modules.forEach(module => {
    const isEnabled = enabledModules[module.id] !== false;

    const featureDiv = document.createElement('div');
    featureDiv.className = 'feature-item';
    featureDiv.innerHTML = `
      <div class="feature-info">
        <strong>${module.name}</strong>
        <p class="feature-description">${module.description}</p>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" data-module-id="${module.id}" ${isEnabled ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    `;

    featureDiv.querySelector('input').addEventListener('change', async (e) => {
      enabledModules[module.id] = e.target.checked;
      await chrome.storage.sync.set({ enabledModules });

      // Notify content scripts to reload
      const tabs = await chrome.tabs.query({ url: 'https://starbase.crm4.dynamics.com/*' });
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'MODULE_TOGGLED',
          moduleId: module.id,
          enabled: e.target.checked
        });
      });
    });

    featuresList.appendChild(featureDiv);
  });
});
```

**Benefits:**
- Users can selectively enable/disable features
- Easier debugging (disable problematic features)
- Better user experience
- Reduces support burden

---

### 6. Event Bus (Optional - Advanced)

**Create:** `utils/event-bus.js`

```javascript
class EventBus {
  constructor() {
    this.events = new Map();
  }

  /**
   * Subscribe to an event
   */
  on(eventName, callback) {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, []);
    }
    this.events.get(eventName).push(callback);
  }

  /**
   * Unsubscribe from an event
   */
  off(eventName, callback) {
    if (this.events.has(eventName)) {
      const callbacks = this.events.get(eventName);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event
   */
  emit(eventName, data) {
    if (this.events.has(eventName)) {
      this.events.get(eventName).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[EventBus] Error in callback for ${eventName}:`, error);
        }
      });
    }
  }
}

const eventBus = new EventBus();
```

**Use case:** Multiple cases respond to same CRM events:

```javascript
// Case 1: Update field when email sent
eventBus.on('crm:email:sent', (data) => {
  case1Handler.updateField();
});

// Case 2: Log activity when email sent
eventBus.on('crm:email:sent', (data) => {
  case2Handler.logActivity(data);
});

// Case 3: Update metrics when email sent
eventBus.on('crm:email:sent', (data) => {
  case3Handler.updateMetrics(data);
});

// Somewhere in the code that detects email sent:
eventBus.emit('crm:email:sent', { timestamp: Date.now() });
```

**Benefits:**
- Loose coupling between modules
- Multiple handlers can react to same events
- Easier to add features that react to existing events
- Cleaner separation of concerns

---

## Implementation Priority

### Phase 1: Foundation (High Impact)
1. **Field Utilities** - Immediate code reduction, high reusability
2. **Base Handler Class** - Standardizes interface, easier testing
3. **Message Router** - Simplifies iframe communication

### Phase 2: Scalability (Medium Impact)
4. **Module Registry** - Makes adding new cases trivial
5. **Per-Feature Settings** - Better UX, easier debugging

### Phase 3: Advanced (Low Priority)
6. **Event Bus** - Only needed when multiple cases react to same events

---

## Migration Path

### Step 1: Add Utilities (No Breaking Changes)
- Add `utils/field-utils.js`
- Add `utils/base-handler.js`
- Add `utils/message-router.js`
- Update manifest.json to load them

### Step 2: Refactor Case 1 to Use Utilities
- Extend BaseHandler
- Use fieldUtils for field operations
- Use messageRouter for iframe communication
- Test thoroughly

### Step 3: Add Module Registry
- Add `utils/module-registry.js`
- Update content-script.js to use registry
- Make case1 self-register
- Test

### Step 4: Add Per-Feature Settings
- Update popup.html/js
- Update background.js to handle per-module settings
- Test

### Step 5: Add New Cases
- Create case2.js using new architecture
- Verify it self-registers and works
- Repeat for case3, case4, etc.

---

## Code Reduction Example

### Before (Case 1 current):
- 446 lines in case1.js
- Manual manifest.json updates
- Manual content-script.js updates
- Hardcoded iframe logic

### After (with refactoring):
- ~150 lines in case1.js (66% reduction)
- Self-registering (no manifest.json updates needed)
- No content-script.js updates needed
- Reusable utilities

**Adding Case 2:**
- Before: ~400+ lines (reimplementing field logic)
- After: ~100 lines (using utilities)

---

## Testing Considerations

With these refactorings:
- Each utility can be unit tested independently
- Base class can be tested once
- Individual cases become simpler to test
- Mock utilities for faster testing

Example test structure:
```
tests/
├── utils/
│   ├── field-utils.test.js
│   ├── message-router.test.js
│   └── base-handler.test.js
└── modules/
    ├── case1.test.js
    └── case2.test.js
```
