document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIG ---
    // The version number is used to discard corrupted data from previous tests.
    // Changing this version number forces a fresh start if the old state is loaded.
    const SCRIPT_VERSION = 9; 
    
    // ⚠️ IMPORTANT: To officially launch the calendar for the public on Dec 11th, 
    // CHANGE THIS TO 'true' AND RE-DEPLOY.
    const IS_LIVE = false; 

    const START_DAY = 11;
    const END_DAY = 25;
    const LOCKED_DAYS = [23, 24, 25];
    const RELEASE_DATE = new Date('December 11, 2025 00:00:00').getTime(); 
    const COOLDOWN_MS = 24 * 60 * 60 * 1000;
    const COMMAND_CODE = 'nullandnoobius';

    // --- STATE MANAGEMENT ---
    const getInitialState = () => {
        let s = { nextUnlock: 0, global23: false, global24: false, global25: false, forceLive: false, version: SCRIPT_VERSION };
        for (let i = START_DAY; i <= END_DAY; i++) s[i] = { redeemed: false };
        return s;
    };

    // Data Migration Check: Load saved state only if version matches, otherwise start fresh.
    let savedState = JSON.parse(localStorage.getItem('adventState'));
    let state;
    
    if (savedState && savedState.version === SCRIPT_VERSION) {
        state = savedState;
    } else {
        state = getInitialState();
    }
    state.version = SCRIPT_VERSION; // Ensure current version is saved

    // Data Integrity Check: Ensure all redeemed flags are explicit booleans.
    for (let i = START_DAY; i <= END_DAY; i++) {
        if (state[i] && state[i].redeemed !== undefined) {
             state[i].redeemed = !!state[i].redeemed; 
        } else {
             state[i] = { redeemed: false };
        }
    }
    
    const saveState = () => localStorage.setItem('adventState', JSON.stringify(state));
    const generateCode = () => Math.random().toString(36).substring(2, 11).toUpperCase();

    // --- ELEMENTS ---
    const container = document.getElementById('calendar-container');
    const countdownBanner = document.getElementById('pre-release-countdown');
    const countdownTimer = document.getElementById('countdown-timer');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalHeader = document.getElementById('modal-header');
    const modalContent = document.getElementById('modal-content');
    const modalBtn = document.getElementById('modal-ok-btn');
    
    let mainInterval;

    // --- RENDER LOGIC ---
    const render = () => {
        container.innerHTML = '';
        const now = Date.now();
        
        const isManuallyLive = IS_LIVE || state.forceLive;
        const isPreRelease = !isManuallyLive;

        // Dynamic unlock logic for catching up on missed days and preventing skips
        if (isManuallyLive) {
            let lastRedeemedDay = START_DAY - 1; 
            for (let i = END_DAY; i >= START_DAY; i--) {
                if (state[i].redeemed) {
                    lastRedeemedDay = i;
                    break;
                }
            }

            const timeSinceReleaseStart = now - RELEASE_DATE;
            const requiredTimeForNextDay = (lastRedeemedDay - START_DAY + 1) * COOLDOWN_MS; 

            if (timeSinceReleaseStart >= requiredTimeForNextDay) {
                 // The "Unstuck" logic: If time permits, force reset the timer.
                 state.nextUnlock = 0; 
            }
        }

        // 1. HEADER CONTROL
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

        // 2. DETERMINE NEXT UNLOCKABLE DAY
        let unlockableDay = null;
        if (!isPreRelease) {
            for (let i = START_DAY; i <= END_DAY; i++) {
                const isGlobal = LOCKED_DAYS.includes(i) && state[`global${i}`];
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
                // REDEEMED (Now shows star/opaque state)
                if (state[i].redeemed) {
                    box.classList.add(LOCKED_DAYS.includes(i) ? 'special-locked' : 'redeemed');
                    if (!LOCKED_DAYS.includes(i)) {
                         innerHTML += `<div style="margin-top:20px; font-size:2em;">⭐</div>`;
                    } else {
                         box.style.opacity = '0.7';
                    }
                }
                // SPECIAL LOCKED
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
                            // Visual Fix: Lock icon + Countdown in 23:59:59 format
                            innerHTML += `
                                <div style="display:flex; justify-content:center; align-items:center; margin-top:15px; font-size: 1.2em;">
                                    🔐&nbsp;<span id="cd-${i}">23:59:59</span>
                                </div>
                            `;
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
            const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const m = Math.floor((diff / 1000 / 60) % 60);
            const s = Math.floor((diff / 1000) % 60);
            
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

    const startCooldownDisplay = (day, target) => {
        const el = document.querySelector(`#cd-${day}`);
        if(!el) return;
        
        // Clear any existing timer for this element
        if (el.dataset.timerId) clearInterval(parseInt(el.dataset.timerId));

        const timer = setInterval(() => {
            const diff = target - Date.now();
            if(diff <= 0) { 
                clearInterval(timer); 
                el.removeAttribute('data-timer-id');
                render(); 
                return; 
            }
            
            // Format: HH:MM:SS (ensures 2-digits for requested format)
            const h = String(Math.floor((diff / (1000 * 60 * 60)) % 24)).padStart(2, '0');
            const m = String(Math.floor((diff / 1000 / 60) % 60)).padStart(2, '0');
            const s = String(Math.floor((diff / 1000) % 60)).padStart(2, '0');
            
            el.innerText = `${h}:${m}:${s}`; 
        }, 1000);

        // Store timer ID to clear it later
        el.dataset.timerId = timer.toString();
    };

    // --- CLICK HANDLER ---
    container.addEventListener('click', (e) => {
        const box = e.target.closest('.day-box');
        if (!box) return;
        
        const day = parseInt(box.dataset.day);
        const isManuallyLive = IS_LIVE || state.forceLive;

        // 1. Pre-Release Click (Blocked)
        if (!isManuallyLive) {
            showModal("HOLD UP!", "The calendar is currently locked. Presents are being made! Check back soon.", "GOT IT");
            return;
        }

        // 2. Special Locked Click (Blocked unless globally unlocked)
        if (LOCKED_DAYS.includes(day) && !state[`global${day}`]) {
            showModal("A MYSTERY AWAITS...", "Treasure awaits for a special surprise.<br>Find the key and return for a grand-surprise.", "GOT IT");
            return;
        }

        if (state[day].redeemed) return;

        // 3. Cooldown Active Click (Blocked)
        if (box.classList.contains('locked')) {
            showModal("WHOAH SLOW DOWN!", "Santa isn't ready to deliver yet! First claim your available prize or wait for the cooldown.", "UNDERSTOOD");
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
        
        // FIX: Sensor-like behavior: Immediately update the box visually BEFORE the modal/re-render.
        if (box.classList.contains('available') && !LOCKED_DAYS.includes(day)) {
            box.classList.remove('available');
            box.classList.add('redeemed');
            // Remove old content and add star
            box.innerHTML = `<span class="day-number">${day}</span><div style="margin-top:20px; font-size:2em;">⭐</div>`;
        }

        showModal("CONGRATS YOU UNLOCKED", `
            <h2 style="color:#e74c3c">${REWARDS[day]}</h2>
            <p>MAKE A TICKET IN THE OFFICIAL DINO BRO DISCORD SERVER AND CLAIM UR PRIZE</p>
            <div class="code-box">${code}</div>
        `, "OK", () => {
            // State update must happen here for next unlock logic
            state[day].redeemed = true;
            
            // FIX: Guaranteed timer setting for the next day's cooldown
            state.nextUnlock = Date.now() + COOLDOWN_MS; 
            
            saveState();
            
            // Re-render the calendar. This will set the timer on the next day (Day N+1).
            render(); 
        });
    });

    // --- MODAL SYSTEM ---
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

    // --- ADMIN SYSTEM (SECRET COMMANDS) ---
    let inputBuffer = '';
    let hammerClicks = 0;
    
    document.addEventListener('keypress', (e) => {
        if(e.target.tagName === 'INPUT') return; 
        inputBuffer += e.key.toLowerCase();
        if(inputBuffer.length > 20) inputBuffer = inputBuffer.slice(-20);
        if(inputBuffer.endsWith(COMMAND_CODE)) {
            document.getElementById('command-hammer').classList.remove('hidden');
            inputBuffer = '';
        }
    });

    document.getElementById('command-hammer').addEventListener('click', () => {
        hammerClicks++;
        if(hammerClicks >= 3) {
            document.getElementById('command-modal-backdrop').classList.remove('hidden');
            hammerClicks = 0;
        }
    });

    document.getElementById('command-close-btn').addEventListener('click', () => {
        document.getElementById('command-modal-backdrop').classList.add('hidden');
    });

    // Reset Cooldown Button
    document.getElementById('reset-timer-btn').addEventListener('click', () => {
        state.nextUnlock = 0;
        saveState(); 
        render(); 
        alert("Cooldown Reset! The next available door should now be open.");
    });
    
    // Toggle Live Mode (Test)
    const debugControls = document.querySelector('.command-group h4').parentNode;
    const forceLiveBtn = document.createElement('button');
    forceLiveBtn.innerText = "Toggle Live Mode (Test)";
    forceLiveBtn.onclick = () => {
        state.forceLive = !state.forceLive;
        state.nextUnlock = 0; 
        saveState();
        render();
        alert(`Live Mode is now: ${state.forceLive ? 'ON (TEST)' : 'OFF'}`);
        document.getElementById('command-modal-backdrop').classList.add('hidden');
    };
    if (document.getElementById('reset-timer-btn')) {
        debugControls.appendChild(forceLiveBtn);
    }
    

    const unlockGlobal = (d) => {
        state[`global${d}`] = true; saveState(); render();
        document.getElementById('command-modal-backdrop').classList.add('hidden');
    };
    document.getElementById('unlock-23-btn').addEventListener('click', () => unlockGlobal(23));
    document.getElementById('unlock-24-btn').addEventListener('click', () => unlockGlobal(24));
    document.getElementById('unlock-25-btn').addEventListener('click', () => unlockGlobal(25));

    // INIT
    render();
});