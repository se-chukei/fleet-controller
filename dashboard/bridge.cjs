const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 8080;

app.use(express.json());

const STATE_FILE = path.join(__dirname, 'fleetstatus.json');

// Initial state – loaded from fleetstatus.json or default fallback
let currentState = {
    appState: "STANDBY",
    streamUrl: "rtmp://10.200.4.1/live/ambient_multicam", // Default standby stream
    accessKeyRevoked: false,
    vlcBitrateMbps: 0,
    timestamp: Math.floor(Date.now() / 1000)
};

if (fs.existsSync(STATE_FILE)) {
    try {
        currentState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        console.log(`[API] Loaded initial state from fleetstatus.json`);
    } catch (e) {
        console.error(`[API] Failed to parse fleetstatus.json, using default state`);
    }
}

function saveState() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(currentState, null, 2));
    } catch (e) {
        console.error(`[API] Failed to write to fleetstatus.json:`, e);
    }
}

// GET /api/state – returns full state object
app.get('/api/state', (req, res) => {
    res.json(currentState);
});

// POST /api/update – allows dashboard or external tools to modify state
app.post('/api/update', (req, res) => {
    const { streamUrl, appState, accessKeyRevoked, vlcBitrateMbps } = req.body;
    if (streamUrl !== undefined) currentState.streamUrl = streamUrl;
    if (appState !== undefined) currentState.appState = appState;
    if (accessKeyRevoked !== undefined) currentState.accessKeyRevoked = accessKeyRevoked;
    if (vlcBitrateMbps !== undefined) currentState.vlcBitrateMbps = vlcBitrateMbps;
    currentState.timestamp = Math.floor(Date.now() / 1000);
    
    saveState();
    console.log(`[API] State updated via /api/update`);
    res.status(200).json({ message: "State updated", state: currentState });
});

// Webhook endpoint for TVU – updates state in the same contract
app.post('/api/webhook/tvu', (req, res) => {
    const { event } = req.body;

    if (event === "stream_start") {
        currentState = {
            appState: "STREAM",
            streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", // Updated stream URL
            accessKeyRevoked: false,
            vlcBitrateMbps: 0,
            timestamp: Math.floor(Date.now() / 1000)
        };
        console.log(`[Webhook] TVU Stream Started! Switching Android TVs to: ${currentState.streamUrl}`);
    } else if (event === "stream_stop") {
        currentState = {
            appState: "STANDBY",
            streamUrl: "rtmp://10.200.4.1/live/ambient_multicam", // Back to standby
            accessKeyRevoked: false,
            vlcBitrateMbps: 0,
            timestamp: Math.floor(Date.now() / 1000)
        };
        console.log(`[Webhook] TVU Stream Stopped. Switching Android TVs to: ${currentState.streamUrl}`);
    } else {
        console.log(`[Webhook] Unknown event received: ${event}`);
    }

    saveState();
    res.status(200).send("State updated");
});

app.listen(port, () => {
    console.log(`FC Data Bridge listening at http://localhost:${port}`);
    console.log(`Android TVs should poll: http://<YOUR_MAC_TAILSCALE_IP>:${port}/api/state`);
    console.log(`Try simulating a stream start:`);
    console.log(`curl -X POST http://localhost:${port}/api/webhook/tvu -H "Content-Type: application/json" -d '{"event": "stream_start"}'`);
});