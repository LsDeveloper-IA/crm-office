# OCR, capital social e pesquisa de sócios

Stack existente: Python/PyMuPDF/Docling/RapidOCR, com PaddleOCR de contingência (PDF, OCR e parser), TypeScript/Zod (validação), Prisma/PostgreSQL (persistência), Next.js/React (consulta e interface).

Fluxo: PDF → texto nativo ou conversão integral Docling → quadro completo normalizado → validação → transação e releitura → DTO calculado no servidor → tabela. Nenhum OCR é executado durante a renderização.

## Estrutura de dados

Exemplo ilustrativo do contrato consolidado para uma API. Centavos são strings para preservar precisão JSON; percentuais usam basis points (100 bps = 1%). No projeto, o Server Component `page.tsx` entrega os campos equivalentes como props (`ownershipValueCents`, `companyCapitalCents`, `ownershipMonths`), sem criar outro endpoint de dados pessoais.

```json
{
  "companyCnpj": "00000000000100",
  "name": "Empresa Exemplo",
  "referenceYear": 2024,
  "capitalCents": "2000000",
  "partnersCapitalCents": "2000000",
  "partners": [
    {
      "id": 101,
      "name": "Pessoa Exemplo A",
      "cpf": "52998224725",
      "birthDate": "1980-01-01",
      "percentageBps": 5500,
      "capitalCents": "1100000",
      "months": [{ "month": 2, "percentageBps": 5500, "deltaBps": 500 }]
    },
    {
      "id": 102,
      "name": "Pessoa Exemplo B",
      "cpf": "11144477735",
      "birthDate": "1985-06-15",
      "percentageBps": 4500,
      "capitalCents": "900000",
      "months": [{ "month": 2, "percentageBps": 4500, "deltaBps": -500 }]
    }
  ]
}
```

Meses são indexados de 0 a 11; `month: 2` significa março. Os identificadores do exemplo são dados de teste. O JSON de entrada do importador contém `companyCnpj`, `mode`, `partners` e, por sócio, `ownershipHistory`: eventos com `effectiveAt`, `sequence`, `percentageBps`, `capitalCents`, `sourceFileId`, `sourceHash` e, opcionalmente, `previousPercentageBps` documentado.

## Bloco 1 — Back-end/OCR

Implementação: `scripts/ownership/extract.py`, `ocr_pipeline.py`, `import.ts`, `verify.ts` e `lib/ownership-validation.ts`.

```ts
const input = ownershipImportSchema.parse(extractedJson);
// CPF: formato e dois dígitos verificadores; nascimento: ISO, real e não futuro.
// Pessoa física exige nascimento. Pessoa jurídica usa CNPJ, sem nascimento.
// Quadros completos: soma de 10.000 bps, capital positivo, identidade única,
// fontes/capital/vigência consistentes e eventos cronológicos.
await prisma.$transaction(async tx => {
  // Após resolver a identidade sem ambiguidades:
  const saved = await tx.profitPartner.update({ where: { id }, data });
  const persisted = await tx.profitPartner.findUnique({ where: { id: saved.id } });
  if (persistenceIssues(data, persisted).length) {
    throw new Error("Falha na verificação da persistência"); // rollback
  }
});
```

O importador também cria sócios e preserva histórico no modo `latest-aditivo`. A validação recusa nascimento ausente em pessoa física em vez de preencher uma data presumida. `ownership:verify` é somente leitura, valida o JSON e compara nome, documento, nascimento e cada evento com o banco. Retorna `ok`, contagens, IDs internos e campos divergentes, sem imprimir CPF/nascimento.

```sh
pnpm exec tsx scripts/ownership/import.ts .local/extracted.json
pnpm exec tsx scripts/ownership/import.ts .local/extracted.json --apply
pnpm ownership:verify .local/extracted.json
```

Verificação estrutural não comprova fidelidade visual: um OCR pode produzir um dado incorreto que passe no checksum. Documentos ambíguos, layouts não suportados ou dados faltantes precisam de revisão da fonte. As correções do fluxo incluem PDFs com texto nativo e a substituição de TODAS as páginas escaneadas. O teste de regressão isola Drive/OCR com mocks; a precisão do PaddleOCR deve ser acompanhada com um corpus real rotulado.

## Bloco 2 — Front-end/Tabela

Escolha: cálculo no servidor (`lib/ownership.ts`) com BigInt, usando o capital vigente no evento. Isso centraliza a regra e evita erros de ponto flutuante; a interface apenas formata as strings em centavos.

```ts
const capitalDoSocio = (
  (BigInt(event.capitalCents) * BigInt(event.percentageBps) + 5000n) / 10000n
).toString();
const capitalDaEmpresa = sumCapital(partners.map(p => p.ownershipValueCents));
```

A soma inclui todos os sócios cadastrados antes do filtro de visibilidade anual. Se algum valor é desconhecido, a soma aparece como “Não apurado”, evitando um total parcial apresentado como completo. Arredondamento por sócio: meio centavo para cima. A soma dos valores arredondados pode diferir por centavos do capital nominal; não há rateio de resíduos automático.

```tsx
// CompanySummaryRow
<TableCell data-label="Capital Social">{formatCapital(capitalDaEmpresa)}</TableCell>
// Linha principal do sócio
<TableCell data-label="Capital Social">{formatCapital(row.ownershipValueCents)}</TableCell>
// Linha do mês da vigência
{row.ownershipDelta != null && row.ownershipDelta !== 0 && (
  <span title="Variação da participação em pontos percentuais"
    className={row.ownershipDelta > 0 ? "text-emerald-700" : "text-red-700"}>
    {row.ownershipDelta > 0 ? "+" : ""}{row.ownershipDelta.toLocaleString("pt-BR")}%
  </span>
)}
```

50% → 55% exibe `+5%` conforme solicitado; significa +5 pontos percentuais, não crescimento relativo de 5%. Usa-se a vigência do aditivo, nunca o mês de upload. Vários aditivos no mês geram a variação líquida. Contrato inicial define base, e alterações posteriores, inclusive no mesmo mês, geram diferença. Sem posição anterior documentada, não se inventa uma variação. Na linha principal, a data de corte é hoje ou o fim do ano selecionado, o que ocorrer primeiro.

## Bloco 3 — Lógica de busca

Implementação: `/api/search`, `HeaderSearchCommand.tsx`, `DistribuicaoTable.tsx` e CSS module. A rota autentica, confere conta ativa e preserva a restrição ADMIN/MANAGER. Nome e CPF são consultados no banco; CPF digitado com máscara é normalizado. Busca tem debounce de 200 ms, AbortController, rejeição de respostas obsoletas e mensagem própria de falha.

```tsx
// Após escolher um resultado, transportar identidade (não CPF) na URL.
const params = new URLSearchParams({ company: item.cnpj, partner: String(item.partnerId) });
params.set("focus", String(Date.now()));
if (item.year) params.set("year", String(item.year));
router.push(`/dashboard/distribuicao-lucros?${params}`);

// Primeiro efeito: quando os dados chegam, limpar filtros, localizar página,
// expandir a empresa e o sócio. Só marcar a solicitação como tratada após encontrá-la.
useEffect(() => {
  if (!targetCompany || !targetKey) return;
  const requestKey = `${targetKey}:${focusRequest}`;
  if (handledTarget.current === requestKey) return;
  const index = [...new Set(summaries.map(row => row.companyCnpj))].indexOf(targetCompany);
  if (index < 0) return;
  handledTarget.current = requestKey;
  setSearch("");
  setStatusFilter("");
  setPage(Math.floor(index / PAGE_SIZE) + 1);
  setExpandedCompanies(prev => ({ ...prev, [targetCompany]: true }));
  setExpandedRows(prev => ({ ...prev, [targetKey]: true }));
}, [targetCompany, targetKey, focusRequest, summaries]);

// Segundo efeito: DOM disponível após expansão/paginação e nova renderização.
useEffect(() => {
  if (!targetKey) return;
  const frame = requestAnimationFrame(() => {
    const element = document.getElementById(`partner-${targetKey}`);
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
    element?.focus({ preventScroll: true });
  });
  return () => cancelAnimationFrame(frame);
}, [targetKey, focusRequest, currentPage, expandedCompanies, expandedRows, summaries]);
```

```tsx
<TableRow id={`partner-${key}`} tabIndex={-1} data-highlighted={key === targetKey || undefined} />
```

```css
.summaryRow[data-highlighted="true"] > td { background: #fef3c7; }
.summaryRow[data-highlighted="true"] { outline: 2px solid #d97706; outline-offset: -2px; }
```

O token `focus` permite repetir a mesma pesquisa; IDs de empresa/sócio evitam confusão entre homônimos. O foco de teclado acompanha o destaque. O carregamento do ano ocorre pela navegação Next.js antes de processar o destino na tabela.
