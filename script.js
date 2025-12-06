document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIG ---
    // VERSION 14: Final fix for stuck day progression and full timer restore.
    const SCRIPT_VERSION = 14; 
    
    // ⚠️ IMPORTANT: To officially launch the calendar for the public on Dec 11th, 
    // CHANGE THIS TO 'true' AND RE-DEPLOY.
    const IS_LIVE = false; 

    const START_DAY = 11;
    const END_DAY = 25;
    const LOCKED_DAYS = [23, 24, 25]; // These days are only unlocked by admin command
    // Set the release date to 2025 to ensure the countdown displays correctly
    const RELEASE_DATE = new Date('December 11, 2025 00:00:00').getTime(); 
    const COOLDOWN_MS = 24 * 60 * 60 * 1000;
    const COMMAND_CODE = 'nullandnoobius';

    // Global store for timer IDs to ensure they are properly cleaned up
    const activeTimers = {};

    // --- STATE MANAGEMENT ---
    const getInitialState = () => {
        let s = { nextUnlock: 0, global23: false, global24: false, global25: false, forceLive: false, version: SCRIPT_VERSION };
        for (let i = START_DAY; i <= END_DAY; i++) s[i] = { redeemed: false };
        return s;
    };

    // Load state. If the version is old, discard it and start fresh (solves the stuck day bug).
    let savedState = JSON.parse(localStorage.getItem('adventState'));
    let state;
    
    if (savedState && savedState.version === SCRIPT_VERSION) {
        state = savedState;
    } else {
        state = getInitialState();
    }
    state.version = SCRIPT_VERSION; 
    
    // Ensure all required properties exist (prevent null errors)
    for (let i = START_DAY; i <= END_DAY; i++) {
        if (!state[i] || state[i].redeemed === undefined) {
             state[i] = { redeemed: false };
        } else {
             state[i].redeemed = !!state[i].redeemed;
        }
    }
    
    const saveState = () => localStorage.setItem('adventState', JSON.stringify(state));
    const generateCode = () => Math.random().toString(36).substring(2, 11).toUpperCase();

    // --- ELEMENTS ---
    const container = document.getElementById('calendar-container');
    if (!container) return; // Stop if container not found
    
    const countdownBanner = document.getElementById('pre-release-countdown');
    const countdownTimer = document.getElementById('countdown-timer');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalHeader = document.getElementById('modal-header');
    const modalContent = document.getElementById('modal-content');
    const modalBtn = document.getElementById('modal-ok-btn');
    
    let mainInterval;

    // --- RENDER LOGIC ---
    const render = () => {
        // Stop all timers before re-rendering
        Object.values(activeTimers).forEach(clearInterval);
        for (const day in activeTimers) { delete activeTimers[day]; }

        container.innerHTML = '';
        const now = Date.now();
        
        const isManuallyLive = IS_LIVE || state.forceLive;
        const isPreRelease = !isManuallyLive;

        // "Unstuck" Logic: Find the highest redeemed day and ensure cooldown allows the next day.
        if (isManuallyLive) {
            let lastRedeemedDay = START_DAY - 1; 
            for (let i = END_DAY; i >= START_DAY; i--) {
                if (state[i].redeemed) {
                    lastRedeemedDay = i;
                    break;
                }
            }

            const timeSinceReleaseStart = now - RELEASE_DATE;
            // Calculate how much total time must have passed for the day AFTER the last redeemed day to open.
            const requiredTimeForNextDay = (lastRedeemedDay - START_DAY + 1) * COOLDOWN_MS; 

            if (timeSinceReleaseStart >= requiredTimeForNextDay) {
                 state.nextUnlock = 0; 
            }
        }

        // 1. HEADER CONTROL (RESTORES DECEMBER 11TH COUNTDOWN)
        if (isPreRelease) {
            countdownBanner.classList.remove('hidden');
            
            if (now >= RELEASE_DATE) {
                countdownTimer.innerHTML = `<div style="color: var(--color-gold); font-size: 0.8em; padding:10px;">IT WILL BE OPENED SOON!!</div>`;
            } else {
                startCountdown(RELEASE_DATE);
            }
        } else {
            countdownBanner.classList.add('hidden');
            clearInterval(mainInterval);
        }

        // 2. DETERMINE NEXT UNLOCKABLE DAY (FIXES STUCK DAY BUG)
        let unlockableDay = null;
        if (!isPreRelease) {
            for (let i = START_DAY; i <= END_DAY; i++) {
                const isGlobal = LOCKED_DAYS.includes(i) && state[`global${i}`]; 
                
                // If the day is NOT redeemed AND (it's not a special day OR it is globally unlocked)
                if (!state[i].redeemed && (!LOCKED_DAYS.includes(i) || isGlobal)) {
                    unlockableDay = i;
                    break;
                }
            }
        }

        // 3. GENERATE GRID
        for (let i = START_DAY; i <= END_DAY; i++) {
            const box = document.createElement('div');
            box.classList.add('day-box');
            box.dataset.day = i;
            let innerHTML = `<span class="day-number">${i}</span>`;

            // A. PRE-RELEASE MODE
            if (isPreRelease) {
                box.classList.add('pre-release-door');
                innerHTML += `<div class="lock-icon">🔐</div><div class="lock-text">LOCKED</div>`;
            }
            // B. ACTIVE MODE
            else {
                // REDEEMED
                if (state[i].redeemed) {
                    box.classList.add(LOCKED_DAYS.includes(i) ? 'special-locked' : 'redeemed');
                    if (!LOCKED_DAYS.includes(i)) {
                         innerHTML += `<div style="margin-top:20px; font-size:2em;">⭐</div>`;
                    } else {
                         box.style.opacity = '0.7';
                    }
                }
                // SPECIAL LOCKED (Admin-only days that haven't been unlocked)
                else if (LOCKED_DAYS.includes(i) && !state[`global${i}`]) {
                    box.classList.add('special-locked');
                    innerHTML += `<div class="special-eyes">👀</div>`;
                }
                // STANDARD LOGIC
                else {
                    const isTarget = (i === unlockableDay);
                    const cooldownActive = (state.nextUnlock > now);

                    if (isTarget) {
                        if (cooldownActive) {
                            box.classList.add('locked');
                            // Lock icon + Countdown in 23:59:59 format
                            innerHTML += `
                                <div style="display:flex; justify-content:center; align-items:center; margin-top:15px; font-size: 1.2em;">
                                    🔐&nbsp;<span id="cd-${i}">23:59:59</span>
                                </div>
                            `;
                            // START COOLDOWN TIMER (FIXED)
                            startCooldownDisplay(i, state.nextUnlock);
                        } else {
                            box.classList.add('available');
                            innerHTML += `<div style="margin-top:20px; font-size:2em;">🎁</div>`;
                        }
                    } else {
                        box.classList.add('locked');
                    }
                }
            }
            
            box.innerHTML = innerHTML;
            container.appendChild(box);
        }
    };

    // --- TIMING FUNCTIONS ---
    const startCountdown = (target) => {
        clearInterval(mainInterval);
        const update = () => {
            const diff = target - Date.now();
            
            if (diff <= 0) { 
                clearInterval(mainInterval); 
                countdownTimer.innerHTML = `<div style="color: var(--color-gold); font-size: 0.8em; padding:10px;">IT WILL BE OPENED SOON!!</div>`;
                return; 
            }
            
            const d = Math.floor(diff / (1000 * 60 * 60 * 24));
            const h = String(Math.floor((diff / (1000 * 60 * 60)) % 24)).padStart(2, '0');
            const m = String(Math.floor((diff / 1000 / 60) % 60)).padStart(2, '0');
            const s = String(Math.floor((diff / 1000) % 60)).padStart(2, '0');
            
            // Format: days hours minutes seconds (FIXED)
            countdownTimer.innerHTML = `
                <div class="time-unit">${d}<span>DAYS</span></div>
                <div class="time-unit">${h}<span>HOURS</span></div>
                <div class="time-unit">${m}<span>MIN</span></div>
                <div class="time-unit">${s}<span>SEC</span></div>
            `;
        };
        update();
        mainInterval = setInterval(update, 1000);
    };

    // FIX: Accurate 24h Cooldown Timer (HH:MM:SS)
    const startCooldownDisplay = (day, target) => {
        const el = document.querySelector(`#cd-${day}`);
        if(!el) return;
        
        if (activeTimers[day]) clearInterval(activeTimers[day]);

        const timer = setInterval(() => {
            const diff = target - Date.now();
            if(diff <= 0) { 
                clearInterval(timer); 
                delete activeTimers[day];
                render(); // Forces calendar to update and show the next day as available
                return; 
            }
            
            // Calculate total hours, minutes, and seconds remaining from the difference
            const totalSeconds = Math.floor(diff / 1000);
            const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
            const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
            const s = String(totalSeconds % 60).padStart(2, '0');
            
            el.innerText = `${h}:${m}:${s}`; 
        }, 1000);

        activeTimers[day] = timer;
    };

    // --- CLICK HANDLER (Redemption Sensor) ---
    container.addEventListener('click', (e) => {
        const box = e.target.closest('.day-box');
        if (!box) return;
        
        const day = parseInt(box.dataset.day);
        const isManuallyLive = IS_LIVE || state.forceLive;

        // Skip checks for locked/redeemed boxes
        if (!isManuallyLive || state[day].redeemed || box.classList.contains('locked') || box.classList.contains('special-locked')) {
             let message = "Check back soon.";
             if (!isManuallyLive) message = "The calendar is currently locked. Presents are being made!";
             else if (box.classList.contains('locked')) message = "Santa isn't ready to deliver yet! Wait for the cooldown.";
             else if (box.classList.contains('special-locked')) message = "A MYSTERY AWAITS...";
             
             showModal("HOLD UP!", message, "GOT IT");
             return;
        }

        // 4. SUCCESS! (Claim Reward)
        const REWARDS = {
            11: '400 XP', 12: '800 XP', 13: '1000 XP', 14: 'Frost Walker Role',
            15: 'Custom Emoji', 16: '900 XP', 17: '300 XP', 18: 'Custom Sticker',
            19: '1150 XP', 20: 'WINTER GOLEM Role', 21: 'Dino Elf Role', 22: '2K XP',
            23: 'Custom Icon', 24: 'Server Rebrand', 25: 'Official Game Leak + Role'
        };

        const code = generateCode();
        
        // Immediate visual update (sensor behavior)
        if (box.classList.contains('available') && !LOCKED_DAYS.includes(day)) {
            box.classList.remove('available');
            box.classList.add('redeemed');
            box.innerHTML = `<span class="day-number">${day}</span><div style="margin-top:20px; font-size:2em;">⭐</div>`;
        }

        showModal("CONGRATS YOU UNLOCKED", `
            <h2 style="color:#e74c3c">${REWARDS[day]}</h2>
            <p>MAKE A TICKET IN THE OFFICIAL DINO BRO DISCORD SERVER AND CLAIM UR PRIZE</p>
            <div class="code-box">${code}</div>
        `, "OK", () => {
            state[day].redeemed = true;
            // Set the next unlock time 24 hours from NOW
            state.nextUnlock = Date.now() + COOLDOWN_MS; 
            saveState();
            
            render(); 
        });
    });

    // --- MODAL SYSTEM --- (Unchanged)
    const showModal = (title, html, btnText, callback) => {
        modalHeader.textContent = title;
        modalContent.innerHTML = html;
        modalBtn.textContent = btnText;
        modalBackdrop.classList.remove('hidden');
        
        const newBtn = modalBtn.cloneNode(true);
        modalBtn.parentNode.replaceChild(newBtn, modalBtn);
        
        newBtn.addEventListener('click', () => {
            modalBackdrop.classList.add('hidden');
            if (callback) callback();
        });
    };

    // --- ADMIN SYSTEM (SECRET COMMANDS) --- (Unchanged)
    let inputBuffer = '';
    let hammerClicks = 0;
    
    document.addEventListener('keypress', (e) => {
        if(e.target.tagName === 'INPUT') return; 
        inputBuffer += e.key.toLowerCase();
        if(inputBuffer.length > 20) inputBuffer = inputBuffer.slice(-20);
        if(inputBuffer.endsWith(COMMAND_CODE)) {
            const hammer = document.getElementById('command-hammer');
            if(hammer) hammer.classList.remove('hidden');
            inputBuffer = '';
        }
    });

    const hammer = document.getElementById('command-hammer');
    if (hammer) {
        hammer.addEventListener('click', () => {
            hammerClicks++;
            if(hammerClicks >= 3) {
                const modal = document.getElementById('command-modal-backdrop');
                if (modal) modal.classList.remove('hidden');
                hammerClicks = 0;
            }
        });
    }

    const commandCloseBtn = document.getElementById('command-close-btn');
    if (commandCloseBtn) {
        commandCloseBtn.addEventListener('click', () => {
            const modal = document.getElementById('command-modal-backdrop');
            if (modal) modal.classList.add('hidden');
        });
    }

    // Reset Cooldown Button
    const resetTimerBtn = document.getElementById('reset-timer-btn');
    if (resetTimerBtn) {
        resetTimerBtn.addEventListener('click', () => {
            state.nextUnlock = 0;
            saveState(); 
            render(); 
            alert("Cooldown Reset! The next available door should now be open.");
        });
    }
    
    // Toggle Live Mode (Test)
    const debugControls = document.querySelector('.command-group h4')?.parentNode;
    if (debugControls) {
        const forceLiveBtn = document.createElement('button');
        forceLiveBtn.innerText = "Toggle Live Mode (Test)";
        forceLiveBtn.onclick = () => {
            state.forceLive = !state.forceLive;
            state.nextUnlock = 0; 
            saveState();
            render();
            alert(`Live Mode is now: ${state.forceLive ? 'ON (TEST)' : 'OFF'}`);
            const modal = document.getElementById('command-modal-backdrop');
            if (modal) modal.classList.add('hidden');
        };
        debugControls.appendChild(forceLiveBtn);
    }
    

    const unlockGlobal = (d) => {
        state[`global${d}`] = true; saveState(); render();
        const modal = document.getElementById('command-modal-backdrop');
        if (modal) modal.classList.add('hidden');
    };
    
    const unlock23Btn = document.getElementById('unlock-23-btn');
    if (unlock23Btn) unlock23Btn.addEventListener('click', () => unlockGlobal(23));
    
    const unlock24Btn = document.getElementById('unlock-24-btn');
    if (unlock24Btn) unlock24Btn.addEventListener('click', () => unlockGlobal(24));
    
    const unlock25Btn = document.getElementById('unlock-25-btn');
    if (unlock25Btn) unlock25Btn.addEventListener('click', () => unlockGlobal(25));

    // INIT
    render();
});
