"""A tela do sistema (/app): o servidor entrega a página com a identidade e as permissões da pessoa;
os dados chegam por /api, já filtrados pelo alcance de cada um."""
from flask import Blueprint, abort, g, redirect, render_template, url_for

from . import db as bd
from . import permissoes, seguranca
from .auth import exigir_login, ip_do_cliente

bp = Blueprint('paginas', __name__)


@bp.route('/')
@exigir_login
def inicio():
    return redirect(url_for('paginas.sistema'))


@bp.route('/app')
@exigir_login
def sistema():
    pode = g.perm.pode
    escopo = g.perm.escopo()
    config = {
        'csrf': seguranca.csrf_token(),
        'usuario': {'nome': g.usuario['nome'], 'login': g.usuario['login'], 'nivel': g.usuario['nivel'], 'nivelRotulo': permissoes.NIVEL_ROTULO[g.usuario['nivel']]},
        'escopo': {'tipo': escopo['tipo'], 'compradorProtheus': escopo['comprador_protheus'], 'compradores': escopo['compradores'], 'marcas': escopo['marcas']},
        'paginas': g.perm.paginas(),
        'pode': {'importarRelatorio': pode('acao.importar_relatorio'), 'importarMonitor': pode('acao.importar_monitor'), 'excluir': pode('acao.excluir_relatorio'),
                 'clienteValor': pode('ver.cliente_valor'), 'relatoriosPedir': pode('acao.relatorios_pedir'),
                 'criarFormulario': pode('acao.criar_formulario'), 'aprovarFormulario': pode('acao.aprovar_formulario'), 'cancelarFormulario': pode('acao.cancelar_formulario'),
                 'aprovarPorBudget': pode('acao.aprovar_por_budget'), 'budgetLancar': pode('acao.budget_lancar'), 'budgetRegras': pode('acao.budget_regras'),
                 'precoAcima': pode('acao.preco_acima'), 'cadastroFornecedor': pode('acao.cadastro_fornecedor'), 'dadosEmpresa': pode('acao.dados_empresa')},
        'urls': {'estado': url_for('api.estado'), 'relatorios': url_for('api.relatorio_importar'), 'monitor': url_for('api.monitor_importar'), 'entrar': url_for('auth.entrar'),
                 'formularios': url_for('compras.formularios'), 'avaliar': url_for('compras.formulario_avaliar'), 'fornecedores': url_for('compras.fornecedores'),
                 'fornecedoresLote': url_for('compras.fornecedores_lote'), 'budget': url_for('compras.budget'), 'empresa': url_for('compras.empresa')},
    }
    return render_template('app.html', config=config)


@bp.route('/p/<chave>')
@exigir_login
def pagina(chave):
    """Atalho antigo: confere a permissão e abre a página dentro do sistema."""
    if chave not in permissoes.PAGINAS:
        abort(404)
    if not g.perm.pode('ver.' + chave):
        bd.registrar('acesso_negado', 'ver.' + chave, g.usuario, ip_do_cliente())
        abort(403)
    return redirect(url_for('paginas.sistema') + '#/' + chave)
