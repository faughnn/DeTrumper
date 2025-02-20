// contentProcessor.js
import { MUTATION_CHECK_INTERVAL } from './config.js';
import { siteRegistry } from './siteRegistry.js';
import { statsManager } from './statsManager.js';
import { stateManager } from './stateManager.js';
import { logger } from './logger.js';

export class ContentProcessor {
    constructor() {
        this.removedCount = 0;
        this.lastCheck = 0;
        this.processedTexts = new Set(); // Track processed content
    }

    // Utility function to escape special regex characters
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Simple hash function for text content
    hashText(text) {
        let hash = 0;
        for (let i = 0; i < Math.min(text.length, 1000); i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash;
    }

    findMatchingWord(text) {
        // Skip empty text
        if (!text || text.trim() === '') return null;
        
        // Hash long text to avoid memory issues
        const textHash = this.hashText(text);
        if (this.processedTexts.has(textHash)) {
            return null;
        }
        
        // Add to processed set
        this.processedTexts.add(textHash);
        
        // Convert text to lowercase
        const lowerText = text.toLowerCase();
        
        // Find first matching word using a more robust pattern
        return stateManager.wordsToRemove.find(targetWord => {
            try {
                // More robust pattern that handles various word boundaries
                const safeWord = this.escapeRegExp(targetWord.toLowerCase());
                const wordRegex = new RegExp(`(^|[^a-zA-Z0-9])${safeWord}([^a-zA-Z0-9]|$)`, 'i');
                return wordRegex.test(lowerText);
            } catch (error) {
                logger.error('Regex error for word:', targetWord, error);
                // Fallback to simple includes check if regex fails
                return lowerText.includes(targetWord.toLowerCase());
            }
        });
    }

    logRemoval(element, siteType, text, matchedWord) {
        logger.info('Removed:', {
            site: siteType,
            type: element.tagName,
            classes: element.className,
            matchedWord: matchedWord,
            text: text.slice(0, 100).trim() + (text.length > 100 ? '...' : ''),
            count: ++this.removedCount
        });

        if (matchedWord) {
            logger.debug('Calling updateStats with:', matchedWord, siteType);
            statsManager.updateStats(matchedWord, siteType);
        }
    }

    async process() {
        try {
            if (!stateManager.isEnabled) return;

            const now = Date.now();
            if (now - this.lastCheck < MUTATION_CHECK_INTERVAL) return;
            this.lastCheck = now;

            const siteType = siteRegistry.getSiteType();
            logger.debug('Site type:', siteType);
            
            if (siteType === 'base') return;

            siteRegistry.handleLayoutAdjustment();

            // Check if the site handler has a custom content processing method
            const currentHandler = siteRegistry.getCurrentSiteHandler();
            if (currentHandler.handleContentProcessing && currentHandler.handleContentProcessing(this)) {
                // If the handler returns true, it has handled the processing, so we can return
                return;
            }

            // Standard processing for sites without custom handlers
            const elements = siteRegistry.getElementsToCheck();
            logger.debug('Found elements:', elements.length);

            elements.forEach(element => {
                const text = element.textContent;
                const matchedWord = this.findMatchingWord(text);
                
                if (matchedWord) {
                    logger.debug('Found matching word in:', text.slice(0, 100));
                    const target = siteRegistry.findBestElementToRemove(element);
                    if (target && target !== document.body) {
                        try {
                            siteRegistry.removeElement(target, matchedWord, this.logRemoval.bind(this));
                        } catch (error) {
                            logger.error('Failed to remove element:', error);
                        }
                    }
                }
            });
        } catch (error) {
            logger.error('Error in process:', error);
        }
    }
}