import makeWASocket, { DisconnectReason } from "@whiskeysockets/baileys";
import pino from "pino";
import { useSQLiteAuthState } from "./src/authState.js";
import { resolverJid } from "./src/resolve.js";
import { ejecutar } from "./src/dispatcher.js";
import { limpiarSesiones } from "./src/sessions.js";

const logger = pino({ level: "silent" });

async function iniciar() {
  const { state, saveCreds } = useSQLiteAuthState();

  const sock = makeWASocket({ auth: state, logger, printQRInTerminal: true });

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