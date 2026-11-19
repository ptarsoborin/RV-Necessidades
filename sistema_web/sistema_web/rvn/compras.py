"""Formulários de compra, budget, cadastro de fornecedores e dados da empresa.

Aqui ficam as regras de verdade: o navegador só mostra e envia pedidos; quem decide se uma pessoa pode editar, enviar,
aprovar, devolver, cancelar, ajustar preço acima da tolerância ou mexer no budget é o servidor, pelas permissões
de cada um (acao.*) e pelo alcance dos dados.
"""
import copy
import json
import math
import re
import uuid
from datetime import date, datetime, timedelta, timezone

from . import db as bd
from . import leitor
from .permissoes import NIVEL_ROTULO, norm

UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
STATUS = ('rascunho', 'pendente', 'aprovado', 'devolvido', 'recusado', 'cancelado')
MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
CAMPOS_FORNECEDOR = ['razao', 'cnpj', 'ie', 'contato', 'email', 'fone', 'endereco', 'bairro', 'cep', 'cidade', 'uf']
ROTULO_CAMPO = {'razao': 'Razão Social', 'cnpj': 'CNPJ', 'ie': 'I.E.', 'contato': 'Contato', 'email': 'E-mail', 'fone': 'Telefone', 'endereco': 'Endereço',
                'bairro': 'Bairro', 'cep': 'CEP', 'cidade': 'Cidade', 'uf': 'UF', 'prazoPgto': 'Prazo de pagamento', 'formaPgto': 'Forma de pagamento'}
MAX_ITENS = 500


class ErroRegra(Exception):
    """A ação não pode ser feita: a lista de motivos vai para a tela (código 422)."""
    def __init__(self, erros, titulo=''):
        super().__init__(titulo or (erros[0] if erros else ''))
        self.erros = [erros] if isinstance(erros, str) else list(erros)
        self.titulo = titulo
        self.pedido = None          # se as edições já foram gravadas antes da recusa, o formulário atualizado (para a tela manter a versão certa)


class Proibido(Exception):
    pass


class Conflito(Exception):
    pass


class NaoEncontrado(Exception):
    pass


# ---------- utilidades ----------
def agora_iso():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def nz(v):
    if v is None or isinstance(v, bool):
        return 0.0
    if isinstance(v, (int, float)):
        return 0.0 if (isinstance(v, float) and not math.isfinite(v)) else float(v)
    try:
        f = float(str(v).replace(',', '.'))
        return f if math.isfinite(f) else 0.0
    except ValueError:
        return 0.0


def r2(x):
    """Arredonda para centavos como o navegador (Math.round, meio para cima)."""
    return math.floor((nz(x) + 1e-9) * 100 + 0.5) / 100


def texto(v, n=200):
    return '' if v is None else str(v).strip()[:n]


def digitos(v):
    return re.sub(r'\D', '', '' if v is None else str(v))


def brl(v):
    s = '{:,.2f}'.format(nz(v)).replace(',', 'X').replace('.', ',').replace('X', '.')
    return 'R$ ' + s


def parse_iso(s):
    return datetime.fromisoformat(str(s).replace('Z', '+00:00'))


def ym_de(iso):
    """Mês (AAAA-MM) de uma data, no fuso do computador (como o navegador)."""
    return parse_iso(iso).astimezone().strftime('%Y-%m')


def ym_atual():
    return datetime.now().strftime('%Y-%m')


def ym_rotulo(ym):
    a, m = ym.split('-')
    return '%s/%s' % (MESES[int(m) - 1], a)


def quem(usuario):
    return '%s (%s)' % (usuario['nome'], NIVEL_ROTULO[usuario['nivel']])


def cnpj_valido(v):
    d = digitos(v)
    if len(d) != 14 or len(set(d)) == 1:
        return False

    def dv(n):
        pesos = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] if n == 12 else [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        r = sum(int(d[i]) * pesos[i] for i in range(n)) % 11
        return 0 if r < 2 else 11 - r
    return dv(12) == int(d[12]) and dv(13) == int(d[13])


def chave_forn(marca):
    return 'M:' + norm(marca)


# ---------- documentos simples (fornecedor, budget, empresa) ----------
def doc_ler(db, colecao, ident):
    r = db.execute('SELECT * FROM documento WHERE colecao = ? AND id = ?', (colecao, ident)).fetchone()
    return None if r is None else {'dados': json.loads(r['dados']), 'versao': r['versao'], 'em': r['atualizado_em'], 'por': r['atualizado_por']}


def doc_listar(db, colecao):
    return [{'dados': json.loads(r['dados']), 'versao': r['versao']} for r in db.execute('SELECT * FROM documento WHERE colecao = ? ORDER BY id', (colecao,))]


def doc_gravar(db, colecao, ident, dados, por, versao=None):
    """Grava um documento. Com `versao`, só grava se ninguém mudou antes (senão, Conflito)."""
    atual = db.execute('SELECT versao FROM documento WHERE colecao = ? AND id = ?', (colecao, ident)).fetchone()
    if atual is None:
        db.execute('INSERT INTO documento (colecao, id, versao, atualizado_em, atualizado_por, dados) VALUES (?, ?, 1, ?, ?, ?)',
                   (colecao, ident, agora_iso(), por, json.dumps(dados, ensure_ascii=False, separators=(',', ':'))))
        return 1
    if versao is not None and int(versao) != atual['versao']:
        raise Conflito('Os dados foram alterados por outra pessoa. Recarregue a página e refaça a mudança.')
    nova = atual['versao'] + 1
    db.execute('UPDATE documento SET versao = ?, atualizado_em = ?, atualizado_por = ?, dados = ? WHERE colecao = ? AND id = ?',
               (nova, agora_iso(), por, json.dumps(dados, ensure_ascii=False, separators=(',', ':')), colecao, ident))
    return nova


# ---------- empresa ----------
CAMPOS_EMPRESA = ['razao', 'fantasia', 'cnpj', 'ie', 'endereco', 'bairro', 'cep', 'cidade', 'uf', 'fone', 'email', 'contato']


def empresa_ler(db):
    r = doc_ler(db, 'empresa', 'empresa')
    return dict(r['dados'], versao=r['versao']) if r else {'id': 'empresa', 'versao': 0}


def empresa_gravar(db, usuario, entrada):
    e = {'id': 'empresa'}
    for c in CAMPOS_EMPRESA:
        e[c] = texto((entrada or {}).get(c), 200)
    erros = []
    if e['cnpj'] and not cnpj_valido(e['cnpj']):
        erros.append('CNPJ da empresa inválido.')
    if e['uf'] and e['uf'] not in UFS:
        erros.append('UF inválida.')
    if erros:
        raise ErroRegra(erros)
    e['atualizadoPor'] = quem(usuario)
    e['atualizadoEm'] = agora_iso()
    return doc_gravar(db, 'empresa', 'empresa', e, quem(usuario), (entrada or {}).get('versao') or None)


# ---------- cálculo do pedido (ICMS informativo, salvo "por fora"; IPI somado) ----------
def calc_pedido(p):
    fora = bool(p['pedido'].get('icmsFora'))
    itens = []
    for it in p['itens']:
        prod = r2(nz(it.get('qtd')) * nz(it.get('vunit')))
        icms = r2(prod * nz(it.get('icmsAliq')) / 100)
        ipi = r2(prod * nz(it.get('ipiAliq')) / 100)
        itens.append({'prod': prod, 'icms': icms, 'ipi': ipi, 'total': r2(prod + ipi + (icms if fora else 0))})
    produtos = r2(sum(x['prod'] for x in itens))
    icms = r2(sum(x['icms'] for x in itens))
    ipi = r2(sum(x['ipi'] for x in itens))
    d = p['pedido']
    return {'produtos': produtos, 'icms': icms, 'ipi': ipi,
            'geral': r2(produtos + ipi + (icms if fora else 0) + nz(d.get('freteValor')) + nz(d.get('outras')) - nz(d.get('desconto')))}


# ---------- limpeza do que o navegador envia ----------
def _limpa_itens(entrada, existente, db, base_relatorio):
    itens_in = (entrada or [])[:MAX_ITENS] if isinstance(entrada, list) else []
    antigos = {}
    for it in (existente or []):
        if it.get('codigo') and it['codigo'] not in antigos:
            antigos[it['codigo']] = it
    novos = [x for x in itens_in if isinstance(x, dict)]
    codigos = [texto(x.get('codigo'), 40) for x in novos]
    refs = _precos_de_referencia(db, base_relatorio, [c for c in codigos if c and c not in antigos])
    saida = []
    for x, cod in zip(novos, codigos):
        if cod in antigos:
            ref = nz(antigos[cod].get('precoRef'))          # a referência de preço nunca vem do navegador
        else:
            ref = refs.get(cod, 0.0)
        tipo = x.get('tipoNec')
        saida.append({'tipoNec': tipo if tipo in ('iminente', 'reposicao') else '', 'codigo': cod, 'descricao': texto(x.get('descricao'), 200),
                      'un': texto(x.get('un'), 10), 'qtd': nz(x.get('qtd')), 'fator': nz(x.get('fator')), 'vunit': nz(x.get('vunit')),
                      'icmsAliq': nz(x.get('icmsAliq')), 'ipiAliq': nz(x.get('ipiAliq')),
                      'origem': 'relatorio' if x.get('origem') == 'relatorio' else 'manual', 'precoRef': ref})
    return saida


def _precos_de_referencia(db, base_relatorio, codigos):
    """Último preço do relatório para cada código: é a base da regra de tolerância de preço."""
    if not codigos:
        return {}
    r = None
    if base_relatorio:
        r = db.execute('SELECT id FROM relatorio WHERE ref_at = ? ORDER BY importado_em DESC, id DESC LIMIT 1', (base_relatorio,)).fetchone()
    if r is None:
        r = db.execute('SELECT id FROM relatorio ORDER BY ref_at DESC, importado_em DESC, id DESC LIMIT 1').fetchone()
    if r is None:
        return {}
    i = leitor.CAMPOS.index('ultpreco')
    saida = {}
    codigos = list(dict.fromkeys(codigos))
    for k in range(0, len(codigos), 500):
        parte = codigos[k:k + 500]
        for x in db.execute('SELECT codigo, dados FROM relatorio_item WHERE relatorio_id = ? AND codigo IN (%s)' % ','.join('?' * len(parte)), [r['id']] + parte):
            saida[x['codigo']] = nz(json.loads(x['dados'])[i])
    return saida


def _limpa_moeda(m):
    if not isinstance(m, dict):
        return None
    itens = []
    for x in (m.get('itens') or [])[:2000]:
        if isinstance(x, dict):
            itens.append({'codigo': texto(x.get('codigo'), 40), 'descricao': texto(x.get('descricao'), 200), 'disp': nz(x.get('disp')),
                          'dias': None if x.get('dias') is None else nz(x.get('dias')), 'exc': nz(x.get('exc')), 'preco': nz(x.get('preco')), 'valor': nz(x.get('valor'))})
    return {'geradaEm': texto(m.get('geradaEm'), 40), 'por': texto(m.get('por'), 120), 'baseRelatorio': texto(m.get('baseRelatorio'), 10), 'criterio': texto(m.get('criterio'), 200),
            'total': nz(m.get('total')), 'obs': texto(m.get('obs'), 2000), 'itens': itens}


def limpar_conteudo(entrada, existente, db):
    """Só os campos que a pessoa pode editar, com tipo e tamanho conferidos. Número, situação, aprovação e histórico nunca vêm daqui."""
    entrada = entrada if isinstance(entrada, dict) else {}
    f_in = entrada.get('fornecedor') if isinstance(entrada.get('fornecedor'), dict) else {}
    d_in = entrada.get('pedido') if isinstance(entrada.get('pedido'), dict) else {}
    base = texto(entrada.get('baseRelatorio'), 10) if re.fullmatch(r'\d{4}-\d{2}-\d{2}', texto(entrada.get('baseRelatorio'), 10)) else (existente or {}).get('baseRelatorio', '')
    forn = {'marca': texto(f_in.get('marca'), 80)}
    for c in CAMPOS_FORNECEDOR:
        forn[c] = texto(f_in.get(c), 160)
    ped = {'frete': texto(d_in.get('frete'), 12), 'freteValor': nz(d_in.get('freteValor')), 'transportadora': texto(d_in.get('transportadora'), 120),
           'prazoPgto': texto(d_in.get('prazoPgto'), 80), 'formaPgto': texto(d_in.get('formaPgto'), 60), 'entrega': texto(d_in.get('entrega'), 10),
           'localEntrega': texto(d_in.get('localEntrega'), 300), 'refCotacao': texto(d_in.get('refCotacao'), 120), 'desconto': nz(d_in.get('desconto')),
           'outras': nz(d_in.get('outras')), 'icmsFora': bool(d_in.get('icmsFora')), 'obs': texto(d_in.get('obs'), 2000)}
    return {'comprador': texto(entrada.get('comprador'), 80), 'baseRelatorio': base, 'fornecedor': forn, 'pedido': ped,
            'itens': _limpa_itens(entrada.get('itens'), (existente or {}).get('itens'), db, base), 'moedaTroca': _limpa_moeda(entrada.get('moedaTroca'))}


def validar(p):
    e, f, d = [], p['fornecedor'], p['pedido']
    fone = digitos(f['fone'])
    if not f['razao']:
        e.append('Fornecedor: informe a Razão Social.')
    if not cnpj_valido(f['cnpj']):
        e.append('Fornecedor: CNPJ inválido ou não informado.')
    if not f['endereco']:
        e.append('Fornecedor: informe o endereço.')
    if len(digitos(f['cep'])) != 8:
        e.append('Fornecedor: o CEP deve ter 8 dígitos.')
    if not f['cidade']:
        e.append('Fornecedor: informe a cidade.')
    if f['uf'] not in UFS:
        e.append('Fornecedor: selecione a UF.')
    if not f['contato']:
        e.append('Fornecedor: informe o contato.')
    if not f['email'] and not fone:
        e.append('Fornecedor: informe o e-mail ou o telefone.')
    if f['email'] and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', f['email']):
        e.append('Fornecedor: e-mail inválido.')
    if fone and len(fone) not in (10, 11):
        e.append('Fornecedor: o telefone deve ter DDD e 8 ou 9 dígitos.')
    if not p['itens']:
        e.append('Inclua ao menos um item.')
    for i, it in enumerate(p['itens']):
        n = 'Item %d: ' % (i + 1)
        if not it['descricao']:
            e.append(n + 'informe a descrição.')
        if not nz(it['qtd']) > 0:
            e.append(n + 'a quantidade deve ser maior que zero.')
        if not it['un']:
            e.append(n + 'informe a unidade.')
        if not nz(it['fator']) > 0:
            e.append(n + 'o fator da quantidade total deve ser maior que zero.')
        if not nz(it['vunit']) > 0:
            e.append(n + 'o valor unitário deve ser maior que zero.')
        if not 0 <= nz(it['icmsAliq']) <= 100:
            e.append(n + 'a alíquota de ICMS deve estar entre 0 e 100.')
        if not 0 <= nz(it['ipiAliq']) <= 100:
            e.append(n + 'a alíquota de IPI deve estar entre 0 e 100.')
    if not d['frete']:
        e.append('Pedido: selecione o tipo de frete.')
    if not d['prazoPgto']:
        e.append('Pedido: informe o prazo de pagamento.')
    if not d['entrega']:
        e.append('Pedido: informe a data de entrega prevista.')
    elif not re.fullmatch(r'\d{4}-\d{2}-\d{2}', d['entrega']):
        e.append('Pedido: data de entrega inválida.')
    elif d['entrega'] < date.today().isoformat():
        e.append('Pedido: a entrega prevista está no passado.')
    if nz(d['desconto']) < 0 or nz(d['outras']) < 0 or nz(d['freteValor']) < 0:
        e.append('Pedido: frete, desconto e outras despesas não podem ser negativos.')
    return e


# ---------- armazenamento dos pedidos ----------
def _doc_do_banco(r):
    p = json.loads(r['dados'])
    p['id'], p['numero'], p['status'], p['versao'] = r['id'], r['numero'], r['status'], r['versao']
    return p


def pedidos_todos(db):
    return [_doc_do_banco(r) for r in db.execute('SELECT * FROM pedido ORDER BY criado_em, numero')]


def pedido_ler(db, pid):
    r = db.execute('SELECT * FROM pedido WHERE id = ?', (pid,)).fetchone()
    return None if r is None else _doc_do_banco(r)


def _gravar_pedido(db, p, novo):
    corpo = {k: v for k, v in p.items() if k not in ('id', 'numero', 'status', 'versao')}
    dados = json.dumps(corpo, ensure_ascii=False, separators=(',', ':'))
    if novo:
        db.execute('INSERT INTO pedido (id, numero, status, comprador_n, marca_n, versao, criado_em, atualizado_em, dados) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
                   (p['id'], p['numero'], p['status'], norm(p['comprador']), norm(p['fornecedor']['marca']), p['criadoEm'], p['atualizadoEm'], dados))
        p['versao'] = 1
    else:
        cur = db.execute('UPDATE pedido SET status = ?, comprador_n = ?, marca_n = ?, versao = versao + 1, atualizado_em = ?, dados = ? WHERE id = ? AND versao = ?',
                         (p['status'], norm(p['comprador']), norm(p['fornecedor']['marca']), p['atualizadoEm'], dados, p['id'], p['versao']))
        if cur.rowcount != 1:
            raise Conflito('Este formulário foi alterado por outra pessoa. Recarregue a página e refaça a mudança.')
        p['versao'] += 1


def proximo_numero(db):
    pre = 'SC-%d-' % date.today().year
    mx = 0
    for r in db.execute('SELECT numero FROM pedido WHERE numero LIKE ?', (pre + '%',)):
        try:
            mx = max(mx, int(r['numero'][len(pre):]))
        except ValueError:
            pass
    return '%s%04d' % (pre, mx + 1)


def log(p, usuario, acao, nota=''):
    p['historico'].append({'quando': agora_iso(), 'quem': quem(usuario), 'acao': acao, 'nota': nota})


# ---------- o que cada pessoa pode ----------
def enxerga(perm, p):
    return perm.enxerga(p['comprador'], p['fornecedor']['marca'])


def pode_ver(perm, p):
    return perm.pode('ver.formularios') and enxerga(perm, p)


def pode_editar(perm, p):
    if not enxerga(perm, p):
        return False
    if perm.pode('acao.aprovar_formulario') and p['status'] in ('rascunho', 'pendente', 'devolvido'):
        return True
    return perm.pode('acao.criar_formulario') and p['status'] in ('rascunho', 'devolvido')


def pode_excluir(perm, p):
    if p['status'] not in ('rascunho', 'devolvido', 'recusado', 'cancelado') or not enxerga(perm, p):
        return False
    return perm.pode('acao.criar_formulario') or perm.pode('acao.aprovar_formulario')


def pedidos_visiveis(db, perm):
    if not perm.pode('ver.formularios'):
        return []
    return [p for p in pedidos_todos(db) if enxerga(perm, p)]


# ---------- budget ----------
def budget_padrao():
    return {'id': 'budgets', 'ativa': False, 'tolPreco': 10, 'descontarCompromissos': False, 'meses': {}, 'previas': {}, 'log': [], 'atualizadoPor': '', 'atualizadoEm': ''}


def budget_ler(db):
    r = doc_ler(db, 'budget', 'budgets')
    if not r:
        return budget_padrao(), 0
    b = budget_padrao()
    b.update(r['dados'])
    return b, r['versao']


def acresc_total(e):
    return sum(nz(a.get('valor')) for a in (e or {}).get('acresc') or [])


def budget_total(e):
    return r2(nz(e.get('valor')) + acresc_total(e)) if e else 0.0


def budget_do_mes(b, marca, ym):
    return (b['meses'].get(ym) or {}).get(chave_forn(marca))


def preco_var(it):
    ref = nz(it.get('precoRef'))
    return (nz(it.get('vunit')) / ref - 1) * 100 if ref > 0 else None


def preco_faixa(it, tol):
    v = preco_var(it)
    if v is None:
        return 'sem'
    if v > tol + 1e-9:
        return 'acima'
    return 'margem' if v > 1e-9 else 'ok'


def itens_por_faixa(p, faixa, tol):
    return [i for i, it in enumerate(p['itens']) if preco_faixa(it, tol) == faixa]


def parcelas_do_pedido(p):
    txt = p['pedido'].get('prazoPgto') or ''
    dias, ok = [], True
    mx = re.search(r'(\d+)\s*x\b', txt, re.I)
    if re.search(r'vista|antecip', txt, re.I) and not re.search(r'\d{2,}', txt):
        dias = [0]
    elif mx and 0 < int(mx.group(1)) <= 60:
        dias = [30 * i for i in range(1, int(mx.group(1)) + 1)]
    else:
        dias = [int(n) for n in re.findall(r'\d+', txt) if 0 <= int(n) <= 365]
    if not dias:
        dias, ok = [0], False
    total = calc_pedido(p)['geral']
    n = len(dias)
    base = r2(total / n)
    ref = parse_iso(p['aprovacao']['em'] if p.get('aprovacao') else p['criadoEm'])
    parcelas = []
    for i, d in enumerate(dias):
        dt = ref + timedelta(days=d)
        parcelas.append({'dias': d, 'valor': r2(total - base * (n - 1)) if i == n - 1 else base, 'ym': dt.astimezone().strftime('%Y-%m')})
    return {'reconhecido': ok, 'parcelas': parcelas}


def texto_parcelas(p):
    r = parcelas_do_pedido(p)
    if not r['reconhecido']:
        return 'Prazo de pagamento não reconhecido: o valor é tratado como à vista. Use o formato 30/60/90 dias, 3x ou à vista.'
    n = len(r['parcelas'])
    valores = list(dict.fromkeys(brl(x['valor']) for x in r['parcelas']))
    return '%d %s de %s, vencendo em %s.' % (n, 'parcela' if n == 1 else 'parcelas', ' / '.join(valores),
                                             ', '.join('%d dias (%s)' % (x['dias'], ym_rotulo(x['ym'])) for x in r['parcelas']))


def comprometido_por_mes(todos, ym):
    mapa = {}
    for p in todos:
        if p['status'] != 'aprovado' or not p.get('aprovacao') or ym_de(p['aprovacao']['em']) >= ym:
            continue
        for x in parcelas_do_pedido(p)['parcelas']:
            if x['ym'] != ym:
                continue
            k = chave_forn(p['fornecedor']['marca'])
            mapa[k] = r2(mapa.get(k, 0) + x['valor'])
    return mapa


def uso_mes(todos, marca, ym, excluir_id):
    key, apr, pend, atual = norm(marca), 0.0, 0.0, ym_atual()
    for p in todos:
        if p['id'] == excluir_id or norm(p['fornecedor']['marca']) != key:
            continue
        g = calc_pedido(p)['geral']
        if p['status'] == 'aprovado' and p.get('aprovacao') and ym_de(p['aprovacao']['em']) == ym:
            apr += g
        elif p['status'] == 'pendente' and ym == atual:
            pend += g
    return r2(apr), r2(pend)


def saldo_budget(b, todos, marca, ym, excluir_id=None):
    total = budget_total(budget_do_mes(b, marca, ym))
    apr, pend = uso_mes(todos, marca, ym, excluir_id)
    comp = comprometido_por_mes(todos, ym).get(chave_forn(marca), 0.0)
    return {'budget': total, 'aprovado': apr, 'pendente': pend, 'compromissos': comp,
            'saldo': r2(total - apr - pend - (comp if b['descontarCompromissos'] else 0))}


def fornecedor_homologado(todos, p):
    cnpj = digitos(p['fornecedor']['cnpj'])
    return len(cnpj) == 14 and any(
        x['id'] != p['id'] and x['status'] == 'aprovado' and x.get('aprovacao') and x['aprovacao'].get('tipo') != 'budget'
        and digitos(x['fornecedor']['cnpj']) == cnpj and norm(x['fornecedor']['marca']) == norm(p['fornecedor']['marca']) for x in todos)


def elegivel_budget(b, todos, p):
    ym, tol = ym_atual(), nz(b['tolPreco'])
    total = calc_pedido(p)['geral']
    s = saldo_budget(b, todos, p['fornecedor']['marca'], ym, p['id'])
    m = []
    if not s['budget'] > 0:
        m.append('Este fornecedor não tem budget definido para %s.' % ym_rotulo(ym))
    elif total > s['saldo']:
        m.append('O pedido excede o saldo do budget do mês deste fornecedor.')
    for i in itens_por_faixa(p, 'acima', tol):
        cod = p['itens'][i]['codigo']
        m.append('Item %d%s: preço mais de %s%% acima do último preço. Só quem tem permissão para preço acima da tolerância pode ajustar ou aprovar.' % (i + 1, ' (%s)' % cod if cod else '', _num(tol)))
    if not fornecedor_homologado(todos, p):
        m.append('Fornecedor ainda não aprovado pela gerência (primeiro pedido ou CNPJ novo).')
    manuais = len([it for it in p['itens'] if it['origem'] != 'relatorio'])
    return {'ok': not m, 'motivos': m, 'regra': {'budget': s['budget'], 'saldoAntes': s['saldo'], 'total': total, 'mes': ym, 'tolPreco': tol, 'itensManuais': manuais}}


def _num(v):
    return ('%g' % v).replace('.', ',')


def budget_info(b, todos, p):
    ym = ym_atual()
    s = saldo_budget(b, todos, p['fornecedor']['marca'], ym, p['id'])
    total = calc_pedido(p)['geral']
    linhas = []
    bd = budget_do_mes(b, p['fornecedor']['marca'], ym)
    acr = acresc_total(bd)
    if not s['budget'] > 0:
        linhas.append('Sem budget definido para %s para este fornecedor.' % ym_rotulo(ym))
    else:
        linhas.append('Budget de %s: %s%s. Aprovado no mês: %s. Em aprovação: %s. Compromissos de meses anteriores neste mês: %s (%s). Saldo: %s. Este pedido: %s, %s' % (
            ym_rotulo(ym), brl(s['budget']), (' (base %s + acréscimos %s)' % (brl(bd.get('valor')), brl(acr))) if acr > 0 else '', brl(s['aprovado']), brl(s['pendente']),
            brl(s['compromissos']), 'descontados do saldo' if b['descontarCompromissos'] else 'informativo', brl(s['saldo']), brl(total),
            'excede o saldo.' if total > s['saldo'] else 'cabe no saldo.'))
    linhas.append('Pagamento: ' + texto_parcelas(p))
    return linhas


# ---------- cadastro de fornecedores ----------
def fornecedores_ler(db, perm):
    """Quem tem a página de fornecedores recebe o cadastro todo; quem só cria formulários recebe as Marcas do seu alcance."""
    todos = [dict(x['dados'], versao=x['versao']) for x in doc_listar(db, 'fornecedor')]
    if perm.pode('ver.fornecedores') and perm.escopo()['tipo'] == 'todos':
        return todos
    ultimo = db.execute('SELECT id FROM relatorio ORDER BY ref_at DESC, importado_em DESC, id DESC LIMIT 1').fetchone()
    marcas = set()
    if ultimo:
        cond, params = perm.filtro_sql()
        marcas = {r['marca_n'] for r in db.execute('SELECT DISTINCT marca_n FROM relatorio_item WHERE relatorio_id = ? AND ' + cond, [ultimo['id']] + params)}
    marcas |= {norm(p['fornecedor']['marca']) for p in pedidos_visiveis(db, perm)}
    return [f for f in todos if norm(f.get('marca')) in marcas]


def _registro_de_pedido(p, antes, usuario):
    f = p['fornecedor']
    reg = dict(antes or {})
    reg.update({'id': chave_forn(f['marca']), 'marca': antes['marca'] if antes else f['marca']})
    for c in CAMPOS_FORNECEDOR:
        reg[c] = f[c]
    reg.update({'prazoPgto': p['pedido']['prazoPgto'], 'formaPgto': p['pedido']['formaPgto'], 'atualizadoPor': quem(usuario), 'atualizadoEm': agora_iso(), 'origem': 'formulário'})
    return reg


def upsert_fornecedor_do_pedido(db, perm, usuario, p):
    """O cadastro existente só é atualizado por quem tem a permissão de cadastro; o comprador cria o que ainda não existe."""
    if not p['fornecedor']['marca']:
        return
    antes = doc_ler(db, 'fornecedor', chave_forn(p['fornecedor']['marca']))
    if antes and not perm.pode('acao.cadastro_fornecedor'):
        return
    doc_gravar(db, 'fornecedor', chave_forn(p['fornecedor']['marca']), _registro_de_pedido(p, antes['dados'] if antes else None, usuario), quem(usuario))


def campos_divergentes(db, p):
    f = doc_ler(db, 'fornecedor', chave_forn(p['fornecedor']['marca']))
    if not p['fornecedor']['marca'] or not f:
        return []
    f = f['dados']
    saida = []
    for c in CAMPOS_FORNECEDOR:
        a, b = texto(f.get(c), 400), texto(p['fornecedor'][c], 400)
        if a != '' and ((digitos(a) != digitos(b)) if c in ('cnpj', 'cep', 'fone') else a != b):
            saida.append(ROTULO_CAMPO[c])
    return saida


def fornecedores_gravar_lote(db, perm, usuario, registros):
    """Aplica registros do cadastro (importação de planilha ou edição). Só com a permissão de cadastro."""
    if not perm.pode('acao.cadastro_fornecedor'):
        raise Proibido('Você não tem permissão para alterar o cadastro de fornecedores.')
    if not isinstance(registros, list) or len(registros) > 2000:
        raise ErroRegra('Lista de fornecedores inválida.')
    erros, limpos = [], []
    for i, r in enumerate(registros):
        if not isinstance(r, dict) or not texto(r.get('marca'), 80):
            erros.append('Registro %d: informe a Marca.' % (i + 1))
            continue
        reg = {'id': chave_forn(r['marca']), 'marca': texto(r['marca'], 80)}
        for c in CAMPOS_FORNECEDOR:
            reg[c] = texto(r.get(c), 160)
        reg['prazoPgto'], reg['formaPgto'] = texto(r.get('prazoPgto'), 80), texto(r.get('formaPgto'), 60)
        if reg['cnpj'] and not cnpj_valido(reg['cnpj']):
            erros.append('%s: CNPJ inválido.' % reg['marca'])
        if reg['uf'] and reg['uf'] not in UFS:
            erros.append('%s: UF inválida.' % reg['marca'])
        limpos.append(reg)
    if erros:
        raise ErroRegra(erros[:30], 'Nada foi gravado:')
    for reg in limpos:
        antes = doc_ler(db, 'fornecedor', reg['id'])
        novo = dict(antes['dados'] if antes else {}, **reg)
        novo.update({'atualizadoPor': quem(usuario), 'atualizadoEm': agora_iso(), 'origem': 'planilha'})
        doc_gravar(db, 'fornecedor', reg['id'], novo, quem(usuario))
    return len(limpos)


# ---------- budget: gravação com as permissões de cada parte ----------
def budget_gravar(db, perm, usuario, entrada, versao, logs):
    if perm.escopo()['tipo'] != 'todos':
        raise Proibido('O budget depende de todos os formulários: só quem enxerga todos os compradores pode alterá-lo.')
    atual, ver_atual = budget_ler(db)
    if versao is not None and int(versao) != ver_atual:
        raise Conflito('O budget foi alterado por outra pessoa. Recarregue a página e refaça a mudança.')
    if not isinstance(entrada, dict):
        raise ErroRegra('Dados do budget inválidos.')
    novo = copy.deepcopy(atual)
    regras = (bool(entrada.get('ativa')), nz(entrada.get('tolPreco')), bool(entrada.get('descontarCompromissos')))
    antes_r = (bool(atual['ativa']), nz(atual['tolPreco']), bool(atual['descontarCompromissos']))
    if regras != antes_r:
        if not perm.pode('acao.budget_regras'):
            raise Proibido('Só quem tem permissão para as regras do budget liga a aprovação por budget ou muda a tolerância de preço e os compromissos.')
        if not 0 <= regras[1] <= 1000:
            raise ErroRegra('A tolerância de preço deve estar entre 0 e 1000%.')
        novo['ativa'], novo['tolPreco'], novo['descontarCompromissos'] = regras
    meses, previas = entrada.get('meses'), entrada.get('previas')
    if not isinstance(meses, dict) or not isinstance(previas, dict):
        raise ErroRegra('Dados do budget inválidos.')
    if json.dumps(meses, sort_keys=True) != json.dumps(atual['meses'], sort_keys=True) or json.dumps(previas, sort_keys=True) != json.dumps(atual['previas'], sort_keys=True):
        if not perm.pode('acao.budget_lancar'):
            raise Proibido('Você não tem permissão para lançar budget.')
        mes_atual = ym_atual()
        for ym in set(meses) | set(atual['meses']):                     # meses encerrados não mudam
            if ym < mes_atual and json.dumps(meses.get(ym), sort_keys=True) != json.dumps(atual['meses'].get(ym), sort_keys=True):
                raise ErroRegra('O budget de %s já encerrou e não pode ser alterado.' % ym_rotulo(ym))
        for ym, mes in meses.items():
            if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', ym) or not isinstance(mes, dict):
                raise ErroRegra('Mês de budget inválido.')
            for k, e in mes.items():
                if not isinstance(e, dict) or nz(e.get('valor')) < 0 or any(nz(a.get('valor')) <= 0 for a in e.get('acresc') or [] if isinstance(a, dict)):
                    raise ErroRegra('Valor de budget inválido em %s.' % ym_rotulo(ym))
        novo['meses'], novo['previas'] = meses, previas
        # quem e quando: o servidor carimba as linhas que mudaram
        for ym, mes in novo['meses'].items():
            for k, e in mes.items():
                ant = (atual['meses'].get(ym) or {}).get(k)
                if json.dumps(ant, sort_keys=True) != json.dumps(e, sort_keys=True):
                    e['por'], e['em'] = quem(usuario), agora_iso()
    linhas = [texto(t, 400) for t in (logs or []) if isinstance(t, (str,))][:60]
    if linhas:
        agora = agora_iso()
        novo['log'] = (novo.get('log') or []) + [{'quando': agora, 'quem': quem(usuario), 'acao': t} for t in linhas]
        novo['log'] = novo['log'][-300:]
        novo['atualizadoPor'], novo['atualizadoEm'] = quem(usuario), agora
    elif json.dumps({k: v for k, v in novo.items() if k not in ('log', 'atualizadoPor', 'atualizadoEm')}, sort_keys=True) != \
            json.dumps({k: v for k, v in atual.items() if k not in ('log', 'atualizadoPor', 'atualizadoEm')}, sort_keys=True):
        novo['atualizadoPor'], novo['atualizadoEm'] = quem(usuario), agora_iso()
    nova_versao = doc_gravar(db, 'budget', 'budgets', novo, quem(usuario), versao if ver_atual else None)
    return novo, nova_versao


# ---------- ações sobre os formulários ----------
def criar_pedido(db, perm, usuario, entrada):
    if not perm.pode('acao.criar_formulario'):
        raise Proibido('Você não tem permissão para criar formulários de compra.')
    c = limpar_conteudo(entrada, None, db)
    if not c['comprador']:
        raise ErroRegra('Informe o comprador.')
    if not enxerga_conteudo(perm, c):
        raise Proibido('Este comprador ou fornecedor está fora do seu alcance de dados.')
    agora = agora_iso()
    p = {'id': 'ped-' + uuid.uuid4().hex[:12], 'numero': '', 'protheus': '', 'status': 'rascunho', 'criadoPor': quem(usuario), 'criadoEm': agora, 'atualizadoEm': agora,
         'aprovacao': None, 'historico': []}
    p.update(c)
    nIm = len([i for i in p['itens'] if i['tipoNec'] == 'iminente'])
    nRe = len([i for i in p['itens'] if i['tipoNec'] == 'reposicao'])
    origem = (entrada or {}).get('copiaDe')
    if origem:
        nota = 'cópia de ' + texto(origem, 20)
    elif p['itens']:
        nota = '%d item(ns) da necessidade de compra' % len(p['itens']) + (' (%d ruptura(s), %d de reposição de 60 dias)' % (nIm, nRe) if nIm or nRe else '')
    else:
        nota = 'em branco'
    log(p, usuario, 'Formulário criado', nota)
    if p['moedaTroca']:
        log(p, usuario, 'Proposta de moeda de troca anexada', '%d item(ns), %s (anotação interna, não vai no PDF do pedido)' % (len(p['moedaTroca']['itens']), brl(p['moedaTroca']['total'])))
    for _tentativa in range(6):
        p['numero'] = proximo_numero(db)
        try:
            _gravar_pedido(db, p, True)
            break
        except bd.IntegrityError:
            db.rollback()
    else:
        raise Conflito('Não foi possível numerar o formulário. Tente de novo.')
    db.commit()
    return p


def enxerga_conteudo(perm, c):
    return perm.enxerga(c['comprador'], c['fornecedor']['marca'])


def editar_pedido(db, perm, usuario, p, entrada, versao):
    if int(versao) != p['versao']:
        raise Conflito('Este formulário foi alterado por outra pessoa. Recarregue a página e refaça a mudança.')
    if not pode_editar(perm, p):
        raise Proibido('Você não pode editar este formulário na situação em que ele está.')
    b, _v = budget_ler(db)
    tol = nz(b['tolPreco'])
    c = limpar_conteudo(entrada, p, db)
    if not c['comprador']:
        c['comprador'] = p['comprador']
    if not enxerga_conteudo(perm, c):
        raise Proibido('Este comprador ou fornecedor está fora do seu alcance de dados.')
    # preço acima da tolerância: só quem tem a permissão cria ou muda um preço assim
    acima = [it for it in c['itens'] if preco_faixa(it, tol) == 'acima']
    if acima and not perm.pode('acao.preco_acima'):
        antigos = {(i['codigo'], i['vunit'], i['precoRef']) for i in p['itens']}
        novos = [str(i + 1) for i, it in enumerate(c['itens']) if preco_faixa(it, tol) == 'acima' and (it['codigo'], it['vunit'], it['precoRef']) not in antigos]
        if novos:
            raise ErroRegra('Item(ns) %s: o preço passa de %s%% sobre o último preço. Só quem tem permissão para preço acima da tolerância pode ajustar. O valor anterior foi mantido.' % (', '.join(novos), _num(tol)),
                            'Preço acima da tolerância:')
    antes = json.dumps({k: p[k] for k in ('comprador', 'baseRelatorio', 'fornecedor', 'pedido', 'itens', 'moedaTroca')}, sort_keys=True)
    tinha_moeda = bool(p.get('moedaTroca'))
    p.update(c)
    depois = json.dumps({k: p[k] for k in ('comprador', 'baseRelatorio', 'fornecedor', 'pedido', 'itens', 'moedaTroca')}, sort_keys=True)
    if antes != depois:
        if p['moedaTroca'] and not tinha_moeda:
            log(p, usuario, 'Proposta de moeda de troca anexada', '%d item(ns), %s (anotação interna, não vai no PDF do pedido)' % (len(p['moedaTroca']['itens']), brl(p['moedaTroca']['total'])))
        elif tinha_moeda and not p['moedaTroca']:
            log(p, usuario, 'Proposta de moeda de troca removida')
        log(p, usuario, 'Editado')
        if perm.pode('acao.preco_acima') and acima:
            log(p, usuario, 'Preço acima da tolerância mantido por quem tem permissão', 'itens ' + ', '.join(str(i + 1) for i in itens_por_faixa(p, 'acima', tol)))
        p['atualizadoEm'] = agora_iso()
        _gravar_pedido(db, p, False)
        db.commit()
    return p


def agir_pedido(db, perm, usuario, p, acao, nota, versao, valor=''):
    """Muda a situação do formulário. Cada ação confere a permissão, o alcance e as regras; devolve o formulário atualizado."""
    if int(versao) != p['versao']:
        raise Conflito('Este formulário foi alterado por outra pessoa. Recarregue a página e refaça a mudança.')
    if not enxerga(perm, p):
        raise Proibido('Este formulário está fora do seu alcance de dados.')
    nota = texto(nota, 2000)
    b, _v = budget_ler(db)
    tol = nz(b['tolPreco'])
    todos = pedidos_todos(db)
    agora = agora_iso()
    criador = perm.pode('acao.criar_formulario')
    aprovador = perm.pode('acao.aprovar_formulario')

    def gravar():
        p['atualizadoEm'] = agora_iso()
        _gravar_pedido(db, p, False)

    if acao == 'enviar':
        if not (criador or aprovador) or p['status'] not in ('rascunho', 'devolvido') or not pode_editar(perm, p):
            raise Proibido('Você não pode enviar este formulário para aprovação.')
        erros = validar(p)
        if erros:
            raise ErroRegra(erros)
        p['status'] = 'pendente'
        log(p, usuario, 'Enviado para aprovação')
        upsert_fornecedor_do_pedido(db, perm, usuario, p)
    elif acao == 'aprovar':
        if not aprovador or p['status'] not in ('pendente', 'rascunho'):
            raise Proibido('Você não pode aprovar este formulário.')
        erros = validar(p)
        if erros:
            raise ErroRegra(erros)
        acima = itens_por_faixa(p, 'acima', tol)
        if acima:
            lista = ', '.join(str(i + 1) for i in acima)
            if not perm.pode('acao.preco_acima'):
                raise ErroRegra('Só quem tem permissão para preço acima da tolerância aprova ou ajusta preço acima de %s%% do último preço. Itens: %s.' % (_num(tol), lista), 'Preço acima da tolerância:')
            if not nota:
                raise ErroRegra('Escreva, na observação da decisão, a justificativa do preço acima de %s%% do último preço (itens %s).' % (_num(tol), lista), 'Justificativa necessária:')
            log(p, usuario, 'Preço acima da tolerância aprovado', 'itens %s: %s' % (lista, nota))
        direto = p['status'] == 'rascunho'
        dif = campos_divergentes(db, p)
        if dif:
            log(p, usuario, 'Cadastro do fornecedor atualizado pela aprovação', ', '.join(dif))
        p['status'] = 'aprovado'
        p['aprovacao'] = {'por': quem(usuario), 'em': agora, 'nota': nota}
        log(p, usuario, 'Aprovado (direto do rascunho)' if direto else 'Aprovado', nota)
        upsert_fornecedor_do_pedido(db, perm, usuario, p)
    elif acao == 'budget':
        if not perm.pode('acao.aprovar_por_budget') or not criador or not b['ativa'] or p['status'] not in ('rascunho', 'devolvido') or not pode_editar(perm, p):
            raise Proibido('A aprovação por budget não está disponível para este formulário.')
        erros = validar(p)
        if erros:
            raise ErroRegra(erros, 'Corrija antes de continuar:')
        el = elegivel_budget(b, todos, p)
        if not el['ok']:
            raise ErroRegra(el['motivos'], 'Este pedido precisa de aprovação da gerência:')
        p['status'] = 'aprovado'
        p['aprovacao'] = {'por': quem(usuario), 'em': agora, 'nota': '', 'tipo': 'budget', 'regra': el['regra'], 'regraPor': b.get('atualizadoPor', ''), 'regraEm': b.get('atualizadoEm', '')}
        r = el['regra']
        log(p, usuario, 'Aprovado por budget', 'budget de %s %s, saldo antes do pedido %s, pedido %s' % (ym_rotulo(r['mes']), brl(r['budget']), brl(r['saldoAntes']), brl(r['total'])))
        upsert_fornecedor_do_pedido(db, perm, usuario, p)
    elif acao == 'revisar':
        if not aprovador or p['status'] != 'aprovado' or (p.get('aprovacao') or {}).get('tipo') != 'budget' or p['aprovacao'].get('revisadoEm'):
            raise Proibido('Este formulário não precisa de revisão ou você não pode revisá-lo.')
        p['aprovacao']['revisadoPor'], p['aprovacao']['revisadoEm'] = quem(usuario), agora
        log(p, usuario, 'Revisado pela gerência', nota)
    elif acao in ('devolver', 'recusar'):
        if not aprovador or p['status'] not in ('pendente', 'rascunho'):
            raise Proibido('Você não pode %s este formulário.' % acao)
        if not nota:
            raise ErroRegra('Escreva a observação da decisão para %s.' % ('devolver' if acao == 'devolver' else 'recusar'))
        p['status'] = 'devolvido' if acao == 'devolver' else 'recusado'
        log(p, usuario, 'Devolvido ao comprador' if acao == 'devolver' else 'Recusado', nota)
    elif acao == 'cancelar':
        if not perm.pode('acao.cancelar_formulario') or p['status'] != 'aprovado':
            raise Proibido('Você não pode cancelar este pedido aprovado.')
        if not nota:
            raise ErroRegra('Escreva a observação da decisão para cancelar.')
        p['status'] = 'cancelado'
        log(p, usuario, 'Pedido aprovado cancelado', nota)
    elif acao == 'protheus':
        if p['status'] != 'aprovado' or not (criador or aprovador):
            raise Proibido('Você não pode informar o nº do Protheus deste formulário.')
        p['protheus'] = texto(valor, 40)
        log(p, usuario, 'Nº do Protheus informado', p['protheus'])
    else:
        raise ErroRegra('Ação desconhecida.')
    gravar()
    db.commit()
    return p


def excluir_pedido(db, perm, p, versao):
    if int(versao) != p['versao']:
        raise Conflito('Este formulário foi alterado por outra pessoa. Recarregue a página e refaça a mudança.')
    if not pode_excluir(perm, p):
        raise Proibido('Você não pode excluir este formulário na situação em que ele está.')
    db.execute('DELETE FROM pedido WHERE id = ?', (p['id'],))
    db.commit()


def avaliar(db, perm, usuario, entrada):
    """Mostra, para o formulário que está na tela (ainda sem gravar), a faixa de preço e o que o budget permite."""
    b, _v = budget_ler(db)
    entrada = entrada if isinstance(entrada, dict) else {}
    existente = pedido_ler(db, entrada['id']) if entrada.get('id') else None
    if existente is not None and not pode_ver(perm, existente):
        raise Proibido('Este formulário está fora do seu alcance de dados.')
    c = limpar_conteudo(entrada, existente, db)
    p = dict(existente or {'id': '', 'status': 'rascunho', 'criadoEm': agora_iso(), 'aprovacao': None}, **c)
    todos = pedidos_todos(db)
    saida = {'ativa': b['ativa'], 'tolPreco': nz(b['tolPreco']), 'total': calc_pedido(p)['geral'], 'precoRef': [it['precoRef'] for it in p['itens']]}
    if perm.pode('ver.budget'):
        saida['info'] = budget_info(b, todos, p)
    if b['ativa'] and perm.pode('acao.aprovar_por_budget'):
        saida['elegivel'] = elegivel_budget(b, todos, p)
    return saida
