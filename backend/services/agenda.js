// Regras de agenda: horário de funcionamento, bloqueios e disponibilidade.
// Fonte única para site, bot e painel.

import Configuracao from "../models/Configuracao.js";
import Bloqueio from "../models/Bloqueio.js";
import Agendamento from "../models/Agendamento.js";

export const momentoSP = (data, hora) => new Date(`${data}T${hora}:00-03:00`);

export const hojeSP = () => {
  const sp = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return sp.toISOString().slice(0, 10);
};

export const diaDaSemana = (dataISO) => new Date(`${dataISO}T12:00:00Z`).getUTCDay();

export async function obterConfig() {
  const existente = await Configuracao.findOne();
  if (existente) return existente;
  return Configuracao.create({});
}

// ---------- horários ----------

export async function horariosDoDia(dataISO) {
  const config = await obterConfig();
  const lista = config.horariosPorDia?.[String(diaDaSemana(dataISO))] || [];
  return [...lista].sort();
}

export async function bloqueiosDoDia(dataISO) {
  return Bloqueio.find({ data: dataISO }).lean();
}

/**
 * Lista os horários do dia com a marcação de disponibilidade.
 * Considera: funcionamento, bloqueios, agendamentos e antecedência mínima.
 */
export async function horariosDisponiveis(dataISO) {
  const config = await obterConfig();
  const base = await horariosDoDia(dataISO);
  const bloqueios = await bloqueiosDoDia(dataISO);

  const diaInteiroBloqueado = bloqueios.some((b) => !b.hora);
  const horasBloqueadas = new Set(bloqueios.filter((b) => b.hora).map((b) => b.hora));

  const ocupados = await Agendamento.find({
    data: dataISO,
    status: { $in: ["confirmado", "concluido"] }
  }).select("hora -_id");

  const ocupadosSet = new Set(ocupados.map((a) => a.hora));

  const agora = new Date();
  const limite = new Date(agora.getTime() + (config.antecedenciaMinimaMinutos || 0) * 60000);

  return base.map((hora) => {
    const disponivel =
      !diaInteiroBloqueado &&
      !horasBloqueadas.has(hora) &&
      !ocupadosSet.has(hora) &&
      momentoSP(dataISO, hora) > limite;

    return { hora, disponivel };
  });
}

/**
 * Valida se um horário pode ser agendado. Devolve a mensagem de erro ou null.
 */
export async function validarAgendamento(data, hora) {
  const config = await obterConfig();

  const base = await horariosDoDia(data);
  if (base.length === 0) {
    return "Não há atendimento nesse dia. Escolha outra data.";
  }

  if (!base.includes(hora)) {
    return `Horário fora do atendimento. Nesse dia atendemos em: ${base.join(", ")}.`;
  }

  const bloqueios = await bloqueiosDoDia(data);
  if (bloqueios.some((b) => !b.hora)) {
    return "Esse dia está bloqueado na agenda. Escolha outra data.";
  }
  if (bloqueios.some((b) => b.hora === hora)) {
    return "Esse horário está bloqueado. Escolha outro.";
  }

  const minimo = config.antecedenciaMinimaMinutos || 0;
  const limite = new Date(Date.now() + minimo * 60000);
  if (momentoSP(data, hora) <= limite) {
    return `Agendamentos precisam de pelo menos ${minimo} minutos de antecedência.`;
  }

  return null;
}

// ---------- bloqueios ----------

export async function criarBloqueio({ data, hora, motivo, criadoPor }) {
  return Bloqueio.create({ data, hora: hora || null, motivo: motivo || "", criadoPor: criadoPor || "" });
}

export async function removerBloqueio(id) {
  return Bloqueio.findByIdAndDelete(id);
}

export async function listarBloqueios({ de, ate } = {}) {
  const filtro = {};
  if (de || ate) {
    filtro.data = {};
    if (de) filtro.data.$gte = de;
    if (ate) filtro.data.$lte = ate;
  }
  return Bloqueio.find(filtro).sort({ data: 1, hora: 1 });
}
