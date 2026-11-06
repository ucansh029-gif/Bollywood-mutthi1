const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true }));

const rooms = new Map();
const characters = ["Salman Khan", "Shah Rukh Khan", "Amitabh Bachchan"];
const stats = {
  "Salman Khan": { power: "Bhaijaan Power", line: "MAIN AA JAAUN KYA APNI PAR?!", special: "BHAI KA DHAMAKA 💥" },
  "Shah Rukh Khan": { power: "King Khan Power", line: "TUM LOGON KI MAA KI...!", special: "KING KHAN STORM ⚡" },
  "Amitabh Bachchan": { power: "Big B Power", line: "AREY TERI MAA KA...!", special: "ANGRY YOUNG MAN BLAST 🔥" }
};

function code() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value;
  do {
    value = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(value));
  return value;
}
function publicState(room) {
  return {
    code: room.code,
    players: room.players.map(p => p ? {
      name: p.name, character: p.character, hp: p.hp, charge: p.charge,
      power: stats[p.character].power
    } : null),
    started: room.started,
    message: room.message,
    winner: room.winner
  };
}
function broadcast(room) { io.to(room.code).emit("state", publicState(room)); }
function say(room, message) { room.message = message; }

io.on("connection", socket => {
  socket.on("createRoom", ({ name, character }, cb) => {
    if (!characters.includes(character)) character = characters[0];
    const roomCode = code();
    const room = { code: roomCode, players: [{ id: socket.id, name: cleanName(name), character, hp: 100, charge: 0 }, null], started: false, message: "Waiting for Player 2 to join...", winner: null, lastAction: [0, 0] };
    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.data.room = roomCode; socket.data.slot = 0;
    cb({ ok: true, code: roomCode, slot: 0 });
    broadcast(room);
  });

  socket.on("joinRoom", ({ code: rawCode, name, character }, cb) => {
    const roomCode = String(rawCode || "").trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) return cb({ ok: false, error: "Room not found. Check the code." });
    if (room.players[1]) return cb({ ok: false, error: "This room is already full." });
    if (!characters.includes(character)) character = characters[1];
    room.players[1] = { id: socket.id, name: cleanName(name), character, hp: 100, charge: 0 };
    room.started = true;
    say(room, "Both fighters are ready! FIGHT! 🥊");
    socket.join(roomCode);
    socket.data.room = roomCode; socket.data.slot = 1;
    cb({ ok: true, code: roomCode, slot: 1 });
    broadcast(room);
  });

  socket.on("action", action => {
    const room = rooms.get(socket.data.room);
    const slot = socket.data.slot;
    if (!room || !room.started || room.winner || !room.players[slot] || !room.players[1-slot]) return;
    const now = Date.now();
    if (now - room.lastAction[slot] < 260) return;
    const me = room.players[slot], opponent = room.players[1-slot];
    if (action === "block") {
      me.blocking = true;
      say(room, `${me.name} is blocking! 🛡️`);
    } else if (action === "release") {
      me.blocking = false;
    } else if (action === "punch") {
      room.lastAction[slot] = now;
      opponent.hp = Math.max(0, opponent.hp - (opponent.blocking ? 3 : 10));
      me.charge = Math.min(100, me.charge + 16);
      say(room, `${me.name} lands a ${opponent.blocking ? "blocked punch" : "POWER PUNCH"}! 👊`);
      opponent.blocking = false;
    } else if (action === "special" && me.charge >= 100) {
      room.lastAction[slot] = now;
      me.charge = 0;
      opponent.hp = Math.max(0, opponent.hp - (opponent.blocking ? 18 : 35));
      say(room, `${stats[me.character].line} — ${stats[me.character].special}!`);
      opponent.blocking = false;
    } else return;
    if (opponent.hp <= 0) {
      room.winner = slot;
      room.started = false;
      say(room, `KNOCKOUT! ${me.name} wins the championship! 🏆`);
    }
    broadcast(room);
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.room;
    const room = rooms.get(roomCode);
    if (!room) return;
    const slot = socket.data.slot;
    if (room.players[slot] && room.players[slot].id === socket.id) {
      room.players[slot] = null;
      room.started = false;
      room.winner = null;
      say(room, "A player disconnected. Create a new room to play again.");
      broadcast(room);
      setTimeout(() => {
        const current = rooms.get(roomCode);
        if (current && current.players.every(p => !p)) rooms.delete(roomCode);
      }, 60000);
    }
  });
});

function cleanName(value) {
  return String(value || "Player").replace(/[<>]/g, "").trim().slice(0, 18) || "Player";
}
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Bollywood Boxing running on port ${PORT}`);
});
