# Bollywood Boxing Online

A simple real-time 1-vs-1 browser boxing game using Node.js, Express and Socket.IO.

## Run on your computer

1. Install Node.js (LTS): https://nodejs.org/
2. Open a terminal in this project folder.
3. Run `npm install`
4. Run `npm start`
5. Open http://localhost:3000 in your browser.

To test locally, open two browser tabs. Create a room in one tab and join using its 5-character room code in the other.

## Publish on GitHub

1. Create a new GitHub repository.
2. Upload all files in this folder, including `server.js`, `package.json`, `README.md`, and the `public` folder.
3. Commit the files.

## Put the game online

GitHub stores the source code; it does not run this Socket.IO server by itself.

One deployment route:
1. Sign in to https://render.com/
2. Create a **New Web Service** and connect your GitHub repository.
3. Set **Build Command** to `npm install`.
4. Set **Start Command** to `npm start`.
5. Choose a Node runtime and deploy.
6. Open the HTTPS URL Render gives you. Share that URL with friends.

The server listens on `process.env.PORT`, as required by common Node hosting platforms.

## How to play online

1. Both players open the same deployed website.
2. Player 1 chooses a name and superstar, then selects **Create Private Room**.
3. Share the five-character room code with Player 2.
4. Player 2 selects a character, enters the code and taps **Join Room**.
5. Punch to damage the opponent and charge your superpower. Block to defend. At 100%, use Superpower.

## Notes

- This is a starter multiplayer game: one room supports two players.
- Room state is held in server memory. Restarting the server clears active rooms.
- It is a casual prototype, not a hardened competitive game. Add authentication, rate limiting, persistent storage and stronger anti-cheat controls before operating it publicly at scale.
- Character names and dialogue references are fan-made entertainment content; this project is not affiliated with the actors.


## Visual effects and sound

The browser client includes animated idle fighter portraits, punch/shock animations, superpower flashes, and synthesized punch/block/superpower/victory sounds using the Web Audio API. No external audio files are needed. Players can turn sound off with the in-game sound toggle. Most browsers require a user interaction before audio can start.
