const { spawn, execSync } = require('child_process');
const http = require('http');

// Configuration
const BRIDGE_HOST = '100.74.35.53';
const BRIDGE_PORT = 8080; // Bridge state endpoint port
const TIMEOUT_MS = 40000;  // Max wait time per test step

// Real Stream Endpoints
const VALID_STANDBY_URL = 'https://d37piaqbgb9rwg.cloudfront.net/hls/video/ipblite/5339276459485_livestream01_1500/chunklist.m3u8';
const VALID_STREAM_URL = 'https://d2ibp6n2lenjxm.cloudfront.net/hls/dvr/ipblite06/5188404197617_livestream02_2000/chunklist_DVR.m3u8';
const BROKEN_STREAM_URL = 'https://d2ibp6n2lenjxm.cloudfront.net/hls/invalid_broken_stream/chunklist.m3u8';

/**
 * Helper to update Data Bridge state over HTTP POST
 */
function updateBridgeState(appState, streamUrl) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ appState, streamUrl, accessKeyRevoked: false });
    const req = http.request({
      hostname: BRIDGE_HOST,
      port: BRIDGE_PORT,
      path: '/api/update',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    }, (res) => {
      resolve(res.statusCode);
    });

    req.on('error', (err) => reject(err));
    req.write(data);
    req.end();
  });
}

/**
 * Spawns ADB Logcat listener looking for a specific log string or pattern
 */
function waitForLogMarker(expectedPattern, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    console.log(` ⏳ Listening for log marker: "${expectedPattern}"...`);

    try {
      execSync('adb logcat -c');
    } catch (e) {
      console.warn('⚠️ Warning: Could not clear ADB logcat buffer.');
    }

    const logcat = spawn('adb', ['logcat', '*:V']);
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      logcat.kill();
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout (${timeoutMs}ms) waiting for log marker: "${expectedPattern}"`));
    }, timeoutMs);

    logcat.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes(expectedPattern)) {
        cleanup();
        resolve(output);
      }
    });
  });
}

/**
 * Wait until any of the given patterns appears in logcat.
 * Clears the buffer only once and uses a single listener.
 * This replaces the broken Promise.race of multiple waitForLogMarker calls.
 */
function waitForAnyLogMarker(patterns, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    console.log(` ⏳ Listening for any of: ${patterns.map(p => `"${p}"`).join(' | ')}...`);

    try {
      execSync('adb logcat -c');
    } catch (e) {
      console.warn('⚠️ Warning: Could not clear ADB logcat buffer.');
    }

    const logcat = spawn('adb', ['logcat', '*:V']);
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      logcat.kill();
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout (${timeoutMs}ms) waiting for any of: ${patterns.join(' | ')}`));
    }, timeoutMs);

    logcat.stdout.on('data', (data) => {
      const output = data.toString();
      for (const p of patterns) {
        if (output.includes(p)) {
          cleanup();
          resolve(p);          // returns the matched pattern string
          return;
        }
      }
    });

    logcat.on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}

/**
 * Main Extended Evaluation Cycle
 */
async function runEvaluationCycle() {
  console.log('====================================================');
  console.log(' Starting Automated FleetController Evaluation Cycle');
  console.log('====================================================\n');

  try {
    // Step 1: Initial STANDBY
    console.log('[Step 1/4] Setting initial valid STANDBY stream...');
    await updateBridgeState('STANDBY', VALID_STANDBY_URL);
    await waitForLogMarker(`Saved new good STANDBY URL: ${VALID_STANDBY_URL}`, 15000);
    console.log('✅ Step 1 Passed: Initial STANDBY URL cached!\n');

    // Step 2: Switch to STREAM
    console.log('[Step 2/4] Switching to active STREAM mode...');
    await updateBridgeState('STREAM', VALID_STREAM_URL);
    await waitForLogMarker(`State applied → STREAM | url=${VALID_STREAM_URL}`, 15000);
    console.log('✅ Step 2 Passed: Transitioned to active STREAM!\n');

    // Step 3: Switch back to STANDBY to confirm re-caching / stability
    console.log('[Step 3/4] Re-asserting STANDBY state to confirm dynamic cache update...');
    await updateBridgeState('STANDBY', VALID_STANDBY_URL);
    await waitForLogMarker(`State applied → STANDBY | url=${VALID_STANDBY_URL}`, 15000);
    console.log('✅ Step 3 Passed: Re-entered STANDBY state cleanly!\n');

    // Step 3.5: Switch back to STREAM with a good URL to test standby URL retention
    console.log("\n[Step 3.5/4] Switching back to valid STREAM before broken URL test...");
    await updateBridgeState('STREAM', VALID_STREAM_URL);
    await waitForLogMarker(`State applied → STREAM | url=${VALID_STREAM_URL}`, 15000);
    console.log("✅ Step 3.5 Passed: Valid STREAM state active!");

    // Step 4: Inject broken stream and let the device recover on its own
    console.log("\n[Step 4/4] Injecting BROKEN STREAM URL to trigger player error handling...");
    await updateBridgeState('STREAM', BROKEN_STREAM_URL);

    // Wait for the client to detect the problem
    const matched = await waitForAnyLogMarker([
      'VLC stream determined to be problematic',
      'ExoPlayer stream determined to be problematic',
      'Stream determined to be severely problematic'
    ], 40000);
    console.log(`✅ Step 4 Passed: Detected broken stream (${matched})`);

    // Pure monitoring – wait for the client’s own auto-recovery
    console.log('[Verification] Waiting for device to auto-recover to last known good STANDBY URL...');
    await waitForLogMarker(
      `State applied → STANDBY | url=${VALID_STANDBY_URL}`,
      30000
    );
    console.log('✅ Verification Passed: Device auto-recovered to standby URL on its own!\n');

    console.log('====================================================');
    console.log(' SUCCESS: Complete cycle passed with zero errors!');
    console.log('====================================================');

  } catch (error) {
    console.error('\n❌ EVALUATION CYCLE FAILED:');
    console.error(error.message);
    process.exit(1);
  }
}

runEvaluationCycle();