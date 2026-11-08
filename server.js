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
app.get("/health", (req, res) => res.send("SUPERSTAR SHOWDOWN 3D ONLINE"));

const CHARACTERS = {
  "Salman Khan": { power: "Bhaijaan Power", damage: 32 },
  "Shah Rukh Khan": { power: "King Khan Power", damage: 30 },
  "Amitabh Bachchan": { power: "Big B Power", damage: 34 }
};
const rooms = {};

function roomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
function state(code) {
  const r = rooms[code];
  if (!r) return;
  io.to(code).emit("state", {
    players: r.players, started: r.started, winner: r.winner,
    message: r.message, code
  });
}
function makePlayer(socket, data, slot) {
  const character = CHARACTERS[data.character] ? data.character : "Salman Khan";
  return {
    id: socket.id, name: String(data.name || "Player").slice(0, 18),
    character, power: CHARACTERS[character].power,
    hp: 100, charge: 0, x: slot === 0 ? -4 : 4,
    facing: slot === 0 ? 1 : -1, jumping: false,
    jumpStartedAt: 0, crouching: false, blocking: false,
    attacking: false, lastAttackAt: 0
  };
}
io.on("connection", socket => {
  socket.on("createRoom", data => {
    const code = roomCode();
    rooms[code] = { players: [makePlayer(socket, data || {}, 0)], started: false, winner: null, message: "Waiting for opponent..." };
    socket.join(code); socket.data.roomCode = code; socket.data.slot = 0;
    socket.emit("joined", { code, slot: 0 }); state(code);
  });

  socket.on("joinRoom", data => {
    const code = String((data && data.code) || "").toUpperCase();
    const r = rooms[code];
    if (!r) return socket.emit("errorMessage", "Room not found!");
    if (r.players.length >= 2) return socket.emit("errorMessage", "Room is full!");
    if (r.started) return socket.emit("errorMessage", "Match already started!");
    r.players.push(makePlayer(socket, data || {}, 1));
    r.message = "Both fighters are ready!";
    socket.join(code); socket.data.roomCode = code; socket.data.slot = 1;
    socket.emit("joined", { code, slot: 1 }); state(code);
  });

  socket.on("startMatch", () => {
    const r = rooms[socket.data.roomCode];
    if (!r) return;
    if (r.players.length !== 2) return socket.emit("errorMessage", "Waiting for opponent!");
    r.started = true; r.winner = null; r.message = "FIGHT!"; state(socket.data.roomCode);
  });

  socket.on("move", input => {
    const r = rooms[socket.data.roomCode];
    if (!r || !r.started || r.winner) return;
    const p = r.players[socket.data.slot];
    if (!p || !input) return;
    const dx = Math.max(-1, Math.min(1, Number(input.dx) || 0));
    p.x = Math.max(-6.2, Math.min(6.2, p.x + dx * 0.22));
    const now = Date.now();
    if (p.jumping && now - p.jumpStartedAt > 720) p.jumping = false;
    if (input.jump && !p.jumping) {
      p.jumping = true; p.jumpStartedAt = now; p.crouching = false;
    }
    p.crouching = !p.jumping && !!input.crouch;
    const enemy = r.players[1 - socket.data.slot];
    if (enemy) p.facing = enemy.x >= p.x ? 1 : -1;
    state(socket.data.roomCode);
  });

  socket.on("action", type => {
    const r = rooms[socket.data.roomCode];
    if (!r || !r.started || r.winner) return;
    const p = r.players[socket.data.slot], enemy = r.players[1 - socket.data.slot];
    if (!p || !enemy) return;
    if (type === "block") { p.blocking = true; state(socket.data.roomCode); return; }
    if (type === "release") { p.blocking = false; state(socket.data.roomCode); return; }
    if (!["punch", "kick", "grab", "special"].includes(type)) return;
    const now = Date.now();
    if (now - p.lastAttackAt < 430) return;
    if (type === "special" && p.charge < 100) {
      socket.emit("errorMessage", "Super meter needs 100%!"); return;
    }
    if (Math.abs(enemy.x - p.x) > (type === "special" ? 4.8 : 3.1)) {
      socket.emit("errorMessage", "Move closer to your opponent!"); return;
    }
    p.lastAttackAt = now;
    let damage = type === "punch" ? 10 : type === "kick" ? 13 : type === "grab" ? 16 : CHARACTERS[p.character].damage;
    if (type === "special") p.charge = 0;
    else p.charge = Math.min(100, p.charge + (type === "punch" ? 18 : 22));
    if (enemy.blocking && type !== "grab") damage = Math.ceil(damage * 0.2);
    if (enemy.crouching && type === "kick") damage = Math.ceil(damage * 0.3);
    enemy.hp = Math.max(0, enemy.hp - damage);
    p.attacking = true;
    r.message = type === "special" ? p.power + "!" : p.name + " used " + type.toUpperCase() + "!";
    io.to(socket.data.roomCode).emit("combatEvent", { slot: socket.data.slot, type, character: p.character });
    if (enemy.hp <= 0) { r.winner = p.name; r.message = p.name + " WINS!"; }
    state(socket.data.roomCode);
    setTimeout(() => {
      p.attacking = false;
      if (rooms[socket.data.roomCode]) state(socket.data.roomCode);
    }, 280);
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode, r = code && rooms[code];
    if (!r) return;
    r.players = r.players.filter(p => p.id !== socket.id);
    if (!r.players.length) delete rooms[code];
    else { r.started = false; r.winner = null; r.message = "Opponent disconnected. Waiting for another player."; state(code); }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log("SUPERSTAR SHOWDOWN 3D on " + PORT));
