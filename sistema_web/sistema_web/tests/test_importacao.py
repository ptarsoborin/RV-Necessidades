"""Etapa 2: leitura das planilhas, importação no servidor e entrega dos dados por alcance de cada pessoa."""
import io
import json
import random
from datetime import date, datetime

import pytest
from openpyxl import Workbook

from conftest import config_da_pagina, entrar, novo_usuario
from rvn import db as bd, leitor, permissoes as pm

CAB_RV = ['Comprador', 'Codigo', 'Descricao', 'Marca', 'PontoPedido', 'Comprar.', 'Ult.Preco', 'Valor Total', 'MedContr', 'MedVenda', 'Total Media', 'Vlr Estoque',
          'Fisico', 'Reserva', 'Disponivel', 'VendProt', 'Ruptura', 'Comprado', 'DT_ENTREGA', 'Prc_Compra.', 'ULT_COMPRA', 'PEDIDO', 'EstDias', 'Grupo']
CAB_MON = ['Filial', 'Num. Pedido', 'Cod. Cliente', 'Loja Cliente', 'Cliente', 'Cod. Transportadora', 'Nome Transportadora', 'Data Faturamento', 'Liberacao',
           'Item do Pedido', 'Cod. Autopel', 'Cod. Produto', 'Descr. Produto', 'Quantidade Vendida', 'Valor', 'Data PCP', 'Situação Estoque', 'Nota/Série',
           'Credito', 'Arte', 'Grupo', 'Subgrupo', 'Familia', 'Tipo', 'OP', 'Atraso']


def linha_rv(comprador, codigo, marca='VOLK', **kw):
    base = {'Comprador': comprador, 'Codigo': codigo, 'Descricao': 'ITEM ' + str(codigo), 'Marca': marca, 'PontoPedido': 0, 'Comprar.': 0, 'Ult.Preco': 5.0,
            'Valor Total': 0, 'MedContr': 0, 'MedVenda': 0, 'Total Media': 0, 'Vlr Estoque': 0, 'Fisico': 0, 'Reserva': 0, 'Disponivel': 0, 'VendProt': 0,
            'Ruptura': 0, 'Comprado': 0, 'DT_ENTREGA': None, 'Prc_Compra.': 0, 'ULT_COMPRA': datetime(2026, 10, 20), 'PEDIDO': '', 'EstDias': 0, 'Grupo': 'G1'}
    base.update(kw)
    return [base[c] for c in CAB_RV]


def xlsx(cab, linhas, aba='Geral', titulo=True, extra_abas=()):
    wb = Workbook()
    ws = wb.active
    ws.title = aba
    if titulo:
        ws.append(['RV NECESSIDADES - Autopel'])
        ws.append([])
    ws.append(cab)
    for l in linhas:
        ws.append(l)
    for nome in extra_abas:
        wb.create_sheet(nome).append(['lixo'])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def relatorio_basico():
    return xlsx(CAB_RV, [
        linha_rv('MARCELO RE', 'A1', 'DAC', **{'Comprar.': 10, 'Disponivel': 0, 'VendProt': 3, 'Ruptura': -3}),
        linha_rv('MARCELO RE', 12345, 'BRW', **{'Comprar.': 0}),                        # código numérico no Excel
        linha_rv('MARCELO RE ', 'A3', 'VOLK', **{'Comprar.': 4, 'Comprado': 40, 'Ruptura': -2, 'DT_ENTREGA': datetime(2026, 10, 28), 'PEDIDO': '110001'}),
        linha_rv('TALITA DE', 'B1', 'VOLK', **{'Comprar.': 7}),
        linha_rv('TALITA DE', 'B2', 'CREDEAL'),
        linha_rv('', 'C1', 'SEM', **{'Comprar.': 1}),
    ])


def linha_mon(pedido, item, codigo, situacao='Bloqueado', cliente='CLIENTE X', valor=100.0, qtd=2):
    base = {'Filial': '01', 'Num. Pedido': pedido, 'Cod. Cliente': '000123', 'Loja Cliente': '01', 'Cliente': cliente, 'Cod. Transportadora': '', 'Nome Transportadora': 'TRANSP',
            'Data Faturamento': datetime(2026, 10, 27), 'Liberacao': '', 'Item do Pedido': item, 'Cod. Autopel': '', 'Cod. Produto': codigo, 'Descr. Produto': 'ITEM ' + str(codigo),
            'Quantidade Vendida': qtd, 'Valor': valor, 'Data PCP': None, 'Situação Estoque': situacao, 'Nota/Série': '/', 'Credito': '', 'Arte': '', 'Grupo': '', 'Subgrupo': '',
            'Familia': '', 'Tipo': 'N', 'OP': '', 'Atraso': 3}
    return [base[c] for c in CAB_MON]


def monitor_basico():
    return xlsx(CAB_MON, [
        linha_mon('P1', '01', 'A1'),
        linha_mon('P1', '02', 'B1'),                       # mesmo pedido, produto de outro comprador
        linha_mon('P1', '03', 'B2', situacao='Liberado'),
        linha_mon('P2', '01', 'B1', cliente='OUTRO CLIENTE', valor=50.0, qtd=1),
        linha_mon('P3', '01', 'ZZ9'),                      # produto fora do relatório
    ], aba='Monitor', titulo=False)


# Arquivos gerados uma vez só: o Excel grava a hora de criação dentro do arquivo, então duas gerações nunca são idênticas.
RV_BYTES = relatorio_basico()
MON_BYTES = monitor_basico()


# ---------- ajuda para falar com o servidor ----------
def post_api(cli, url, arquivo=None, nome='RV_NECESSIDADES_2026-10-26.xlsx', **campos):
    csrf = config_da_pagina(cli)['csrf']
    dados = dict(campos)
    if arquivo is not None:
        dados['arquivo'] = (io.BytesIO(arquivo), nome)
    return cli.post(url, data=dados, headers={'X-CSRF-Token': csrf}, content_type='multipart/form-data')


def compacto(resp):
    d = json.loads(resp.get_data(as_text=True))
    return [dict(zip(d['campos'], l)) for l in d['linhas']]


@pytest.fixture()
def com_dados(app, contas):
    adm = app.test_client()
    entrar(adm, 'paulo')
    r = post_api(adm, '/api/relatorios', RV_BYTES)
    assert r.status_code == 200, r.get_data(as_text=True)
    m = post_api(adm, '/api/monitor', MON_BYTES, nome='Monitor_Estoque_28-10-2026.xlsx')
    assert m.status_code == 200, m.get_data(as_text=True)
    return {'rid': r.get_json()['id'], 'mid': m.get_json()['id'], 'adm': adm}


# ---------- leitor ----------
def test_leitor_le_o_relatorio_como_a_versao_de_teste():
    r = leitor.ler_relatorio(relatorio_basico())
    assert r['aba'] == 'Geral' and len(r['linhas']) == 6
    cods = [x['codigo'] for x in r['linhas']]
    assert '12345' in cods and '12345.0' not in cods                    # código numérico não vira "12345.0"
    assert r['linhas'][2]['comprador'] == 'MARCELO RE'                  # espaço no fim é aparado
    assert r['linhas'][2]['dtentrega'] == '2026-10-28' and r['linhas'][0]['dtentrega'] is None
    assert r['linhas'][0]['comprar'] == 10.0 and r['linhas'][0]['ultcompra'] == '2026-10-20'


def test_leitor_numeros_e_datas_em_texto():
    assert leitor.para_num('1.234,56') == 1234.56 and leitor.para_num('12.5') == 12.5 and leitor.para_num('abc') is None
    assert leitor.para_num('') is None and leitor.para_num(None) is None
    assert leitor.para_data('28/10/2026') == '2026-10-28' and leitor.para_data(datetime(2026, 10, 28, 15, 0)) == '2026-10-28'
    assert leitor.para_data(46323) == '2026-10-28' and leitor.para_data('lixo') is None


def test_leitor_barra_arquivo_errado():
    with pytest.raises(leitor.ErroImportacao, match='abrir'):
        leitor.ler_relatorio(b'isso nao e uma planilha')
    with pytest.raises(leitor.ErroImportacao, match='Geral') as e:
        leitor.ler_relatorio(xlsx(CAB_RV, [linha_rv('A', 'X1')], aba='Marcelo', extra_abas=('Outra',)))
    assert 'Marcelo' in e.value.itens
    sem_col = [c for c in CAB_RV if c != 'Ruptura']
    with pytest.raises(leitor.ErroImportacao, match='obrigatórias') as e:
        leitor.ler_relatorio(xlsx(sem_col, []))
    assert 'Ruptura' in e.value.itens
    with pytest.raises(leitor.ErroImportacao, match='repetidos') as e:
        leitor.ler_relatorio(xlsx(CAB_RV, [linha_rv('A', 'X1'), linha_rv('B', 'X1')]))
    assert e.value.itens == ['X1']
    with pytest.raises(leitor.ErroImportacao, match='Codigo'):
        leitor.ler_relatorio(xlsx(['a', 'b'], [[1, 2]]))


def test_leitor_aba_unica_e_linhas_sem_codigo():
    r = leitor.ler_relatorio(xlsx(CAB_RV, [linha_rv('A', 'X1'), linha_rv('A', ''), linha_rv('B', 'X2')], aba='Planilha1'))
    textos = ' | '.join(n['texto'] for n in r['notas'])
    assert len(r['linhas']) == 2 and 'sem código' in textos and 'só aba' in textos


def test_data_do_nome_e_validacao():
    assert leitor.data_do_nome('RV_NECESSIDADES_2026-10-26.xlsx') == '2026-10-26'
    assert leitor.data_do_nome('Monitor_Estoque_28-10-2026.xlsx') == '2026-10-28'
    assert leitor.data_do_nome('rel20261022.xlsx') == '2026-10-22' and leitor.data_do_nome('rel_22102026.xlsx') == '2026-10-22'
    assert leitor.data_do_nome('sem data.xlsx') is None and leitor.data_do_nome('rel_2026-13-40.xlsx') is None
    hoje = date(2026, 11, 17)
    assert leitor.validar_data_ref('', 'x_2026-10-26.xlsx', hoje) == ('2026-10-26', 'nome do arquivo')
    assert leitor.validar_data_ref('2026-10-26', 'x.xlsx', hoje) == ('2026-10-26', 'campo')
    with pytest.raises(leitor.ErroImportacao, match='Informe a data'):
        leitor.validar_data_ref('', 'x.xlsx', hoje)
    with pytest.raises(leitor.ErroImportacao, match='futuro'):
        leitor.validar_data_ref('2026-12-01', 'x.xlsx', hoje)
    with pytest.raises(leitor.ErroImportacao, match='diferente'):
        leitor.validar_data_ref('2026-10-25', 'x_2026-10-26.xlsx', hoje)


def test_leitor_monitor():
    r = leitor.ler_monitor(monitor_basico())
    assert len(r['linhas']) == 5 and r['aba'] == 'Monitor'
    assert r['linhas'][0]['nota'] == '' and r['linhas'][0]['datafat'] == '2026-10-27'
    assert leitor.resumo_monitor(r['linhas']) == {'linhas': 5, 'bloqueadas': 4, 'pedidos': 3, 'produtos': 3}
    with pytest.raises(leitor.ErroImportacao, match='Monitor de Estoque'):
        leitor.ler_monitor(relatorio_basico())


# ---------- importação pelo servidor ----------
def test_importar_relatorio_grava_e_registra(com_dados, app):
    with app.app_context():
        db = bd.get_db()
        r = db.execute('SELECT * FROM relatorio').fetchone()
        assert r['ref_at'] == '2026-10-26' and r['itens'] == 6 and r['comprar_n'] == 4 and r['imin_n'] == 1 and r['ent_n'] == 1
        assert r['importado_por'] == 'Paulo'
        acoes = [x['acao'] for x in db.execute('SELECT acao FROM auditoria')]
    assert 'importar_relatorio' in acoes and 'importar_monitor' in acoes


def test_repetir_o_arquivo_pede_confirmacao(com_dados):
    adm = com_dados['adm']
    r = post_api(adm, '/api/relatorios', RV_BYTES)
    assert r.status_code == 409 and r.get_json()['duplicado'] is True
    r = post_api(adm, '/api/relatorios', RV_BYTES, forcar='1')
    assert r.status_code == 200 and r.get_json()['substituiu'] is True       # a mesma data: sobrepõe, não duplica
    assert len(adm.get('/api/estado').get_json()['relatorios']) == 1
    r = post_api(adm, '/api/monitor', MON_BYTES, nome='Monitor_Estoque_28-10-2026.xlsx')
    assert r.status_code == 409                                               # o Monitor repetido é sempre barrado


def test_importacao_com_erro_nao_grava_nada(app, contas):
    adm = app.test_client()
    entrar(adm, 'paulo')
    r = post_api(adm, '/api/relatorios', RV_BYTES, nome='sem_data.xlsx')
    assert r.status_code == 400 and 'Informe a data' in r.get_json()['erro']
    r = post_api(adm, '/api/relatorios', b'lixo', nome='RV_2026-10-26.xlsx')
    assert r.status_code == 400 and 'abrir' in r.get_json()['erro']
    r = post_api(adm, '/api/relatorios', RV_BYTES, nome='RV.xlsx', data='2026-10-26')
    assert r.status_code == 200
    r = post_api(adm, '/api/relatorios', None)
    assert r.status_code == 400 and 'Escolha o arquivo' in r.get_json()['erro']
    r = post_api(adm, '/api/relatorios', RV_BYTES, nome='RV_2020-01-01.xlsx', forcar='1')
    assert r.status_code == 400 and 'anterior à última compra' in r.get_json()['erro']
    with app.app_context():
        assert bd.get_db().execute('SELECT COUNT(*) FROM relatorio').fetchone()[0] == 1


def test_so_quem_pode_importa_e_exclui(app, com_dados):
    for login in ('marcelo', 'daniel'):
        c = app.test_client()
        entrar(c, login)
        assert post_api(c, '/api/relatorios', RV_BYTES, nome='RV_2026-10-27.xlsx').status_code == 403
        assert post_api(c, '/api/monitor', MON_BYTES, nome='M_2026-10-27.xlsx').status_code == 403
        assert post_api(c, '/api/relatorios/%d/excluir' % com_dados['rid']).status_code == 403
        assert post_api(c, '/api/monitor/%d/excluir' % com_dados['mid']).status_code == 403
    anda = app.test_client()
    entrar(anda, 'andreia')                                                    # Andreia importa, mas não exclui
    outro = xlsx(CAB_RV, [linha_rv('MARCELO RE', 'N1')])
    assert post_api(anda, '/api/relatorios', outro, nome='RV_2026-10-27.xlsx').status_code == 200
    assert post_api(anda, '/api/relatorios/%d/excluir' % com_dados['rid']).status_code == 403
    assert post_api(com_dados['adm'], '/api/relatorios/%d/excluir' % com_dados['rid']).status_code == 200


def test_api_sem_login_e_sem_token(app, com_dados):
    anon = app.test_client()
    assert anon.get('/api/estado').status_code == 401
    assert anon.get('/api/relatorios/%d' % com_dados['rid']).status_code == 401
    assert anon.get('/api/monitor/%d' % com_dados['mid']).status_code == 401
    adm = com_dados['adm']
    r = adm.post('/api/relatorios/%d/excluir' % com_dados['rid'])               # sem o token CSRF
    assert r.status_code == 400
    assert adm.get('/api/relatorios/9999').status_code == 404


def test_pagina_sem_nenhuma_permissao_de_dados_nao_recebe_dados(app, com_dados):
    with app.app_context():
        db = bd.get_db()
        uid = db.execute("SELECT id FROM usuario WHERE login = 'marcelo'").fetchone()[0]
        for c in pm.CHAVES:
            if c.startswith('ver.') and c != 'ver.cliente_valor':
                db.execute('INSERT INTO perm_usuario (usuario_id, chave, valor) VALUES (?, ?, ?) ON CONFLICT (usuario_id, chave) DO UPDATE SET valor = excluded.valor', (uid, c, '0'))
        db.commit()
    c = app.test_client()
    entrar(c, 'marcelo')
    assert c.get('/api/estado').status_code == 403
    assert c.get('/api/relatorios/%d' % com_dados['rid']).status_code == 403
    assert c.get('/api/monitor/%d' % com_dados['mid']).status_code == 403
    assert config_da_pagina(c)['paginas'] == []


# ---------- isolamento por alcance de dados ----------
def test_comprador_so_recebe_os_proprios_itens(app, com_dados):
    mar = app.test_client(); entrar(mar, 'marcelo')
    L = compacto(mar.get('/api/relatorios/%d' % com_dados['rid']))
    assert sorted(x['codigo'] for x in L) == ['12345', 'A1', 'A3']
    assert all(x['comprador'] == 'MARCELO RE' for x in L)
    tal = app.test_client(); entrar(tal, 'talita')
    assert sorted(x['codigo'] for x in compacto(tal.get('/api/relatorios/%d' % com_dados['rid']))) == ['B1', 'B2']
    dan = app.test_client(); entrar(dan, 'daniel')
    assert len(compacto(dan.get('/api/relatorios/%d' % com_dados['rid']))) == 6


def test_quem_nao_ve_tudo_nao_recebe_os_totais_do_arquivo(app, com_dados):
    mar = app.test_client(); entrar(mar, 'marcelo')
    m = mar.get('/api/estado').get_json()['relatorios'][0]
    assert 'itens' not in m and 'comprarN' not in m and m['refAt'] == '2026-10-26'
    mm = mar.get('/api/estado').get_json()['monitores'][0]
    assert 'linhas' not in mm and 'bloqueadas' not in mm
    dan = app.test_client(); entrar(dan, 'daniel')
    assert dan.get('/api/estado').get_json()['relatorios'][0]['itens'] == 6


def test_monitor_do_comprador_so_traz_os_produtos_dele(app, com_dados):
    mar = app.test_client(); entrar(mar, 'marcelo')
    M = compacto(mar.get('/api/monitor/%d?relatorio=%d' % (com_dados['mid'], com_dados['rid'])))
    assert [x['codigo'] for x in M] == ['A1']
    assert M[0]['itTot'] == 3 and M[0]['itBlq'] == 2                          # contagem do pedido inteiro, mesmo com só uma linha visível
    tal = app.test_client(); entrar(tal, 'talita')
    assert sorted(x['codigo'] for x in compacto(tal.get('/api/monitor/%d?relatorio=%d' % (com_dados['mid'], com_dados['rid'])))) == ['B1', 'B1', 'B2']
    assert len(compacto(com_dados['adm'].get('/api/monitor/%d' % com_dados['mid']))) == 5          # admin: tudo (inclusive produto fora do relatório)


def test_comprador_nao_ve_o_monitor_de_outro_relatorio_que_nao_tem_o_produto(app, com_dados):
    """Sem informar o relatório, vale o mais recente; um relatório sem os produtos dele deixa o Monitor vazio."""
    adm = com_dados['adm']
    outro = xlsx(CAB_RV, [linha_rv('JOAO', 'Q9')])
    r = post_api(adm, '/api/relatorios', outro, nome='RV_2026-10-27.xlsx')
    mar = app.test_client(); entrar(mar, 'marcelo')
    assert compacto(mar.get('/api/monitor/%d' % com_dados['mid'])) == []
    assert len(compacto(mar.get('/api/monitor/%d?relatorio=%d' % (com_dados['mid'], com_dados['rid'])))) == 1


def test_sem_permissao_de_cliente_e_valor_o_servidor_nao_envia(app, com_dados):
    with app.app_context():
        db = bd.get_db()
        uid = db.execute("SELECT id FROM usuario WHERE login = 'talita'").fetchone()[0]
        db.execute("INSERT INTO perm_usuario (usuario_id, chave, valor) VALUES (?, 'ver.cliente_valor', '0')", (uid,))
        db.commit()
    tal = app.test_client(); entrar(tal, 'talita')
    resp = tal.get('/api/monitor/%d?relatorio=%d' % (com_dados['mid'], com_dados['rid']))
    texto = resp.get_data(as_text=True)
    assert 'CLIENTE X' not in texto and 'OUTRO CLIENTE' not in texto and '000123' not in texto
    M = compacto(resp)
    assert all(x['cliente'] == '' and x['codcliente'] == '' and x['loja'] == '' and x['valor'] == 0 for x in M) and len(M) == 3
    assert config_da_pagina(tal)['pode']['clienteValor'] is False
    mar = app.test_client(); entrar(mar, 'marcelo')                            # quem tem a permissão continua recebendo
    assert compacto(mar.get('/api/monitor/%d?relatorio=%d' % (com_dados['mid'], com_dados['rid'])))[0]['cliente'] == 'CLIENTE X'


def test_alcance_por_marcas_escolhidas(app, com_dados):
    novo_usuario(app, 'carlos', 'comprador', comprador='NINGUEM', nome='Carlos')
    with app.app_context():
        db = bd.get_db()
        uid = db.execute("SELECT id FROM usuario WHERE login = 'carlos'").fetchone()[0]
        db.execute("INSERT INTO perm_usuario (usuario_id, chave, valor) VALUES (?, 'escopo.dados', 'selecionados')", (uid,))
        db.execute("INSERT INTO escopo_usuario (usuario_id, tipo, valor) VALUES (?, 'marca', 'credeal')", (uid,))
        db.execute("INSERT INTO escopo_usuario (usuario_id, tipo, valor) VALUES (?, 'comprador', 'talita de')", (uid,))
        db.commit()
    c = app.test_client(); entrar(c, 'carlos')
    assert sorted(x['codigo'] for x in compacto(c.get('/api/relatorios/%d' % com_dados['rid']))) == ['B1', 'B2']
    assert config_da_pagina(c)['escopo']['tipo'] == 'selecionados'


def test_filtro_sql_e_enxerga_dizem_a_mesma_coisa():
    """O filtro do banco (colunas normalizadas) e a regra em Python não podem divergir."""
    random.seed(7)
    nomes = ['MARCELO RE', 'marcelo re', 'Talita de', 'JOÃO PAULO', 'joao paulo', '', 'CRISTIANE', 'X-Y']
    marcas = ['VOLK', 'volk', 'Crédeal', 'credeal', '', 'DAC']
    import sqlite3
    conn = sqlite3.connect(':memory:')
    conn.execute('CREATE TABLE t (comprador_n TEXT, marca_n TEXT, comprador TEXT, marca TEXT)')
    linhas = [(pm.norm(c), pm.norm(m), c, m) for c in nomes for m in marcas]
    conn.executemany('INSERT INTO t VALUES (?, ?, ?, ?)', linhas)
    for _ in range(60):
        tipo = random.choice(['todos', 'proprios', 'selecionados'])
        p = pm.Permissoes('comprador', {}, tipo, random.sample(nomes + ['-', '  '], random.randint(0, 3)), random.sample(marcas + ['.'], random.randint(0, 3)),
                          random.choice(nomes + ['']))
        cond, params = p.filtro_sql()
        sql = {(c, m) for c, m in conn.execute('SELECT comprador, marca FROM t WHERE ' + cond, params)}
        py = {(c, m) for _cn, _mn, c, m in linhas if p.enxerga(c, m)}
        assert sql == py, (tipo, p.compradores, p.marcas, p.comprador_protheus)


def test_substitui_monitor_da_mesma_data_e_guarda_os_mais_recentes(app, com_dados):
    adm = com_dados['adm']
    app.config['MANTER_MONITORES'] = 2
    outro = xlsx(CAB_MON, [linha_mon('P9', '01', 'A1')], aba='Monitor', titulo=False)
    r = post_api(adm, '/api/monitor', outro, nome='Monitor_28-10-2026.xlsx')
    assert r.status_code == 200 and r.get_json()['substituiu'] is True       # mesma data: substitui
    assert len(adm.get('/api/estado').get_json()['monitores']) == 1
    for dia in ('29', '30', '31'):
        arq = xlsx(CAB_MON, [linha_mon('P' + dia, '01', 'A1')], aba='Monitor', titulo=False)
        assert post_api(adm, '/api/monitor', arq, nome='Monitor_%s-10-2026.xlsx' % dia).status_code == 200
    datas = [m['refAt'] for m in adm.get('/api/estado').get_json()['monitores']]
    assert datas == ['2026-10-31', '2026-10-30']                              # só os 2 mais recentes


def test_guarda_so_os_relatorios_mais_recentes(app, com_dados):
    adm = com_dados['adm']
    app.config['MANTER_RELATORIOS'] = 2
    for dia in ('27', '28'):
        arq = xlsx(CAB_RV, [linha_rv('MARCELO RE', 'D' + dia)])
        assert post_api(adm, '/api/relatorios', arq, nome='RV_2026-10-%s.xlsx' % dia).status_code == 200
    datas = [r['refAt'] for r in adm.get('/api/estado').get_json()['relatorios']]
    assert datas == ['2026-10-28', '2026-10-27']
    with app.app_context():
        assert bd.get_db().execute('SELECT COUNT(*) FROM relatorio_item').fetchone()[0] == 2     # os itens do relatório apagado saem junto


def test_excluir_relatorio_apaga_os_itens_e_registra(app, com_dados):
    adm = com_dados['adm']
    assert post_api(adm, '/api/relatorios/%d/excluir' % com_dados['rid']).status_code == 200
    assert post_api(adm, '/api/monitor/%d/excluir' % com_dados['mid']).status_code == 200
    with app.app_context():
        db = bd.get_db()
        assert db.execute('SELECT COUNT(*) FROM relatorio_item').fetchone()[0] == 0
        assert db.execute('SELECT COUNT(*) FROM monitor_item').fetchone()[0] == 0
        acoes = [x['acao'] for x in db.execute('SELECT acao FROM auditoria')]
    assert 'excluir_relatorio' in acoes and 'excluir_monitor' in acoes


def test_pagina_do_sistema_entrega_identidade_e_permissoes(app, contas):
    mar = app.test_client(); entrar(mar, 'marcelo')
    cfg = config_da_pagina(mar)
    assert cfg['usuario']['nome'] == 'Marcelo' and cfg['escopo'] == {'tipo': 'proprios', 'compradorProtheus': 'MARCELO RE', 'compradores': [], 'marcas': []}
    assert cfg['pode']['importarRelatorio'] is False and cfg['pode']['excluir'] is False and 'importar' not in cfg['paginas']
    adm = app.test_client(); entrar(adm, 'paulo')
    cfg = config_da_pagina(adm)
    assert cfg['escopo']['tipo'] == 'todos' and cfg['pode']['importarRelatorio'] and cfg['pode']['excluir'] and 'importar' in cfg['paginas']
    r = adm.get('/app')
    csp = r.headers['Content-Security-Policy']
    assert "script-src 'self'" in csp and 'unsafe-inline' not in csp and 'unsafe-eval' not in csp
    assert '<script>' not in r.get_data(as_text=True)                             # nenhum script em linha


# ---------- a última importação fica guardada e a nova sobrepõe a anterior ----------
def test_a_importacao_sobrevive_a_reiniciar_o_servidor(app, com_dados, tmp_path):
    """Fechar e abrir o sistema (ou reiniciar o computador) não pede para importar de novo."""
    from rvn import create_app
    reiniciado = create_app({'DADOS': app.config['DADOS'], 'DB': app.config['DB'], 'TESTING': True, 'SECRET_KEY': 'teste'})
    mar = reiniciado.test_client()
    entrar(mar, 'marcelo')
    est = mar.get('/api/estado').get_json()
    assert [r['refAt'] for r in est['relatorios']] == ['2026-10-26'] and [m['refAt'] for m in est['monitores']] == ['2026-10-28']
    assert sorted(x['codigo'] for x in compacto(mar.get('/api/relatorios/%d' % est['relatorios'][0]['id']))) == ['12345', 'A1', 'A3']
    adm = reiniciado.test_client()
    entrar(adm, 'paulo')
    assert len(compacto(adm.get('/api/monitor/%d' % est['monitores'][0]['id']))) == 5


def test_nova_importacao_da_mesma_data_sobrepoe_e_a_mais_recente_abre_primeiro(app, com_dados):
    adm = com_dados['adm']
    novo = xlsx(CAB_RV, [linha_rv('MARCELO RE', 'N1', 'DAC'), linha_rv('TALITA DE', 'N2', 'VOLK')])
    r = post_api(adm, '/api/relatorios', novo, nome='RV_NECESSIDADES_2026-10-26.xlsx')          # outro arquivo, mesma data
    assert r.status_code == 200 and r.get_json()['substituiu'] is True
    lista = adm.get('/api/estado').get_json()['relatorios']
    assert len(lista) == 1 and lista[0]['itens'] == 2
    assert sorted(x['codigo'] for x in compacto(adm.get('/api/relatorios/%d' % lista[0]['id']))) == ['N1', 'N2']   # os itens antigos saíram
    with app.app_context():
        assert bd.get_db().execute('SELECT COUNT(*) FROM relatorio_item').fetchone()[0] == 2                       # nada de linha órfã
        assert 'substituiu o da mesma data' in bd.get_db().execute("SELECT detalhe FROM auditoria WHERE acao = 'importar_relatorio' ORDER BY id DESC").fetchone()[0]
    # outra data entra ao lado; a data mais nova é a que abre primeiro
    amanha = xlsx(CAB_RV, [linha_rv('MARCELO RE', 'N3', 'DAC')])
    assert post_api(adm, '/api/relatorios', amanha, nome='RV_NECESSIDADES_2026-10-27.xlsx').status_code == 200
    assert [r['refAt'] for r in adm.get('/api/estado').get_json()['relatorios']] == ['2026-10-27', '2026-10-26']
    # uma importação de data mais antiga, feita depois, não passa na frente
    antes = xlsx(CAB_RV, [linha_rv('MARCELO RE', 'N0', 'DAC')])
    assert post_api(adm, '/api/relatorios', antes, nome='RV_NECESSIDADES_2026-10-25.xlsx').status_code == 200
    assert [r['refAt'] for r in adm.get('/api/estado').get_json()['relatorios']][0] == '2026-10-27'
