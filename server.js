const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/join', (req, res) => res.sendFile(path.join(__dirname, 'public', 'join.html')));

const games = {};

function generatePin() {
  let pin;
  do {
    pin = Math.floor(1000 + Math.random() * 9000).toString();
  } while (games[pin]);
  return pin;
}

function loadQuestions() {
  const data = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8');
  return JSON.parse(data);
}

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  socket.on('host-create-game', (callback) => {
    const pin = generatePin();
    games[pin] = {
      hostSocketId: socket.id,
      pin,
      questions: loadQuestions(),
      currentQuestionIndex: -1,
      players: {},
      phase: 'lobby',
      timer: null,
      timeLeft: 0,
      questionStartTime: 0,
      answeredCount: 0
    };
    socket.join(pin);
    socket.gamePin = pin;
    socket.role = 'host';
    console.log(`[HOST] Game created: PIN=${pin}, host=${socket.id}`);
    callback({ success: true, pin });
  });

  socket.on('validate-pin', ({ pin, name }, callback) => {
    const game = games[pin];
    if (!game) return callback({ success: false, message: 'Game not found' });
    if (game.phase !== 'lobby') return callback({ success: false, message: 'Game already in progress' });
    const nameExists = Object.values(game.players).some(p => p.name.toLowerCase() === name.toLowerCase());
    if (nameExists) return callback({ success: false, message: 'Name already taken' });
    callback({ success: true });
  });

  socket.on('player-join', ({ pin, name }, callback) => {
    const game = games[pin];
    if (!game) return callback({ success: false, message: 'Game not found' });
    if (game.phase !== 'lobby') return callback({ success: false, message: 'Game already in progress' });
    const nameExists = Object.values(game.players).some(p => p.name.toLowerCase() === name.toLowerCase());
    if (nameExists) return callback({ success: false, message: 'Name already taken' });

    game.players[socket.id] = {
      name, score: 0, streak: 0,
      answered: false, lastAnswer: null, lastCorrect: false, lastPoints: 0
    };
    socket.join(pin);
    socket.gamePin = pin;
    socket.role = 'player';

    io.to(game.hostSocketId).emit('player-joined', {
      playerCount: Object.keys(game.players).length,
      players: Object.values(game.players).map(p => ({ name: p.name, score: p.score }))
    });
    console.log(`[PLAYER] ${name} joined game ${pin}`);
    callback({ success: true, name });
  });

  socket.on('host-next-question', () => {
    console.log(`[EVENT] host-next-question from ${socket.id}, role=${socket.role}, pin=${socket.gamePin}`);
    const game = games[socket.gamePin];
    if (!game) {
      console.log(`  ❌ No game found for pin ${socket.gamePin}`);
      return;
    }
    if (socket.role !== 'host') {
      console.log(`  ❌ Not host role: ${socket.role}`);
      return;
    }

    game.currentQuestionIndex++;

    if (game.currentQuestionIndex >= game.questions.length) {
      game.phase = 'ended';
      io.to(game.pin).emit('game-over', { leaderboard: getLeaderboard(game) });
      console.log(`[GAME ${game.pin}] Game over`);
      return;
    }

    const q = game.questions[game.currentQuestionIndex];
    game.phase = 'question';
    game.answeredCount = 0;
    game.questionStartTime = Date.now();
    game.timeLeft = q.timeLimit;

    Object.values(game.players).forEach(p => {
      p.answered = false;
      p.lastAnswer = null;
      p.lastCorrect = false;
      p.lastPoints = 0;
    });

    const hostPayload = {
      index: game.currentQuestionIndex,
      total: game.questions.length,
      question: q.question,
      answers: q.answers,
      timeLimit: q.timeLimit,
      correct: q.correct
    };

    const playerPayload = {
      index: game.currentQuestionIndex,
      total: game.questions.length,
      question: q.question,
      answers: q.answers,
      timeLimit: q.timeLimit
    };

    console.log(`[GAME ${game.pin}] Sending Q${game.currentQuestionIndex + 1} to host ${game.hostSocketId}`);
    io.to(game.hostSocketId).emit('show-question', hostPayload);

    // Send to all players (everyone in room except host)
    Object.keys(game.players).forEach(playerSocketId => {
      io.to(playerSocketId).emit('show-question-player', playerPayload);
    });
    console.log(`[GAME ${game.pin}] Sent to ${Object.keys(game.players).length} players`);

    if (game.timer) clearInterval(game.timer);
    game.timer = setInterval(() => {
      game.timeLeft--;
      io.to(game.pin).emit('timer-tick', { timeLeft: game.timeLeft });
      if (game.timeLeft <= 0) {
        clearInterval(game.timer);
        game.timer = null;
        endQuestion(game);
      }
    }, 1000);
  });

  socket.on('player-answer', ({ answerIndex }) => {
    const game = games[socket.gamePin];
    if (!game || socket.role !== 'player') return;
    if (game.phase !== 'question') return;

    const player = game.players[socket.id];
    if (!player || player.answered) return;

    player.answered = true;
    player.lastAnswer = answerIndex;
    const q = game.questions[game.currentQuestionIndex];
    const isCorrect = answerIndex === q.correct;
    player.lastCorrect = isCorrect;

    if (isCorrect) {
      const elapsed = (Date.now() - game.questionStartTime) / 1000;
      const timeFraction = Math.max(0, 1 - elapsed / q.timeLimit);
      const points = Math.round(500 + 500 * timeFraction);
      player.score += points;
      player.streak++;
      player.lastPoints = points;
      if (player.streak >= 3) {
        const bonus = Math.min(player.streak * 50, 300);
        player.score += bonus;
        player.lastPoints += bonus;
      }
    } else {
      player.streak = 0;
      player.lastPoints = 0;
    }

    game.answeredCount++;
    io.to(game.hostSocketId).emit('answer-received', {
      answeredCount: game.answeredCount,
      totalPlayers: Object.keys(game.players).length
    });

    if (game.answeredCount >= Object.keys(game.players).length) {
      if (game.timer) clearInterval(game.timer);
      game.timer = null;
      endQuestion(game);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);

    if (socket.gamePin && socket.role === 'player') {
      const game = games[socket.gamePin];
      if (game && game.players[socket.id]) {
        const name = game.players[socket.id].name;
        delete game.players[socket.id];
        io.to(game.hostSocketId).emit('player-left', {
          name,
          playerCount: Object.keys(game.players).length,
          players: Object.values(game.players).map(p => ({ name: p.name, score: p.score }))
        });
      }
    }

    if (socket.gamePin && socket.role === 'host') {
      const game = games[socket.gamePin];
      if (game) {
        if (game.timer) clearInterval(game.timer);
        io.to(game.pin).emit('game-ended-by-host');
        delete games[socket.gamePin];
        console.log(`[GAME ${socket.gamePin}] Deleted (host left)`);
      }
    }
  });
});

function endQuestion(game) {
  game.phase = 'results';
  const q = game.questions[game.currentQuestionIndex];
  const answerCounts = [0, 0, 0, 0];
  Object.values(game.players).forEach(p => {
    if (p.lastAnswer !== null && p.lastAnswer >= 0 && p.lastAnswer < 4) {
      answerCounts[p.lastAnswer]++;
    }
  });

  let count = 3;
  io.to(game.pin).emit('reveal-countdown', { count });
  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      io.to(game.pin).emit('reveal-countdown', { count });
    } else {
      clearInterval(interval);
      io.to(game.hostSocketId).emit('reveal-answers', {
        correctAnswer: q.correct,
        answerCounts,
        answers: q.answers
      });
      Object.entries(game.players).forEach(([sid, p]) => {
        const isCorrect = p.lastAnswer === q.correct;
        io.to(sid).emit('answer-result', {
          correct: isCorrect,
          points: p.lastPoints,
          totalScore: p.score,
          streak: p.streak,
          timedOut: !p.answered
        });
      });
    }
  }, 1000);
}

function getLeaderboard(game) {
  return Object.values(game.players)
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, name: p.name, score: p.score, streak: p.streak }));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║       Quiz Game Server Running!       ║
  ║   Host:  http://localhost:${PORT}/host   ║
  ║   Join:  http://localhost:${PORT}/join   ║
  ╚═══════════════════════════════════════╝
  `);
});