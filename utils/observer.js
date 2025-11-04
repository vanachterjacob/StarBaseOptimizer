/**
 * Utility for observing DOM changes in Dynamics 365 CRM
 */

class DOMObserver {
  constructor() {
    this.observers = new Map();
  }

  /**
   * Wait for an element to appear in the DOM
   * @param {string} selector - CSS selector for the element
   * @param {number} timeout - Timeout in milliseconds (default: 10000)
   * @returns {Promise<Element>} - The found element
   */
  waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const element = document.querySelector(selector);
        if (element) {
          obs.disconnect();
          clearTimeout(timeoutId);
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      const timeoutId = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Observe changes to a specific element
   * @param {Element} element - The element to observe
   * @param {Function} callback - Callback function when changes occur
   * @param {Object} options - MutationObserver options
   * @returns {string} - Observer ID for later disconnection
   */
  observeElement(element, callback, options = {}) {
    const defaultOptions = {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    };

    const observerOptions = { ...defaultOptions, ...options };
    const observer = new MutationObserver(callback);
    observer.observe(element, observerOptions);

    const observerId = `observer-${Date.now()}-${Math.random()}`;
    this.observers.set(observerId, observer);

    return observerId;
  }

  /**
   * Disconnect a specific observer
   * @param {string} observerId - The observer ID to disconnect
   */
  disconnect(observerId) {
    const observer = this.observers.get(observerId);
    if (observer) {
      observer.disconnect();
      this.observers.delete(observerId);
    }
  }

  /**
   * Disconnect all observers
   */
  disconnectAll() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
  }

  /**
   * Watch for new timeline activities (emails, notes, etc.)
   * @param {Function} callback - Callback when new activity is added
   * @returns {string} - Observer ID
   */
  watchTimelineActivities(callback) {
    return this.waitForElement('[data-id*="timeline_wall_container"]')
      .then(timeline => {
        console.log('[StarBase Optimizer] Timeline container found, starting to watch for activities');
        return this.observeElement(timeline, (mutations) => {
          mutations.forEach(mutation => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
              mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  callback(node, mutation);
                }
              });
            }
          });
        }, { childList: true, subtree: true });
      })
      .catch(error => {
        console.error('[StarBase Optimizer] Timeline not found:', error);
        return null;
      });
  }
}

// Create a singleton instance
const domObserver = new DOMObserver();
