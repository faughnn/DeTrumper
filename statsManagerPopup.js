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

export const statsManager = new StatsManager();