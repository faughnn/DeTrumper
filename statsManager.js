import { sharedState } from './sharedState.js';

class StatsManager {
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
}

export const statsManager = new StatsManager();