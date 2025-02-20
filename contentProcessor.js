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

            const siteType = siteRegistry.getSiteType();
            logger.debug('Site type:', siteType);
            
            if (siteType === 'base') return;

            siteRegistry.handleLayoutAdjustment();

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