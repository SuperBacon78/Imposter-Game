const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const players = {};

// Define the map walls (x, y, width, height)
const walls = [
    { x: -500, y: -500, w: 1000, h: 40 }, // Top wall
    { x: -500, y: 460, w: 1000, h: 40 },  // Bottom wall
    { x: -500, y: -500, w: 40, h: 1000 }, // Left wall
    { x: 460, y: -500, w: 40, h: 1000 },  // Right wall
    { x: -150, y: -50, w: 300, h: 100 }   // Middle obstacle to hide behind!
];

io.on('connection', (socket) => {
    console.log('A player joined: ' + socket.id);

    // Send map data to the new player
    socket.emit('mapData', walls);

    // Default setup for new players
    players[socket.id] = {
        id: socket.id,
        x: Math.floor(Math.random() * 400) - 200,
        y: Math.floor(Math.random() * 400) - 200,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        role: 'crewmate',
        isAlive: true
    };

    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);

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
        if (playerIds.length < 2) return;

        playerIds.forEach(id => {
            players[id].role = 'crewmate';
            players[id].isAlive = true;
        });

        const imposterId = playerIds[Math.floor(Math.random() * playerIds.length)];
        players[imposterId].role = 'imposter';

        io.emit('gameStarted', players);
    });

    // Imposter Tag Logic & Win Check
    socket.on('tryTag', () => {
        const attacker = players[socket.id];
        if (!attacker || attacker.role !== 'imposter' || !attacker.isAlive) return;

        for (let id in players) {
            if (id !== socket.id && players[id].isAlive && players[id].role === 'crewmate') {
                const target = players[id];

                const dx = attacker.x - target.x;
                const dy = attacker.y - target.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 50) {
                    players[id].isAlive = false;
                    io.emit('playerTagged', id);

                    // CHECK FOR GAME OVER: Are any crewmates left alive?
                    let crewmatesAlive = 0;
                    for (let pId in players) {
                        if (players[pId].role === 'crewmate' && players[pId].isAlive) {
                            crewmatesAlive++;
                        }
                    }

                    // If no crewmates are alive, the Imposter wins!
                    if (crewmatesAlive === 0) {
                        io.emit('gameOver', 'IMPOSTER WINS!');
                    }
                    break;
                }
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('A player left: ' + socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});