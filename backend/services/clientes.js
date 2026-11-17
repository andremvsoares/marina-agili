// Ficha da cliente e regras de comparecimento.
//
// Regra combinada com o André:
// - Marina marca "não compareceu" no painel para um horário que já passou.
// - Isso liga o sinal obrigatório (20%) para os próximos agendamentos.
// - Quando a cliente comparece a um atendimento, o sinal é desligado.
// - Cancelar com menos de 3 horas de antecedência também conta como problema.

import Cliente from "../models/Cliente.js";
import Agendamento from "../models/Agendamento.js";

export const HORAS_DE_ANTECEDENCIA = 3;

export const normalizarWhatsapp = (valor) => String(valor || "").replace(/\D/g, "");

// Data/hora do atendimento no fuso de São Paulo (UTC-3, sem horário de verão).
export function momentoDoAtendimento(agendamento) {
  return new Date(`${agendamento.data}T${agendamento.hora}:00-03:00`);
}

export function horarioJaPassou(agendamento, agora = new Date()) {
  return momentoDoAtendimento(agendamento) < agora;
}

// Cancelou faltando menos que o mínimo? Então é cancelamento tardio.
export function cancelamentoFoiTardio(agendamento, canceladoEm = new Date()) {
  const limite = new Date(
    momentoDoAtendimento(agendamento).getTime() - HORAS_DE_ANTECEDENCIA * 60 * 60 * 1000
  );
  return canceladoEm > limite;
}

// ---------- leitura ----------

export async function buscarFicha(whatsapp) {
  return Cliente.findOne({ whatsapp: normalizarWhatsapp(whatsapp) });
}

export async function precisaSinal(whatsapp) {
  const cliente = await buscarFicha(whatsapp);
  return cliente?.sinalObrigatorio === true;
}

export async function listarClientesComSinal() {
  return Cliente.find({ sinalObrigatorio: true })
    .select("nome whatsapp noShows cancelamentosTardios ultimoProblemaEm sinalDesde")
    .sort({ ultimoProblemaEm: -1 });
}

// ---------- escrita ----------

export async function obterOuCriarCliente(whatsapp, nome) {
  const numero = normalizarWhatsapp(whatsapp);
  const existente = await Cliente.findOne({ whatsapp: numero });
  if (existente) {
    if (nome && existente.nome !== nome) {
      existente.nome = nome;
      await existente.save();
    }
    return existente;
  }
  return Cliente.create({ whatsapp: numero, nome: nome || "Cliente" });
}

/**
 * Marina confirmou que a cliente não apareceu.
 * Liga o sinal obrigatório e registra no histórico.
 */
export async function marcarFalta(agendamentoId) {
  const agendamento = await Agendamento.findById(agendamentoId);
  if (!agendamento) return { ok: false, status: 404, erro: "Agendamento não encontrado" };

  if (agendamento.status === "nao_compareceu") {
    return { ok: false, status: 400, erro: "Essa falta já está registrada" };
  }

  agendamento.status = "nao_compareceu";
  await Agendamento.updateOne(
    { _id: agendamento._id },
    { status: "nao_compareceu", $unset: { slot: 1 } }
  );

  const cliente = await obterOuCriarCliente(
    agendamento.clienteWhatsapp,
    agendamento.clienteNome
  );

  cliente.noShows = (cliente.noShows || 0) + 1;
  cliente.ultimoProblemaEm = new Date();
  cliente.sinalObrigatorio = true;
  cliente.sinalDesde = cliente.sinalDesde || new Date();
  await cliente.save();

  return { ok: true, agendamento, cliente };
}

/**
 * Atendimento concluído: a cliente compareceu, então a restrição cai.
 */
export async function registrarComparecimento(agendamentoId) {
  const agendamento = await Agendamento.findById(agendamentoId);
  if (!agendamento) return { ok: false, status: 404, erro: "Agendamento não encontrado" };

  await Agendamento.updateOne(
    { _id: agendamento._id },
    { status: "concluido", compareceuEm: new Date(), slot: `${agendamento.data}T${agendamento.hora}` }
  );
  agendamento.status = "concluido";
  agendamento.compareceuEm = new Date();

  const cliente = await Cliente.findOne({
    whatsapp: normalizarWhatsapp(agendamento.clienteWhatsapp)
  });

  if (cliente && cliente.sinalObrigatorio) {
    cliente.sinalObrigatorio = false;
    cliente.sinalDesde = null;
    await cliente.save();
  }

  return { ok: true, agendamento, cliente };
}

/**
 * Cancelamento: libera o horário e, se foi em cima da hora, conta como problema.
 */
export async function registrarCancelamento(agendamentoId) {
  const agendamento = await Agendamento.findById(agendamentoId);
  if (!agendamento) return { ok: false, status: 404, erro: "Agendamento não encontrado" };

  const canceladoEm = new Date();
  const tardio = cancelamentoFoiTardio(agendamento, canceladoEm);

  await Agendamento.updateOne(
    { _id: agendamento._id },
    { status: "cancelado", canceladoEm, $unset: { slot: 1 } }
  );
  agendamento.status = "cancelado";
  agendamento.canceladoEm = canceladoEm;

  let cliente = null;
  if (tardio) {
    cliente = await obterOuCriarCliente(
      agendamento.clienteWhatsapp,
      agendamento.clienteNome
    );
    cliente.cancelamentosTardios = (cliente.cancelamentosTardios || 0) + 1;
    cliente.ultimoProblemaEm = canceladoEm;
    cliente.sinalObrigatorio = true;
    cliente.sinalDesde = cliente.sinalDesde || canceladoEm;
    await cliente.save();
  }

  return { ok: true, agendamento, cliente, tardio };
}

/**
 * Correção manual da Marina (erro de marcação, segunda chance, etc.).
 */
export async function definirSinal(whatsapp, obrigatorio) {
  const numero = normalizarWhatsapp(whatsapp);
  const cliente = await Cliente.findOne({ whatsapp: numero });
  if (!cliente) return { ok: false, status: 404, erro: "Cliente não encontrado" };

  cliente.sinalObrigatorio = Boolean(obrigatorio);
  cliente.sinalDesde = obrigatorio ? new Date() : null;
  await cliente.save();

  return { ok: true, cliente };
}
