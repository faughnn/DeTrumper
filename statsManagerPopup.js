import { timeUtils } from './utils.js';

class StatsManager {
    async updateStats() {
        console.log('Updating popup stats...');
        try {
            const result = await chrome.storage.local.get(['blockStats', 'sessionStats']);
            console.log('Retrieved stats from storage:', result);
            
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
            
            console.log('Processing stats:', { stats, sessionStats });
            
            this.updateTotalStats(stats.totalBlocked || 0);
            this.updateTimeSaved(stats.totalBlocked || 0);
            
            if (stats.wordStats && Object.keys(stats.wordStats).length > 0) {
                this.updateStatsSection('wordStats', 'All-Time Items Hidden Per Word', stats.wordStats);
            } else {
                console.log('No word stats available');
                this.showNoDataMessage('wordStats', 'All-Time Items Hidden Per Word');
            }
            
            if (stats.siteStats && Object.keys(stats.siteStats).length > 0) {
                this.updateStatsSection('siteStats', 'All-Time Items Hidden Per Site', stats.siteStats);
            } else {
                console.log('No site stats available');
                this.showNoDataMessage('siteStats', 'All-Time Items Hidden Per Site');
            }
            
            if (sessionStats && sessionStats.timeStarted) {
                const sessionDuration = Math.round((Date.now() - sessionStats.timeStarted) / 60000);
                this.updateSessionStats(sessionStats, sessionDuration);
            } else {
                console.log('No session stats available');
            }
        } catch (error) {
            console.error('Failed to update stats:', error);
            this.showError();
        }
    }

    showNoDataMessage(elementId, title) {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `
                <h3>${title}</h3>
                <div class="stat-box">
                    <div class="stat-label">No items hidden yet</div>
                </div>
            `;
        }
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

    // ... rest of the class remains the same
}

export const statsManager = new StatsManager();