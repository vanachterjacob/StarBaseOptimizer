/**
 * StarBase Optimizer - Background Service Worker
 * Handles notifications and state management
 */

console.log('[StarBase Optimizer - Background] Service worker initialized');

// Initialize default settings on installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[StarBase Optimizer - Background] Extension installed/updated:', details.reason);

  // Set default values
  chrome.storage.sync.get(['enabled'], (result) => {
    if (result.enabled === undefined) {
      chrome.storage.sync.set({ enabled: true }, () => {
        console.log('[StarBase Optimizer - Background] Default settings initialized');
      });
    }
  });

  // Show welcome notification on first install
  if (details.reason === 'install') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'StarBase Optimizer Installed',
      message: 'The extension is now active and will automatically optimize your CRM workflow.'
    });
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[StarBase Optimizer - Background] Received message:', message);

  if (message.type === 'SHOW_NOTIFICATION') {
    // Show Chrome notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: message.title || 'StarBase Optimizer',
      message: message.message || ''
    });

    sendResponse({ success: true });
  }

  return true;
});

// Listen for changes in storage
chrome.storage.onChanged.addListener((changes, namespace) => {
  console.log('[StarBase Optimizer - Background] Storage changed:', changes);

  if (changes.enabled) {
    const isEnabled = changes.enabled.newValue;
    console.log('[StarBase Optimizer - Background] Extension enabled status changed:', isEnabled);

    // Notify all tabs about the change
    chrome.tabs.query({ url: 'https://starbase.crm4.dynamics.com/*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'TOGGLE_ENABLED',
          enabled: isEnabled
        }).catch(error => {
          console.log('[StarBase Optimizer - Background] Could not send message to tab:', error);
        });
      });
    });
  }
});

console.log('[StarBase Optimizer - Background] Service worker ready');
