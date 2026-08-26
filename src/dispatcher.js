import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { obtenerPrefijo, esOwner } from "./ajustes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const carpetaComandos = path.join(__dirname, "..", "comandos");

const manifest = JSON.parse(
  fs.readFileSync(path.join(carpetaComandos, "manifest.json"), "utf-8")
);

const cargados = new Map();

export async function ejecutar({ sock, msg, jid, senderJid, texto }) {
  const prefijo = obtenerPrefijo(jid);
  if (!texto.startsWith(prefijo)) return;

  const sinPrefijo = texto.slice(prefijo.length).trim();
  const palabra = sinPrefijo.split(/\s+/)[0]?.toLowerCase();
  if (!palabra) return;

  const entrada = manifest[palabra];
  const puedeVerlo = entrada && (!entrada.soloOwner || esOwner(senderJid));

  if (!puedeVerlo) {
    await sock.sendMessage(jid, {
      text: `El comando ${prefijo}${palabra} no existe. Usa ${prefijo}help para ver los comandos disponibles.`,
    });
    return;
  }

  try {
    let mod = cargados.get(palabra);
    if (!mod) {
      mod = await import(`file://${path.join(carpetaComandos, entrada.archivo)}`);
      cargados.set(palabra, mod);
    }
    await mod.ejecutar({ sock, msg, jid, senderJid, texto: sinPrefijo });
  } catch (err) {
    console.error(`Error en comando "${palabra}":`, err);
    await sock
      .sendMessage(jid, { text: "Ocurrió un error ejecutando el comando 😵" })
      .catch(() => {});
  }
}