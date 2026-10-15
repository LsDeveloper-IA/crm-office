# Histórico societário do Google Drive

> Active `ownership:sync` uses Drive -> Gemini inline -> deterministic parser -> Prisma. The OCR/Docling workers described in the historical sections below remain separate tools and are not called by `ownership:sync`.

## Extração focada de seções societárias

O worker `corporate_sections_pipeline.py` executa integralmente em memória o fluxo
Drive -> seleção do PDF mais recente -> texto nativo/Docling integral -> extração de
CONSOLIDAÇÃO, CAPITAL SOCIAL, QUADRO SOCIETÁRIO, SÓCIOS/QUOTAS/% e ADMINISTRAÇÃO.
Ele imprime o JSON validado no stdout e simula a persistência no stderr.

```powershell
pnpm ownership:sections -- --company-id ID_INTERNO --folder-id ID_DA_PASTA
```

A versão documental é ordenada pela data explícita no nome (`YYYY-MM-DD`,
`DD-MM-YYYY` ou `YYYYMMDD`); sem essa evidência, usa `modifiedTime`. Empates usam a
versão indicada no nome, `modifiedTime` e o ID do Drive. PDFs mistos mantêm texto
nativo nas páginas legíveis e enviam somente as demais à cascata OCR existente.

Arquitetura da automação, exemplos de código, imagens e atualização por SSE: [ownership-automation.md](../../docs/ownership-automation.md).

O worker Python usa a API oficial Drive v3 (`google-api-python-client`, `google-auth`) e `pypdf`. O importador TypeScript valida o JSON e grava CPF, nascimento e histórico em uma transação Prisma. A página Next.js consulta o banco e entrega o DTO ao React; não há downloads de PDFs durante a renderização.

## Configuração e execução

### Worker OCR Python

O fluxo é totalmente gratuito e local: PyMuPDF tenta primeiro a camada textual; PDFs
escaneados seguem inteiros para Docling + RapidOCR/ONNX Runtime e TableFormer. PaddleOCR
permanece como fallback de contingência quando a conversão integral falha.
em português, com pré-processamento OpenCV e rotações 0/90/270/180. Por fim, o parser
determinístico interpreta capital, tabelas e sócios sem enviar o documento a uma API.

```powershell
py -3.12 -m venv .venv-ocr
.\.venv-ocr\Scripts\python -m pip install -r scripts\ownership\requirements.txt
$env:PYTHON_EXECUTABLE = "$PWD\.venv-ocr\Scripts\python.exe"
```

### Leitor multimodal em memória

`document_processing.py` implementa a nova fronteira
`DriveService -> DocumentReader -> DocumentParser -> DocumentValidator`. O arquivo-fonte
é recebido em `BytesIO` e nunca é persistido. PDF com camada textual legível usa PyMuPDF;
imagem isolada segue para PaddleOCR/OpenCV + normalização local. As imagens
rasterizadas permanecem em memória como arrays numpy; não há arquivos temporários,
API de OCR ou cobrança por página.

O PDF escaneado é submetido ao Docling como um único `DocumentStream` em memória. Apenas
páginas abaixo dos limiares de confiança/classificação são repetidas individualmente
com pré-processamento e rotações. Para ignorar empresas cujo cadastro já está completo,
execute `pnpm ownership:sync -- --all --preview` sem `--force`.

O retorno de `processar_arquivo_drive(file_id, mime_type)` contém exclusivamente
`empresa`, `cnpj`, `documento`, `socios` e `confianca`. Campos ausentes no documento
permanecem `null`; em particular, QSA da Receita não autoriza inferir participação.

Se o OCR local não atingir os limites de texto e confiança, a página termina em
quarentena; nunca é persistida como texto confiável.

Para extrair **e salvar no banco** em uma execução: `pnpm ownership:sync -- CNPJ` (substituir CNPJ pelo da empresa cadastrada). Empresas cujo cadastro societário já contém identidades válidas, históricos consistentes, quadros fechando em 100% e todos os QSA atuais representados são encerradas imediatamente com `SKIP_COMPLETE`, sem abrir Drive nem executar OCR. Use `--force` quando quiser reprocessar uma empresa mesmo assim. Para automatizar as empresas marcadas como caso à parte, use `pnpm ownership:sync -- --all`; o lote informa `CASE_ASIDE_SCAN` com o total selecionado e separa as empresas pendentes, completas, instruídas a pular e aguardando revisão. Cadastros completos não são reprocessados sem `--force`. O comando lista as pastas da raiz do Drive uma vez e tenta localizar uma pasta para cada empresa pendente. Pastas sem documento societário candidato são informadas como `SKIP_NO_OWNERSHIP_DOCUMENT`; documentos candidatos cujo conteúdo não produz histórico importável são informados como `SKIP_NO_IMPORTABLE_OWNERSHIP_HISTORY`. Esses resultados incluem o diagnóstico do extrator e são contabilizados como skips; demais erros são contabilizados como falha com a mensagem associada à empresa. `MISSING` e `AMBIGUOUS` também informam a empresa e a razão/candidatos de pasta. Ao fim, o lote grava `.local/ownership-case-aside-report.json` com `selected`, `succeeded`, `skippedComplete` e `notCompleted` (CNPJ, nome, status e motivo de cada caso não concluído). É possível escolher outro destino com `--report-json caminho.json`. Use `pnpm ownership:sync -- --all --preview` para validar sem persistir e `pnpm ownership:sync -- --all --force` para reprocessar também os cadastros completos. O resumo informa `success`, `failed`, `matched`, `missing`, `ambiguous`, `skippedComplete`, `skippedNoOwnershipDocument`, `skippedNoImportableHistory` e `total`, e uma falha individual não interrompe as demais. A pasta do `.env` pode ser a raiz com pastas de várias empresas: o comando resolve a subpasta pelo nome cadastrado, sem mapeamento por CNPJ. Após `--apply`, o importador relê os sócios depois do COMMIT e só imprime `PERSISTENCE_OK` se os dados esperados realmente estiverem no banco; `IMPORT_RESULT changed=false` significa que nenhuma gravação era necessária.

Diagnóstico sem exibir CPF/nascimento: `npm run ownership:status -- CNPJ` informa se esses campos e o histórico estão preenchidos no banco configurado.

Vínculos de sócios persistidos são conferidos primeiro por CPF/CNPJ; o nome só serve como fallback quando identifica exatamente um cadastro. Se houver duplicatas sem identidade única, a automação preserva os registros e contabiliza `skippedAmbiguousPartnerLink` para revisão manual, em vez de escolher uma linha ou interromper o lote.

Teste de autenticação e acesso: `npm run ownership:check`. Confirma que o ID é uma pasta visível à conta de serviço antes de procurar PDFs. HTTP 403/404 informa o e-mail que precisa receber acesso de Leitor; não é tratado como pasta vazia. A existência de um JSON válido não concede acesso automático aos arquivos do seu Drive. Verifique a extensão real do arquivo no Windows: `google-drive.json.json` não corresponde ao caminho `google-drive.json` configurado no `.env`.

1. Aplicar a migration com `npx prisma migrate deploy` e gerar o client com `npx prisma generate`.
2. Instalar `python -m pip install -r scripts/ownership/requirements.txt`.
3. Configurar `GOOGLE_APPLICATION_CREDENTIALS` com credenciais ADC e habilitar a API Drive. Compartilhar a pasta com a conta de serviço. O escopo é `drive.readonly`.
4. Configurar `GOOGLE_DRIVE_COMPANY_FOLDER_ID` no `.env` da raiz ou passar `--folder-id`. O script carrega esse arquivo automaticamente sem sobrescrever variáveis do ambiente; `--folder-id` tem prioridade. A pasta pode ser a raiz que contém as pastas das empresas; o `sync.ts` localiza a empresa pelo nome e o extrator percorre todos os níveis de subpastas dessa empresa, com paginação por pasta e deduplicação por ID. Atalhos não são seguidos. Uma falha de acesso ou resposta de busca incompleta interrompe a extração.
5. Executar `python scripts/ownership/extract.py --company-cnpj CNPJ --output arquivo.json`.
6. Validar `npx tsx scripts/ownership/import.ts arquivo.json`. Persistir com o mesmo comando acrescido de `--apply`.

Antes da primeira sincronização desta versão, aplique a migration de rastreamento com
`npx prisma migrate deploy`. Cada execução passa a registrar um `correlationId`, estágio,
estado terminal e auditoria técnica em `OwnershipProcessingRun`. Texto OCR, CPF e data de
nascimento não são copiados para essa auditoria.

O OCR usa dois limiares configuráveis: `OWNERSHIP_OCR_RETRY_CONFIDENCE` (padrão 70), que
aciona uma segunda segmentação de página, e `OWNERSHIP_OCR_MIN_CONFIDENCE` (padrão 55),
abaixo do qual o documento é colocado em revisão e não chega ao banco. Ajuste esses valores
somente a partir de um corpus rotulado; aumentar o limite melhora precisão e reduz recall.

Não colocar credenciais ou JSON com dados pessoais no Git nem em `public/`. A pasta é vinculada pelo nome cadastrado da empresa; quando o documento declara CNPJ, o extrator confere se ele corresponde à empresa processada.

## Limite explícito da extração

Exemplo de `.env` no Windows (caminho sem aspas, preservando as barras invertidas):

```dotenv
GOOGLE_DRIVE_COMPANY_FOLDER_ID=1Fe3jDIOoMPRGRw0pzcXKcfnvNK4VitJn
GOOGLE_APPLICATION_CREDENTIALS=C:\Users\Gabriel\Documents\crm-office\credentials\google-drive.json
```

Manter uma única definição de cada variável. Caminhos relativos de credenciais são resolvidos a partir da raiz do projeto. O JSON de credenciais deve existir no caminho configurado.

O extrator seleciona somente o arquivo mais recente cujo nome indique quadro societário ou mudanças societárias. São reconhecidos termos como contrato social, alteração contratual, aditivo, constituição, QSA, quadro societário, sócios, quotas, cessão/transferência de quotas e capital social. A ordem usa `createdTime` do Drive, com ID como desempate. O arquivo escolhido é transformado em texto e o parser consolida as evidências encontradas. Aceita tabelas `Sócios / Quotas / % / Valor(R$)` e também `Sócios / Quotas / Valor(R$)`, calculando o percentual pelo valor quando a coluna `%` não existir; o `TOTAL` também pode vir sem `%`.

Ao determinar a sequência de um ato, o parser reconhece ordinais com aspas tipográficas e prioriza o número do aditivo sobre referências a alterações anteriores no mesmo documento.

No QSA oficial da Receita, uma única entrada qualificada de sócio, junto ao capital social declarado, gera participação de 100%. Os campos são reconhecidos mesmo quando o OCR põe o valor na linha seguinte ao rótulo.

O exemplo foi validado localmente: quarto aditivo, efeitos em 18/09/2023, capital de R$ 20.000,00 e dois sócios com 50% cada. O total de quotas impresso na consolidação diverge da soma das linhas; a extração retorna um aviso em `warnings`, exibido pelo importador, pois percentuais e valores monetários conferem nas duas tabelas. Quadros com percentuais/valores conflitantes são rejeitados.

Aditivos com sócia pessoa jurídica usam `partnerCnpj`, nunca o CPF do representante. Qualificações de sócios retirantes são lidas quando há cláusula explícita de retirada; esses recebem participação atual de 0%. Se as quotas integralmente cedidas fecham no capital do quadro, o percentual anterior documentado permite calcular a redução mesmo na primeira importação. A linha apresenta a posição ao fim do ano selecionado, limitada a hoje: não atribui retrospectivamente esse percentual a anos anteriores sem evidência. Datas de entrada/saída do cadastro Gmail não são sobrescritas pelo importador de participação.

Não é um interpretador universal de contratos. Páginas sem texto passam pelo PaddleOCR local em português; cada página precisa retornar texto. Documentos incompatíveis, CPF inválido, quadros parciais ou soma diferente de 100% interrompem a extração inteira. O importador também exige nascimento válido para pessoa física; dados faltantes exigem revisão. Reconhecimento de texto não substitui conferência visual de documentos ambíguos.

Auditoria do banco inteiro: `pnpm ownership:verify` funciona sem arquivo, testa a conexão e informa quantos cadastros têm histórico e quais campos faltam. Para comparar com o documento, `pnpm ownership:verify caminho-real.json` valida a extração e compara nome, CPF/CNPJ, nascimento e eventos com o banco, sem escrever. O arquivo precisa existir: `.local/extracted.json` nos exemplos não é criado automaticamente. Arquivo ausente, JSON inválido e campos inválidos são reportados separadamente de falhas no banco. Divergências resultam em código de saída 1. O importador relê os registros dentro da transação antes de confirmar. Arquitetura, exemplo JSON e blocos React: [documentação](../../docs/ownership-architecture.md).

Cada documento deve informar o quadro COMPLETO resultante (inclusive contratos consolidados), e não apenas a transferência. A ausência de pessoa em um quadro completo significa 0%. Ordem é um desempate contratual para a mesma data. A data do Drive só é usada quando o documento não contém vigência reconhecível. CPF/CNPJ é a identidade principal: se houver cadastros com o mesmo nome, uma correspondência exata de CPF/CNPJ tem prioridade e o nome não cria ambiguidade.

A extração percorre apenas os metadados da árvore da pasta e baixa um único PDF ou imagem PNG/JPEG/WebP/BMP: o societário mais recente. Arquivos mais antigos e arquivos sem termos societários são ignorados antes do download e do OCR.

O extrator consolidado usa `mode: document-set`: snapshots completos formam o histórico usando a vigência do documento ou, quando ausente, a data `createdTime` do Drive como fallback auditável. O importador valida que todos os sócios compartilham os mesmos snapshots e que cada quadro fecha em 100%. JSONs antigos sem `mode` continuam usando `full-history`, e `latest-aditivo` permanece aceito para compatibilidade. Um advisory lock transacional serializa gravações por empresa. Imports sem mudanças não regravam nem notificam. Alterações confirmadas disparam `NOTIFY`, recebido pela rota autenticada `/api/ownership/events` e pelo React via SSE.

Valores são calculados com centavos inteiros e basis points: capital × percentual, arredondado para centavos. A linha principal mostra a posição até hoje (ou até o fim do ano histórico selecionado); meses mostram o fechamento de cada mês, incluindo aditivos futuros conhecidos. Variações são a diferença líquida do fechamento anterior para o atual, em pontos percentuais; várias alterações no mês são compensadas. O contrato original estabelece a base sem gerar variação. Lucros distribuídos e percentuais manuais existentes são campos independentes do capital societário.

A pesquisa autenticada `/api/search?q=` preserva a restrição existente a ADMIN/MANAGER e busca nome/CPF dos sócios cadastrados, além do nome dos sócios do QSA. CPF mascarado é normalizado. O resultado usa IDs internos na URL, abre empresa e meses, seleciona a página e aplica foco/destaque. Sócios presentes apenas no QSA não têm CPF disponível até seu cadastro/importação.

Para ampliar volume: mover o worker a uma fila com exclusão por empresa, checkpoint por hash e políticas de retry; o worker atual já pagina Drive, limita PDFs a 25 MB e repete falhas transitórias. Indexar buscas textuais por trigramas quando o volume justificar; a rota limita resultados, mas `contains` não utiliza índice B-tree para substring.

Validação local: `npx tsx --test tests/ownership.test.ts` e `python -m unittest discover -s tests -p ownership_parser_test.py`.


## Parser V6: tolerância controlada

- aceita vínculo pelo nome empresarial exato normalizado quando o CNPJ da empresa não está impresso; CNPJs de sócios PJ não invalidam o documento;
- reconhece `TOTAL`, `TOTAIS`, `TOTAL GERAL`, `TOTAL DO CAPITAL SOCIAL`, `SOMA` e `CAPITAL TOTAL`;
- recupera quadro quando o cabeçalho foi perdido pelo PDF/OCR, desde que exista contexto societário + TOTAL validável;
- aceita quadro sem linha TOTAL quando o capital social está explicitamente declarado perto do quadro e as linhas fecham em 100% e no capital;
- tolera arredondamento de até 0,01 ponto percentual por linha, mantendo fechamento global em 100% e no capital;
- corrige percentuais incompatíveis com os valores apenas quando os valores individuais somam exatamente o capital declarado; o resíduo de arredondamento é distribuído para fechar em 100%;
- não usa prosa contratual como cabeçalho de tabela.


## Gemini in the primary sync flow

`ownership:sync` downloads selected Drive documents into `io.BytesIO` and closes the buffer.
When every page has readable native text and deterministic ownership validation succeeds,
Gemini is skipped; otherwise the bytes are sent inline. The flow does not use the Gemini File
API or write PDFs, extraction JSON, or intermediate folders to disk. Python and Node exchange
JSON through stdout/stdin. Set `GEMINI_API_KEY` for documents that need Gemini.
The default inline request limit is 14 MiB per document and can be changed with
`OWNERSHIP_GEMINI_MAX_BYTES`. Install the worker dependencies with
`python -m pip install -r scripts/ownership/requirements.txt`. Document bytes are
transmitted to Google's Gemini service for inference. Requests use `gemini-3.5-flash-lite` and run sequentially, with a 180-second request timeout by default (`OWNERSHIP_GEMINI_TIMEOUT_MS`). Transient 408/5xx, per-minute 429, and network failures retry up to 8 attempts with exponential backoff capped at 60 seconds; each successful request is followed by a 2-second cooldown. A per-day quota 429 stops the whole run immediately, without retrying other PDFs; configure `GEMINI_MAX_ATTEMPTS` and `GEMINI_RETRY_BASE_SECONDS` to adjust. Empty responses are retried once by default (`GEMINI_EMPTY_MAX_ATTEMPTS`); if a multi-page PDF still returns no text, the worker rereads it in two-page chunks and records which strategy succeeded.

When a Gemini transcription fails classification or deterministic table parsing, or a validated ownership history lacks a birth date, the worker may make one guided reread for that document with the validation diagnostic. This lets the model normalize explicitly documented ownership clauses in prose into a table or recover a printed birth date. The prompt preserves the Receita QSA labels and field/value pairing so the parser can recognize the report, while explicitly prohibiting invented shares for QSA records that only list people or redirect participation details to e-CAC. Recovered table data is accepted only after deterministic company-binding, capital, value and 100% validation; missing birth dates are never invented. PDFs, transcriptions and learned examples are not stored between runs; only technical recovery outcomes are audited.


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
