import { timeUtils } from './utils.js';

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

export const statsManager = new StatsManager();