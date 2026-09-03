require('dotenv').config();

const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '10mb' }));

// Serve static files directly from root directory
app.use(express.static(__dirname));

// Route handlers for dashboard endpoints
app.get('/telemetry-monitor', (req, res) => {
    res.sendFile(path.join(__dirname, 'telemetry.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'telemetry.html'));
});

const STATE_FILE = path.join(__dirname, 'dashboard_state.json');

// Global Fleet State Configuration
let globalFleetState = {
    appState: 'STANDBY',
    activeStreamUrl: '',
    standbyStreamUrl: '',
    streamUrl: ''
};

let knownActiveStreams = new Set();
let knownStandbyStreams = new Set();
let saveTimeout = null;

// Outbound Webhook Target URL (set via environment variable WEBHOOK_URL or update string below)
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const TVU_ACCOUNT = process.env.TVU_ACCOUNT || 'shinnyo-en_104_demo@tvu.networks.com';
const TVU_PASSWORD_HASH = process.env.TVU_PASSWORD_HASH || '';

if (TVU_PASSWORD_HASH) {
    console.log('[TVU Title Fetch] Enabled with TVU_PASSWORD_HASH configured.');
} else {
    console.warn('[TVU Title Fetch] TVU_PASSWORD_HASH environment variable not set. Skipping title resolution.');
}

// Persistence helper functions
function loadPersistedState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const raw = fs.readFileSync(STATE_FILE, 'utf8');
            const data = JSON.parse(raw);
            if (data.globalFleetState) globalFleetState = data.globalFleetState;
            
            if (Array.isArray(data.knownActiveStreams)) {
                knownActiveStreams = new Set(data.knownActiveStreams);
            }
            if (Array.isArray(data.knownStandbyStreams)) {
                knownStandbyStreams = new Set(data.knownStandbyStreams);
            }
            // Backward compatibility for legacy single array format
            if (Array.isArray(data.knownStreams)) {
                data.knownStreams.forEach(url => knownActiveStreams.add(url));
            }
            return;
        }
    } catch (err) {
        console.error('Failed to load persisted fleet state:', err.message);
    }
    // Seed defaults ONLY if state file does not exist
    if (globalFleetState.activeStreamUrl) knownActiveStreams.add(globalFleetState.activeStreamUrl);
    if (globalFleetState.standbyStreamUrl) knownStandbyStreams.add(globalFleetState.standbyStreamUrl);
}

// Debounce disk writes and write atomically to prevent corruption
function savePersistedState() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        try {
            const data = {
                globalFleetState,
                knownActiveStreams: Array.from(knownActiveStreams),
                knownStandbyStreams: Array.from(knownStandbyStreams)
            };
            const tempFile = STATE_FILE + '.tmp';
            fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
            fs.renameSync(tempFile, STATE_FILE);
        } catch (err) {
            console.error('Failed to persist fleet state to disk:', err.message);
        }
    }, 1000);
}

function registerKnownStream(url, type) {
    if (!url || typeof url !== 'string') return;
    const cleanUrl = url.trim();
    
    // Only register valid network streams (prevents local file path pollution)
    if (!/^(https?|rtmp|rtsp):\/\//i.test(cleanUrl)) return;

    let isNew = false;
    if (type === 'STREAM' && !knownActiveStreams.has(cleanUrl)) {
        knownActiveStreams.add(cleanUrl);
        isNew = true;
    } else if (type === 'STANDBY' && !knownStandbyStreams.has(cleanUrl)) {
        knownStandbyStreams.add(cleanUrl);
        isNew = true;
    }

    if (isNew) {
        savePersistedState();
    }
}

function getKnownStreamsPayload() {
    const activeList = Array.from(knownActiveStreams);
    const standbyList = Array.from(knownStandbyStreams);
    return {
        knownActiveStreams: activeList,
        knownStandbyStreams: standbyList,
        knownStreams: {
            STREAM: activeList,
            STANDBY: standbyList
        }
    };
}

// Outbound Webhook Trigger Helper
function triggerWebhook(data) {
    if (!WEBHOOK_URL) return;
    try {
        const url = new URL(WEBHOOK_URL);
        const payload = JSON.stringify(data);
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };
        const req = (url.protocol === 'https:' ? https : http).request(options);
        req.on('error', (err) => console.error('Webhook delivery failed:', err.message));
        req.write(payload);
        req.end();
    } catch (e) {
        console.error('Invalid WEBHOOK_URL config:', e.message);
    }
}

function formatUptime(seconds) {
    const s = Number(seconds) || 0;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
}

// Load state immediately on startup
loadPersistedState();

// Map of registered/connected devices: deviceId -> deviceObject
const endpointDevices = new Map();

// SSE Clients List
const sseClients = new Set();

// Helper to broadcast Server-Sent Events to connected dashboards and dispatch webhooks
function broadcastSSE(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(client => client.write(payload));

    if (data.type === 'state_change' || data.type === 'device_update') {
        triggerWebhook(data);
    }
}

// -----------------------------------------------------------------------------
// SSE Endpoint
// -----------------------------------------------------------------------------
app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.add(res);

    const snapshot = {
        type: 'init',
        globalState: globalFleetState,
        ...getKnownStreamsPayload(),
        devices: Array.from(endpointDevices.values())
    };
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`);

    req.on('close', () => {
        sseClients.delete(res);
    });
});

// -----------------------------------------------------------------------------
// GET /api/state - Global Fleet State Inspection
// -----------------------------------------------------------------------------
app.get('/api/state', (req, res) => {
    res.json({ ...globalFleetState, ...getKnownStreamsPayload() });
});

// -----------------------------------------------------------------------------
// TVU Event Title Resolution Helpers
// -----------------------------------------------------------------------------
async function getTvuSidSecure() {
  if (!TVU_PASSWORD_HASH) {
    console.warn("[TVU Title Fetch] TVU_PASSWORD_HASH environment variable not set. Skipping title resolution.");
    return null;
  }

  try {
    const res = await fetch("https://cc-ms.tvunetworks.com/login-service/login/signIn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account: TVU_ACCOUNT,
        password: TVU_PASSWORD_HASH,
        serverName: "Command Center"
      })
    });
    const data = await res.json();
    if (data.errorCode === "0x0" && data.result && data.result.session) {
      return data.result.session;
    }
    console.warn("[TVU Title Fetch] login returned no valid session:", data);
  } catch (err) {
    console.error("[TVU Auth Error]", err.message);
  }
  return null;
}

async function fetchTvuEventTitleSecure(sid, sourceObjectId, epochMs) {
  if (!sid || !sourceObjectId || !epochMs) return null;

  const startTime = Number(epochMs) - (3600 * 1000);
  const endTime = Number(epochMs) + (3600 * 1000);

  const bodyData = {
    startTime,
    endTime,
    objectInfos: [{
      objectId: sourceObjectId,
      resourceId: sourceObjectId,
      name: "Source",
      resourceName: "Source",
      objectType: 1,
      resourceType: "X",
      concreteType: "grid_sdi",
      status: "1",
      ingesting: false,
      tagInfos: [],
      showTagInfos: [],
      showMore: 0
    }]
  };

  try {
    const res = await fetch("https://search.tvunetworks.com/route-mma/tvu-search/media/slugHomeInfo.action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": sid
      },
      body: JSON.stringify(bodyData)
    });

    const data = await res.json();
    if (Array.isArray(data.result) && data.result.length > 0) {
      const metadata = data.result[0].metadataInfo || [];
      if (metadata.length > 0) {
        return metadata[0].title || metadata[0].slug || null;
      }
    }
  } catch (err) {
    console.error("[TVU Event Title Fetch Error]", err.message);
  }
  return null;
}

async function resolveTvuEventTitle(payload, tvuEpochMs) {
  const sourceObjectId = payload && payload.sourceObjectId;
  if (!sourceObjectId || !tvuEpochMs) return null;

  const sid = await getTvuSidSecure();
  if (!sid) return null;

  const title = await fetchTvuEventTitleSecure(sid, String(sourceObjectId), Number(tvuEpochMs));
  if (title) {
    globalFleetState.eventTitle = title;
    savePersistedState();
  }

  return title || null;
}

// -----------------------------------------------------------------------------
// POST /api/webhook/tvu - Ingest TVU Webhooks to Toggle Fleet State
// -----------------------------------------------------------------------------
app.post('/api/webhook/tvu', (req, res) => {
  const receivedAt = new Date();
  const payload = req.body || {};

  console.log('--- RAW TVU PAYLOAD START ---');
  console.log(JSON.stringify(payload, null, 2));
  console.log('--- RAW TVU PAYLOAD END ---');  
  const rawStatus = (payload.status || '').toLowerCase();

  // Fall back across all possible TVU payload timestamp fields
  const highRes = payload.highResMediaPath || {};
  const itemObj = Array.isArray(payload.item) ? payload.item[0] : (payload.item || {});
  
  // Pick end timestamp for STOP, start timestamp for START
  let tvuEpochMs = null;
  if (rawStatus === 'stop') {
    tvuEpochMs = payload.endTimestamp 
      || highRes.endTimestamp 
      || payload.mediaEndTime 
      || payload.stopTime 
      || itemObj.endTime;
  } else {
    tvuEpochMs = payload.startTimestamp 
      || highRes.startTimestamp 
      || payload.mediaStartTime 
      || payload.startTime 
      || itemObj.startTime;
  }  
  
  const tvuEventTime = tvuEpochMs ? new Date(Number(tvuEpochMs)) : null;

  console.log('========================================');
  console.log(`[Webhook Triggered Mode Change]`);
  console.log(`Raw TVU Status: ${rawStatus.toUpperCase()}`);
  console.log(`Server Receipt Time (Local): ${receivedAt.toISOString()} (${receivedAt.toLocaleString()})`);
  console.log(`TVU Event Time: ${tvuEventTime ? `${tvuEventTime.toISOString()} (${tvuEventTime.toLocaleString()})` : 'N/A'}`);
  console.log(`Source Object ID: ${payload.sourceObjectId || 'N/A'}`);

  // Asynchronously resolve event title in background
  if (payload.sourceObjectId && tvuEpochMs) {
    (async () => {
      const title = await resolveTvuEventTitle(payload, tvuEpochMs);
      const resolvedTitle = title || 'N/A (No Title Found)';

      console.log(`[Webhook Event Name] Resolved Title: "${resolvedTitle}"`);

      if (title) {
        broadcastSSE({
          type: 'state_change',
          globalState: globalFleetState,
          ...getKnownStreamsPayload(),
          devices: Array.from(endpointDevices.values())
        });
      }
    })();
  }

  let targetAppState = null;

  if (rawStatus === 'start') {
    targetAppState = 'STREAM';
  } else if (rawStatus === 'stop') {
    targetAppState = 'STANDBY';
  }

  if (targetAppState) {
    console.log(`[ACTION] Switching Global Fleet State to: ${targetAppState}`);

    globalFleetState.appState = targetAppState;
    globalFleetState.streamUrl = targetAppState === 'STREAM' 
      ? globalFleetState.activeStreamUrl 
      : globalFleetState.standbyStreamUrl;

    // Propagate mode change to all connected devices that are not overridden
    endpointDevices.forEach((dev, id) => {
      if (!dev.isOverridden) {
        dev.status = globalFleetState.appState;
        dev.streamUrl = globalFleetState.streamUrl;
        endpointDevices.set(id, dev);
      }
    });

    savePersistedState();

    broadcastSSE({ 
      type: 'state_change', 
      globalState: globalFleetState, 
      ...getKnownStreamsPayload(),
      devices: Array.from(endpointDevices.values()) 
    });
  } else {
    console.log(`[ACTION] No state change triggered for raw status: ${rawStatus}`);
  }

  console.log('========================================');

  res.status(200).json({ errorCode: "0x0", message: "Webhook processed successfully" });
});

// -----------------------------------------------------------------------------
// POST /api/update - Update Whole Fleet State (Preserves Active Overrides)
// -----------------------------------------------------------------------------
app.post('/api/update', (req, res) => {
    const { appState, activeStreamUrl, standbyStreamUrl } = req.body;

    if (appState) globalFleetState.appState = appState;
    if (activeStreamUrl !== undefined) {
        globalFleetState.activeStreamUrl = activeStreamUrl;
        registerKnownStream(activeStreamUrl, 'STREAM');
    }
    if (standbyStreamUrl !== undefined) {
        globalFleetState.standbyStreamUrl = standbyStreamUrl;
        registerKnownStream(standbyStreamUrl, 'STANDBY');
    }

    globalFleetState.streamUrl = globalFleetState.appState === 'STREAM' 
        ? globalFleetState.activeStreamUrl 
        : globalFleetState.standbyStreamUrl;

    endpointDevices.forEach((dev, id) => {
        if (!dev.isOverridden) {
            dev.status = globalFleetState.appState;
            dev.streamUrl = globalFleetState.streamUrl;
            endpointDevices.set(id, dev);
        }
    });

    savePersistedState();

    broadcastSSE({ 
        type: 'state_change', 
        globalState: globalFleetState, 
        ...getKnownStreamsPayload(),
        devices: Array.from(endpointDevices.values()) 
    });
    
    res.json({ status: 'ok', globalState: globalFleetState, ...getKnownStreamsPayload() });
});

// -----------------------------------------------------------------------------
// POST /api/device/update - Target Single Device Override
// -----------------------------------------------------------------------------
app.post('/api/device/update', (req, res) => {
    const { deviceId, appState, streamUrl } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

    const existing = endpointDevices.get(deviceId) || {};
    const targetAppState = appState || existing.status || 'STANDBY';

    let targetStreamUrl = streamUrl;
    if (targetStreamUrl === undefined) {
        if (targetAppState === 'STREAM') {
            targetStreamUrl = globalFleetState.activeStreamUrl;
        } else if (targetAppState === 'STANDBY') {
            targetStreamUrl = globalFleetState.standbyStreamUrl;
        } else {
            targetStreamUrl = existing.streamUrl || globalFleetState.streamUrl;
        }
    }

    registerKnownStream(targetStreamUrl, targetAppState);
    savePersistedState();

    const updated = {
        ...existing,
        deviceId,
        status: targetAppState,
        streamUrl: targetStreamUrl,
        isOverridden: true,
        lastSeen: Date.now()
    };

    endpointDevices.set(deviceId, updated);
    broadcastSSE({ type: 'device_update', device: updated, ...getKnownStreamsPayload() });
    res.json({ status: 'ok', device: updated });
});

// -----------------------------------------------------------------------------
// POST /api/device/clear-override - Release Individual Device Override
// -----------------------------------------------------------------------------
app.post('/api/device/clear-override', (req, res) => {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

    const existing = endpointDevices.get(deviceId);
    if (!existing) return res.status(404).json({ error: 'Device not found' });

    const updated = {
        ...existing,
        isOverridden: false,
        status: globalFleetState.appState,
        streamUrl: globalFleetState.streamUrl,
        lastSeen: Date.now()
    };

    endpointDevices.set(deviceId, updated);
    broadcastSSE({ type: 'device_update', device: updated });
    res.json({ status: 'ok', device: updated });
});

// -----------------------------------------------------------------------------
// POST /api/sync - Telemetry Payload Ingestion & Direct Command Response
// -----------------------------------------------------------------------------
app.post('/api/sync', (req, res) => {
    const payload = req.body || {};
    const deviceId = payload.deviceId;
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

    const existingDev = endpointDevices.get(deviceId) || {};
    const isOverridden = existingDev.isOverridden || false;
    const currentMode = isOverridden ? existingDev.status : globalFleetState.appState;

    if (payload.streamUrl) {
        registerKnownStream(payload.streamUrl, currentMode);
    }

    // Detect if client initiated a local override (e.g., switched to PLAYBACK via USB or manually exited stream)
    const isLocalPlayback = payload.appState === 'PLAYBACK';
    const effectiveIsOverridden = isOverridden || isLocalPlayback;
    const effectiveStatus = effectiveIsOverridden ? (payload.appState || existingDev.status) : globalFleetState.appState;

    const updatedDev = {
        ...existingDev,
        ...payload,
        deviceId,
        nodeName: payload.nodeName || existingDev.nodeName || "テスト拠点1",
        nodeIp: payload.nodeIp || req.ip || existingDev.nodeIp || "100.111.90.103",
        powerState: payload.powerState || existingDev.powerState || "ON",
        deviceName: payload.deviceName || existingDev.deviceName || "",
        bitrate: payload.bitrate !== undefined ? payload.bitrate : (existingDev.bitrate || 0),
        streamResolution: payload.streamResolution !== undefined ? payload.streamResolution : (existingDev.streamResolution || 'N/A'),
        temp: payload.temp !== undefined ? payload.temp : (existingDev.temp || 0),
        cpu: payload.cpu !== undefined ? payload.cpu : (existingDev.cpu || 0),
        uptime: payload.uptimeSeconds != null
            ? formatUptime(payload.uptimeSeconds)
            : (existingDev.uptime || '-'),
        status: effectiveStatus,
        streamUrl: effectiveStatus === 'PLAYBACK' ? '' : (effectiveIsOverridden ? existingDev.streamUrl : globalFleetState.streamUrl),
        isOverridden: effectiveIsOverridden,
        lastSeen: Date.now(),
        online: true,
        receivedAt: new Date().toLocaleTimeString()
    };

    endpointDevices.set(deviceId, updatedDev);
    broadcastSSE({ type: 'device_update', device: updatedDev, ...getKnownStreamsPayload() });

    res.json({
        status: "received",
        appState: updatedDev.status,
        streamUrl: updatedDev.streamUrl,
        isOverridden: updatedDev.isOverridden,
        timestamp: Math.floor(Date.now() / 1000)
    });
});

// -----------------------------------------------------------------------------
// GET /api/devices - Fetch All Registered Endpoints
// -----------------------------------------------------------------------------
app.get('/api/devices', (req, res) => {
    res.json(Array.from(endpointDevices.values()));
});

const OFFLINE_THRESHOLD_MS = 7500; // 7.5 seconds threshold (captures ~3 missed 2.5s telebeats)

setInterval(() => {
    const now = Date.now();
    let updatedAny = false;

    endpointDevices.forEach((dev, id) => {
        if (dev.online && (now - dev.lastSeen > OFFLINE_THRESHOLD_MS)) {
            dev.online = false;
            
            // Clear operational metrics to "-" while retaining identity & lastSeen
            dev.bitrate = "-";
            dev.streamResolution = "-";
            dev.cpu = "-";
            dev.temp = "-";
            dev.uptime = "-";

            endpointDevices.set(id, dev);
            updatedAny = true;
        }
    });

    if (updatedAny) {
        broadcastSSE({ 
            type: 'device_list', 
            devices: Array.from(endpointDevices.values()),
            ...getKnownStreamsPayload()
        });
    }
}, 2500);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Fleet Dashboard Server running at http://localhost:${PORT}`);
    
});