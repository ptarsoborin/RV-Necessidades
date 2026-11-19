"""RV Necessidades, versão web: fundação (login, usuários, permissões e registro de ações)."""
from datetime import datetime, timedelta, timezone

from flask import Flask, g, redirect, render_template, request, session, url_for
from werkzeug.middleware.proxy_fix import ProxyFix

from . import config as cfg
from . import db as bd
from . import permissoes, seguranca

__version__ = '0.3.0'


def create_app(config=None):
    app = Flask(__name__)
    app.config.update(cfg.config_padrao(config.get('DADOS') if config else None))
    if config:
        app.config.update(config)
        if 'DB' not in config and 'DADOS' in config:
            app.config['DB'] = str(app.config['DADOS'] / 'rvn.db')
    app.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',
        SESSION_COOKIE_SECURE=bool(app.config['HTTPS']),
        PERMANENT_SESSION_LIFETIME=timedelta(hours=app.config['SESSAO_HORAS']),
        MAX_CONTENT_LENGTH=64 * 1024 * 1024,
    )
    if app.config['PROXY']:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    bd.init_db(app.config['DB'])
    app.teardown_appcontext(bd.fechar_db)

    from . import admin, api, api_compras, auth, paginas
    app.register_blueprint(auth.bp)
    app.register_blueprint(paginas.bp)
    app.register_blueprint(admin.bp)
    app.register_blueprint(api.bp)
    app.register_blueprint(api_compras.bp)

    @app.before_request
    def carregar_usuario():
        g.usuario = None
        g.perm = None
        uid = session.get('uid')
        if uid:
            u = bd.get_db().execute('SELECT * FROM usuario WHERE id = ?', (uid,)).fetchone()
            if u and u['ativo'] and session.get('sv') == u['sessao_versao']:
                g.usuario = u
                g.perm = permissoes.resolver(bd.get_db(), u)
                session.permanent = True
            else:
                session.clear()
        if request.method == 'POST':
            seguranca.confere_csrf()

    @app.before_request
    def forcar_troca_de_senha():
        if g.usuario is not None and g.usuario['deve_trocar'] and request.endpoint not in ('auth.trocar_senha', 'auth.sair', 'static'):
            return redirect(url_for('auth.trocar_senha'))

    @app.after_request
    def cabecalhos(resp):
        return seguranca.aplica_cabecalhos(resp, app.config['HTTPS'])

    @app.context_processor
    def contexto():
        return {'csrf': seguranca.csrf_token, 'usuario': g.get('usuario'), 'perm': g.get('perm'),
                'menu': g.perm.menu() if g.get('perm') else [], 'NIVEL_ROTULO': permissoes.NIVEL_ROTULO, 'versao': __version__}

    @app.template_filter('local')
    def local(iso):
        if not iso:
            return ''
        try:
            return datetime.fromisoformat(iso).astimezone().strftime('%d/%m/%Y %H:%M')
        except ValueError:
            return iso

    @app.errorhandler(400)
    def erro_400(e):
        return render_template('erro.html', codigo=400, titulo='Pedido inválido', texto=getattr(e, 'description', '')), 400

    @app.errorhandler(403)
    def erro_403(e):
        return render_template('erro.html', codigo=403, titulo='Sem acesso', texto='Você não tem permissão para ver esta página. Se precisar, peça ao admin.'), 403

    @app.errorhandler(404)
    def erro_404(e):
        return render_template('erro.html', codigo=404, titulo='Página não encontrada', texto='O endereço não existe.'), 404

    return app
