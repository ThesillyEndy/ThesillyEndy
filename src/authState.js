import { initAuthCreds, BufferJSON } from "@whiskeysockets/baileys";
import db from "./db.js";

export function useSQLiteAuthState() {
  const getCredsRow = db.prepare("SELECT data FROM auth_creds WHERE id = 1");
  const upsertCreds = db.prepare(`
    INSERT INTO auth_creds (id, data) VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data
  `);

  const getKey = db.prepare(
    "SELECT data FROM auth_keys WHERE type = ? AND key_id = ?"
  );
  const insertKey = db.prepare(`
    INSERT INTO auth_keys (type, key_id, data) VALUES (?, ?, ?)
    ON CONFLICT(type, key_id) DO UPDATE SET data = excluded.data
  `);
  const deleteKey = db.prepare(
    "DELETE FROM auth_keys WHERE type = ? AND key_id = ?"
  );

  const credsRow = getCredsRow.get();
  const creds = credsRow
    ? JSON.parse(credsRow.data, BufferJSON.reviver)
    : initAuthCreds();

  const guardarLote = db.transaction((data) => {
    for (const type in data) {
      for (const id in data[type]) {
        const value = data[type][id];
        if (value) {
          insertKey.run(type, id, JSON.stringify(value, BufferJSON.replacer));
        } else {
          deleteKey.run(type, id);
        }
      }
    }
  });

  const keys = {
    get: async (type, ids) => {
      const resultado = {};
      for (const id of ids) {
        const fila = getKey.get(type, id);
        if (fila) {
          resultado[id] = JSON.parse(fila.data, BufferJSON.reviver);
        }
      }
      return resultado;
    },
    set: async (data) => {
      guardarLote(data);
    },
  };

  const saveCreds = async () => {
    upsertCreds.run(JSON.stringify(creds, BufferJSON.replacer));
  };

  return { state: { creds, keys }, saveCreds };
}