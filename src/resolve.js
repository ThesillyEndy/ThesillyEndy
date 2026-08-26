import { jidNormalizedUser, isLidUser } from "@whiskeysockets/baileys";
import db from "./db.js";

const getMapeo = db.prepare("SELECT jid_real FROM jid_map WHERE lid = ?");
const guardarMapeo = db.prepare(`
  INSERT INTO jid_map (lid, jid_real) VALUES (?, ?)
  ON CONFLICT(lid) DO UPDATE SET jid_real = excluded.jid_real
`);

export function resolverJid(jidCrudo) {
  const normalizado = jidNormalizedUser(jidCrudo);

  if (isLidUser(normalizado)) {
    const fila = getMapeo.get(normalizado);
    if (fila) return fila.jid_real;
  }

  return normalizado;
}

export function guardarJidReal(lid, jidReal) {
  guardarMapeo.run(lid, jidReal);
}