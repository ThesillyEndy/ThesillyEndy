import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from "@whiskeysockets/baileys";
import readline from "readline";
import chalk from "chalk";
import gradient from "gradient-string";
import figlet from "figlet";
import { promisify } from "util";
import NodeCache from "node-cache";
import logger from "./src/logger.js";
import { useSQLiteAuthState } from "./src/authState.js";
import { resolverJid, limpiarSesiones } from "./src/estado.js";
import { ejecutar } from "./src/dispatcher.js";

process.on("uncaughtException", (err) => logger.error(`Excepción no capturada: ${err.message}`));
process.on("unhandledRejection", (reason) => logger.error(`Rechazo no manejado: ${reason}`));

const figletAsync = promisify(figlet);
const logBaileys = logger.child({ modulo: "baileys" });
logBaileys.level = "warn";

console.info = () => {};
console.debug = () => {};

const soraGradient = gradient(["#B0B0B0", "#6A0DAD", "#1A1A1A"]);
const separator = chalk.hex("#5A189A")("─".repeat(55));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function preguntar(texto) {
  return new Promise((resolve) =>
    rl.question(texto, (respuesta) => resolve(respuesta.trim()))
  );
}

let sockActivo = null;
let reiniciando = false;
let numeroPendiente = null;

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
  if (reiniciando) return;
  reiniciando = true;

  await printBanner();

  const { state, saveCreds: guardarCreds } = useSQLiteAuthState();
  const version = await obtenerVersion();
  const yaVinculado = state.creds.registered;

  if (sockActivo) {
    try { sockActivo.ev.removeAllListeners(); } catch {}
    try { sockActivo.end(); } catch {}
    sockActivo = null;
  }

  const msgRetryCounterCache = new NodeCache({ stdTTL: 3600, checkperiod: 600, useClones: false });

  let saveCredsTimer = null;
  const saveCreds = () => {
    clearTimeout(saveCredsTimer);
    saveCredsTimer = setTimeout(() => {
      try { guardarCreds(); } catch (e) { logger.error(`Error al guardar la sesión: ${e.message}`); }
    }, 2000);
  };

  const sock = makeWASocket({
    ...(version ? { version } : {}),
    logger: logBaileys,
    browser: Browsers.macOS("Chrome"),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logBaileys),
    },
    markOnlineOnConnect: false,
    syncFullHistory: false,
    fireInitQueries: false,
    generateHighQualityLinkPreview: false,
    shouldIgnoreJid: (jid) => jid.endsWith("@broadcast"),
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 20000,
    transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
    emitOwnEvents: false,
    msgRetryCounterCache,
  });

  sockActivo = sock;

  sock.ev.on("creds.update", saveCreds);

  let qrRecibido = false;

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) qrRecibido = true;

    if (connection === "open") {
      reiniciando = false;
      numeroPendiente = null;
      console.log(chalk.greenBright("✅ Conectado a WhatsApp"));
    }

    if (connection === "close") {
      const debeReconectar =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log(chalk.yellow(`⚠ Conexión cerrada. Reconectar: ${debeReconectar}`));

      clearTimeout(saveCredsTimer);
      try { guardarCreds(); } catch {}

      if (debeReconectar) {
        reiniciando = false;
        setTimeout(() => iniciar(), 3000);
      } else {
        reiniciando = false;
        numeroPendiente = null;
        console.log(chalk.red("✘ La sesión fue cerrada desde el teléfono. Elimina la sesión guardada y vuelve a vincular."));
      }
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

  if (!yaVinculado) {
    let numero = numeroPendiente;

    if (!numero) {
      const respuesta = await preguntar(
        chalk.cyan("No hay sesión activa. Escribe tu número con código de país (ej. 5215512345678): ")
      );
      numero = respuesta.replace(/[^0-9]/g, "");
      numeroPendiente = numero;
    }

    if (sockActivo !== sock) return;

    console.log(chalk.gray("Preparando conexión..."));

    if (!qrRecibido) {
      await new Promise((resolve) => {
        const alRecibirQR = (u) => {
          if (u.qr) {
            sock.ev.off("connection.update", alRecibirQR);
            resolve();
          }
        };
        sock.ev.on("connection.update", alRecibirQR);
        setTimeout(() => {
          sock.ev.off("connection.update", alRecibirQR);
          resolve();
        }, 30000);
      });
    }

    if (sockActivo !== sock) return;

    try {
      const codigo = await sock.requestPairingCode(numero);
      if (sockActivo !== sock) return;
      console.log(chalk.greenBright(`✅ Tu código de vinculación es: ${chalk.bold(codigo)}`));
      console.log(chalk.gray("Ve a WhatsApp > Dispositivos vinculados > Vincular con número y ponlo."));
    } catch (e) {
      if (sockActivo !== sock) return;
      console.log(chalk.red(`✘ No se pudo generar el código de vinculación: ${e.message}`));
      console.log(chalk.yellow("Reintentando en 15 segundos..."));
      try { sock.ev.removeAllListeners(); } catch {}
      try { sock.end(); } catch {}
      reiniciando = false;
      setTimeout(() => iniciar(), 15000);
    }
  }
}

setInterval(limpiarSesiones, 60_000);
iniciar();