import makeWASocket, { DisconnectReason } from "@whiskeysockets/baileys";
import pino from "pino";
import readline from "readline";
import { useSQLiteAuthState } from "./src/authState.js";
import { resolverJid } from "./src/resolve.js";
import { ejecutar } from "./src/dispatcher.js";
import { limpiarSesiones } from "./src/sessions.js";

const logger = pino({ level: "silent" });
const usarPairingCode = process.argv.includes("--pairing");

function preguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(texto, (respuesta) => {
    rl.close();
    resolve(respuesta.trim());
  }));
}

async function iniciar() {
  const { state, saveCreds } = useSQLiteAuthState();

  const sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: !usarPairingCode,
  });

  if (usarPairingCode && !sock.authState.creds.registered) {
    const numero = await preguntar("Escribe tu número con código de país (ej. 573135180876): ");
    const codigo = await sock.requestPairingCode(numero);
    console.log(`Tu código de vinculación es: ${codigo}`);
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const debeReconectar =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
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

    await ejecutar({ sock, msg, jid, senderJid, texto });
  });
}

setInterval(limpiarSesiones, 60_000);
iniciar();