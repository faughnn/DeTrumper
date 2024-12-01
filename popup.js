import { uiManager } from './uiManager.js';
import { toggleManager } from './toggleManager.js';
import { wordManager } from './wordManager.js';
import { statsManager } from './statsManagerPopup.js';

document.addEventListener('DOMContentLoaded', async function() {
    await Promise.all([
        toggleManager.initialize(),
        wordManager.initialize(),
        statsManager.initialize()
    ]);
    
    uiManager.initialize();
});

// Cleanup when popup closes
window.addEventListener('unload', () => {
    statsManager.cleanup();
});