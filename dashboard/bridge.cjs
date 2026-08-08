const express = require('express');
const app = express();
const port = 8080;

app.use(express.json());

// Initial state – matches updated contract
let currentState = {
    appState: "STANDBY",
    streamUrl: "rtmp://10.200.4.1/live/ambient_multicam", // Default standby stream
    accessKeyRevoked: false,
    mediaBitrateMbps: 0,
    timestamp: Math.floor(Date.now() / 1000)
};

// GET /api/state – returns full state object
app.get('/api/state', (req, res) => {
    res.json(currentState);
});

// POST /api/update – allows dashboard or external tools to modify state
app.post('/api/update', (req, res) => {
    const { streamUrl, appState, accessKeyRevoked, mediaBitrateMbps } = req.body;
    if (streamUrl !== undefined) currentState.streamUrl = streamUrl;
    if (appState !== undefined) currentState.appState = appState;
    if (accessKeyRevoked !== undefined) currentState.accessKeyRevoked = accessKeyRevoked;
    if (mediaBitrateMbps !== undefined) currentState.mediaBitrateMbps = mediaBitrateMbps;
    currentState.timestamp = Math.floor(Date.now() / 1000);
    console.log(`[API] State updated via /api/update`);
    res.status(200).json({ message: "State updated", state: currentState });
});

// Webhook endpoint for TVU – updates state in the same contract
app.post('/api/webhook/tvu', (req, res) => {
    const { event } = req.body;

    if (event === "stream_start") {
        currentState = {
            appState: "STREAM",
            streamUrl: "rtmp://10.74.35.53/live/high_quality_event", // Example live stream URL
            accessKeyRevoked: false,
            mediaBitrateMbps: 0,
            timestamp: Math.floor(Date.now() / 1000)
        };
        console.log(`[Webhook] TVU Stream Started! Switching Android TVs to: ${currentState.streamUrl}`);
    } else if (event === "stream_stop") {
        currentState = {
            appState: "STANDBY",
            streamUrl: "rtmp://10.200.4.1/live/ambient_multicam", // Back to standby
            accessKeyRevoked: false,
            mediaBitrateMbps: 0,
            timestamp: Math.floor(Date.now() / 1000)
        };
        console.log(`[Webhook] TVU Stream Stopped. Switching Android TVs to: ${currentState.streamUrl}`);
    } else {
        console.log(`[Webhook] Unknown event received: ${event}`);
    }

    res.status(200).send("State updated");
});

app.listen(port, () => {
    console.log(`FC Data Bridge listening at http://localhost:${port}`);
    console.log(`Android TVs should poll: http://<YOUR_MAC_TAILSCALE_IP>:${port}/api/state`);
    console.log(`Try simulating a stream start:`);
    console.log(`curl -X POST http://localhost:${port}/api/webhook/tvu -H "Content-Type: application/json" -d '{"event": "stream_start"}'`);
});