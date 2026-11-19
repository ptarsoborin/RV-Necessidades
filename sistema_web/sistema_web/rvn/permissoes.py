"""Catálogo de permissões, padrão por nível e resolução do que cada pessoa pode ver e fazer.

Três camadas, da mais geral para a mais específica:
  1. o padrão do nível (Admin, Gerência, Diretoria, Comprador), editável só pelo admin;
  2. a exceção por pessoa (herdar, permitir ou bloquear cada permissão);
  3. o alcance dos dados (tudo, só os próprios itens, ou compradores e Marcas escolhidos).

O admin nunca perde permissão (não dá para trancar a si mesmo). As permissões de estrutura
(usuários, permissões, registro de ações, parâmetros) pertencem só ao admin e não são delegáveis.
"""
import re
import unicodedata

NIVEIS = [('admin', 'Admin'), ('gerencia', 'Gerência'), ('diretoria', 'Diretoria'), ('comprador', 'Comprador')]
NIVEIS_CHAVES = [n[0] for n in NIVEIS]
NIVEL_ROTULO = dict(NIVEIS)
NIVEIS_EDITAVEIS = ['gerencia', 'diretoria', 'comprador']      # o admin sempre tem tudo

ESCOPOS = [('todos', 'Todos os compradores'), ('proprios', 'Só os próprios itens'), ('selecionados', 'Compradores e Marcas escolhidos')]
ESCOPOS_NIVEL = ['todos', 'proprios']                          # por nível; "selecionados" só por pessoa

# (chave, rótulo, grupo, padrão admin/gerência/diretoria/comprador)
CATALOGO = [
    ('ver.painel', 'Visão geral', 'Páginas do menu', '1111'),
    ('ver.rupturas', 'Rupturas', 'Páginas do menu', '1111'),
    ('ver.atrasos', 'Atrasos de entrega', 'Páginas do menu', '1111'),
    ('ver.nec60', 'Necessidade 60 dias', 'Páginas do menu', '1111'),
    ('ver.moeda', 'Moeda de troca', 'Páginas do menu', '1111'),
    ('ver.bloqueados', 'Pedidos bloqueados', 'Páginas do menu', '1111'),
    ('ver.todos', 'Todos os itens', 'Páginas do menu', '1111'),
    ('ver.divergencias', 'Divergências', 'Páginas do menu', '1111'),
    ('ver.formularios', 'Formulários', 'Páginas do menu', '1111'),
    ('ver.relatorios', 'Relatórios', 'Páginas do menu', '1111'),
    ('ver.fornecedores', 'Fornecedores (cadastro)', 'Páginas do menu', '1110'),
    ('ver.budget', 'Budget', 'Páginas do menu', '1110'),
    ('ver.importar', 'Importar relatório', 'Páginas do menu', '1100'),
    ('ver.exportar', 'Exportar PDF e Excel', 'Páginas do menu', '1111'),
    ('acao.importar_relatorio', 'Importar o relatório de necessidades', 'O que pode fazer', '1100'),
    ('acao.importar_monitor', 'Importar o Monitor de Estoque', 'O que pode fazer', '1100'),
    ('acao.excluir_relatorio', 'Excluir relatório ou Monitor importado', 'O que pode fazer', '1000'),
    ('acao.criar_formulario', 'Criar e editar formulários de compra', 'O que pode fazer', '1101'),
    ('acao.aprovar_formulario', 'Aprovar, devolver e recusar formulários', 'O que pode fazer', '1110'),
    ('acao.cancelar_formulario', 'Cancelar formulário aprovado', 'O que pode fazer', '1100'),
    ('acao.aprovar_por_budget', 'Aprovar o próprio pedido por budget (quando ligado)', 'O que pode fazer', '1001'),
    ('acao.budget_lancar', 'Lançar budget, acréscimos e prévia', 'O que pode fazer', '1100'),
    ('acao.budget_regras', 'Ligar a aprovação por budget e mudar tolerância e compromissos', 'O que pode fazer', '1000'),
    ('acao.preco_acima', 'Aprovar ou ajustar preço acima da tolerância', 'O que pode fazer', '1000'),
    ('acao.cadastro_fornecedor', 'Editar e importar o cadastro de fornecedores', 'O que pode fazer', '1100'),
    ('acao.dados_empresa', 'Alterar os dados da empresa', 'O que pode fazer', '1000'),
    ('acao.moeda_criterios', 'Alterar os critérios da moeda de troca', 'O que pode fazer', '1000'),
    ('acao.relatorios_pedir', 'Gerar relatórios em PDF e Excel', 'O que pode fazer', '1111'),
    ('ver.cliente_valor', 'Ver cliente e valor dos pedidos no Monitor de Estoque', 'Dados', '1111'),
]
CHAVES = [c[0] for c in CATALOGO]
ROTULO = {c[0]: c[1] for c in CATALOGO}
GRUPOS = []
for _c in CATALOGO:
    if _c[2] not in GRUPOS:
        GRUPOS.append(_c[2])

ESCOPO_CHAVE = 'escopo.dados'
ESCOPO_PADRAO = {'admin': 'todos', 'gerencia': 'todos', 'diretoria': 'todos', 'comprador': 'proprios'}

# estrutura: só o admin, nunca delegável nem listada na matriz editável
ESTRUTURA = [
    ('estrutura.usuarios', 'Criar e editar usuários'),
    ('estrutura.permissoes', 'Definir níveis e permissões'),
    ('estrutura.auditoria', 'Ver o registro de ações'),
    ('estrutura.parametros', 'Mudar parâmetros do sistema'),
]
ESTRUTURA_CHAVES = [e[0] for e in ESTRUTURA]

# menu lateral: (id, rótulo, [permissões "ver." que liberam], destino)
MENU = [
    ('painel', 'Visão geral', ['ver.painel']),
    ('rupturas', 'Rupturas', ['ver.rupturas']),
    ('atrasos', 'Atrasos de entrega', ['ver.atrasos']),
    ('nec60', 'Necessidade 60 dias', ['ver.nec60']),
    ('moeda', 'Moeda de troca', ['ver.moeda']),
    ('bloqueados', 'Pedidos bloqueados', ['ver.bloqueados']),
    ('todos', 'Todos os itens', ['ver.todos']),
    ('divergencias', 'Divergências', ['ver.divergencias']),
    ('formularios', 'Formulários', ['ver.formularios']),
    ('relatorios', 'Relatórios', ['ver.relatorios']),
    ('fornecedores', 'Fornecedores e budget', ['ver.fornecedores', 'ver.budget']),
    ('importar', 'Importar e exportar', ['ver.importar', 'ver.exportar']),
]
PAGINAS = {chave.split('.', 1)[1]: ROTULO[chave] for chave in CHAVES if chave.startswith('ver.') and chave != 'ver.cliente_valor'}


def padrao(chave, nivel):
    """Valor padrão de uma permissão para um nível ('1' ou '0')."""
    for c in CATALOGO:
        if c[0] == chave:
            return c[3][NIVEIS_CHAVES.index(nivel)]
    raise KeyError(chave)


def norm(txt):
    t = unicodedata.normalize('NFD', str(txt or ''))
    return re.sub(r'[^a-z0-9]', '', ''.join(ch for ch in t if not unicodedata.combining(ch)).lower())


class Permissoes:
    """O que uma pessoa pode ver e fazer, já com as exceções aplicadas."""

    def __init__(self, nivel, valores, escopo, compradores, marcas, comprador_protheus):
        self.nivel = nivel
        self._v = valores                  # chave -> bool
        self.escopo_tipo = escopo          # todos | proprios | selecionados
        self.compradores = list(compradores)
        self.marcas = list(marcas)
        self.comprador_protheus = comprador_protheus or ''

    def pode(self, chave):
        if chave in ESTRUTURA_CHAVES:
            return self.nivel == 'admin'
        if self.nivel == 'admin':
            return True
        return bool(self._v.get(chave, False))

    def paginas(self):
        return [p for p in PAGINAS if self.pode('ver.' + p)]

    def menu(self):
        itens = []
        for ident, rotulo, chaves in MENU:
            liberadas = [c for c in chaves if self.pode(c)]
            if liberadas:
                itens.append({'id': ident, 'rotulo': rotulo, 'destino': liberadas[0].split('.', 1)[1]})
        return itens

    def escopo(self):
        return {'tipo': 'todos' if self.nivel == 'admin' else self.escopo_tipo, 'compradores': self.compradores,
                'marcas': self.marcas, 'comprador_protheus': self.comprador_protheus}

    def enxerga(self, comprador, marca=''):
        """True se uma linha (comprador, Marca) está dentro do alcance de dados desta pessoa."""
        tipo = 'todos' if self.nivel == 'admin' else self.escopo_tipo
        if tipo == 'todos':
            return True
        if tipo == 'proprios':
            return bool(self.comprador_protheus) and norm(comprador) == norm(self.comprador_protheus)
        ok_c = bool(norm(comprador)) and any(norm(comprador) == norm(c) for c in self.compradores)
        ok_m = bool(norm(marca)) and any(norm(marca) == norm(m) for m in self.marcas)
        return ok_c or ok_m

    def filtro_sql(self, col_comprador='comprador_n', col_marca='marca_n'):
        """O mesmo critério de enxerga(), como condição SQL sobre colunas já normalizadas. Devolve (texto, parâmetros)."""
        tipo = 'todos' if self.nivel == 'admin' else self.escopo_tipo
        if tipo == 'todos':
            return '1 = 1', []
        if tipo == 'proprios':
            n = norm(self.comprador_protheus)
            return ('%s = ?' % col_comprador, [n]) if n else ('0 = 1', [])
        cs = sorted({norm(c) for c in self.compradores} - {''})
        ms = sorted({norm(m) for m in self.marcas} - {''})
        partes, params = [], []
        if cs:
            partes.append('%s IN (%s)' % (col_comprador, ','.join('?' * len(cs))))
            params += cs
        if ms:
            partes.append('%s IN (%s)' % (col_marca, ','.join('?' * len(ms))))
            params += ms
        return ('(' + ' OR '.join(partes) + ')', params) if partes else ('0 = 1', [])


def valores_do_nivel(db, nivel):
    """Padrão do nível, como gravado pelo admin: {chave: bool} e o escopo."""
    linhas = {r['chave']: r['valor'] for r in db.execute('SELECT chave, valor FROM perm_nivel WHERE nivel = ?', (nivel,))}
    vals = {c: (linhas.get(c, padrao(c, nivel)) == '1') for c in CHAVES}
    escopo = linhas.get(ESCOPO_CHAVE, ESCOPO_PADRAO[nivel])
    return vals, escopo if escopo in ESCOPOS_NIVEL else ESCOPO_PADRAO[nivel]


def excecoes_do_usuario(db, uid):
    ex = {r['chave']: r['valor'] for r in db.execute('SELECT chave, valor FROM perm_usuario WHERE usuario_id = ?', (uid,))}
    listas = {'comprador': [], 'marca': []}
    for r in db.execute('SELECT tipo, valor FROM escopo_usuario WHERE usuario_id = ? ORDER BY valor', (uid,)):
        listas[r['tipo']].append(r['valor'])
    return ex, listas


def resolver(db, usuario):
    """Permissões efetivas de uma pessoa (linha da tabela usuario)."""
    nivel = usuario['nivel']
    vals, escopo = valores_do_nivel(db, nivel)
    ex, listas = excecoes_do_usuario(db, usuario['id'])
    for chave in CHAVES:
        if chave in ex and ex[chave] in ('0', '1'):
            vals[chave] = ex[chave] == '1'
    if ex.get(ESCOPO_CHAVE) in [e[0] for e in ESCOPOS]:
        escopo = ex[ESCOPO_CHAVE]
    return Permissoes(nivel, vals, escopo, listas['comprador'], listas['marca'], usuario['comprador_protheus'])


def semear(db):
    """Grava o padrão dos níveis que ainda não existem (não sobrescreve o que o admin já escolheu)."""
    for nivel in NIVEIS_EDITAVEIS:
        for chave, _r, _g, _p in CATALOGO:
            db.execute('INSERT OR IGNORE INTO perm_nivel (nivel, chave, valor) VALUES (?, ?, ?)', (nivel, chave, padrao(chave, nivel)))
        db.execute('INSERT OR IGNORE INTO perm_nivel (nivel, chave, valor) VALUES (?, ?, ?)', (nivel, ESCOPO_CHAVE, ESCOPO_PADRAO[nivel]))
    db.commit()
