import { uiManager } from './uiManager.js';
import { toggleManager } from './toggleManager.js';
import { wordManager } from './wordManager.js';

document.addEventListener('DOMContentLoaded', async function() {
    await Promise.all([
        toggleManager.initialize(),
        wordManager.initialize()
    ]);
    
    uiManager.initialize();
});
