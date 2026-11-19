"""Rotas de dados (JSON) usadas pela tela de acompanhamento: o servidor entrega só o que a pessoa pode ver."""
from functools import wraps

from flask import Blueprint, Response, current_app, g, jsonify, request

from . import dados
from . import db as bd
from .auth import ip_do_cliente
from .leitor import ErroImportacao, iso_br

bp = Blueprint('api', __name__, url_prefix='/api')

# páginas que mostram dados do relatório; quem não tem nenhuma delas não recebe dados
PAGINAS_DE_DADOS = ('painel', 'rupturas', 'atrasos', 'nec60', 'moeda', 'bloqueados', 'todos', 'divergencias', 'relatorios', 'exportar', 'formularios')
PAGINAS_DO_MONITOR = ('bloqueados', 'relatorios')


def _erro(msg, status, **extra):
    return jsonify(dict(erro=msg, **extra)), status


def api(chave=None, paginas=None):
    """Exige login (401 em JSON, e não a página de entrada) e, se pedido, uma permissão ou uma entre várias páginas."""
    def deco(f):
        @wraps(f)
        def interno(*a, **kw):
            if g.usuario is None:
                return _erro('Sessão expirada. Entre de novo.', 401)
            if chave and not g.perm.pode(chave):
                bd.registrar('acesso_negado', chave + ' ' + request.path, g.usuario, ip_do_cliente())
                return _erro('Você não tem permissão para isso.', 403)
            if paginas and not any(g.perm.pode('ver.' + p) for p in paginas):
                bd.registrar('acesso_negado', 'dados ' + request.path, g.usuario, ip_do_cliente())
                return _erro('Você não tem permissão para ver estes dados.', 403)
            return f(*a, **kw)
        return interno
    return deco


def _json_texto(texto):
    return Response(texto, mimetype='application/json')


@bp.route('/estado')
@api(paginas=PAGINAS_DE_DADOS)
def estado():
    db = bd.get_db()
    return jsonify(relatorios=dados.listar_relatorios(db, g.perm), monitores=dados.listar_monitores(db, g.perm))


@bp.route('/relatorios/<int:rid>')
@api(paginas=PAGINAS_DE_DADOS)
def relatorio(rid):
    texto = dados.dados_relatorio(bd.get_db(), g.perm, rid)
    if texto is None:
        return _erro('Relatório não encontrado.', 404)
    return _json_texto(texto)


def _arquivo():
    f = request.files.get('arquivo')
    if f is None or not f.filename:
        raise ErroImportacao('Escolha o arquivo do Protheus.')
    return f.filename, f.read()


@bp.route('/relatorios', methods=['POST'])
@api('acao.importar_relatorio')
def relatorio_importar():
    try:
        nome, conteudo = _arquivo()
        r, c, trocados = dados.importar_relatorio(bd.get_db(), g.usuario, nome, conteudo, request.form.get('data', ''), request.form.get('forcar') == '1',
                                        current_app.config['MANTER_RELATORIOS'])
    except dados.Duplicado as e:
        return _erro(e.mensagem, 409, duplicado=True, refAt=e.ref_at)
    except ErroImportacao as e:
        return _erro(e.mensagem, 400, itens=e.itens)
    bd.registrar('importar_relatorio', 'relatório de %s · %d itens · %s%s' % (iso_br(r['ref_at']), c['itens'], r['arquivo'], ' · substituiu o da mesma data' if trocados else ''), g.usuario, ip_do_cliente())
    return jsonify(ok=True, id=r['id'], refAt=r['ref_at'], itens=c['itens'], comprarN=c['comprar_n'], iminN=c['imin_n'], entN=c['ent_n'], substituiu=trocados > 0)


@bp.route('/relatorios/<int:rid>/excluir', methods=['POST'])
@api('acao.excluir_relatorio')
def relatorio_excluir(rid):
    r = dados.excluir_relatorio(bd.get_db(), rid)
    if r is None:
        return _erro('Relatório não encontrado.', 404)
    bd.registrar('excluir_relatorio', 'relatório de %s · %s' % (iso_br(r['ref_at']), r['arquivo']), g.usuario, ip_do_cliente())
    return jsonify(ok=True)


@bp.route('/monitor/<int:mid>')
@api(paginas=PAGINAS_DO_MONITOR)
def monitor(mid):
    rid = request.args.get('relatorio', type=int)
    if rid is None:
        ultimo = bd.get_db().execute('SELECT id FROM relatorio ORDER BY ref_at DESC, importado_em DESC, id DESC LIMIT 1').fetchone()
        rid = ultimo['id'] if ultimo else None
    texto = dados.dados_monitor(bd.get_db(), g.perm, mid, rid, g.perm.pode('ver.cliente_valor'))
    if texto is None:
        return _erro('Monitor de Estoque não encontrado.', 404)
    return _json_texto(texto)


@bp.route('/monitor', methods=['POST'])
@api('acao.importar_monitor')
def monitor_importar():
    try:
        nome, conteudo = _arquivo()
        m, r, trocados = dados.importar_monitor(bd.get_db(), g.usuario, nome, conteudo, request.form.get('data', ''), current_app.config['MANTER_MONITORES'])
    except dados.Duplicado as e:
        return _erro(e.mensagem, 409, duplicado=True, refAt=e.ref_at)
    except ErroImportacao as e:
        return _erro(e.mensagem, 400, itens=e.itens)
    bd.registrar('importar_monitor', 'Monitor de %s · %d linhas · %s' % (iso_br(m['ref_at']), r['linhas'], m['arquivo']), g.usuario, ip_do_cliente())
    return jsonify(ok=True, id=m['id'], refAt=m['ref_at'], substituiu=trocados > 0, **r)


@bp.route('/monitor/<int:mid>/excluir', methods=['POST'])
@api('acao.excluir_relatorio')
def monitor_excluir(mid):
    m = dados.excluir_monitor(bd.get_db(), mid)
    if m is None:
        return _erro('Monitor de Estoque não encontrado.', 404)
    bd.registrar('excluir_monitor', 'Monitor de %s · %s' % (iso_br(m['ref_at']), m['arquivo']), g.usuario, ip_do_cliente())
    return jsonify(ok=True)
