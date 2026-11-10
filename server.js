/**
 * addressbar.net — Real-Time Dark World Multiplayer WebSocket Server
 * 
 * Supports DUAL PROTOCOL (Plain HTTP/WS and TLS HTTPS/WSS) on port 8080.
 * Serves 0.1-increment quantized real-time player synchronization
 * across the 2D Top-Down Retro Dark World realm.
 */

const net = require('net');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

// Active players store: id -> { id, username, x, y, z, rotationY, state, joinedAt, ws, isAlive }
const darkWorldPlayers = new Map();

// Generate unique player connection IDs
let playerIdCounter = 1;
function generatePlayerId(username) {
    const cleanUser = (username || 'guest').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return `dw_${cleanUser}_${Date.now().toString(36)}_${(playerIdCounter++).toString(36)}`;
}

// Coordinate quantizer (0.1 length increment standard)
function snap(val) {
    return Math.round((Number(val) || 0) * 10) / 10;
}

// HTTP request handler for health & diagnostic status checks
function handleHttpRequest(req, res) {
    // CORS headers for local/cross-origin checks
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url.startsWith('/status') || req.url.startsWith('/api/status')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const playerList = Array.from(darkWorldPlayers.values()).map(p => ({
            id: p.id,
            username: p.username,
            dimension: p.dimension || 'DARK',
            room: p.room || 'world',
            x: p.x,
            y: p.y,
            z: p.z,
            rotationY: p.rotationY,
            state: p.state,
            joinedAt: p.joinedAt
        }));

        res.end(JSON.stringify({
            status: 'online',
            service: 'addressbar.net Dark World Multiplayer Server',
            port: PORT,
            sslEnabled: !!httpsServer,
            activeCount: darkWorldPlayers.size,
            players: playerList,
            quantizationIncrement: 0.1,
            serverTime: new Date().toISOString()
        }, null, 2));
        return;
    }

    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, activePlayers: darkWorldPlayers.size }));
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('addressbar.net Dark World Multiplayer WebSocket Server is running on port ' + PORT + '.\nConnect via ws:// or wss://<host>:' + PORT + ' or query /status.');
}

// Create internal HTTP server instance
const httpServer = http.createServer(handleHttpRequest);

// Create internal HTTPS server instance with TLS certificate
let httpsServer = null;
const certPairs = [
    {
        cert: process.env.SSL_CERT,
        key: process.env.SSL_KEY
    },
    {
        cert: '/home/guest/.local/share/mkcert/localhost.pem',
        key: '/home/guest/.local/share/mkcert/localhost-key.pem'
    },
    {
        cert: path.join(__dirname, 'cert.pem'),
        key: path.join(__dirname, 'key.pem')
    },
    {
        cert: '/etc/ssl/certs/ssl-cert-snakeoil.pem',
        key: '/etc/ssl/private/ssl-cert-snakeoil.key'
    }
];

let sslOptions = null;
for (const pair of certPairs) {
    if (!pair.cert || !pair.key) continue;
    try {
        if (fs.existsSync(pair.cert) && fs.existsSync(pair.key)) {
            const certData = fs.readFileSync(pair.cert);
            const keyData = fs.readFileSync(pair.key);
            if (certData.includes('BEGIN CERTIFICATE') && keyData.includes('BEGIN PRIVATE KEY')) {
                sslOptions = {
                    cert: certData,
                    key: keyData
                };
                console.log(`[Multiplayer Server] Loaded TLS Certificate from: ${pair.cert}`);
                break;
            }
        }
    } catch (e) {
        // Continue searching
    }
}

if (sslOptions) {
    try {
        httpsServer = https.createServer(sslOptions, handleHttpRequest);
        console.log(`[Multiplayer Server] HTTPS & WSS protocol enabled.`);
    } catch (e) {
        console.error('[Multiplayer Server Error] Failed to initialize HTTPS server:', e.message);
    }
}

// Load 'ws' package with diagnostic instructions if not yet installed
let WebSocketServer;
try {
    const wsModule = require('ws');
    WebSocketServer = wsModule.WebSocketServer || wsModule.Server;
} catch (err) {
    console.error('\n======================================================');
    console.error('[Multiplayer Error] The "ws" npm package is not installed.');
    console.error('To install dependencies, run:');
    console.error('    cd /var/www/html/addressbar.net/server && npm install');
    console.error('======================================================\n');
}

if (WebSocketServer) {
    // Shared WebSocketServer instance configured for manual upgrade dispatch
    const wss = new WebSocketServer({ noServer: true });

    // Handle WebSocket upgrade over plain HTTP
    httpServer.on('upgrade', (req, socket, head) => {
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    });

    // Handle WebSocket upgrade over TLS / HTTPS
    if (httpsServer) {
        httpsServer.on('upgrade', (req, socket, head) => {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit('connection', ws, req);
            });
        });
    }

const mysql = require('mysql2/promise');

const MINUTE_LIMIT = 3;
const HOUR_LIMIT = 45;

// ---------------------------------------------------------------------------
// Server-Side Chat Message Logging
// - Chat messages saved in a file with the player's name
// - Appended to file
// - Every day, a new file is created for the day
// ---------------------------------------------------------------------------
const CHAT_LOGS_DIR = path.join(__dirname, 'logs', 'chat');
try {
    if (!fs.existsSync(CHAT_LOGS_DIR)) {
        fs.mkdirSync(CHAT_LOGS_DIR, { recursive: true });
    }
} catch (e) {
    console.error('[Chat Logs] Failed to create chat logs directory:', e.message);
}

function getDayString(date = new Date()) {
    const d = (date instanceof Date && !isNaN(date)) ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getTimestampString(date = new Date()) {
    const d = (date instanceof Date && !isNaN(date)) ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function sanitizePlayerFilename(username) {
    if (!username) return 'unknown';
    if (username === '??') return 'hidden_user';
    if (username === '?') return 'unregistered_player';
    const clean = String(username).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    return clean || 'unknown';
}

function logChatMessageToFile(username, room, dimension, message, timestamp = new Date()) {
    try {
        const dateObj = (timestamp instanceof Date && !isNaN(timestamp)) ? timestamp : new Date(timestamp);
        const dayStr = getDayString(dateObj);
        const timeStr = getTimestampString(dateObj);
        const safeUser = sanitizePlayerFilename(username);
        const logLine = `[${timeStr}] [${room || 'world'}] [${dimension || 'DARK'}] ${username}: ${message}\n`;

        // 1. Daily file with player's name in filename: <player>_<YYYY-MM-DD>.log and .txt
        fs.appendFileSync(path.join(CHAT_LOGS_DIR, `${safeUser}_${dayStr}.log`), logLine, 'utf8');
        fs.appendFileSync(path.join(CHAT_LOGS_DIR, `${safeUser}_${dayStr}.txt`), logLine, 'utf8');

        // 2. Daily directory with player's name as filename: <YYYY-MM-DD>/<player>.log and .txt
        const dateDir = path.join(CHAT_LOGS_DIR, dayStr);
        if (!fs.existsSync(dateDir)) {
            fs.mkdirSync(dateDir, { recursive: true });
        }
        fs.appendFileSync(path.join(dateDir, `${safeUser}.log`), logLine, 'utf8');
        fs.appendFileSync(path.join(dateDir, `${safeUser}.txt`), logLine, 'utf8');

        // 3. Player directory with daily file: <player>/<YYYY-MM-DD>.log and .txt
        const playerDir = path.join(CHAT_LOGS_DIR, safeUser);
        if (!fs.existsSync(playerDir)) {
            fs.mkdirSync(playerDir, { recursive: true });
        }
        fs.appendFileSync(path.join(playerDir, `${dayStr}.log`), logLine, 'utf8');
        fs.appendFileSync(path.join(playerDir, `${dayStr}.txt`), logLine, 'utf8');

        // 4. Cumulative player file: <player>.log and .txt
        fs.appendFileSync(path.join(CHAT_LOGS_DIR, `${safeUser}.log`), logLine, 'utf8');
        fs.appendFileSync(path.join(CHAT_LOGS_DIR, `${safeUser}.txt`), logLine, 'utf8');

        // 5. Overall daily chat log: chat_<YYYY-MM-DD>.log and .txt
        fs.appendFileSync(path.join(CHAT_LOGS_DIR, `chat_${dayStr}.log`), logLine, 'utf8');
        fs.appendFileSync(path.join(CHAT_LOGS_DIR, `chat_${dayStr}.txt`), logLine, 'utf8');
    } catch (err) {
        console.error('[Chat Logs] Failed to write chat log to file:', err.message);
    }
}

async function backfillChatLogsFromDb() {
    if (!dbPool) return;
    try {
        const existingEntries = fs.readdirSync(CHAT_LOGS_DIR);
        if (existingEntries.length === 0) {
            const [rows] = await dbPool.query('SELECT username, room, dimension, message, created_at FROM chat_messages ORDER BY id ASC');
            if (rows && rows.length > 0) {
                console.log(`[Chat Logs] Backfilling ${rows.length} existing chat records to log files...`);
                for (const row of rows) {
                    const date = new Date(row.created_at);
                    logChatMessageToFile(row.username, row.room, row.dimension, row.message, date);
                }
                console.log(`[Chat Logs] Initial log files generated successfully.`);
            }
        }
    } catch (e) {
        console.warn('[Chat Logs] Backfill notice:', e.message);
    }
}

// Database pool for persisting player rate limits and chat messages
let dbPool = null;
try {
    dbPool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'duskyember',
        password: process.env.DB_PASSWORD || 'Js5AF2MAhAYvEopZshexBM',
        database: process.env.DB_NAME || 'addressbar_db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    console.log('[Multiplayer Server] MySQL database connection pool initialized.');
    backfillChatLogsFromDb();
} catch (err) {
    console.warn('[Multiplayer Server Notice] Failed to initialize MySQL pool:', err.message);
}

async function loadPlayerDbLimits(username) {
    if (!dbPool || !username) return null;
    try {
        const [rows] = await dbPool.execute(
            'SELECT id, username, locked, chat_minute_count, chat_minute_window_start, chat_hour_count, chat_hour_window_start FROM users WHERE username = ? LIMIT 1',
            [username]
        );
        if (rows && rows.length > 0) {
            if (rows[0].locked) {
                return null;
            }
            return rows[0];
        }
    } catch (e) {
        console.error('[DB Error] Failed to load chat limits for user:', username, e.message);
    }
    return null;
}

async function savePlayerDbLimits(userId, minuteCount, firstMinuteTime, hourCount, firstHourTime) {
    if (!dbPool || !userId) return;
    try {
        await dbPool.execute(
            'UPDATE users SET chat_minute_count = ?, chat_minute_window_start = ?, chat_hour_count = ?, chat_hour_window_start = ? WHERE id = ?',
            [minuteCount, firstMinuteTime || 0, hourCount, firstHourTime || 0, userId]
        );
    } catch (e) {
        console.error('[DB Error] Failed to save chat limits for user ID:', userId, e.message);
    }
}

async function recordChatMessage(userId, username, room, dimension, message) {
    if (!dbPool) return;
    try {
        await dbPool.execute(
            'INSERT INTO chat_messages (user_id, username, room, dimension, message) VALUES (?, ?, ?, ?, ?)',
            [userId || null, username, room || 'world', dimension || 'DARK', message]
        );
    } catch (e) {
        console.error('[DB Error] Failed to record chat message:', e.message);
    }
}

    // Store user chat rate limits: username -> { minuteCount, firstMinuteTime, hourCount, firstHourTime }
    const userChatLimits = new Map();

    function broadcast(messageObj, excludeWs = null) {
        const payload = JSON.stringify(messageObj);
        for (const [_, player] of darkWorldPlayers) {
            if (player.ws && player.ws !== excludeWs && player.ws.readyState === 1) { // 1 = OPEN
                try {
                    player.ws.send(payload);
                } catch (e) {
                    console.error('[Broadcast Error]', e.message);
                }
            }
        }
    }

    function broadcastToRoom(room, messageObj, excludeWs = null) {
        const payload = JSON.stringify(messageObj);
        const targetRoom = (room || 'world').toLowerCase();
        for (const [_, player] of darkWorldPlayers) {
            if (player.ws && player.ws !== excludeWs && player.ws.readyState === 1) { // 1 = OPEN
                const playerRoom = (player.room || 'world').toLowerCase();
                if (playerRoom === targetRoom) {
                    try {
                        player.ws.send(payload);
                    } catch (e) {
                        console.error('[Broadcast Room Error]', e.message);
                    }
                }
            }
        }
    }

    wss.on('connection', (ws, req) => {
        let assignedId = null;
        let authenticatedUser = null;
        ws.isAlive = true;

        ws.on('pong', () => {
            ws.isAlive = true;
        });

        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        const isEncrypted = !!req.socket.encrypted;
        console.log(`[Socket Connect] Inbound connection from ${clientIp} (${isEncrypted ? 'WSS' : 'WS'})`);

        ws.on('message', async (rawMessage) => {
            let data;
            try {
                data = JSON.parse(rawMessage.toString());
            } catch (err) {
                console.warn('[Socket Error] Malformed packet received');
                return;
            }

            // Packet Type: join
            if (data.type === 'join') {
                const requestedUser = (data.username || '').trim().slice(0, 13);
                let dbUser = await loadPlayerDbLimits(requestedUser);
                let isRegistered = !!dbUser;
                let dbUserId = dbUser ? dbUser.id : null;

                // "? is used for the name of all players without an account. It won’t be possible to distinguish players without an account by looking at the name."
                authenticatedUser = isRegistered ? String(dbUser.username || '').slice(0, 13) : '?';
                assignedId = generatePlayerId(authenticatedUser);

                const now = Date.now();
                const userKey = isRegistered ? authenticatedUser.toLowerCase() : assignedId.toLowerCase();

                let limits = userChatLimits.get(userKey);
                if (dbUser) {
                    let minCount = dbUser.chat_minute_count || 0;
                    let minStart = Number(dbUser.chat_minute_window_start) || 0;
                    let hrCount = dbUser.chat_hour_count || 0;
                    let hrStart = Number(dbUser.chat_hour_window_start) || 0;

                    if (minStart > 0 && (now - minStart >= 60000)) {
                        minCount = 0;
                        minStart = 0;
                    }
                    if (hrStart > 0 && (now - hrStart >= 3600000)) {
                        hrCount = 0;
                        hrStart = 0;
                    }

                    if (limits) {
                        if (limits.firstMinuteTime > 0 && (now - limits.firstMinuteTime < 60000)) {
                            if (limits.minuteCount > minCount) {
                                minCount = limits.minuteCount;
                                minStart = limits.firstMinuteTime;
                            }
                        }
                        if (limits.firstHourTime > 0 && (now - limits.firstHourTime < 3600000)) {
                            if (limits.hourCount > hrCount) {
                                hrCount = limits.hourCount;
                                hrStart = limits.firstHourTime;
                            }
                        }
                    }

                    limits = {
                        minuteCount: minCount,
                        firstMinuteTime: minStart,
                        hourCount: hrCount,
                        firstHourTime: hrStart
                    };
                    userChatLimits.set(userKey, limits);
                } else if (!limits) {
                    limits = {
                        minuteCount: 0,
                        firstMinuteTime: 0,
                        hourCount: 0,
                        firstHourTime: 0
                    };
                    userChatLimits.set(userKey, limits);
                }

                const newPlayerData = {
                    id: assignedId,
                    username: authenticatedUser,
                    isRegistered: isRegistered,
                    authenticated: isRegistered,
                    hideName: !!(data.hideName || data.hiddenName || data.hidePlayerName),
                    dbUserId: dbUserId,
                    x: snap(data.x || 0),
                    y: snap(data.y || 0),
                    z: snap(data.z || -2.5),
                    rotationY: Math.round((Number(data.rotationY) || 0) * 100) / 100,
                    state: 'IDLE',
                    dimension: (data.dimension === 'SIDE' || data.dimension === 'LIGHT') ? data.dimension : 'DARK',
                    room: data.room || 'world',
                    joinedAt: new Date().toISOString(),
                    ws: ws
                };

                // Store in memory
                darkWorldPlayers.set(assignedId, newPlayerData);

                // Send welcome confirmation to joining player (filtered by matching room and dimension)
                const existingPlayers = Array.from(darkWorldPlayers.values())
                    .filter(p => p.id !== assignedId && p.room === newPlayerData.room && p.dimension === newPlayerData.dimension)
                    .map(p => ({
                        id: p.id,
                        username: (!p.isRegistered && !p.authenticated) ? '?' : (p.hideName ? '??' : p.username),
                        dimension: p.dimension,
                        room: p.room,
                        x: p.x,
                        y: p.y,
                        z: p.z,
                        rotationY: p.rotationY,
                        state: p.state
                    }));

                ws.send(JSON.stringify({
                    type: 'welcome',
                    id: assignedId,
                    username: authenticatedUser,
                    isRegistered: isRegistered,
                    dimension: newPlayerData.dimension,
                    increment: 0.1,
                    players: existingPlayers,
                    minuteCount: limits.minuteCount,
                    minuteLimit: MINUTE_LIMIT,
                    hourCount: limits.hourCount,
                    hourLimit: HOUR_LIMIT
                }));

                // Broadcast new player appearance to other players
                const joinDisplayName = (!isRegistered) ? '?' : (newPlayerData.hideName ? '??' : authenticatedUser);
                broadcast({
                    type: 'player_joined',
                    id: assignedId,
                    username: joinDisplayName,
                    dimension: newPlayerData.dimension,
                    room: newPlayerData.room,
                    x: newPlayerData.x,
                    y: newPlayerData.y,
                    z: newPlayerData.z,
                    rotationY: newPlayerData.rotationY,
                    state: newPlayerData.state,
                    player: {
                        id: assignedId,
                        username: joinDisplayName,
                        dimension: newPlayerData.dimension,
                        room: newPlayerData.room,
                        x: newPlayerData.x,
                        y: newPlayerData.y,
                        z: newPlayerData.z,
                        rotationY: newPlayerData.rotationY,
                        state: newPlayerData.state
                    }
                }, ws);

                console.log(`[Player Joined] ${joinDisplayName} (ID: ${assignedId}) in room '${newPlayerData.room}' [${newPlayerData.dimension}]`);
                return;
            }

            // Packet Type: room_change
            if (data.type === 'room_change' && assignedId) {
                const player = darkWorldPlayers.get(assignedId);
                if (!player) return;

                player.room = data.room || 'world';
                if (data.dimension) player.dimension = data.dimension;
                if (data.x !== undefined) player.x = snap(data.x);
                if (data.y !== undefined) player.y = snap(data.y);
                if (data.z !== undefined) player.z = snap(data.z);
                if (data.rotationY !== undefined) player.rotationY = Math.round((Number(data.rotationY) || 0) * 100) / 100;

                console.log(`[Room Change] ${player.username} (ID: ${assignedId}) entered room '${player.room}' [${player.dimension}]`);

                const roomDisplayName = (!player.isRegistered && !player.authenticated) ? '?' : (player.hideName ? '??' : player.username);

                // Broadcast room transition to other players
                broadcast({
                    type: 'player_room_changed',
                    id: assignedId,
                    username: roomDisplayName,
                    dimension: player.dimension,
                    room: player.room,
                    x: player.x,
                    y: player.y,
                    z: player.z,
                    rotationY: player.rotationY,
                    state: player.state
                }, ws);

                // Also broadcast player_moved with updated room
                broadcast({
                    type: 'player_moved',
                    id: assignedId,
                    username: roomDisplayName,
                    dimension: player.dimension,
                    room: player.room,
                    x: player.x,
                    y: player.y,
                    z: player.z,
                    rotationY: player.rotationY,
                    state: player.state
                }, ws);

                // Reply to the room-changer with all players currently in that room and dimension
                const roomPeers = Array.from(darkWorldPlayers.values())
                    .filter(p => p.id !== assignedId && 
                                 p.room === player.room && 
                                 p.dimension === player.dimension)
                    .map(p => ({
                        id: p.id,
                        username: (!p.isRegistered && !p.authenticated) ? '?' : (p.hideName ? '??' : p.username),
                        dimension: p.dimension,
                        room: p.room,
                        x: p.x,
                        y: p.y,
                        z: p.z,
                        rotationY: p.rotationY,
                        state: p.state
                    }));

                ws.send(JSON.stringify({
                    type: 'room_players',
                    dimension: player.dimension,
                    room: player.room,
                    players: roomPeers
                }));
                return;
            }

            // Packet Type: toggle_name
            if ((data.type === 'toggle_name' || data.type === 'chat:nameToggled') && assignedId) {
                const player = darkWorldPlayers.get(assignedId);
                if (player) {
                    player.hideName = !!data.hideName;
                    const displayName = (!player.isRegistered && !player.authenticated) ? '?' : (player.hideName ? '??' : player.username);
                    broadcast({
                        type: 'player_moved',
                        id: assignedId,
                        username: displayName,
                        dimension: player.dimension,
                        room: player.room,
                        x: player.x,
                        y: player.y,
                        z: player.z,
                        rotationY: player.rotationY,
                        state: player.state
                    }, ws);
                }
                return;
            }

            // Packet Type: move or update
            if ((data.type === 'move' || data.type === 'update') && assignedId) {
                const player = darkWorldPlayers.get(assignedId);
                if (!player) return;

                if (data.hideName !== undefined) {
                    player.hideName = !!data.hideName;
                }

                player.x = snap(data.x);
                player.y = snap(data.y);
                player.z = snap(data.z);
                player.rotationY = Math.round((Number(data.rotationY) || 0) * 100) / 100;
                player.state = data.state || 'IDLE';
                if (data.room) player.room = data.room;
                if (data.dimension) player.dimension = data.dimension;

                const displayName = (!player.isRegistered && !player.authenticated) ? '?' : (player.hideName ? '??' : player.username);

                broadcast({
                    type: 'player_moved',
                    id: assignedId,
                    username: displayName,
                    dimension: player.dimension,
                    room: player.room,
                    x: player.x,
                    y: player.y,
                    z: player.z,
                    rotationY: player.rotationY,
                    state: player.state
                }, ws);
                return;
            }

            // Packet Type: chat
            if (data.type === 'chat' && assignedId) {
                const player = darkWorldPlayers.get(assignedId);
                if (!player) return;

                const rawMsg = typeof data.message === 'string' ? data.message.trim() : '';
                if (!rawMsg) return;

                const maxLen = 70;
                const cleanMsg = rawMsg.substring(0, maxLen);
                const userKey = (authenticatedUser || assignedId).toLowerCase();
                const now = Date.now();

                let limits = userChatLimits.get(userKey);
                if (!limits) {
                    limits = {
                        minuteCount: 0,
                        firstMinuteTime: 0,
                        hourCount: 0,
                        firstHourTime: 0
                    };
                    userChatLimits.set(userKey, limits);
                }

                // Check minute reset: after one minute from the time of the first message when it said 0, it is set to 0
                if (limits.firstMinuteTime > 0 && (now - limits.firstMinuteTime >= 60000)) {
                    limits.minuteCount = 0;
                    limits.firstMinuteTime = 0;
                }

                // Check hour reset: resets one hour after the first chat message when it said 0/15
                if (limits.firstHourTime > 0 && (now - limits.firstHourTime >= 3600000)) {
                    limits.hourCount = 0;
                    limits.firstHourTime = 0;
                }

                // Enforce minute rate limit (max 3)
                if (limits.minuteCount >= MINUTE_LIMIT) {
                    const remainingMs = Math.max(0, 60000 - (now - limits.firstMinuteTime));
                    ws.send(JSON.stringify({
                        type: 'chat_error',
                        reason: 'minute_limit',
                        message: `Rate limit: ${MINUTE_LIMIT} chats per minute. Resets in ${Math.ceil(remainingMs / 1000)}s.`,
                        minuteCount: limits.minuteCount,
                        firstMinuteTime: limits.firstMinuteTime,
                        minuteLimit: MINUTE_LIMIT,
                        hourCount: limits.hourCount,
                        firstHourTime: limits.firstHourTime,
                        hourLimit: HOUR_LIMIT,
                        cooldownMs: remainingMs
                    }));
                    return;
                }

                // Enforce hourly rate limit (max 45)
                if (limits.hourCount >= HOUR_LIMIT) {
                    const remainingMs = Math.max(0, 3600000 - (now - limits.firstHourTime));
                    const remainingMin = Math.ceil(remainingMs / 60000);
                    ws.send(JSON.stringify({
                        type: 'chat_error',
                        reason: 'hour_limit',
                        message: `Rate limit: ${HOUR_LIMIT} chats per hour. Resets in ${remainingMin}m.`,
                        minuteCount: limits.minuteCount,
                        firstMinuteTime: limits.firstMinuteTime,
                        minuteLimit: MINUTE_LIMIT,
                        hourCount: limits.hourCount,
                        firstHourTime: limits.firstHourTime,
                        hourLimit: HOUR_LIMIT,
                        cooldownMs: remainingMs
                    }));
                    return;
                }

                // Record start time on first message of minute window
                if (limits.minuteCount === 0) {
                    limits.firstMinuteTime = now;
                }
                limits.minuteCount++;

                // Record start time on first message of hourly window
                if (limits.hourCount === 0) {
                    limits.firstHourTime = now;
                }
                limits.hourCount++;

                const chatRoom = player.room || data.room || 'world';
                const chatDim = player.dimension || data.dimension || 'DARK';

                // Determine display name for chat and logs:
                // - Players without an account always use '?'
                // - Players with an account use '??' if setting to hide account name is enabled, or their registered username.
                let chatAuthor = player.username;
                if (!player.isRegistered) {
                    chatAuthor = '?';
                } else if (data.hideName || data.hiddenName || data.hidePlayerName || player.hideName) {
                    chatAuthor = '??';
                }

                // Persist rate limits and chat messages to MySQL database
                if (player.isRegistered && player.dbUserId) {
                    await savePlayerDbLimits(player.dbUserId, limits.minuteCount, limits.firstMinuteTime, limits.hourCount, limits.firstHourTime);
                    await recordChatMessage(player.dbUserId, chatAuthor, chatRoom, chatDim, cleanMsg);
                } else {
                    await recordChatMessage(null, chatAuthor, chatRoom, chatDim, cleanMsg);
                }

                // Append chat message to daily player log file on server
                // "The name will appear in the log that way too."
                logChatMessageToFile(chatAuthor, chatRoom, chatDim, cleanMsg, new Date(now));

                const chatPacket = {
                    type: 'chat_message',
                    id: assignedId,
                    username: chatAuthor,
                    message: cleanMsg,
                    room: chatRoom,
                    dimension: chatDim,
                    timestamp: now,
                    minuteCount: limits.minuteCount,
                    minuteLimit: MINUTE_LIMIT,
                    hourCount: limits.hourCount,
                    hourLimit: HOUR_LIMIT
                };

                // Broadcast to everyone in the room (including sender)
                broadcastToRoom(chatRoom, chatPacket);

                // Send ack to sender with authoritative rate counters
                ws.send(JSON.stringify({
                    type: 'chat_ack',
                    minuteCount: limits.minuteCount,
                    firstMinuteTime: limits.firstMinuteTime,
                    minuteLimit: MINUTE_LIMIT,
                    hourCount: limits.hourCount,
                    firstHourTime: limits.firstHourTime,
                    hourLimit: HOUR_LIMIT
                }));

                console.log(`[Chat] [${chatRoom}] ${authenticatedUser}: "${cleanMsg}" (${limits.minuteCount}/${MINUTE_LIMIT}m, ${limits.hourCount}/${HOUR_LIMIT}h)`);
                return;
            }

            // Packet Type: ping / heartbeat
            if (data.type === 'ping') {
                ws.isAlive = true;
                ws.send(JSON.stringify({ type: 'pong', time: Date.now() }));
                return;
            }

            // Packet Type: leave
            if (data.type === 'leave' && assignedId) {
                const player = darkWorldPlayers.get(assignedId);
                if (player && player.isRegistered && player.dbUserId) {
                    const userKey = (player.username || '').toLowerCase();
                    const limits = userChatLimits.get(userKey);
                    if (limits) {
                        savePlayerDbLimits(player.dbUserId, limits.minuteCount, limits.firstMinuteTime, limits.hourCount, limits.firstHourTime);
                    }
                }
                darkWorldPlayers.delete(assignedId);
                broadcast({ type: 'player_left', id: assignedId, username: authenticatedUser });
                console.log(`[Player Left] ${authenticatedUser} (ID: ${assignedId})`);
                assignedId = null;
                return;
            }
        });

        ws.on('close', (code, reason) => {
            if (assignedId && darkWorldPlayers.has(assignedId)) {
                const player = darkWorldPlayers.get(assignedId);
                if (player && player.isRegistered && player.dbUserId) {
                    const userKey = (player.username || '').toLowerCase();
                    const limits = userChatLimits.get(userKey);
                    if (limits) {
                        savePlayerDbLimits(player.dbUserId, limits.minuteCount, limits.firstMinuteTime, limits.hourCount, limits.firstHourTime);
                    }
                }
                darkWorldPlayers.delete(assignedId);
                broadcast({
                    type: 'player_left',
                    id: assignedId,
                    username: authenticatedUser,
                    code: code
                });
                console.log(`[Socket Closed] ${authenticatedUser} disconnected (code: ${code})`);
            }
        });

        ws.on('error', (err) => {
            console.error(`[Socket Error] ${assignedId || 'unauth'}:`, err.message);
        });
    });

    // Liveness Heartbeat: check client responsiveness every 30 seconds
    const heartbeatInterval = setInterval(() => {
        for (const [id, player] of darkWorldPlayers) {
            if (!player.ws) continue;
            if (player.ws.isAlive === false) {
                console.log(`[Heartbeat Timeout] Terminating inactive socket for ${player.username} (ID: ${id})`);
                player.ws.terminate();
                darkWorldPlayers.delete(id);
                broadcast({ type: 'player_left', id: id, username: player.username });
            } else {
                player.ws.isAlive = false;
                player.ws.ping();
            }
        }
    }, 30000);

    wss.on('close', () => {
        clearInterval(heartbeatInterval);
    });
}

// Master TCP Multiplexer Server
// Sniffs first byte of connection:
// 0x16 (22) = TLS Client Hello -> Dispatches to httpsServer
// Other bytes (e.g. 'G', 'P', 'H') = Plain HTTP -> Dispatches to httpServer
const masterServer = net.createServer((socket) => {
    socket.once('data', (buffer) => {
        socket.pause();
        socket.unshift(buffer);

        if (buffer[0] === 0x16 && httpsServer) {
            httpsServer.emit('connection', socket);
        } else {
            httpServer.emit('connection', socket);
        }

        process.nextTick(() => socket.resume());
    });

    socket.on('error', (err) => {
        // Silently swallow unexpected socket aborts
    });
});

// Start listening on master dual-protocol socket
masterServer.listen(PORT, HOST, () => {
    console.log(`================================================================`);
    console.log(`  addressbar.net Dark World Real-Time Multiplayer Server`);
    console.log(`  Listening on port ${PORT} (Host: ${HOST})`);
    console.log(`  Protocol: Dual HTTP / HTTPS & WS / WSS`);
    console.log(`  TLS Certificate: ${sslOptions ? 'ENABLED' : 'DISABLED'}`);
    console.log(`  Endpoints: ws://${HOST}:${PORT} & wss://${HOST}:${PORT}`);
    console.log(`  Diagnostic Status: http://${HOST}:${PORT}/status`);
    console.log(`================================================================`);
});
