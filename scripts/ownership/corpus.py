"""Consolidate evidence across company documents without inventing effective dates."""
import re
import unicodedata
from datetime import datetime, date
from decimal import Decimal, ROUND_HALF_UP


def normalized(value):
    # Docling may decode UTF-8 bytes as Windows-1252; repair only suspect pairs so
    # legitimate Portuguese accents elsewhere in the same line remain untouched.
    for _ in range(2):
        def repair_pair(match):
            try:
                return match.group(0).encode("cp1252").decode("utf-8")
            except (UnicodeEncodeError, UnicodeDecodeError):
                return match.group(0)
        repaired = re.sub(r"[\u00c3\u00c2][\u0080-\u00ff\u0192\u2018-\u203a]", repair_pair, value)
        if repaired == value:
            break
        value = repaired
    value = unicodedata.normalize("NFKD", value.replace("Ë™", "Ã‡").replace("Ë†", "Ãƒ"))
    return re.sub(r"\s+", " ", "".join(c for c in value if not unicodedata.combining(c))).upper().strip()


def name_key(value):
    key = re.sub(r"[^A-Z0-9]+", " ", normalized(value).split(" - SOC")[0]).strip()
    # Junta documents often append size/status suffixes that are not part of the legal
    # name stored in the application.  Ignoring only trailing ME/EPP/MEI is conservative.
    return re.sub(r"\s+(?:ME|EPP|MEI)$", "", key).strip()


def document_number(text, label, length):
    # Tenta varios formatos: "LABEL: numero", "LABEL numero", numero em linha separada.
    numbers = set()
    # Formato 1: label seguido de ate 60 chars nao-digitos e depois o numero.
    pattern1 = rf"\b{label}(?:\s*\(?\s*/?\s*MF\s*\)?)?[^\d]{{0,60}}((?:\d[\s./-]*){{{length-1}}}\d)(?!\d)"
    for v in re.findall(pattern1, text, re.I):
        numbers.add(re.sub(r"\D", "", v))
    # Formato 2: numero em linha separada apos o label (label em uma linha, numero na proxima).
    pattern2 = rf"\b{label}\s*[:\-]?\s*\n\s*((?:\d[\s./-]*){{{length-1}}}\d)(?!\d)"
    for v in re.findall(pattern2, text, re.I):
        numbers.add(re.sub(r"\D", "", v))
    # Formato 3: label com separador "/" ou "-" antes do numero na mesma linha.
    pattern3 = rf"\b{label}\s*[/:\-]\s*((?:\d[\s./-]*){{{length-1}}}\d)(?!\d)"
    for v in re.findall(pattern3, text, re.I):
        numbers.add(re.sub(r"\D", "", v))
    return numbers


def company_binding(text, cnpj, company_name, trusted_folder=False):
    """Prove that a document belongs to the current company.

    The company's own CNPJ is strongest.  If it is absent, an exact normalized company
    name inside a corporate act is accepted even when CNPJs of partners appear elsewhere.
    A clearly labelled company/header CNPJ that conflicts with the current company still
    blocks the document.
    """
    lines = text.splitlines()
    expected = name_key(company_name or "")
    numbers = document_number(text, "CNPJ", 14)

    if cnpj in numbers:
        return "cnpj"

    compact = normalized(text)
    early = normalized("\n".join(lines[:100]))
    corporate_markers = bool(re.search(
        r"\b(?:CONTRATO\s+SOCIAL|CONSTITUICAO|ADITIVO|ALTERACAO|CONSOLIDACAO|"
        r"QUADRO\s+SOCIETARIO|CAPITAL\s+SOCIAL|JUNTA\s+COMERCIAL)\b",
        compact,
    ))
    exact_company_name = bool(expected and re.search(
        r"(?<![A-Z0-9])" + re.escape(expected) + r"(?![A-Z0-9])", early
    ))

    # A header such as ``CNPJ: 12...`` near the company title is company-level evidence.
    # Do not treat ordinary partner qualification lines (``..., CNPJ ...``) as headers.
    header_lines = [line for line in lines[:100] if re.match(r"^\s*CNPJ\b", line, re.I)]
    header_cnpjs = document_number("\n".join(header_lines), "CNPJ", 14)
    if header_cnpjs and cnpj not in header_cnpjs:
        if trusted_folder and corporate_markers and exact_company_name:
            return "company-name-cross-branch"
        return None
    if expected and expected in early and header_cnpjs and cnpj not in header_cnpjs:
        return None

    # Same-line ``COMPANY NAME ... CNPJ ...`` is also strong conflicting evidence.
    if expected:
        for line in lines:
            normalized_line = normalized(line)
            if expected not in normalized_line:
                continue
            same_line = document_number(line, "CNPJ", 14)
            if same_line and cnpj not in same_line and not (
                trusted_folder and corporate_markers and exact_company_name
            ):
                return None
    if expected and corporate_markers:
        if re.search(r"(?<![A-Z0-9])" + re.escape(expected) + r"(?![A-Z0-9])", compact):
            return "company-name"

    # Quando a pasta da empresa jÃ¡ foi resolvida com seguranÃ§a pelo nome, documentos
    # histÃ³ricos dentro dela podem nÃ£o repetir CNPJ/razÃ£o social (ex.: requerimentos
    # antigos digitalizados). Aceitamos o contexto da pasta apenas na ausÃªncia de um
    # CNPJ de cabeÃ§alho conflitante, que jÃ¡ foi bloqueado acima.
    if trusted_folder:
        return "trusted-folder"

    return None


def _is_personal_business_name(value):
    key = name_key(value)
    if len(key.split()) < 2:
        return False
    if re.search(r"\b(?:LTDA|LIMITADA|EIRELI|S A|SA|SCP|ASSOCIACAO|FUNDACAO|COOPERATIVA|INSTITUTO|IGREJA|CONDOMINIO|SINDICATO)\b", key):
        return False
    return bool(re.fullmatch(r"[A-Z][A-Z0-9 '&.-]+", key))


def single_owner_qsa_snapshot(source, company_cnpj, company_name, known_people=(), valid_cpf=None):
    """Read an official Receita QSA receipt listing exactly one qualified partner.

    These receipts omit quotas and percentages. A single SÃ³cio entry plus declared
    capital establishes the complete snapshot; identity fields are never guessed.
    """
    text = source.get("text", "")
    if not re.search(r"CONSULTA\s+QUADRO\s+DE\s+SOCIOS\s+E\s+ADMINISTRADORES\s*[-â€“]?\s*QSA", normalized(text)):
        return None
    if company_binding(text, company_cnpj, company_name, trusted_folder=True) is None:
        return None
    cnpj_match = re.search(r"\bCNPJ\s*:\s*([^\r\n]+)", text, re.I)
    if not cnpj_match or re.sub(r"\D", "", cnpj_match.group(1)) != company_cnpj:
        return None
    company_match = re.search(r"NOME\s+EMPRESARIAL\s*:\s*([^\r\n]+)", text, re.I)
    if not company_match or name_key(company_match.group(1)) != name_key(company_name or ""):
        return None
    capital_match = re.search(r"CAPITAL\s+SOCIAL\s*:\s*R\s*\$\s*([\d.]+,\d{2})", text, re.I)
    if not capital_match:
        return None
    try:
        capital_cents = money(capital_match.group(1))
    except (ValueError, ArithmeticError):
        return None
    if capital_cents <= 0:
        return None

    lines = [normalized(line) for line in text.splitlines()]

    def field_value(line, label):
        match = re.match(rf"^\s*{label}\s*:?\s*(.*)$", line)
        return match.group(1).strip() if match else None

    def value_after(index, label):
        value = field_value(lines[index], label)
        if value:
            return value
        for candidate in lines[index + 1:index + 4]:
            if not candidate:
                continue
            if (field_value(candidate, r"NOME\s*/\s*NOME\s+EMPRESARIAL") is not None
                    or field_value(candidate, r"QUALIFICACAO") is not None):
                return None
            return candidate
        return None

    name_fields = [
        index for index, line in enumerate(lines)
        if field_value(line, r"NOME\s*/\s*NOME\s+EMPRESARIAL") is not None
    ]
    entries = []
    for position, name_index in enumerate(name_fields):
        next_name = name_fields[position + 1] if position + 1 < len(name_fields) else len(lines)
        name = value_after(name_index, r"NOME\s*/\s*NOME\s+EMPRESARIAL")
        qualification_index = next(
            (
                index for index in range(name_index + 1, min(next_name, name_index + 6))
                if field_value(lines[index], r"QUALIFICACAO") is not None
            ),
            None,
        )
        qualification = (
            value_after(qualification_index, r"QUALIFICACAO")
            if qualification_index is not None else None
        )
        if name and qualification:
            entries.append((name, qualification))
    no_qsa_notice = bool(re.search(
        r"NAO HA INFORMACAO DE QUADRO DE SOCIOS E ADMINISTRADORES\s*\(?QSA\)?\s+NA BASE DE DADOS DO CNPJ",
        normalized(text),
    ))
    if len(entries) == 1:
        name, qualification_text = entries[0][0].strip(), normalized(entries[0][1])
        if (not name or not re.search(r"\bSOCIO\b", qualification_text)
                or re.search(r"\bEX\s+SOCIO\b", qualification_text)):
            return None
        warning = "QSA oficial lista um unico socio; participacao de 100% atribuida sobre o capital declarado"
    elif not entries and no_qsa_notice and _is_personal_business_name(company_match.group(1)):
        # Receita can omit QSA rows for a person-name business. Only the exact legal
        # name printed in the bound receipt may be used as the sole owner's name.
        name = company_match.group(1).strip()
        warning = "QSA oficial sem quadro; nome empresarial de pessoa fisica associado a 100% do capital declarado"
    else:
        return None

    issue_date = re.search(r"EMITIDO\s+NO\s+DIA\s+(\d{2}/\d{2}/\d{4})", normalized(text))
    try:
        effective_at = (datetime.strptime(issue_date.group(1), "%d/%m/%Y").date().isoformat()
                        if issue_date else drive_created_date(source.get("createdTime")))
    except (ValueError, TypeError):
        return None

    cpf = partner_cnpj = birth_date = None
    for person in known_people or ():
        if name_key(person.get("name", "")) != name_key(name):
            continue
        candidate_cpf = re.sub(r"\D", "", person.get("cpf") or "") or None
        candidate_cnpj = re.sub(r"\D", "", person.get("partnerCnpj") or "") or None
        if bool(candidate_cpf) == bool(candidate_cnpj):
            continue
        if candidate_cpf and (valid_cpf is None or not valid_cpf(candidate_cpf)):
            continue
        cpf, partner_cnpj = candidate_cpf, candidate_cnpj
        birth_date = person.get("birthDate") or None
        break

    event = {"effectiveAt": effective_at, "sequence": 0, "percentageBps": 10000,
             "capitalCents": str(capital_cents), "sourceFileId": source["id"], "sourceHash": source["hash"]}
    return {
        "mode": "qsa-sole-owner", "companyCnpj": company_cnpj,
        "partners": [{"name": name, "cpf": cpf, "partnerCnpj": partner_cnpj,
                      "birthDate": birth_date, "ownershipHistory": [event]}],
        "warnings": [warning],
        "documents": [{"sourceFileId": source["id"], "filename": source.get("name", source["id"]),
                       "status": "snapshot", "issues": [], "mimeType": source.get("mimeType"),
                       "sizeBytes": source.get("sizeBytes"), "sha256": source["hash"],
                       "pageMetrics": source.get("pageMetrics", []), "pageIssues": source.get("pageIssues", []),
                       "classification": source.get("classification")}],
    }

def explicit_date(text):
    """Return the most recent explicit effective date found in the document."""
    compact = normalized(text)
    patterns = [
        r"(?:(?:DATA DE )?INICIO DOS EFEITOS(?: DO REGISTRO)?[^:]{0,160}:|VIGENCIA\s*:|ENTRA EM VIGOR EM)\s*(\d{2}/\s*\d{2}/\s*\d{4})",
        r"(?:PRODUZIRA|PRODUZIRAO) EFEITOS A PARTIR DE\s*(\d{2}/\s*\d{2}/\s*\d{4})",
        r"CERTIFICO\s+(?:O\s+)?REGISTRO.{0,100}?\bEM\s+(\d{2}/\s*\d{2}/\s*\d{4})",
    ]
    values = {
        datetime.strptime(re.sub(r"\s", "", value), "%d/%m/%Y").date().isoformat()
        for pattern in patterns
        for value in re.findall(pattern, compact)
    }
    if not values:
        raise ValueError("vigÃªncia explÃ­cita ausente")
    return max(values)


def drive_created_date(value):
    """Use Drive createdTime as a fallback date when the document has no effective date."""
    if not value:
        raise ValueError("vigÃªncia ausente e arquivo sem createdTime vÃ¡lido no Drive")
    try:
        timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError) as error:
        raise ValueError("vigÃªncia ausente e createdTime invÃ¡lido no Drive") from error
    return timestamp.date().isoformat()


def sequence(text):
    clean = normalized(text)

    def numbers(term):
        return {
            int(value)
            for value in re.findall(
                rf"\b0*(\d+)\s*(?:[º°ª”\"oa]\s*)?(?:\([^)]{{1,80}}\)\s*)?{term}\b",
                clean,
                re.I,
            )
        }

    # The text may mention a lower alteration number while describing a later
    # numbered aditivo. Prefer the aditivo ordinal when it is present.
    aditivos = numbers(r"ADITIVO")
    return max(aditivos or numbers(r"ALTERACAO"), default=0)


def money(value):
    result = Decimal(value.replace(".", "").replace(",", ".")) * 100
    if result != result.to_integral_value():
        raise ValueError("precisÃ£o monetÃ¡ria invÃ¡lida")
    return int(result)


def percentage_bps(value):
    """Parse Brazilian comma or PDF-normalized dot decimal percentages."""
    raw = value.replace(" ", "").replace("%", "")
    if "," in raw:
        decimal_value = Decimal(raw.replace(".", "").replace(",", "."))
    else:
        decimal_value = Decimal(raw)
    result = decimal_value * 100
    if result != result.to_integral_value() or not 0 <= result <= 10000:
        raise ValueError("percentual nÃ£o pÃ´de ser determinado com precisÃ£o de 0,01%")
    return int(result)


def _clean_table_line(value):
    value = value.replace("\xa0", " ").replace("Ë™", "Ã‡").replace("Ë†", "Ãƒ")
    value = value.replace("|", " ").replace("\t", " ")
    # Some embedded PDF fonts split Brazilian thousands separators (`30 .000`).
    # Join only a dot surrounded by numeric groups; ordinary prose is untouched.
    value = re.sub(r"(?<=\d)\s*\.\s*(?=\d{3}(?:\D|$))", ".", value)
    return re.sub(r"\s+", " ", value).strip()


def _looks_like_table_header(lines):
    """Recognize compact column labels, never ordinary contractual prose."""
    cleaned = [_clean_table_line(line) for line in lines if _clean_table_line(line)]
    if not cleaned:
        return False

    normalized_lines = [normalized(line) for line in cleaned]

    def normalize_column_typos(value):
        # Common OCR/digitization variants limited to table labels.
        return re.sub(r"\b(?:QDADE|QDE|QTD)\b", "QUANTIDADE", value)

    def column_families(value):
        value = normalize_column_typos(value)
        return (
            bool(re.search(r"\b(?:QUOTAS?|COTAS?|QUANTIDADE)\b", value)),
            bool(re.search(r"\b(?:VALOR|CAPITAL|INTEGRALIZADO)\b|R\s*\$", value)),
            bool(re.search(r"%|\b(?:PARTICIPACAO|PERCENTUAL|PERC|PCT)\b", value)),
        )

    partner_prefix = re.compile(
        r"^(?:QUADRO\s+SOCIETARIO\s+)?(?:SOCIOS|SOCIAS|QUOTISTAS|SOCIO|SOCIA|QUOTISTA)\b"
        r"|^NOME(?:\s+DO)?\s+(?:SOCIO|SOCIA|QUOTISTA)\b"
        r"|^SOCIO\s+QUOTISTA\b"
    )

    # A header window must START at the header.  Otherwise a scan window beginning in
    # contractual prose could contain the real header several lines later and consume it.
    first = normalized_lines[0]

    # Most Junta PDFs place all labels on one short line.
    if len(first) <= 160 and partner_prefix.search(first):
        quota, amount, percent = column_families(first)
        if sum((quota, amount, percent)) >= 2 and (quota or amount):
            return True

    # OCR/PDF extraction can split each label onto its own short line.  The first line
    # itself must be an ownership/header label; later lines may provide the columns.
    if len(normalized_lines) <= 6 and all(len(value) <= 80 for value in normalized_lines):
        first_is_label = bool(re.fullmatch(
            r"(?:QUADRO\s+SOCIETARIO|SOCIOS|SOCIAS|QUOTISTAS|SOCIO|SOCIA|QUOTISTA|"
            r"NOME(?:\s+DO)?\s+(?:SOCIO|SOCIA|QUOTISTA)|SOCIO\s+QUOTISTA|"
            r"(?:SOCIO|SOCIA|QUOTISTA)\s+N(?:O|Âº)?\s+DE)",
            first,
        ))
        compact = " ".join(normalized_lines)
        quota, amount, percent = column_families(compact)
        if first_is_label and sum((quota, amount, percent)) >= 2 and (quota or amount):
            return True

    return False

def _number_tokens(value):
    # Numeric columns only. Avoid digits attached to letters so names such as "3D" remain names.
    pattern = r"(?<![A-Z0-9])(?:R\s*\$\s*)?\d[\d.]*,\d{1,2}\s*%?|(?<![A-Z0-9])\d[\d.]*\s*%?(?![A-Z])"
    return list(re.finditer(pattern, normalized(value)))


def _parse_total_line(line):
    clean = _clean_table_line(line)
    tokens = _number_tokens(clean)
    if not tokens:
        raise ValueError("total do quadro nÃ£o reconhecido")

    money_candidates = []
    percentage_candidates = []
    integer_candidates = []
    for match in tokens:
        raw = match.group(0).replace(" ", "")
        numeric = raw.replace("R$", "").replace("%", "")
        if re.fullmatch(r"\d[\d.]*,\d{2}", numeric):
            if raw.endswith("%"):
                percentage_candidates.append(numeric)
            else:
                money_candidates.append(numeric)
        elif raw.endswith("%"):
            percentage_candidates.append(numeric)
        else:
            integer_candidates.append(numeric)

    # Some Junta PDFs omit the percent sign only on the TOTAL row:
    # `TOTAL 78.800 R$ 78.800,00 100,00`. In that layout the last decimal is the
    # percentage, while the preceding decimal (explicitly prefixed by R$) is capital.
    if not percentage_candidates and len(money_candidates) >= 2:
        possible_percentage = money_candidates[-1]
        decimal_percentage = Decimal(possible_percentage.replace(".", "").replace(",", "."))
        if Decimal(0) <= decimal_percentage <= Decimal(100):
            percentage_candidates.append(money_candidates.pop())

    if not money_candidates:
        raise ValueError("total do quadro sem valor monetÃ¡rio reconhecÃ­vel")
    capital = money(money_candidates[-1])
    if capital <= 0:
        raise ValueError("capital invÃ¡lido")

    total_percentage = None
    if percentage_candidates:
        total_percentage = percentage_bps(percentage_candidates[-1])
        if total_percentage != 10000:
            raise ValueError("percentual total do quadro diferente de 100%")

    total_quotas = None
    if integer_candidates:
        # Prefer the first non-percentage integer printed after TOTAL as the quota total.
        total_quotas = int(integer_candidates[0].replace(".", ""))

    return capital, total_quotas


def _parse_table_row(value, capital):
    if value.lstrip().startswith("|"):
        cells = [cell.strip() for cell in value.strip().strip("|").split("|")]
        if len(cells) >= 4:
            cell_name = _clean_table_line(cells[0])
            name_words = normalized(cell_name).split()
            if len(name_words) % 2 == 0 and name_words[:len(name_words) // 2] == name_words[len(name_words) // 2:]:
                cell_name = " ".join(name_words[:len(name_words) // 2])
            cell_name = re.sub(r"\s+\d+(?:[.,]\d+)?\s*%\s*$", "", cell_name)
            all_cells = [
                (index, _clean_table_line(cell), _number_tokens(_clean_table_line(cell)))
                for index, cell in enumerate(cells)
            ]
            percent_cell = next((entry for entry in all_cells if "%" in entry[1]), None)
            currency_cells = [entry for entry in all_cells[1:]
                              if re.search(r"R\s*\$", entry[1], re.I)]
            money_cell = currency_cells[-1] if currency_cells else None
            if money_cell is None:
                possible_money = [entry for entry in all_cells[1:]
                                  if re.search(r",\d{1,2}", entry[1])
                                  and (percent_cell is None or entry[0] != percent_cell[0])]
                money_cell = possible_money[-1] if possible_money else None
            quota_cell = None
            for entry in all_cells[1:]:
                if percent_cell and entry[0] == percent_cell[0]:
                    continue
                if money_cell and entry[0] == money_cell[0]:
                    continue
                quota_text = re.sub(r"(?i)(?:quotas?|cotas?)", " ", entry[1])
                quota_tokens_candidate = _number_tokens(quota_text)
                if quota_tokens_candidate:
                    quota_cell = (entry[0], entry[1], quota_tokens_candidate)
                    break
            quota_tokens = quota_cell[2] if quota_cell else []
            percent_tokens = percent_cell[2] if percent_cell else []
            money_tokens = money_cell[2] if money_cell else []
            if cell_name and money_tokens:
                quota = quota_tokens[0].group(0).replace(" ", "") if quota_tokens else ""
                percent = percent_tokens[0].group(0).replace(" ", "") if percent_tokens else ""
                amount = money_tokens[0].group(0).replace(" ", "")
                value = f"{cell_name} {quota} {percent} {amount}"
    clean = _clean_table_line(value)
    normalized_line = normalized(clean)
    tokens = _number_tokens(clean)
    if len(tokens) < 2:
        return None

    money_token = None
    percent_token = None
    for match in tokens:
        raw = match.group(0).replace(" ", "")
        numeric = raw.replace("R$", "").replace("%", "")
        if raw.endswith("%"):
            percent_token = match
        elif re.fullmatch(r"\d[\d.]*,\d{2}", numeric):
            money_token = match

    # Every accepted ownership row must have a monetary value. This keeps the parser
    # conservative even while accepting layout/header variations.
    if money_token is None:
        return None

    amount_raw = money_token.group(0).replace(" ", "").replace("R$", "").replace("%", "")
    amount = money(amount_raw)

    # Candidate numeric fields other than the money amount. A percentage may be printed
    # with or without the '%' symbol; if absent we derive it from value/capital instead.
    other = [m for m in tokens if m.span() != money_token.span()]
    explicit_percent = None
    if percent_token is not None and percent_token.span() != money_token.span():
        raw_percent = percent_token.group(0).replace(" ", "").replace("%", "").replace("R$", "")
        try:
            explicit_percent = percentage_bps(raw_percent)
            other = [m for m in other if m.span() != percent_token.span()]
        except (ValueError, ArithmeticError):
            # A damaged percentage can be reconstructed from the printed money
            # amount and explicitly stated social capital below.
            explicit_percent = None

    # Quotas are normally the remaining integer nearest the monetary/percentage columns.
    quota_token = None
    integer_others = []
    for match in other:
        original = match.group(0).replace(" ", "")
        if "%" in original:
            continue
        raw = original.replace("R$", "")
        if re.fullmatch(r"\d[\d.]*", raw):
            integer_others.append(match)
    if integer_others:
        # In "SÃ³cio | Quotas | Valor | %", the final bare integer is the
        # percentage. The quota count is the integer before the money value.
        before_money = [match for match in integer_others if match.start() < money_token.start()]
        quota_token = before_money[-1] if before_money else integer_others[-1]

    numeric_spans = [money_token.span()]
    if percent_token is not None and percent_token.span() != money_token.span():
        numeric_spans.append(percent_token.span())
    if quota_token is not None:
        numeric_spans.append(quota_token.span())
    first_numeric = min(span[0] for span in numeric_spans)
    name = _clean_table_line(normalized_line[:first_numeric])
    name = re.sub(r"\b(?:CPF|CNPJ)\s*:?.*$", "", name, flags=re.I).strip(" -;:")
    if not name or name.startswith("TOTAL") or not re.search(r"[A-Z]{2}", name):
        return None

    exact = Decimal(amount) * Decimal(10000) / Decimal(capital)
    derived_bps = int(exact.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    # Preserve o percentual impresso quando ele Ã© compatÃ­vel com valor/capital (inclusive
    # arredondamentos normais). Se houver divergÃªncia maior, normalmente causada por OCR,
    # use o percentual matematicamente derivado. A validaÃ§Ã£o final ainda exige 100% e
    # fechamento exato no capital, impedindo que um valor monetÃ¡rio incorreto passe.
    if explicit_percent is not None and abs(exact - Decimal(explicit_percent)) <= Decimal("1.0001"):
        bps = explicit_percent
    else:
        bps = derived_bps
    if not 0 <= bps <= 10000:
        raise ValueError("percentual nÃ£o pÃ´de ser determinado com precisÃ£o de 0,01%")

    quotas = None
    if quota_token is not None:
        quotas = int(quota_token.group(0).replace(" ", "").replace(".", ""))

    return {"name": name, "percentageBps": bps, "amount": amount, "quotas": quotas}


def _is_total_line(value):
    clean = normalized(_clean_table_line(value))
    compact = re.sub(r"[^A-Z]", "", clean[:40])
    return bool(
        re.match(r"^(?:TOTAL|TOTAIS|TOTALGERAL|TOTALDOCAPITAL|SOMA)", compact)
        or re.match(r"^CAPITALTOTAL", compact)
    )


def _capital_near(lines, index, window=60):
    """Find an explicitly stated social-capital amount near a table."""
    block = " ".join(_clean_table_line(line) for line in lines[max(0, index-window):index+5])
    block_n = normalized(block)
    patterns = [
        r"CAPITAL\s+SOCIAL.{0,220}?R\s*\$\s*(\d[\d.]*,\d{2})",
        r"CAPITAL\s+(?:PASSA\s+A\s+SER|E\s+DE).{0,160}?(\d[\d.]*,\d{2})",
    ]
    values = []
    for pattern in patterns:
        values.extend(re.findall(pattern, block_n, re.I))
    return money(values[-1]) if values else None


def _parse_rows_block(body_lines, capital):
    rows = []
    pending = ""
    for line in body_lines:
        clean = _clean_table_line(line)
        if not clean:
            continue

        # Try a self-contained row first. This prevents ordinary prose immediately
        # before a table from being glued onto the first partner name.
        direct = _parse_table_row(line, capital)
        if direct is not None:
            rows.append(direct)
            pending = ""
            continue

        # Support wrapped partner names / numeric columns, but keep the pending prefix
        # short and table-like. Long prose is discarded instead of contaminating rows.
        if not _number_tokens(clean):
            if rows and normalized(clean) in ("LTDA", "LIMITADA", "S A"):
                rows[-1]['name'] += " " + normalized(clean)
                continue
            pending = clean if len(clean) <= 140 else ""
            continue
        if pending:
            combined = _clean_table_line(pending + " " + clean)
            row = _parse_table_row(combined, capital)
            pending = ""
            if row is not None:
                rows.append(row)

    return rows


def _validate_snapshot(capital, total_quotas, rows, allow_near_capital=False):
    if not rows:
        raise ValueError("nenhuma linha de sÃ³cio foi reconhecida")
    if len({name_key(r['name']) for r in rows}) != len(rows):
        raise ValueError("linhas do quadro duplicadas")

    # Percentages derived from monetary values can round to 99.99%/100.01%. Reconcile
    # a one-basis-point remainder only when doing so matches the monetary amounts.
    total_bps = sum(r['percentageBps'] for r in rows)
    diff = 10000 - total_bps
    if diff and abs(diff) <= 1:
        exacts = [Decimal(r['amount']) * Decimal(10000) / Decimal(capital) for r in rows]
        candidates = sorted(
            range(len(rows)),
            key=lambda idx: exacts[idx] - Decimal(rows[idx]['percentageBps']),
            reverse=(diff > 0),
        )
        rows[candidates[0]]['percentageBps'] += diff
        total_bps = sum(r['percentageBps'] for r in rows)

    amount_total = sum(r['amount'] for r in rows)
    if total_bps != 10000 and capital > 0 and amount_total == capital and all(
        row['amount'] >= 0 for row in rows
    ):
        exact_shares = [
            Decimal(row['amount']) * Decimal(10000) / Decimal(capital)
            for row in rows
        ]
        derived_shares = [int(share) for share in exact_shares]
        remainder = 10000 - sum(derived_shares)
        remainder_order = sorted(
            range(len(rows)),
            key=lambda idx: (exact_shares[idx] - derived_shares[idx], -idx),
            reverse=True,
        )
        for idx in remainder_order[:remainder]:
            derived_shares[idx] += 1
        for row, percentage_bps in zip(rows, derived_shares):
            row['percentageBps'] = percentage_bps
        total_bps = sum(derived_shares)

    if total_bps != 10000:
        raise ValueError("quadro nÃ£o fecha em 100%")
    amount_difference = abs(amount_total - capital)
    if amount_difference and not (allow_near_capital and amount_difference <= 100
                                  and Decimal(amount_difference) / Decimal(capital) <= Decimal('0.001')):
        raise ValueError("quadro nÃ£o fecha no capital")

    quotas = [r['quotas'] for r in rows]
    if total_quotas is not None and all(value is not None for value in quotas):
        quota_difference = abs(sum(quotas) - total_quotas)
        if quota_difference and not (allow_near_capital and quota_difference <= 1
                                     and amount_difference <= 100):
            raise ValueError("total de quotas divergente")

    return {"capitalCents": str(capital), "rows": rows}


def expand_abbreviated_partner_names(rows, text, qsa_names=()):
    """Resolve FCO only when the full Francisco name is explicit and unique."""
    searchable = name_key(text)
    hints = [name_key(name) for name in qsa_names or ()]
    for row in rows:
        abbreviated = re.match(r"^FCO\s+(.+)$", name_key(row['name']))
        if not abbreviated:
            continue
        complete = "FRANCISCO " + abbreviated.group(1)
        in_document = bool(re.search(r"(?<![A-Z])" + re.escape(complete) + r"(?![A-Z])", searchable))
        if in_document or complete in hints:
            row['name'] = complete
    return rows


def _fallback_table_from_totals(lines, allow_near_capital=False):
    """Recover a table whose header was lost/altered by PDF extraction or OCR."""
    snapshots = []
    diagnostics = []
    for index, line in enumerate(lines):
        if not _is_total_line(line):
            continue
        try:
            capital, total_quotas = _parse_total_line(line)
        except ValueError as error:
            diagnostics.append(str(error))
            continue

        start = max(0, index - 24)
        context = normalized(" ".join(lines[start:index+1]))
        if not re.search(r"\b(?:SOCIOS|QUOTISTAS|QUOTAS|COTAS|CAPITAL SOCIAL|DISTRIBUID[OA])\b", context):
            continue

        body = []
        cue_seen = False
        for candidate in lines[start:index]:
            clean = _clean_table_line(candidate)
            normalized_candidate = normalized(clean)
            if re.match(r"^(?:CLAUSULA|PARAGRAFO)\b", normalized_candidate):
                body = []
                cue_seen = bool(re.search(
                    r"\b(?:DISTRIBUID[OA](?:.{0,80}FORMA)?|SOCIOS|QUOTISTAS|QUADRO\s+SOCIETARIO)\b",
                    normalized_candidate,
                ))
                continue
            if re.search(
                r"\b(?:DISTRIBUID[OA](?:.{0,80}FORMA)?|SOCIOS|QUOTISTAS|QUADRO\s+SOCIETARIO)\b",
                normalized_candidate,
            ):
                body = []
                cue_seen = True
                # If the cue itself is a header, rows start on the next line.
                continue
            if clean and cue_seen:
                body.append(clean)
        try:
            rows = _parse_rows_block(body, capital)
            snapshots.append(_validate_snapshot(capital, total_quotas, rows, allow_near_capital))
        except ValueError as error:
            diagnostics.append(str(error))
    return snapshots, diagnostics


def recover_inconsistent_total_names(text):
    """Return a names-only table when rows and prose agree but printed TOTAL does not."""
    lines = text.splitlines()
    for index in range(len(lines)):
        if not _looks_like_table_header([lines[index]]):
            continue
        body = []
        total_line = None
        for line in lines[index + 1:index + 25]:
            if _is_total_line(line):
                total_line = line
                break
            body.append(line)
        if not total_line:
            continue
        amounts = []
        for line in body:
            monetary = [match.group(0).replace(" ", "").replace("R$", "")
                        for match in _number_tokens(_clean_table_line(line))
                        if re.fullmatch(r"\d[\d.]*,\d{2}",
                                        match.group(0).replace(" ", "").replace("R$", ""))]
            if monetary:
                amounts.append(money(monetary[-1]))
        capital = sum(amounts)
        if capital <= 0:
            continue
        try:
            reported_capital, _ = _parse_total_line(total_line)
            if reported_capital == capital:
                continue
            rows = _parse_rows_block(body, capital)
            table = _validate_snapshot(capital, None, rows)
            # The signed clause must independently state the row-derived amount.
            prior = normalized(" ".join(lines[max(0, index - 12):index]))
            amount_text = f"{Decimal(capital) / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            if amount_text not in prior or len(rows) < 2:
                continue
            return table
        except ValueError:
            continue
    return None


def read_percent_first_integer_money_table(text):
    """Read 'SÃ“CIOS % NÂº de Quotas Capital Social (R$)' with integer reais."""
    lines = [_clean_table_line(line) for line in text.splitlines()]
    for index, header in enumerate(lines):
        if not re.match(r"^SOCIOS\s+%\s+N[OÂº]?\s+DE\s+QUOTAS\s+CAPITAL\s+SOCIAL\s+\(?R\s*\$\)?", normalized(header)):
            continue
        rows = []
        total = None
        for line in lines[index + 1:index + 16]:
            compact = normalized(line)
            if _is_total_line(line):
                total = compact
                break
            match = re.fullmatch(r"([A-Z][A-Z ]+?)\s+(\d{1,3},\d{2})\s+(\d[\d.]*)\s+(\d[\d.]*)", compact)
            if not match:
                continue
            name, percent, quotas, reais = match.groups()
            rows.append({"name": name, "percentageBps": percentage_bps(percent),
                         "quotas": int(quotas.replace(".", "")),
                         "amount": money(reais + ",00")})
        if len(rows) < 2 or not total:
            continue
        capital = sum(row["amount"] for row in rows)
        total_values = re.findall(r"\d[\d.]*,\d{2}", total)
        if len(total_values) < 2 or not re.match(r"^TOTAL(?: DO CAPITAL)?\s+100(?:,0{1,2})?\s+", total):
            continue
        if money(total_values[-1]) != capital or sum(row["quotas"] for row in rows) * 100 != capital:
            continue
        return _validate_snapshot(capital, None, rows)
    return None


def _join_vertical_table_lines(lines):
    """Flatten PDF tables emitted one cell per line, keeping numeric columns together."""
    result = []
    index = 0
    while index < len(lines):
        header_width = next((width for width in range(2, 7)
                             if index + width + 3 < len(lines)
                             and _looks_like_table_header(lines[index:index + width])
                             and not _number_tokens(lines[index + width])
                             and all(len(_number_tokens(lines[index + width + offset])) == 1
                                     for offset in (1, 2, 3))), None)
        if header_width is None:
            result.append(lines[index])
            index += 1
            continue
        start = index + header_width
        # Only transform the vertical layout; regular rows contain the name and numbers
        # on the same line and must retain their original parsing path.
        result.extend(lines[index:start])
        index = start
        while index < len(lines):
            if _is_total_line(lines[index]):
                cells = []
                cursor = index + 1
                while cursor < len(lines) and len(cells) < 3 and len(_number_tokens(lines[cursor])) == 1:
                    cells.append(lines[cursor].strip())
                    cursor += 1
                if len(cells) == 3:
                    result.append("TOTAL " + " ".join(cells[:2]) + " " + cells[2].rstrip("%") + "%")
                    index = cursor
                else:
                    result.append(lines[index])
                    index += 1
                break
            if index + 3 >= len(lines) or _number_tokens(lines[index]) or not all(
                    len(_number_tokens(lines[index + offset])) == 1 for offset in (1, 2, 3)):
                result.append(lines[index])
                index += 1
                break
            name = lines[index].strip()
            numbers = [lines[index + offset].strip() for offset in (1, 2, 3)]
            result.append(name + " " + " ".join(numbers[:2]) + " " + numbers[2].rstrip("%") + "%")
            index += 4
    return result


def read_prose_ownership_table(text):
    """Read complete partner entries written as prose instead of a table."""
    rows = []
    for segment in re.split(r";|\n\s*\n", text):
        clean = normalized(segment)
        quota_matches = list(re.finditer(
            r"(?<![A-Z0-9])(\d[\d.]*)\s*(?:\([^)]{1,80}\)\s*)?(?:QUOTAS?|COTAS?)\b", clean
        ))
        for quota_match in quota_matches:
            tail = clean[quota_match.end():]
            percentage_match = re.search(
                r"(\d{1,3}(?:[,.]\d{1,2})?)\s*%\s*"
                r"(?:\([^)]{1,80}\)\s*)?(?:POR\s+CENTO\s*)?(?:DO|DE)\s+CAPITAL\s+SOCIAL",
                tail,
            )
            if not percentage_match:
                continue
            before_percentage = tail[:percentage_match.start()]
            money_values = re.findall(r"R\s*\$\s*([\d.]+,\d{2})", before_percentage)
            if not money_values:
                continue
            name_part = clean[:quota_match.start()].rsplit(":", 1)[-1].strip(" -â€¢,;:")
            name_part = re.sub(
                r"^(?:(?:E|O|A)\s+)?(?:SOCIO|SOCIA)(?:\s+(?:COTISTA|ADMINISTRADOR[AO]))?\s+",
                "", name_part,
            ).strip(" -â€¢,;:")
            tokens = name_part.split()
            if not 2 <= len(tokens) <= 9 or not re.fullmatch(r"[A-Z][A-Z '&.-]+", name_part):
                continue
            try:
                quota_count = int(quota_match.group(1).replace(".", ""))
                amount = money(money_values[-1])
                bps = percentage_bps(percentage_match.group(1))
            except (ValueError, ArithmeticError):
                continue
            rows.append({"name": name_part, "percentageBps": bps,
                         "amount": amount, "quotas": quota_count})

    unique = {}
    for row in rows:
        key = name_key(row["name"])
        if key in unique and unique[key] != row:
            return None
        unique[key] = row
    rows = list(unique.values())
    if len(rows) < 2 or sum(row["percentageBps"] for row in rows) != 10000:
        return None
    capital = sum(row["amount"] for row in rows)
    if capital <= 0 or any(
        abs(Decimal(row["amount"]) * Decimal(10000) / Decimal(capital)
            - Decimal(row["percentageBps"])) > Decimal("1.0001")
        for row in rows
    ):
        return None
    try:
        return _validate_snapshot(capital, None, rows)
    except ValueError:
        return None


def _restore_blank_table_partner_names(text):
    """Restore a blank OCR table cell only from a complete matching party roster."""
    lines = text.splitlines()
    header_index = next((index for index, line in enumerate(lines)
                         if _looks_like_table_header([line]) and "|" in line), None)
    if header_index is None:
        return text
    header_cells = [cell.strip() for cell in lines[header_index].strip().strip("|").split("|")]
    name_column = next((index for index, cell in enumerate(header_cells)
                        if re.search(r"SOCIO|QUOTISTA|NOME", normalized(cell))), None)
    if name_column is None:
        return text

    roster_text = "\n".join(lines[:header_index]).upper()
    roster = []
    for match in re.finditer(r"([A-Z\u00c0-\u00ff][A-Z\u00c0-\u00ff .'-]{4,}),\s*BRASILEIR[OA]\b", roster_text):
        name = re.sub(r"\s+", " ", match.group(1)).strip(" .-")
        key = name_key(name)
        if 2 <= len(key.split()) <= 8 and key not in {name_key(item) for item in roster}:
            roster.append(name)
    if len(roster) < 2:
        return text

    table_rows, blank_rows = [], []
    for index in range(header_index + 1, min(len(lines), header_index + 30)):
        line = lines[index]
        if _is_total_line(line):
            break
        if "|" not in line:
            if table_rows:
                break
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if name_column >= len(cells) or not any(re.search(r"\d", cell) for cell in cells):
            continue
        table_rows.append((index, cells))
        if not cells[name_column] or not re.search(r"[A-Z\u00c0-\u00ff]{2}", cells[name_column], re.I):
            blank_rows.append(index)

    if not blank_rows or len(table_rows) != len(roster):
        return text
    for row_index, cells in table_rows:
        value = cells[name_column]
        if not value:
            continue
        matches = [name for name in roster if name_key(name).startswith(name_key(value))]
        if len(matches) == 1:
            cells[name_column] = matches[0]
            lines[row_index] = "|" + "|".join(cells) + "|"
    present = [cells[name_column] for _, cells in table_rows if cells[name_column]]
    missing = [name for name in roster if not any(
        name_key(name).startswith(name_key(value)) or name_key(value).startswith(name_key(name))
        for value in present if len(name_key(value).split()) >= 2
    )]
    if len(missing) != len(blank_rows):
        return text

    for row_index, name in zip(blank_rows, missing):
        cells = [cell.strip() for cell in lines[row_index].strip().strip("|").split("|")]
        cells[name_column] = f" {name} "
        lines[row_index] = "|" + "|".join(cells) + "|"
    return "\n".join(lines)


def read_tables(text, allow_near_capital=False):
    """Read ownership tables from common Junta/contract layouts.

    Supports headers split by PDF extraction/OCR, tables without a % column, alternate
    TOTAL labels, one-basis-point rounding, and a conservative fallback that rebuilds a
    table from a valid TOTAL row when the header text itself was lost.
    """
    text = _restore_blank_table_partner_names(text)
    text = text.replace("\xa0", " ").replace("Ë™", "Ã‡").replace("Ë†", "Ãƒ")
    lines = _join_vertical_table_lines(text.splitlines())
    snapshots = []
    diagnostics = []

    i = 0
    while i < len(lines):
        header_end = None
        for width in range(1, 7):
            if i + width > len(lines):
                break
            if _looks_like_table_header(lines[i:i + width]):
                header_end = i + width
                break
        if header_end is None:
            i += 1
            continue

        body_lines = []
        total_line = None
        j = header_end
        while j < len(lines) and j < header_end + 90:
            clean = _clean_table_line(lines[j])
            if _is_total_line(clean):
                # OCR/PDF pode separar "TOTAL" dos nÃºmeros em uma ou duas linhas.
                # Tenta juntar atÃ© trÃªs linhas antes de desistir.
                candidates = [clean]
                combined = clean
                for extra in range(1, 4):
                    if j + extra >= len(lines):
                        break
                    combined = _clean_table_line(combined + " " + lines[j + extra])
                    candidates.append(combined)
                total_line = next((candidate for candidate in candidates
                                   if _number_tokens(candidate)), clean)
                break
            if body_lines and re.match(r"^(?:CLAUSULA|CLÃUSULA|PARAGRAFO|PARÃGRAFO)\b", clean, re.I):
                break
            if clean:
                body_lines.append(lines[j])
            j += 1

        try:
            if total_line is not None:
                capital, total_quotas = _parse_total_line(total_line)
            else:
                capital = _capital_near(lines, i)
                total_quotas = None
                if capital is None:
                    raise ValueError("cabeÃ§alho de quadro encontrado, mas TOTAL/capital social nÃ£o foi localizado")

            rows = _parse_rows_block(body_lines, capital)
            snapshots.append(_validate_snapshot(capital, total_quotas, rows, allow_near_capital))
        except ValueError as error:
            diagnostics.append(str(error))

        i = (j + 1) if j > i else header_end

    if not snapshots:
        special = read_percent_first_integer_money_table(text)
        if special:
            snapshots.append(special)

    bundled_history = len(re.findall(
        r"\b\d{1,2}\s*(?:O|A)?\s*ADITIVO\b", normalized(text)
    )) >= 2
    if not snapshots or bundled_history:
        fallback, fallback_diagnostics = _fallback_table_from_totals(lines, allow_near_capital)
        snapshots.extend(fallback)
        diagnostics.extend(fallback_diagnostics)

    if not snapshots:
        prose_snapshot = read_prose_ownership_table(text)
        if prose_snapshot:
            snapshots.append(prose_snapshot)

    if not snapshots:
        detail = f" ({'; '.join(dict.fromkeys(diagnostics))})" if diagnostics else ""
        raise ValueError(
            "quadro societÃ¡rio identificado no documento, mas o formato nÃ£o pÃ´de ser validado" + detail
            if diagnostics else
            "quadro completo nÃ£o encontrado; nenhum cabeÃ§alho societÃ¡rio reconhecÃ­vel foi detectado"
        )

    # A document can repeat the same final table in an aditivo and in its consolidation.
    # Ignore exact duplicates; only block genuinely different ownership snapshots inside
    # the same source when no ordering/effective-date information can separate them.
    unique = []
    for snapshot in snapshots:
        signature = (
            snapshot['capitalCents'],
            tuple((name_key(r['name']), r['percentageBps'], r['amount']) for r in snapshot['rows'])
        )
        if not any(signature == item[0] for item in unique):
            unique.append((signature, snapshot))
    snapshots = [item[1] for item in unique]

    if any(snapshot != snapshots[-1] for snapshot in snapshots):
        if bundled_history:
            # Some Drive files concatenate the original contract and several numbered
            # amendments. In that case the last complete table in document order is the
            # latest consolidated position; older snapshots are historical context.
            return snapshots[-1]
        raise ValueError("quadros conflitantes no mesmo documento")
    return snapshots[-1]


def repair_numeric_partner_cell(text, qsa_names):
    """Replace one OCR-lost table name only when current QSA uniquely resolves it."""
    if len(qsa_names) < 2:
        return None
    lines = text.splitlines()
    qsa_keys = {name_key(name) for name in qsa_names}
    for header_index, line in enumerate(lines):
        header = name_key(line)
        if not (line.strip().startswith("|") and "SOCIOS" in header and "QUOTAS" in header):
            continue
        numeric_rows = []
        table_names = set()
        for index in range(header_index + 1, min(len(lines), header_index + 20)):
            row = lines[index]
            cells = [cell.strip() for cell in row.strip().strip("|").split("|")]
            if cells and name_key(cells[0]).startswith("TOTAL"):
                break
            if len(cells) < 4 or not re.search(r"\d", " ".join(cells[1:])):
                continue
            first = name_key(cells[0])
            if re.fullmatch(r"[\d., ]+", cells[0]):
                numeric_rows.append((index, cells))
            elif first in qsa_keys:
                table_names.add(first)
        missing = [name for name in qsa_names if name_key(name) not in table_names]
        if len(numeric_rows) != 1 or len(missing) != 1 or len(table_names) != len(qsa_names) - 1:
            continue
        name = missing[0].strip()
        index, cells = numeric_rows[0]
        cells[0] = name
        lines[index] = "| " + " | ".join(cells) + " |"
        return "\n".join(lines), name
    return None

def qualification(text, name, valid_cpf):
    compact = normalized(text)
    # Matching the full name in a qualification avoids CPF lists of Junta signers.
    pattern = r"\b" + r"\s+".join(re.escape(t) for t in normalized(name).split())
    # Aceita tanto layout Junta (NACIONALIDADE: BRASILEIRO) quanto QSA Receita
    # (nome seguido de Qualificacao) e layout com virgula.
    pattern += r"\s*,?\s*(?:NACIONALIDADE\s*[:\-]?\s*)?(BRASILEIR[OA]|PESSOA JURIDICA|QUALIFICACAO|QUALIFICAÇÃO)\b"
    results = []
    for match in re.finditer(pattern, compact):
        body = compact[match.end():match.end()+1400]
        next_person = re.search(
            r"(?:,|;)\s*(?:[A-Z][A-Z '\-]{2,100}\s+)?"
            r"(?:NACIONALIDADE\s*[:\-]?\s*)?(?:BRASILEIR[OA]|PESSOA JURIDICA)\b",
            body,
        )
        if next_person:
            body = body[:next_person.start()]
        corporate = match[1] == "PESSOA JURIDICA"
        ids = document_number(body, "CNPJ" if corporate else "CPF", 14 if corporate else 11)
        if len(ids) > 1:
            # Ambiguous identity in this qualification: do not use any field from it.
            continue
        identifier = next(iter(ids), None)
        if identifier and not corporate and not valid_cpf(identifier):
            identifier = None
        births = set()
        if not corporate:
            birth_pattern = (
                r"(?:NASCID[OA](?:\s*\([OA]\))?(?:\s*EM|\s+NA\s+CIDADE.{0,120}?\s*EM)"
                r"|DATA DE NASCIMENTO\s*:)\s*[:\-]?\s*"
                r"(\d{1,2}/\s*\d{1,2}/\s*\d{4}|"
                r"\d{1,2}\s+DE\s+[A-Z]+\s+DE\s+\d{4})"
            )
            for value in re.findall(birth_pattern, body):
                try:
                    if "/" in value:
                        birth = datetime.strptime(re.sub(r"\s", "", value), "%d/%m/%Y").date()
                    else:
                        month_names = {
                            "JANEIRO": 1, "FEVEREIRO": 2, "MARCO": 3, "ABRIL": 4,
                            "MAIO": 5, "JUNHO": 6, "JULHO": 7, "AGOSTO": 8,
                            "SETEMBRO": 9, "OUTUBRO": 10, "NOVEMBRO": 11, "DEZEMBRO": 12,
                        }
                        day, month, year = re.fullmatch(
                            r"(\d{1,2})\s+DE\s+([A-Z]+)\s+DE\s+(\d{4})", value
                        ).groups()
                        birth = date(int(year), month_names[month], int(day))
                    explicitly_adult = bool(re.search(r"\bMAIOR\b", body[:300]))
                    old_enough = (date.today() - birth).days >= int(18 * 365.2425)
                    if birth <= date.today() and (not explicitly_adult or old_enough):
                        births.add(birth.isoformat())
                except ValueError:
                    pass
        birth = next(iter(births)) if len(births) == 1 else None
        # A document may contribute only CPF or only birth date. Consolidation below
        # combines those fields by the same normalized partner name across documents.
        if identifier or birth:
            results.append({"name": name, "cpf": None if corporate else identifier,
                            "partnerCnpj": identifier if corporate else None,
                            "birthDate": birth})
    return results


def consolidate_documents(sources, company_cnpj, company_name, known_names, parse_document,
                          valid_cpf, trusted_folder=False, known_people=None, qsa_names=None,
                          recover_document=None):
    """Use partial documents for identity; only complete dated snapshots become events."""
    reports, accepted, snapshots = [], [], []
    names = {name_key(n): re.split(r"\s+-\s+SOC\b", n, flags=re.I)[0].strip() for n in known_names}
    warnings = []
    known_people = known_people or []
    qsa_names = qsa_names or []
    for source in sources:
        report = {"sourceFileId": source['id'], "filename": source['name'], "status": "review", "issues": []}
        reports.append(report)
        if source.get('error'):
            report['issues'].append(source['error'])
            continue
        text = source['text']
        binding = company_binding(text, company_cnpj, company_name, trusted_folder=trusted_folder)
        if not binding:
            document_cnpjs = document_number(text, "CNPJ", 14)
            expected_name = name_key(company_name or "")
            if document_cnpjs and company_cnpj not in document_cnpjs:
                report['issues'].append(
                    "CNPJ da empresa atual nÃ£o foi encontrado no documento e o nome empresarial "
                    "nÃ£o comprovou o vÃ­nculo com seguranÃ§a"
                )
            elif expected_name:
                report['issues'].append(
                    "vÃ­nculo com a empresa nÃ£o comprovado: CNPJ ausente e nome empresarial "
                    "nÃ£o reconhecido com seguranÃ§a"
                )
            else:
                report['issues'].append("vÃ­nculo com a empresa nÃ£o comprovado")
            continue
        source['report'] = report
        accepted.append(source)
        if binding == "company-name":
            report['issues'].append("contrato sem CNPJ; vÃ­nculo pelo nome empresarial explÃ­cito")
        elif binding == "company-name-cross-branch":
            report['issues'].append("CNPJ de filial diferente; vÃ­nculo confirmado pelo nome empresarial exato e pasta correspondente")
        elif binding == "trusted-folder":
            report['issues'].append("vÃ­nculo comprovado pelo contexto da pasta da empresa; documento sem CNPJ/nome explÃ­cito")
        try:
            parsed = parse_document(text, source['id'], source['hash'])
            if parsed['companyCnpj'] != company_cnpj:
                raise ValueError("CNPJ do quadro nÃ£o corresponde Ã  empresa")
            table = {"capitalCents": parsed['capitalCents'], "rows": list(parsed['partners'].values())}
            source['parsed'] = parsed
        except ValueError:
            try:
                table = read_tables(text)
            except ValueError as error:
                if "quadro nÃ£o fecha no capital" in str(error):
                    try:
                        table = read_tables(text, allow_near_capital=True)
                        source['nameOnlyRepaired'] = True
                        warning = (f"{source['name']}: linhas do quadro divergem do capital em atÃ© R$ 1,00; "
                                   "somente nomes aproveitados, valores e histÃ³rico exigem revisÃ£o")
                        report['issues'].append(warning)
                        warnings.append(warning)
                    except ValueError:
                        pass
                if not source.get('nameOnlyRepaired'):
                    inconsistent = recover_inconsistent_total_names(text)
                    if inconsistent:
                        table = inconsistent
                        source['nameOnlyRepaired'] = True
                        warning = (f"{source['name']}: TOTAL impresso diverge das linhas e do capital "
                                   "declarado; somente nomes aproveitados, valores e histÃ³rico exigem revisÃ£o")
                        report['issues'].append(warning)
                        warnings.append(warning)
                recovery_supplied_table = False
                if source.get('nameOnlyRepaired'):
                    recovered_text = recover_document(
                        source,
                        report['issues'][-1],
                    ) if recover_document else None
                    if recovered_text:
                        try:
                            try:
                                recovered_parsed = parse_document(
                                    recovered_text, source['id'], source['hash']
                                )
                                if recovered_parsed['companyCnpj'] != company_cnpj:
                                    raise ValueError("CNPJ do quadro nÃ£o corresponde Ã  empresa")
                                recovered_table = {
                                    "capitalCents": recovered_parsed["capitalCents"],
                                    "rows": list(recovered_parsed["partners"].values()),
                                }
                            except ValueError:
                                recovered_parsed = None
                                recovered_table = read_tables(recovered_text)
                        except ValueError as recovery_error:
                            source['recoveryError'] = str(recovery_error)
                            report['issues'].append(
                                f"recuperaÃ§Ã£o assistida nÃ£o validou o quadro: {recovery_error}"
                            )
                        else:
                            text = recovered_text
                            source['text'] = recovered_text
                            source.pop('nameOnlyRepaired', None)
                            if recovered_parsed:
                                source['parsed'] = recovered_parsed
                            else:
                                source.pop('parsed', None)
                            table = recovered_table
                            recovery_supplied_table = True
                            report['issues'].append(
                                "transcriÃ§Ã£o reanalisada pela IA; inconsistÃªncia anterior "
                                "substituÃ­da por quadro validado integralmente"
                            )
                    if source.get('nameOnlyRepaired'):
                        expand_abbreviated_partner_names(table['rows'], text, qsa_names)
                        source['table'] = table
                        for row in table['rows']:
                            names[name_key(row['name'])] = row['name']
                        continue
                if not recovery_supplied_table and not source.get('nameOnlyRepaired'):
                    repaired = repair_numeric_partner_cell(text, qsa_names)
                    if repaired:
                        try:
                            table = read_tables(repaired[0])
                            source['nameOnlyRepaired'] = True
                            warning = (f"{source['name']}: nome {repaired[1]} conciliado com QSA atual "
                                       "apÃ³s falha OCR em uma cÃ©lula do quadro; histÃ³rico nÃ£o inferido")
                            report['issues'].append(warning)
                            warnings.append(warning)
                        except ValueError:
                            report['issues'].append(str(error))
                            continue
                    else:
                        recovered_text = recover_document(source, str(error)) if recover_document else None
                        if not recovered_text:
                            recovery_error = source.get('recoveryError')
                            issue = (f"{error}; recuperaÃ§Ã£o assistida falhou: {recovery_error}"
                                     if recovery_error else str(error))
                            report['issues'].append(issue)
                            continue
                        text = recovered_text
                        source['text'] = recovered_text
                        try:
                            parsed = parse_document(text, source['id'], source['hash'])
                            if parsed['companyCnpj'] != company_cnpj:
                                raise ValueError("CNPJ do quadro nÃ£o corresponde Ã  empresa")
                            table = {"capitalCents": parsed['capitalCents'],
                                     "rows": list(parsed['partners'].values())}
                            source['parsed'] = parsed
                        except ValueError:
                            source.pop('parsed', None)
                            try:
                                table = read_tables(text)
                            except ValueError as recovery_error:
                                report['issues'].append(
                                    f"{error}; recuperaÃ§Ã£o assistida tambÃ©m nÃ£o validou: {recovery_error}"
                                )
                                continue
                        report['issues'].append(
                            "transcriÃ§Ã£o reanalisada pela IA apÃ³s falha do parser; "
                            "tabela normalizada aceita somente apÃ³s validaÃ§Ã£o determinÃ­stica"
                        )
        expand_abbreviated_partner_names(table['rows'], text, qsa_names)
        source['table'] = table
        for row in table['rows']:
            names[name_key(row['name'])] = row['name']

    identities = {}
    for key, name in names.items():
        found = []
        # Database identities are corroborating context, never ownership evidence.
        # They can complete an identity for a partner whose name is present in the
        # document table, but cannot create a snapshot, percentage or effective date.
        for database_person in known_people:
            if name_key(database_person.get('name', '')) != key:
                continue
            cpf = re.sub(r"\D", "", database_person.get('cpf') or "") or None
            partner_cnpj = re.sub(r"\D", "", database_person.get('partnerCnpj') or "") or None
            if cpf and not valid_cpf(cpf):
                cpf = None
            if partner_cnpj and len(partner_cnpj) != 14:
                partner_cnpj = None
            birth = database_person.get('birthDate')
            if birth:
                try:
                    parsed_birth = datetime.strptime(birth, "%Y-%m-%d").date()
                    birth = birth if parsed_birth <= date.today() else None
                except (TypeError, ValueError):
                    birth = None
            if bool(cpf) != bool(partner_cnpj):
                found.append(({
                    'name': database_person.get('name') or name,
                    'cpf': cpf, 'partnerCnpj': partner_cnpj, 'birthDate': birth,
                }, {'id': 'database-context', 'hash': '0' * 64}))
        for source in accepted:
            people = qualification(source['text'], name, valid_cpf)
            if source.get('parsed'):
                people += [p for p in source['parsed']['partners'].values() if name_key(p['name']) == key]
            for person in people:
                found.append((person, source))
        ids = {p['cpf'] or p.get('partnerCnpj') for p, _ in found if p['cpf'] or p.get('partnerCnpj')}
        if len(ids) != 1:
            if ids:
                warnings.append(f"Identidade conflitante para um sÃ³cio; {len(ids)} documentos pessoais diferentes, sem mesclar")
            continue
        identifier = next(iter(ids))
        births = {p['birthDate'] for p, _ in found if p['birthDate']}
        is_corporate = len(identifier) == 14
        person = {
            'name': next((p['name'] for p, _ in reversed(found) if p.get('name')), name),
            'cpf': None if is_corporate else identifier,
            'partnerCnpj': identifier if is_corporate else None,
            'birthDate': next(iter(births)) if len(births) == 1 else None,
        }
        person['ownershipHistory'] = []
        person['sources'] = [{"sourceFileId": s['id'], "sourceHash": s['hash'],
                              "fields": ["name"]
                              + (["partnerCnpj" if p.get('partnerCnpj') else "cpf"]
                                 if p.get('cpf') or p.get('partnerCnpj') else [])
                              + (["birthDate"] if p['birthDate'] and len(births) == 1 else [])}
                             for p, s in found]
        if len(births) > 1:
            warnings.append("Nascimento conflitante entre documentos; campo mantido para revisÃ£o")
        identities[key] = person

    for source in accepted:
        report = source['report']
        if 'table' not in source or source.get('nameOnlyRepaired'):
            continue
        try:
            parsed_effective = source.get('parsed', {}).get('effectiveAt')
            try:
                text_effective = explicit_date(source['text'])
            except ValueError as error:
                if str(error) != "vigÃªncia explÃ­cita ausente":
                    raise
                text_effective = None

            document_dates = [value for value in (parsed_effective, text_effective) if value]
            effective_source = "document"
            if document_dates:
                effective = max(document_dates)
            else:
                effective = drive_created_date(source.get('createdTime'))
                effective_source = "drive-createdTime"
                message = (
                    f"{source['name']}: vigÃªncia ausente no documento; "
                    f"usada data de upload/criaÃ§Ã£o no Drive ({effective})"
                )
                report['issues'].append(message)
                warnings.append(message)
            order = source.get('parsed', {}).get('sequence')
            if order is None:
                order = sequence(source['text'])
            rows = source['table']['rows']
            if any(name_key(row['name']) not in identities for row in rows):
                raise ValueError("quadro sem identidade inequÃ­voca de todos os sÃ³cios")
            percentages = {identities[name_key(row['name'])]['cpf'] or identities[name_key(row['name'])]['partnerCnpj']: row['percentageBps'] for row in rows}
            if len(percentages) != len(rows):
                raise ValueError("identidade duplicada no quadro")
            snapshot = {"effectiveAt": effective, "sequence": order, "capitalCents": source['table']['capitalCents'],
                        "sourceFileId": source['id'], "sourceHash": source['hash'], "percentages": percentages,
                        "effectiveDateSource": effective_source,
                        "previous": {identities[name_key(row['name'])]['cpf'] or identities[name_key(row['name'])]['partnerCnpj']: row['previousPercentageBps']
                                     for row in rows if 'previousPercentageBps' in row}}
            snapshots.append(snapshot)
            report['status'] = "snapshot"
        except ValueError as error:
            report['issues'].append(str(error))

    # Conflicting snapshots at the same effective instant remain blocked; createdTime is
    # only a fallback when the document itself contains no recognized effective date.
    grouped = {}
    for snapshot in snapshots:
        grouped.setdefault((snapshot['effectiveAt'], snapshot['sequence']), []).append(snapshot)
    snapshots = []
    for group in grouped.values():
        if any((s['capitalCents'], s['percentages']) != (group[0]['capitalCents'], group[0]['percentages']) for s in group):
            for report in reports:
                if report['sourceFileId'] in {s['sourceFileId'] for s in group}:
                    report['status'] = "review"
                    report['issues'].append("quadros conflitantes na mesma vigÃªncia/ordem")
            continue
        snapshots.append(sorted(group, key=lambda s: s['sourceFileId'])[0])
    snapshots.sort(key=lambda s: (s['effectiveAt'], s['sequence']))
    by_id = {}
    for person in identities.values():
        identifier = person['cpf'] or person['partnerCnpj']
        if identifier in by_id:
            previous = by_id[identifier]
            births = {v for v in (previous['birthDate'], person['birthDate']) if v}
            person['birthDate'] = next(iter(births)) if len(births) == 1 else None
            person['sources'] += previous['sources']
        by_id[identifier] = person
    for identifier, person in by_id.items():
        for snapshot in snapshots:
            event = {key: value for key, value in snapshot.items() if key not in ('percentages', 'previous', 'effectiveDateSource')}
            event['percentageBps'] = snapshot['percentages'].get(identifier, 0)
            if identifier in snapshot['previous']:
                event['previousPercentageBps'] = snapshot['previous'][identifier]
            person['ownershipHistory'].append(event)
        used = {e['sourceFileId'] for e in person['sources']}
        for report in reports:
            if report['sourceFileId'] in used and report['status'] == 'review':
                report['status'] = 'identity-only'
        unique_sources = {(s['sourceFileId'], tuple(s['fields'])): s for s in person['sources']}
        person['sources'] = list(unique_sources.values())
    return {"mode": "document-set", "companyCnpj": company_cnpj, "partners": list(by_id.values()),
            "warnings": sorted(set(warnings)), "documents": reports,
            "summary": {"read": len(sources), "snapshots": len(snapshots), "partners": len(by_id),
                        "review": sum(bool(r['issues']) for r in reports)}}
