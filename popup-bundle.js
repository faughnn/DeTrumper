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

    let StatsManager$1 = class StatsManager {
        constructor() {
            this.sessionStats = this.getInitialStats();
        }

        async updateStats(matchedWord, siteType) {
            console.log('Updating stats for:', matchedWord, 'on site:', siteType);
            
            const state = await sharedState.getState();
            if (!state.isEnabled) {
                console.log('Stats update skipped - extension disabled');
                return;
            }
            
            try {
                const result = await chrome.storage.local.get(['blockStats']);
                console.log('Current stored stats:', result.blockStats);
                
                let stats = result.blockStats || this.getInitialStats();

                stats.totalBlocked += 1;
                stats.siteStats[siteType] = (stats.siteStats[siteType] || 0) + 1;
                stats.wordStats[matchedWord] = (stats.wordStats[matchedWord] || 0) + 1;

                console.log('Saving updated stats:', stats);
                await chrome.storage.local.set({ blockStats: stats });
                
                this.updateSessionStats(matchedWord, siteType);
                console.log('Session stats updated:', this.sessionStats);
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
    };

    const statsManager$1 = new StatsManager$1();

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

            statsManager$1.updateStats();
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
                statsManager$1.updateStats();
            }
        }

        showStatus(message) {
            const status = document.getElementById('status');
            status.textContent = message;
            setTimeout(() => status.textContent = '', 2000);
        }
    }

    const uiManager = new UIManager();

    class TimeUtils {
        formatTimeSpent(minutes) {
            if (minutes < 60) {
                return `${minutes} minutes`;
            } else {
                const hours = Math.floor(minutes / 60);
                const remainingMinutes = minutes % 60;
                if (remainingMinutes === 0) {
                    return `${hours} hour${hours !== 1 ? 's' : ''}`;
                }
                return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} min`;
            }
        }
    }

    const timeUtils = new TimeUtils();

    class StatsManager {
        constructor() {
            this.updateInterval = null;
        }

        async initialize() {
            await this.updateStats();
            // Update stats every 2 seconds while popup is open
            this.updateInterval = setInterval(() => this.updateStats(), 2000);
        }

        cleanup() {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
            }
        }

        async updateStats() {
            try {
                const result = await chrome.storage.local.get(['blockStats', 'sessionStats']);
                console.log('Retrieved stats:', result);

                const stats = result.blockStats || {
                    totalBlocked: 0,
                    siteStats: {},
                    wordStats: {}
                };

                const sessionStats = result.sessionStats || {
                    totalBlocked: 0,
                    siteStats: {},
                    wordStats: {},
                    timeStarted: Date.now()
                };

                this.updateTotalStats(stats.totalBlocked || 0);
                this.updateTimeSaved(stats.totalBlocked || 0);
                this.updateStatsSection('wordStats', 'Words Filtered', stats.wordStats || {});
                this.updateStatsSection('siteStats', 'Sites Filtered', stats.siteStats || {});
                this.updateSessionStats(sessionStats);
            } catch (error) {
                console.error('Failed to update stats:', error);
                this.showError();
            }
        }

        updateTotalStats(totalBlocked) {
            const el = document.getElementById('totalBlocked');
            if (el) {
                el.innerHTML = `
                <div class="stat-box">
                    <div class="stat-label">Total Items Hidden</div>
                    <div class="stat-value">${totalBlocked.toLocaleString()}</div>
                </div>
            `;
            }
        }

        updateTimeSaved(totalBlocked) {
            const minutesSaved = Math.round((totalBlocked * 15) / 60);
            const el = document.getElementById('timeSaved');
            if (el) {
                el.innerHTML = `
                <div class="stat-box">
                    <div class="stat-label">Estimated Time Saved</div>
                    <div class="stat-value">${timeUtils.formatTimeSpent(minutesSaved)}</div>
                    <div class="stat-subtitle">Based on 15 seconds per item</div>
                </div>
            `;
            }
        }

        updateStatsSection(elementId, title, stats) {
            const el = document.getElementById(elementId);
            if (!el) return;

            const items = Object.entries(stats)
                .sort(([, a], [, b]) => b - a)
                .map(([key, value]) => ({
                    label: key,
                    count: value
                }));

            if (items.length === 0) {
                el.innerHTML = `
                <h3>${title}</h3>
                <div class="stat-box empty">
                    <div class="stat-label">No items filtered yet</div>
                </div>
            `;
                return;
            }

            el.innerHTML = `
            <h3>${title}</h3>
            <div class="stat-grid">
                ${items.map(item => `
                    <div class="stat-item">
                        <span class="label">${item.label}</span>
                        <span class="count">${item.count.toLocaleString()} items</span>
                    </div>
                `).join('')}
            </div>
        `;
        }

        updateSessionStats(sessionStats) {
            const el = document.getElementById('sessionStats');
            if (!el) return;

            const sessionDuration = Math.round((Date.now() - sessionStats.timeStarted) / 60000);

            el.innerHTML = `
            <div class="stat-section">
                <h3>Current Session</h3>
                <div class="stat-box">
                    <div class="stat-label">Session Duration</div>
                    <div class="stat-value">${timeUtils.formatTimeSpent(sessionDuration)}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Items Hidden This Session</div>
                    <div class="stat-value">${sessionStats.totalBlocked.toLocaleString()}</div>
                </div>
            </div>
        `;
        }

        showError() {
            const statsContainer = document.getElementById('stats');
            if (statsContainer) {
                statsContainer.innerHTML = `
                <div class="stat-box error">
                    <div class="stat-label">Error loading statistics</div>
                    <div class="stat-subtitle">Please try reloading the extension</div>
                </div>
            `;
            }
        }
    }

    const statsManager = new StatsManager();

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

})();
