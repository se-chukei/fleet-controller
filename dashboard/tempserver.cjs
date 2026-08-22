const express = require('express');
const fs = require('fs');
const pathModule = require('path');

const app = express();

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const LOGS_DIR = pathModule.join(__dirname, 'logs');
const DATA_DIR = pathModule.join(__dirname, 'data');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let dashboardClients = [];
const OFFLINE_THRESHOLD_MS = 15000;

let endpointDevices = new Map();

const STATE_FILE = pathModule.join(__dirname, 'fleetstatus.json');
const DEVICES_STORE_FILE = pathModule.join(DATA_DIR, 'devices_state.json');

let globalFleetState = {
    appState: "STREAM",
    activeStreamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    standbyStreamUrl: "rtmp://100.111.90.103/live/ambient_multicam",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    accessKeyRevoked: false,
    vlcBitrateMbps: 0,
    timestamp: Math.floor(Date.now() / 1000)
};

function loadPersistentData() {
  if (fs.existsSync(STATE_FILE)) {
      try {
          globalFleetState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
          console.log(`[API] Loaded global fleet state from ${STATE_FILE}`);
      } catch (e) {
          console.error(`[API] Failed to parse fleetstatus.json:`, e);
      }
  } else {
      saveGlobalState();
  }

  if (fs.existsSync(DEVICES_STORE_FILE)) {
      try {
          const rawDevices = JSON.parse(fs.readFileSync(DEVICES_STORE_FILE, 'utf8'));
          Object.entries(rawDevices).forEach(([id, data]) => {
              endpointDevices.set(id, data);
          });
          console.log(`[API] Restored ${endpointDevices.size} device state(s) from persistent storage.`);
      } catch (e) {
          console.error(`[API] Failed to parse devices_state.json:`, e);
      }
  }
}

function saveGlobalState() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(globalFleetState, null, 2));
    } catch (e) {
        console.error(`[API] Failed to write to fleetstatus.json:`, e);
    }
}

let isDeviceStoreDirty = false;
function saveDeviceStatesSnapshot() {
    if (!isDeviceStoreDirty) return;
    try {
        const obj = Object.fromEntries(endpointDevices);
        fs.writeFileSync(DEVICES_STORE_FILE, JSON.stringify(obj, null, 2));
        isDeviceStoreDirty = false;
    } catch (e) {
        console.error(`[API] Failed to flush device states snapshot to disk:`, e);
    }
}

setInterval(saveDeviceStatesSnapshot, 5000);
loadPersistentData();

setInterval(() => {
  const now = Date.now();
  
  endpointDevices.forEach((dev, id) => {
    const wasOnline = dev.online;
    const isNowOnline = (now - dev.lastSeen) < OFFLINE_THRESHOLD_MS;
    
    if (wasOnline !== isNowOnline) {
      dev.online = isNowOnline;
      isDeviceStoreDirty = true;
      console.log(`[Fleet Core] Device ${id} status changed -> Online: ${isNowOnline}`);
      
      broadcastToDashboards({
        type: "device_update",
        device: dev
      });
    }
  });
}, 3000);

function broadcastToDashboards(data) {
  dashboardClients.forEach(client => {
    try {
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      console.error(`[SSE] Error broadcasting to dashboard client ${client.id}:`, e);
    }
  });
}

// RESTful Route: Pure idempotency. No side-effects or device mapping.
app.get('/api/state', (req, res) => {
    if (fs.existsSync(STATE_FILE)) {
        res.setHeader('Content-Type', 'application/json');
        res.sendFile(STATE_FILE);
    } else {
        res.status(200).json(globalFleetState);
    }
});

// RESTful Route: Stateful ingestion, endpoint tracking, and SSE emission.
app.post('/api/sync', (req, res) => {
  const payload = req.body || {};
  const deviceId = payload.deviceId; // Enforced strict schema key

  if (!deviceId) {
      return res.status(400).json({ error: "Missing device identifier (deviceId)" });
  }

  const now = Date.now();
  const existingDev = endpointDevices.get(deviceId) || {};
  
  const updatedDev = {
    ...existingDev,
    deviceId,
    nodeName: payload.nodeName || existingDev.nodeName || "テスト拠点",
    nodeIp: payload.nodeIp || req.ip || existingDev.nodeIp || "100.111.90.103",
    status: payload.status || globalFleetState.appState,
    streamUrl: payload.streamUrl || globalFleetState.streamUrl,
    bitrate: payload.bitrate !== undefined ? payload.bitrate : (existingDev.bitrate || 0),
    temp: payload.temp !== undefined ? payload.temp : (existingDev.temp || 0),
    cpu: payload.cpu !== undefined ? payload.cpu : (existingDev.cpu || 0),
    lastSeen: now,
    online: true,
    receivedAt: new Date().toLocaleTimeString(),
    ...payload
  };

  endpointDevices.set(deviceId, updatedDev);
  isDeviceStoreDirty = true;

  if (Array.isArray(payload.logs) && payload.logs.length > 0) {
    const logFilePath = pathModule.join(LOGS_DIR, `${deviceId}.txt`);
    const formattedEntries = payload.logs.map(log => `[${new Date().toISOString()}] ${log}`).join('\n') + '\n';

    fs.appendFile(logFilePath, formattedEntries, (err) => {
      if (err) {
        console.error(`[Error] Failed to write log entries for ${deviceId}:`, err);
      }
    });
  }

  broadcastToDashboards({
    type: "device_update",
    ...updatedDev
  });

  res.status(200).json({ 
    status: "received", 
    appState: globalFleetState.appState, 
    streamUrl: globalFleetState.streamUrl,
    timestamp: Math.floor(Date.now() / 1000)
  });
});

app.post('/api/update', (req, res) => {
    const { streamUrl, activeStreamUrl, standbyStreamUrl, appState, accessKeyRevoked, vlcBitrateMbps } = req.body;
    console.log(`[Dashboard Control] Received global update request:`, req.body);
    
    if (activeStreamUrl !== undefined) globalFleetState.activeStreamUrl = activeStreamUrl;
    if (standbyStreamUrl !== undefined) globalFleetState.standbyStreamUrl = standbyStreamUrl;
    
    if (appState !== undefined) {
        globalFleetState.appState = appState;
        if (appState === "STREAM" && globalFleetState.activeStreamUrl) {
            globalFleetState.streamUrl = globalFleetState.activeStreamUrl;
        } else if (appState === "STANDBY" && globalFleetState.standbyStreamUrl) {
            globalFleetState.streamUrl = globalFleetState.standbyStreamUrl;
        }
    }

    if (streamUrl !== undefined) globalFleetState.streamUrl = streamUrl;
    if (accessKeyRevoked !== undefined) globalFleetState.accessKeyRevoked = accessKeyRevoked;
    if (vlcBitrateMbps !== undefined) globalFleetState.vlcBitrateMbps = vlcBitrateMbps;
    
    globalFleetState.timestamp = Math.floor(Date.now() / 1000);
    saveGlobalState();
    
    broadcastToDashboards({
      type: "state_change",
      receivedAt: new Date().toLocaleTimeString(),
      ...globalFleetState
    });

    res.status(200).json({ message: "Global state updated successfully", state: globalFleetState });
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  dashboardClients.push({ id: clientId, res });
  console.log(`[SSE] Dashboard Client connected: ID ${clientId} (Total: ${dashboardClients.length})`);

  const devicesObj = Object.fromEntries(endpointDevices);

  res.write(`data: ${JSON.stringify({
    type: "initial_sync",
    globalState: globalFleetState,
    devices: devicesObj
  })}\n\n`);

  req.on('close', () => {
    dashboardClients = dashboardClients.filter(c => c.id !== clientId);
    console.log(`[SSE] Dashboard Client disconnected: ID ${clientId} (Remaining: ${dashboardClients.length})`);
  });
});

app.get('/telemetry-monitor', (req, res) => {
  res.sendFile(pathModule.join(__dirname, 'telemetry.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Unified Fleet Server running at http://0.0.0.0:${PORT}`);
  console.log(`Telemetry Dashboard: http://localhost:${PORT}/telemetry-monitor`);
});