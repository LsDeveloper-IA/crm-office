"""Snapshot completo para o CRM; a origem ODBC recebe somente consultas."""
import json
import sys
from datetime import datetime, timezone

from .conexao import conectar_banco
from .consultas import listar_empresas_crm


def main():
    conexao = conectar_banco()
    try:
        # Alguns drivers ODBC, como o SAP/SQL Anywhere, rejeitam a propriedade
        # `conexao.timeout` mesmo quando a conexão foi aberta corretamente.
        # O timeout já foi configurado no connect() e não é obrigatório aqui.
        snapshot = listar_empresas_crm(conexao)
        snapshot["collectedAt"] = datetime.now(timezone.utc).isoformat()
        if getattr(conexao, "in_transaction", False):
            conexao.rollback()
        print(json.dumps(snapshot, ensure_ascii=True))
    finally:
        conexao.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as erro:
        # Nao imprimir strings de conexao, credenciais ou dados empresariais.
        print(f"Falha na leitura ODBC ({type(erro).__name__}). Nenhum snapshot emitido.", file=sys.stderr)
        sys.exit(1)
