import makeWASocket, { DisconnectReason } from "@whiskeysockets/baileys";
import readline from "readline";
import figlet from "figlet";
import gradient from "gradient-string";
import logger from "./src/logger.js";
import { useSQLiteAuthState } from "./src/authState.js";
import { resolverJid } from "./src/resolve.js";
import { ejecutar } from "./src/dispatcher.js";
import { limpiarSesiones } from "./src/sessions.js";

const logBaileys = logger.child({ modulo: "baileys" });
logBaileys.level = "warn";

function mostrarBanner() {
  const texto = figlet.textSync("STEVE", { font: "Standard" });
  console.log(gradient(["#00e5ff", "#7c4dff"]).multiline(texto));
  console.log("⚡ Steve Bot ⚡");
  console.log("✦ Minecraft Edition ✦");
  console.log("─".repeat(40));
}

function preguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(texto, (respuesta) => {
      rl.close();
      resolve(respuesta.trim());
    })
  );
}

async function iniciar() {
  mostrarBanner();

  const { state, saveCreds } = useSQLiteAuthState();

  // Si ya hay sesión guardada, no hace falta ni QR ni pairing code.
  const yaVinculado = state.creds.registered;

  const sock = makeWASocket({
    auth: state,
    logger: logBaileys,
    printQRInTerminal: false, // ya no usamos QR, todo por número
  });

  if (!yaVinculado) {
    const numero = await preguntar(
      "\x1b[36mNo hay sesión activa. Escribe tu número con código de país (ej. 5215512345678): \x1b[0m"
    );
    const codigo = await sock.requestPairingCode(numero.replace(/[^0-9]/g, ""));
    logger.info(`Tu código de vinculación es: ${codigo}`);
    logger.info("Ve a WhatsApp > Dispositivos vinculados > Vincular con número y ponlo.");
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") logger.info("Conectado a WhatsApp ✅");
    if (connection === "close") {
      const debeReconectar =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      logger.warn(`Conexión cerrada. Reconectar: ${debeReconectar}`);
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

    logger.info({ de: senderJid, chat: jid }, `Mensaje: ${texto}`);
    await ejecutar({ sock, msg, jid, senderJid, texto });
  });
}

setInterval(limpiarSesiones, 60_000);
iniciar();