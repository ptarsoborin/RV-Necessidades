import re

import pytest

from conftest import entrar, novo_usuario, token
from rvn import db as bd, permissoes as pm


def criar(cli, **campos):
    t = token(cli, '/admin/usuarios/novo')
    return cli.post('/admin/usuarios/novo', data=dict({'csrf': t}, **campos))


def test_admin_cria_usuario_com_senha_temporaria_e_ele_entra(app, contas):
    adm = app.test_client()
    entrar(adm, 'paulo')
    r = criar(adm, login='rodrigo', nome='Rodrigo R', email='r@x.com', nivel='comprador', comprador_protheus='RODRIGO RO')
    corpo = r.get_data(as_text=True)
    assert r.status_code == 200 and 'Usuário criado' in corpo
    senha = re.search(r'class="senha">([^<]+)<', corpo).group(1)
    novo = app.test_client()
    resp = entrar(novo, 'rodrigo', senha)
    assert resp.status_code == 302
    assert '/conta/senha' in novo.get('/').headers['Location']          # obrigado a trocar
    with app.app_context():
        assert senha not in str(bd.get_db().execute('SELECT senha_hash FROM usuario WHERE login = ?', ('rodrigo',)).fetchone()[0])


def test_senha_temporaria_nao_fica_no_registro(app, contas):
    adm = app.test_client()
    entrar(adm, 'paulo')
    r = criar(adm, login='rodrigo', nome='Rodrigo R', nivel='comprador', comprador_protheus='RODRIGO RO')
    senha = re.search(r'class="senha">([^<]+)<', r.get_data(as_text=True)).group(1)
    with app.app_context():
        tudo = ' '.join(r[0] for r in bd.get_db().execute('SELECT detalhe FROM auditoria'))
    assert senha not in tudo


def test_comprador_exige_o_nome_do_protheus(app, contas):
    adm = app.test_client()
    entrar(adm, 'paulo')
    r = criar(adm, login='semnome', nome='Sem Nome', nivel='comprador', comprador_protheus='')
    assert 'nome do comprador como aparece no Protheus' in r.get_data(as_text=True)
    with app.app_context():
        assert bd.get_db().execute("SELECT 1 FROM usuario WHERE login = 'semnome'").fetchone() is None


def test_so_pode_haver_um_admin(app, contas):
    adm = app.test_client()
    entrar(adm, 'paulo')
    r = criar(adm, login='outro', nome='Outro Admin', nivel='admin')
    assert 'Já existe um admin' in r.get_data(as_text=True)
    t = token(adm, '/admin/usuarios/%d' % contas['andreia'])
    r = adm.post('/admin/usuarios/%d' % contas['andreia'], data={'csrf': t, 'nome': 'Andreia', 'nivel': 'admin', 'ativo': '1'})
    assert 'Já existe um admin' in r.get_data(as_text=True)
    with app.app_context():
        assert bd.get_db().execute("SELECT nivel FROM usuario WHERE login = 'andreia'").fetchone()[0] == 'gerencia'


def test_login_repetido_e_invalido_sao_recusados(app, contas):
    adm = app.test_client()
    entrar(adm, 'paulo')
    assert 'Já existe' in criar(adm, login='MARCELO', nome='X', nivel='diretoria').get_data(as_text=True)
    assert 'precisa ter de 3 a 40' in criar(adm, login='a b', nome='X', nivel='diretoria').get_data(as_text=True)


def test_admin_nao_desativa_nem_rebaixa_a_si_mesmo(app, contas):
    adm = app.test_client()
    entrar(adm, 'paulo')
    t = token(adm, '/admin/usuarios/%d' % contas['paulo'])
    r = adm.post('/admin/usuarios/%d' % contas['paulo'], data={'csrf': t, 'nome': 'Paulo', 'nivel': 'gerencia', 'ativo': '1'})
    assert 'Você não pode desativar nem rebaixar' in r.get_data(as_text=True)
    r = adm.post('/admin/usuarios/%d' % contas['paulo'], data={'csrf': t, 'nome': 'Paulo', 'nivel': 'admin'})
    assert 'Você não pode desativar nem rebaixar' in r.get_data(as_text=True)


def test_desativar_derruba_a_sessao_da_pessoa(app, contas):
    adm, mar = app.test_client(), app.test_client()
    entrar(adm, 'paulo')
    entrar(mar, 'marcelo')
    assert mar.get('/app').status_code == 200
    t = token(adm, '/admin/usuarios/%d' % contas['marcelo'])
    adm.post('/admin/usuarios/%d' % contas['marcelo'], data={'csrf': t, 'nome': 'Marcelo', 'nivel': 'comprador', 'comprador_protheus': 'MARCELO RE'})   # sem "ativo" = desativa
    assert mar.get('/app').status_code == 302
    assert entrar(app.test_client(), 'marcelo').status_code == 200      # volta para a tela de entrada, com erro


def test_redefinir_senha_derruba_sessao_e_exige_troca(app, contas):
    adm, mar = app.test_client(), app.test_client()
    entrar(adm, 'paulo')
    entrar(mar, 'marcelo')
    t = token(adm, '/admin/usuarios')
    r = adm.post('/admin/usuarios/%d/senha' % contas['marcelo'], data={'csrf': t})
    senha = re.search(r'class="senha">([^<]+)<', r.get_data(as_text=True)).group(1)
    assert mar.get('/app').status_code == 302
    novo = app.test_client()
    entrar(novo, 'marcelo', senha)
    assert '/conta/senha' in novo.get('/').headers['Location']


def test_mudancas_de_usuario_ficam_no_registro(app, contas):
    adm = app.test_client()
    entrar(adm, 'paulo')
    t = token(adm, '/admin/usuarios/%d' % contas['talita'])
    adm.post('/admin/usuarios/%d' % contas['talita'], data={'csrf': t, 'nome': 'Talita D', 'nivel': 'comprador', 'comprador_protheus': 'TALITA DE', 'ativo': '1'})
    with app.app_context():
        d = bd.get_db().execute("SELECT detalhe FROM auditoria WHERE acao = 'usuario_editado'").fetchone()[0]
    assert 'talita' in d and 'Talita D' in d


# ---------------------------------------------------------------- alcance dos dados
def perm_de(app, login):
    with app.app_context():
        u = bd.get_db().execute('SELECT * FROM usuario WHERE login = ?', (login,)).fetchone()
        return pm.resolver(bd.get_db(), u)


def test_comprador_ve_so_o_proprio_comprador(app, contas):
    p = perm_de(app, 'marcelo')
    assert p.enxerga('MARCELO RE', 'BIC') and p.enxerga(' marcelo  re ', 'X')
    assert not p.enxerga('TALITA DE', 'BIC') and not p.enxerga('', 'BIC')


def test_gerencia_e_admin_veem_todos(app, contas):
    for q in ('andreia', 'paulo', 'daniel'):
        p = perm_de(app, q)
        assert p.enxerga('QUALQUER', 'X') and p.escopo()['tipo'] == 'todos'


def test_selecionados_vale_comprador_ou_marca(app, contas):
    adm = app.test_client()
    entrar(adm, 'paulo')
    t = token(adm, '/admin/usuarios/%d/acessos' % contas['daniel'])
    adm.post('/admin/usuarios/%d/acessos' % contas['daniel'], data={'csrf': t, 'u__escopo': 'selecionados', 'compradores_sel': 'MARCELO RE\nTALITA DE', 'marcas_sel': 'BIC'})
    p = perm_de(app, 'daniel')
    assert p.escopo()['tipo'] == 'selecionados'
    assert p.enxerga('MARCELO RE', 'ALFA') and p.enxerga('TALITA DE', '')
    assert p.enxerga('OUTRO COMPRADOR', 'BIC') and p.enxerga('OUTRO COMPRADOR', ' bic ')
    assert not p.enxerga('OUTRO COMPRADOR', 'ALFA')


def test_selecionados_sem_listas_nao_ve_nada(app, contas):
    adm = app.test_client()
    entrar(adm, 'paulo')
    t = token(adm, '/admin/usuarios/%d/acessos' % contas['daniel'])
    adm.post('/admin/usuarios/%d/acessos' % contas['daniel'], data={'csrf': t, 'u__escopo': 'selecionados'})
    p = perm_de(app, 'daniel')
    assert not p.enxerga('MARCELO RE', 'BIC')


def test_nivel_pode_trocar_o_alcance_padrao(app, contas):
    adm = app.test_client()
    entrar(adm, 'paulo')
    t = token(adm, '/admin/permissoes')
    campos = {'csrf': t, 'e__gerencia': 'proprios', 'e__diretoria': 'todos', 'e__comprador': 'proprios'}
    adm.post('/admin/permissoes', data=campos)
    assert perm_de(app, 'andreia').escopo()['tipo'] == 'proprios'


# ---------------------------------------------------------------- banco e backup
def test_backup_copia_o_banco_e_mantem_so_as_ultimas(app, contas, tmp_path):
    if bd.eh_postgres(app.config['DB']):
        pytest.skip('no Postgres (Supabase) o backup é do próprio Supabase')
    destino = tmp_path / 'bk'
    for _ in range(4):
        import time
        bd.backup(app.config['DB'], destino, manter=3)
        time.sleep(1.1)
    copias = sorted(destino.glob('rvn-*.db'))
    assert len(copias) == 3
    import sqlite3
    conn = sqlite3.connect(copias[-1])
    assert conn.execute("SELECT COUNT(*) FROM usuario").fetchone()[0] == 5
    conn.close()


def test_cli_cria_admin_uma_vez(tmp_path, monkeypatch):
    from rvn import __main__ as cli
    monkeypatch.setenv('RVN_DADOS', str(tmp_path))
    monkeypatch.setattr('getpass.getpass', lambda *_a: 'SenhaDoAdmin2026')
    assert cli.main(['criar-admin', '--login', 'Paulo', '--nome', 'Paulo']) == 0
    assert cli.main(['criar-admin', '--login', 'outro', '--nome', 'Outro']) == 1
