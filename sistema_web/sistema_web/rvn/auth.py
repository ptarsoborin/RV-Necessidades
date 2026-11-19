"""Login, logout e troca de senha; decoradores de acesso."""
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Blueprint, abort, flash, g, redirect, render_template, request, session, url_for

from . import db as bd
from . import seguranca

bp = Blueprint('auth', __name__)


def ip_do_cliente():
    from flask import current_app
    if current_app.config['PROXY']:
        ip = request.headers.get('CF-Connecting-IP')
        if ip and request.remote_addr in ('127.0.0.1', '::1'):
            return ip[:64]
    return (request.remote_addr or '')[:64]


def exigir_login(f):
    @wraps(f)
    def interno(*a, **kw):
        if g.usuario is None:
            return redirect(url_for('auth.entrar', proximo=request.full_path.rstrip('?')))
        return f(*a, **kw)
    return interno


def exigir(chave):
    """A página só abre se a pessoa tiver a permissão (ver. e acao. do catálogo, ou estrutura. só do admin)."""
    def deco(f):
        @wraps(f)
        @exigir_login
        def interno(*a, **kw):
            if not g.perm.pode(chave):
                bd.registrar('acesso_negado', chave + ' ' + request.path, g.usuario, ip_do_cliente())
                abort(403)
            return f(*a, **kw)
        return interno
    return deco


@bp.route('/entrar', methods=['GET', 'POST'])
def entrar():
    from flask import current_app
    if g.usuario is not None:
        return redirect(url_for('paginas.inicio'))
    proximo = seguranca.proximo_seguro(request.values.get('proximo'))
    if request.method == 'POST':
        db = bd.get_db()
        login = (request.form.get('login') or '').strip()[:80]
        senha = request.form.get('senha') or ''
        ip = ip_do_cliente()
        u = db.execute('SELECT * FROM usuario WHERE login = ?', (login,)).fetchone() if login else None
        agora = datetime.now(timezone.utc)
        if u is not None and u['bloqueado_ate'] and datetime.fromisoformat(u['bloqueado_ate']) > agora:
            falta = int((datetime.fromisoformat(u['bloqueado_ate']) - agora).total_seconds() // 60) + 1
            bd.registrar('login_bloqueado', 'tentativa durante o bloqueio', u, ip)
            flash('Muitas tentativas erradas. Tente de novo em %d minuto(s).' % falta, 'erro')
        elif u is not None and u['ativo'] and seguranca.confere_senha(u['senha_hash'], senha):
            db.execute('UPDATE usuario SET tentativas = 0, bloqueado_ate = ?, ultimo_acesso = ? WHERE id = ?', ('', bd.agora(), u['id']))
            db.commit()
            session.clear()
            session['uid'] = u['id']
            session['sv'] = u['sessao_versao']
            session.permanent = True
            bd.registrar('login_ok', '', u, ip)
            return redirect(seguranca.proximo_seguro(proximo))
        else:
            if u is None:
                seguranca.gasta_tempo()
                bd.registrar('login_falha', 'usuário inexistente: ' + login[:40], None, ip)
            else:
                tent = u['tentativas'] + 1
                bloqueio = ''
                if tent >= current_app.config['TENTATIVAS_MAX']:
                    bloqueio = (agora + timedelta(minutes=current_app.config['BLOQUEIO_MIN'])).isoformat(timespec='seconds')
                    tent = 0
                db.execute('UPDATE usuario SET tentativas = ?, bloqueado_ate = ? WHERE id = ?', (tent, bloqueio, u['id']))
                db.commit()
                bd.registrar('login_bloqueado' if bloqueio else 'login_falha', 'senha errada' if u['ativo'] else 'usuário desativado', u, ip)
            flash('Usuário ou senha inválidos.', 'erro')
    return render_template('login.html', proximo=proximo)


@bp.route('/sair', methods=['POST'])
@exigir_login
def sair():
    bd.registrar('logout', '', g.usuario, ip_do_cliente())
    session.clear()
    return redirect(url_for('auth.entrar'))


@bp.route('/conta/senha', methods=['GET', 'POST'])
@exigir_login
def trocar_senha():
    obrigatoria = bool(g.usuario['deve_trocar'])
    if request.method == 'POST':
        atual = request.form.get('atual') or ''
        nova = request.form.get('nova') or ''
        repete = request.form.get('repete') or ''
        erros = []
        if not seguranca.confere_senha(g.usuario['senha_hash'], atual):
            erros.append('A senha atual não confere.')
        if nova != repete:
            erros.append('A confirmação é diferente da nova senha.')
        if nova == atual:
            erros.append('A nova senha precisa ser diferente da atual.')
        erros += seguranca.erros_da_senha(nova, g.usuario['login'], g.usuario['nome'])
        if erros:
            for e in erros:
                flash(e, 'erro')
        else:
            db = bd.get_db()
            versao = g.usuario['sessao_versao'] + 1
            db.execute('UPDATE usuario SET senha_hash = ?, deve_trocar = 0, sessao_versao = ? WHERE id = ?', (seguranca.hash_senha(nova), versao, g.usuario['id']))
            db.commit()
            bd.registrar('senha_trocada', '', g.usuario, ip_do_cliente())
            session['sv'] = versao       # esta sessão continua; as outras caem
            flash('Senha alterada.', 'ok')
            return redirect(url_for('paginas.inicio'))
    return render_template('trocar_senha.html', obrigatoria=obrigatoria)
