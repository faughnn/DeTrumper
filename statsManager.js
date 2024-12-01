class StatsManager {
    constructor() {
        this.sessionStats = {
            totalBlocked: 0,
            siteStats: {},
            wordStats: {},
            timeStarted: Date.now()
        };
    }

    async updateStats(matchedWord, siteType) {
        if (!stateManager.isEnabled) return;
        
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

export const statsManager = new StatsManager();
