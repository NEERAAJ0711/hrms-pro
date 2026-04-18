import express from "express";
import { createServer } from "http";
import { registerAdmsRoutes } from "./adms";

const ADMS_PORT = parseInt(process.env.ADMS_PORT || "8181", 10);

/**
 * Dedicated HTTP server for ZKTeco ADMS (cloud-push) protocol.
 *
 * ZKTeco devices are factory-configured to push to port 8181 by default.
 * We spin up a separate lightweight Express app on 8181 so the device
 * firmware's default settings work without any port change on the device.
 *
 * The main application continues to run on port 5000 (or $PORT).
 * The /iclock/* routes are also kept on the main app for convenience
 * (curl tests, reverse-proxy setups that terminate TLS on 443 and
 * forward both main traffic and /iclock/* to 5000).
 */
export function startAdmsServer() {
  const admsApp = express();

  // Biometric devices send tab-separated payloads with no JSON content-type.
  // Parse all /iclock bodies as plain text so req.body is always a string.
  admsApp.use(express.text({ type: "*/*", limit: "5mb" }));

  // Trust one proxy hop — same as the main app so req.ip is correct when
  // the device pushes through a load-balancer or NAT gateway.
  admsApp.set("trust proxy", 1);

  // Mount all ZKTeco ADMS endpoints: /iclock/cdata, /iclock/getrequest, etc.
  registerAdmsRoutes(admsApp);

  // Catch-all health check so the device can verify connectivity to this port.
  admsApp.use((_req, res) => {
    res.type("text/plain").send("HRMS ADMS server OK");
  });

  const server = createServer(admsApp);
  server.listen({ port: ADMS_PORT, host: "0.0.0.0" }, () => {
    console.log(`[ADMS] Dedicated ADMS server listening on port ${ADMS_PORT}`);
    console.log(`[ADMS] ZKTeco devices should push to http://<server-ip>:${ADMS_PORT}/iclock/cdata`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.warn(
        `[ADMS] Port ${ADMS_PORT} already in use — ADMS-only server not started. ` +
        `Devices can still push to port 5000 via /iclock/cdata.`
      );
    } else {
      console.error("[ADMS] Server error:", err);
    }
  });

  return server;
}
