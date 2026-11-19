"""Leitura e conferência das planilhas do Protheus (relatório de necessidades e Monitor de Estoque).

As regras são as mesmas da versão de teste (arquivo HTML): aba Geral, colunas obrigatórias, códigos
únicos, data de referência conferida com a última compra, e assim por diante.
"""
import hashlib
import io
import math
import re
import unicodedata
from datetime import date, datetime, timedelta

from openpyxl import load_workbook


class ErroImportacao(Exception):
    def __init__(self, mensagem, itens=None):
        super().__init__(mensagem)
        self.mensagem = mensagem
        self.itens = list(itens or [])


def norm(txt):
    t = unicodedata.normalize('NFD', '' if txt is None else str(txt))
    return re.sub(r'[^a-z0-9]', '', ''.join(c for c in t if not unicodedata.combining(c)).lower())


def hash_arquivo(dados):
    return hashlib.sha256(dados).hexdigest()


# ---------- conversões (iguais às da versão de teste) ----------
def _texto_num(v):
    """Número como o JavaScript escreve: 12345.0 vira "12345"."""
    if isinstance(v, bool):
        return str(v).lower()
    if isinstance(v, float) and math.isfinite(v) and v.is_integer():
        return str(int(v))
    return str(v)


def para_texto(v):
    if v is None:
        return ''
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return _texto_num(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return str(v).strip()


def para_num(v):
    if v is None or v == '' or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v) if math.isfinite(v) else None
    s = re.sub(r'\s', '', str(v))
    if s == '':
        return None
    if re.fullmatch(r'-?\d+(\.\d+)?', s):
        return float(s)
    if re.fullmatch(r'-?[\d.]+,\d+', s):
        return float(s.replace('.', '').replace(',', '.'))
    return None


def para_data(v):
    """Data como texto ISO (AAAA-MM-DD) ou None."""
    if v is None or v == '':
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        try:
            return (datetime(1970, 1, 1) + timedelta(days=round(v - 25569))).date().isoformat()
        except (OverflowError, ValueError):
            return None
    m = re.fullmatch(r'\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*', str(v))
    if m:
        return '%s-%s-%s' % (m.group(3), m.group(2).zfill(2), m.group(1).zfill(2))
    m = re.match(r'\s*(\d{4})-(\d{2})-(\d{2})', str(v))
    return '%s-%s-%s' % m.groups() if m else None


def data_do_nome(nome):
    """Data no nome do arquivo: 2026-10-22, 20261022, 22-10-2026, 22102026 (separadores - _ . ou espaço opcionais)."""
    n = str(nome or '')

    def valida(a, m, d):
        try:
            return 2000 <= a <= 2100 and date(a, m, d) is not None
        except ValueError:
            return False
    m = re.search(r'(?:^|\D)(\d{4})[-_. ]?(\d{2})[-_. ]?(\d{2})(?:\D|$)', n)
    if m and valida(int(m.group(1)), int(m.group(2)), int(m.group(3))):
        return '%s-%s-%s' % m.groups()
    m = re.search(r'(?:^|\D)(\d{2})[-_. ]?(\d{2})[-_. ]?(\d{4})(?:\D|$)', n)
    if m and valida(int(m.group(3)), int(m.group(2)), int(m.group(1))):
        return '%s-%s-%s' % (m.group(3), m.group(2), m.group(1))
    return None


def iso_br(iso):
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', iso or '')
    return '%s/%s/%s' % (m.group(3), m.group(2), m.group(1)) if m else (iso or '')


def validar_data_ref(campo, nome_arquivo, hoje=None):
    """A data em que o arquivo foi gerado: campo do formulário, ou data no nome do arquivo."""
    hoje = (hoje or date.today()).isoformat()
    campo = (campo or '').strip()
    do_nome = data_do_nome(nome_arquivo)
    if campo and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', campo):
        raise ErroImportacao('A data informada não é válida.')
    if campo and do_nome and campo != do_nome:
        raise ErroImportacao('A data do campo (%s) é diferente da data no nome do arquivo (%s). Corrija um dos dois.' % (iso_br(campo), iso_br(do_nome)))
    ref = campo or do_nome
    if not ref:
        raise ErroImportacao('Informe a data em que o arquivo foi gerado no Protheus. Se o nome do arquivo tiver a data, ela é lida sozinha.')
    if ref > hoje:
        raise ErroImportacao('A data informada (%s) está no futuro.' % iso_br(ref))
    return ref, ('campo' if campo else 'nome do arquivo')


def _abrir(dados):
    try:
        return load_workbook(io.BytesIO(dados), read_only=True, data_only=True)
    except Exception:   # arquivo que não é uma planilha .xlsx válida
        raise ErroImportacao('Não foi possível abrir o arquivo. Confira se é uma planilha Excel no formato .xlsx (no Excel: Salvar como, Pasta de Trabalho do Excel).')


def _grade(ws):
    """Linhas da aba como listas, sem as linhas totalmente em branco."""
    try:
        ws.reset_dimensions()
    except AttributeError:
        pass
    grade = []
    for linha in ws.iter_rows(values_only=True):
        lista = list(linha)
        if any(c is not None and c != '' for c in lista):
            grade.append(lista)
    return grade


# ---------- relatório de necessidades ----------
COLS = {
    'comprador': ('Comprador', 's', 1), 'codigo': ('Codigo', 's', 1), 'descricao': ('Descricao', 's', 0), 'marca': ('Marca', 's', 0),
    'pontopedido': ('PontoPedido', 'n', 1), 'comprar': ('Comprar.', 'n', 1), 'ultpreco': ('Ult.Preco', 'n', 1), 'valortotal': ('Valor Total', 'n', 0),
    'medcontr': ('MedContr', 'n', 0), 'medvenda': ('MedVenda', 'n', 0), 'totalmedia': ('Total Media', 'n', 0), 'vlrestoque': ('Vlr Estoque', 'n', 0),
    'fisico': ('Fisico', 'n', 0), 'reserva': ('Reserva', 'n', 0), 'disponivel': ('Disponivel', 'n', 1), 'vendprot': ('VendProt', 'n', 1),
    'ruptura': ('Ruptura', 'n', 1), 'comprado': ('Comprado', 'n', 1), 'dtentrega': ('DT_ENTREGA', 'd', 1), 'prccompra': ('Prc_Compra.', 'n', 0),
    'ultcompra': ('ULT_COMPRA', 'd', 0), 'pedido': ('PEDIDO', 's', 1), 'estdias': ('EstDias', 'n', 0), 'grupo': ('Grupo', 's', 0),
}
CAMPOS = list(COLS.keys())


def ler_relatorio(dados):
    """Devolve {'linhas': [dict], 'aba': str, 'notas': [{'nivel','texto'}]} ou levanta ErroImportacao."""
    wb = _abrir(dados)
    notas = []
    nomes = wb.sheetnames
    aba = next((n for n in nomes if norm(n) == 'geral'), None)
    sem_nome = False
    if not aba and len(nomes) == 1:
        aba, sem_nome = nomes[0], True
    if not aba:
        raise ErroImportacao('A aba "Geral" não foi encontrada. O relatório precisa ter a aba Geral, a que reúne todos os compradores '
                             '(importar a aba de um só comprador deixaria a necessidade incompleta). Abas do arquivo:', nomes)
    grade = _grade(wb[aba])
    cab = next((i for i, linha in enumerate(grade[:15]) if any(norm(c) == 'codigo' for c in linha)), -1)
    if cab < 0:
        raise ErroImportacao('Não encontrei a coluna "Codigo" nas primeiras linhas da aba "%s". Esse arquivo não parece ser o RV Necessidades.' % aba)
    mapa = {}
    for ci, c in enumerate(grade[cab]):
        k = norm(c)
        if k in COLS and k not in mapa:
            mapa[k] = ci
    faltam = [COLS[k][0] for k in COLS if COLS[k][2] and k not in mapa]
    if faltam:
        raise ErroImportacao('Faltam colunas obrigatórias no arquivo. O layout do relatório pode ter mudado.', faltam)
    opc = [COLS[k][0] for k in COLS if not COLS[k][2] and k not in mapa]
    if opc:
        notas.append({'nivel': 'warn', 'texto': 'Colunas opcionais ausentes: %s.' % ', '.join(opc) + ''})
    linhas, vistos, repetidos, ignoradas = [], set(), [], 0
    for linha in grade[cab + 1:]:
        cod = para_texto(linha[mapa['codigo']]) if mapa['codigo'] < len(linha) else ''
        if not cod:
            ignoradas += 1
            continue
        o = {}
        for k, (_nome, tipo, _req) in COLS.items():
            ci = mapa.get(k)
            bruto = linha[ci] if ci is not None and ci < len(linha) else None
            o[k] = para_num(bruto) if tipo == 'n' else para_data(bruto) if tipo == 'd' else para_texto(bruto)
        o['codigo'] = cod
        if cod in vistos:
            repetidos.append(cod)
        vistos.add(cod)
        linhas.append(o)
    if repetidos:
        raise ErroImportacao('Há códigos repetidos na aba "%s". Provavelmente é uma aba por comprador ou com subtotais, e não a aba Geral.' % aba, repetidos[:8])
    if not linhas:
        raise ErroImportacao('A aba "%s" não tem nenhum item com código.' % aba)
    if ignoradas:
        notas.append({'nivel': 'info', 'texto': '%d linha(s) sem código foram ignoradas (subtotais ou linhas em branco).' % ignoradas})
    if sem_nome:
        comps = {x['comprador'] or '(sem comprador)' for x in linhas}
        if len(comps) > 1:
            notas.append({'nivel': 'info', 'texto': 'O arquivo tem uma só aba ("%s"), que foi lida como a aba Geral (%d compradores).' % (aba, len(comps))})
        else:
            notas.append({'nivel': 'warn', 'texto': 'O arquivo tem uma só aba ("%s") e um único comprador (%s). Se não for o relatório Geral, a necessidade de compra está incompleta.' % (aba, next(iter(comps)))})
    return {'linhas': linhas, 'aba': aba, 'notas': notas}


def conferir_data_relatorio(linhas, ref, origem, notas):
    """A data de referência não pode ser anterior à última compra do relatório; avisa se ficar muito distante."""
    ult_max = max((r['ultcompra'] for r in linhas if r['ultcompra'] and r['ultcompra'] >= '1990-01-01'), default='')
    if ult_max and ref < ult_max:
        raise ErroImportacao('A data informada (%s) é anterior à última compra registrada no relatório (%s). O relatório não pode ser mais antigo que isso. Confira a data.' % (iso_br(ref), iso_br(ult_max)))
    notas.append({'nivel': 'info', 'texto': 'Data de referência: %s (%s). Os atrasos de entrega são calculados em relação a ela.' % (iso_br(ref), origem)})
    if ult_max:
        dias = (date.fromisoformat(ref) - date.fromisoformat(ult_max)).days
        if dias > 4:
            notas.append({'nivel': 'warn', 'texto': 'A última compra registrada no arquivo é de %s, %d dias antes da data informada (%s). Confira se a data está certa, porque ela define os atrasos.' % (iso_br(ult_max), dias, iso_br(ref))})


def contagens(linhas):
    """Números do resumo do relatório: itens, com necessidade de compra, rupturas iminentes e entregas a cobrar em ruptura."""
    nz = lambda v: 0.0 if v is None else v
    comprar_n = imin_n = ent_n = 0
    for r in linhas:
        falta = -r['ruptura'] if nz(r['ruptura']) < 0 else 0
        em_rup = nz(r['ruptura']) < 0
        if nz(r['comprar']) > 0 and em_rup and nz(r['comprado']) < falta:
            imin_n += 1
        if nz(r['comprar']) > 0:
            comprar_n += 1
        if nz(r['comprado']) > 0 and em_rup:
            ent_n += 1
    return {'itens': len(linhas), 'comprar_n': comprar_n, 'imin_n': imin_n, 'ent_n': ent_n}


# ---------- Monitor de Estoque ----------
MON_COLS = [('filial', 'filial'), ('pedido', 'numpedido'), ('codcliente', 'codcliente'), ('loja', 'lojacliente'), ('cliente', 'cliente'),
            ('codtransp', 'codtransportadora'), ('transp', 'nometransportadora'), ('datafat', 'datafaturamento'), ('liberacao', 'liberacao'),
            ('item', 'itemdopedido'), ('codautopel', 'codautopel'), ('codigo', 'codproduto'), ('descricao', 'descrproduto'), ('qtd', 'quantidadevendida'),
            ('valor', 'valor'), ('datapcp', 'datapcp'), ('situacao', 'situacaoestoque'), ('nota', 'notaserie'), ('credito', 'credito'), ('arte', 'arte'),
            ('grupo', 'grupo'), ('subgrupo', 'subgrupo'), ('familia', 'familia'), ('tipo', 'tipo'), ('op', 'op'), ('atraso', 'atraso')]
MON_REQ = [('pedido', 'Num. Pedido'), ('codigo', 'Cod. Produto'), ('qtd', 'Quantidade Vendida'), ('situacao', 'Situação Estoque')]
# o que identifica o cliente e o valor do pedido: só sai do servidor para quem tem a permissão ver.cliente_valor
MON_CAMPOS_CLIENTE = ('codcliente', 'loja', 'cliente', 'valor')
MON_CAMPOS = ['pedido', 'item', 'codcliente', 'loja', 'cliente', 'codtransp', 'transp', 'datafat', 'datapcp', 'liberacao', 'situacao', 'credito', 'arte',
              'codigo', 'codautopel', 'descricao', 'qtd', 'valor', 'nota', 'grupo', 'subgrupo', 'familia', 'tipo', 'op', 'atraso']


def _mon_data(v):
    if isinstance(v, (datetime, date)):
        return para_data(v) or ''
    if isinstance(v, (int, float)) and not isinstance(v, bool) and v > 20000:
        return para_data(v) or ''
    m = re.fullmatch(r'\s*(\d{2})/(\d{2})/(\d{4})\s*', '' if v is None else str(v))
    return '%s-%s-%s' % (m.group(3), m.group(2), m.group(1)) if m else ''


def ler_monitor(dados):
    wb = _abrir(dados)
    achou = None
    for nome in wb.sheetnames:
        grade = _grade(wb[nome])
        for i, linha in enumerate(grade[:15]):
            idx = {}
            for j, c in enumerate(linha):
                k = norm(c)
                if k and k not in idx:
                    idx[k] = j
            if 'numpedido' in idx and 'codproduto' in idx:
                achou = (nome, grade, i, idx)
                break
        if achou:
            break
    if not achou:
        raise ErroImportacao('Não encontrei as colunas do Monitor de Estoque (Num. Pedido e Cod. Produto). Importe o arquivo do Monitor de Estoque, e não o relatório de necessidades.')
    nome, grade, h, idx = achou
    col = {c[0]: idx[c[1]] for c in MON_COLS if c[1] in idx}
    faltam = [r[1] for r in MON_REQ if r[0] not in col]
    if faltam:
        raise ErroImportacao('Faltam colunas obrigatórias no Monitor de Estoque: %s.' % ', '.join(faltam))

    def pega(a, k):
        ci = col.get(k)
        return a[ci] if ci is not None and ci < len(a) else None
    txt = lambda v: '' if v is None else para_texto(v)
    linhas = []
    for a in grade[h + 1:]:
        ped, cod = txt(pega(a, 'pedido')), txt(pega(a, 'codigo'))
        if not ped or not cod:
            continue
        nota = txt(pega(a, 'nota'))
        linhas.append({
            'pedido': ped, 'item': txt(pega(a, 'item')), 'codcliente': txt(pega(a, 'codcliente')), 'loja': txt(pega(a, 'loja')), 'cliente': txt(pega(a, 'cliente')),
            'codtransp': txt(pega(a, 'codtransp')), 'transp': txt(pega(a, 'transp')), 'datafat': _mon_data(pega(a, 'datafat')), 'datapcp': _mon_data(pega(a, 'datapcp')),
            'liberacao': txt(pega(a, 'liberacao')), 'situacao': txt(pega(a, 'situacao')), 'credito': txt(pega(a, 'credito')), 'arte': txt(pega(a, 'arte')),
            'codigo': cod, 'codautopel': txt(pega(a, 'codautopel')), 'descricao': txt(pega(a, 'descricao')), 'qtd': para_num(pega(a, 'qtd')) or 0.0,
            'valor': para_num(pega(a, 'valor')) or 0.0, 'nota': '' if nota == '/' else nota, 'grupo': txt(pega(a, 'grupo')), 'subgrupo': txt(pega(a, 'subgrupo')),
            'familia': txt(pega(a, 'familia')), 'tipo': txt(pega(a, 'tipo')), 'op': txt(pega(a, 'op')), 'atraso': para_num(pega(a, 'atraso')),
        })
    if not linhas:
        raise ErroImportacao('O Monitor de Estoque não tem linhas de pedido.')
    return {'linhas': linhas, 'aba': nome}


def resumo_monitor(linhas):
    blq = [r for r in linhas if norm(r['situacao']) == 'bloqueado']
    return {'linhas': len(linhas), 'bloqueadas': len(blq), 'pedidos': len({r['pedido'] for r in blq}), 'produtos': len({r['codigo'] for r in blq})}
