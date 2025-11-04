/**
 * Message Router for Iframe Communication
 * Handles cross-frame messaging between email composer iframe and main window
 */

class MessageRouter {
  constructor() {
    this.handlers = new Map();
    this.isIframe = window.self !== window.top;
    this.origin = 'https://starbase.crm4.dynamics.com';
    this.setupListener();

    console.log('[MessageRouter] Initialized in', this.isIframe ? 'IFRAME' : 'MAIN WINDOW');
  }

  /**
   * Register a message handler
   * @param {string} eventType - Event type to listen for
   * @param {Function} handler - Handler function
   */
  on(eventType, handler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType).push(handler);
    console.log(`[MessageRouter] Registered handler for: ${eventType}`);
  }

  /**
   * Unregister a message handler
   * @param {string} eventType - Event type
   * @param {Function} handler - Handler function to remove
   */
  off(eventType, handler) {
    if (this.handlers.has(eventType)) {
      const handlers = this.handlers.get(eventType);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
        console.log(`[MessageRouter] Unregistered handler for: ${eventType}`);
      }
    }
  }

  /**
   * Send message from iframe to main window
   * @param {string} eventType - Event type
   * @param {Object} data - Data to send
   */
  sendToMain(eventType, data = {}) {
    if (!this.isIframe) {
      console.warn('[MessageRouter] sendToMain called from main window - ignoring');
      return;
    }

    try {
      window.top.postMessage({
        type: eventType,
        source: 'starbase-optimizer',
        data: data,
        timestamp: Date.now()
      }, this.origin);

      console.log(`[MessageRouter] Message sent to main window: ${eventType}`, data);
    } catch (error) {
      console.error('[MessageRouter] Error sending message to main:', error);
    }
  }

  /**
   * Send message from main window to all iframes
   * @param {string} eventType - Event type
   * @param {Object} data - Data to send
   */
  sendToIframes(eventType, data = {}) {
    if (this.isIframe) {
      console.warn('[MessageRouter] sendToIframes called from iframe - ignoring');
      return;
    }

    try {
      const iframes = document.querySelectorAll('iframe');
      console.log(`[MessageRouter] Sending message to ${iframes.length} iframes: ${eventType}`);

      iframes.forEach((iframe, index) => {
        try {
          iframe.contentWindow.postMessage({
            type: eventType,
            source: 'starbase-optimizer',
            data: data,
            timestamp: Date.now()
          }, this.origin);
        } catch (error) {
          console.log(`[MessageRouter] Could not send to iframe ${index}:`, error);
        }
      });
    } catch (error) {
      console.error('[MessageRouter] Error sending message to iframes:', error);
    }
  }

  /**
   * Broadcast message to both main window and all iframes
   * @param {string} eventType - Event type
   * @param {Object} data - Data to send
   */
  broadcast(eventType, data = {}) {
    if (this.isIframe) {
      this.sendToMain(eventType, data);
    } else {
      this.sendToIframes(eventType, data);
    }
  }

  /**
   * Setup message listener
   */
  setupListener() {
    window.addEventListener('message', (event) => {
      // Verify origin for security
      if (event.origin !== this.origin) {
        return;
      }

      // Check if it's our message
      if (event.data && event.data.source === 'starbase-optimizer') {
        const eventType = event.data.type;
        const data = event.data.data;

        console.log(`[MessageRouter] Received message: ${eventType}`, data);

        // Call all registered handlers for this event type
        const handlers = this.handlers.get(eventType);
        if (handlers && handlers.length > 0) {
          handlers.forEach(handler => {
            try {
              handler(data);
            } catch (error) {
              console.error(`[MessageRouter] Error in handler for ${eventType}:`, error);
            }
          });
        } else {
          console.log(`[MessageRouter] No handlers registered for: ${eventType}`);
        }
      }
    });

    console.log('[MessageRouter] Message listener setup complete');
  }

  /**
   * Remove all handlers (cleanup)
   */
  removeAllHandlers() {
    this.handlers.clear();
    console.log('[MessageRouter] All handlers removed');
  }

  /**
   * Get registered event types (for debugging)
   */
  getRegisteredEvents() {
    return Array.from(this.handlers.keys());
  }
}

// Create a singleton instance
const messageRouter = new MessageRouter();
