# RV Necessidades, versão web (etapa 3: compras)

**Etapa 1 (fundação):** servidor, login, usuários, níveis e permissões (o admin escolhe o que cada um vê e pode fazer) e registro de ações.
**Etapa 2 (leitura):** importação do relatório de necessidades e do Monitor de Estoque no servidor, e as páginas de acompanhamento (Visão geral, Rupturas, Atrasos de entrega, Necessidade 60 dias, Moeda de troca, Pedidos bloqueados, Todos os itens, Divergências, Relatórios e Exportar em PDF e Excel).
**Etapa 3 (compras):** formulários de compra (criar, editar, enviar, aprovar, devolver, recusar, cancelar, duplicar, excluir, nº do Protheus, PDF do pedido), aprovação por budget, budget mensal por fornecedor, cadastro de fornecedores (inclusive por planilha) e dados da empresa compradora.

**A regra central:** o servidor decide, a tela só mostra. Cada pessoa recebe só as linhas do seu alcance de dados (todos, só os próprios itens, ou compradores e Marcas escolhidos), e cada ação é conferida no servidor pela permissão da pessoa, mesmo que alguém tente chamar o servidor por fora da tela:

- **Número do formulário, situação, aprovação e histórico** são do servidor. O histórico registra quem fez e quando, com a hora do servidor.
- **Preço acima da tolerância:** o último preço de referência vem do relatório importado, nunca do navegador. Só quem tem *Aprovar ou ajustar preço acima da tolerância* grava ou aprova um preço acima da tolerância, e a aprovação exige justificativa.
- **Aprovação por budget:** o servidor refaz as contas (budget do mês, saldo, compromissos, fornecedor já aprovado antes pela gerência e preço dentro da tolerância) e só aprova se todas as condições forem cumpridas.
- **Budget:** lançar valores e ligar a aprovação por budget ou mudar a tolerância são permissões separadas. Meses encerrados não mudam. Quem enxerga só parte dos compradores não altera o budget, porque as contas dependem de todos os formulários.
- **Cadastro de fornecedores:** só quem tem a permissão de cadastro altera um cadastro existente (o comprador cria o que ainda não existe). Quem não tem a página de fornecedores só recebe as Marcas do seu alcance.
- **Concorrência:** se duas pessoas mexem no mesmo formulário ou no budget, a segunda recebe um aviso de que ele foi alterado e recarrega, em vez de apagar a mudança da primeira.

Pilha: Python, Flask, SQLite e Waitress (a mesma linha do projeto Sistema de Licitações). Os cálculos de acompanhamento rodam no navegador, sobre as linhas que o servidor liberou; as regras de compras rodam no servidor.

## Instalar no computador do admin

Feito uma única vez.

**Windows (o caminho recomendado)**

1. Instale o **Python 3.11 ou mais novo** (por exemplo o `python-3.12.10-amd64`). Na primeira tela do instalador, marque **Add python.exe to PATH** e clique em *Install Now*.
2. Descompacte `sistema_web.zip` em uma pasta simples, como `C:\RVNecessidades`. **Não use uma pasta sincronizada** (OneDrive, Google Drive, Dropbox): a sincronização pode estragar o banco de dados enquanto ele está em uso.
3. Dê dois cliques em **`instalar.bat`**. Ele cria o ambiente, instala os componentes (precisa de internet nesta etapa) e pede o usuário, o nome e a senha do admin (mínimo 10 caracteres, com letras e números; a senha não aparece enquanto você digita). Só funciona uma vez: **só pode haver um admin**.
4. Dê dois cliques em **`iniciar.bat`** para ligar o sistema e abra http://127.0.0.1:8080 no navegador. Feche a janela preta para desligar.

**Linux ou Mac**

```
python3 -m venv venv
venv/bin/pip install -r requirements.txt
venv/bin/python -m rvn criar-admin --login paulo --nome "Paulo"
./iniciar.sh
```

Os dados (banco, chave dos cookies e backups) ficam, no Windows, em `%LOCALAPPDATA%\RVNecessidades` (fora de pastas sincronizadas); os `.bat` definem isso sozinhos. Em Linux ou Mac, ficam na pasta `dados`, dentro desta pasta. Para escolher outro lugar, defina a variável `RVN_DADOS` antes de rodar.

## Formulários, budget e fornecedores (etapa 3)

- **Quem faz o quê** vem de *Níveis e permissões*: criar formulários (padrão: Admin, Gerência e Comprador), aprovar (Admin, Gerência e Diretoria), aprovar por budget (Comprador), cancelar aprovado (Admin e Gerência), lançar budget (Admin e Gerência), regras do budget e preço acima da tolerância (só Admin), cadastro de fornecedores (Admin e Gerência), dados da empresa (só Admin).
- **Formulários:** o comprador cria a partir dos itens marcados nas listas (Rupturas ou Necessidade 60 dias) ou em branco, e envia; a Gerência ou a Diretoria aprova, devolve (com observação) ou recusa. Aprovar gera o PDF do pedido no navegador, com os dados da empresa e do fornecedor.
- **Budget:** a página Fornecedores e budget mostra o mês, o saldo de cada fornecedor e os acréscimos. A aprovação por budget só funciona se o admin ligar a regra.
- **Fornecedores:** a planilha (modelo na própria página) cadastra os dados dos fornecedores e, se a pessoa pode lançar budget, o budget do mês. Se não pode, a coluna BUDGET é ignorada.
- O backup do banco (`backup.bat`) já leva formulários, budget e cadastros.

## Importar e consultar (etapa 2)

- **Importar relatório** (Importar e exportar): escolha o anexo do Protheus (`.xlsx`, aba **Geral**). A data de geração vem do nome do arquivo (`RV_NECESSIDADES_2026-10-26.xlsx`) ou do campo de data. O servidor confere as colunas, os códigos repetidos, a data (não pode ser futura nem anterior à última compra do relatório) e barra arquivo idêntico a um já importado, com a opção *Importar mesmo assim*.
- **Importar Monitor de Estoque** (na página Pedidos bloqueados): mesma conferência; o Monitor da mesma data substitui o anterior. Guardam-se os 10 Monitores mais recentes.
- **A última importação fica guardada no servidor** até outra a sobrepor: fechar o sistema, desligar o computador ou abrir de outro navegador não pede para importar de novo. Importar de novo uma data que já existe **substitui** a anterior daquela data (vale para o relatório e para o Monitor). Datas diferentes ficam como histórico (os 60 relatórios mais recentes; mude com `RVN_MANTER_RELATORIOS`, e `1` guarda só o último). O seletor **Relatório**, no alto da tela, escolhe qual mostrar, e a mais recente abre sozinha.
- Quem pode importar e excluir é definido em *Níveis e permissões*: por padrão, Admin e Gerência importam; só o Admin exclui.
- Os formatos aceitos são `.xlsx` e `.xlsm`. Arquivo `.xls` antigo: abra no Excel e salve como *Pasta de Trabalho do Excel*.

## Usar

- **Administração, Usuários:** crie cada pessoa (nome, usuário, e-mail, nível e, para compradores, o nome como aparece na coluna Comprador do Protheus). O sistema gera uma **senha temporária**, mostrada uma única vez; no primeiro acesso a pessoa é obrigada a trocar.
- **Administração, Níveis e permissões:** o padrão de cada nível (Gerência, Diretoria, Comprador). O Admin sempre tem tudo.
- **Usuários, Acessos:** exceções por pessoa: *seguir o nível*, *permitir* ou *bloquear* cada permissão, e o alcance dos dados (todos, só os próprios, ou compradores e Marcas escolhidos).
- **Administração, Registro de ações:** logins, tentativas erradas, acessos negados e toda mudança de usuário ou permissão.
- Estrutura (usuários, permissões, registro, parâmetros) é **só do Admin** e não pode ser delegada.

Padrão inicial: Gerência (Andreia) tem as permissões de operação e não mexe na estrutura; ela lança budget mas não muda regras, e **não** aprova preço acima da tolerância (só o Admin). Diretoria aprova formulários e consulta budget. Comprador vê só os próprios itens.

## Segurança embutida

- Senhas guardadas só como hash (scrypt); mínimo de 10 caracteres com letras e números; troca obrigatória da senha temporária.
- Bloqueio de 15 minutos após 5 senhas erradas; mensagem igual para usuário inexistente e senha errada.
- Sessão que expira após 8 horas sem uso, e que cai quando a senha, o nível ou os acessos da pessoa mudam, ou quando ela é desativada.
- Proteção contra formulário forjado (CSRF), cabeçalhos de segurança e política de conteúdo restritiva.
- Cada pedido de página confere a permissão no servidor, não só esconde o menu.

## Backup

No Windows, dê dois cliques em **`backup.bat`** (ou rode `backup.bat D:\\CopiasRVN` para escolher a pasta). Em Linux ou Mac: `venv/bin/python -m rvn backup`.
Grava uma cópia consistente do banco em `backup`, dentro da pasta de dados, mantendo as 30 últimas (`--manter` muda o número; `--pasta` muda o destino). Agende todo dia, de preferência para uma pasta em **outro disco**: no Windows, abra o **Agendador de Tarefas**, crie uma tarefa diária que execute `backup.bat` (com a pasta de destino como argumento). O agendamento automático e a cópia para fora do computador entram na etapa 5.

## Acesso de fora do escritório (etapa 5)

A decisão é o **túnel Cloudflare**: o computador se conecta à Cloudflare e ninguém abre porta no roteador. O sistema já está preparado: ao rodar atrás do túnel, defina `RVN_PROXY=1` e `RVN_HTTPS=1` (cookie Secure, HSTS e IP real no registro) e mantenha o sistema em `127.0.0.1`. Nunca abra a porta 8080 no roteador. Para a rede do escritório sem túnel, use `--host 0.0.0.0` só dentro da rede interna.

## Testes

```
venv/bin/pip install -r requirements-dev.txt
venv/bin/python -m pytest
```

## Atualizar de uma versão anterior

Descompacte a nova versão **por cima** da pasta antiga (a pasta `venv` não vem no zip e fica como está) e dê dois cliques em `instalar.bat`: ele atualiza os componentes e, se já existe um admin, não pede cadastro de novo. O `iniciar.bat` também instala sozinho o que faltar. Os dados ficam fora da pasta do sistema (veja acima), então atualizar não mexe neles.

## Limites desta etapa

- Testado em Linux. No Windows, o caminho é o mesmo (Python, Flask e Waitress funcionam igual), mas ainda não foi testado lá.
- Sem recuperação de senha por e-mail: quem esquece pede ao admin uma senha nova.
- Os formulários e o budget que você criou no arquivo HTML de teste **não passam** para o sistema web: o navegador deles é outro. Recomece pelo sistema web (os dados reais ainda não estavam no teste).
- O PDF do pedido e os PDFs e planilhas de relatórios são gerados no navegador, com as linhas que o servidor liberou.
- O relatório é lido do Excel por uma biblioteca (openpyxl). Importe só arquivos de quem tem permissão para importar: o servidor não aceita upload de mais ninguém.
