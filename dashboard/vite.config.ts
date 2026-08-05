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
            if (req.url?.startsWith('/api/state')) {
              const statusFilePath = path.resolve(__dirname, 'fleetstatus.json');

              try {
                if (fs.existsSync(statusFilePath)) {
                  const fileContent = fs.readFileSync(statusFilePath, 'utf-8');
                  JSON.parse(fileContent); // Validate JSON

                  console.log(`[DataBridge] Serving fleetstatus.json to TV app at ${new Date().toLocaleTimeString()}`);
                  res.setHeader('Content-Type', 'application/json');
                  res.statusCode = 200;
                  res.end(fileContent);
                  return;
                } else {
                  console.warn('[DataBridge] fleetstatus.json not found in project root!');
                }
              } catch (e: any) {
                console.error(`[DataBridge] Error reading/parsing fleetstatus.json: ${e.message}`);
              }

              // Fallback response if file is missing or malformed
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({
                appState: "STANDBY",
                streamUrl: "",
                accessKeyRevoked: false
              }));
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