# Gmail → alterações societárias (preview e banco)

Node.js + API REST oficial do Gmail (`fetch`). A sincronização atual usa a parte
`text/plain` e Regex (`parse-text.mjs`), sem biblioteca de HTML nesse fluxo, e
produz `.local/gmail-preview.json` por padrao (mock). Com `--apply`, usa o
adaptador Prisma e grava no banco configurado em `DATABASE_URL`.
Nao remove labels nem marca mensagens como lidas.

### Persistencia real

- Migracao: `20260916120000_gmail_qsa_history`.
- `node scripts/gmail/sync.mjs --apply`: importa entradas/saidas no banco.
- Relatorio: `.local/gmail-sync-result.json`, com contadores e mensagens para revisao.
- Saidas encerram vinculos; nao excluem registros financeiros nem o socio historico.
- Empresa deve existir pelo CNPJ. Nomes duplicados exigem conciliacao.
- Cada mensagem e gravada em transacao, com chave unica por caixa e ID Gmail.
- A tabela de distribuicao usa os periodos salvos para meses e legenda de ex-socio.
- Mensagens sem QSA são contadas em `ignoredNonQsa`; não alteram sócios.
- Marcadores de negrito `*texto*` do Gmail são removidos antes do parsing.
- Blocos de contato/imagem encerram a lista de sócios. Mensagens ambíguas ficam em `review`.
- A leitura tem intervalo entre consultas e repetição para limites temporários da API.

## 1. Credenciais OAuth2

1. Crie/selecione um projeto no Google Cloud e habilite **Gmail API**.
2. Configure a tela de consentimento Google Auth Platform e adicione sua conta como
   usuário de teste, se o aplicativo estiver em teste.
3. Crie um cliente OAuth de **Aplicativo da Web**, com o redirecionamento autorizado
   exato `http://127.0.0.1:53682/oauth2/callback`.
4. Adicione ao `.env` local (já ignorado pelo Git):

   ```dotenv
   GMAIL_CLIENT_ID=seu-client-id
   GMAIL_CLIENT_SECRET=seu-client-secret
   ```

5. Na raiz do projeto: `node scripts/gmail/authorize.mjs`. Abra a URL apresentada e
   autorize a conta que contém o marcador **ALTERAÇÃO**. O servidor local valida
   `state`, usa PKCE e salva somente o refresh token em `.local/gmail-token.json`.
   Não publique esse arquivo. Em produção, use um cofre de segredos e callback HTTPS.
6. Escopo: `https://www.googleapis.com/auth/gmail.readonly`. O consentimento usa
   `access_type=offline`. O token permite renovar o acesso sem repetir o login.
   Aplicativos externos em teste podem receber refresh tokens de curta duração;
   verifique as exigências de publicação/verificação para o seu uso.

Referências oficiais:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/gmail/api/guides/list-messages
- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages

## 2. Texto estruturado (fluxo atual)

`parseTextAlteration(text, { messageId, dateHeader, referenceYear })` reconhece:

```text
qui., 27 de ago., 15:49
da empresa SOARES-FERREIRA CONSULTORIA AMBIENTAL LTDA, inscrita no CNPJ sob Nº 30.879.596/0001-02
SAI: GABRIEL DOS SANTOS FERREIRA
FICA SOMENTE:
DIEGO DE OLIVEIRA SOARES - SÓC/ADM/REP
```

- Extrai empresa/CNPJ, normaliza espaços e remove cargos como `SÓC/ADM/REP`.
- `SAI/SAEM` gera `exit`, `ENTRA/ENTRAM` gera `entry`, `FICA SOMENTE` gera `remain`.
- `remain` preserva uma entrada já conhecida. Sem histórico, cria vínculo a partir
  do e-mail. Não presume que os demais sócios saíram: saída exige uma flag explícita.
- O cabeçalho `Date` do Gmail tem prioridade e contém o ano real da mensagem.
  Para texto copiado sem ano, passe `referenceYear: 2026` explicitamente. Não usa
  automaticamente o ano atual. Meses abreviados/completos em português são aceitos.
- O parser rejeita datas impossíveis, nomes conflitantes e seções vazias.
- `sync.mjs` usa `getTextBody`. Mensagens sem `text/plain` vão para revisão.
- Exemplo: Gabriel sai em agosto → `[0,1,2,3,4,5,6,7]`, legenda
  `ex-socio 27/08/2026`; Diego desconhecido → `[7,8,9,10,11]`.

## Parser HTML anterior (disponível separadamente, não usado por sync.mjs)

O padrão Office é reconhecido automaticamente quando os seletores não encontram
elementos: `da empresa NOME, inscrita no CNPJ ...`, seguido de `SAI:` e `ENTRA:`.
Aceita nomes na mesma linha ou nas linhas seguintes, separados por quebras HTML
ou ponto e vírgula. A lista consolidada com cargos (`- SÓC`, `- SOC/ADM` etc.) e
o encerramento (`Segue anexo`, `Cordialmente` etc.) encerram a seção de alterações.
Nomes repetidos são deduplicados; uma entrada e saída do mesmo nome exige revisão.

Nesse padrão, os títulos SAI/ENTRA identificam a ação mesmo sem cor. As cores
reconhecidas no HTML são conferidas: se contradisserem o título, exige revisão.
O HTML continua sendo a fonte de extração, sem fallback para a parte plaintext.

Para outros templates, os seletores devem apontar **somente para o nome da empresa
e para cada nome de sócio**, nunca para a tabela inteira ou a legenda.

```html
<p class="empresa">Empresa Exemplo Ltda.</p>
<p>CNPJ: 11.222.333/0001-81</p>
<p style="color: #00b050"><span class="socio-nome">Ana Silva</span></p>
<font color="red"><span class="socio-nome">Bruno Souza</span></font>
```

O parser aceita cores inline, atributo `font color`, herança de cor de ancestrais,
RGB, hexadecimal curto/longo e nomes `green`, `lime`, `red`. A paleta é explícita;
ajuste `config.colors` para os tons reais. No modo baseado em seletores, CSS em bloco/externo, cores desconhecidas,
nomes com cores conflitantes, múltiplos CNPJs e campos ausentes exigem revisão.
Assinaturas Gmail e citações comuns são removidas. Outras estruturas de encaminhamento
exigem adaptação; o parser não é um detector universal de layouts.

Usa o cabeçalho **Date** (envio), com fuso explícito, convertido para São Paulo.
Não substitui por `internalDate` (normalmente recebimento no Gmail).
O CNPJ numérico é validado inclusive pelos dígitos verificadores; formatos diferentes
exigem adaptar o validador. HTML é apenas analisado; scripts não são executados.

## 3. Executar

```powershell
node scripts/gmail/sync.mjs
node --test tests/gmail-alterations.test.mjs
node --test tests/gmail-text.test.mjs
```

A execução resolve o nome da label para seu ID, pagina todas as mensagens e busca
`format=full`. Percorre MIME e busca `attachmentId` quando o texto estiver separado.
Mensagens sem texto entram no relatório de revisão; não tenta interpretar HTML.
O preview contém dados pessoais: mantenha-o local. Qualquer revisão torna o preview
incompleto e impede tratá-lo como fonte pronta para aplicação automática.

## 4. Regras e adaptação ao CRM real

- Entrada em 15/04/2026: meses `[3,4,5,6,7,8,9,10,11]` (abril–dezembro).
- Saída em 10/08/2026: até agosto inclusive; legenda `ex-socio 10/08/2026`.
- Saída sem cadastro/entrada conhecida: cria histórico com `enteredAt: null`.
- Entrada e saída no mesmo mês: exibe esse mês uma vez.
- Reentrada: mantém os períodos separados e esconde meses entre vínculos.
- Vínculo encerrado antes de 2026: nenhum mês em 2026; histórico permanece disponível.
- O ano padrão é 2026; o cálculo usa limites do ano, não a data de execução.

O banco agora possui `ProfitPartner.qsaPeriods` e `GmailQsaImport`.
O adaptador real guarda eventos com o ID conciliado do socio e reconstroi os
periodos em ordem cronologica, inclusive para mensagens antigas recebidas depois.
O campo `knownBeforeGmail` preserva o historico dos cadastros anteriores quando a
primeira mensagem apenas informa FICA SOMENTE.

A conciliacao atual usa CNPJ + nome normalizado, pois os e-mails nao fornecem CPF.
Homonimos com nomes iguais e mudancas de nome exigem revisao; nao se deve presumir
identidade por similaridade. Um conflito reverte a mensagem inteira e bloqueia
mensagens posteriores da mesma empresa nesta execucao. Mensagens com falha de
parsing ficam no relatorio e nao sao gravadas.

O mock continua disponivel para preview. Nenhum envio de e-mail faz parte do fluxo.
