import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import Servico from "./models/Servico.js";
import Cliente from "./models/Cliente.js";
import Agendamento from "./models/Agendamento.js";
import adminRoutes, { autenticar } from "./routes/admin.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/admin", adminRoutes);

// ==================== CONEXÃO COM MONGODB ====================
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB conectado com sucesso"))
  .catch((err) => {
    console.error("❌ Erro ao conectar no MongoDB:", err.message);
    process.exit(1);
  });

// ==================== HORÁRIOS DISPONÍVEIS ====================
const HORARIOS_FIXOS = [
  "09:00", "10:00", "11:00",
  "14:00", "15:00", "16:00", "17:00", "18:00"
];

// ==================== ROTAS ====================

// Rota de teste
app.get("/", (req, res) => {
  res.json({ ok: true, mensagem: "API Marina Aglli funcionando ✨" });
});

// ---------- SERVIÇOS ----------

// Listar serviços ativos
app.get("/api/servicos", async (req, res) => {
  try {
    const servicos = await Servico.find({ ativo: true }).sort({ nome: 1 });
    res.json(servicos);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Criar serviço (admin)
app.post("/api/servicos", autenticar, async (req, res) => {
  try {
    const { nome, preco, duracao } = req.body;
    if (!nome || preco === undefined) {
      return res.status(400).json({ erro: "Nome e preço são obrigatórios" });
    }
    const servico = await Servico.create({ nome, preco, duracao });
    res.status(201).json(servico);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Editar serviço
app.put("/api/servicos/:id", autenticar, async (req, res) => {
  try {
    const servico = await Servico.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(servico);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Desativar serviço (soft delete)
app.delete("/api/servicos/:id", autenticar, async (req, res) => {
  try {
    await Servico.findByIdAndUpdate(req.params.id, { ativo: false });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- HORÁRIOS ----------

// Listar horários disponíveis numa data
app.get("/api/horarios/:data", async (req, res) => {
  try {
    const { data } = req.params;
    const ocupados = await Agendamento.find({
      data,
      status: { $in: ["confirmado", "concluido"] }
    }).select("hora -_id");

    const ocupadosSet = new Set(ocupados.map((a) => a.hora));
    const disponiveis = HORARIOS_FIXOS.map((h) => ({
      hora: h,
      disponivel: !ocupadosSet.has(h)
    }));

    res.json(disponiveis);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- AGENDAMENTOS ----------

// Criar agendamento
app.post("/api/agendamentos", async (req, res) => {
  try {
    const {
      clienteNome,
      clienteWhatsapp,
      servicoId,
      data,
      hora,
      observacoes
    } = req.body;

    // Validações básicas
    if (!clienteNome || !clienteWhatsapp || !servicoId || !data || !hora) {
      return res.status(400).json({ erro: "Preencha todos os campos obrigatórios" });
    }

    // Buscar serviço
    const servico = await Servico.findById(servicoId);
    if (!servico || !servico.ativo) {
      return res.status(404).json({ erro: "Serviço não encontrado" });
    }

    // Verificar conflito
    const conflito = await Agendamento.findOne({
      data,
      hora,
      status: { $in: ["confirmado", "concluido"] }
    });
    if (conflito) {
      return res.status(409).json({ erro: "Esse horário já foi agendado. Escolha outro." });
    }

    // Criar agendamento
    const agendamento = await Agendamento.create({
      clienteNome,
      clienteWhatsapp,
      servicoId: servico._id,
      servicoNome: servico.nome,
      servicoPreco: servico.preco,
      data,
      hora,
      observacoes
    });

    // Salvar/atualizar cliente
    await Cliente.findOneAndUpdate(
      { whatsapp: clienteWhatsapp },
      { nome: clienteNome },
      { upsert: true, new: true }
    );

    res.status(201).json(agendamento);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Listar agendamentos (com filtros opcionais)
app.get("/api/agendamentos", async (req, res) => {
  try {
    const { data, status, whatsapp } = req.query;
    const filtro = {};
    if (data) filtro.data = data;
    if (status) filtro.status = status;
    if (whatsapp) filtro.clienteWhatsapp = whatsapp;

    const agendamentos = await Agendamento.find(filtro).sort({ data: 1, hora: 1 });
    res.json(agendamentos);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Cancelar agendamento
app.patch("/api/agendamentos/:id/cancelar", autenticar, async (req, res) => {
  try {
    const agendamento = await Agendamento.findByIdAndUpdate(
      req.params.id,
      { status: "cancelado" },
      { new: true }
    );
    if (!agendamento) return res.status(404).json({ erro: "Agendamento não encontrado" });
    res.json(agendamento);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.patch("/api/agendamentos/:id/status", autenticar, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["confirmado", "cancelado", "concluido"].includes(status)) {
      return res.status(400).json({ erro: "Status inválido" });
    }
    const ag = await Agendamento.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    res.json(ag);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.patch("/api/agendamentos/:id/status", autenticar, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["confirmado", "cancelado", "concluido"].includes(status)) {
      return res.status(400).json({ erro: "Status inválido" });
    }
    const ag = await Agendamento.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    res.json(ag);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ==================== INICIAR SERVIDOR ====================
const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});