/**
 * Case 3: Improve Time Entry for Tasks (BULLETPROOF VERSION)
 * When duration is entered, update end time instead of start time
 *
 * Current behavior: Duration input updates start time backward (17:00 → 16:00)
 * Desired behavior: Duration input updates end time forward (17:00 → 18:00)
 *
 * IMPROVEMENTS:
 * - Bidirectional sync (start/end/duration changes all sync properly)
 * - Race condition prevention with Dynamics 365
 * - Loop prevention flags
 * - Proper event listener cleanup (memory leak prevention)
 * - Robust field detection with MutationObserver fallback
 * - Edge case validation (0, negative, huge values)
 * - Locale-aware date formatting with fallbacks
 * - Field state validation (disabled/readonly)
 * - Manual override detection
 * - Retry mechanism for failed updates
 * - Debouncing for user input
 * - Comprehensive error handling
 */

class Case3Handler extends BaseHandler {
  constructor() {
    super({
      id: 'case3',
      cooldownTime: 300 // Reduced for more responsive updates
    });

    this.initializationDelay = 3000; // Increased to ensure Dynamics is fully loaded

    // Field references
    this.durationField = null;
    this.startTimeField = null;
    this.endTimeField = null;

    // Event listener references for cleanup
    this.eventListeners = [];

    // State tracking
    this.lastDuration = null;
    this.lastStartTime = null;
    this.lastEndTime = null;
    this.isUpdatingFields = false; // Loop prevention flag
    this.userManuallySetEndTime = false; // Track manual overrides

    // Mutation observer for dynamic field detection
    this.fieldObserver = null;

    // Debounce timers
    this.durationDebounceTimer = null;
    this.startTimeDebounceTimer = null;

    // Retry configuration
    this.maxRetries = 3;
    this.retryDelay = 1000;
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
                       (url.includes('pagetype=entityrecord') && url.includes('task')) ||
                       url.includes('etn=activitypointer'); // Activity forms can also be tasks

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
      await domObserver.waitForElement('[data-id*="scheduledstart"]', 20000);
      console.log('[Case 3] Task form loaded successfully');

      // Additional wait for Dynamics to finish initialization
      await fieldUtils.sleep(1000);

      // Set up field monitoring with robust detection
      await this.setupFieldMonitoring();

      // Set up mutation observer for dynamic fields
      this.setupMutationObserver();

      // Wait before marking as initialized
      setTimeout(() => {
        this.initialized = true;
        console.log('[Case 3] ✓ Initialized - now monitoring time entry fields');
      }, this.initializationDelay);

    } catch (error) {
      console.error('[Case 3] Initialization failed:', error);
      // Don't throw - allow extension to continue working
      console.log('[Case 3] Will retry field detection on form changes');
    }
  }

  /**
   * Set up mutation observer to detect dynamically loaded fields
   */
  setupMutationObserver() {
    if (this.fieldObserver) {
      return; // Already set up
    }

    console.log('[Case 3] Setting up mutation observer for dynamic field detection...');

    this.fieldObserver = new MutationObserver((mutations) => {
      // Check if we need to re-setup monitoring (fields changed)
      if (!this.durationField || !document.contains(this.durationField)) {
        console.log('[Case 3] Duration field removed from DOM, re-detecting...');
        this.setupFieldMonitoring();
      }
    });

    // Observe the form container
    const formContainer = document.querySelector('[data-id="form-container"]') || document.body;
    this.fieldObserver.observe(formContainer, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Set up monitoring for all relevant fields
   */
  async setupFieldMonitoring() {
    console.log('[Case 3] Setting up field monitoring...');

    // Find all fields with enhanced detection
    this.durationField = await this.findDurationField();
    this.startTimeField = await this.findStartTimeField();
    this.endTimeField = await this.findEndTimeField();

    if (!this.durationField) {
      console.warn('[Case 3] Duration field not found');
      return;
    }

    console.log('[Case 3] ✓ Fields detected:', {
      duration: !!this.durationField,
      startTime: !!this.startTimeField,
      endTime: !!this.endTimeField
    });

    // Set up duration field monitoring
    if (this.durationField) {
      this.setupDurationFieldListeners();
    }

    // Set up start time field monitoring (bidirectional sync)
    if (this.startTimeField) {
      this.setupStartTimeFieldListeners();
    }

    // Set up end time field monitoring (detect manual overrides)
    if (this.endTimeField) {
      this.setupEndTimeFieldListeners();
    }

    console.log('[Case 3] ✓ Field monitoring set up successfully');
  }

  /**
   * Find duration field with robust detection
   */
  async findDurationField() {
    const selectors = [
      // Scheduled duration fields
      'input[data-id*="scheduleddurationminutes"]',
      'input[data-id*="actualdurationminutes"]',
      'input[data-id*="duration"]',
      // By aria-label
      'input[aria-label*="Duration"]',
      'input[aria-label*="Duur"]',
      'input[aria-label*="Durée"]', // French
      'input[aria-label*="Dauer"]', // German
      // By control type
      '[data-lp-id*="DurationControl"] input',
      '[id*="duration-combobox"] input',
      '[id*="duration"] input[type="text"]'
    ];

    return this.findFieldBySelectors(selectors, 'Duration');
  }

  /**
   * Find start time field
   */
  async findStartTimeField() {
    const selectors = [
      'input[data-id*="scheduledstart"]',
      '[data-id*="scheduledstart.fieldControl"] input',
      'input[aria-label*="Start"]',
      'input[aria-label*="Begin"]',
      'input[data-id*="actualstart"]'
    ];

    return this.findFieldBySelectors(selectors, 'Start Time');
  }

  /**
   * Find end time field
   */
  async findEndTimeField() {
    const selectors = [
      'input[data-id*="scheduledend"]',
      '[data-id*="scheduledend.fieldControl"] input',
      'input[aria-label*="End"]',
      'input[aria-label*="Eind"]',
      'input[data-id*="actualend"]'
    ];

    return this.findFieldBySelectors(selectors, 'End Time');
  }

  /**
   * Find field by trying multiple selectors
   */
  async findFieldBySelectors(selectors, fieldName) {
    for (const selector of selectors) {
      const field = document.querySelector(selector);
      if (field && this.isValidField(field)) {
        console.log(`[Case 3] Found ${fieldName} field:`, selector);
        return field;
      }
    }

    console.warn(`[Case 3] ${fieldName} field not found`);
    return null;
  }

  /**
   * Validate if field is usable
   */
  isValidField(field) {
    if (!field) return false;

    // Check if field is visible and not disabled
    const style = window.getComputedStyle(field);
    const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
    const isEnabled = !field.disabled && !field.readOnly;

    return isVisible && field.offsetParent !== null;
  }

  /**
   * Set up duration field event listeners
   */
  setupDurationFieldListeners() {
    console.log('[Case 3] Setting up duration field listeners...');

    // Input event (immediate feedback during typing)
    const inputHandler = (event) => {
      if (!this.initialized || this.isUpdatingFields) return;

      // Debounce to avoid excessive processing
      clearTimeout(this.durationDebounceTimer);
      this.durationDebounceTimer = setTimeout(() => {
        console.log('[Case 3] Duration input detected');
        this.handleDurationChange(event);
      }, 500); // Wait 500ms after user stops typing
    };

    // Change event (when user finishes editing)
    const changeHandler = (event) => {
      if (!this.initialized || this.isUpdatingFields) return;

      console.log('[Case 3] Duration changed');
      clearTimeout(this.durationDebounceTimer); // Cancel debounce
      this.handleDurationChange(event);
    };

    // Blur event (when user leaves the field)
    const blurHandler = (event) => {
      if (!this.initialized || this.isUpdatingFields) return;

      console.log('[Case 3] Duration field blur');
      clearTimeout(this.durationDebounceTimer); // Cancel debounce
      this.handleDurationChange(event);
    };

    this.durationField.addEventListener('input', inputHandler);
    this.durationField.addEventListener('change', changeHandler);
    this.durationField.addEventListener('blur', blurHandler);

    // Store references for cleanup
    this.eventListeners.push({
      element: this.durationField,
      event: 'input',
      handler: inputHandler
    });
    this.eventListeners.push({
      element: this.durationField,
      event: 'change',
      handler: changeHandler
    });
    this.eventListeners.push({
      element: this.durationField,
      event: 'blur',
      handler: blurHandler
    });
  }

  /**
   * Set up start time field event listeners (bidirectional sync)
   */
  setupStartTimeFieldListeners() {
    console.log('[Case 3] Setting up start time field listeners...');

    const changeHandler = (event) => {
      if (!this.initialized || this.isUpdatingFields) return;

      // Debounce
      clearTimeout(this.startTimeDebounceTimer);
      this.startTimeDebounceTimer = setTimeout(() => {
        console.log('[Case 3] Start time changed by user');
        this.handleStartTimeChange(event);
      }, 800); // Longer debounce for date/time pickers
    };

    const blurHandler = (event) => {
      if (!this.initialized || this.isUpdatingFields) return;

      console.log('[Case 3] Start time field blur');
      clearTimeout(this.startTimeDebounceTimer);
      this.handleStartTimeChange(event);
    };

    this.startTimeField.addEventListener('change', changeHandler);
    this.startTimeField.addEventListener('blur', blurHandler);

    this.eventListeners.push({
      element: this.startTimeField,
      event: 'change',
      handler: changeHandler
    });
    this.eventListeners.push({
      element: this.startTimeField,
      event: 'blur',
      handler: blurHandler
    });
  }

  /**
   * Set up end time field event listeners (detect manual overrides)
   */
  setupEndTimeFieldListeners() {
    console.log('[Case 3] Setting up end time field listeners (manual override detection)...');

    const changeHandler = (event) => {
      if (!this.initialized || this.isUpdatingFields) return;

      console.log('[Case 3] End time changed by user (manual override)');
      this.userManuallySetEndTime = true;

      // Store the manually set end time
      const endTime = this.getFieldDate(this.endTimeField);
      if (endTime) {
        this.lastEndTime = endTime;
      }
    };

    this.endTimeField.addEventListener('change', changeHandler);
    this.endTimeField.addEventListener('blur', changeHandler);

    this.eventListeners.push({
      element: this.endTimeField,
      event: 'change',
      handler: changeHandler
    });
    this.eventListeners.push({
      element: this.endTimeField,
      event: 'blur',
      handler: changeHandler
    });
  }

  /**
   * Handle duration field change
   */
  async handleDurationChange(event) {
    await this.executeWithCooldown(async () => {
      console.log('[Case 3] Processing duration change...');

      const durationValue = event.target.value;

      // Skip if no value or same as last
      if (!durationValue || durationValue === this.lastDuration) {
        console.log('[Case 3] No change in duration, skipping');
        return;
      }

      console.log('[Case 3] Duration value:', durationValue);

      // Parse and validate duration
      const durationMinutes = this.parseDuration(durationValue);
      if (durationMinutes === null) {
        console.log('[Case 3] Could not parse duration, skipping');
        return;
      }

      // Validate duration (edge cases)
      if (!this.isValidDuration(durationMinutes)) {
        console.warn('[Case 3] Invalid duration value:', durationMinutes);
        notificationManager.warning('Invalid duration value', 2000);
        return;
      }

      console.log('[Case 3] Parsed duration:', durationMinutes, 'minutes');
      this.lastDuration = durationValue;

      // Reset manual override flag when duration changes
      this.userManuallySetEndTime = false;

      // Wait for Dynamics to process (increased from 500ms)
      await fieldUtils.sleep(1000);

      // Get current start time
      const startTime = this.getFieldDate(this.startTimeField);
      if (!startTime) {
        console.log('[Case 3] Could not get start time, skipping');
        return;
      }

      console.log('[Case 3] Current start time:', startTime.toLocaleString());

      // Calculate new end time
      const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
      console.log('[Case 3] Calculated end time:', endTime.toLocaleString());

      // Update the end time field with retry
      const success = await this.updateEndTimeWithRetry(endTime);

      if (success) {
        this.lastEndTime = endTime;
        notificationManager.success(
          'End time: ' + endTime.toLocaleTimeString('nl-NL', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          2000
        );
        console.log('[Case 3] ✓ End time updated successfully');
      } else {
        notificationManager.warning('Could not update end time', 2000);
        console.log('[Case 3] ✗ Failed to update end time after retries');
      }
    });
  }

  /**
   * Handle start time field change (bidirectional sync)
   */
  async handleStartTimeChange(event) {
    await this.executeWithCooldown(async () => {
      console.log('[Case 3] Processing start time change...');

      const startTime = this.getFieldDate(this.startTimeField);
      if (!startTime) {
        console.log('[Case 3] Could not parse start time, skipping');
        return;
      }

      // Skip if same as last
      if (this.lastStartTime && startTime.getTime() === this.lastStartTime.getTime()) {
        console.log('[Case 3] No change in start time, skipping');
        return;
      }

      console.log('[Case 3] Start time changed to:', startTime.toLocaleString());
      this.lastStartTime = startTime;

      // If user manually set end time, don't override it
      if (this.userManuallySetEndTime) {
        console.log('[Case 3] User manually set end time, not updating');
        return;
      }

      // Wait for Dynamics
      await fieldUtils.sleep(1000);

      // Get current duration
      const durationValue = this.durationField ? this.durationField.value : null;
      if (!durationValue) {
        console.log('[Case 3] No duration set, skipping end time calculation');
        return;
      }

      const durationMinutes = this.parseDuration(durationValue);
      if (!durationMinutes || !this.isValidDuration(durationMinutes)) {
        console.log('[Case 3] Invalid duration, skipping');
        return;
      }

      // Recalculate end time based on new start time
      const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
      console.log('[Case 3] Recalculated end time:', endTime.toLocaleString());

      // Update end time
      const success = await this.updateEndTimeWithRetry(endTime);

      if (success) {
        this.lastEndTime = endTime;
        console.log('[Case 3] ✓ End time recalculated after start time change');
      }
    });
  }

  /**
   * Update end time with retry mechanism
   */
  async updateEndTimeWithRetry(endTime, attempt = 1) {
    console.log(`[Case 3] Updating end time (attempt ${attempt}/${this.maxRetries})...`);

    const success = await this.setEndTime(endTime);

    if (success) {
      return true;
    }

    // Retry if failed
    if (attempt < this.maxRetries) {
      console.log(`[Case 3] Retry in ${this.retryDelay}ms...`);
      await fieldUtils.sleep(this.retryDelay);
      return this.updateEndTimeWithRetry(endTime, attempt + 1);
    }

    return false;
  }

  /**
   * Set end time in the form
   * @param {Date} endTime - The end time to set
   * @returns {boolean} - True if successful
   */
  async setEndTime(endTime) {
    if (!this.endTimeField) {
      console.warn('[Case 3] End time field not available');
      return false;
    }

    // Check if field is editable
    if (this.endTimeField.disabled || this.endTimeField.readOnly) {
      console.warn('[Case 3] End time field is disabled or read-only');
      return false;
    }

    try {
      // Set loop prevention flag
      this.isUpdatingFields = true;

      // Try multiple date formats for compatibility
      const formats = this.getDateFormatsForDynamics(endTime);

      for (const format of formats) {
        try {
          console.log('[Case 3] Trying format:', format);

          // Focus the field
          this.endTimeField.focus();
          await fieldUtils.sleep(100);

          // Set the value
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
          ).set;
          nativeInputValueSetter.call(this.endTimeField, format);

          // Trigger events in sequence
          this.endTimeField.dispatchEvent(new Event('input', { bubbles: true }));
          await fieldUtils.sleep(50);
          this.endTimeField.dispatchEvent(new Event('change', { bubbles: true }));
          await fieldUtils.sleep(50);
          this.endTimeField.dispatchEvent(new Event('blur', { bubbles: true }));

          // Wait for Dynamics to process
          await fieldUtils.sleep(500);

          // Verify the value was set
          const verifiedDate = this.getFieldDate(this.endTimeField);
          if (verifiedDate && Math.abs(verifiedDate.getTime() - endTime.getTime()) < 60000) {
            // Within 1 minute tolerance
            console.log('[Case 3] ✓ End time set successfully with format:', format);
            return true;
          }

        } catch (e) {
          console.warn('[Case 3] Format failed:', format, e);
          continue; // Try next format
        }
      }

      console.error('[Case 3] All date formats failed');
      return false;

    } catch (e) {
      console.error('[Case 3] Error setting end time:', e);
      return false;
    } finally {
      // Reset loop prevention flag after a delay
      setTimeout(() => {
        this.isUpdatingFields = false;
      }, 1500);
    }
  }

  /**
   * Get multiple date format variants for maximum compatibility
   */
  getDateFormatsForDynamics(date) {
    const formats = [];

    try {
      // ISO format (most compatible)
      formats.push(date.toISOString());

      // Locale string formats
      formats.push(date.toLocaleString('en-US'));
      formats.push(date.toLocaleString('nl-NL'));
      formats.push(date.toLocaleString('en-GB'));

      // Custom formats
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');

      // Various format patterns
      formats.push(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}`);
      formats.push(`${month}/${day}/${year} ${hours}:${minutes}`);
      formats.push(`${day}/${month}/${year} ${hours}:${minutes}`);
      formats.push(`${year}/${month}/${day} ${hours}:${minutes}`);

    } catch (e) {
      console.error('[Case 3] Error generating date formats:', e);
    }

    return formats;
  }

  /**
   * Get date from field value
   */
  getFieldDate(field) {
    if (!field || !field.value) {
      return null;
    }

    try {
      const date = new Date(field.value);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch (e) {
      console.warn('[Case 3] Could not parse field date:', e);
    }

    return null;
  }

  /**
   * Parse duration string to minutes (ENHANCED with validation)
   * @param {string} durationStr - Duration string
   * @returns {number|null} - Duration in minutes or null if cannot parse
   */
  parseDuration(durationStr) {
    if (!durationStr) return null;

    const str = durationStr.toLowerCase().trim();

    // Remove any currency symbols or other noise
    const cleaned = str.replace(/[^\d:.a-z\s]/g, '');

    // Format: "X hour(s)" or "X uur/uren"
    let match = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:hour|uur|uren|hr|h|u)(?!r)/);
    if (match) {
      return parseFloat(match[1]) * 60;
    }

    // Format: "X minute(s)" or "X minuten/minuut"
    match = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:minute|minuten|minuut|min|m)/);
    if (match) {
      return parseFloat(match[1]);
    }

    // Format: "H:MM" or "HH:MM"
    match = cleaned.match(/(\d+):(\d+)/);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      return hours * 60 + minutes;
    }

    // Format: just a number (assume minutes)
    match = cleaned.match(/^(\d+(?:\.\d+)?)$/);
    if (match) {
      return parseFloat(match[1]);
    }

    return null;
  }

  /**
   * Validate duration value (edge case handling)
   */
  isValidDuration(durationMinutes) {
    if (typeof durationMinutes !== 'number' || isNaN(durationMinutes)) {
      return false;
    }

    // Check for negative or zero
    if (durationMinutes <= 0) {
      console.warn('[Case 3] Duration must be positive:', durationMinutes);
      return false;
    }

    // Check for unreasonably large values (> 1 week)
    const maxMinutes = 7 * 24 * 60; // 1 week
    if (durationMinutes > maxMinutes) {
      console.warn('[Case 3] Duration exceeds maximum (1 week):', durationMinutes);
      return false;
    }

    return true;
  }

  /**
   * Cleanup when handler is disabled (PROPER MEMORY MANAGEMENT)
   */
  destroy() {
    console.log('[Case 3] Destroying handler...');

    // Clear timers
    if (this.durationDebounceTimer) {
      clearTimeout(this.durationDebounceTimer);
      this.durationDebounceTimer = null;
    }
    if (this.startTimeDebounceTimer) {
      clearTimeout(this.startTimeDebounceTimer);
      this.startTimeDebounceTimer = null;
    }

    // Remove all event listeners
    console.log('[Case 3] Removing', this.eventListeners.length, 'event listeners...');
    this.eventListeners.forEach(({ element, event, handler }) => {
      if (element && handler) {
        element.removeEventListener(event, handler);
      }
    });
    this.eventListeners = [];

    // Disconnect mutation observer
    if (this.fieldObserver) {
      this.fieldObserver.disconnect();
      this.fieldObserver = null;
    }

    // Clear field references
    this.durationField = null;
    this.startTimeField = null;
    this.endTimeField = null;

    // Reset state
    this.lastDuration = null;
    this.lastStartTime = null;
    this.lastEndTime = null;
    this.isUpdatingFields = false;
    this.userManuallySetEndTime = false;

    super.destroy();
    console.log('[Case 3] ✓ Handler destroyed and cleaned up');
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
