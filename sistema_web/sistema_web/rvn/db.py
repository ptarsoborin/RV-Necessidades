"""Banco de dados (SQLite): conexão por requisição, criação das tabelas e backup."""
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import current_app, g

from . import permissoes

SCHEMA = """
CREATE TABLE IF NOT EXISTS usuario (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  nivel TEXT NOT NULL CHECK (nivel IN ('admin', 'gerencia', 'diretoria', 'comprador')),
  comprador_protheus TEXT NOT NULL DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1,
  senha_hash TEXT NOT NULL,
  deve_trocar INTEGER NOT NULL DEFAULT 1,
  sessao_versao INTEGER NOT NULL DEFAULT 1,
  tentativas INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  ultimo_acesso TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS perm_nivel (
  nivel TEXT NOT NULL, chave TEXT NOT NULL, valor TEXT NOT NULL,
  PRIMARY KEY (nivel, chave)
);
CREATE TABLE IF NOT EXISTS perm_usuario (
  usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  chave TEXT NOT NULL, valor TEXT NOT NULL,
  PRIMARY KEY (usuario_id, chave)
);
CREATE TABLE IF NOT EXISTS escopo_usuario (
  usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('comprador', 'marca')),
  valor TEXT NOT NULL,
  PRIMARY KEY (usuario_id, tipo, valor)
);
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY,
  quando TEXT NOT NULL,
  usuario_id INTEGER,
  login TEXT NOT NULL DEFAULT '',
  acao TEXT NOT NULL,
  detalhe TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_auditoria_quando ON auditoria (quando);
CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS relatorio (
  id INTEGER PRIMARY KEY,
  ref_at TEXT NOT NULL,
  importado_em TEXT NOT NULL,
  usuario_id INTEGER,
  importado_por TEXT NOT NULL DEFAULT '',
  arquivo TEXT NOT NULL DEFAULT '',
  tamanho INTEGER NOT NULL DEFAULT 0,
  hash TEXT NOT NULL,
  aba TEXT NOT NULL DEFAULT '',
  notas TEXT NOT NULL DEFAULT '[]',
  itens INTEGER NOT NULL DEFAULT 0,
  comprar_n INTEGER NOT NULL DEFAULT 0,
  imin_n INTEGER NOT NULL DEFAULT 0,
  ent_n INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_relatorio_hash ON relatorio (hash);
CREATE TABLE IF NOT EXISTS relatorio_item (
  relatorio_id INTEGER NOT NULL REFERENCES relatorio(id) ON DELETE CASCADE,
  comprador_n TEXT NOT NULL,
  marca_n TEXT NOT NULL,
  codigo TEXT NOT NULL,
  dados TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_relatorio_item ON relatorio_item (relatorio_id, comprador_n);
CREATE TABLE IF NOT EXISTS monitor (
  id INTEGER PRIMARY KEY,
  ref_at TEXT NOT NULL,
  importado_em TEXT NOT NULL,
  usuario_id INTEGER,
  importado_por TEXT NOT NULL DEFAULT '',
  arquivo TEXT NOT NULL DEFAULT '',
  tamanho INTEGER NOT NULL DEFAULT 0,
  hash TEXT NOT NULL,
  aba TEXT NOT NULL DEFAULT '',
  linhas INTEGER NOT NULL DEFAULT 0,
  bloqueadas INTEGER NOT NULL DEFAULT 0,
  pedidos INTEGER NOT NULL DEFAULT 0,
  produtos INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_monitor_hash ON monitor (hash);
CREATE TABLE IF NOT EXISTS monitor_item (
  monitor_id INTEGER NOT NULL REFERENCES monitor(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  dados TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_monitor_item ON monitor_item (monitor_id, codigo);

CREATE TABLE IF NOT EXISTS pedido (
  id TEXT PRIMARY KEY,
  numero TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  comprador_n TEXT NOT NULL,
  marca_n TEXT NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  dados TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_pedido_status ON pedido (status);
CREATE INDEX IF NOT EXISTS ix_pedido_comprador ON pedido (comprador_n);
CREATE TABLE IF NOT EXISTS documento (
  colecao TEXT NOT NULL,
  id TEXT NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  atualizado_em TEXT NOT NULL,
  atualizado_por TEXT NOT NULL DEFAULT '',
  dados TEXT NOT NULL,
  PRIMARY KEY (colecao, id)
);
"""
VERSAO_ESQUEMA = '3'


def agora():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def conectar(caminho):
    conn = sqlite3.connect(caminho, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA journal_mode = WAL')
    return conn


def init_db(caminho):
    conn = conectar(caminho)
    try:
        conn.executescript(SCHEMA)
        conn.execute('INSERT INTO meta (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor', ('esquema', VERSAO_ESQUEMA))
        permissoes.semear(conn)
        conn.commit()
    finally:
        conn.close()


def get_db():
    if 'db' not in g:
        g.db = conectar(current_app.config['DB'])
    return g.db


def fechar_db(_erro=None):
    conn = g.pop('db', None)
    if conn is not None:
        conn.close()


def registrar(acao, detalhe='', usuario=None, ip=''):
    """Grava uma linha no registro de ações."""
    db = get_db()
    uid = usuario['id'] if usuario is not None else None
    login = usuario['login'] if usuario is not None else ''
    db.execute('INSERT INTO auditoria (quando, usuario_id, login, acao, detalhe, ip) VALUES (?, ?, ?, ?, ?, ?)',
               (agora(), uid, login, acao, detalhe[:2000], ip))
    db.commit()


def backup(caminho_db, pasta, manter=30):
    """Cópia consistente do banco (mesmo com o sistema em uso) e limpeza das cópias antigas."""
    pasta = Path(pasta)
    pasta.mkdir(parents=True, exist_ok=True)
    destino = pasta / ('rvn-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.db')
    origem = conectar(caminho_db)
    copia = sqlite3.connect(destino)
    try:
        origem.backup(copia)
    finally:
        copia.close()
        origem.close()
    antigos = sorted(pasta.glob('rvn-*.db'))
    for velho in antigos[:-manter] if manter > 0 else []:
        velho.unlink()
    return destino
