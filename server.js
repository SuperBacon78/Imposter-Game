const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const players = {};
let gameInterval = null;
let timeRemaining = 300; // 5 minutes (in seconds)
let isGameRunning = false;

// --- Helper Functions for Game Logic ---
function checkWinConditions() {
    if (!isGameRunning) return;

    const playerIds = Object.keys(players);
    let aliveCrewmates = 0;

    playerIds.forEach(id => {
        if (players[id].role === 'crewmate' && players[id].isAlive) {
            aliveCrewmates++;
        }
    });

    // If no crewmates are left alive, imposters win!
    if (aliveCrewmates === 0) {
        endGame('IMPOSTERS WIN! All crewmates eliminated.');
    }
}

function endGame(reason) {
    isGameRunning = false;
    clearInterval(gameInterval);
    io.emit('gameOver', reason);
}

// --- Server Setup ---
io.on('connection', (socket) => {
    console.log('A client connected: ' + socket.id);

    socket.on('joinGame', (username) => {
        players[socket.id] = {
            id: socket.id,
            name: username || 'Player',
            x: Math.floor(Math.random() * 800) - 400,
            y: Math.floor(Math.random() * 800) - 400,
            color: '#' + Math.floor(Math.random() * 16777215).toString(16),
            role: 'crewmate',
            isAlive: true
        };

        socket.emit('currentPlayers', players);
        socket.broadcast.emit('newPlayer', players[socket.id]);

        // Send current time if they join mid-game
        if (isGameRunning) {
            socket.emit('timeUpdate', timeRemaining);
        }
    });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id] && players[socket.id].isAlive) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            socket.broadcast.emit('playerMoved', players[socket.id]);

            // Auto-tagging logic (if you kept it)
            const me = players[socket.id];
            if (me.role === 'imposter' && isGameRunning) {
                for (let id in players) {
                    if (id !== socket.id && players[id].isAlive && players[id].role === 'crewmate') {
                        const target = players[id];
                        const dx = me.x - target.x;
                        const dy = me.y - target.y;
                        if (Math.sqrt(dx * dx + dy * dy) < 40) {
                            players[id].isAlive = false;
                            io.emit('playerTagged', id);
                            checkWinConditions(); // Check if that was the last crewmate!
                        }
                    }
                }
            }
        }
    });

    socket.on('startGame', () => {
        if (isGameRunning) return;

        const playerIds = Object.keys(players);
        if (playerIds.length < 2) return; // Need at least 2 people to test

        // Reset everyone
        playerIds.forEach(id => {
            players[id].role = 'crewmate';
            players[id].isAlive = true;
        });

        // Pick Imposters (Max 2, but only 1 if there are only 2 players testing)
        const imposterCount = Math.min(2, playerIds.length - 1);
        let shuffled = playerIds.sort(() => 0.5 - Math.random());

        for (let i = 0; i < imposterCount; i++) {
            players[shuffled[i]].role = 'imposter';
        }

        isGameRunning = true;
        timeRemaining = 300; // Reset to 5 minutes
        io.emit('gameStarted', players);
        io.emit('timeUpdate', timeRemaining);

        // Start the timer
        clearInterval(gameInterval);
        gameInterval = setInterval(() => {
            timeRemaining--;
            io.emit('timeUpdate', timeRemaining);

            // If time runs out, Crewmates win!
            if (timeRemaining <= 0) {
                endGame('CREWMATES WIN! Time ran out.');
            }
        }, 1000);
    });

    socket.on('tryTag', () => {
        const attacker = players[socket.id];
        if (!attacker || attacker.role !== 'imposter' || !attacker.isAlive || !isGameRunning) return;

        for (let id in players) {
            if (id !== socket.id && players[id].isAlive && players[id].role === 'crewmate') {
                const target = players[id];
                const dx = attacker.x - target.x;
                const dy = attacker.y - target.y;

                if (Math.sqrt(dx * dx + dy * dy) < 50) {
                    players[id].isAlive = false;
                    io.emit('playerTagged', id);
                    checkWinConditions(); // Check if that was the last crewmate!
                    break;
                }
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('A player left: ' + socket.id);
        if (players[socket.id]) {
            delete players[socket.id];
            io.emit('playerDisconnected', socket.id);
            checkWinConditions(); // If a crewmate rage-quits, imposters might win
        }

        // Stop game if everyone leaves
        if (Object.keys(players).length === 0) {
            isGameRunning = false;
            clearInterval(gameInterval);
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});