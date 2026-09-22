// ============================================
// CONFIGURAÇÃO
// ============================================

// ⚠️ TROQUE PELO SEU NÚMERO (55 + DDD + número)
const NUMERO_WHATSAPP = "5511999999999";

// URL do backend
// Local: http://localhost:4000
// Produção (depois): https://sua-api.onrender.com
const API_URL = window.location.hostname === "localhost" || window.location.hostname.startsWith("192.168")
  ? "http://192.168.15.21:4000"
  : "https://marina-agili.onrender.com";

// ============================================
// ESTADO
// ============================================
let servicos = [];
let servicoSelecionado = null;
let dataSelecionada = null;
let horaSelecionada = null;
let agendamentoCriado = null;

// ============================================
// NAVEGAÇÃO ENTRE TELAS
// ============================================
function mostrarTela(id) {
  document.querySelectorAll(".tela").forEach((t) => t.classList.remove("ativa"));
  document.getElementById(id).classList.add("ativa");
  window.scrollTo(0, 0);
}

function irParaAgendamento() {
  mostrarTela("tela-agendamento");
  carregarServicos();
}

function voltarInicial() {
  // Reset
  servicoSelecionado = null;
  dataSelecionada = null;
  horaSelecionada = null;
  agendamentoCriado = null;
  document.getElementById("input-data").value = "";
  document.getElementById("input-nome").value = "";
  document.getElementById("input-whatsapp").value = "";
  document.getElementById("input-obs").value = "";
  document.getElementById("card-data").style.display = "none";
  document.getElementById("card-horarios").style.display = "none";
  document.getElementById("card-dados").style.display = "none";
  document.getElementById("btn-confirmar").style.display = "none";
  mostrarTela("tela-inicial");
}

// ============================================
// CARREGAR SERVIÇOS
// ============================================
async function carregarServicos() {
  const container = document.getElementById("lista-servicos");
  container.innerHTML = '<p class="loading">Carregando serviços...</p>';

  try {
    const resp = await fetch(`${API_URL}/api/servicos`);
    servicos = await resp.json();

    if (servicos.length === 0) {
      container.innerHTML = '<p class="loading">Nenhum serviço disponível.</p>';
      return;
    }

    container.innerHTML = servicos
      .map(
        (s) => `
      <div class="servico-item" onclick="selecionarServico('${s._id}')">
        <span class="nome">${s.nome}</span>
        <span class="preco">R$ ${s.preco}</span>
      </div>
    `
      )
      .join("");
  } catch (err) {
    container.innerHTML = '<p class="loading">Erro ao carregar serviços. Tente novamente.</p>';
    console.error(err);
  }
}

function selecionarServico(id) {
  servicoSelecionado = servicos.find((s) => s._id === id);

  document.querySelectorAll(".servico-item").forEach((el) => el.classList.remove("selecionado"));
  event.currentTarget.classList.add("selecionado");

  // Mostrar próximo passo
  document.getElementById("card-data").style.display = "block";

  // Se já tinha data escolhida, recarrega horários
  if (dataSelecionada) carregarHorarios();
}

// ============================================
// CARREGAR HORÁRIOS
// ============================================
async function carregarHorarios() {
  const data = document.getElementById("input-data").value;
  if (!data) return;

  dataSelecionada = data;
  horaSelecionada = null;

  const container = document.getElementById("lista-horarios");
  container.innerHTML = '<p class="loading">Carregando horários...</p>';
  document.getElementById("card-horarios").style.display = "block";

  try {
    const resp = await fetch(`${API_URL}/api/horarios/${data}`);
    const horarios = await resp.json();

    container.innerHTML = horarios
      .map(
        (h) => `
      <div class="horario-item ${h.disponivel ? "" : "bloqueado"}"
           ${h.disponivel ? `onclick="selecionarHorario('${h.hora}', this)"` : ""}>
        ${h.hora}
      </div>
    `
      )
      .join("");
  } catch (err) {
    container.innerHTML = '<p class="loading">Erro ao carregar horários.</p>';
    console.error(err);
  }
}

function selecionarHorario(hora, el) {
  horaSelecionada = hora;
  document.querySelectorAll(".horario-item").forEach((e) => e.classList.remove("selecionado"));
  el.classList.add("selecionado");

  // Mostrar formulário de dados
  document.getElementById("card-dados").style.display = "block";
  document.getElementById("btn-confirmar").style.display = "block";
}

// ============================================
// CONFIRMAR AGENDAMENTO
// ============================================
async function confirmarAgendamento() {
  const nome = document.getElementById("input-nome").value.trim();
  const whatsapp = document.getElementById("input-whatsapp").value.trim();
  const obs = document.getElementById("input-obs").value.trim();

  // Validações
  if (!servicoSelecionado) return alert("Escolha um serviço");
  if (!dataSelecionada) return alert("Escolha uma data");
  if (!horaSelecionada) return alert("Escolha um horário");
  if (!nome) return alert("Digite seu nome");
  if (!whatsapp || whatsapp.length < 10) return alert("Digite um WhatsApp válido");

  const btn = document.getElementById("btn-confirmar");
  btn.disabled = true;
  btn.textContent = "Enviando...";

  try {
    const resp = await fetch(`${API_URL}/api/agendamentos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteNome: nome,
        clienteWhatsapp: whatsapp,
        servicoId: servicoSelecionado._id,
        data: dataSelecionada,
        hora: horaSelecionada,
        observacoes: obs
      })
    });

    const dados = await resp.json();

    if (!resp.ok) {
      alert(dados.erro || "Erro ao agendar. Tente outro horário.");
      btn.disabled = false;
      btn.textContent = "✅ Confirmar agendamento";
      carregarHorarios(); // Recarrega pra mostrar bloqueios
      return;
    }

    agendamentoCriado = dados;
    mostrarTelaSucesso(dados);
  } catch (err) {
    alert("Erro de conexão. Verifique se o backend está rodando.");
    console.error(err);
    btn.disabled = false;
    btn.textContent = "✅ Confirmar agendamento";
  }
}

// ============================================
// TELA DE SUCESSO
// ============================================
function mostrarTelaSucesso(ag) {
  const dataFormatada = ag.data.split("-").reverse().join("/");

  document.getElementById("resumo-agendamento").innerHTML = `
    <div><strong>Cliente:</strong> ${ag.clienteNome}</div>
    <div><strong>Serviço:</strong> ${ag.servicoNome}</div>
    <div><strong>Data:</strong> ${dataFormatada}</div>
    <div><strong>Horário:</strong> ${ag.hora}</div>
    <div><strong>Valor:</strong> R$ ${ag.servicoPreco}</div>
  `;

  mostrarTela("tela-sucesso");
}

function abrirWhatsAppConfirmacao() {
  if (!agendamentoCriado) return;

  const ag = agendamentoCriado;
  const dataFormatada = ag.data.split("-").reverse().join("/");

  const mensagem = `Olá! Acabei de agendar pelo app ✨

*Nome:* ${ag.clienteNome}
*Serviço:* ${ag.servicoNome}
*Data:* ${dataFormatada}
*Horário:* ${ag.hora}
*Valor:* R$ ${ag.servicoPreco}

Gostaria de confirmar meu agendamento.`;

  const url = `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(mensagem)}`;
  window.open(url, "_blank");
}

// Define data mínima = hoje
const hoje = new Date().toISOString().split("T")[0];
document.getElementById("input-data").setAttribute("min", hoje);


// ============================================
// SERVICE WORKER
// ============================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => console.log("✅ SW registrado"))
      .catch((err) => console.error("❌ SW erro:", err));
  });
}