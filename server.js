
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["polling", "websocket"]
});

app.use(express.static("public"));
app.get("/health", (req, res) => res.send("Superstar Showdown is running!"));

const rooms = {};

const characters = {
  "Salman Khan": { power: "Bhaijaan Power", damage: 32 },
  "Shah Rukh Khan": { power: "King Khan Power", damage: 30 },
  "Amitabh Bachchan": { power: "Big B Power", damage: 34 }
};

function makeCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRoom(socket) {
  return rooms[socket.data.roomCode] || null;
}

function sendState(code) {
  const room = rooms[code];
  if (!room) return;

  io.to(code).emit("state", {
    code,
    players: room.players,
    started: room.started,
    winner: room.winner,
    message: room.message
  });
}

function createPlayer(socket, data, slot) {
  const character = characters[data.character] ? data.character : "Salman Khan";

  return {
    id: socket.id,
    name: String(data.name || "Player").slice(0, 18),
    character,
    power: characters[character].power,
    hp: 100,
    charge: 0,
    x: slot === 0 ? 25 : 75,
    y: 50,
    blocking: false,
    attacking: false,
    facing: slot === 0 ? 1 : -1,
    jumping: false,
    jumpStartedAt: 0,
    crouching: false,
    lastAttackAt: 0
  };
}

io.on("connection", socket => {
  console.log("Player connected:", socket.id);

  socket.on("createRoom", data => {
    const code = makeCode();

    rooms[code] = {
      players: [],
      started: false,
      winner: null,
      message: "Waiting for opponent..."
    };

    rooms[code].players.push(createPlayer(socket, data || {}, 0));
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.slot = 0;

    socket.emit("joined", { code, slot: 0 });
    sendState(code);
  });

  socket.on("joinRoom", data => {
    data = data || {};
    const code = String(data.code || "").toUpperCase();
    const room = rooms[code];

    if (!room) return socket.emit("errorMessage", "Room not found!");
    if (room.players.length >= 2) return socket.emit("errorMessage", "Room is full!");
    if (room.started) return socket.emit("errorMessage", "Match already started!");

    room.players.push(createPlayer(socket, data, 1));
    room.message = "Both fighters are ready!";

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.slot = 1;

    socket.emit("joined", { code, slot: 1 });
    sendState(code);
  });

  socket.on("startMatch", () => {
    const room = getRoom(socket);
    if (!room) return;
    if (room.players.length !== 2) {
      return socket.emit("errorMessage", "Waiting for opponent!");
    }
    if (room.started) return;

    room.started = true;
    room.message = "FIGHT!";
    sendState(socket.data.roomCode);
  });

  socket.on("move", direction => {
    const room = getRoom(socket);
    if (!room || !room.started || room.winner) return;

    const player = room.players[socket.data.slot];
    if (!player || !direction) return;

    const now = Date.now();

    // Only horizontal movement
    let dx = Math.max(-1, Math.min(1, Number(direction.dx) || 0));
    player.x = Math.max(5, Math.min(95, player.x + dx * 3.2));

    // Jump
    if (player.jumping && now - player.jumpStartedAt >= 650) {
      player.jumping = false;
    }

    if (direction.jump && !player.jumping) {
      player.jumping = true;
      player.jumpStartedAt = now;
      player.crouching = false;
    }

    // Crouch
    if (!player.jumping) {
      player.crouching = Boolean(direction.crouch);
    }

    const opponent = room.players[1 - socket.data.slot];
    if (opponent) {
      player.facing = opponent.x >= player.x ? 1 : -1;
    }

    sendState(socket.data.roomCode);
  });

  socket.on("action", type => {
    const room = getRoom(socket);
    if (!room || !room.started || room.winner) return;

    const player = room.players[socket.data.slot];
    const opponent = room.players[1 - socket.data.slot];
    if (!player || !opponent) return;

    if (type === "block") {
      player.blocking = true;
      room.message = player.name + " is blocking!";
      sendState(socket.data.roomCode);
      return;
    }

    if (type === "release") {
      player.blocking = false;
      room.message = player.name + " released the block.";
      sendState(socket.data.roomCode);
      return;
    }

    if (type !== "punch" && type !== "special") return;

    const now = Date.now();
    if (now - player.lastAttackAt < 400) return;

    const distance = Math.abs(player.x - opponent.x);

    if (type === "special" && player.charge < 100) {
      room.message = "Superpower needs 100% charge!";
      sendState(socket.data.roomCode);
      return;
    }

    if (distance > 24) {
      room.message = "Too far away! Move closer!";
      sendState(socket.data.roomCode);
      return;
    }

    player.lastAttackAt = now;

    let damage = type === "special"
      ? characters[player.character].damage
      : 10;

    if (type === "special") {
      player.charge = 0;
    } else {
      player.charge = Math.min(100, player.charge + 20);
    }

    if (opponent.blocking) damage = Math.ceil(damage * 0.2);

    opponent.hp = Math.max(0, opponent.hp - damage);
    player.attacking = true;

    room.message = type === "special"
      ? player.power + " unleashed!"
      : player.name + " landed a punch!";

    io.to(socket.data.roomCode).emit("combatEvent", {
      slot: socket.data.slot,
      type,
      character: player.character
    });

    if (opponent.hp <= 0) {
      room.winner = player.name;
      room.message = player.name + " wins the fight!";
    }

    sendState(socket.data.roomCode);

    setTimeout(() => {
      player.attacking = false;
      if (rooms[socket.data.roomCode]) sendState(socket.data.roomCode);
    }, 250);
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = code ? rooms[code] : null;
    if (!room) return;

    room.players = room.players.filter(p => p.id !== socket.id);

    if (room.players.length === 0) {
      delete rooms[code];
    } else {
      room.started = false;
      room.winner = null;
      room.message = "Opponent disconnected. Waiting for another player.";
      sendState(code);
    }

    console.log("Player disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("Superstar Showdown running on port " + PORT);
});
                      
