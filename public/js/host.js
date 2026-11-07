// public/js/host.js
const socket = io();
const shapes = ['▲', '◆', '●', '■'];

console.log('[host.js] loaded');

// ─── Screens ────────────────────────────────────
const screens = {
    lobby: document.getElementById('lobby-screen'),
    question: document.getElementById('question-screen'),
    gameover: document.getElementById('gameover-screen')
};

// Verify screens exist
Object.entries(screens).forEach(([name, el]) => {
    if (!el) console.error(`[host.js] MISSING screen element: #${name === 'lobby' ? 'lobby-screen' : name === 'question' ? 'question-screen' : 'gameover-screen'}`);
    else console.log(`[host.js] found screen: ${name}`);
});

function showScreen(name) {
    console.log(`[host.js] showScreen('${name}')`);
    Object.values(screens).forEach(s => {
        if (s) s.classList.remove('active');
    });
    if (screens[name]) {
        screens[name].classList.add('active');
    } else {
        console.error(`[host.js] screen '${name}' not found in DOM!`);
    }
}

// ─── DOM refs ───────────────────────────────────
const els = {
    gamePin: document.getElementById('game-pin'),
    playerCount: document.getElementById('player-count'),
    playersGrid: document.getElementById('players-grid'),
    btnStart: document.getElementById('btn-start'),
    questionCounter: document.getElementById('question-counter'),
    timerDisplay: document.getElementById('timer-display'),
    answeredCount: document.getElementById('answered-count'),
    totalPlayers: document.getElementById('total-players'),
    questionText: document.getElementById('question-text'),
    answersGrid: document.getElementById('answers-grid'),
    btnNext: document.getElementById('btn-next-question'),
    countdownOverlay: document.getElementById('countdown-overlay'),
    countdownNumber: document.getElementById('countdown-number'),
    podium: document.getElementById('podium'),
    finalLeaderboard: document.getElementById('final-leaderboard')
};

// Log any missing elements
Object.entries(els).forEach(([key, el]) => {
    if (!el) console.error(`[host.js] MISSING element: els.${key}`);
});

let totalPlayerCount = 0;

function esc(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

function rankEmoji(r) {
    if (r === 1) return '🥇';
    if (r === 2) return '🥈';
    if (r === 3) return '🥉';
    return `#${r}`;
}

// ─── Create Game ────────────────────────────────
socket.emit('host-create-game', (res) => {
    console.log('[host.js] game created:', res);
    if (res.success && els.gamePin) {
        els.gamePin.textContent = res.pin;
    }
});

// ─── Players ────────────────────────────────────
socket.on('player-joined', (data) => {
    console.log('[host.js] player-joined', data);
    totalPlayerCount = data.playerCount;
    if (els.playerCount) els.playerCount.textContent = data.playerCount;
    if (els.totalPlayers) els.totalPlayers.textContent = totalPlayerCount;
    if (els.playersGrid) {
        els.playersGrid.innerHTML = data.players
            .map(p => `<div class="player-chip">👤 ${esc(p.name)}</div>`).join('');
    }
    if (els.btnStart) els.btnStart.disabled = data.playerCount < 1;
});

socket.on('player-left', (data) => {
    totalPlayerCount = data.playerCount;
    if (els.playerCount) els.playerCount.textContent = data.playerCount;
    if (els.totalPlayers) els.totalPlayers.textContent = totalPlayerCount;
    if (els.playersGrid) {
        els.playersGrid.innerHTML = data.players
            .map(p => `<div class="player-chip">👤 ${esc(p.name)}</div>`).join('');
    }
});

// ─── Start / Next ───────────────────────────────
if (els.btnStart) {
    els.btnStart.addEventListener('click', () => {
        console.log('[host.js] Start clicked → emitting host-next-question');
        socket.emit('host-next-question');
    });
}

if (els.btnNext) {
    els.btnNext.addEventListener('click', () => {
        console.log('[host.js] Next clicked → emitting host-next-question');
        socket.emit('host-next-question');
    });
}

// ─── Show Question (THE CRITICAL HANDLER) ───────
socket.on('show-question', (data) => {
    console.log('[host.js] ✅ show-question RECEIVED:', data);

    try {
        // 1. Switch screen FIRST so something visible always happens
        showScreen('question');

        // 2. Fill content
        if (els.questionCounter) {
            els.questionCounter.textContent = `${data.index + 1} / ${data.total}`;
        }
        if (els.questionText) {
            els.questionText.textContent = data.question;
        }
        if (els.timerDisplay) {
            els.timerDisplay.textContent = data.timeLimit;
            els.timerDisplay.classList.remove('warning');
        }
        if (els.answeredCount) els.answeredCount.textContent = '0';
        if (els.totalPlayers) els.totalPlayers.textContent = totalPlayerCount;
        if (els.btnNext) els.btnNext.classList.add('hidden');

        if (els.answersGrid) {
            els.answersGrid.innerHTML = (data.answers || []).map((ans, i) => `
        <div class="answer-block a${i}" id="ab-${i}">
          <span class="shape">${shapes[i]}</span>
          <span>${esc(ans)}</span>
        </div>
      `).join('');
        } else {
            console.error('[host.js] answersGrid element is missing!');
        }

        console.log('[host.js] ✅ question screen updated');
    } catch (err) {
        console.error('[host.js] ERROR in show-question handler:', err);
    }
});

// ─── Timer ──────────────────────────────────────
socket.on('timer-tick', ({ timeLeft }) => {
    if (els.timerDisplay) {
        els.timerDisplay.textContent = timeLeft;
        if (timeLeft <= 5) els.timerDisplay.classList.add('warning');
    }
});

// ─── Answer count ───────────────────────────────
socket.on('answer-received', ({ answeredCount }) => {
    if (els.answeredCount) els.answeredCount.textContent = answeredCount;
});

// ─── Countdown ──────────────────────────────────
socket.on('reveal-countdown', ({ count }) => {
    console.log('[host.js] countdown', count);
    if (els.countdownOverlay) els.countdownOverlay.classList.remove('hidden');
    if (els.countdownNumber) {
        els.countdownNumber.textContent = count;
        els.countdownNumber.style.animation = 'none';
        void els.countdownNumber.offsetHeight;
        els.countdownNumber.style.animation = 'countPop 0.8s ease';
    }
});

// ─── Reveal ─────────────────────────────────────
socket.on('reveal-answers', (data) => {
    console.log('[host.js] reveal-answers', data);
    if (els.countdownOverlay) els.countdownOverlay.classList.add('hidden');

    for (let i = 0; i < 4; i++) {
        const block = document.getElementById(`ab-${i}`);
        if (block) {
            block.classList.add(i === data.correctAnswer ? 'correct' : 'incorrect');
        }
    }

    setTimeout(() => {
        if (els.btnNext) els.btnNext.classList.remove('hidden');
    }, 1500);
});

// ─── Game Over ──────────────────────────────────
socket.on('game-over', ({ leaderboard }) => {
    console.log('[host.js] game-over', leaderboard);
    const order = [1, 0, 2];
    const cls = ['second', 'first', 'third'];
    const emoji = ['🥈', '🥇', '🥉'];

    if (els.podium) {
        els.podium.innerHTML = order.map((idx, pos) => {
            const p = leaderboard[idx];
            if (!p) return '';
            return `
        <div class="podium-place">
          <div class="podium-name">${esc(p.name)}</div>
          <div class="podium-block ${cls[pos]}">
            ${emoji[pos]}<br>
            <span class="podium-score">${p.score.toLocaleString()}</span>
          </div>
        </div>`;
        }).join('');
    }

    if (els.finalLeaderboard) {
        els.finalLeaderboard.innerHTML = leaderboard.map((p, i) => `
      <div class="leaderboard-item" style="animation-delay:${i * 0.1}s">
        <div class="leaderboard-rank">${rankEmoji(p.rank)}</div>
        <div class="leaderboard-name">${esc(p.name)}</div>
        <div class="leaderboard-score">${p.score.toLocaleString()}</div>
      </div>`).join('');
    }

    showScreen('gameover');
});