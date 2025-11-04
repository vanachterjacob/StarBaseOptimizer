/**
 * StarBase Optimizer - Content Script
 * Main entry point for the Chrome extension
 */

(function() {
  'use strict';

  const isInIframe = window.self !== window.top;
  const frameInfo = isInIframe ? ' [IFRAME]' : ' [MAIN WINDOW]';
  console.log('[StarBase Optimizer] Content script loaded' + frameInfo);

  let isEnabled = true;
  let isInitialized = false;

  /**
   * Initialize the extension
   */
  async function initialize() {
    if (isInitialized) {
      console.log('[StarBase Optimizer' + frameInfo + '] Already initialized, skipping');
      return;
    }

    console.log('[StarBase Optimizer' + frameInfo + '] Initializing...');

    try {
      // Get the enabled state from storage
      const result = await chrome.storage.sync.get(['enabled']);
      isEnabled = result.enabled !== false; // Default to true if not set

      console.log('[StarBase Optimizer' + frameInfo + '] Extension enabled:', isEnabled);

      if (isEnabled) {
        if (isInIframe) {
          // In iframe: only watch for send button clicks
          console.log('[StarBase Optimizer' + frameInfo + '] In iframe - only watching send button');
          case1Handler.watchSendButton();
          // Mark as initialized after a delay to avoid catching existing UI
          setTimeout(() => {
            case1Handler.initialized = true;
            console.log('[StarBase Optimizer' + frameInfo + '] Iframe initialized - now monitoring send button');
          }, 2000);
        } else {
          // In main window: full initialization
          console.log('[StarBase Optimizer' + frameInfo + '] In main window - full initialization');
          await case1Handler.init();

          // Listen for messages from iframes (email sent events)
          window.addEventListener('message', async (event) => {
            // Verify origin for security
            if (event.origin !== 'https://starbase.crm4.dynamics.com') {
              return;
            }

            // Check if it's our message
            if (event.data && event.data.type === 'STARBASE_OPTIMIZER_EMAIL_SENT' && event.data.source === 'starbase-optimizer') {
              console.log('[StarBase Optimizer' + frameInfo + '] Received email sent message from iframe');
              // Update the field
              await case1Handler.updateField();
            }
          });

          notificationManager.info('StarBase Optimizer is active', 2000);
        }
      } else {
        console.log('[StarBase Optimizer' + frameInfo + '] Extension is disabled, skipping initialization');
      }

      isInitialized = true;
    } catch (error) {
      console.error('[StarBase Optimizer' + frameInfo + '] Initialization error:', error);
    }
  }

  /**
   * Handle enable/disable messages from popup
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[StarBase Optimizer] Received message:', message);

    if (message.type === 'TOGGLE_ENABLED') {
      isEnabled = message.enabled;
      console.log('[StarBase Optimizer] Extension toggled:', isEnabled);

      if (isEnabled && !isInitialized) {
        initialize();
      } else if (!isEnabled) {
        notificationManager.info('StarBase Optimizer is now disabled', 2000);
      } else if (isEnabled) {
        notificationManager.info('StarBase Optimizer is now enabled', 2000);
      }

      sendResponse({ success: true });
    }

    return true; // Keep the message channel open for async response
  });

  /**
   * Wait for the page to be ready
   */
  function waitForPageReady() {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(initialize, 1000); // Small delay to ensure CRM is loaded
    } else {
      window.addEventListener('load', () => {
        setTimeout(initialize, 1000);
      });
    }
  }

  // Start the extension
  waitForPageReady();

  console.log('[StarBase Optimizer] Content script ready');
})();
