import json
import os
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rvn import create_app, db as bd, seguranca  # noqa: E402


# Com RVN_TEST_PG=postgresql://... os testes rodam contra um Postgres (o banco é zerado a cada teste).
PG = os.environ.get('RVN_TEST_PG', '').strip()


def _zerar_pg():
    conn = bd.conectar(PG)
    try:
        conn.executescript('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
        conn.commit()
    finally:
        conn.close()


@pytest.fixture()
def app(tmp_path):
    config = {'DADOS': tmp_path, 'TESTING': True, 'SECRET_KEY': 'teste'}
    if PG:
        _zerar_pg()
        config['DB'] = PG
    app = create_app(config)
    return app


@pytest.fixture()
def cli(app):
    return app.test_client()


def novo_usuario(app, login, nivel='comprador', senha='SenhaBoa123', nome=None, comprador='', deve_trocar=0, ativo=1):
    with app.app_context():
        db = bd.get_db()
        db.execute('INSERT INTO usuario (login, nome, nivel, comprador_protheus, senha_hash, deve_trocar, ativo, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                   (login, nome or login.title(), nivel, comprador, seguranca.hash_senha(senha), deve_trocar, ativo, bd.agora()))
        db.commit()
        return db.execute('SELECT id FROM usuario WHERE login = ?', (login,)).fetchone()[0]


def token(cli, caminho='/entrar'):
    r = cli.get(caminho)
    m = re.search(r'name="csrf" value="([^"]+)"', r.get_data(as_text=True))
    assert m, 'sem token csrf em ' + caminho
    return m.group(1)


def entrar(cli, login, senha='SenhaBoa123'):
    t = token(cli)
    return cli.post('/entrar', data={'login': login, 'senha': senha, 'csrf': t})


def csrf_da_pagina(cli, caminho):
    return token(cli, caminho)


@pytest.fixture()
def contas(app):
    ids = {
        'paulo': novo_usuario(app, 'paulo', 'admin', nome='Paulo'),
        'andreia': novo_usuario(app, 'andreia', 'gerencia', nome='Andreia'),
        'daniel': novo_usuario(app, 'daniel', 'diretoria', nome='Daniel'),
        'marcelo': novo_usuario(app, 'marcelo', 'comprador', nome='Marcelo', comprador='MARCELO RE'),
        'talita': novo_usuario(app, 'talita', 'comprador', nome='Talita', comprador='TALITA DE'),
    }
    return ids


def config_da_pagina(cli):
    """A configuração que o servidor entrega à tela (identidade, páginas liberadas, permissões)."""
    r = cli.get('/app')
    assert r.status_code == 200
    m = re.search(r'<script type="application/json" id="rvn-config">(.*?)</script>', r.get_data(as_text=True), re.S)
    assert m, 'sem configuração na página'
    return json.loads(m.group(1))
