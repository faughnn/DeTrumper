document.addEventListener('DOMContentLoaded', function() {
    const DEFAULT_WORDS = ['trump', 'musk'];
    let isEnabled = true;
    
    // Add toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'toggleExtension';
    toggleBtn.className = 'toggle-btn';
    toggleBtn.innerHTML = 'ON';
    document.querySelector('h3').appendChild(toggleBtn);

    // Load saved state
    chrome.storage.local.get(['isEnabled'], function(result) {
        isEnabled = result.isEnabled !== undefined ? result.isEnabled : true;
        updateToggleButton();
    });

    // Toggle button handler
    toggleBtn.addEventListener('click', function() {
        isEnabled = !isEnabled;
        chrome.storage.local.set({ isEnabled: isEnabled }, function() {
            updateToggleButton();
            notifyContentScript();
        });
    });

    function updateToggleButton() {
        const btn = document.getElementById('toggleExtension');
        btn.innerHTML = isEnabled ? 'ON' : 'OFF';
        btn.style.backgroundColor = isEnabled ? '#1a73e8' : '#dc3545';
    }

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(tab.dataset.tab).classList.add('active');
            
            if (tab.dataset.tab === 'stats') {
                updateStats();
            }
        });
    });

    chrome.storage.local.get(['blockedWords'], function(result) {
        const words = result.blockedWords || DEFAULT_WORDS;
        updateWordList(words);
    });

    document.getElementById('addWord').addEventListener('click', addWord);
    document.getElementById('newWord').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') addWord();
    });

    function addWord() {
        const input = document.getElementById('newWord');
        const word = input.value.trim().toLowerCase();
        
        if (word) {
            chrome.storage.local.get(['blockedWords'], function(result) {
                const words = result.blockedWords || DEFAULT_WORDS;
                if (!words.includes(word)) {
                    words.push(word);
                    chrome.storage.local.set({ blockedWords: words }, function() {
                        updateWordList(words);
                        input.value = '';
                        showStatus('Word added!');
                        notifyContentScript();
                    });
                } else {
                    showStatus('Word already exists!');
                }
            });
        }
    }

    function removeWord(word) {
        chrome.storage.local.get(['blockedWords'], function(result) {
            const words = result.blockedWords || DEFAULT_WORDS;
            const newWords = words.filter(w => w !== word);
            chrome.storage.local.set({ blockedWords: newWords }, function() {
                updateWordList(newWords);
                showStatus('Word removed!');
                notifyContentScript();
            });
        });
    }

    function updateWordList(words) {
        const wordList = document.getElementById('wordList');
        wordList.innerHTML = '';
        
        words.forEach(word => {
            const div = document.createElement('div');
            div.className = 'word-item';
            div.innerHTML = `
                <span>${word}</span>
                <button class="delete-btn">Remove</button>
            `;
            wordList.appendChild(div);
        });

        document.querySelectorAll('.delete-btn').forEach(button => {
            button.onclick = function() {
                removeWord(this.parentElement.querySelector('span').textContent);
            };
        });
    }

    function showStatus(message) {
        const status = document.getElementById('status');
        status.textContent = message;
        setTimeout(() => status.textContent = '', 2000);
    }

    function formatTimeSpent(minutes) {
        if (minutes < 60) {
            return `${minutes} minutes`;
        } else {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            if (remainingMinutes === 0) {
                return `${hours} hour${hours !== 1 ? 's' : ''}`;
            }
            return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} min`;
        }
    }

function updateStats() {
    chrome.storage.local.get(['blockStats', 'sessionStats'], function(result) {
        if (!result.blockStats) return;
        
        const stats = result.blockStats;
        const sessionStats = result.sessionStats || {
            totalBlocked: 0,
            siteStats: {},
            wordStats: {},
            timeStarted: Date.now()
        };
        
        // Update total stats display
        const totalBlocked = stats.totalBlocked || 0;
        const totalBlockedDiv = document.getElementById('totalBlocked');
        totalBlockedDiv.innerHTML = `
            <div class="stat-box">
                <div class="stat-label">Total Items Hidden</div>
                <div class="stat-value">${totalBlocked.toLocaleString()}</div>
            </div>
        `;
        
        // Calculate and display total time saved
        const minutesSaved = Math.round((totalBlocked * 15) / 60);
        const timeSavedDiv = document.getElementById('timeSaved');
        timeSavedDiv.innerHTML = `
            <div class="stat-box">
                <div class="stat-label">Estimated Time Saved</div>
                <div class="stat-value">${formatTimeSpent(minutesSaved)}</div>
                <div class="stat-subtitle">Based on 15 seconds per item</div>
            </div>
        `;
        
        // Update all-time stats sections
        updateStatsSection('wordStats', 'All-Time Items Hidden Per Word', stats.wordStats);
        updateStatsSection('siteStats', 'All-Time Items Hidden Per Site', stats.siteStats);
        
        // Add or update session stats
        const sessionDuration = Math.round((Date.now() - sessionStats.timeStarted) / 60000);
        const sessionStatsHTML = `
            <div class="stat-section">
                <h3>Current Browser Session</h3>
                <div class="stat-box">
                    <div class="stat-label">Session Duration</div>
                    <div class="stat-value">${formatTimeSpent(sessionDuration)}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Items Hidden This Session</div>
                    <div class="stat-value">${sessionStats.totalBlocked.toLocaleString()}</div>
                </div>
                
                ${createStatsGrid('Session Items by Word', sessionStats.wordStats)}
                ${createStatsGrid('Session Items by Site', sessionStats.siteStats)}
            </div>
        `;

        let sessionStatsDiv = document.getElementById('sessionStats');
        if (!sessionStatsDiv) {
            sessionStatsDiv = document.createElement('div');
            sessionStatsDiv.id = 'sessionStats';
            document.getElementById('stats').appendChild(sessionStatsDiv);
        }
        sessionStatsDiv.innerHTML = sessionStatsHTML;
    });
}

// Helper function to create stats grid
function createStatsGrid(title, stats) {
    if (!stats || Object.keys(stats).length === 0) return '';
    
    const entries = Object.entries(stats)
        .sort((a, b) => b[1] - a[1]);
        
    return `
        <h4>${title}</h4>
        <div class="stat-grid">
            ${entries.map(([key, count]) => `
                <div class="stat-item">
                    <span class="word">${key}</span>
                    <span class="count">${count.toLocaleString()} items</span>
                </div>
            `).join('')}
        </div>
    `;
}

// Helper function to update stats sections
function updateStatsSection(elementId, title, stats) {
    const element = document.getElementById(elementId);
    element.innerHTML = `
        <h3>${title}</h3>
        <div class="stat-grid">
            ${Object.entries(stats || {})
                .sort((a, b) => b[1] - a[1])
                .map(([key, count]) => `
                    <div class="stat-item">
                        <span class="${elementId === 'wordStats' ? 'word' : 'site'}">${key}</span>
                        <span class="count">${count.toLocaleString()} items</span>
                    </div>
                `).join('')}
        </div>
    `;
}

    updateStats();

    function notifyContentScript() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "updateWords",
                isEnabled: isEnabled
            });
        });
    }
});