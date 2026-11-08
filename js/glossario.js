// Glossário institucional — pesquisa e exibição exclusivamente locais (JSON estático).
let GLOSSARIO=[];
const byId=id=>document.getElementById(id);
const fold=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
const TERMS_PER_PAGE=36;
let shown=TERMS_PER_PAGE, filtered=[];
function glossaryMatch(entry,term){return fold(entry.termo+' '+entry.definicao+' '+entry.notas.join(' ')).includes(fold(term));}
function showTerm(entry){
  const d=byId('glossario-dialogo');
  byId('glossario-termo').textContent=entry.termo;
  const body=byId('glossario-corpo');body.replaceChildren();
  if(entry.definicao){const p=document.createElement('p');p.textContent=entry.definicao;body.append(p);}
  if(entry.notas?.length){const label=document.createElement('div');label.className='glossary-label';label.textContent='Notas, referências e relações do glossário';body.append(label);const ul=document.createElement('ul');for(const text of entry.notas){const li=document.createElement('li');li.textContent=text;ul.append(li);}body.append(ul);}
  const src=document.createElement('div');src.className='glossary-source';src.textContent=`Fonte: Congresso Nacional, Glossário de Termos Orçamentários (2020), página impressa ${entry.pagina_impressa}, página ${entry.pagina_pdf} do PDF. Definição da edição de 2020.`;body.append(src);
  d.showModal();
}
function renderGlossary(){
  const list=byId('glossario-lista');list.replaceChildren();
  filtered=GLOSSARIO.filter(e=>glossaryMatch(e,byId('glossario-busca').value.trim()));
  const frag=document.createDocumentFragment();for(const entry of filtered.slice(0,shown)){
    const b=document.createElement('button');b.type='button';b.className='glossary-term';b.textContent=entry.termo;b.addEventListener('click',()=>showTerm(entry));frag.append(b);
  }list.append(frag);
  byId('glossario-status').textContent=`${filtered.length.toLocaleString('pt-BR')} verbete(s) encontrado(s) · edição 2020`;
  byId('glossario-mais').hidden=shown>=filtered.length;
}
function openGlossaryByName(term){
 const normalized=fold(term);
 let found=GLOSSARIO.find(e=>fold(e.termo)===normalized);
 if(!found)found=GLOSSARIO.find(e=>fold(e.termo).startsWith(normalized+' ('));
 if(!found){byId('glossario-busca').value=term;shown=TERMS_PER_PAGE;renderGlossary();byId('glossario').scrollIntoView({behavior:'smooth'});return;}
 showTerm(found);
}
// Integração com campos estruturados da ficha da emenda, preservando o código da consulta.
const fieldTerms={funcao:'Função',subfuncao:'Subfunção',programa:'Programa',subtitulo:'Subtítulo',acao:'Ação Orçamentária',orgao_orcamentario:'Órgão Orçamentário',unidade_orcamentaria:'Unidade Orçamentária (UO)',esfera_orcamentaria:'Classificação por Esfera Orçamentária',tipo_emenda:'Emenda',modalidade_emenda:'Emenda <quanto à autoria>'};
function decorateDetails(){
 const container=byId('detalhe-corpo');if(!container)return;
 for(const dt of container.querySelectorAll('.detail dt')){
   const name=fold(dt.textContent.trim()).replaceAll(' ','_');
   const term=fieldTerms[name];if(!term || dt.querySelector('button'))continue;
   const btn=document.createElement('button');btn.className='glossary-reference';btn.type='button';btn.setAttribute('aria-label',`Consultar definição de ${term}`);btn.textContent='ⓘ';btn.addEventListener('click',()=>openGlossaryByName(term));dt.append(' ',btn);
 }
}
const detail=byId('detalhe');if(detail){new MutationObserver(decorateDetails).observe(byId('detalhe-corpo'),{childList:true});}
byId('glossario-fechar').addEventListener('click',()=>byId('glossario-dialogo').close());
byId('glossario-busca').addEventListener('input',()=>{shown=TERMS_PER_PAGE;renderGlossary();});
byId('glossario-mais').addEventListener('click',()=>{shown+=TERMS_PER_PAGE;renderGlossary();});
(async()=>{
 try{
   const res=await fetch('./glossario/glossario.json',{cache:'no-cache'});
   if(!res.ok)throw new Error(`HTTP ${res.status}`);
   const data=await res.json();
   if(!Array.isArray(data.verbetes)||data.verbetes.length<100)throw new Error('Estrutura do glossário inválida');
   GLOSSARIO=data.verbetes;renderGlossary();
 }catch(e){byId('glossario-status').textContent=`Não foi possível carregar o glossário: ${e.message}`;console.error(e);}
})();
