import { timeUtils } from './utils.js';

class StatsManager {
    async updateStats() {
        const result = await chrome.storage.local.get(['blockStats', 'sessionStats']);
        if (!result.blockStats) return;
        
        const stats = result.blockStats;
        const sessionStats = result.sessionStats || {
            totalBlocked: 0,
            siteStats: {},
            wordStats: {},
            timeStarted: Date.now()
        };
        
        this.updateTotalStats(stats.totalBlocked || 0);
        this.updateTimeSaved(stats.totalBlocked || 0);
        this.updateStatsSection('wordStats', 'All-Time Items Hidden Per Word', stats.wordStats);
        this.updateStatsSection('siteStats', 'All-Time Items Hidden Per Site', stats.siteStats);
        this.updateSessionStats(sessionStats);
    }

    updateTotalStats(totalBlocked) {
        const totalBlockedDiv = document.getElementById('totalBlocked');
        totalBlockedDiv.innerHTML = `
            <div class="stat-box">
                <div class="stat-label">Total Items Hidden</div>
                <div class="stat-value">${totalBlocked.toLocaleString()}</div>
            </div>
        `;
    }

    updateTimeSaved(totalBlocked) {
        const minutesSaved = Math.round((totalBlocked * 15) / 60);
        const timeSavedDiv = document.getElementById('timeSaved');
        timeSavedDiv.innerHTML = `
            <div class="stat-box">
                <div class="stat-label">Estimated Time Saved</div>
                <div class="stat-value">${timeUtils.formatTimeSpent(minutesSaved)}</div>
                <div class="stat-subtitle">Based on 15 seconds per item</div>
            </div>
        `;
    }

    updateStatsSection(elementId, title, stats) {
        const element = document.getElementById(elementId);
        element.innerHTML = `
            <h3>${title}</h3>
            <div class="stat-grid">
                ${Object.entries(stats || {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([key, count]) => `
                        <div class="stat-item">
                            <span class="${elementId === 'wordStats' ? 'word' : 'site'}">${key}</span>
                            <span class="count">${count.toLocaleString()} items</span>
                        </div>
                    `).join('')}
            </div>
        `;
    }

    updateSessionStats(sessionStats) {
        const sessionDuration = Math.round((Date.now() - sessionStats.timeStarted) / 60000);
        const sessionStatsHTML = this.createSessionStatsHTML(sessionStats, sessionDuration);

        let sessionStatsDiv = document.getElementById('sessionStats');
        if (!sessionStatsDiv) {
            sessionStatsDiv = document.createElement('div');
            sessionStatsDiv.id = 'sessionStats';
            document.getElementById('stats').appendChild(sessionStatsDiv);
        }
        sessionStatsDiv.innerHTML = sessionStatsHTML;
    }

    createSessionStatsHTML(sessionStats, sessionDuration) {
        return `
            <div class="stat-section">
                <h3>Current Browser Session</h3>
                <div class="stat-box">
                    <div class="stat-label">Session Duration</div>
                    <div class="stat-value">${timeUtils.formatTimeSpent(sessionDuration)}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Items Hidden This Session</div>
                    <div class="stat-value">${sessionStats.totalBlocked.toLocaleString()}</div>
                </div>
                
                ${this.createStatsGrid('Session Items by Word', sessionStats.wordStats)}
                ${this.createStatsGrid('Session Items by Site', sessionStats.siteStats)}
            </div>
        `;
    }

    createStatsGrid(title, stats) {
        if (!stats || Object.keys(stats).length === 0) return '';
        
        const entries = Object.entries(stats)
            .sort((a, b) => b[1] - a[1]);
            
        return `
            <h4>${title}</h4>
            <div class="stat-grid">
                ${entries.map(([key, count]) => `
                    <div class="stat-item">
                        <span class="word">${key}</span>
                        <span class="count">${count.toLocaleString()} items</span>
                    </div>
                `).join('')}
            </div>
        `;
    }
}

export const statsManager = new StatsManager();
