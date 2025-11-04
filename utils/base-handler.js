/**
 * Base Handler Class
 * All case handlers should extend this class for consistent interface and shared utilities
 */

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
   * @param {Object} context - Initialization context {isIframe: boolean}
   */
  async init(context) {
    throw new Error(`${this.id}: init() must be implemented by subclass`);
  }

  /**
   * Check if action is within cooldown period
   * @returns {boolean} - True if in cooldown, false otherwise
   */
  isInCooldown() {
    const now = Date.now();
    return (now - this.lastActionTime) < this.cooldownTime;
  }

  /**
   * Execute action with cooldown protection
   * @param {Function} action - Async function to execute
   * @returns {boolean} - True if action executed, false if skipped
   */
  async executeWithCooldown(action) {
    if (this.isProcessing || this.isInCooldown()) {
      console.log(`[${this.id}] Action skipped - cooldown active or already processing`);
      return false;
    }

    this.isProcessing = true;
    this.lastActionTime = Date.now();

    try {
      await action();
      console.log(`[${this.id}] Action executed successfully`);
      return true;
    } catch (error) {
      console.error(`[${this.id}] Error executing action:`, error);
      notificationManager.error(`Error in ${this.id}`, 3000);
      return false;
    } finally {
      this.isProcessing = false;
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

  /**
   * Handle messages from other contexts (optional override)
   * @param {Object} data - Message data
   */
  async handleMessage(data) {
    console.log(`[${this.id}] Received message:`, data);
  }

  /**
   * Cleanup when handler is disabled (optional override)
   */
  destroy() {
    console.log(`[${this.id}] Cleaning up...`);
    this.initialized = false;
  }
}
