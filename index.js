import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import readline from "readline";
import chalk from "chalk";
import gradient from "gradient-string";
import figlet from "figlet";
import { promisify } from "util";
import logger from "./src/logger.js";
import { useSQLiteAuthState } from "./src/authState.js";
import { resolverJid, limpiarSesiones } from "./src/estado.js";
import { ejecutar } from "./src/dispatcher.js";

process.on("uncaughtException", (err) => logger.error(`Excepción no capturada: ${err.message}`));
process.on("unhandledRejection", (reason) => logger.error(`Rechazo no manejado: ${reason}`));

const figletAsync = promisify(figlet);
const logBaileys = logger.child({ modulo: "baileys" });
logBaileys.level = "warn";

const soraGradient = gradient(["#B0B0B0", "#6A0DAD", "#1A1A1A"]);
const separator = chalk.hex("#5A189A")("─".repeat(55));

// interfaz de readline única, creada una sola vez para todo el proceso
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function preguntar(texto) {
  return new Promise((resolve) =>
    rl.question(texto, (respuesta) => resolve(respuesta.trim()))
  );
}

function formatearMensaje({ jid, senderJid, texto }) {
  const hora = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const esGrupo = jid.endsWith("@g.us");

  const icono = esGrupo ? "⟠" : "⟡";
  const tipo = esGrupo
    ? chalk.hex("#9D4EDD").bold("GRUPO")
    : chalk.hex("#C9184A").bold("PRIVADO");

  const remitente = chalk.hex("#E0AAFF").bold(senderJid.split("@")[0]);
  const contenido = texto
    ? chalk.whiteBright(texto.length > 80 ? texto.slice(0, 80) + "…" : texto)
    : chalk.gray.italic("multimedia / sin texto");

  return `${chalk.gray(`[${hora}]`)} ${chalk.hex("#5A189A")(icono)} ${tipo}  ${remitente} ${chalk.hex("#5A189A")("»")} ${contenido}`;
}

async function printBanner() {
  const art = await figletAsync("SORA", { font: "Standard" });
  console.log("\n" + soraGradient(art));
  console.log(chalk.hex("#B0B0B0").bold("        ✦  Sora Bot  ✦"));
  console.log(chalk.hex("#6A0DAD")("        ⟠  Alternative Edition  ⟠"));
  console.log(separator + "\n");
}

async function obtenerVersion() {
  try {
    const resultado = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);
    return resultado.version;
  } catch {
    console.log(chalk.yellow("⚠ No se pudo obtener la versión más reciente de Baileys, usando la por defecto."));
    return undefined;
  }
}

async function iniciar() {
  await printBanner();

  const { state, saveCreds } = useSQLiteAuthState();
  const version = await obtenerVersion();

  const yaVinculado = state.creds.registered;

  const sock = makeWASocket({
    auth: state,
    logger: logBaileys,
    printQRInTerminal: false,
    ...(version ? { version } : {}),
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    keepAliveIntervalMs: 55000,
    maxIdleTimeMs: 60000,
  });

  if (!yaVinculado) {
    const numero = await preguntar(
      chalk.cyan("No hay sesión activa. Escribe tu número con código de país (ej. 5215512345678): ")
    );

    await new Promise((resolve) => setTimeout(resolve, 5000));

    try {
      const codigo = await sock.requestPairingCode(numero.replace(/[^0-9]/g, ""));
      console.log(chalk.greenBright(`✅ Tu código de vinculación es: ${chalk.bold(codigo)}`));
      console.log(chalk.gray("Ve a WhatsApp > Dispositivos vinculados > Vincular con número y ponlo."));
    } catch (e) {
      console.log(chalk.red(`✘ No se pudo generar el código de vinculación: ${e.message}`));
      console.log(chalk.yellow("Reintentando en 15 segundos..."));
      try { sock.ws.close(); } catch {}
      setTimeout(() => iniciar(), 15000);
      return;
    }
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") console.log(chalk.greenBright("✅ Conectado a WhatsApp"));
    if (connection === "close") {
      const debeReconectar =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(chalk.yellow(`⚠ Conexión cerrada. Reconectar: ${debeReconectar}`));
      if (debeReconectar) iniciar();
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const jid = resolverJid(msg.key.remoteJid);
    const senderJid = resolverJid(msg.key.participant || msg.key.remoteJid);
    const texto =
      msg.message.conversation || msg.message.extendedTextMessage?.text || "";

    console.log(formatearMensaje({ jid, senderJid, texto }));
    await ejecutar({ sock, msg, jid, senderJid, texto });
  });
}

setInterval(limpiarSesiones, 60_000);
iniciar();