/**
 * Field Utilities for Dynamics 365 CRM
 * Reusable utilities for field manipulation in Fluent UI
 */

class FieldUtils {
  /**
   * Get dropdown field value
   * @param {string} selector - CSS selector for the field
   * @returns {string|null} - Current field value or null if not found
   */
  async getDropdownValue(selector) {
    try {
      const field = document.querySelector(selector);
      if (!field) {
        console.warn('[FieldUtils] Field not found:', selector);
        return null;
      }

      // Try multiple methods to get the value
      const value = field.getAttribute('value') ||
                   field.getAttribute('title') ||
                   field.textContent.trim();

      console.log('[FieldUtils] Current field value:', value);
      return value;
    } catch (error) {
      console.error('[FieldUtils] Error getting field value:', error);
      return null;
    }
  }

  /**
   * Set dropdown field to a specific value
   * @param {string} selector - Field selector
   * @param {string} targetValue - Value to set (for logging)
   * @param {Array} valueVariants - Possible text representations of the value
   * @returns {boolean} - True if successful, false otherwise
   */
  async setDropdownValue(selector, targetValue, valueVariants = []) {
    try {
      console.log(`[FieldUtils] Setting field to "${targetValue}"...`);

      const field = document.querySelector(selector);
      if (!field) {
        console.error('[FieldUtils] Field not found:', selector);

        // Debug: show similar fields
        const similarFields = document.querySelectorAll(`[data-id*="${selector.split('.')[0].replace('[data-id="', '')}"]`);
        console.log('[FieldUtils] Similar fields found:', similarFields.length);
        similarFields.forEach((f, i) => {
          console.log(`  Field ${i}:`, {
            dataId: f.getAttribute('data-id'),
            tagName: f.tagName,
            role: f.getAttribute('role')
          });
        });

        return false;
      }

      console.log('[FieldUtils] Field found, opening dropdown...');

      // Open the dropdown
      const opened = await this.openDropdown(field);
      if (!opened) {
        console.error('[FieldUtils] Failed to open dropdown');
        return false;
      }

      // Wait for options to render
      await this.sleep(300);

      // Find and click the option
      const option = this.findOption(valueVariants);
      if (option) {
        console.log('[FieldUtils] Option found, clicking:', targetValue);
        option.click();
        await this.sleep(500);
        return true;
      } else {
        console.error('[FieldUtils] Option not found:', targetValue);

        // Debug: show all available options
        const allOptions = document.querySelectorAll('[role="option"]');
        console.log('[FieldUtils] Available options:', allOptions.length);
        allOptions.forEach((opt, i) => {
          console.log(`  Option ${i}:`, {
            text: opt.textContent.trim(),
            dataValue: opt.getAttribute('data-value')
          });
        });

        return false;
      }
    } catch (error) {
      console.error('[FieldUtils] Error setting dropdown:', error);
      return false;
    }
  }

  /**
   * Open a Fluent UI dropdown
   * @param {Element} field - The dropdown field element
   * @param {number} maxAttempts - Maximum number of attempts
   * @returns {boolean} - True if opened successfully
   */
  async openDropdown(field, maxAttempts = 10) {
    // Method 1: Try clicking with mouse events
    field.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    field.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    field.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

    // Wait for dropdown to open (check aria-expanded)
    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(200);
      const ariaExpanded = field.getAttribute('aria-expanded');
      if (ariaExpanded === 'true') {
        console.log('[FieldUtils] Dropdown opened successfully with click');
        return true;
      }
    }

    // Method 2: Try with keyboard if click didn't work
    console.log('[FieldUtils] Click did not work, trying keyboard...');
    field.focus();
    await this.sleep(100);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
    field.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));

    // Wait again for dropdown to open
    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(200);
      const ariaExpanded = field.getAttribute('aria-expanded');
      if (ariaExpanded === 'true') {
        console.log('[FieldUtils] Dropdown opened successfully with Enter key');
        return true;
      }
    }

    console.error('[FieldUtils] Failed to open dropdown after all attempts');
    return false;
  }

  /**
   * Find option in dropdown by text variants
   * @param {Array} textVariants - Possible text values for the option
   * @returns {Element|null} - The option element or null
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

        // Check if any variant matches
        if (textVariants.some(variant => {
          const variantStr = String(variant);
          return text === variantStr ||
                 dataValue === variantStr ||
                 text.toLowerCase() === variantStr.toLowerCase() ||
                 (dataValue && dataValue.toLowerCase() === variantStr.toLowerCase());
        })) {
          console.log('[FieldUtils] Found option:', {
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
   * Set text field value
   * @param {string} selector - Field selector
   * @param {string} value - Value to set
   * @returns {boolean} - True if successful
   */
  async setTextValue(selector, value) {
    try {
      const field = document.querySelector(selector);
      if (!field) {
        console.error('[FieldUtils] Text field not found:', selector);
        return false;
      }

      field.focus();
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));

      console.log('[FieldUtils] Text field updated:', value);
      return true;
    } catch (error) {
      console.error('[FieldUtils] Error setting text value:', error);
      return false;
    }
  }

  /**
   * Click a button
   * @param {string} selector - Button selector
   * @returns {boolean} - True if successful
   */
  async clickButton(selector) {
    try {
      const button = document.querySelector(selector);
      if (!button) {
        console.error('[FieldUtils] Button not found:', selector);
        return false;
      }

      button.click();
      console.log('[FieldUtils] Button clicked');
      return true;
    } catch (error) {
      console.error('[FieldUtils] Error clicking button:', error);
      return false;
    }
  }

  /**
   * Check if a checkbox is checked
   * @param {string} selector - Checkbox selector
   * @returns {boolean|null} - True if checked, false if unchecked, null if not found
   */
  isChecked(selector) {
    try {
      const checkbox = document.querySelector(selector);
      if (!checkbox) {
        console.warn('[FieldUtils] Checkbox not found:', selector);
        return null;
      }

      return checkbox.checked || checkbox.getAttribute('aria-checked') === 'true';
    } catch (error) {
      console.error('[FieldUtils] Error checking checkbox:', error);
      return null;
    }
  }

  /**
   * Set checkbox state
   * @param {string} selector - Checkbox selector
   * @param {boolean} checked - True to check, false to uncheck
   * @returns {boolean} - True if successful
   */
  async setCheckbox(selector, checked) {
    try {
      const checkbox = document.querySelector(selector);
      if (!checkbox) {
        console.error('[FieldUtils] Checkbox not found:', selector);
        return false;
      }

      if ((checkbox.checked || checkbox.getAttribute('aria-checked') === 'true') !== checked) {
        checkbox.click();
        console.log('[FieldUtils] Checkbox toggled:', checked);
      } else {
        console.log('[FieldUtils] Checkbox already in desired state:', checked);
      }

      return true;
    } catch (error) {
      console.error('[FieldUtils] Error setting checkbox:', error);
      return false;
    }
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create a singleton instance
const fieldUtils = new FieldUtils();
