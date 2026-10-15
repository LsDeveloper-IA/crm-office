# Ownership automation: Drive -> Gemini -> PostgreSQL -> SSE

The scheduled `pnpm ownership:sync -- --all` flow now downloads each selected corporate document into memory and sends its bytes inline to Gemini. The resulting transcription goes through the existing deterministic parser, Zod validation, and Prisma/PostgreSQL persistence. Local OCR and section-extraction scripts remain separate tools; they are not used by this sync path.

Dentro da transação, um advisory lock serializa importações da mesma empresa. A releitura confirma o que foi gravado; uma importação repetida sem alterações não regrava nem notifica. `pg_notify` só é entregue após commit. Uma rota autenticada transforma a notificação em SSE; o React executa `router.refresh()` e reconcilia campos societários/novos sócios sem substituir os valores de lucros editados localmente. Na reconexão, a interface relê o estado completo, pois notificações não são uma fila durável.

## Bloco 1 — Integração Drive

Implementação completa: [extract.py](../scripts/ownership/extract.py), funções `connect_drive`, `iter_pdf_files`, `select_source_document` e `extract`. O nome legado `iter_pdf_files` foi mantido, mas também retorna imagens.

```python
def iter_documents(drive, root_id):
    pending, visited, seen = [root_id], set(), set()
    while pending:
        folder_id = pending.pop()
        if folder_id in visited:
            continue
        visited.add(folder_id)
        token = None
        while True:
            page = drive.files().list(
                q=f"'{folder_id}' in parents and trashed = false and "
                  "(mimeType = 'application/pdf' or mimeType contains 'image/' or "
                  "mimeType = 'application/vnd.google-apps.folder')",
                fields="nextPageToken,incompleteSearch,files(id,name,mimeType,size,createdTime,modifiedTime)",
                pageSize=100, pageToken=token,
                supportsAllDrives=True, includeItemsFromAllDrives=True,
            ).execute(num_retries=3)
            if page.get("incompleteSearch"):
                raise ValueError("Busca incompleta: não selecionar uma versão parcial")
            for item in page.get("files", []):
                if item["mimeType"] == "application/vnd.google-apps.folder":
                    pending.append(item["id"])
                elif item["id"] not in seen:
                    seen.add(item["id"])
                    yield item
            token = page.get("nextPageToken")
            if not token:
                break

# A implementação normaliza acentos e separadores antes de classificar nomes.
# ADITIVO/ALTERAÇÃO CONTRATUAL têm prioridade sobre CONTRATO SOCIAL/QUADRO DE SÓCIOS/QSA.
selected = select_source_document(iter_documents(drive, company_folder_id))
# Somente agora: get_media(fileId=selected["id"]) + MediaIoBaseDownload.
```

Critério explícito: maior `createdTime`, com ID como desempate. Não misturamos data de upload com vigência societária. `modifiedTime` é coletado, mas não define a seleção: renomear um contrato antigo não deve torná-lo o aditivo mais recente. A nomenclatura classifica o documento; não substitui esse critério. Se o escolhido estiver inválido ou em formato não suportado, a empresa falha sem fallback para um arquivo antigo. Atalhos não são seguidos. Uma imagem isolada deve conter o quadro completo; várias fotos de páginas não são tratadas como várias versões completas — devem ser reunidas em PDF antes da importação.

Referência: [paginação e incompleteSearch no Drive v3](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list).

## Bloco 2 — OCR e parse

Implementação: [extract.py](../scripts/ownership/extract.py), [ocr_pipeline.py](../scripts/ownership/ocr_pipeline.py) e [ownership-validation.ts](../lib/ownership-validation.ts).

```python
# apply_ocr escreve bytes em arquivo temporário, chama o worker Node com timeout
# de 300s e remove o arquivo em finally. A resposta contém texto por página.
ocr_pages = apply_ocr(raw_bytes, [1], file_id, mime_type="image/png")
text = ocr_pages["1"]["text"]
document = parse_document(text, file_id, hashlib.sha256(raw_bytes).hexdigest())
if document["companyCnpj"] != expected_cnpj:
    raise ValueError("Documento de outra empresa")
```

```js
// Núcleo do worker de OCR; PDFs são rasterizados antes do reconhecimento.
const worker = await createWorker("por");
try {
  const { data: { text, confidence } } = await worker.recognize(imageBuffer);
  return { text: text.trim(), confidence };
} finally {
  await worker.terminate();
}
```

O parser usa regex para identificar quadros completos, linhas de sócios e qualificações, normalizando espaços quando necessário. Não associa CPF por simples proximidade: cruza a qualificação com o nome da pessoa do quadro. A validação exige CPF com dígitos válidos, nascimento real e não futuro para pessoa física, percentual entre 0 e 100%, soma de 100% e capital positivo. Pessoas jurídicas usam `partnerCnpj`, sem CPF do representante. Datas de vigência, sequência e hash da fonte acompanham cada evento.

Se os percentuais lidos do documento não fecharem em 100%, o parser só os recalcula a partir dos valores individuais quando esses valores somarem exatamente o capital declarado. O arredondamento é distribuído por maiores restos para fechar em 100,00%; valores monetários e quotas não são alterados para forçar consistência. Na releitura Gemini, o diagnóstico pede a mesma condição e proíbe ajustar valores para fazer o quadro fechar.

```json
{
  "mode": "latest-aditivo",
  "companyCnpj": "00000000000100",
  "partners": [{
    "name": "Pessoa Exemplo",
    "cpf": "52998224725",
    "partnerCnpj": null,
    "birthDate": "1980-01-01",
    "ownershipHistory": [{
      "effectiveAt": "2026-03-10",
      "sequence": 4,
      "percentageBps": 10000,
      "capitalCents": "2000000",
      "sourceFileId": "drive-file-id",
      "sourceHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }]
  }]
}
```

Esse JSON ilustra o formato; o hash real é calculado dos bytes. O parser não é universal. Layouts não reconhecidos, campos ausentes, inconsistências e quadros parciais são rejeitados para revisão. Não há fallback para LLM nem envio do conteúdo a outro serviço. `OWNERSHIP_FORCE_OCR=true` permite refazer inclusive páginas com texto nativo suspeito. Os modelos gratuitos do PaddleOCR são baixados e armazenados localmente no primeiro uso.

## Bloco 3 — Banco e sync

Implementação completa: [import.ts](../scripts/ownership/import.ts), [rota SSE](../app/api/ownership/events/route.ts), [stream](../lib/ownership-stream.ts), [hook React](../hooks/useOwnershipUpdates.ts).

```ts
// Trecho: identidade, schema, merge do histórico e releitura estão no importador.
await prisma.$transaction(async tx => {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${companyCnpj}, 0))::text
  `;
  await tx.profitPartner.update({ where: { id: partnerId }, data: validatedData });
  await tx.$queryRaw`SELECT pg_notify('ownership_updated', '')::text`;
}, { maxWait: 10000, timeout: 30000 });
// Rollback descarta também a notificação; nenhum CPF trafega no evento.
```

```ts
// Listener SSE usa conexão dedicada, não o pool transacional do Prisma.
await client.connect();
await client.query("LISTEN ownership_updated");
client.on("notification", ({ channel }) => {
  if (channel === "ownership_updated") {
    controller.enqueue(encoder.encode("event: ownership-updated\ndata: {}\n\n"));
  }
});
// A rota real autentica conta ativa, envia heartbeat, fecha e libera a conexão.
```

```tsx
useEffect(() => {
  const source = new EventSource("/api/ownership/events");
  const refresh = () => router.refresh();
  source.addEventListener("ready", refresh); // recupera eventos perdidos
  source.addEventListener("ownership-updated", refresh);
  return () => source.close();
}, [router]);
```

O hook real agrega eventos em 250 ms. A reconciliação adiciona novos sócios, remove linhas de QSA substituídas pelo cadastro importado e mantém edições locais de lucros. O evento não contém dados pessoais; a atualização usa a consulta autenticada existente. Cada conexão SSE expira em 55 segundos, passa novamente pela autenticação ao reconectar e envia heartbeat a cada 15 segundos. Não configurar buffering no proxy dessa rota.

O banco deste projeto usa Neon com pooling. `LISTEN` exige conexão direta: o resolver usa `DIRECT_DATABASE_URL` ou `DATABASE_URL_UNPOOLED`; quando não informadas, deriva o endpoint direto Neon removendo apenas `-pooler` do hostname de `DATABASE_URL`, preservando credenciais e TLS. Outros provedores com pool transacional precisam informar a URL direta. [Limitações do pooling Neon](https://neon.com/docs/connect/connection-pooling). [Semântica transacional do NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html).

## Configuração e operação

Variáveis da `.env` na raiz, sem valores reais no código:

```dotenv
GOOGLE_APPLICATION_CREDENTIALS=credentials/google-drive.json
GOOGLE_DRIVE_COMPANY_FOLDER_ID=ID_DA_PASTA_RAIZ
# Opcional: mapeamento explícito de empresa para pasta
GOOGLE_DRIVE_COMPANY_FOLDERS={"CNPJ_DA_EMPRESA":"ID_DA_PASTA"}
DATABASE_URL=postgresql://USUARIO:SENHA@HOST/BANCO?sslmode=require
# Necessária para listeners em provedores com pool transacional (Neon é resolvido automaticamente)
DIRECT_DATABASE_URL=postgresql://USUARIO:SENHA@HOST_DIRETO/BANCO?sslmode=require
# Opcional: refazer OCR mesmo em PDFs que já possuem texto
OWNERSHIP_FORCE_OCR=false
# Segunda tentativa de OCR abaixo deste nível de confiança
OWNERSHIP_OCR_RETRY_CONFIDENCE=70
# Nunca persistir extrações OCR abaixo deste nível
OWNERSHIP_OCR_MIN_CONFIDENCE=55
```

```sh
python -m pip install -r scripts/ownership/requirements.txt
pnpm ownership:check
pnpm ownership:sync --all --preview
pnpm ownership:sync --all
pnpm ownership:verify
```

Cada execução individual cria um registro em `OwnershipProcessingRun`, identificado pelo
`correlationId` também emitido nos logs JSON do extrator. Os estados distinguem extração,
validação, persistência, revisão e falha transitória. A auditoria contém hash, MIME type,
tamanho, método e confiança por página, mas não contém o texto reconhecido nem documentos
pessoais. Arquivos vazios, downloads truncados, assinaturas binárias incompatíveis e páginas
abaixo do limiar de confiança são interrompidos antes da transação de domínio.

O primeiro comando de sincronização valida sem gravar. O segundo grava e dispara SSE quando há alterações. Uma falha individual não impede o processamento das demais empresas; falhas no lote resultam em código de saída 1 para o agendador detectar. Arquivos sem correspondência segura de empresa ficam no resumo `missing/ambiguous`. Configure o agendador para não iniciar outro lote enquanto o anterior estiver em execução. Nenhum agendamento do sistema operacional foi instalado por esta alteração.

Para escala: usar fila com jobs por CNPJ, limitar concorrência de downloads/OCR e concentrar um listener PostgreSQL por instância SSE com fan-out aos clientes. A implementação fundamental atual mantém uma conexão direta por stream; deve ser dimensionada ao limite do banco. Se for necessário entregar cada evento histórico, adotar outbox transacional com cursor durável; hoje o requisito é convergir para o estado atual, recuperado por consulta completa na reconexão. O lock protege a gravação, mas não elimina downloads duplicados por múltiplos workers.


## Gemini extraction and zero-footprint handoff

The scheduled `ownership:sync` path sends Drive document bytes inline to Gemini from RAM.
The Gemini File API is not used. The Drive download `BytesIO` is closed after extraction,
and the JSON result travels from Python to Node over stdout/stdin. The sync path creates no
local PDF, JSON, cache, or temporary folder. Set `GEMINI_API_KEY`; the worker uses
`gemini-3.5-flash-lite`. `OWNERSHIP_GEMINI_MAX_BYTES` defaults to 14 MiB per document.
Gemini receives the document content for inference. Requests run sequentially using `gemini-3.5-flash-lite`; transient 408/5xx, per-minute 429, and network failures are retried up to 8 attempts with exponential backoff capped at 60 seconds. Each successful request is followed by a 2-second cooldown. A per-day quota 429 stops the whole run immediately, without retrying other PDFs; configure `GEMINI_MAX_ATTEMPTS` and `GEMINI_RETRY_BASE_SECONDS` to adjust this behavior.

If a Gemini transcription fails classification or deterministic table parsing, or a validated ownership history is missing a birth date, the worker can perform one guided reread with the diagnostic. The model may normalize explicitly stated ownership clauses in prose into a table or recover an explicitly printed birth date. The existing validator must still confirm company binding, complete shares, capital and a 100% total before accepting a snapshot; a QSA list without participation data is not converted to ownership percentages, and absent birth dates are not invented. Empty model responses use the same bounded retries. Source PDFs, transcriptions and learned examples are not persisted between runs; only technical recovery outcomes are audited.


## Configurar a API Gemini no Windows

1. Acesse [Google AI Studio API keys](https://aistudio.google.com/apikey), selecione/crie um projeto e gere uma chave. A documenta??o oficial tamb?m descreve esse fluxo: https://ai.google.dev/gemini-api/docs/api-key.
2. Abra o arquivo `.env` na raiz do projeto e adicione uma ?nica linha: `GEMINI_API_KEY=sua-chave`. Esse arquivo j? ? ignorado pelo Git (`.gitignore`); n?o coloque a chave em c?digo ou em arquivos versionados.
3. O worker usa `gemini-3.5-flash-lite` para chamadas Gemini.
4. O Drive continua usando suas vari?veis pr?prias `GOOGLE_APPLICATION_CREDENTIALS` e `GOOGLE_DRIVE_COMPANY_FOLDER_ID`; a chave Gemini n?o substitui as credenciais do Drive.
5. No PowerShell, confirme o SDK instalado: `& .\.venv-ocr\Scripts\python.exe -c "from google import genai; print('google-genai OK')"`.
6. Fa?a uma execu??o sem persistir dados: `pnpm ownership:sync -- 00000000000000 --preview` (substitua pelo CNPJ real cadastrado).

Para uma sess?o PowerShell sem usar o `.env`, configure temporariamente com `$env:GEMINI_API_KEY = "sua-chave"`. O valor vale apenas para essa janela e os processos iniciados por ela.


The worker first checks selectable PDF text in memory. It skips Gemini only when every PDF page has readable native text, the ownership classifier approves it, and the deterministic parser validates a complete ownership snapshot (or a supported single-owner QSA). Scanned, incomplete, damaged, or unrecognized documents still go through Gemini. This reduces API calls and avoids visual transcription errors for digitally generated PDFs. The API key is therefore needed only when a document requires Gemini.

Gemini prompt improvements require page markers, exact preservation of Brazilian identifiers/numbers, table rows separated by `|`, no inference or cross-document merging, and `[ILEGIVEL]` for uncertain portions. Embedded document instructions are treated as source content, not commands. Output truncation is detected; set `GEMINI_MAX_OUTPUT_TOKENS` (default `16000`) if longer transcriptions are required. Audit events include only the chosen reader and classifier score, not extracted personal data.
