"""Comandos: python -m rvn <comando>  (servir, criar-admin, redefinir-senha, backup, init-db)."""
import argparse
import getpass
import sys

from . import config as cfg
from . import create_app, db as bd, seguranca


def _pedir_senha(login, nome):
    while True:
        s1 = getpass.getpass('Senha para %s (mínimo %d caracteres, com letras e números): ' % (login, seguranca.SENHA_MIN))
        erros = seguranca.erros_da_senha(s1, login, nome)
        if erros:
            print('\n'.join(erros))
            continue
        if s1 != getpass.getpass('Repita a senha: '):
            print('As senhas são diferentes.')
            continue
        return s1


def main(argv=None):
    p = argparse.ArgumentParser(prog='rvn', description='RV Necessidades, versão web')
    sub = p.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('servir', help='liga o sistema')
    s.add_argument('--host', default='127.0.0.1', help='endereço (padrão 127.0.0.1; use 0.0.0.0 para a rede do escritório)')
    s.add_argument('--porta', type=int, default=8080)
    a = sub.add_parser('criar-admin', help='cria o admin (uso único, na instalação)')
    a.add_argument('--login', required=True)
    a.add_argument('--nome', required=True)
    a.add_argument('--email', default='')
    r = sub.add_parser('redefinir-senha', help='gera uma senha temporária para um usuário')
    r.add_argument('--login', required=True)
    b = sub.add_parser('backup', help='copia o banco para uma pasta, mantendo as últimas cópias')
    b.add_argument('--pasta', default=None, help='pasta de destino (padrão: dados/backup)')
    b.add_argument('--manter', type=int, default=30)
    sub.add_parser('init-db', help='cria ou atualiza as tabelas')
    sub.add_parser('tem-admin', help='sai com código 0 se já existe um admin (usado pelo instalar.bat)')
    args = p.parse_args(argv)

    pasta = cfg.pasta_dados()
    if args.cmd == 'init-db':
        bd.init_db(cfg.alvo_banco(pasta))
        print('Banco pronto em', 'Postgres' if cfg.url_banco() else pasta / 'rvn.db')
        return 0
    if args.cmd == 'backup':
        bd.init_db(cfg.alvo_banco(pasta))
        destino = bd.backup(cfg.alvo_banco(pasta), args.pasta or (pasta / 'backup'), args.manter)
        print('Backup gravado em', destino)
        return 0
    if args.cmd == 'tem-admin':
        bd.init_db(cfg.alvo_banco(pasta))
        conn = bd.conectar(cfg.alvo_banco(pasta))
        try:
            return 0 if conn.execute("SELECT 1 FROM usuario WHERE nivel = 'admin'").fetchone() else 1
        finally:
            conn.close()
    app = create_app()
    if args.cmd == 'servir':
        from waitress import serve
        print('RV Necessidades no ar em http://%s:%d  (Ctrl+C para parar)' % (args.host, args.porta))
        serve(app, host=args.host, port=args.porta, threads=8)
        return 0
    with app.app_context():
        db = bd.get_db()
        if args.cmd == 'criar-admin':
            if db.execute("SELECT 1 FROM usuario WHERE nivel = 'admin'").fetchone():
                print('Já existe um admin. Nada foi feito.')
                return 1
            senha = _pedir_senha(args.login, args.nome)
            db.execute("INSERT INTO usuario (login, nome, email, nivel, senha_hash, deve_trocar, criado_em) VALUES (?, ?, ?, 'admin', ?, 0, ?)",
                       (args.login.strip().lower(), args.nome.strip(), args.email.strip(), seguranca.hash_senha(senha), bd.agora()))
            db.commit()
            bd.registrar('admin_criado', args.login, None, 'linha de comando')
            print('Admin criado. Entre no sistema com o usuário', args.login.strip().lower())
            return 0
        if args.cmd == 'redefinir-senha':
            u = db.execute('SELECT * FROM usuario WHERE lower(login) = lower(?)', (args.login,)).fetchone()
            if not u:
                print('Usuário não encontrado.')
                return 1
            senha = seguranca.gerar_senha()
            db.execute("UPDATE usuario SET senha_hash = ?, deve_trocar = 1, sessao_versao = sessao_versao + 1, tentativas = 0, bloqueado_ate = '' WHERE id = ?", (seguranca.hash_senha(senha), u['id']))
            db.commit()
            bd.registrar('senha_redefinida', u['login'] + ' (linha de comando)', None, 'linha de comando')
            print('Senha temporária de %s: %s  (será pedida a troca no primeiro acesso)' % (u['login'], senha))
            return 0
    return 0


if __name__ == '__main__':
    sys.exit(main())
