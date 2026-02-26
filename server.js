const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const players = {};

// Building our Space Station Map
const walls = [
    // Outer Boundaries so you don't float into space
    { x: -1000, y: -1000, w: 2000, h: 50 },  // Top boundary
    { x: -1000, y: 950, w: 2000, h: 50 },    // Bottom boundary
    { x: -1000, y: -1000, w: 50, h: 2000 },  // Left boundary
    { x: 950, y: -1000, w: 50, h: 2000 },    // Right boundary

    // The 4 massive giant room blocks (creates a cross-shaped hallway system)
    { x: -700, y: -700, w: 500, h: 500 }, // Top-Left Block
    { x: 200, y: -700, w: 500, h: 500 },  // Top-Right Block
    { x: -700, y: 200, w: 500, h: 500 },  // Bottom-Left Block
    { x: 200, y: 200, w: 500, h: 500 }    // Bottom-Right Block
];

io.on('connection', (socket) => {
    console.log('A player connected: ' + socket.id);

    // When a player types their name and clicks Join
    socket.on('joinGame', (playerName) => {
        players[socket.id] = {
            id: socket.id,
            name: playerName || "Astronaut", // Default name if they leave it blank
            x: 0,
            y: 0, // Everyone spawns in the exact center hub
            color: '#' + Math.floor(Math.random() * 16777215).toString(16),
            role: 'crewmate',
            isAlive: true
        };

        socket.emit('mapData', walls);
        socket.emit('currentPlayers', players);
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id] && players[socket.id].isAlive) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

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

    socket.on('tryTag', () => {
        const attacker = players[socket.id];
        if (!attacker || attacker.role !== 'imposter' || !attacker.isAlive) return;

        for (let id in players) {
            if (id !== socket.id && players[id].isAlive && players[id].role === 'crewmate') {
                const target = players[id];
                const dx = attacker.x - target.x;
                const dy = attacker.y - target.y;

                if (Math.sqrt(dx * dx + dy * dy) < 50) {
                    players[id].isAlive = false;
                    io.emit('playerTagged', id);

                    let crewmatesAlive = 0;
                    for (let pId in players) {
                        if (players[pId].role === 'crewmate' && players[pId].isAlive) {
                            crewmatesAlive++;
                        }
                    }
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