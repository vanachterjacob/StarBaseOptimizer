# StarBase Optimizer

A Chrome extension that automates workflows in Microsoft Dynamics 365 CRM for the StarBase support team.

## Features

### Case 1: Auto-set "First Response Sent" to Yes
Automatically updates the "First Response Sent" field from "No" to "Yes" when you send an email in a support case.

**How it works:**
- Monitors the CRM timeline for email send events
- Detects when you click the send button in email composer
- Automatically updates the "First Response Sent" dropdown to "Yes"
- Shows a visual notification confirming the update

## Installation

### Prerequisites
- Google Chrome browser (version 88 or higher)
- Access to starbase.crm4.dynamics.com

### Steps

1. **Generate Icons (First Time Only)**
   - Open `icons/generate-icons.html` in your browser
   - Click "Generate Icons"
   - Right-click each canvas and save as PNG:
     - Save first as `icon16.png`
     - Save second as `icon48.png`
     - Save third as `icon128.png`
   - All files should be saved in the `icons/` directory

2. **Load Extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right corner)
   - Click "Load unpacked"
   - Select the `StarBaseOptimizer` directory
   - The extension should now appear in your extensions list

3. **Verify Installation**
   - You should see the StarBase Optimizer icon in your Chrome toolbar
   - Click the icon to open the popup and verify it shows "Extension is active"

## Usage

### Basic Operation

1. **Enable/Disable Extension**
   - Click the StarBase Optimizer icon in your Chrome toolbar
   - Use the toggle switch to enable or disable automation
   - The status indicator shows whether the extension is active (green) or disabled (red)

2. **Working with Cases**
   - Navigate to any case on starbase.crm4.dynamics.com
   - When you send an email, the extension will automatically:
     - Detect the email send event
     - Update "First Response Sent" to "Yes" (if it was "No")
     - Display a success notification in the top-right corner

3. **Visual Feedback**
   - Success notifications appear when the field is updated
   - Notifications automatically disappear after 3 seconds
   - All actions are logged to the browser console for debugging

### Troubleshooting

**Extension not working?**
- Verify the extension is enabled (check the popup)
- Refresh the CRM page after enabling the extension
- Check the browser console (F12) for error messages
- Ensure you're on starbase.crm4.dynamics.com

**Field not updating automatically?**
- The field may already be set to "Yes"
- The extension requires a page refresh after installation
- Check console logs for detailed information

**No notifications showing?**
- Verify notifications are enabled in Chrome settings
- The extension shows both in-page and Chrome notifications
- In-page notifications appear in the top-right corner

## Project Structure

```
StarBaseOptimizer/
├── manifest.json              # Extension configuration (Manifest V3)
├── background.js              # Service worker for state management
├── content-script.js          # Main entry point
├── popup.html                 # Extension popup UI
├── popup.css                  # Popup styling
├── popup.js                   # Popup logic
├── modules/
│   └── case1.js              # Case 1 handler (modular architecture)
├── utils/
│   ├── observer.js           # DOM monitoring utilities
│   └── notifications.js      # Visual feedback system
├── icons/
│   ├── icon16.png            # 16x16 icon
│   ├── icon48.png            # 48x48 icon
│   ├── icon128.png           # 128x128 icon
│   ├── icon.svg              # Source SVG icon
│   └── generate-icons.html   # Icon generator tool
└── README.md                  # This file
```

## Architecture

### Modular Design
The extension is built with an extensible architecture to easily add more automation cases in the future.

- **Modules**: Each case is implemented as a separate module (`modules/case1.js`, etc.)
- **Utils**: Reusable utilities for DOM observation and notifications
- **Content Script**: Orchestrates all modules and manages state
- **Background Worker**: Handles notifications and cross-tab communication

### Key Components

1. **DOMObserver** (`utils/observer.js`)
   - Monitors DOM changes in the CRM
   - Provides utilities to wait for elements and watch for changes
   - Handles timeline activity monitoring

2. **NotificationManager** (`utils/notifications.js`)
   - Shows in-page notifications with animations
   - Supports different notification types (success, error, info, warning)
   - Sends Chrome notifications via background worker

3. **Case1Handler** (`modules/case1.js`)
   - Detects email send events
   - Checks current field value
   - Updates field to "Yes" with proper timing
   - Prevents duplicate processing with cooldown

## Development

### Adding New Cases

To add a new automation case:

1. Create a new module file: `modules/case2.js`
2. Implement the case handler with `init()` method
3. Add the module to `manifest.json` content_scripts
4. Initialize the handler in `content-script.js`
5. Update the features list in `popup.html`

Example structure:
```javascript
class Case2Handler {
  constructor() {
    // Initialize properties
  }

  async init() {
    // Setup event listeners and observers
  }

  // Additional methods...
}

const case2Handler = new Case2Handler();
```

### Debugging

Enable detailed logging:
1. Open Chrome DevTools (F12)
2. Go to Console tab
3. Look for messages prefixed with `[StarBase Optimizer]`

All major operations are logged with context:
- Extension initialization
- Case handler initialization
- Event detection
- Field updates
- Errors

## Technical Details

- **Manifest Version**: V3 (latest Chrome extension standard)
- **Permissions**: `storage`, `notifications`
- **Host Permissions**: `https://starbase.crm4.dynamics.com/*`
- **Content Scripts**: Injected at `document_idle` for optimal performance
- **Background**: Service worker for persistent state management

## Version History

### v1.0.0 (Current)
- Initial release
- Case 1: Auto-set "First Response Sent" to Yes
- Enable/disable toggle
- Visual feedback notifications
- Modular architecture for extensibility

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review browser console logs
3. Verify extension is up to date
4. Contact the development team

## License

Internal tool for StarBase support team.

## Credits

Developed for StarBase CRM workflow optimization.
