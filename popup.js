/**
 * StarBase Optimizer - Popup Script
 * Handles the popup UI interactions
 */

document.addEventListener('DOMContentLoaded', () => {
  const enabledToggle = document.getElementById('enabledToggle');
  const status = document.getElementById('status');
  const statusText = document.getElementById('statusText');

  // Load current settings
  loadSettings();

  // Handle toggle changes
  enabledToggle.addEventListener('change', async () => {
    const isEnabled = enabledToggle.checked;

    try {
      // Save to storage
      await chrome.storage.sync.set({ enabled: isEnabled });

      // Update status display
      updateStatus(isEnabled);

      // Notify content scripts
      const tabs = await chrome.tabs.query({ url: 'https://starbase.crm4.dynamics.com/*' });
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'TOGGLE_ENABLED',
          enabled: isEnabled
        }).catch(error => {
          console.log('Could not send message to tab:', error);
        });
      });

      console.log('Settings updated:', { enabled: isEnabled });
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  });

  /**
   * Load settings from storage
   */
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['enabled']);
      const isEnabled = result.enabled !== false; // Default to true

      enabledToggle.checked = isEnabled;
      updateStatus(isEnabled);
    } catch (error) {
      console.error('Error loading settings:', error);
      updateStatus(false);
    }
  }

  /**
   * Update status display
   */
  function updateStatus(isEnabled) {
    if (isEnabled) {
      status.classList.add('active');
      status.classList.remove('inactive');
      statusText.textContent = 'Extension is active';
    } else {
      status.classList.add('inactive');
      status.classList.remove('active');
      statusText.textContent = 'Extension is disabled';
    }
  }
});
