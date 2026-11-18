// Adaptador do webhook do Gupshup para o formato da Meta.
//
// O Gupshup (e outros BSPs) enviam as mensagens num formato próprio:
//
//   { "type": "message",
//     "payload": { "id": "...", "source": "5519...", "type": "text",
//                  "payload": { "text": "oi" },
//                  "sender": { "phone": "5519...", "name": "Andre" } } }
//
// Convertendo para o formato da Meta, o resto do bot (sessão, textos, agendamento)
// continua funcionando sem alteração.

export function pareceGupshup(corpo) {
  if (!corpo || typeof corpo !== "object") return false;
  if (Array.isArray(corpo.entry)) return false; // já é Meta
  return Boolean(corpo.payload && (corpo.payload.source || corpo.payload.sender));
}

function extrairTexto(conteudo) {
  // O Gupshup coloca o texto em lugares diferentes conforme o tipo.
  if (typeof conteudo === "string") return conteudo;
  if (!conteudo || typeof conteudo !== "object") return "";

  return (
    conteudo.text ||
    conteudo.title ||
    conteudo.body ||
    (conteudo.payload && conteudo.payload.text) ||
    ""
  );
}

function normalizarMensagem(evento) {
  const origem = evento.source || evento.sender?.phone || "";
  const tipoOriginal = String(evento.type || "").toLowerCase();
  const conteudo = evento.payload ?? evento;

  const base = {
    from: String(origem),
    id: String(evento.id || ""),
    timestamp: String(evento.timestamp || Math.floor(Date.now() / 1000))
  };

  if (tipoOriginal === "text") {
    return { ...base, type: "text", text: { body: extrairTexto(conteudo) } };
  }

  // Botão ou item de lista escolhido (Gupshup manda o id em "payload")
  if (tipoOriginal === "quick_reply" || tipoOriginal === "button" || tipoOriginal === "interactive") {
    const id =
      conteudo.id ||
      conteudo.postbackText ||
      conteudo.text ||
      evento.postbackText ||
      "";

    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: { id: String(id), title: String(conteudo.title || id) }
      }
    };
  }

  // Qualquer outro tipo vira texto com o conteúdo disponível,
  // para o bot não ficar mudo com áudio, imagem etc.
  return {
    ...base,
    type: "text",
    text: { body: extrairTexto(conteudo) || `[${tipoOriginal || "mensagem"}]` }
  };
}

export function converterGupshup(corpo) {
  const evento = corpo?.payload || {};
  const tipo = String(corpo?.type || "").toLowerCase();

  // Eventos que não são mensagem (status, template, etc.): devolve algo vazio
  // para o registro de diagnóstico guardar e o bot ignorar.
  if (evento.type === "status" || (evento.status && !evento.source)) {
    return {
      entry: [
        {
          changes: [
            {
              field: "statuses",
              value: { statuses: [{ status: String(evento.status || "desconhecido") }] }
            }
          ]
        }
      ]
    };
  }

  const mensagem = normalizarMensagem(evento);
  if (!mensagem.from) return { entry: [] };

  return {
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "gupshup", origem: tipo },
              contacts: [
                {
                  profile: { name: evento.sender?.name || "" },
                  wa_id: mensagem.from
                }
              ],
              messages: [mensagem]
            }
          }
        ]
      }
    ]
  };
}
