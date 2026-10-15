# Automação de documentos societários: regras e retomada

Atualizado em 2026-09-23. Este registro mantém as exceções aprendidas com documentos reais para futuras execuções e revisões.

## Regras implementadas

- Processar empresas sequencialmente com `pnpm ownership:sync -- --all --stop-on-failure`. Após corrigir um caso, retomar com `--start-after CNPJ`; o cursor usa a ordem geral, mesmo se a empresa anterior já saiu da fila por estar completa.
- Pular A M P, Amanda Martins, Ana Carolina/Caroline e Antonio Teles. Águias Mídias exige revisão manual por QSA estranho. Associações vão para revisão manual, pois não têm quadro de capital/quotas de LTDA.
- Aceitar cabeçalhos `Sócio` ou `Sócios`, inclusive `Sócio Nº de` / `Quotas Valor` quebrado em linhas, e sufixo `LTDA` isolado na linha ou página seguinte ao nome da sócia PJ.
- Aceitar percentual com uma casa decimal e espaço antes de `%` (ex.: `100,0 %`), mantendo validação de soma, quotas e capital.
- Ler layout `SÓCIOS | % | Nº de Quotas | Capital Social (R$)` com valores inteiros em reais apenas quando percentuais, quotas, valores e TOTAL fecham.
- Se as linhas somarem R$ 1,00 a menos que o capital impresso, ou se o TOTAL impresso divergir mas as linhas e a cláusula de capital coincidirem, cadastrar somente nomes. Não inferir percentual ou histórico; deixar alerta para revisão.
- Para limitada unipessoal sem quadro válido, aceitar o sócio único apenas quando o documento o nomeia expressamente e contém o CNPJ exato da empresa. Não inferir participação.
- Expandir `FCO` para `FRANCISCO` apenas quando o nome completo correspondente estiver explícito no próprio documento ou no QSA; evitar duplicação.
- Guardar OCR pesado por hash em `.local/ownership-ocr-cache/` (fora do Git) para permitir ajustes sem repetir o reconhecimento de todas as páginas.
- Nunca transformar o cadastro provisório `Sem sócios` com lançamentos financeiros automaticamente; manter revisão financeira manual.

## Casos verificados nesta rodada

- Arbora (`26674814000103`): TOTAL R$ 120.000,00, linhas R$ 119.999,00. Cinco sócios após remoção segura de duplicado `FCO` sem histórico/lançamentos; valores pendentes de revisão.
- Arena Mull Beach (`62143865000164`): cabeçalho singular; dois sócios gravados.
- Associação Amigos do Brasil (`04907927000160`): apenas imagem sem quadro; revisão manual.
- Auto Locação BB (`69369262000124`): Tiago Vasconcelos Fernandes, sócio único explícito; sem percentual por capital contraditório.
- Automotivas Tintas (`11072882000117`): TOTAL R$ 100.000,00 contradiz linhas e capital de R$ 32.000,00; dois nomes preservados, valores em revisão.
- AVA Brunch & Café (`67140817000136`): sócia PJ NOHLIUG HOLDING DE EMPREENDIMENTOS GASTRONOMICOS LTDA cadastrada; administrador descrito como não sócio não foi cadastrado como sócio.
- Brazil Fit (`11116685000152`): `100,0 %` no TOTAL; dois sócios confirmados.
- BRJ Peças e Acessórios (`48902263000112`): layout com percentual primeiro e reais inteiros; três sócios confirmados.

## Estado da execução

A execução sequencial foi interrompida a pedido do usuário após a BRJ. O restante da fila ainda não foi verificado nesta rodada. Para retomar sem repetir os casos anteriores: `pnpm ownership:sync -- --all --start-after 48902263000112 --stop-on-failure`.
