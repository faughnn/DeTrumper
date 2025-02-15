import { MUTATION_CHECK_INTERVAL } from './config.js';
import { siteHandlers } from './siteHandlers.js';
import { statsManager } from './statsManager.js';
import { stateManager } from './stateManager.js';
import { logger } from './logger.js';

export class ContentProcessor {
    constructor() {
        this.removedCount = 0;
        this.lastCheck = 0;
    }

    findMatchingWord(text) {
        // Convert text to lowercase
        const lowerText = text.toLowerCase();
        
        // Find first matching word using exact word boundaries
        return stateManager.wordsToRemove.find(targetWord => {
            const wordRegex = new RegExp(`\\b${targetWord.toLowerCase()}\\b`);
            return wordRegex.test(lowerText);
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

            const siteType = siteHandlers.getSiteType();
            logger.debug('Site type:', siteType);
            
            if (siteType === 'other') return;

            siteHandlers.handleLayoutAdjustment(siteType);

            const elements = siteHandlers.getElementsToCheck(siteType);
            logger.debug('Found elements:', elements.length);

            elements.forEach(element => {
                // Remove data-checked handling to ensure we check everything
                const text = element.textContent;
                const matchedWord = this.findMatchingWord(text);
                
                if (matchedWord) {
                    logger.debug('Found matching word in:', text.slice(0, 100));
                    const target = siteHandlers.findBestElementToRemove(element, siteType);
                    if (target && target !== document.body) {
                        try {
                            this.removeElement(target, siteType, text, matchedWord);
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

    removeElement(element, siteType, text, matchedWord) {
        // Immediately remove the element without animation
        this.logRemoval(element, siteType, text, matchedWord);
        element.remove();
    }
}