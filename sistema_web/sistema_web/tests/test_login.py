from conftest import entrar, novo_usuario, token
from rvn import db as bd


def test_login_certo_abre_o_inicio(cli, contas):
    r = entrar(cli, 'paulo')
    assert r.status_code == 302 and r.headers['Location'].endswith('/')
    assert 'Paulo' in cli.get('/app').get_data(as_text=True)


def test_sem_login_vai_para_a_tela_de_entrada(cli, contas):
    r = cli.get('/')
    assert r.status_code == 302 and '/entrar' in r.headers['Location']
    r = cli.get('/admin/usuarios')
    assert r.status_code == 302 and '/entrar' in r.headers['Location']


def test_senha_errada_e_usuario_inexistente_dao_a_mesma_mensagem(cli, contas):
    a = entrar(cli, 'paulo', 'errada12345').get_data(as_text=True)
    b = entrar(cli, 'ninguem', 'errada12345').get_data(as_text=True)
    assert 'Usuário ou senha inválidos.' in a and 'Usuário ou senha inválidos.' in b


def test_bloqueia_depois_de_5_erros_e_nao_aceita_nem_a_senha_certa(cli, contas):
    for _ in range(5):
        entrar(cli, 'marcelo', 'errada12345')
    r = entrar(cli, 'marcelo', 'SenhaBoa123')
    assert r.status_code == 200 and 'Muitas tentativas' in r.get_data(as_text=True)
    assert cli.get('/').status_code == 302          # continua sem sessão


def test_login_certo_zera_as_tentativas(cli, app, contas):
    for _ in range(3):
        entrar(cli, 'marcelo', 'errada12345')
    entrar(cli, 'marcelo')
    with app.app_context():
        assert bd.get_db().execute("SELECT tentativas FROM usuario WHERE login = 'marcelo'").fetchone()[0] == 0


def test_usuario_desativado_nao_entra(cli, app):
    novo_usuario(app, 'velho', 'comprador', comprador='X', ativo=0)
    r = entrar(cli, 'velho')
    assert r.status_code == 200 and 'inválidos' in r.get_data(as_text=True)


def test_post_sem_csrf_e_recusado(cli, contas):
    r = cli.post('/entrar', data={'login': 'paulo', 'senha': 'SenhaBoa123'})
    assert r.status_code == 400


def test_sair_encerra_a_sessao(cli, contas):
    entrar(cli, 'paulo')
    t = token(cli, '/app')
    cli.post('/sair', data={'csrf': t})
    assert cli.get('/').status_code == 302


def test_proximo_so_aceita_caminho_interno(cli, contas):
    t = token(cli)
    r = cli.post('/entrar', data={'login': 'paulo', 'senha': 'SenhaBoa123', 'csrf': t, 'proximo': 'https://outro.site/x'})
    assert r.headers['Location'].endswith('/')
    cli2 = cli.application.test_client()
    t = token(cli2)
    r = cli2.post('/entrar', data={'login': 'paulo', 'senha': 'SenhaBoa123', 'csrf': t, 'proximo': '//outro.site'})
    assert 'outro.site' not in r.headers['Location']


def test_senha_temporaria_forca_a_troca(cli, app):
    novo_usuario(app, 'novo', 'comprador', comprador='X', deve_trocar=1)
    entrar(cli, 'novo')
    r = cli.get('/')
    assert r.status_code == 302 and '/conta/senha' in r.headers['Location']
    t = token(cli, '/conta/senha')
    r = cli.post('/conta/senha', data={'atual': 'SenhaBoa123', 'nova': 'curta1', 'repete': 'curta1', 'csrf': t})
    assert 'pelo menos 10' in r.get_data(as_text=True)
    r = cli.post('/conta/senha', data={'atual': 'SenhaBoa123', 'nova': 'OutraSenha456', 'repete': 'OutraSenha456', 'csrf': t})
    assert r.status_code == 302
    assert cli.get('/app').status_code == 200


def test_trocar_senha_derruba_as_outras_sessoes(app, contas):
    a, b = app.test_client(), app.test_client()
    entrar(a, 'daniel')
    entrar(b, 'daniel')
    t = token(a, '/conta/senha')
    a.post('/conta/senha', data={'atual': 'SenhaBoa123', 'nova': 'NovaSenha789', 'repete': 'NovaSenha789', 'csrf': t})
    assert a.get('/app').status_code == 200
    assert b.get('/app').status_code == 302


def test_cabecalhos_de_seguranca(cli, contas):
    r = cli.get('/entrar')
    assert r.headers['X-Frame-Options'] == 'DENY'
    assert "default-src 'self'" in r.headers['Content-Security-Policy']
    assert r.headers['Cache-Control'] == 'no-store'


def test_login_fica_no_registro(cli, app, contas):
    entrar(cli, 'paulo')
    entrar(cli.application.test_client(), 'paulo', 'errada12345')
    with app.app_context():
        acoes = [r[0] for r in bd.get_db().execute('SELECT acao FROM auditoria')]
    assert 'login_ok' in acoes and 'login_falha' in acoes
