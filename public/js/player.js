// ─── Parse URL ──────────────────────────────────
const params = new URLSearchParams(window.location.search);
const gamePin = params.get('pin');
const playerName = params.get('name');

if (!gamePin || !playerName) {
    window.location.href = '/join';
}

// ─── Socket ─────────────────────────────────────
const socket = io();
const shapes = ['▲', '◆', '●', '■'];
let hasAnswered = false;

// ─── Screens ────────────────────────────────────
const screens = {
    connecting: document.getElementById('player-connecting'),
    lobby: document.getElementById('player-lobby'),
    question: document.getElementById('player-question'),
    waiting: document.getElementById('player-waiting'),
    result: document.getElementById('player-result'),
    gameover: document.getElementById('player-gameover'),
    disconnected: document.getElementById('player-disconnected')
};

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

// ─── DOM refs ───────────────────────────────────
const els = {
    nameDisplay: document.getElementById('player-name-display'),
    qCounter: document.getElementById('p-question-counter'),
    timer: document.getElementById('p-timer'),
    answersGrid: document.getElementById('p-answers-grid'),
    resultIcon: document.getElementById('result-icon'),
    resultText: document.getElementById('result-text'),
    resultPoints: document.getElementById('result-points'),
    resultScore: document.getElementById('result-score'),
    resultStreak: document.getElementById('result-streak'),
    finalRank: document.getElementById('p-final-rank'),
    finalScore: document.getElementById('p-final-score')
};

els.nameDisplay.textContent = playerName;

// ─── JOIN on connect ────────────────────────────
socket.on('connect', () => {
    socket.emit('player-join', { pin: gamePin, name: playerName }, (res) => {
        if (res.success) {
            showScreen('lobby');
        } else {
            alert(res.message);
            window.location.href = '/join';
        }
    });
});

// ─── QUESTION ───────────────────────────────────
socket.on('show-question-player', (data) => {
    // Reset waiting screen for next time
    document.getElementById('p-waiting-content').classList.remove('hidden');
    document.getElementById('p-countdown-content').classList.add('hidden');

    hasAnswered = false;
    els.qCounter.textContent = `Question ${data.index + 1} / ${data.total}`;
    els.timer.textContent = data.timeLimit;
    els.timer.style.color = 'white';

    const buttons = els.answersGrid.querySelectorAll('.player-answer-btn');
    buttons.forEach((btn, i) => {
        btn.disabled = false;
        btn.classList.remove('selected');
        btn.innerHTML =
            `<span class="shape">${shapes[i]}</span> ${esc(data.answers[i])}`;
        btn.dataset.index = i;
    });

    showScreen('question');
});

// ─── ANSWER CLICK ──────────────────────────────
els.answersGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.player-answer-btn');
    if (!btn || hasAnswered || btn.disabled) return;

    hasAnswered = true;
    const idx = parseInt(btn.dataset.index);

    els.answersGrid.querySelectorAll('.player-answer-btn')
        .forEach(b => b.disabled = true);
    btn.classList.add('selected');

    if (navigator.vibrate) navigator.vibrate(50);

    socket.emit('player-answer', { answerIndex: idx });
    showScreen('waiting');
});

// ─── TIMER ──────────────────────────────────────
socket.on('timer-tick', ({ timeLeft }) => {
    els.timer.textContent = timeLeft;
    els.timer.style.color = timeLeft <= 5 ? '#ff6b6b' : 'white';
});

// ─── Countdown ─────────────────────────────────
socket.on('reveal-countdown', ({ count }) => {
    // Make sure we're on the waiting screen
    if (!screens.waiting.classList.contains('active')) {
        showScreen('waiting');
    }

    document.getElementById('p-waiting-content').classList.add('hidden');
    const countdownContent = document.getElementById('p-countdown-content');
    countdownContent.classList.remove('hidden');

    const numEl = document.getElementById('p-countdown-number');
    numEl.textContent = count;
    numEl.style.animation = 'none';
    numEl.offsetHeight;
    numEl.style.animation = 'countPop 0.8s ease';
});

// ─── ANSWER RESULT ─────────────────────────────
socket.on('answer-result', (data) => {
    if (data.correct) {
        els.resultIcon.textContent = '✅';
        els.resultText.textContent = 'Correct!';
        els.resultText.className = 'result-text correct';
        els.resultPoints.textContent = `+${data.points}`;
        els.resultStreak.textContent =
            data.streak >= 3 ? `🔥 ${data.streak} streak!` : '';
    } else {
        els.resultIcon.textContent = data.timedOut ? '⏰' : '❌';
        els.resultText.textContent = data.timedOut ? "Time's up!" : 'Incorrect';
        els.resultText.className = 'result-text incorrect';
        els.resultPoints.textContent = '+0';
        els.resultStreak.textContent = '';
    }
    els.resultScore.textContent =
        `Total Score: ${data.totalScore.toLocaleString()}`;

    if (navigator.vibrate) {
        navigator.vibrate(data.correct ? [100, 50, 100] : [300]);
    }

    showScreen('result');
});

// ─── GAME OVER ─────────────────────────────────
socket.on('game-over', ({ leaderboard }) => {
    const me = leaderboard.find(
        p => p.name.toLowerCase() === playerName.toLowerCase()
    );
    if (me) {
        els.finalRank.textContent = `#${me.rank}`;
        els.finalScore.textContent =
            `Final Score: ${me.score.toLocaleString()}`;
    }
    showScreen('gameover');
});

// ─── HOST LEFT ─────────────────────────────────
socket.on('game-ended-by-host', () => {
    showScreen('disconnected');
});

// ─── Helper ────────────────────────────────────
function esc(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}