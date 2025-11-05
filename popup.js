/**
 * StarBase Optimizer - Popup Script
 * Handles the popup UI interactions with per-feature toggles
 */

document.addEventListener('DOMContentLoaded', async () => {
  const enabledToggle = document.getElementById('enabledToggle');
  const status = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  const featuresList = document.getElementById('featuresList');

  // Module metadata (should match modules/case1.js registration)
  const modules = [
    {
      id: 'case1',
      name: 'Auto-set First Response Sent',
      description: 'Automatically sets "First Response Sent" to "Yes" when sending emails in support cases'
    },
    {
      id: 'case3',
      name: 'Improve Time Entry',
      description: 'When entering duration in tasks, update end time instead of start time'
    },
    {
      id: 'imageLightbox',
      name: 'Image Lightbox',
      description: 'Display timeline images in fullscreen lightbox when clicked'
    }
    // Future modules will be added here automatically as they're created
  ];

  // Load current settings
  await loadSettings();

  // Handle global toggle changes
  enabledToggle.addEventListener('change', async () => {
    const isEnabled = enabledToggle.checked;

    try {
      // Save to storage
      await chrome.storage.sync.set({ enabled: isEnabled });

      // Update status display
      updateStatus(isEnabled);

      // Notify content scripts
      await notifyContentScripts({
        type: 'TOGGLE_ENABLED',
        enabled: isEnabled
      });

      console.log('Extension toggled:', isEnabled);
    } catch (error) {
      console.error('Error updating extension status:', error);
    }
  });

  /**
   * Load settings from storage and populate UI
   */
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['enabled', 'enabledModules']);
      const isEnabled = result.enabled !== false; // Default to true
      const enabledModules = result.enabledModules || {};

      // Set global toggle
      enabledToggle.checked = isEnabled;
      updateStatus(isEnabled);

      // Populate features list
      await populateFeatures(enabledModules);

    } catch (error) {
      console.error('Error loading settings:', error);
      updateStatus(false);
      showError('Failed to load settings');
    }
  }

  /**
   * Populate features list with individual toggles
   */
  async function populateFeatures(enabledModules) {
    // Clear loading message
    featuresList.innerHTML = '';

    if (modules.length === 0) {
      featuresList.innerHTML = `
        <p style="font-size: 12px; color: #999; padding: 10px; text-align: center;">
          No features available
        </p>
      `;
      return;
    }

    // Create feature items
    modules.forEach(module => {
      const isEnabled = enabledModules[module.id] !== false; // Default to true

      const featureItem = document.createElement('div');
      featureItem.className = 'feature-item';
      featureItem.innerHTML = `
        <div class="feature-content">
          <div class="feature-header">
            <span class="feature-status ${isEnabled ? 'enabled' : 'disabled'}">
              ${isEnabled ? '✓' : '○'}
            </span>
            <strong class="feature-name">${module.name}</strong>
          </div>
          <p class="feature-description">${module.description}</p>
        </div>
        <label class="toggle-switch toggle-switch-small">
          <input type="checkbox" data-module-id="${module.id}" ${isEnabled ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      `;

      // Add toggle event listener
      const toggle = featureItem.querySelector('input');
      toggle.addEventListener('change', async (e) => {
        await toggleModule(module.id, e.target.checked, featureItem);
      });

      featuresList.appendChild(featureItem);
    });
  }

  /**
   * Toggle a specific module on/off
   */
  async function toggleModule(moduleId, enabled, featureItem) {
    try {
      // Update storage
      const result = await chrome.storage.sync.get(['enabledModules']);
      const enabledModules = result.enabledModules || {};
      enabledModules[moduleId] = enabled;
      await chrome.storage.sync.set({ enabledModules });

      // Update UI
      const statusIcon = featureItem.querySelector('.feature-status');
      if (enabled) {
        statusIcon.classList.remove('disabled');
        statusIcon.classList.add('enabled');
        statusIcon.textContent = '✓';
      } else {
        statusIcon.classList.remove('enabled');
        statusIcon.classList.add('disabled');
        statusIcon.textContent = '○';
      }

      // Notify content scripts
      await notifyContentScripts({
        type: 'MODULE_TOGGLED',
        moduleId: moduleId,
        enabled: enabled
      });

      console.log(`Module ${moduleId} toggled:`, enabled);

    } catch (error) {
      console.error(`Error toggling module ${moduleId}:`, error);
      showError(`Failed to toggle ${moduleId}`);

      // Revert toggle on error
      const toggle = featureItem.querySelector('input');
      toggle.checked = !enabled;
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

  /**
   * Show error message
   */
  function showError(message) {
    statusText.textContent = message;
    status.classList.remove('active');
    status.classList.add('inactive');
  }

  /**
   * Notify all CRM tabs about changes
   */
  async function notifyContentScripts(message) {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://starbase.crm4.dynamics.com/*' });

      const promises = tabs.map(tab =>
        chrome.tabs.sendMessage(tab.id, message)
          .catch(error => {
            console.log(`Could not send message to tab ${tab.id}:`, error);
          })
      );

      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Error notifying content scripts:', error);
    }
  }
});
