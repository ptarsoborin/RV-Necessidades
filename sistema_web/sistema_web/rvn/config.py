"""Configuração: pasta de dados, chave secreta e opções por variável de ambiente."""
import os
import secrets
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def pasta_dados():
    p = Path(os.environ.get('RVN_DADOS') or (RAIZ / 'dados'))
    p.mkdir(parents=True, exist_ok=True)
    return p


def chave_secreta(pasta):
    """A chave que assina os cookies fica num arquivo da pasta de dados (criada na primeira execução)."""
    f = pasta / 'segredo.key'
    if not f.exists():
        f.write_text(secrets.token_hex(32), encoding='utf-8')
        try:
            os.chmod(f, 0o600)
        except OSError:
            pass
    return f.read_text(encoding='utf-8').strip()


def config_padrao(pasta=None):
    pasta = Path(pasta) if pasta else pasta_dados()
    return {
        'DADOS': pasta,
        'DB': str(pasta / 'rvn.db'),
        'SECRET_KEY': chave_secreta(pasta),
        'HTTPS': os.environ.get('RVN_HTTPS') == '1',      # atrás do túnel com HTTPS: cookie Secure e HSTS
        'PROXY': os.environ.get('RVN_PROXY') == '1',      # atrás do túnel: confiar nos cabeçalhos do proxy local
        'MAX_ADMINS': int(os.environ.get('RVN_MAX_ADMINS') or 1),
        'TENTATIVAS_MAX': 5,
        'BLOQUEIO_MIN': 15,
        'SESSAO_HORAS': 8,
        'MANTER_RELATORIOS': int(os.environ.get('RVN_MANTER_RELATORIOS') or 60),    # relatórios de necessidades guardados
        'MANTER_MONITORES': int(os.environ.get('RVN_MANTER_MONITORES') or 10),
    }
