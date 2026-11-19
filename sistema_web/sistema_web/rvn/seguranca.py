"""Senhas, token CSRF e cabeçalhos de segurança."""
import hmac
import re
import secrets

from flask import abort, request, session
from werkzeug.security import check_password_hash, generate_password_hash

SENHA_MIN = 10
_ALFABETO = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'   # sem 0, O, 1, l, I
_DUMMY = generate_password_hash('senha-que-nunca-vale')


def hash_senha(senha):
    return generate_password_hash(senha)


def confere_senha(hash_, senha):
    return check_password_hash(hash_, senha)


def gasta_tempo():
    """Confere uma senha falsa, para que usuário inexistente e senha errada demorem o mesmo tempo."""
    check_password_hash(_DUMMY, 'x')


def erros_da_senha(senha, login='', nome=''):
    erros = []
    if len(senha) < SENHA_MIN:
        erros.append('A senha precisa ter pelo menos %d caracteres.' % SENHA_MIN)
    if not re.search(r'[A-Za-z]', senha) or not re.search(r'\d', senha):
        erros.append('A senha precisa ter letras e números.')
    baixo = senha.lower()
    if login and baixo == login.lower():
        erros.append('A senha não pode ser igual ao usuário.')
    if nome and baixo == nome.lower():
        erros.append('A senha não pode ser igual ao nome.')
    return erros


def gerar_senha(tamanho=12):
    while True:
        s = ''.join(secrets.choice(_ALFABETO) for _ in range(tamanho))
        if re.search(r'[a-z]', s) and re.search(r'[A-Z]', s) and re.search(r'\d', s):
            return s


def csrf_token():
    if 'csrf' not in session:
        session['csrf'] = secrets.token_urlsafe(32)
    return session['csrf']


def confere_csrf():
    enviado = request.form.get('csrf') or request.headers.get('X-CSRF-Token') or ''
    esperado = session.get('csrf', '')
    if not esperado or not hmac.compare_digest(enviado, esperado):
        abort(400, 'Sessão expirada ou formulário inválido. Volte e tente de novo.')


def aplica_cabecalhos(resp, https):
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    resp.headers['X-Frame-Options'] = 'DENY'
    resp.headers['Referrer-Policy'] = 'same-origin'
    resp.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    resp.headers['Content-Security-Policy'] = ("default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
                                              "form-action 'self'; frame-ancestors 'none'; base-uri 'self'")
    if not request.path.startswith('/static/'):
        resp.headers['Cache-Control'] = 'no-store'
    if https:
        resp.headers['Strict-Transport-Security'] = 'max-age=31536000'
    return resp


def proximo_seguro(destino, padrao='/'):
    """Só aceita caminho relativo do próprio sistema (evita redirecionar para outro site)."""
    if destino and destino.startswith('/') and not destino.startswith('//') and '\\' not in destino:
        return destino
    return padrao
