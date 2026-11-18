# Retomada do projeto — Marina Agili

> **Leia este arquivo primeiro.** Ele existe para qualquer sessão nova (minha ou de outro dev)
> retomar o trabalho sem depender de memória da conversa anterior.
> Última atualização: **17/11/2026, 23h**.

## Como retomar

Basta pedir: *"retoma o projeto marina-agili, lê o RETOMADA.md do repositório"*.
As regras de trabalho estão em `REGRAS.md` (mesma pasta) — em especial a **Regra #1**:
nada que toque no WhatsApp da Marina sem aviso e aprovação prévia.

## Onde está tudo

| | |
|---|---|
| Código | `C:\Users\andre\OneDrive\Área de Trabalho\Nova pasta\marina-agili` |
| Repositório | `github.com/andremvsoares/marina-agili` (público, branch `main`) |
| Site (clientes) | https://marina-agili.vercel.app |
| Painel | https://marina-agili.vercel.app/admin.html |
| API | https://marina-agili.onrender.com (Render free — dorme após 15 min) |
| Banco | MongoDB Atlas M0, banco `test`, usuário `marina_app` |

Credenciais: o `.env` fica em `backend/.env` (fora do git). Login de emergência do painel usa
`ADMIN_USER` / `ADMIN_PASS` dessas variáveis e entra como **dono**.

## Arquitetura

```
Site (Vercel) ─┐
               ├─► API Express (Render) ─► MongoDB Atlas
Painel ────────┤        │
Bot WhatsApp ──┘        └─► Cloud API da Meta (desligado por enquanto)
```

- `backend/services/booking.js` — **regras únicas** de agendamento (site e bot usam a mesma)
- `backend/services/agenda.js` — horário de funcionamento, bloqueios, disponibilidade
- `backend/services/clientes.js` — falta, cancelamento tardio (<3h), sinal obrigatório
- `backend/services/creditos.js` — crédito da cliente (troco)
- `backend/services/custos.js` — custo de material por serviço
- `backend/services/despesas.js` — despesas e previsão mensal
- `backend/textos.js` — **todas as mensagens do bot** (editar aqui, sem mexer em lógica)

## O que já está pronto

**Site da cliente**: agendamento em 4 passos, PWA, política de privacidade, consentimento LGPD,
data de nascimento opcional, link de WhatsApp.

**Painel** (10 abas): Agenda (calendário mensal com vagas por dia), Agendamentos (+ sub-aba
Horários livres), Serviços (com cor), Precificação (insumos + ficha técnica), Produtos (venda),
Clientes (ranking, aniversariantes, pendências, ficha com crédito), Relatórios (resultado/DRE +
gráficos + CSV), Despesas (fixas, cartões parcelados, avulsas, previsão), Horários, Equipe
(papéis dono/equipe), Resumo (recebido por forma de pagamento).

**Bot do WhatsApp**: webhook, sessão por telefone, fluxo completo com botões/listas, handoff
quando a Marina responde pelo app, textos centralizados. **Funciona em modo simulado**; sem
`WHATSAPP_TOKEN` o webhook responde 503.

**Infra**: backup diário criptografado no GitHub Actions (90 dias, com `restore.mjs` testado),
monitor da API a cada 15 min, segredos rotacionados, API fechada por token, rate limit.

## Tentativa de ativar o bot — 18/11/2026 (leia antes de repetir)

O app **Marina Agili** existe na Meta (tipo Empresa, modo desenvolvimento). Configuramos
token, Phone number ID, webhook verificado e assinatura do campo `messages`. **Tudo do nosso
lado funciona** — o que travou foi a Meta:

| Bloqueio | Detalhe |
|---|---|
| **Erro 130497** | "Business account is restricted from messaging users in this country" — a **conta de teste** não pode enviar para o **Brasil**. Cadastrar cartão de crédito **não resolveu** |
| **Modo desenvolvimento** | mensagens reais (de celular para o número de teste) não são entregues ao nosso webhook; só eventos enviados pelo painel chegam |
| **Site para verificação** | a Meta recusa domínio de hospedagem gratuita (`vercel.app`) — exige domínio próprio |

**O que já está provado (não precisa repetir os testes):** webhook recebe e processa, token lê
número e conta (APPROVED), envio é aceito pela API, verificação do webhook responde 200/403
corretamente. O código não é o problema.

**Dados guardados:** Phone Number ID `1586206087900440`, WABA `2112211906125685`, app
`29384874281121876`, número de teste `+1 555 155-3276`. Tokens são temporários (24h) e expiram.

**Conclusão:** conta de teste da Meta **não serve para o Brasil**. O bot só sobe com número
brasileiro real. Não há chip novo disponível → o caminho é o número da Marina (coexistência via
Gupshup), que exige autorização dela.

## Lembrete D-1 (implementado em 18/11)

Código pronto em `backend/services/lembretes.js`, validado com 10 testes:

- atendimento **antes das 14h** → lembrete na **véspera às 18h**
- atendimento **das 14h em diante** → lembrete **no mesmo dia às 8h**

Roda a cada 10 minutos quando o bot está configurado e marca `lembreteEnviadoEm` para não repetir.

**Falta:** a mensagem é iniciada pela empresa, então a Meta só entrega dentro de 24h após a
última mensagem da cliente. Para funcionar sempre, criar o **template de utilidade** na Meta e
definir `WHATSAPP_TEMPLATE_LEMBRETE` na Render. O texto sugerido está em `backend/textos.js`
(`TEXTOS.lembrete`) — serve de base para o corpo do template.

## Pendências (na ordem que faz sentido)

| # | O que falta | Depende de |
|---|---|---|
| 1 | **Comprar `marinagili.com.br`** (~R$ 40/ano, CNPJ do MEI) e apontar na Vercel | André (sem a Marina) |
| 2 | **Verificação da empresa na Meta** (CNPJ do MEI, cartão CNPJ) | Marina autorizar + código no telefone |
| 3 | **Bot com número brasileiro real** (Gupshup coexistence) | autorização da Marina + janela tranquila + backup do app |
| 4 | Lembrete D-1 (template de utilidade na Meta) | bot ativo || 5 | Sinal de 20% com Pix/cartão (Mercado Pago) | conta MP da Marina |
| 6 | Render pago (US$ 7/mês) — hoje dorme e atrasa 1 min | decisão de custo |
| 7 | Política de privacidade citar data de nascimento | edição rápida (André) |

### O que dá para fazer SEM a Marina

- Comprar o domínio e configurar DNS/Vercel
- Lembretes D-1 e textos (rascunho)
- Política de privacidade: incluir data de nascimento
- Bot em modo simulado (`BOT_DRY_RUN=1`) para validar o fluxo inteiro
- Ajustes visuais e de usabilidade no painel


## Dados de demonstração (ATENÇÃO)

Hoje o banco tem **dados fake** para testar o painel: 25 clientes, 284 agendamentos, vendas,
despesas, créditos e bloqueios. Tudo é removível:

```bash
cd marina-agili
node scripts/seed.mjs --limpar   # remove só o que é demo
node scripts/seed.mjs            # recria
```

Sem os dados fake, o painel fica vazio (só os 2 registros reais antigos de setembro).

## Como rodar localmente

```bash
cd marina-agili/backend
npm install
PORT=4147 node server.js     # usa backend/.env
```

Para testar o bot sem número real:

```bash
BOT_DRY_RUN=1 PORT=4127 node server.js
node scripts/simular-conversa.mjs http://127.0.0.1:4127
node scripts/simular-casos.mjs   http://127.0.0.1:4127
```

## Cuidados aprendidos (importante)

1. **Nunca editar arquivos com acento pelo PowerShell** — ele corrompe UTF-8. Usar a ferramenta
   de edição. Já aconteceu 4 vezes e custou retrabalho.
2. **Vercel bloqueia muitas requisições seguidas** (retorna 404 `DEPLOYMENT_NOT_FOUND`).
   Verificar o deploy com **uma** requisição, com folga entre elas.
3. **A configuração de horários** (aba Horários) já foi alterada por teste e quebrou a agenda.
   Se os horários parecerem estranhos, conferir lá primeiro.
4. **O `.rar` original** com `.env` foi neutralizado (segredos rotacionados), mas evitar
   compartilhar arquivos com `.env` dentro.

## Próximo passo sugerido

1. Abrir o painel, revisar com a Marina e limpar os dados fake quando ela validar.
2. Criar a conta Meta e ativar o bot com número de teste (Fase 0 do bot).
3. Só depois: lembrete D-1 e sinal de 20%.
