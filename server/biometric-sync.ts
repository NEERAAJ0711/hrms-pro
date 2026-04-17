import { storage } from "./storage";

/**
 * In ADMS push mode the device phones home to /iclock/cdata; we never dial
 * it. So this background job is no longer a "sync" — it's a freshness sweep
 * that flips a device's status to `offline` if we haven't heard from it
 * recently. The actual punch ingestion happens in `server/adms.ts`.
 */
const SWEEP_INTERVAL_MS = 60 * 1000; // every minute
const ONLINE_WINDOW_MS = 15 * 60 * 1000; // device considered online for 15 min after last push

async function sweepDeviceFreshness() {
  try {
    const devices = await storage.getAllBiometricDevices();
    const now = Date.now();
    for (const device of devices) {
      const lastPush = device.lastPushAt ? new Date(device.lastPushAt).getTime() : 0;
      const shouldBeOnline = lastPush > 0 && now - lastPush <= ONLINE_WINDOW_MS;
      const desired = shouldBeOnline ? "online" : "offline";
      if (device.status !== desired) {
        await storage.updateBiometricDevice(device.id, { status: desired } as any);
        console.log(
          `[BiometricSync] ${device.name} (${device.deviceSerial}) → ${desired}` +
            (lastPush ? ` (last push ${Math.round((now - lastPush) / 60000)}m ago)` : " (never seen)"),
        );
      }
    }
  } catch (err) {
    console.error("[BiometricSync] Freshness sweep failed:", err);
  }
}

export function setupBiometricSync() {
  console.log("[BiometricSync] ADMS push mode — running freshness sweep every 60s");
  // Kick off one sweep at startup so the badges are correct on first paint.
  void sweepDeviceFreshness();
  setInterval(sweepDeviceFreshness, SWEEP_INTERVAL_MS);
}
