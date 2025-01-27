import { DEFAULT_WORDS } from './config.js';
import { uiManager } from './uiManager.js';

class WordManager {
    constructor() {
        this.words = DEFAULT_WORDS;
    }

    async initialize() {
        const result = await chrome.storage.local.get(['blockedWords']);
        this.words = result.blockedWords || DEFAULT_WORDS;
        this.updateWordList();
    }

    async addWord() {
        const input = document.getElementById('newWord');
        const word = input.value.trim().toLowerCase();
        
        if (word) {
            if (!this.words.includes(word)) {
                this.words.push(word);
                await this.saveWords();
                input.value = '';
                uiManager.showStatus('Word added!');
                this.notifyContentScript();
            } else {
                uiManager.showStatus('Word already exists!');
            }
        }
    }

    async removeWord(word) {
        this.words = this.words.filter(w => w !== word);
        await this.saveWords();
        uiManager.showStatus('Word removed!');
        this.notifyContentScript();
    }

    async saveWords() {
        await chrome.storage.local.set({ blockedWords: this.words });
        this.updateWordList();
    }

    updateWordList() {
        const wordList = document.getElementById('wordList');
        wordList.innerHTML = '';
        
        this.words.forEach(word => {
            const div = document.createElement('div');
            div.className = 'word-item';
            const capitalizedWord = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            div.innerHTML = `
                <span>${capitalizedWord}</span>
                <button class="delete-btn">Remove</button>
            `;
            wordList.appendChild(div);
        });

        this.setupDeleteButtons();
    }

    setupDeleteButtons() {
        document.querySelectorAll('.delete-btn').forEach(button => {
            button.onclick = () => {
                const word = button.parentElement.querySelector('span').textContent.toLowerCase();
                this.removeWord(word);
            };
        });
    }

    notifyContentScript() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "updateWords",
                isEnabled: true
            });
        });
    }
}

export const wordManager = new WordManager();