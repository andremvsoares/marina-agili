// Dados de demonstração para ver o painel com cara de uso real.
//
//   node scripts/seed.mjs            -> cria os dados
//   node scripts/seed.mjs --limpar   -> apaga tudo que foi criado
//
// Tudo que é criado usa o prefixo "Seed" / WhatsApp 55199000xxxxx,
// então a limpeza é segura e não toca em dados reais.

import fs from "node:fs";
import { MongoClient } from "mongodb";

// ---------- conexão ----------
function lerEnv() {
  try {
    const texto = fs.readFileSync(new URL("../backend/.env", import.meta.url), "utf8");
    return Object.fromEntries(
      texto
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        })
    );
  } catch {
    return {};
  }
}

const env = lerEnv();
const URI = process.env.MONGODB_URI || env.MONGODB_URI;
if (!URI) {
  console.error("❌ Defina MONGODB_URI (variável de ambiente ou backend/.env)");
  process.exit(1);
}

const LIMPAR = process.argv.includes("--limpar");
const PREFIXO_TEL = "55199000";
const MARCA = "Seed · ";

// gerador determinístico (mesmo resultado em toda execução)
let semente = 42;
const rnd = () => {
  semente = (semente * 1103515245 + 12345) % 2147483648;
  return semente / 2147483648;
};
const entre = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const escolher = (lista) => lista[Math.floor(rnd() * lista.length)];

const NOMES = [
  "Ana Paula Ribeiro", "Beatriz Souza", "Carla Menezes", "Daniela Prado", "Eduarda Lima",
  "Fernanda Alves", "Gabriela Nunes", "Helena Castro", "Isabela Moraes", "Juliana Pires",
  "Karina Duarte", "Larissa Campos", "Mariana Teixeira", "Natália Fonseca", "Olívia Ramos",
  "Patrícia Barros", "Renata Cardoso", "Sofia Andrade", "Tatiane Freitas", "Vanessa Rocha",
  "Wanessa Martins", "Yasmin Correia", "Zélia Nogueira", "Bruna Siqueira", "Camila Farias"
];

const INSUMOS = [
  { nome: "Ácido hialurônico", unidade: "ml", quantidadeEmbalagem: 30, precoEmbalagem: 60 },
  { nome: "Cera facial", unidade: "g", quantidadeEmbalagem: 200, precoEmbalagem: 40 },
  { nome: "Sérum de vitamina C", unidade: "ml", quantidadeEmbalagem: 30, precoEmbalagem: 75 },
  { nome: "Máscara calmante", unidade: "g", quantidadeEmbalagem: 250, precoEmbalagem: 55 },
  { nome: "Henna", unidade: "g", quantidadeEmbalagem: 50, precoEmbalagem: 30 }
];

const PRODUTOS_VENDA = [
  { nome: "Protetor solar facial", marca: "Seed", preco: 129.9, custo: 62 },
  { nome: "Sérum noturno", marca: "Seed", preco: 189.9, custo: 95 },
  { nome: "Kit sobrancelha", marca: "Seed", preco: 89.9, custo: 38 },
  { nome: "Máscara de argila", marca: "Seed", preco: 69.9, custo: 28 }
];

// ---------- helpers de data ----------
const fusoSP = (d) => new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
const hojeSP = () => fusoSP(new Date()).toISOString().slice(0, 10);

const somarDias = (iso, dias) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

const diaSemana = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 20000 });

try {
  await client.connect();
  const db = client.db();

  // ==================== LIMPEZA ====================
  if (LIMPAR) {
    const regexTel = new RegExp("^" + PREFIXO_TEL);

    const ag = await db.collection("agendamentos").deleteMany({ clienteWhatsapp: regexTel });
    const ve = await db.collection("vendas").deleteMany({ clienteWhatsapp: regexTel });
    const cl = await db.collection("clientes").deleteMany({ whatsapp: regexTel });
    const pv = await db.collection("produtovendas").deleteMany({ marca: "Seed" });
    const us = await db.collection("usuarios").deleteMany({ usuario: /^seed\./ });
    const bl = await db.collection("bloqueios").deleteMany({ motivo: /^Seed/ });

    // produtos de insumo
    const insumos = await db
      .collection("produtos")
      .find({ nome: { $regex: "^" + MARCA } })
      .project({ _id: 1 })
      .toArray();
    const ids = insumos.map((i) => String(i._id));

    await db.collection("produtos").deleteMany({ nome: { $regex: "^" + MARCA } });

    // remove da ficha técnica apenas os insumos de demonstração
    const servicos = await db.collection("servicos").find({ "insumos.0": { $exists: true } }).toArray();
    for (const s of servicos) {
      const restantes = (s.insumos || []).filter((i) => !ids.includes(String(i.produtoId)));
      if (restantes.length !== (s.insumos || []).length) {
        await db.collection("servicos").updateOne({ _id: s._id }, { $set: { insumos: restantes } });
      }
    }

    console.log("🧹 Demonstração removida:");
    console.log(`   ${ag.deletedCount} agendamentos | ${ve.deletedCount} vendas | ${cl.deletedCount} clientes`);
    console.log(`   ${pv.deletedCount} produtos de venda | ${insumos.length} insumos | ${us.deletedCount} usuários | ${bl.deletedCount} bloqueios`);

    // despesas de demonstração (marcadas com _demo)
    const colecoes = (await db.listCollections().toArray()).map((c) => c.name);
    for (const nome of colecoes) {
      if (!/despesa|cartao|compra/i.test(nome)) continue;
      const r = await db.collection(nome).deleteMany({ _demo: true });
      if (r.deletedCount) console.log(`   ${r.deletedCount} registro(s) de despesa em ${nome}`);
    }

    process.exit(0);
  }

  // ==================== DADOS DE APOIO ====================
  const config = (await db.collection("configuracoes").findOne({})) || null;
  const horariosPorDia = config?.horariosPorDia || {
    0: [], 1: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
    2: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
    3: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
    4: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
    5: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
    6: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"]
  };

  let servicos = await db.collection("servicos").find({ ativo: true }).toArray();
  if (servicos.length === 0) {
    console.error("❌ Cadastre serviços antes de rodar a demonstração.");
    process.exit(1);
  }

  // cores nos serviços, se ainda estiverem no padrão
  const PALETA = ["#8B5A3C", "#C97B63", "#8FA98F", "#7C9EB2", "#9B8AA6"];
  for (let i = 0; i < servicos.length; i++) {
    if (!servicos[i].cor || servicos[i].cor === "#8B5A3C") {
      await db.collection("servicos").updateOne(
        { _id: servicos[i]._id },
        { $set: { cor: PALETA[i % PALETA.length] } }
      );
    }
  }
  servicos = await db.collection("servicos").find({ ativo: true }).toArray();

  // insumos + ficha técnica
  const insumosCriados = [];
  for (const item of INSUMOS) {
    const existente = await db.collection("produtos").findOne({ nome: MARCA + item.nome });
    if (existente) {
      insumosCriados.push(existente);
      continue;
    }
    const doc = { ...item, nome: MARCA + item.nome, marca: "Seed", ativo: true, criadoEm: new Date() };
    const r = await db.collection("produtos").insertOne(doc);
    insumosCriados.push({ ...doc, _id: r.insertedId });
  }

  for (const s of servicos) {
    if ((s.insumos || []).length === 0) {
      const usados = insumosCriados.slice(0, 2).map((i) => ({
        produtoId: i._id,
        quantidade: entre(1, 3)
      }));
      await db.collection("servicos").updateOne({ _id: s._id }, { $set: { insumos: usados } });
    }
  }

  // produtos de venda
  const produtosVenda = [];
  for (const p of PRODUTOS_VENDA) {
    const existente = await db.collection("produtovendas").findOne({ nome: p.nome, marca: "Seed" });
    if (existente) {
      produtosVenda.push(existente);
      continue;
    }
    const doc = { ...p, ativo: true, criadoEm: new Date() };
    const r = await db.collection("produtovendas").insertOne(doc);
    produtosVenda.push({ ...doc, _id: r.insertedId });
  }

  // ==================== CLIENTES ====================
  const hoje = hojeSP();
  const clientes = [];

  for (let i = 0; i < NOMES.length; i++) {
    const whatsapp = PREFIXO_TEL + String(10000 + i);
    const existente = await db.collection("clientes").findOne({ whatsapp });
    if (existente) {
      clientes.push(existente);
      continue;
    }

    const doc = {
      nome: NOMES[i],
      whatsapp,
      observacoes: "",
      noShows: 0,
      cancelamentosTardios: 0,
      ultimoProblemaEm: null,
      sinalObrigatorio: false,
      sinalDesde: null,
      criadoEm: new Date()
    };

    const r = await db.collection("clientes").insertOne(doc);
    clientes.push({ ...doc, _id: r.insertedId });
  }

  // ==================== AGENDAMENTOS ====================
  const ocupados = new Set();
  const agendamentos = [];
  const lotes = [];

  for (let offset = -90; offset <= 21; offset++) {
    const data = somarDias(hoje, offset);
    const horas = horariosPorDia[String(diaSemana(data))] || [];
    if (horas.length === 0) continue;

    // dias mais movimentados nas últimas semanas
    const quantidade = offset < 0 ? entre(3, 5) : entre(1, 3);
    const usadas = new Set();

    for (let k = 0; k < quantidade; k++) {
      const hora = escolher(horas);
      const slot = `${data}T${hora}`;
      if (usadas.has(hora) || ocupados.has(slot)) continue;
      usadas.add(hora);
      ocupados.add(slot);

      const cliente = escolher(clientes);
      const servico = escolher(servicos);

      let status = "confirmado";
      let extra = {};

      if (offset < 0) {
        const sorte = rnd();
        if (sorte < 0.84) {
          status = "concluido";
          extra = { compareceuEm: new Date(`${data}T${hora}:00-03:00`) };
        } else if (sorte < 0.93) {
          status = "nao_compareceu";
        } else {
          status = "cancelado";
          extra = { canceladoEm: new Date(`${data}T${hora}:00-03:00`) };
        }
      }

      const doc = {
        clienteNome: cliente.nome,
        clienteWhatsapp: cliente.whatsapp,
        servicoId: servico._id,
        servicoNome: servico.nome,
        servicoPreco: servico.preco,
        data,
        hora,
        status,
        sinalPendente: false,
        observacoes: "",
        consentimento: true,
        consentimentoEm: new Date(`${data}T${hora}:00-03:00`),
        canceladoEm: extra.canceladoEm || null,
        compareceuEm: extra.compareceuEm || null,
        remarcadoEm: null,
        criadoEm: new Date(`${somarDias(data, -3)}T10:00:00-03:00`)
      };

      if (status === "cancelado") delete doc.slot;
      else doc.slot = slot;

      agendamentos.push({ doc, cliente, status });
      lotes.push(doc);
    }
  }

  if (lotes.length) await db.collection("agendamentos").insertMany(lotes);

  // ==================== HISTÓRICO DAS CLIENTES ====================
  for (const cliente of clientes) {
    const doCliente = agendamentos.filter((a) => a.cliente.whatsapp === cliente.whatsapp);
    const faltas = doCliente.filter((a) => a.status === "nao_compareceu").length;
    const tardios = doCliente.filter((a) => a.status === "cancelado").length;

    await db.collection("clientes").updateOne(
      { _id: cliente._id },
      {
        $set: {
          noShows: faltas,
          cancelamentosTardios: tardios,
          ultimoProblemaEm: faltas ? new Date(`${hoje}T12:00:00-03:00`) : null,
          sinalObrigatorio: faltas >= 2,
          sinalDesde: faltas >= 2 ? new Date(`${somarDias(hoje, -15)}T12:00:00-03:00`) : null
        }
      }
    );
  }

  // ---------- clientes com sinal obrigatório (demonstra a etiqueta) ----------
  const comFalta = clientes
    .map((c) => ({
      cliente: c,
      faltas: agendamentos.filter(
        (a) => a.cliente.whatsapp === c.whatsapp && a.status === "nao_compareceu"
      ).length
    }))
    .filter((x) => x.faltas > 0)
    .sort((a, b) => b.faltas - a.faltas)
    .slice(0, 3);

  for (const { cliente } of comFalta) {
    await db.collection("clientes").updateOne(
      { _id: cliente._id },
      {
        $set: {
          sinalObrigatorio: true,
          sinalDesde: new Date(`${somarDias(hoje, -12)}T12:00:00-03:00`)
        }
      }
    );
  }

  // ---------- agendamentos futuros marcados como sinal pendente ----------
  const pendentesDepois = [];

  for (const { cliente } of comFalta.slice(0, 2)) {
    let marcado = false;

    for (let offset = 1; offset <= 12 && !marcado; offset++) {
      const data = somarDias(hoje, offset);
      const horas = horariosPorDia[String(diaSemana(data))] || [];

      for (const hora of horas) {
        const slot = `${data}T${hora}`;
        if (ocupados.has(slot)) continue;

        ocupados.add(slot);
        const servico = escolher(servicos);

        pendentesDepois.push({
          clienteNome: cliente.nome,
          clienteWhatsapp: cliente.whatsapp,
          servicoId: servico._id,
          servicoNome: servico.nome,
          servicoPreco: servico.preco,
          data,
          hora,
          slot,
          status: "confirmado",
          sinalPendente: true,
          observacoes: "",
          consentimento: true,
          consentimentoEm: new Date(),
          canceladoEm: null,
          compareceuEm: null,
          remarcadoEm: null,
          criadoEm: new Date()
        });

        marcado = true;
        break;
      }
    }
  }

  if (pendentesDepois.length) await db.collection("agendamentos").insertMany(pendentesDepois);

  // ==================== VENDAS ====================
  const vendas = [];
  for (const cliente of clientes) {
    if (rnd() > 0.45) continue;

    const produto = escolher(produtosVenda);
    const quantidade = entre(1, 2);
    const data = somarDias(hoje, -entre(1, 50));

    vendas.push({
      clienteWhatsapp: cliente.whatsapp,
      clienteNome: cliente.nome,
      itens: [
        {
          produtoId: produto._id,
          nome: produto.nome,
          quantidade,
          precoUnitario: produto.preco
        }
      ],
      total: Math.round(produto.preco * quantidade * 100) / 100,
      data,
      observacoes: "",
      criadoPor: "Demonstração",
      criadoEm: new Date(`${data}T15:00:00-03:00`)
    });
  }

  if (vendas.length) await db.collection("vendas").insertMany(vendas);

  // ==================== EQUIPE E BLOQUEIOS ====================
  const usuarioExistente = await db.collection("usuarios").findOne({ usuario: "seed.funcionaria" });
  if (!usuarioExistente) {
    const { scryptSync, randomBytes } = await import("node:crypto");
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync("demo1234", salt, 64).toString("hex");

    await db.collection("usuarios").insertOne({
      nome: "Funcionária (demo)",
      usuario: "seed.funcionaria",
      senhaHash: `scrypt$${salt}$${hash}`,
      papel: "equipe",
      ativo: true,
      criadoEm: new Date(),
      ultimoAcessoEm: null
    });
  }

  const daquiA3 = somarDias(hoje, 3);
  const daquiA10 = somarDias(hoje, 10);

  for (const [data, motivo] of [
    [daquiA3, "Seed · folga"],
    [daquiA10, "Seed · feriado"]
  ]) {
    const existe = await db.collection("bloqueios").findOne({ data, motivo });
    if (!existe) {
      await db.collection("bloqueios").insertOne({
        data,
        hora: null,
        motivo,
        criadoPor: "Demonstração",
        criadoEm: new Date()
      });
    }
  }

  // ==================== DESPESAS ====================
  const somarMeses = (mes, n) => {
    const [a, m] = mes.split("-").map(Number);
    return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
  };

  const despesasFixas = [
    ["Aluguel do espaço", 1800, "aluguel", 5],
    ["Internet", 120, "internet", 10],
    ["Energia elétrica", 280, "energia", 15],
    ["Software de agendamento", 90, "software", 20],
    ["Ajudante (meio período)", 900, "salario", 5]
  ];

  let fixasCriadas = 0;
  for (const [nome, valor, categoria, dia] of despesasFixas) {
    const existe = await db.collection("despesafixas").findOne({ nome, _demo: true });
    if (existe) continue;

    await db.collection("despesafixas").insertOne({
      nome,
      valor,
      categoria,
      diaVencimento: dia,
      formaPagamento: categoria === "salario" ? "pix" : "boleto",
      inicioEm: somarDias(hoje, -120).slice(0, 7),
      fimEm: null,
      ativo: true,
      observacoes: "",
      criadoEm: new Date(),
      _demo: true
    });
    fixasCriadas++;
  }

  const cartoesDemo = [
    ["Nubank", 5, 12, "#9B8AA6", 5000],
    ["Itaú Click", 20, 28, "#7C9EB2", 8000]
  ];

  const cartoesCriados = [];
  for (const [nome, fechamento, vencimento, cor, limite] of cartoesDemo) {
    let cartao = await db.collection("cartaocreditos").findOne({ nome, _demo: true });
    if (!cartao) {
      const r = await db.collection("cartaocreditos").insertOne({
        nome,
        bandeira: nome === "Nubank" ? "master" : "visa",
        ultimosDigitos: String(entre(1000, 9999)),
        diaFechamento: fechamento,
        diaVencimento: vencimento,
        limite,
        cor,
        ativo: true,
        criadoEm: new Date(),
        _demo: true
      });
      cartao = { _id: r.insertedId, nome, diaFechamento: fechamento };
    }
    cartoesCriados.push(cartao);
  }

  const comprasDemo = [
    ["Material de sobrancelha", 420, 6, "material", 0, 25],
    ["Cadeira de atendimento", 1850, 12, "outro", 1, 60],
    ["Capas e aventais", 260, 3, "material", 0, 18],
    ["Curso de atualização", 690, 6, "marketing", 1, 40],
    ["Produtos de revenda (estoque)", 540, 1, "material", 0, 12]
  ];

  let comprasCriadas = 0;
  for (let i = 0; i < comprasDemo.length; i++) {
    const [descricao, valorTotal, parcelas, categoria, indiceCartao, diasAtras] = comprasDemo[i];
    const existe = await db.collection("compracartaos").findOne({ descricao, _demo: true });
    if (existe) continue;

    const cartao = cartoesCriados[indiceCartao] || cartoesCriados[0];
    const dataCompra = somarDias(hoje, -diasAtras);
    const dia = Number(dataCompra.slice(8, 10));
    const primeiroMes =
      dia > (cartao.diaFechamento || 5)
        ? somarMeses(dataCompra.slice(0, 7), 1)
        : dataCompra.slice(0, 7);

    await db.collection("compracartaos").insertOne({
      cartaoId: cartao._id,
      descricao,
      categoria,
      valorTotal,
      parcelas,
      dataCompra,
      primeiroMes,
      observacoes: "",
      criadoEm: new Date(),
      _demo: true
    });
    comprasCriadas++;
  }

  const avulsasDemo = [
    ["Manutenção da autoclave", 180, "manutencao", -8],
    ["Material de limpeza", 95, "material", -3]
  ];

  let avulsasCriadas = 0;
  for (const [nome, valor, categoria, dias] of avulsasDemo) {
    const data = somarDias(hoje, dias);
    const existe = await db.collection("despesaavulsas").findOne({ nome, data, _demo: true });
    if (existe) continue;

    await db.collection("despesaavulsas").insertOne({
      nome,
      valor,
      categoria,
      data,
      formaPagamento: "pix",
      observacoes: "",
      criadoEm: new Date(),
      _demo: true
    });
    avulsasCriadas++;
  }

  // ==================== RESUMO ====================
  const totalAg = agendamentos.length;
  const porStatus = {
    concluido: agendamentos.filter((a) => a.status === "concluido").length,
    confirmado: agendamentos.filter((a) => a.status === "confirmado").length,
    nao_compareceu: agendamentos.filter((a) => a.status === "nao_compareceu").length,
    cancelado: agendamentos.filter((a) => a.status === "cancelado").length
  };

  console.log("✅ Demonstração criada");
  console.log(`   ${clientes.length} clientes`);
  console.log(`   ${totalAg} agendamentos (${porStatus.concluido} concluídos, ${porStatus.confirmado} futuros, ${porStatus.nao_compareceu} faltas, ${porStatus.cancelado} cancelados)`);
  console.log(`   ${vendas.length} vendas de produto`);
  console.log(`   ${insumosCriados.length} insumos com ficha técnica nos serviços`);
  console.log(`   ${produtosVenda.length} produtos de venda`);
  console.log("   1 usuário de equipe: seed.funcionaria / demo1234");
  console.log("   2 dias bloqueados");
  console.log(`   ${fixasCriadas} despesas fixas | ${cartoesCriados.length} cartões | ${comprasCriadas} compras parceladas | ${avulsasCriadas} avulsas`);
  console.log("\nPara apagar: node scripts/seed.mjs --limpar");
} catch (err) {
  console.error("❌ Erro:", err.message);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
