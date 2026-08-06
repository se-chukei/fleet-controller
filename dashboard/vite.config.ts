import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'fleet-status-bridge',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const statusFilePath = path.resolve(__dirname, 'fleetstatus.json');

            // 1. GET /api/state (Existing client state fetch)
            if (req.url?.startsWith('/api/state')) {
              try {
                if (fs.existsSync(statusFilePath)) {
                  const fileContent = fs.readFileSync(statusFilePath, 'utf-8');
                  JSON.parse(fileContent);

                  console.log(`[DataBridge] Serving fleetstatus.json to TV app at ${new Date().toLocaleTimeString()}`);
                  res.setHeader('Content-Type', 'application/json');
                  res.statusCode = 200;
                  res.end(fileContent);
                  return;
                }
              } catch (e: any) {
                console.error(`[DataBridge] Error reading fleetstatus.json: ${e.message}`);
              }

              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({
                appState: "STANDBY",
                streamUrl: "",
                accessKeyRevoked: false
              }));
              return;
            }

            // 2. POST /api/telebeat (New Phase 1 Telemetry endpoint)
            if (req.url?.startsWith('/api/telebeat') && req.method === 'POST') {
              let body = '';
              
              req.on('data', chunk => {
                body += chunk;
              });

              req.on('end', () => {
                try {
                  const telemetry = body ? JSON.parse(body) : {};
                  console.log(`[Telebeat] Received health check from device ID: ${telemetry.deviceId || 'Unknown'} | State: ${telemetry.currentState || 'N/A'}`);

                  // Read current configuration/desired state from fleetstatus.json
                  let currentConfig = {
                    appState: "STANDBY",
                    streamUrl: "",
                    accessKeyRevoked: false
                  };

                  if (fs.existsSync(statusFilePath)) {
                    currentConfig = JSON.parse(fs.readFileSync(statusFilePath, 'utf-8'));
                  }

                  // Respond with desired state and configuration instructions
                  res.setHeader('Content-Type', 'application/json');
                  res.statusCode = 200;
                  res.end(JSON.stringify({
                    status: "ack",
                    timestamp: new Date().toISOString(),
                    desiredState: currentConfig.appState,
                    streamUrl: currentConfig.streamUrl,
                    config: {
                      pollIntervalMs: 10000,
                      accessKeyRevoked: currentConfig.accessKeyRevoked
                    }
                  }));
                } catch (e: any) {
                  console.error(`[Telebeat] Error processing telemetry payload: ${e.message}`);
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: "Invalid JSON payload" }));
                }
              });
              return;
            }

            next();
          });
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: true,
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});