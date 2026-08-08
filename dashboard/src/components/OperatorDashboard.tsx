/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FleetEndpoint, ServerMetrics, OtaRelease } from '../types';
import TroubleshootPanel from './TroubleshootPanel';
import ProvisioningLab from './ProvisioningLab';
import TVUWebhookSimulator from './TVUWebhookSimulator';

interface OperatorDashboardProps {
  fleet: FleetEndpoint[];
  serverMetrics: ServerMetrics;
  otaReleases: OtaRelease[];
  onUpdateFleet: (updated: FleetEndpoint[]) => void;
}

export const OperatorDashboard: React.FC<OperatorDashboardProps> = ({
  fleet,
  serverMetrics,
  otaReleases,
  onUpdateFleet,
}) => {
  const [activeTab, setActiveTab] = useState<'fleet' | 'diagnostics' | 'provisioning' | 'simulator'>('fleet');
  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);
  const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [passwordError, setPasswordError] = useState<boolean>(false);

  // Handle Admin Toggle Attempt
  const handleAdminToggleRequest = () => {
    if (isAdminMode) {
      setIsAdminMode(false); // Lock immediately without password
    } else {
      setShowPasswordModal(true); // Prompt for admin password
      setPasswordError(false);
      setPasswordInput('');
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simple local validation for admin mode (e.g., password 'admin123' or similar secure local string)
    if (passwordInput === 'admin123') {
      setIsAdminMode(true);
      setShowPasswordModal(false);
      setPasswordInput('');
    } else {
      setPasswordError(true);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Top Navigation & Global Telemetry Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
            <span className="font-bold text-lg tracking-wide">SE-CHUKEI FLEET COMMAND</span>
          </div>

          <nav className="flex space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab('fleet')}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === 'fleet' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Fleet Matrix ({serverMetrics.totalNodes})
            </button>
            <button
              onClick={() => setActiveTab('diagnostics')}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === 'diagnostics' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Local Diagnostics
            </button>
            {isAdminMode && (
              <>
                <button
                  onClick={() => setActiveTab('provisioning')}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                    activeTab === 'provisioning' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Provisioning Hub
                </button>
                <button
                  onClick={() => setActiveTab('simulator')}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                    activeTab === 'simulator' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Webhook Simulator
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Global Stats & Admin Toggle */}
        <div className="flex items-center space-x-6">
          <div className="hidden lg:flex items-center space-x-4 text-xs text-slate-400">
            <div>Online: <span className="text-emerald-400 font-semibold">{serverMetrics.onlineNodes}</span></div>
            <div>Warning: <span className="text-amber-400 font-semibold">{serverMetrics.warningNodes}</span></div>
            <div>Offline: <span className="text-rose-400 font-semibold">{serverMetrics.offlineNodes}</span></div>
            <div>Avg Temp: <span className="text-slate-200 font-semibold">{serverMetrics.serverTempC}°C</span></div>
          </div>

          <button
            onClick={handleAdminToggleRequest}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-all ${
              isAdminMode 
                ? 'bg-amber-500/10 border-amber-500/50 text-amber-400 hover:bg-amber-500/20' 
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {isAdminMode ? '🔓 Admin Mode Active' : '🔒 Operator View'}
          </button>
        </div>
      </header>

      {/* Workspace Content Area */}
      <main className="flex-1 overflow-hidden p-6 bg-slate-950">
        {activeTab === 'fleet' && (
          <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-xl p-8 text-center">
            <h3 className="text-xl font-medium text-slate-300 mb-2">Fleet Grid Workspace</h3>
            <p className="text-sm text-slate-500 max-w-md mb-6">
              Manage all {fleet.length} edge endpoints, monitor live bitrates, tailscale bindings, and operational states across your broadcast zones.
            </p>
            {/* Insert your DeviceGrid component here */}
          </div>
        )}

        {activeTab === 'diagnostics' && (
          <div className="h-full overflow-y-auto">
            <TroubleshootPanel />
          </div>
        )}

        {isAdminMode && activeTab === 'provisioning' && (
          <div className="h-full overflow-y-auto">
            <ProvisioningLab />
          </div>
        )}

        {isAdminMode && activeTab === 'simulator' && (
          <div className="h-full overflow-y-auto">
            <TVUWebhookSimulator />
          </div>
        )}
      </main>

      {/* Password Modal for Admin Mode */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-96 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-2">Enter Admin Credentials</h3>
            <p className="text-xs text-slate-400 mb-4">
              Accessing override controls, OTA updates, and provisioning tools requires admin authorization.
            </p>
            <form onSubmit={handlePasswordSubmit}>
              <input
                type="password"
                placeholder="Admin Password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 mb-2"
                autoFocus
              />
              {passwordError && (
                <p className="text-xs text-rose-400 mb-3">Invalid password. (Hint: use 'admin123' for testing)</p>
              )}
              <div className="flex justify-end space-x-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
                >
                  Authorize
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};