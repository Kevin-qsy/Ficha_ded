if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

// ====== Ficha Prática - main.js (rev) ======

// ===== i18n baseline (futuro) =====
const STR = {
  saved: 'Salvo',
  semNome: 'Sem nome',
  selecClasse: 'Selecione uma classe para ver Dado de Vida e TRs.',
  dlgExcluir: (nome) => `Excluir ficha “${nome}”? Esta ação não pode ser desfeita.`,
  noPoints: 'Sem pontos suficientes.',
  negPoints: 'Você está com pontos negativos.',
  pbMsgPrior: 'Distribuí priorizando suas estrelas (se houver).',
};

// ===== Utilidades =====
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

function clamp(v, min, max){ v = Number(v||0); return Math.max(min, Math.min(max, v)); }
function profByLevel(n){ n = Number(n)||1; if(n>=17) return 6; if(n>=13) return 5; if(n>=9) return 4; if(n>=5) return 3; return 2; }
function mod(score){ return Math.floor((Number(score||0) - 10) / 2); }
function fmt(n){ const x = Number(n)||0; return (x>=0? `+${x}` : `${x}`); }
function fmtDate(ts){
  const d = new Date(ts||Date.now());
  const data = d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'});
  const hora = d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
  return `${data} ${hora}`;
}
function uuid(){
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
}

// ===== Dados por classe (D&D 5e) =====
const ATR_MAP = { for:0, des:1, con:2, int:3, sab:4, car:5 };
const ATR_LABEL = { for:'Força', des:'Destreza', con:'Constituição', int:'Inteligência', sab:'Sabedoria', car:'Carisma' };

const CLASS_DATA = {
  barbaro:     { hitDie:'d12', saves:['for','con'], label:'Bárbaro' },
  bardo:       { hitDie:'d8',  saves:['des','car'], label:'Bardo' },
  clerigo:     { hitDie:'d8',  saves:['sab','car'], label:'Clérigo' },
  druida:      { hitDie:'d8',  saves:['int','sab'], label:'Druida' },
  guerreiro:   { hitDie:'d10', saves:['for','con'], label:'Guerreiro' },
  monge:       { hitDie:'d8',  saves:['for','des'], label:'Monge' },
  paladino:    { hitDie:'d10', saves:['sab','car'], label:'Paladino' },
  patrulheiro: { hitDie:'d10', saves:['for','des'], label:'Patrulheiro' },
  ladino:      { hitDie:'d8',  saves:['des','int'], label:'Ladino' },
  feiticeiro:  { hitDie:'d6',  saves:['con','car'], label:'Feiticeiro' },
  bruxo:       { hitDie:'d8',  saves:['sab','car'], label:'Bruxo' },
  mago:        { hitDie:'d6',  saves:['int','sab'], label:'Mago' },
  artifice:    { hitDie:'d8',  saves:['con','int'], label:'Artífice' },
};

// ===== Persistência (múltiplas fichas) =====
const META_KEY = 'fichas5e_meta';
const CURRENT_KEY = 'ficha5e_current';
const OLD_SINGLE_KEY = 'ficha5e';
const SCHEMA = { version: 1, app: 'ficha5e' };

function readMeta(){
  try{
    const raw = localStorage.getItem(META_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if(!Array.isArray(arr)) return [];
    return arr.sort((a,b)=>(b.atualizadoEm||0)-(a.atualizadoEm||0));
  }catch{ return []; }
}
function writeMeta(list){ localStorage.setItem(META_KEY, JSON.stringify(list||[])); }
function upsertMeta(entry){
  const list = readMeta();
  const idx = list.findIndex(i=>i.id===entry.id);
  if(idx>=0) list[idx] = {...list[idx], ...entry};
  else list.push(entry);
  writeMeta(list);
}
function removeMeta(id){ writeMeta(readMeta().filter(i=>i.id!==id)); }
function getCurrentId(){ return localStorage.getItem(CURRENT_KEY)||null; }
function setCurrentId(id){ if(id) localStorage.setItem(CURRENT_KEY, id); else localStorage.removeItem(CURRENT_KEY); }
function storageKeyFor(id){ return `ficha5e:${id}`; }
function readFicha(id){
  if(!id) return null;
  const raw = localStorage.getItem(storageKeyFor(id));
  if(!raw) return null;
  try{ return JSON.parse(raw); }catch{ return null; }
}
function writeFicha(id, data){
  const payload = { _schema: SCHEMA, ...data };
  localStorage.setItem(storageKeyFor(id), JSON.stringify(payload));
}

// ===== Focus trap + body scroll lock para overlays custom (OB/PB) =====
let _overlayPrevFocus = null;
function getFocusable(root){
  return $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', root)
    .filter(el => !el.disabled && el.offsetParent !== null);
}
function lockScroll(){ document.body.dataset._scrollLock = '1'; document.body.style.overflow = 'hidden'; }
function unlockScroll(){ delete document.body.dataset._scrollLock; document.body.style.overflow = ''; }

function show(el){
  if(!el) return;
  if('hidden' in el) el.hidden = false;
  el.classList?.remove?.('hidden');
  if(el.id === 'home'){ el.style.display = 'grid'; }
  if(el === $('#ob') || el === $('#pb')){
    lockScroll();
    _overlayPrevFocus = document.activeElement;
    const focusables = getFocusable(el);
    focusables[0]?.focus();
    el.addEventListener('keydown', trapTab);
    el.addEventListener('keydown', onEscClose);
  }
}
function hide(el){
  if(!el) return;
  if('hidden' in el) el.hidden = true;
  el.classList?.add?.('hidden');
  if(el.id === 'home'){ el.style.display = 'none'; }
  if(el === $('#ob') || el === $('#pb')){
    el.removeEventListener('keydown', trapTab);
    el.removeEventListener('keydown', onEscClose);
    unlockScroll();
    _overlayPrevFocus?.focus?.();
  }
}
function trapTab(e){
  if(e.key !== 'Tab') return;
  const root = e.currentTarget;
  const nodes = getFocusable(root);
  if(nodes.length === 0) return;
  const first = nodes[0], last = nodes[nodes.length-1];
  if(e.shiftKey && document.activeElement === first){ last.focus(); e.preventDefault(); }
  else if(!e.shiftKey && document.activeElement === last){ first.focus(); e.preventDefault(); }
}
function onEscClose(e){
  if(e.key === 'Escape'){
    const dlg = e.currentTarget;
    if(dlg.id === 'ob') hide(dlg);
    if(dlg.id === 'pb') hide(dlg);
  }
}

// ===== Helpers de DOM/data =====
function getAtributos(){
  // clamp 1–30
  return $$('.atributos .atributo .valor').map(i => clamp(i.value, 1, 30));
}

function getHeaderValues(){
  const root = $('#info-geral');
  return {
    nome:  root?.querySelector('[data-field="nome"]')?.value?.trim() || STR.semNome,
    classe:root?.querySelector('[data-field="classe"]')?.value?.trim() || '',
    nivel: clamp(root?.querySelector('[data-field="nivel"]')?.value || 1, 1, 20)
  };
}

function buildFichaDataFromDOM(){
  return {
    _schema: SCHEMA,
    cabecalho: $$('#info-geral input').map(i=>i.value),
    atributos: $$('.atributos .atributo .valor').map(i=>i.value),
    prof: $('#prof .valor')?.value,
    trsProf: $$('.testes-resistencia .teste .prof').map(ch=>ch.checked),
    periciasProf: $$('.pericias .pericia .prof').map(ch=>ch.checked),

    pvMax: $('#pv-max')?.value,
    pvAtual: $('#pv-atual')?.value,

    dvBase: $('#dv-base')?.value,
    dvTotal: $('#dv-total')?.value,
    dvGastos: $('#dv-gastos')?.value,

    mortesSucesso: $$('.ds.sucesso').map(b=>b.checked),
    mortesFalha: $$('.ds.falha').map(b=>b.checked),

    ataques: [1,2,3].map(n=>({
      nome:  $(`[data-field="atk-nome-${n}"]`)?.value || '',
      bonus: $(`[data-field="atk-bonus-${n}"]`)?.value || '',
      dano:  $(`[data-field="atk-dano-${n}"]`)?.value || '',
      alcance: $(`[data-field="atk-alcance-${n}"]`)?.value || '',
      notas: $(`[data-field="atk-notas-${n}"]`)?.value || ''
    })),

    cdMagia: $('#cd-magia')?.value,
    bonusMagia: $('#bonus-magia')?.value,
    listaMagias: $('#lista-magias')?.value,

    caracteristicas: $('#caracteristicas')?.value,
    equipamentos: $('#equipamentos')?.value,
    idiomasProfs: $('#idiomas-proficiencias')?.value,

    ca: $('.ca')?.value,
    inc: $('.inc')?.value,
    mov: $('.mov')?.value,
  };
}

function fillDOMFromFichaData(d){
  if(!d) return;

  $$('#info-geral input').forEach((i,idx)=>{ if(d.cabecalho?.[idx] != null) i.value = d.cabecalho[idx]; });
  $$('.atributos .atributo .valor').forEach((i,idx)=>{ if(d.atributos?.[idx] != null) i.value = d.atributos[idx]; });

  if(d.prof != null) $('#prof .valor').value = d.prof;

  $$('.testes-resistencia .teste .prof').forEach((ch,idx)=>{
    if(d.trsProf?.[idx] != null) ch.checked = !!d.trsProf[idx];
  });

  $$('.pericias .pericia .prof').forEach((ch,idx)=>{
    if(d.periciasProf?.[idx] != null) ch.checked = !!d.periciasProf[idx];
  });

  if(d.pvMax != null) $('#pv-max').value = d.pvMax;
  if(d.pvAtual != null) $('#pv-atual').value = d.pvAtual;

  if(d.dvBase != null) $('#dv-base').value = d.dvBase;
  if(d.dvTotal != null) $('#dv-total').value = d.dvTotal;
  if(d.dvGastos != null) $('#dv-gastos').value = d.dvGastos;

  $$('.ds.sucesso').forEach((b,idx)=>{ if(d.mortesSucesso?.[idx] != null) b.checked = !!d.mortesSucesso[idx]; });
  $$('.ds.falha').forEach((b,idx)=>{ if(d.mortesFalha?.[idx] != null) b.checked = !!d.mortesFalha[idx]; });

  [1,2,3].forEach(n=>{
    const a = d.ataques?.[n-1] || {};
    ['nome','bonus','dano','alcance','notas'].forEach(key=>{
      const el = $(`[data-field="atk-${key}-${n}"]`);
      if(el && a[key]!=null) el.value = a[key];
    });
  });

  if(d.cdMagia != null) $('#cd-magia').value = d.cdMagia;
  if(d.bonusMagia != null) $('#bonus-magia').value = d.bonusMagia;
  if(d.listaMagias != null) $('#lista-magias').value = d.listaMagias;

  if(d.caracteristicas != null) $('#caracteristicas').value = d.caracteristicas;
  if(d.equipamentos != null) $('#equipamentos').value = d.equipamentos;
  if(d.idiomasProfs != null) $('#idiomas-proficiencias').value = d.idiomasProfs;

  if(d.ca != null) $('.ca').value = d.ca;
  if(d.mov != null) $('.mov').value = d.mov;

  applyDerived();
}

// ===== Recalcular valores derivados =====
function applyDerived(){
  const attrs = getAtributos();
  const profBonus = Number($('#prof .valor')?.value || 0);

  // Mods com sinal (+/−)
  $$('.atributos .atributo .mod').forEach((m,idx)=>{
    m.value = fmt(mod(attrs[idx]));
  });

  // Iniciativa (type text, readonly)
  const inc = $('.trio-ca-inc-mov .inc');
  if(inc) inc.value = fmt(mod(attrs[ATR_MAP.des]));

  // TRs
  $$('.testes-resistencia .teste').forEach((t, idx)=>{
    const ehProf = t.querySelector('.prof')?.checked;
    const saida = t.querySelector('.valor');
    const valor = mod(attrs[idx]) + (ehProf? profBonus : 0);
    if(saida) saida.value = fmt(valor);
  });

  // Perícias
  $$('.pericias .pericia').forEach(p=>{
    const sigla = p.getAttribute('data-attr');
    if(!sigla) return;
    const idx = ATR_MAP[sigla];
    const ehProf = p.querySelector('.prof')?.checked;
    const saida = p.querySelector('.valor');
    const valor = mod(attrs[idx]) + (ehProf? profBonus : 0);
    if(saida) saida.value = fmt(valor);
  });

  // DV restantes + feedback visual
  const dvTotalEl = $('#dv-total');
  const dvGastosEl = $('#dv-gastos');
  const dvTotal = Number(dvTotalEl?.value || 0);
  const dvGastos = Number(dvGastosEl?.value || 0);
  const dvRest = Math.max(0, dvTotal - dvGastos);
  const dvRestantes = $('#dv-restantes');
  if(dvRestantes) dvRestantes.value = String(dvRest);
  // feedback quando gastos > total
  if(dvGastosEl){
    if(dvGastos > dvTotal) dvGastosEl.classList.add('input-warn');
    else dvGastosEl.classList.remove('input-warn');
  }

  // Normalização PV
  const pvMaxEl = $('#pv-max');
  const pvAtualEl = $('#pv-atual');
  if(pvMaxEl && pvAtualEl){
    const pvMax = Math.max(1, Number(pvMaxEl.value || 1));
    let pvAtual = Number(pvAtualEl.value || 0);
    if(pvAtual > pvMax) pvAtual = pvMax;
    if(pvAtual < 0) pvAtual = 0;
    pvMaxEl.value = pvMax;
    pvAtualEl.value = pvAtual;
  }
}

// ===== Death Saves: máximo 3 por grupo =====
function setupDeathSaves(){
  const limitGroup = (selector)=>{
    const boxes = $$(selector);
    boxes.forEach(box=>{
      box.addEventListener('change', ()=>{
        const checked = boxes.filter(b=>b.checked);
        if(checked.length > 3){ box.checked = false; }
      });
    });
  };
  limitGroup('.ds.sucesso');
  limitGroup('.ds.falha');
}

// ===== Home (Minhas Fichas) =====
function showHome(){
  show($('#home'));
  hide($('#ficha'));
  renderHome();
}
function showFicha(){
  hide($('#home'));
  show($('#ficha'));
  applyDerived();
}

function renderHome(){
  const list = readMeta();
  const grid = $('#home-list');
  const empty = $('#home-empty');
  if(!grid || !empty) return;

  grid.innerHTML = '';
  empty.style.display = list.length === 0 ? 'block' : 'none';

  if(list.length === 0) return;

  const tpl = $('#tpl-card-ficha');
  list.forEach(meta=>{
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = meta.id;
    node.querySelector('.card-ficha_nome').textContent = meta.nome || STR.semNome;
    const sub = [];
    if(meta.classe) sub.push(meta.classe);
    if(meta.nivel!=null) sub.push(`Nível ${meta.nivel}`);
    node.querySelector('.card-ficha_meta').textContent = sub.join(' • ') || '—';
    node.querySelector('.card-ficha_time').textContent = `Atualizada em ${fmtDate(meta.atualizadoEm)}`;
    grid.appendChild(node);
  });
}

// Delegação de eventos dos cards + ações da Home
function setupHomeEvents(){
  const grid = $('#home-list');
  if(grid){
    grid.addEventListener('click', async (e)=>{
      const btn = e.target.closest('button[data-action]');
      if(!btn) return;
      const card = btn.closest('.card-ficha');
      const id = card?.dataset.id;
      if(!id) return;
      const action = btn.dataset.action;

      if(action === 'load'){ loadFicha(id); }
      else if(action === 'rename'){
        const novo = await promptRename(card.querySelector('.card-ficha_nome')?.textContent || '');
        if(novo && novo.trim()){ renameFicha(id, novo.trim()); }
      }else if(action === 'delete'){
        const ok = await confirmDelete(card.querySelector('.card-ficha_nome')?.textContent || 'esta ficha');
        if(ok){ deleteFicha(id); }
      }else if(action === 'export'){ exportFicha(id); }
    });
  }

  $('#home-create-btn')?.addEventListener('click', openOnboarding);
  $('#home-empty-create')?.addEventListener('click', openOnboarding);

  // Import
  const importBtn = $('#home-import-btn');
  const importFile = $('#home-import-file');
  importBtn?.addEventListener('click', ()=> importFile?.click());
  importFile?.addEventListener('change', ()=>{
    const file = importFile.files?.[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const parsed = JSON.parse(reader.result);
        importFichaFromJSON(parsed);
      }catch(e){ alert('Arquivo inválido.'); }
      finally{
        importFile.value = '';
      }
    };
    reader.readAsText(file, 'utf-8');
  });
}

// ===== Diálogos (rename / delete) =====
function promptRename(nomeAtual){
  return new Promise((resolve)=>{
    const dlg = $('#dlg-rename');
    if(!dlg){ resolve(null); return; }
    const input = $('#dlg-rename-input');
    input.value = nomeAtual || '';
    dlg.showModal();
    const onClose = ()=>{
      dlg.removeEventListener('close', onClose);
      resolve(dlg.returnValue === 'ok' ? input.value : null);
    };
    dlg.addEventListener('close', onClose, {once:true});
  });
}
function confirmDelete(nome){
  return new Promise((resolve)=>{
    const dlg = $('#dlg-confirm-delete');
    if(!dlg){ resolve(false); return; }
    const p = $('#dlg-confirm-delete-text');
    if(p) p.textContent = STR.dlgExcluir(nome);
    dlg.showModal();
    const onClose = ()=>{
      dlg.removeEventListener('close', onClose);
      resolve(dlg.returnValue === 'ok');
    };
    dlg.addEventListener('close', onClose, {once:true});
  });
}

// ===== Ações sobre fichas =====
function loadFicha(id){
  const data = readFicha(id);
  if(!data) return;
  fillDOMFromFichaData(data);
  setCurrentId(id);
  showFicha();
}

function renameFicha(id, novoNome){
  upsertMeta({ id, nome: novoNome, atualizadoEm: Date.now() });
  if(getCurrentId() === id){
    const headerName = $('#info-geral [data-field="nome"]');
    if(headerName) headerName.value = novoNome;
    saveLocal({silent:true});
  }
  renderHome();
}

function deleteFicha(id){
  if(getCurrentId() === id){
    setCurrentId(null);
    showHome();
  }
  localStorage.removeItem(storageKeyFor(id));
  removeMeta(id);
  renderHome();
}

function exportFicha(id){
  const data = readFicha(id);
  if(!data) return;
  const meta = readMeta().find(m=>m.id===id) || {};
  // Exportaremos apenas a ficha (meta diferenciada veremos depois)
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(meta.nome||'ficha')}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

function importFichaFromJSON(json){
  // Aceita objetos com ou sem _schema
  const id = uuid();
  writeFicha(id, json._schema ? json : { _schema: SCHEMA, ...json });

  // Derive meta básica
  const cab = json.cabecalho || [];
  const nome = (cab?.[0] || STR.semNome).trim();
  const classe = (cab?.[1] || '').trim();
  const nivel = Number(cab?.[2] || 1) || 1;

  upsertMeta({ id, nome, classe, nivel, atualizadoEm: Date.now() });
  setCurrentId(id);

  // Carrega em tela
  fillDOMFromFichaData(readFicha(id));
  showFicha();

  // Toast
  showToast(STR.saved);
}

// ===== Migração (modelo antigo de 1 ficha) =====
function migrateIfNeeded(){
  const old = localStorage.getItem(OLD_SINGLE_KEY);
  const alreadyMigrated = readMeta().length > 0;
  if(!old || alreadyMigrated) return;
  try{
    const d = JSON.parse(old);
    const id = uuid();
    writeFicha(id, d._schema ? d : { _schema: SCHEMA, ...d });

    const nome = (d.cabecalho?.[0] || STR.semNome).trim();
    const classe = (d.cabecalho?.[1] || '').trim();
    const nivel = Number(d.cabecalho?.[2] || 1) || 1;

    upsertMeta({ id, nome, classe, nivel, atualizadoEm: Date.now() });
    setCurrentId(id);
    localStorage.removeItem(OLD_SINGLE_KEY);
  }catch{ /* ignora */ }
}

// ===== Salvar (com autosave silencioso + toast) =====
let _saveTimer = null;
function showToast(msg){
  const el = $('#toast');
  if(!el) return;
  el.textContent = msg || STR.saved;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(()=> el.classList.remove('show'), 1200);
}

function saveLocal(optsOrEvent){
  let silent = false;
  if(optsOrEvent && typeof optsOrEvent === 'object' && 'preventDefault' in optsOrEvent){
    optsOrEvent.preventDefault?.();
    silent = false;
  }else if(typeof optsOrEvent === 'object'){
    silent = !!optsOrEvent.silent;
  }

  let id = getCurrentId();
  if(!id){
    id = uuid();
    setCurrentId(id);
  }

  const data = buildFichaDataFromDOM();
  writeFicha(id, data);

  const hv = getHeaderValues();
  upsertMeta({
    id,
    nome: hv.nome,
    classe: hv.classe,
    nivel: hv.nivel,
    atualizadoEm: Date.now()
  });

  if(!silent) showToast(STR.saved);
}

// Autosave com debounce (opção B)
function scheduleAutosave(){
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(()=> saveLocal({silent:true}), 900);
}

// ===== Onboarding helpers =====
function setClassAutomation(classKey, nivel){
  const cd = CLASS_DATA[classKey];
  if(!cd) return;

  const dvBase = $('#dv-base');
  const dvTotal = $('#dv-total');
  const dvGastos = $('#dv-gastos');
  if(dvBase)   dvBase.value   = cd.hitDie;
  if(dvTotal)  dvTotal.value  = Math.max(1, Number(nivel||1));
  if(dvGastos) dvGastos.value = 0;

  const indices = cd.saves.map(sigla => ATR_MAP[sigla]);
  const checks = $$('.testes-resistencia .teste .prof');
  checks.forEach((ch, idx)=> ch.checked = indices.includes(idx));

  const profEl = $('#prof .valor');
  if(profEl) profEl.value = profByLevel(nivel);

  applyDerived();
  scheduleAutosave();
}

// ===== Onboarding (sem XP) =====
function fillHeaderFromOnboarding(obj){
  const root = $('#info-geral');
  const set = (sel, val) => { const el = root?.querySelector(sel); if(el) el.value = val ?? ''; };

  set('[data-field="nome"]',        obj.nome);
  set('[data-field="classe"]',      obj.classeLabel);
  set('[data-field="nivel"]',       obj.nivel ?? 1);
  set('[data-field="antecedente"]', obj.antecedente);
  set('[data-field="tendencia"]',   obj.tendencia);
  set('[data-field="jogador"]',     obj.jogador);
}

function setupOnboarding(){
  const ob = $('#ob');
  if(!ob) return;

  const btns = $$('.ob-class', ob);
  const preview = $('#ob-preview', ob);
  const fNome  = $('#ob-nome', ob);
  const fClasse= $('#ob-classe', ob);
  const fNivel = $('#ob-nivel', ob);
  const fAnt   = $('#ob-antecedente', ob);
  const fTend  = $('#ob-tendencia', ob);
  const fJog   = $('#ob-jogador', ob);
  const btnUse = $('#ob-use-saved', ob);
  const btnReset = $('#ob-reset', ob);
  const form   = $('#ob-form', ob);
  const errs   = $('#ob-errors', ob);

  let selectedKey = null;

  const hasAnyFicha = readMeta().length > 0;
  btnUse.classList.toggle('hidden', !hasAnyFicha);
  btnUse.onclick = ()=>{ hide(ob); showHome(); };

  btnReset.onclick = ()=>{
    selectedKey = null;
    btns.forEach(b=>b.classList.remove('is-selected'));
    fClasse.value = '';
    fNivel.value = 1;
    fNome.value = fAnt.value = fTend.value = fJog.value = '';
    preview.textContent = STR.selecClasse;
    errs.textContent = '';
  };

  btns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      btns.forEach(b=>b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      selectedKey = btn.dataset.class;
      const cd = CLASS_DATA[selectedKey];
      fClasse.value = cd.label;
      preview.textContent = `Dado de Vida: ${cd.hitDie} | TRs: ${cd.saves.map(s=>ATR_LABEL[s]).join(' e ')}`;
      errs.textContent = '';
    });
  });

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const msgs = [];
    if(!selectedKey) msgs.push('Escolha uma classe.');
    const nivel = Number(fNivel.value||0);
    if(!(nivel>=1)) msgs.push('Nível deve ser ≥ 1.');
    if(msgs.length){ errs.textContent = msgs.join(' '); return; }
    errs.textContent = '';

    fillHeaderFromOnboarding({
      nome: fNome.value,
      classeLabel: CLASS_DATA[selectedKey].label,
      nivel,
      antecedente: fAnt.value,
      tendencia: fTend.value,
      jogador: fJog.value
    });

    setClassAutomation(selectedKey, nivel);

    const id = uuid();
    setCurrentId(id);
    saveLocal({silent:true});
    renderHome();

    hide(ob);
    showFicha();
  });
}

// Abre o modal apenas quando o usuário clicar em "+ Nova ficha"
function openOnboarding(){
  const ob = $('#ob');
  if(!ob) return;
  $('#ob-form', ob).reset();
  $$('.ob-class', ob).forEach(b=>b.classList.remove('is-selected'));
  $('#ob-classe', ob).value = '';
  $('#ob-preview', ob).textContent = STR.selecClasse;
  $('#ob-errors', ob).textContent = '';
  $('#ob-use-saved', ob).classList.toggle('hidden', readMeta().length === 0);
  show(ob);
}

// ===== Acessibilidade: autosave em mudanças relevantes + reconectar automação ao mudar "Classe" =====
function wireAutosaveDerived(){
  document.body.addEventListener('input', (e)=>{
    const el = e.target;
    if(
      el.closest('.atributos') ||
      el.closest('#prof') ||
      el.closest('.pericias') ||
      el.closest('.testes-resistencia') ||
      el.closest('.dados-vida') ||
      el.closest('.vida') ||
      el.classList.contains('prof')
    ){
      applyDerived();
      scheduleAutosave();
    }
  });

  document.body.addEventListener('change', (e)=>{
    if (e.target.classList.contains('prof')) { applyDerived(); scheduleAutosave(); }
  });

  // Se a classe for editada manualmente, tenta mapear label -> key e reexecuta automações
  $('[data-field="classe"]')?.addEventListener('change', (e)=>{
    const rotulo = (e.target.value||'').toLowerCase().trim();
    const key = Object.keys(CLASS_DATA).find(k => CLASS_DATA[k].label.toLowerCase() === rotulo);
    if(key){
      const nivel = Number($('[data-field="nivel"]')?.value||1);
      setClassAutomation(key, nivel);
    }
  });

  // Se o nível mudar, atualiza prof e DV total
  $('[data-field="nivel"]')?.addEventListener('change', (e)=>{
    const nivel = Number(e.target.value||1);
    const classeRotulo = ($('[data-field="classe"]')?.value||'').toLowerCase().trim();
    const key = Object.keys(CLASS_DATA).find(k => CLASS_DATA[k].label.toLowerCase() === classeRotulo);
    if(key) setClassAutomation(key, nivel);
    else {
      // ao menos atualiza bônus de proficiência
      const profEl = $('#prof .valor');
      if(profEl) profEl.value = profByLevel(nivel);
      applyDerived(); scheduleAutosave();
    }
  });
}

// ===== Estado inicial =====
function forceInitialState(){
  hide($('#ob'));
  hide($('#ficha'));
  show($('#home'));
}

// ===== Inicialização =====
window.addEventListener('DOMContentLoaded', ()=>{
  forceInitialState();
  migrateIfNeeded();

  setupDeathSaves();
  applyDerived();
  setupOnboarding();
  setupHomeEvents();
  wireAutosaveDerived();

  showHome();

  // Removido botão #salvar (autosave ativo)
});

// ====== POINT BUY LOGIC ======
const PB_MIN=8, PB_MAX=15, PB_POOL=27;
const PB_COST = {8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9};
const PB_ATTRS = ['for','des','con','int','sab','car'];

function pbCostOf(value){ value = clamp(value, PB_MIN, PB_MAX); return PB_COST[value]; }
function pbTotalCost(vals){ return PB_ATTRS.reduce((sum,k)=> sum + pbCostOf(vals[k]), 0); }
function pbRemaining(vals){ return PB_POOL - pbTotalCost(vals); }
function pbMod(value){ return Math.floor((value-10)/2); }

function readFichaAttrs(){
  const inputs = $$('.atributos .atributo .valor');
  const vals = {};
  PB_ATTRS.forEach((k,idx)=>{ vals[k] = clamp(inputs[idx]?.value||10, PB_MIN, PB_MAX); });
  return vals;
}
function writeFichaAttrs(vals){
  const inputs = $$('.atributos .atributo .valor');
  PB_ATTRS.forEach((k,idx)=>{ if(inputs[idx]) inputs[idx].value = vals[k]; });
  try{ applyDerived(); }catch(e){}
  try{ saveLocal({silent:true}); }catch(e){}
}

function openPB(){
  const dlg = $('#pb');
  const grid = getPBGrid();
  const msg = getPBMsg();

  show(dlg);
  if(grid) grid.innerHTML = '';
  if(msg) msg.textContent = '';

  const base = readFichaAttrs();
  PB_ATTRS.forEach(k => { base[k] = clamp(base[k], PB_MIN, PB_MAX); });

  // Monta os blocos de atributos (sem bind de eventos aqui)
  PB_ATTRS.forEach(k=>{
    const label = ATR_LABEL[k];

    const wrap = document.createElement('div');
    wrap.className = 'pb-attr';
    wrap.dataset.attr = k;

    const hd = document.createElement('header');
    const nm = document.createElement('div');
    nm.className = 'pb-name';
    nm.textContent = label;
    const star = document.createElement('button');
    star.className = 'pb-star';
    star.type = 'button';
    star.title = 'Prioridade';
    star.setAttribute('aria-pressed','false');
    star.textContent = '⭐';
    hd.append(nm, star);

    const ctrl = document.createElement('div');
    ctrl.className = 'pb-ctrl';
    const minus = document.createElement('button');
    minus.className = 'pb-btn pb-minus';
    minus.type = 'button';
    minus.setAttribute('aria-label', `Diminuir ${label}`);
    minus.textContent = '−';
    const val = document.createElement('div');
    val.className = 'pb-val';
    val.setAttribute('role','status');
    val.setAttribute('aria-live','polite');
    val.textContent = String(base[k] ?? 10);
    const plus = document.createElement('button');
    plus.className = 'pb-btn pb-plus';
    plus.type = 'button';
    plus.setAttribute('aria-label', `Aumentar ${label}`);
    plus.textContent = '+';
    ctrl.append(minus, val, plus);

    const modBox = document.createElement('div');
    modBox.className = 'pb-mod';
    const modSpan = document.createElement('span');
    modSpan.textContent = (pbMod(base[k] ?? 10) >= 0 ? '+' : '') + pbMod(base[k] ?? 10);
    modBox.append('Mod: ', modSpan);

    wrap.append(hd, ctrl, modBox);
    grid.appendChild(wrap);
  });

  // Estado inicial (habilita/desabilita botões, mostra restos, etc.)
  applyPBVals(base, grid);
}

function setupPointBuy(){
  // Abre o painel
  const btn = $('#attr-pointbuy-btn');
  if(btn) btn.onclick = ()=> openPB();

  // Bind ÚNICO do grid
  const grid = getPBGrid();
  if(grid) grid.addEventListener('click', onPBGridClick);

  // Botões laterais / footer — binds ÚNICOS
  const msg = getPBMsg();

  const btnReset = document.getElementById('pb-reset');
  if(btnReset) btnReset.addEventListener('click', ()=>{
    const vals = {}; PB_ATTRS.forEach(k=> vals[k]=PB_MIN);
    applyPBVals(vals);
    if(msg) msg.textContent = '';
  });

  const btnPreset = document.getElementById('pb-preset-27');
  if(btnPreset) btnPreset.addEventListener('click', ()=>{
    const vals = {'for':15, des:14, con:13, int:12, sab:10, car:8};
    applyPBVals(vals);
    if(msg) msg.textContent = '';
  });

  const btnAuto = document.getElementById('pb-autodist');
  if(btnAuto) btnAuto.addEventListener('click', ()=>{
    let vals = collectPBVals();
    const grid = getPBGrid();
    const stars = grid ? Array.from(grid.querySelectorAll('.pb-star[aria-pressed="true"]'))
                          .map(b=>b.closest('.pb-attr').dataset.attr) : [];
    const order = stars.concat(PB_ATTRS.filter(k=>!stars.includes(k)));
    let guard=999;
    while(pbRemaining(vals)>0 && guard--){
      for(const k of order){
        if(pbRemaining(vals)<=0) break;
        const next = Math.min(PB_MAX, vals[k]+1);
        const tmp = {...vals, [k]: next};
        if(pbRemaining(tmp)>=0 && next>vals[k]) vals=tmp;
      }
    }
    applyPBVals(vals);
    if(msg) msg.textContent = STR.pbMsgPrior;
  });

  const btnCancel = document.getElementById('pb-cancel');
  if(btnCancel) btnCancel.addEventListener('click', ()=> hide(document.getElementById('pb')) );

  const btnOk = document.getElementById('pb-ok');
  if(btnOk) btnOk.addEventListener('click', ()=>{
    const vals = collectPBVals();
    if(pbRemaining(vals)<0){ if(msg) msg.textContent = STR.negPoints; return; }
    writeFichaAttrs(vals);
    hide(document.getElementById('pb'));
  });
}


document.addEventListener('DOMContentLoaded', ()=>{
  try{ setupPointBuy(); }catch(e){}
});

function getPBGrid(){ return document.getElementById('pb-grid'); }
function getPBRestos(){ return document.getElementById('pb-restantes'); }
function getPBMsg(){ return document.getElementById('pb-msg'); }

function collectPBVals(grid = getPBGrid()){
  const vals = {};
  if(!grid) return vals;
  Array.from(grid.querySelectorAll('.pb-attr')).forEach(box=>{
    const k = box.dataset.attr;
    const v = Number(box.querySelector('.pb-val').textContent) || 10;
    vals[k] = v;
  });
  return vals;
}

function applyPBVals(vals, grid = getPBGrid()){
  if(!grid) return;
  Array.from(grid.querySelectorAll('.pb-attr')).forEach(box=>{
    const k = box.dataset.attr;
    const v = vals[k];
    box.querySelector('.pb-val').textContent = v;
    const m = pbMod(v);
    box.querySelector('.pb-mod span').textContent = (m>=0? '+'+m : ''+m);
    const minus = box.querySelector('.pb-minus');
    const plus  = box.querySelector('.pb-plus');
    minus.disabled = (v<=PB_MIN);
    plus.disabled  = (v>=PB_MAX) || (pbRemaining(vals)<=0);
  });
  const rem = pbRemaining(vals);
  const restos = getPBRestos();
  if(restos) restos.textContent = rem;
  const okBtn = document.getElementById('pb-ok');
  if(okBtn) okBtn.disabled = rem < 0;
}

/** Handler único para cliques no grid do PB */
function onPBGridClick(e){
  const grid = getPBGrid();
  if(!grid) return;
  const box = e.target.closest('.pb-attr');
  if(!box) return;

  const k = box.dataset.attr;
  const msg = getPBMsg();
  let vals = collectPBVals(grid);

  if(e.target.classList.contains('pb-minus')){
    vals[k] = Math.max(PB_MIN, vals[k]-1);
    applyPBVals(vals, grid);
    return;
  }
  if(e.target.classList.contains('pb-plus')){
    const next = Math.min(PB_MAX, vals[k]+1);
    const tmp = {...vals, [k]: next};
    if(pbRemaining(tmp) >= 0){
      applyPBVals(tmp, grid);
    }else{
      e.target.animate(
        [{transform:'translateX(0)'},{transform:'translateX(-3px)'},{transform:'translateX(3px)'},{transform:'translateX(0)'}],
        {duration:160}
      );
      if(msg) msg.textContent = STR.noPoints;
    }
    return;
  }
  if(e.target.classList.contains('pb-star')){
    const pressed = e.target.getAttribute('aria-pressed')==='true';
    e.target.setAttribute('aria-pressed', pressed? 'false':'true');
  }
}
