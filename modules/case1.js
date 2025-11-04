/**
 * Case 1: Automatically set "First Response Sent" to "Yes" when an email is sent
 * Refactored to use new modular architecture
 */

class Case1Handler extends BaseHandler {
  constructor() {
    super({
      id: 'case1',
      cooldownTime: 2000
    });

    this.fieldSelector = '[data-id="firstresponsesent.fieldControl-option-set-select"]';
    this.initializationDelay = 3000; // Wait before marking as initialized
  }

  /**
   * Check if we're on a case page (not dashboard or other pages)
   * @returns {boolean} true if on a case page
   */
  isOnCasePage() {
    const url = window.location.href;

    // Check for incident/case entity indicators in URL
    // Case pages have etn=incident (entity name) or etc=112 (entity type code for incidents)
    const isCasePage = url.includes('etn=incident') ||
                       url.includes('etc=112') ||
                       (url.includes('pagetype=entityrecord') && (url.includes('incident') || url.includes('etc=112')));

    return isCasePage;
  }

  /**
   * Initialize Case 1 handler
   * @param {Object} context - {isIframe: boolean}
   */
  async init(context) {
    console.log('[Case 1] Initializing...', context.isIframe ? '[IFRAME]' : '[MAIN WINDOW]');

    // Only run on case pages, not on dashboard
    if (!this.isOnCasePage()) {
      console.log('[Case 1] Not on a case page - skipping initialization');
      return;
    }

    console.log('[Case 1] Confirmed we are on a case page - proceeding with initialization');

    try {
      if (context.isIframe) {
        // In iframe: watch for send button clicks
        this.watchSendButton();

        // Wait before marking as initialized to avoid processing existing UI
        setTimeout(() => {
          this.initialized = true;
          console.log('[Case 1] Iframe initialized - now monitoring send button');
        }, 2000);

      } else {
        // In main window: wait for field to load and setup message listener
        await domObserver.waitForElement('[data-id^="firstresponsesent"]', 15000);
        console.log('[Case 1] Form loaded successfully');

        // Register message handler for iframe events
        messageRouter.on('EMAIL_SENT', async (data) => {
          console.log('[Case 1] Received EMAIL_SENT message from iframe', data);
          await this.updateField();
        });

        // Wait before marking as initialized
        setTimeout(() => {
          this.initialized = true;
          console.log('[Case 1] Main window initialized - ready to process emails');
        }, this.initializationDelay);
      }

    } catch (error) {
      console.error('[Case 1] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Watch for the email send button click in iframe
   */
  watchSendButton() {
    console.log('[Case 1] Setting up send button watcher...');

    // Use event delegation to catch send button clicks
    document.addEventListener('click', (event) => {
      if (!this.initialized) {
        return;
      }

      const target = event.target;

      // Check if it's a send button for email
      const isSend = this.isSendButton(target);

      if (isSend) {
        console.log('[Case 1] ✓ EMAIL SEND BUTTON CLICKED - will notify main window in 3 seconds');

        // Delay to ensure the email is actually sent and processed
        setTimeout(() => {
          this.handleEmailSent();
        }, 3000);
      }
    }, true);
  }

  /**
   * Check if the element is a send button
   */
  isSendButton(element) {
    if (!element) return false;

    let foundSendButton = false;
    let buttonInfo = {};

    // Check the element and its parents (up to 5 levels)
    let current = element;
    for (let i = 0; i < 5; i++) {
      if (!current) break;

      const ariaLabel = current.getAttribute('aria-label');
      const dataId = current.getAttribute('data-id');
      const title = current.getAttribute('title');
      const id = current.getAttribute('id');

      // Check for send button indicators (English and Dutch)
      if (
        (ariaLabel && (ariaLabel.toLowerCase().includes('send') || ariaLabel.toLowerCase().includes('verzenden'))) ||
        (dataId && (dataId.toLowerCase().includes('send') || dataId.toLowerCase().includes('emailsend'))) ||
        (title && (title.toLowerCase().includes('send') || title.toLowerCase().includes('verzenden'))) ||
        (id && (id.toLowerCase().includes('send') || id.toLowerCase().includes('emailsend')))
      ) {
        foundSendButton = true;
        buttonInfo = {
          ariaLabel: ariaLabel,
          dataId: dataId,
          title: title,
          id: id
        };
        break;
      }

      current = current.parentElement;
    }

    if (!foundSendButton) return false;

    // Additional check: Make sure we're in an email context
    const isInEmailContext = this.isInEmailContext(current);

    if (isInEmailContext) {
      console.log('[Case 1] Email send button found:', buttonInfo);
      return true;
    } else {
      console.log('[Case 1] Send button found but not in email context, ignoring');
      return false;
    }
  }

  /**
   * Check if we're in an email context (email form/dialog)
   */
  isInEmailContext(element) {
    // Look for email-related containers in the parent tree
    let current = element;
    let depth = 0;
    const maxDepth = 15;

    while (current && depth < maxDepth) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const dataId = current.getAttribute('data-id');
        const ariaLabel = current.getAttribute('aria-label');
        const className = current.className;

        // Check for email form indicators
        if (
          (dataId && dataId.toLowerCase().includes('email')) ||
          (ariaLabel && ariaLabel.toLowerCase().includes('email')) ||
          (className && typeof className === 'string' && className.toLowerCase().includes('email')) ||
          current.querySelector('[data-id*="email"]') !== null
        ) {
          return true;
        }
      }

      current = current.parentElement;
      depth++;
    }

    return false;
  }

  /**
   * Handle email sent event (called from iframe)
   */
  async handleEmailSent() {
    await this.executeWithCooldown(async () => {
      console.log('[Case 1] Processing email send event...');

      // Send message to main window via message router
      messageRouter.sendToMain('EMAIL_SENT', {
        timestamp: Date.now(),
        source: 'case1'
      });

      console.log('[Case 1] Message sent to main window');
    });
  }

  /**
   * Update the First Response Sent field (called from main window)
   */
  async updateField() {
    await this.executeWithCooldown(async () => {
      console.log('[Case 1] Updating field...');

      // Check current value using field utils
      const currentValue = await fieldUtils.getDropdownValue(this.fieldSelector);
      console.log('[Case 1] Current field value:', currentValue);

      // Only update if currently "No" or empty
      if (currentValue === 'No' || currentValue === '0' || currentValue === null || currentValue === '') {
        console.log('[Case 1] Setting field to "Yes"...');

        // Use field utils to set the value
        const success = await fieldUtils.setDropdownValue(
          this.fieldSelector,
          'Yes',
          ['Yes', 'Ja', '1', 'yes', 'ja']  // Value variants to try
        );

        if (success) {
          notificationManager.success('First Response Sent set to "Yes"', 3000);
          console.log('[Case 1] ✓ Field updated successfully');
        } else {
          notificationManager.warning('Could not update First Response Sent field', 3000);
          console.log('[Case 1] ✗ Field update failed');
        }
      } else {
        console.log('[Case 1] Field already set to "Yes", skipping');
      }
    });
  }

  /**
   * Handle messages (optional, for future extensibility)
   */
  async handleMessage(data) {
    console.log('[Case 1] Received message:', data);
    // Can be used for additional communication if needed
  }

  /**
   * Cleanup when handler is disabled
   */
  destroy() {
    super.destroy();
    console.log('[Case 1] Handler destroyed');
    // Additional cleanup if needed
  }
}

// Self-register the module with the registry
if (typeof moduleRegistry !== 'undefined') {
  moduleRegistry.register({
    id: 'case1',
    name: 'Auto-set First Response Sent',
    description: 'Automatically sets "First Response Sent" to "Yes" when sending emails in support cases',
    handler: new Case1Handler(),
    enabled: true  // Enabled by default
  });

  console.log('[Case 1] Module registered with registry');
} else {
  console.error('[Case 1] Module registry not available - module not registered');
}
