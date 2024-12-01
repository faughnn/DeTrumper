# DeTrumper Browser Extension

A Chrome extension that removes content containing specific keywords from Reddit and YouTube. Features smooth animations, cross-tab synchronization, and detailed statistics tracking.

## Features

- **Content Filtering**: Automatically removes posts and comments containing specified keywords
- **Multiple Site Support**: Works on both Reddit and YouTube
- **Real-time Updates**: Filters content as you scroll with smooth fade-out animations
- **Cross-tab Synchronization**: Settings and word list stay synchronized across all tabs
- **Statistics Tracking**:
  - Total items hidden
  - Time saved estimation
  - Per-word statistics
  - Per-site statistics
  - Current session statistics
- **Customizable Word List**: Add or remove words through an easy-to-use interface
- **Enable/Disable Toggle**: Quickly turn the extension on/off
- **Persistent Settings**: Your preferences are saved between browser sessions

## Installation

1. Clone this repository
```bash
git clone https://github.com/faughnn/DeTrumper.git
```

2. Load in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked"
   - Select the folder containing the cloned repository

## Usage

1. Click the extension icon in your browser toolbar
2. Add or remove words from the filter list
3. Toggle the extension on/off as needed
4. View statistics about hidden content in the Stats tab

## Default Filtered Words

- trump
- musk
- elon
- rogan

Add or remove words through the extension popup interface.

## Project Structure
```
src/
├── content/
│   ├── config.js
│   ├── stateManager.js
│   ├── siteHandlers.js
│   ├── statsManager.js
│   ├── contentProcessor.js
│   ├── observer.js
│   └── content.js
├── popup/
│   ├── uiManager.js
│   ├── toggleManager.js
│   ├── wordManager.js
│   ├── statsManager.js
│   ├── utils.js
│   └── popup.js
├── styles/
│   ├── popup.css
│   └── reddit-content.css
└── manifest.json
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, please open an issue in the GitHub repository: https://github.com/faughnn/DeTrumper/issues