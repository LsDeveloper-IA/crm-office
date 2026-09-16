import os
from pathlib import Path

import pyodbc
from dotenv import load_dotenv


class ErroConexaoBanco(RuntimeError):
    """Erro compreensível para falhas na configuração ou conexão."""


def _valor_odbc(valor):
    return "{" + valor.replace("}", "}}") + "}"


def conectar_banco():
    """Abre uma conexão ODBC usando as configurações do arquivo .env."""
    pasta_projeto = Path(__file__).resolve().parents[1]
    load_dotenv(pasta_projeto / ".env")

    dsn = os.getenv("ODBC_DSN", "").strip()
    usuario = os.getenv("ODBC_USUARIO", "").strip()
    senha = os.getenv("ODBC_SENHA", "")

    if not dsn:
        raise ErroConexaoBanco(
            "A variável ODBC_DSN não foi configurada no arquivo .env."
        )

    if bool(usuario) != bool(senha):
        raise ErroConexaoBanco(
            "Preencha ODBC_USUARIO e ODBC_SENHA juntos no arquivo .env."
        )

    if any(char in dsn for char in ";{}"):
        raise ErroConexaoBanco("Nome de DSN invalido.")
    partes_conexao = [f"DSN={dsn}"]

    # No computador atual, o DSN Producao já possui autenticação.
    # Estes campos continuam opcionais para outros ambientes.
    if usuario and senha:
        partes_conexao.extend([f"UID={_valor_odbc(usuario)}", f"PWD={_valor_odbc(senha)}"])

    try:
        return pyodbc.connect(
            ";".join(partes_conexao),
            timeout=5,
            autocommit=False,
        )
    except pyodbc.Error as erro:
        raise ErroConexaoBanco(
            f"Não foi possível conectar ao DSN '{dsn}': {erro}"
        ) from erro
