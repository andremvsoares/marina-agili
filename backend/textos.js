// ============================================================
// TODAS as mensagens do bot ficam aqui.
//
// Editar o que o bot fala = editar este arquivo. Nada de lógica,
// nada de regra de negócio — só texto.
//
// Cuidados:
// - *asteriscos* deixam o texto em negrito no WhatsApp
// - emojis funcionam normalmente
// - as funções recebem o que precisam e devolvem a mensagem pronta
// ============================================================

export const TEXTOS = {
  // ---------- menu ----------
  saudacao: (primeiroNome) =>
    `Oi${primeiroNome ? ", " + primeiroNome : ""}! 👋 Aqui é o atendimento da *Marina Aglli Clinic Beauty*.\n\n` +
    `Posso cuidar do seu agendamento agora mesmo. O que você prefere?`,

  botoesMenu: {
    agendar: "Agendar horário",
    servicos: "Ver serviços",
    humano: "Falar com a Marina"
  },

  // ---------- serviços ----------
  escolherServico: "Escolha o serviço que você quer fazer:",
  botaoServicos: "Ver serviços",
  secaoServicos: "Serviços disponíveis",

  listaDeServicos: (linhas) =>
    `Nossos serviços:\n\n${linhas}\n\nQuer agendar algum? 🙂`,

  servicosIndisponiveis:
    "Estamos atualizando a lista de serviços. Fale direto com a Marina, ela te ajuda agora. 💛",

  servicoNaoEncontrado: "Não achei esse serviço. Vamos escolher de novo?",

  // ---------- datas ----------
  escolherDia: "Perfeito! Agora escolha o dia:",
  botaoDatas: "Ver datas",
  secaoDatas: "Próximos dias",

  naoEntendiData: "Não entendi a data 🙈 Pode escrever assim: *25/11* ou *amanhã*.",
  dataPassada: "Essa data já passou. Escolha uma data a partir de hoje.",
  dataMuitoLonge: "Só consigo agendar com até 90 dias de antecedência.",
  domingo: "Domingo não temos atendimento. Escolha outro dia de segunda a sábado.",

  // ---------- horários ----------
  horariosLivres: (dataFormatada) => `Horários livres em *${dataFormatada}*:`,
  botaoHorarios: "Ver horários",
  secaoHorarios: "Horários disponíveis",

  diaCheio: "Esse dia já está cheio 😕 Vamos escolher outro?",
  horarioForaDaGrade: (lista) => `Não temos esse horário. Atendemos em: ${lista}.`,
  horarioOcupado: "Esse horário já está ocupado 😕",

  // ---------- nome ----------
  pedirNome: "Por último, como você se chama?",
  nomeCurto: "Me diz seu nome completo, por favor 🙂",

  // ---------- resumo ----------
  resumo: ({ nome, servicoNome, dataFormatada, hora, preco }) =>
    `Confere pra mim? 👇\n\n` +
    `*Nome:* ${nome}\n` +
    `*Serviço:* ${servicoNome}\n` +
    `*Data:* ${dataFormatada}\n` +
    `*Horário:* ${hora}\n` +
    `*Valor:* R$ ${preco}\n\n` +
    `Se estiver tudo certo, eu já reservo.`,

  botoesConfirmar: {
    sim: "Confirmar",
    nao: "Trocar horário"
  },

  resumoTravado:
    "Só falta um toque: use os botões *Confirmar* ou *Trocar horário* para eu concluir. 🙂",

  // ---------- confirmação ----------
  confirmado: ({ primeiroNome, servicoNome, dataFormatada, hora, preco }) =>
    `Prontinho, *${primeiroNome}*! ✅\n\n` +
    `*${servicoNome}*\n` +
    `📅 ${dataFormatada} às ${hora}\n` +
    `💰 R$ ${preco}\n\n` +
    `Te espero lá na Marina Aglli Clinic Beauty. Se precisar remarcar, é só chamar aqui. 💛`,

  erroAoReservar: "Não consegui reservar esse horário. Vamos tentar de novo?",

  // ---------- saídas ----------
  cancelou: "Sem problema! Se quiser agendar depois, é só mandar *oi* por aqui. 💛",

  chamouHumano:
    "Claro! Já avisei a Marina e ela te responde por aqui. 💛\n\n" +
    "Enquanto isso, se quiser adiantar, é só mandar *oi* que eu volto ao agendamento."
};

export default TEXTOS;
