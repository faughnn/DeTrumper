import { toggleManager } from './toggleManager.js';
import { wordManager } from './wordManager.js';
import { statsManager } from './statsManager.js';

class UIManager {
    constructor() {
        this.initialized = false;
    }

    initialize() {
        if (this.initialized) return;

        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.handleTabClick(tab));
        });

        document.getElementById('addWord').addEventListener('click', () => wordManager.addWord());
        document.getElementById('newWord').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') wordManager.addWord();
        });

        statsManager.updateStats();
        this.initialized = true;
    }

    handleTabClick(tab) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const contentElement = document.getElementById(tab.dataset.tab);
        contentElement.classList.add('active');
        
        if (tab.dataset.tab === 'stats') {
            statsManager.updateStats();
        }
    }

    showStatus(message) {
        const status = document.getElementById('status');
        status.textContent = message;
        setTimeout(() => status.textContent = '', 2000);
    }
}

export const uiManager = new UIManager();
