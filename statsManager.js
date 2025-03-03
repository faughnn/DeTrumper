import { sharedState } from './sharedState.js';
import { logger } from './logger.js';

class StatsManager {
    constructor() {
        this.sessionStats = this.getInitialStats();
        this.pendingUpdates = 0;
        this.lastStorageUpdate = 0;
        this.storageBatch = this.getInitialStats(); // Initialize with empty stats
        this.BATCH_THRESHOLD = 10; // Number of updates to batch before writing
        this.UPDATE_INTERVAL = 5000; // Milliseconds between forced updates
        this.isInitialized = false;
    }

    async updateStats(matchedWord, siteType) {
        logger.debug('Updating stats for:', matchedWord, 'on site:', siteType);
        
        try {
            const state = await sharedState.getState();
            if (!state.isEnabled) {
                logger.info('Stats update skipped - extension disabled');
                return;
            }
            
            // Ensure we have a valid batch object
            if (!this.storageBatch || !this.isInitialized) {
                await this.initBatchUpdate();
            }
            
            // Double-check that we have a valid storage batch after initialization
            if (!this.storageBatch) {
                logger.warn('Unable to initialize stats storage, using default');
                this.storageBatch = this.getInitialStats();
            }
            
            // Update in-memory batch with null checks
            this.storageBatch.totalBlocked = (this.storageBatch.totalBlocked || 0) + 1;
            
            // Ensure objects exist
            if (!this.storageBatch.siteStats) this.storageBatch.siteStats = {};
            if (!this.storageBatch.wordStats) this.storageBatch.wordStats = {};
            
            this.storageBatch.siteStats[siteType] = (this.storageBatch.siteStats[siteType] || 0) + 1;
            this.storageBatch.wordStats[matchedWord] = (this.storageBatch.wordStats[matchedWord] || 0) + 1;
            
            this.pendingUpdates++;
            
            // Update session stats
            this.updateSessionStats(matchedWord, siteType);
            
            // Decide whether to commit to storage now
            const now = Date.now();
            if (this.pendingUpdates >= this.BATCH_THRESHOLD || now - this.lastStorageUpdate > this.UPDATE_INTERVAL) {
                await this.commitBatchUpdate();
            }
        } catch (error) {
            logger.error('Failed to update stats:', error);
        }
    }

    async initBatchUpdate() {
        try {
            // Get current stats from storage
            const result = await chrome.storage.local.get(['blockStats']);
            this.storageBatch = result.blockStats || this.getInitialStats();
            
            // Ensure the batch has all required properties
            if (!this.storageBatch.totalBlocked) this.storageBatch.totalBlocked = 0;
            if (!this.storageBatch.siteStats) this.storageBatch.siteStats = {};
            if (!this.storageBatch.wordStats) this.storageBatch.wordStats = {};
            if (!this.storageBatch.timeStarted) this.storageBatch.timeStarted = Date.now();
            
            logger.debug('Initialized batch with current stats:', this.storageBatch);
            this.isInitialized = true;
        } catch (error) {
            logger.error('Failed to initialize batch update:', error);
            // Provide a fallback
            this.storageBatch = this.getInitialStats();
            this.isInitialized = true;
        }
    }
    
    async commitBatchUpdate() {
        if (this.pendingUpdates === 0 || !this.storageBatch) return;
        
        try {
            logger.debug('Committing batch update with', this.pendingUpdates, 'pending updates');
            await chrome.storage.local.set({ blockStats: this.storageBatch });
            
            this.lastStorageUpdate = Date.now();
            this.pendingUpdates = 0;
        } catch (error) {
            logger.error('Failed to commit batch update:', error);
        }
    }

    updateSessionStats(matchedWord, siteType) {
        try {
            // Ensure we have valid session stats
            if (!this.sessionStats) {
                this.sessionStats = this.getInitialStats();
            }
            
            this.sessionStats.totalBlocked = (this.sessionStats.totalBlocked || 0) + 1;
            
            // Ensure objects exist
            if (!this.sessionStats.siteStats) this.sessionStats.siteStats = {};
            if (!this.sessionStats.wordStats) this.sessionStats.wordStats = {};
            
            this.sessionStats.siteStats[siteType] = (this.sessionStats.siteStats[siteType] || 0) + 1;
            this.sessionStats.wordStats[matchedWord] = (this.sessionStats.wordStats[matchedWord] || 0) + 1;

            chrome.storage.local.set({ sessionStats: this.sessionStats });
            logger.debug('Session stats updated:', this.sessionStats);
        } catch (error) {
            logger.error('Failed to update session stats:', error);
        }
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
    
    // Make sure to commit any pending updates before extension unloads
    async cleanup() {
        try {
            if (this.pendingUpdates > 0 && this.storageBatch) {
                await this.commitBatchUpdate();
            }
        } catch (error) {
            logger.error('Failed during stats cleanup:', error);
        }
    }
}

export const statsManager = new StatsManager();