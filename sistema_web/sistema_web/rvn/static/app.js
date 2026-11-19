// Mostra as listas de compradores e Marcas só quando o alcance for "escolhidos".
(function () {
  var sel = document.getElementById('u-escopo');
  if (!sel) return;
  function atualiza() {
    var vis = sel.value === 'selecionados';
    Array.prototype.forEach.call(document.querySelectorAll('.so-selecionados'), function (el) { el.hidden = !vis; });
  }
  sel.addEventListener('change', atualiza);
  atualiza();
})();
