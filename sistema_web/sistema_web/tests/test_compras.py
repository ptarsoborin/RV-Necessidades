"""Etapa 3: formulários de compra, aprovação, budget, fornecedores e empresa. As regras são conferidas no servidor."""
import copy
from datetime import date, timedelta

import pytest

from conftest import config_da_pagina, entrar, novo_usuario
from rvn import compras, db as bd
from test_importacao import com_dados  # noqa: F401  (fixture: servidor com relatório e Monitor importados)

CNPJ = '11.222.333/0001-81'
CNPJ2 = '45.997.418/0001-53'


def doc(comprador='MARCELO RE', marca='DAC', codigo='A1', vunit=5.0, qtd=10, **pedido):
    d = {
        'comprador': comprador, 'baseRelatorio': '2026-10-26',
        'fornecedor': {'marca': marca, 'razao': marca + ' COMERCIO LTDA', 'cnpj': CNPJ, 'ie': '', 'contato': 'Fulano', 'email': 'f@x.com', 'fone': '(19) 3333-4444',
                       'endereco': 'RUA A, 10', 'bairro': 'CENTRO', 'cep': '13560-000', 'cidade': 'SAO CARLOS', 'uf': 'SP'},
        'pedido': {'frete': 'CIF', 'freteValor': 0, 'transportadora': '', 'prazoPgto': '30/60 dias', 'formaPgto': 'Boleto bancário',
                   'entrega': (date.today() + timedelta(days=10)).isoformat(), 'localEntrega': '', 'refCotacao': '', 'desconto': 0, 'outras': 0, 'icmsFora': False, 'obs': ''},
        'itens': [{'tipoNec': 'iminente', 'codigo': codigo, 'descricao': 'ITEM ' + codigo, 'un': 'UN', 'qtd': qtd, 'fator': 1, 'vunit': vunit, 'icmsAliq': 0, 'ipiAliq': 0,
                   'origem': 'relatorio', 'precoRef': 5.0}],
    }
    d['pedido'].update(pedido)
    return d


def chamar(cli, metodo, url, corpo=None):
    csrf = config_da_pagina(cli)['csrf']
    return getattr(cli, metodo)(url, json=corpo if corpo is not None else {}, headers={'X-CSRF-Token': csrf})


def entra(app, login):
    c = app.test_client()
    entrar(c, login)
    return c


def criar(cli, **kw):
    r = chamar(cli, 'post', '/api/formularios', doc(**kw))
    assert r.status_code == 200, r.get_data(as_text=True)
    return r.get_json()['pedido']


def acao(cli, p, nome, nota='', **kw):
    return chamar(cli, 'post', '/api/formularios/%s/acao' % p['id'], dict({'acao': nome, 'nota': nota, 'versao': p['versao']}, **kw))


def passo(cli, p, nome, nota=''):
    r = acao(cli, p, nome, nota)
    assert r.status_code == 200, (nome, r.get_data(as_text=True))
    return r.get_json()['pedido']


def configurar_budget(adm, ativa=True, tol=10, meses=None, desc=False):
    r = chamar(adm, 'get', '/api/budget') if False else adm.get('/api/budget')
    j = r.get_json()
    b = j['budget']
    b['ativa'], b['tolPreco'], b['descontarCompromissos'] = ativa, tol, desc
    if meses is not None:
        b['meses'] = meses
    r = chamar(adm, 'put', '/api/budget', {'budget': b, 'versao': j['versao'], 'logs': ['teste']})
    assert r.status_code == 200, r.get_data(as_text=True)
    return r.get_json()


def ym():
    return date.today().strftime('%Y-%m')


# ---------- cálculo e utilidades ----------
def test_funcoes_de_calculo():
    assert compras.r2(1.005) == 1.01 and compras.r2(2.5) == 2.5 and compras.r2(-2.5) == -2.5 and compras.r2(0.1 + 0.2) == 0.3
    assert compras.cnpj_valido(CNPJ) and compras.cnpj_valido(CNPJ2) and not compras.cnpj_valido('11.222.333/0001-82') and not compras.cnpj_valido('00000000000000')
    p = {'itens': [{'qtd': 10, 'vunit': 5, 'icmsAliq': 18, 'ipiAliq': 5}], 'pedido': {'freteValor': 10, 'desconto': 3, 'outras': 1, 'icmsFora': False}}
    assert compras.calc_pedido(p) == {'produtos': 50.0, 'icms': 9.0, 'ipi': 2.5, 'geral': 60.5}      # ICMS só informativo: 50 + 2,5 + 10 + 1 - 3
    p['pedido']['icmsFora'] = True
    assert compras.calc_pedido(p)['geral'] == 69.5
    base = {'itens': [{'qtd': 1, 'vunit': 100, 'icmsAliq': 0, 'ipiAliq': 0}], 'criadoEm': '2026-10-01T12:00:00.000Z', 'aprovacao': None}
    for prazo, n, rec in (('30/60/90 dias', 3, True), ('3x', 3, True), ('à vista', 1, True), ('combinar', 1, False)):
        r = compras.parcelas_do_pedido(dict(base, pedido={'prazoPgto': prazo, 'freteValor': 0, 'desconto': 0, 'outras': 0}))
        assert len(r['parcelas']) == n and r['reconhecido'] is rec and abs(sum(x['valor'] for x in r['parcelas']) - 100) < 1e-9, prazo


# ---------- criar, ver e editar ----------
def test_criar_formulario_o_servidor_manda_no_numero_na_situacao_e_no_historico(app, com_dados):
    mar = entra(app, 'marcelo')
    corpo = doc()
    corpo.update({'id': 'meu-id', 'numero': 'SC-1999-0001', 'status': 'aprovado', 'aprovacao': {'por': 'eu'}, 'historico': [{'acao': 'forjado'}], 'criadoPor': 'Outro'})
    corpo['itens'][0]['precoRef'] = 999                                   # a referência de preço vem do relatório, não do navegador
    r = chamar(mar, 'post', '/api/formularios', corpo)
    p = r.get_json()['pedido']
    assert r.status_code == 200 and p['status'] == 'rascunho' and p['aprovacao'] is None and p['id'] != 'meu-id'
    assert p['numero'].endswith('-0001') and p['numero'].startswith('SC-%d-' % date.today().year)
    assert [h['acao'] for h in p['historico']] == ['Formulário criado'] and p['historico'][0]['quem'] == 'Marcelo (Comprador)' and p['criadoPor'] == 'Marcelo (Comprador)'
    assert p['itens'][0]['precoRef'] == 5.0
    assert criar(mar)['numero'].endswith('-0002')


def test_so_cria_quem_pode_e_so_dentro_do_alcance(app, com_dados):
    mar = entra(app, 'marcelo')
    assert chamar(mar, 'post', '/api/formularios', doc(comprador='TALITA DE', marca='VOLK')).status_code == 403       # comprador de outro
    dan = entra(app, 'daniel')                                                                                      # Diretoria não cria
    assert chamar(dan, 'post', '/api/formularios', doc()).status_code == 403
    anda = entra(app, 'andreia')
    assert chamar(anda, 'post', '/api/formularios', doc(comprador='TALITA DE', marca='VOLK')).status_code == 200      # Gerência cria para qualquer comprador
    novo_usuario(app, 'zzz', 'comprador', comprador='ZZZ', nome='Zzz')                              # comprador sem nenhum item no relatório
    assert chamar(entra(app, 'zzz'), 'post', '/api/formularios', doc()).status_code == 403


def test_comprador_so_ve_os_formularios_dele(app, com_dados):
    mar, tal, anda = entra(app, 'marcelo'), entra(app, 'talita'), entra(app, 'andreia')
    pm = criar(mar)
    pt = criar(anda, comprador='TALITA DE', marca='VOLK', codigo='B1')
    assert [x['id'] for x in mar.get('/api/formularios').get_json()['pedidos']] == [pm['id']]
    assert [x['id'] for x in tal.get('/api/formularios').get_json()['pedidos']] == [pt['id']]
    assert len(anda.get('/api/formularios').get_json()['pedidos']) == 2
    # tentar mexer no formulário de outro responde como se ele não existisse
    assert chamar(tal, 'put', '/api/formularios/' + pm['id'], dict(doc(), versao=pm['versao'])).status_code == 404
    assert acao(tal, pm, 'enviar').status_code == 404
    assert chamar(tal, 'post', '/api/formularios/%s/excluir' % pm['id'], {'versao': pm['versao']}).status_code == 404


def test_sem_permissao_de_ver_formularios_nao_recebe_nada(app, com_dados):
    with app.app_context():
        db = bd.get_db()
        uid = db.execute("SELECT id FROM usuario WHERE login = 'talita'").fetchone()[0]
        db.execute("INSERT INTO perm_usuario (usuario_id, chave, valor) VALUES (?, 'ver.formularios', '0')", (uid,))
        db.commit()
    assert entra(app, 'talita').get('/api/formularios').status_code == 403


def test_editar_conflito_de_versao_e_situacao(app, com_dados):
    mar, anda = entra(app, 'marcelo'), entra(app, 'andreia')
    p = criar(mar)
    novo = dict(doc(qtd=20), versao=p['versao'])
    r = chamar(mar, 'put', '/api/formularios/' + p['id'], novo)
    q = r.get_json()['pedido']
    assert r.status_code == 200 and q['itens'][0]['qtd'] == 20 and q['versao'] == p['versao'] + 1 and [h['acao'] for h in q['historico']][-1] == 'Editado'
    assert chamar(mar, 'put', '/api/formularios/' + p['id'], novo).status_code == 409                  # versão velha
    q = passo(mar, q, 'enviar')
    assert q['status'] == 'pendente'
    assert chamar(mar, 'put', '/api/formularios/' + p['id'], dict(doc(qtd=30), versao=q['versao'])).status_code == 403   # comprador não edita o que está em aprovação
    r = chamar(anda, 'put', '/api/formularios/' + p['id'], dict(doc(qtd=30), versao=q['versao']))                       # a Gerência edita
    assert r.status_code == 200 and r.get_json()['pedido']['itens'][0]['qtd'] == 30


def test_editar_nao_muda_numero_situacao_nem_aprovacao(app, com_dados):
    mar = entra(app, 'marcelo')
    p = criar(mar)
    corpo = dict(doc(), versao=p['versao'], numero='X', status='aprovado', aprovacao={'por': 'eu'}, id='outro', historico=[])
    q = chamar(mar, 'put', '/api/formularios/' + p['id'], corpo).get_json()['pedido']
    assert q['numero'] == p['numero'] and q['status'] == 'rascunho' and q['aprovacao'] is None and q['id'] == p['id']


def test_validacao_barra_o_envio(app, com_dados):
    mar = entra(app, 'marcelo')
    p = criar(mar)
    ruim = doc()
    ruim['fornecedor'].update({'cnpj': '11.111.111/0001-11', 'uf': ''})
    ruim['pedido']['entrega'] = (date.today() - timedelta(days=2)).isoformat()
    q = chamar(mar, 'put', '/api/formularios/' + p['id'], dict(ruim, versao=p['versao'])).get_json()['pedido']
    r = acao(mar, q, 'enviar')
    j = r.get_json()
    assert r.status_code == 422 and any('CNPJ' in e for e in j['erros']) and any('UF' in e for e in j['erros']) and any('passado' in e for e in j['erros'])
    assert mar.get('/api/formularios').get_json()['pedidos'][0]['status'] == 'rascunho'            # nada mudou


# ---------- aprovação ----------
def test_quem_aprova_e_quem_nao_aprova(app, com_dados):
    mar, anda, dan, tal = entra(app, 'marcelo'), entra(app, 'andreia'), entra(app, 'daniel'), entra(app, 'talita')
    p = passo(mar, criar(mar), 'enviar')
    assert acao(mar, p, 'aprovar').status_code == 403                    # comprador não aprova (e budget está desligado)
    assert acao(mar, p, 'budget').status_code == 403
    assert acao(tal, p, 'aprovar').status_code == 404                    # nem enxerga
    assert acao(mar, p, 'devolver', 'x').status_code == 403
    q = passo(dan, p, 'aprovar')                                          # Diretoria aprova
    assert q['status'] == 'aprovado' and q['aprovacao']['por'] == 'Daniel (Diretoria)' and q['historico'][-1]['acao'] == 'Aprovado'
    assert acao(dan, q, 'cancelar', 'motivo').status_code == 403         # Diretoria não cancela aprovado
    c = passo(anda, q, 'cancelar', 'fornecedor desistiu')
    assert c['status'] == 'cancelado'
    assert acao(anda, c, 'cancelar', 'de novo').status_code == 403       # só aprovado se cancela


def test_devolver_e_recusar_exigem_observacao(app, com_dados):
    mar, anda = entra(app, 'marcelo'), entra(app, 'andreia')
    p = passo(mar, criar(mar), 'enviar')
    r = acao(anda, p, 'devolver')
    assert r.status_code == 422 and 'observação' in r.get_json()['erro']
    d = passo(anda, p, 'devolver', 'ajuste a quantidade')
    assert d['status'] == 'devolvido' and d['historico'][-1]['nota'] == 'ajuste a quantidade'
    e = passo(mar, d, 'enviar')                                           # o comprador corrige e reenvia
    assert e['status'] == 'pendente'
    assert passo(anda, e, 'recusar', 'não vamos comprar')['status'] == 'recusado'


def test_aprovar_direto_do_rascunho_e_nº_do_protheus(app, com_dados):
    anda, mar = entra(app, 'andreia'), entra(app, 'marcelo')
    p = criar(anda)
    q = passo(anda, p, 'aprovar', 'ok')
    assert q['historico'][-1]['acao'] == 'Aprovado (direto do rascunho)'
    assert acao(entra(app, 'talita'), q, 'protheus', valor='123').status_code == 404
    r = acao(mar, q, 'protheus', valor='PC 4567')                         # o comprador dono informa o número
    assert r.status_code == 200 and r.get_json()['pedido']['protheus'] == 'PC 4567'
    assert chamar(entra(app, 'daniel'), 'get', '/api/formularios').status_code == 200


def test_preco_acima_da_tolerancia_so_com_permissao_e_com_justificativa(app, com_dados):
    mar, anda, adm = entra(app, 'marcelo'), entra(app, 'andreia'), entra(app, 'paulo')
    p = criar(mar)
    caro = dict(doc(vunit=6.0), versao=p['versao'])                       # 20% acima do último preço (tolerância 10%)
    r = chamar(mar, 'put', '/api/formularios/' + p['id'], caro)
    assert r.status_code == 422 and 'acima' in r.get_json()['erro'] and 'tolerância' in r.get_json()['titulo']
    pa = criar(anda)
    r = chamar(anda, 'put', '/api/formularios/' + pa['id'], dict(doc(vunit=6.0), versao=pa['versao']))               # Andreia não tem a permissão
    assert r.status_code == 422
    pad = criar(adm)
    q = chamar(adm, 'put', '/api/formularios/' + pad['id'], dict(doc(vunit=6.0), versao=pad['versao'])).get_json()['pedido']  # o admin ajusta
    assert q['itens'][0]['vunit'] == 6.0 and any(h['acao'].startswith('Preço acima') for h in q['historico'])
    q = passo(adm, q, 'enviar')
    # a Gerência não aprova com preço acima; o admin só com justificativa
    assert acao(anda, q, 'aprovar', 'ok').status_code == 422
    r = acao(adm, q, 'aprovar')
    assert r.status_code == 422 and 'Justificativa' in r.get_json()['titulo']
    ok = passo(adm, q, 'aprovar', 'único fornecedor com estoque')
    assert ok['status'] == 'aprovado' and any(h['acao'] == 'Preço acima da tolerância aprovado' and 'único fornecedor' in h['nota'] for h in ok['historico'])


def test_preco_acima_ja_gravado_nao_trava_outras_edicoes(app, com_dados):
    adm, anda = entra(app, 'paulo'), entra(app, 'andreia')
    p = criar(adm)
    q = chamar(adm, 'put', '/api/formularios/' + p['id'], dict(doc(vunit=6.0), versao=p['versao'])).get_json()['pedido']
    r = chamar(anda, 'put', '/api/formularios/' + p['id'], dict(doc(vunit=6.0, qtd=11), versao=q['versao']))       # só a quantidade mudou
    assert r.status_code == 200


def test_tolerancia_muda_so_com_a_permissao_de_regras(app, com_dados):
    anda, adm = entra(app, 'andreia'), entra(app, 'paulo')
    j = anda.get('/api/budget').get_json()
    b = dict(j['budget'], tolPreco=50)
    assert chamar(anda, 'put', '/api/budget', {'budget': b, 'versao': j['versao'], 'logs': []}).status_code == 403
    b = dict(j['budget'], ativa=True)
    assert chamar(anda, 'put', '/api/budget', {'budget': b, 'versao': j['versao'], 'logs': []}).status_code == 403
    r = chamar(adm, 'put', '/api/budget', {'budget': dict(j['budget'], tolPreco=50), 'versao': j['versao'], 'logs': ['Tolerância de preço: 10% para 50%']})
    assert r.status_code == 200 and r.get_json()['budget']['tolPreco'] == 50 and r.get_json()['budget']['log'][-1]['quem'] == 'Paulo (Admin)'
    assert chamar(adm, 'put', '/api/budget', {'budget': dict(j['budget'], tolPreco=-1), 'versao': r.get_json()['versao']}).status_code in (403, 422)


# ---------- budget ----------
def test_lancar_budget_so_com_permissao_e_so_do_mes_atual_em_diante(app, com_dados):
    anda, dan, mar, adm = entra(app, 'andreia'), entra(app, 'daniel'), entra(app, 'marcelo'), entra(app, 'paulo')
    assert mar.get('/api/budget').status_code == 403                      # comprador não vê o budget
    j = anda.get('/api/budget').get_json()
    meses = {ym(): {'M:dac': {'marca': 'DAC', 'valor': 1000.0, 'acresc': []}}}
    r = chamar(anda, 'put', '/api/budget', {'budget': dict(j['budget'], meses=meses), 'versao': j['versao'], 'logs': ['Budget de DAC']})
    assert r.status_code == 200
    e = r.get_json()['budget']['meses'][ym()]['M:dac']
    assert e['por'] == 'Andreia (Gerência)' and e['em']                    # carimbo feito pelo servidor
    j2 = dan.get('/api/budget').get_json()                                # a Diretoria só consulta
    assert j2['budget']['meses'][ym()]['M:dac']['valor'] == 1000
    assert chamar(dan, 'put', '/api/budget', {'budget': dict(j2['budget'], meses={ym(): {'M:dac': {'marca': 'DAC', 'valor': 5, 'acresc': []}}}), 'versao': j2['versao']}).status_code == 403
    # mês encerrado não muda
    passado = (date.today().replace(day=1) - timedelta(days=1)).strftime('%Y-%m')
    r = chamar(anda, 'put', '/api/budget', {'budget': dict(j2['budget'], meses=dict(meses, **{passado: {'M:dac': {'marca': 'DAC', 'valor': 1, 'acresc': []}}})), 'versao': r.get_json()['versao']})
    assert r.status_code == 422 and 'encerrou' in r.get_json()['erro']
    # versão velha
    assert chamar(anda, 'put', '/api/budget', {'budget': j['budget'], 'versao': j['versao']}).status_code == 409
    # valores inválidos
    j3 = anda.get('/api/budget').get_json()
    assert chamar(anda, 'put', '/api/budget', {'budget': dict(j3['budget'], meses={ym(): {'M:dac': {'marca': 'DAC', 'valor': -5, 'acresc': []}}}), 'versao': j3['versao']}).status_code == 422


def test_aprovar_por_budget_exige_budget_ligado_saldo_e_fornecedor_homologado(app, com_dados):
    mar, anda, adm = entra(app, 'marcelo'), entra(app, 'andreia'), entra(app, 'paulo')
    p = passo(mar, criar(mar), 'enviar')
    configurar_budget(adm, ativa=True, meses={ym(): {'M:dac': {'marca': 'DAC', 'valor': 1000.0, 'acresc': []}}})
    novo = criar(mar, codigo='12345', marca='DAC')                       # outro pedido, mesmo fornecedor
    r = acao(mar, novo, 'budget')
    assert r.status_code == 422 and any('não aprovado pela gerência' in m for m in r.get_json()['erros'])     # primeiro pedido do CNPJ: a gerência aprova antes
    passo(anda, p, 'aprovar')                                             # a gerência aprova (homologa o fornecedor); consome R$ 50
    novo = mar.get('/api/formularios').get_json()['pedidos'][-1]
    q = passo(mar, novo, 'budget')
    assert q['status'] == 'aprovado' and q['aprovacao']['tipo'] == 'budget' and q['aprovacao']['regra']['saldoAntes'] == 950.0
    assert any(h['acao'] == 'Aprovado por budget' for h in q['historico'])
    assert acao(anda, q, 'revisar').status_code == 200                    # a gerência marca como revisado
    assert acao(anda, mar.get('/api/formularios').get_json()['pedidos'][-1], 'revisar').status_code == 403   # só uma vez


def test_aprovar_por_budget_barra_saldo_insuficiente_e_preco_acima(app, com_dados):
    mar, anda, adm = entra(app, 'marcelo'), entra(app, 'andreia'), entra(app, 'paulo')
    passo(anda, criar(anda), 'aprovar')                                   # homologa o fornecedor DAC
    configurar_budget(adm, ativa=True, meses={ym(): {'M:dac': {'marca': 'DAC', 'valor': 100.0, 'acresc': []}}})
    gordo = criar(mar, codigo='12345', qtd=30)                            # 30 x 5 = 150 > saldo 50 (100 - 50 já aprovados)
    r = acao(mar, gordo, 'budget')
    assert r.status_code == 422 and any('excede o saldo' in m for m in r.get_json()['erros'])
    sem_budget = criar(mar, codigo='A3', marca='VOLK')
    r = acao(mar, sem_budget, 'budget')
    assert r.status_code == 422 and any('não tem budget definido' in m for m in r.get_json()['erros'])
    # preço acima da tolerância: o comprador nem consegue salvar; no budget a regra também vale
    assert chamar(mar, 'put', '/api/formularios/' + gordo['id'], dict(doc(codigo='12345', vunit=9.0), versao=gordo['versao'])).status_code == 422


def test_budget_desligado_ou_sem_permissao_nao_aprova(app, com_dados):
    mar, anda, adm = entra(app, 'marcelo'), entra(app, 'andreia'), entra(app, 'paulo')
    passo(anda, criar(anda), 'aprovar')
    configurar_budget(adm, ativa=True, meses={ym(): {'M:dac': {'marca': 'DAC', 'valor': 9000.0, 'acresc': []}}})
    p = criar(mar, codigo='12345')
    assert acao(mar, p, 'budget').status_code == 200
    configurar_budget(adm, ativa=False)
    q = criar(mar, codigo='A3', marca='DAC')
    assert acao(mar, q, 'budget').status_code == 403                      # desligado
    configurar_budget(adm, ativa=True)
    assert acao(anda, q, 'budget').status_code == 403                     # a Gerência não tem a permissão de aprovar por budget


def test_compromissos_de_meses_anteriores_so_descontam_se_ligado(app, com_dados):
    adm, anda = entra(app, 'paulo'), entra(app, 'andreia')
    # um pedido aprovado em agosto, pago em 3x (30/60/90), compromete parte do mês atual
    with app.app_context():
        db = bd.get_db()
        todos = compras.pedidos_todos(db)
    p = passo(anda, criar(anda), 'aprovar')
    with app.app_context():
        db = bd.get_db()
        r = db.execute('SELECT * FROM pedido WHERE id = ?', (p['id'],)).fetchone()
        import json
        d = json.loads(r['dados'])
        d['aprovacao']['em'] = (date.today() - timedelta(days=45)).isoformat() + 'T12:00:00.000Z'
        d['pedido']['prazoPgto'] = '30/60/90 dias'
        db.execute('UPDATE pedido SET dados = ? WHERE id = ?', (json.dumps(d), p['id']))
        db.commit()
        b, _v = compras.budget_ler(db)
        antes = compras.saldo_budget(b, compras.pedidos_todos(db), 'DAC', ym())
        b['descontarCompromissos'] = True
        depois = compras.saldo_budget(b, compras.pedidos_todos(db), 'DAC', ym())
    assert antes['compromissos'] > 0 and antes['saldo'] == antes['budget'] - antes['aprovado'] - antes['pendente']
    assert depois['saldo'] == round(antes['saldo'] - antes['compromissos'], 2)


def test_avaliar_mostra_o_budget_so_para_quem_pode_ver(app, com_dados):
    mar, anda, adm = entra(app, 'marcelo'), entra(app, 'andreia'), entra(app, 'paulo')
    passo(anda, criar(anda), 'aprovar')
    configurar_budget(adm, ativa=True, meses={ym(): {'M:dac': {'marca': 'DAC', 'valor': 500.0, 'acresc': []}}})
    r = chamar(mar, 'post', '/api/formularios/avaliar', doc(codigo='12345')).get_json()
    assert 'info' not in r and r['elegivel']['ok'] is True and r['ativa'] is True and r['precoRef'] == [5.0]      # o comprador vê só se pode, não o budget
    r = chamar(anda, 'post', '/api/formularios/avaliar', doc()).get_json()
    assert 'elegivel' not in r and any('Budget de' in l for l in r['info'])
    assert chamar(entra(app, 'talita'), 'post', '/api/formularios/avaliar', doc()).status_code in (200, 403)


# ---------- excluir ----------
def test_excluir_so_nas_situacoes_permitidas(app, com_dados):
    mar, anda = entra(app, 'marcelo'), entra(app, 'andreia')
    p = criar(mar)
    q = passo(mar, p, 'enviar')
    assert chamar(mar, 'post', '/api/formularios/%s/excluir' % p['id'], {'versao': q['versao']}).status_code == 403      # em aprovação
    d = passo(anda, q, 'devolver', 'corrigir')
    assert chamar(mar, 'post', '/api/formularios/%s/excluir' % p['id'], {'versao': 1}).status_code == 409                # versão velha
    assert chamar(mar, 'post', '/api/formularios/%s/excluir' % p['id'], {'versao': d['versao']}).status_code == 200
    assert mar.get('/api/formularios').get_json()['pedidos'] == []
    with app.app_context():
        assert 'pedido_excluido' in [x['acao'] for x in bd.get_db().execute('SELECT acao FROM auditoria')]


# ---------- fornecedores ----------
def test_cadastro_de_fornecedor_nasce_do_formulario_e_so_a_gerencia_altera(app, com_dados):
    mar, anda, tal = entra(app, 'marcelo'), entra(app, 'andreia'), entra(app, 'talita')
    passo(mar, criar(mar), 'enviar')                                      # o comprador cria o cadastro que ainda não existe
    lista = anda.get('/api/fornecedores').get_json()['fornecedores']
    assert [f['marca'] for f in lista] == ['DAC'] and lista[0]['cnpj'] == CNPJ and lista[0]['origem'] == 'formulário'
    # o comprador não altera um cadastro existente pelo formulário
    p2 = criar(mar, codigo='12345', marca='DAC')
    mudado = doc(codigo='12345')
    mudado['fornecedor']['razao'] = 'OUTRA RAZAO LTDA'
    q = chamar(mar, 'put', '/api/formularios/' + p2['id'], dict(mudado, versao=p2['versao'])).get_json()['pedido']
    passo(mar, q, 'enviar')
    assert anda.get('/api/fornecedores').get_json()['fornecedores'][0]['razao'] == 'DAC COMERCIO LTDA'
    # a gerência aprovando passa a usar os dados do formulário e deixa isso no histórico
    a = passo(anda, mar.get('/api/formularios').get_json()['pedidos'][-1], 'aprovar')
    assert any('Cadastro do fornecedor atualizado' in h['acao'] and 'Razão Social' in h['nota'] for h in a['historico'])
    assert anda.get('/api/fornecedores').get_json()['fornecedores'][0]['razao'] == 'OUTRA RAZAO LTDA'
    # lote: só com permissão de cadastro
    reg = {'marca': 'VOLK', 'razao': 'VOLK SA', 'cnpj': CNPJ2, 'uf': 'SP'}
    assert chamar(mar, 'post', '/api/fornecedores/lote', {'registros': [reg]}).status_code == 403
    assert chamar(anda, 'post', '/api/fornecedores/lote', {'registros': [dict(reg, cnpj='11111111111111')]}).status_code == 422
    assert chamar(anda, 'post', '/api/fornecedores/lote', {'registros': [reg], 'origem': 'planilha x.xlsx'}).status_code == 200
    assert sorted(f['marca'] for f in anda.get('/api/fornecedores').get_json()['fornecedores']) == ['DAC', 'VOLK']


def test_comprador_so_recebe_o_cadastro_das_marcas_dele(app, com_dados):
    anda, mar, tal = entra(app, 'andreia'), entra(app, 'marcelo'), entra(app, 'talita')
    regs = [{'marca': m, 'razao': m + ' LTDA', 'cnpj': CNPJ, 'uf': 'SP'} for m in ('DAC', 'VOLK', 'XPTO')]
    assert chamar(anda, 'post', '/api/fornecedores/lote', {'registros': regs}).status_code == 200
    # Marcelo tem itens das Marcas DAC, BRW e VOLK no relatório; XPTO é de ninguém
    assert sorted(f['marca'] for f in mar.get('/api/fornecedores').get_json()['fornecedores']) == ['DAC', 'VOLK']
    assert sorted(f['marca'] for f in tal.get('/api/fornecedores').get_json()['fornecedores']) == ['VOLK']
    assert len(anda.get('/api/fornecedores').get_json()['fornecedores']) == 3


# ---------- empresa ----------
def test_dados_da_empresa_so_o_admin_altera(app, com_dados):
    adm, anda, mar = entra(app, 'paulo'), entra(app, 'andreia'), entra(app, 'marcelo')
    emp = {'razao': 'AUTOPEL LTDA', 'cnpj': CNPJ2, 'cidade': 'SAO CARLOS', 'uf': 'SP'}
    assert chamar(anda, 'put', '/api/empresa', {'empresa': emp}).status_code == 403
    assert chamar(mar, 'put', '/api/empresa', {'empresa': emp}).status_code == 403
    assert chamar(adm, 'put', '/api/empresa', {'empresa': dict(emp, cnpj='123')}).status_code == 422
    assert chamar(adm, 'put', '/api/empresa', {'empresa': emp}).status_code == 200
    assert mar.get('/api/empresa').get_json()['empresa']['razao'] == 'AUTOPEL LTDA'      # quem cria formulário precisa do endereço da empresa


# ---------- alcance por marcas ----------
def test_alcance_por_marca_ve_e_age_so_nas_marcas_escolhidas(app, com_dados):
    novo_usuario(app, 'carlos', 'gerencia', nome='Carlos')
    with app.app_context():
        db = bd.get_db()
        uid = db.execute("SELECT id FROM usuario WHERE login = 'carlos'").fetchone()[0]
        db.execute("INSERT INTO perm_usuario (usuario_id, chave, valor) VALUES (?, 'escopo.dados', 'selecionados')", (uid,))
        db.execute("INSERT INTO escopo_usuario (usuario_id, tipo, valor) VALUES (?, 'marca', 'volk')", (uid,))
        db.commit()
    anda, car = entra(app, 'andreia'), entra(app, 'carlos')
    pd = criar(anda, marca='DAC')
    pv = criar(anda, marca='VOLK', codigo='A3')
    assert [x['id'] for x in car.get('/api/formularios').get_json()['pedidos']] == [pv['id']]
    assert acao(car, pd, 'aprovar').status_code == 404
    assert acao(car, pv, 'aprovar', 'ok').status_code == 200
    # o budget depende de todos os formulários: quem enxerga só parte não o altera
    j = car.get('/api/budget').get_json()
    assert chamar(car, 'put', '/api/budget', {'budget': dict(j['budget'], meses={ym(): {'M:volk': {'marca': 'VOLK', 'valor': 1, 'acresc': []}}}), 'versao': j['versao']}).status_code == 403


def test_historico_e_auditoria_registram_quem_fez(app, com_dados):
    mar, anda = entra(app, 'marcelo'), entra(app, 'andreia')
    p = passo(mar, criar(mar), 'enviar')
    q = passo(anda, p, 'aprovar', 'ok')
    assert [h['quem'] for h in q['historico']] == ['Marcelo (Comprador)', 'Marcelo (Comprador)', 'Andreia (Gerência)']
    with app.app_context():
        acoes = [x['acao'] for x in bd.get_db().execute('SELECT acao FROM auditoria')]
    assert {'pedido_criado', 'pedido_enviar', 'pedido_aprovar'} <= set(acoes)


def test_gravar_e_agir_na_mesma_chamada_mantem_a_versao_quando_a_acao_e_recusada(app, com_dados):
    mar = entra(app, 'marcelo')
    p = criar(mar)
    ruim = doc(qtd=7)
    ruim['fornecedor']['cnpj'] = '11.111.111/0001-11'                      # inválido: o envio será recusado, mas a edição fica gravada
    r = acao(mar, p, 'enviar', conteudo=ruim)
    j = r.get_json()
    assert r.status_code == 422 and j['pedido']['itens'][0]['qtd'] == 7 and j['pedido']['versao'] == p['versao'] + 1 and j['pedido']['status'] == 'rascunho'
    certo = doc(qtd=7)
    r = chamar(mar, 'post', '/api/formularios/%s/acao' % p['id'], {'acao': 'enviar', 'versao': j['pedido']['versao'], 'conteudo': certo})
    assert r.status_code == 200 and r.get_json()['pedido']['status'] == 'pendente'
    # protheus: não existe conteúdo editável, vale a versão enviada
    anda = entra(app, 'andreia')
    q = passo(anda, r.get_json()['pedido'], 'aprovar')
    assert acao(mar, q, 'protheus', valor='1', **{}).status_code == 200
    assert chamar(mar, 'post', '/api/formularios/%s/acao' % p['id'], {'acao': 'protheus', 'versao': 1, 'valor': '2', 'conteudo': certo}).status_code == 409


def test_proposta_de_moeda_de_troca_vai_para_o_historico(app, com_dados):
    mar = entra(app, 'marcelo')
    corpo = doc()
    corpo['moedaTroca'] = {'geradaEm': '2026-11-01T10:00:00.000Z', 'por': 'x', 'baseRelatorio': '2026-10-26', 'criterio': 'PP zero', 'total': 120.5, 'obs': '',
                           'itens': [{'codigo': 'Z1', 'descricao': 'PARADO', 'disp': 10, 'dias': None, 'exc': 10, 'preco': 12.05, 'valor': 120.5}]}
    p = chamar(mar, 'post', '/api/formularios', corpo).get_json()['pedido']
    assert [h['acao'] for h in p['historico']] == ['Formulário criado', 'Proposta de moeda de troca anexada'] and p['moedaTroca']['total'] == 120.5
    sem = dict(doc(), versao=p['versao'])                                  # o comprador remove a proposta
    q = chamar(mar, 'put', '/api/formularios/' + p['id'], sem).get_json()['pedido']
    assert q['moedaTroca'] is None and q['historico'][-2]['acao'] == 'Proposta de moeda de troca removida'
