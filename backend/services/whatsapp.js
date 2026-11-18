// Cliente da Cloud API do WhatsApp.
//
// Sem WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID o bot entra em modo simulado:
// as mensagens são impressas no console em vez de enviadas.
// Isso permite construir e testar todo o fluxo sem número real.

const VERSAO = process.env.WHATSAPP_API_VERSION || "v22.0";

export function botConfigurado() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

const modoSimulado = () =>
  process.env.BOT_DRY_RUN === "1" || !botConfigurado();

function registrar(tipo, para, conteudo) {
  console.log("\n===== BOT → CLIENTE (" + para + ") =====");
  console.log("[" + tipo + "]");
  console.log(conteudo);
  console.log("=======================================\n");
}

async function chamar(payload) {
  // Com GUPSHUP_API_KEY definida, o envio passa pelo BSP (necessário na
  // coexistência, porque o número fica sob a API dele).
  if (process.env.GUPSHUP_API_KEY) {
    return chamarGupshup(payload);
  }

  const url = `https://graph.facebook.com/${VERSAO}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const detalhe = await resp.text();
    console.error("❌ Erro ao enviar para o WhatsApp:", resp.status, detalhe);
    return { ok: false, status: resp.status, detalhe };
  }
  return { ok: true, dados: await resp.json() };
}

// ---------- envio pelo Gupshup (coexistência) ----------
//
// Traduz o payload no formato da Meta para o formato do Gupshup.
// Variáveis necessárias: GUPSHUP_API_KEY, GUPSHUP_APP_NAME e GUPSHUP_SOURCE.
async function chamarGupshup(payload) {
  const mensagem = traduzirParaGupshup(payload);

  const corpo = new URLSearchParams({
    channel: "whatsapp",
    source: process.env.GUPSHUP_SOURCE || "",
    destination: String(payload.to || ""),
    "src.name": process.env.GUPSHUP_APP_NAME || "",
    message: JSON.stringify(mensagem)
  });

  const resp = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
    method: "POST",
    headers: {
      apikey: process.env.GUPSHUP_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: corpo.toString()
  });

  if (!resp.ok) {
    const detalhe = await resp.text();
    console.error("❌ Erro ao enviar pelo Gupshup:", resp.status, detalhe);
    return { ok: false, status: resp.status, detalhe };
  }

  return { ok: true, dados: await resp.json().catch(() => ({})) };
}

function traduzirParaGupshup(payload) {
  if (payload.type === "text") {
    return { type: "text", text: payload.text?.body || "" };
  }

  if (payload.type === "interactive" && payload.interactive?.type === "button") {
    return {
      type: "quick_reply",
      content: { type: "text", text: payload.interactive.body?.text || "" },
      options: (payload.interactive.action?.buttons || []).map((b) => ({
        type: "text",
        title: b.reply.title,
        postbackText: b.reply.id
      }))
    };
  }

  if (payload.type === "interactive" && payload.interactive?.type === "list") {
    // O Gupshup não tem lista idêntica à da Meta; enviamos como texto numerado
    // e o bot continua entendendo a resposta em texto.
    const corpo = payload.interactive.body?.text || "";
    const linhas = (payload.interactive.action?.sections || [])
      .flatMap((s) => (s.rows || []).map((r, i) => `${i + 1}. ${r.title}`))
      .join("\n");

    return { type: "text", text: `${corpo}\n\n${linhas}` };
  }

  // Fallback: qualquer outro formato vira texto simples.
  return {
    type: "text",
    text: payload.text?.body || payload.interactive?.body?.text || "(mensagem)"
  };
}

// ---------- envios ----------

export async function enviarTexto(para, texto) {
  if (modoSimulado()) {
    registrar("texto", para, texto);
    return { ok: true, simulado: true };
  }
  return chamar({
    messaging_product: "whatsapp",
    to: para,
    type: "text",
    text: { body: texto, preview_url: false }
  });
}

export async function enviarBotoes(para, corpo, botoes) {
  // A API aceita no máximo 3 botões de resposta.
  const lista = botoes.slice(0, 3).map((b) => ({
    type: "reply",
    reply: { id: b.id, title: b.titulo.slice(0, 20) }
  }));

  if (modoSimulado()) {
    registrar("botões", para, corpo + "\n" + lista.map((b) => "  [" + b.reply.title + "] -> " + b.reply.id).join("\n"));
    return { ok: true, simulado: true };
  }

  return chamar({
    messaging_product: "whatsapp",
    to: para,
    type: "interactive",
    interactive: { type: "button", body: { text: corpo }, action: { buttons: lista } }
  });
}

export async function enviarLista(para, corpo, tituloBotao, secoes) {
  if (modoSimulado()) {
    const linhas = secoes
      .flatMap((s) => s.rows.map((r) => "  [" + r.title + "] -> " + r.id))
      .join("\n");
    registrar("lista", para, corpo + "\n" + linhas);
    return { ok: true, simulado: true };
  }

  return chamar({
    messaging_product: "whatsapp",
    to: para,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: corpo },
      action: {
        button: tituloBotao.slice(0, 20),
        sections: secoes.map((s) => ({
          title: s.title.slice(0, 24),
          rows: s.rows.slice(0, 10).map((r) => ({
            id: r.id,
            title: r.title.slice(0, 24),
            description: r.description ? r.description.slice(0, 72) : undefined
          }))
        }))
      }
    }
  });
}

export async function marcarComoLido(messageId) {
  if (modoSimulado()) return { ok: true, simulado: true };
  return chamar({
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId
  });
}
