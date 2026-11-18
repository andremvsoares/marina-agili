// Webhook do WhatsApp (Cloud API) + fluxo de agendamento conversacional.
//
// O bot é só mais um cliente da mesma camada de agendamento usada pelo site.
// Nenhuma regra de negócio mora aqui: serviço, horário e criação passam por
// services/booking.js. Todos os textos ficam em ../textos.js.

import express from "express";
import crypto from "node:crypto";
import WebhookEvento from "../models/WebhookEvento.js";
import { pareceGupshup, converterGupshup } from "../services/gupshup.js";
import { TEXTOS as T } from "../textos.js";
import {
  listarServicos,
  horariosDisponiveis,
  horariosDoDia,
  criarAgendamento,
  buscarCliente
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
  const sp = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
  return sp.toISOString().slice(0, 10);
};

const somarDias = (iso, dias) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

const formatarData = (iso) => {
  const [, mes, dia] = iso.split("-");
  const d = new Date(iso + "T12:00:00Z");
  return `${DIAS_SEMANA[d.getUTCDay()]}, ${dia}/${mes}`;
};

const formatarDataLonga = (iso) => {
  const [, mes, dia] = iso.split("-");
  const d = new Date(iso + "T12:00:00Z");
  return `${DIAS_SEMANA[d.getUTCDay()]}, ${dia} de ${MESES[Number(mes) - 1]}`;
};

// Interpreta o que a cliente digitou. Devolve ISO ou null.
function interpretarData(texto) {
  const t = (texto || "").toLowerCase().trim();
  const hoje = hojeISO();

  if (/^(hoje)$/.test(t)) return hoje;
  if (/^(amanh[ãa])$/.test(t)) return somarDias(hoje, 1);

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

  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  return null;
}

async function dataValida(iso) {
  const hoje = hojeISO();
  const limite = somarDias(hoje, 90);
  if (iso < hoje) return T.dataPassada;
  if (iso > limite) return T.dataMuitoLonge;

  const horarios = await horariosDoDia(iso);
  if (horarios.length === 0) return T.diaFechado;

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
  if (!segredo) return true; // desenvolvimento

  const assinatura = req.headers["x-hub-signature-256"];
  if (!assinatura || !req.rawBody) return false;

  const esperado =
    "sha256=" + crypto.createHmac("sha256", segredo).update(req.rawBody).digest("hex");

  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post("/", (req, res) => {
  // Sem token configurado o bot não está ativo: recusa eventos reais.
  const simulado = process.env.BOT_DRY_RUN === "1";
  if (!botConfigurado() && !simulado) {
    return res.status(503).json({ erro: "Bot do WhatsApp não configurado" });
  }

  // O Gupshup (BSP) manda num formato próprio; convertemos para o da Meta.
  const deGupshup = pareceGupshup(req.body);
  const corpo = deGupshup ? converterGupshup(req.body) : req.body;

  // A assinatura HMAC é da Meta; o Gupshup usa outro esquema.
  if (!deGupshup && !assinaturaValida(req)) {
    console.warn("⚠️ Webhook com assinatura inválida");
    return res.sendStatus(403);
  }

  // A Meta exige 200 rápido; o processamento segue em background.
  res.sendStatus(200);

  registrarEvento(req.body).catch(() => {});

  tratarPayload(corpo).catch((err) => console.error("❌ Erro no webhook:", err));
});

// Guarda o evento para diagnóstico (expira em 24h).
async function registrarEvento(corpo) {
  const mudanca = corpo?.entry?.[0]?.changes?.[0];
  const valor = mudanca?.value || {};
  const tipo = mudanca?.field || "";

  let resumo = "evento";
  if (Array.isArray(valor.messages) && valor.messages.length) {
    const msg = valor.messages[0];
    resumo = `mensagem de ${msg.from} (${msg.type})`;
  } else if (Array.isArray(valor.statuses) && valor.statuses.length) {
    resumo = `status ${valor.statuses[0].status}`;
  } else if (Array.isArray(valor.message_echoes) && valor.message_echoes.length) {
    resumo = "eco de mensagem do app";
  }

  console.log("📩 Webhook recebido:", tipo, "|", resumo);

  await WebhookEvento.create({ tipo, resumo, corpo });
}

async function tratarPayload(corpo) {
  const entradas = corpo?.entry || [];

  for (const entrada of entradas) {
    for (const mudanca of entrada.changes || []) {
      const valor = mudanca.value || {};

      // Coexistência: mensagem que a Marina enviou pelo app do celular.
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

  if (/^(menu|oi|ol[áa]|bom dia|boa tarde|boa noite|in[íi]cio|come[çc]ar)$/i.test(texto)) {
    return menu(sessao, nomePerfil);
  }
  if (/^(cancelar|sair|parar)$/i.test(texto)) {
    await limparSessao(telefone);
    return enviarTexto(telefone, T.cancelou);
  }

  if (idInterativo) return tratarClique(sessao, idInterativo);

  return tratarTexto(sessao, texto, nomePerfil);
}

// ==================== TELAS DO FLUXO ====================

async function menu(sessao, nomePerfil) {
  sessao.estado = "inicio";
  sessao.dados = {};
  await salvarSessao(sessao);

  const primeiroNome = nomePerfil ? nomePerfil.split(" ")[0] : null;

  return enviarBotoes(sessao.telefone, T.saudacao(primeiroNome), [
    { id: "menu:agendar", titulo: T.botoesMenu.agendar },
    { id: "menu:servicos", titulo: T.botoesMenu.servicos },
    { id: "menu:humano", titulo: T.botoesMenu.humano }
  ]);
}

async function mostrarServicos(sessao) {
  const servicos = await listarServicos();

  if (servicos.length === 0) {
    sessao.estado = "inicio";
    await salvarSessao(sessao);
    return enviarTexto(sessao.telefone, T.servicosIndisponiveis);
  }

  sessao.estado = "servico";
  await salvarSessao(sessao);

  return enviarLista(sessao.telefone, T.escolherServico, T.botaoServicos, [
    {
      title: T.secaoServicos,
      rows: servicos.slice(0, 10).map((s) => ({
        id: `servico:${s._id}`,
        title: s.nome,
        description: `R$ ${s.preco} · ${s.duracao || 60} min`
      }))
    }
  ]);
}

async function mostrarDatas(sessao) {
  sessao.estado = "data";
  await salvarSessao(sessao);

  const hoje = hojeISO();
  const linhas = [];
  let tentativas = 0;
  let cursor = hoje;

  while (linhas.length < 6 && tentativas < 21) {
    cursor = somarDias(hoje, tentativas);
    tentativas++;
    const horarios = await horariosDoDia(cursor);
    if (horarios.length === 0) continue; // dia fechado
    linhas.push({ id: `data:${cursor}`, title: formatarData(cursor) });
  }

  return enviarLista(sessao.telefone, T.escolherDia, T.botaoDatas, [
    { title: T.secaoDatas, rows: linhas }
  ]);
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
    await enviarTexto(sessao.telefone, T.diaCheio);
    return mostrarDatas(sessao);
  }

  return enviarLista(
    sessao.telefone,
    T.horariosLivres(formatarDataLonga(data)),
    T.botaoHorarios,
    [{ title: T.secaoHorarios, rows: livres.map((h) => ({ id: `hora:${h.hora}`, title: h.hora })) }]
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
  return enviarTexto(sessao.telefone, T.pedirNome);
}

async function resumo(sessao) {
  const { servicoNome, servicoPreco, data, hora, nome } = sessao.dados;

  return enviarBotoes(
    sessao.telefone,
    T.resumo({
      nome,
      servicoNome,
      dataFormatada: formatarDataLonga(data),
      hora,
      preco: servicoPreco
    }),
    [
      { id: "confirma:sim", titulo: T.botoesConfirmar.sim },
      { id: "confirma:nao", titulo: T.botoesConfirmar.nao }
    ]
  );
}

// ==================== CLIQUES ====================

async function tratarClique(sessao, id) {
  const telefone = sessao.telefone;

  if (id === "menu:agendar") return mostrarServicos(sessao);

  if (id === "menu:servicos") {
    const servicos = await listarServicos();
    const linhas = servicos
      .map((s) => `• *${s.nome}* — R$ ${s.preco} (${s.duracao || 60} min)`)
      .join("\n");
    await enviarTexto(telefone, T.listaDeServicos(linhas));
    return mostrarServicos(sessao);
  }

  if (id === "menu:humano") {
    await pausarBot(telefone, 12);
    return enviarTexto(telefone, T.chamouHumano);
  }

  if (id.startsWith("servico:")) {
    const servicoId = id.slice("servico:".length);
    const servicos = await listarServicos();
    const escolhido = servicos.find((s) => String(s._id) === servicoId);

    if (!escolhido) {
      return enviarTexto(telefone, T.servicoNaoEncontrado);
    }

    sessao.dados.servicoId = String(escolhido._id);
    sessao.dados.servicoNome = escolhido.nome;
    sessao.dados.servicoPreco = escolhido.preco;
    await salvarSessao(sessao);

    return mostrarDatas(sessao);
  }

  if (id.startsWith("data:")) {
    const data = id.slice("data:".length);
    const problema = await dataValida(data);
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
    await enviarTexto(telefone, T.resumoTravado);
    return resumo(sessao);
  }

  if (sessao.estado === "nome") {
    if (texto.length < 2) {
      return enviarTexto(telefone, T.nomeCurto);
    }
    sessao.dados.nome = texto.slice(0, 80);
    sessao.estado = "confirmar";
    await salvarSessao(sessao);
    return resumo(sessao);
  }

  if (sessao.estado === "data") {
    const iso = interpretarData(texto);
    if (!iso) {
      return enviarTexto(telefone, T.naoEntendiData);
    }
    const problema = await dataValida(iso);
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
      const doDia = await horariosDoDia(sessao.dados.data);
      if (!doDia.includes(hora)) {
        return enviarTexto(telefone, T.horarioForaDaGrade(doDia.join(", ")));
      }
      const ocupados = await horariosDisponiveis(sessao.dados.data);
      const livre = ocupados.find((h) => h.hora === hora && h.disponivel);
      if (!livre) {
        await enviarTexto(telefone, T.horarioOcupado);
        return mostrarHorarios(sessao);
      }
      sessao.dados.hora = hora;
      await salvarSessao(sessao);
      return pedirNome(sessao, nomePerfil);
    }
  }

  return menu(sessao, nomePerfil);
}

// ==================== CRIAÇÃO ====================

async function finalizar(sessao) {
  const telefone = sessao.telefone;
  const { servicoId, data, hora, nome, servicoNome, servicoPreco } = sessao.dados;

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
    await enviarTexto(telefone, resultado.erro || T.erroAoReservar);
    return mostrarHorarios(sessao);
  }

  await limparSessao(telefone);
  await salvarSessao({ ...sessao, estado: "inicio", dados: {} });

  return enviarTexto(
    telefone,
    T.confirmado({
      primeiroNome: nome.split(" ")[0],
      servicoNome,
      dataFormatada: formatarDataLonga(data),
      hora,
      preco: servicoPreco
    })
  );
}

// ==================== STATUS ====================

router.get("/status", (req, res) => {
  res.json({
    configurado: botConfigurado(),
    modo: !botConfigurado()
      ? "desligado"
      : process.env.BOT_DRY_RUN === "1"
        ? "simulado"
        : "real",
    verificacaoConfigurada: Boolean(process.env.WHATSAPP_VERIFY_TOKEN)
  });
});

export default router;
