import * as duckdb from '@duckdb/duckdb-wasm';

const FILES = [2020, 2021, 2022, 2023];
const COLS = ['ano','numero_emenda','codigo_emenda','pagina_inicial','pagina_final','numero_paginas','cabecalho_formulario','tipo_formulario','tipo_autor_cabecalho','codigo_autor','nome_autor','cargo_autor','ementa','tipo_emenda','modalidade_emenda','esfera_orcamentaria','area_governo','modalidade_intervencao','tipo_realizacao','orgao_orcamentario','unidade_orcamentaria','funcional_programatica','programa','subtitulo','localidade_beneficiada','funcao','subfuncao','acao','total_acrescimo_original','total_acrescimo_reais','total_cancelamento_original','total_cancelamento_reais','valor_proposto_original','valor_proposto_reais','referencia_texto','tipo_adicao','texto_proposto','justificativa','status_extracao','problemas_extracao'];
const el = id => document.getElementById(id);
const money = x => x == null ? 'Não informado' : new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2}).format(Number(x));
const num = x => new Intl.NumberFormat('pt-BR').format(Number(x || 0));
const asNumber = x => Number(x ?? 0);
const safe = x => String(x ?? 'Não informado');
const escapeHtml = x => safe(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const quote = s => `'${String(s).replace(/'/g,"''")}'`;
const rows = result => result.toArray().map(row => Object.fromEntries(Object.entries(row.toJSON ? row.toJSON() : row).map(([k,v])=>[k,typeof v === 'bigint' ? Number(v) : v])));
let db, conn, page = 0, total = 0, activeWhere = 'TRUE', ready = false;
const PAGE_SIZE = 25;

function status(message, error=false) { el('status').textContent = message; el('status').classList.toggle('error',error); }
async function query(sql) { return rows(await conn.query(sql)); }
function filters() {
  const clauses = [];
  for (const [id, column] of [['ano','ano'],['autor','nome_autor'],['tipo','tipo_emenda'],['cargo','cargo_autor'],['realizacao','tipo_realizacao'],['area','area_governo'],['esfera','esfera_orcamentaria']]) {
    const value = el(id).value;
    if (value) clauses.push(id === 'ano' ? `${column} = ${Number(value)}` : `${column} = ${quote(value)}`);
  }
  const term = el('busca').value.trim();
  if (term) {
    const pattern = quote('%' + term.replace(/[\\%_]/g,'\\$&') + '%');
    clauses.push(`(${['numero_emenda','codigo_emenda','nome_autor','ementa','localidade_beneficiada','programa'].map(column=>`COALESCE(${column}, '') ILIKE ${pattern} ESCAPE '\\'`).join(' OR ')})`);
  }
  return clauses.join(' AND ') || 'TRUE';
}
async function fillSelect(id,column) {
  const options = await query(`SELECT DISTINCT ${column} AS value FROM emendas WHERE NULLIF(TRIM(CAST(${column} AS VARCHAR)), '') IS NOT NULL ORDER BY value`);
  const select = el(id);
  for (const {value} of options) { const opt = document.createElement('option'); opt.value = value; opt.textContent = value; select.append(opt); }
}
function chart(id,data,labelKey,valueKey){
  const target=el(id);target.replaceChildren();
  if(!data.length){target.textContent='Nenhum registro.';return;}
  const max=Math.max(...data.map(x=>asNumber(x[valueKey])),1);
  for(const datum of data){
    const row=document.createElement('div'); row.className='barrow';
    const label=document.createElement('span'); label.className='barlabel';label.textContent=safe(datum[labelKey]);label.title=safe(datum[labelKey]);
    const track=document.createElement('div');track.className='bartrack';const bar=document.createElement('div');bar.className='barfill';bar.style.width=`${100*asNumber(datum[valueKey])/max}%`;track.append(bar);
    const count=document.createElement('span');count.className='barcount';count.textContent=num(datum[valueKey]);
    row.append(label,track,count);target.append(row);
  }
}
async function refresh() {
  if(!ready)return;
  status('Consultando emendas…');
  try {
    activeWhere=filters();page=0;
    const [[metrics],byYear,byArea] = await Promise.all([
      query(`SELECT COUNT(*) AS total, COUNT(DISTINCT NULLIF(TRIM(nome_autor),'')) AS autores, COUNT(DISTINCT ano) AS anos FROM emendas WHERE ${activeWhere}`),
      query(`SELECT CAST(ano AS VARCHAR) AS label, COUNT(*) AS n FROM emendas WHERE ${activeWhere} GROUP BY ano ORDER BY ano`),
      query(`SELECT COALESCE(NULLIF(TRIM(area_governo),''),'Não informado') AS label, COUNT(*) AS n FROM emendas WHERE ${activeWhere} GROUP BY 1 ORDER BY n DESC LIMIT 6`)
    ]);
    total=asNumber(metrics.total);
    el('m-total').textContent=num(total);el('m-valor').textContent='Em revisão';el('m-autores').textContent=num(metrics.autores);el('m-anos').textContent=num(metrics.anos);
    chart('chart-ano',byYear,'label','n');chart('chart-area',byArea,'label','n');
    el('exportar').disabled=total===0;
    await renderPage();
    status('Consulta concluída. Resultados atualizados conforme os filtros.');
  } catch(error) {console.error(error);status(`Erro na consulta: ${error.message}`,true);}
}
async function renderPage(){
  const results = await query(`SELECT ano,numero_emenda,codigo_emenda,nome_autor,tipo_emenda,area_governo,valor_proposto_reais FROM emendas WHERE ${activeWhere} ORDER BY ano DESC, numero_emenda ASC, codigo_emenda ASC LIMIT ${PAGE_SIZE} OFFSET ${page*PAGE_SIZE}`);
  const target=el('linhas');target.replaceChildren();
  if(!results.length){const tr=document.createElement('tr');tr.innerHTML='<td class="empty" colspan="7">Nenhuma emenda encontrada.</td>';target.append(tr);}
  results.forEach(rec => {
    const tr=document.createElement('tr');
    for(const value of [rec.ano,rec.numero_emenda,rec.nome_autor,rec.tipo_emenda,rec.area_governo]) { const td=document.createElement('td');td.textContent=safe(value);tr.append(td); }
    const price=document.createElement('td');price.className='money';price.textContent=money(rec.valor_proposto_reais);tr.append(price);
    const action=document.createElement('td');const btn=document.createElement('button');btn.type='button';btn.className='open-detail';btn.textContent='Ver ficha';btn.addEventListener('click',()=>openDetail(rec.codigo_emenda));action.append(btn);tr.append(action);target.append(tr);
  });
  const start=total? page*PAGE_SIZE+1:0; const end=Math.min((page+1)*PAGE_SIZE,total);
  el('summary').textContent=`${num(total)} emendas correspondem aos filtros`;
  el('pageinfo').textContent=`Exibindo ${num(start)}–${num(end)} de ${num(total)}`;
  el('anterior').disabled=page===0;el('proxima').disabled=end>=total;
}
async function openDetail(code){
  try {
    const result=await query(`SELECT * FROM emendas WHERE codigo_emenda = ${quote(code)} LIMIT 1`);
    if(!result.length)return;
    const item=result[0], body=el('detalhe-corpo');body.replaceChildren();
    for(const column of COLS){const wrapper=document.createElement('div');wrapper.className='detail'+(['justificativa','texto_proposto','ementa','subtitulo','referencia_texto'].includes(column)?' long':'');const dt=document.createElement('dt');dt.textContent=column.replaceAll('_',' ');const dd=document.createElement('dd');dd.textContent=column.endsWith('_reais')?money(item[column]):safe(item[column]);wrapper.append(dt,dd);body.append(wrapper);}
    el('detalhe').showModal();
  }catch(error){status(`Erro ao abrir a ficha: ${error.message}`,true);}
}
function csvField(value){let str=value==null?'':String(value); if(/^[=+@\-\t\r]/.test(str))str="'"+str;return '"'+str.replace(/"/g,'""')+'"';}
async function exportCSV(){
  const button=el('exportar');button.disabled=true;button.textContent='Preparando CSV…';
  try{
    // Exporta TODOS os registros filtrados, não apenas a página visível.
    const dataset=await query(`SELECT * FROM emendas WHERE ${activeWhere} ORDER BY ano DESC,numero_emenda ASC,codigo_emenda ASC`);
    const csv='\ufeff'+COLS.join(';')+'\r\n'+dataset.map(row=>COLS.map(col=>csvField(row[col])).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='emendas_filtradas_2020_2023.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }catch(error){console.error(error);status(`Erro ao exportar: ${error.message}`,true);}finally{button.textContent='Exportar CSV filtrado';button.disabled=total===0;}
}
async function initialize(){
  try {
    const bundle=await duckdb.selectBundle(duckdb.getJsDelivrBundles());
    const workerURL=URL.createObjectURL(new Blob([`importScripts(${JSON.stringify(bundle.mainWorker)});`],{type:'text/javascript'}));
    const worker=new Worker(workerURL);
    db=new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(),worker);
    await db.instantiate(bundle.mainModule,bundle.pthreadWorker);
    URL.revokeObjectURL(workerURL);
    conn=await db.connect();
    for(let i=0;i<FILES.length;i++){
      const year=FILES[i];status(`Carregando dados de ${year} (${i+1} de ${FILES.length})…`);
      const response=await fetch(`./dados/emendas_${year}.parquet`);
      if(!response.ok)throw new Error(`Não foi possível carregar emendas_${year}.parquet (HTTP ${response.status}). Confira a pasta dados/ no repositório.`);
      await db.registerFileBuffer(`emendas_${year}.parquet`,new Uint8Array(await response.arrayBuffer()));
    }
    await conn.query(`CREATE VIEW emendas AS ${FILES.map(year=>`SELECT * FROM read_parquet('emendas_${year}.parquet')`).join(' UNION ALL ')}`);
    const [[count]]=await Promise.all([query('SELECT COUNT(*) AS n FROM emendas')]);
    if(Number(count.n)!==29342)status(`Atenção: foram encontrados ${num(count.n)} registros; o conjunto validado possui 29.342.`,true);
    await Promise.all([fillSelect('ano','ano'),fillSelect('autor','nome_autor'),fillSelect('cargo','cargo_autor'),fillSelect('tipo','tipo_emenda'),fillSelect('realizacao','tipo_realizacao'),fillSelect('area','area_governo'),fillSelect('esfera','esfera_orcamentaria')]);
    ready=true;await refresh();
  }catch(error){console.error(error);status(`Não foi possível iniciar o Observatório: ${error.message}. O site precisa ser aberto via HTTP(S), com os quatro Parquets presentes.`,true);el('linhas').innerHTML='<tr><td colspan="7" class="empty">Não foi possível carregar a base.</td></tr>';}
}
el('aplicar').addEventListener('click',refresh);
el('limpar').addEventListener('click',()=>{for(const id of ['busca','ano','autor','cargo','tipo','realizacao','area','esfera'])el(id).value='';refresh();});
el('busca').addEventListener('keydown',event=>{if(event.key==='Enter')refresh();});
el('anterior').addEventListener('click',async()=>{if(page>0){page--;await renderPage();}});
el('proxima').addEventListener('click',async()=>{if((page+1)*PAGE_SIZE<total){page++;await renderPage();}});
el('exportar').addEventListener('click',exportCSV);
el('fechar').addEventListener('click',()=>el('detalhe').close());
initialize();
