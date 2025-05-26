# Account Scanner Chrome Extension

Account Scanner is a Chrome extension that helps you discover all accounts associated with your email by scanning your Gmail inbox for account-related emails. It provides a simple popup UI to trigger a scan and view the results.

## Features

- Scans your Gmail inbox for welcome, registration, and password reset emails
- Extracts and lists websites/services where you have accounts
- Simple, privacy-friendly: does not access or store your passwords
- Results are displayed directly in the extension popup

## How It Works

1. Click the extension icon and press "Scan Gmail".
2. The extension requests permission to access your Gmail (read-only).
3. It fetches recent emails and analyzes them for account-related keywords.
4. The popup displays a list of detected accounts and the total count.

## Privacy & Security

- The extension only requests Gmail read-only access.
- All processing is done locally in your browser.

## Limitations

- Only works with Gmail accounts (for now).
- May not detect every account if emails are missing or use unusual formats.

## Acknowledgements

This extension uses account deletion data from [justdeleteme.xyz](https://justdeleteme.xyz/). Huge thanks to the justdeleteme project and its contributors for maintaining this valuable resource.

---

*For questions or support, please contact the project maintainer.*