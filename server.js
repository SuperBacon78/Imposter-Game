const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const players = {};

io.on('connection', (socket) => {
    console.log('A client connected: ' + socket.id);

    // Wait for the player to click "Join Game" on the main menu
    socket.on('joinGame', (username) => {
        console.log(`${username || 'Someone'} joined the game with ID: ${socket.id}`);

        // Setup the new player
        players[socket.id] = {
            id: socket.id,
            name: username || 'Player', // Fallback to 'Player' if left blank
            x: Math.floor(Math.random() * 800) - 400,
            y: Math.floor(Math.random() * 800) - 400,
            color: '#' + Math.floor(Math.random() * 16777215).toString(16),
            role: 'crewmate',
            isAlive: true
        };

        socket.emit('currentPlayers', players);
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    // Movement
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id] && players[socket.id].isAlive) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // Start Game & Pick Imposter
    socket.on('startGame', () => {
        const playerIds = Object.keys(players);
        if (playerIds.length < 2) return; // Need at least 2 people to play

        // Reset everyone to living crewmates
        playerIds.forEach(id => {
            players[id].role = 'crewmate';
            players[id].isAlive = true;
        });

        // Pick one random imposter
        const imposterId = playerIds[Math.floor(Math.random() * playerIds.length)];
        players[imposterId].role = 'imposter';

        io.emit('gameStarted', players);
    });

    // Imposter Tag Logic
    socket.on('tryTag', () => {
        const attacker = players[socket.id];
        // Only a living imposter can tag
        if (!attacker || attacker.role !== 'imposter' || !attacker.isAlive) return;

        for (let id in players) {
            if (id !== socket.id && players[id].isAlive) {
                const target = players[id];

                // Calculate distance between imposter and target
                const dx = attacker.x - target.x;
                const dy = attacker.y - target.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // If they are close enough (50 pixels), tag them!
                if (distance < 50) {
                    players[id].isAlive = false;
                    io.emit('playerTagged', id);
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
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});