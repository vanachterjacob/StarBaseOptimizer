/**
 * Utility for showing visual feedback notifications
 */

class NotificationManager {
  constructor() {
    this.notificationContainer = null;
    this.init();
  }

  /**
   * Initialize the notification container
   */
  init() {
    // Create notification container if it doesn't exist
    if (!this.notificationContainer) {
      this.notificationContainer = document.createElement('div');
      this.notificationContainer.id = 'starbase-optimizer-notifications';
      this.notificationContainer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
      `;

      // Wait for body to be available
      if (document.body) {
        document.body.appendChild(this.notificationContainer);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          document.body.appendChild(this.notificationContainer);
        });
      }
    }
  }

  /**
   * Show a notification
   * @param {string} message - The notification message
   * @param {string} type - Type of notification (success, error, info, warning)
   * @param {number} duration - Duration in milliseconds (default: 3000)
   */
  show(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = 'starbase-optimizer-notification';

    const colors = {
      success: '#4CAF50',
      error: '#f44336',
      info: '#2196F3',
      warning: '#ff9800'
    };

    const icons = {
      success: '✓',
      error: '✕',
      info: 'ℹ',
      warning: '⚠'
    };

    notification.style.cssText = `
      background: ${colors[type] || colors.info};
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 250px;
      max-width: 400px;
      pointer-events: auto;
      animation: slideIn 0.3s ease-out;
      opacity: 0;
      transform: translateX(50px);
    `;

    notification.innerHTML = `
      <span style="font-size: 18px; font-weight: bold;">${icons[type] || icons.info}</span>
      <span style="flex: 1;">${message}</span>
    `;

    // Add animation keyframes if not already added
    if (!document.getElementById('starbase-optimizer-animations')) {
      const style = document.createElement('style');
      style.id = 'starbase-optimizer-animations';
      style.textContent = `
        @keyframes slideIn {
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes slideOut {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(50px);
          }
        }
      `;
      document.head.appendChild(style);
    }

    this.notificationContainer.appendChild(notification);

    // Trigger animation
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateX(0)';
    }, 10);

    // Auto-remove notification
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, duration);
  }

  /**
   * Show a success notification
   */
  success(message, duration) {
    this.show(message, 'success', duration);
  }

  /**
   * Show an error notification
   */
  error(message, duration) {
    this.show(message, 'error', duration);
  }

  /**
   * Show an info notification
   */
  info(message, duration) {
    this.show(message, 'info', duration);
  }

  /**
   * Show a warning notification
   */
  warning(message, duration) {
    this.show(message, 'warning', duration);
  }

  /**
   * Send a Chrome notification
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   */
  sendChromeNotification(title, message) {
    chrome.runtime.sendMessage({
      type: 'SHOW_NOTIFICATION',
      title: title,
      message: message
    });
  }
}

// Create a singleton instance
const notificationManager = new NotificationManager();
