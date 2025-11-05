/**
 * Module Registry System
 * Manages registration and initialization of all case handler modules
 */

class ModuleRegistry {
  constructor() {
    this.modules = new Map();
    console.log('[ModuleRegistry] Module registry initialized');
  }

  /**
   * Register a case handler module
   * @param {Object} config - Module configuration
   * @param {string} config.id - Unique module ID
   * @param {string} config.name - Display name
   * @param {string} config.description - Description of what the module does
   * @param {Object} config.handler - Handler instance (must extend BaseHandler)
   * @param {boolean} config.enabled - Default enabled state (default: true)
   */
  register(config) {
    const { id, name, description, handler, enabled = true } = config;

    // Validation
    if (!id || !handler) {
      throw new Error('Module must have id and handler');
    }

    if (!name) {
      throw new Error(`Module ${id} must have a name`);
    }

    if (this.modules.has(id)) {
      console.warn(`[ModuleRegistry] Module ${id} already registered, overwriting`);
    }

    // Store module configuration
    this.modules.set(id, {
      id,
      name,
      description: description || 'No description provided',
      handler,
      defaultEnabled: enabled,
      initialized: false,
      enabled: enabled
    });

    console.log(`[ModuleRegistry] Registered module: ${name} (${id})`);
  }

  /**
   * Initialize all enabled modules
   * @param {Object} context - Initialization context {isIframe: boolean}
   */
  async initializeAll(context) {
    console.log('[ModuleRegistry] Initializing all enabled modules...');

    // Get user settings from storage
    const settings = await chrome.storage.sync.get(['enabledModules']);
    const enabledModules = settings.enabledModules || {};

    console.log('[ModuleRegistry] User settings:', enabledModules);

    let successCount = 0;
    let failCount = 0;

    for (const [id, module] of this.modules) {
      // Check if module is enabled (use user setting if available, otherwise use default)
      const isEnabled = enabledModules[id] !== undefined
        ? enabledModules[id]
        : module.defaultEnabled;

      module.enabled = isEnabled;

      if (isEnabled) {
        try {
          console.log(`[ModuleRegistry] Initializing ${module.name} (${id})...`);
          await module.handler.init(context);
          module.initialized = true;
          successCount++;
          console.log(`[ModuleRegistry] ✓ ${module.name} initialized successfully`);
        } catch (error) {
          console.error(`[ModuleRegistry] ✗ Failed to initialize ${module.name} (${id}):`, error);
          failCount++;

          // Show error notification
          if (typeof notificationManager !== 'undefined' && !context.isIframe) {
            notificationManager.error(`Failed to initialize ${module.name}`, 3000);
          }
        }
      } else {
        console.log(`[ModuleRegistry] Module ${module.name} (${id}) is disabled, skipping`);
      }
    }

    console.log(`[ModuleRegistry] Initialization complete: ${successCount} succeeded, ${failCount} failed`);

    return {
      success: successCount,
      failed: failCount,
      total: this.modules.size
    };
  }

  /**
   * Initialize a specific module
   * @param {string} moduleId - Module ID to initialize
   * @param {Object} context - Initialization context
   */
  async initializeModule(moduleId, context) {
    const module = this.modules.get(moduleId);

    if (!module) {
      console.error(`[ModuleRegistry] Module ${moduleId} not found`);
      return false;
    }

    try {
      console.log(`[ModuleRegistry] Initializing ${module.name}...`);
      await module.handler.init(context);
      module.initialized = true;
      module.enabled = true;
      console.log(`[ModuleRegistry] ${module.name} initialized successfully`);
      return true;
    } catch (error) {
      console.error(`[ModuleRegistry] Failed to initialize ${module.name}:`, error);
      return false;
    }
  }

  /**
   * Disable and cleanup a specific module
   * @param {string} moduleId - Module ID to disable
   */
  async disableModule(moduleId) {
    const module = this.modules.get(moduleId);

    if (!module) {
      console.error(`[ModuleRegistry] Module ${moduleId} not found`);
      return false;
    }

    try {
      console.log(`[ModuleRegistry] Disabling ${module.name}...`);

      if (module.handler.destroy) {
        module.handler.destroy();
      }

      module.initialized = false;
      module.enabled = false;

      console.log(`[ModuleRegistry] ${module.name} disabled successfully`);
      return true;
    } catch (error) {
      console.error(`[ModuleRegistry] Error disabling ${module.name}:`, error);
      return false;
    }
  }

  /**
   * Toggle a module on/off
   * @param {string} moduleId - Module ID to toggle
   * @param {boolean} enabled - Enable or disable
   * @param {Object} context - Initialization context (needed if enabling)
   */
  async toggleModule(moduleId, enabled, context) {
    console.log(`[ModuleRegistry] 🔄 toggleModule called:`, {
      moduleId,
      enabled,
      context,
      moduleExists: this.modules.has(moduleId),
      allModules: Array.from(this.modules.keys())
    });

    if (enabled) {
      return await this.initializeModule(moduleId, context);
    } else {
      return await this.disableModule(moduleId);
    }
  }

  /**
   * Get all registered modules (for UI display)
   * @returns {Array} - Array of module configurations
   */
  getModules() {
    return Array.from(this.modules.values()).map(module => ({
      id: module.id,
      name: module.name,
      description: module.description,
      enabled: module.enabled,
      initialized: module.initialized,
      defaultEnabled: module.defaultEnabled
    }));
  }

  /**
   * Get a specific module
   * @param {string} moduleId - Module ID
   * @returns {Object|null} - Module configuration or null
   */
  getModule(moduleId) {
    const module = this.modules.get(moduleId);
    if (!module) return null;

    return {
      id: module.id,
      name: module.name,
      description: module.description,
      enabled: module.enabled,
      initialized: module.initialized,
      defaultEnabled: module.defaultEnabled
    };
  }

  /**
   * Check if a module is registered
   * @param {string} moduleId - Module ID
   * @returns {boolean}
   */
  hasModule(moduleId) {
    return this.modules.has(moduleId);
  }

  /**
   * Get count of registered modules
   * @returns {number}
   */
  getModuleCount() {
    return this.modules.size;
  }

  /**
   * Get count of enabled modules
   * @returns {number}
   */
  getEnabledCount() {
    return Array.from(this.modules.values()).filter(m => m.enabled).length;
  }

  /**
   * Handle message for a specific module
   * @param {string} moduleId - Module ID
   * @param {Object} data - Message data
   */
  async handleModuleMessage(moduleId, data) {
    const module = this.modules.get(moduleId);

    if (!module) {
      console.warn(`[ModuleRegistry] Module ${moduleId} not found for message handling`);
      return;
    }

    if (!module.initialized || !module.enabled) {
      console.warn(`[ModuleRegistry] Module ${moduleId} not initialized or disabled`);
      return;
    }

    if (module.handler.handleMessage) {
      try {
        await module.handler.handleMessage(data);
      } catch (error) {
        console.error(`[ModuleRegistry] Error handling message for ${module.name}:`, error);
      }
    } else {
      console.log(`[ModuleRegistry] Module ${module.name} does not implement handleMessage`);
    }
  }

  /**
   * Cleanup all modules
   */
  cleanup() {
    console.log('[ModuleRegistry] Cleaning up all modules...');

    for (const [id, module] of this.modules) {
      if (module.handler.destroy) {
        try {
          module.handler.destroy();
        } catch (error) {
          console.error(`[ModuleRegistry] Error cleaning up ${module.name}:`, error);
        }
      }
    }

    console.log('[ModuleRegistry] Cleanup complete');
  }
}

// Create a singleton instance
const moduleRegistry = new ModuleRegistry();
