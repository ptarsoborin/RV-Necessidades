"""Configuração: pasta de dados, chave secreta e opções por variável de ambiente."""
import os
import secrets
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
NA_VERCEL = bool(os.environ.get('VERCEL'))       # a Vercel define VERCEL=1 nas suas funções


def pasta_dados():
    # na Vercel só /tmp aceita gravação; lá o banco é o Postgres e a pasta quase não é usada
    p = Path(os.environ.get('RVN_DADOS') or ('/tmp/rvn' if NA_VERCEL else RAIZ / 'dados'))
    p.mkdir(parents=True, exist_ok=True)
    return p


def url_banco():
    """Endereço do Postgres (Supabase), se configurado. Sem ele, o banco é o arquivo SQLite da pasta de dados."""
    return (os.environ.get('DATABASE_URL') or os.environ.get('RVN_DATABASE_URL') or '').strip()


def alvo_banco(pasta):
    return url_banco() or str(Path(pasta) / 'rvn.db')


def _liga(nome, padrao):
    v = os.environ.get(nome)
    return padrao if v is None or v == '' else v == '1'


def chave_secreta(pasta):
    """A chave que assina os cookies: da variável RVN_SECRET_KEY ou de um arquivo da pasta de dados (criado na primeira execução)."""
    env = (os.environ.get('RVN_SECRET_KEY') or '').strip()
    if env:
        return env
    if NA_VERCEL:
        raise RuntimeError('Defina a variável RVN_SECRET_KEY nas configurações do projeto na Vercel.')
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
        'DB': alvo_banco(pasta),
        'SECRET_KEY': chave_secreta(pasta),
        'HTTPS': _liga('RVN_HTTPS', NA_VERCEL),      # atrás do túnel com HTTPS: cookie Secure e HSTS
        'PROXY': _liga('RVN_PROXY', NA_VERCEL),      # atrás do túnel: confiar nos cabeçalhos do proxy local
        'MAX_ADMINS': int(os.environ.get('RVN_MAX_ADMINS') or 1),
        'TENTATIVAS_MAX': 5,
        'BLOQUEIO_MIN': 15,
        'SESSAO_HORAS': 8,
        'MANTER_RELATORIOS': int(os.environ.get('RVN_MANTER_RELATORIOS') or 60),    # relatórios de necessidades guardados
        'MANTER_MONITORES': int(os.environ.get('RVN_MANTER_MONITORES') or 10),
    }
