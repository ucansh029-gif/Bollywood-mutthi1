const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["polling", "websocket"]
});

app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.send("SUPERSTAR SHOWDOWN ONLINE");
});

const CHARACTERS = {
  "Salman Khan": { power: "Bhaijaan Power", damage: 32 },
  "Shah Rukh Khan": { power: "King Khan Power", damage: 30 },
  "Amitabh Bachchan": { power: "Big B Power", damage: 34 }
};

const rooms = {};

function roomCode() {
  let code;
  do {
    code = Math.random().toString(36).slice(2, 8).toUpperCase();
  } while (rooms[code]);
  return code;
}

function sendState(code) {
  const r = rooms[code];
  if (!r) return;

  io.to(code).emit("state", {
    players: r.players,
    started: r.started,
    winner: r.winner,
    message: r.message,
    code: code
  });
}

function makePlayer(socket, data, slot) {
  const character = CHARACTERS[data.character]
    ? data.character
    : "Salman Khan";

  return {
    id: socket.id,
    name: String(data.name || "Player").slice(0, 18),
    character: character,
    power: CHARACTERS[character].power,
    hp: 100,
    charge: 0,
    x: slot === 0 ? -4 : 4,
    facing: slot === 0 ? 1 : -1,
    jumping: false,
    jumpStartedAt: 0,
    crouching: false,
    blocking: false,
    attacking: false,
    lastAttackAt: 0
  };
}

function startMatch(code) {
  const r = rooms[code];

  if (!r || r.players.length !== 2 || r.started) return;

  r.started = true;
  r.winner = null;
  r.message = "FIGHT!";

  r.players.forEach(p => {
    p.hp = 100;
    p.charge = 0;
    p.x = p.id === r.players[0].id ? -4 : 4;
    p.blocking = false;
    p.attacking = false;
    p.jumping = false;
    p.crouching = false;
  });

  sendState(code);
}

io.on("connection", socket => {

  console.log("Player connected:", socket.id);

  socket.on("createRoom", data => {

    const code = roomCode();

    rooms[code] = {
      players: [makePlayer(socket, data || {}, 0)],
      started: false,
      winner: null,
      message: "Waiting for opponent..."
    };

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.slot = 0;

    socket.emit("joined", {
      code: code,
      slot: 0
    });

    sendState(code);

    console.log("Room created:", code);
  });

  socket.on("joinRoom", data => {

    const code = String(
      (data && data.code) || ""
    ).toUpperCase();

    const r = rooms[code];

    if (!r) {
      socket.emit("errorMessage", "Room not found!");
      return;
    }

    if (r.players.length >= 2) {
      socket.emit("errorMessage", "Room is full!");
      return;
    }

    if (r.started) {
      socket.emit("errorMessage", "Match already started!");
      return;
    }

    r.players.push(makePlayer(socket, data || {}, 1));

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.slot = 1;

    socket.emit("joined", {
      code: code,
      slot: 1
    });

    r.message = "Both fighters are ready!";

    // AUTOMATIC MATCH START
    startMatch(code);

    console.log("Player joined:", code);
  });

  socket.on("startMatch", () => {
    const code = socket.data.roomCode;
    const r = rooms[code];

    if (!r) return;

    startMatch(code);
  });

  socket.on("move", input => {

    const code = socket.data.roomCode;
    const r = rooms[code];

    if (!r || !r.started || r.winner) return;

    const p = r.players[socket.data.slot];

    if (!p || !input) return;

    const dx = Math.max(
      -1,
      Math.min(1, Number(input.dx) || 0)
    );

    p.x = Math.max(
      -6.2,
      Math.min(6.2, p.x + dx * 0.22)
    );

    const now = Date.now();

    if (
      p.jumping &&
      now - p.jumpStartedAt > 720
    ) {
      p.jumping = false;
    }

    if (input.jump && !p.jumping) {
      p.jumping = true;
      p.jumpStartedAt = now;
      p.crouching = false;
    }

    p.crouching = !p.jumping && !!input.crouch;

    const enemy = r.players[1 - socket.data.slot];

    if (enemy) {
      p.facing = enemy.x >= p.x ? 1 : -1;
    }

    sendState(code);
  });

  socket.on("action", type => {

    const code = socket.data.roomCode;
    const r = rooms[code];

    if (!r || !r.started || r.winner) return;

    const p = r.players[socket.data.slot];
    const enemy = r.players[1 - socket.data.slot];

    if (!p || !enemy) return;

    if (type === "block") {
      p.blocking = true;
      sendState(code);
      return;
    }

    if (type === "release") {
      p.blocking = false;
      sendState(code);
      return;
    }

    if (![
      "punch",
      "kick",
      "grab",
      "special"
    ].includes(type)) return;

    const now = Date.now();

    if (now - p.lastAttackAt < 430) return;

    if (type === "special" && p.charge < 100) {
      socket.emit(
        "errorMessage",
        "Super meter needs 100%!"
      );
      return;
    }

    const distance = Math.abs(enemy.x - p.x);

    if (
      distance >
      (type === "special" ? 4.8 : 3.1)
    ) {
      socket.emit(
        "errorMessage",
        "Move closer to your opponent!"
      );
      return;
    }

    p.lastAttackAt = now;

    let damage =
      type === "punch" ? 10 :
      type === "kick" ? 13 :
      type === "grab" ? 16 :
      CHARACTERS[p.character].damage;

    if (type === "special") {
      p.charge = 0;
    } else {
      p.charge = Math.min(
        100,
        p.charge + (type === "punch" ? 18 : 22)
      );
    }

    if (enemy.blocking && type !== "grab") {
      damage = Math.ceil(damage * 0.2);
    }

    if (enemy.crouching && type === "kick") {
      damage = Math.ceil(damage * 0.3);
    }

    enemy.hp = Math.max(0, enemy.hp - damage);

    p.attacking = true;

    r.message =
      type === "special"
        ? p.power + "!"
        : p.name + " used " + type.toUpperCase() + "!";

    io.to(code).emit("combatEvent", {
      slot: socket.data.slot,
      type: type,
      character: p.character
    });

    if (enemy.hp <= 0) {
      r.winner = p.name;
      r.message = p.name + " WINS!";
      r.started = false;
    }

    sendState(code);

    setTimeout(() => {
      if (!rooms[code]) return;

      const current = rooms[code];
      const currentPlayer = current.players.find(
        player => player.id === socket.id
      );

      if (currentPlayer) {
        currentPlayer.attacking = false;
        sendState(code);
      }
    }, 280);
  });

  socket.on("disconnect", () => {

    const code = socket.data.roomCode;
    const r = code && rooms[code];

    if (!r) return;

    r.players = r.players.filter(
      p => p.id !== socket.id
    );

    if (r.players.length === 0) {
      delete rooms[code];
      console.log("Room deleted:", code);
      return;
    }

    r.started = false;
    r.winner = null;
    r.message =
      "Opponent disconnected. Waiting for another player.";

    sendState(code);

    console.log("Player disconnected:", code);
  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    "SUPERSTAR SHOWDOWN SERVER RUNNING ON PORT " + PORT
  );
});
