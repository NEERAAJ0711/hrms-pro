import ZKLib from 'zkteco-js';
import { storage } from "./storage";

const SYNC_INTERVAL = 5 * 60 * 1000; // Poll every 5 minutes

async function syncDevice(device: any) {
  const zkInstance = new ZKLib(device.ipAddress || '127.0.0.1', device.port || 8181, 10000, 4000);
  let connected = false;
  try {
    console.log(`[BiometricSync] Starting auto-sync for ${device.name} (${device.ipAddress})`);
    await zkInstance.createSocket();
    connected = true;
    const logs = await zkInstance.getAttendances();
    const employees = device.companyId
      ? await storage.getEmployeesByCompany(device.companyId)
      : await storage.getAllEmployees();
    
    let inserted = 0;

    if (logs && logs.data && Array.isArray(logs.data)) {
      // Sort logs by time to ensure sequential processing if needed
      const sortedLogs = logs.data.sort((a: any, b: any) => 
        new Date(a.recordTime).getTime() - new Date(b.recordTime).getTime()
      );

      for (const log of sortedLogs) {
        const deviceEmployeeId = log.deviceUserId.toString();
        const employee = employees.find(e => e.biometricDeviceId === deviceEmployeeId);

        if (!employee) {
          console.log(`[BiometricSync] No employee found for device ID: ${deviceEmployeeId}`);
          continue;
        }

        const punchTime = new Date(log.recordTime).toTimeString().split(' ')[0].substring(0, 5);
        const punchDate = new Date(log.recordTime).toISOString().split('T')[0];
        const punchCompanyId = employee.companyId;

        const existing = await storage.findDuplicatePunchLog(punchCompanyId, deviceEmployeeId, punchTime, punchDate);
        if (existing) continue;

        await storage.createBiometricPunchLog({
          companyId: punchCompanyId,
          employeeId: employee.id,
          deviceEmployeeId: deviceEmployeeId,
          punchTime,
          punchDate,
          punchType: log.eventType === 0 ? "in" : "out",
          deviceId: device.id,
          isProcessed: false,
          isDuplicate: false,
          missingPunch: false,
          syncedAt: null,
          createdAt: new Date().toISOString()
        });
        inserted++;
      }
    }

    await storage.updateBiometricDevice(device.id, { 
      status: "online",
      lastSync: new Date().toISOString() 
    });
    
    console.log(`[BiometricSync] Auto-sync complete for ${device.name}. Imported ${inserted} logs.`);
  } catch (err: any) {
    console.error(`[BiometricSync] Auto-sync failed for ${device.name}:`, err.message || err);
    await storage.updateBiometricDevice(device.id, { status: "offline" });
  } finally {
    if (connected) {
      try { await zkInstance.disconnect(); } catch (_) { /* ignore */ }
    }
  }
}

export function setupBiometricSync() {
  console.log("[BiometricSync] Initializing background synchronization service...");
  
  setInterval(async () => {
    try {
      const devices = await storage.getAllBiometricDevices();
      const activeDevices = devices.filter(d => d.ipAddress && d.ipAddress !== '127.0.0.1');
      
      for (const device of activeDevices) {
        await syncDevice(device);
      }
    } catch (error) {
      console.error("[BiometricSync] Error in sync interval:", error);
    }
  }, SYNC_INTERVAL);
}
