"""Rotas da etapa 3: formulários de compra, cadastro de fornecedores, budget e dados da empresa."""
from flask import Blueprint, g, jsonify, request

from . import compras
from . import db as bd
from .api import _erro, api
from .auth import ip_do_cliente
from .compras import Conflito, ErroRegra, Proibido

bp = Blueprint('compras', __name__, url_prefix='/api')


def _corpo():
    d = request.get_json(silent=True)
    return d if isinstance(d, dict) else {}


def _tratar(f):
    """Traduz as exceções de regra em respostas JSON (422 regra, 403 permissão, 409 conflito)."""
    from functools import wraps

    @wraps(f)
    def interno(*a, **kw):
        try:
            return f(*a, **kw)
        except ErroRegra as e:
            bd.get_db().rollback()
            return jsonify(erro=e.titulo or (e.erros[0] if e.erros else 'Não foi possível.'), erros=e.erros, titulo=e.titulo, pedido=e.pedido), 422
        except Proibido as e:
            bd.get_db().rollback()
            bd.registrar('acesso_negado', '%s: %s' % (request.path, e), g.usuario, ip_do_cliente())
            return _erro(str(e), 403)
        except Conflito as e:
            bd.get_db().rollback()
            return _erro(str(e), 409, conflito=True)
    return interno


def _pedido(pid):
    p = compras.pedido_ler(bd.get_db(), pid)
    if p is None or not compras.pode_ver(g.perm, p):      # fora do alcance: o servidor responde como se não existisse
        return None
    return p


# ---------- formulários ----------
@bp.route('/formularios')
@api('ver.formularios')
def formularios():
    db = bd.get_db()
    b, _v = compras.budget_ler(db)
    return jsonify(pedidos=compras.pedidos_visiveis(db, g.perm), config={'ativa': bool(b['ativa']), 'tolPreco': compras.nz(b['tolPreco'])})


@bp.route('/formularios', methods=['POST'])
@api('acao.criar_formulario')
@_tratar
def formulario_criar():
    p = compras.criar_pedido(bd.get_db(), g.perm, g.usuario, _corpo())
    bd.registrar('pedido_criado', '%s · %s' % (p['numero'], p['fornecedor']['marca']), g.usuario, ip_do_cliente())
    return jsonify(pedido=p)


@bp.route('/formularios/<pid>', methods=['PUT'])
@api('ver.formularios')
@_tratar
def formulario_editar(pid):
    p = _pedido(pid)
    if p is None:
        return _erro('Formulário não encontrado.', 404)
    corpo = _corpo()
    p = compras.editar_pedido(bd.get_db(), g.perm, g.usuario, p, corpo, corpo.get('versao', -1))
    return jsonify(pedido=p)


@bp.route('/formularios/<pid>/acao', methods=['POST'])
@api('ver.formularios')
@_tratar
def formulario_acao(pid):
    p = _pedido(pid)
    if p is None:
        return _erro('Formulário não encontrado.', 404)
    corpo = _corpo()
    acao = str(corpo.get('acao', ''))
    versao = corpo.get('versao', -1)
    if corpo.get('conteudo') is not None and compras.pode_editar(g.perm, p):
        # a mesma chamada grava as edições pendentes e muda a situação: ninguém aprova um conteúdo que o servidor não viu
        p = compras.editar_pedido(bd.get_db(), g.perm, g.usuario, p, corpo['conteudo'], versao)
        versao = p['versao']
    salvou = versao != corpo.get('versao', -1)
    try:
        p = compras.agir_pedido(bd.get_db(), g.perm, g.usuario, p, acao, corpo.get('nota', ''), versao, corpo.get('valor', ''))
    except ErroRegra as e:
        if salvou:
            e.pedido = p
        raise
    bd.registrar('pedido_' + acao, '%s · %s' % (p['numero'], p['fornecedor']['marca']), g.usuario, ip_do_cliente())
    return jsonify(pedido=p)


@bp.route('/formularios/<pid>/excluir', methods=['POST'])
@api('ver.formularios')
@_tratar
def formulario_excluir(pid):
    p = _pedido(pid)
    if p is None:
        return _erro('Formulário não encontrado.', 404)
    compras.excluir_pedido(bd.get_db(), g.perm, p, _corpo().get('versao', -1))
    bd.registrar('pedido_excluido', '%s · %s' % (p['numero'], p['fornecedor']['marca']), g.usuario, ip_do_cliente())
    return jsonify(ok=True)


@bp.route('/formularios/avaliar', methods=['POST'])
@api('ver.formularios')
@_tratar
def formulario_avaliar():
    return jsonify(compras.avaliar(bd.get_db(), g.perm, g.usuario, _corpo()))


# ---------- fornecedores ----------
@bp.route('/fornecedores')
@api(paginas=('fornecedores', 'formularios'))
def fornecedores():
    return jsonify(fornecedores=compras.fornecedores_ler(bd.get_db(), g.perm))


@bp.route('/fornecedores/lote', methods=['POST'])
@api('acao.cadastro_fornecedor')
@_tratar
def fornecedores_lote():
    corpo = _corpo()
    n = compras.fornecedores_gravar_lote(bd.get_db(), g.perm, g.usuario, corpo.get('registros'))
    bd.get_db().commit()
    bd.registrar('fornecedores_gravados', '%d registro(s) · %s' % (n, str(corpo.get('origem', ''))[:80]), g.usuario, ip_do_cliente())
    return jsonify(ok=True, gravados=n)


# ---------- budget ----------
@bp.route('/budget')
@api('ver.budget')
def budget():
    b, v = compras.budget_ler(bd.get_db())
    return jsonify(budget=b, versao=v)


@bp.route('/budget', methods=['PUT'])
@api('ver.budget')
@_tratar
def budget_gravar():
    corpo = _corpo()
    novo, v = compras.budget_gravar(bd.get_db(), g.perm, g.usuario, corpo.get('budget'), corpo.get('versao'), corpo.get('logs'))
    bd.get_db().commit()
    bd.registrar('budget_alterado', '; '.join(str(t)[:120] for t in (corpo.get('logs') or [])[:3]) or 'sem descrição', g.usuario, ip_do_cliente())
    return jsonify(budget=novo, versao=v)


# ---------- empresa ----------
@bp.route('/empresa')
@api(paginas=('formularios', 'fornecedores', 'budget'))
def empresa():
    return jsonify(empresa=compras.empresa_ler(bd.get_db()))


@bp.route('/empresa', methods=['PUT'])
@api('acao.dados_empresa')
@_tratar
def empresa_gravar():
    corpo = _corpo()
    v = compras.empresa_gravar(bd.get_db(), g.usuario, corpo.get('empresa'))
    bd.get_db().commit()
    bd.registrar('empresa_alterada', 'dados da empresa compradora', g.usuario, ip_do_cliente())
    return jsonify(empresa=compras.empresa_ler(bd.get_db()), versao=v)
