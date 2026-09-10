import { jidNormalizedUser, isLidUser } from "@whiskeysockets/baileys";
import db from "./db.js";

// --- resolución de JIDs ---
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

// --- sesiones temporales ---
const obtener = db.prepare("SELECT datos FROM sesiones WHERE jid = ? AND expira > ?");
const guardar = db.prepare(`
  INSERT INTO sesiones (jid, datos, expira) VALUES (?, ?, ?)
  ON CONFLICT(jid) DO UPDATE SET datos = excluded.datos, expira = excluded.expira
`);
const borrarExpiradas = db.prepare("DELETE FROM sesiones WHERE expira <= ?");

export function getSesion(jid) {
  const fila = obtener.get(jid, Date.now());
  return fila ? JSON.parse(fila.datos) : null;
}

export function setSesion(jid, datos, segundosVida = 300) {
  guardar.run(jid, JSON.stringify(datos), Date.now() + segundosVida * 1000);
}

export function limpiarSesiones() {
  borrarExpiradas.run(Date.now());
}