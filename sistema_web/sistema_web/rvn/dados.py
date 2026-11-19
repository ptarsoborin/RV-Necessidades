"""Guarda e entrega os dados importados (relatório de necessidades e Monitor de Estoque).

Regra central: o servidor só entrega a cada pessoa as linhas do seu alcance de dados. O filtro roda aqui,
no banco; o navegador nunca recebe o que não pode ver.
"""
import json

from . import db as bd
from . import leitor
from .leitor import ErroImportacao
from .permissoes import norm


class Duplicado(ErroImportacao):
    """Arquivo idêntico a um já importado."""
    def __init__(self, mensagem, ref_at):
        super().__init__(mensagem)
        self.ref_at = ref_at


def _json(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))


# ---------- relatório de necessidades ----------
def meta_relatorio(r, completo):
    m = {'id': r['id'], 'refAt': r['ref_at'], 'importedAt': r['importado_em'], 'importedBy': r['importado_por'], 'fileName': r['arquivo'],
         'notes': [{'level': n['nivel'], 'text': n['texto']} for n in json.loads(r['notas'])]}
    if completo:    # totais do arquivo inteiro só para quem enxerga tudo
        m.update({'itens': r['itens'], 'comprarN': r['comprar_n'], 'iminN': r['imin_n'], 'entN': r['ent_n'], 'size': r['tamanho'], 'sheet': r['aba']})
    return m


def listar_relatorios(db, perm):
    completo = perm.escopo()['tipo'] == 'todos'
    return [meta_relatorio(r, completo) for r in db.execute('SELECT * FROM relatorio ORDER BY ref_at DESC, importado_em DESC, id DESC')]


def importar_relatorio(db, usuario, nome_arquivo, dados, ref_campo='', forcar=False, manter=60):
    ref, origem = leitor.validar_data_ref(ref_campo, nome_arquivo)
    h = leitor.hash_arquivo(dados)
    dup = db.execute('SELECT ref_at FROM relatorio WHERE hash = ? LIMIT 1', (h,)).fetchone()
    if dup and not forcar:
        raise Duplicado('Este arquivo já foi importado como relatório de %s. Nada foi alterado.' % leitor.iso_br(dup['ref_at']), dup['ref_at'])
    lido = leitor.ler_relatorio(dados)
    linhas, notas = lido['linhas'], lido['notas']
    leitor.conferir_data_relatorio(linhas, ref, origem, notas)
    c = leitor.contagens(linhas)
    # uma nova importação da mesma data sobrepõe a anterior (as outras datas ficam como histórico)
    substituidos = [r['id'] for r in db.execute('SELECT id FROM relatorio WHERE ref_at = ?', (ref,))]
    for i in substituidos:
        db.execute('DELETE FROM relatorio WHERE id = ?', (i,))
    cur = db.execute(
        'INSERT INTO relatorio (ref_at, importado_em, usuario_id, importado_por, arquivo, tamanho, hash, aba, notas, itens, comprar_n, imin_n, ent_n) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
        (ref, bd.agora(), usuario['id'], usuario['nome'], (nome_arquivo or '')[:200], len(dados), h, lido['aba'], _json(notas),
         c['itens'], c['comprar_n'], c['imin_n'], c['ent_n']))
    rid = cur.fetchone()[0]
    db.executemany(
        'INSERT INTO relatorio_item (relatorio_id, comprador_n, marca_n, codigo, dados) VALUES (?, ?, ?, ?, ?)',
        [(rid, norm(r['comprador']), norm(r['marca']), r['codigo'], _json([r[k] for k in leitor.CAMPOS])) for r in linhas])
    podar_relatorios(db, manter, rid)
    db.commit()
    return db.execute('SELECT * FROM relatorio WHERE id = ?', (rid,)).fetchone(), c, len(substituidos)


def podar_relatorios(db, manter, preservar):
    """Guarda só os relatórios mais recentes (o que acabou de entrar nunca é apagado)."""
    if manter <= 0:
        return
    velhos = [r['id'] for r in db.execute('SELECT id FROM relatorio ORDER BY ref_at DESC, importado_em DESC, id DESC').fetchall()[manter:]]
    for i in velhos:
        if i != preservar:
            db.execute('DELETE FROM relatorio WHERE id = ?', (i,))


def excluir_relatorio(db, rid):
    r = db.execute('SELECT * FROM relatorio WHERE id = ?', (rid,)).fetchone()
    if r is None:
        return None
    db.execute('DELETE FROM relatorio WHERE id = ?', (rid,))
    db.commit()
    return r


def dados_relatorio(db, perm, rid):
    """Linhas do relatório dentro do alcance da pessoa, no formato compacto: o texto JSON já montado, ou None se não existe."""
    r = db.execute('SELECT id FROM relatorio WHERE id = ?', (rid,)).fetchone()
    if r is None:
        return None
    cond, params = perm.filtro_sql()
    linhas = [x['dados'] for x in db.execute('SELECT dados FROM relatorio_item WHERE relatorio_id = ? AND ' + cond, [rid] + params)]
    return '{"id":%d,"campos":%s,"linhas":[%s]}' % (rid, _json(leitor.CAMPOS), ','.join(linhas))


# ---------- Monitor de Estoque ----------
def meta_monitor(m, completo):
    d = {'id': m['id'], 'refAt': m['ref_at'], 'importedAt': m['importado_em'], 'importedBy': m['importado_por'], 'fileName': m['arquivo']}
    if completo:
        d.update({'linhas': m['linhas'], 'bloqueadas': m['bloqueadas'], 'pedidos': m['pedidos'], 'produtos': m['produtos'], 'size': m['tamanho'], 'sheet': m['aba']})
    return d


def listar_monitores(db, perm):
    completo = perm.escopo()['tipo'] == 'todos'
    return [meta_monitor(m, completo) for m in db.execute('SELECT * FROM monitor ORDER BY ref_at DESC, importado_em DESC, id DESC')]


def importar_monitor(db, usuario, nome_arquivo, dados, ref_campo='', manter=10):
    ref, _origem = leitor.validar_data_ref(ref_campo, nome_arquivo)
    h = leitor.hash_arquivo(dados)
    dup = db.execute('SELECT ref_at FROM monitor WHERE hash = ? LIMIT 1', (h,)).fetchone()
    if dup:
        raise Duplicado('Este arquivo já foi importado como Monitor de %s. Nada foi alterado.' % leitor.iso_br(dup['ref_at']), dup['ref_at'])
    lido = leitor.ler_monitor(dados)
    linhas = lido['linhas']
    r = leitor.resumo_monitor(linhas)
    # quantos itens cada pedido tem e quantos estão bloqueados: calculado aqui, sobre o arquivo inteiro,
    # porque quem tem alcance restrito só recebe as linhas dos seus produtos
    tot, blq = {}, {}
    for x in linhas:
        tot.setdefault(x['pedido'], set()).add(x['item'])
        if norm(x['situacao']) == 'bloqueado':
            blq.setdefault(x['pedido'], set()).add(x['item'])
    substituidos = [m['id'] for m in db.execute('SELECT id FROM monitor WHERE ref_at = ?', (ref,))]
    for i in substituidos:
        db.execute('DELETE FROM monitor WHERE id = ?', (i,))
    cur = db.execute(
        'INSERT INTO monitor (ref_at, importado_em, usuario_id, importado_por, arquivo, tamanho, hash, aba, linhas, bloqueadas, pedidos, produtos) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
        (ref, bd.agora(), usuario['id'], usuario['nome'], (nome_arquivo or '')[:200], len(dados), h, lido['aba'], r['linhas'], r['bloqueadas'], r['pedidos'], r['produtos']))
    mid = cur.fetchone()[0]
    db.executemany('INSERT INTO monitor_item (monitor_id, codigo, dados) VALUES (?, ?, ?)',
                   [(mid, x['codigo'], _json([x[k] for k in leitor.MON_CAMPOS] + [len(tot[x['pedido']]), len(blq.get(x['pedido'], ()))])) for x in linhas])
    if manter > 0:
        for m in db.execute('SELECT id FROM monitor ORDER BY ref_at DESC, importado_em DESC, id DESC').fetchall()[manter:]:
            if m['id'] != mid:
                db.execute('DELETE FROM monitor WHERE id = ?', (m['id'],))
    db.commit()
    return db.execute('SELECT * FROM monitor WHERE id = ?', (mid,)).fetchone(), r, len(substituidos)


def excluir_monitor(db, mid):
    m = db.execute('SELECT * FROM monitor WHERE id = ?', (mid,)).fetchone()
    if m is None:
        return None
    db.execute('DELETE FROM monitor WHERE id = ?', (mid,))
    db.commit()
    return m


def dados_monitor(db, perm, mid, rid, com_cliente_valor):
    """Linhas do Monitor dos produtos que a pessoa enxerga no relatório `rid`. Sem a permissão de cliente e valor,
    esses campos saem zerados daqui, antes de ir ao navegador."""
    if db.execute('SELECT id FROM monitor WHERE id = ?', (mid,)).fetchone() is None:
        return None
    campos = leitor.MON_CAMPOS + ['itTot', 'itBlq']
    if perm.escopo()['tipo'] == 'todos':
        brutas = [x['dados'] for x in db.execute('SELECT dados FROM monitor_item WHERE monitor_id = ?', (mid,))]
    else:
        cond, params = perm.filtro_sql()
        codigos = {x['codigo'] for x in db.execute('SELECT codigo FROM relatorio_item WHERE relatorio_id = ? AND ' + cond, [rid] + params)} if rid else set()
        brutas = [x['dados'] for x in db.execute('SELECT codigo, dados FROM monitor_item WHERE monitor_id = ?', (mid,)) if x['codigo'] in codigos]
    if not com_cliente_valor:
        ocultos = [campos.index(c) for c in leitor.MON_CAMPOS_CLIENTE]
        limpas = []
        for t in brutas:
            v = json.loads(t)
            for i in ocultos:
                v[i] = 0 if campos[i] == 'valor' else ''
            limpas.append(_json(v))
        brutas = limpas
    return '{"id":%d,"campos":%s,"linhas":[%s]}' % (mid, _json(campos), ','.join(brutas))
