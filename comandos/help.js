import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { esOwner } from "../src/ajustes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "manifest.json"), "utf-8")
);

export async function ejecutar({ sock, jid, senderJid }) {
  const visibles = Object.entries(manifest)
    .filter(([, datos]) => !datos.soloOwner || esOwner(senderJid))
    .map(([nombre]) => nombre);

  await sock.sendMessage(jid, {
    text: `Comandos disponibles:\n${visibles.map((c) => `- ${c}`).join("\n")}`,
  });
}