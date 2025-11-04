# Privacy Policy for StarBase Optimizer

**Last Updated:** November 4, 2025

## Overview

StarBase Optimizer is a Chrome extension designed exclusively for internal use by the StarBase support team to automate workflows in Microsoft Dynamics 365 CRM.

## Data Collection and Usage

### What Data We Collect

The extension stores minimal data locally on your device:
- **User Preferences**: Settings for which automation features are enabled/disabled
- This data is stored using Chrome's local storage API and never leaves your device

### What Data We DO NOT Collect

- We do NOT collect any personal information
- We do NOT collect any CRM data or case information
- We do NOT send any data to external servers
- We do NOT track user behavior or analytics
- We do NOT use cookies
- We do NOT share any data with third parties

### How the Extension Works

The extension:
1. Only operates on `https://starbase.crm4.dynamics.com/*`
2. Reads form fields in the CRM interface to detect user actions
3. Automatically updates case fields based on those actions
4. Stores user preferences locally in the browser

All processing happens locally in your browser. No data is transmitted externally.

## Permissions Explanation

- **storage**: Used to save your feature preferences (which automations are enabled)
- **notifications**: Used to show confirmation messages when automations complete
- **host_permissions** (starbase.crm4.dynamics.com): Required to interact with the CRM interface

## Data Security

Since all data remains local to your browser and the extension operates only on your organization's CRM instance, your data security is maintained by:
1. Your browser's security measures
2. Your organization's network security
3. Microsoft Dynamics 365's security policies

## Changes to This Policy

We may update this privacy policy from time to time. Any changes will be reflected in the "Last Updated" date above.

## Contact

For questions about this privacy policy or the extension, please contact your StarBase IT department.

## Consent

By installing and using StarBase Optimizer, you agree to this privacy policy.
