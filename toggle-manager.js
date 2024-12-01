class ToggleManager {
    constructor() {
        this.isEnabled = true;
        this.toggleBtn = null;
    }

    initialize() {
        this.toggleBtn = document.getElementById('toggleExtension');
        this.loadState();
        this.setupEventListeners();
    }

    async loadState() {
        const result = await chrome.storage.local.get(['isEnabled']);
        this.isEnabled = result.isEnabled !== undefined ? result.isEnabled : true;
        this.updateToggleButton();
    }

    setupEventListeners() {
        this.toggleBtn.addEventListener('click', () => this.toggleState());
    }

    async toggleState() {
        this.isEnabled = !this.isEnabled;
        
        await chrome.storage.local.set({ isEnabled: this.isEnabled });
        this.updateToggleButton();
        this.notifyTabs();
    }

    updateToggleButton() {
        this.toggleBtn.textContent = this.isEnabled ? 'ON' : 'OFF';
        this.toggleBtn.style.backgroundColor = this.isEnabled ? '#1a73e8' : '#dc3545';
        this.toggleBtn.classList.toggle('active', this.isEnabled);
    }

    async notifyTabs() {
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => {
            if (tab.url.includes('reddit.com') || tab.url.includes('youtube.com')) {
                chrome.tabs.sendMessage(tab.id, {
                    action: "updateWords",
                    isEnabled: this.isEnabled
                }).catch(() => {
                    // Ignore errors for inactive tabs
                });
            }
        });
    }
}

export const toggleManager = new ToggleManager();
