import { DEFAULT_WORDS } from './config.js';

class SharedState {
    constructor() {
        this.isEnabled = true;
        this.wordsToRemove = DEFAULT_WORDS;
    }

    async getState() {
        const result = await chrome.storage.local.get(['isEnabled', 'blockedWords']);
        return {
            isEnabled: result.isEnabled !== undefined ? result.isEnabled : true,
            wordsToRemove: result.blockedWords || DEFAULT_WORDS
        };
    }

    async setState(state) {
        await chrome.storage.local.set({
            isEnabled: state.isEnabled,
            blockedWords: state.wordsToRemove
        });
    }
}

export const sharedState = new SharedState();