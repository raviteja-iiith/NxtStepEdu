'use client';

import { useState } from 'react';

export default function AdminSettings() {
  const [appName, setAppName] = useState('School ERP');
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">System Configuration</h2>
        <p className="text-gray-500 text-sm mt-1">Platform-wide settings and feature flags</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Branding */}
        <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-bold text-gray-900 mb-4">Platform Branding</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Platform Name</label>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: '#E2E8F0' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Platform Logo</label>
              <div className="w-full h-24 border-2 border-dashed rounded-xl flex items-center justify-center text-gray-400 text-sm" style={{ borderColor: '#E2E8F0' }}>
                Drop logo here or click to upload
              </div>
            </div>
            <button className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: '#1E40AF' }}>
              Save Branding
            </button>
          </div>
        </div>

        {/* Feature Flags */}
        <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-bold text-gray-900 mb-4">Feature Flags</h3>
          <div className="space-y-4">
            {[
              { label: 'AI Features (per plan)', desc: 'Enable AI report summaries and chatbot', enabled: true },
              { label: 'SMS Notifications', desc: 'Send SMS via MSG91 gateway', enabled: true },
              { label: 'Email Notifications', desc: 'Send emails via Resend', enabled: true },
              { label: 'Push Notifications', desc: 'Send push via Firebase', enabled: false },
            ].map((flag, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-700">{flag.label}</p>
                  <p className="text-xs text-gray-400">{flag.desc}</p>
                </div>
                <div
                  className="w-10 h-6 rounded-full cursor-pointer transition-colors duration-200 flex items-center px-0.5"
                  style={{ background: flag.enabled ? '#16A34A' : '#D1D5DB' }}
                >
                  <div
                    className="w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
                    style={{ transform: flag.enabled ? 'translateX(16px)' : 'translateX(0)' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Maintenance Mode */}
        <div className="lg:col-span-2 bg-white rounded-2xl border p-6" style={{ borderColor: maintenanceMode ? '#FECACA' : '#E2E8F0' }}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900">Maintenance Mode</h3>
              <p className="text-gray-500 text-sm mt-1">When enabled, all non-admin users see a maintenance page</p>
            </div>
            <button
              onClick={() => setMaintenanceMode(!maintenanceMode)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: maintenanceMode ? '#16A34A' : '#DC2626' }}
            >
              {maintenanceMode ? 'Disable Maintenance' : 'Enable Maintenance'}
            </button>
          </div>
          {maintenanceMode && (
            <div className="mt-4 p-3 rounded-lg text-sm font-medium" style={{ background: '#FEF2F2', color: '#DC2626' }}>
              ⚠️ Maintenance mode is ACTIVE. All non-admin users are seeing the maintenance page.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
