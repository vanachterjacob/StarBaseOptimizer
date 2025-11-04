/**
 * Case 1: Automatically set "First Response Sent" to "Yes" when an email is sent
 */

class Case1Handler {
  constructor() {
    this.fieldSelector = '[data-id="firstresponsesent.fieldControl-option-set-select"]';
    this.isProcessing = false;
    this.lastEmailTime = 0;
    this.emailCooldown = 2000; // 2 seconds cooldown to prevent duplicate processing
    this.initialized = false; // Track if we've finished initialization
    this.initializationDelay = 3000; // Wait 3 seconds after init to ignore existing emails
  }

  /**
   * Initialize Case 1 handler
   */
  async init() {
    console.log('[StarBase Optimizer - Case 1] Initializing...');

    try {
      // Wait for the form to load
      await domObserver.waitForElement('[data-id^="firstresponsesent"]', 15000);
      console.log('[StarBase Optimizer - Case 1] Form loaded successfully');

      // Watch for email send events
      this.watchForEmailSends();

      // Wait a bit before marking as initialized to ignore existing timeline items
      setTimeout(() => {
        this.initialized = true;
        console.log('[StarBase Optimizer - Case 1] Initialized successfully - now monitoring for new emails');
      }, this.initializationDelay);
    } catch (error) {
      console.error('[StarBase Optimizer - Case 1] Initialization failed:', error);
    }
  }

  /**
   * Watch for email send events in the timeline
   */
  watchForEmailSends() {
    // Primary (and only) method: Watch for the send button being clicked
    // This is the most reliable detection method
    this.watchSendButton();

    console.log('[StarBase Optimizer - Case 1] Email detection setup complete - only monitoring send button clicks');
  }

  /**
   * Watch for the email send button click
   */
  watchSendButton() {
    console.log('[StarBase Optimizer - Case 1] Setting up send button watcher...');

    // Use event delegation to catch send button clicks
    document.addEventListener('click', (event) => {
      if (!this.initialized) {
        console.log('[StarBase Optimizer - Case 1] Click detected but not initialized yet, ignoring');
        return;
      }

      const target = event.target;

      // Check if it's a send button for email
      const isSend = this.isSendButton(target);

      if (isSend) {
        console.log('[StarBase Optimizer - Case 1] ✓ EMAIL SEND BUTTON CLICKED - will update field in 3 seconds');
        // Delay to ensure the email is actually sent and processed
        setTimeout(() => {
          this.handleEmailSent();
        }, 3000); // 3 second delay to ensure email is fully sent and visible in timeline
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

    // Check the element and its parents
    let current = element;
    for (let i = 0; i < 5; i++) {
      if (!current) break;

      const ariaLabel = current.getAttribute('aria-label');
      const dataId = current.getAttribute('data-id');
      const title = current.getAttribute('title');
      const id = current.getAttribute('id');

      // Check for send button indicators
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
    // Look for email-related elements in the surrounding DOM
    const isInEmailContext = this.isInEmailContext(current);

    if (isInEmailContext) {
      console.log('[StarBase Optimizer - Case 1] Email send button found:', buttonInfo);
      return true;
    } else {
      console.log('[StarBase Optimizer - Case 1] Send button found but not in email context, ignoring');
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
   * Watch for email composer being closed/submitted
   * DISABLED: Too many false positives - using send button detection only
   */
  // watchEmailComposer() {
  //   console.log('[StarBase Optimizer - Case 1] Setting up email composer watcher...');
  //
  //   // Watch for when the email composer dialog is closed after sending
  //   const observer = new MutationObserver((mutations) => {
  //     if (!this.initialized) return;
  //
  //     mutations.forEach((mutation) => {
  //       mutation.removedNodes.forEach((node) => {
  //         // Check if a modal/dialog containing email editor was removed
  //         if (node.nodeType === Node.ELEMENT_NODE) {
  //           const isEmailModal = node.querySelector && (
  //             node.querySelector('[data-id*="email"]') !== null ||
  //             node.querySelector('[aria-label*="Email"]') !== null ||
  //             node.querySelector('[role="dialog"]') !== null
  //           );
  //
  //           if (isEmailModal) {
  //             console.log('[StarBase Optimizer - Case 1] Email composer closed, email may have been sent');
  //             // Small delay to ensure the email is processed
  //             setTimeout(() => {
  //               this.handleEmailSent();
  //             }, 1000);
  //           }
  //         }
  //       });
  //     });
  //   });
  //
  //   observer.observe(document.body, {
  //     childList: true,
  //     subtree: true
  //   });
  // }

  /**
   * Handle email sent event
   */
  async handleEmailSent() {
    // Prevent duplicate processing
    const now = Date.now();
    if (this.isProcessing || (now - this.lastEmailTime) < this.emailCooldown) {
      return;
    }

    this.isProcessing = true;
    this.lastEmailTime = now;

    try {
      console.log('[StarBase Optimizer - Case 1] Processing email send event...');

      // Check if we're in an iframe
      const isInIframe = window.self !== window.top;

      if (isInIframe) {
        // We're in the email composer iframe - send message to main window
        console.log('[StarBase Optimizer - Case 1] In iframe - sending message to main window');
        window.top.postMessage({
          type: 'STARBASE_OPTIMIZER_EMAIL_SENT',
          source: 'starbase-optimizer'
        }, 'https://starbase.crm4.dynamics.com');
        console.log('[StarBase Optimizer - Case 1] Message sent to main window');
      } else {
        // We're in the main window - update the field directly
        await this.updateField();
      }
    } catch (error) {
      console.error('[StarBase Optimizer - Case 1] Error handling email send:', error);
      notificationManager.error('Error updating First Response Sent field', 3000);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Update the First Response Sent field
   */
  async updateField() {
    // Check current value of "First Response Sent"
    const currentValue = await this.getFieldValue();
    console.log('[StarBase Optimizer - Case 1] Current field value:', currentValue);

    if (currentValue === 'No' || currentValue === '0' || currentValue === null) {
      console.log('[StarBase Optimizer - Case 1] Setting field to "Yes"...');
      const success = await this.setFieldToYes();

      if (success) {
        notificationManager.success('First Response Sent set to "Yes"', 3000);
        console.log('[StarBase Optimizer - Case 1] Field updated successfully');
      } else {
        notificationManager.warning('Could not update First Response Sent field', 3000);
        console.log('[StarBase Optimizer - Case 1] Field update failed');
      }
    } else {
      console.log('[StarBase Optimizer - Case 1] Field already set to "Yes", skipping');
    }
  }

  /**
   * Get the current value of the "First Response Sent" field
   */
  async getFieldValue() {
    try {
      const field = document.querySelector(this.fieldSelector);
      if (!field) {
        console.log('[StarBase Optimizer - Case 1] Field not found');
        console.log('[StarBase Optimizer - Case 1] Searching for field with selector:', this.fieldSelector);

        // Try to find any similar field for debugging
        const similarFields = document.querySelectorAll('[data-id*="firstresponsesent"]');
        console.log('[StarBase Optimizer - Case 1] Found similar fields:', similarFields.length);
        similarFields.forEach((f, i) => {
          console.log(`  Field ${i}:`, f.getAttribute('data-id'), f.tagName);
        });

        return null;
      }

      // For Fluent UI button, the value is in the button's text content or value attribute
      const value = field.getAttribute('value') || field.getAttribute('title') || field.textContent.trim();
      console.log('[StarBase Optimizer - Case 1] Field found, current value:', value);
      return value;
    } catch (error) {
      console.error('[StarBase Optimizer - Case 1] Error getting field value:', error);
      return null;
    }
  }

  /**
   * Set the "First Response Sent" field to "Yes"
   */
  async setFieldToYes() {
    try {
      // Find the field
      const field = document.querySelector(this.fieldSelector);
      if (!field) {
        console.error('[StarBase Optimizer - Case 1] Field button not found');

        // Debug: show all fields with firstresponsesent in data-id
        const similarFields = document.querySelectorAll('[data-id*="firstresponsesent"]');
        console.log('[StarBase Optimizer - Case 1] Available fields:', similarFields.length);
        similarFields.forEach((f, i) => {
          console.log(`  Field ${i}:`, {
            dataId: f.getAttribute('data-id'),
            tagName: f.tagName,
            type: f.getAttribute('type'),
            role: f.getAttribute('role')
          });
        });

        return false;
      }

      console.log('[StarBase Optimizer - Case 1] Field button found, clicking to open dropdown...');

      // Try multiple methods to open the dropdown
      // Method 1: Simulate real mouse events
      field.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      field.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      field.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

      // Wait for dropdown to actually open (check aria-expanded)
      let dropdownOpen = false;
      for (let i = 0; i < 10; i++) {
        await this.sleep(200);
        const ariaExpanded = field.getAttribute('aria-expanded');
        if (ariaExpanded === 'true') {
          dropdownOpen = true;
          console.log('[StarBase Optimizer - Case 1] Dropdown opened successfully');
          break;
        }
      }

      // If still not open, try focusing and pressing Enter
      if (!dropdownOpen) {
        console.log('[StarBase Optimizer - Case 1] Click did not work, trying focus + Enter...');
        field.focus();
        await this.sleep(100);
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
        field.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));

        // Wait again
        for (let i = 0; i < 10; i++) {
          await this.sleep(200);
          const ariaExpanded = field.getAttribute('aria-expanded');
          if (ariaExpanded === 'true') {
            dropdownOpen = true;
            console.log('[StarBase Optimizer - Case 1] Dropdown opened with Enter key');
            break;
          }
        }
      }

      if (!dropdownOpen) {
        console.error('[StarBase Optimizer - Case 1] Dropdown did not open after multiple attempts');
        return false;
      }

      // Wait a bit more for options to render
      await this.sleep(300);

      // Find and click the "Yes" option
      const yesOption = this.findYesOption();
      if (yesOption) {
        console.log('[StarBase Optimizer - Case 1] "Yes" option found, clicking...');
        yesOption.click();
        await this.sleep(500);
        return true;
      } else {
        console.error('[StarBase Optimizer - Case 1] "Yes" option not found in dropdown');

        // Debug: show all available options
        const allOptions = document.querySelectorAll('[role="option"]');
        console.log('[StarBase Optimizer - Case 1] Available options:', allOptions.length);
        allOptions.forEach((opt, i) => {
          console.log(`  Option ${i}:`, opt.textContent.trim());
        });

        return false;
      }
    } catch (error) {
      console.error('[StarBase Optimizer - Case 1] Error setting field to Yes:', error);
      return false;
    }
  }

  /**
   * Find the "Yes" option in the dropdown
   */
  findYesOption() {
    // Look for the option with "Yes" or "Ja" text
    // Also check for listbox items in Fluent UI
    const selectors = [
      '[role="option"]',
      '[role="listitem"]',
      '.fui-Option',
      '[data-value="1"]'
    ];

    for (const selector of selectors) {
      const options = document.querySelectorAll(selector);

      for (const option of options) {
        const text = option.textContent.trim();
        const dataValue = option.getAttribute('data-value');

        // Check for various "Yes" representations
        if (
          text === 'Yes' ||
          text === 'Ja' ||
          text === '1' ||
          dataValue === '1' ||
          dataValue === 'yes' ||
          dataValue === 'true'
        ) {
          console.log('[StarBase Optimizer - Case 1] Found "Yes" option:', {
            text: text,
            dataValue: dataValue,
            role: option.getAttribute('role')
          });
          return option;
        }
      }
    }

    return null;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create a singleton instance
const case1Handler = new Case1Handler();
