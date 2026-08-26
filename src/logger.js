import pino from "pino";
import path from "path";
import fs from "fs";

const carpetaLogs = path.join(process.cwd(), "datos", "logs");
if (!fs.existsSync(carpetaLogs)) fs.mkdirSync(carpetaLogs, { recursive: true });

const archivoLog = pino.destination({
  dest: path.join(carpetaLogs, "bot.log"),
  sync: false,
});

const logger = pino(
  { level: "info", timestamp: pino.stdTimeFunctions.isoTime },
  pino.multistream([{ stream: process.stdout }, { stream: archivoLog }])
);

export default logger;