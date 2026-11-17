// Simulador de conversa do WhatsApp.
//
// Injeta eventos no webhook como se fossem mensagens reais da Meta,
// para testar o fluxo inteiro sem número, sem token e sem gravar no banco.
//
// Uso (com o servidor rodando em BOT_DRY_RUN=1):
//   node scripts/simular-conversa.mjs http://127.0.0.1:4127

const BASE = process.argv[2] || "http://127.0.0.1:4127";
const WEBHOOK = BASE + "/webhook/whatsapp";
const TELEFONE = "5519988887777";
const NOME_PERFIL = "Ana Paula";

let contador = 0;
const idMensagem = () => `wamid.SIMULADO${Date.now()}${++contador}`;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function payloadTexto(texto) {
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
              metadata: { display_phone_number: "5519998985805", phone_number_id: "SIMULADO" },
              contacts: [{ profile: { name: NOME_PERFIL }, wa_id: TELEFONE }],
              messages: [
                {
                  from: TELEFONE,
                  id: idMensagem(),
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: texto }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

function payloadClique(id, titulo, tipo = "button_reply") {
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
              metadata: { display_phone_number: "5519998985805", phone_number_id: "SIMULADO" },
              contacts: [{ profile: { name: NOME_PERFIL }, wa_id: TELEFONE }],
              messages: [
                {
                  from: TELEFONE,
                  id: idMensagem(),
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "interactive",
                  interactive: {
                    type: tipo,
                    [tipo]: { id, title: titulo }
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

async function enviar(payload, rotulo) {
  const resp = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  console.log(`→ ${rotulo}: HTTP ${resp.status}`);
  await espera(600);
}

async function principal() {
  // Descobre um serviço e um horário livre reais para usar no teste.
  const servicos = await (await fetch(BASE + "/api/servicos")).json();
  if (!servicos.length) throw new Error("Sem serviços cadastrados");

  const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const horarios = await (await fetch(BASE + "/api/horarios/" + amanha)).json();
  const livre = horarios.find((h) => h.disponivel);

  console.log("Teste com serviço:", servicos[0].nome, "| data:", amanha, "| hora:", livre?.hora);

  await enviar(payloadTexto("oi"), "texto: oi");
  await enviar(payloadClique("menu:agendar", "Agendar horário"), "clique: Agendar");
  await enviar(payloadClique(`servico:${servicos[0]._id}`, servicos[0].nome, "list_reply"), "clique: serviço");
  await enviar(payloadClique(`data:${amanha}`, "Data", "list_reply"), "clique: data");
  await enviar(payloadClique(`hora:${livre.hora}`, livre.hora, "list_reply"), "clique: horário");
  await enviar(payloadTexto("Ana Paula Teste"), "texto: nome");
  await enviar(payloadClique("confirma:sim", "Confirmar"), "clique: confirmar");

  console.log("\nConversa simulada concluída. Veja as respostas do bot no log do servidor.");
}

principal().catch((err) => {
  console.error("❌ Falha na simulação:", err.message);
  process.exit(1);
});
