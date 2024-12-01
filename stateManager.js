import { DEFAULT_WORDS } from './config.js';
import { STATE_TYPES } from './config.js';

class StateManager {
    constructor() {
        this.stateChannel = new BroadcastChannel('detrumper-state-sync');
        this.isEnabled = true;
        this.wordsToRemove = DEFAULT_WORDS;
        this.removedCount = 0;
        this.lastCheck = 0;
        // Make the instance globally available
        window.stateManager = this;
    }

    async initialize() {
        try {
            const state = await chrome.storage.local.get(['isEnabled', 'blockedWords', 'blockStats']);
            
            if (!state.blockedWords) {
                await chrome.storage.local.set({ blockedWords: DEFAULT_WORDS });
            }

            this.wordsToRemove = state.blockedWords || DEFAULT_WORDS;
            this.isEnabled = state.isEnabled !== undefined ? state.isEnabled : true;

            this.broadcastStateRequest();
            await this.waitForStateResponses();

            return {
                isEnabled: this.isEnabled,
                wordsToRemove: this.wordsToRemove,
                removedCount: 0,
                lastCheck: 0
            };
        } catch (error) {
            console.error('State initialization failed:', error);
            return this.getDefaultState();
        }
    }

    setupMessageListeners(contentProcessor) {
        this.stateChannel.onmessage = async (event) => {
            const { type, payload, tabId } = event.data;
            if (tabId === chrome.runtime.id) return;

            switch (type) {
                case STATE_TYPES.WORDS_UPDATED:
                    this.wordsToRemove = payload.words;
                    if (this.isEnabled) {
                        contentProcessor.process();
                    }
                    break;

                case STATE_TYPES.TOGGLE_STATE:
                    this.isEnabled = payload.isEnabled;
                    if (!this.isEnabled) {
                        statsManager.resetSessionStats();
                    } else {
                        contentProcessor.process();
                    }
                    break;

                case STATE_TYPES.REQUEST_STATE:
                    this.respondWithState();
                    break;
            }
        };
    }

    broadcastStateRequest() {
        this.stateChannel.postMessage({
            type: STATE_TYPES.REQUEST_STATE,
            tabId: chrome.runtime.id
        });
    }

    async waitForStateResponses() {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    respondWithState() {
        this.stateChannel.postMessage({
            type: STATE_TYPES.PROVIDE_STATE,
            payload: {
                words: this.wordsToRemove,
                isEnabled: this.isEnabled
            },
            tabId: chrome.runtime.id
        });
    }

    getDefaultState() {
        return {
            isEnabled: true,
            wordsToRemove: DEFAULT_WORDS,
            removedCount: 0,
            lastCheck: 0
        };
    }

    cleanup() {
        this.stateChannel.close();
        delete window.stateManager;
    }
}

export const stateManager = new StateManager();