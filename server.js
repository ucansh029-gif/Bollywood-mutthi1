
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.send("Superstar Showdown is running!");
});

const rooms = {};

const characters = {
  "Salman Khan": {
    power: "Bhaijaan Power",
    damage: 32
  },
  "Shah Rukh Khan": {
    power: "King Khan Power",
    damage: 30
  },
  "Amitabh Bachchan": {
    power: "Big B Power",
    damage: 34
  }
};

function makeCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRoom(socket) {
  return socket.data.roomCode
    ? rooms[socket.data.roomCode]
    : null;
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
  const character = characters[data.character]
    ? data.character
    : "Salman Khan";

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
    facing: slot === 0 ? 1 : -1
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

    const room = rooms[code];

    room.players.push(createPlayer(socket, data, 0));

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.slot = 0;

    socket.emit("joined", {
      code,
      slot: 0
    });

    sendState(code);
  });

  socket.on("joinRoom", data => {
    const code = String(data.code || "").toUpperCase();
    const room = rooms[code];

    if (!room) {
      socket.emit("errorMessage", "Room not found!");
      return;
    }

    if (room.players.length >= 2) {
      socket.emit("errorMessage", "Room is full!");
      return;
    }

    if (room.started) {
      socket.emit("errorMessage", "Match already started!");
      return;
    }

    room.players.push(createPlayer(socket, data, 1));
    room.message = "Both fighters are ready!";

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.slot = 1;

    socket.emit("joined", {
      code,
      slot: 1
    });

    sendState(code);
  });

  socket.on("startMatch", () => {
    const room = getRoom(socket);
    if (!room) return;

    if (room.players.length !== 2) {
      socket.emit("errorMessage", "Waiting for opponent!");
      return;
    }

    room.started = true;
    room.message = "FIGHT!";

    sendState(socket.data.roomCode);
  });

  socket.on("move", direction => {
    const room = getRoom(socket);
    if (!room || !room.started || room.winner) return;

    const player = room.players[socket.data.slot];
    if (!player || typeof direction !== "object") return;

    let dx = Number(direction.dx) || 0;
    let dy = Number(direction.dy) || 0;

    dx = Math.max(-1, Math.min(1, dx));
    dy = Math.max(-1, Math.min(1, dy));

    player.x = Math.max(5, Math.min(95, player.x + dx * 2));
    player.y = Math.max(10, Math.min(90, player.y + dy * 2));

    const opponent = room.players[1 - socket.data.slot];

    if (opponent) {
      player.facing = opponent.x >= player.x ? 1 : -1;
    }

    sendState(socket.data.roomCode);
  });

  socket.on("action", type => {
    const room = getRoom(socket);
    if (!room || !room.started || room.winner) return;

    const slot = socket.data.slot;
    const player = room.players[slot];
    const opponent = room.players[1 - slot];

    if (!player || !opponent) return;

    if (type === "block") {
      player.blocking = true;
      room.message = player.name + " is blocking!";
    }

    if (type === "release") {
      player.blocking = false;
      room.message = player.name + " released the block.";
    }

    if (type === "punch" || type === "special") {
      const distance = Math.hypot(
        player.x - opponent.x,
        player.y - opponent.y
      );

      if (type === "special" && player.charge < 100) {
        room.message = "Superpower needs 100% charge!";
        sendState(socket.data.roomCode);
        return;
      }

      if (distance > 24) {
        room.message = "Too far away! Move closer to punch.";
        sendState(socket.data.roomCode);
        return;
      }

      let damage = type === "special"
        ? characters[player.character].damage
        : 10;

      if (type === "special") {
        player.charge = 0;
      } else {
        player.charge = Math.min(100, player.charge + 20);
      }

      if (opponent.blocking) {
        damage = Math.ceil(damage * 0.2);
      }

      opponent.hp = Math.max(0, opponent.hp - damage);

      player.attacking = true;
      room.message = type === "special"
        ? player.power + " unleashed!"
        : player.name + " landed a punch!";

      if (opponent.hp <= 0) {
        room.winner = player.name;
        room.message = player.name + " wins the fight!";
      }

      setTimeout(() => {
        player.attacking = false;
        if (rooms[socket.data.roomCode]) {
          sendState(socket.data.roomCode);
        }
      }, 250);
    }

    sendState(socket.data.roomCode);
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = code ? rooms[code] : null;

    if (!room) return;

    room.players = room.players.filter(
      player => player.id !== socket.id
    );

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
            
