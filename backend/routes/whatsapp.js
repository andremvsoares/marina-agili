// Webhook do WhatsApp (Cloud API) + fluxo de agendamento conversacional.
//
// O bot é só mais um cliente da mesma camada de agendamento usada pelo site.
// Nenhuma regra de negócio mora aqui: serviço, horário e criação passam por
// services/booking.js.

import express from "express";
import crypto from "node:crypto";
import {
  listarServicos,
  horariosDisponiveis,
  criarAgendamento,
  buscarCliente,
  HORARIOS_FIXOS
} from "../services/booking.js";
import { enviarTexto, enviarBotoes, enviarLista, botConfigurado } from "../services/whatsapp.js";
import {
  obterSessao,
  salvarSessao,
  limparSessao,
  pausarBot,
  botPausado,
  eventoJaProcessado
} from "../services/sessao.js";

const router = express.Router();

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// ==================== HELPERS DE DATA ====================

const hojeISO = () => {
  const agora = new Date();
  // Data local no fuso do servidor; a Render roda em UTC, então usamos São Paulo.
  const sp = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return sp.toISOString().slice(0, 10);
};

const somarDias = (iso, dias) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

const formatarData = (iso) => {
  const [ano, mes, dia] = iso.split("-");
  const d = new Date(iso + "T12:00:00Z");
  return `${DIAS_SEMANA[d.getUTCDay()]}, ${dia}/${mes}`;
};

const formatarDataLonga = (iso) => {
  const [ano, mes, dia] = iso.split("-");
  const d = new Date(iso + "T12:00:00Z");
  return `${DIAS_SEMANA[d.getUTCDay()]}, ${dia} de ${MESES[Number(mes) - 1]}`;
};

const ehDomingo = (iso) => new Date(iso + "T12:00:00Z").getUTCDay() === 0;

// Interpreta o que a cliente digitou. Devolve ISO ou null.
function interpretarData(texto) {
  const t = (texto || "").toLowerCase().trim();
  const hoje = hojeISO();

  if (/^(hoje)$/.test(t)) return hoje;
  if (/^(amanh[ãa])$/.test(t)) return somarDias(hoje, 1);

  // 18/11, 18-11, 18/11/2026
  const m = t.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?$/);
  if (m) {
    const dia = m[1].padStart(2, "0");
    const mes = m[2].padStart(2, "0");
    let ano = m[3] ? m[3] : hoje.slice(0, 4);
    if (ano.length === 2) ano = "20" + ano;
    const iso = `${ano}-${mes}-${dia}`;
    if (Number.isNaN(new Date(iso + "T12:00:00Z").getTime())) return null;
    return iso;
  }

  // 2026-11-18
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  return null;
}

function dataValida(iso) {
  const hoje = hojeISO();
  const limite = somarDias(hoje, 90);
  if (iso < hoje) return "Essa data já passou. Escolha uma data a partir de hoje.";
  if (iso > limite) return "Só consigo agendar com até 90 dias de antecedência.";
  if (ehDomingo(iso)) return "Domingo não temos atendimento. Escolha outro dia de segunda a sábado.";
  return null;
}

// ==================== VERIFICAÇÃO DO WEBHOOK ====================

router.get("/", (req, res) => {
  const modo = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const desafio = req.query["hub.challenge"];

  if (modo === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("✅ Webhook verificado pela Meta");
    return res.status(200).send(desafio);
  }
  return res.sendStatus(403);
});

// ==================== RECEBIMENTO ====================

function assinaturaValida(req) {
  const segredo = process.env.WHATSAPP_APP_SECRET;
  // Sem segredo configurado (desenvolvimento), não bloqueia.
  if (!segredo) return true;

  const assinatura = req.headers["x-hub-signature-256"];
  if (!assinatura || !req.rawBody) return false;

  const esperado =
    "sha256=" +
    crypto.createHmac("sha256", segredo).update(req.rawBody).digest("hex");

  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post("/", (req, res) => {
  // Sem token configurado o bot não está ativo: recusa eventos reais.
  // Evita que alguém que descubra a URL crie agendamentos falsos.
  const simulado = process.env.BOT_DRY_RUN === "1";
  if (!botConfigurado() && !simulado) {
    return res.status(503).json({ erro: "Bot do WhatsApp não configurado" });
  }

  if (!assinaturaValida(req)) {
    console.warn("⚠️ Webhook com assinatura inválida");
    return res.sendStatus(403);
  }

  // A Meta exige 200 rápido; o processamento segue em background.
  res.sendStatus(200);

  tratarPayload(req.body).catch((err) => console.error("❌ Erro no webhook:", err));
});

async function tratarPayload(corpo) {
  const entradas = corpo?.entry || [];

  for (const entrada of entradas) {
    for (const mudanca of entrada.changes || []) {
      const valor = mudanca.value || {};

      // Coexistência: mensagem que a Marina enviou pelo app do celular.
      // Nesse caso o bot sai de cena para não atropelar o atendimento humano.
      for (const eco of valor.message_echoes || []) {
        const para = eco?.to;
        if (para) {
          await pausarBot(para, 12);
          console.log(`🤝 Marina assumiu a conversa com ${para}; bot pausado por 12h`);
        }
      }

      for (const msg of valor.messages || []) {
        if (eventoJaProcessado(msg.id)) continue;
        await tratarMensagem(msg, valor.contacts?.[0]).catch((err) =>
          console.error("❌ Erro ao tratar mensagem:", err)
        );
      }
    }
  }
}

async function tratarMensagem(msg, contato) {
  const telefone = msg.from;
  if (!telefone) return;

  const sessao = await obterSessao(telefone);

  if (botPausado(sessao)) {
    console.log(`🔇 Conversa com ${telefone} está com a Marina; bot não responde.`);
    return;
  }

  const idInterativo =
    msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || null;
  const texto = msg.text?.body?.trim() || "";
  const nomePerfil = contato?.profile?.name || null;

  // Palavras que sempre reiniciam o fluxo.
  if (/^(menu|oi|ol[áa]|bom dia|boa tarde|boa noite|in[íi]cio|come[çc]ar)$/i.test(texto)) {
    return menu(sessao, nomePerfil);
  }
  if (/^(cancelar|sair|parar)$/i.test(texto)) {
    await limparSessao(telefone);
    return enviarTexto(telefone, "Sem problema! Se quiser agendar depois, é só mandar *oi* por aqui. 💛");
  }

  if (idInterativo) return tratarClique(sessao, idInterativo);

  // Texto livre fora dos estados que esperam texto → mostra o menu.
  return tratarTexto(sessao, texto, nomePerfil);
}

// ==================== TELAS DO FLUXO ====================

async function menu(sessao, nomePerfil) {
  sessao.estado = "inicio";
  sessao.dados = {};
  await salvarSessao(sessao);

  const oi = nomePerfil ? `Oi, ${nomePerfil.split(" ")[0]}! 👋` : "Oi! 👋";

  return enviarBotoes(
    sessao.telefone,
    `${oi} Aqui é o atendimento da *Marina Aglli Clinic Beauty*.\n\nPosso cuidar do seu agendamento agora mesmo. O que você prefere?`,
    [
      { id: "menu:agendar", titulo: "Agendar horário" },
      { id: "menu:servicos", titulo: "Ver serviços" },
      { id: "menu:humano", titulo: "Falar com a Marina" }
    ]
  );
}

async function mostrarServicos(sessao) {
  const servicos = await listarServicos();

  if (servicos.length === 0) {
    sessao.estado = "inicio";
    await salvarSessao(sessao);
    return enviarTexto(
      sessao.telefone,
      "Estamos atualizando a lista de serviços. Fale direto com a Marina, ela te ajuda agora. 💛"
    );
  }

  sessao.estado = "servico";
  await salvarSessao(sessao);

  return enviarLista(
    sessao.telefone,
    "Escolha o serviço que você quer fazer:",
    "Ver serviços",
    [
      {
        title: "Serviços disponíveis",
        rows: servicos.slice(0, 10).map((s) => ({
          id: `servico:${s._id}`,
          title: s.nome,
          description: `R$ ${s.preco} · ${s.duracao || 60} min`
        }))
      }
    ]
  );
}

async function mostrarDatas(sessao) {
  sessao.estado = "data";
  await salvarSessao(sessao);

  const hoje = hojeISO();
  const linhas = [];
  let cursor = hoje;
  let tentativas = 0;

  while (linhas.length < 6 && tentativas < 15) {
    cursor = somarDias(hoje, tentativas);
    tentativas++;
    if (ehDomingo(cursor)) continue;
    linhas.push({ id: `data:${cursor}`, title: formatarData(cursor) });
  }

  return enviarLista(
    sessao.telefone,
    "Perfeito! Agora escolha o dia:",
    "Ver datas",
    [{ title: "Próximos dias", rows: linhas }]
  );
}

async function mostrarHorarios(sessao) {
  const data = sessao.dados.data;
  const horarios = await horariosDisponiveis(data);
  const livres = horarios.filter((h) => h.disponivel);

  sessao.estado = "hora";
  await salvarSessao(sessao);

  if (livres.length === 0) {
    sessao.estado = "data";
    await salvarSessao(sessao);
    await enviarTexto(sessao.telefone, "Esse dia já está cheio 😕 Vamos escolher outro?");
    return mostrarDatas(sessao);
  }

  return enviarLista(
    sessao.telefone,
    `Horários livres em *${formatarDataLonga(data)}*:`,
    "Ver horários",
    [
      {
        title: "Horários disponíveis",
        rows: livres.map((h) => ({ id: `hora:${h.hora}`, title: h.hora }))
      }
    ]
  );
}

async function pedirNome(sessao, nomePerfil) {
  const cliente = await buscarCliente(sessao.telefone);

  if (cliente?.nome) {
    sessao.dados.nome = cliente.nome;
    sessao.estado = "confirmar";
    await salvarSessao(sessao);
    return resumo(sessao);
  }

  if (nomePerfil) {
    sessao.dados.nome = nomePerfil;
    sessao.estado = "confirmar";
    await salvarSessao(sessao);
    return resumo(sessao);
  }

  sessao.estado = "nome";
  await salvarSessao(sessao);
  return enviarTexto(sessao.telefone, "Por último, como você se chama?");
}

async function resumo(sessao) {
  const { servicoNome, servicoPreco, data, hora, nome } = sessao.dados;

  return enviarBotoes(
    sessao.telefone,
    `Confere pra mim? 👇\n\n*Nome:* ${nome}\n*Serviço:* ${servicoNome}\n*Data:* ${formatarDataLonga(data)}\n*Horário:* ${hora}\n*Valor:* R$ ${servicoPreco}\n\nSe estiver tudo certo, eu já reservo.`,
    [
      { id: "confirma:sim", titulo: "Confirmar" },
      { id: "confirma:nao", titulo: "Trocar horário" }
    ]
  );
}

// ==================== CLIQUES ====================

async function tratarClique(sessao, id) {
  const telefone = sessao.telefone;

  if (id === "menu:agendar") return mostrarServicos(sessao);
  if (id === "menu:servicos") {
    const servicos = await listarServicos();
    await enviarTexto(
      telefone,
      "Nossos serviços:\n\n" +
        servicos.map((s) => `• *${s.nome}* — R$ ${s.preco} (${s.duracao || 60} min)`).join("\n") +
        "\n\nQuer agendar algum? 🙂"
    );
    return mostrarServicos(sessao);
  }
  if (id === "menu:humano") {
    await pausarBot(telefone, 12);
    return enviarTexto(
      telefone,
      "Claro! Já avisei a Marina e ela te responde por aqui. 💛\n\nEnquanto isso, se quiser adiantar, é só mandar *oi* que eu volto ao agendamento."
    );
  }

  if (id.startsWith("servico:")) {
    const servicoId = id.slice("servico:".length);
    const servicos = await listarServicos();
    const escolhido = servicos.find((s) => String(s._id) === servicoId);

    if (!escolhido) {
      return enviarTexto(telefone, "Não achei esse serviço. Vamos escolher de novo?");
    }

    sessao.dados.servicoId = String(escolhido._id);
    sessao.dados.servicoNome = escolhido.nome;
    sessao.dados.servicoPreco = escolhido.preco;
    await salvarSessao(sessao);

    return mostrarDatas(sessao);
  }

  if (id.startsWith("data:")) {
    const data = id.slice("data:".length);
    const problema = dataValida(data);
    if (problema) {
      await enviarTexto(telefone, problema);
      return mostrarDatas(sessao);
    }
    sessao.dados.data = data;
    await salvarSessao(sessao);
    return mostrarHorarios(sessao);
  }

  if (id.startsWith("hora:")) {
    sessao.dados.hora = id.slice("hora:".length);
    await salvarSessao(sessao);
    return pedirNome(sessao, null);
  }

  if (id === "confirma:sim") return finalizar(sessao);

  if (id === "confirma:nao") {
    sessao.dados.hora = null;
    await salvarSessao(sessao);
    return mostrarHorarios(sessao);
  }

  return menu(sessao, null);
}

// ==================== TEXTO LIVRE ====================

async function tratarTexto(sessao, texto, nomePerfil) {
  const telefone = sessao.telefone;

  // Já está no resumo: texto livre não pode jogar fora a reserva em andamento.
  if (sessao.estado === "confirmar") {
    await enviarTexto(
      telefone,
      "Só falta um toque: use os botões *Confirmar* ou *Trocar horário* para eu concluir. 🙂"
    );
    return resumo(sessao);
  }

  if (sessao.estado === "nome") {
    if (texto.length < 2) {
      return enviarTexto(telefone, "Me diz seu nome completo, por favor 🙂");
    }
    sessao.dados.nome = texto.slice(0, 80);
    sessao.estado = "confirmar";
    await salvarSessao(sessao);
    return resumo(sessao);
  }

  if (sessao.estado === "data") {
    const iso = interpretarData(texto);
    if (!iso) {
      return enviarTexto(
        telefone,
        "Não entendi a data 🙈 Pode escrever assim: *25/11* ou *amanhã*."
      );
    }
    const problema = dataValida(iso);
    if (problema) {
      await enviarTexto(telefone, problema);
      return mostrarDatas(sessao);
    }
    sessao.dados.data = iso;
    await salvarSessao(sessao);
    return mostrarHorarios(sessao);
  }

  if (sessao.estado === "hora") {
    const m = texto.match(/^(\d{1,2})[:h]?(\d{2})?$/);
    if (m) {
      const hora = `${m[1].padStart(2, "0")}:${(m[2] || "00").padStart(2, "0")}`;
      if (!HORARIOS_FIXOS.includes(hora)) {
        return enviarTexto(
          telefone,
          `Não temos esse horário. Atendemos em: ${HORARIOS_FIXOS.join(", ")}.`
        );
      }
      const ocupados = await horariosDisponiveis(sessao.dados.data);
      const livre = ocupados.find((h) => h.hora === hora && h.disponivel);
      if (!livre) {
        await enviarTexto(telefone, "Esse horário já está ocupado 😕");
        return mostrarHorarios(sessao);
      }
      sessao.dados.hora = hora;
      await salvarSessao(sessao);
      return pedirNome(sessao, nomePerfil);
    }
  }

  // Estado inicial ou texto solto: oferece o menu.
  return menu(sessao, nomePerfil);
}

// ==================== CRIAÇÃO ====================

async function finalizar(sessao) {
  const telefone = sessao.telefone;
  const { servicoId, data, hora, nome } = sessao.dados;

  const resultado = await criarAgendamento({
    clienteNome: nome,
    clienteWhatsapp: telefone,
    servicoId,
    data,
    hora,
    consentimento: true,
    simulado: process.env.BOT_DRY_RUN === "1"
  });

  if (!resultado.ok) {
    await enviarTexto(telefone, resultado.erro || "Não consegui reservar esse horário.");
    return mostrarHorarios(sessao);
  }

  await limparSessao(telefone);
  await salvarSessao({ ...sessao, estado: "inicio", dados: {} });

  return enviarTexto(
    telefone,
    `Prontinho, *${nome.split(" ")[0]}*! ✅\n\n` +
      `*${sessao.dados.servicoNome}*\n` +
      `📅 ${formatarDataLonga(data)} às ${hora}\n` +
      `💰 R$ ${sessao.dados.servicoPreco}\n\n` +
      `Te espero lá na Marina Aglli Clinic Beauty. Se precisar remarcar, é só chamar aqui. 💛`
  );
}

// ==================== STATUS ====================

router.get("/status", (req, res) => {
  res.json({
    configurado: botConfigurado(),
    modo: process.env.BOT_DRY_RUN === "1" ? "simulado" : "real",
    verificacaoConfigurada: Boolean(process.env.WHATSAPP_VERIFY_TOKEN)
  });
});

export default router;
