/**
 * Case 2: Fix time registration duration behavior
 * When user enters duration, update end date forward instead of start date backward
 */

class Case2Handler extends BaseHandler {
  constructor() {
    super({
      id: 'case2',
      cooldownTime: 1000
    });

    this.durationInputSelector = '#duration-combobox';
    this.startDateInputSelector = '[data-id*="scheduledstart.fieldControl"][type="text"]';
    this.endDateInputSelector = '[data-id*="scheduledend.fieldControl"][type="text"]';
    this.initializationDelay = 2000;
    this.lastStartDate = null;
    this.lastDuration = null;
  }

  /**
   * Check if we're on a task page
   * @returns {boolean} true if on a task page
   */
  isOnTaskPage() {
    const url = window.location.href;

    // Task pages have etn=task (entity name) or etc=4212 (entity type code for tasks)
    const isTaskPage = url.includes('etn=task') ||
                       url.includes('etc=4212') ||
                       (url.includes('pagetype=entityrecord') && url.includes('task'));

    return isTaskPage;
  }

  /**
   * Initialize Case 2 handler
   * @param {Object} context - {isIframe: boolean}
   */
  async init(context) {
    console.log('[Case 2] Initializing...', context.isIframe ? '[IFRAME]' : '[MAIN WINDOW]');

    // Only run on task pages
    if (!this.isOnTaskPage()) {
      console.log('[Case 2] Not on a task page - skipping initialization');
      return;
    }

    console.log('[Case 2] Confirmed we are on a task page - proceeding with initialization');

    // Only run in main window (not in iframe)
    if (context.isIframe) {
      console.log('[Case 2] Running in iframe - skipping initialization');
      return;
    }

    try {
      // Wait for the time registration section to load
      await domObserver.waitForElement('[data-id="section_TimeRegistration"]', 15000);
      console.log('[Case 2] Time registration section loaded');

      // Wait for duration field to load
      await domObserver.waitForElement(this.durationInputSelector, 10000);
      console.log('[Case 2] Duration field found');

      // Setup duration field monitoring
      this.watchDurationField();

      // Wait before marking as initialized
      setTimeout(() => {
        this.initialized = true;
        console.log('[Case 2] Initialized - now monitoring duration field');
      }, this.initializationDelay);

    } catch (error) {
      console.error('[Case 2] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Watch the duration field for changes
   */
  watchDurationField() {
    console.log('[Case 2] Setting up duration field watcher...');

    const durationInput = document.querySelector(this.durationInputSelector);
    if (!durationInput) {
      console.error('[Case 2] Duration input not found');
      return;
    }

    // Monitor input changes
    durationInput.addEventListener('input', () => {
      if (!this.initialized) return;
      this.handleDurationChange();
    });

    // Also monitor blur event (when user finishes typing)
    durationInput.addEventListener('blur', () => {
      if (!this.initialized) return;
      this.handleDurationChange();
    });

    // Monitor the entire form for changes (in case duration is set programmatically)
    const observer = new MutationObserver(() => {
      if (!this.initialized) return;
      this.handleDurationChange();
    });

    observer.observe(durationInput, {
      attributes: true,
      attributeFilter: ['value']
    });

    console.log('[Case 2] Duration field monitoring active');
  }

  /**
   * Handle duration field change
   */
  async handleDurationChange() {
    await this.executeWithCooldown(async () => {
      console.log('[Case 2] Duration field changed - processing...');

      // Get current values
      const duration = await this.getDuration();
      const startDate = await this.getStartDate();

      if (!duration || !startDate) {
        console.log('[Case 2] Missing duration or start date - skipping', { duration, startDate });
        return;
      }

      // Check if start date or duration actually changed
      if (this.lastStartDate === startDate && this.lastDuration === duration) {
        console.log('[Case 2] No change detected - skipping');
        return;
      }

      console.log('[Case 2] Processing duration change:', {
        startDate,
        duration,
        lastStartDate: this.lastStartDate,
        lastDuration: this.lastDuration
      });

      // Store current values
      this.lastStartDate = startDate;
      this.lastDuration = duration;

      // Calculate and update end date
      await this.updateEndDate(startDate, duration);
    });
  }

  /**
   * Get duration in minutes from the duration field
   * @returns {number|null} Duration in minutes or null
   */
  async getDuration() {
    try {
      const durationInput = document.querySelector(this.durationInputSelector);
      if (!durationInput) return null;

      const durationText = durationInput.value.trim();
      if (!durationText) return null;

      // Parse duration text (e.g., "1 hour", "30 minutes", "2 hours 30 minutes")
      const minutes = this.parseDurationToMinutes(durationText);
      console.log('[Case 2] Parsed duration:', durationText, '→', minutes, 'minutes');

      return minutes;
    } catch (error) {
      console.error('[Case 2] Error getting duration:', error);
      return null;
    }
  }

  /**
   * Parse duration text to minutes
   * @param {string} text - Duration text (e.g., "1 hour", "30 minutes")
   * @returns {number} Duration in minutes
   */
  parseDurationToMinutes(text) {
    let totalMinutes = 0;

    // Match hours (e.g., "1 hour", "2 hours", "1 uur", "2 uren")
    const hoursMatch = text.match(/(\d+)\s*(hour|hours|uur|uren|hr|hrs)/i);
    if (hoursMatch) {
      totalMinutes += parseInt(hoursMatch[1]) * 60;
    }

    // Match minutes (e.g., "30 minutes", "30 minuten", "30 min")
    const minutesMatch = text.match(/(\d+)\s*(minute|minutes|minuten|min)/i);
    if (minutesMatch) {
      totalMinutes += parseInt(minutesMatch[1]);
    }

    // If no match found, try to parse as just a number (assume minutes)
    if (totalMinutes === 0 && /^\d+$/.test(text.trim())) {
      totalMinutes = parseInt(text.trim());
    }

    return totalMinutes;
  }

  /**
   * Get start date from the start date field
   * @returns {Date|null} Start date or null
   */
  async getStartDate() {
    try {
      const startDateInput = document.querySelector(this.startDateInputSelector);
      if (!startDateInput) {
        console.warn('[Case 2] Start date input not found');
        return null;
      }

      const dateTimeString = startDateInput.value.trim();
      if (!dateTimeString) {
        console.warn('[Case 2] Start date is empty');
        return null;
      }

      // Parse the date string (Dynamics 365 format varies by locale)
      const date = new Date(dateTimeString);
      if (isNaN(date.getTime())) {
        console.error('[Case 2] Invalid start date format:', dateTimeString);
        return null;
      }

      console.log('[Case 2] Start date:', dateTimeString, '→', date);
      return date;
    } catch (error) {
      console.error('[Case 2] Error getting start date:', error);
      return null;
    }
  }

  /**
   * Update end date based on start date + duration
   * @param {Date} startDate - Start date
   * @param {number} durationMinutes - Duration in minutes
   */
  async updateEndDate(startDate, durationMinutes) {
    try {
      console.log('[Case 2] Calculating end date...', { startDate, durationMinutes });

      // Calculate end date
      const endDate = new Date(startDate.getTime());
      endDate.setMinutes(endDate.getMinutes() + durationMinutes);

      console.log('[Case 2] Calculated end date:', endDate);

      // Format the date for Dynamics 365
      const formattedEndDate = this.formatDateForDynamics(endDate);
      console.log('[Case 2] Formatted end date:', formattedEndDate);

      // Set the end date field
      const endDateInput = document.querySelector(this.endDateInputSelector);
      if (!endDateInput) {
        console.error('[Case 2] End date input not found');
        notificationManager.warning('Could not find end date field', 3000);
        return;
      }

      // Update the field
      endDateInput.focus();
      endDateInput.value = formattedEndDate;
      endDateInput.dispatchEvent(new Event('input', { bubbles: true }));
      endDateInput.dispatchEvent(new Event('change', { bubbles: true }));
      endDateInput.dispatchEvent(new Event('blur', { bubbles: true }));

      console.log('[Case 2] ✓ End date updated successfully');
      notificationManager.success('End date calculated and updated', 2000);

    } catch (error) {
      console.error('[Case 2] Error updating end date:', error);
      notificationManager.error('Failed to update end date', 3000);
    }
  }

  /**
   * Format date for Dynamics 365 input field
   * Dynamics 365 expects locale-specific format
   * @param {Date} date - Date to format
   * @returns {string} Formatted date string
   */
  formatDateForDynamics(date) {
    // Get the current locale's date format from the existing start date field
    const startDateInput = document.querySelector(this.startDateInputSelector);
    const existingFormat = startDateInput ? startDateInput.value : '';

    // Detect format (e.g., "DD/MM/YYYY HH:mm" vs "MM/DD/YYYY HH:mm" vs "YYYY-MM-DD HH:mm")
    // For simplicity, we'll use a common format that Dynamics 365 usually accepts
    // and rely on the browser's locale parsing

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    // Try to match the format of the existing start date
    if (existingFormat.includes('-')) {
      // ISO format: YYYY-MM-DD HH:mm
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    } else if (existingFormat.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
      // European format: DD/MM/YYYY HH:mm (most common in Europe)
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } else if (existingFormat.match(/^\d{4}\/\d{1,2}\/\d{1,2}/)) {
      // Asian format: YYYY/MM/DD HH:mm
      return `${year}/${month}/${day} ${hours}:${minutes}`;
    } else {
      // Default to European format (Belgium uses DD/MM/YYYY)
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    }
  }

  /**
   * Cleanup when handler is disabled
   */
  destroy() {
    super.destroy();
    console.log('[Case 2] Handler destroyed');
  }
}

// Self-register the module with the registry
if (typeof moduleRegistry !== 'undefined') {
  moduleRegistry.register({
    id: 'case2',
    name: 'Fix Time Registration Duration',
    description: 'When entering duration, updates end date forward instead of start date backward',
    handler: new Case2Handler(),
    enabled: true  // Enabled by default
  });

  console.log('[Case 2] Module registered with registry');
} else {
  console.error('[Case 2] Module registry not available - module not registered');
}
