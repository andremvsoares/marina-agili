// Testes de borda do bot: data digitada, horário inválido, domingo,
// pedido de atendimento humano (handoff) e eco de mensagem da Marina.
//
// Uso (servidor em BOT_DRY_RUN=1):
//   node scripts/simular-casos.mjs http://127.0.0.1:4127

const BASE = process.argv[2] || "http://127.0.0.1:4127";
const WEBHOOK = BASE + "/webhook/whatsapp";

let contador = 0;
const idMensagem = () => `wamid.CASO${Date.now()}${++contador}`;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function envelope(telefone, nome, mensagem) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "SIMULADO",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "SIMULADO" },
              contacts: [{ profile: { name: nome }, wa_id: telefone }],
              messages: [mensagem]
            }
          }
        ]
      }
    ]
  };
}

const texto = (telefone, nome, corpo) =>
  envelope(telefone, nome, {
    from: telefone,
    id: idMensagem(),
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "text",
    text: { body: corpo }
  });

const clique = (telefone, nome, id) =>
  envelope(telefone, nome, {
    from: telefone,
    id: idMensagem(),
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "interactive",
    interactive: { type: "button_reply", button_reply: { id, title: id } }
  });

async function enviar(payload, rotulo) {
  const r = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  console.log(`→ ${rotulo}: HTTP ${r.status}`);
  await espera(700);
}

async function principal() {
  const A = "5519977776666";
  const B = "5519966665555";

  const servicos = await (await fetch(BASE + "/api/servicos")).json();
  const servicoId = servicos[0]._id;

  console.log("--- CASO 1: data digitada + horário digitado ---");
  await enviar(texto(A, "Bia", "oi"), "oi");
  await enviar(clique(A, "Bia", "menu:agendar"), "agendar");
  await enviar(clique(A, "Bia", `servico:${servicoId}`), "serviço");
  await enviar(texto(A, "Bia", "amanhã"), "data digitada: amanhã");
  await enviar(texto(A, "Bia", "12:30"), "horário fora da grade");
  await enviar(texto(A, "Bia", "15:00"), "horário válido");
  await enviar(texto(A, "Bia", "Bia Souza"), "nome");

  console.log("--- CASO 2: data no passado e domingo ---");
  await enviar(texto(A, "Bia", "cancelar"), "cancelar");
  await enviar(texto(A, "Bia", "oi"), "oi de novo");
  await enviar(clique(A, "Bia", "menu:agendar"), "agendar");
  await enviar(clique(A, "Bia", `servico:${servicoId}`), "serviço");
  await enviar(texto(A, "Bia", "01/01/2020"), "data passada");
  await enviar(texto(A, "Bia", "22/11/2026"), "domingo");

  console.log("--- CASO 3: pedido de humano e silêncio do bot ---");
  await enviar(clique(B, "Carla", "menu:humano"), "falar com a Marina");
  await enviar(texto(B, "Carla", "oi"), "mensagem após handoff (deve ficar mudo)");

  console.log("--- CASO 4: eco de mensagem enviada pelo app (coexistência) ---");
  await enviar(
    {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "SIMULADO",
          changes: [
            {
              field: "smb_message_echoes",
              value: { message_echoes: [{ to: "5519955554444" }] }
            }
          ]
        }
      ]
    },
    "eco da Marina"
  );

  console.log("\nCasos enviados. Confira as respostas no log do servidor.");
}

principal().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
