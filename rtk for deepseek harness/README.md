# dsh-tool-rtk

Uma linha de [Cordis](https://github.com/deepseek-ai/deepseek-harness) que dá a um
agente dsh a tool **`rtk`** — um proxy para a CLI [RTK](https://github.com/rtk-ai/rtk)
que filtra e resume a saída de comandos **antes** dela entrar no contexto do modelo.

É daí que vem a economia: o agente roda `git status`, `cargo test`, `rg`, `ls -la`
etc. através do RTK, e o que chega ao contexto é a versão compactada — tipicamente
60–90% menos tokens de tool-output nos comandos do dia a dia.

Este repositório entrega isso como um **agent preset** chamado `standard-rtk`
(o preset `standard` + a tool `rtk`).

## Pré-requisitos

1. **dsh** instalado.
2. **`rtk` no PATH** — instale antes, senão a tool aparece mas toda chamada falha
   com `[exit code: 127]`:

   ```sh
   curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh
   ```

   > **Cuidado com o nome.** Existem dois projetos chamados `rtk`: **Rust Token
   > Killer** (`rtk-ai/rtk`, este) e **Rust Type Kit** (`reachingforthejack/rtk`,
   > outro). Se `rtk --version` funciona mas `rtk gain` não mostra o painel de
   > economia, você instalou o errado — `cargo install rtk` cai no outro. Confirme
   > com `rtk gain`.

## Instalar

```sh
git clone <este-repo> ~/tools/dsh-plugins
cd ~/tools/dsh-plugins
./install.sh
```

O instalador **nunca toca a instalação do dsh nem os presets shipped**. Ele:

1. copia o **seu próprio** preset `standard` para `~/.dsh/.agent-presets/standard-rtk/`;
2. anexa a linha `- id: tool-rtk` ao final da composição;
3. copia `rtk.js` para dentro do preset;
4. cria o shim de resolução `node_modules` (veja abaixo);
5. carrega o plugin num processo Node novo para provar que ele resolve.

Se já existir um preset nesse id que **não** foi criado por este script, ele é
movido para um `.bak-<timestamp>` em vez de ser apagado.

Opções: `PRESET_ID`, `PRESET_NAME`, `SOURCE_PRESET`, `DSH_HOME`.

## Usar

1. Em dsh, abra **Settings → Agent preset**.
2. Inicie uma sessão no preset **“Coding + RTK”**.
3. Confirme que a tool `rtk` aparece, e peça `rtk gain` para ver o painel.

O plugin é **somente Host**: registra a tool no registry do host e não tem metade
de browser, então não pede aprovação nenhuma — instalou, usa.

## Desinstalar

```sh
./install.sh --uninstall
```

Remove só `~/.dsh/.agent-presets/standard-rtk`. O binário `rtk` fica.

## Como funciona (as duas partes não óbvias)

**1. A linha mora no preset, não na composição do host.**
O registry `tools` pertence ao host, mas o que um preset *contribui* para ele são
as suas tools — é exatamente onde `tool-bash` e `tool-fs` moram no próprio
`standard`. O plugin só **consome** serviços (`tools`, `shell`, e opcionalmente
`shellEnv`/`sandboxPolicy`), então não publica service e não precisa de `isolate`
realm. Se publicasse, o mount seria rejeitado.

**2. O `node_modules` dentro do preset é um shim de resolução.**
`rtk.js` importa `@deepseek-ai/dsh-tools` (para o `defineTool`). Um arquivo sob
`~/.dsh/.agent-presets/` **não alcança** os pacotes do harness: o walk do Node sobe
por `~/.dsh/`, `~/` e `/`, e nenhum deles tem `@deepseek-ai/*`. O dsh resolve isso
para *nomes de pacote* (ele reescreve o base dessas linhas para a instalação), mas
não para os imports internos de um arquivo que ele carrega.

Por isso o preset leva um `node_modules` com um symlink para
`<DSH_HOME>/profiles/node_modules/@deepseek-ai/dsh-tools`. Apontar para o farm do
profile (e não direto para o diretório da versão) faz o symlink sobreviver a
upgrades. O Node resolve o realpath, então o plugin compartilha a **mesma
instância de módulo** do harness.

Esse symlink é específico da máquina — é justamente por isso que existe um
instalador em vez de um diretório de preset versionado. Se você adicionar um
import novo ao `rtk.js`, crie o symlink correspondente (o instalador mostra o
padrão).

> **Detalhe que custa uma hora:** um dsh em execução cacheia o *module job* que
> falhou para uma dada URL de arquivo. Depois de corrigir a resolução, ele
> continua reportando o erro antigo para o mesmo caminho. Um processo Node novo
> resolve na hora — foi assim que este plugin foi depurado.

## Ressalvas honestas

- **O preset é um snapshot.** Ele é construído a partir do `standard` da sua
  instalação no momento do install. Um preset não herda de outro, então depois de
  atualizar o dsh rode `./install.sh` de novo para pegar o `standard` novo.
- **Não testado em Windows.** No `standard` a linha `tool-bash` é desabilitada no
  Windows e `tool-pwsh` assume; a tool funciona através de `ctx.shell` nos dois
  casos, mas o RTK é uma CLI POSIX-first.
- **Custo recorrente.** A descrição da tool entra no contexto a cada passo (~200
  tokens). Ela se paga nos comandos que você deixa de rodar crus, mas não é grátis.
- **Recuperação de output elidido.** Quando um filtro do RTK corta conteúdo, ele
  imprime um hash; o agente recupera o trecho com `rtk recall <hash>`. Isso está
  descrito na própria descrição da tool.

## Distribuição como pacote npm (alternativa)

Em vez do arquivo preset-local, o plugin pode virar um pacote npm e a linha virar
um nome de pacote:

```yaml
- id: tool-rtk
  name: 'dsh-tool-rtk'
```

Linhas com nome de pacote são resolvidas a partir da instalação, então o arquivo
não precisa de shim. O custo é que isso exige `pnpm` e
`dsh plugin --profile <perfil> add dsh-tool-rtk`, além de publicar no registry (ou
instalar de git). O caminho por arquivo preset-local foi escolhido por funcionar
sem nada disso.

## Licença

Nenhuma foi escolhida para este código ainda — defina uma antes de publicar.
O preset gerado é derivado do `standard` que acompanha o dsh, que pertence à sua
instalação; por isso o instalador o copia da máquina de quem instala, em vez de
redistribuí-lo.
