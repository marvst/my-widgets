# Overlay Website Widgets

An Electron-based overlay application that allows you to add and view multiple websites as widgets in a transparent, always-on-top window.

## Features

- **System Tray**: App runs in the background and stays in system tray
- **Overlay Mode**: Transparent, frameless window that stays on top of other applications
- **Quick Toggle**: Press `Ctrl+Shift+Space` to show/hide the overlay
- **ESC to Close**: Press `ESC` to hide the overlay (app stays running in tray)
- **Website Widgets**: Add any website as a widget that loads and displays live content
- **Popup Support**: Websites can open popups that launch in your default browser
- **Flexible Sizing**: Set custom dimensions or use 100% width/height for fullscreen widgets
- **Widget Management**: Easily add and remove widgets
- **Persistent Storage**: Your widgets are saved and restored between sessions

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the app:
   ```bash
   npm start
   ```

## Building an Executable

To create a portable Windows executable:

1. Install electron-packager (if not already installed):
   ```bash
   npm install --save-dev electron-packager
   ```

2. Build the portable application:
   ```bash
   npx electron-packager . "Overlay Widgets" --platform=win32 --arch=x64 --out=dist --overwrite
   ```

3. The portable app will be created in `dist\Overlay Widgets-win32-x64\`
   - Run `Overlay Widgets.exe` to launch the app
   - The entire folder is portable - copy it anywhere to use

**Note**: The build process may take a few minutes. The output is a portable application that doesn't require installation - just run the .exe file directly.

### Alternative: Add a build script to package.json

You can add this to your `scripts` section in package.json:
```json
"build:portable": "electron-packager . \"Overlay Widgets\" --platform=win32 --arch=x64 --out=dist --overwrite"
```

Then simply run:
```bash
npm run build:portable
```

### Optional: Custom Icon
To use a custom icon for your app:
1. Add the `--icon=path/to/icon.ico` flag to the electron-packager command
2. Example: `npx electron-packager . "Overlay Widgets" --platform=win32 --arch=x64 --out=dist --overwrite --icon=icon.ico`

## Usage

### Launching the App
```bash
npm start
```

### Keyboard Shortcuts
- **Ctrl+Shift+Space**: Toggle overlay visibility
- **ESC**: Hide the overlay

### System Tray
- The app runs in the system tray (notification area) even when the overlay is hidden
- **Right-click the tray icon** to access the menu:
  - Show Overlay: Bring the overlay window to front
  - Toggle Overlay: Show/hide the overlay
  - Quit: Exit the application completely
- **Double-click the tray icon** to quickly toggle the overlay

### Adding Widgets
1. Click the "+ Add Widget" button
2. Enter a name for your widget (e.g., "YouTube", "Gmail")
3. Enter the website URL (e.g., "https://youtube.com")
4. Optionally adjust the width and height (in pixels)
   - Or check "Full Width (100%)" to make the widget span the entire width
   - Or check "Full Height (100%)" to make the widget use maximum height
5. Click "Add Widget"

**Note**: Widgets support popups - any popup links will open in your default browser.

### Removing Widgets
- Click the "Remove" button on any widget to delete it

## Examples of Useful Widgets

- Email clients (Gmail, Outlook)
- Social media (Twitter, LinkedIn)
- Music players (YouTube, Spotify Web Player)
- Productivity tools (Notion, Trello)
- News sites
- Analytics dashboards

## Technical Details

- Built with Electron
- Uses webview tags for embedding websites
- IPC communication for secure data handling
- Data stored in user data directory as JSON

## File Structure

```
overlay/
├── package.json          # Project configuration
├── main.js              # Main Electron process
├── preload.js           # Preload script for IPC
└── renderer/
    ├── index.html       # UI structure
    ├── styles.css       # Styling
    └── renderer.js      # UI logic
```

## Notes

- Some websites may not load properly due to X-Frame-Options or CSP headers
- The app requires webview support (enabled by default in this configuration)
- Widget configurations are saved in your system's user data directory
