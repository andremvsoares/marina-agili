# Plano de virada — bot no número da Marina (coexistência)

> Para executar **com a Marina presente**. Não é teste: é a entrada em produção.
> Regra #1 do projeto vale integralmente: nada acontece no WhatsApp dela sem aviso e autorização.
> Última atualização: 18/11/2026.

---

## O que já está pronto (não precisa refazer)

| Item | Situação |
|---|---|
| Site no ar | `https://marinagili.app.br` com HTTPS |
| Empresa verificada na Meta | ✅ aprovada em 18/11 |
| App da Meta | "Marina Agili", publicado (Ao vivo), inscrito na WABA |
| Webhook | entregando eventos reais (validado com mensagem do celular) |
| Bot | fluxo completo validado em simulado e recebimento real testado |
| Painel | 10 abas funcionando, com dados de demonstração |
| Backup | rotina diária criptografada no GitHub Actions |

---

## Antes de começar (na tarde do dia)

- [ ] **Backup do WhatsApp Business App**: no celular, Configurações → Conversas → Backup → fazer backup agora (Google Drive)
- [ ] Confirmar que o app está atualizado (versão 2.24.17 ou superior)
- [ ] Marina presente, com o celular na mão e acesso ao código que chegar
- [ ] Janela fora do horário de atendimento (sugestão: após 19h)
- [ ] Conferir que a conta Gupshup está criada e com o cartão cadastrado

---

## Roteiro da janela (estimativa: 30–45 min)

### 1. Pausar antes de tocar (2 min)
- Anotar o estado atual: quantas conversas abertas, se há atendimento em andamento
- Se houver cliente esperando resposta, **adiar** a virada

### 2. Criar o app no Gupshup (10 min)
1. Entrar em `https://www.gupshup.io` com a conta já criada
2. Criar o app do tipo **WhatsApp Business API**
3. Escolher o modo **coexistência** (o app do celular continua funcionando)
4. Conectar ao portfólio empresarial **Marina Agili** (o verificado)
5. Selecionar a conta do WhatsApp dela

### 3. Autorizar no celular (5 min)
- O Gupshup (ou a Meta) mostra um **código/QR**
- Na Marina: WhatsApp Business → Configurações → **Ferramentas para empresas** (ou "Conectar à API") → digitar o código
- ⚠️ Este é o passo irreversível. Confirmar com ela em voz alta antes de prosseguir

### 4. Configurar o webhook do Gupshup (5 min)
- URL: `https://marina-agili.onrender.com/webhook/whatsapp`
- O formato do payload do Gupshup é **diferente** do da Meta — a rota precisará aceitar os dois (ver "Ajuste de código" abaixo)

### 5. Teste assistido (10 min)
1. Do celular de alguém da equipe (não o da Marina), mandar "oi" para o número dela
2. O bot deve responder com o menu
3. Marina responde manualmente por cima → o bot deve **calar** (handoff)
4. Conferir no painel: a conversa aparece? o agendamento entra na agenda?

### 6. Ligar os lembretes (2 min)
- Na Render: `LEMBRETES_ATIVOS=1`
- Criar o **template de utilidade** na Meta (necessário para o lembrete sair fora da janela de 24h)

---

## Ajuste de código necessário antes da virada

O webhook hoje entende **só o formato da Meta** (`entry[].changes[].value.messages`).
O Gupshup envia outro formato. É preciso:

- [ ] Aceitar o payload do Gupshup em `/webhook/whatsapp`
- [ ] Normalizar para o formato interno (mesma função de tratamento)
- [ ] Validar a assinatura/segredo do Gupshup (equivalente ao `X-Hub-Signature-256`)
- [ ] Testar com o simulador antes de apontar o webhook real

**Tempo estimado:** 1 a 2 horas de desenvolvimento + testes. Fazer **antes** da janela.

---

## Se algo der errado (plano de reversão)

| Situação | Ação |
|---|---|
| Código não aceito / erro na autorização | Nada mudou ainda — tentar de novo |
| Autorizou mas o bot não responde | Desligar o webhook (não apagar); o app dela continua funcionando |
| WhatsApp dela parou de funcionar | Desinstalar e reinstalar o app, restaurar o backup do Google Drive; contatar suporte Gupshup |
| Quer voltar atrás | Solicitar ao Gupshup a remoção do número da API e re-registrar no app |

**Regra de ouro:** o app do celular nunca deve ser desinstalado "para testar" durante a janela.

---

## Depois da virada

- [ ] Monitorar as primeiras 24h (mensagens chegando, bot respondendo)
- [ ] Ajustar textos conforme a Marina reclamar/elogiar
- [ ] Configurar o aviso para ela quando o bot não souber responder
- [ ] Limpar os dados de demonstração do banco (`node scripts/seed.mjs --limpar`)

---

## Mensagem para a Marina (enviar antes)

> Oi, Marina! Hoje à noite, se você estiver disponível, a gente ativa o atendimento automático no seu WhatsApp. Leva uns 30 minutos.
>
> O que vai acontecer: você continua usando o WhatsApp Business normalmente, do mesmo jeito. O robô só responde quando você não responder — e quando você entrar na conversa, ele sai da frente na hora.
>
> Vai precisar de: seu celular na mão (para digitar um código), o app atualizado, e um backup das conversas (eu te ajudo a fazer).
>
> Nada de cliente vai ficar sem resposta: se algo der errado, a gente volta atrás na mesma hora e seu WhatsApp continua funcionando.
