import { exec } from "child_process";
import { promisify } from "util";

const ejecutarComando = promisify(exec);

export async function ejecutar({ sock, jid, texto }) {
  const args = texto.trim().split(/\s+/).slice(1);
  const esHard = args[0]?.toLowerCase() === "hard";

  const comandoGit = esHard
    ? "git reset --hard origin/main"
    : "git pull";

  const enviado = await sock.sendMessage(jid, {
    text: `Ejecutando: ${comandoGit} ⛏️`,
  });

  try {
    const { stdout, stderr } = await ejecutarComando(comandoGit);
    const salida = (stdout || stderr || "Sin salida").trim();

    await sock.sendMessage(jid, {
      text: `Listo ✅\n\n${salida}`,
      edit: enviado.key,
    });
  } catch (err) {
    await sock.sendMessage(jid, {
      text: `Error al actualizar 😵\n\n${err.message}`,
      edit: enviado.key,
    });
  }
}