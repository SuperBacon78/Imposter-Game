const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const players = {};

io.on('connection', (socket) => {
    console.log('A player joined: ' + socket.id);

    // Spawn players in a basic starting position
    players[socket.id] = {
        id: socket.id,
        x: 400,
        y: 300,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        role: 'crewmate',
        isAlive: true
    };

    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);

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