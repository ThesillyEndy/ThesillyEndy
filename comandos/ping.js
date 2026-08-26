export async function ejecutar({ sock, jid }) {
  const inicio = Date.now();

  const enviado = await sock.sendMessage(jid, { text: "Calculando ping... ⛏️" });

  const ms = Date.now() - inicio;

  await sock.sendMessage(jid, {
    text: `¡Pong! ${ms}ms ⛏️`,
    edit: enviado.key,
  });
}