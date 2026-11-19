from conftest import config_da_pagina, entrar, token
from rvn import db as bd, permissoes as pm


def ver(cli, chave):
    """200 se a página abre dentro do sistema (o atalho /p/ redireciona para /app#/pagina); senão o código de erro."""
    r = cli.get('/p/' + chave)
    return 200 if r.status_code == 302 and r.headers['Location'].endswith('/app#/' + chave) else r.status_code


def test_admin_ve_tudo_e_a_area_do_admin(cli, contas):
    entrar(cli, 'paulo')
    assert all(ver(cli, c) == 200 for c in pm.PAGINAS)
    assert cli.get('/admin/usuarios').status_code == 200
    assert cli.get('/admin/permissoes').status_code == 200
    assert cli.get('/admin/auditoria').status_code == 200


def test_andreia_gerencia_tem_acesso_geral_mas_nao_a_estrutura(cli, contas):
    entrar(cli, 'andreia')
    assert all(ver(cli, c) == 200 for c in pm.PAGINAS)
    for rota in ('/admin/usuarios', '/admin/usuarios/novo', '/admin/permissoes', '/admin/auditoria', '/admin/usuarios/%d/acessos' % contas['marcelo']):
        assert cli.get(rota).status_code == 403, rota
    corpo = cli.get('/app').get_data(as_text=True)
    assert 'Administração' not in corpo


def test_andreia_nao_muda_regras_do_sistema_pelo_padrao(app, contas):
    with app.app_context():
        u = bd.get_db().execute("SELECT * FROM usuario WHERE login = 'andreia'").fetchone()
        p = pm.resolver(bd.get_db(), u)
    assert p.pode('acao.budget_lancar') and p.pode('acao.aprovar_formulario') and p.pode('acao.importar_monitor')
    for c in ('acao.budget_regras', 'acao.preco_acima', 'acao.dados_empresa', 'acao.moeda_criterios', 'acao.excluir_relatorio'):
        assert not p.pode(c), c


def test_comprador_so_ve_o_que_o_nivel_libera(cli, contas):
    entrar(cli, 'marcelo')
    assert ver(cli, 'rupturas') == 200 and ver(cli, 'bloqueados') == 200 and ver(cli, 'exportar') == 200
    for c in ('budget', 'fornecedores', 'importar'):
        assert ver(cli, c) == 403, c
    assert cli.get('/admin/usuarios').status_code == 403
    cfg = config_da_pagina(cli)
    assert 'budget' not in cfg['paginas'] and 'fornecedores' not in cfg['paginas'] and 'rupturas' in cfg['paginas']


def test_diretoria_consulta_budget_mas_nao_importa(cli, contas):
    entrar(cli, 'daniel')
    assert ver(cli, 'budget') == 200 and ver(cli, 'importar') == 403


def test_pagina_inexistente_da_404(cli, contas):
    entrar(cli, 'paulo')
    assert ver(cli, 'nada') == 404


def test_acesso_negado_fica_no_registro(cli, app, contas):
    entrar(cli, 'marcelo')
    ver(cli, 'budget')
    with app.app_context():
        r = bd.get_db().execute("SELECT login, detalhe FROM auditoria WHERE acao = 'acesso_negado'").fetchone()
    assert r['login'] == 'marcelo' and 'ver.budget' in r['detalhe']


def salvar_acessos(cli, uid, **campos):
    t = token(cli, '/admin/usuarios/%d/acessos' % uid)
    return cli.post('/admin/usuarios/%d/acessos' % uid, data=dict({'csrf': t}, **campos))


def test_excecao_por_pessoa_libera_e_bloqueia(app, contas):
    adm, mar = app.test_client(), app.test_client()
    entrar(adm, 'paulo')
    entrar(mar, 'marcelo')
    assert ver(mar, 'budget') == 403 and ver(mar, 'rupturas') == 200
    r = salvar_acessos(adm, contas['marcelo'], **{'u__ver.budget': '1', 'u__ver.rupturas': '0'})
    assert r.status_code == 302
    assert ver(mar, 'budget') == 302            # a sessão antiga cai; a pessoa entra de novo e já vê o acesso novo
    mar2 = app.test_client()
    entrar(mar2, 'marcelo')
    assert ver(mar2, 'budget') == 200 and ver(mar2, 'rupturas') == 403


def test_excecao_nao_da_acesso_a_estrutura(app, contas):
    adm = app.test_client()
    entrar(adm, 'paulo')
    salvar_acessos(adm, contas['andreia'], **{'u__estrutura.usuarios': '1', 'u__estrutura.permissoes': '1'})
    a = app.test_client()
    entrar(a, 'andreia')
    assert a.get('/admin/usuarios').status_code == 403 and a.get('/admin/permissoes').status_code == 403


def test_so_admin_mexe_em_acessos(app, contas):
    a = app.test_client()
    entrar(a, 'andreia')
    t = token(a, '/app')
    r = a.post('/admin/usuarios/%d/acessos' % contas['marcelo'], data={'csrf': t, 'u__ver.budget': '1'})
    assert r.status_code == 403
    r = a.post('/admin/permissoes', data={'csrf': t})
    assert r.status_code == 403


def test_matriz_do_nivel_muda_para_todos_do_nivel(app, contas):
    adm = app.test_client()
    entrar(adm, 'paulo')
    t = token(adm, '/admin/permissoes')
    campos = {'csrf': t}
    for n in pm.NIVEIS_EDITAVEIS:
        for chave in pm.CHAVES:
            if pm.padrao(chave, n) == '1' and not (n == 'comprador' and chave == 'ver.moeda'):
                campos['p__%s__%s' % (n, chave)] = '1'
        campos['e__' + n] = pm.ESCOPO_PADRAO[n]
    adm.post('/admin/permissoes', data=campos)           # comprador perde "Moeda de troca"
    for quem in ('marcelo', 'talita'):
        c = app.test_client()
        entrar(c, quem)
        assert ver(c, 'moeda') == 403 and ver(c, 'rupturas') == 200


def test_matriz_grava_no_registro_o_que_mudou(app, contas):
    adm = app.test_client()
    entrar(adm, 'paulo')
    t = token(adm, '/admin/permissoes')
    adm.post('/admin/permissoes', data={'csrf': t})      # tudo desmarcado
    with app.app_context():
        d = bd.get_db().execute("SELECT detalhe FROM auditoria WHERE acao = 'permissoes_nivel'").fetchone()[0]
    assert 'comprador / ver.rupturas: sim -> não' in d


def test_padrao_nao_sobrescreve_o_que_o_admin_escolheu(app, contas):
    with app.app_context():
        db = bd.get_db()
        db.execute("UPDATE perm_nivel SET valor = '0' WHERE nivel = 'comprador' AND chave = 'ver.moeda'")
        db.commit()
        pm.semear(db)
        assert db.execute("SELECT valor FROM perm_nivel WHERE nivel = 'comprador' AND chave = 'ver.moeda'").fetchone()[0] == '0'


def test_ver_cliente_valor_e_configuravel(app, contas):
    adm = app.test_client()
    entrar(adm, 'paulo')
    salvar_acessos(adm, contas['marcelo'], **{'u__ver.cliente_valor': '0'})
    with app.app_context():
        u = bd.get_db().execute("SELECT * FROM usuario WHERE login = 'marcelo'").fetchone()
        assert not pm.resolver(bd.get_db(), u).pode('ver.cliente_valor')
        u = bd.get_db().execute("SELECT * FROM usuario WHERE login = 'talita'").fetchone()
        assert pm.resolver(bd.get_db(), u).pode('ver.cliente_valor')
