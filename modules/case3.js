/**
 * Case 3: Improve Time Entry for Tasks
 * When duration is entered, update end time instead of start time
 *
 * Current behavior: Duration input updates start time backward (17:00 → 16:00)
 * Desired behavior: Duration input updates end time forward (17:00 → 18:00)
 */

class Case3Handler extends BaseHandler {
  constructor() {
    super({
      id: 'case3',
      cooldownTime: 500 // Short cooldown for responsive updates
    });

    this.initializationDelay = 2000;
    this.durationObserver = null;
    this.lastDuration = null;
    this.lastStartTime = null;
  }

  /**
   * Check if we're on a task page
   * @returns {boolean} true if on a task page
   */
  isOnTaskPage() {
    const url = window.location.href;

    // Check for task entity indicators in URL
    // Task pages have etn=task or etc=4212 (entity type code for tasks)
    const isTaskPage = url.includes('etn=task') ||
                       url.includes('etc=4212') ||
                       (url.includes('pagetype=entityrecord') && url.includes('task'));

    return isTaskPage;
  }

  /**
   * Initialize Case 3 handler
   * @param {Object} context - {isIframe: boolean}
   */
  async init(context) {
    console.log('[Case 3] Initializing...', context.isIframe ? '[IFRAME]' : '[MAIN WINDOW]');

    // Only run on task pages
    if (!this.isOnTaskPage()) {
      console.log('[Case 3] Not on a task page - skipping initialization');
      return;
    }

    console.log('[Case 3] Confirmed we are on a task page - proceeding with initialization');

    // Only run in main window (not in iframes)
    if (context.isIframe) {
      console.log('[Case 3] In iframe - skipping (only runs in main window)');
      return;
    }

    try {
      // Wait for form to load - look for date/time fields
      console.log('[Case 3] Waiting for task form to load...');
      await domObserver.waitForElement('[data-id*="scheduledstart"]', 15000);
      console.log('[Case 3] Task form loaded successfully');

      // Set up duration field monitoring
      this.setupDurationMonitoring();

      // Wait before marking as initialized
      setTimeout(() => {
        this.initialized = true;
        console.log('[Case 3] Initialized - now monitoring duration changes');
      }, this.initializationDelay);

    } catch (error) {
      console.error('[Case 3] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Set up monitoring for duration field changes
   */
  setupDurationMonitoring() {
    console.log('[Case 3] Setting up duration field monitoring...');

    // Find duration input fields
    const durationSelectors = [
      'input[data-id*="duration"]',
      'input[aria-label*="Duration"]',
      'input[aria-label*="Duur"]',
      '[data-lp-id*="DurationControl"] input',
      '[id*="duration-combobox"] input'
    ];

    // Try to find the duration input field
    let durationField = null;
    for (const selector of durationSelectors) {
      durationField = document.querySelector(selector);
      if (durationField) {
        console.log('[Case 3] Found duration field with selector:', selector);
        break;
      }
    }

    if (!durationField) {
      console.warn('[Case 3] Duration field not found, will retry later');

      // Retry after a delay
      setTimeout(() => {
        if (this.initialized) {
          this.setupDurationMonitoring();
        }
      }, 3000);
      return;
    }

    // Monitor for changes using input event
    durationField.addEventListener('input', (event) => {
      if (!this.initialized) return;

      console.log('[Case 3] Duration field changed');
      this.handleDurationChange(event);
    });

    // Also monitor blur event (when user leaves the field)
    durationField.addEventListener('blur', (event) => {
      if (!this.initialized) return;

      console.log('[Case 3] Duration field blur');
      this.handleDurationChange(event);
    });

    // Monitor for changes to start time as well
    const startTimeSelectors = [
      'input[data-id*="scheduledstart"]',
      '[data-id*="scheduledstart.fieldControl"] input'
    ];

    for (const selector of startTimeSelectors) {
      const startField = document.querySelector(selector);
      if (startField) {
        console.log('[Case 3] Found start time field with selector:', selector);

        startField.addEventListener('change', (event) => {
          if (!this.initialized) return;
          console.log('[Case 3] Start time changed');
          this.captureStartTime();
        });

        break;
      }
    }

    console.log('[Case 3] Duration monitoring set up successfully');
  }

  /**
   * Capture current start time
   */
  captureStartTime() {
    const startTimeSelectors = [
      'input[data-id*="scheduledstart"]',
      '[data-id*="scheduledstart.fieldControl"] input'
    ];

    for (const selector of startTimeSelectors) {
      const startField = document.querySelector(selector);
      if (startField && startField.value) {
        this.lastStartTime = new Date(startField.value);
        console.log('[Case 3] Captured start time:', this.lastStartTime);
        return this.lastStartTime;
      }
    }

    return null;
  }

  /**
   * Handle duration field change
   */
  async handleDurationChange(event) {
    await this.executeWithCooldown(async () => {
      console.log('[Case 3] Processing duration change...');

      // Get the duration value
      const durationField = event.target;
      const durationValue = durationField.value;

      if (!durationValue || durationValue === this.lastDuration) {
        console.log('[Case 3] No change in duration, skipping');
        return;
      }

      console.log('[Case 3] Duration value:', durationValue);
      this.lastDuration = durationValue;

      // Parse duration (could be in format like "1 hour", "30 minutes", etc.)
      const durationMinutes = this.parseDuration(durationValue);
      if (!durationMinutes) {
        console.log('[Case 3] Could not parse duration, skipping');
        return;
      }

      console.log('[Case 3] Parsed duration: ' + durationMinutes + ' minutes');

      // Wait a bit for Dynamics to process the change
      await fieldUtils.sleep(500);

      // Get current start time
      const startTime = this.getStartTime();
      if (!startTime) {
        console.log('[Case 3] Could not get start time, skipping');
        return;
      }

      console.log('[Case 3] Current start time:', startTime);

      // Calculate new end time
      const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
      console.log('[Case 3] Calculated end time:', endTime);

      // Update the end time field
      const success = await this.setEndTime(endTime);

      if (success) {
        notificationManager.success('End time updated: ' + endTime.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }), 2000);
        console.log('[Case 3] ✓ End time updated successfully');
      } else {
        console.log('[Case 3] ✗ Failed to update end time');
      }
    });
  }

  /**
   * Parse duration string to minutes
   * @param {string} durationStr - Duration string like "1 hour", "30 minutes", "1:30"
   * @returns {number|null} - Duration in minutes or null if cannot parse
   */
  parseDuration(durationStr) {
    if (!durationStr) return null;

    const str = durationStr.toLowerCase().trim();

    // Format: "X hour(s)" or "X uur/uren"
    let match = str.match(/(\d+(?:\.\d+)?)\s*(?:hour|uur|uren|hr|u)/);
    if (match) {
      return parseFloat(match[1]) * 60;
    }

    // Format: "X minute(s)" or "X minuten/minuut"
    match = str.match(/(\d+)\s*(?:minute|minuten|minuut|min|m)/);
    if (match) {
      return parseInt(match[1]);
    }

    // Format: "H:MM" or "HH:MM"
    match = str.match(/(\d+):(\d+)/);
    if (match) {
      return parseInt(match[1]) * 60 + parseInt(match[2]);
    }

    // Format: just a number (assume minutes)
    match = str.match(/^(\d+(?:\.\d+)?)$/);
    if (match) {
      return parseFloat(match[1]);
    }

    return null;
  }

  /**
   * Get current start time from the form
   * @returns {Date|null}
   */
  getStartTime() {
    const startTimeSelectors = [
      'input[data-id*="scheduledstart"]',
      '[data-id*="scheduledstart.fieldControl"] input'
    ];

    for (const selector of startTimeSelectors) {
      const startField = document.querySelector(selector);
      if (startField && startField.value) {
        try {
          const date = new Date(startField.value);
          if (!isNaN(date.getTime())) {
            return date;
          }
        } catch (e) {
          console.warn('[Case 3] Could not parse start time:', e);
        }
      }
    }

    return null;
  }

  /**
   * Set end time in the form
   * @param {Date} endTime - The end time to set
   * @returns {boolean} - True if successful
   */
  async setEndTime(endTime) {
    const endTimeSelectors = [
      'input[data-id*="scheduledend"]',
      '[data-id*="scheduledend.fieldControl"] input'
    ];

    for (const selector of endTimeSelectors) {
      const endField = document.querySelector(selector);
      if (endField) {
        try {
          // Focus the field
          endField.focus();

          // Format the date to the expected format
          // Dynamics 365 typically expects ISO format or locale-specific format
          const formattedDate = this.formatDateForDynamics(endTime);

          console.log('[Case 3] Setting end time to:', formattedDate);

          // Set the value
          endField.value = formattedDate;

          // Trigger events to ensure Dynamics recognizes the change
          endField.dispatchEvent(new Event('input', { bubbles: true }));
          endField.dispatchEvent(new Event('change', { bubbles: true }));
          endField.dispatchEvent(new Event('blur', { bubbles: true }));

          // Wait a bit for Dynamics to process
          await fieldUtils.sleep(300);

          return true;
        } catch (e) {
          console.error('[Case 3] Error setting end time:', e);
        }
      }
    }

    console.warn('[Case 3] End time field not found');
    return false;
  }

  /**
   * Format date for Dynamics 365 datetime field
   * @param {Date} date
   * @returns {string}
   */
  formatDateForDynamics(date) {
    // Try ISO format first (most compatible)
    return date.toISOString();
  }

  /**
   * Cleanup when handler is disabled
   */
  destroy() {
    super.destroy();
    console.log('[Case 3] Handler destroyed');

    if (this.durationObserver) {
      this.durationObserver.disconnect();
      this.durationObserver = null;
    }
  }
}

// Self-register the module with the registry
if (typeof moduleRegistry !== 'undefined') {
  moduleRegistry.register({
    id: 'case3',
    name: 'Improve Time Entry',
    description: 'When entering duration in tasks, update end time instead of start time',
    handler: new Case3Handler(),
    enabled: true  // Enabled by default
  });

  console.log('[Case 3] Module registered with registry');
} else {
  console.error('[Case 3] Module registry not available - module not registered');
}
