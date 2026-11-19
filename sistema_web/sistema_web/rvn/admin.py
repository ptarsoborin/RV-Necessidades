"""Área do admin: usuários, níveis e permissões, exceções por pessoa e registro de ações."""
import re

from flask import Blueprint, abort, current_app, flash, g, redirect, render_template, request, url_for

from . import db as bd
from . import permissoes as pm
from . import seguranca
from .auth import exigir, ip_do_cliente

bp = Blueprint('admin', __name__, url_prefix='/admin')

_LOGIN = re.compile(r'^[a-z0-9][a-z0-9._-]{2,39}$')
_EMAIL = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def _dados_usuario(form, existente=None):
    """Valida os campos do formulário de usuário; devolve (dados, erros)."""
    erros = []
    d = {'login': (form.get('login') or '').strip().lower(), 'nome': (form.get('nome') or '').strip()[:120],
         'email': (form.get('email') or '').strip()[:160], 'nivel': form.get('nivel') or '',
         'comprador_protheus': (form.get('comprador_protheus') or '').strip()[:80]}
    if existente is None:
        if not _LOGIN.match(d['login']):
            erros.append('O usuário precisa ter de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.')
        elif bd.get_db().execute('SELECT 1 FROM usuario WHERE lower(login) = lower(?)', (d['login'],)).fetchone():
            erros.append('Já existe um usuário com esse login.')
    if not d['nome']:
        erros.append('Informe o nome.')
    if d['email'] and not _EMAIL.match(d['email']):
        erros.append('O e-mail não parece válido.')
    if d['nivel'] not in pm.NIVEIS_CHAVES:
        erros.append('Escolha o nível.')
    if d['nivel'] == 'comprador' and not d['comprador_protheus']:
        erros.append('Para o nível Comprador, informe o nome do comprador como aparece no Protheus (ele define quais itens a pessoa vê).')
    if d['nivel'] == 'admin':
        outros = bd.get_db().execute("SELECT COUNT(*) FROM usuario WHERE nivel = 'admin' AND ativo = 1 AND id != ?", ((existente or {'id': 0})['id'],)).fetchone()[0]
        if outros >= current_app.config['MAX_ADMINS']:
            erros.append('Já existe um admin. Só pode haver %d.' % current_app.config['MAX_ADMINS'])
    return d, erros


@bp.route('/usuarios')
@exigir('estrutura.usuarios')
def usuarios():
    lista = bd.get_db().execute("SELECT * FROM usuario ORDER BY ativo DESC, CASE nivel WHEN 'admin' THEN 0 WHEN 'gerencia' THEN 1 WHEN 'diretoria' THEN 2 ELSE 3 END, nome").fetchall()
    return render_template('admin_usuarios.html', lista=lista)


@bp.route('/usuarios/novo', methods=['GET', 'POST'])
@exigir('estrutura.usuarios')
def usuario_novo():
    d = {'login': '', 'nome': '', 'email': '', 'nivel': 'comprador', 'comprador_protheus': ''}
    if request.method == 'POST':
        d, erros = _dados_usuario(request.form)
        if erros:
            for e in erros:
                flash(e, 'erro')
        else:
            senha = seguranca.gerar_senha()
            db = bd.get_db()
            db.execute('INSERT INTO usuario (login, nome, email, nivel, comprador_protheus, senha_hash, deve_trocar, criado_em) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
                       (d['login'], d['nome'], d['email'], d['nivel'], d['comprador_protheus'], seguranca.hash_senha(senha), bd.agora()))
            db.commit()
            bd.registrar('usuario_criado', '%s (%s)' % (d['login'], d['nivel']), g.usuario, ip_do_cliente())
            return render_template('senha_gerada.html', alvo=d, senha=senha, motivo='Usuário criado')
    return render_template('admin_usuario_form.html', u=d, novo=True, niveis=pm.NIVEIS)


def _usuario_ou_404(uid):
    u = bd.get_db().execute('SELECT * FROM usuario WHERE id = ?', (uid,)).fetchone()
    if u is None:
        abort(404)
    return u


@bp.route('/usuarios/<int:uid>', methods=['GET', 'POST'])
@exigir('estrutura.usuarios')
def usuario_editar(uid):
    u = _usuario_ou_404(uid)
    d = dict(u)
    if request.method == 'POST':
        d, erros = _dados_usuario(request.form, existente=u)
        ativo = 1 if request.form.get('ativo') else 0
        if u['id'] == g.usuario['id'] and (not ativo or d['nivel'] != 'admin'):
            erros.append('Você não pode desativar nem rebaixar o seu próprio usuário de admin.')
        if erros:
            for e in erros:
                flash(e, 'erro')
            d.update({'id': u['id'], 'login': u['login'], 'ativo': ativo})
        else:
            db = bd.get_db()
            mudou_acesso = d['nivel'] != u['nivel'] or ativo != u['ativo']
            db.execute('UPDATE usuario SET nome = ?, email = ?, nivel = ?, comprador_protheus = ?, ativo = ?, sessao_versao = sessao_versao + ? WHERE id = ?',
                       (d['nome'], d['email'], d['nivel'], d['comprador_protheus'], ativo, 1 if mudou_acesso else 0, uid))
            db.commit()
            partes = []
            for campo in ('nome', 'email', 'nivel', 'comprador_protheus'):
                if d[campo] != u[campo]:
                    partes.append('%s: "%s" -> "%s"' % (campo, u[campo], d[campo]))
            if ativo != u['ativo']:
                partes.append('ativo: %d -> %d' % (u['ativo'], ativo))
            bd.registrar('usuario_editado', '%s | %s' % (u['login'], '; '.join(partes) or 'sem mudanças'), g.usuario, ip_do_cliente())
            flash('Usuário salvo.', 'ok')
            return redirect(url_for('admin.usuarios'))
    d.setdefault('id', u['id'])
    d.setdefault('ativo', u['ativo'])
    return render_template('admin_usuario_form.html', u=d, novo=False, niveis=pm.NIVEIS)


@bp.route('/usuarios/<int:uid>/senha', methods=['POST'])
@exigir('estrutura.usuarios')
def usuario_senha(uid):
    u = _usuario_ou_404(uid)
    senha = seguranca.gerar_senha()
    db = bd.get_db()
    db.execute("UPDATE usuario SET senha_hash = ?, deve_trocar = 1, sessao_versao = sessao_versao + 1, tentativas = 0, bloqueado_ate = '' WHERE id = ?", (seguranca.hash_senha(senha), uid))
    db.commit()
    bd.registrar('senha_redefinida', u['login'], g.usuario, ip_do_cliente())
    return render_template('senha_gerada.html', alvo=u, senha=senha, motivo='Senha redefinida')


# ---------------------------------------------------------------- permissões por nível
def _efetivo_texto(valor):
    return 'sim' if valor else 'não'


@bp.route('/permissoes', methods=['GET', 'POST'])
@exigir('estrutura.permissoes')
def permissoes_nivel():
    db = bd.get_db()
    atual = {n: pm.valores_do_nivel(db, n) for n in pm.NIVEIS_EDITAVEIS}
    if request.method == 'POST':
        mudancas = []
        for n in pm.NIVEIS_EDITAVEIS:
            vals, escopo = atual[n]
            for chave in pm.CHAVES:
                novo = request.form.get('p__%s__%s' % (n, chave)) == '1'
                if novo != vals[chave]:
                    mudancas.append('%s / %s: %s -> %s' % (n, chave, _efetivo_texto(vals[chave]), _efetivo_texto(novo)))
                db.execute('INSERT INTO perm_nivel (nivel, chave, valor) VALUES (?, ?, ?) ON CONFLICT (nivel, chave) DO UPDATE SET valor = excluded.valor', (n, chave, '1' if novo else '0'))
            esc = request.form.get('e__' + n)
            if esc in pm.ESCOPOS_NIVEL:
                if esc != escopo:
                    mudancas.append('%s / alcance dos dados: %s -> %s' % (n, escopo, esc))
                db.execute('INSERT INTO perm_nivel (nivel, chave, valor) VALUES (?, ?, ?) ON CONFLICT (nivel, chave) DO UPDATE SET valor = excluded.valor', (n, pm.ESCOPO_CHAVE, esc))
        db.commit()
        bd.registrar('permissoes_nivel', '; '.join(mudancas) or 'sem mudanças', g.usuario, ip_do_cliente())
        flash('Permissões dos níveis salvas.' if mudancas else 'Nada mudou.', 'ok')
        return redirect(url_for('admin.permissoes_nivel'))
    return render_template('admin_permissoes.html', atual=atual, catalogo=pm.CATALOGO, grupos=pm.GRUPOS, niveis=pm.NIVEIS, editaveis=pm.NIVEIS_EDITAVEIS,
                           escopos=[e for e in pm.ESCOPOS if e[0] in pm.ESCOPOS_NIVEL], estrutura=pm.ESTRUTURA)


# ---------------------------------------------------------------- exceções por pessoa
def _lista(texto):
    vistos, itens = set(), []
    for linha in (texto or '').splitlines():
        v = linha.strip()[:120]
        if v and pm.norm(v) not in vistos:
            vistos.add(pm.norm(v))
            itens.append(v)
    return itens[:200]


@bp.route('/usuarios/<int:uid>/acessos', methods=['GET', 'POST'])
@exigir('estrutura.permissoes')
def usuario_acessos(uid):
    u = _usuario_ou_404(uid)
    db = bd.get_db()
    if u['nivel'] == 'admin':
        return render_template('admin_acessos.html', u=u, admin=True)
    antes = pm.resolver(db, u)
    if request.method == 'POST':
        db.execute('DELETE FROM perm_usuario WHERE usuario_id = ?', (uid,))
        for chave in pm.CHAVES:
            v = request.form.get('u__' + chave, '')
            if v in ('0', '1'):
                db.execute('INSERT INTO perm_usuario (usuario_id, chave, valor) VALUES (?, ?, ?)', (uid, chave, v))
        esc = request.form.get('u__escopo', '')
        if esc in [e[0] for e in pm.ESCOPOS]:
            db.execute('INSERT INTO perm_usuario (usuario_id, chave, valor) VALUES (?, ?, ?)', (uid, pm.ESCOPO_CHAVE, esc))
        db.execute('DELETE FROM escopo_usuario WHERE usuario_id = ?', (uid,))
        for tipo, campo in (('comprador', 'compradores_sel'), ('marca', 'marcas_sel')):
            for v in _lista(request.form.get(campo)):
                db.execute('INSERT INTO escopo_usuario (usuario_id, tipo, valor) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', (uid, tipo, v))
        db.execute('UPDATE usuario SET sessao_versao = sessao_versao + 1 WHERE id = ?', (uid,))   # a pessoa passa a ver o novo acesso no próximo clique
        db.commit()
        depois = pm.resolver(db, db.execute('SELECT * FROM usuario WHERE id = ?', (uid,)).fetchone())
        mudancas = ['%s: %s -> %s' % (c, _efetivo_texto(antes.pode(c)), _efetivo_texto(depois.pode(c))) for c in pm.CHAVES if antes.pode(c) != depois.pode(c)]
        if antes.escopo_tipo != depois.escopo_tipo:
            mudancas.append('alcance dos dados: %s -> %s' % (antes.escopo_tipo, depois.escopo_tipo))
        if (antes.compradores, antes.marcas) != (depois.compradores, depois.marcas):
            mudancas.append('compradores escolhidos: %s | Marcas escolhidas: %s' % (', '.join(depois.compradores) or '-', ', '.join(depois.marcas) or '-'))
        bd.registrar('permissoes_usuario', '%s | %s' % (u['login'], '; '.join(mudancas) or 'sem mudanças no resultado'), g.usuario, ip_do_cliente())
        flash('Acessos de %s salvos.' % u['nome'], 'ok')
        return redirect(url_for('admin.usuario_acessos', uid=uid))
    vals_nivel, escopo_nivel = pm.valores_do_nivel(db, u['nivel'])
    ex, listas = pm.excecoes_do_usuario(db, uid)
    linhas = [{'chave': c, 'rotulo': r, 'grupo': gr, 'nivel': vals_nivel[c], 'excecao': ex.get(c, ''), 'efetivo': antes.pode(c)} for c, r, gr, _p in pm.CATALOGO]
    return render_template('admin_acessos.html', u=u, admin=False, linhas=linhas, grupos=pm.GRUPOS, escopo_nivel=escopo_nivel, escopo_excecao=ex.get(pm.ESCOPO_CHAVE, ''),
                           escopos=pm.ESCOPOS, escopo_efetivo=antes.escopo_tipo, compradores='\n'.join(listas['comprador']), marcas='\n'.join(listas['marca']))


@bp.route('/auditoria')
@exigir('estrutura.auditoria')
def auditoria():
    db = bd.get_db()
    acao = (request.args.get('acao') or '').strip()
    login = (request.args.get('login') or '').strip()
    sql, args = 'SELECT * FROM auditoria WHERE 1 = 1', []
    if acao:
        sql += ' AND acao = ?'
        args.append(acao)
    if login:
        sql += ' AND lower(login) LIKE lower(?)'
        args.append('%' + login + '%')
    linhas = db.execute(sql + ' ORDER BY id DESC LIMIT 300', args).fetchall()
    acoes = [r[0] for r in db.execute('SELECT DISTINCT acao FROM auditoria ORDER BY acao')]
    return render_template('admin_auditoria.html', linhas=linhas, acoes=acoes, acao=acao, login=login)
