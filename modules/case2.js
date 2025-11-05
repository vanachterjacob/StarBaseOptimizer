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
    this.startDateSelector = '[data-id="scheduledstart.fieldControl._datecontrol-date-container"] input';
    this.startTimeSelector = '[data-id="scheduledstart.fieldControl._timecontrol-datetime-container"] input';
    this.endDateSelector = '[data-id="scheduledend.fieldControl._datecontrol-date-container"] input';
    this.endTimeSelector = '[data-id="scheduledend.fieldControl._timecontrol-datetime-container"] input';
    this.initializationDelay = 2000;
    this.lastStartDate = null;
    this.lastDuration = null;
    this.originalStartDate = null; // Store original start date before duration changes
  }

  /**
   * Check if we're on a task page
   * @returns {boolean} true if on a task page
   */
  isOnTaskPage() {
    const url = window.location.href;

    // Method 1: Check URL parameters
    // Task pages have etn=task (entity name) or etc=4212 (entity type code for tasks)
    const urlCheck = url.includes('etn=task') ||
                     url.includes('etc=4212') ||
                     (url.includes('pagetype=entityrecord') && url.includes('task'));

    if (urlCheck) {
      return true;
    }

    // Method 2: Check DOM for task-specific elements
    // Task pages have data-lp-id attributes that include ":task" or "|task"
    const taskElements = document.querySelectorAll('[data-lp-id*=":task"], [data-lp-id*="|task"]');
    if (taskElements.length > 0) {
      console.log('[Case 2] Task page detected via DOM elements:', taskElements.length);
      return true;
    }

    // Method 3: Check for Time Registration section (specific to tasks)
    const timeRegSection = document.querySelector('[data-id="section_TimeRegistration"]');
    if (timeRegSection) {
      console.log('[Case 2] Task page detected via Time Registration section');
      return true;
    }

    return false;
  }

  /**
   * Initialize Case 2 handler
   * @param {Object} context - {isIframe: boolean}
   */
  async init(context) {
    console.log('[Case 2] Initializing...', context.isIframe ? '[IFRAME]' : '[MAIN WINDOW]');

    // Only run in main window (not in iframe)
    if (context.isIframe) {
      console.log('[Case 2] Running in iframe - skipping initialization');
      return;
    }

    try {
      // Instead of checking if we're on a task page first,
      // try to wait for task-specific elements. If they don't appear,
      // we're not on a task page and can silently exit.
      console.log('[Case 2] Waiting for Time Registration section...');

      // Wait for the time registration section to load (this is task-specific)
      // Use a longer timeout to account for slow page loads
      await domObserver.waitForElement('[data-id="section_TimeRegistration"]', 30000);
      console.log('[Case 2] Time registration section found - confirmed task page');

      // Wait for duration field to load
      await domObserver.waitForElement(this.durationInputSelector, 15000);
      console.log('[Case 2] Duration field found');

      // Setup duration field monitoring
      this.watchDurationField();

      // Wait before marking as initialized
      setTimeout(() => {
        this.initialized = true;
        console.log('[Case 2] Initialized - now monitoring duration field');
      }, this.initializationDelay);

    } catch (error) {
      // If we can't find the Time Registration section, we're probably not on a task page
      // This is expected behavior, not an error
      if (error.message && error.message.includes('not found within')) {
        console.log('[Case 2] Time Registration section not found - not on a task page, skipping initialization');
        return; // Silently exit without throwing
      }

      // For other errors, log them but don't throw to avoid breaking other modules
      console.error('[Case 2] Initialization error:', error);
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

    // Capture original start date when user focuses on duration field
    // This happens BEFORE they make changes
    durationInput.addEventListener('focus', async () => {
      if (!this.initialized) return;
      this.originalStartDate = await this.getStartDate();
      console.log('[Case 2] Captured original start date:', this.originalStartDate);
    });

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

      // Get duration
      const duration = await this.getDuration();

      if (!duration) {
        console.log('[Case 2] Missing duration - skipping');
        return;
      }

      // Use the original start date that was captured on focus
      // If not captured yet, read it now
      let startDate = this.originalStartDate;
      if (!startDate) {
        startDate = await this.getStartDate();
        this.originalStartDate = startDate;
      }

      if (!startDate) {
        console.log('[Case 2] Missing start date - skipping');
        return;
      }

      // Check if duration actually changed
      if (this.lastDuration === duration) {
        console.log('[Case 2] No duration change detected - skipping');
        return;
      }

      console.log('[Case 2] Processing duration change:', {
        originalStartDate: startDate,
        duration,
        lastDuration: this.lastDuration
      });

      // Store current duration
      this.lastDuration = duration;

      // Wait a bit to let Dynamics 365's built-in logic run first
      // This is important because Dynamics modifies the start date
      await new Promise(resolve => setTimeout(resolve, 500));

      // Now update the end date based on original start + duration
      await this.updateEndDate(startDate, duration);

      // Restore the original start date (because Dynamics may have modified it)
      await this.restoreStartDate(startDate);
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
   * Get start date from the start date and time fields
   * @returns {Date|null} Start date or null
   */
  async getStartDate() {
    try {
      const startDateInput = document.querySelector(this.startDateSelector);
      const startTimeInput = document.querySelector(this.startTimeSelector);

      if (!startDateInput || !startTimeInput) {
        console.warn('[Case 2] Start date or time input not found');
        return null;
      }

      const dateString = startDateInput.value.trim();
      const timeString = startTimeInput.value.trim();

      if (!dateString || !timeString) {
        console.warn('[Case 2] Start date or time is empty');
        return null;
      }

      // Combine date and time strings
      const dateTimeString = `${dateString} ${timeString}`;

      // Parse the combined string
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

      // Format the date and time for Dynamics 365
      const formattedDate = this.formatDateForDynamics(endDate);
      const formattedTime = this.formatTimeForDynamics(endDate);

      console.log('[Case 2] Formatted end date:', formattedDate, formattedTime);

      // Get the end date and time input fields
      const endDateInput = document.querySelector(this.endDateSelector);
      const endTimeInput = document.querySelector(this.endTimeSelector);

      if (!endDateInput || !endTimeInput) {
        console.error('[Case 2] End date or time input not found');
        notificationManager.warning('Could not find end date field', 3000);
        return;
      }

      // Update the date field
      endDateInput.focus();
      endDateInput.value = formattedDate;
      endDateInput.dispatchEvent(new Event('input', { bubbles: true }));
      endDateInput.dispatchEvent(new Event('change', { bubbles: true }));
      endDateInput.dispatchEvent(new Event('blur', { bubbles: true }));

      // Small delay between updates
      await new Promise(resolve => setTimeout(resolve, 100));

      // Update the time field
      endTimeInput.focus();
      endTimeInput.value = formattedTime;
      endTimeInput.dispatchEvent(new Event('input', { bubbles: true }));
      endTimeInput.dispatchEvent(new Event('change', { bubbles: true }));
      endTimeInput.dispatchEvent(new Event('blur', { bubbles: true }));

      console.log('[Case 2] ✓ End date and time updated successfully');
      notificationManager.success('End date calculated and updated', 2000);

    } catch (error) {
      console.error('[Case 2] Error updating end date:', error);
      notificationManager.error('Failed to update end date', 3000);
    }
  }

  /**
   * Restore the original start date (prevents Dynamics from modifying it)
   * @param {Date} originalStartDate - The original start date to restore
   */
  async restoreStartDate(originalStartDate) {
    try {
      console.log('[Case 2] Restoring original start date:', originalStartDate);

      // Format the date and time
      const formattedDate = this.formatDateForDynamics(originalStartDate);
      const formattedTime = this.formatTimeForDynamics(originalStartDate);

      console.log('[Case 2] Formatted start date:', formattedDate, formattedTime);

      // Get the start date and time input fields
      const startDateInput = document.querySelector(this.startDateSelector);
      const startTimeInput = document.querySelector(this.startTimeSelector);

      if (!startDateInput || !startTimeInput) {
        console.error('[Case 2] Start date or time input not found');
        return;
      }

      // Check if start date was modified by Dynamics
      const currentStartDate = `${startDateInput.value} ${startTimeInput.value}`;
      const expectedStartDate = `${formattedDate} ${formattedTime}`;

      if (currentStartDate === expectedStartDate) {
        console.log('[Case 2] Start date unchanged - no need to restore');
        return;
      }

      console.log('[Case 2] Start date was modified by Dynamics, restoring...', {
        current: currentStartDate,
        expected: expectedStartDate
      });

      // Update the date field
      startDateInput.focus();
      startDateInput.value = formattedDate;
      startDateInput.dispatchEvent(new Event('input', { bubbles: true }));
      startDateInput.dispatchEvent(new Event('change', { bubbles: true }));
      startDateInput.dispatchEvent(new Event('blur', { bubbles: true }));

      // Small delay between updates
      await new Promise(resolve => setTimeout(resolve, 100));

      // Update the time field
      startTimeInput.focus();
      startTimeInput.value = formattedTime;
      startTimeInput.dispatchEvent(new Event('input', { bubbles: true }));
      startTimeInput.dispatchEvent(new Event('change', { bubbles: true }));
      startTimeInput.dispatchEvent(new Event('blur', { bubbles: true }));

      console.log('[Case 2] ✓ Start date restored successfully');

    } catch (error) {
      console.error('[Case 2] Error restoring start date:', error);
    }
  }

  /**
   * Format date for Dynamics 365 date input field (date only, no time)
   * @param {Date} date - Date to format
   * @returns {string} Formatted date string
   */
  formatDateForDynamics(date) {
    // Get the current locale's date format from the existing start date field
    const startDateInput = document.querySelector(this.startDateSelector);
    const existingFormat = startDateInput ? startDateInput.value : '';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    // Try to match the format of the existing start date
    if (existingFormat.includes('-')) {
      // ISO format: YYYY-MM-DD
      return `${year}-${month}-${day}`;
    } else if (existingFormat.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
      // European format: DD/MM/YYYY (most common in Europe)
      return `${day}/${month}/${year}`;
    } else if (existingFormat.match(/^\d{4}\/\d{1,2}\/\d{1,2}/)) {
      // Asian format: YYYY/MM/DD
      return `${year}/${month}/${day}`;
    } else if (existingFormat.match(/^\d{1,2}-\d{1,2}-\d{4}/)) {
      // Alternative dash format: DD-MM-YYYY
      return `${day}-${month}-${year}`;
    } else {
      // Default to European format (Belgium uses DD/MM/YYYY)
      return `${month}/${day}/${year}`;
    }
  }

  /**
   * Format time for Dynamics 365 time input field (time only, no date)
   * @param {Date} date - Date to format (time portion)
   * @returns {string} Formatted time string
   */
  formatTimeForDynamics(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    // Most Dynamics 365 instances use 24-hour format: HH:mm
    return `${hours}:${minutes}`;
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
