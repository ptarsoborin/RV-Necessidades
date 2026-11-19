(function () {
  'use strict';

  /* ---------- utilidades ---------- */
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var fmtInt = function (n) { return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 }); };
  var fmtNum = function (n) { return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 }); };
  var brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  var norm = function (s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  };
  var nz = function (v) { return v == null || isNaN(v) ? 0 : v; };
  var isoToBr = function (iso) {
    if (!iso) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : iso;
  };
  var refToBr = function (ref) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(ref || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] + (m[4] ? ' ' + m[4] + ':' + m[5] : '') : ref;
  };
  var todayIso = function () {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
  var daysBetween = function (a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); };
  // Data no nome do arquivo: 2026-10-22, 20261022, 22-10-2026, 22102026 (separadores - _ . opcionais).
  function dateFromName(name) {
    var n = String(name || ''), m;
    var valid = function (y, mo, d) {
      var dt = new Date(Date.UTC(y, mo - 1, d));
      return y >= 2000 && y <= 2100 && dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
    };
    var iso = function (y, mo, d) { return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0'); };
    m = /(?:^|\D)(\d{4})[-_. ]?(\d{2})[-_. ]?(\d{2})(?:\D|$)/.exec(n);
    if (m && valid(+m[1], +m[2], +m[3])) return iso(+m[1], +m[2], +m[3]);
    m = /(?:^|\D)(\d{2})[-_. ]?(\d{2})[-_. ]?(\d{4})(?:\D|$)/.exec(n);
    if (m && valid(+m[3], +m[2], +m[1])) return iso(+m[3], +m[2], +m[1]);
    return null;
  }

  function ImportError(message, items) { this.message = message; this.items = items || []; }
  ImportError.prototype = Object.create(Error.prototype);

  /* ---------- colunas do relatório ---------- */
  // t: s = texto, n = número, d = data. req = obrigatória para as regras do sistema.
  var COLS = {
    comprador: { name: 'Comprador', t: 's', req: 1 },
    codigo: { name: 'Codigo', t: 's', req: 1 },
    descricao: { name: 'Descricao', t: 's' },
    marca: { name: 'Marca', t: 's' },
    pontopedido: { name: 'PontoPedido', t: 'n', req: 1 },
    comprar: { name: 'Comprar.', t: 'n', req: 1 },
    ultpreco: { name: 'Ult.Preco', t: 'n', req: 1 },
    valortotal: { name: 'Valor Total', t: 'n' },
    medcontr: { name: 'MedContr', t: 'n' },
    medvenda: { name: 'MedVenda', t: 'n' },
    totalmedia: { name: 'Total Media', t: 'n' },
    vlrestoque: { name: 'Vlr Estoque', t: 'n' },
    fisico: { name: 'Fisico', t: 'n' },
    reserva: { name: 'Reserva', t: 'n' },
    disponivel: { name: 'Disponivel', t: 'n', req: 1 },
    vendprot: { name: 'VendProt', t: 'n', req: 1 },
    ruptura: { name: 'Ruptura', t: 'n', req: 1 },
    comprado: { name: 'Comprado', t: 'n', req: 1 },
    dtentrega: { name: 'DT_ENTREGA', t: 'd', req: 1 },
    prccompra: { name: 'Prc_Compra.', t: 'n' },
    ultcompra: { name: 'ULT_COMPRA', t: 'd' },
    pedido: { name: 'PEDIDO', t: 's', req: 1 },
    estdias: { name: 'EstDias', t: 'n' },
    grupo: { name: 'Grupo', t: 's' }
  };

  function toNum(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim().replace(/\s/g, '');
    if (s === '') return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    if (/^-?[\d.]+,\d+$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    return null;
  }
  function toStr(v) {
    if (v == null) return '';
    if (typeof v === 'number') return String(v);
    return String(v).trim();
  }
  function toDate(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      var d = new Date(Math.round((v - 25569) * 86400000));
      return isNaN(d) ? null : d.toISOString().slice(0, 10);
    }
    if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
    var m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(String(v));
    if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    var m2 = /^\s*(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    return m2 ? m2[1] + '-' + m2[2] + '-' + m2[3] : null;
  }

  /* ---------- leitura e validação do arquivo ---------- */
  function parseWorkbook(buf) {
    var wb;
    try { wb = XLSX.read(buf, { type: 'array' }); }
    catch (e) { throw new ImportError('Não foi possível abrir o arquivo. Confira se é uma planilha Excel (.xlsx).'); }

    var notes = [];
    // o sistema lê só a aba Geral (todos os compradores); as abas por comprador, se existirem, são ignoradas
    var sheet = wb.SheetNames.filter(function (n) { return norm(n) === 'geral'; })[0], semNome = false;
    if (!sheet && wb.SheetNames.length === 1) { sheet = wb.SheetNames[0]; semNome = true; }
    if (!sheet) {
      throw new ImportError('A aba "Geral" não foi encontrada. O relatório precisa ter a aba Geral, a que reúne todos os compradores (importar a aba de um só comprador deixaria a necessidade incompleta). Abas do arquivo:', wb.SheetNames);
    }
    var grid = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, defval: null, blankrows: false });

    var hIdx = -1;
    for (var i = 0; i < Math.min(grid.length, 15); i++) {
      if (grid[i].some(function (c) { return norm(c) === 'codigo'; })) { hIdx = i; break; }
    }
    if (hIdx < 0) throw new ImportError('Não encontrei a coluna "Codigo" nas primeiras linhas da aba "' + sheet + '". Esse arquivo não parece ser o RV Necessidades.');

    var map = {};
    grid[hIdx].forEach(function (c, ci) { var k = norm(c); if (COLS[k] && map[k] == null) map[k] = ci; });

    var missing = Object.keys(COLS).filter(function (k) { return COLS[k].req && map[k] == null; });
    if (missing.length) {
      throw new ImportError('Faltam colunas obrigatórias no arquivo. O layout do relatório pode ter mudado.',
        missing.map(function (k) { return COLS[k].name; }));
    }
    var missOpt = Object.keys(COLS).filter(function (k) { return !COLS[k].req && map[k] == null; });
    if (missOpt.length) {
      notes.push({ level: 'warn', text: 'Colunas opcionais ausentes: ' + missOpt.map(function (k) { return COLS[k].name; }).join(', ') + '.' });
    }

    var rows = [], seen = {}, dups = [], skipped = 0;
    for (var r = hIdx + 1; r < grid.length; r++) {
      var line = grid[r];
      var cod = toStr(line[map.codigo]);
      if (!cod) { skipped++; continue; }
      var o = {};
      Object.keys(COLS).forEach(function (k) {
        var raw = map[k] == null ? null : line[map[k]];
        o[k] = COLS[k].t === 'n' ? toNum(raw) : COLS[k].t === 'd' ? toDate(raw) : toStr(raw);
      });
      o.codigo = cod;
      if (seen[cod]) dups.push(cod); else seen[cod] = 1;
      rows.push(o);
    }
    if (dups.length) {
      throw new ImportError('Há códigos repetidos na aba "' + sheet + '". Provavelmente é uma aba por comprador ou com subtotais, e não a aba Geral.',
        dups.slice(0, 8));
    }
    if (!rows.length) throw new ImportError('A aba "' + sheet + '" não tem nenhum item com código.');
    if (skipped) notes.push({ level: 'info', text: skipped + ' linha(s) sem código foram ignoradas (subtotais ou linhas em branco).' });
    if (semNome) {
      var comps = {};
      rows.forEach(function (x) { comps[x.comprador || '(sem comprador)'] = 1; });
      var nc = Object.keys(comps).length;
      notes.push(nc > 1
        ? { level: 'info', text: 'O arquivo tem uma só aba ("' + sheet + '"), que foi lida como a aba Geral (' + nc + ' compradores).' }
        : { level: 'warn', text: 'O arquivo tem uma só aba ("' + sheet + '") e um único comprador (' + Object.keys(comps)[0] + '). Se não for o relatório Geral, a necessidade de compra está incompleta.' });
    }
    return { rows: rows, sheet: sheet, notes: notes };
  }

  /* ---------- regras de negócio ---------- */
  // Necessidade de compra = COMPRAR maior que zero.
  // Iminente = necessidade de compra com ruptura SEM cobertura: nada comprado, ou compra menor que a falta.
  // Reposição = necessidade de compra sem ruptura, ou com ruptura já coberta por compra (ponto de pedido, 60 dias).
  // Entrega a cobrar = compra feita (Comprado maior que zero) ainda não recebida; as que estão em ruptura vêm primeiro.
  var SIT = { sem: ['Sem compra', 'crit'], parcial: ['Compra parcial', 'warn'], coberta: ['Falta coberta', 'ok'] };
  var SIT_ORDER = { sem: 0, parcial: 1, coberta: 2 };
  var PRAZO = { atrasada: ['Atrasada', 'crit'], hoje: ['Vence hoje', 'warn'], prazo: ['No prazo', 'ok'], semdata: ['Sem data', 'info'] };
  var PRAZO_ORDER = { atrasada: 0, semdata: 1, hoje: 2, prazo: 3 };

  // ponto de pedido esperado = 2 × MedContr (média de vendas), com tolerância de 1 unidade (o Protheus arredonda para baixo)
  var PP_FATOR = 2, PP_TOL = 1;
  function analyze(rows, notes, refAt) {
    var refDate = String(refAt || '').slice(0, 10);
    var imin = [], rep = [], ent = [], buyers = {}, div = [];
    var chk = { fMis: [], dispDec: [], dispFr: [], qMis: [], qPos: [], semPedido: [], semData: [], compradoNeg: [], especiais: 0, pp: [] };
    // a regra Disponível = Físico − Reserva só vale se o arquivo trouxer as duas colunas
    var temFR = rows.some(function (x) { return x.fisico != null; }) && rows.some(function (x) { return x.reserva != null; });
    var dv = function (tipo, r, b, detalhe, impacto) {
      div.push({ tipo: tipo, codigo: r.codigo, descricao: r.descricao, marca: r.marca, comprador: b, detalhe: detalhe, impacto: impacto || 0, nec: nz(r.comprar) > 0 });
    };

    rows.forEach(function (r) {
      var b = r.comprador || '(sem comprador)';
      var g = buyers[b] || (buyers[b] = { nome: b, itens: 0, iminN: 0, iminV: 0, repN: 0, repV: 0, entN: 0, entAll: 0, atrasN: 0 });
      g.itens++;
      var especial = /^(OCIOSO|INATIVO)/i.test(b);
      if (especial) chk.especiais++;
      var ppEsp = nz(r.medcontr) * PP_FATOR, ppFora = Math.abs(nz(r.pontopedido) - ppEsp) > PP_TOL;

      var inRup = nz(r.ruptura) < 0;
      var falta = inRup ? -r.ruptura : 0;
      var st = inRup ? (nz(r.comprado) >= falta ? 'coberta' : (nz(r.comprado) > 0 ? 'parcial' : 'sem')) : null;
      var descob = inRup ? Math.max(0, falta - nz(r.comprado)) : 0;

      var dias = null, sit = null;
      if (nz(r.comprado) > 0) {
        sit = 'semdata';
        if (r.dtentrega && refDate) {
          dias = Math.round((Date.parse(refDate) - Date.parse(r.dtentrega)) / 86400000);
          sit = dias > 0 ? 'atrasada' : (dias === 0 ? 'hoje' : 'prazo');
        }
      }

      if (nz(r.comprar) > 0) {
        var valor = nz(r.comprar) * nz(r.ultpreco);
        var row = Object.assign({}, r, { comprador: b, valor: valor, falta: falta, st: st, emRup: inRup, descob: descob, dias: dias, sit: sit, ppFora: ppFora });
        if (st === 'sem' || st === 'parcial') { imin.push(row); g.iminN++; g.iminV += valor; }
        else { rep.push(row); g.repN++; g.repV += valor; }
      }
      if (nz(r.comprado) > 0) {
        ent.push(Object.assign({}, r, { comprador: b, falta: falta, st: st, emRup: inRup, dias: dias, sit: sit, valor: nz(r.comprado) * nz(r.prccompra) }));
        g.entAll++;
        if (inRup) { g.entN++; if (sit === 'atrasada') g.atrasN++; }
        if (inRup && !r.dtentrega) { chk.semData.push(r.codigo); dv('semData', r, b, 'Comprado ' + fmtNum(nz(r.comprado)) + ' · falta ' + fmtNum(falta) + ' · pedido ' + (r.pedido || 'sem número'), nz(r.comprado) * nz(r.prccompra)); }
      }
      if (nz(r.ruptura) > 0) { chk.qPos.push(r.codigo); dv('qPos', r, b, 'Ruptura ' + fmtNum(nz(r.ruptura)) + ' (esperado zero ou negativa)', 0); }
      if (nz(r.comprado) > 0 && !r.pedido) { chk.semPedido.push(r.codigo); dv('semPedido', r, b, 'Comprado ' + fmtNum(nz(r.comprado)) + (r.dtentrega ? ' · entrega ' + isoToBr(r.dtentrega) : ' · sem data de entrega'), nz(r.comprado) * nz(r.prccompra)); }
      if (nz(r.comprado) < 0) { chk.compradoNeg.push(r.codigo); dv('compradoNeg', r, b, 'Comprado ' + fmtNum(nz(r.comprado)), 0); }
      var fEsp = nz(r.pontopedido) - nz(r.disponivel) + nz(r.vendprot) - nz(r.comprado), ehDec = false;
      if (Math.abs(nz(r.comprar) - fEsp) > 0.5) {
        // o Disponível que o Protheus usou em COMPRAR = PP + VendProt − Comprado − COMPRAR; se for o Disponível exportado dividido por 10, 100... a vírgula decimal se perdeu na coluna
        var dImp = nz(r.pontopedido) + nz(r.vendprot) - nz(r.comprado) - nz(r.comprar), kDec = 0;
        for (var kk = 1; kk <= 5 && !kDec; kk++) if (dImp > 0 && Math.abs(nz(r.disponivel) / Math.pow(10, kk) - dImp) <= 0.011) kDec = kk;
        if (kDec) {
          ehDec = true;
          chk.dispDec.push(r.codigo);
          dv('dispDec', r, b, 'Disponível ' + fmtNum(nz(r.disponivel)) + ' no relatório; o Protheus calculou COMPRAR com ' + dImp.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + ' (Físico − Reserva = ' + fmtNum(nz(r.fisico) - nz(r.reserva)) + ')', 0);
        } else {
          chk.fMis.push(r.codigo);
          dv('fMis', r, b, 'COMPRAR no relatório ' + fmtNum(nz(r.comprar)) + ' · pela fórmula ' + fmtNum(fEsp) + ' · Disponível ' + fmtNum(nz(r.disponivel)), Math.abs(Math.max(0, nz(r.comprar)) - Math.max(0, fEsp)) * nz(r.ultpreco));
        }
      }
      // informativo: Disponível deveria ser Físico − Reserva (o caso da vírgula decimal perdida já tem aviso próprio)
      var frEsp = nz(r.fisico) - nz(r.reserva);
      if (temFR && !ehDec && Math.abs(nz(r.disponivel) - frEsp) > 1) {
        chk.dispFr.push(r.codigo);
        dv('dispFr', r, b, 'Disponível ' + fmtNum(nz(r.disponivel)) + ' · Físico − Reserva = ' + fmtNum(frEsp) + ' (dif. ' + (nz(r.disponivel) - frEsp > 0 ? '+' : '') + fmtNum(nz(r.disponivel) - frEsp) + ')', 0);
      }
      var qEsp = Math.min(0, nz(r.disponivel) - nz(r.vendprot));
      if (Math.abs(nz(r.ruptura) - qEsp) > 0.5) { chk.qMis.push(r.codigo); dv('qMis', r, b, 'RUPTURA no relatório ' + fmtNum(nz(r.ruptura)) + ' · pela fórmula ' + fmtNum(qEsp), 0); }
      if (ppFora) {
        var vPP = nz(r.comprar) > 0 ? nz(r.comprar) * nz(r.ultpreco) : 0;
        chk.pp.push({ codigo: r.codigo, nec: nz(r.comprar) > 0, valor: vPP });
        dv('pp', r, b, 'Ponto de pedido ' + fmtNum(nz(r.pontopedido)) + ' · 2 × MedContr = ' + fmtNum(ppEsp) + ' (dif. ' + (nz(r.pontopedido) - ppEsp > 0 ? '+' : '') + fmtNum(nz(r.pontopedido) - ppEsp) + ')', vPP);
      }
      if (especial && (nz(r.comprar) > 0 || nz(r.comprado) > 0)) dv('especial', r, b, (nz(r.comprar) > 0 ? 'Comprar ' + fmtNum(nz(r.comprar)) : '') + (nz(r.comprar) > 0 && nz(r.comprado) > 0 ? ' · ' : '') + (nz(r.comprado) > 0 ? 'Comprado ' + fmtNum(nz(r.comprado)) : ''), nz(r.comprar) * nz(r.ultpreco));
    });

    var all = Object.keys(buyers).map(function (k) { return buyers[k]; })
      .sort(function (a, b) { return b.iminN - a.iminN || b.atrasN - a.atrasN || b.repV - a.repV || (a.nome < b.nome ? -1 : 1); });
    var order = {};
    all.forEach(function (g, i) { order[g.nome] = i; });
    var byBuyer = function (a, b) { return order[a.comprador] - order[b.comprador]; };
    imin.sort(function (a, b) { return byBuyer(a, b) || SIT_ORDER[a.st] - SIT_ORDER[b.st] || b.valor - a.valor; });
    ent.sort(function (a, b) {
      return byBuyer(a, b) || (b.emRup - a.emRup) || PRAZO_ORDER[a.sit] - PRAZO_ORDER[b.sit] || nz(b.dias) - nz(a.dias) || b.falta - a.falta;
    });

    var warnings = (notes || []).map(function (n) { return { level: n.level, text: n.text }; });
    var add = function (level, text, l) { warnings.push({ level: level, text: text, codes: l ? l.slice(0, 8) : null, total: l ? l.length : 0 }); };
    if (chk.fMis.length) add('warn', 'A regra de COMPRAR (PontoPedido − Disponível + VendProt − Comprado) não confere em ' + chk.fMis.length + ' item(ns). O Protheus pode ter mudado o cálculo.', chk.fMis);
    if (chk.dispDec.length) add('warn', chk.dispDec.length + ' item(ns) com a coluna Disponível sem a vírgula decimal (por exemplo, 11.197,09 aparece como 1.119.709). O COMPRAR e a RUPTURA calculados pelo Protheus estão certos; o erro está no Disponível exportado. São itens com estoque fracionado.', chk.dispDec);
    if (chk.dispFr.length) add('info', chk.dispFr.length + ' item(ns) com Disponível diferente de Físico − Reserva (tolerância de 1). Só informativo: a igualdade vale em ' + Math.round((1 - (chk.dispFr.length + chk.dispDec.length) / Math.max(1, rows.length)) * 1000) / 10 + '% dos itens deste relatório, mas o Protheus pode reduzir o Disponível por outros motivos.', chk.dispFr);
    if (chk.qMis.length) add('warn', 'A regra de RUPTURA (menor valor entre 0 e Disponível − VendProt) não confere em ' + chk.qMis.length + ' item(ns).', chk.qMis);
    if (chk.qPos.length) add('warn', chk.qPos.length + ' item(ns) com Ruptura positiva. O esperado é sempre zero ou negativa.', chk.qPos);
    if (chk.semPedido.length) add('warn', chk.semPedido.length + ' item(ns) com Comprado maior que zero e sem número de PEDIDO.', chk.semPedido);
    if (chk.semData.length) add('warn', chk.semData.length + ' item(ns) em ruptura com compra, mas sem data de entrega.', chk.semData);
    if (chk.compradoNeg.length) add('warn', chk.compradoNeg.length + ' item(ns) com Comprado negativo.', chk.compradoNeg);
    if (chk.especiais) add('info', chk.especiais + ' item(ns) sob compradores especiais (OCIOSO ou INATIVO).');
    if (chk.pp.length) {
      var ppNec = chk.pp.filter(function (x) { return x.nec; }).sort(function (a, b) { return b.valor - a.valor; });
      var ppV = ppNec.reduce(function (t, x) { return t + x.valor; }, 0);
      var okPP = Math.round((1 - chk.pp.length / Math.max(1, rows.length)) * 100);
      add(ppNec.length ? 'warn' : 'info', chk.pp.length + ' item(ns) com ponto de pedido fora da regra (2 × MedContr, com tolerância de 1 unidade): ' + ppNec.length + ' com necessidade de compra' + (ppNec.length ? ', no valor de ' + brl.format(ppV) : '') +
        '. A regra vale em ' + okPP + '% dos itens; ajuste feito de propósito no Protheus também aparece aqui. Veja a aba lateral, em Divergências.',
        ppNec.map(function (x) { return x.codigo; }).concat(chk.pp.filter(function (x) { return !x.nec; }).map(function (x) { return x.codigo; })));
    }
    var TORD = ['semData', 'semPedido', 'dispDec', 'fMis', 'dispFr', 'qMis', 'qPos', 'compradoNeg', 'pp', 'especial'];
    div.sort(function (a, b) { return TORD.indexOf(a.tipo) - TORD.indexOf(b.tipo) || b.impacto - a.impacto || (a.codigo < b.codigo ? -1 : 1); });

    var cnt = { sem: 0, parcial: 0 };
    imin.forEach(function (r) { cnt[r.st]++; });
    var cntEnt = { atrasada: 0, hoje: 0, prazo: 0, semdata: 0 }, entRupN = 0;
    var late = { rup: 0, all: 0, byBuyer: {} };
    ent.forEach(function (r) {
      if (r.emRup) { entRupN++; cntEnt[r.sit]++; }
      if (r.sit === 'atrasada') {
        late.all++;
        if (r.emRup) { late.rup++; late.byBuyer[r.comprador] = (late.byBuyer[r.comprador] || 0) + 1; }
      }
    });
    late.buyers = Object.keys(late.byBuyer).map(function (k) { return { nome: k, n: late.byBuyer[k] }; })
      .sort(function (a, b) { return b.n - a.n || (a.nome < b.nome ? -1 : 1); });
    var sum = function (l) { return l.reduce(function (t, r) { return t + r.valor; }, 0); };

    return {
      itens: rows.length, refDate: refDate, imin: imin, rep: rep, ent: ent, entRupN: entRupN, cnt: cnt, cntEnt: cntEnt, late: late,
      repCob: rep.filter(function (r) { return r.emRup; }).length,
      buyers: all.filter(function (g) { return g.iminN + g.repN > 0; }),
      entBuyers: all.filter(function (g) { return g.entAll > 0; }),
      exportBuyers: all.filter(function (g) { return g.iminN + g.repN + g.entAll > 0; }),
      order: order, iminV: sum(imin), repV: sum(rep), warnings: warnings, div: div
    };
  }

  /* ---------- armazenamento (IndexedDB, com memória como reserva) ---------- */
  var state = { snaps: [], id: null, an: null, tab: 'compra', buyer: 'todos', sortRep: 'valor', ord: { rep: { k: 'v', dir: -1 } }, mons: [], monId: null, monRows: null, bq: { modo: 'nec', q: '' }, monMsg: null, q: '', entScope: 'rup', entF: 'todas', entBuyer: 'todos', entGroup: 'marca', lateBuyer: 'todos', expBuyer: 'todos', expTodas: false, persist: true, dup: null, confirmDel: false };
  function resetView() { state.tab = 'compra'; state.buyer = 'todos'; state.sortRep = 'valor'; state.ord = { rep: { k: 'v', dir: -1 } }; state.q = ''; state.entScope = 'todos'; state.entF = 'atrasada'; state.entBuyer = 'todos'; state.entGroup = 'marca'; state.td = tdNovo(); state.tdCache = null; state.lateBuyer = 'todos'; state.confirmDel = false; state.hf = hfNovo(); state.hfB = ''; if (state.dv) state.dv = { tipo: 'todos', comp: 'todos', ppSem: false }; }
  /* ---------- servidor: dados, importação e permissões ---------- */
  var CFG = JSON.parse(document.getElementById('rvn-config').textContent);
  function podeVer(id) { return CFG.paginas.indexOf(id) >= 0; }
  function apiFetch(url, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    opts.headers = Object.assign({ 'X-CSRF-Token': CFG.csrf, 'Accept': 'application/json' }, opts.headers || {});
    return fetch(url, opts).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = JSON.parse(t); } catch (e) { /* resposta que não é JSON */ }
        if (r.status === 401) { location.href = CFG.urls.entrar; throw new ImportError('Sessão expirada. Entre de novo.'); }
        if (!r.ok || !j) {
          var er = new ImportError((j && j.erro) || (r.status === 400 ? 'A sessão expirou ou o pedido é inválido. Recarregue a página e tente de novo.' : 'O servidor não respondeu como esperado (' + r.status + ').'), (j && j.itens) || []);
          er.status = r.status; er.duplicado = !!(j && j.duplicado); er.refAt = j && j.refAt;
          er.erros = (j && j.erros) || []; er.titulo = (j && j.titulo) || ''; er.conflito = !!(j && j.conflito); er.pedido = (j && j.pedido) || null;
          throw er;
        }
        return j;
      });
    }, function () { throw new ImportError('Não foi possível falar com o servidor. Confira se ele está ligado e tente de novo.'); });
  }
  function apiJson(url, metodo, corpo) {
    return apiFetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) });
  }
  // o servidor manda as linhas em formato compacto: os nomes dos campos uma vez, depois só os valores
  function expande(d) {
    var campos = d.campos;
    return d.linhas.map(function (a) { var o = {}; for (var i = 0; i < campos.length; i++) o[campos[i]] = a[i]; return o; });
  }
  function carregaEstado() {
    return apiFetch(CFG.urls.estado).then(function (e) {
      state.snaps = e.relatorios.map(function (m) { m.id = String(m.id); return m; }); sortSnaps();
      state.mons = e.monitores.map(function (m) { m.id = String(m.id); return m; }); monSort();
    });
  }

  /* ---------- importação ---------- */
  function setStatus(kind, html) {
    var el = $('#status');
    el.className = 'status ' + kind;
    el.innerHTML = html || '';
  }

  function importFile(file, force) {
    setStatus('busy', 'Enviando ' + esc(file.name) + '…');
    $('#pick').setAttribute('aria-disabled', 'true');
    state.dup = null;
    var fd = new FormData();
    fd.append('arquivo', file); fd.append('data', $('#ref').value || ''); if (force) fd.append('forcar', '1');
    return apiFetch(CFG.urls.relatorios, { method: 'POST', body: fd }).then(function (r) {
      return carregaEstado().then(function () { return selectSnap(String(r.id)); }).then(function () {
        $('#ref').value = '';
        setStatus('ok', 'Relatório importado: ' + fmtInt(r.itens) + ' itens, ' + fmtInt(r.comprarN) + ' com necessidade de compra (' + fmtInt(r.iminN) + ' rupturas) e ' + fmtInt(r.entN) + ' entregas a cobrar de itens em ruptura.' + (r.substituiu ? ' Substituiu o relatório anterior da mesma data.' : '') + ' Fica guardado no servidor: não precisa importar de novo ao abrir o sistema.');
        go('painel'); flash($('#status').textContent);
      });
    }).catch(function (e) {
      if (e instanceof ImportError && e.duplicado) {
        state.dup = file;
        setStatus('err', esc(e.message) + '<div><button class="btn ghost" type="button" id="forceImp">Importar mesmo assim</button></div>');
      } else if (e instanceof ImportError) {
        setStatus('err', esc(e.message) + (e.items.length ? '<ul>' + e.items.map(function (i) { return '<li class="mono">' + esc(i) + '</li>'; }).join('') + '</ul>' : '') + '<div>Nada foi importado.</div>');
      } else {
        setStatus('err', 'Falha inesperada ao importar: ' + esc(e && e.message ? e.message : e) + '. Nada foi importado.');
      }
    }).then(function () {
      $('#pick').removeAttribute('aria-disabled');
      $('#file').value = '';
    });
  }


  /* ---------- Monitor de Estoque: leitura e importação ---------- */
  /* ---------- Monitor de Estoque: importação e leitura no servidor ---------- */
  function monSort() { state.mons.sort(function (a, b) { return a.refAt < b.refAt ? 1 : a.refAt > b.refAt ? -1 : (a.importedAt < b.importedAt ? 1 : -1); }); }
  function monMeta() { return state.mons.filter(function (m) { return m.id === state.monId; })[0]; }
  function monCarrega(id) {
    var mt = state.mons.filter(function (m) { return m.id === id; })[0];
    if (!mt) { state.monId = null; state.monRows = null; state.bloqCache = null; return Promise.resolve(); }
    // quem tem alcance restrito recebe só as linhas dos produtos do relatório escolhido
    return apiFetch(CFG.urls.monitor + '/' + id + (state.id ? '?relatorio=' + encodeURIComponent(state.id) : '')).then(function (d) {
      state.monId = id; state.monRows = expande(d); state.bloqCache = null;
    }, function (e) { state.monId = id; state.monRows = null; state.bloqCache = null; state.monMsg = { kind: 'err', html: esc(e.message) }; });
  }
  function importMonitor(file) {
    var fld = ($('#monRef') && $('#monRef').value) || '';
    state.monMsg = { kind: 'busy', html: 'Enviando ' + esc(file.name) + '…' }; if (state.page === 'bloqueados') renderPage();
    var fd = new FormData(); fd.append('arquivo', file); fd.append('data', fld);
    return apiFetch(CFG.urls.monitor, { method: 'POST', body: fd }).then(function (r) {
      return carregaEstado().then(function () { return monCarrega(String(r.id)); }).then(function () {
        state.monPedeData = false;
        state.monMsg = { kind: 'ok', html: 'Monitor de Estoque de <b>' + esc(isoToBr(r.refAt)) + '</b> importado: ' + fmtInt(r.linhas) + ' linhas, ' + fmtInt(r.bloqueadas) + ' bloqueadas em ' + fmtInt(r.pedidos) + ' pedido(s) e ' + fmtInt(r.produtos) + ' produto(s).' + (r.substituiu ? ' Substituiu o Monitor da mesma data.' : '') };
      });
    }).catch(function (e) {
      state.monPedeData = e instanceof ImportError && /Informe a data/.test(e.message);
      state.monMsg = { kind: 'err', html: (e instanceof ImportError ? esc(e.message) : 'Falha inesperada ao importar: ' + esc(e && e.message ? e.message : e)) + ' Nada foi importado.' };
    }).then(function () {
      var f = $('#monFile'); if (f) f.value = '';
      if (state.page === 'bloqueados') renderPage(); else go('bloqueados');
      renderMenu();
    });
  }

  function sortSnaps() {
    state.snaps.sort(function (a, b) {
      return a.refAt < b.refAt ? 1 : a.refAt > b.refAt ? -1 : (a.importedAt < b.importedAt ? 1 : -1);
    });
  }

  function selectSnap(id) {
    return apiFetch(CFG.urls.relatorios + '/' + id).then(function (d) {
      state.id = id; state.rowsAll = expande(d);
      if (state.user.tipo === 'comprador') {   // mostra o nome como vem do Protheus, e não como foi digitado no cadastro
        var meu = state.rowsAll.filter(function (r) { return norm(r.comprador) === norm(CFG.escopo.compradorProtheus); })[0];
        if (meu) state.user.nome = meu.comprador;
      }
      // o Monitor de quem tem alcance restrito depende do relatório escolhido: recarrega
      var pre = state.monId && CFG.escopo.tipo !== 'todos' ? monCarrega(state.monId) : Promise.resolve();
      return pre.then(function () { computeAn(); resetView(); render(); });
    }).catch(function (e) { setStatus('err', esc(e.message)); });
  }

  /* ---------- tela ---------- */
  function currentMeta() { return state.snaps.filter(function (s) { return s.id === state.id; })[0]; }

  function render() {
    syncRole();
    renderPage();
  }

  // Itens em ruptura com entrega atrasada, agrupados por Marca (uma ligação por Marca), do maior atraso para o menor.
  function lateItems(an, buyer) {
    var gm = {};
    an.ent.forEach(function (r) {
      if (!(r.emRup && r.sit === 'atrasada') || (buyer !== 'todos' && r.comprador !== buyer)) return;
      var k = r.marca || '(sem marca)';
      var g = gm[k] || (gm[k] = { k: k, items: [], max: 0 });
      g.items.push(r);
      if (r.dias > g.max) g.max = r.dias;
    });
    var groups = Object.keys(gm).map(function (k) { return gm[k]; })
      .sort(function (a, b) { return b.max - a.max || b.items.length - a.items.length || (a.k < b.k ? -1 : 1); });
    var flat = [];
    groups.forEach(function (g) {
      g.items.sort(function (a, b) { return (a.pedido < b.pedido ? -1 : a.pedido > b.pedido ? 1 : 0) || b.falta - a.falta; });
      g.items.forEach(function (r, i) { flat.push({ r: r, first: i === 0 }); });
    });
    return { flat: flat, marcas: groups.length };
  }

  function renderLate(an) {
    var L = an.late, el = $('#late');
    if (!el) return;
    if (!L.all) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.className = 'late' + (L.rup ? '' : ' soft');
    var li = lateItems(an, 'todos'), flat = li.flat, CAP = 12, nAll = L.all;
    var l1 = L.rup
      ? fmtInt(flat.length) + (flat.length > 1 ? ' itens em ruptura' : ' item em ruptura') + (flat.length > 1 ? ' estão' : ' está') +
        ' com a entrega atrasada, em ' + fmtInt(li.marcas) + (li.marcas > 1 ? ' Marcas' : ' Marca') + ': cobrar a Marca'
      : 'Nenhum item em ruptura com entrega atrasada. Há ' + fmtInt(L.all) + ' compra(s) atrasada(s) fora de ruptura';
    var fl = flat.filter(function (x) { return hfMatch(x.r, 'late'); }).map(function (x, i, a) {
      return { r: x.r, first: i === 0 || (a[i - 1].r.marca || '(sem marca)') !== (x.r.marca || '(sem marca)') };
    });
    var info = hfAtivo('late') ? 'Filtro ativo: ' + fmtInt(fl.length) + ' de ' + fmtInt(flat.length) + ' itens. ' : '';
    var more = info || fl.length > CAP ? '<div class="more">' + info + (fl.length > CAP ? 'Mostrando ' + CAP + ' de ' + fmtInt(fl.length) + ' itens. Os demais estão em Atrasos de entrega.' : '') + '</div>' : '';
    var quadro = flat.length
      ? '<div class="tablewrap"><table><thead><tr><th>Marca</th><th>Pedido</th><th>Comprador</th><th>Código</th><th>Descrição</th><th class="num">Falta</th><th class="num">Comprado</th><th class="num">Atraso (dias)</th></tr>' + hfRow('late', 8) + '</thead><tbody>' +
        (fl.length ? fl.slice(0, CAP).map(function (x) {
          var r = x.r, d = x.first ? '' : ' dim';
          return '<tr><td class="' + d.trim() + '">' + (x.first ? '<b>' + esc(r.marca || '(sem marca)') + '</b>' : esc(r.marca || '(sem marca)')) + '</td><td class="code' + d + '">' + esc(r.pedido) + '</td><td>' + esc(r.comprador) + '</td>' +
            '<td class="code">' + esc(r.codigo) + '</td><td class="desc">' + esc(r.descricao) + '</td><td class="num"><b>' + fmtNum(r.falta) + '</b></td><td class="num"><b>' + fmtNum(nz(r.comprado)) + '</b></td><td class="num">' + fmtInt(r.dias) + '</td></tr>';
        }).join('') : '<tr class="empty-row"><td colspan="8">Nenhum item com esse filtro.</td></tr>') + '</tbody></table></div>' + more
      : '';
    el.innerHTML =
      '<div class="l1">' + l1 + '</div>' + quadro +
      (state.page === 'painel' ? '<div class="l2"><button type="button" class="btn ghost" id="lateGo">' + (L.rup ? 'Ver atrasadas em ruptura' : 'Ver atrasadas') + '</button>' +
      (L.rup && nAll > flat.length ? '<button type="button" class="btn ghost" id="lateAll">Ver todas as atrasadas (' + fmtInt(nAll) + ')</button>' : '') + '</div>' : '') +
      '<div class="l3">Falta = quantidade que as vendas lançadas superam o disponível. Comprado = quantidade do pedido ainda não recebida. Prazos calculados em ' + esc(isoToBr(an.refDate)) + ', a data do relatório. Antes de cobrar, confirme com o recebimento se a mercadoria já chegou: o Comprado só baixa quando a nota entra no Protheus.</div>';
  }

  function goLate(buyer, scope) {
    state.q = ''; state.hf = hfNovo(); state.entF = 'atrasada'; state.entScope = scope;
    go('atrasos');
  }

  function kpi(l, v, d, cls) {
    return '<div class="kpi ' + cls + '"><span class="l">' + l + '</span><span class="v" data-n="' + String(v).length + '">' + v + '</span><span class="d">' + d + '</span></div>';
  }


  function matches(r, q) { return !q || norm(r.codigo + ' ' + r.descricao + ' ' + r.comprador + ' ' + r.marca + ' ' + r.pedido).indexOf(q) >= 0; }
  /* filtros de cabeçalho: código e Marca em cada tabela de itens */
  function hfNovo() { var o = {}; ['late', 'imin', 'rep', 'ent', 'dv', 'td', 'mt', 'bl'].forEach(function (t) { o[t] = { c: '', m: '' }; }); return o; }
  function hfAtivo(t) { var f = state.hf[t]; return !!(f.c || f.m); }
  function hfMatch(r, t) {
    var f = state.hf[t];
    return (!f.c || norm(r.codigo).indexOf(norm(f.c)) >= 0) && (!f.m || norm(r.marca).indexOf(norm(f.m)) >= 0);
  }
  function hfRow(t, cols) {
    var f = state.hf[t];
    return '<tr class="hf"' + (state.ftOpen || hfAtivo(t) ? '' : ' hidden') + '><th colspan="' + cols + '"><div class="hf-in"><span class="hf-l">Filtrar</span>' +
      '<input type="search" id="hf-' + t + '-c" data-hf="' + t + '" data-k="c" placeholder="Código" aria-label="Filtrar por código" value="' + esc(f.c) + '">' +
      '<input type="search" id="hf-' + t + '-m" data-hf="' + t + '" data-k="m" placeholder="Marca / fornecedor" aria-label="Filtrar por Marca ou fornecedor" value="' + esc(f.m) + '">' +
      '<button type="button" class="btn ghost mini" data-hf-clear="' + t + '"' + (hfAtivo(t) ? '' : ' hidden') + '>Limpar filtro</button></div></th></tr>';
  }

  /* ordenar clicando no nome da coluna (igual a Todos os itens) */
  function ordGet(t) {
    var g = function (f) { return f; };
    switch (t) {
      case 'rep': return { c: g(function (r) { return r.codigo; }), d: g(function (r) { return r.descricao; }), m: g(function (r) { return r.marca; }), pp: g(function (r) { return nz(r.pontopedido); }),
        dp: g(function (r) { return nz(r.disponivel); }), vp: g(function (r) { return nz(r.vendprot); }), co: g(function (r) { return nz(r.comprado); }), di: g(function (r) { return nz(r.medcontr) > 0 ? nz(r.estdias) : null; }),
        cm: g(function (r) { return nz(r.comprar); }), up: g(function (r) { return nz(r.ultpreco); }), v: g(function (r) { return nz(r.valor); }), s: g(function (r) { return (r.emRup ? 1 : 0) + (r.sit === 'atrasada' ? 2 : 0); }) };
      case 'imin': return { s: g(function (r) { return r.st; }), c: g(function (r) { return r.codigo; }), d: g(function (r) { return r.descricao; }), m: g(function (r) { return r.marca; }), dp: g(function (r) { return nz(r.disponivel); }),
        vp: g(function (r) { return nz(r.vendprot); }), fa: g(function (r) { return nz(r.falta); }), co: g(function (r) { return nz(r.comprado); }), de: g(function (r) { return nz(r.descob); }), e: g(function (r) { return r.dtentrega || null; }),
        p: g(function (r) { return r.pedido; }), cm: g(function (r) { return nz(r.comprar); }), v: g(function (r) { return nz(r.valor); }) };
      case 'ent': return { s: g(function (r) { return PRAZO_ORDER[r.sit]; }), c: g(function (r) { return r.codigo; }), d: g(function (r) { return r.descricao; }), u: g(function (r) { return r.comprador; }), m: g(function (r) { return r.marca; }),
        fa: g(function (r) { return r.emRup ? nz(r.falta) : null; }), co: g(function (r) { return nz(r.comprado); }), e: g(function (r) { return r.dtentrega || null; }), at: g(function (r) { return r.sit === 'atrasada' ? nz(r.dias) : null; }),
        p: g(function (r) { return r.pedido; }), v: g(function (r) { return nz(r.prccompra) > 0 ? nz(r.valor) : null; }), n: g(function (r) { return nz(r.comprar) > 0 ? 1 : 0; }) };
      case 'mt': return { mo: g(function (x) { return x.motivo; }), c: g(function (x) { return x.codigo; }), d: g(function (x) { return x.descricao; }), m: g(function (x) { return x.marca; }), u: g(function (x) { return x.comprador; }),
        fi: g(function (x) { return x.fisico; }), dp: g(function (x) { return x.disp; }), di: g(function (x) { return x.dias; }), ex: g(function (x) { return x.exc; }), up: g(function (x) { return x.preco; }), v: g(function (x) { return x.valor; }), co: g(function (x) { return x.comprado; }) };
      case 'bl': return { p: g(function (L) { return L.m.pedido; }), i: g(function (L) { return L.m.item; }), cl: g(function (L) { return L.m.cliente; }), qb: g(function (L) { return L.qtd; }), vb: g(function (L) { return L.vBloq; }),
        df: g(function (L) { return L.m.datafat || null; }), at: g(function (L) { return L.m.atraso; }), pc: g(function (L) { return L.m.datapcp || null; }), op: g(function (L) { return L.m.op || null; }), ib: g(function (L) { return L.itensBloq; }) };
      case 'dv': return { tp: g(function (r) { return divRotulo(r); }), c: g(function (r) { return r.codigo; }), d: g(function (r) { return r.descricao; }), m: g(function (r) { return r.marca; }), u: g(function (r) { return r.comprador; }),
        de: g(function (r) { return r.detalhe; }), v: g(function (r) { return nz(r.impacto); }) };
    }
    return {};
  }
  var DIV_ROT = null;
  function divRotulo(r) {
    if (!DIV_ROT) { DIV_ROT = {}; DIV_TIPOS.forEach(function (t) { DIV_ROT[t[0]] = t[3]; }); }
    return DIV_ROT[r.tipo] || '';
  }
  // comparador da coluna escolhida (null se não houver); vazios ficam sempre por último
  function ordCmp(t) {
    var o = state.ord && state.ord[t], g = o && ordGet(t)[o.k];
    if (!g) return null;
    return function (a, b) {
      var va = g(a), vb = g(b), na = va == null || va === '', nb = vb == null || vb === '';
      if (na || nb) return na === nb ? 0 : (na ? 1 : -1);
      var c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR', { numeric: true });
      return c * o.dir;
    };
  }
  function thS(t, k, nome, cls) {
    var o = state.ord && state.ord[t], on = o && o.k === k;
    return '<th' + (cls ? ' class="' + cls + '"' : '') + ' data-sort="' + t + ':' + k + '" title="Clique para ordenar" aria-sort="' + (on ? (o.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' + nome + (on ? (o.dir > 0 ? ' ▲' : ' ▼') : '') + '</th>';
  }
  // refaz a tela mantendo o campo digitado em foco (e o cursor no mesmo lugar)
  function comFoco(fn) {
    var a = document.activeElement, id = a && a.id, pos = a && a.selectionStart;
    fn();
    var n = id && document.getElementById(id);
    if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* sem cursor */ } }
  }
  function ppChip(r) { return r.ppFora ? ' <span class="chip warn" title="Ponto de pedido diferente de 2 × MedContr (tolerância de 1). Confira se o ajuste foi intencional.">PP fora da regra</span>' : ''; }
  function lateCls(r) { return r.sit === 'atrasada' ? ' class="late-row"' : ''; }
  var lateChip = function (r) { return r.sit === 'atrasada' ? '<span class="chip crit">Entrega atrasada ' + fmtInt(r.dias) + ' d</span>' : ''; };
  function diasKey(r) { return nz(r.medcontr) > 0 ? nz(r.estdias) : Infinity; }
  function seg(attr, id, opts, cur) {
    return '<div class="seg" id="' + id + '">' + opts.map(function (f) {
      return '<button type="button" data-' + attr + '="' + f[0] + '" aria-pressed="' + (cur === f[0]) + '">' + f[1] + '</button>';
    }).join('') + '</div>';
  }

  /* aba Necessidade de compra: por comprador, iminentes primeiro, depois reposição */

  function groupedRows(list, cols, rowFn, grouped, keyFn, headFn) {
    if (!list.length) return '<tr class="empty-row"><td colspan="' + cols + '">Nenhum item nesta situação.</td></tr>';
    if (!grouped) return list.map(rowFn).join('');
    keyFn = keyFn || function (r) { return r.comprador; };
    var buckets = [], idx = {};
    list.forEach(function (r) {
      var k = keyFn(r);
      if (idx[k] == null) { idx[k] = buckets.length; buckets.push({ k: k, items: [] }); }
      buckets[idx[k]].items.push(r);
    });
    return buckets.map(function (g) {
      var head = headFn ? headFn(g.k, g.items)
        : esc(g.k) + ' · ' + fmtInt(g.items.length) + ' item(ns) · ' + brl.format(g.items.reduce(function (t, r) { return t + r.valor; }, 0));
      return '<tr class="grp"><td colspan="' + cols + '">' + head + '</td></tr>' + g.items.map(rowFn).join('');
    }).join('');
  }

  function renderCompraRows() {
    var an = state.an, q = norm(state.q), grouped = viewComp() === 'todos';
    var inB = function (r) { return (state.buyer === 'todos' || r.comprador === state.buyer) && matches(r, q); };
    var I0 = an.imin.filter(inB), I = I0.filter(function (r) { return hfMatch(r, 'imin'); }), ci = ordCmp('imin');
    if (ci) I.sort(function (a, b) { return (an.order[a.comprador] - an.order[b.comprador]) || ci(a, b); });
    var cmp = ordCmp('rep') || function (a, b) { return b.valor - a.valor; };
    var R0 = an.rep.filter(inB), R = R0.filter(function (r) { return hfMatch(r, 'rep'); }).sort(function (a, b) { return (an.order[a.comprador] - an.order[b.comprador]) || cmp(a, b); });

    if ($('#rowsI')) $('#rowsI').innerHTML = groupedRows(I, 14, function (r) {
      var s = SIT[r.st];
      return '<tr' + lateCls(r) + '>' + chk(r) + '<td><span class="chip ' + s[1] + '">' + s[0] + '</span></td><td class="code">' + esc(r.codigo) + '</td><td class="desc">' + esc(r.descricao) + pedChip(r.codigo) + ppChip(r) + '</td><td>' + esc(r.marca) + '</td>' +
        '<td class="num">' + fmtNum(nz(r.disponivel)) + '</td><td class="num">' + fmtNum(nz(r.vendprot)) + '</td><td class="num">' + fmtNum(r.falta) + '</td><td class="num">' + fmtNum(nz(r.comprado)) + '</td><td class="num"><b>' + fmtNum(r.descob) + '</b></td>' +
        '<td>' + esc(isoToBr(r.dtentrega)) + ' ' + lateChip(r) + '</td><td class="code">' + esc(r.pedido) + '</td><td class="num"><b>' + fmtNum(r.comprar) + '</b></td><td class="num">' + brl.format(r.valor) + '</td></tr>';
    }, grouped);
    var CAP = 1500, Rs = R.slice(0, CAP);
    if ($('#rowsR')) $('#rowsR').innerHTML = groupedRows(Rs, 13, function (r) {
      return '<tr' + lateCls(r) + '>' + chk(r) + '<td class="code">' + esc(r.codigo) + '</td><td class="desc">' + esc(r.descricao) + pedChip(r.codigo) + ppChip(r) + '</td><td>' + esc(r.marca) + '</td>' +
        '<td class="num">' + fmtNum(nz(r.pontopedido)) + '</td><td class="num">' + fmtNum(nz(r.disponivel)) + '</td><td class="num">' + fmtNum(nz(r.vendprot)) + '</td><td class="num">' + fmtNum(nz(r.comprado)) + '</td>' +
        '<td class="num">' + (nz(r.medcontr) > 0 ? fmtInt(nz(r.estdias)) : '—') + '</td><td class="num"><b>' + fmtNum(r.comprar) + '</b></td><td class="num">' + fmtNum(nz(r.ultpreco)) + '</td><td class="num">' + brl.format(r.valor) + '</td>' +
        '<td>' + (r.emRup ? '<span class="chip ok">Falta coberta</span> ' : '') + lateChip(r) + '</td></tr>';
    }, grouped);
    state.shown = { imin: I, rep: Rs, repAll: R };
    if ($('#cI')) $('#cI').textContent = fmtInt(I.length) + (I.length !== I0.length ? ' de ' + fmtInt(I0.length) : '') + ' item(ns)';
    if ($('#cR')) $('#cR').textContent = fmtInt(R.length) + (R.length !== R0.length ? ' de ' + fmtInt(R0.length) : '') + ' item(ns)' + (R.length > CAP ? ', mostrando ' + fmtInt(CAP) : '');
    renderSelBar();
  }

  /* aba Entregas a cobrar: compras feitas e ainda não recebidas */
  function renderEntregas() {
    var an = state.an, p = $('#panel');
    p.innerHTML =
      '<details class="como"><summary>Como ler esta tela</summary><p class="note">Compras já feitas e ainda não recebidas (Comprado maior que zero). O prazo compara a data de entrega do relatório (DT_ENTREGA) com a data de referência, ' + esc(isoToBr(an.refDate)) + '. Itens em ruptura vêm primeiro, porque a entrega é o que destrava as vendas. Itens "Sem data" não têm como ser cobrados pelo prazo.</p></details>' +
      '<div class="tb1"><div class="searchbox"><input type="search" id="q" placeholder="Buscar por código, descrição, marca ou pedido" aria-label="Buscar" value="' + esc(state.q) + '"></div>' + filtrosBtn('ent') +
      '<select id="selScope" aria-label="Compras">' + opt('rup', 'Só itens em ruptura', state.entScope) + opt('todos', 'Todas as compras em aberto', state.entScope) + '</select>' +
      '<select id="selEf" aria-label="Prazo">' + opt('todas', 'Prazo: todos', state.entF) + opt('atrasada', 'Atrasadas', state.entF) + opt('hoje', 'Vencem hoje', state.entF) + opt('prazo', 'No prazo', state.entF) + opt('semdata', 'Sem data', state.entF) + '</select>' +
      '<select id="selGrp" aria-label="Agrupar">' + opt('marca', 'Agrupar por Marca', state.entGroup) + opt('comp', 'Agrupar por Comprador', state.entGroup) + '</select>' + menuExport() + '<span class="note cnt" id="cE"></span></div>' +
      '<div class="tablewrap scroll"><table><thead><tr>' + thS('ent', 's', 'Prazo') + thS('ent', 'c', 'Código') + thS('ent', 'd', 'Descrição') + (state.entGroup === 'marca' ? thS('ent', 'u', 'Comprador') : thS('ent', 'm', 'Marca')) + thS('ent', 'fa', 'Falta', 'num') + thS('ent', 'co', 'Comprado', 'num') + thS('ent', 'e', 'Entrega prevista') + thS('ent', 'at', 'Atraso (dias)', 'num') + thS('ent', 'p', 'Pedido') + thS('ent', 'v', 'Valor comprado', 'num') + thS('ent', 'n', 'Precisa comprar') + '</tr>' + hfRow('ent', 11) + '</thead><tbody id="rowsE"></tbody></table></div>';
    renderLate(an);
    renderEntRows();
  }

  function entCmp(a, b) {
    return (b.emRup - a.emRup) || PRAZO_ORDER[a.sit] - PRAZO_ORDER[b.sit] || nz(b.dias) - nz(a.dias) || b.falta - a.falta;
  }

  function renderEntRows() {
    var an = state.an, q = norm(state.q), CAP = 1500, byForn = state.entGroup === 'marca';
    var base = an.ent.filter(function (r) {
      return (state.entScope === 'todos' || r.emRup) && (state.entBuyer === 'todos' || r.comprador === state.entBuyer) &&
        (state.entF === 'todas' || r.sit === state.entF) && matches(r, q);
    });
    var list = base.filter(function (r) { return hfMatch(r, 'ent'); });
    var key = function (r) { return r.marca || '(sem marca)'; };
    if (byForn) {
      // marcas com mais atrasos primeiro; dentro de cada uma, ruptura e maior atraso primeiro
      var gm = {};
      list.forEach(function (r) {
        var g = gm[key(r)] || (gm[key(r)] = { items: [], late: 0, rup: 0, k: key(r) });
        g.items.push(r);
        if (r.sit === 'atrasada') g.late++;
        if (r.emRup) g.rup++;
      });
      list = [].concat.apply([], Object.keys(gm).map(function (k) { return gm[k]; })
        .sort(function (a, b) { return b.late - a.late || b.rup - a.rup || b.items.length - a.items.length || (a.k < b.k ? -1 : 1); })
        .map(function (g) { return g.items.sort(entCmp); }));
    }
    var ce = ordCmp('ent');
    if (ce) {
      var gi = {}, gn = 0, gk = function (r) { return byForn ? key(r) : r.comprador; };
      list.forEach(function (r) { var g = gk(r); if (gi[g] == null) gi[g] = gn++; });
      list = list.slice().sort(function (a, b) { return (gi[gk(a)] - gi[gk(b)]) || ce(a, b); });
    }
    state.shownEnt = list;
    var shown = list.slice(0, CAP);
    var headForn = function (k, items) {
      var late = items.filter(function (r) { return r.sit === 'atrasada'; }).length;
      var seen = {}, peds = [], buyers = {};
      items.forEach(function (r) { if (r.pedido && !seen[r.pedido]) { seen[r.pedido] = 1; peds.push(r.pedido); } buyers[r.comprador] = 1; });
      return esc(k) + ' · ' + fmtInt(items.length) + ' item(ns)' + (late ? ' · ' + fmtInt(late) + ' atrasado(s)' : '') +
        ' · comprador: ' + esc(Object.keys(buyers).join(', ')) + (peds.length ? ' · pedido(s) ' + esc(peds.slice(0, 5).join(', ')) + (peds.length > 5 ? ' e mais ' + (peds.length - 5) : '') : '');
    };
    $('#rowsE').innerHTML = groupedRows(shown, 11, function (r) {
      var s = PRAZO[r.sit];
      return '<tr' + lateCls(r) + '><td><span class="chip ' + s[1] + '">' + s[0] + '</span></td><td class="code">' + esc(r.codigo) + '</td><td class="desc">' + esc(r.descricao) + '</td><td>' + esc(byForn ? r.comprador : r.marca) + '</td>' +
        '<td class="num">' + (r.emRup ? fmtNum(r.falta) : '') + '</td><td class="num">' + fmtNum(nz(r.comprado)) + '</td><td>' + esc(isoToBr(r.dtentrega)) + '</td>' +
        '<td class="num">' + (r.sit === 'atrasada' ? fmtInt(r.dias) : '') + '</td><td class="code">' + esc(r.pedido) + '</td><td class="num">' + (nz(r.prccompra) > 0 ? brl.format(r.valor) : '') + '</td>' +
        '<td>' + (nz(r.comprar) > 0 ? '<span class="chip crit">Sim</span>' : '<span class="chip ok">Não</span>') + '</td></tr>';
    }, byForn || state.entBuyer === 'todos', byForn ? key : null, byForn ? headForn : null);
    $('#cE').textContent = fmtInt(list.length) + (list.length !== base.length ? ' de ' + fmtInt(base.length) : '') + ' item(ns)' + (list.length > CAP ? ', mostrando ' + fmtInt(CAP) : '');
  }

  /* ---------- site: menu lateral, páginas e chave Geral / Por comprador ---------- */
  var PAGES = [
    { id: 'painel', grp: 'Painel', label: 'Visão geral', title: 'Painel', rel: 1, view: 1 },
    { id: 'rupturas', grp: 'Acompanhamento', label: 'Rupturas', title: 'Rupturas', rel: 1, view: 1 },
    { id: 'atrasos', grp: 'Acompanhamento', label: 'Atrasos de entrega', title: 'Atrasos de entrega', rel: 1, view: 1 },
    { id: 'nec60', grp: 'Acompanhamento', label: 'Necessidade 60 dias', title: 'Necessidade de compra para 60 dias', rel: 1, view: 1 },
    { id: 'moeda', grp: 'Acompanhamento', label: 'Moeda de troca', title: 'Moeda de troca', rel: 1, view: 1 },
    { id: 'bloqueados', grp: 'Acompanhamento', label: 'Pedidos bloqueados', title: 'Pedidos bloqueados por falta de material', rel: 1, view: 1 },
    { id: 'todos', grp: 'Acompanhamento', label: 'Todos os itens', title: 'Todos os itens do relatório', rel: 1, view: 1 },
    { id: 'divergencias', grp: 'Acompanhamento', label: 'Divergências', title: 'Divergências e alertas do relatório', rel: 1, view: 1 },
    { id: 'formularios', grp: 'Compras', label: 'Formulários', title: 'Formulários de compra', view: 1 },
    { id: 'relatorios', grp: 'Compras', label: 'Relatórios', title: 'Solicitar relatórios', rel: 1 },
    { id: 'fornecedores', grp: 'Compras', label: 'Fornecedores', title: 'Cadastro de fornecedores', gestor: 1 },
    { id: 'budget', grp: 'Gestão (ADM e gerência)', label: 'Budget', title: 'Budget mensal por fornecedor', gestor: 1 },
    { id: 'importar', grp: 'Relatório', label: 'Importar relatório', title: 'Importar relatório', gestor: 1, estatica: 1 },
    { id: 'exportar', grp: 'Relatório', label: 'Exportar PDF e Excel', title: 'Exportar PDF e Excel', rel: 1, estatica: 1 }
  ];
  function pageDef(id) { return PAGES.filter(function (p) { return p.id === id; })[0]; }
  function pageFromHash() {
    var m = /^#\/?([a-z0-9]+)/.exec(location.hash || '');
    var p = m && pageDef(m[1]);
    return p && podeVer(p.id) ? p.id : null;
  }
  function go(id) {
    if (location.hash === '#/' + id) { renderPage(); return; }
    location.hash = '#/' + id;   // dispara hashchange
  }
  function flash(texto, erro) {
    var el = $('#flash');
    if (!el) return;
    el.textContent = texto || ''; el.hidden = !texto; el.className = 'flash' + (erro ? ' err' : '');
    clearTimeout(flash.t);
    if (texto) flash.t = setTimeout(function () { el.hidden = true; }, 9000);
  }

  /* chave Geral | Por comprador: vale para todas as páginas; o comprador vê só o que é dele */
  function viewComp() {
    if (!ehGestor()) return state.user.nome;
    return state.view && state.view.modo === 'comprador' && state.view.comp ? state.view.comp : 'todos';
  }
  function ehDoComprador(r) { return norm(r.comprador || '(sem comprador)') === norm(state.user.nome); }
  function viewRows() {
    var rows = state.rowsAll || [], vc = viewComp();
    if (!ehGestor()) return rows.filter(ehDoComprador);
    return vc === 'todos' ? rows : rows.filter(function (r) { return (r.comprador || '(sem comprador)') === vc; });
  }
  function setView(modo, comp) {
    var lista = compradoresConhecidos();
    state.view = { modo: modo, comp: comp || (state.view && state.view.comp) || lista[0] || '' };
    if (modo === 'comprador' && !state.view.comp) state.view.comp = lista[0] || '';
    state.expBuyer = modo === 'comprador' ? state.view.comp : 'todos';
    state.sel = {}; state.hf = hfNovo();
    computeAn(); render();
  }
  function renderViewSw() {
    var el = $('#viewSw'), pg = pageDef(state.page);
    if (!el) return;
    if (!pg || !pg.view || !state.snaps.length) { el.hidden = true; return; }
    el.hidden = false;
    if (!ehGestor()) { el.innerHTML = '<span class="exl">Visão</span><b>Comprador: ' + esc(state.user.nome) + '</b>'; return; }
    var vc = viewComp(), lista = compradoresConhecidos();
    el.innerHTML = '<span class="exl">Visão</span><div class="seg" role="group" aria-label="Visão"><button type="button" data-view="geral" aria-pressed="' + (vc === 'todos') + '">Geral</button>' +
      '<button type="button" data-view="comprador" aria-pressed="' + (vc !== 'todos') + '">Por comprador</button></div>' +
      (vc !== 'todos' ? '<select id="viewComp" aria-label="Comprador">' + lista.map(function (n) { return '<option value="' + esc(n) + '"' + (n === vc ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select>' : '');
  }


  var MENU = [
    { id: 'painel', label: 'Visão geral', pages: ['painel'] },
    { id: 'rupturas', label: 'Rupturas', pages: ['rupturas'] },
    { id: 'atrasos', label: 'Atrasos de entrega', pages: ['atrasos'], hot: 1 },
    { id: 'nec60', label: 'Necessidade 60 dias', pages: ['nec60'] },
    { id: 'moeda', label: 'Moeda de troca', pages: ['moeda'] },
    { id: 'bloqueados', label: 'Pedidos bloqueados', pages: ['bloqueados'], hot: 1 },
    { id: 'todos', label: 'Todos os itens', pages: ['todos'], badge: [] },
    { id: 'divergencias', label: 'Divergências', pages: ['divergencias'], hot: 1 },
    { id: 'formularios', label: 'Formulários', pages: ['formularios'], hot: 1 },
    { id: 'relatorios', label: 'Relatórios', pages: ['relatorios'] },
    { id: 'cad', label: 'Fornecedores e budget', pages: ['fornecedores', 'budget'] },
    { id: 'imp', label: 'Importar e exportar', pages: ['importar', 'exportar'] }
  ];
  function menuPages(m) { return m.pages.filter(function (id) { return pageDef(id) && podeVer(id); }); }
  function menuOf(pageId) { return MENU.filter(function (m) { return m.pages.indexOf(pageId) >= 0; })[0]; }

  /* menu lateral com contadores */
  function menuCounts() {
    var an = state.an, c = {};
    if (an) {
      c.rupturas = an.imin.length; c.atrasos = an.late.all; c.nec60 = an.rep.length;
      c.divergencias = divLista().length; c.todos = viewRows().length;
      try { c.moeda = moedaCalc().itens.length; } catch (e) { c.moeda = 0; }
      try { c.bloqueados = state.monRows ? bloqVista({ sc: bloqEscopoPagina(), modo: 'nec', hf: false }).nProd : 0; } catch (e) { c.bloqueados = 0; }
    }
    var ct = contagemDrawer();
    c.formularios = podeAprovar() ? ct.pendente + ct.revisar : meusPedidos().filter(function (p) { return p.status === 'devolvido' || (p.status === 'aprovado' && !p.protheus); }).length;
    return c;
  }
  function renderMenu() {
    var el = $('#nav');
    if (!el) return;
    var c = menuCounts(), h = '', temRel = state.snaps.length > 0 && state.an, atual = menuOf(state.page);
    state.menuLast = state.menuLast || {};
    if (atual) state.menuLast[atual.id] = state.page;
    MENU.forEach(function (m) {
      var ps = menuPages(m);
      if (!ps.length) return;
      var alvo = m === atual ? state.page : state.menuLast[m.id];
      if (ps.indexOf(alvo) < 0) alvo = ps[0];
      var rotulo = m.pages.length > 1 && ps.length === 1 ? pageDef(ps[0]).label : m.label;
      var ids = (m.badge || [m.pages[0]]).filter(function (id) { return ps.indexOf(id) >= 0; }), n = 0;
      ids.forEach(function (id) { n += c[id] || 0; });
      var sem = ps.some(function (id) { return pageDef(id).rel; }) && !temRel;
      h += '<button type="button" class="nav-item" data-nav="' + alvo + '"' + (m === atual ? ' aria-current="page"' : '') + (sem ? ' data-sem="1"' : '') + '><span>' + esc(rotulo) + '</span>' +
        (n ? '<span class="nav-n' + (m.hot ? ' hot' : '') + '">' + fmtInt(n) + '</span>' : '') + '</button>';
    });
    el.innerHTML = h;
    renderTabs(c, temRel);
  }
  function renderTabs(c, temRel) {
    var el = $('#pgTabs'), m = menuOf(state.page), ps = m ? menuPages(m) : [];
    if (!el) return;
    if (ps.length < 2) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = ps.map(function (id) {
      var n = c[id], hot = id === 'atrasos' || id === 'divergencias' || id === 'rupturas';
      return '<button type="button" class="pgtab" data-nav="' + id + '"' + (id === state.page ? ' aria-current="page"' : '') + '>' + esc(pageDef(id).label) + (n ? '<span class="n' + (hot ? ' hot' : '') + '">' + fmtInt(n) + '</span>' : '') + '</button>';
    }).join('');
  }

  function renderTop() {
    var pg = pageDef(state.page), m = currentMeta();
    $('#pgTitle').textContent = pg ? pg.title : 'RV Necessidades';
    document.title = (pg ? pg.label + ' · ' : '') + 'RV Necessidades';
    var idade = m ? daysBetween(String(m.refAt).slice(0, 10), todayIso()) : 0;
    $('#pgSub').textContent = m ? 'Relatório de ' + refToBr(m.refAt) + ' · ' + (idade > 0 ? 'gerado há ' + idade + (idade > 1 ? ' dias' : ' dia') : 'gerado hoje') + (!pg || !pg.view ? '' : viewComp() !== 'todos' ? ' · visão de ' + viewComp() : ' · visão geral') : 'Nenhum relatório importado';
    $('#snapSel').innerHTML = state.snaps.length ? state.snaps.map(function (s, i) {
      return '<option value="' + esc(s.id) + '"' + (s.id === state.id ? ' selected' : '') + '>' + esc(refToBr(s.refAt)) + ' · importado às ' + esc(new Date(s.importedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })) + (i === 0 ? ' (mais recente)' : '') + '</option>';
    }).join('') : '<option value="">(nenhum)</option>';
    $('#snapSel').disabled = !state.snaps.length;
    var h = $('#top'); if (h) document.documentElement.style.setProperty('--topH', Math.round(h.getBoundingClientRect().height) + 'px');
    renderViewSw();
  }

  function estadoVazio() {
    return '<div class="empty"><h2>Nenhum relatório importado</h2><p>Esta página mostra os dados do relatório diário do Protheus. Importe o primeiro relatório para começar.</p>' +
      (CFG.pode.importarRelatorio && podeVer('importar') ? '<div><button type="button" class="btn" data-nav="importar">Importar relatório</button></div>' : '<p>Peça à gerência para importar o relatório do dia.</p>') + '</div>';
  }

  function renderPage() {
    var pg = pageDef(state.page);
    if (!pg || !podeVer(pg.id)) { state.page = podeVer('painel') ? 'painel' : (CFG.paginas[0] || 'painel'); pg = pageDef(state.page); }
    if (!pg || !podeVer(pg.id)) { renderTop(); $('#panel').hidden = false; $('#panel').innerHTML = '<div class="empty"><h2>Sem páginas liberadas</h2><p>Peça ao administrador para liberar o seu acesso.</p></div>'; return; }
    var temRel = state.snaps.length > 0 && state.an;
    if (state.lastPage !== state.page) state.ftOpen = false;
    Array.prototype.forEach.call(document.querySelectorAll('.page'), function (s) { s.hidden = s.id !== 'pg-' + state.page; });
    $('#panel').hidden = !!pg.estatica;
    renderTop(); renderMenu();
    if (pg.estatica) { renderEstatica(); return; }
    var p = $('#panel');
    if (pg.rel && !temRel) { p.innerHTML = estadoVazio(); return; }
    switch (state.page) {
      case 'painel': renderPainel(); break;
      case 'rupturas': renderRupturas(); break;
      case 'atrasos': renderEntregas(); break;
      case 'nec60': renderNec60(); break;
      case 'moeda': renderMoeda(); break;
      case 'bloqueados': renderBloqueados(); break;
      case 'todos': renderTodos(); break;
      case 'divergencias': renderDivPage(); break;
      case 'relatorios': renderRelatorios(); break;
      case 'formularios': p.innerHTML = '<div id="drawerActions"></div><div class="tabs" id="drawerTabs" role="tablist"></div><div class="drawer-list plain" id="drawerList"></div>'; renderForms(); break;
      case 'fornecedores': renderFornecedores(); break;
      case 'budget': p.innerHTML = '<div class="plain-body" id="pgBody"></div>'; renderBudgets(); break;
    }
    if (state.lastPage !== state.page) {
      window.scrollTo(0, 0);
      if (state.lastPage && (state.page === 'formularios' || state.page === 'budget' || state.page === 'fornecedores')) carregaCompras().then(function () { renderDrawer(); });   // pega o que outras pessoas mudaram
      state.lastPage = state.page;
    }
  }
  function renderEstatica() {
    var m = currentMeta(), temRel = state.snaps.length > 0 && state.an;
    if (state.page === 'importar') {
      $('#snapTitle').textContent = m ? 'Relatório vigente: ' + refToBr(m.refAt) : 'Nenhum relatório importado';
      $('#snapMeta').textContent = m ? m.fileName + (m.itens != null ? ' · ' + fmtInt(m.itens) + ' itens' : '') + ' · importado em ' + new Date(m.importedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + (m.importedBy ? ' por ' + m.importedBy : '') : 'Depois da primeira importação, o menu mostra as páginas de acompanhamento.';
      $('#secImport').hidden = !CFG.pode.importarRelatorio;
      $('#del').hidden = !temRel || !CFG.pode.excluir; $('#del').textContent = state.confirmDel ? 'Confirmar exclusão' : 'Excluir este relatório';
      $('#delNo').hidden = !state.confirmDel || !CFG.pode.excluir;
    } else if (state.page === 'exportar') {
      var names = temRel ? state.anFull.exportBuyers.map(function (g) { return g.nome; }) : [];
      if (!ehGestor()) state.expBuyer = names.indexOf(state.user.nome) >= 0 ? state.user.nome : 'todos';
      else if (state.expBuyer !== 'todos' && names.indexOf(state.expBuyer) < 0) state.expBuyer = 'todos';
      $('#expBuyer').innerHTML = (ehGestor() || !names.length ? '<option value="todos">' + (ehGestor() ? 'Geral (todos os compradores)' : 'Sem itens') + '</option>' : '') + names.filter(function (n) { return ehGestor() || n === state.user.nome; }).map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('');
      $('#expBuyer').value = state.expBuyer;
      $('#expTodas').checked = state.expTodas;
      $('#expSemRel').hidden = !!temRel;
      $('#export').hidden = !temRel;
    }
  }

  /* ---------- Painel: Atrasos de entrega, Rupturas e Necessidade de 60 dias lado a lado ---------- */
  function kpisHtml(an) {
    var ce = an.cntEnt, nAl = an.warnings.filter(function (w) { return w.level !== 'info'; }).length, mt = moedaCalc();
    return kpi('Necessidade de compra', fmtInt(an.imin.length + an.rep.length), brl.format(an.iminV + an.repV) + ' pelo último preço (Ult.Preco)', '') +
      kpi('Rupturas', fmtInt(an.imin.length), fmtInt(an.cnt.sem) + ' sem compra · ' + fmtInt(an.cnt.parcial) + ' compra parcial · ' + brl.format(an.iminV), an.imin.length ? 'crit' : '') +
      kpi('Necessidade 60 dias', fmtInt(an.rep.length), brl.format(an.repV) + ' · inclui ' + fmtInt(an.repCob) + ' com falta já coberta', '') +
      kpi('Atrasos de entrega', fmtInt(an.late.all), 'em ruptura: ' + fmtInt(ce.atrasada) + ' atrasadas · ' + fmtInt(ce.hoje) + ' vencem hoje · ' + fmtInt(ce.semdata) + ' sem data', an.late.all ? 'warn' : '') +
      kpi('Moeda de troca', brl.format(mt.total), fmtInt(mt.itens.length) + ' item(ns) em ' + fmtInt(mt.grupos.length) + ' fornecedor(es) para negociar devolução', '') +
      kpi('Divergências a corrigir', fmtInt(divLista().length), nAl ? fmtInt(nAl) + ' alerta(s) de qualidade no arquivo' : 'Nenhum alerta de qualidade', divLista().length ? 'warn' : '');
  }
  function miniTabela(titulo, chip, navId, nota, cab, linhas, vazio) {
    return '<section class="card"><div class="card-h"><h3>' + titulo + ' ' + chip + '</h3><button type="button" class="btn ghost mini" data-nav="' + navId + '">Ver todos</button></div>' +
      '<p class="note">' + nota + '</p>' +
      (linhas ? '<div class="tablewrap"><table><thead><tr>' + cab + '</tr></thead><tbody>' + linhas + '</tbody></table></div>' : '<p class="note">' + vazio + '</p>') + '</section>';
  }
  function renderPainel() {
    var an = state.an, geral = viewComp() === 'todos', NTOP = 8;
    var imin = an.imin.slice().sort(function (a, b) { return b.valor - a.valor; }).slice(0, NTOP);
    var rep = an.rep.slice().sort(function (a, b) { return b.valor - a.valor; }).slice(0, NTOP);
    var cabI = '<th>Código</th><th>Descrição</th><th>Marca</th>' + (geral ? '<th>Comprador</th>' : '') + '<th class="num">Descoberto</th><th class="num">Valor</th>';
    var linI = imin.map(function (r) {
      return '<tr' + lateCls(r) + '><td class="code">' + esc(r.codigo) + '</td><td class="desc">' + esc(r.descricao) + '</td><td>' + esc(r.marca) + '</td>' + (geral ? '<td>' + esc(r.comprador) + '</td>' : '') + '<td class="num"><b>' + fmtNum(r.descob) + '</b></td><td class="num">' + brl.format(r.valor) + '</td></tr>';
    }).join('');
    var cabR = '<th>Código</th><th>Descrição</th><th>Marca</th>' + (geral ? '<th>Comprador</th>' : '') + '<th class="num">Dias de estoque</th><th class="num">Comprar</th><th class="num">Valor</th>';
    var linR = rep.map(function (r) {
      return '<tr><td class="code">' + esc(r.codigo) + '</td><td class="desc">' + esc(r.descricao) + '</td><td>' + esc(r.marca) + '</td>' + (geral ? '<td>' + esc(r.comprador) + '</td>' : '') + '<td class="num">' + (nz(r.medcontr) > 0 ? fmtInt(nz(r.estdias)) : '—') + '</td><td class="num"><b>' + fmtNum(r.comprar) + '</b></td><td class="num">' + brl.format(r.valor) + '</td></tr>';
    }).join('');
    var porComp = '';
    if (ehGestor() && geral && state.anFull) {
      porComp = '<section class="card"><div class="card-h"><h3>Por comprador</h3></div><p class="note">Clique no nome para abrir a visão do comprador.</p><div class="tablewrap"><table class="nav"><thead><tr><th>Comprador</th><th class="num">Rupturas</th><th class="num">Valor rupturas</th><th class="num">Atrasos em ruptura</th><th class="num">Necessidade 60 dias</th><th class="num">Valor 60 dias</th></tr></thead><tbody>' +
        state.anFull.buyers.map(function (g) {
          return '<tr><td><button type="button" class="pick" data-view-comp="' + esc(g.nome) + '">' + esc(g.nome) + '</button></td><td class="num">' + (g.iminN ? '<span class="chip crit">' + fmtInt(g.iminN) + '</span>' : '0') + '</td><td class="num">' + brl.format(g.iminV) + '</td><td class="num">' + fmtInt(g.atrasN) + '</td><td class="num">' + fmtInt(g.repN) + '</td><td class="num">' + brl.format(g.repV) + '</td></tr>';
        }).join('') + '</tbody></table></div></section>';
    }
    $('#panel').innerHTML =
      '<div class="kpis k6">' + kpisHtml(an) + '</div>' +
      '<div class="late" id="late" hidden></div>' +
      '<div class="grid2">' +
      miniTabela('Rupturas', '<span class="chip crit">' + fmtInt(an.imin.length) + '</span>', 'rupturas', 'Itens em ruptura que precisam de compra e ainda não têm compra que cubra a falta. Os de maior valor primeiro.', cabI, linI, 'Nenhuma ruptura sem cobertura.') +
      miniTabela('Necessidade 60 dias', '<span class="chip info">' + fmtInt(an.rep.length) + '</span>', 'nec60', 'Estoque abaixo do ponto de pedido (cerca de 60 dias de consumo). Os de maior valor primeiro.', cabR, linR, 'Nenhum item abaixo do ponto de pedido.') + '</div>' +
      porComp;
    renderLate(an);
  }

  /* ---------- Rupturas e Necessidade 60 dias (listas com seleção para gerar formulário) ---------- */
  function toolCompra(comOrdem) {
    return '<div class="tb1"><div class="searchbox"><input type="search" id="q" placeholder="Buscar por código, descrição ou marca" aria-label="Buscar" value="' + esc(state.q) + '"></div>' +
      filtrosBtn(comOrdem ? 'rep' : 'imin') +
      '<button type="button" class="btn ghost" id="negBtn" data-neg-toggle aria-pressed="' + !!state.negoc + '">Ver moeda de troca</button>' + menuExport() + '</div>';
  }

  function filtrosBtn(t) {
    var f = state.hf[t], n = (f.c ? 1 : 0) + (f.m ? 1 : 0) + (t === 'td' ? (state.td.comp !== 'todos' ? 1 : 0) + (state.td.grupo ? 1 : 0) : 0);
    return '<button type="button" class="btn ghost" data-ft-toggle aria-pressed="' + (!!state.ftOpen || n > 0) + '">Filtros' + (n ? ' (' + n + ')' : '') + '</button>';
  }
  function menuExport() {
    return '<details class="menu"><summary>Exportar ▾</summary><div class="menu-pop"><button type="button" data-xp="pdf">Baixar PDF</button><button type="button" data-xp="xlsx">Baixar Excel</button></div></details>';
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var tg = e.target.closest('[data-ft-toggle]');
    if (tg) { state.ftOpen = !state.ftOpen; Array.prototype.forEach.call(document.querySelectorAll('tr.hf'), function (tr) { var ativo = Array.prototype.some.call(tr.querySelectorAll('input'), function (i) { return i.value; }); tr.hidden = !(state.ftOpen || ativo); }); var mais = document.getElementById('tdMais'); if (mais) mais.hidden = !(state.ftOpen || state.td.comp !== 'todos' || state.td.grupo); tg.setAttribute('aria-pressed', String(state.ftOpen)); return; }
    Array.prototype.forEach.call(document.querySelectorAll('details.menu[open]'), function (d) { if (!d.contains(e.target) || e.target.closest('.menu-pop button')) d.open = false; });
  });
  document.addEventListener('change', function (e) {
    var id = e.target.id;
    if (id === 'selScope') { state.entScope = e.target.value; renderEntregas(); }
    else if (id === 'selEf') { state.entF = e.target.value; renderEntregas(); }
    else if (id === 'selGrp') { state.entGroup = e.target.value; renderEntregas(); }
  });
  function opt(v, t, cur) { return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + t + '</option>'; }

  function renderRupturas() {
    $('#panel').innerHTML = '<details class="como"><summary>Como ler esta tela</summary><p class="note">Itens em ruptura que precisam de compra e <b>não têm compra que cubra a falta</b>: &ldquo;Sem compra&rdquo; ou &ldquo;Compra parcial&rdquo;. A coluna Descoberto mostra quanto da falta ainda não tem compra. Resolver primeiro. Marque os itens e gere o formulário de compra.</p></details>' +
      toolCompra(false) + barraExport() + '<div class="selbar" id="selBar" hidden></div><div id="negoc"></div>' + secRupturas();
    renderCompraRows();
  }
  function renderNec60() {
    $('#panel').innerHTML = '<details class="como"><summary>Como ler esta tela</summary><p class="note">Estoque abaixo do ponto de pedido. A quantidade em Comprar leva o item de volta ao ponto de pedido, que corresponde a cerca de 60 dias de consumo. Itens com &ldquo;Falta coberta&rdquo; estão em ruptura, mas o que já foi comprado cobre a falta: a entrega deles está em Atrasos de entrega.</p></details>' +
      toolCompra(true) + barraExport() + '<div class="selbar" id="selBar" hidden></div><div id="negoc"></div>' + secNec60();
    renderCompraRows();
  }

  function secRupturas() {
    return '<div class="sec"><h3>Rupturas <span class="chip crit" id="cI"></span></h3>' +
      '<div class="tablewrap scroll"><table><thead><tr><th class="chkcol"><input type="checkbox" data-selall="imin" aria-label="Marcar ou desmarcar todos os itens listados em Rupturas" title="Marcar todos os itens listados"></th>' + thS('imin', 's', 'Situação', '') + '' + thS('imin', 'c', 'Código', '') + '' + thS('imin', 'd', 'Descrição', '') + '' + thS('imin', 'm', 'Marca', '') + '' + thS('imin', 'dp', 'Disponível', 'num') + '' + thS('imin', 'vp', 'VendProt', 'num') + '' + thS('imin', 'fa', 'Falta', 'num') + '' + thS('imin', 'co', 'Comprado', 'num') + '' + thS('imin', 'de', 'Descoberto', 'num') + '' + thS('imin', 'e', 'Entrega', '') + '' + thS('imin', 'p', 'Pedido', '') + '' + thS('imin', 'cm', 'Comprar', 'num') + '' + thS('imin', 'v', 'Valor', 'num') + '</tr>' + hfRow('imin', 14) + '</thead><tbody id="rowsI"></tbody></table></div></div>';
  }
  function secNec60() {
    return '<div class="sec"><h3>Necessidade de compra para 60 dias <span class="chip info" id="cR"></span></h3>' +
      '<div class="tablewrap scroll"><table><thead><tr><th class="chkcol"><input type="checkbox" data-selall="rep" aria-label="Marcar ou desmarcar todos os itens listados em Necessidade 60 dias" title="Marcar todos os itens listados"></th>' + thS('rep', 'c', 'Código', '') + '' + thS('rep', 'd', 'Descrição', '') + '' + thS('rep', 'm', 'Marca', '') + '' + thS('rep', 'pp', 'Pto. pedido', 'num') + '' + thS('rep', 'dp', 'Disponível', 'num') + '' + thS('rep', 'vp', 'VendProt', 'num') + '' + thS('rep', 'co', 'Comprado', 'num') + '' + thS('rep', 'di', 'Dias de estoque', 'num') + '' + thS('rep', 'cm', 'Comprar', 'num') + '' + thS('rep', 'up', 'Últ. preço', 'num') + '' + thS('rep', 'v', 'Valor', 'num') + '' + thS('rep', 's', 'Situação', '') + '</tr>' + hfRow('rep', 13) + '</thead><tbody id="rowsR"></tbody></table></div></div>';
  }

  /* Excel simples: abas = [[nome, linhas, larguras]] */
  function baixarXlsx(nome, abas) {
    if (typeof XLSX === 'undefined') { setDrawerMsg('A biblioteca de Excel não carregou. Recarregue a página e tente de novo.', true); return false; }
    var wb = XLSX.utils.book_new();
    abas.forEach(function (a) {
      var ws = XLSX.utils.aoa_to_sheet(a[1]);
      ws['!cols'] = (a[2] || []).map(function (w) { return { wch: w }; });
      if (a[1].length > 1) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: a[1].length - 1, c: a[1][0].length - 1 } }) };
      XLSX.utils.book_append_sheet(wb, ws, a[0]);
    });
    XLSX.writeFile(wb, nome);
    return true;
  }

  /* Disponível exportado sem a vírgula decimal (ver divergências): recupera o valor que o Protheus usou no COMPRAR */
  function dispCorr(r) {
    var disp = nz(r.disponivel), fEsp = nz(r.pontopedido) - disp + nz(r.vendprot) - nz(r.comprado);
    if (Math.abs(nz(r.comprar) - fEsp) > 0.5) {
      var dImp = nz(r.pontopedido) + nz(r.vendprot) - nz(r.comprado) - nz(r.comprar);
      for (var k = 1; k <= 5; k++) if (dImp > 0 && Math.abs(disp / Math.pow(10, k) - dImp) <= 0.011) return { v: dImp, corrigido: true, orig: disp };
    }
    return { v: disp, corrigido: false, orig: disp };
  }
  function diasEst(r, disp) { var med = nz(r.medcontr); return med > 0 ? disp / (med / 30) : null; }
  function dentroDaVisao(r) {
    if (!ehGestor()) return ehDoComprador(r);
    var vc = viewComp();
    return vc === 'todos' || (r.comprador || '(sem comprador)') === vc;
  }


  /* ---------- exportação de listas: PDF e Excel sempre disponíveis ---------- */
  function barraExport() { return ''; }
  function barraExportAntiga() {
    return '<div class="expbar"><span class="exl">Exportar esta lista</span><button type="button" class="btn ghost" data-xp="pdf">Baixar PDF</button><button type="button" class="btn ghost" data-xp="xlsx">Baixar Excel</button><span class="note">Leva o que está na tela, com os filtros e a visão atuais.</span></div>';
  }
  function visaoRotulo() { return viewComp() === 'todos' ? 'Geral (todos os compradores)' : viewComp(); }
  // cada coluna: [título, tipo]; tipo s = texto, n = número, m = reais. Linhas com valores brutos.
  var DS_SOMA = function (l) { return l.reduce(function (t, r) { return t + nz(r.valor); }, 0); };
  function dsRupturas(L, base) {
    return { nome: 'Rupturas', titulo: 'Rupturas', sub: base, resumo: [fmtInt(L.length) + ' item(ns) em ruptura sem compra que cubra a falta · ' + brl.format(DS_SOMA(L)) + ' pelo último preço'],
      cols: [['Situação', 's'], ['Código', 's'], ['Descrição', 's'], ['Marca', 's'], ['Comprador', 's'], ['Disponível', 'n'], ['VendProt', 'n'], ['Falta', 'n'], ['Comprado', 'n'], ['Descoberto', 'n'], ['Entrega', 's'], ['Pedido', 's'], ['Comprar', 'n'], ['Valor', 'm']],
      rows: L.map(function (r) { return [SIT[r.st][0] + (r.sit === 'atrasada' ? ' / entrega atrasada ' + r.dias + ' d' : ''), r.codigo, r.descricao, r.marca, r.comprador, nz(r.disponivel), nz(r.vendprot), r.falta, nz(r.comprado), r.descob, r.dtentrega ? isoToBr(r.dtentrega) : '', r.pedido || '', r.comprar, r.valor]; }) };
  }
  function dsNec60(L, base) {
    return { nome: 'Necessidade_60_dias', titulo: 'Necessidade de compra para 60 dias', sub: base, resumo: [fmtInt(L.length) + ' item(ns) abaixo do ponto de pedido · ' + brl.format(DS_SOMA(L)) + ' pelo último preço'],
      cols: [['Código', 's'], ['Descrição', 's'], ['Marca', 's'], ['Comprador', 's'], ['Pto. pedido', 'n'], ['Disponível', 'n'], ['VendProt', 'n'], ['Comprado', 'n'], ['Dias de estoque', 'n'], ['Comprar', 'n'], ['Últ. preço', 'n'], ['Valor', 'm'], ['Situação', 's']],
      rows: L.map(function (r) { return [r.codigo, r.descricao, r.marca, r.comprador, nz(r.pontopedido), nz(r.disponivel), nz(r.vendprot), nz(r.comprado), nz(r.medcontr) > 0 ? Math.round(nz(r.estdias)) : '', r.comprar, nz(r.ultpreco), r.valor, (r.emRup ? 'Falta coberta' : '') + (r.sit === 'atrasada' ? (r.emRup ? ' / ' : '') + 'Entrega atrasada ' + r.dias + ' d' : '')]; }) };
  }
  function dsAtrasos(L, base) {
    return { nome: 'Entregas_a_cobrar', titulo: 'Entregas a cobrar', sub: base + ' · prazos calculados em ' + isoToBr(state.an.refDate), resumo: [fmtInt(L.length) + ' item(ns) · cobrar a Marca; antes, confirme com o recebimento se a mercadoria já chegou'],
      cols: [['Prazo', 's'], ['Marca', 's'], ['Comprador', 's'], ['Pedido', 's'], ['Código', 's'], ['Descrição', 's'], ['Falta', 'n'], ['Comprado', 'n'], ['Entrega prevista', 's'], ['Atraso (dias)', 'n'], ['Valor comprado', 'm'], ['Precisa comprar', 's']],
      rows: L.map(function (r) { return [PRAZO[r.sit][0], r.marca, r.comprador, r.pedido || '', r.codigo, r.descricao, r.emRup ? r.falta : '', nz(r.comprado), r.dtentrega ? isoToBr(r.dtentrega) : '', r.sit === 'atrasada' ? r.dias : '', nz(r.prccompra) > 0 ? r.valor : '', nz(r.comprar) > 0 ? 'Sim' : 'Não']; }) };
  }
  function dsItens(L, base, sufixo) {
    return { nome: 'Itens', titulo: 'Todos os itens do relatório', sub: base, resumo: [fmtInt(L.length) + ' item(ns)' + (sufixo == null ? ' com os filtros atuais' : sufixo)],
      cols: [['Código', 's'], ['Descrição', 's'], ['Marca', 's'], ['Comprador', 's'], ['Grupo', 's'], ['Pto. pedido', 'n'], ['Físico', 'n'], ['Disponível', 'n'], ['VendProt', 'n'], ['Ruptura', 'n'], ['Comprado', 'n'], ['Comprar', 'n'], ['Últ. preço', 'n'], ['Valor estoque', 'm'], ['Dias estoque', 'n'], ['Entrega', 's'], ['Pedido', 's']],
      rows: L.map(function (x) { var r = x.r; return [r.codigo, r.descricao, r.marca, x.comp, r.grupo || '', nz(r.pontopedido), nz(r.fisico), x.disp, nz(r.vendprot), nz(r.ruptura), nz(r.comprado), nz(r.comprar), nz(r.ultpreco), nz(r.vlrestoque), x.dias == null ? '' : Math.round(x.dias), r.dtentrega ? isoToBr(r.dtentrega) : '', r.pedido || '']; }) };
  }
  function dsDiverg(L, base) {
    var rotD = {}; DIV_TIPOS.forEach(function (t) { rotD[t[0]] = t; });
    return { nome: 'Divergencias', titulo: 'Divergências a corrigir no Protheus', sub: base, resumo: [fmtInt(L.length) + ' divergência(s) na lista'],
      cols: [['Comprador', 's'], ['Divergência', 's'], ['Código', 's'], ['Descrição', 's'], ['Marca', 's'], ['O que está diferente', 's'], ['Valor em jogo', 'm']],
      rows: L.map(function (r) { return [r.comprador, rotD[r.tipo][1], r.codigo, r.descricao, r.marca, r.detalhe, r.impacto]; }) };
  }
  function dsMoeda(mt, arg, base) {
    var gr = arg ? mt.grupos.filter(function (g) { return g.marca === arg; }) : mt.grupos, itens = [], comp = 0, val = 0;
    gr.forEach(function (g) { comp += g.compra; val += g.valor; g.itens.forEach(function (x) { itens.push([g.marca, x.comprador, x.codigo, x.descricao, x.motivo, x.fisico, x.disp, x.dias == null ? 'sem giro' : Math.round(x.dias), x.exc, x.preco, x.valor, x.comprado || '']); }); });
    return { nome: arg ? 'MoedaDeTroca_' + slug(arg) : 'MoedaDeTroca', titulo: 'Moeda de troca' + (arg ? ': ' + arg : ''), sub: base + ' · uso interno: preparação de negociação, não enviar ao fornecedor',
      resumo: [fmtInt(itens.length) + ' item(ns) em ' + fmtInt(gr.length) + ' fornecedor(es) · moeda de troca ' + brl.format(val) + (arg ? ' · compra prevista ' + brl.format(comp) + ' · pode abater ' + (comp > 0 ? Math.round(val / comp * 100) + '%' : '-') : ''),
        'Critérios: ponto de pedido zero com estoque' + (state.mt.ppZero ? '' : ' (desligado)') + (state.mt.modo === 'ambos' ? ' e ' : ' ou ') + 'estoque acima de ' + state.mt.dias + ' dias. Valor do excedente pelo último preço.'],
      cols: [['Fornecedor (Marca)', 's'], ['Comprador', 's'], ['Código', 's'], ['Descrição', 's'], ['Motivo', 's'], ['Físico', 'n'], ['Disponível', 'n'], ['Dias de estoque', 'n'], ['Qtd. excedente', 'n'], ['Últ. preço', 'n'], ['Valor do excedente', 'm'], ['Comprado em aberto', 'n']], rows: itens,
      extra: [['Por fornecedor', [['Fornecedor (Marca)', 'Compradores', 'Itens', 'Moeda de troca (R$)', 'Compra prevista (R$)']].concat(gr.map(function (g) { return [g.marca, Object.keys(g.comps).join(', '), g.itens.length, r2(g.valor), r2(g.compra)]; })), [30, 30, 8, 18, 18]]] };
  }
  function dadosLista(pg, arg) {
    var an = state.an, base = 'Relatório de ' + isoToBr(an.refDate) + ' · ' + visaoRotulo();
    switch (pg) {
      case 'rupturas': return dsRupturas((state.shown && state.shown.imin) || [], base);
      case 'nec60': return dsNec60((state.shown && state.shown.repAll) || [], base);
      case 'atrasos': return dsAtrasos(state.shownEnt || [], base);
      case 'todos': return dsItens(tdLista(), base);
      case 'divergencias': return dsDiverg(divFiltrada(), base);
      case 'moeda': return dsMoeda(moedaCalc(), arg, base);
    }
    return null;
  }

  /* ---------- Pedidos bloqueados: PDF e Excel ---------- */
  function bloqDataset(V, sc, refRel) {
    var mt = monMeta(), rot = sc ? relRotulo(sc) : visaoRotulo().toLowerCase();
    return { titulo: 'Pedidos bloqueados por falta de material', V: V, sc: sc,
      sub: 'Monitor de Estoque de ' + isoToBr(mt.refAt) + ' × necessidades de ' + isoToBr(refRel) + ' · ' + rot,
      arq: 'RV_Necessidades_Pedidos_bloqueados_' + (sc ? relArq(sc) : (viewComp() === 'todos' ? 'Geral' : slug(viewComp()))) + '_' + mt.refAt,
      resumo: [fmtInt(V.nProd) + ' produto(s) com pedido bloqueado · ' + fmtInt(V.nPed) + ' pedido(s) de venda · ' + fmtInt(V.nLin) + ' item(ns) de pedido' + (CFG.pode.clienteValor ? ' · valor bloqueado ' + brl.format(V.valor) : ''),
        'Só linhas com Situação Estoque = Bloqueado.' + (CFG.pode.clienteValor ? ' Valor bloqueado = valor do item × quantidade bloqueada ÷ quantidade do item (o Monitor repete o valor do item em cada linha).' : '') + ' Atraso como vem no Monitor.'] };
  }
  function bloqLinhaXlsx(P, L) {
    var m = L.m, r = P.r;
    return [P.codigo, P.descricao, P.marca, P.comprador, BQ_CLASSES[P.classe][0], r ? nz(r.comprar) : '', P.disp == null ? '' : P.disp, r ? nz(r.vendprot) : '', r ? nz(r.ruptura) : '', r ? nz(r.comprado) : '', r && r.dtentrega ? isoToBr(r.dtentrega) : '', r ? (r.pedido || '') : '',
      m.pedido, m.item, m.codcliente, m.loja, m.cliente, L.qtd, L.qItem, L.vItem, r2(L.vBloq), isoToBr(m.datafat), m.atraso == null ? '' : m.atraso, isoToBr(m.datapcp), m.op, m.transp, m.liberacao, m.situacao, m.credito, m.arte, m.grupo, m.subgrupo, m.familia, m.tipo, m.nota,
      L.itensBloq, L.itensTot];
  }
  function bloqXlsx(d) {
    var V = d.V, produtos = [['Código', 'Descrição', 'Marca', 'Comprador', 'Situação da necessidade', 'Comprar', 'Disponível', 'VendProt', 'Ruptura', 'Comprado', 'Entrega prevista (fornecedor)', 'Pedido de compra', 'Últ. preço',
      'Pedidos de venda bloqueados', 'Itens de pedido', 'Qtd. bloqueada', 'Valor bloqueado', 'Data de faturamento mais antiga', 'Maior atraso (dias)']];
    var linhas = [['Código', 'Descrição', 'Marca', 'Comprador', 'Situação da necessidade', 'Comprar', 'Disponível', 'VendProt', 'Ruptura', 'Comprado', 'Entrega prevista (fornecedor)', 'Pedido de compra',
      'Pedido de venda', 'Item', 'Cód. cliente', 'Loja', 'Cliente', 'Qtd. bloqueada', 'Qtd. do item', 'Valor do item', 'Valor bloqueado', 'Data Faturamento', 'Atraso (dias)', 'Data PCP', 'OP', 'Transportadora', 'Liberação', 'Situação Estoque',
      'Crédito', 'Arte', 'Grupo', 'Subgrupo', 'Família', 'Tipo', 'Nota/Série', 'Itens bloqueados no pedido', 'Itens do pedido']];
    V.prods.forEach(function (P) {
      var r = P.r, datas = P.lin.map(function (L) { return L.m.datafat; }).filter(Boolean).sort(), at = P.lin.map(function (L) { return L.m.atraso; }).filter(function (x) { return x != null; });
      produtos.push([P.codigo, P.descricao, P.marca, P.comprador, BQ_CLASSES[P.classe][0], r ? nz(r.comprar) : '', P.disp == null ? '' : P.disp, r ? nz(r.vendprot) : '', r ? nz(r.ruptura) : '', r ? nz(r.comprado) : '', r && r.dtentrega ? isoToBr(r.dtentrega) : '', r ? (r.pedido || '') : '', r ? nz(r.ultpreco) : '',
        P.nPed, P.lin.length, P.qtd, r2(P.valor), datas.length ? isoToBr(datas[0]) : '', at.length ? Math.max.apply(null, at) : '']);
      P.lin.forEach(function (L) { linhas.push(bloqLinhaXlsx(P, L)); });
    });
    var resumo = [['RV Necessidades - ' + d.titulo], [d.sub], ['']].concat(d.resumo.map(function (t) { return [t]; }));
    var larg1 = [12, 46, 22, 16, 28, 10, 11, 10, 10, 10, 18, 16, 11, 12, 10, 12, 16, 18, 12];
    var larg2 = [12, 40, 22, 16, 28, 10, 11, 10, 10, 10, 18, 16, 12, 6, 10, 6, 40, 12, 12, 14, 14, 14, 10, 12, 10, 30, 18, 14, 10, 6, 8, 8, 8, 6, 14, 10, 10];
    if (!CFG.pode.clienteValor) {   // sem permissão de cliente e valor, essas colunas não vão no arquivo
      var tira = function (tab, larg, nomes) {
        var idx = tab[0].map(function (h, i) { return nomes.indexOf(h) >= 0 ? -1 : i; }).filter(function (i) { return i >= 0; });
        return [tab.map(function (l) { return idx.map(function (i) { return l[i]; }); }), idx.map(function (i) { return larg[i]; })];
      };
      var t1 = tira(produtos, larg1, ['Valor bloqueado']), t2 = tira(linhas, larg2, ['Cód. cliente', 'Loja', 'Cliente', 'Valor do item', 'Valor bloqueado']);
      produtos = t1[0]; larg1 = t1[1]; linhas = t2[0]; larg2 = t2[1];
    }
    return baixarXlsx(d.arq + '.xlsx', [['Resumo', resumo, [120]], ['Por produto', produtos, larg1], ['Pedidos bloqueados', linhas, larg2]]) ? d.arq + '.xlsx' : '';
  }
  function bloqPdf(d) {
    var JsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!JsPDF) throw new Error('A biblioteca de PDF não carregou. Recarregue a página e tente de novo.');
    var V = d.V, CV = CFG.pode.clienteValor, CAP = 6000, nL = 0, trunc = false, doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 30, NAVY = [15, 42, 92], BLUE = [27, 77, 177], INK = [20, 25, 34], GREY = [90, 101, 119];
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]); doc.rect(0, 0, W, 56, 'F');
    var lg = logoInfo();
    if (lg) { try { var lh = 34, lw = Math.round(lh * lg.ratio), pad = 6, px = W - M - lw - pad * 2, py = (56 - (lh + pad * 2)) / 2; doc.setFillColor(255, 255, 255); doc.roundedRect(px, py, lw + pad * 2, lh + pad * 2, 4, 4, 'F'); doc.addImage(lg.src, 'PNG', px + pad, py + pad, lw, lh); } catch (e) { /* sem logo */ } }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(255, 255, 255); doc.text('RV Necessidades - ' + d.titulo, M, 26);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(d.sub + ' · gerado em ' + new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }), M, 44);
    var y = 74; doc.setFontSize(9); doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(d.resumo[0], M, y); y += 12; doc.setFontSize(7.5); doc.setTextColor(GREY[0], GREY[1], GREY[2]); doc.text(d.resumo[1], M, y); y += 8;
    var body = [];
    V.prods.forEach(function (P) {
      if (nL >= CAP) { trunc = true; return; }
      var cl = BQ_CLASSES[P.classe];
      body.push([{ content: P.codigo + '  ' + P.descricao + (P.marca ? '  |  Marca: ' + P.marca : '') + (P.comprador ? '  |  Comprador: ' + P.comprador : '') + '  |  ' + cl[0] + '\n' + bloqNecTxt(P) + '\n' + fmtInt(P.nPed) + ' pedido(s) de venda · qtd ' + fmtNum(P.qtd) + (CV ? ' · ' + brl.format(P.valor) : ''),
        colSpan: CV ? 12 : 10, styles: { fillColor: [228, 236, 250], textColor: INK, fontStyle: 'bold', fontSize: 7.6, cellPadding: 3 } }]);
      P.lin.forEach(function (L) {
        if (nL >= CAP) { trunc = true; return; }
        nL++;
        var m = L.m;
        body.push(CV ? [m.pedido, m.item, m.cliente, fmtNum(L.qtd), brl.format(L.vBloq), isoToBr(m.datafat), m.atraso == null ? '' : fmtInt(m.atraso), isoToBr(m.datapcp), m.op, fmtInt(L.itensBloq) + ' de ' + fmtInt(L.itensTot), m.transp, m.arte]
          : [m.pedido, m.item, fmtNum(L.qtd), isoToBr(m.datafat), m.atraso == null ? '' : fmtInt(m.atraso), isoToBr(m.datapcp), m.op, fmtInt(L.itensBloq) + ' de ' + fmtInt(L.itensTot), m.transp, m.arte]);
      });
    });
    if (trunc) { doc.text('O PDF traz as primeiras ' + fmtInt(CAP) + ' linhas: use filtros ou o Excel para ver todas.', M, y); y += 8; }
    var auto = function (o) { if (doc.autoTable) doc.autoTable(o); else window.jspdf.autoTable(doc, o); };
    if (!body.length) { doc.setFontSize(10); doc.setTextColor(INK[0], INK[1], INK[2]); doc.text('Nenhum pedido bloqueado nesta visão.', M, y + 18); }
    else auto({
      startY: y + 4, head: [CV ? ['Pedido', 'Item', 'Cliente', 'Qtd. bloq.', 'Valor bloq.', 'Data Fat.', 'Atraso', 'Data PCP', 'OP', 'Itens bloq.', 'Transportadora', 'Arte'] : ['Pedido', 'Item', 'Qtd. bloq.', 'Data Fat.', 'Atraso', 'Data PCP', 'OP', 'Itens bloq.', 'Transportadora', 'Arte']], body: body,
      margin: { left: M, right: M, top: 30, bottom: 36 },
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 2.2, overflow: 'linebreak', lineColor: [216, 221, 229], lineWidth: 0.4, textColor: INK },
      headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' }, columnStyles: CV ? { 2: { cellWidth: 150 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 6: { halign: 'right' }, 9: { halign: 'right' }, 10: { cellWidth: 110 } } : { 2: { halign: 'right' }, 4: { halign: 'right' }, 7: { halign: 'right' }, 8: { cellWidth: 110 } }
    });
    var n = doc.internal.getNumberOfPages();
    for (var i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(GREY[0], GREY[1], GREY[2]); doc.text('RV Necessidades - ' + d.titulo + ' - uso interno e confidencial', M, H - 16); doc.text('Página ' + i + ' de ' + n, W - M, H - 16, { align: 'right' }); }
    return { doc: doc, name: d.arq + '.pdf' };
  }
  function bloqExportar(tipo, o) {
    var rm = currentMeta(), V = bloqVista(o);
    if (!V || !rm) { flash('Importe o Monitor de Estoque para gerar este relatório.', true); return; }
    var d = bloqDataset(V, o.rel ? o.sc : null, String(rm.refAt).slice(0, 10));
    try {
      if (tipo === 'pdf') { var r = bloqPdf(d); r.doc.save(r.name); flash('PDF gerado: ' + r.name + '. Procure na pasta de downloads do navegador.'); }
      else { var nm = bloqXlsx(d); if (nm) flash('Excel gerado: ' + nm + ' (' + fmtInt(V.nLin) + ' linha(s)). Procure na pasta de downloads do navegador.'); }
    } catch (e) { flash('Não foi possível gerar o arquivo: ' + (e && e.message ? e.message : e), true); }
  }

  function baixarPdfLista(d) {
    var JsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!JsPDF) throw new Error('A biblioteca de PDF não carregou. Recarregue a página e tente de novo.');
    var CAP = d.cap || 2500, truncou = d.rows.length > CAP, rows = d.rows.slice(0, CAP);
    var doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 30;
    var NAVY = [15, 42, 92], BLUE = [27, 77, 177], INK = [20, 25, 34], GREY = [90, 101, 119];
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]); doc.rect(0, 0, W, 56, 'F');
    var lg = logoInfo();
    if (lg) { try { var lh = 34, lw = Math.round(lh * lg.ratio), pad = 6, px = W - M - lw - pad * 2, py = (56 - (lh + pad * 2)) / 2; doc.setFillColor(255, 255, 255); doc.roundedRect(px, py, lw + pad * 2, lh + pad * 2, 4, 4, 'F'); doc.addImage(lg.src, 'PNG', px + pad, py + pad, lw, lh); } catch (e) { /* sem logo */ } }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(255, 255, 255); doc.text('RV Necessidades - ' + d.titulo, M, 26);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(d.sub + ' · gerado em ' + new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }), M, 44);
    var y = 74;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(INK[0], INK[1], INK[2]);
    (d.resumo || []).forEach(function (t) { doc.text(String(t), M, y); y += 12; });
    doc.setFontSize(7.5); doc.setTextColor(GREY[0], GREY[1], GREY[2]);
    doc.text('Uso interno e confidencial.' + (truncou ? ' O PDF traz os primeiros ' + fmtInt(CAP) + ' de ' + fmtInt(d.rows.length) + ' itens: use filtros ou o Excel para ver todos.' : ''), M, y); y += 8;
    var cols = {}, nome = function (i) { return d.cols[i][0]; };
    d.cols.forEach(function (c, i) { if (c[1] !== 's') cols[i] = { halign: 'right' }; else if (/Descri/.test(c[0])) cols[i] = { cellWidth: 150 }; });
    var fmt = function (v, t) { return v === '' || v == null ? '' : t === 'm' ? brl.format(nz(v)) : t === 'n' && typeof v === 'number' ? fmtNum(v) : String(v); };
    var auto = function (o) { if (doc.autoTable) doc.autoTable(o); else window.jspdf.autoTable(doc, o); };
    if (!rows.length) { doc.setFontSize(10); doc.text('Nenhum item com os filtros atuais.', M, y + 18); }
    else auto({
      startY: y + 4, head: [d.cols.map(function (c) { return c[0]; })], body: rows.map(function (r) { return r.map(function (v, i) { return fmt(v, d.cols[i][1]); }); }),
      margin: { left: M, right: M, top: 30, bottom: 36 },
      styles: { font: 'helvetica', fontSize: d.cols.length > 12 ? 6.4 : 7.4, cellPadding: 2.2, overflow: 'linebreak', lineColor: [216, 221, 229], lineWidth: 0.4, textColor: INK },
      headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' }, columnStyles: cols
    });
    var n = doc.internal.getNumberOfPages();
    for (var i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(GREY[0], GREY[1], GREY[2]); doc.text('RV Necessidades - ' + d.titulo + ' - uso interno e confidencial', M, H - 16); doc.text('Página ' + i + ' de ' + n, W - M, H - 16, { align: 'right' }); }
    return { doc: doc, name: (d.arq || 'RV_Necessidades_' + d.nome + '_' + (viewComp() === 'todos' ? 'Geral' : slug(viewComp())) + '_' + state.an.refDate) + '.pdf' };
  }
  function baixarXlsxLista(d) {
    var cab = d.cols.map(function (c) { return c[0]; }), larg = d.cols.map(function (c) { return /Descri/.test(c[0]) ? 46 : /O que|Motivo|Diverg/.test(c[0]) ? 40 : Math.max(10, Math.min(24, c[0].length + 3)); });
    var abas = [];
    if (d.resumo && d.resumo.length) abas.push(['Resumo', [['RV Necessidades - ' + d.titulo], [d.sub]].concat(d.resumo.map(function (t) { return [t]; })), [110]]);
    abas.push(['Lista', [cab].concat(d.rows), larg]);
    (d.extra || []).forEach(function (x) { abas.push(x); });
    var nome = (d.arq || 'RV_Necessidades_' + d.nome + '_' + (viewComp() === 'todos' ? 'Geral' : slug(viewComp())) + '_' + state.an.refDate) + '.xlsx';
    return baixarXlsx(nome, abas) ? nome : '';
  }
  function exportarLista(tipo, pg, arg) {
    pg = pg || state.page;
    if (pg === 'bloqueados') { bloqExportar(tipo, { sc: bloqEscopoPagina(), modo: state.bq.modo, q: state.bq.q }); return; }
    var d = dadosLista(pg, arg || '');
    if (!d) return;
    try {
      if (tipo === 'pdf') { var r = baixarPdfLista(d); r.doc.save(r.name); flash('PDF gerado: ' + r.name + '. Procure na pasta de downloads do navegador.'); }
      else if (pg === 'moeda') { exportarMoeda(arg || ''); }
      else { var nm = baixarXlsxLista(d); if (nm) flash('Excel gerado: ' + nm + ' (' + fmtInt(d.rows.length) + ' linha(s)). Procure na pasta de downloads do navegador.'); }
    } catch (e) { flash('Não foi possível gerar o arquivo: ' + (e && e.message ? e.message : e), true); }
  }



  /* ---------- página Pedidos bloqueados ---------- */
  function bloqVazio() {
    return '<div class="empty"><h2>Nenhum Monitor de Estoque importado</h2><p>Esta página cruza o <b>Monitor de Estoque</b> (pedidos de venda) com as <b>necessidades de compra</b>: para cada produto em ruptura ou com necessidade, mostra os pedidos de venda que estão bloqueados esperando esse material. Importe o arquivo do Monitor para começar.</p>' +
      (CFG.pode.importarMonitor ? '<div class="monctl">' + (state.monPedeData ? '<label class="inl" for="monRef">Data do Monitor</label><input type="date" id="monRef"> ' : '') + '<button type="button" class="btn" data-mon-pick>Importar Monitor de Estoque</button></div>' : '<p>Peça à gerência para importar o Monitor de Estoque do dia.</p>') + '</div>' +
      (state.monMsg ? '<div class="status ' + state.monMsg.kind + '" role="status">' + state.monMsg.html + '</div>' : '');
  }
  function bloqTh() {
    var CV = CFG.pode.clienteValor;
    return thS('bl', 'p', 'Pedido') + thS('bl', 'i', 'Item') + (CV ? thS('bl', 'cl', 'Cliente') : '') + thS('bl', 'qb', 'Qtd. bloqueada', 'num') + (CV ? thS('bl', 'vb', 'Valor bloqueado', 'num') : '') + thS('bl', 'df', 'Data Faturamento') +
      thS('bl', 'at', 'Atraso (dias)', 'num') + thS('bl', 'pc', 'Data PCP') + thS('bl', 'op', 'OP') + thS('bl', 'ib', 'Itens bloqueados no pedido', 'num');
  }
  function renderBloqueados() {
    var mt = monMeta(), V0 = bloqCalc(), gest = CFG.pode.importarMonitor, CV = CFG.pode.clienteValor, nc = CV ? 10 : 8;
    if (!state.mons.length || !state.monRows || !mt || !V0) { $('#panel').innerHTML = bloqVazio(); return; }
    var rvMeta = currentMeta(), dif = rvMeta ? daysBetween(String(rvMeta.refAt).slice(0, 10), mt.refAt) : 0;
    $('#panel').innerHTML =
      '<details class="como"><summary>Como ler esta tela</summary><p class="note">Cruza o <b>Monitor de Estoque</b> (pedidos de venda) com as <b>necessidades de compra</b>, pelo código do produto. Só entram as linhas de pedido com <b>Situação Estoque = Bloqueado</b>. Cada produto traz, no cabeçalho, a necessidade de compra (Comprar, Disponível, VendProt, Falta, Comprado, entrega e pedido de compra) e, abaixo, os pedidos de venda que esperam esse material. O Monitor repete o <b>valor do item</b> em cada linha do mesmo item; por isso o <b>Valor bloqueado</b> é calculado proporcionalmente (valor do item &times; quantidade bloqueada &divide; quantidade do item). <b>Atraso</b> é o que vem no Monitor. Itens com necessidade e pedido bloqueado são os que mais travam vendas: comece pelas rupturas sem compra.</p></details>' +
      '<div class="tb1 monbar"><label class="inl" for="monSel">Monitor de Estoque</label><select id="monSel">' + state.mons.map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === state.monId ? ' selected' : '') + '>' + esc(isoToBr(m.refAt)) + (m.bloqueadas != null ? ' · ' + fmtInt(m.bloqueadas) + ' bloqueadas' : '') + ' · importado às ' + esc(new Date(m.importedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })) + '</option>'; }).join('') + '</select>' +
      (gest ? (state.monPedeData ? '<label class="inl" for="monRef">Data do Monitor</label><input type="date" id="monRef"> ' : '') + '<button type="button" class="btn ghost" data-mon-pick>Importar outro Monitor</button>' + (CFG.pode.excluir ? '<button type="button" class="btn ghost mini danger" id="monDel">' + (state.monConfirmDel ? 'Confirmar exclusão' : 'Excluir este Monitor') + '</button>' + (state.monConfirmDel ? '<button type="button" class="btn ghost mini" id="monDelNo">Cancelar</button>' : '') : '') : '') +
      '<span class="note cnt">' + (mt.linhas != null ? fmtInt(mt.linhas) + ' linhas · ' + fmtInt(mt.pedidos) + ' pedidos bloqueados' : '') + '</span></div>' +
      (state.monMsg ? '<div class="status ' + state.monMsg.kind + '" role="status">' + state.monMsg.html + '</div>' : '') +
      (dif ? '<div class="note"><span class="chip warn">Datas diferentes</span> O Monitor é de ' + esc(isoToBr(mt.refAt)) + ' e as necessidades são de ' + esc(isoToBr(String(rvMeta.refAt).slice(0, 10))) + ' (' + Math.abs(dif) + ' dia(s)). Importe o relatório de necessidades da mesma data para o cruzamento ficar exato.</div>' : '') +
      '<div class="tb1"><div class="searchbox"><input type="search" id="bq" placeholder="Buscar por código, descrição, Marca, cliente ou nº do pedido" aria-label="Buscar" value="' + esc(state.bq.q) + '"></div>' + filtrosBtn('bl') +
      '<select id="bqModo" aria-label="Mostrar">' + opt('nec', 'Mostrar: com necessidade ou ruptura', state.bq.modo) + opt('rup', 'Só rupturas', state.bq.modo) + opt('rep', 'Só necessidade 60 dias', state.bq.modo) + opt('sem', 'Sem necessidade de compra ou fora do relatório', state.bq.modo) + '</select>' + menuExport() + '</div>' +
      '<div class="kpis" id="bqKpis"></div><div class="note" id="bqInfo"></div>' +
      '<div class="tablewrap scroll"><table><thead><tr>' + bloqTh() + '</tr>' + hfRow('bl', nc) + '</thead><tbody id="rowsB"></tbody></table></div>';
    renderBloqRows();
  }
  function renderBloqRows() {
    var V = bloqVista({ sc: bloqEscopoPagina(), modo: state.bq.modo, q: state.bq.q }), el = $('#rowsB');
    if (!V || !el) return;
    var lista = [], CAP = 1500, CV = CFG.pode.clienteValor, nc = CV ? 10 : 8;
    V.prods.forEach(function (P) { P.lin.forEach(function (L) { lista.push(L); }); });
    var shown = lista.slice(0, CAP), porCod = {};
    V.prods.forEach(function (P) { porCod[P.codigo] = P; });
    el.innerHTML = shown.length ? groupedRows(shown, nc, function (L) {
      var m = L.m;
      return '<tr><td class="code">' + esc(m.pedido) + '</td><td class="code">' + esc(m.item) + '</td>' + (CV ? '<td class="desc">' + esc(m.cliente) + '</td>' : '') + '<td class="num"><b>' + fmtNum(L.qtd) + '</b></td>' + (CV ? '<td class="num">' + brl.format(L.vBloq) + '</td>' : '') +
        '<td>' + esc(isoToBr(m.datafat)) + '</td><td class="num">' + (m.atraso == null ? '' : fmtInt(m.atraso)) + '</td><td>' + esc(isoToBr(m.datapcp)) + '</td><td class="code">' + esc(m.op) + '</td><td class="num">' + fmtInt(L.itensBloq) + ' de ' + fmtInt(L.itensTot) + '</td></tr>';
    }, true, function (L) { return L.codigo; }, function (cod) {
      var P = porCod[cod], cl = BQ_CLASSES[P.classe];
      return '<div class="bl-h"><b>' + esc(P.codigo) + '</b><span>' + esc(P.descricao) + '</span>' + (P.marca ? '<span class="k">Marca <b>' + esc(P.marca) + '</b></span>' : '') + (P.comprador ? '<span class="k">Comprador <b>' + esc(P.comprador) + '</b></span>' : '') +
        '<span class="chip ' + cl[1] + '">' + esc(cl[0]) + '</span><span class="k">' + esc(bloqNecTxt(P)) + '</span><span class="k"><b>' + fmtInt(P.nPed) + '</b> pedido(s) · qtd <b>' + fmtNum(P.qtd) + '</b>' + (CV ? ' · <b>' + brl.format(P.valor) + '</b>' : '') + '</span></div>';
    }) : '<tr class="empty-row"><td colspan="' + nc + '">Nenhum pedido bloqueado nesta visão.</td></tr>';
    $('#bqKpis').innerHTML = kpi('Produtos', fmtInt(V.nProd), 'com pedido bloqueado nesta visão', '') + kpi('Pedidos de venda', fmtInt(V.nPed), 'bloqueados esperando material', V.nPed ? 'warn' : '') +
      kpi('Itens de pedido', fmtInt(V.nLin), 'linhas bloqueadas', '') + (CV ? kpi('Valor bloqueado', brl.format(V.valor), 'proporcional à quantidade bloqueada', '') : '');
    $('#bqInfo').textContent = (lista.length > CAP ? 'Mostrando ' + fmtInt(CAP) + ' de ' + fmtInt(lista.length) + ' linhas; o PDF e o Excel levam todas. ' : '') +
      (state.bq.modo !== 'sem' ? 'Rupturas do relatório de necessidades sem nenhum pedido bloqueado: ' + fmtInt(V.rupSemPedido) + '.' : '');
    hfBarraBl();
  }
  function hfBarraBl() { var tg = document.querySelector('[data-ft-toggle]'), bt = document.querySelector('[data-hf-clear="bl"]'), n = hfAtivo('bl') ? 1 : 0; if (bt) bt.hidden = !n; if (tg) tg.setAttribute('aria-pressed', String(!!state.ftOpen || n > 0)); }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-mon-pick]')) { var f = $('#monFile'); if (f) f.click(); return; }
    if (e.target.closest && e.target.closest('#monDel')) {
      if (!state.monConfirmDel) { state.monConfirmDel = true; renderPage(); return; }
      var id = state.monId; state.monConfirmDel = false;
      apiFetch(CFG.urls.monitor + '/' + id + '/excluir', { method: 'POST' }).then(carregaEstado).then(function () { return monCarrega(state.mons[0] ? state.mons[0].id : null); })
        .then(function () { state.monMsg = null; renderPage(); renderMenu(); }, function (er) { state.monMsg = { kind: 'err', html: esc(er.message) }; renderPage(); });
      return;
    }
    if (e.target.closest && e.target.closest('#monDelNo')) { state.monConfirmDel = false; renderPage(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'monFile' && t.files && t.files[0]) importMonitor(t.files[0]);
    else if (t.id === 'monSel') monCarrega(t.value).then(function () { state.monMsg = null; state.monConfirmDel = false; renderPage(); renderMenu(); });
    else if (t.id === 'bqModo') { state.bq.modo = t.value; renderBloqRows(); }
  });
  document.addEventListener('input', function (e) { if (e.target.id === 'bq') { state.bq.q = e.target.value; renderBloqRows(); } });

  /* ---------- Relatórios: pedido de relatórios em PDF e Excel, por comprador e/ou fornecedor (Marca) ---------- */
  function relEstado() { if (!state.rel) state.rel = { comp: 'todos', marca: '' }; return state.rel; }
  function relRows() { var rows = state.rowsAll || []; return ehGestor() ? rows : rows.filter(ehDoComprador); }
  function relMarcas() {
    var o = {};
    relRows().forEach(function (r) { if (r.marca) o[r.marca] = 1; });
    return Object.keys(o).sort(function (a, b) { return norm(a) < norm(b) ? -1 : 1; });
  }
  function relCompradores() { return ehGestor() ? (state.anFull || state.an).exportBuyers.map(function (g) { return g.nome; }) : [state.user.nome]; }
  function relEscopo() {
    var e = relEstado(), marca = String(e.marca || '').trim(), exata = '';
    if (marca) relMarcas().forEach(function (m) { if (norm(m) === norm(marca)) exata = m; });
    return { comp: ehGestor() ? (e.comp || 'todos') : state.user.nome, marca: marca, exata: exata };
  }
  function relPasse(r, esc) {
    if (esc.comp !== 'todos' && (r.comprador || '(sem comprador)') !== esc.comp) return false;
    if (esc.marca) {
      var nm = norm(r.marca || '');
      if (esc.exata ? nm !== norm(esc.exata) : nm.indexOf(norm(esc.marca)) < 0) return false;
    }
    return true;
  }
  function relRotulo(esc) {
    var p = [esc.comp === 'todos' ? 'todos os compradores' : 'comprador ' + esc.comp];
    if (esc.marca) p.push(esc.exata ? 'fornecedor (Marca) ' + esc.exata : 'Marca contendo "' + esc.marca + '"');
    return p.join(' · ');
  }
  function relArq(esc) {
    var p = [esc.comp === 'todos' ? '' : slug(esc.comp), esc.marca ? slug(esc.exata || esc.marca) : ''].filter(Boolean);
    return p.length ? p.join('_') : 'Geral';
  }
  // listas completas dentro do escopo (independem da chave Geral | Por comprador)
  function relListas(esc) {
    var an = state.anFull || state.an, ord = an.order || {}, f = function (r) { return relPasse(r, esc); };
    var oc = function (a, b) { var x = ord[a.comprador], y = ord[b.comprador]; return (x == null ? 1e9 : x) - (y == null ? 1e9 : y); };
    var porValor = function (a, b) { return oc(a, b) || b.valor - a.valor; };
    var rup = an.imin.filter(f).sort(porValor), rep = an.rep.filter(f).sort(porValor);
    var itens = tdBase().filter(function (x) { return (ehGestor() || ehDoComprador(x.r)) && f(x.r); }).sort(function (a, b) { return a.comp < b.comp ? -1 : a.comp > b.comp ? 1 : a.r.codigo < b.r.codigo ? -1 : 1; });
    var mt = moedaCalc({ rows: relRows().filter(f), plan: rup.concat(rep) });
    var gm = {};
    an.ent.filter(f).forEach(function (r) {
      var k = r.marca || '(sem marca)', g = gm[k] || (gm[k] = { k: k, items: [], late: 0, rup: 0 });
      g.items.push(r); if (r.sit === 'atrasada') g.late++; if (r.emRup) g.rup++;
    });
    var ent = [].concat.apply([], Object.keys(gm).map(function (k) { return gm[k]; })
      .sort(function (a, b) { return b.late - a.late || b.rup - a.rup || b.items.length - a.items.length || (a.k < b.k ? -1 : 1); })
      .map(function (g) { return g.items.sort(entCmp); }));
    var div = (an.div || []).filter(function (r) { return f(r) && !DIV_INFO[r.tipo] && (r.tipo !== 'pp' || r.nec); })
      .sort(function (a, b) { return a.comprador < b.comprador ? -1 : a.comprador > b.comprador ? 1 : b.impacto - a.impacto; });
    return { rup: rup, rep: rep, itens: itens, mt: mt, ent: ent, div: div };
  }
  function relDs(id, L, esc) {
    var base = 'Relatório de ' + isoToBr(state.an.refDate) + ' · ' + relRotulo(esc), d;
    if (id === 'rup') d = dsRupturas(L.rup, base);
    else if (id === 'rep') d = dsNec60(L.rep, base);
    else if (id === 'itens') d = dsItens(L.itens, base, '');
    else if (id === 'mt') d = dsMoeda(L.mt, '', base);
    else if (id === 'ent') d = dsAtrasos(L.ent, base);
    else d = dsDiverg(L.div, base);
    d.cap = 6000; d.aba = REL_ABAS[id];
    return d;
  }
  var REL_ABAS = { rup: 'Rupturas', rep: 'Compra 60 dias', itens: 'Itens', mt: 'Moeda de troca', ent: 'Entregas a cobrar', div: 'Divergências' };
  var REL = [
    { grupo: 'Pedidos principais' },
    { id: 'comp', nome: 'Por comprador (completo)', desc: 'Rupturas, compra 60 dias, todos os itens e moeda de troca do comprador, em um só arquivo.', partes: ['rup', 'rep', 'itens', 'mt'], arq: 'Comprador', pacote: 1 },
    { id: 'rup', nome: 'Rupturas', desc: 'Itens em ruptura sem compra que cubra a falta.' },
    { id: 'rep', nome: 'Compra 60 dias', desc: 'Itens abaixo do ponto de pedido, com a quantidade a comprar.' },
    { id: 'itens', nome: 'Todos os itens', desc: 'Lista completa dos itens do relatório.' },
    { id: 'mt', nome: 'Itens de troca', desc: 'Excesso de estoque para negociar devolução. Usa os critérios da página Moeda de troca.' },
    { grupo: 'Outros relatórios' },
    { id: 'forn', nome: 'Por fornecedor (completo)', desc: 'Rupturas, compra 60 dias, entregas a cobrar, moeda de troca e todos os itens da Marca, para preparar a conversa com o fornecedor.', partes: ['rup', 'rep', 'ent', 'mt', 'itens'], arq: 'Fornecedor', pacote: 1, exigeMarca: 1 },
    { id: 'bloq', nome: 'Pedidos bloqueados', desc: 'Para cada produto com necessidade ou ruptura, os pedidos de venda bloqueados no Monitor de Estoque que esperam esse material.' },
    { id: 'ent', nome: 'Entregas a cobrar', desc: 'Compras feitas e ainda não recebidas, por Marca, com o prazo.' },
    { id: 'div', nome: 'Divergências a corrigir', desc: 'O que precisa ser acertado no Protheus, por comprador.' }
  ];
  function relContagem(def, L) {
    var v = function (l) { return fmtInt(l.length) + ' · ' + brl.format(DS_SOMA(l)); };
    switch (def.id) {
      case 'rup': return { n: L.rup.length, t: v(L.rup) };
      case 'rep': return { n: L.rep.length, t: v(L.rep) };
      case 'itens': return { n: L.itens.length, t: fmtInt(L.itens.length) };
      case 'mt': return { n: L.mt.itens.length, t: fmtInt(L.mt.itens.length) + ' · ' + brl.format(L.mt.total) };
      case 'ent': return { n: L.ent.length, t: fmtInt(L.ent.length) };
      case 'div': return { n: L.div.length, t: fmtInt(L.div.length) };
    }
    var n = def.partes.reduce(function (t, p) { return t + relContagem({ id: p }, L).n; }, 0);
    return { n: n, t: def.partes.map(function (p) { return REL_ABAS[p] + ' ' + fmtInt(relContagem({ id: p }, L).n); }).join(' · ') };
  }

  function relPacoteDados(def, esc, L) {
    var nome = def.id === 'comp' ? (esc.comp === 'todos' ? 'Relatório por comprador' : 'Relatório por comprador: ' + esc.comp) : 'Relatório por fornecedor: ' + (esc.exata || esc.marca);
    return { titulo: nome, sub: 'Relatório de ' + isoToBr(state.an.refDate) + ' · ' + relRotulo(esc), arq: 'RV_Necessidades_' + def.arq + '_' + relArq(esc) + '_' + state.an.refDate,
      secoes: def.partes.map(function (p) { return relDs(p, L, esc); }) };
  }
  function relPdfPacote(p) {
    var JsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!JsPDF) throw new Error('A biblioteca de PDF não carregou. Recarregue a página e tente de novo.');
    var doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 30;
    var NAVY = [15, 42, 92], BLUE = [27, 77, 177], INK = [20, 25, 34], GREY = [90, 101, 119];
    var auto = function (o) { if (doc.autoTable) doc.autoTable(o); else window.jspdf.autoTable(doc, o); };
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]); doc.rect(0, 0, W, 56, 'F');
    var lg = logoInfo();
    if (lg) { try { var lh = 34, lw = Math.round(lh * lg.ratio), pad = 6, px = W - M - lw - pad * 2, py = (56 - (lh + pad * 2)) / 2; doc.setFillColor(255, 255, 255); doc.roundedRect(px, py, lw + pad * 2, lh + pad * 2, 4, 4, 'F'); doc.addImage(lg.src, 'PNG', px + pad, py + pad, lw, lh); } catch (e) { /* sem logo */ } }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(255, 255, 255); doc.text('RV Necessidades - ' + p.titulo, M, 26);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(p.sub + ' · gerado em ' + new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }), M, 44);
    var y = 82;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(INK[0], INK[1], INK[2]); doc.text('Conteúdo', M, y); y += 16;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    p.secoes.forEach(function (d, i) { doc.text((i + 1) + '. ' + d.titulo + ': ' + (d.rows.length ? d.resumo[0] : 'nenhum item'), M, y); y += 14; });
    doc.setFontSize(7.5); doc.setTextColor(GREY[0], GREY[1], GREY[2]); doc.text('Uso interno e confidencial.', M, y + 6);
    var fmt = function (v, t) { return v === '' || v == null ? '' : t === 'm' ? brl.format(nz(v)) : t === 'n' && typeof v === 'number' ? fmtNum(v) : String(v); };
    var aviso = [], primeira = true;
    p.secoes.forEach(function (d) {
      if (!d.rows.length) return;
      var CAP = d.cap || 2500, rows = d.rows.slice(0, CAP), y0 = y + 44;
      if (d.rows.length > CAP) aviso.push(d.titulo + ': ' + fmtInt(CAP) + ' de ' + fmtInt(d.rows.length));
      if (primeira) primeira = false; else { doc.addPage(); y0 = 40; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]); doc.text(d.titulo, M, y0);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(INK[0], INK[1], INK[2]);
      var yy = y0 + 16; (d.resumo || []).forEach(function (t) { doc.text(String(t), M, yy); yy += 12; });
      var cols = {};
      d.cols.forEach(function (c, i) { if (c[1] !== 's') cols[i] = { halign: 'right' }; else if (/Descri/.test(c[0])) cols[i] = { cellWidth: 150 }; });
      auto({
        startY: yy + 2, head: [d.cols.map(function (c) { return c[0]; })], body: rows.map(function (r) { return r.map(function (v, i) { return fmt(v, d.cols[i][1]); }); }),
        margin: { left: M, right: M, top: 30, bottom: 36 },
        styles: { font: 'helvetica', fontSize: d.cols.length > 12 ? 6.4 : 7.4, cellPadding: 2.2, overflow: 'linebreak', lineColor: [216, 221, 229], lineWidth: 0.4, textColor: INK },
        headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' }, columnStyles: cols
      });
    });
    if (aviso.length) { doc.setPage(1); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(GREY[0], GREY[1], GREY[2]); doc.text('O PDF traz só parte de: ' + aviso.join('; ') + '. O Excel traz tudo.', M, y + 18); }
    var n = doc.internal.getNumberOfPages();
    for (var i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(GREY[0], GREY[1], GREY[2]); doc.text('RV Necessidades - ' + p.titulo + ' - uso interno e confidencial', M, H - 16); doc.text('Página ' + i + ' de ' + n, W - M, H - 16, { align: 'right' }); }
    return { doc: doc, name: p.arq + '.pdf' };
  }
  function relXlsxPacote(p) {
    var resumo = [['RV Necessidades - ' + p.titulo], [p.sub], ['']];
    p.secoes.forEach(function (d) { resumo.push([d.titulo]); resumo.push([d.rows.length ? d.resumo[0] : 'nenhum item']); resumo.push(['']); });
    var abas = [['Resumo', resumo, [110]]];
    p.secoes.forEach(function (d) {
      if (!d.rows.length) return;
      var larg = d.cols.map(function (c) { return /Descri/.test(c[0]) ? 46 : /O que|Motivo|Diverg/.test(c[0]) ? 40 : Math.max(10, Math.min(24, c[0].length + 3)); });
      abas.push([d.aba || d.titulo, [d.cols.map(function (c) { return c[0]; })].concat(d.rows), larg]);
      (d.extra || []).forEach(function (x) { abas.push(x); });
    });
    var nome = p.arq + '.xlsx';
    return baixarXlsx(nome, abas) ? nome : '';
  }
  function relNomesCompradores() { return relCompradores().filter(function (n) { return !/^(OCIOSO|INATIVO)/i.test(n); }); }

  function relGerar(id, tipo) {
    var def = REL.filter(function (r) { return r.id === id; })[0], esc = relEscopo();
    if (!def) return;
    relMsg('Gerando ' + (tipo === 'pdf' ? 'PDF' : 'Excel') + '…');
    setTimeout(function () {
      try {
        var keep = state.an; state.an = state.anFull || state.an;
        try { relGerar0(def, esc, tipo); } finally { state.an = keep; }
      } catch (e) { relMsg('Não foi possível gerar o arquivo: ' + (e && e.message ? e.message : e), true); }
    }, 30);
  }
  function relGerar0(def, esc, tipo) {
    var L, nome, nomes;
    if (def.pacote) {
      if (def.id === 'comp' && esc.comp === 'todos' && tipo === 'pdf') {
        nomes = relNomesCompradores().filter(function (n) { var e2 = { comp: n, marca: esc.marca, exata: esc.exata }, l2 = relListas(e2); return l2.rup.length + l2.rep.length + l2.itens.length + l2.mt.itens.length > 0; });
        if (!nomes.length) { relMsg('Nenhum comprador com itens nesse escopo.', true); return; }
        var i = 0;
        (function proximo() {
          if (i >= nomes.length) { relMsg(nomes.length + ' PDFs gerados (um por comprador). Se o navegador pediu permissão para baixar vários arquivos, autorize.'); return; }
          var keep = state.an; state.an = state.anFull || state.an;
          try { var e2 = { comp: nomes[i], marca: esc.marca, exata: esc.exata }, r = relPdfPacote(relPacoteDados(def, e2, relListas(e2))); r.doc.save(r.name); } catch (e) { state.an = keep; relMsg('Falha ao gerar o PDF de ' + nomes[i] + ': ' + (e && e.message ? e.message : e), true); return; }
          state.an = keep; i++; setTimeout(proximo, 500);
        })();
        return;
      }
      L = relListas(esc);
      var p = relPacoteDados(def, esc, L);
      if (tipo === 'pdf') { var r = relPdfPacote(p); r.doc.save(r.name); relMsg('PDF gerado: ' + r.name + '. Procure na pasta de downloads do navegador.'); }
      else { nome = relXlsxPacote(p); if (nome) relMsg('Excel gerado: ' + nome + '. Procure na pasta de downloads do navegador.'); }
      return;
    }
    if (def.id === 'bloq') { bloqExportar(tipo, { sc: esc, modo: 'nec', q: '', hf: false, rel: true }); return; }
    L = relListas(esc);
    var d = relDs(def.id, L, esc);
    d.arq = 'RV_Necessidades_' + d.nome + '_' + relArq(esc) + '_' + state.an.refDate;
    if (tipo === 'pdf') { var r2 = baixarPdfLista(d); r2.doc.save(r2.name); relMsg('PDF gerado: ' + r2.name + ' (' + fmtInt(Math.min(d.rows.length, d.cap)) + ' linha(s)). Procure na pasta de downloads do navegador.'); }
    else { nome = baixarXlsxLista(d); if (nome) relMsg('Excel gerado: ' + nome + ' (' + fmtInt(d.rows.length) + ' linha(s)). Procure na pasta de downloads do navegador.'); }
  }
  function relMsg(t, err) { var el = $('#relMsg'); if (!el) return; el.textContent = t || ''; el.className = 'note' + (err ? ' err' : ''); }

  function renderRelatorios() {
    var e = relEstado(), gest = ehGestor(), comps = relCompradores();
    if (gest && e.comp !== 'todos' && comps.indexOf(e.comp) < 0) e.comp = 'todos';
    $('#panel').innerHTML =
      '<details class="como"><summary>Como ler esta tela</summary><p class="note">Escolha o comprador e/ou o fornecedor (Marca) e baixe o relatório em PDF ou em Excel. Em branco ou &ldquo;Todos&rdquo; vale para tudo. Os números ao lado de cada relatório mostram o que vai no arquivo. A chave Geral | Por comprador do alto das outras telas não interfere aqui. Moeda de troca segue os critérios da página Moeda de troca. Uso interno: não envie estes arquivos aos fornecedores.</p></details>' +
      '<div class="tb1"><label class="inl" for="relComp">Comprador</label><select id="relComp"' + (gest ? '' : ' disabled') + '>' + (gest ? '<option value="todos">Todos</option>' : '') +
      comps.map(function (n) { return '<option value="' + esc(n) + '"' + ((gest ? e.comp : state.user.nome) === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select>' +
      '<label class="inl" for="relMarca">Fornecedor (Marca)</label><input type="search" id="relMarca" list="dlRelMarcas" placeholder="Todos" value="' + esc(e.marca || '') + '" autocomplete="off"><datalist id="dlRelMarcas">' + relMarcas().map(function (m) { return '<option value="' + esc(m) + '">'; }).join('') + '</datalist>' +
      '<button type="button" class="btn ghost mini" id="relLimpar"' + ((e.marca || (gest && e.comp !== 'todos')) ? '' : ' hidden') + '>Limpar</button>' +
      '<span class="note cnt">Relatório de ' + esc(isoToBr(state.an.refDate)) + (gest ? '' : ' · você vê só os seus itens') + '</span></div>' +
      '<span class="note" id="relMsg" role="status" aria-live="polite"></span>' +
      '<div id="relLista"></div>';
    renderRelLista();
  }
  function renderRelLista() {
    var esc0 = relEscopo(), keep = state.an;
    state.an = state.anFull || state.an;
    var L; try { L = relListas(esc0); } finally { state.an = keep; }
    var temMarca = !!esc0.marca, casou = L.rup.length + L.rep.length + L.itens.length + L.mt.itens.length + L.ent.length > 0;
    var h = '<div class="tablewrap"><table class="rel"><thead><tr><th>Relatório</th><th>O que traz</th><th>Neste escopo</th><th>Baixar</th></tr></thead><tbody>';
    REL.forEach(function (def) {
      if (def.grupo) { h += '<tr class="grp"><td colspan="4">' + esc(def.grupo) + '</td></tr>'; return; }
      var c = def.id === 'bloq' ? bloqContagem(esc0) : relContagem(def, L), off = c.n === 0 || (def.exigeMarca && !temMarca), txt = def.exigeMarca && !temMarca ? 'Escolha o fornecedor acima' : c.n === 0 ? 'Nenhum item' : c.t;
      if (def.id === 'comp' && esc0.comp === 'todos' && c.n > 0) txt += ' <span class="note">· PDF: um arquivo por comprador; Excel: uma planilha</span>';
      h += '<tr><td><b>' + esc(def.nome) + '</b></td><td class="desc">' + esc(def.desc) + '</td><td>' + (off ? '<span class="note">' + txt + '</span>' : txt) + '</td>' +
        '<td><button type="button" class="btn mini" data-rel="' + def.id + '" data-t="pdf"' + (off ? ' disabled' : '') + '>PDF</button> <button type="button" class="btn ghost mini" data-rel="' + def.id + '" data-t="xlsx"' + (off ? ' disabled' : '') + '>Excel</button></td></tr>';
    });
    $('#relLista').innerHTML = h + '</tbody></table></div>' + (temMarca && !esc0.exata && casou ? '<p class="note">Nenhuma Marca com esse nome exato: o filtro vale para as Marcas que contêm &ldquo;' + esc(esc0.marca) + '&rdquo;.</p>' : '');
    var lm = $('#relLimpar'); if (lm) lm.hidden = !(esc0.marca || (ehGestor() && esc0.comp !== 'todos'));
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-rel]');
    if (b && !b.disabled) { relGerar(b.getAttribute('data-rel'), b.getAttribute('data-t')); return; }
    if (e.target.closest && e.target.closest('#relLimpar')) { var s0 = relEstado(); s0.comp = 'todos'; s0.marca = ''; renderRelatorios(); }
  });
  document.addEventListener('input', function (e) { if (e.target.id === 'relMarca') { relEstado().marca = e.target.value; renderRelLista(); } });
  document.addEventListener('change', function (e) { if (e.target.id === 'relComp') { relEstado().comp = e.target.value; renderRelLista(); } });


  /* ---------- Pedidos bloqueados: Monitor de Estoque x necessidades de compra ---------- */
  var BQ_CLASSES = { rup_sem: ['Ruptura sem compra', 'crit', 0], rup_parcial: ['Ruptura, compra parcial', 'warn', 1], rup_coberta: ['Ruptura coberta por compra', 'ok', 2],
    rep: ['Necessidade 60 dias', 'info', 3], sem: ['Sem necessidade de compra', '', 4], fora: ['Fora do relatório de necessidades', '', 5] };
  function bloqClasse(r) {
    if (!r) return 'fora';
    var falta = nz(r.ruptura) < 0 ? -nz(r.ruptura) : 0;
    if (falta > 0) return nz(r.comprado) >= falta ? 'rup_coberta' : (nz(r.comprado) > 0 ? 'rup_parcial' : 'rup_sem');
    return nz(r.comprar) > 0 ? 'rep' : 'sem';
  }
  function bloqCalc() {
    if (!state.monRows || !state.rowsAll) return null;
    var key = state.id + '|' + state.monId;
    if (state.bloqCache && state.bloqCache.key === key) return state.bloqCache.v;
    var rv = {}, ped = {}, qItem = {}, lin = [], prods = {};
    state.rowsAll.forEach(function (r) { rv[String(r.codigo || '').trim()] = r; });
    state.monRows.forEach(function (m) {
      var p = ped[m.pedido] || (ped[m.pedido] = { tot: {}, blq: {} });
      p.tot[m.item] = 1;
      if (norm(m.situacao) === 'bloqueado') p.blq[m.item] = 1;
      var k = m.pedido + '|' + m.item;
      qItem[k] = (qItem[k] || 0) + nz(m.qtd);
    });
    state.monRows.forEach(function (m) {
      if (norm(m.situacao) !== 'bloqueado') return;
      var cod = m.codigo, r = rv[cod] || null, cl = bloqClasse(r), qi = qItem[m.pedido + '|' + m.item], d = r ? dispCorr(r) : null;
      var L = { m: m, codigo: cod, descricao: (r && r.descricao) || m.descricao, marca: r ? (r.marca || '(sem marca)') : '', comprador: r ? (r.comprador || '(sem comprador)') : '', classe: cl, r: r, disp: d ? d.v : null,
        qtd: nz(m.qtd), qItem: qi, vItem: nz(m.valor), vBloq: qi > 0 ? nz(m.valor) * nz(m.qtd) / qi : nz(m.valor), itensBloq: m.itBlq != null ? m.itBlq : Object.keys(ped[m.pedido].blq).length, itensTot: m.itTot != null ? m.itTot : Object.keys(ped[m.pedido].tot).length };
      lin.push(L);
      var P = prods[cod] || (prods[cod] = { codigo: cod, descricao: L.descricao, marca: L.marca, comprador: L.comprador, classe: cl, r: r, disp: L.disp, lin: [] });
      P.lin.push(L);
    });
    var v = { prods: prods, lin: lin, rv: rv };
    state.bloqCache = { key: key, v: v };
    return v;
  }
  function bloqEscopoPagina() { return { comp: ehGestor() ? viewComp() : state.user.nome, marca: '', exata: '' }; }
  // lista de produtos (com as linhas bloqueadas) para um escopo, uma visão e uma busca
  function bloqVista(o) {
    var C = bloqCalc();
    if (!C) return null;
    var sc = o.sc || null, modo = o.modo || 'nec', q = norm(o.q || ''), out = [];
    var passa = function (P) {
      var c = P.classe;
      if (modo === 'nec' && (c === 'sem' || c === 'fora')) return false;
      if (modo === 'rup' && c.indexOf('rup_') !== 0) return false;
      if (modo === 'rep' && c !== 'rep') return false;
      if (modo === 'sem' && c !== 'sem' && c !== 'fora') return false;
      if (!ehGestor()) return !!P.r && ehDoComprador(P.r);
      if (sc) { if (!P.r) return sc.comp === 'todos' && !sc.marca; return relPasse(P.r, sc); }
      return true;
    };
    Object.keys(C.prods).forEach(function (k) {
      var P = C.prods[k];
      if (!passa(P)) return;
      var ls = P.lin.filter(function (L) {
        if (q && norm(L.codigo + ' ' + L.descricao + ' ' + L.marca + ' ' + L.comprador + ' ' + L.m.cliente + ' ' + L.m.pedido).indexOf(q) < 0) return false;
        return o.hf === false || hfMatch(L, 'bl');
      });
      if (!ls.length) return;
      var cmp = ordCmp('bl') && o.hf !== false ? ordCmp('bl') : function (a, b) { return (a.m.datafat < b.m.datafat ? -1 : a.m.datafat > b.m.datafat ? 1 : 0) || nz(b.m.atraso) - nz(a.m.atraso) || (a.m.pedido < b.m.pedido ? -1 : 1); };
      ls = ls.slice().sort(cmp);
      var peds = {}, qtd = 0, val = 0;
      ls.forEach(function (L) { peds[L.m.pedido] = 1; qtd += L.qtd; val += L.vBloq; });
      out.push({ codigo: P.codigo, descricao: P.descricao, marca: P.marca, comprador: P.comprador, classe: P.classe, r: P.r, disp: P.disp, lin: ls, nPed: Object.keys(peds).length, qtd: qtd, valor: val });
    });
    out.sort(function (a, b) { return BQ_CLASSES[a.classe][2] - BQ_CLASSES[b.classe][2] || b.valor - a.valor || (a.codigo < b.codigo ? -1 : 1); });
    var pedAll = {}, nLin = 0, vTot = 0;
    out.forEach(function (P) { P.lin.forEach(function (L) { pedAll[L.m.pedido] = 1; nLin++; vTot += L.vBloq; }); });
    // rupturas do relatório de necessidades que não têm nenhum pedido bloqueado no Monitor
    var semPed = 0;
    if (modo !== 'sem') {
      var rup = (state.anFull || state.an).imin.concat((state.anFull || state.an).rep.filter(function (r) { return r.emRup; }));
      rup.forEach(function (r) { if ((!sc || relPasse(r, sc)) && (ehGestor() || ehDoComprador(r)) && !C.prods[String(r.codigo).trim()]) semPed++; });
    }
    return { prods: out, nProd: out.length, nPed: Object.keys(pedAll).length, nLin: nLin, valor: vTot, rupSemPedido: semPed };
  }
  function bloqNecTxt(P) {
    var r = P.r;
    if (!r) return 'Produto fora do relatório de necessidades (não é item de compra ou não consta no arquivo).';
    var falta = nz(r.ruptura) < 0 ? -nz(r.ruptura) : 0;
    return 'Comprar ' + fmtNum(nz(r.comprar)) + ' · Disponível ' + fmtNum(P.disp) + ' · VendProt ' + fmtNum(nz(r.vendprot)) + ' · Falta ' + fmtNum(falta) + ' · Comprado ' + fmtNum(nz(r.comprado)) +
      (nz(r.comprado) > 0 ? ' (entrega ' + (r.dtentrega ? isoToBr(r.dtentrega) : 'sem data') + (r.pedido ? ' · pedido de compra ' + r.pedido : '') + ')' : '');
  }
  function bloqContagem(sc) {
    if (!state.monRows) return { n: 0, t: 'Importe o Monitor de Estoque' };
    var V = bloqVista({ sc: sc, modo: 'nec', hf: false });
    return { n: V.nProd, t: fmtInt(V.nProd) + ' produto(s) · ' + fmtInt(V.nPed) + ' pedido(s) · ' + brl.format(V.valor) };
  }

  /* ---------- botão "Ver moeda de troca" nas listas de compra + proposta anexada ao formulário ---------- */
  function negScope() {
    var an = state.an, sel = an.imin.concat(an.rep).filter(function (r) { return state.sel[r.codigo]; }), modo = 'selecionados', rows = sel;
    if (!sel.length) { modo = 'lista'; rows = state.page === 'rupturas' ? ((state.shown && state.shown.imin) || []) : ((state.shown && state.shown.repAll) || []); }
    var porMarca = {}, ordem = [];
    rows.forEach(function (r) {
      var k = r.marca || '(sem marca)';
      if (!porMarca[k]) { porMarca[k] = { marca: k, comps: {}, n: 0, valor: 0 }; ordem.push(k); }
      porMarca[k].n++; porMarca[k].valor += r.valor; porMarca[k].comps[r.comprador] = 1;
    });
    var mt = moedaCalc(), gm = {};
    mt.grupos.forEach(function (g) { gm[g.marca] = g; });
    var cards = ordem.filter(function (k) { return modo === 'selecionados' || gm[k]; }).sort(function (a, b) { return (gm[b] ? gm[b].valor : 0) - (gm[a] ? gm[a].valor : 0); });
    return { modo: modo, porMarca: porMarca, gm: gm, cards: cards, nCom: ordem.filter(function (k) { return gm[k]; }).length, total: ordem.reduce(function (t, k) { return t + (gm[k] ? gm[k].valor : 0); }, 0) };
  }
  function renderNegoc() {
    var el = document.getElementById('negoc');
    if (!el) return;
    var sc = negScope();
    Array.prototype.forEach.call(document.querySelectorAll('[data-neg-toggle]'), function (b) {
      var base = b.id === 'negBtn' ? 'Ver moeda de troca' : 'Moeda de troca';
      b.textContent = (state.negoc ? (b.id === 'negBtn' ? 'Ocultar moeda de troca' : 'Ocultar moeda') : base) + (sc.nCom ? ' (' + sc.nCom + ')' : '');
      b.setAttribute('aria-pressed', String(!!state.negoc));
    });
    if (!state.negoc) { el.innerHTML = ''; return; }
    var sel = sc.modo === 'selecionados';
    if (!sc.cards.length) { el.innerHTML = '<section class="card nego"><p class="note">Nenhum fornecedor ' + (sel ? 'dos itens selecionados' : 'desta lista') + ' tem moeda de troca com os critérios atuais.</p></section>'; return; }
    el.innerHTML = '<section class="card nego"><div class="card-h"><h3>Moeda de troca ' + (sel ? 'dos fornecedores dos itens selecionados' : 'dos fornecedores desta lista') + ' <span class="chip info">' + fmtInt(sc.nCom) + ' com moeda de troca</span></h3>' +
      '<span class="expbtns"><button type="button" class="btn ghost mini" data-xp="pdf" data-xpg="moeda">PDF (todos)</button><button type="button" class="btn ghost mini" data-xp="xlsx" data-xpg="moeda">Excel (todos)</button></span></div>' +
      '<p class="note">' + (sel ? 'Itens parados no nosso estoque que cada fornecedor poderia receber de volta como abatimento neste pedido.' : 'Marque itens para ver só os fornecedores do pedido. Aqui: todos os fornecedores desta lista com itens parados no nosso estoque.') + ' Total possível: <b>' + brl.format(sc.total) + '</b>. A devolução depende do aceite do fornecedor.</p>' +
      '<div class="nego-grid">' + sc.cards.map(function (k) {
        var p = sc.porMarca[k], g = sc.gm[k], aberto = state.negOpen[k] != null ? state.negOpen[k] : (sel && sc.cards.length <= 2);
        if (!g) return '<div class="nego-card vazio"><div class="nego-h"><b>' + esc(k) + '</b><span class="chip ok">Sem moeda de troca</span></div><p class="note">Nenhum item deste fornecedor atende aos critérios. Pedido sem contrapartida.</p></div>';
        var cob = Math.round(g.valor / p.valor * 100);
        return '<div class="nego-card"><div class="nego-h"><button type="button" class="nego-t" data-neg-open="' + esc(k) + '" aria-expanded="' + aberto + '"><span class="car">' + (aberto ? '▾' : '▸') + '</span><b>' + esc(k) + '</b></button><span class="note">' + esc(Object.keys(p.comps).join(', ')) + '</span></div>' +
          '<div class="nego-kpis"><div><span class="l">' + (sel ? 'Compra selecionada' : 'Compra nesta lista') + '</span><b>' + brl.format(p.valor) + '</b><span class="d">' + fmtInt(p.n) + ' item(ns)</span></div>' +
          '<div class="dest"><span class="l">Moeda de troca</span><b>' + brl.format(g.valor) + '</b><span class="d">' + fmtInt(g.itens.length) + ' item(ns) parados</span></div>' +
          '<div><span class="l">Pode abater</span><b>' + fmtInt(cob) + '%</b><span class="d">da compra ' + (sel ? 'selecionada' : 'desta lista') + '</span></div></div>' +
          '<div class="nego-a"><button type="button" class="btn ghost mini" data-xp="pdf" data-xpg="moeda" data-xa="' + esc(k) + '">PDF deste fornecedor</button><button type="button" class="btn ghost mini" data-xp="xlsx" data-xpg="moeda" data-xa="' + esc(k) + '">Excel deste fornecedor</button>' +
          '<button type="button" class="btn mini" data-neg-prop="' + esc(k) + '" title="Grava a lista de itens a devolver no formulário deste fornecedor, como anotação interna (não vai no PDF do pedido)">Levar a proposta para o formulário</button></div>' +
          (aberto ? '<div class="tablewrap scroll nego-scroll"><table><thead><tr><th>Código</th><th>Descrição</th><th class="num">Disponível</th><th class="num">Dias de estoque</th><th class="num">Excedente</th><th class="num">Valor</th></tr></thead><tbody>' +
            g.itens.map(function (x) {
              return '<tr><td class="code">' + esc(x.codigo) + '</td><td class="desc">' + esc(x.descricao) + '</td><td class="num">' + fmtNum(x.disp) + '</td><td class="num">' + (x.dias == null ? 'sem giro' : fmtInt(x.dias)) + '</td><td class="num"><b>' + fmtInt(x.exc) + '</b></td><td class="num">' + brl.format(x.valor) + '</td></tr>';
            }).join('') + '</tbody><tfoot><tr><td colspan="5">Total (' + fmtInt(g.itens.length) + ' itens)</td><td class="num">' + brl.format(g.valor) + '</td></tr></tfoot></table></div>' : '') + '</div>';
      }).join('') + '</div></section>';
  }
  function propostaDaMarca(marca) {
    var g = moedaCalc().grupos.filter(function (x) { return x.marca === marca; })[0];
    if (!g) return null;
    return { geradaEm: new Date().toISOString(), por: quem(), baseRelatorio: state.an.refDate, criterio: 'PP zero com estoque' + (state.mt.modo === 'ambos' ? ' e ' : ' ou ') + 'estoque acima de ' + state.mt.dias + ' dias', total: r2(g.valor), obs: '',
      itens: g.itens.map(function (x) { return { codigo: x.codigo, descricao: x.descricao, disp: x.disp, dias: x.dias == null ? null : Math.round(x.dias), exc: x.exc, preco: x.preco, valor: r2(x.valor) }; }) };
  }
  function anexarProposta(marca) {
    var prop = propostaDaMarca(marca);
    if (!prop) { flash('Este fornecedor não tem moeda de troca com os critérios atuais.', true); return; }
    var k = norm(marca), nota = prop.itens.length + ' item(ns), ' + brl2.format(prop.total) + ' (anotação interna, não vai no PDF do pedido)';
    var cand = meusPedidos().filter(function (p) { return norm(p.fornecedor.marca) === k && (p.status === 'rascunho' || p.status === 'devolvido') && podeEditar(p); })
      .sort(function (a, b) { return a.atualizadoEm < b.atualizadoEm ? 1 : -1; })[0];
    if (cand) {
      cand.moedaTroca = prop;
      salvarPed(cand).then(function () { renderDrawer(); flash('Proposta de moeda de troca anexada ao formulário ' + cand.numero + ' (' + nota + '). Abra o formulário para ver ou editar.'); }, function (e) { flash(msgDeErro(e), true); });
      return;
    }
    var rows = state.an.imin.concat(state.an.rep).filter(function (r) { return state.sel[r.codigo] && (r.marca || '(sem marca)') === marca; });
    if (!rows.length) { flash('Não há formulário em rascunho de ' + marca + '. Marque os itens a comprar desse fornecedor e clique de novo (o formulário será criado com a proposta), ou crie o formulário na página Formulários.', true); return; }
    criarDeSelecao(marca, prop);
  }
  function htmlMoedaForm(p) {
    var m = p.moedaTroca;
    if (!m) return '';
    return '<fieldset class="fs"><legend>Moeda de troca: proposta de devolução ao fornecedor (anotação interna)</legend>' +
      '<p class="m-alert"><b>Não vai no PDF do pedido.</b> Serve à negociação: o fornecedor ainda não aceitou. Gerada por ' + esc(m.por) + ' em ' + esc(dtHora(m.geradaEm)) + ', com base no relatório de ' + esc(isoToBr(m.baseRelatorio)) + ' (' + esc(m.criterio) + '). Valor pelo último preço.</p>' +
      '<div class="tablewrap scroll nego-scroll"><table><thead><tr><th>Código</th><th>Descrição</th><th class="num">Disponível</th><th class="num">Dias de estoque</th><th class="num">Qtd. a devolver</th><th class="num">Valor</th></tr></thead><tbody>' +
      m.itens.map(function (x) { return '<tr><td class="code">' + esc(x.codigo) + '</td><td class="desc">' + esc(x.descricao) + '</td><td class="num">' + fmtNum(x.disp) + '</td><td class="num">' + (x.dias == null ? 'sem giro' : fmtInt(x.dias)) + '</td><td class="num"><b>' + fmtInt(x.exc) + '</b></td><td class="num">' + brl2.format(x.valor) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td colspan="5">Total (' + fmtInt(m.itens.length) + ' itens)</td><td class="num">' + brl2.format(m.total) + '</td></tr></tfoot></table></div>' +
      '<div class="fgrid mt10">' + campo('Anotações da negociação (internas)', 'moedaTroca.obs', { area: 1, rows: 2, span: 4 }) + '</div>' +
      (state.pedEdit ? '<div class="m-row"><button type="button" class="btn ghost" data-act="rmMoeda">Remover a proposta deste formulário</button></div>' : '') + '</fieldset>';
  }

  /* ---------- Todos os itens: consulta com filtros ---------- */
  function tdNovo() { return { q: '', grupo: '', sit: 'todos', comp: 'todos', sort: 'codigo', dir: 1, pg: 1 }; }
  var TD_PAG = 100;
  var TD_COLS = [
    ['codigo', 'Código', 's', 'code'], ['descricao', 'Descrição', 's', 'desc'], ['marca', 'Marca', 's'], ['comprador', 'Comprador', 's'], ['grupo', 'Grupo', 's'],
    ['pontopedido', 'Pto. pedido', 'n'], ['fisico', 'Físico', 'n'], ['disp', 'Disponível', 'n'], ['vendprot', 'VendProt', 'n'], ['ruptura', 'Ruptura', 'n'], ['comprado', 'Comprado', 'n'],
    ['comprar', 'Comprar', 'n'], ['ultpreco', 'Últ. preço', 'n'], ['vlrestoque', 'Valor estoque', 'n'], ['dias', 'Dias de estoque', 'n'], ['dtentrega', 'Entrega', 's'], ['pedido', 'Pedido', 's']
  ];
  function tdSituacoes() {
    return [['todos', 'Todos os itens'], ['nec', 'Com necessidade de compra'], ['rup', 'Em ruptura'], ['rupsem', 'Ruptura sem cobertura (Rupturas)'], ['comprado', 'Com compra em aberto'], ['atrasada', 'Entrega atrasada'],
      ['estoque', 'Com estoque disponível'], ['semgiro', 'Estoque sem giro (MedContr zero)'], ['ppzero', 'Ponto de pedido zero'], ['excesso', 'Estoque acima de ' + state.mt.dias + ' dias']];
  }
  // linhas do relatório com os campos derivados (uma vez por relatório)
  function tdBase() {
    if (state.tdCache && state.tdCache.id === state.id) return state.tdCache.arr;
    var m = currentMeta(), ref = m ? String(m.refAt).slice(0, 10) : '';
    var arr = (state.rowsAll || []).map(function (r) {
      var d = dispCorr(r), dias = diasEst(r, d.v), falta = nz(r.ruptura) < 0 ? -nz(r.ruptura) : 0;
      return {
        r: r, disp: d.v, dispCorr: d.corrigido, dispOrig: d.orig, dias: dias, comp: r.comprador || '(sem comprador)', busca: norm(r.codigo + ' ' + r.descricao + ' ' + r.marca + ' ' + r.comprador + ' ' + r.pedido),
        nec: nz(r.comprar) > 0, rup: nz(r.ruptura) < 0, rupsem: nz(r.comprar) > 0 && falta > 0 && nz(r.comprado) < falta,
        comprado: nz(r.comprado) > 0, atrasada: nz(r.comprado) > 0 && !!r.dtentrega && !!ref && r.dtentrega < ref,
        estoque: d.v > 0, semgiro: nz(r.medcontr) === 0 && d.v > 0, ppzero: nz(r.pontopedido) === 0
      };
    });
    state.tdCache = { id: state.id, arr: arr };
    return arr;
  }
  function tdValor(x, k) {
    var r = x.r;
    switch (k) {
      case 'disp': return x.disp;
      case 'dias': return x.dias == null ? -1 : x.dias;
      case 'comprador': return x.comp;
      default: var v = r[k]; return v == null ? '' : v;
    }
  }
  function tdLista() {
    var t = state.td, q = norm(t.q), g = state.hf.td, geral = viewComp() === 'todos', excesso = nz(state.mt.dias);
    var out = tdBase().filter(function (x) {
      var r = x.r;
      if (!dentroDaVisao(r)) return false;
      if (geral && ehGestor() && t.comp !== 'todos' && x.comp !== t.comp) return false;
      if (t.grupo && String(r.grupo || '') !== t.grupo) return false;
      if (q && x.busca.indexOf(q) < 0) return false;
      if (!hfMatch(r, 'td')) return false;
      switch (t.sit) {
        case 'nec': return x.nec;
        case 'rup': return x.rup;
        case 'rupsem': return x.rupsem;
        case 'comprado': return x.comprado;
        case 'atrasada': return x.atrasada;
        case 'estoque': return x.estoque;
        case 'semgiro': return x.semgiro;
        case 'ppzero': return x.ppzero;
        case 'excesso': return x.dias != null ? x.dias > excesso : x.estoque;
      }
      return true;
    });
    var k = t.sort, d = t.dir;
    out.sort(function (a, b) {
      var va = tdValor(a, k), vb = tdValor(b, k);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * d || (a.r.codigo < b.r.codigo ? -1 : 1);
      va = String(va); vb = String(vb);
      return (va < vb ? -1 : va > vb ? 1 : (a.r.codigo < b.r.codigo ? -1 : 1)) * d;
    });
    return out;
  }
  function renderTodos() {
    var t = state.td, base = tdBase().filter(function (x) { return dentroDaVisao(x.r); }), grupos = {}, comps = {};
    base.forEach(function (x) { if (x.r.grupo) grupos[x.r.grupo] = 1; comps[x.comp] = 1; });
    var geral = viewComp() === 'todos' && ehGestor();
    $('#panel').innerHTML =
      '<details class="como"><summary>Como ler esta tela</summary><p class="note">Todos os itens do relatório. Busque por fornecedor (Marca), produto (código ou descrição), comprador ou pedido. Em Filtros ficam comprador, grupo e os filtros por coluna. Clique no título de uma coluna para ordenar.</p></details>' +
      '<div class="tb1"><div class="searchbox"><input type="search" id="tdq" placeholder="Buscar código, descrição, marca, comprador ou pedido" aria-label="Buscar" value="' + esc(t.q) + '"></div>' + filtrosBtn('td') +
      '<select id="tdSit" aria-label="Situação">' + tdSituacoes().map(function (s) { return '<option value="' + s[0] + '"' + (t.sit === s[0] ? ' selected' : '') + '>Situação: ' + esc(s[1]) + '</option>'; }).join('') + '</select>' + menuExport() + '</div>' +
      '<div class="tb1" id="tdMais"' + (state.ftOpen || t.comp !== 'todos' || t.grupo ? '' : ' hidden') + '>' +
      (geral ? '<label class="inl" for="tdComp">Comprador</label><select id="tdComp"><option value="todos">Todos</option>' + Object.keys(comps).sort().map(function (c) { return '<option value="' + esc(c) + '"' + (t.comp === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' : '') +
      '<label class="inl" for="tdGrupo">Grupo</label><select id="tdGrupo"><option value="">Todos</option>' + Object.keys(grupos).sort().map(function (c) { return '<option value="' + esc(c) + '"' + (t.grupo === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="note" id="tdInfo"></div>' +
      '<div class="tablewrap scroll"><table><thead><tr>' + TD_COLS.map(function (c) {
        return '<th' + (c[2] === 'n' ? ' class="num"' : '') + ' data-tdsort="' + c[0] + '" title="Ordenar" aria-sort="' + (t.sort === c[0] ? (t.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' + c[1] + (t.sort === c[0] ? (t.dir > 0 ? ' ▲' : ' ▼') : '') + '</th>';
      }).join('') + '</tr>' + hfRow('td', TD_COLS.length) + '</thead><tbody id="rowsT"></tbody></table></div>' +
      '<div class="toolbar" id="tdPag"></div>';
    renderTodosRows();
  }
  function renderTodosRows() {
    var t = state.td, lista = tdLista(), n = lista.length, pags = Math.max(1, Math.ceil(n / TD_PAG));
    if (t.pg > pags) t.pg = pags;
    var ini = (t.pg - 1) * TD_PAG, fatia = lista.slice(ini, ini + TD_PAG);
    var vEst = lista.reduce(function (s, x) { return s + nz(x.r.vlrestoque); }, 0);
    $('#rowsT').innerHTML = fatia.length ? fatia.map(function (x) {
      var r = x.r;
      return '<tr><td class="code">' + esc(r.codigo) + '</td><td class="desc">' + esc(r.descricao) + '</td><td>' + esc(r.marca) + '</td><td>' + esc(x.comp) + '</td><td>' + esc(r.grupo || '') + '</td>' +
        '<td class="num">' + fmtNum(nz(r.pontopedido)) + '</td><td class="num">' + fmtNum(nz(r.fisico)) + '</td><td class="num"' + (x.dispCorr ? ' title="O relatório traz ' + fmtNum(x.dispOrig) + ' (vírgula decimal perdida); valor corrigido pelo COMPRAR do Protheus"' : '') + '>' + fmtNum(x.disp) + (x.dispCorr ? '*' : '') + '</td>' +
        '<td class="num">' + fmtNum(nz(r.vendprot)) + '</td><td class="num">' + fmtNum(nz(r.ruptura)) + '</td><td class="num">' + fmtNum(nz(r.comprado)) + '</td><td class="num">' + (nz(r.comprar) > 0 ? '<b>' + fmtNum(r.comprar) + '</b>' : fmtNum(nz(r.comprar))) + '</td>' +
        '<td class="num">' + fmtNum(nz(r.ultpreco)) + '</td><td class="num">' + brl.format(nz(r.vlrestoque)) + '</td><td class="num">' + (x.dias == null ? '—' : fmtInt(x.dias)) + '</td><td>' + esc(r.dtentrega ? isoToBr(r.dtentrega) : '') + '</td><td class="code">' + esc(r.pedido || '') + '</td></tr>';
    }).join('') : '<tr class="empty-row"><td colspan="' + TD_COLS.length + '">Nenhum item com esses filtros.</td></tr>';
    $('#tdInfo').textContent = fmtInt(n) + ' item(ns) de ' + fmtInt(tdBase().filter(function (x) { return dentroDaVisao(x.r); }).length) + ' · valor em estoque dos itens listados: ' + brl.format(vEst);
    $('#tdPag').innerHTML = pags > 1 ? '<button type="button" class="btn ghost mini" id="tdPrev"' + (t.pg <= 1 ? ' disabled' : '') + '>Anterior</button><span class="note">Página ' + t.pg + ' de ' + pags + ' (' + TD_PAG + ' itens por página)</span><button type="button" class="btn ghost mini" id="tdNext"' + (t.pg >= pags ? ' disabled' : '') + '>Próxima</button>' : '';
  }
  function exportarTodos() {
    var lista = tdLista();
    var linhas = [TD_COLS.map(function (c) { return c[1]; })].concat(lista.map(function (x) {
      var r = x.r;
      return [r.codigo, r.descricao, r.marca, x.comp, r.grupo || '', nz(r.pontopedido), nz(r.fisico), x.disp, nz(r.vendprot), nz(r.ruptura), nz(r.comprado), nz(r.comprar), nz(r.ultpreco), nz(r.vlrestoque), x.dias == null ? '' : Math.round(x.dias), r.dtentrega ? isoToBr(r.dtentrega) : '', r.pedido || ''];
    }));
    var nome = 'RV_Necessidades_Itens_' + (viewComp() === 'todos' ? 'Geral' : slug(viewComp())) + '_' + state.an.refDate + '.xlsx';
    if (baixarXlsx(nome, [['Itens', linhas, [10, 46, 18, 16, 8, 11, 10, 11, 10, 10, 10, 10, 11, 14, 14, 12, 10]]])) setDrawerMsg('Excel gerado: ' + nome + ' (' + lista.length + ' item(ns)). Procure na pasta de downloads do navegador.');
  }

  /* ---------- Moeda de troca: excesso de estoque para negociar devolução com o fornecedor ---------- */
  function mtNovo() { return { dias: 60, ppZero: true, modo: 'qualquer', min: 0, soCompra: true }; }
  function moedaCalc(ctx) {
    var p = state.mt, an = state.an, itens = [], gm = {}, compra = {};
    if (!state.rowsAll || !an) return { itens: [], grupos: [], total: 0, comCompra: 0 };
    (ctx ? ctx.plan : an.imin.concat(an.rep)).forEach(function (r) { var k = r.marca || '(sem marca)'; compra[k] = (compra[k] || 0) + r.valor; });
    (ctx ? ctx.rows : viewRows()).forEach(function (r) {
      var d = dispCorr(r), disp = d.v, fis = nz(r.fisico), med = nz(r.medcontr), pp = nz(r.pontopedido);
      if (disp <= 0) return;
      var dias = med > 0 ? disp / (med / 30) : Infinity;
      var a = p.ppZero && pp === 0 && fis > 0, b = dias > p.dias;
      if (!(p.modo === 'ambos' ? a && b : a || b)) return;
      var alvo = a ? 0 : p.dias * med / 30, exc = Math.floor(disp - alvo);
      if (exc < 1) return;
      var valor = exc * nz(r.ultpreco);
      if (valor < nz(p.min)) return;
      var it = { r: r, codigo: r.codigo, descricao: r.descricao, marca: r.marca || '(sem marca)', comprador: r.comprador || '(sem comprador)', motivo: a && b ? 'PP zero e estoque acima de ' + p.dias + ' dias' : a ? 'Ponto de pedido zero com estoque' : 'Estoque acima de ' + p.dias + ' dias',
        fisico: fis, disp: disp, corrigido: d.corrigido, dias: dias === Infinity ? null : dias, exc: exc, preco: nz(r.ultpreco), valor: valor, comprado: nz(r.comprado) };
      itens.push(it);
      var g = gm[it.marca] || (gm[it.marca] = { marca: it.marca, itens: [], valor: 0, comps: {}, compra: compra[it.marca] || 0 });
      g.itens.push(it); g.valor += valor; g.comps[it.comprador] = 1;
    });
    var grupos = Object.keys(gm).map(function (k) { return gm[k]; }).sort(function (a, b) { return (b.compra > 0) - (a.compra > 0) || b.valor - a.valor; });
    if (p.soCompra) {
      grupos = grupos.filter(function (g) { return g.compra > 0; });
      var ok = {}; grupos.forEach(function (g) { ok[g.marca] = 1; });
      itens = itens.filter(function (x) { return ok[x.marca]; });
    }
    itens.sort(function (a, b) { return b.valor - a.valor; });
    return { itens: itens, grupos: grupos, total: itens.reduce(function (s, x) { return s + x.valor; }, 0), comCompra: grupos.filter(function (g) { return g.compra > 0; }).length };
  }
  function renderMoeda() {
    var p = state.mt, mt = moedaCalc();
    $('#panel').innerHTML =
      '<details class="como"><summary>Como ler esta tela</summary><p class="note">Itens parados que o comprador pode usar como <b>moeda de troca</b> ao fazer um pedido: propor ao fornecedor a devolução, total ou parcial, desses itens como abatimento. Entram os itens com estoque que atendem aos critérios. A quantidade excedente é o que passa do que ainda se justifica manter, e o valor usa o último preço (Ult.Preco). A negociação é com os fornecedores a quem vamos comprar: por isso, por padrão, só aparecem os que têm compra prevista.</p></details>' +
      '<details class="como crit" id="mtCrit"' + (state.mtOpen ? ' open' : '') + '><summary>Critérios: estoque acima de ' + esc(p.dias) + ' dias' + (p.ppZero ? ' ou ponto de pedido zero com estoque' : '') + (p.soCompra ? ' · só fornecedores com compra prevista' : ' · todos os fornecedores') + ' <b>(ajustar)</b></summary>' +
      '<div class="param"><label>Estoque acima de <input type="number" id="mtDias" min="1" step="1" value="' + esc(p.dias) + '"> dias</label>' +
      '<label class="chk" for="mtPp"><input type="checkbox" id="mtPp"' + (p.ppZero ? ' checked' : '') + '> Incluir ponto de pedido zero com estoque físico</label>' +
      '<label class="chk" for="mtSo"><input type="checkbox" id="mtSo"' + (p.soCompra ? ' checked' : '') + '> Só fornecedores com compra prevista</label>' +
      '<label>Critério <select id="mtModo"><option value="qualquer"' + (p.modo === 'qualquer' ? ' selected' : '') + '>Qualquer um dos dois</option><option value="ambos"' + (p.modo === 'ambos' ? ' selected' : '') + '>Os dois ao mesmo tempo</option></select></label>' +
      '<label>Valor mínimo do item (R$) <input type="number" id="mtMin" min="0" step="1" value="' + esc(p.min) + '"></label></div></details>' +
      '<div class="kpis">' + kpi('Moeda de troca', brl.format(mt.total), 'valor do excedente pelo último preço', '') + kpi('Itens', fmtInt(mt.itens.length), 'com excedente para negociar', '') +
      kpi('Fornecedores', fmtInt(mt.grupos.length), 'com itens para negociar', '') + kpi('Com compra prevista', fmtInt(mt.comCompra), 'fornecedores que também têm necessidade de compra', mt.comCompra ? 'warn' : '') + '</div>' +
      '<section class="card"><div class="card-h"><h3>Por fornecedor <span class="chip info">' + fmtInt(mt.grupos.length) + '</span></h3>' + (mt.itens.length ? '<details class="menu"><summary>Exportar ▾</summary><div class="menu-pop"><button type="button" data-xp="pdf">PDF de todos os fornecedores</button><button type="button" id="mtExp">Excel de todos os fornecedores</button></div></details>' : '') + '</div>' +
      '<p class="note">A coluna Cobertura mostra quanto da compra prevista o excedente poderia abater.</p>' +
      (mt.grupos.length ? '<div class="tablewrap scroll"><table><thead><tr><th>Fornecedor (Marca)</th><th>Compradores</th><th class="num">Itens</th><th class="num">Moeda de troca</th><th class="num">Compra prevista</th><th class="num">Cobertura</th><th></th></tr></thead><tbody>' +
        mt.grupos.map(function (g) {
          return '<tr><td><b>' + esc(g.marca) + '</b></td><td>' + esc(Object.keys(g.comps).join(', ')) + '</td><td class="num">' + fmtInt(g.itens.length) + '</td><td class="num"><b>' + brl.format(g.valor) + '</b></td><td class="num">' + (g.compra > 0 ? brl.format(g.compra) : '—') + '</td><td class="num">' + (g.compra > 0 ? fmtInt(Math.min(999, g.valor / g.compra * 100)) + '%' : '—') + '</td>' +
            '<td><button type="button" class="btn ghost mini" data-mt-ver="' + esc(g.marca) + '">Ver itens</button> <button type="button" class="btn ghost mini" data-xp="pdf" data-xpg="moeda" data-xa="' + esc(g.marca) + '" title="PDF deste fornecedor">PDF</button> <button type="button" class="btn ghost mini" data-mt-xls="' + esc(g.marca) + '" title="Excel deste fornecedor">Excel</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="note">Nenhum item atende aos critérios atuais.</p>') + '</section>' +
      '<section class="card"><div class="card-h"><h3>Itens <span class="chip info" id="cMt"></span></h3></div><div class="tablewrap scroll"><table><thead><tr>' + thS('mt', 'mo', 'Motivo', '') + '' + thS('mt', 'c', 'Código', '') + '' + thS('mt', 'd', 'Descrição', '') + '' + thS('mt', 'm', 'Marca', '') + '' + thS('mt', 'u', 'Comprador', '') + '' + thS('mt', 'fi', 'Físico', 'num') + '' + thS('mt', 'dp', 'Disponível', 'num') + '' + thS('mt', 'di', 'Dias de estoque', 'num') + '' + thS('mt', 'ex', 'Excedente', 'num') + '' + thS('mt', 'up', 'Últ. preço', 'num') + '' + thS('mt', 'v', 'Valor do excedente', 'num') + '' + thS('mt', 'co', 'Comprado em aberto', 'num') + '</tr>' + hfRow('mt', 12) + '</thead><tbody id="rowsM"></tbody></table></div></section>';
    renderMoedaItens();
  }
  function renderMoedaItens() {
    var mt = moedaCalc(), lista = mt.itens.filter(function (x) { return hfMatch(x, 'mt'); }), CAP = 300, cm = ordCmp('mt');
    if (cm) lista = lista.slice().sort(cm);
    $('#rowsM').innerHTML = lista.length ? lista.slice(0, CAP).map(function (x) {
      return '<tr><td><span class="chip info">' + esc(x.motivo) + '</span></td><td class="code">' + esc(x.codigo) + '</td><td class="desc">' + esc(x.descricao) + '</td><td>' + esc(x.marca) + '</td><td>' + esc(x.comprador) + '</td>' +
        '<td class="num">' + fmtNum(x.fisico) + '</td><td class="num">' + fmtNum(x.disp) + (x.corrigido ? '*' : '') + '</td><td class="num">' + (x.dias == null ? 'sem giro' : fmtInt(x.dias)) + '</td><td class="num"><b>' + fmtInt(x.exc) + '</b></td>' +
        '<td class="num">' + fmtNum(x.preco) + '</td><td class="num"><b>' + brl.format(x.valor) + '</b></td><td class="num">' + (x.comprado > 0 ? '<span class="chip warn" title="Há compra em aberto deste item: avalie antes de receber mais estoque">' + fmtNum(x.comprado) + '</span>' : '') + '</td></tr>';
    }).join('') : '<tr class="empty-row"><td colspan="12">Nenhum item com esse filtro.</td></tr>';
    $('#cMt').textContent = fmtInt(lista.length) + (lista.length !== mt.itens.length ? ' de ' + fmtInt(mt.itens.length) : '') + ' item(ns)' + (lista.length > CAP ? ', mostrando ' + CAP : '');
  }
  document.addEventListener('toggle', function (e) { if (e.target && e.target.id === 'mtCrit') state.mtOpen = e.target.open; }, true);
  function exportarMoeda(marca) {
    var mt = moedaCalc(), grupos = marca ? mt.grupos.filter(function (g) { return g.marca === marca; }) : mt.grupos;
    if (!grupos.length) return;
    var itens = [['Fornecedor (Marca)', 'Comprador', 'Código', 'Descrição', 'Motivo', 'Físico', 'Disponível', 'Dias de estoque', 'Qtd. excedente', 'Últ. preço', 'Valor do excedente', 'Comprado em aberto']];
    var resumo = [['Fornecedor (Marca)', 'Compradores', 'Itens', 'Moeda de troca (R$)', 'Compra prevista (R$)']];
    grupos.forEach(function (g) {
      resumo.push([g.marca, Object.keys(g.comps).join(', '), g.itens.length, r2(g.valor), r2(g.compra)]);
      g.itens.forEach(function (x) { itens.push([g.marca, x.comprador, x.codigo, x.descricao, x.motivo, x.fisico, x.disp, x.dias == null ? 'sem giro' : Math.round(x.dias), x.exc, x.preco, r2(x.valor), x.comprado]); });
    });
    var nome = 'RV_Necessidades_MoedaDeTroca_' + (marca ? slug(marca) : (viewComp() === 'todos' ? 'Geral' : slug(viewComp()))) + '_' + state.an.refDate + '.xlsx';
    if (baixarXlsx(nome, [['Resumo', resumo, [30, 30, 8, 18, 18]], ['Itens', itens, [24, 16, 10, 46, 34, 10, 11, 14, 14, 11, 18, 18]]])) setDrawerMsg('Excel gerado: ' + nome + '. Procure na pasta de downloads do navegador.');
  }

  /* ---------- Divergências: itens a corrigir e alertas do relatório ---------- */
  function alertasHtml() {
    var an = state.an;
    return an.warnings.length
      ? '<ul class="alerts">' + an.warnings.map(function (w) {
        var chip = w.level === 'info' ? ['Informação', 'info'] : ['Atenção', 'warn'];
        return '<li class="alert"><span class="chip ' + chip[1] + '">' + chip[0] + '</span><span>' + esc(w.text) + '</span>' +
          (w.codes ? '<span class="codes">' + esc(w.codes.join(', ')) + (w.total > w.codes.length ? ' e mais ' + fmtInt(w.total - w.codes.length) : '') + '</span>' : '') + '</li>';
      }).join('') + '</ul>'
      : '<p class="note">O arquivo passou em todas as conferências.</p>';
  }
  function renderDivPage() {
    var an = state.an;
    $('#panel').innerHTML = '<div class="seg mini" role="group" aria-label="Tipo"><button type="button" data-dvtab="itens" aria-pressed="' + (state.dvTab !== 'alertas') + '">Divergências a corrigir (' + fmtInt(divLista().length) + ')</button>' +
      '<button type="button" data-dvtab="alertas" aria-pressed="' + (state.dvTab === 'alertas') + '">Alertas do relatório (' + fmtInt(an.warnings.length) + ')</button></div><div class="plain-body" id="pgBody"></div>';
    if (state.dvTab === 'alertas') $('#pgBody').innerHTML = alertasHtml(); else renderDiverg();
  }

  /* ---------- Formulários: lista, filtros e novo formulário ---------- */
  function renderForms() {
    var c = contagemDrawer(), comps = compradoresConhecidos();
    var digitado = $('#novoMarca') ? $('#novoMarca').value : '', escolhido = $('#novoComp') ? $('#novoComp').value : '';   // a atualização em segundo plano não pode apagar o que a pessoa já preencheu
    $('#drawerActions').innerHTML =
      '<div class="dnew">' + (podeCriar() ? '<input type="text" id="novoMarca" list="dlMarcasForm" placeholder="Marca / fornecedor" aria-label="Marca do novo formulário"><datalist id="dlMarcasForm">' + marcasConhecidas().map(function (m) { return '<option value="' + esc(m) + '">'; }).join('') + '</datalist>' : '') +
      (podeCriar() && ehGestor() ? '<select id="novoComp" aria-label="Comprador">' + comps.map(function (n) { return '<option value="' + esc(n) + '"' + (n === viewComp() ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select>' : '') +
      (podeCriar() ? '<button type="button" class="btn" id="novoPed">Novo formulário</button>' : '') +
      '<details class="menu"><summary>Mais ▾</summary><div class="menu-pop"><button type="button" id="empBtn">Dados da empresa</button></div></details></div>';
    if ($('#novoMarca') && digitado) $('#novoMarca').value = digitado;
    if ($('#novoComp') && escolhido && Array.prototype.some.call($('#novoComp').options, function (o) { return o.value === escolhido; })) $('#novoComp').value = escolhido;
    var tabs = podeAprovar()
      ? [['pendente', 'Aguardando aprovação', c.pendente], ['aprovado', 'Aprovados', c.aprovado], ['revisar', 'Por budget (revisar)', c.revisar], ['devolvido', 'Devolvidos e recusados', c.devolvido], ['rascunho', 'Rascunhos', c.rascunho], ['todos', 'Todos', c.todos]]
      : [['devolvido', 'Devolvidos', c.devolvido], ['rascunho', 'Rascunhos', c.rascunho], ['pendente', 'Em aprovação', c.pendente], ['aprovado', 'Aprovados', c.aprovado], ['todos', 'Todos', c.todos]];
    $('#drawerTabs').innerHTML = tabs.map(function (t) {
      return '<button type="button" class="tab" role="tab" data-dtab="' + t[0] + '" aria-selected="' + (state.drawerTab === t[0]) + '">' + t[1] + '<span class="n">' + fmtInt(t[2]) + '</span></button>';
    }).join('');
    var lista = meusPedidos().filter(function (p) {
      if (state.drawerTab === 'todos') return true;
      if (state.drawerTab === 'revisar') return precisaRevisar(p);
      if (state.drawerTab === 'devolvido') return p.status === 'devolvido' || p.status === 'recusado' || p.status === 'cancelado';
      return p.status === state.drawerTab;
    }).sort(function (a, b) { return a.atualizadoEm < b.atualizadoEm ? 1 : -1; });
    var ff = norm(state.hfF || ''), total = lista.length;
    if (ff) lista = lista.filter(function (p) {
      return norm(p.numero + ' ' + p.fornecedor.marca + ' ' + p.fornecedor.razao + ' ' + p.itens.map(function (i) { return i.codigo; }).join(' ')).indexOf(ff) >= 0;
    });
    $('#drawerList').innerHTML = '<input type="search" id="hf-forms" class="hf-forms" placeholder="Filtrar por nº, Marca ou código do item" aria-label="Filtrar formulários por número, Marca ou código" value="' + esc(state.hfF || '') + '">' + (lista.length ? '<div class="ped-grid">' + lista.map(function (p) {
      var s = STATUS[p.status], c2 = calcPedido(p);
      return '<button type="button" class="ped-card" data-open="' + esc(p.id) + '"><span class="pc1"><b>' + esc(p.numero) + '</b><span>' + (ehAprovadoBudget(p) ? '<span class="chip info">por budget</span> ' : '') + precoChips(p) + '<span class="chip ' + s[1] + '">' + s[0] + '</span></span></span>' +
        '<span class="pc2">' + esc(p.fornecedor.razao || p.fornecedor.marca || '(fornecedor não informado)') + '</span>' +
        '<span class="pc3">' + esc(p.comprador) + ' · ' + fmtInt(p.itens.length) + ' item(ns) · <b>' + brl2.format(c2.geral) + '</b> · ' + esc(dtHora(p.atualizadoEm)) +
        (p.status === 'aprovado' && !p.protheus ? ' · <i>falta lançar no Protheus</i>' : '') + '</span></button>';
    }).join('') + '</div>' : '<p class="note">' + (total ? 'Nenhum formulário com esse filtro.' : 'Nenhum formulário nesta lista.') + '</p>');
  }

  /* ---------- Fornecedores: cadastro (planilha) e lista ---------- */
  function renderFxHost() { if (state.page === 'fornecedores') renderFornecedores(); else renderBudgets(); }
  function renderFornecedores() {
    var ks = Object.keys(state.forn), inc = ks.filter(function (k) { return fxFaltam(state.forn[k]).length; }).length;
    $('#panel').innerHTML = '<p class="note">Cadastro dos fornecedores, usado para preencher os formulários e o PDF do pedido. Mantenha-o pela planilha: baixe o modelo, preencha, importe e confira antes de gravar. <b>' + fmtInt(ks.length) + '</b> fornecedor(es) cadastrado(s)' + (inc ? ', ' + fmtInt(inc) + ' com cadastro incompleto' : '') + '.</p>' +
      '<div id="fxBlock">' + htmlPlanilhaFx() + '</div>' +
      '<div class="toolbar"><input type="search" id="fnq" placeholder="Buscar por Marca, razão social, CNPJ, cidade ou contato" aria-label="Buscar fornecedor" value="' + esc(state.fnq || '') + '"></div><div id="fnList"></div>';
    renderFnList();
  }
  function renderFnList() {
    var q = norm(state.fnq || ''), ks = Object.keys(state.forn).filter(function (k) {
      var f = state.forn[k];
      return !q || norm([f.marca, f.razao, f.cnpj, f.cidade, f.contato, f.email].join(' ')).indexOf(q) >= 0;
    }).sort(function (a, b) { return norm(state.forn[a].marca) < norm(state.forn[b].marca) ? -1 : 1; });
    $('#fnList').innerHTML = ks.length ? '<div class="tablewrap scroll"><table><thead><tr><th>Marca</th><th>Razão social</th><th>CNPJ</th><th>Cidade/UF</th><th>Contato</th><th>E-mail / telefone</th><th>Prazo de pagamento</th><th>Situação</th></tr></thead><tbody>' + ks.map(function (k) {
      var f = state.forn[k], fa = fxFaltam(f);
      return '<tr><td><b>' + esc(f.marca) + '</b></td><td>' + esc(f.razao || '') + '</td><td class="code">' + esc(f.cnpj || '') + '</td><td>' + esc([f.cidade, f.uf].filter(Boolean).join('/')) + '</td><td>' + esc(f.contato || '') + '</td><td>' + esc([f.email, f.fone].filter(Boolean).join(' · ')) + '</td><td>' + esc(f.prazoPgto || '') + '</td>' +
        '<td>' + (fa.length ? '<span class="chip warn" title="Falta: ' + esc(fa.join(', ')) + '">Incompleto</span>' : '<span class="chip ok">Completo</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<p class="note">' + (Object.keys(state.forn).length ? 'Nenhum fornecedor com essa busca.' : 'Nenhum fornecedor cadastrado ainda. Use a planilha acima para importar o cadastro.') + '</p>';
  }

  /* ---------- exportação (PDF e Excel) ---------- */
  function slug(t) { return String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
  function expName(buyer, ext) { return 'RV_Necessidades_' + (buyer === 'todos' ? 'Geral' : slug(buyer)) + '_' + state.an.refDate + '.' + ext; }
  function dateObj(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : '';
  }
  function setExpMsg(t, err) { var el = $('#expMsg'); el.textContent = t || ''; el.className = 'note' + (err ? ' err' : ''); }

  // Entregas: Marcas com mais atrasos primeiro; dentro de cada uma, ruptura e maior atraso primeiro.
  function ordenarPorMarca(list) {
    var gm = {};
    list.forEach(function (r) {
      var k = r.marca || '(sem marca)';
      var g = gm[k] || (gm[k] = { k: k, items: [], late: 0, rup: 0 });
      g.items.push(r);
      if (r.sit === 'atrasada') g.late++;
      if (r.emRup) g.rup++;
    });
    return [].concat.apply([], Object.keys(gm).map(function (k) { return gm[k]; })
      .sort(function (a, b) { return b.late - a.late || b.rup - a.rup || b.items.length - a.items.length || (a.k < b.k ? -1 : 1); })
      .map(function (g) { return g.items.sort(entCmp); }));
  }

  // Dados de um comprador (ou de todos), na ordem das telas.
  function exportSet(buyer, todas) {
    var an = state.an;
    var ok = function (r) { return buyer === 'todos' || r.comprador === buyer; };
    var out = {
      imin: an.imin.filter(ok),
      rep: an.rep.filter(ok).sort(function (a, b) { return an.order[a.comprador] - an.order[b.comprador] || b.valor - a.valor; }),
      ent: an.ent.filter(function (r) { return ok(r) && (todas || r.emRup); })
    };
    out.byBuyer = function (name) {
      var is = function (r) { return r.comprador === name; };
      return { imin: out.imin.filter(is), rep: out.rep.filter(is), ent: ordenarPorMarca(out.ent.filter(is)) };
    };
    return out;
  }

  function buyersOf(an, buyer) {
    return an.exportBuyers.filter(function (g) { return buyer === 'todos' || g.nome === buyer; });
  }

  function buildPdf(buyer, todas) {
    var JsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!JsPDF) throw new Error('A biblioteca de PDF não carregou. Recarregue a página e tente de novo.');
    var an = state.an, m = currentMeta(), S = exportSet(buyer, todas);
    var doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 36, y = M;
    var BLUE = [27, 77, 177], NAVY = [15, 42, 92], LATE = [214, 228, 255], GREY = [90, 101, 119], INK = [20, 25, 34];
    var auto = function (opts) { if (doc.autoTable) doc.autoTable(opts); else window.jspdf.autoTable(doc, opts); };
    var need = function (h) { if (y + h > H - 44) { doc.addPage(); y = M; } };
    var put = function (t, size, bold, color) {
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor.apply(doc, color || INK);
      doc.text(String(t), M, y);
    };
    var tabela = function (title, note, head, rows, cols) {
      need(70);
      put(title, 11, true); y += 12;
      if (note) { put(note, 8, false, GREY); y += 9; }
      if (!rows.length) { y += 4; put('Nenhum item.', 9, false, GREY); y += 22; return; }
      auto({
        startY: y + 2, head: [head], body: rows.map(function (r) { return r.c; }),
        margin: { left: M, right: M, top: M, bottom: 44 },
        styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak', lineColor: [216, 221, 229], lineWidth: 0.4, textColor: INK },
        headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' },
        columnStyles: cols || {},
        didParseCell: function (d) { if (d.section === 'body' && rows[d.row.index] && rows[d.row.index].late) d.cell.styles.fillColor = LATE; }
      });
      y = doc.lastAutoTable.finalY + 20;
    };
    var R = { halign: 'right' };
    var soma = function (l) { return l.reduce(function (t, r) { return t + r.valor; }, 0); };

    var blocoComprador = function (nome) {
      var d = S.byBuyer(nome);
      var late = d.ent.filter(function (r) { return r.emRup && r.sit === 'atrasada'; }).length;
      put(nome, 14, true, BLUE); y += 14;
      put('Rupturas: ' + fmtInt(d.imin.length) + ' (' + brl.format(soma(d.imin)) + ')   |   Reposição de 60 dias: ' + fmtInt(d.rep.length) + ' (' + brl.format(soma(d.rep)) + ')   |   Entregas atrasadas em ruptura: ' + fmtInt(late), 9, false, GREY); y += 18;

      tabela('Rupturas - compra imediata (' + fmtInt(d.imin.length) + ')',
        'Precisam de compra e estão em ruptura sem cobertura. Descoberto = parte da falta ainda sem compra.',
        ['Situação', 'Código', 'Descrição', 'Marca', 'Disp.', 'VendProt', 'Falta', 'Comprado', 'Descob.', 'Entrega', 'Pedido', 'Comprar', 'Valor'],
        d.imin.map(function (r) {
          return { late: r.sit === 'atrasada', c: [SIT[r.st][0] + (r.sit === 'atrasada' ? ' / entrega atrasada ' + r.dias + ' d' : ''), r.codigo, r.descricao, r.marca, fmtNum(nz(r.disponivel)), fmtNum(nz(r.vendprot)), fmtNum(r.falta), fmtNum(nz(r.comprado)), fmtNum(r.descob), isoToBr(r.dtentrega), r.pedido, fmtNum(r.comprar), brl.format(r.valor)] };
        }), { 2: { cellWidth: 150 }, 4: R, 5: R, 6: R, 7: R, 8: R, 11: R, 12: R });

      tabela('Entregas a cobrar (' + fmtInt(d.ent.length) + ')',
        (todas ? 'Todas as compras em aberto.' : 'Compras em aberto de itens em ruptura.') + ' Prazos calculados em ' + isoToBr(an.refDate) + '. Cobrar a Marca; antes, confirme com o recebimento se a mercadoria já chegou (o Comprado só baixa com a nota no Protheus).',
        ['Prazo', 'Marca', 'Pedido', 'Código', 'Descrição', 'Falta', 'Comprado', 'Entrega prevista', 'Atraso (d)', 'Precisa comprar'],
        d.ent.map(function (r) {
          return { late: r.sit === 'atrasada', c: [PRAZO[r.sit][0], r.marca, r.pedido, r.codigo, r.descricao, r.emRup ? fmtNum(r.falta) : '', fmtNum(nz(r.comprado)), isoToBr(r.dtentrega), r.sit === 'atrasada' ? fmtInt(r.dias) : '', nz(r.comprar) > 0 ? 'Sim' : 'Não'] };
        }), { 4: { cellWidth: 180 }, 5: R, 6: R, 8: R });

      tabela('Reposição de 60 dias (' + fmtInt(d.rep.length) + ')',
        'Estoque abaixo do ponto de pedido. Comprar leva o item de volta ao ponto de pedido.',
        ['Código', 'Descrição', 'Marca', 'Pto. pedido', 'Disp.', 'VendProt', 'Comprado', 'Dias est.', 'Comprar', 'Últ. preço', 'Valor', 'Situação'],
        d.rep.map(function (r) {
          return { late: r.sit === 'atrasada', c: [r.codigo, r.descricao, r.marca, fmtNum(nz(r.pontopedido)), fmtNum(nz(r.disponivel)), fmtNum(nz(r.vendprot)), fmtNum(nz(r.comprado)), nz(r.medcontr) > 0 ? fmtInt(nz(r.estdias)) : '-', fmtNum(r.comprar), fmtNum(nz(r.ultpreco)), brl.format(r.valor), (r.emRup ? 'Falta coberta' : '') + (r.sit === 'atrasada' ? (r.emRup ? ' / ' : '') + 'entrega atrasada ' + r.dias + ' d' : '')] };
        }), { 1: { cellWidth: 170 }, 3: R, 4: R, 5: R, 6: R, 7: R, 8: R, 9: R, 10: R });
    };

    // capa
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]); doc.rect(0, 0, W, 60, 'F');
    var logo = document.querySelector('.side-logo .logo img');
    var temLogo = !!(logo && logo.src.indexOf('data:image/png') === 0 && logo.naturalWidth);
    if (temLogo) {
      try {
        var lh = 38, lw = Math.round(lh * logo.naturalWidth / logo.naturalHeight), pad = 6;
        var px = W - M - lw - pad * 2, py = (60 - (lh + pad * 2)) / 2;
        doc.setFillColor(255, 255, 255); doc.roundedRect(px, py, lw + pad * 2, lh + pad * 2, 4, 4, 'F');
        doc.addImage(logo.src, 'PNG', px + pad, py + pad, lw, lh);
      } catch (e) { temLogo = false; }
    }
    y = 29; put('RV Necessidades - ' + (buyer === 'todos' ? 'Geral (todos os compradores)' : buyer), 17, true, [255, 255, 255]);
    y = 47; put('Data-base do relatório: ' + isoToBr(an.refDate) + '   |   Gerado em: ' + new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + '   |   Arquivo: ' + m.fileName, 8.5, false, [200, 214, 240]);
    y = 84;

    var lista = buyersOf(an, buyer);
    if (buyer === 'todos') {
      var tot = lista.reduce(function (t, g) { return { i: t.i + g.iminN, iv: t.iv + g.iminV, r: t.r + g.repN, rv: t.rv + g.repV, a: t.a + g.atrasN }; }, { i: 0, iv: 0, r: 0, rv: 0, a: 0 });
      tabela('Resumo por comprador', null,
        ['Comprador', 'Rupturas', 'Valor rupturas', 'Reposição 60 dias', 'Valor reposição', 'Entregas atrasadas em ruptura'],
        lista.map(function (g) { return { c: [g.nome, fmtInt(g.iminN), brl.format(g.iminV), fmtInt(g.repN), brl.format(g.repV), fmtInt(g.atrasN)] }; })
          .concat([{ c: ['Total', fmtInt(tot.i), brl.format(tot.iv), fmtInt(tot.r), brl.format(tot.rv), fmtInt(tot.a)] }]),
        { 1: R, 2: R, 3: R, 4: R, 5: R });
      var li = lateItems(an, 'todos');
      tabela('Cobrar agora: itens em ruptura com entrega atrasada (' + fmtInt(li.flat.length) + ' itens, ' + fmtInt(li.marcas) + ' Marcas)',
        'Falta = quanto as vendas lançadas superam o disponível. Comprado = quantidade do pedido ainda não recebida.',
        ['Marca', 'Pedido', 'Comprador', 'Código', 'Descrição', 'Falta', 'Comprado', 'Atraso (d)'],
        li.flat.map(function (x) { return { late: true, c: [x.r.marca, x.r.pedido, x.r.comprador, x.r.codigo, x.r.descricao, fmtNum(x.r.falta), fmtNum(nz(x.r.comprado)), fmtInt(x.r.dias)] }; }),
        { 4: { cellWidth: 200 }, 5: R, 6: R, 7: R });
      lista.forEach(function (g) { doc.addPage(); y = M; blocoComprador(g.nome); });
    } else {
      blocoComprador(buyer);
    }

    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 128, 140);
      if (temLogo && i > 1) {
        try { var sh = 22, sw = Math.round(sh * logo.naturalWidth / logo.naturalHeight); doc.addImage(logo.src, 'PNG', W - M - sw, 8, sw, sh); } catch (e) { /* sem logo */ }
      }
      doc.text('Uso interno e confidencial', M, H - 18);
      doc.text('Página ' + i + ' de ' + n, W - M, H - 18, { align: 'right' });
    }
    return { doc: doc, name: expName(buyer, 'pdf'), paginas: n };
  }

  function buildXlsx(buyer, todas) {
    if (typeof XLSX === 'undefined') throw new Error('A biblioteca de Excel não carregou. Recarregue a página e tente de novo.');
    var an = state.an, m = currentMeta(), S = exportSet(buyer, todas);
    var wb = XLSX.utils.book_new();
    var sheet = function (name, head, rows, o) {
      o = o || {};
      var ws = XLSX.utils.aoa_to_sheet([head].concat(rows), { cellDates: true });
      ws['!cols'] = head.map(function (h, i) { return { wch: (o.w && o.w[i]) || Math.max(10, String(h).length + 2) }; });
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length, 1), c: head.length - 1 } }) };
      Object.keys(ws).forEach(function (k) {
        if (k[0] === '!') return;
        var c = ws[k], col = XLSX.utils.decode_cell(k).c, row = XLSX.utils.decode_cell(k).r;
        if (row === 0) return;
        if (c.t === 'd') c.z = 'dd/mm/yyyy';
        else if (c.t === 'n' && o.money && o.money.indexOf(col) >= 0) c.z = '"R$" #,##0.00';
      });
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    var lista = buyersOf(an, buyer);
    var resumo = [['RV Necessidades - ' + (buyer === 'todos' ? 'Geral' : buyer)], ['Data-base do relatório', dateObj(an.refDate)], ['Gerado em', new Date()], ['Arquivo', m.fileName], []];
    var wsR = XLSX.utils.aoa_to_sheet(resumo.concat([['Comprador', 'Rupturas', 'Valor rupturas', 'Reposição 60 dias', 'Valor reposição', 'Entregas atrasadas em ruptura']],
      lista.map(function (g) { return [g.nome, g.iminN, g.iminV, g.repN, g.repV, g.atrasN]; })), { cellDates: true });
    wsR['!cols'] = [{ wch: 26 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 28 }];
    Object.keys(wsR).forEach(function (k) {
      if (k[0] === '!') return;
      var c = wsR[k], a = XLSX.utils.decode_cell(k);
      if (c.t === 'd') c.z = (a.r === 2) ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy';
      else if (c.t === 'n' && a.r >= 6 && (a.c === 2 || a.c === 4)) c.z = '"R$" #,##0.00';
    });
    XLSX.utils.book_append_sheet(wb, wsR, 'Resumo');

    sheet('Rupturas',
      ['Comprador', 'Situação', 'Código', 'Descrição', 'Marca', 'Disponível', 'VendProt', 'Falta', 'Comprado', 'Descoberto', 'Entrega prevista', 'Pedido', 'Comprar', 'Último preço', 'Valor'],
      S.imin.map(function (r) { return [r.comprador, SIT[r.st][0], r.codigo, r.descricao, r.marca, nz(r.disponivel), nz(r.vendprot), r.falta, nz(r.comprado), r.descob, dateObj(r.dtentrega), r.pedido, r.comprar, nz(r.ultpreco), r.valor]; }),
      { w: [16, 16, 10, 44, 16, 11, 10, 9, 10, 11, 15, 10, 10, 12, 14], money: [13, 14] });
    sheet('Reposição 60 dias',
      ['Comprador', 'Código', 'Descrição', 'Marca', 'Ponto de pedido', 'Disponível', 'VendProt', 'Comprado', 'Dias de estoque', 'Comprar', 'Último preço', 'Valor', 'Situação'],
      S.rep.map(function (r) { return [r.comprador, r.codigo, r.descricao, r.marca, nz(r.pontopedido), nz(r.disponivel), nz(r.vendprot), nz(r.comprado), nz(r.medcontr) > 0 ? Math.round(nz(r.estdias)) : '', r.comprar, nz(r.ultpreco), r.valor, (r.emRup ? 'Falta coberta' : '') + (r.sit === 'atrasada' ? (r.emRup ? ' / ' : '') + 'Entrega atrasada ' + r.dias + ' d' : '')]; }),
      { w: [16, 10, 44, 16, 15, 11, 10, 10, 15, 10, 12, 14, 30], money: [10, 11] });
    sheet(todas ? 'Entregas (todas em aberto)' : 'Entregas a cobrar',
      ['Comprador', 'Marca', 'Pedido', 'Código', 'Descrição', 'Prazo', 'Entrega prevista', 'Atraso (dias)', 'Falta', 'Comprado', 'Valor comprado', 'Precisa comprar'],
      ordenarPorMarca(S.ent).map(function (r) { return [r.comprador, r.marca, r.pedido, r.codigo, r.descricao, PRAZO[r.sit][0], dateObj(r.dtentrega), r.sit === 'atrasada' ? r.dias : '', r.emRup ? r.falta : '', nz(r.comprado), nz(r.prccompra) > 0 ? r.valor : '', nz(r.comprar) > 0 ? 'Sim' : 'Não']; }),
      { w: [16, 16, 10, 10, 44, 12, 15, 13, 9, 10, 15, 15], money: [10] });
    if (buyer === 'todos') {
      sheet('Alertas', ['Tipo', 'Alerta', 'Exemplos'],
        an.warnings.map(function (w) { return [w.level === 'info' ? 'Informação' : 'Atenção', w.text, (w.codes || []).join(', ')]; }), { w: [12, 90, 50] });
    }
    return { wb: wb, name: expName(buyer, 'xlsx') };
  }

  function exportar(fn, buyer, rotulo) {
    setExpMsg('Gerando ' + rotulo + '…');
    setTimeout(function () {
      try {
        var keep = state.an, r;
        state.an = state.anFull || state.an;
        try { r = fn(buyer, state.expTodas); } finally { state.an = keep; }
        if (r.doc) r.doc.save(r.name); else XLSX.writeFile(r.wb, r.name);
        setExpMsg(rotulo + ' gerado: ' + r.name + '. Procure na pasta de downloads do navegador.');
      } catch (e) { setExpMsg('Não foi possível gerar o ' + rotulo + ': ' + (e && e.message ? e.message : e), true); }
    }, 30);
  }

  /* ---------- eventos ---------- */
  $('#file').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) importFile(f, false);
  });
  $('#pick').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); }
  });
  var drop = $('#drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) importFile(f, false);
  });
  $('#status').addEventListener('click', function (e) {
    if (e.target && e.target.id === 'forceImp' && state.dup) importFile(state.dup, true);
  });
  $('#snapSel').addEventListener('change', function (e) { selectSnap(e.target.value); });
  $('#del').addEventListener('click', function () {
    if (!CFG.pode.excluir) return;
    if (!state.confirmDel) { state.confirmDel = true; render(); return; }
    var id = state.id;
    apiFetch(CFG.urls.relatorios + '/' + id + '/excluir', { method: 'POST' }).then(carregaEstado).then(function () {
      state.confirmDel = false;
      if (state.snaps.length) return selectSnap(state.snaps[0].id);
      state.id = null; state.an = null; state.anFull = null; state.rowsAll = null; render(); go('importar');
    }).then(function () { setStatus('ok', 'Relatório excluído.'); }, function (e) { state.confirmDel = false; render(); setStatus('err', esc(e.message)); });
  });
  $('#delNo').addEventListener('click', function () { state.confirmDel = false; render(); });
  $('#panel').addEventListener('input', function (e) {
    if (e.target.id !== 'q') return;
    state.q = e.target.value;
    if (state.page === 'atrasos') renderEntRows(); else renderCompraRows();
  });
  $('#panel').addEventListener('change', function (e) {
    if (e.target.id === 'sortRep') { state.sortRep = e.target.value; renderCompraRows(); }
    if (e.target.hasAttribute('data-sel')) { state.sel[e.target.getAttribute('data-sel')] = e.target.checked; renderSelBar(); }
    if (e.target.hasAttribute('data-selall')) {
      var lst = (state.shown && state.shown[e.target.getAttribute('data-selall')]) || [];
      lst.forEach(function (r) { if (e.target.checked) state.sel[r.codigo] = true; else delete state.sel[r.codigo]; });
      renderCompraRows();
    }
  });
  $('#panel').addEventListener('click', function (e) {
    if (e.target.closest('#lateGo')) { goLate('todos', state.an.late.rup ? 'rup' : 'todos'); return; }
    if (e.target.closest('#lateAll')) { goLate('todos', 'todos'); return; }
    if (e.target.closest('#selGen, [data-gen-sec]')) { criarDeSelecao(); return; }
    if (e.target.closest('#selClear')) { state.sel = {}; renderPage(); return; }
    var sc = e.target.closest('[data-scope]');
    if (sc) { state.entScope = sc.getAttribute('data-scope'); renderEntregas(); return; }
    var gp = e.target.closest('[data-grp]');
    if (gp) { state.entGroup = gp.getAttribute('data-grp'); renderEntregas(); return; }
    var ef = e.target.closest('[data-ef]');
    if (ef) { state.entF = ef.getAttribute('data-ef'); renderEntregas(); return; }
  });

  document.addEventListener('input', function (e) {
    var t = e.target, tb = t.getAttribute && t.getAttribute('data-hf');
    if (tb) {
      state.hf[tb][t.getAttribute('data-k')] = t.value;
      var bt = document.querySelector('[data-hf-clear="' + tb + '"]'); if (bt) bt.hidden = !hfAtivo(tb);
      if (tb === 'late') comFoco(function () { renderLate(state.an); });
      else if (tb === 'dv') comFoco(renderDiverg);
      else if (tb === 'td') { state.td.pg = 1; renderTodosRows(); }
      else if (tb === 'mt') renderMoedaItens();
      else if (tb === 'bl') renderBloqRows();
      else if (tb === 'ent') renderEntRows(); else renderCompraRows();
      return;
    }
    if (t.id === 'hf-b' || t.id === 'hf-p') { state.hfB = t.value; comFoco(renderBudgets); return; }
    if (t.id === 'hf-forms') { state.hfF = t.value; comFoco(renderDrawer); return; }
    if (t.id === 'tdq') { state.td.q = t.value; state.td.pg = 1; renderTodosRows(); return; }
    if (t.id === 'fnq') { state.fnq = t.value; renderFnList(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target, id = t.id;
    if (id === 'viewComp') { setView('comprador', t.value); return; }
    if (id === 'tdComp') { state.td.comp = t.value; state.td.pg = 1; renderTodosRows(); return; }
    if (id === 'tdGrupo') { state.td.grupo = t.value; state.td.pg = 1; renderTodosRows(); return; }
    if (id === 'tdSit') { state.td.sit = t.value; state.td.pg = 1; renderTodosRows(); return; }
    if (id === 'mtDias') { state.mt.dias = Math.max(1, parseInt(t.value, 10) || 60); renderMoeda(); renderMenu(); return; }
    if (id === 'mtPp') { state.mt.ppZero = t.checked; renderMoeda(); renderMenu(); return; }
    if (id === 'mtSo') { state.mt.soCompra = t.checked; renderMoeda(); renderMenu(); return; }
    if (id === 'mtModo') { state.mt.modo = t.value; renderMoeda(); renderMenu(); return; }
    if (id === 'mtMin') { state.mt.min = Math.max(0, parseFloat(t.value) || 0); renderMoeda(); renderMenu(); }
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var xp = e.target.closest('[data-xp]');
    if (xp) { exportarLista(xp.getAttribute('data-xp'), xp.getAttribute('data-xpg'), xp.getAttribute('data-xa')); return; }
    if (e.target.closest('[data-neg-toggle]')) { state.negoc = !state.negoc; renderNegoc(); return; }
    var o = e.target.closest('[data-neg-open]');
    if (o) { var k = o.getAttribute('data-neg-open'), sc = negScope(), cur = state.negOpen[k] != null ? state.negOpen[k] : (sc.modo === 'selecionados' && sc.cards.length <= 2); state.negOpen[k] = !cur; renderNegoc(); return; }
    var pr = e.target.closest('[data-neg-prop]');
    if (pr) anexarProposta(pr.getAttribute('data-neg-prop'));
  });
  window.addEventListener('hashchange', function () {
    var id = pageFromHash();
    if (id) { state.page = id; document.body.classList.remove('menu-open'); renderPage(); }
    else history.replaceState(null, '', '#/' + state.page);
  });
  $('#menuBtn').addEventListener('click', function () {
    var aberto = document.body.classList.toggle('menu-open');
    $('#menuBtn').setAttribute('aria-expanded', String(aberto));
  });
  document.addEventListener('click', function (e) {
    var n = e.target.closest && e.target.closest('[data-nav]');
    if (n) { setDrawerMsg(''); go(n.getAttribute('data-nav')); return; }
    var v = e.target.closest && e.target.closest('[data-view]');
    if (v) { setView(v.getAttribute('data-view') === 'geral' ? 'geral' : 'comprador'); return; }
    var vc = e.target.closest && e.target.closest('[data-view-comp]');
    if (vc) { setView('comprador', vc.getAttribute('data-view-comp')); return; }
    var dt = e.target.closest && e.target.closest('[data-dvtab]');
    if (dt) { state.dvTab = dt.getAttribute('data-dvtab'); renderDivPage(); return; }
    var so2 = e.target.closest && e.target.closest('[data-sort]');
    if (so2) {
      var pr = so2.getAttribute('data-sort').split(':'), tb2 = pr[0], k2 = pr[1], o2 = state.ord[tb2];
      state.ord[tb2] = { k: k2, dir: o2 && o2.k === k2 ? -o2.dir : 1 };
      if (tb2 === 'ent') renderEntregas(); else if (tb2 === 'mt') renderMoeda(); else if (tb2 === 'dv') renderDivPage(); else renderPage();
      return;
    }
    var so = e.target.closest && e.target.closest('[data-tdsort]');
    if (so) { var k = so.getAttribute('data-tdsort'); state.td.dir = state.td.sort === k ? -state.td.dir : 1; state.td.sort = k; renderTodos(); return; }
    var id = e.target.closest && e.target.closest('#tdPrev, #tdNext, #mtExp, [data-mt-ver], [data-mt-xls]');
    if (!id) return;
    if (id.id === 'tdPrev') { state.td.pg = Math.max(1, state.td.pg - 1); renderTodosRows(); }
    else if (id.id === 'tdNext') { state.td.pg++; renderTodosRows(); }
    else if (id.id === 'mtExp') exportarMoeda('');
    else if (id.hasAttribute('data-mt-ver')) { state.hf.mt = { c: '', m: id.getAttribute('data-mt-ver') }; renderMoeda(); }
    else if (id.hasAttribute('data-mt-xls')) exportarMoeda(id.getAttribute('data-mt-xls'));
  });
  document.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('[data-hf-clear]');
    if (!c) return;
    var tb = c.getAttribute('data-hf-clear'); state.hf[tb] = { c: '', m: '' };
    if (tb === 'late') renderLate(state.an); else if (tb === 'dv') renderDiverg(); else if (tb === 'td') renderTodos(); else if (tb === 'mt') renderMoeda(); else if (tb === 'ent') renderEntregas(); else renderPage();
  });
  $('#expBuyer').addEventListener('change', function (e) { state.expBuyer = e.target.value; });
  $('#expTodas').addEventListener('change', function (e) { state.expTodas = e.target.checked; });
  $('#expPdf').addEventListener('click', function () { exportar(buildPdf, state.expBuyer, 'PDF'); });
  $('#expXlsx').addEventListener('click', function () { exportar(buildXlsx, state.expBuyer, 'Excel'); });
  $('#expPdfAll').addEventListener('click', function () {
    var nomes = (state.anFull || state.an).exportBuyers.map(function (g) { return g.nome; }).filter(function (n) { return !/^(OCIOSO|INATIVO)/i.test(n); });
    if (!nomes.length) { setExpMsg('Não há compradores com itens neste relatório.', true); return; }
    var i = 0;
    setExpMsg('Gerando ' + nomes.length + ' PDFs…');
    (function proximo() {
      if (i >= nomes.length) { setExpMsg(nomes.length + ' PDFs gerados. Se o navegador pediu permissão para baixar vários arquivos, autorize.'); return; }
      try {
        var keep = state.an, r;
        state.an = state.anFull || state.an;
        try { r = buildPdf(nomes[i], state.expTodas); } finally { state.an = keep; }
        r.doc.save(r.name);
      } catch (e) { setExpMsg('Falha ao gerar o PDF de ' + nomes[i] + ': ' + (e && e.message ? e.message : e), true); return; }
      i++; setExpMsg('Gerando PDFs: ' + i + ' de ' + nomes.length + '…');
      setTimeout(proximo, 700);
    })();
  });

  /* ---------- pedidos de compra: formulário, aprovação e PDF ---------- */
  var UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
  var STATUS = {
    rascunho: ['Rascunho', 'info'], pendente: ['Aguardando aprovação', 'crit'], aprovado: ['Aprovado', 'ok'],
    devolvido: ['Devolvido ao comprador', 'warn'], recusado: ['Recusado', 'warn'], cancelado: ['Cancelado', 'info']
  };
  var FRETES = [['', 'Selecione'], ['CIF', 'CIF - frete por conta do fornecedor'], ['FOB', 'FOB - frete por conta do comprador'], ['RETIRADA', 'Retirada pelo comprador'], ['SEM', 'Sem frete']];
  var PAGTOS = ['', 'Boleto bancário', 'PIX', 'Transferência', 'Cartão', 'Outro'];
  var UNIDADES = ['UN', 'CX', 'PCT', 'RM', 'KG', 'M', 'L', 'PC', 'JG', 'FD', 'CT', 'RL', 'GL'];
  var brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  state.user = { tipo: CFG.escopo.tipo === 'proprios' ? 'comprador' : 'gestor', nome: CFG.escopo.tipo === 'proprios' ? CFG.escopo.compradorProtheus : CFG.usuario.nome };
  state.rowsAll = null; state.peds = []; state.forn = {}; state.empresa = {}; state.pedIdx = {};
  state.sel = {}; state.drawer = false; state.drawerTab = 'pendente'; state.pedAberto = null; state.pedEdit = false;
  state.budgets = { id: 'budgets', ativa: false, tolPreco: 10, descontarCompromissos: false, meses: {}, previas: {}, log: [], atualizadoPor: '', atualizadoEm: '' }; state.negoc = false; state.negOpen = {}; state.bgMes = ''; state.view = { modo: 'geral', comp: '' }; state.page = 'painel'; state.td = tdNovo(); state.mt = mtNovo(); state.dvTab = 'itens'; state.fnq = ''; state.anFull = null; state.fi = null; state.dv = { tipo: 'todos', comp: 'todos', ppSem: false }; state.hf = hfNovo(); state.hfB = ''; state.hfF = ''; state.confirmPrev = false; state.drawerSec = 'forms'; state.confirmAlc = false; state.pedErrTit = ''; state.vOk = [];
  state.pedSnap = ''; state.mNota = ''; state.confirmDelPed = false; state.pedErros = []; state.modo = null; state.fecharAviso = false;

  function ehGestor() { return state.user.tipo === 'gestor'; }
  function podeAprovar() { return !!CFG.pode.aprovarFormulario; }
  function podeCriar() { return !!CFG.pode.criarFormulario; }
  function podeCancelar() { return !!CFG.pode.cancelarFormulario; }
  function podePorBudget() { return !!CFG.pode.aprovarPorBudget; }
  function podeLancarBudget() { return !!CFG.pode.budgetLancar; }
  function podeRegrasBudget() { return !!CFG.pode.budgetRegras; }
  function podePrecoAcima() { return !!CFG.pode.precoAcima; }
  function podeCadastro() { return !!CFG.pode.cadastroFornecedor; }
  function podeEmpresa() { return !!CFG.pode.dadosEmpresa; }
  function podeVerBudget() { return podeVer('budget'); }
  function quem() {
    return CFG.usuario.nome + ' (' + CFG.usuario.nivelRotulo + ')';
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function r2(x) { return Math.round((nz(x) + 1e-9) * 100) / 100; }
  function soDigitos(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function dtHora(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  /* máscaras e validações */
  function maskCnpj(v) {
    var d = soDigitos(v).slice(0, 14);
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  function maskCep(v) { var d = soDigitos(v).slice(0, 8); return d.replace(/^(\d{5})(\d)/, '$1-$2'); }
  function maskFone(v) {
    var d = soDigitos(v).slice(0, 11);
    if (d.length <= 2) return d.length ? '(' + d : '';
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  var MASKS = { cnpj: maskCnpj, cep: maskCep, fone: maskFone };
  function cnpjValido(v) {
    var d = soDigitos(v);
    if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    var dv = function (len) {
      var w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], s = 0;
      for (var i = 0; i < len; i++) s += +d[i] * w[i];
      var r = s % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return dv(12) === +d[12] && dv(13) === +d[13];
  }

  /* armazenamento dos pedidos, fornecedores e dados da empresa */
  var memX = { pedidos: {}, forn: {}, conf: {} };
  /* ---------- formulários, fornecedores, budget e empresa: vêm do servidor, que confere quem pode o quê ---------- */
  function guardaPedido(np) {
    var i = state.peds.map(function (x) { return x.id; }).indexOf(np.id);
    if (i >= 0) state.peds[i] = clone(np); else state.peds.push(clone(np));
    reindexPeds();
  }
  function carregaFormularios() {
    if (!podeVer('formularios')) return Promise.resolve();
    return apiFetch(CFG.urls.formularios).then(function (r) {
      state.peds = r.pedidos; reindexPeds();
      if (!podeVerBudget()) { state.budgets.ativa = !!r.config.ativa; state.budgets.tolPreco = r.config.tolPreco; }
    });
  }
  function carregaFornecedores() {
    if (!podeVer('formularios') && !podeVer('fornecedores')) return Promise.resolve();
    return apiFetch(CFG.urls.fornecedores).then(function (r) { state.forn = {}; r.fornecedores.forEach(function (f) { state.forn[f.id] = f; }); });
  }
  function carregaBudget() {
    if (!podeVerBudget()) return Promise.resolve();
    return apiFetch(CFG.urls.budget).then(function (r) { state.budgets = r.budget; state.bgVersao = r.versao; });
  }
  function carregaEmpresa() {
    if (!podeVer('formularios') && !podeVer('fornecedores') && !podeVerBudget()) return Promise.resolve();
    return apiFetch(CFG.urls.empresa).then(function (r) { state.empresa = r.empresa; });
  }
  function carregaCompras() {
    return carregaFormularios().then(carregaBudget).then(carregaFornecedores).then(carregaEmpresa).catch(function (e) { flash(e.message, true); });
  }
  // cria um formulário no servidor: o número, a situação e o histórico são dele
  function criaPed(np, extra) {
    return apiJson(CFG.urls.formularios, 'POST', Object.assign({}, np, extra || {})).then(function (r) { guardaPedido(r.pedido); return r.pedido; });
  }
  function msgDeErro(e) { return (e && e.erros && e.erros.length ? e.erros.join(' ') : e && e.message ? e.message : String(e)); }
  function estadoOk() { return Promise.resolve(); }
  function proximoNumero() {
    var pre = 'SC-' + new Date().getFullYear() + '-', mx = 0;
    state.peds.forEach(function (p) {
      if (String(p.numero).indexOf(pre) === 0) { var n = parseInt(String(p.numero).slice(pre.length), 10); if (n > mx) mx = n; }
    });
    return pre + String(mx + 1).padStart(4, '0');
  }
  function reindexPeds() {
    var idx = {};
    state.peds.slice().sort(function (a, b) { return a.atualizadoEm < b.atualizadoEm ? -1 : 1; }).forEach(function (p) {
      if (p.status !== 'rascunho' && p.status !== 'pendente' && p.status !== 'aprovado') return;
      (p.itens || []).forEach(function (it) { idx[it.codigo] = { numero: p.numero, status: p.status }; });
    });
    state.pedIdx = idx;
  }
  function pedChip(codigo) {
    var x = state.pedIdx[codigo];
    return x ? ' <span class="chip info" title="Este item já está em um formulário de compra">' + esc(x.numero) + ' · ' + esc(STATUS[x.status][0].toLowerCase()) + '</span>' : '';
  }
  function log(p, acao, nota) {
    p.historico.push({ quando: new Date().toISOString(), quem: quem(), acao: acao, nota: nota || '' });
  }

  function localEntregaPadrao() {
    var e = state.empresa || {};
    return [e.endereco, e.bairro, e.cep, e.cidade && e.uf ? e.cidade + '/' + e.uf : (e.cidade || '')].filter(Boolean).join(' - ');
  }

  function novoPedido(comprador, marca, itens) {
    var f = state.forn['M:' + norm(marca)] || {};
    var agora = new Date().toISOString();
    var p = {
      id: 'ped-' + uid(), numero: proximoNumero(), protheus: '', status: 'rascunho', comprador: comprador,
      criadoPor: quem(), criadoEm: agora, atualizadoEm: agora, baseRelatorio: state.an ? state.an.refDate : '',
      fornecedor: {
        marca: marca || '', razao: f.razao || '', cnpj: f.cnpj || '', ie: f.ie || '', contato: f.contato || '', email: f.email || '',
        fone: f.fone || '', endereco: f.endereco || '', bairro: f.bairro || '', cep: f.cep || '', cidade: f.cidade || '', uf: f.uf || ''
      },
      itens: itens || [],
      pedido: {
        frete: '', freteValor: 0, transportadora: '', prazoPgto: f.prazoPgto || '', formaPgto: f.formaPgto || '', entrega: '',
        localEntrega: localEntregaPadrao(), refCotacao: '', desconto: 0, outras: 0, icmsFora: false, obs: ''
      },
      aprovacao: null, historico: [], moedaTroca: null
    };
    var nIm = (itens || []).filter(function (i) { return i.tipoNec === 'iminente'; }).length, nRe = (itens || []).filter(function (i) { return i.tipoNec === 'reposicao'; }).length;
    log(p, 'Formulário criado', itens && itens.length ? itens.length + ' item(ns) da necessidade de compra' + (nIm || nRe ? ' (' + nIm + ' ruptura(s), ' + nRe + ' de reposição de 60 dias)' : '') : 'em branco');
    return p;
  }
  // Sugere a embalagem de compra pela descrição (CX, PCT, FD, RL, KG). É só uma sugestão: o comprador confere.
  function guessUn(desc) {
    var t = ' ' + String(desc || '').toUpperCase() + ' ';
    if (/\sCX\.?\s/.test(t)) return 'CX';
    if (/\sPCT\.?\s/.test(t)) return 'PCT';
    if (/\sFD\.?\s/.test(t)) return 'FD';
    if (/\sRL\.?\s/.test(t)) return 'RL';
    if (/\sKG\s/.test(t)) return 'KG';
    return 'UN';
  }
  function itemDeLinha(r) {
    return { tipoNec: r.st === 'sem' || r.st === 'parcial' ? 'iminente' : 'reposicao', codigo: r.codigo, descricao: r.descricao || '', un: guessUn(r.descricao), qtd: nz(r.comprar), fator: 1, vunit: nz(r.ultpreco), icmsAliq: 0, ipiAliq: 0, origem: 'relatorio', precoRef: nz(r.ultpreco) };
  }
  function upsertFornecedor() { return Promise.resolve(); }   // o servidor atualiza o cadastro ao enviar ou aprovar
  function salvarPed(p) {
    return apiJson(CFG.urls.formularios + '/' + p.id, 'PUT', p).then(function (r) { guardaPedido(r.pedido); return r.pedido; });
  }

  /* cálculo do pedido: ICMS é informativo (já incluso no preço), salvo se marcado "por fora"; IPI é somado */
  function calcPedido(p) {
    var fora = !!p.pedido.icmsFora;
    var itens = p.itens.map(function (it) {
      var prod = r2(nz(it.qtd) * nz(it.vunit));
      var icms = r2(prod * nz(it.icmsAliq) / 100);
      var ipi = r2(prod * nz(it.ipiAliq) / 100);
      return { prod: prod, icms: icms, ipi: ipi, qtdTotal: nz(it.qtd) * (nz(it.fator) || 1), total: r2(prod + ipi + (fora ? icms : 0)) };
    });
    var s = function (k) { return r2(itens.reduce(function (t, x) { return t + x[k]; }, 0)); };
    var produtos = s('prod'), icms = s('icms'), ipi = s('ipi');
    var d = p.pedido;
    return {
      itens: itens, produtos: produtos, icms: icms, ipi: ipi, impostos: r2(icms + ipi), frete: r2(d.freteValor), outras: r2(d.outras), desconto: r2(d.desconto),
      geral: r2(produtos + ipi + (fora ? icms : 0) + nz(d.freteValor) + nz(d.outras) - nz(d.desconto))
    };
  }

  /* validação antes de enviar ou aprovar */
  function validar(p) {
    var e = [], f = p.fornecedor, d = p.pedido, fone = soDigitos(f.fone);
    if (!f.razao.trim()) e.push('Fornecedor: informe a Razão Social.');
    if (!cnpjValido(f.cnpj)) e.push('Fornecedor: CNPJ inválido ou não informado.');
    if (!f.endereco.trim()) e.push('Fornecedor: informe o endereço.');
    if (soDigitos(f.cep).length !== 8) e.push('Fornecedor: o CEP deve ter 8 dígitos.');
    if (!f.cidade.trim()) e.push('Fornecedor: informe a cidade.');
    if (UFS.indexOf(f.uf) < 0) e.push('Fornecedor: selecione a UF.');
    if (!f.contato.trim()) e.push('Fornecedor: informe o contato.');
    if (!f.email.trim() && !fone) e.push('Fornecedor: informe o e-mail ou o telefone.');
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.push('Fornecedor: e-mail inválido.');
    if (fone && fone.length !== 10 && fone.length !== 11) e.push('Fornecedor: o telefone deve ter DDD e 8 ou 9 dígitos.');
    if (!p.itens.length) e.push('Inclua ao menos um item.');
    p.itens.forEach(function (it, i) {
      var n = 'Item ' + (i + 1) + ': ';
      if (!String(it.descricao).trim()) e.push(n + 'informe a descrição.');
      if (!(nz(it.qtd) > 0)) e.push(n + 'a quantidade deve ser maior que zero.');
      if (!String(it.un).trim()) e.push(n + 'informe a unidade.');
      if (!(nz(it.fator) > 0)) e.push(n + 'o fator da quantidade total deve ser maior que zero.');
      if (!(nz(it.vunit) > 0)) e.push(n + 'o valor unitário deve ser maior que zero.');
      if (nz(it.icmsAliq) < 0 || nz(it.icmsAliq) > 100) e.push(n + 'a alíquota de ICMS deve estar entre 0 e 100.');
      if (nz(it.ipiAliq) < 0 || nz(it.ipiAliq) > 100) e.push(n + 'a alíquota de IPI deve estar entre 0 e 100.');
    });
    if (!d.frete) e.push('Pedido: selecione o tipo de frete.');
    if (!d.prazoPgto.trim()) e.push('Pedido: informe o prazo de pagamento.');
    if (!d.entrega) e.push('Pedido: informe a data de entrega prevista.');
    else if (d.entrega < todayIso()) e.push('Pedido: a entrega prevista está no passado.');
    if (nz(d.desconto) < 0 || nz(d.outras) < 0 || nz(d.freteValor) < 0) e.push('Pedido: frete, desconto e outras despesas não podem ser negativos.');
    return e;
  }

  /* permissões */
  function podeEditar(p) {
    if (podeAprovar() && (p.status === 'rascunho' || p.status === 'pendente' || p.status === 'devolvido')) return true;
    return podeCriar() && (p.status === 'rascunho' || p.status === 'devolvido');
  }
  function podeExcluir(p) {
    var ok = p.status === 'rascunho' || p.status === 'devolvido' || p.status === 'recusado' || p.status === 'cancelado';
    return ok && (podeCriar() || podeAprovar());
  }
  function meusPedidos() {
    if (!ehGestor()) return state.peds;
    var vc = viewComp();
    return vc === 'todos' ? state.peds : state.peds.filter(function (p) { return p.comprador === vc; });
  }

  /* perfil de teste (no sistema final virá do login) */
  function compradoresConhecidos() {
    var set = {};
    (state.rowsAll || []).forEach(function (r) { var n = r.comprador || ''; if (n && !/^(OCIOSO|INATIVO)/i.test(n)) set[n] = 1; });
    state.peds.forEach(function (p) { if (p.comprador) set[p.comprador] = 1; });
    return Object.keys(set).sort();
  }
  function renderUserBar() { /* a identidade vem do login (menu lateral); não há troca de perfil */ }
  function syncRole() {
    document.body.classList.toggle('role-comprador', !ehGestor());
    document.body.classList.toggle('sem-criar', !podeCriar());
    renderUserBar();
  }
  function computeAn() {
    var m = currentMeta();
    if (!m || !state.rowsAll) return;
    var rows = state.rowsAll;
    if (!ehGestor()) rows = rows.filter(ehDoComprador);
    state.anFull = analyze(rows, m.notes, m.refAt);
    var vc = viewComp();
    state.an = ehGestor() && vc !== 'todos'
      ? analyze(rows.filter(function (r) { return (r.comprador || '(sem comprador)') === vc; }), m.notes, m.refAt)
      : state.anFull;
  }
  /* seleção de itens e criação dos formulários */
  function chk(r) {
    return '<td class="chkcol"><input type="checkbox" data-sel="' + esc(r.codigo) + '"' + (state.sel[r.codigo] ? ' checked' : '') + ' aria-label="Selecionar ' + esc(r.codigo) + '"></td>';
  }
  function renderSelBar() { renderSelBar0(); renderNegoc(); }
  function renderSelBar0() {
    var el = $('#selBar');
    if (!el) return;
    var an = state.an, rows = an.imin.concat(an.rep).filter(function (r) { return state.sel[r.codigo]; });
    var nI = an.imin.filter(function (r) { return state.sel[r.codigo]; }).length, nR = rows.length - nI;
    ['imin', 'rep'].forEach(function (t) {
      var cb = document.querySelector('[data-selall="' + t + '"]'), l = (state.shown && state.shown[t]) || [];
      if (!cb) return;
      var n = l.filter(function (r) { return state.sel[r.codigo]; }).length;
      cb.checked = l.length > 0 && n === l.length; cb.indeterminate = n > 0 && n < l.length;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-gen-sec]'), function (b) { b.hidden = !rows.length; b.textContent = 'Gerar formulário dos marcados (' + fmtInt(rows.length) + ')'; });
    if (!rows.length) { el.hidden = true; el.innerHTML = ''; return; }
    var grupos = {};
    rows.forEach(function (r) { grupos[r.comprador + '|' + (r.marca || '(sem marca)')] = 1; });
    var jaEm = rows.filter(function (r) { return state.pedIdx[r.codigo]; }).length;
    el.hidden = false;
    el.innerHTML = '<b>' + fmtInt(rows.length) + ' selecionado(s)</b><span class="note">' + fmtInt(nI) + ' ruptura(s) · ' + fmtInt(nR) + ' reposição → ' + fmtInt(Object.keys(grupos).length) + ' formulário(s)</span>' +
      (jaEm ? ' <span class="chip warn">' + fmtInt(jaEm) + ' já em outro formulário</span>' : '') + '<span class="sp"></span>' +
      '<button type="button" class="btn ghost" data-neg-toggle>Moeda de troca</button><button type="button" class="btn ghost" id="selClear">Limpar</button><button type="button" class="btn" id="selGen">Gerar formulário</button>';
  }
  function criarDeSelecao(soMarca, prop) {
    var an = state.an, rows = an.imin.concat(an.rep).filter(function (r) { return state.sel[r.codigo] && (!soMarca || (r.marca || '(sem marca)') === soMarca); });
    if (!rows.length) return;
    var grupos = {}, ordem = [];
    rows.forEach(function (r) {
      var k = r.comprador + '|' + (r.marca || '');
      if (!grupos[k]) { grupos[k] = []; ordem.push(k); }
      grupos[k].push(r);
    });
    var criados = [], fila = Promise.resolve();
    ordem.forEach(function (k, i) {
      var g = grupos[k], np = novoPedido(g[0].comprador, g[0].marca || '', g.map(itemDeLinha));
      if (prop && i === 0) np.moedaTroca = prop;
      fila = fila.then(function () { return criaPed(np); }).then(function (sp) { criados.push(sp); });   // um de cada vez: cada formulário recebe o número seguinte
    });
    fila.then(function () {
      if (soMarca) rows.forEach(function (r) { delete state.sel[r.codigo]; }); else state.sel = {};
      renderCompraRows(); renderSelBar();
      setDrawerMsg(criados.length + ' formulário(s) criado(s): ' + criados.map(function (p) { return p.numero; }).join(', ') + '.');
      abrirDrawer(); abrirPedido(criados[0].id);
    }, function (e) { flash(msgDeErro(e), true); });
  }

  /* aba lateral */
  function setDrawerMsg(t, err) { var el = $('#drawerMsg'); if (!el) return; el.textContent = t || ''; el.className = 'note' + (err ? ' err' : ''); }
  function abrirDrawer() { if (state.page !== 'formularios') go('formularios'); else renderDrawer(); }
  function fecharDrawer() { renderDrawer(); }
  function contagemDrawer() {
    var l = meusPedidos(), c = { rascunho: 0, pendente: 0, aprovado: 0, devolvido: 0, todos: l.length, revisar: l.filter(precisaRevisar).length };
    l.forEach(function (p) {
      if (p.status === 'recusado' || p.status === 'cancelado' || p.status === 'devolvido') c.devolvido++; else c[p.status]++;
    });
    return c;
  }
  function renderDrawer() {
    if (!$('#nav')) return;
    renderMenu();
    if (state.page === 'formularios' && $('#drawerList')) renderForms();
    else if (state.page === 'budget' && $('#pgBody') && podeVerBudget()) renderBudgets();
    else if (state.page === 'divergencias' && $('#pgBody') && state.dvTab !== 'alertas') renderDiverg();
    else if (state.page === 'fornecedores' && $('#fxBlock')) renderFornecedores();
  }

  /* ---------- divergências a corrigir (resumo rápido) ---------- */
  var DIV_TIPOS = [
    ['semData', 'Em ruptura com compra e sem data de entrega', 'Informar no Protheus a data de entrega prometida pelo fornecedor.', 'Sem data de entrega'],
    ['semPedido', 'Comprado sem nº do pedido', 'Informar o número do pedido no Protheus.', 'Sem nº do pedido'],
    ['dispDec', 'Disponível sem a vírgula decimal', 'COMPRAR e RUPTURA do Protheus estão certos; a coluna Disponível do relatório perdeu a vírgula decimal (estoque fracionado). Corrigir a exportação do relatório e, se possível, o estoque fracionado no Protheus.', 'Disponível sem vírgula'],
    ['fMis', 'COMPRAR não confere com a fórmula', 'Conferir o cálculo no Protheus: PontoPedido − Disponível + VendProt − Comprado. Se não for o caso de vírgula decimal perdida, confira Disponível, VendProt e Comprado.', 'COMPRAR não confere'],
    ['dispFr', 'Disponível diferente de Físico − Reserva (informativo)', 'Só informativo. Normalmente o Disponível é Físico − Reserva. Se a diferença não tiver explicação (por exemplo, bloqueio de estoque), conferir o estoque no Protheus.', 'Disponível ≠ Físico − Reserva'],
    ['qMis', 'RUPTURA não confere com a fórmula', 'Conferir o cálculo no Protheus: menor valor entre 0 e Disponível − VendProt.', 'RUPTURA não confere'],
    ['qPos', 'Ruptura positiva', 'O esperado é zero ou negativa. Conferir o lançamento.', 'Ruptura positiva'],
    ['compradoNeg', 'Comprado negativo', 'Conferir o lançamento do pedido ou da nota no Protheus.', 'Comprado negativo'],
    ['pp', 'Ponto de pedido fora da regra', 'Ponto de pedido diferente de 2 × MedContr (tolerância de 1). Se o ajuste foi intencional, nada a fazer; se não foi, corrigir no Protheus.', 'PP fora da regra'],
    ['especial', 'Comprador especial com necessidade ou compra', 'Definir o comprador responsável no Protheus.', 'Comprador especial']
  ];
  // tipos só informativos: aparecem no quadro próprio e não entram no total de divergências a corrigir
  var DIV_INFO = { dispFr: 1 };
  // divergências do perfil atual (o comprador vê só as dele), todos os tipos
  function divBase() {
    var d = state.dv || { tipo: 'todos', comp: 'todos', ppSem: false }, base = state.an && state.an.div ? state.an.div : [];
    return base.filter(function (r) {
      return (ehGestor() ? (d.comp === 'todos' || r.comprador === d.comp) : r.comprador === state.user.nome) && (r.tipo !== 'pp' || r.nec || d.ppSem);
    });
  }
  // só as que pedem correção (sem as informativas)
  function divLista() { return divBase().filter(function (r) { return !DIV_INFO[r.tipo]; }); }
  function divFiltrada() {
    var out = divBase().filter(function (r) { return (state.dv.tipo === 'todos' ? !DIV_INFO[r.tipo] : r.tipo === state.dv.tipo) && hfMatch(r, 'dv'); }), cd = ordCmp('dv');
    return cd ? out.sort(cd) : out;
  }
  function renderDiverg() {
    var el = $('#pgBody'), an = state.an;
    if (!an) { el.innerHTML = '<p class="note">Importe um relatório para ver as divergências.</p>'; return; }
    var d = state.dv, baseL = divBase(), cnt = {}, imp = {}, lista = divFiltrada(), CAP = 300, nCorrigir = divLista().length;
    baseL.forEach(function (r) { cnt[r.tipo] = (cnt[r.tipo] || 0) + 1; imp[r.tipo] = (imp[r.tipo] || 0) + r.impacto; });
    var rot = {}; DIV_TIPOS.forEach(function (t) { rot[t[0]] = t; });
    var cards = '<button type="button" class="dv-card" data-dvt="todos" aria-pressed="' + (d.tipo === 'todos') + '"><span class="l">Todas (a corrigir)</span><b>' + fmtInt(nCorrigir) + '</b><span class="l">divergência(s)</span></button>' +
      DIV_TIPOS.filter(function (t) { return cnt[t[0]]; }).map(function (t) {
        return '<button type="button" class="dv-card" data-dvt="' + t[0] + '" aria-pressed="' + (d.tipo === t[0]) + '"><span class="l">' + esc(t[1]) + '</span><b>' + fmtInt(cnt[t[0]]) + '</b>' +
          (imp[t[0]] > 0 ? '<span class="l">' + brl.format(imp[t[0]]) + (t[0] === 'pp' ? ' a comprar' : ' em jogo') + '</span>' : '') + '</button>';
      }).join('');
    var comps = {}; (an.div || []).forEach(function (r) { comps[r.comprador] = 1; });
    var ppSemN = (an.div || []).filter(function (r) { return r.tipo === 'pp' && !r.nec && (!ehGestor() ? r.comprador === state.user.nome : (d.comp === 'todos' || r.comprador === d.comp)); }).length;
    var hint = d.tipo !== 'todos' && rot[d.tipo] ? '<p class="note"><b>O que fazer:</b> ' + esc(rot[d.tipo][2]) + '</p>' : '<p class="note">Escolha um tipo acima para ver o que fazer em cada caso. A tabela traz os itens com maior valor em jogo primeiro.</p>';
    var linhas = lista.slice(0, CAP).map(function (r) {
      return '<tr><td><span class="chip ' + (r.tipo === 'pp' || r.tipo === 'especial' || DIV_INFO[r.tipo] ? 'info' : 'warn') + '">' + esc(rot[r.tipo][3]) + '</span></td><td class="code">' + esc(r.codigo) + '</td><td class="desc">' + esc(r.descricao) + '</td><td>' + esc(r.marca) + '</td><td>' + esc(r.comprador) + '</td><td>' + esc(r.detalhe) + '</td><td class="num">' + (r.impacto > 0 ? brl.format(r.impacto) : '') + '</td></tr>';
    }).join('');
    el.innerHTML =
      '<p class="note">Resumo do relatório de <b>' + esc(isoToBr(an.refDate)) + '</b>. ' + (ehGestor() ? 'Cada divergência deve ser corrigida no Protheus pelo comprador responsável.' : 'São os itens sob a sua responsabilidade que precisam de correção no Protheus.') + '</p>' +
      '<div class="dv-sum">' + cards + '</div>' +
      '<div class="alc-top">' + (ehGestor() ? '<label for="dvComp">Comprador</label><select id="dvComp"><option value="todos">Todos</option>' + Object.keys(comps).sort().map(function (c) { return '<option value="' + esc(c) + '"' + (d.comp === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' : '') +
      '<label class="chk" for="dvPpSem" title="Itens com ponto de pedido fora da regra, mas sem necessidade de compra"><input type="checkbox" id="dvPpSem"' + (d.ppSem ? ' checked' : '') + '> Incluir PP fora da regra sem necessidade (' + fmtInt(ppSemN) + ')</label>' +
      (lista.length ? '<details class="menu ml-auto"><summary>Exportar ▾</summary><div class="menu-pop"><button type="button" id="dvExp">Baixar Excel</button><button type="button" data-xp="pdf" data-xpg="divergencias">Baixar PDF</button></div></details>' : '') + '</div>' +
      hint +
      ((baseL.length && (nCorrigir || d.tipo !== 'todos')) ? '<div class="tablewrap"><table class="alc dv-tab"><thead><tr>' + thS('dv', 'tp', 'Divergência', '') + '' + thS('dv', 'c', 'Código', '') + '' + thS('dv', 'd', 'Descrição', '') + '' + thS('dv', 'm', 'Marca', '') + '' + thS('dv', 'u', 'Comprador', '') + '' + thS('dv', 'de', 'O que está diferente', '') + '' + thS('dv', 'v', 'Valor em jogo', 'num') + '</tr>' + hfRow('dv', 7) + '</thead><tbody>' +
        (linhas || '<tr class="empty-row"><td colspan="7">Nenhuma divergência com esse filtro.</td></tr>') + '</tbody></table></div>' +
        '<p class="note">' + fmtInt(lista.length) + ' de ' + fmtInt(d.tipo === 'todos' ? nCorrigir : cnt[d.tipo] || 0) + ' divergência(s)' + (lista.length > CAP ? ', mostrando as ' + CAP + ' primeiras. Use os filtros ou baixe o Excel para ver todas' : '') + '.</p>'
        : '<p class="note">Nenhuma divergência para o filtro atual. ' + (ehGestor() ? '' : 'Seus itens passaram em todas as conferências.') + '</p>');
  }
  function exportarDivergencias() {
    if (typeof XLSX === 'undefined') { setDrawerMsg('A biblioteca de Excel não carregou. Recarregue a página e tente de novo.', true); return; }
    var an = state.an, lista = divFiltrada(), rot = {}, cnt = {}, imp = {};
    DIV_TIPOS.forEach(function (t) { rot[t[0]] = t; });
    divBase().filter(function (r) { return state.dv.tipo === 'todos' ? !DIV_INFO[r.tipo] : r.tipo === state.dv.tipo; }).forEach(function (r) { cnt[r.tipo] = (cnt[r.tipo] || 0) + 1; imp[r.tipo] = (imp[r.tipo] || 0) + r.impacto; });
    var wb = XLSX.utils.book_new();
    var res = [['Divergência', 'Quantidade', 'Valor em jogo (R$)', 'O que fazer']].concat(DIV_TIPOS.filter(function (t) { return cnt[t[0]]; }).map(function (t) { return [t[1], cnt[t[0]], r2(imp[t[0]]), t[2]]; }));
    var w1 = XLSX.utils.aoa_to_sheet(res); w1['!cols'] = [{ wch: 46 }, { wch: 12 }, { wch: 18 }, { wch: 100 }];
    var dados = [['Comprador', 'Divergência', 'Código', 'Descrição', 'Marca', 'O que está diferente', 'Valor em jogo (R$)', 'O que fazer', 'Corrigido? (marque)']].concat(lista.slice().sort(function (a, b) {
      return (a.comprador < b.comprador ? -1 : a.comprador > b.comprador ? 1 : 0);
    }).map(function (r) { return [r.comprador, rot[r.tipo][1], r.codigo, r.descricao, r.marca, r.detalhe, r2(r.impacto), rot[r.tipo][2], '']; }));
    var w2 = XLSX.utils.aoa_to_sheet(dados); w2['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 10 }, { wch: 46 }, { wch: 16 }, { wch: 56 }, { wch: 16 }, { wch: 70 }, { wch: 16 }];
    w2['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(dados.length - 1, 1), c: 8 } }) };
    XLSX.utils.book_append_sheet(wb, w1, 'Resumo'); XLSX.utils.book_append_sheet(wb, w2, 'Divergências');
    var nome = 'RV_Necessidades_Divergencias_' + (ehGestor() ? (state.dv.comp === 'todos' ? 'Geral' : slug(state.dv.comp)) : slug(state.user.nome)) + '_' + an.refDate + '.xlsx';
    XLSX.writeFile(wb, nome);
    setDrawerMsg('Excel gerado: ' + nome + ' (' + lista.length + ' divergência(s)). Procure na pasta de downloads do navegador.');
  }

  /* ---------- budget mensal por fornecedor e aprovação por budget ---------- */
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function pad2(n) { return String(n).padStart(2, '0'); }
  function ymDe(iso) { var d = new Date(iso); return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
  function ymAtual() { return ymDe(new Date().toISOString()); }
  function ymSomar(ym, n) {
    var a = ym.split('-'), m = +a[1] - 1 + n, y = +a[0] + Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + '-' + pad2(m + 1);
  }
  function ymRotulo(ym) { var a = ym.split('-'); return MESES[+a[1] - 1] + '/' + a[0]; }
  function ehAdm() { return podeLancarBudget(); }   // lançar budget (as regras do budget têm permissão própria)
  function chaveForn(marca) { return 'M:' + norm(marca); }
  function logBudget(acao) {
    var b = state.budgets, agora = new Date().toISOString();
    state.bgLogs = state.bgLogs || [];
    state.bgLogs.push(acao);                       // o servidor carimba quem e quando; aqui só aparece na hora
    b.log = b.log || [];
    b.atualizadoPor = quem(); b.atualizadoEm = agora;
    b.log.push({ quando: agora, quem: quem(), acao: acao });
    if (b.log.length > 300) b.log = b.log.slice(-300);
  }
  function acrescTotal(e) { return e && e.acresc ? e.acresc.reduce(function (t, a) { return t + nz(a.valor); }, 0) : 0; }
  function budgetTotal(e) { return e ? r2(nz(e.valor) + acrescTotal(e)) : 0; }
  function budgetDoMes(marca, ym) {
    var m = state.budgets.meses[ym];
    return m && m[chaveForn(marca)] ? m[chaveForn(marca)] : null;
  }

  /* preço do item contra o último preço do relatório: acima da tolerância só quem tem a permissão ajusta ou aprova; dentro da margem fica em destaque */
  function tolPreco() { return nz(state.budgets.tolPreco) || 0; }
  function precoVar(it) { var ref = nz(it.precoRef); return ref > 0 ? (nz(it.vunit) / ref - 1) * 100 : null; }
  function precoFaixa(it) {
    var v = precoVar(it);
    if (v === null) return 'sem';
    if (v > tolPreco() + 1e-9) return 'acima';
    return v > 1e-9 ? 'margem' : 'ok';
  }
  function itensPorFaixa(p, faixa) {
    return p.itens.map(function (it, i) { return precoFaixa(it) === faixa ? i : -1; }).filter(function (i) { return i >= 0; });
  }
  function fmtVar(v) { return (v > 0 ? '+' : '') + v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'; }
  function chipVar(it) {
    var v = precoVar(it), f = precoFaixa(it);
    if (v === null) return '<span class="note">-</span>';
    return f === 'acima' ? '<span class="chip crit">' + fmtVar(v) + '</span>' : f === 'margem' ? '<span class="chip warn">' + fmtVar(v) + '</span>' : '<span class="note">' + fmtVar(v) + '</span>';
  }
  function refTitulo(it) { return nz(it.precoRef) > 0 ? 'Último preço do relatório: ' + brl2.format(it.precoRef) : 'Sem preço de referência (item fora do relatório)'; }
  function precoChips(p) {
    if (itensPorFaixa(p, 'acima').length) return '<span class="chip crit">preço acima de ' + tolPreco() + '%</span> ';
    return itensPorFaixa(p, 'margem').length ? '<span class="chip warn">preço acima do último</span> ' : '';
  }
  function bannerPrecos(p) {
    var acima = itensPorFaixa(p, 'acima'), margem = itensPorFaixa(p, 'margem'), h = '';
    if (acima.length) h += '<div class="pv-banner crit"><b>Preço acima de ' + tolPreco() + '% do último preço</b> em ' + acima.length + ' item(ns) (' + acima.map(function (i) { return i + 1; }).join(', ') + '). Só quem tem permissão para preço acima da tolerância pode ajustar ou aprovar.</div>';
    if (margem.length) h += '<div class="pv-banner">' + margem.length + ' item(ns) com preço acima do último preço, dentro da margem de ' + tolPreco() + '% (' + margem.map(function (i) { return i + 1; }).join(', ') + '). Confira antes de aprovar.</div>';
    return h;
  }

  /* parcelas do pagamento: o prazo (ex.: 30/60/90 dias, 3x, à vista) vira parcelas iguais a partir da aprovação */
  function parcelasDoPedido(p) {
    var txt = String(p.pedido.prazoPgto || ''), dias = [], ok = true, mx = /(\d+)\s*x\b/i.exec(txt);
    if (/vista|antecip/i.test(txt) && !/\d{2,}/.test(txt)) dias = [0];
    else if (mx && +mx[1] > 0 && +mx[1] <= 60) { for (var i = 1; i <= +mx[1]; i++) dias.push(30 * i); }
    else dias = (txt.match(/\d+/g) || []).map(Number).filter(function (n) { return n >= 0 && n <= 365; });
    if (!dias.length) { dias = [0]; ok = false; }
    var total = calcPedido(p).geral, n = dias.length, base = r2(total / n), ref = new Date(p.aprovacao ? p.aprovacao.em : p.criadoEm);
    return {
      reconhecido: ok,
      parcelas: dias.map(function (d, i) {
        var dt = new Date(ref.getTime() + d * 86400000);
        return { dias: d, valor: i === n - 1 ? r2(total - base * (n - 1)) : base, ym: ymDe(dt.toISOString()) };
      })
    };
  }
  function textoParcelas(p) {
    var r = parcelasDoPedido(p);
    if (!r.reconhecido) return 'Prazo de pagamento não reconhecido: o valor é tratado como à vista. Use o formato 30/60/90 dias, 3x ou à vista.';
    var n = r.parcelas.length;
    return n + (n === 1 ? ' parcela' : ' parcelas') + ' de ' + r.parcelas.map(function (x) { return brl2.format(x.valor); }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' / ') +
      ', vencendo em ' + r.parcelas.map(function (x) { return x.dias + ' dias (' + ymRotulo(x.ym) + ')'; }).join(', ') + '.';
  }
  // parcelas de pedidos aprovados em meses anteriores que vencem em ym, por fornecedor
  function comprometidoPorMes(ym) {
    var mapa = {};
    state.peds.forEach(function (p) {
      if (p.status !== 'aprovado' || !p.aprovacao || ymDe(p.aprovacao.em) >= ym) return;
      parcelasDoPedido(p).parcelas.forEach(function (x) {
        if (x.ym !== ym) return;
        var k = chaveForn(p.fornecedor.marca), e = mapa[k] || (mapa[k] = { marca: p.fornecedor.marca, valor: 0 });
        e.valor = r2(e.valor + x.valor);
      });
    });
    return mapa;
  }
  function usoMes(marca, ym, excluirId) {
    var key = norm(marca), apr = 0, pend = 0, atual = ymAtual();
    state.peds.forEach(function (p) {
      if (p.id === excluirId || norm(p.fornecedor.marca) !== key) return;
      var g = calcPedido(p).geral;
      if (p.status === 'aprovado' && p.aprovacao && ymDe(p.aprovacao.em) === ym) apr += g;
      else if (p.status === 'pendente' && ym === atual) pend += g;
    });
    return { aprovado: r2(apr), pendente: r2(pend) };
  }
  function saldoBudget(marca, ym, excluirId, compMap) {
    var b = budgetDoMes(marca, ym), budget = budgetTotal(b), u = usoMes(marca, ym, excluirId);
    var cm = compMap || comprometidoPorMes(ym), c = cm[chaveForn(marca)], comp = c ? c.valor : 0;
    return { budget: budget, aprovado: u.aprovado, pendente: u.pendente, compromissos: comp, saldo: r2(budget - u.aprovado - u.pendente - (state.budgets.descontarCompromissos ? comp : 0)) };
  }

  function fornecedorHomologado(p) {
    var cnpj = soDigitos(p.fornecedor.cnpj);
    return cnpj.length === 14 && state.peds.some(function (x) {
      return x.id !== p.id && x.status === 'aprovado' && x.aprovacao && x.aprovacao.tipo !== 'budget' &&
        soDigitos(x.fornecedor.cnpj) === cnpj && norm(x.fornecedor.marca) === norm(p.fornecedor.marca);
    });
  }
  function elegivelBudget(p) {
    var m = [], ym = ymAtual(), total = calcPedido(p).geral, s = saldoBudget(p.fornecedor.marca, ym, p.id);
    if (!(s.budget > 0)) m.push('Este fornecedor não tem budget definido para ' + ymRotulo(ym) + '.');
    else if (total > s.saldo) m.push('O pedido excede o saldo do budget do mês deste fornecedor.');
    itensPorFaixa(p, 'acima').forEach(function (i) {
      m.push('Item ' + (i + 1) + (p.itens[i].codigo ? ' (' + p.itens[i].codigo + ')' : '') + ': preço mais de ' + tolPreco() + '% acima do último preço. Somente o ADM pode ajustar ou aprovar.');
    });
    if (!fornecedorHomologado(p)) m.push('Fornecedor ainda não aprovado pela gerência (primeiro pedido ou CNPJ novo).');
    var manuais = p.itens.filter(function (it) { return it.origem !== 'relatorio'; }).length;
    return { ok: m.length === 0, motivos: m, regra: { budget: s.budget, saldoAntes: s.saldo, total: total, mes: ym, tolPreco: tolPreco(), itensManuais: manuais } };
  }
  function ehAprovadoBudget(p) { return p.status === 'aprovado' && p.aprovacao && p.aprovacao.tipo === 'budget'; }
  function precisaRevisar(p) { return ehAprovadoBudget(p) && !p.aprovacao.revisadoEm; }

  function budgetInfo(p) {
    var ym = ymAtual(), s = saldoBudget(p.fornecedor.marca, ym, p.id), total = calcPedido(p).geral, l = [];
    var bd = budgetDoMes(p.fornecedor.marca, ym), acr = acrescTotal(bd);
    if (!(s.budget > 0)) l.push('Sem budget definido para ' + ymRotulo(ym) + ' para este fornecedor.');
    else l.push('Budget de ' + ymRotulo(ym) + ': ' + brl2.format(s.budget) + (acr > 0 ? ' (base ' + brl2.format(nz(bd.valor)) + ' + acréscimos ' + brl2.format(acr) + ')' : '') + '. Aprovado no mês: ' + brl2.format(s.aprovado) + '. Em aprovação: ' + brl2.format(s.pendente) +
      '. Compromissos de meses anteriores neste mês: ' + brl2.format(s.compromissos) + (state.budgets.descontarCompromissos ? ' (descontados do saldo)' : ' (informativo)') +
      '. Saldo: ' + brl2.format(s.saldo) + '. Este pedido: ' + brl2.format(total) + (total > s.saldo ? ', excede o saldo.' : ', cabe no saldo.'));
    l.push('Pagamento: ' + textoParcelas(p));
    return l;
  }
  function salvarBudgets() {
    var logs = (state.bgLogs || []).splice(0);
    state.bgFila = (state.bgFila || Promise.resolve()).then(function () {
      var b = clone(state.budgets); delete b.log;
      return apiJson(CFG.urls.budget, 'PUT', { budget: b, versao: state.bgVersao, logs: logs }).then(function (r) {
        state.bgVersao = r.versao; state.budgets.log = r.budget.log; state.budgets.atualizadoPor = r.budget.atualizadoPor; state.budgets.atualizadoEm = r.budget.atualizadoEm;
        setDrawerMsg('Budget salvo.');
      }, function (e) {
        setDrawerMsg(msgDeErro(e) + ' As mudanças não foram gravadas.', true);
        return carregaBudget().then(function () { renderDrawer(); });
      });
    });
    return state.bgFila;
  }
  function mesesDisponiveis() {
    var set = {}, atual = ymAtual();
    set[atual] = 1; set[ymSomar(atual, 1)] = 1;
    Object.keys(state.budgets.meses).forEach(function (k) { set[k] = 1; });
    return Object.keys(set).sort().reverse();
  }

  function diasParaFimDoMes() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate(); }
  function mesTemBudget(ym) { return Object.keys(state.budgets.meses[ym] || {}).length > 0; }
  function temPrevia(ym) { return !!(state.budgets.previas && state.budgets.previas[ym]); }
  // lembrete para o ADM: mês atual sem budget, ou últimos 7 dias do mês sem budget nem prévia do mês seguinte
  function lembreteBudget() {
    var atual = ymAtual(), prox = ymSomar(atual, 1);
    if (!mesTemBudget(atual) && !temPrevia(atual)) return 'atual';
    if (diasParaFimDoMes() <= 7 && !mesTemBudget(prox) && !temPrevia(prox)) return 'proximo';
    return '';
  }
  // consumo = pedidos aprovados (não cancelados) no mês da aprovação, por fornecedor
  function consumoPorMes(ym) {
    var mapa = {};
    state.peds.forEach(function (p) {
      if (p.status !== 'aprovado' || !p.aprovacao || ymDe(p.aprovacao.em) !== ym) return;
      var k = chaveForn(p.fornecedor.marca), e = mapa[k] || (mapa[k] = { marca: p.fornecedor.marca, valor: 0 });
      e.valor = r2(e.valor + calcPedido(p).geral);
    });
    return mapa;
  }
  // necessidade atual do relatório (iminentes + reposição) por fornecedor, em R$ pelo último preço
  function necessidadePorMarca() {
    var mapa = {};
    if (!state.an) return mapa;
    state.an.imin.concat(state.an.rep).forEach(function (r) { var k = chaveForn(r.marca || ''); mapa[k] = r2((mapa[k] || 0) + r.valor); });
    return mapa;
  }
  // média do consumido nos 3 últimos meses ENCERRADOS (o mês atual ainda está aberto). Entram os meses em que o fornecedor
  // esteve ativo (teve budget ou teve compra aprovada). Um mês ativo sem compra conta como zero.
  function baseMedia() {
    var out = {}, atual = ymAtual();
    for (var i = 1; i <= 3; i++) {
      var m = ymSomar(atual, -i), mes = state.budgets.meses[m] || {}, cons = consumoPorMes(m), ks = {};
      Object.keys(mes).forEach(function (k) { ks[k] = mes[k].marca; });
      Object.keys(cons).forEach(function (k) { ks[k] = cons[k].marca; });
      Object.keys(ks).forEach(function (k) {
        var bud = budgetTotal(mes[k]), con = cons[k] ? cons[k].valor : 0;
        if (!(bud > 0) && !(con > 0)) return;
        var o = out[k] || (out[k] = { marca: ks[k], cons: 0, n: 0, bud: 0, nBud: 0, semBudget: 0 });
        o.cons += con; o.n++;
        if (bud > 0) { o.bud += bud; o.nBud++; } else o.semBudget++;
      });
    }
    return out;
  }
  function gerarPrevia(ym) {
    var base = baseMedia(), itens = {}, n = 0, ja = state.budgets.meses[ym] || {}, nec = necessidadePorMarca();
    Object.keys(base).forEach(function (k) {
      if (ja[k]) return;
      var o = base[k], sug = r2(o.cons / o.n);
      itens[k] = { marca: o.marca, sugerido: sug, valor: sug, meses: o.n, mediaBud: o.nBud ? r2(o.bud / o.nBud) : null, semBudget: o.semBudget, necessidade: nec[k] || 0 };
      n++;
    });
    if (!n) return 0;
    state.budgets.previas = state.budgets.previas || {};
    state.budgets.previas[ym] = { geradaPor: quem(), geradaEm: new Date().toISOString(), itens: itens, base: 'consumido', refRelatorio: state.an ? state.an.refDate : '' };
    logBudget('Prévia de ' + ymRotulo(ym) + ' gerada pela média do consumido dos 3 últimos meses encerrados (' + n + ' fornecedor(es))');
    return n;
  }
  function oficializarPrevia(ym) {
    var pv = temPrevia(ym) ? state.budgets.previas[ym] : null;
    if (!pv) return 0;
    var mes = state.budgets.meses[ym] || (state.budgets.meses[ym] = {}), n = 0, tot = 0, aj = 0, zerados = [];
    Object.keys(pv.itens).forEach(function (k) {
      var it = pv.itens[k];
      if (mes[k]) return;
      if (!(nz(it.valor) > 0)) { zerados.push(it.marca); return; }
      mes[k] = { marca: it.marca, valor: nz(it.valor), por: quem(), em: new Date().toISOString(), acresc: [], origem: 'previa' };
      n++; tot += nz(it.valor); if (Math.abs(nz(it.valor) - nz(it.sugerido)) > 0.004) aj++;
    });
    delete state.budgets.previas[ym];
    logBudget('Budget de ' + ymRotulo(ym) + ' oficializado a partir da prévia: ' + n + ' fornecedor(es), total ' + brl2.format(tot) + ', ' + aj + ' valor(es) ajustado(s)' + (zerados.length ? '. Sem budget no mês (valor zero): ' + zerados.join(', ') : ''));
    return n;
  }
  function lancarAcrescimo(ym, key, valor, motivo) {
    var e = state.budgets.meses[ym] && state.budgets.meses[ym][key];
    if (!e) return 'Escolha um fornecedor que tenha budget neste mês.';
    if (!(valor > 0)) return 'Informe um valor de acréscimo maior que zero.';
    if (String(motivo || '').trim().length < 10) return 'Informe o motivo do acréscimo (mínimo de 10 caracteres).';
    e.acresc = e.acresc || [];
    e.acresc.push({ id: uid(), valor: r2(valor), motivo: String(motivo).trim(), por: quem(), em: new Date().toISOString() });
    logBudget('Acréscimo de ' + brl2.format(valor) + ' ao budget de ' + e.marca + ' em ' + ymRotulo(ym) + ': ' + String(motivo).trim());
    return '';
  }

  /* ---------- cadastro de fornecedores e budget por planilha (modelo, importar e exportar) ---------- */
  // [campo, cabeçalho, largura, apelidos aceitos no cabeçalho (sem acento, maiúscula ou pontuação)]
  var FX_COLS = [
    ['marca', 'MARCA', 24, ['marca', 'fornecedor']],
    ['razao', 'RAZAO_SOCIAL', 38, ['razaosocial', 'razao']],
    ['cnpj', 'CNPJ', 20, ['cnpj']],
    ['ie', 'INSCRICAO_ESTADUAL', 20, ['inscricaoestadual', 'inscestadual', 'ie']],
    ['contato', 'CONTATO', 24, ['contato']],
    ['email', 'EMAIL', 32, ['email', 'emaildecompras']],
    ['fone', 'TELEFONE', 18, ['telefone', 'fone']],
    ['endereco', 'ENDERECO', 38, ['endereco', 'logradouro']],
    ['bairro', 'BAIRRO', 20, ['bairro']],
    ['cep', 'CEP', 12, ['cep']],
    ['cidade', 'CIDADE', 22, ['cidade', 'municipio']],
    ['uf', 'UF', 6, ['uf', 'estado']],
    ['prazoPgto', 'PRAZO_PAGAMENTO', 20, ['prazopagamento', 'prazopgto', 'condicaopagamento', 'condpagamento', 'prazo']],
    ['formaPgto', 'FORMA_PAGAMENTO', 20, ['formapagamento', 'formapgto']],
    ['bmes', 'BUDGET_MES', 14, ['budgetmes', 'mesbudget', 'mesdobudget']],
    ['budget', 'BUDGET', 16, ['budget', 'budgetr', 'budgetbase', 'valorbudget']]
  ];
  var FX_CAMPOS = ['razao', 'cnpj', 'ie', 'contato', 'email', 'fone', 'endereco', 'bairro', 'cep', 'cidade', 'uf', 'prazoPgto', 'formaPgto'];
  var FX_ROT = { razao: 'Razão Social', cnpj: 'CNPJ', ie: 'I.E.', contato: 'Contato', email: 'E-mail', fone: 'Telefone', endereco: 'Endereço', bairro: 'Bairro', cep: 'CEP', cidade: 'Cidade', uf: 'UF', prazoPgto: 'Prazo de pagamento', formaPgto: 'Forma de pagamento' };
  var FX_ACAO = { novo: ['Novo', 'ok'], alterado: ['Alterado', 'info'], igual: ['Sem mudança', 'info'], erro: ['Erro', 'crit'] };

  function fxTxt(v) { return v == null ? '' : String(v).trim(); }
  function fxNumBR(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var s = fxTxt(v).replace(/R\$|\s/g, '');
    if (!s) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  }
  // mês do budget: mm/aaaa, aaaa-mm, dd/mm/aaaa, "nov/2026", data do Excel ou aaaamm. Devolve "aaaa-mm", '' se vazio e null se inválido
  function fxMes(v) {
    var s = fxTxt(v), m, ok = function (n) { return n >= 1 && n <= 12; };
    if (!s) return '';
    if (typeof v === 'number') {
      if (v > 20000 && v < 80000) { var d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1); }
      if (v >= 200001 && v <= 209912 && ok(v % 100)) return Math.floor(v / 100) + '-' + pad2(v % 100);
      return null;
    }
    if ((m = /^(\d{1,2})\s*[\/.\-]\s*(\d{4})$/.exec(s)) && ok(+m[1])) return m[2] + '-' + pad2(m[1]);
    if ((m = /^(\d{4})\s*[\/.\-]\s*(\d{1,2})$/.exec(s)) && ok(+m[2])) return m[1] + '-' + pad2(m[2]);
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)) && ok(+m[2])) return m[3] + '-' + pad2(m[2]);
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)) && ok(+m[2])) return m[1] + '-' + m[2];
    if ((m = /^([A-Za-zçÇ]+)\s*[\/.\- ]\s*(\d{4})$/.exec(s))) {
      var i = MESES.map(function (x) { return norm(x).slice(0, 3); }).indexOf(norm(m[1]).slice(0, 3));
      if (i >= 0) return m[2] + '-' + pad2(i + 1);
    }
    return null;
  }
  // valida e padroniza o valor de uma célula; o Excel costuma tirar o zero à esquerda de CNPJ e CEP digitados como número
  function fxNormalizar(campo, raw) {
    var s = fxTxt(raw), d;
    if (campo === 'cnpj') {
      d = soDigitos(s);
      if (d.length < 14) { var pd = d.padStart(14, '0'); if (cnpjValido(pd)) d = pd; }
      return cnpjValido(d) ? { v: maskCnpj(d) } : { erro: 'CNPJ inválido, confira os dígitos.' };
    }
    if (campo === 'cep') {
      d = soDigitos(s);
      if (d.length < 8 && typeof raw === 'number') d = d.padStart(8, '0');
      return d.length === 8 ? { v: maskCep(d) } : { erro: 'o CEP deve ter 8 dígitos.' };
    }
    if (campo === 'fone') {
      d = soDigitos(s);
      if ((d.length === 12 || d.length === 13) && d.slice(0, 2) === '55') d = d.slice(2);
      return d.length === 10 || d.length === 11 ? { v: maskFone(d) } : { erro: 'informe um só telefone, com DDD e 8 ou 9 dígitos.' };
    }
    if (campo === 'email') {
      s = s.toLowerCase();
      return /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(s) ? { v: s } : { erro: 'e-mail inválido (informe um só).' };
    }
    if (campo === 'uf') { s = s.toUpperCase(); return UFS.indexOf(s) >= 0 ? { v: s } : { erro: 'UF inválida (use a sigla com 2 letras).' }; }
    if (campo === 'formaPgto') {
      var n = norm(s), hit = PAGTOS.filter(function (x) { return x && norm(x).indexOf(n) === 0; });
      return n && hit.length === 1 ? { v: hit[0] } : { erro: 'use ' + PAGTOS.filter(Boolean).join(', ') + '.' };
    }
    return { v: s };
  }
  function fxFaltam(f) {
    var m = [];
    if (!fxTxt(f.razao)) m.push('Razão Social');
    if (!cnpjValido(f.cnpj)) m.push('CNPJ');
    if (!fxTxt(f.endereco)) m.push('Endereço');
    if (soDigitos(f.cep).length !== 8) m.push('CEP');
    if (!fxTxt(f.cidade)) m.push('Cidade');
    if (UFS.indexOf(f.uf) < 0) m.push('UF');
    if (!fxTxt(f.contato)) m.push('Contato');
    if (!fxTxt(f.email) && !soDigitos(f.fone)) m.push('E-mail ou telefone');
    return m;
  }
  function fxMarcasRelatorio() {
    var o = {};
    (state.rowsAll || []).forEach(function (r) { if (r.marca) o[chaveForn(r.marca)] = r.marca; });
    return o;
  }

  // lê a planilha e valida cada linha (o confronto com o cadastro e o budget atuais é feito em analisarFx, a cada tela)
  function lerPlanilhaFx(buf, nome) {
    if (typeof XLSX === 'undefined') throw new Error('A biblioteca de Excel não carregou. Recarregue a página e tente de novo.');
    var wb;
    try { wb = XLSX.read(buf, { type: 'array' }); } catch (e) { throw new Error('Não foi possível abrir o arquivo. Confira se é uma planilha Excel (.xlsx).'); }
    var aba = wb.SheetNames.filter(function (n) { return norm(n) === 'fornecedores'; })[0] || wb.SheetNames[0], ws = wb.Sheets[aba];
    if (!ws || !ws['!ref']) throw new Error('A aba "' + aba + '" está vazia.');
    var r0 = XLSX.utils.decode_range(ws['!ref']).s.r;
    var grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
    var hIdx = -1, map = {}, i;
    for (i = 0; i < Math.min(grid.length, 10) && hIdx < 0; i++) {
      var tmp = {};
      grid[i].forEach(function (c, ci) { var k = norm(c); FX_COLS.forEach(function (col) { if (tmp[col[0]] == null && col[3].indexOf(k) >= 0) tmp[col[0]] = ci; }); });
      if (tmp.marca != null) { hIdx = i; map = tmp; }
    }
    if (hIdx < 0) throw new Error('Não encontrei a coluna MARCA nas primeiras linhas da aba "' + aba + '". Use o modelo (botão "Baixar modelo").');
    if (!FX_COLS.some(function (c) { return c[0] !== 'marca' && map[c[0]] != null; })) throw new Error('A planilha só tem a coluna MARCA. Inclua ao menos uma coluna de dados ou de budget (use o modelo).');

    var linhas = [], vistos = {}, soMarca = 0;
    for (i = hIdx + 1; i < grid.length; i++) {
      var row = grid[i], get = function (c) { return map[c] == null ? '' : row[map[c]]; };
      if (Object.keys(map).every(function (c) { return fxTxt(get(c)) === ''; })) continue;
      var L = { n: i + r0 + 1, marca: fxTxt(get('marca')), vals: {}, erros: [], avisos: [], ym: '', budget: null, chave: '' };
      var temDado = FX_COLS.some(function (c) { return c[0] !== 'marca' && fxTxt(get(c[0])) !== ''; });
      if (L.marca && !temDado) { soMarca++; continue; }
      if (!L.marca) L.erros.push('MARCA vazia.');
      else {
        L.chave = chaveForn(L.marca);
        if (vistos[L.chave]) L.erros.push('Marca repetida (já aparece na linha ' + vistos[L.chave] + ').'); else vistos[L.chave] = L.n;
      }
      FX_CAMPOS.forEach(function (c) {
        if (map[c] == null || fxTxt(get(c)) === '') return;
        var x = fxNormalizar(c, get(c));
        if (x.erro) L.erros.push(FX_ROT[c] + ': ' + x.erro); else L.vals[c] = x.v;
      });
      if (L.vals.prazoPgto && !/vista|antecip|\d/i.test(L.vals.prazoPgto)) L.avisos.push('Prazo de pagamento não reconhecido: use 30/60/90 dias, 3x ou à vista.');
      if (fxTxt(get('budget')) !== '') {
        var v = fxNumBR(get('budget'));
        if (!isFinite(v) || v < 0) L.erros.push('BUDGET inválido: informe um valor em reais (zero ou maior).'); else L.budget = r2(v);
      }
      if (fxTxt(get('bmes')) !== '') {
        var ym = fxMes(get('bmes'));
        if (ym === null) L.erros.push('BUDGET_MES inválido: use mm/aaaa, por exemplo 11/2026.');
        else { L.ym = ym; if (L.budget == null && fxTxt(get('budget')) === '') L.avisos.push('BUDGET_MES sem valor em BUDGET: o mês foi ignorado.'); }
      }
      linhas.push(L);
    }
    if (!linhas.length) throw new Error('Nenhuma linha com dados' + (soMarca ? ' (' + soMarca + ' linha(s) só com a Marca foram ignoradas)' : '') + '. Preencha as colunas e importe de novo.');
    return { nome: nome, aba: aba, linhas: linhas, soMarca: soMarca, confirma: false };
  }

  // confronta a planilha lida com o cadastro e o budget de agora
  function analisarFx(fi) {
    var atual = ymAtual(), adm = ehAdm(), padrao = state.bgMes || atual, rel = fxMarcasRelatorio(), temRel = !!state.rowsAll;
    var res = { novos: 0, alterados: 0, iguais: 0, erros: 0, cnpjAlt: 0, bud: 0, budTotal: 0, budIgnorados: 0, meses: {} };
    var cnpjDe = {}, noArq = {};
    Object.keys(state.forn).forEach(function (k) { var d = soDigitos(state.forn[k].cnpj); if (d) (cnpjDe[d] = cnpjDe[d] || []).push(k); });
    fi.linhas.forEach(function (L) { if (L.vals.cnpj && L.chave && !L.erros.length) { var d = soDigitos(L.vals.cnpj); (noArq[d] = noArq[d] || []).push(L); } });
    fi.linhas.forEach(function (L) {
      var ex = L.chave ? state.forn[L.chave] : null, canon = L.chave && (rel[L.chave] || (ex && ex.marca)) || L.marca;
      L.nome = canon; L.alt = []; L.av = L.avisos.slice(); L.er = L.erros.slice(); L.budAcao = ''; L.budAnt = null; L.ymUsado = '';
      Object.keys(L.vals).forEach(function (c) {
        var novo = L.vals[c], ant = ex ? fxTxt(ex[c]) : '';
        var igual = c === 'cnpj' || c === 'cep' || c === 'fone' ? soDigitos(ant) === soDigitos(novo) : ant === novo;
        if (!igual) L.alt.push({ c: c, de: ant, para: novo });
      });
      var cn = L.alt.filter(function (a) { return a.c === 'cnpj' && a.de; })[0];
      if (cn) L.av.push('CNPJ alterado de ' + cn.de + ' para ' + cn.para + '. Confira: o CNPJ entra na regra de aprovação por budget.');
      if (L.vals.cnpj) {
        var d = soDigitos(L.vals.cnpj), outros = (cnpjDe[d] || []).filter(function (k) { return k !== L.chave; }).map(function (k) { return state.forn[k].marca; })
          .concat((noArq[d] || []).filter(function (x) { return x !== L; }).map(function (x) { return x.marca; }));
        if (outros.length) L.av.push('Mesmo CNPJ de ' + outros.filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + ' (normal só se for a mesma empresa com outra Marca).');
      }
      if (temRel && L.chave && !rel[L.chave] && !ex) L.av.push('Marca não encontrada no relatório atual: confira a grafia.');
      if (L.budget != null) {
        if (!adm) { L.budAcao = 'ignorado'; res.budIgnorados++; }
        else {
          var ym = L.ym || padrao, e = state.budgets.meses[ym] && state.budgets.meses[ym][L.chave];
          L.ymUsado = ym;
          if (ym < atual) L.er.push('Budget de ' + ymRotulo(ym) + ': mês encerrado, não aceita alteração.');
          else if (ym > ymSomar(atual, 2)) L.er.push('Budget de ' + ymRotulo(ym) + ': só são aceitos o mês atual e os dois seguintes. Confira BUDGET_MES.');
          else { L.budAnt = e ? nz(e.valor) : null; L.budAcao = L.budAnt == null ? 'novo' : Math.abs(L.budAnt - L.budget) < 0.005 ? 'igual' : 'alterado'; }
        }
      }
      var temBud = L.budAcao === 'novo' || L.budAcao === 'alterado';
      L.faltam = L.alt.length ? fxFaltam(Object.assign({}, ex || {}, L.vals)) : [];
      if (L.er.length) { L.acao = 'erro'; res.erros++; return; }
      if (!L.alt.length && !temBud) { L.acao = 'igual'; res.iguais++; return; }
      if (!ex && L.alt.length) { L.acao = 'novo'; res.novos++; } else { L.acao = 'alterado'; res.alterados++; }
      if (cn) res.cnpjAlt++;
      if (temBud) { res.bud++; res.budTotal += L.budget; res.meses[L.ymUsado] = 1; }
    });
    return res;
  }

  function aplicarFx() {
    var fi = state.fi;
    if (!fi) return;
    var res = analisarFx(fi), agora = new Date().toISOString(), jobs = [], logs = [], nBud = 0, nReg = 0, regs = [];
    if (!podeCadastro()) { setDrawerMsg('Você não tem permissão para alterar o cadastro de fornecedores.', true); return; }
    fi.linhas.forEach(function (L) {
      if (L.acao === 'erro' || L.acao === 'igual') return;
      var ex = state.forn[L.chave];
      if (L.alt.length) {
        var reg = Object.assign({ id: L.chave, marca: L.nome }, ex || {});
        L.alt.forEach(function (a) { reg[a.c] = a.para; });
        reg.atualizadoPor = quem(); reg.atualizadoEm = agora; reg.origem = 'planilha';
        regs.push(reg); nReg++;
        var cn = L.alt.filter(function (a) { return a.c === 'cnpj' && a.de; })[0];
        if (cn) logs.push('CNPJ de ' + reg.marca + ' alterado de ' + cn.de + ' para ' + cn.para + ' (planilha)');
      }
      if ((L.budAcao === 'novo' || L.budAcao === 'alterado') && podeLancarBudget()) {
        var mes = state.budgets.meses[L.ymUsado] || (state.budgets.meses[L.ymUsado] = {}), eb = mes[L.chave];
        if (eb) { eb.valor = L.budget; eb.por = quem(); eb.em = agora; }
        else mes[L.chave] = { marca: L.nome, valor: L.budget, por: quem(), em: agora, acresc: [], origem: 'planilha' };
        var pv = state.budgets.previas && state.budgets.previas[L.ymUsado];
        if (pv && pv.itens) { delete pv.itens[L.chave]; if (!Object.keys(pv.itens).length) delete state.budgets.previas[L.ymUsado]; }
        nBud++;
        if (nBud <= 25) logs.push('Budget de ' + L.nome + ' em ' + ymRotulo(L.ymUsado) + ': ' + (L.budAnt == null ? 'definido em ' : brl2.format(L.budAnt) + ' para ') + brl2.format(L.budget) + ' (planilha)');
      }
    });
    var meses = Object.keys(res.meses).sort().map(ymRotulo).join(', ');
    logBudget('Planilha de fornecedores "' + fi.nome + '" aplicada: ' + res.novos + ' cadastro(s) novo(s), ' + res.alterados + ' alterado(s), ' + res.cnpjAlt + ' alteração(ões) de CNPJ' +
      (nBud ? '; budget de ' + meses + ': ' + nBud + ' valor(es), total ' + brl2.format(res.budTotal) : '') + (res.erros ? '; ' + res.erros + ' linha(s) com erro ficaram de fora' : ''));
    logs.forEach(function (t) { logBudget(t); });
    if (nBud > 25) logBudget('... e mais ' + (nBud - 25) + ' valor(es) de budget da mesma planilha');
    state.fi = null;
    return (regs.length ? apiJson(CFG.urls.fornecedoresLote, 'POST', { registros: regs, origem: 'planilha ' + fi.nome }) : Promise.resolve()).then(function () {
      return nBud ? salvarBudgets() : null;
    }).then(carregaFornecedores).then(function () {
      setDrawerMsg('Planilha aplicada: ' + res.novos + ' novo(s), ' + res.alterados + ' alterado(s)' + (nBud ? '; budget de ' + meses + ': ' + nBud + ' valor(es)' : '') + '.');
      renderFxHost();
    }, function (e) { setDrawerMsg('Nada foi gravado: ' + msgDeErro(e), true); renderFxHost(); });
  }

  // linhas da planilha de saída: modelo (só as Marcas do relatório) ou exportação (cadastro, budget do mês e Marcas ainda sem dados)
  function fxLinhas(modelo) {
    var ym = state.bgMes || ymAtual(), mes = state.budgets.meses[ym] || {}, rel = fxMarcasRelatorio(), chaves = {}, rot = pad2(+ym.split('-')[1]) + '/' + ym.split('-')[0];
    var linha = function (nome, f, e) {
      return FX_COLS.map(function (c) {
        if (c[0] === 'marca') return nome;
        if (c[0] === 'bmes') return e ? rot : '';
        if (c[0] === 'budget') return e ? nz(e.valor) : '';
        return f ? fxTxt(f[c[0]]) : '';
      }).concat([modelo ? '' : f ? (fxFaltam(f).length ? 'Falta: ' + fxFaltam(f).join(', ') : 'Completo') : 'Sem cadastro']);
    };
    Object.keys(rel).forEach(function (k) { chaves[k] = 1; });
    if (!modelo) { Object.keys(state.forn).forEach(function (k) { chaves[k] = 1; }); Object.keys(mes).forEach(function (k) { chaves[k] = 1; }); }
    var nomeDe = function (k) { return (state.forn[k] && state.forn[k].marca) || (mes[k] && mes[k].marca) || rel[k]; };
    return Object.keys(chaves).sort(function (a, b) { return norm(nomeDe(a)) < norm(nomeDe(b)) ? -1 : 1; }).map(function (k) { return linha(nomeDe(k), modelo ? null : state.forn[k], modelo ? null : mes[k]); });
  }
  function fxInstrucoes() {
    var ym = state.bgMes || ymAtual();
    var cab = ['COLUNA', 'QUANDO É NECESSÁRIA', 'COMO PREENCHER'];
    var col = [
      ['MARCA', 'Sempre', 'Nome do fornecedor exatamente como aparece na coluna Marca do relatório do Protheus. É a chave que liga o cadastro, o budget e os formulários. Não mude a grafia de uma Marca já cadastrada: o sistema entende como outro fornecedor.'],
      ['RAZAO_SOCIAL', 'Para gerar o pedido', 'Razão social completa, como na nota fiscal.'],
      ['CNPJ', 'Para gerar o pedido', '14 dígitos, com ou sem pontuação. O sistema confere os dígitos verificadores. Se o Excel tirar o zero da frente, o sistema recoloca quando o CNPJ fecha.'],
      ['INSCRICAO_ESTADUAL', 'Opcional', 'Número da I.E. ou ISENTO.'],
      ['CONTATO', 'Para gerar o pedido', 'Nome da pessoa de contato no fornecedor.'],
      ['EMAIL', 'E-mail ou telefone', 'Um só e-mail. Não separe vários com vírgula ou ponto e vírgula.'],
      ['TELEFONE', 'E-mail ou telefone', 'Um só telefone, com DDD e 8 ou 9 dígitos.'],
      ['ENDERECO', 'Para gerar o pedido', 'Rua e número.'],
      ['BAIRRO', 'Opcional', ''],
      ['CEP', 'Para gerar o pedido', '8 dígitos, com ou sem hífen.'],
      ['CIDADE', 'Para gerar o pedido', ''],
      ['UF', 'Para gerar o pedido', 'Sigla com 2 letras (SP, MG...).'],
      ['PRAZO_PAGAMENTO', 'Recomendado', 'Ex.: 30/60/90 dias, 3x ou à vista. Já vem preenchido no formulário e gera as parcelas e os compromissos dos meses seguintes.'],
      ['FORMA_PAGAMENTO', 'Opcional', PAGTOS.filter(Boolean).join(', ') + '.'],
      ['BUDGET_MES', 'Só ao lançar budget', 'Mês do budget, no formato mm/aaaa (ex.: ' + pad2(+ym.split('-')[1]) + '/' + ym.split('-')[0] + '). Se ficar vazio, vale o mês que estiver selecionado na aba Budget no momento da importação. Aceita o mês atual e os dois seguintes.'],
      ['BUDGET', 'Só ao lançar budget (quem tem a permissão)', 'Valor-base do mês em reais, ex.: 25000 ou 25.000,00. Vazio = não mexe no budget. Zero = budget zerado. Os acréscimos já lançados no mês são mantidos. Somente Paulo e Andreia lançam budget.'],
      ['SITUACAO_CADASTRO', 'Não editar', 'Só na planilha exportada: mostra o que falta para gerar o pedido. É ignorada na importação.']
    ];
    var reg = [
      ['REGRAS'],
      ['1. Uma linha por fornecedor (Marca). Marca repetida na mesma planilha é erro.'],
      ['2. Célula vazia mantém o que já está cadastrado: a planilha nunca apaga um dado. Para corrigir, escreva o valor novo.'],
      ['3. Antes de gravar, o sistema mostra a conferência (novos, alterados, sem mudança e erros). Só entram as linhas sem erro. Importar o mesmo arquivo de novo é seguro.'],
      ['4. Alterações de CNPJ são destacadas e ficam no Registro de alterações da aba Budget.'],
      ['5. Esta planilha pode conter o budget. Nunca a envie a fornecedores: o fornecedor não pode ver o budget.'],
      ['6. Uma linha só com a Marca (sem nenhum outro dado) é ignorada. O modelo vem com as Marcas do último relatório importado.'],
      [''],
      ['EXEMPLO (fictício)'],
      ['MARCA: GAMA CARTAS | RAZAO_SOCIAL: GAMA CARTAS LTDA | CNPJ: 11.222.333/0001-81 | CONTATO: Maria | TELEFONE: (11) 3000-1000 | ENDERECO: Rua das Flores, 100 | CEP: 01310-100 | CIDADE: São Paulo | UF: SP | PRAZO_PAGAMENTO: 30/60/90 dias | BUDGET_MES: ' + pad2(+ym.split('-')[1]) + '/' + ym.split('-')[0] + ' | BUDGET: 25000']
    ];
    return [['Cadastro de fornecedores e budget por planilha'], ['Preencha a aba Fornecedores e use "Importar planilha" na aba Budget. Cabeçalhos em maiúsculas, sem acento, como no modelo.'], [''], cab].concat(col, [['']], reg);
  }
  function fxBaixar(modelo) {
    if (typeof XLSX === 'undefined') { setDrawerMsg('A biblioteca de Excel não carregou. Recarregue a página e tente de novo.', true); return; }
    var rows = fxLinhas(modelo), head = FX_COLS.map(function (c) { return c[1]; }).concat(['SITUACAO_CADASTRO (nao editar)']);
    var ws = XLSX.utils.aoa_to_sheet([head].concat(rows)), total = Math.max(rows.length + 150, 300), nc = head.length;
    ws['!cols'] = FX_COLS.map(function (c) { return { wch: c[2] }; }).concat([{ wch: 38 }]);
    for (var r = 1; r <= total; r++) {
      for (var c = 0; c < nc; c++) {
        var ad = XLSX.utils.encode_cell({ r: r, c: c }), cel = ws[ad], col = FX_COLS[c];
        if (col && col[0] === 'budget') { if (cel && cel.t === 'n') cel.z = '#,##0.00'; else if (!cel) ws[ad] = { t: 's', v: '' }; continue; }
        if (!cel) cel = ws[ad] = { t: 's', v: '' };
        cel.z = '@';
      }
    }
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: total, c: nc - 1 } });
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: total, c: nc - 1 } }) };
    var wi = XLSX.utils.aoa_to_sheet(fxInstrucoes());
    wi['!cols'] = [{ wch: 22 }, { wch: 26 }, { wch: 110 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fornecedores');
    XLSX.utils.book_append_sheet(wb, wi, 'Instruções');
    var nome = modelo ? 'RV_Necessidades_modelo_fornecedores.xlsx' : 'RV_Necessidades_fornecedores_' + todayIso() + '.xlsx';
    XLSX.writeFile(wb, nome);
    setDrawerMsg((modelo ? 'Modelo gerado' : 'Cadastro exportado') + ': ' + nome + ' (' + rows.length + ' fornecedor(es)). Procure na pasta de downloads do navegador.');
  }
  function importarPlanilhaFx(file) {
    file.arrayBuffer().then(function (buf) {
      state.fi = lerPlanilhaFx(buf, file.name);
      setDrawerMsg('');
      renderFxHost();
    }).catch(function (e) { state.fi = null; renderFxHost(); setDrawerMsg('Não foi possível ler a planilha: ' + (e && e.message ? e.message : e), true); });
  }

  function fxDif(L) {
    var p = [];
    if (L.acao === 'novo') {
      p.push('Cadastro novo: ' + L.alt.length + ' campo(s)' + (L.vals.razao ? ' · ' + esc(L.vals.razao) : '') + (L.vals.cnpj ? ' · ' + esc(L.vals.cnpj) : ''));
    } else if (L.alt.length) {
      L.alt.slice(0, 6).forEach(function (a) { p.push('<b>' + FX_ROT[a.c] + '</b>: ' + (a.de ? esc(a.de) + ' → ' : '') + esc(a.para)); });
      if (L.alt.length > 6) p.push('e mais ' + (L.alt.length - 6) + ' campo(s)');
    }
    if (L.budAcao === 'novo' || L.budAcao === 'alterado') p.push('<b>Budget ' + esc(ymRotulo(L.ymUsado)) + '</b>: ' + (L.budAnt == null ? 'novo ' : brl2.format(L.budAnt) + ' → ') + brl2.format(L.budget));
    if (L.budAcao === 'igual') p.push('Budget ' + esc(ymRotulo(L.ymUsado)) + ': ' + brl2.format(L.budget) + ' (já é esse valor)');
    if (L.budAcao === 'ignorado') p.push('Budget ignorado: você não tem permissão para lançar budget');
    return p.join('<br>');
  }
  function htmlPlanilhaFx() {
    var fi = state.fi, ks = Object.keys(state.forn), inc = ks.filter(function (k) { return fxFaltam(state.forn[k]).length; }).length, adm = ehAdm();
    var h = '<details class="alc-log fx"' + (fi || state.page === 'fornecedores' ? ' open' : '') + '><summary>Fornecedores e budget por planilha (Excel)</summary>' +
      '<p class="note">Cadastro dos dados dos fornecedores (usados nos formulários e no PDF do pedido) e, se quiser, o budget do mês, na mesma planilha. Fornecedores cadastrados: <b>' + ks.length + '</b>' + (inc ? ' (' + inc + ' com cadastro incompleto)' : '') + '. ' +
      'Budget sem BUDGET_MES na planilha vai para <b>' + esc(ymRotulo(state.bgMes || ymAtual())) + '</b>, o mês selecionado acima; a exportação também traz o budget desse mês.' + (adm ? '' : ' Seu perfil não lança budget: a coluna BUDGET será ignorada.') + '</p>' +
      '<div class="alc-top"><button type="button" class="btn ghost" id="fxModelo">Baixar modelo</button><button type="button" class="btn ghost" id="fxExp">Exportar cadastro e budget</button><button type="button" class="btn" id="fxImp">Importar planilha</button></div>';
    if (fi) {
      var res = analisarFx(fi), aplicar = res.novos + res.alterados, ord = { erro: 0, novo: 2, alterado: 3, igual: 4 };
      var mostrar = fi.linhas.filter(function (L) { return L.acao !== 'igual'; }).sort(function (a, b) {
        var ka = ord[a.acao] - (a.av.length && a.acao !== 'erro' ? 0.5 : 0), kb = ord[b.acao] - (b.av.length && b.acao !== 'erro' ? 0.5 : 0);
        return ka - kb || a.n - b.n;
      });
      var corpo = mostrar.slice(0, 150).map(function (L) {
        var a = FX_ACAO[L.acao], ruim = L.acao === 'erro';
        return '<tr class="fx-' + L.acao + '"><td class="num">' + L.n + '</td><td><b>' + esc(L.nome || L.marca || '(vazia)') + '</b></td><td><span class="chip ' + a[1] + '">' + a[0] + '</span></td><td>' + (ruim ? '<span class="note">Esta linha não será gravada.</span>' : fxDif(L)) + '</td><td>' +
          L.er.map(function (t) { return '<span class="chip crit">' + esc(t) + '</span>'; }).join('<br>') +
          (!ruim && L.av.length ? L.av.map(function (t) { return '<span class="chip warn">' + esc(t) + '</span>'; }).join('<br>') : '') +
          (!ruim && L.faltam && L.faltam.length ? (L.av.length ? '<br>' : '') + '<span class="note">Cadastro incompleto: falta ' + esc(L.faltam.join(', ')) + '</span>' : '') + '</td></tr>';
      }).join('');
      h += '<div class="pv-card"><div class="pv-head"><b>Conferência da planilha</b> <span class="chip warn">ainda não gravado</span></div>' +
        '<p class="note">Arquivo <b>' + esc(fi.nome) + '</b> (aba ' + esc(fi.aba) + '): ' + fi.linhas.length + ' linha(s) com dados' + (fi.soMarca ? ' e ' + fi.soMarca + ' só com a Marca (ignorada(s))' : '') + '. ' +
        '<b>' + res.novos + '</b> novo(s), <b>' + res.alterados + '</b> alterado(s), ' + res.iguais + ' sem mudança, <b>' + res.erros + '</b> com erro' + (res.erros ? ' (ficam de fora)' : '') + '.' +
        (res.cnpjAlt ? ' <b>' + res.cnpjAlt + ' alteração(ões) de CNPJ: confira.</b>' : '') +
        (res.bud ? ' Budget: <b>' + res.bud + '</b> valor(es) em ' + esc(Object.keys(res.meses).sort().map(ymRotulo).join(', ')) + ', total ' + brl2.format(res.budTotal) + '.' : '') +
        (res.budIgnorados ? ' ' + res.budIgnorados + ' valor(es) de budget ignorado(s): você não tem permissão para lançar budget.' : '') + '</p>' +
        (corpo ? '<div class="tablewrap"><table class="alc fx-tab"><thead><tr><th class="num">Linha</th><th>Fornecedor (Marca)</th><th>Situação</th><th>O que muda</th><th>Erros e avisos</th></tr></thead><tbody>' + corpo + '</tbody></table></div>' +
          (mostrar.length > 150 ? '<p class="note">Mostrando as 150 primeiras de ' + mostrar.length + ' linhas com novidade (erros primeiro).</p>' : '') : '') +
        '<div class="alc-top">' + (aplicar ? '<button type="button" class="btn ' + (fi.confirma ? '' : 'ghost') + '" id="fxAplicar">' + (fi.confirma ? 'Confirmar: gravar ' + aplicar + ' linha(s)' : 'Aplicar ' + aplicar + ' linha(s)') + '</button>' : '<span class="note">Nada a gravar nesta planilha.</span>') +
        '<button type="button" class="btn ghost" id="fxCancelar">' + (aplicar ? 'Cancelar' : 'Fechar') + '</button></div></div>';
    }
    return h + '</details>';
  }

  function marcasConhecidas() {
    var o = {};
    Object.keys(state.forn).forEach(function (k) { if (state.forn[k].marca) o[k] = state.forn[k].marca; });
    var rel = fxMarcasRelatorio(); Object.keys(rel).forEach(function (k) { o[k] = rel[k]; });
    return Object.keys(o).map(function (k) { return o[k]; }).sort(function (a, b) { return norm(a) < norm(b) ? -1 : 1; });
  }
  function preencherDoCadastro() {
    var p = state.pedAberto, f = state.forn[chaveForn(p.fornecedor.marca)];
    if (!f || p.fornecedor.razao || p.fornecedor.cnpj) return false;
    ['razao', 'cnpj', 'ie', 'contato', 'email', 'fone', 'endereco', 'bairro', 'cep', 'cidade', 'uf'].forEach(function (c) {
      p.fornecedor[c] = f[c] || ''; var el = document.getElementById(fid('fornecedor.' + c)); if (el) el.value = p.fornecedor[c];
    });
    ['prazoPgto', 'formaPgto'].forEach(function (c) {
      if (!p.pedido[c] && f[c]) { p.pedido[c] = f[c]; var el = document.getElementById(fid('pedido.' + c)); if (el) el.value = f[c]; }
    });
    return true;
  }
  // campos do formulário que divergem de um dado já cadastrado
  function camposDivergentes(p) {
    var f = p.fornecedor.marca && state.forn[chaveForn(p.fornecedor.marca)];
    if (!f) return [];
    return ['razao', 'cnpj', 'ie', 'contato', 'email', 'fone', 'endereco', 'bairro', 'cep', 'cidade', 'uf'].filter(function (c) {
      var a = fxTxt(f[c]), b = fxTxt(p.fornecedor[c]);
      return a !== '' && (c === 'cnpj' || c === 'cep' || c === 'fone' ? soDigitos(a) !== soDigitos(b) : a !== b);
    }).map(function (c) { return FX_ROT[c]; });
  }
  function htmlDifCad(p) {
    var dif = camposDivergentes(p);
    if (!dif.length) return '';
    return '<p class="m-alert">Diferente do cadastro: <b>' + dif.join(', ') + '</b>. ' +
      (podeCadastro() ? 'Ao aprovar, o cadastro passa a usar os dados deste formulário.' : 'O cadastro só é atualizado por quem tem essa permissão, quando aprova o pedido.') + '</p>';
  }

  function hfBudget(id, cols) {
    return '<tr class="hf"><th colspan="' + cols + '"><div class="hf-in"><span class="hf-l">Filtrar</span><input type="search" id="' + id + '" placeholder="Marca / fornecedor" aria-label="Filtrar por Marca ou fornecedor" value="' + esc(state.hfB || '') + '"></div></th></tr>';
  }
  function renderBudgets() {
    var adm = ehAdm(), regras = podeRegrasBudget(), b = state.budgets, atual = ymAtual();
    if (!state.bgMes) state.bgMes = atual;
    var ym = state.bgMes, editavel = adm && ym >= atual, dis = editavel ? '' : ' disabled', passado = ym < atual;
    var mes = b.meses[ym] || {}, comp = comprometidoPorMes(ym), nomes = {};
    Object.keys(mes).forEach(function (k) { nomes[k] = mes[k].marca; });
    Object.keys(comp).forEach(function (k) { if (!nomes[k]) nomes[k] = comp[k].marca; });
    var chaves = Object.keys(nomes).sort(function (x, y) { return nomes[x] < nomes[y] ? -1 : 1; });
    var marcas = {};
    (state.rowsAll || []).forEach(function (r) { if (r.marca) marcas[r.marca] = 1; });
    var tot = { base: 0, acr: 0, total: 0, aprovado: 0, pendente: 0, comp: 0, saldo: 0, sobra: 0 }, fb = norm(state.hfB || '');
    var linhas = chaves.map(function (k) {
      var e = mes[k], s = saldoBudget(nomes[k], ym, null, comp), base = nz(e && e.valor), acr = acrescTotal(e), total = budgetTotal(e);
      tot.base += base; tot.acr += acr; tot.total += total; tot.aprovado += s.aprovado; tot.pendente += s.pendente; tot.comp += s.compromissos;
      tot.saldo += total > 0 ? s.saldo : 0; tot.sobra += Math.max(0, total - s.aprovado);
      if (fb && norm(nomes[k]).indexOf(fb) < 0) return '';
      var ult = passado
        ? '<td class="num">' + brl2.format(Math.max(0, r2(total - s.aprovado))) + '</td>'
        : '<td class="num">' + (total > 0 ? (s.saldo < 0 ? '<span class="chip crit">' + brl2.format(s.saldo) + '</span>' : brl2.format(s.saldo)) : '<span class="chip warn">sem budget</span>') + '</td>';
      return '<tr><td><b>' + esc(nomes[k]) + '</b></td>' +
        '<td class="num"><input type="number" min="0" step="0.01" data-bg="' + esc(k) + '" data-marca="' + esc(nomes[k]) + '" value="' + esc(base) + '"' + dis + ' aria-label="Budget base de ' + esc(nomes[k]) + ' em ' + esc(ymRotulo(ym)) + '"></td>' +
        '<td class="num">' + (acr > 0 ? '+' + brl2.format(acr) : '-') + '</td><td class="num"><b>' + brl2.format(total) + '</b></td>' +
        '<td class="num">' + brl2.format(s.aprovado) + '</td><td class="num">' + (passado ? '-' : brl2.format(s.pendente)) + '</td><td class="num">' + brl2.format(s.compromissos) + '</td>' + ult +
        '<td>' + (editavel && e ? '<button type="button" class="btn ghost mini" data-bg-rm="' + esc(k) + '" title="Remover" aria-label="Remover ' + esc(nomes[k]) + '">×</button>' : '') + '</td></tr>';
    }).join('');

    // acréscimos do mês
    var acList = [];
    Object.keys(mes).forEach(function (k) { (mes[k].acresc || []).forEach(function (a) { acList.push({ k: k, marca: mes[k].marca, a: a }); }); });
    acList.sort(function (x, y) { return x.a.em < y.a.em ? 1 : -1; });
    var comBudget = Object.keys(mes).sort(function (x, y) { return mes[x].marca < mes[y].marca ? -1 : 1; });

    // prévia pela média dos 3 últimos meses
    var pv = temPrevia(ym) ? b.previas[ym] : null, bloco = '';
    if (ym >= atual) {
      if (pv) {
        var ch = Object.keys(pv.itens).sort(function (x, y) { return pv.itens[x].marca < pv.itens[y].marca ? -1 : 1; }), totPv = 0;
        var lp = ch.map(function (k) {
          var it = pv.itens[k]; totPv += nz(it.valor);
          if (fb && norm(it.marca).indexOf(fb) < 0) return '';
          var aj = Math.abs(nz(it.valor) - nz(it.sugerido)) > 0.004, atualCons = usoMes(it.marca, atual, null).aprovado;
          return '<tr><td><b>' + esc(it.marca) + '</b>' + (it.semBudget ? '<br><span class="chip warn" title="Comprou em ' + it.semBudget + ' mês(es) sem budget definido">comprou sem budget</span>' : '') + '</td>' +
            '<td class="num"><b>' + brl2.format(nz(it.sugerido)) + '</b><br><span class="note">' + it.meses + (it.meses > 1 ? ' meses' : ' mês') + '</span>' + (nz(it.sugerido) === 0 ? '<br><span class="chip warn">sem consumo</span>' : '') + '</td>' +
            '<td class="num">' + (it.mediaBud == null ? '-' : brl2.format(it.mediaBud)) + '</td><td class="num">' + brl2.format(atualCons) + '</td>' +
            '<td class="num">' + brl2.format(nz(it.necessidade)) + '</td><td class="num">' + brl2.format(nz(comp[k] && comp[k].valor)) + '</td>' +
            '<td class="num"><input type="number" min="0" step="0.01" data-pv="' + esc(k) + '" value="' + esc(nz(it.valor)) + '"' + (adm ? '' : ' disabled') + ' aria-label="Valor da prévia de ' + esc(it.marca) + '">' + (aj ? '<br><span class="chip warn">ajustado</span>' : '') + '</td>' +
            '<td>' + (adm ? '<button type="button" class="btn ghost mini" data-pv-rm="' + esc(k) + '" title="Tirar da prévia" aria-label="Tirar ' + esc(it.marca) + ' da prévia">×</button>' : '') + '</td></tr>';
        }).join('');
        bloco = '<div class="pv-card"><div class="pv-head"><b>PRÉVIA de ' + esc(ymRotulo(ym)) + '</b> <span class="chip warn">ainda não vale</span></div>' +
          '<p class="note">Base: <b>média do consumido</b> (pedidos aprovados, sem os cancelados) nos 3 últimos meses encerrados, só nos meses em que o fornecedor esteve ativo. Gerada por ' + esc(pv.geradaPor) + ' em ' + esc(dtHora(pv.geradaEm)) + '. As outras colunas servem de comparação: o budget médio que foi reservado, o consumido no mês atual até hoje e a necessidade de compra do relatório de ' + esc(isoToBr(pv.refRelatorio || '')) + '. Enquanto não for oficializada, o comprador não aprova por budget neste mês.' + (adm ? '' : ' Somente o ADM ajusta e oficializa.') + '</p>' +
          '<div class="tablewrap"><table class="alc"><thead><tr><th>Fornecedor (Marca)</th><th class="num">Média do consumido (base)</th><th class="num">Média do budget (ref.)</th><th class="num">Consumido no mês atual</th><th class="num">Necessidade do relatório</th><th class="num">Compromissos no mês</th><th class="num">Valor da prévia (R$)</th><th></th></tr>' + hfBudget('hf-p', 8) + '</thead><tbody>' + (lp || '<tr class="empty-row"><td colspan="8">Nenhum fornecedor com esse filtro.</td></tr>') +
          '</tbody><tfoot><tr><td>Total</td><td></td><td></td><td></td><td></td><td></td><td class="num">' + brl2.format(totPv) + '</td><td></td></tr></tfoot></table></div>' +
          (adm ? '<div class="alc-top"><button type="button" class="btn ' + (state.confirmPrev ? '' : 'ghost') + '" id="pvOficializar">' + (state.confirmPrev ? 'Confirmar: oficializar budget de ' + esc(ymRotulo(ym)) : 'Oficializar budget de ' + esc(ymRotulo(ym))) + '</button>' +
            (state.confirmPrev ? '<button type="button" class="btn ghost" id="pvNo">Cancelar</button>' : '') + '<button type="button" class="btn ghost" id="pvDescartar">Descartar prévia</button></div>' : '') + '</div>';
      } else if (adm) {
        var diasFim = diasParaFimDoMes(), faltam = Object.keys(baseMedia()).filter(function (k) { return !mes[k]; }).length;
        if (faltam > 0) {
          bloco = '<div class="pv-card"><b>Prévia pela média do consumido dos 3 últimos meses</b><p class="note">O sistema calcula a média do que foi efetivamente consumido (pedidos aprovados) nos 3 últimos meses encerrados, para ' + faltam + ' fornecedor(es)' + (Object.keys(mes).length ? ' que ainda não têm budget neste mês' : '') + ' e monta uma prévia para você ajustar e oficializar.' +
            (ym === ymSomar(atual, 1) && diasFim <= 7 ? ' Faltam ' + diasFim + ' dia(s) para o fim do mês.' : '') + '</p><button type="button" class="btn" id="pvGerar">Gerar prévia de ' + esc(ymRotulo(ym)) + '</button></div>';
        } else if (!Object.keys(mes).length) {
          bloco = '<div class="pv-card"><b>Prévia pela média do consumido dos 3 últimos meses</b><p class="note">Ainda não há budget nem pedidos aprovados nos 3 últimos meses encerrados, então não há média para calcular. Defina os valores manualmente abaixo.</p></div>';
        }
      }
    }

    var resumo = Object.keys(b.meses).sort().reverse().map(function (m) {
      var t = { n: 0, bud: 0, acr: 0, apr: 0, sobra: 0 };
      Object.keys(b.meses[m]).forEach(function (k) {
        var e = b.meses[m][k], u = usoMes(e.marca, m, null), bt = budgetTotal(e);
        t.n++; t.bud += nz(e.valor); t.acr += acrescTotal(e); t.apr += u.aprovado; t.sobra += Math.max(0, bt - u.aprovado);
      });
      return '<tr><td>' + esc(ymRotulo(m)) + '</td><td class="num">' + t.n + '</td><td class="num">' + brl2.format(t.bud) + '</td><td class="num">' + brl2.format(t.acr) + '</td><td class="num">' + brl2.format(t.apr) + '</td><td class="num">' + (m < atual ? brl2.format(t.sobra) + ' (expirou)' : brl2.format(t.sobra)) + '</td></tr>';
    }).join('');
    var ultimos = (b.log || []).slice(-8).reverse();
    var semBudgetMes = ym >= atual && !Object.keys(mes).length && !pv;
    var compN = Object.keys(comp).length, compTotal = Object.keys(comp).reduce(function (t, k) { return t + comp[k].valor; }, 0);
    var lem = adm ? lembreteBudget() : '';

    $('#pgBody').innerHTML =
      '<div class="alc-sw ' + (b.ativa ? 'on' : '') + '"><div><b>Aprovação por budget: ' + (b.ativa ? 'LIGADA' : 'desligada') + '</b><br><span class="note">' +
      (b.ativa ? 'O comprador pode aprovar o próprio pedido quando TODAS as condições abaixo forem cumpridas. Fora disso, o pedido segue para a gerência.' : 'Todos os pedidos passam pela aprovação da gerência ou da diretoria.') + '</span></div>' +
      (regras ? '<button type="button" class="btn ' + (state.confirmAlc ? '' : 'ghost') + '" id="bgSwitch">' + (state.confirmAlc ? (b.ativa ? 'Confirmar desligamento' : 'Confirmar ativação') : (b.ativa ? 'Desligar' : 'Ligar')) + '</button>' +
        (state.confirmAlc ? '<button type="button" class="btn ghost" id="bgSwitchNo">Cancelar</button>' : '') : '') + '</div>' +
      (lem === 'proximo' ? '<div class="m-alert">Faltam <b>' + diasParaFimDoMes() + ' dia(s)</b> para o fim do mês e o budget de <b>' + esc(ymRotulo(ymSomar(atual, 1))) + '</b> ainda não tem valores nem prévia. Selecione o mês seguinte para gerar a prévia.</div>' : '') +
      (semBudgetMes ? '<div class="m-alert">O budget de <b>' + esc(ymRotulo(ym)) + '</b> ainda não foi definido para nenhum fornecedor. A verba do mês anterior não acumula. ' + (adm ? 'Gere a prévia, defina abaixo ou copie do mês anterior.' : 'Aguarde o ADM definir.') + '</div>' : '') +
      (ym >= atual && compTotal > 0 ? '<div class="m-alert"><b>Compromissos de meses anteriores</b> que vencem em ' + esc(ymRotulo(ym)) + ': <b>' + brl2.format(compTotal) + '</b> em ' + compN + ' fornecedor(es), de pedidos parcelados ou com prazo acima de 30 dias. ' + (b.descontarCompromissos ? 'Eles já estão descontados do saldo.' : 'Considere esse valor ao definir o budget do mês.') + '</div>' : '') +
      '<details class="alc-regras"><summary>Condições para o comprador aprovar por budget</summary><ol>' +
      '<li>O fornecedor tem budget definido para o mês atual (valores oficiais; a prévia não vale).</li><li>O pedido cabe no saldo do budget do mês (base mais acréscimos, menos o aprovado e o em aprovação' + (b.descontarCompromissos ? ', e menos os compromissos de meses anteriores' : '') + ').</li>' +
      '<li>O fornecedor já teve um pedido aprovado pela gerência, com o mesmo CNPJ.</li>' +
      '<li>Nenhum preço está mais de ' + tolPreco() + '% acima do último preço do relatório. Acima disso, só quem tem a permissão ajusta ou aprova. Dentro da margem, o preço aparece em destaque.</li></ol>' +
      '<p class="note">Itens fora do relatório são permitidos e aparecem na revisão. Os pedidos aprovados por budget ficam numa lista para revisão da gerência e podem ser cancelados. O fornecedor nunca vê o budget: ele não aparece no PDF.</p></details>' +
      '<div class="alc-top"><label for="bgMes">Mês</label><select id="bgMes">' + mesesDisponiveis().map(function (m) {
        return '<option value="' + m + '"' + (m === ym ? ' selected' : '') + '>' + esc(ymRotulo(m)) + (m === atual ? ' (mês atual)' : m > atual ? ' (próximo)' : '') + (temPrevia(m) ? ' - prévia' : '') + '</option>';
      }).join('') + '</select>' +
      (editavel ? '<button type="button" class="btn ghost" id="bgCopy">Copiar do mês anterior</button>' : '') +
      (passado ? '<span class="note">Mês encerrado: somente leitura. A verba não utilizada expirou.</span>' : (adm ? '' : '<span class="note"><b>Seu perfil não tem permissão para lançar budget: somente leitura.</b> Perfil atual: ' + esc(quem()) + '. Para lançar, troque o perfil de teste no topo da página.</span>')) + '</div>' +
      bloco +
      (editavel ? '<div class="bg-h"><b>1. Budget do mês (início do mês)</b><span class="note">Digite a Marca e o valor e clique em Adicionar. O valor-base de cada fornecedor fica na tabela abaixo e pode ser corrigido ali. Verba extra durante o mês é o acréscimo (mais abaixo).</span></div>' : '') +
      (editavel ? '<div class="dnew bg-add"><input type="text" id="bgMarca" list="dlMarcas" placeholder="Marca / fornecedor" aria-label="Marca do fornecedor"><input type="number" id="bgValor" min="0" step="0.01" placeholder="Budget do mês (R$)" aria-label="Valor do budget do mês"><button type="button" class="btn" id="bgAdd">Adicionar</button></div>' +
        '<datalist id="dlMarcas">' + Object.keys(marcas).sort().map(function (m) { return '<option value="' + esc(m) + '">'; }).join('') + '</datalist>' : '') +
      (chaves.length ? '<div class="tablewrap"><table class="alc"><thead><tr><th>Fornecedor (Marca)</th><th class="num">Budget base (R$)</th><th class="num">Acréscimos</th><th class="num">Total do mês</th><th class="num">Aprovado no mês</th><th class="num">Em aprovação</th><th class="num" title="Parcelas de pedidos de meses anteriores que vencem neste mês">Compromissos anteriores</th><th class="num">' + (passado ? 'Não utilizado (expirou)' : 'Saldo do mês') + '</th><th></th></tr>' + hfBudget('hf-b', 9) + '</thead><tbody>' + (linhas || '<tr class="empty-row"><td colspan="9">Nenhum fornecedor com esse filtro.</td></tr>') +
        '</tbody><tfoot><tr><td>Total</td><td class="num">' + brl2.format(tot.base) + '</td><td class="num">' + brl2.format(tot.acr) + '</td><td class="num">' + brl2.format(tot.total) + '</td><td class="num">' + brl2.format(tot.aprovado) + '</td><td class="num">' + (passado ? '-' : brl2.format(tot.pendente)) + '</td><td class="num">' + brl2.format(tot.comp) + '</td><td class="num">' + brl2.format(passado ? tot.sobra : tot.saldo) + '</td><td></td></tr></tfoot></table></div>'
        : '<p class="note">Nenhum fornecedor com budget oficial em ' + esc(ymRotulo(ym)) + '.' + (editavel ? ' Digite a Marca e o valor acima e clique em Adicionar.' : '') + '</p>') +
      htmlPlanilhaFx() +
      (editavel && comBudget.length ? '<div class="ac-form"><b>2. Acréscimo de budget</b><span class="note">Verba extra durante o mês, além do budget base. Fica registrado com motivo, autor e data.</span>' +
        '<select id="acForn" aria-label="Fornecedor do acréscimo">' + comBudget.map(function (k) { return '<option value="' + esc(k) + '">' + esc(mes[k].marca) + '</option>'; }).join('') + '</select>' +
        '<input type="number" id="acValor" min="0" step="0.01" placeholder="Valor (R$)" aria-label="Valor do acréscimo"><input type="text" id="acMotivo" placeholder="Motivo (obrigatório)" aria-label="Motivo do acréscimo">' +
        '<button type="button" class="btn" id="acAdd">Lançar acréscimo</button></div>' : '') +
      (acList.length ? '<details class="alc-log"><summary>Acréscimos de ' + esc(ymRotulo(ym)) + ' (' + acList.length + ')</summary><ul>' + acList.map(function (x) {
        return '<li>' + esc(dtHora(x.a.em)) + ' · ' + esc(x.a.por) + ' · <b>' + esc(x.marca) + '</b> +' + brl2.format(x.a.valor) + ': ' + esc(x.a.motivo) +
          (editavel ? ' <button type="button" class="btn ghost mini" data-ac-rm="' + esc(x.k) + '|' + esc(x.a.id) + '" aria-label="Remover acréscimo">×</button>' : '') + '</li>';
      }).join('') + '</ul></details>' : '') +
      '<div class="alc-top"><label for="bgTol">Tolerância de preço (%)</label><input type="number" id="bgTol" min="0" step="0.1" value="' + esc(nz(b.tolPreco)) + '"' + (regras ? '' : ' disabled') + '>' +
      '<label class="chk" for="bgDesc"><input type="checkbox" id="bgDesc"' + (b.descontarCompromissos ? ' checked' : '') + (regras ? '' : ' disabled') + '> Descontar do saldo os compromissos de meses anteriores</label></div>' +
      '<details class="alc-log"><summary>Resumo mês a mês (' + Object.keys(b.meses).length + ')</summary>' +
      (resumo ? '<div class="tablewrap"><table class="alc"><thead><tr><th>Mês</th><th class="num">Fornecedores</th><th class="num">Budget base</th><th class="num">Acréscimos</th><th class="num">Aprovado</th><th class="num">Não utilizado</th></tr></thead><tbody>' + resumo + '</tbody></table></div>' : '<p class="note">Nenhum mês com budget definido.</p>') + '</details>' +
      '<details class="alc-log"><summary>Registro de alterações (' + (b.log || []).length + ')</summary>' +
      (ultimos.length ? '<ul>' + ultimos.map(function (l) { return '<li>' + esc(dtHora(l.quando)) + ' · ' + esc(l.quem) + ': ' + esc(l.acao) + '</li>'; }).join('') + '</ul>' : '<p class="note">Nenhuma alteração registrada.</p>') + '</details>';
  }

  // garante uma só chave por fornecedor (Marca) em cada mês, mesmo em backups feitos por outra versão
  function abrirPedido(id) {
    var p = state.peds.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    state.pedAberto = clone(p); state.pedSnap = JSON.stringify(state.pedAberto);
    state.mNota = ''; state.confirmDelPed = false; state.pedErros = []; state.pedErrTit = ''; state.fecharAviso = false; state.modo = 'pedido'; state.aval = null;
    renderModal(); pedeAvaliacao();
  }
  function fecharModal(force) {
    if (!state.modo) return;
    if (!force && state.modo === 'pedido' && state.pedEdit && JSON.stringify(state.pedAberto) !== state.pedSnap) { state.fecharAviso = true; renderModal(); return; }
    state.modo = null; state.pedAberto = null; $('#modal').hidden = true; $('#modalCard').innerHTML = '';
    document.body.classList.remove('modal-open');
    renderDrawer();
  }

  function getPath(o, path) { return path.split('.').reduce(function (a, k) { return a == null ? '' : a[k]; }, o); }
  function setPath(o, path, v) {
    var ks = path.split('.'), last = ks.pop();
    ks.reduce(function (a, k) { return a[k]; }, o)[last] = v;
  }
  function fid(path) { return 'f-' + path.replace(/\./g, '-'); }
  function campo(label, path, o) {
    o = o || {};
    var v = getPath(o.obj || state.pedAberto, path), dis = (o.ro || !(o.edit == null ? state.pedEdit : o.edit)) ? ' disabled' : '', cls = 'f' + (o.span ? ' s' + o.span : '');
    var base = ' id="' + fid(path) + '" data-f="' + esc(path) + '"' + (o.ob ? ' data-ob="1"' : '') + dis;
    var inner;
    if (o.sel) {
      inner = '<select' + base + '>' + o.sel.map(function (x) {
        var val = Array.isArray(x) ? x[0] : x, txt = Array.isArray(x) ? x[1] : x;
        return '<option value="' + esc(val) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(txt || '') + '</option>';
      }).join('') + '</select>';
    } else if (o.area) {
      inner = '<textarea rows="' + (o.rows || 3) + '"' + base + '>' + esc(v) + '</textarea>';
    } else {
      inner = '<input type="' + (o.type || 'text') + '"' + base + (o.mask ? ' data-mask="' + o.mask + '"' : '') + (o.type === 'number' ? ' step="any" min="0"' : '') +
        (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + ' value="' + esc(v) + '">';
    }
    return '<div class="' + cls + '"><label for="' + fid(path) + '">' + label + (o.req ? ' *' : '') + '</label>' + inner + '</div>';
  }
  function celula(i, k, o) {
    o = o || {};
    var it = state.pedAberto.itens[i], dis = state.pedEdit ? '' : ' disabled';
    return '<td><input type="' + (o.type || 'text') + '" data-i="' + i + '" data-k="' + k + '"' + (o.list ? ' list="' + o.list + '"' : '') + (o.type === 'number' ? ' step="any" min="0"' : '') +
      ' class="' + (o.cls || '') + '" value="' + esc(it[k]) + '" aria-label="' + esc(o.rot || k) + ' do item ' + (i + 1) + '"' + dis + '></td>';
  }
  function setTxt(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }

  function refreshCalc() {
    var p = state.pedAberto, c = calcPedido(p);
    c.itens.forEach(function (x, i) {
      setTxt('ci-' + i + '-qt', fmtNum(x.qtdTotal)); setTxt('ci-' + i + '-icms', brl2.format(x.icms));
      setTxt('ci-' + i + '-ipi', brl2.format(x.ipi)); setTxt('ci-' + i + '-tot', brl2.format(x.total));
    });
    setTxt('tt-prod', brl2.format(c.produtos)); setTxt('tt-icms', brl2.format(c.icms)); setTxt('tt-ipi', brl2.format(c.ipi));
    setTxt('tt-imp', brl2.format(c.impostos)); setTxt('tt-frete', brl2.format(c.frete)); setTxt('tt-outras', brl2.format(c.outras));
    setTxt('tt-desc', '- ' + brl2.format(c.desconto)); setTxt('tt-geral', brl2.format(c.geral));
    setTxt('tt-icms-nota', p.pedido.icmsFora ? '(somado ao total)' : '(já incluso no preço)');
    p.itens.forEach(function (it, i) {
      var cel = document.getElementById('ci-' + i + '-var'), tr = document.getElementById('tr-' + i);
      if (cel) cel.innerHTML = chipVar(it);
      if (tr) tr.className = 'pv-' + precoFaixa(it);
    });
    var bn = document.getElementById('pvBanner'); if (bn) bn.innerHTML = bannerPrecos(p);
    var dc = document.getElementById('difCad'); if (dc) dc.innerHTML = htmlDifCad(p);
    setTxt('parcelas-info', textoParcelas(p));
    pedeAvaliacao();
  }

  function acoesPedido(p) {
    var a = [], aprov = podeAprovar(), criador = podeCriar(), ed = podeEditar(p);
    if (ed) a.push(['salvar', 'Salvar', 'ghost']);
    if (ed && (p.status === 'rascunho' || p.status === 'devolvido')) a.push(['enviar', 'Enviar para aprovação', aprov ? 'ghost' : '']);
    if (ed && criador && podePorBudget() && state.budgets.ativa && (p.status === 'rascunho' || p.status === 'devolvido')) a.push(['budget', 'Aprovar por budget e gerar PDF', '']);
    if (aprov && precisaRevisar(p)) a.push(['revisar', 'Marcar como revisado', '']);
    if (aprov && (p.status === 'pendente' || p.status === 'rascunho')) {
      a.push(['aprovar', 'Aprovar e gerar PDF', '']); a.push(['devolver', 'Devolver ao comprador', 'ghost']); a.push(['recusar', 'Recusar', 'ghost']);
    }
    if (p.status === 'aprovado') {
      a.push(['pdf', 'Baixar PDF do pedido', '']);
      if (aprov || criador) a.push(['protheus', 'Salvar nº do Protheus', 'ghost']);
      if (podeCancelar()) a.push(['cancelar', 'Cancelar pedido aprovado', 'ghost']);
    }
    if (criador) a.push(['duplicar', 'Duplicar', 'ghost']);
    if (podeExcluir(p)) a.push(['excluir', state.confirmDelPed ? 'Confirmar exclusão' : 'Excluir', 'ghost danger']);
    a.push(['fechar', 'Fechar', 'ghost']);
    return a;
  }

  // o que o budget permite para este formulário: o servidor calcula (as contas dependem de todos os formulários e do budget)
  function htmlBudgetGestor(p) {
    var a = state.aval;
    return '<label>Budget do fornecedor (informativo)</label><ul class="alc-info">' + (a && a.info ? a.info.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') : '<li class="note">Calculando…</li>') +
      '<li class="note">' + (state.budgets.ativa ? 'Aprovação por budget ligada: o comprador pode aprovar quando todas as condições forem cumpridas.' : 'Aprovação por budget desligada: todos os pedidos passam pela aprovação.') + '</li></ul>';
  }
  function htmlElegivel(p) {
    var a = state.aval, el = a && a.elegivel;
    if (!el) return '<label>Aprovação por budget</label><p class="note">Conferindo as condições…</p>';
    return '<label>Aprovação por budget</label>' + (el.ok ? '<p class="note">Este pedido cumpre as condições e pode ser aprovado por budget.</p>'
      : '<ul class="alc-info">' + el.motivos.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><p class="note">Por isso este pedido precisa ser enviado para aprovação da gerência.</p>');
  }
  function pedeAvaliacao() {
    if (state.modo !== 'pedido' || !state.pedAberto) return;
    if (!podeVerBudget() && !(podePorBudget() && state.budgets.ativa)) return;
    clearTimeout(pedeAvaliacao.t);
    var p = state.pedAberto;
    pedeAvaliacao.t = setTimeout(function () {
      apiJson(CFG.urls.avaliar, 'POST', p).then(function (r) {
        if (state.pedAberto !== p) return;
        state.aval = r;
        var bi = document.getElementById('bgInfo'); if (bi) bi.innerHTML = htmlBudgetGestor(p);
        var be = document.getElementById('bgElegivel'); if (be) be.innerHTML = htmlElegivel(p);
      }, function () { /* a tela segue sem a avaliação */ });
    }, 350);
  }
  function renderModal() {
    var p = state.pedAberto;
    if (state.modo === 'empresa') { renderModalEmpresa(); return; }
    if (!p) return;
    state.pedEdit = podeEditar(p);
    state.vOk = p.itens.map(function (it) { return nz(it.vunit); });
    var st = STATUS[p.status], c = calcPedido(p), d = p.pedido, nota = !!(p.status === 'aprovado' && (podeAprovar() || podeCriar()));
    var card = $('#modalCard'), rolagem = $('#modal').scrollTop;

    var itens = p.itens.map(function (it, i) {
      var x = c.itens[i];
      return '<tr id="tr-' + i + '" class="pv-' + precoFaixa(it) + '">' + '<td class="num">' + (i + 1) + '</td>' + celula(i, 'codigo', { rot: 'Código', cls: 'w-cod' }) + celula(i, 'descricao', { rot: 'Descrição', cls: 'w-desc' }) +
        celula(i, 'un', { list: 'dlUn', rot: 'Unidade', cls: 'w-un' }) + celula(i, 'qtd', { type: 'number', rot: 'Quantidade', cls: 'w-n' }) + celula(i, 'fator', { type: 'number', rot: 'Fator', cls: 'w-n' }) +
        '<td class="num" id="ci-' + i + '-qt">' + fmtNum(x.qtdTotal) + '</td>' + celula(i, 'vunit', { type: 'number', rot: 'Valor unitário', cls: 'w-v' }) + '<td class="num" id="ci-' + i + '-var" title="' + esc(refTitulo(it)) + '">' + chipVar(it) + '</td>' +
        celula(i, 'icmsAliq', { type: 'number', rot: 'Alíquota ICMS', cls: 'w-n' }) + '<td class="num" id="ci-' + i + '-icms">' + brl2.format(x.icms) + '</td>' +
        celula(i, 'ipiAliq', { type: 'number', rot: 'Alíquota IPI', cls: 'w-n' }) + '<td class="num" id="ci-' + i + '-ipi">' + brl2.format(x.ipi) + '</td>' +
        '<td class="num"><b id="ci-' + i + '-tot">' + brl2.format(x.total) + '</b></td>' +
        '<td>' + (state.pedEdit ? '<button type="button" class="btn ghost mini" data-act="rm" data-i="' + i + '" title="Remover item" aria-label="Remover item ' + (i + 1) + '">×</button>' : '') + '</td></tr>';
    }).join('');

    var hist = p.historico.slice().reverse().map(function (h) {
      return '<li><b>' + esc(h.acao) + '</b> · ' + esc(h.quem) + ' · ' + esc(dtHora(h.quando)) + (h.nota ? '<br><span class="note">' + esc(h.nota) + '</span>' : '') + '</li>';
    }).join('');

    var decisao = ((podeAprovar() && (p.status === 'pendente' || p.status === 'rascunho' || ehAprovadoBudget(p))) || (podeCancelar() && p.status === 'aprovado'))
      ? '<div class="f s4"><label for="mNota">Observação da decisão (obrigatória para devolver, recusar ou cancelar)</label><textarea id="mNota" rows="2">' + esc(state.mNota) + '</textarea></div>' : '';

    card.innerHTML =
      '<div class="m-head"><div><h2 id="modalTitle">Formulário de compra ' + esc(p.numero) + '</h2>' +
      '<p class="note">Comprador: ' + esc(p.comprador) + ' · criado por ' + esc(p.criadoPor) + ' em ' + esc(dtHora(p.criadoEm)) + (p.baseRelatorio ? ' · relatório de ' + esc(isoToBr(p.baseRelatorio)) : '') + '</p></div>' +
      '<div class="m-st"><span class="chip ' + st[1] + '">' + st[0] + '</span><button type="button" class="btn ghost" data-act="fechar">Fechar</button></div></div>' +
      (state.fecharAviso ? '<div class="m-alert">Há alterações não salvas. <button type="button" class="btn" data-act="salvarFechar">Salvar e fechar</button> <button type="button" class="btn ghost" data-act="descartar">Descartar alterações</button> <button type="button" class="btn ghost" data-act="continuar">Continuar editando</button></div>' : '') +
      (state.pedErros.length ? '<div class="m-err" role="alert"><b>' + esc(state.pedErrTit || 'Corrija antes de continuar:') + '</b><ul>' + state.pedErros.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>' : '') +
      (podeEmpresa() && p.status !== 'aprovado' && !(state.empresa && state.empresa.razao) ? '<div class="m-alert">Os dados da empresa compradora (razão social, CNPJ e endereço) ainda não foram cadastrados, e o PDF do pedido sairá sem eles. <button type="button" class="btn ghost" data-act="empresa">Cadastrar agora</button></div>' : '') +
      (!state.pedEdit && p.status !== 'aprovado' ? '<p class="note m-ro">Somente leitura para o seu perfil neste status.</p>' : '') +

      '<fieldset class="fs"><legend>Identificação</legend><div class="fgrid">' +
      campo('Nº do formulário', 'numero', { ro: true }) +
      campo('Nº do pedido no Protheus', 'protheus', { edit: state.pedEdit || nota, ph: 'preencher após lançar no Protheus' }) +
      campo('Comprador', 'comprador', { ro: true }) +
      '<div class="f"><label>Data de emissão</label><input type="text" value="' + esc(dtHora(p.criadoEm).slice(0, 10)) + '" disabled></div></div></fieldset>' +

      '<fieldset class="fs"><legend>Fornecedor</legend><div id="difCad">' + htmlDifCad(p) + '</div><div class="fgrid">' +
      campo('Marca (do relatório)', 'fornecedor.marca', {}) + campo('Razão Social', 'fornecedor.razao', { req: 1, span: 2 }) + campo('CNPJ', 'fornecedor.cnpj', { req: 1, mask: 'cnpj', ph: '00.000.000/0000-00' }) +
      campo('Inscrição Estadual (I.E.)', 'fornecedor.ie', { ph: 'ou ISENTO' }) + campo('Contato', 'fornecedor.contato', { req: 1 }) + campo('E-mail', 'fornecedor.email', { type: 'email' }) + campo('Fone', 'fornecedor.fone', { mask: 'fone', ph: '(00) 00000-0000' }) +
      campo('Endereço', 'fornecedor.endereco', { req: 1, span: 2 }) + campo('Bairro', 'fornecedor.bairro', {}) + campo('CEP', 'fornecedor.cep', { req: 1, mask: 'cep', ph: '00000-000' }) +
      campo('Cidade', 'fornecedor.cidade', { req: 1, span: 2 }) + campo('UF', 'fornecedor.uf', { req: 1, sel: [''].concat(UFS) }) + '</div></fieldset>' +

      '<fieldset class="fs"><legend>Itens do pedido</legend><div id="pvBanner">' + bannerPrecos(p) + '</div>' +
      '<div class="tablewrap"><table class="itens"><thead><tr><th class="num">Item</th><th>Código</th><th>Descrição</th><th>Un.</th><th class="num">Qtd.</th><th class="num" title="Quantidade de itens em cada unidade de compra. Ex.: caixa com 12 = 12">Fator</th><th class="num">Qtd. total</th><th class="num">Valor unit. (por Un.)</th><th class="num" title="Variação sobre o último preço do relatório">Var. preço</th><th class="num">ICMS %</th><th class="num">ICMS R$</th><th class="num">IPI %</th><th class="num">IPI R$</th><th class="num">Total do item</th><th></th></tr></thead><tbody>' +
      (itens || '<tr class="empty-row"><td colspan="15">Nenhum item. Use "Adicionar item".</td></tr>') + '</tbody></table></div>' +
      '<datalist id="dlUn">' + UNIDADES.map(function (u) { return '<option value="' + u + '">'; }).join('') + '</datalist>' +
      (state.pedEdit ? '<div class="m-row"><button type="button" class="btn ghost" data-act="add">Adicionar item</button><span class="note">A Un. é a embalagem de compra (UN, CX, PCT...) e o valor unitário é por essa embalagem: se a Un. é CX, informe o preço da caixa. Total do item = Qtd. × valor unitário. Qtd. total = Qtd. × fator (ex.: CX com 12, fator 12) e é só informativa. O preço sugerido vem do último preço do relatório: confira se vale para a embalagem escolhida.</span></div>' : '') +
      '</fieldset>' +

      htmlMoedaForm(p) +
      '<fieldset class="fs"><legend>Totais</legend><div class="tot">' +
      '<div class="tl"><span>Total dos produtos</span><b id="tt-prod">' + brl2.format(c.produtos) + '</b></div>' +
      '<div class="tl"><span>ICMS <i id="tt-icms-nota">' + (d.icmsFora ? '(somado ao total)' : '(já incluso no preço)') + '</i></span><b id="tt-icms">' + brl2.format(c.icms) + '</b></div>' +
      '<div class="tl"><span>IPI (somado ao total)</span><b id="tt-ipi">' + brl2.format(c.ipi) + '</b></div>' +
      '<div class="tl"><span>Total de impostos (ICMS + IPI)</span><b id="tt-imp">' + brl2.format(c.impostos) + '</b></div>' +
      '<div class="tl"><span>Frete</span><b id="tt-frete">' + brl2.format(c.frete) + '</b></div>' +
      '<div class="tl"><span>Outras despesas</span><b id="tt-outras">' + brl2.format(c.outras) + '</b></div>' +
      '<div class="tl"><span>Desconto</span><b id="tt-desc">- ' + brl2.format(c.desconto) + '</b></div>' +
      '<div class="tl tg"><span>TOTAL GERAL DO PEDIDO</span><b id="tt-geral">' + brl2.format(c.geral) + '</b></div></div>' +
      '<label class="chk" for="f-pedido-icmsFora"><input type="checkbox" id="f-pedido-icmsFora" data-fc="pedido.icmsFora"' + (d.icmsFora ? ' checked' : '') + (state.pedEdit ? '' : ' disabled') + '> O ICMS é destacado por fora do preço (somar ao total). Padrão: já incluso no preço unitário.</label></fieldset>' +

      '<fieldset class="fs"><legend>Dados do pedido</legend><div class="fgrid">' +
      campo('Tipo de frete', 'pedido.frete', { req: 1, sel: FRETES, span: 2 }) + campo('Valor do frete (R$)', 'pedido.freteValor', { type: 'number' }) + campo('Transportadora', 'pedido.transportadora', {}) +
      campo('Prazo de pagamento', 'pedido.prazoPgto', { req: 1, ph: 'ex.: 30/60/90 dias' }) + campo('Forma de pagamento', 'pedido.formaPgto', { sel: PAGTOS }) +
      campo('Entrega prevista', 'pedido.entrega', { req: 1, type: 'date' }) + campo('Referência da cotação ou proposta', 'pedido.refCotacao', {}) +
      campo('Desconto (R$)', 'pedido.desconto', { type: 'number' }) + campo('Outras despesas (R$)', 'pedido.outras', { type: 'number' }) +
      campo('Local de entrega', 'pedido.localEntrega', { span: 2 }) +
      '<div class="f s4"><label>Parcelas previstas (calculadas pelo prazo de pagamento)</label><p class="note" id="parcelas-info">' + esc(textoParcelas(p)) + '</p></div>' +
      campo('Observações (aparecem no pedido enviado ao fornecedor)', 'pedido.obs', { area: 1, rows: 3, span: 4 }) + '</div></fieldset>' +

      '<fieldset class="fs"><legend>Comprador e aprovação</legend><div class="fgrid">' +
      '<div class="f s2"><label>Comprador</label><input type="text" disabled value="' + esc(p.comprador + ' · criado por ' + p.criadoPor + ' em ' + dtHora(p.criadoEm)) + '"></div>' +
      '<div class="f s2"><label>Aprovado por</label><input type="text" disabled value="' + esc(p.aprovacao ? p.aprovacao.por + ' em ' + dtHora(p.aprovacao.em) : 'ainda não aprovado') + '"></div>' +
      (p.aprovacao && p.aprovacao.nota ? '<div class="f s4"><label>Observação da aprovação</label><input type="text" disabled value="' + esc(p.aprovacao.nota) + '"></div>' : '') +
      (podeVerBudget() ? '<div class="f s4" id="bgInfo">' + htmlBudgetGestor(p) + '</div>' : '') +
      (!podeVerBudget() && podePorBudget() && state.budgets.ativa && state.pedEdit ? '<div class="f s4" id="bgElegivel">' + htmlElegivel(p) + '</div>' : '') +
      (ehAprovadoBudget(p) ? '<div class="f s4"><label>Aprovação por budget</label><p class="note">Aprovado pelo comprador dentro do budget.' +
        (podeVerBudget() ? ' Budget de ' + esc(ymRotulo((p.aprovacao.regra && p.aprovacao.regra.mes) || ymDe(p.aprovacao.em))) + ': ' + brl2.format(nz(p.aprovacao.regra && p.aprovacao.regra.budget)) + ', saldo antes do pedido ' + brl2.format(nz(p.aprovacao.regra && p.aprovacao.regra.saldoAntes)) + '. Regra definida por ' + esc(p.aprovacao.regraPor || '-') + ' em ' + esc(dtHora(p.aprovacao.regraEm) || '-') + '.' : '') +
        (p.aprovacao.regra && p.aprovacao.regra.itensManuais ? ' Contém ' + p.aprovacao.regra.itensManuais + ' item(ns) fora do relatório.' : '') +
        (p.aprovacao.revisadoEm ? ' Revisado por ' + esc(p.aprovacao.revisadoPor) + ' em ' + esc(dtHora(p.aprovacao.revisadoEm)) + '.' : ' Ainda não revisado pela gerência.') + '</p></div>' : '') +
            decisao + '</div>' +
      '<details class="hist"><summary>Histórico (' + p.historico.length + ')</summary><ul>' + hist + '</ul></details></fieldset>' +

      '<div class="m-foot">' + acoesPedido(p).map(function (a) { return '<button type="button" class="btn ' + a[2] + '" data-act="' + a[0] + '">' + a[1] + '</button>'; }).join('') + '<span class="note" id="mMsg" role="status"></span></div>';

    $('#modal').hidden = false; document.body.classList.add('modal-open');
    $('#modal').scrollTop = rolagem;
  }

  /* dados da empresa compradora (usados no PDF) */
  function abrirEmpresa() {
    state.pedAberto = null; state.modo = 'empresa'; state.pedEdit = podeEmpresa(); state.empTmp = clone(state.empresa || {}); renderModal();
  }
  function renderModalEmpresa() {
    var e = state.empTmp, o = { obj: e, edit: podeEmpresa() };
    var f = function (label, path, extra) { return campo(label, path, Object.assign({ obj: e, edit: podeEmpresa(), emp: 1 }, extra || {})); };
    $('#modalCard').innerHTML =
      '<div class="m-head"><div><h2 id="modalTitle">Dados da empresa compradora</h2><p class="note">Aparecem no cabeçalho do pedido enviado ao fornecedor. Só quem tem permissão para isso altera.</p></div>' +
      '<div class="m-st"><button type="button" class="btn ghost" data-act="fechar">Fechar</button></div></div>' +
      '<fieldset class="fs"><legend>Empresa</legend><div class="fgrid">' +
      f('Razão Social', 'razao', { span: 2 }) + f('CNPJ', 'cnpj', { mask: 'cnpj' }) + f('Inscrição Estadual (I.E.)', 'ie', {}) +
      f('Endereço', 'endereco', { span: 2 }) + f('Bairro', 'bairro', {}) + f('CEP', 'cep', { mask: 'cep' }) +
      f('Cidade', 'cidade', { span: 2 }) + f('UF', 'uf', { sel: [''].concat(UFS) }) + f('Fone', 'fone', { mask: 'fone' }) +
      f('E-mail de compras', 'email', { span: 2, type: 'email' }) + '</div></fieldset>' +
      '<div class="m-foot">' + (podeEmpresa() ? '<button type="button" class="btn" data-act="salvarEmp">Salvar dados da empresa</button>' : '') + '<button type="button" class="btn ghost" data-act="fechar">Fechar</button><span class="note" id="mMsg" role="status"></span></div>';
    $('#modal').hidden = false; document.body.classList.add('modal-open');
  }

  function lerCampo(el) {
    var path = el.getAttribute('data-f'), v = el.value, alvo = state.modo === 'empresa' ? state.empTmp : state.pedAberto;
    var m = el.getAttribute('data-mask');
    if (m && MASKS[m]) { v = MASKS[m](v); el.value = v; }
    if (el.type === 'number') v = v === '' ? 0 : parseFloat(v);
    setPath(alvo, path, v);
  }

  function setMMsg(t, err) { var e = $('#mMsg'); if (e) { e.textContent = t || ''; e.className = 'note' + (err ? ' err' : ''); } }

  // depois de uma resposta do servidor: o formulário da tela passa a ser o que ele devolveu
  function aplicaPedido(np, msg) {
    guardaPedido(np);
    state.pedAberto = clone(np); state.pedSnap = JSON.stringify(state.pedAberto); state.mNota = ''; state.pedErros = []; state.pedErrTit = ''; state.aval = null;
    renderModal(); renderDrawer(); pedeAvaliacao();
    if (msg) setMMsg(msg);
  }
  function erroDoPedido(e) {
    if (e && e.pedido && state.pedAberto && state.pedAberto.id === e.pedido.id) {   // as edições foram gravadas mesmo sem a ação: segue com a versão nova
      guardaPedido(e.pedido); state.pedAberto.versao = e.pedido.versao; state.pedAberto.historico = e.pedido.historico; state.pedSnap = JSON.stringify(state.pedAberto);
    }
    if (e && e.erros && e.erros.length) { state.pedErrTit = e.titulo || ''; state.pedErros = e.erros; state.fecharAviso = false; renderModal(); $('#modal').scrollTop = 0; return; }
    if (e && e.conflito) { carregaFormularios().then(function () { setMMsg(e.message + ' Feche e abra o formulário de novo.', true); }); return; }
    setMMsg(msgDeErro(e), true);
  }
  function acaoServidor(p, acao, extra) {
    var corpo = Object.assign({ acao: acao, nota: state.mNota || '', versao: p.versao }, extra || {});
    if (state.pedEdit) corpo.conteudo = p;     // a mesma chamada grava o que está na tela
    return apiJson(CFG.urls.formularios + '/' + p.id + '/acao', 'POST', corpo).then(function (r) { return r.pedido; });
  }
  function agirPedido(act, el) {
    var p = state.pedAberto, nota = String(state.mNota || '').trim();
    if (act === 'fechar') { fecharModal(false); return; }
    if (act === 'continuar') { state.fecharAviso = false; renderModal(); return; }
    if (act === 'descartar') { fecharModal(true); return; }
    if (act === 'empresa') {
      if (p && JSON.stringify(p) !== state.pedSnap) { setMMsg('Salve o formulário antes de abrir os dados da empresa.', true); return; }
      abrirEmpresa(); return;
    }
    if (act === 'salvarEmp') {
      if (!podeEmpresa()) return;
      var emp = clone(state.empTmp); emp.versao = (state.empresa && state.empresa.versao) || undefined;
      apiJson(CFG.urls.empresa, 'PUT', { empresa: emp }).then(function (r) { state.empresa = r.empresa; setMMsg('Dados da empresa salvos.'); }, function (e) { setMMsg(msgDeErro(e), true); });
      return;
    }
    if (!p) return;
    if (act === 'rmMoeda') { if (p.moedaTroca) { p.moedaTroca = null; renderModal(); } return; }
    if (act === 'add') {
      p.itens.push({ codigo: '', descricao: '', un: 'UN', qtd: 1, fator: 1, vunit: 0, icmsAliq: 0, ipiAliq: 0, origem: 'manual', precoRef: 0 });
      renderModal(); return;
    }
    if (act === 'rm') { p.itens.splice(+el.getAttribute('data-i'), 1); renderModal(); return; }
    if (act === 'salvarFechar') {
      if (JSON.stringify(p) === state.pedSnap) { fecharModal(true); return; }
      salvarPed(p).then(function () { fecharModal(true); }, erroDoPedido);
      return;
    }
    if (act === 'salvar') {
      if (!state.pedEdit) return;
      if (JSON.stringify(p) === state.pedSnap) { setMMsg('Nada mudou desde o último salvamento.'); return; }
      salvarPed(p).then(function (np) { aplicaPedido(np, 'Salvo.'); }, erroDoPedido);
      return;
    }
    if (act === 'budget' || act === 'enviar' || act === 'aprovar') {
      var erros = validar(p);
      if (erros.length) { state.pedErrTit = act === 'budget' ? 'Corrija antes de continuar:' : ''; state.pedErros = erros; state.fecharAviso = false; renderModal(); $('#modal').scrollTop = 0; return; }
      state.pedErros = [];
      acaoServidor(p, act).then(function (np) {
        aplicaPedido(np, act === 'enviar' ? 'Enviado para aprovação.' : act === 'budget' ? 'Aprovado por budget. O PDF do pedido foi gerado.' : 'Aprovado. O PDF do pedido foi gerado.');
        carregaFornecedores();
        if (act !== 'enviar') { try { baixarPedidoPdf(np); } catch (e) { setDrawerMsg('Aprovado, mas o PDF não foi gerado: ' + e.message, true); } }
      }, erroDoPedido);
      return;
    }
    if (act === 'revisar' || act === 'devolver' || act === 'recusar' || act === 'cancelar') {
      if ((act === 'devolver' || act === 'recusar' || act === 'cancelar') && !nota) { state.pedErros = ['Escreva a observação da decisão para ' + (act === 'devolver' ? 'devolver' : act === 'recusar' ? 'recusar' : 'cancelar') + '.']; renderModal(); return; }
      acaoServidor(p, act).then(function (np) { aplicaPedido(np, act === 'revisar' ? 'Marcado como revisado.' : ''); }, erroDoPedido);
      return;
    }
    if (act === 'protheus') {
      acaoServidor(p, 'protheus', { valor: String(p.protheus || '').trim() }).then(function (np) { aplicaPedido(np, 'Nº do Protheus salvo.'); }, erroDoPedido);
      return;
    }
    if (act === 'pdf') { try { baixarPedidoPdf(state.peds.filter(function (x) { return x.id === p.id; })[0] || p); setMMsg('PDF gerado.'); } catch (e) { setMMsg(e.message, true); } return; }
    if (act === 'duplicar') {
      var cp = clone(p); cp.pedido.entrega = ''; cp.moedaTroca = null;
      if (!ehGestor()) cp.comprador = state.user.nome;
      criaPed(cp, { copiaDe: p.numero }).then(function (np) { renderDrawer(); abrirPedido(np.id); setDrawerMsg('Cópia criada: ' + np.numero + '.'); }, erroDoPedido);
      return;
    }
    if (act === 'excluir') {
      if (!state.confirmDelPed) { state.confirmDelPed = true; renderModal(); return; }
      apiJson(CFG.urls.formularios + '/' + p.id + '/excluir', 'POST', { versao: p.versao }).then(function () {
        state.peds = state.peds.filter(function (x) { return x.id !== p.id; }); reindexPeds();
        fecharModal(true); setDrawerMsg('Formulário ' + p.numero + ' excluído.');
      }, erroDoPedido);
    }
  }

  function logoInfo() {
    var el = document.querySelector('.side-logo .logo img');
    return el && el.src.indexOf('data:image/png') === 0 && el.naturalWidth ? { src: el.src, ratio: el.naturalWidth / el.naturalHeight } : null;
  }
  function buildPedidoPdf(p) {
    var JsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!JsPDF) throw new Error('A biblioteca de PDF não carregou. Recarregue a página e tente de novo.');
    var c = calcPedido(p), f = p.fornecedor, d = p.pedido, emp = state.empresa || {};
    var doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 36, y = 0;
    var NAVY = [15, 42, 92], BLUE = [27, 77, 177], INK = [20, 25, 34], GREY = [90, 101, 119], SOFT = [236, 242, 252];
    var auto = function (o) { if (doc.autoTable) doc.autoTable(o); else window.jspdf.autoTable(doc, o); };
    var lg = logoInfo();
    var cor = function (rgb, fill) { if (fill) doc.setFillColor(rgb[0], rgb[1], rgb[2]); else doc.setTextColor(rgb[0], rgb[1], rgb[2]); };
    var need = function (h) { if (y + h > H - 46) { doc.addPage(); y = M + 8; } };
    var titulo = function (t) { need(40); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); cor(BLUE); doc.text(t, M, y); y += 8; };

    // faixa azul com a logo
    cor(NAVY, true); doc.rect(0, 0, W, 66, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(19); cor([255, 255, 255]); doc.text('PEDIDO DE COMPRA', M, 30);
    doc.setFontSize(10); doc.text('Nº ' + p.numero + (p.protheus ? '     |     Pedido Protheus nº ' + p.protheus : ''), M, 47);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); cor([200, 214, 240]);
    doc.text('Emissão: ' + dtHora(p.criadoEm).slice(0, 10) + '     |     Aprovado em: ' + (p.aprovacao ? dtHora(p.aprovacao.em) : '-'), M, 60);
    if (lg) {
      try {
        var lh = 40, lw = Math.round(lh * lg.ratio), pad = 6, px = W - M - lw - pad * 2, py = (66 - (lh + pad * 2)) / 2;
        cor([255, 255, 255], true); doc.roundedRect(px, py, lw + pad * 2, lh + pad * 2, 4, 4, 'F'); doc.addImage(lg.src, 'PNG', px + pad, py + pad, lw, lh);
      } catch (e) { lg = null; }
    }
    y = 88;

    // blocos: empresa compradora e fornecedor
    var meio = (W - 2 * M - 12) / 2;
    var linhasEmp = [['Razão Social', emp.razao || ''], ['CNPJ', emp.cnpj || ''], ['I.E.', emp.ie || ''], ['Endereço', [emp.endereco, emp.bairro].filter(Boolean).join(' - ')],
      ['CEP / Cidade / UF', [emp.cep, [emp.cidade, emp.uf].filter(Boolean).join('/')].filter(Boolean).join(' - ')], ['Fone / E-mail', [emp.fone, emp.email].filter(Boolean).join('  |  ')]];
    if (!emp.razao && !emp.cnpj && !emp.endereco) linhasEmp = [['Dados da empresa', 'não cadastrados no sistema']];
    var linhasFor = [['Razão Social', f.razao], ['CNPJ', f.cnpj], ['I.E.', f.ie], ['Endereço', [f.endereco, f.bairro].filter(Boolean).join(' - ')],
      ['CEP / Cidade / UF', [f.cep, [f.cidade, f.uf].filter(Boolean).join('/')].filter(Boolean).join(' - ')], ['Contato', f.contato], ['Fone / E-mail', [f.fone, f.email].filter(Boolean).join('  |  ')]];
    var medir = function (linhas, w) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      return 28 + linhas.reduce(function (t, ln) {
        doc.setFont('helvetica', 'bold'); var lw2 = doc.getTextWidth(ln[0] + ': ');
        doc.setFont('helvetica', 'normal');
        return t + doc.splitTextToSize(String(ln[1] || '-'), w - 16 - lw2).length * 10.5;
      }, 0);
    };
    var bloco = function (x, w, h, tit, linhas) {
      doc.setDrawColor(210, 219, 235); doc.setLineWidth(0.6); doc.roundedRect(x, y, w, h, 4, 4, 'S');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); cor(BLUE); doc.text(tit.toUpperCase(), x + 8, y + 13);
      var yy = y + 28;
      linhas.forEach(function (ln) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); var lab = ln[0] + ': ', lw2 = doc.getTextWidth(lab);
        doc.setFont('helvetica', 'normal'); var partes = doc.splitTextToSize(String(ln[1] || '-'), w - 16 - lw2);
        doc.setFont('helvetica', 'bold'); cor(GREY); doc.text(lab, x + 8, yy);
        doc.setFont('helvetica', 'normal'); cor(INK); doc.text(partes, x + 8 + lw2, yy);
        yy += partes.length * 10.5;
      });
    };
    var hb = Math.max(medir(linhasEmp, meio), medir(linhasFor, meio));
    bloco(M, meio, hb, 'Empresa compradora', linhasEmp); bloco(M + meio + 12, meio, hb, 'Fornecedor', linhasFor);
    y += hb + 16;

    // itens
    titulo('ITENS DO PEDIDO');
    var N = { halign: 'right' };
    auto({
      startY: y, margin: { left: M, right: M, top: M + 8, bottom: 46 },
      head: [['Item', 'Código', 'Descrição', 'Un.', 'Qtd.', 'Qtd. total', 'Valor unit. (por Un.)', 'ICMS %', 'ICMS R$', 'IPI %', 'IPI R$', 'Total do item']],
      body: p.itens.map(function (it, i) {
        var x = c.itens[i];
        return [String(i + 1), it.codigo, it.descricao, it.un, fmtNum(it.qtd), fmtNum(x.qtdTotal), brl2.format(nz(it.vunit)), fmtNum(it.icmsAliq), brl2.format(x.icms), fmtNum(it.ipiAliq), brl2.format(x.ipi), brl2.format(x.total)];
      }),
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak', lineColor: [216, 221, 229], lineWidth: 0.4, textColor: INK },
      headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 52 }, 2: { cellWidth: 286 }, 3: { cellWidth: 26 }, 4: Object.assign({ cellWidth: 38 }, N), 5: Object.assign({ cellWidth: 44 }, N), 6: Object.assign({ cellWidth: 62 }, N), 7: Object.assign({ cellWidth: 34 }, N), 8: Object.assign({ cellWidth: 56 }, N), 9: Object.assign({ cellWidth: 30 }, N), 10: Object.assign({ cellWidth: 52 }, N), 11: Object.assign({ cellWidth: 66 }, N) }
    });
    y = doc.lastAutoTable.finalY + 14;

    // totais
    need(120);
    auto({
      startY: y, tableWidth: 290, margin: { left: W - M - 290, right: M, bottom: 46 }, theme: 'grid',
      body: [
        ['Total dos produtos', brl2.format(c.produtos)],
        ['ICMS ' + (d.icmsFora ? '(somado ao total)' : '(já incluso no preço)'), brl2.format(c.icms)],
        ['IPI (somado ao total)', brl2.format(c.ipi)],
        ['Total de impostos (ICMS + IPI)', brl2.format(c.impostos)],
        ['Frete', brl2.format(c.frete)], ['Outras despesas', brl2.format(c.outras)], ['Desconto', '- ' + brl2.format(c.desconto)],
        ['TOTAL GERAL DO PEDIDO', brl2.format(c.geral)]
      ],
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 3, lineColor: [216, 221, 229], lineWidth: 0.4, textColor: INK },
      columnStyles: { 1: { halign: 'right', cellWidth: 100 } },
      didParseCell: function (h) { if (h.section === 'body' && h.row.index === 7) { h.cell.styles.fontStyle = 'bold'; h.cell.styles.fillColor = NAVY; h.cell.styles.textColor = [255, 255, 255]; } }
    });
    y = doc.lastAutoTable.finalY + 16;

    // dados do pedido
    titulo('DADOS DO PEDIDO');
    var freteTxt = (FRETES.filter(function (x) { return x[0] === d.frete; })[0] || ['', ''])[1];
    auto({
      startY: y, margin: { left: M, right: M, bottom: 46 }, theme: 'grid',
      body: [
        ['Tipo de frete', freteTxt || '-', 'Valor do frete', brl2.format(c.frete)],
        ['Transportadora', d.transportadora || '-', 'Prazo de pagamento', d.prazoPgto || '-'],
        ['Forma de pagamento', d.formaPgto || '-', 'Entrega prevista', d.entrega ? isoToBr(d.entrega) : '-'],
        ['Local de entrega', { content: d.localEntrega || '-', colSpan: 3 }],
        ['Ref. cotação/proposta', d.refCotacao || '-', 'Nº pedido Protheus', p.protheus || '(a informar)']
      ],
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, lineColor: [216, 221, 229], lineWidth: 0.4, textColor: INK },
      columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 110 }, 3: { cellWidth: 'auto' } },
      didParseCell: function (h) { if (h.section === 'body' && (h.column.index === 0 || h.column.index === 2)) { h.cell.styles.fontStyle = 'bold'; h.cell.styles.fillColor = SOFT; } }
    });
    y = doc.lastAutoTable.finalY + 14;

    if (d.obs && d.obs.trim()) {
      titulo('OBSERVAÇÕES');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); cor(INK);
      var linhasObs = doc.splitTextToSize(d.obs.trim(), W - 2 * M - 12), altura = linhasObs.length * 11 + 10;
      need(altura + 6);
      doc.setDrawColor(210, 219, 235); doc.roundedRect(M, y, W - 2 * M, altura, 4, 4, 'S'); doc.text(linhasObs, M + 6, y + 13);
      y += altura + 14;
    }

    // comprador e aprovação
    titulo('COMPRADOR E APROVAÇÃO');
    auto({
      startY: y, margin: { left: M, right: M, bottom: 46 }, theme: 'grid',
      body: [
        ['Comprador', p.comprador + '  (formulário criado por ' + p.criadoPor + ' em ' + dtHora(p.criadoEm) + ')'],
        ['Aprovado por', p.aprovacao ? (p.aprovacao.tipo === 'budget' ? 'Compra autorizada previamente pela gerência de compras, emitida por ' + p.aprovacao.por : p.aprovacao.por) + ' em ' + dtHora(p.aprovacao.em) : '-'],
        ['Observação da aprovação', p.aprovacao && p.aprovacao.nota ? p.aprovacao.nota : '-']
      ],
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, lineColor: [216, 221, 229], lineWidth: 0.4, textColor: INK },
      columnStyles: { 0: { cellWidth: 130 } },
      didParseCell: function (h) { if (h.section === 'body' && h.column.index === 0) { h.cell.styles.fontStyle = 'bold'; h.cell.styles.fillColor = SOFT; } }
    });
    y = doc.lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); cor(GREY);
    need(14); doc.text('Documento aprovado eletronicamente no sistema RV Necessidades.', M, y);

    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); cor([120, 128, 140]);
      doc.text('Pedido de compra ' + p.numero + (p.protheus ? ' / Protheus ' + p.protheus : ''), M, H - 18);
      doc.text('Página ' + i + ' de ' + n, W - M, H - 18, { align: 'right' });
      if (lg && i > 1) { try { var sh = 22, sw = Math.round(sh * lg.ratio); doc.addImage(lg.src, 'PNG', W - M - sw, 8, sw, sh); } catch (e) { /* sem logo */ } }
    }
    return { doc: doc, name: 'Pedido_' + p.numero + '_' + slug(f.razao || f.marca || 'fornecedor').slice(0, 40) + '.pdf', paginas: n };
  }
  function baixarPedidoPdf(p) { var r = buildPedidoPdf(p); r.doc.save(r.name); return r; }

  /* eventos do módulo */
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.modo) fecharModal(false); else if (e.key === 'Escape' && state.drawer) fecharDrawer(); });
  $('#panel').addEventListener('click', function (e) {
    var sec = e.target.closest('[data-dsec]');
    if (sec) { state.drawerSec = sec.getAttribute('data-dsec'); renderDrawer(); return; }
    var dvt = e.target.closest('[data-dvt]');
    if (dvt) { state.dv.tipo = dvt.getAttribute('data-dvt'); renderDiverg(); return; }
    if (e.target.closest('#dvExp')) { exportarDivergencias(); return; }
    var rm = e.target.closest('[data-bg-rm]');
    if (rm && ehAdm()) {
      var kr = rm.getAttribute('data-bg-rm'), mr = state.budgets.meses[state.bgMes], fr = mr && mr[kr];
      if (fr && state.bgMes >= ymAtual()) { logBudget('Budget de ' + fr.marca + ' em ' + ymRotulo(state.bgMes) + ' removido (' + brl2.format(nz(fr.valor)) + ')'); delete mr[kr]; salvarBudgets(); renderBudgets(); }
      return;
    }
    if (e.target.closest('#fxModelo') && podeCadastro()) { fxBaixar(true); return; }
    if (e.target.closest('#fxExp') && podeCadastro()) { fxBaixar(false); return; }
    if (e.target.closest('#fxImp') && podeCadastro()) { $('#fxFile').click(); return; }
    if (e.target.closest('#fxCancelar')) { state.fi = null; renderFxHost(); return; }
    if (e.target.closest('#fxAplicar') && podeCadastro() && state.fi) {
      if (!state.fi.confirma) { state.fi.confirma = true; renderFxHost(); return; }
      aplicarFx(); return;
    }
    if (e.target.closest('#bgAdd') && ehAdm() && state.bgMes >= ymAtual()) {
      var m = ($('#bgMarca').value || '').trim(), vb = parseFloat($('#bgValor').value);
      if (!m) { setDrawerMsg('Informe a Marca do fornecedor.', true); return; }
      if (isNaN(vb)) vb = null; else if (vb < 0) { setDrawerMsg('O budget não pode ser negativo.', true); return; }
      var k = chaveForn(m), mes = state.budgets.meses[state.bgMes] || (state.budgets.meses[state.bgMes] = {}), rotMes = ymRotulo(state.bgMes);
      m = fxMarcasRelatorio()[k] || (mes[k] && mes[k].marca) || m;
      if (!mes[k]) {
        mes[k] = { marca: m, valor: vb == null ? 0 : r2(vb), por: quem(), em: new Date().toISOString() };
        logBudget('Fornecedor ' + m + ' adicionado ao budget de ' + rotMes + (vb == null ? '' : ' com ' + brl2.format(vb)));
      } else if (vb != null && Math.abs(nz(mes[k].valor) - vb) > 1e-9) {
        logBudget('Budget de ' + mes[k].marca + ' em ' + rotMes + ': ' + brl2.format(nz(mes[k].valor)) + ' para ' + brl2.format(vb));
        mes[k].valor = r2(vb); mes[k].por = quem(); mes[k].em = new Date().toISOString();
      }
      var pvA = state.budgets.previas && state.budgets.previas[state.bgMes];
      if (pvA && pvA.itens) { delete pvA.itens[k]; if (!Object.keys(pvA.itens).length) delete state.budgets.previas[state.bgMes]; }
      salvarBudgets(); renderBudgets(); return;
    }
    if (e.target.closest('#bgCopy') && ehAdm() && state.bgMes >= ymAtual()) {
      var origem = state.budgets.meses[ymSomar(state.bgMes, -1)] || {}, destino = state.budgets.meses[state.bgMes] || (state.budgets.meses[state.bgMes] = {}), n = 0;
      Object.keys(origem).forEach(function (k2) { if (!destino[k2]) { destino[k2] = { marca: origem[k2].marca, valor: nz(origem[k2].valor), por: quem(), em: new Date().toISOString() }; n++; } });
      if (n) { logBudget('Budget de ' + ymRotulo(state.bgMes) + ': ' + n + ' fornecedor(es) copiado(s) de ' + ymRotulo(ymSomar(state.bgMes, -1))); salvarBudgets(); }
      else setDrawerMsg('Não há fornecedores novos para copiar do mês anterior.', true);
      renderBudgets(); return;
    }
    if (e.target.closest('#bgSwitch') && podeRegrasBudget()) {
      if (!state.confirmAlc) { state.confirmAlc = true; renderBudgets(); return; }
      state.budgets.ativa = !state.budgets.ativa; state.confirmAlc = false;
      logBudget('Aprovação por budget ' + (state.budgets.ativa ? 'LIGADA' : 'desligada'));
      salvarBudgets(); renderBudgets(); return;
    }
    if (e.target.closest('#bgSwitchNo')) { state.confirmAlc = false; renderBudgets(); return; }
    if (e.target.closest('#pvGerar') && ehAdm()) {
      var gn = gerarPrevia(state.bgMes);
      if (!gn) setDrawerMsg('Não há consumo nem budget nos 3 últimos meses encerrados para calcular a média. Defina os valores manualmente.', true);
      else { salvarBudgets(); setDrawerMsg('Prévia gerada com ' + gn + ' fornecedor(es). Revise e oficialize.'); }
      renderBudgets(); return;
    }
    if (e.target.closest('#pvOficializar') && ehAdm()) {
      if (!state.confirmPrev) { state.confirmPrev = true; renderBudgets(); return; }
      state.confirmPrev = false;
      var on = oficializarPrevia(state.bgMes); salvarBudgets(); setDrawerMsg('Budget de ' + ymRotulo(state.bgMes) + ' oficializado (' + on + ' fornecedor(es)).'); renderBudgets(); return;
    }
    if (e.target.closest('#pvNo')) { state.confirmPrev = false; renderBudgets(); return; }
    if (e.target.closest('#pvDescartar') && ehAdm()) {
      delete state.budgets.previas[state.bgMes]; state.confirmPrev = false; logBudget('Prévia de ' + ymRotulo(state.bgMes) + ' descartada'); salvarBudgets(); renderBudgets(); return;
    }
    var pr = e.target.closest('[data-pv-rm]');
    if (pr && ehAdm() && temPrevia(state.bgMes)) { delete state.budgets.previas[state.bgMes].itens[pr.getAttribute('data-pv-rm')]; salvarBudgets(); renderBudgets(); return; }
    if (e.target.closest('#acAdd') && ehAdm() && state.bgMes >= ymAtual()) {
      var er = lancarAcrescimo(state.bgMes, $('#acForn').value, parseFloat($('#acValor').value), $('#acMotivo').value);
      if (er) { setDrawerMsg(er, true); return; }
      salvarBudgets(); setDrawerMsg('Acréscimo lançado.'); renderBudgets(); return;
    }
    var ar = e.target.closest('[data-ac-rm]');
    if (ar && ehAdm() && state.bgMes >= ymAtual()) {
      var par = ar.getAttribute('data-ac-rm').split('|'), ee = state.budgets.meses[state.bgMes][par[0]];
      if (ee && ee.acresc) {
        var ac = ee.acresc.filter(function (x) { return x.id === par[1]; })[0];
        if (ac) { ee.acresc = ee.acresc.filter(function (x) { return x.id !== par[1]; }); logBudget('Acréscimo de ' + brl2.format(ac.valor) + ' removido do budget de ' + ee.marca + ' em ' + ymRotulo(state.bgMes) + ' (motivo original: ' + ac.motivo + ')'); salvarBudgets(); renderBudgets(); }
      }
      return;
    }
    var t = e.target.closest('[data-dtab]');
    if (t) { state.drawerTab = t.getAttribute('data-dtab'); renderDrawer(); return; }
    var o = e.target.closest('[data-open]');
    if (o) { abrirPedido(o.getAttribute('data-open')); return; }
    if (e.target.closest('#novoPed')) {
      var marca = ($('#novoMarca').value || '').trim(), comp = ehGestor() ? ($('#novoComp') ? $('#novoComp').value : '') : state.user.nome;
      if (!comp) { setDrawerMsg('Importe um relatório para escolher o comprador.', true); return; }
      if (!podeCriar()) return;
      criaPed(novoPedido(comp, marca, [])).then(function (sp) { renderDrawer(); abrirPedido(sp.id); }, function (er) { setDrawerMsg(msgDeErro(er), true); });
      return;
    }
    if (e.target.closest('#empBtn')) { abrirEmpresa(); return; }
  });
  $('#panel').addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'dvComp') { state.dv.comp = t.value; renderDiverg(); return; }
    if (t.id === 'dvPpSem') { state.dv.ppSem = t.checked; renderDrawer(); return; }
    if (t.id === 'bgMes') { state.bgMes = t.value; state.confirmPrev = false; if (state.fi) state.fi.confirma = false; renderBudgets(); return; }
    if (!ehAdm() && !(podeRegrasBudget() && (t.id === 'bgTol' || t.id === 'bgDesc'))) return;
    if (t.hasAttribute('data-pv') && temPrevia(state.bgMes)) {
      var itp = state.budgets.previas[state.bgMes].itens[t.getAttribute('data-pv')];
      if (itp) { itp.valor = Math.max(0, parseFloat(t.value) || 0); salvarBudgets(); renderBudgets(); }
      return;
    }
    if (t.id === 'bgTol' && podeRegrasBudget()) {
      var nt = Math.max(0, parseFloat(t.value) || 0);
      if (Math.abs(nt - nz(state.budgets.tolPreco)) < 1e-9) return;
      logBudget('Tolerância de preço: ' + nz(state.budgets.tolPreco) + '% para ' + nt + '%'); state.budgets.tolPreco = nt; salvarBudgets(); return;
    }
    if (t.id === 'bgDesc' && podeRegrasBudget()) {
      state.budgets.descontarCompromissos = t.checked;
      logBudget('Descontar compromissos anteriores do saldo: ' + (t.checked ? 'sim' : 'não')); salvarBudgets(); renderBudgets(); return;
    }
    if (t.hasAttribute('data-bg') && state.bgMes >= ymAtual()) {
      var key = t.getAttribute('data-bg'), novo = Math.max(0, parseFloat(t.value) || 0);
      var mes = state.budgets.meses[state.bgMes] || (state.budgets.meses[state.bgMes] = {}), ant = mes[key] ? nz(mes[key].valor) : 0;
      if (Math.abs(ant - novo) < 1e-9) return;
      if (!mes[key]) mes[key] = { marca: t.getAttribute('data-marca'), valor: 0, por: '', em: '' };
      mes[key].valor = novo; mes[key].por = quem(); mes[key].em = new Date().toISOString();
      logBudget('Budget de ' + mes[key].marca + ' em ' + ymRotulo(state.bgMes) + ': ' + brl2.format(ant) + ' para ' + brl2.format(novo));
      salvarBudgets(); renderBudgets();
    }
  });
  $('#fxFile').addEventListener('change', function (e) { var f = e.target.files && e.target.files[0]; if (f && podeCadastro()) importarPlanilhaFx(f); e.target.value = ''; });
  $('#modal').addEventListener('click', function (e) {
    if (e.target === $('#modal')) { fecharModal(false); return; }
    var b = e.target.closest('[data-act]');
    if (b) agirPedido(b.getAttribute('data-act'), b);
  });
  $('#modal').addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'mNota') { state.mNota = t.value; return; }
    if (t.hasAttribute('data-f')) { lerCampo(t); if (state.modo === 'pedido') refreshCalc(); return; }
    if (t.hasAttribute('data-i')) {
      var it = state.pedAberto.itens[+t.getAttribute('data-i')], k = t.getAttribute('data-k');
      it[k] = t.type === 'number' ? (t.value === '' ? 0 : parseFloat(t.value)) : t.value;
      refreshCalc();
    }
  });
  $('#modal').addEventListener('change', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-i') && t.getAttribute('data-k') === 'vunit' && state.pedAberto) {
      // preço acima da tolerância sobre o último preço do relatório: só quem tem a permissão pode ajustar (o servidor confere de novo)
      var ii = +t.getAttribute('data-i'), item = state.pedAberto.itens[ii], novoV = t.value === '' ? 0 : parseFloat(t.value);
      var ref = nz(item.precoRef), lim = ref > 0 ? ref * (1 + tolPreco() / 100) + 1e-9 : Infinity;
      if (!podePrecoAcima() && novoV > lim) {
        item.vunit = state.vOk[ii]; t.value = state.vOk[ii]; refreshCalc();
        setMMsg('Item ' + (ii + 1) + ': o preço passa de ' + tolPreco() + '% sobre o último preço (' + brl2.format(ref) + '). Só quem tem permissão para preço acima da tolerância pode ajustar. O valor anterior foi mantido.', true);
      } else { state.vOk[ii] = novoV; }
      return;
    }
    if (t.getAttribute('data-f') === 'fornecedor.marca' && state.pedEdit && state.pedAberto && preencherDoCadastro()) { refreshCalc(); setMMsg('Dados do fornecedor preenchidos pelo cadastro. Confira antes de enviar.'); return; }
    if (t.hasAttribute('data-fc')) { setPath(state.pedAberto, t.getAttribute('data-fc'), t.checked); refreshCalc(); }
    else if (t.hasAttribute('data-f') && t.tagName === 'SELECT') { lerCampo(t); if (state.modo === 'pedido') refreshCalc(); }
  });

  /* ---------- início ---------- */
  carregaEstado().then(function () {
    var primeira = podeVer('painel') ? 'painel' : (CFG.paginas[0] || 'painel');
    state.page = pageFromHash() || (state.snaps.length ? primeira : (CFG.pode.importarRelatorio && podeVer('importar') ? 'importar' : primeira));
    return (state.snaps.length ? selectSnap(state.snaps[0].id) : Promise.resolve()).then(function () {
      return monCarrega(state.mons[0] ? state.mons[0].id : null);
    }).then(carregaCompras).then(function () { render(); });
  }).catch(function (e) { setStatus('err', esc(e && e.message ? e.message : e)); render(); });
})();
