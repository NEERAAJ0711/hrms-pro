```ts
import express from "express";
import { createServer } from "http";

const app = express();
app.use(express.text({ type: "*/*" }));

const PORT = 8181;

// In-memory store
let lastStamp = 0;

// =====================
// 🔹 HANDSHAKE (/cdata)
// =====================
app.get(["/iclock/cdata", "/cdata"], (req, res) => {
  const sn = req.query.SN || "UNKNOWN";

  console.log("➡️ HANDSHAKE from:", sn);

  const response = `
GET OPTION FROM: ${sn}
ATTLOGStamp=${lastStamp}
OPERLOGStamp=0
ErrorDelay=30
Delay=30
TransInterval=1
TransFlag=TransData AttLog
Realtime=1
Encrypt=0

`;

  res.type("text/plain").send(response);
});

// =====================
// 🔹 GET REQUEST (commands)
// =====================
app.get(["/iclock/getrequest", "/getrequest"], (req, res) => {
  const sn = req.query.SN || "UNKNOWN";

  console.log("➡️ GETREQUEST from:", sn);

  // 🔥 ALWAYS send ATTLOG command
  const cmd = `C:1:DATA UPDATE ATTLOG Stamp=0\r\n`;

  res.type("text/plain").send(cmd);
});

// =====================
// 🔹 RECEIVE LOGS
// =====================
app.post(["/iclock/cdata", "/cdata"], (req, res) => {
  const sn = req.query.SN || "UNKNOWN";
  const table = req.query.table;

  console.log("⬅️ DATA from:", sn, "TABLE:", table);

  if (table === "ATTLOG") {
    const lines = req.body.split("\n");

    for (let line of lines) {
      if (!line.trim()) continue;

      console.log("📌 LOG:", line);

      // Example format:
      // 1\t2026-04-23 09:30:00\t0
      const parts = line.split("\t");

      const userId = parts[0];
      const time = parts[1];
      const type = parts[2];

      console.log(`👤 User: ${userId} | ⏰ ${time} | 🔁 ${type}`);
    }

    // reset stamp (force next fetch)
    lastStamp = 0;
  }

  res.send("OK");
});

// =====================
// 🔹 DEVICE CMD ACK
// =====================
app.post(["/iclock/devicecmd", "/devicecmd"], (req, res) => {
  console.log("✔️ CMD RESPONSE:", req.body);
  res.send("OK");
});

// =====================
// 🔹 TEST
// =====================
app.get(["/iclock/ping", "/ping"], (req, res) => {
  res.send("OK");
});

// =====================
// START SERVER
// =====================
createServer(app).listen(PORT, "0.0.0.0", () => {
  console.log("🚀 ADMS Server Running on port", PORT);
});
```
