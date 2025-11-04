/**
 * StarBase Optimizer - Content Script
 * Main entry point for the Chrome extension - now using modular architecture
 */

(function() {
  'use strict';

  const isInIframe = window.self !== window.top;
  const frameInfo = isInIframe ? ' [IFRAME]' : ' [MAIN WINDOW]';
  console.log('[StarBase Optimizer] Content script loaded' + frameInfo);

  let isEnabled = true;
  let isInitialized = false;

  /**
   * Initialize the extension using module registry
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
        // Create initialization context
        const context = {
          isIframe: isInIframe
        };

        // Initialize all registered modules using the registry
        console.log('[StarBase Optimizer' + frameInfo + '] Initializing modules...');
        const stats = await moduleRegistry.initializeAll(context);

        console.log(
          `[StarBase Optimizer' + frameInfo + '] Initialization complete:`,
          `${stats.success} succeeded, ${stats.failed} failed, ${stats.total} total`
        );

        // Show notification only in main window
        if (!isInIframe && stats.success > 0) {
          notificationManager.info(
            `StarBase Optimizer active (${stats.success} feature${stats.success > 1 ? 's' : ''})`,
            2000
          );
        }
      } else {
        console.log('[StarBase Optimizer' + frameInfo + '] Extension is disabled, skipping initialization');
      }

      isInitialized = true;

    } catch (error) {
      console.error('[StarBase Optimizer' + frameInfo + '] Initialization error:', error);

      // Show error notification in main window
      if (!isInIframe) {
        notificationManager.error('Failed to initialize StarBase Optimizer', 3000);
      }
    }
  }

  /**
   * Handle enable/disable messages from popup or background
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[StarBase Optimizer] Received message:', message);

    if (message.type === 'TOGGLE_ENABLED') {
      isEnabled = message.enabled;
      console.log('[StarBase Optimizer] Extension toggled:', isEnabled);

      if (isEnabled && !isInitialized) {
        // Extension was disabled and is now being enabled
        initialize();
        notificationManager.info('StarBase Optimizer is now enabled', 2000);
      } else if (!isEnabled && isInitialized) {
        // Extension was enabled and is now being disabled
        notificationManager.info('StarBase Optimizer is now disabled', 2000);
        // Note: We don't cleanup modules here to avoid breaking ongoing operations
        // They will be re-initialized on next page load
      } else if (isEnabled) {
        notificationManager.info('StarBase Optimizer is already enabled', 2000);
      }

      sendResponse({ success: true });
    }

    else if (message.type === 'MODULE_TOGGLED') {
      // Handle individual module toggle
      const { moduleId, enabled } = message;
      console.log(`[StarBase Optimizer] Module ${moduleId} toggled:`, enabled);

      const context = { isIframe: isInIframe };

      moduleRegistry.toggleModule(moduleId, enabled, context)
        .then(success => {
          if (success) {
            const action = enabled ? 'enabled' : 'disabled';
            const module = moduleRegistry.getModule(moduleId);
            if (module && !isInIframe) {
              notificationManager.info(`${module.name} ${action}`, 2000);
            }
          }
          sendResponse({ success });
        })
        .catch(error => {
          console.error(`[StarBase Optimizer] Error toggling module ${moduleId}:`, error);
          sendResponse({ success: false, error: error.message });
        });

      return true; // Keep message channel open for async response
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
