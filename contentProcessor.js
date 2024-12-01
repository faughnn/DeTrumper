import { ANIMATION_DURATION, MUTATION_CHECK_INTERVAL } from './config.js';
import { siteHandlers } from './siteHandlers.js';
import { statsManager } from './statsManager.js';
import { sharedState } from './sharedState.js';

class ContentProcessor {
    constructor() {
        this.removedCount = 0;
        this.lastCheck = 0;
    }

    findMatchingWord(text) {
        return sharedState.wordsToRemove.find(word => 
            text.toLowerCase().includes(word.toLowerCase())
        );
    }

    logRemoval(element, siteType, text) {
        const matchedWord = this.findMatchingWord(text);
        console.log('🗑️ Removed:', {
            site: siteType,
            type: element.tagName,
            classes: element.className,
            matchedWord: matchedWord,
            text: text.slice(0, 100).trim() + (text.length > 100 ? '...' : ''),
            count: ++this.removedCount
        });

        if (matchedWord) {
            statsManager.updateStats(matchedWord, siteType);
        }
    }

    async process() {
        try {
            const state = await sharedState.getState();
            if (!state.isEnabled) return;

            const now = Date.now();
            if (now - this.lastCheck < MUTATION_CHECK_INTERVAL) return;
            this.lastCheck = now;

            const siteType = siteHandlers.getSiteType();
            console.log('Site type:', siteType);
            
            if (siteType === 'other') return;

            siteHandlers.handleLayoutAdjustment(siteType);

            const elements = siteHandlers.getElementsToCheck(siteType);
            console.log('Found elements:', elements.length);

            elements.forEach(element => {
                if (element.hasAttribute('data-checked')) return;
                
                const text = element.textContent.toLowerCase();
                if (state.wordsToRemove.some(word => text.includes(word.toLowerCase()))) {
                    console.log('Found matching word in:', text.slice(0, 100));
                    const target = siteHandlers.findBestElementToRemove(element, siteType);
                    if (target && target !== document.body) {
                        this.removeElement(target, siteType, text);
                    }
                }
                element.setAttribute('data-checked', 'true');
            });
        } catch (error) {
            console.error('Error in process:', error);
        }
    }

    removeElement(element, siteType, text) {
        element.classList.add('removed');
        element.style.transition = 'opacity 0.3s ease-out';
        element.style.opacity = '0';
        
        setTimeout(() => {
            this.logRemoval(element, siteType, text);
            element.remove();
        }, ANIMATION_DURATION);
    }
}

export const contentProcessor = new ContentProcessor();