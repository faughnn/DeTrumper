(function () {
    'use strict';

    class UIManager {
        constructor() {
            this.initialized = false;
            this.wordManager = null;
            this.statsManager = null;
        }

        initialize(wordManager, statsManager) {
            if (this.initialized) return;

            this.wordManager = wordManager;
            this.statsManager = statsManager;

            document.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', () => this.handleTabClick(tab));
            });

            document.getElementById('addWord').addEventListener('click', () => this.wordManager.addWord());
            document.getElementById('newWord').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.wordManager.addWord();
            });

            this.statsManager.updateStats();
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
                this.statsManager.updateStats();
            }
        }

        showStatus(message) {
            const status = document.getElementById('status');
            status.textContent = message;
            setTimeout(() => status.textContent = '', 2000);
        }
    }

    const uiManager = new UIManager();

    class ToggleManager {
        constructor() {
            this.isEnabled = true;
            this.toggleEl = null;
        }

        initialize() {
            this.toggleEl = document.getElementById('toggleExtension');
            this.loadState();
            this.setupEventListeners();
        }

        async loadState() {
            const result = await chrome.storage.local.get(['isEnabled']);
            this.isEnabled = result.isEnabled !== undefined ? result.isEnabled : true;
            // Set initial state without animation
            this.toggleEl.checked = this.isEnabled;
        }

        setupEventListeners() {
            this.toggleEl.addEventListener('change', () => this.toggleState());
        }

        async toggleState() {
            this.isEnabled = !this.isEnabled;
            await chrome.storage.local.set({ isEnabled: this.isEnabled });
            this.notifyTabs();
        }

        async notifyTabs() {
            const tabs = await chrome.tabs.query({});
            tabs.forEach(tab => {
                // Check if tab.url exists before trying to use includes()
                if (tab.url && (tab.url.includes('reddit.com') || tab.url.includes('youtube.com'))) {
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
     // ms

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

                this.updateMainStats(stats.totalBlocked || 0);
                this.updateStatsSection('wordStats', 'Words Filtered', stats.wordStats || {});
                this.updateStatsSection('siteStats', 'Sites Filtered', stats.siteStats || {});
                this.updateSessionStats(sessionStats);
            } catch (error) {
                console.error('Failed to update stats:', error);
                this.showError();
            }
        }

        updateMainStats(totalBlocked) {
            const totalBlockedEl = document.getElementById('totalBlocked');
            const timeSavedEl = document.getElementById('timeSaved');
            const minutesSaved = Math.round((totalBlocked * 15) / 60);

            if (totalBlockedEl && timeSavedEl) {
                totalBlockedEl.innerHTML = `
                <div class="main-stat">
                    <div class="stat-section-title">Total Items Hidden</div>
                    <div class="stat-value">${totalBlocked.toLocaleString()}</div>
                </div>
            `;

                timeSavedEl.innerHTML = `
                <div class="main-stat">
                    <div class="stat-section-title">Time Saved</div>
                    <div class="stat-value">${timeUtils.formatTimeSpent(minutesSaved)}</div>
                    <div class="stat-subtitle">Based on 15 seconds per item</div>
                </div>
            `;
            }
        }

        updateStatsSection(elementId, title, stats) {
            const el = document.getElementById(elementId);
            if (!el) return;

            // For site stats, ensure 'undefined' is categorized as 'Other Sites'
            const items = Object.entries(stats)
                .map(([key, value]) => ({
                    label: elementId === 'siteStats' && key === 'undefined' ? 'Other Sites' : key,
                    count: value
                }))
                .sort((a, b) => b.count - a.count);

            if (items.length === 0) {
                el.innerHTML = `
                <div class="stat-section">
                    <div class="stat-section-title">${title}</div>
                    <div class="stat-empty">No items filtered yet</div>
                </div>
            `;
                return;
            }

            el.innerHTML = `
            <div class="stat-section">
                <div class="stat-section-title">${title}</div>
                <div class="stat-list">
                    ${items.map(item => `
                        <div class="stat-item">
                            <span class="label">${this.formatLabel(item.label)}</span>
                            <span class="count">${item.count.toLocaleString()}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        }

        updateSessionStats(sessionStats) {
            const el = document.getElementById('sessionStats');
            if (!el) return;

            const sessionDuration = Math.round((Date.now() - sessionStats.timeStarted) / 60000);

            el.innerHTML = `
            <div class="stat-section">
                <div class="stat-section-title">Current Session</div>
                <div class="session-stats">
                    <div class="session-stat">
                        <div class="stat-label">Duration</div>
                        <div class="stat-value">${timeUtils.formatTimeSpent(sessionDuration)}</div>
                    </div>
                    <div class="session-stat">
                        <div class="stat-label">Items Hidden</div>
                        <div class="stat-value">${sessionStats.totalBlocked.toLocaleString()}</div>
                    </div>
                </div>
            </div>
        `;
        }

        showError() {
            const statsContainer = document.getElementById('stats');
            if (statsContainer) {
                statsContainer.innerHTML = `
                <div class="stat-section">
                    <div class="error-box">
                        <div class="stat-label">Error loading statistics</div>
                        <div class="stat-subtitle">Please try reloading the extension</div>
                    </div>
                </div>
            `;
            }
        }

        formatLabel(key) {
            return key.charAt(0).toUpperCase() + key.slice(1);
        }
    }

    const statsManager = new StatsManager();

    document.addEventListener('DOMContentLoaded', async function() {
        await Promise.all([
            toggleManager.initialize(),
            wordManager.initialize(),
            statsManager.initialize()
        ]);
        
        uiManager.initialize(wordManager, statsManager);
    });

    // Cleanup when popup closes
    window.addEventListener('unload', () => {
        statsManager.cleanup();
    });

})();
