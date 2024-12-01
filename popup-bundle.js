(function () {
    'use strict';

    class ToggleManager {
        constructor() {
            this.isEnabled = true;
            this.toggleBtn = null;
        }

        initialize() {
            this.toggleBtn = document.getElementById('toggleExtension');
            this.loadState();
            this.setupEventListeners();
        }

        async loadState() {
            const result = await chrome.storage.local.get(['isEnabled']);
            this.isEnabled = result.isEnabled !== undefined ? result.isEnabled : true;
            this.updateToggleButton();
        }

        setupEventListeners() {
            this.toggleBtn.addEventListener('click', () => this.toggleState());
        }

        async toggleState() {
            this.isEnabled = !this.isEnabled;
            
            await chrome.storage.local.set({ isEnabled: this.isEnabled });
            this.updateToggleButton();
            this.notifyTabs();
        }

        updateToggleButton() {
            this.toggleBtn.textContent = this.isEnabled ? 'ON' : 'OFF';
            this.toggleBtn.style.backgroundColor = this.isEnabled ? '#1a73e8' : '#dc3545';
            this.toggleBtn.classList.toggle('active', this.isEnabled);
        }

        async notifyTabs() {
            const tabs = await chrome.tabs.query({});
            tabs.forEach(tab => {
                if (tab.url.includes('reddit.com') || tab.url.includes('youtube.com')) {
                    chrome.tabs.sendMessage(tab.id, {
                        action: "updateWords",
                        isEnabled: this.isEnabled
                    }).catch(() => {
                        // Ignore errors for inactive tabs
                    });
                }
            });
        }
    }

    const toggleManager = new ToggleManager();

    const DEFAULT_WORDS = ['trump', 'musk', 'elon', 'rogan'];

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

    const wordManager = new WordManager();

    class SharedState {
        constructor() {
            this.isEnabled = true;
            this.wordsToRemove = DEFAULT_WORDS;
        }

        async getState() {
            const result = await chrome.storage.local.get(['isEnabled', 'blockedWords']);
            return {
                isEnabled: result.isEnabled !== undefined ? result.isEnabled : true,
                wordsToRemove: result.blockedWords || DEFAULT_WORDS
            };
        }

        async setState(state) {
            await chrome.storage.local.set({
                isEnabled: state.isEnabled,
                blockedWords: state.wordsToRemove
            });
        }
    }

    const sharedState = new SharedState();

    class StatsManager {
        constructor() {
            this.sessionStats = this.getInitialStats();
        }

        async updateStats(matchedWord, siteType) {
            const state = await sharedState.getState();
            if (!state.isEnabled) return;
            
            try {
                const result = await chrome.storage.local.get(['blockStats']);
                let stats = result.blockStats || this.getInitialStats();

                stats.totalBlocked += 1;
                stats.siteStats[siteType] = (stats.siteStats[siteType] || 0) + 1;
                stats.wordStats[matchedWord] = (stats.wordStats[matchedWord] || 0) + 1;

                await chrome.storage.local.set({ blockStats: stats });
                this.updateSessionStats(matchedWord, siteType);
            } catch (error) {
                console.error('Failed to update stats:', error);
            }
        }

        updateSessionStats(matchedWord, siteType) {
            this.sessionStats.totalBlocked += 1;
            this.sessionStats.siteStats[siteType] = (this.sessionStats.siteStats[siteType] || 0) + 1;
            this.sessionStats.wordStats[matchedWord] = (this.sessionStats.wordStats[matchedWord] || 0) + 1;

            chrome.storage.local.set({ sessionStats: this.sessionStats });
        }

        resetSessionStats() {
            this.sessionStats = this.getInitialStats();
            chrome.storage.local.set({ sessionStats: this.sessionStats });
        }

        getInitialStats() {
            return {
                totalBlocked: 0,
                siteStats: {},
                wordStats: {},
                timeStarted: Date.now()
            };
        }
    }

    const statsManager = new StatsManager();

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

    const uiManager = new UIManager();

    document.addEventListener('DOMContentLoaded', async function() {
        await Promise.all([
            toggleManager.initialize(),
            wordManager.initialize()
        ]);
        
        uiManager.initialize();
    });

})();
