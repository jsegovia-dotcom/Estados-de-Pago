
// ════════════════════════════════
//  DATA — File System Access API + localStorage fallback
//  Igual que JASV-ITO
// ════════════════════════════════
const DKEY = 'jasv_cobros_v3';
let _fileHandle = null;   // FileSystemFileHandle
let _fileEnabled = false; // true = usando archivo en disco
let _idb = null;          // IndexedDB para persistir el handle

const EMPTY_DB = {
  clientes:[], proyectos:[], eps:[], ncs:[],
  uf_value:null, uf_date:null,
  config:{razon:'JASV Ingeniería y Gestión Limitada',rut:'76.460.286-2',
    giro:'Asesorías en Ingeniería e Inspecciones Técnicas',
    dir:'Av Nueva Providencia 1881 1201, Providencia',email:'j.segovia@jasv.cl'}
};

let db = JSON.parse(JSON.stringify(EMPTY_DB));

// ── Toast notification ──
function mostrarToast(msg, tipo){
  let t=document.getElementById('jasv-toast');
  if(!t){
    t=document.createElement('div');
    t.id='jasv-toast';
    t.style.cssText='position:fixed;bottom:90px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:8px;font-size:13px;font-family:"IBM Plex Sans",sans-serif;font-weight:600;z-index:9999;pointer-events:none;transition:opacity .3s;opacity:0;white-space:nowrap';
    document.body.appendChild(t);
  }
  t.textContent=msg;
  t.style.background=tipo==='ok'?'#1A4A2A':'#7B1A1A';
  t.style.color='#fff';
  t.style.opacity='1';
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>{t.style.opacity='0';},2800);
}

// ── IndexedDB para recordar el FileHandle entre sesiones ──
function _initIdb(){
  return new Promise(resolve=>{
    if(!window.indexedDB){resolve(null);return;}
    const req = indexedDB.open('jasv_cobros_idb_v1',1);
    req.onupgradeneeded = e=>e.target.result.createObjectStore('handles',{keyPath:'id'});
    req.onsuccess = e=>{_idb=e.target.result;resolve(_idb);};
    req.onerror = ()=>resolve(null);
  });
}
function _saveHandle(h){
  if(!_idb||!h)return;
  try{_idb.transaction('handles','readwrite').objectStore('handles').put({id:'main',handle:h});}catch(e){}
}
function _loadHandle(){
  return new Promise(resolve=>{
    if(!_idb){resolve(null);return;}
    try{
      const req=_idb.transaction('handles','readonly').objectStore('handles').get('main');
      req.onsuccess=e=>resolve(e.target.result?e.target.result.handle:null);
      req.onerror=()=>resolve(null);
    }catch(e){resolve(null);}
  });
}

// ── Leer desde archivo ──
async function _readFile(){
  if(!_fileHandle)return null;
  try{
    const file=await _fileHandle.getFile();
    const text=await file.text();
    const data=JSON.parse(text);
    return Object.assign({},JSON.parse(JSON.stringify(EMPTY_DB)),data);
  }catch(e){return null;}
}

// ── Escribir al archivo ──
async function _writeFile(data){
  if(!_fileHandle)return false;
  try{
    const json=JSON.stringify(data,null,2);
    const writable=await _fileHandle.createWritable();
    await writable.write(json);
    await writable.close();
    return true;
  }catch(e){console.error('Error escribiendo archivo:',e);return false;}
}

// ── Actualizar indicador de estado en la UI ──
function _updateFileStatus(){
  const bar=document.getElementById('file-status-bar');
  const btn=document.getElementById('btn-conectar-archivo');
  if(!bar)return;
  if(_fileEnabled&&_fileHandle){
    bar.style.background='#1A4A2A';
    bar.innerHTML='🟢 <b>Archivo conectado</b> — los datos se guardan en tu Mac';
    if(btn){btn.textContent='✓ Archivo conectado';btn.style.borderColor='#1A4A2A';btn.style.color='#1A4A2A';}
  } else {
    bar.style.background='#5A3000';
    bar.innerHTML='🟡 <b>Sin archivo</b> — datos solo en el navegador. Clic en <b>Conectar archivo</b> para guardar en tu Mac.';
    if(btn){btn.textContent='📁 Conectar archivo';btn.style.borderColor='#7B1A1A';btn.style.color='#7B1A1A';}
  }
}

// ── Conectar / crear archivo de datos ──
async function conectarArchivo(){
  if(!window.showSaveFilePicker){
    alert('Tu navegador no soporta File System Access API.\nUsa Chrome o Edge para esta función.');
    return;
  }
  try{
    const h=await window.showSaveFilePicker({
      suggestedName:'jasv-cobros-datos.json',
      types:[{description:'JSON',accept:{'application/json':['.json']}}]
    });
    _fileHandle=h; _fileEnabled=true;
    _saveHandle(h);
    // Escribir datos actuales al nuevo archivo
    await _writeFile(db);
    _updateFileStatus();
    mostrarToast('✅ Archivo conectado. Los datos se guardarán aquí.','ok');
  }catch(e){if(e.name!=='AbortError')console.error(e);}
}

// ── Abrir archivo existente ──
async function abrirArchivoExistente(){
  if(!window.showOpenFilePicker){
    alert('Tu navegador no soporta File System Access API.\nUsa Chrome o Edge.');
    return;
  }
  try{
    const [h]=await window.showOpenFilePicker({
      types:[{description:'JSON',accept:{'application/json':['.json']}}]
    });
    _fileHandle=h; _fileEnabled=true;
    _saveHandle(h);
    const data=await _readFile();
    if(data){db=data;localStorage.setItem(DKEY,JSON.stringify(db));}
    _updateFileStatus();
    await fetchUF();
    renderProyectos();
    mostrarToast('✅ Archivo cargado correctamente.','ok');
  }catch(e){if(e.name!=='AbortError')console.error(e);}
}

async function save(){
  // Siempre guarda en localStorage como respaldo
  localStorage.setItem(DKEY,JSON.stringify(db));
  // Si hay archivo conectado, escribe allí también
  if(_fileEnabled&&_fileHandle){
    await _writeFile(db);
  }
}

async function loadData(){
  await _initIdb();
  // Intentar recuperar handle guardado en sesiones anteriores
  const h=await _loadHandle();
  if(h){
    try{
      const perm=await h.queryPermission({mode:'readwrite'});
      if(perm==='granted'){
        _fileHandle=h; _fileEnabled=true;
        const data=await _readFile();
        if(data){db=data;localStorage.setItem(DKEY,JSON.stringify(db));}
        _updateFileStatus();
        return;
      }
      // Permiso no concedido automáticamente — mostrar banner para pedirlo
      _mostrarBannerPermiso(h);
    }catch(e){}
  }
  // Fallback: localStorage
  try{
    const raw=localStorage.getItem(DKEY);
    if(raw) db=Object.assign({},JSON.parse(JSON.stringify(EMPTY_DB)),JSON.parse(raw));
  }catch(e){}
  _updateFileStatus();
}

// Banner para reconectar archivo con un clic (pide permiso)
function _mostrarBannerPermiso(h){
  const bar=document.getElementById('file-status-bar');
  if(!bar)return;
  bar.style.background='#5A3000';
  bar.innerHTML='🟡 <b>Archivo guardado</b> — clic en <button onclick="reconectarArchivo()" style="background:#7B1A1A;color:#fff;border:none;padding:2px 10px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:700">Reconectar</button> para usar tus datos del Mac';
  window._pendingHandle=h;
}

async function reconectarArchivo(){
  const h=window._pendingHandle;
  if(!h)return;
  try{
    const perm=await h.requestPermission({mode:'readwrite'});
    if(perm==='granted'){
      _fileHandle=h; _fileEnabled=true;
      _saveHandle(h);
      const data=await _readFile();
      if(data){db=data;localStorage.setItem(DKEY,JSON.stringify(db));}
      _updateFileStatus();
      await fetchUF();
      renderProyectos();
      mostrarToast('✅ Archivo reconectado.','ok');
    }
  }catch(e){console.error(e);}
}
// runtime state
let currentProyId=null;
let editClienteId=null;
let editProyId=null;
let editEPId=null;
let ncEPId=null;
let pagoEPId=null;
let epPdfFile=null;
let epPdfData=null;
let currentOCProyId=null;
let editOCId=null;

// ════════════════════════════════
//  UF
// ════════════════════════════════
async function fetchUF(){
  document.getElementById('nav-uf-val').textContent='…';
  try{
    const r=await fetch('https://mindicador.cl/api/uf');
    const j=await r.json();
    db.uf_value=j.serie[0].valor;
    db.uf_date=j.serie[0].fecha.split('T')[0];
    save();
  }catch(e){console.warn('UF fetch failed',e);}
  updateUFUI();
}
function updateUFUI(){
  const v=db.uf_value;
  document.getElementById('nav-uf-val').textContent=v?fUFVal(v):'—';
}

// ════════════════════════════════
//  FORMAT
// ════════════════════════════════
function fCLP(n){return Math.round(n||0).toLocaleString('es-CL');}
function fUFVal(n){return '$'+parseFloat(n||0).toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fUF(n){return parseFloat(n||0).toFixed(2).replace('.',',');}
function fMonto(n,mon){return mon==='CLP'?'$'+fCLP(n):fUF(n)+' UF';}
function fDate(d){if(!d)return'—';const p=d.split('-');return`${p[2]}/${p[1]}/${p[0]}`;}
function today(){return new Date().toISOString().split('T')[0];}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function diasVenc(fv){if(!fv)return null;const h=new Date();h.setHours(0,0,0,0);const v=new Date(fv);v.setHours(0,0,0,0);return Math.round((v-h)/86400000);}
function diasPago(fe,fp){if(!fe||!fp)return null;return Math.round((new Date(fp)-new Date(fe))/86400000);}
function initials(n){return(n||'?').split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase();}

// ════════════════════════════════
//  BADGE
// ════════════════════════════════
function badge(st,d){
  let s=st;
  if(s==='pendiente'&&d!==null&&d<0)s='vencido';
  const map={pendiente:['b-pend','Pendiente'],pagado:['b-pago','Pagado'],vencido:['b-venc','Vencido'],parcial:['b-parc','Parcial'],nula:['b-nula','Anulada'],nc:['b-nc','Nota Crédito']};
  const[cls,lbl]=map[s]||['b-nula',s];
  return`<span class="badge ${cls}"><span class="dot"></span>${lbl}</span>`;
}

// ════════════════════════════════
//  NAVIGATION
// ════════════════════════════════
function goPage(pid){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const pg=document.getElementById(pid);
  if(pg)pg.classList.add('active');
  const nb=document.getElementById('nb-'+pid.replace('p-',''));
  if(nb)nb.classList.add('active');
  // render
  if(pid==='p-clientes')renderClientes();
  if(pid==='p-proyectos')renderProyectos();
  if(pid==='p-cobros'){renderCobrosStats();renderCobros();populateCobrosFilters();}
  if(pid==='p-reportes')renderReportes();
}

function abrirProyecto(id){
  currentProyId=id;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('p-proy-detalle').classList.add('active');
  document.getElementById('nb-proyectos').classList.add('active');
  renderProyectoDetalle();
}

// ════════════════════════════════
//  CLIENTES
// ════════════════════════════════
function renderClientes(){
  const q=(document.getElementById('cl-search')?.value||'').toLowerCase();
  const list=db.clientes.filter(c=>(c.nombre||'').toLowerCase().includes(q)||(c.rut||'').includes(q));
  document.getElementById('clientes-count').textContent=`${db.clientes.length} cliente${db.clientes.length!==1?'s':''}`;
  const cont=document.getElementById('cl-table-body');
  if(list.length===0){cont.innerHTML=`<div class="empty"><div class="big">🏢</div><p>No hay clientes aún.</p></div>`;return;}
  cont.innerHTML=`<table>
    <thead><tr><th>Cliente</th><th>RUT</th><th>Giro</th><th>Dirección</th><th>IVA</th><th>Proyectos</th><th></th></tr></thead>
    <tbody>${list.map(c=>{
      const nPr=db.proyectos.filter(p=>p.cliente_id===c.id).length;
      return`<tr onclick="openClienteModal('${c.id}')">
        <td><b>${c.nombre}</b>${c.contacto?`<br><span style="font-size:11px;color:var(--ink3)">${c.contacto}</span>`:''}</td>
        <td class="mo">${c.rut||'—'}</td>
        <td class="muted" style="font-size:12px">${c.giro||'—'}</td>
        <td class="muted" style="font-size:12px">${c.dir||'—'}</td>
        <td>${c.iva==='rebaja'?'<span class="badge b-pago" style="gap:0">Rebaja</span>':'<span class="badge b-pend" style="gap:0">No rebaja</span>'}</td>
        <td class="mo">${nPr}</td>
        <td><button class="btn xs" onclick="event.stopPropagation();openClienteModal('${c.id}')">✏ Editar</button></td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function openClienteModal(id){
  editClienteId=id||null;
  const c=id?db.clientes.find(x=>x.id===id):null;
  document.getElementById('cl-modal-title').textContent=c?'Editar Cliente':'Nuevo Cliente';
  document.getElementById('cl-modal-btn').textContent=c?'Confirmar Cambios':'Crear Cliente';
  if(c){
    document.getElementById('cl-f-nombre').value=c.nombre||'';
    document.getElementById('cl-f-rut').value=c.rut||'';
    document.getElementById('cl-f-giro').value=c.giro||'';
    document.getElementById('cl-f-dir').value=c.dir||'';
    document.getElementById('cl-f-contacto').value=c.contacto||'';
    document.getElementById('cl-f-email').value=c.email||'';
    document.getElementById('cl-f-iva').value=c.iva||'rebaja';
    document.getElementById('cl-f-plazo').value=c.plazo||30;
  } else {
    ['cl-f-nombre','cl-f-rut','cl-f-giro','cl-f-dir','cl-f-contacto','cl-f-email'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('cl-f-iva').value='rebaja';
    document.getElementById('cl-f-plazo').value=30;
  }
  document.getElementById('ov-cliente').classList.add('open');
}
function closeClienteModal(){document.getElementById('ov-cliente').classList.remove('open');editClienteId=null;}
function guardarCliente(){
  const nombre=document.getElementById('cl-f-nombre').value.trim();
  if(!nombre){alert('El nombre es obligatorio.');return;}
  const data={nombre,rut:document.getElementById('cl-f-rut').value.trim(),giro:document.getElementById('cl-f-giro').value.trim(),dir:document.getElementById('cl-f-dir').value.trim(),contacto:document.getElementById('cl-f-contacto').value.trim(),email:document.getElementById('cl-f-email').value.trim(),iva:document.getElementById('cl-f-iva').value,plazo:parseInt(document.getElementById('cl-f-plazo').value)||30};
  if(editClienteId){Object.assign(db.clientes.find(c=>c.id===editClienteId),data);}
  else{db.clientes.push({id:uid(),...data});}
  save();closeClienteModal();renderClientes();
}

// ════════════════════════════════
//  PROYECTOS LIST
// ════════════════════════════════
function renderProyectos(){
  const q=(document.getElementById('pr-search')?.value||'').toLowerCase();
  const list=db.proyectos.filter(p=>(p.nombre||'').toLowerCase().includes(q)||(db.clientes.find(c=>c.id===p.cliente_id)?.nombre||'').toLowerCase().includes(q));
  document.getElementById('proyectos-count').textContent=`${db.proyectos.length} proyecto${db.proyectos.length!==1?'s':''}`;
  const cont=document.getElementById('pr-table-body');
  if(list.length===0){cont.innerHTML=`<div class="empty"><div class="big">📁</div><p>No hay proyectos. Crea el primero.</p></div>`;return;}
  cont.innerHTML=`<table>
    <thead><tr><th>Proyecto / Obra</th><th>Cliente</th><th>Contrato</th><th>EPs</th><th>Emitido</th><th>Avance</th><th>Estado</th><th></th></tr></thead>
    <tbody>${list.map(p=>{
      const cl=db.clientes.find(c=>c.id===p.cliente_id)||{};
      const eps=db.eps.filter(e=>e.proy_id===p.id&&e.estado!=='nula');
      const contrato=(parseFloat(p.monto)||0);
      const emitido=eps.reduce((s,e)=>s+(parseFloat(e.neto_ret)||0),0);
      const pct=contrato>0?Math.min(100,emitido/contrato*100):0;
      const pendientes=eps.filter(e=>e.estado==='pendiente').length;
      return`<tr onclick="abrirProyecto('${p.id}')">
        <td><b>${p.nombre}</b>${p.cod?`<br><span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--ink4)">${p.cod}</span>`:''}</td>
        <td>${cl.nombre||'—'}</td>
        <td class="mo">${fMonto(p.monto,p.moneda)}</td>
        <td class="mo">${eps.length}</td>
        <td class="mo">${fMonto(emitido,p.moneda)}</td>
        <td style="min-width:100px"><span style="font-size:11px;color:var(--ink3)">${pct.toFixed(0)}%</span><div class="prog-wrap"><div class="prog-fill" style="width:${pct.toFixed(1)}%"></div></div></td>
        <td>${pendientes>0?`<span class="badge b-pend"><span class="dot"></span>${pendientes} pend.</span>`:'<span class="badge b-pago" style="gap:0">Al día</span>'}</td>
        <td><button class="btn xs sec" onclick="event.stopPropagation();abrirProyecto('${p.id}')">Ver →</button></td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

// lineas temporales mientras el modal está abierto
let modalLineas=[];
let editLineaIdx=null;

function openProyModal(id){
  editProyId=id||null;
  const p=id?db.proyectos.find(x=>x.id===id):null;
  document.getElementById('pr-modal-title').textContent=p?'Editar Proyecto':'Nuevo Proyecto';
  document.getElementById('pr-modal-btn').textContent=p?'Confirmar Cambios':'Crear Proyecto';
  const sel=document.getElementById('pr-f-cliente');
  sel.innerHTML='<option value="">Seleccionar…</option>'+db.clientes.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');
  if(p){
    document.getElementById('pr-f-nombre').value=p.nombre||'';
    document.getElementById('pr-f-cliente').value=p.cliente_id||'';
    document.getElementById('pr-f-cod').value=p.cod||'';
    document.getElementById('pr-f-dir').value=p.dir||'';
    document.getElementById('pr-f-moneda').value=p.moneda||'UF';
    document.getElementById('pr-f-ret').value=p.ret||0;
    document.getElementById('pr-f-inicio').value=p.inicio||'';
    modalLineas=JSON.parse(JSON.stringify(p.lineas||[]));
  } else {
    ['pr-f-nombre','pr-f-cod','pr-f-dir'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('pr-f-cliente').value='';
    document.getElementById('pr-f-moneda').value='UF';
    document.getElementById('pr-f-ret').value=0;
    document.getElementById('pr-f-inicio').value=today();
    modalLineas=[];
  }
  editLineaIdx=null;
  renderLineasModal();
  document.getElementById('ov-proyecto').classList.add('open');
}

function renderLineasModal(){
  const mon=document.getElementById('pr-f-moneda').value||'UF';
  const tbody=document.getElementById('pr-lineas-tabla');
  if(modalLineas.length===0){
    tbody.innerHTML=`<div style="text-align:center;padding:18px;color:var(--ink4);font-size:12px;border:1px dashed var(--paper3);border-radius:var(--r)">Sin líneas aún. Usa <b>+ Agregar línea</b> para detallar la facturación estimada.</div>`;
    document.getElementById('pr-total-display').textContent='0,00'+(mon==='UF'?' UF':'');
    return;
  }
  const total=modalLineas.reduce((s,l)=>s+(parseFloat(l.monto)||0),0);
  tbody.innerHTML=`
    <table style="width:100%;border-collapse:collapse;font-size:12.5px">
      <thead><tr style="background:var(--paper)">
        <th style="padding:6px 10px;text-align:left;font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--ink3);border-bottom:1px solid var(--paper3)">Descripción</th>
        <th style="padding:6px 10px;text-align:right;font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--ink3);border-bottom:1px solid var(--paper3);white-space:nowrap">Monto (${mon})</th>
        <th style="padding:6px 10px;width:80px;border-bottom:1px solid var(--paper3)"></th>
      </tr></thead>
      <tbody>
        ${modalLineas.map((l,i)=>`
        <tr style="border-bottom:1px solid var(--paper3);${editLineaIdx===i?'background:#FFF8F8':''}">
          <td style="padding:6px 10px">${editLineaIdx===i
            ?`<input type="text" value="${l.desc||''}" id="linea-edit-desc" style="width:100%;padding:5px 8px;border:1px solid var(--green);border-radius:var(--r);font-size:12px;font-family:'IBM Plex Sans',sans-serif;outline:none">`
            :l.desc||'—'}</td>
          <td style="padding:6px 10px;text-align:right;font-family:'IBM Plex Mono',monospace">${editLineaIdx===i
            ?`<input type="number" value="${l.monto||''}" id="linea-edit-monto" step="0.01" style="width:110px;padding:5px 8px;border:1px solid var(--green);border-radius:var(--r);font-size:12px;font-family:'IBM Plex Mono',monospace;text-align:right;outline:none" oninput="recalcLineasTotal()">`
            :fMonto(l.monto,mon)}</td>
          <td style="padding:6px 8px;text-align:right;white-space:nowrap">
            ${editLineaIdx===i
              ?`<button class="btn xs pri" onclick="guardarLineaEdit(${i})" style="margin-right:3px">✓</button>
                <button class="btn xs" onclick="cancelarLineaEdit()">✕</button>`
              :`<button class="btn xs sec" onclick="editarLinea(${i})" style="margin-right:3px">✏</button>
                <button class="btn xs danger" onclick="eliminarLinea(${i})">🗑</button>`}
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  document.getElementById('pr-total-display').textContent=fMonto(total,mon);
}

function agregarLineaModal(){
  // if already editing another line, save it first
  if(editLineaIdx!==null)guardarLineaEdit(editLineaIdx);
  modalLineas.push({desc:'',monto:0});
  editLineaIdx=modalLineas.length-1;
  renderLineasModal();
  // focus desc field
  setTimeout(()=>{const f=document.getElementById('linea-edit-desc');if(f)f.focus();},50);
}

function editarLinea(i){
  if(editLineaIdx!==null&&editLineaIdx!==i)guardarLineaEdit(editLineaIdx);
  editLineaIdx=i;
  renderLineasModal();
  setTimeout(()=>{const f=document.getElementById('linea-edit-desc');if(f)f.focus();},50);
}

function guardarLineaEdit(i){
  const descEl=document.getElementById('linea-edit-desc');
  const montoEl=document.getElementById('linea-edit-monto');
  if(descEl&&montoEl){
    modalLineas[i].desc=descEl.value.trim()||'Sin descripción';
    modalLineas[i].monto=parseFloat(montoEl.value)||0;
  }
  editLineaIdx=null;
  renderLineasModal();
}

function cancelarLineaEdit(){
  // if the line is empty (just added), remove it
  if(editLineaIdx!==null&&(!modalLineas[editLineaIdx].desc&&!modalLineas[editLineaIdx].monto)){
    modalLineas.splice(editLineaIdx,1);
  }
  editLineaIdx=null;
  renderLineasModal();
}

function eliminarLinea(i){
  if(editLineaIdx===i)editLineaIdx=null;
  modalLineas.splice(i,1);
  renderLineasModal();
}

function recalcLineasTotal(){
  const montoEl=document.getElementById('linea-edit-monto');
  if(!montoEl)return;
  // update temp value for display
  const mon=document.getElementById('pr-f-moneda').value||'UF';
  const tmpMonto=parseFloat(montoEl.value)||0;
  const total=modalLineas.reduce((s,l,i)=>s+(i===editLineaIdx?tmpMonto:(parseFloat(l.monto)||0)),0);
  document.getElementById('pr-total-display').textContent=fMonto(total,mon);
}
function closeProyModal(){document.getElementById('ov-proyecto').classList.remove('open');editProyId=null;}
function calcProyModal(){}
function guardarProyecto(){
  const nombre=document.getElementById('pr-f-nombre').value.trim();
  const cliente_id=document.getElementById('pr-f-cliente').value;
  if(!nombre||!cliente_id){alert('Nombre y cliente son obligatorios.');return;}
  // save pending edit if any
  if(editLineaIdx!==null)guardarLineaEdit(editLineaIdx);
  const lineas=modalLineas.filter(l=>l.desc||l.monto>0);
  const montoCalculado=lineas.reduce((s,l)=>s+(parseFloat(l.monto)||0),0);
  const data={nombre,cliente_id,cod:document.getElementById('pr-f-cod').value.trim(),dir:document.getElementById('pr-f-dir').value.trim(),moneda:document.getElementById('pr-f-moneda').value,monto:montoCalculado,lineas,ret:parseFloat(document.getElementById('pr-f-ret').value)||0,inicio:document.getElementById('pr-f-inicio').value};
  if(editProyId){Object.assign(db.proyectos.find(p=>p.id===editProyId),data);}
  else{db.proyectos.push({id:uid(),...data,ocs:[]});}
  // Guardar el id ANTES de cerrar modal (closeProyModal pone editProyId=null)
  const proyEditado=editProyId;
  save();closeProyModal();
  // Siempre refrescar lista de proyectos
  renderProyectos();
  // Si el proyecto editado es el que está abierto en detalle → refrescar todo
  if(proyEditado){
    const pdPage=document.getElementById('p-proy-detalle');
    if(pdPage&&pdPage.classList.contains('active')&&currentProyId===proyEditado){
      renderProyectoDetalle();
    }
  }
  // Refrescar cobros y reportes si están visibles
  renderCobrosStats();
  renderCobros();
  renderReportesIfActive();
}

// ════════════════════════════════
//  PROYECTO DETALLE
// ════════════════════════════════
function renderProyectoDetalle(){
  const p=db.proyectos.find(x=>x.id===currentProyId);
  if(!p)return;
  const cl=db.clientes.find(c=>c.id===p.cliente_id)||{};
  const eps=db.eps.filter(e=>e.proy_id===currentProyId);
  const epsValidos=eps.filter(e=>e.estado!=='nula');
  const contrato=parseFloat(p.monto)||0;
  // Cobrado/Por cobrar siempre en netos
  const valorCobro=(ep)=>(parseFloat(ep.neto_ret)||0);
  const emitido=epsValidos.reduce((s,e)=>s+valorCobro(e),0);
  const cobrado=epsValidos.filter(e=>e.estado==='pagado').reduce((s,e)=>s+valorCobro(e),0);
  const porCobrar=epsValidos.filter(e=>e.estado!=='pagado').reduce((s,e)=>s+valorCobro(e),0);
  const saldo=Math.max(0,contrato-emitido);
  const ocs=p.ocs||[];
  const pct=contrato>0?Math.min(100,emitido/contrato*100):0;
  const mon=p.moneda||'UF';
  const ufV=db.uf_value||0;

  // BANNER
  document.getElementById('pd-banner').innerHTML=`
    <div class="proy-banner">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">
            <button style="background:none;border:none;color:rgba(255,255,255,.4);font-size:11px;cursor:pointer;font-family:'IBM Plex Sans',sans-serif;padding:0;text-decoration:underline" onclick="goPage('p-proyectos')">← Proyectos</button>
            ${p.cod?' · '+p.cod:''}
          </div>
          <h2>${p.nombre}</h2>
          <div class="pb-meta">
            <span>🏢 ${cl.nombre||'—'}</span>
            ${p.dir?`<span>📍 ${p.dir}</span>`:''}
            ${p.inicio?`<span>📅 Inicio: ${fDate(p.inicio)}</span>`:''}
            <span>Moneda: ${mon}</span>
          </div>
        </div>
      </div>
      <div class="pb-stats">
        <div class="pbs"><div class="pbsl">Contrato (neto)</div><div class="pbsv">${fMonto(contrato,mon)}</div></div>
        <div class="pbs"><div class="pbsl">Emitido (neto)</div><div class="pbsv">${fMonto(emitido,mon)}</div></div>
        <div class="pbs"><div class="pbsl">Cobrado (neto)</div><div class="pbsv" style="color:#E8A0A0">${fMonto(cobrado,mon)}</div></div>
        <div class="pbs"><div class="pbsl">Por Cobrar (neto)</div><div class="pbsv" style="color:#FFB347">${fMonto(porCobrar,mon)}<br><span style="font-size:10px;opacity:.75">(+ IVA al facturar)</span></div></div>
        <div class="pbs"><div class="pbsl">Saldo Contrato (neto)</div><div class="pbsv" style="color:#FFD700">${fMonto(saldo,mon)}<br><span style="font-size:10px;opacity:.75">${saldo>0?'(+ IVA al facturar)':''}</span></div></div>
      </div>
    </div>`;

  // Update action bar breadcrumb
  const bcEl=document.getElementById('pd-action-breadcrumb');
  if(bcEl) bcEl.innerHTML=`<button onclick="goPage('p-proyectos')" style="background:none;border:none;color:var(--green);cursor:pointer;font-size:12px;font-family:'IBM Plex Sans',sans-serif;padding:0;text-decoration:underline">← Proyectos</button> <span style="color:var(--ink4)">›</span> <b>${p.nombre}</b>`;

  // TAB EPS
  const ncs=db.ncs;
  let rows='';
  let item=0;
  eps.forEach(ep=>{
    const nc=ncs.find(n=>n.ep_id===ep.id);
    const d=diasVenc(ep.fecha_venc);
    item++;
    const isPagado=ep.estado==='pagado';
    const isNula=ep.estado==='nula';
    rows+=`<tr class="${isNula?'anulada':''}">
      <td class="mo">${item}</td>
      <td class="mo">${ep.numero||'—'}</td>
      <td class="mo">${ep.n_factura||'—'}</td>
      <td class="mo">${fDate(ep.fecha_emision)}</td>
      <td style="max-width:220px;font-size:11.5px">${ep.glosa||'—'}</td>
      <td class="ra">${fMonto(ep.neto,mon)}</td>
      <td class="ra">${parseFloat(ep.ret_uf||0)>0?fMonto(ep.ret_uf,mon):'—'}</td>
      <td class="ra">${fMonto(ep.neto_ret,mon)}</td>
      <td class="ra">${fMonto(ep.iva_uf,mon)}</td>
      <td class="ra"><b>${fMonto(ep.total,mon)}</b></td>
      <td class="ra">${mon==='UF'?fUFVal(ep.uf_val):'—'}</td>
      <td class="ra">$${fCLP(ep.total_clp)}</td>
      <td>
        ${!isNula
          ? `<button onclick="openPagoModal('${ep.id}')" title="Clic para cambiar estado de pago"
              style="cursor:pointer;border:none;background:none;padding:0;display:flex;flex-direction:column;align-items:flex-start;gap:2px">
              ${badge(ep.estado,d)}
              ${isPagado&&ep.fecha_pago?`<span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--ink4)">${fDate(ep.fecha_pago)}</span>`:''}
            </button>`
          : badge(ep.estado,d)
        }
      </td>
      <td style="white-space:nowrap;padding:5px 8px">
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:nowrap">
          ${!isNula?`<button class="btn xs sec" onclick="openEPModal('${ep.id}')" title="Editar EP">✏ Editar</button>`:''}
          <button class="btn xs danger" onclick="confirmarEliminarEP('${ep.id}')" title="Eliminar EP del registro">🗑 Eliminar EP</button>
          ${isNula?`<button class="btn xs danger" onclick="eliminarEP('${ep.id}')" title="Eliminar factura anulada">🗑 Eliminar</button>`:''}
        </div>
      </td>
    </tr>`;
    if(nc){
      item++;
      const ncItem=item;
      rows+=`<tr class="nc-line">
        <td class="mo" style="text-align:center;font-weight:700;color:#8B6914">${ncItem}</td>
        <td class="mo" style="color:#8B6914">NC ${nc.numero||'—'}</td>
        <td class="mo" style="color:#8B6914">${nc.numero||'—'}</td>
        <td class="mo" style="color:#8B6914">${fDate(nc.fecha)}</td>
        <td style="font-size:11.5px;color:#8B6914;font-style:italic">${nc.motivo||'Nota de Crédito — anula Fact. '+ep.n_factura}</td>
        <td class="ra" style="color:var(--red);font-weight:500">-${fMonto(nc.monto,mon)}</td>
        <td class="ra" style="color:var(--ink4)">—</td>
        <td class="ra" style="color:var(--red);font-weight:500">-${fMonto(nc.monto,mon)}</td>
        <td class="ra" style="color:var(--red)">-${fMonto(nc.monto*0.19,mon)}</td>
        <td class="ra" style="color:var(--red);font-weight:700">-${fMonto(nc.monto*1.19,mon)}</td>
        <td class="ra" style="color:var(--ink4)">${mon==='UF'?fUFVal(ep.uf_val):'—'}</td>
        <td class="ra" style="color:var(--red)">-$${fCLP(nc.monto*1.19*(mon==='UF'?(ep.uf_val||db.uf_value||1):1))}</td>
        <td>${badge('nc',null)}</td>
        <td style="white-space:nowrap;padding:5px 8px">
          <div style="display:flex;gap:4px;align-items:center">
            <button class="btn xs danger" onclick="eliminarNC('${nc.id}')" title="Eliminar esta Nota de Crédito del registro">🗑 Eliminar NC</button>
          </div>
        </td>
      </tr>`;
    }
  });

  const totalEmit=eps.filter(e=>e.estado!=='nula').reduce((s,e)=>s+(parseFloat(e.neto)||0),0);
  const totalRet=eps.filter(e=>e.estado!=='nula').reduce((s,e)=>s+(parseFloat(e.ret_uf)||0),0);
  const totalNetoRet=eps.filter(e=>e.estado!=='nula').reduce((s,e)=>s+(parseFloat(e.neto_ret)||0),0);
  const totalIVA=eps.filter(e=>e.estado!=='nula').reduce((s,e)=>s+(parseFloat(e.iva_uf)||0),0);
  const totalTotal=eps.filter(e=>e.estado!=='nula').reduce((s,e)=>s+(parseFloat(e.total)||0),0);
  const totalCLP=eps.filter(e=>e.estado!=='nula').reduce((s,e)=>s+(parseFloat(e.total_clp)||0),0);
  // Cobrado: siempre en netos
  const pagadoNetoRet=eps.filter(e=>e.estado==='pagado').reduce((s,e)=>s+valorCobro(e),0);

  document.getElementById('pd-tab-eps').innerHTML=`
    <div class="card" style="margin-top:0;border-radius:0">
      <div class="card-head">
        <div class="card-title">Estados de Pago</div>
      </div>
      ${eps.length===0?`<div class="empty"><div class="big">📄</div><p>Sin EPs. Usa el botón "+ Nuevo EP" para comenzar.</p></div>`:`
      <div style="overflow-x:auto">
      <table>
        <thead><tr>
          <th>Item</th><th>EP</th><th>Factura</th><th>Fecha</th><th>Glosa</th>
          <th>Neto</th><th>Retención</th><th>Neto c/Ret</th><th>IVA</th><th>Total</th>
          <th>UF día</th><th>Total $</th><th>Estado</th><th></th>
        </tr></thead>
        <tbody>
          ${rows}
          <tr class="subtotal-row">
            <td colspan="5" style="text-align:right">Sub-totales</td>
            <td class="ra">${fMonto(totalEmit,mon)}</td>
            <td class="ra">${fMonto(totalRet,mon)}</td>
            <td class="ra">${fMonto(totalNetoRet,mon)}</td>
            <td class="ra">${fMonto(totalIVA,mon)}</td>
            <td class="ra">${fMonto(totalTotal,mon)}</td>
            <td></td>
            <td class="ra">$${fCLP(totalCLP)}</td>
            <td colspan="2"></td>
          </tr>

        </tbody>
      </table>
      </div>`}
    </div>`;

  // TAB SALDOS
  const retContrato=contrato*(parseFloat(p.ret)||0)/100;
  // OC summary for saldos tab
  const totalOC=ocs.reduce((s,o)=>s+(parseFloat(o.monto)||0),0);
  const saldoOCvsContrato=contrato-totalOC;
  const pctOC=contrato>0?Math.min(100,totalOC/contrato*100):0;
  const ufV2=db.uf_value||0;

  document.getElementById('pd-tab-saldos').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">

      <!-- COLUMNA 1: Cobros -->
      <div>
        <div class="card" style="margin-bottom:0">
          <div class="card-head"><div class="card-title">Estado de Cobros</div></div>
          <div style="padding:14px 18px">
            <div class="cbox" style="margin-bottom:12px">
              <div class="crow"><span>Monto Contrato</span><span style="font-weight:600">${fMonto(contrato,mon)}</span></div>
              <div class="crow"><span>Monto Emitido (neto c/ret.)</span><span>${fMonto(totalNetoRet,mon)}</span></div>
              <div class="crow"><span>Retención acumulada</span><span style="color:var(--amber)">${fMonto(totalRet,mon)}</span></div>
              <div class="crow" style="color:var(--success)"><span>Cobrado (neto)</span><span>${fMonto(cobrado,mon)}</span></div>
              <div class="crow" style="color:var(--amber)"><span>Por Cobrar (neto · + IVA al facturar)</span><span>${fMonto(porCobrar,mon)}</span></div>
              <div class="crow" style="color:var(--red);font-size:13.5px"><span>Saldo Por Emitir</span><span>${fMonto(saldo,mon)}</span></div>
            </div>
            ${mon==='UF'&&ufV2?`
            <div class="cbox" style="font-size:12px;background:var(--paper)">
              <div class="crow"><span>UF referencial hoy</span><span>${fUFVal(ufV2)}</span></div>
              <div class="crow"><span>Contrato en $</span><span>$${fCLP(contrato*ufV2)}</span></div>
              <div class="crow"><span>Saldo por emitir en $</span><span style="color:var(--red)">$${fCLP(saldo*ufV2)}</span></div>
            </div>`:''}
            ${(p.lineas&&p.lineas.length>0)?`
            <div style="margin-top:12px">
              <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--ink3);margin-bottom:6px">Detalle Facturación Estimada</div>
              <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead><tr style="background:var(--paper)">
                  <th style="padding:5px 8px;text-align:left;font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--ink3);border-bottom:1px solid var(--paper3)">Descripción</th>
                  <th style="padding:5px 8px;text-align:right;font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--ink3);border-bottom:1px solid var(--paper3)">Monto</th>
                </tr></thead>
                <tbody>
                  ${p.lineas.map(l=>`<tr style="border-bottom:1px solid var(--paper3)">
                    <td style="padding:5px 8px">${l.desc||'—'}</td>
                    <td style="padding:5px 8px;text-align:right;font-family:'IBM Plex Mono',monospace">${fMonto(l.monto,mon)}</td>
                  </tr>`).join('')}
                  <tr style="background:var(--paper);font-weight:700">
                    <td style="padding:5px 8px;font-size:11px">Total estimado</td>
                    <td style="padding:5px 8px;text-align:right;font-family:'IBM Plex Mono',monospace">${fMonto(contrato,mon)}</td>
                  </tr>
                </tbody>
              </table>
            </div>`:''}
          </div>
        </div>
      </div>

      <!-- COLUMNA 2: OC vs Contrato -->
      <div>
        <div class="card" style="margin-bottom:12px">
          <div class="card-head">
            <div class="card-title" style="display:flex;align-items:center;gap:8px">
              OC vs Contrato
              ${saldoOCvsContrato>0.001
                ?'<span class="badge b-pend" style="font-size:10px">⚠ Faltan OC</span>'
                :saldoOCvsContrato<-0.001
                  ?'<span class="badge b-venc" style="font-size:10px">OC excede contrato</span>'
                  :'<span class="badge b-pago" style="font-size:10px">✓ Completo</span>'}
            </div>
          </div>
          <div style="padding:14px 18px">
            <div class="cbox ${saldoOCvsContrato>0.001?'':'accent'}" style="margin-bottom:12px">
              <div class="crow"><span>Contrato Estimado</span><span style="font-weight:600">${fMonto(contrato,mon)}</span></div>
              <div class="crow"><span>Total OC emitidas (${ocs.length})</span><span style="color:${totalOC>0?'var(--blue)':'var(--ink4)'}">${fMonto(totalOC,mon)}</span></div>
              <div class="crow" style="font-size:14px;${saldoOCvsContrato>0.001?'color:#C03030;font-weight:700':saldoOCvsContrato<-0.001?'color:var(--amber);font-weight:700':'color:var(--success);font-weight:700'}">
                <span>${saldoOCvsContrato>0.001?'OC faltante por solicitar':saldoOCvsContrato<-0.001?'OC excede contrato en':'OC cubre contrato'}</span>
                <span>${saldoOCvsContrato>0.001?fMonto(saldoOCvsContrato,mon):saldoOCvsContrato<-0.001?fMonto(Math.abs(saldoOCvsContrato),mon):'—'}</span>
              </div>
            </div>
            <!-- Barra de progreso OC -->
            <div style="margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ink3);margin-bottom:4px">
                <span>Cobertura OC sobre contrato</span>
                <span style="font-family:'IBM Plex Mono',monospace;font-weight:600;color:${pctOC>=100?'var(--success)':'#C03030'}">${pctOC.toFixed(1)}%</span>
              </div>
              <div style="height:10px;background:var(--paper2);border-radius:5px;overflow:hidden;border:1px solid var(--paper3)">
                <div style="height:100%;width:${Math.min(100,pctOC).toFixed(1)}%;background:${pctOC>=100?'var(--success)':'#C03030'};border-radius:5px;transition:.4s"></div>
              </div>
            </div>
            <!-- Detalle por OC -->
            ${ocs.length>0?`
            <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-top:8px">
              <thead><tr style="background:var(--paper)">
                <th style="padding:5px 8px;text-align:left;font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--ink3);border-bottom:1px solid var(--paper3)">N° OC</th>
                <th style="padding:5px 8px;text-align:left;font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--ink3);border-bottom:1px solid var(--paper3)">Fecha</th>
                <th style="padding:5px 8px;text-align:right;font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--ink3);border-bottom:1px solid var(--paper3)">Monto</th>
                <th style="padding:5px 8px;text-align:right;font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--ink3);border-bottom:1px solid var(--paper3)">Cargado</th>
                <th style="padding:5px 8px;text-align:right;font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--ink3);border-bottom:1px solid var(--paper3)">Saldo OC</th>
              </tr></thead>
              <tbody>
              ${ocs.map(oc=>{
                const carg=epsValidos.filter(e=>e.oc_id===oc.id).reduce((s,e)=>s+(parseFloat(e.neto_ret)||0),0);
                const sOC=Math.max(0,(parseFloat(oc.monto)||0)-carg);
                return`<tr style="border-bottom:1px solid var(--paper3)">
                  <td style="padding:5px 8px;font-family:'IBM Plex Mono',monospace">${oc.num}</td>
                  <td style="padding:5px 8px;font-family:'IBM Plex Mono',monospace">${fDate(oc.fecha)}</td>
                  <td style="padding:5px 8px;text-align:right;font-family:'IBM Plex Mono',monospace">${fMonto(oc.monto,mon)}</td>
                  <td style="padding:5px 8px;text-align:right;font-family:'IBM Plex Mono',monospace;color:var(--ink3)">${fMonto(carg,mon)}</td>
                  <td style="padding:5px 8px;text-align:right;font-family:'IBM Plex Mono',monospace;color:${sOC>0?'var(--success)':'var(--ink4)'};font-weight:500">${fMonto(sOC,mon)}</td>
                </tr>`;
              }).join('')}
              <tr style="background:var(--paper);font-weight:600">
                <td colspan="2" style="padding:5px 8px;font-size:11px;color:var(--ink3)">Total OC</td>
                <td style="padding:5px 8px;text-align:right;font-family:'IBM Plex Mono',monospace">${fMonto(totalOC,mon)}</td>
                <td colspan="2"></td>
              </tr>
              </tbody>
            </table>`
            :'<div style="text-align:center;padding:16px;color:var(--ink4);font-size:12px">Sin órdenes de compra registradas.<br>Agrega OCs desde el tab <b>Órdenes de Compra</b>.</div>'}
            ${mon==='UF'&&ufV2&&saldoOCvsContrato>0.001?`
            <div style="margin-top:10px;padding:10px 12px;background:var(--red-bg);border:1px solid var(--red-border);border-radius:var(--r);font-size:12px;color:var(--red)">
              💡 <b>OC faltante referencial en $:</b> $${fCLP(saldoOCvsContrato*ufV2)} (UF a ${fUFVal(ufV2)})
            </div>`:''}
          </div>
        </div>
      </div>

    </div>`;

  // TAB OCS
  let ocRows=ocs.map(oc=>{
    const cargado=eps.filter(e=>e.oc_id===oc.id&&e.estado!=='nula').reduce((s,e)=>s+(parseFloat(e.neto_ret)||0),0);
    const saldoOC=Math.max(0,(parseFloat(oc.monto)||0)-cargado);
    return`<tr>
      <td class="mo">${oc.num||'—'}</td>
      <td class="mo">${fDate(oc.fecha)}</td>
      <td style="font-size:12px">${oc.desc||'—'}</td>
      <td class="ra">${fMonto(oc.monto,mon)}</td>
      <td class="ra">${fMonto(cargado,mon)}</td>
      <td class="ra" style="color:${saldoOC>0?'var(--green)':'var(--red)'}">${fMonto(saldoOC,mon)}</td>
      <td style="white-space:nowrap">
        <button class="btn xs sec" onclick="openOCModal('${oc.id}')" style="margin-right:4px" title="Editar OC">✏ Editar</button>
        <button class="btn xs danger" onclick="eliminarOC('${oc.id}')" title="Eliminar OC">✕</button>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('pd-tab-ocs').innerHTML=`
    <div class="card">
      <div class="card-head">
        <div class="card-title">Órdenes de Compra</div>
        <button class="btn sm pri" onclick="openOCModal()">＋ Nueva OC</button>
      </div>
      ${ocs.length===0?`<div class="empty"><div class="big">📋</div><p>Sin órdenes de compra. Los EPs se cargarán contra el monto de contrato.</p></div>`:`
      <table>
        <thead><tr><th>N° OC</th><th>Fecha</th><th>Descripción</th><th>Monto OC</th><th>Cargado</th><th>Saldo</th><th></th></tr></thead>
        <tbody>${ocRows}</tbody>
      </table>`}
    </div>`;
}

function switchPDTab(id){
  ['pd-tab-eps','pd-tab-saldos','pd-tab-ocs'].forEach(t=>{
    document.getElementById(t).style.display=t===id?'block':'none';
  });
  document.querySelectorAll('#pd-tabs .tab').forEach((t,i)=>{
    const ids=['pd-tab-eps','pd-tab-saldos','pd-tab-ocs'];
    t.classList.toggle('active',ids[i]===id);
  });
}

// ════════════════════════════════
//  OC
// ════════════════════════════════
function openOCModal(ocId){
  editOCId=ocId||null;
  currentOCProyId=currentProyId;
  const p=db.proyectos.find(x=>x.id===currentProyId);
  const mon=p?.moneda||'UF';
  document.getElementById('oc-moneda-label').textContent='Moneda: '+mon;

  if(ocId){
    // EDITAR OC existente — precargar datos
    const oc=(p?.ocs||[]).find(o=>o.id===ocId);
    if(!oc)return;
    document.getElementById('oc-modal-title').textContent='Editar Orden de Compra';
    document.getElementById('oc-modal-btn').textContent='Confirmar Cambios';
    document.getElementById('oc-f-num').value=oc.num||'';
    document.getElementById('oc-f-fecha').value=oc.fecha||today();
    document.getElementById('oc-f-monto').value=oc.monto||'';
    document.getElementById('oc-f-desc').value=oc.desc||'';
  } else {
    // NUEVA OC
    document.getElementById('oc-modal-title').textContent='Nueva Orden de Compra';
    document.getElementById('oc-modal-btn').textContent='Guardar OC';
    ['oc-f-num','oc-f-desc'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('oc-f-fecha').value=today();
    document.getElementById('oc-f-monto').value='';
  }
  document.getElementById('ov-oc').classList.add('open');
}
function closeOCModal(){document.getElementById('ov-oc').classList.remove('open');editOCId=null;}
function calcOC(){}
function guardarOC(){
  const num=document.getElementById('oc-f-num').value.trim();
  if(!num){alert('El número de OC es obligatorio.');return;}
  const monto=parseFloat(document.getElementById('oc-f-monto').value)||0;
  if(!monto){alert('El monto de la OC es obligatorio.');return;}
  const p=db.proyectos.find(x=>x.id===currentOCProyId);
  if(!p)return;
  if(!p.ocs)p.ocs=[];

  const ocEditadoId=editOCId; // save before closeOCModal nullifies it
  if(ocEditadoId){
    // EDITAR OC existente
    const oc=p.ocs.find(o=>o.id===ocEditadoId);
    if(oc){
      oc.num=num;
      oc.fecha=document.getElementById('oc-f-fecha').value;
      oc.monto=monto;
      oc.desc=document.getElementById('oc-f-desc').value.trim();
    }
  } else {
    // NUEVA OC
    p.ocs.push({id:uid(),num,fecha:document.getElementById('oc-f-fecha').value,monto,desc:document.getElementById('oc-f-desc').value.trim()});
  }

  save();closeOCModal();
  // Refrescar todas las vistas afectadas
  renderProyectoDetalle();
  switchPDTab('pd-tab-ocs');
  renderProyectos();
  renderCobrosStats();
  renderCobros();
  renderReportesIfActive();
}
function eliminarOC(id){
  const p=db.proyectos.find(x=>x.id===currentProyId);
  if(!p)return;
  // check if EPs use this OC
  const used=db.eps.filter(e=>e.proy_id===currentProyId&&e.oc_id===id&&e.estado!=='nula').length;
  if(used>0){alert(`Esta OC tiene ${used} EP(s) asociado(s). Anúlalos primero.`);return;}
  openConfirm('¿Eliminar OC?','Esta acción no se puede deshacer.',()=>{
    p.ocs=p.ocs.filter(o=>o.id!==id);
    save();renderProyectoDetalle();switchPDTab('pd-tab-ocs');
  });
}

// ════════════════════════════════
//  ESTADO DE PAGO
// ════════════════════════════════
function openEPModal(id){
  editEPId=id||null;epPdfFile=null;epPdfData=null;
  const ep=id?db.eps.find(e=>e.id===id):null;
  const p=db.proyectos.find(x=>x.id===currentProyId);
  if(!p)return;
  const cl=db.clientes.find(c=>c.id===p.cliente_id)||{};
  const mon=p.moneda||'UF';
  document.getElementById('ep-modal-title').textContent=ep?'Editar Estado de Pago':'Nuevo Estado de Pago';
  document.getElementById('ep-neto-lbl').textContent=`Monto Neto (${mon})`;

  // auto EP number
  const epsDelProy=db.eps.filter(e=>e.proy_id===currentProyId&&e.estado!=='nula'&&!id);
  const siguienteNum=epsDelProy.length+1;
  document.getElementById('ep-f-num').value=ep?ep.numero:`EP-${String(siguienteNum).padStart(3,'0')}`;

  // OC select
  const ocs=p.ocs||[];
  const ocSel=document.getElementById('ep-f-oc');
  ocSel.innerHTML='<option value="">Sin OC (contra contrato)</option>'+ocs.map(oc=>{
    const cargado=db.eps.filter(e=>e.oc_id===oc.id&&e.estado!=='nula'&&(!id||e.id!==id)).reduce((s,e)=>s+(parseFloat(e.neto_ret)||0),0);
    const saldo=(parseFloat(oc.monto)||0)-cargado;
    return`<option value="${oc.id}" ${ep?.oc_id===oc.id?'selected':''}>${oc.num} — Saldo: ${fMonto(saldo,mon)}</option>`;
  }).join('');

  // UF — prefill with ep value if editing, else today's value
  document.getElementById('ep-f-uf').value=(ep&&ep.uf_val)?ep.uf_val:(db.uf_value||'');
  document.getElementById('ep-uf-hint').textContent=mon==='UF'?`UF vigente hoy: ${fUFVal(db.uf_value)} · editable si OC usa UF anclada`:'Moneda: Pesos CLP';
  // Recalculate when UF value changes
  document.getElementById('ep-f-uf').oninput=calcEP;

  // IVA label
  const ivaLbl='IVA 19%';
  document.getElementById('ec-iva-lbl').textContent=ivaLbl;

  if(ep){
    document.getElementById('ep-f-factura').value=ep.n_factura||'';
    document.getElementById('ep-f-fecha').value=ep.fecha_emision||'';
    document.getElementById('ep-f-venc').value=ep.fecha_venc||'';
    document.getElementById('ep-f-glosa').value=ep.glosa||'';
    document.getElementById('ep-f-neto').value=ep.neto||'';
    document.getElementById('ep-f-ret').value=ep.ret_pct||p.ret||0;
    if(ep.pdf_name)showEPPdfSelected(ep.pdf_name);
    else{document.getElementById('ep-pdf-zone').style.display='';document.getElementById('ep-pdf-selected').style.display='none';}
  } else {
    ['ep-f-factura','ep-f-glosa','ep-f-neto'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('ep-f-fecha').value=today();
    document.getElementById('ep-f-venc').value='';
    document.getElementById('ep-f-ret').value=p.ret||0;
    document.getElementById('ep-pdf-zone').style.display='';
    document.getElementById('ep-pdf-selected').style.display='none';
  }
  calcEP();
  document.getElementById('ov-ep').classList.add('open');
}
function closeEPModal(){document.getElementById('ov-ep').classList.remove('open');editEPId=null;}

function onEPFecha(){
  document.getElementById('ep-f-uf').value=db.uf_value||'';
  calcEP();
}

function calcEP(){
  const p=db.proyectos.find(x=>x.id===currentProyId);
  if(!p)return;
  const cl=db.clientes.find(c=>c.id===p.cliente_id)||{};
  const mon=p.moneda||'UF';
  const neto=parseFloat(document.getElementById('ep-f-neto').value)||0;
  const retPct=parseFloat(document.getElementById('ep-f-ret').value)||0;
  const ufV=parseFloat(document.getElementById('ep-f-uf').value)||db.uf_value||0;
  const ret=neto*retPct/100;
  const netoRet=neto-ret;
  const iva=netoRet*0.19;  // siempre se calcula
  const total=netoRet+iva;
  const totalCLP=mon==='UF'?Math.round(total*ufV):Math.round(total);
  const netoCLP=mon==='UF'?Math.round(netoRet*ufV):Math.round(netoRet);

  document.getElementById('ec-neto').textContent=fMonto(neto,mon);
  document.getElementById('ec-ret').textContent=retPct>0?'-'+fMonto(ret,mon):'Sin retención';
  document.getElementById('ec-netoret').textContent=fMonto(netoRet,mon);
  document.getElementById('ec-iva').textContent=fMonto(iva,mon);
  document.getElementById('ec-total').textContent=fMonto(total,mon);
  document.getElementById('ec-clp').textContent='$'+fCLP(totalCLP)+(mon==='UF'?' (UF='+fUFVal(ufV)+')':'');

  // Live saldo indicator
  const oc_id_live=document.getElementById('ep-f-oc').value||null;
  const epsEx=db.eps.filter(e=>e.proy_id===currentProyId&&e.estado!=='nula'&&e.id!==editEPId);
  let saldoDisp=null, saldoLabel='', saldoOK=true;
  if(oc_id_live){
    const oc_live=(p.ocs||[]).find(o=>o.id===oc_id_live);
    if(oc_live){
      const cargado=epsEx.filter(e=>e.oc_id===oc_id_live).reduce((s,e)=>s+(parseFloat(e.neto_ret)||0),0);
      saldoDisp=(parseFloat(oc_live.monto)||0)-cargado;
      saldoLabel=`Saldo OC ${oc_live.num}: ${fMonto(saldoDisp,mon)}`;
      saldoOK=netoRet<=saldoDisp+0.001;
    }
  } else {
    const contrato=parseFloat(p.monto)||0;
    if(contrato>0){
      const emitido=epsEx.filter(e=>!e.oc_id).reduce((s,e)=>s+(parseFloat(e.neto_ret)||0),0);
      saldoDisp=contrato-emitido;
      saldoLabel=`Saldo Contrato: ${fMonto(saldoDisp,mon)}`;
      saldoOK=netoRet<=saldoDisp+0.001;
    }
  }

  // Show/hide inline saldo warning in the calc box
  let saldoRow=document.getElementById('ec-saldo-row');
  if(!saldoRow){
    const cbox=document.getElementById('ep-calc-box');
    saldoRow=document.createElement('div');
    saldoRow.id='ec-saldo-row';
    saldoRow.className='crow';
    saldoRow.style.marginTop='4px';
    cbox.appendChild(saldoRow);
  }
  if(saldoDisp!==null&&neto>0){
    saldoRow.style.display='flex';
    saldoRow.style.color=saldoOK?'var(--success)':'#C03030';
    saldoRow.style.fontWeight='500';
    saldoRow.innerHTML=`<span>${saldoLabel}</span><span>${saldoOK?'✓ Saldo OK':'⚠ EXCEDE SALDO'}</span>`;
  } else {
    saldoRow.style.display='none';
  }
}

function handleEPPdf(e){
  const file=e.target.files[0];if(!file)return;
  epPdfFile=file;
  const reader=new FileReader();
  reader.onload=ev=>{epPdfData=ev.target.result;};
  reader.readAsDataURL(file);
  showEPPdfSelected(file.name);
}
function showEPPdfSelected(name){
  document.getElementById('ep-pdf-zone').style.display='none';
  document.getElementById('ep-pdf-selected').style.display='block';
  document.getElementById('ep-pdf-selected').innerHTML=`<div class="pdf-name">📎 ${name} <button class="btn xs danger" onclick="clearEPPdf()" style="margin-left:auto">×</button></div>`;
}
function clearEPPdf(){epPdfFile=null;epPdfData=null;document.getElementById('ep-pdf-zone').style.display='';document.getElementById('ep-pdf-selected').style.display='none';}

function guardarEP(){
  const p=db.proyectos.find(x=>x.id===currentProyId);
  if(!p)return;
  const cl=db.clientes.find(c=>c.id===p.cliente_id)||{};
  const mon=p.moneda||'UF';
  const neto=parseFloat(document.getElementById('ep-f-neto').value)||0;
  if(!neto){alert('El monto neto es obligatorio.');return;}
  const retPct=parseFloat(document.getElementById('ep-f-ret').value)||0;
  const ufV=parseFloat(document.getElementById('ep-f-uf').value)||db.uf_value||0;
  const ret_uf=neto*retPct/100;
  const neto_ret=neto-ret_uf;
  const iva_uf=neto_ret*0.19;  // siempre se calcula, aunque mandante rebaje IVA
  const total=neto_ret+iva_uf;
  const total_clp=mon==='UF'?Math.round(total*ufV):Math.round(total);
  const neto_clp=mon==='UF'?Math.round(neto_ret*ufV):Math.round(neto_ret);

  // ── VALIDACIÓN DE SALDO ──────────────────────────────────────────
  const oc_id=document.getElementById('ep-f-oc').value||null;
  const epsExistentes=db.eps.filter(e=>e.proy_id===currentProyId&&e.estado!=='nula'&&e.id!==editEPId);

  if(oc_id){
    // Validar contra saldo de la OC seleccionada
    const oc=(p.ocs||[]).find(o=>o.id===oc_id);
    if(oc){
      const cargadoOC=epsExistentes.filter(e=>e.oc_id===oc_id).reduce((s,e)=>s+(parseFloat(e.neto_ret)||0),0);
      const saldoOC=(parseFloat(oc.monto)||0)-cargadoOC;
      if(neto_ret>saldoOC+0.001){
        const exceso=neto_ret-saldoOC;
        showAlertaSaldo(
          'Saldo OC insuficiente',
          `La OC <b>${oc.num}</b> no tiene saldo suficiente para este Estado de Pago.<br><br>
           <b>Saldo disponible OC:</b> ${fMonto(saldoOC,mon)}<br>
           <b>Monto del EP (neto c/ret.):</b> ${fMonto(neto_ret,mon)}<br>
           <b>Exceso:</b> <span style="color:#C03030">${fMonto(exceso,mon)}</span><br><br>
           Ajusta el monto del EP o selecciona otra OC con saldo suficiente.`
        );
        return;
      }
    }
  } else {
    // Sin OC: validar contra saldo del contrato
    const contrato=parseFloat(p.monto)||0;
    if(contrato>0){
      const emitidoContrato=epsExistentes.filter(e=>!e.oc_id).reduce((s,e)=>s+(parseFloat(e.neto_ret)||0),0);
      const saldoContrato=contrato-emitidoContrato;
      if(neto_ret>saldoContrato+0.001){
        const exceso=neto_ret-saldoContrato;
        showAlertaSaldo(
          'Saldo de Contrato insuficiente',
          `El monto de este EP excede el saldo disponible del contrato.<br><br>
           <b>Monto Contrato:</b> ${fMonto(contrato,mon)}<br>
           <b>Ya emitido (sin OC):</b> ${fMonto(emitidoContrato,mon)}<br>
           <b>Saldo disponible:</b> ${fMonto(saldoContrato,mon)}<br>
           <b>Monto del EP (neto c/ret.):</b> ${fMonto(neto_ret,mon)}<br>
           <b>Exceso:</b> <span style="color:#C03030">${fMonto(exceso,mon)}</span><br><br>
           Ajusta el monto del EP, actualiza el monto del contrato o asocia una OC.`
        );
        return;
      }
    }
  }
  // ── FIN VALIDACIÓN ───────────────────────────────────────────────

  const data={
    proy_id:currentProyId,numero:document.getElementById('ep-f-num').value.trim(),
    n_factura:document.getElementById('ep-f-factura').value.trim(),
    fecha_emision:document.getElementById('ep-f-fecha').value,
    fecha_venc:document.getElementById('ep-f-venc').value,
    glosa:document.getElementById('ep-f-glosa').value.trim(),
    oc_id:oc_id,
    uf_val:ufV,neto,ret_pct:retPct,ret_uf,neto_ret,iva_uf,total,total_clp,neto_clp,moneda:mon,
    estado:'pendiente'
  };

  if(epPdfData){data.pdf_name=epPdfFile.name;data.pdf_data=epPdfData;}

  const done=()=>{
    save();
    closeEPModal();
    renderProyectoDetalle();
    // also refresh facturas page if visible
    const cobrosPage=document.getElementById('p-cobros');
    if(cobrosPage&&cobrosPage.classList.contains('active')){renderCobrosStats();renderCobros();}
  };

  if(editEPId){
    const ep=db.eps.find(e=>e.id===editEPId);
    if(ep){
      // preserve existing pdf if no new one uploaded
      const existingPdf={pdf_name:ep.pdf_name,pdf_data:ep.pdf_data};
      Object.assign(ep,data);
      if(!epPdfData&&existingPdf.pdf_name){ep.pdf_name=existingPdf.pdf_name;ep.pdf_data=existingPdf.pdf_data;}
    }
    done();
  } else {
    db.eps.push({id:uid(),...data,creado:new Date().toISOString()});
    done();
  }
}

function abrirDetalleEP(id){
  // No-op: actions are done via buttons in each row
}

// ════════════════════════════════
//  NC
// ════════════════════════════════
function openNCModal(epId){
  ncEPId=epId;
  const ep=db.eps.find(e=>e.id===epId);
  if(!ep)return;
  const p=db.proyectos.find(x=>x.id===ep.proy_id)||{};
  const mon=ep.moneda||p.moneda||'UF';
  document.getElementById('nc-ep-info').innerHTML=`📄 EP ${ep.numero||'—'} · Factura N° ${ep.n_factura||'—'} · ${fMonto(ep.total,mon)}`;
  document.getElementById('nc-f-num').value='';
  document.getElementById('nc-f-fecha').value=today();
  document.getElementById('nc-f-monto').value=ep.neto_ret||ep.total||'';
  document.getElementById('nc-f-moneda').value=mon;
  document.getElementById('nc-f-motivo').value='';
  document.getElementById('ov-nc').classList.add('open');
}
function closeNCModal(){document.getElementById('ov-nc').classList.remove('open');ncEPId=null;}
function guardarNC(){
  const num=document.getElementById('nc-f-num').value.trim();
  const monto=parseFloat(document.getElementById('nc-f-monto').value)||0;
  if(!num){alert('El número de NC es obligatorio.');return;}
  const ep=db.eps.find(e=>e.id===ncEPId);
  if(!ep)return;
  const gnc_mon=document.getElementById('nc-f-moneda').value;
  const gnc_iva=monto*0.19;
  const gnc_total=monto+gnc_iva;
  const gnc_total_clp=Math.round(gnc_total*(gnc_mon==='UF'?(ep.uf_val||db.uf_value||1):1));
  db.ncs.push({id:uid(),ep_id:ncEPId,proy_id:ep.proy_id,numero:num,n_factura:num,fecha:document.getElementById('nc-f-fecha').value,monto,iva:gnc_iva,total:gnc_total,total_clp:gnc_total_clp,motivo:document.getElementById('nc-f-motivo').value.trim(),moneda:gnc_mon});
  ep.estado='nula';
  save();closeNCModal();renderProyectoDetalle();renderCobrosStats();renderCobros();renderReportesIfActive();
}

// ════════════════════════════════
//  PAGO
// ════════════════════════════════
function openPagoModal(id){
  pagoEPId=id;
  const ep=db.eps.find(e=>e.id===id);
  if(!ep)return;
  const isPagado=ep.estado==='pagado';
  const isParcial=ep.estado==='parcial';
  document.getElementById('pago-modal-title').textContent=isPagado||isParcial?'Editar Estado de Pago':'Registrar Pago';
  document.getElementById('pago-label').value=`EP ${ep.numero||'—'} · Fact. ${ep.n_factura||'—'} · $${fCLP(ep.total_clp)}`;
  document.getElementById('pago-estado').value=ep.estado==='pendiente'||ep.estado==='vencido'?'pendiente':ep.estado;
  document.getElementById('pago-fecha').value=ep.fecha_pago||today();
  document.getElementById('pago-monto').value=ep.monto_pagado||ep.total_clp||'';
  document.getElementById('pago-confirm-btn').textContent=isPagado||isParcial?'Confirmar Cambio':'Confirmar Pago';
  onPagoEstadoChange();
  document.getElementById('ov-pago').classList.add('open');
}
function onPagoEstadoChange(){
  const est=document.getElementById('pago-estado').value;
  const fechaWrap=document.getElementById('pago-fecha-wrap');
  const montoWrap=document.getElementById('pago-monto-wrap');
  const warn=document.getElementById('pago-revert-warn');
  if(est==='pendiente'){
    fechaWrap.style.display='none';
    montoWrap.style.display='none';
    warn.style.display='block';
  } else {
    fechaWrap.style.display='';
    montoWrap.style.display='';
    warn.style.display='none';
  }
}
function closePagoModal(){document.getElementById('ov-pago').classList.remove('open');pagoEPId=null;}
function confirmarPago(){
  const ep=db.eps.find(e=>e.id===pagoEPId);
  if(!ep)return;
  const nuevoEstado=document.getElementById('pago-estado').value;
  ep.estado=nuevoEstado;
  if(nuevoEstado==='pendiente'){
    // revert: clear payment data
    delete ep.fecha_pago;
    delete ep.monto_pagado;
  } else {
    ep.fecha_pago=document.getElementById('pago-fecha').value;
    ep.monto_pagado=parseFloat(document.getElementById('pago-monto').value)||ep.total_clp;
  }
  save();closePagoModal();
  // refresh all affected views
  const pdPage=document.getElementById('p-proy-detalle');
  if(pdPage&&pdPage.classList.contains('active'))renderProyectoDetalle();
  renderCobrosStats();
  renderCobros();
  renderReportesIfActive();
}

// ════════════════════════════════
//  FACTURAS / COBROS
// ════════════════════════════════
function populateCobrosFilters(){
  const sel=document.getElementById('co-filt-cl');
  sel.innerHTML='<option value="">Todos los clientes</option>'+db.clientes.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');
}

function renderCobrosStats(){
  const ufV=db.uf_value||0;
  let cobrado=0,pendiente=0,vencido=0,retencion=0;
  db.eps.filter(e=>e.estado!=='nula').forEach(ep=>{
    const d=diasVenc(ep.fecha_venc);
    const uf=ep.moneda==='UF'?parseFloat(ep.neto_ret||0):parseFloat(ep.neto_ret||0)/ufV;
    if(ep.estado==='pagado')cobrado+=parseFloat(ep.total_clp||0);
    else if((ep.estado==='pendiente'&&d!==null&&d<0)||ep.estado==='vencido')vencido+=parseFloat(ep.total_clp||0);
    else pendiente+=parseFloat(ep.total_clp||0);
    retencion+=parseFloat(ep.ret_uf||0)*(ep.moneda==='UF'?ufV:1);
  });
  document.getElementById('cobros-stats').innerHTML=`
    <div class="stat g"><div class="sl">Cobrado ($)</div><div class="sv">$${fCLP(cobrado)}</div><div class="ss">${db.eps.filter(e=>e.estado==='pagado').length} facturas</div></div>
    <div class="stat a"><div class="sl">Por Cobrar ($)</div><div class="sv">$${fCLP(pendiente)}</div><div class="ss">${db.eps.filter(e=>e.estado==='pendiente').length} pendientes</div></div>
    <div class="stat r"><div class="sl">Vencido ($)</div><div class="sv">$${fCLP(vencido)}</div><div class="ss">Requiere atención</div></div>
    <div class="stat b"><div class="sl">Retenciones ($)</div><div class="sv">$${fCLP(retencion)}</div><div class="ss">${db.proyectos.length} proyectos activos</div></div>`;
}

function renderCobros(){
  const q=(document.getElementById('co-search')?.value||'').toLowerCase();
  const fe=document.getElementById('co-filt-est')?.value||'';
  const fc=document.getElementById('co-filt-cl')?.value||'';

  // merge eps + ncs for display
  let list=db.eps.map(ep=>({...ep,_type:'ep'}));
  // add NCs — only those whose parent EP still exists
  db.ncs.forEach(nc=>{
    if(db.eps.find(e=>e.id===nc.ep_id)){
      list.push({...nc,_type:'nc',estado:'nc',n_factura:nc.numero,fecha_emision:nc.fecha,total_clp:-Math.round((parseFloat(nc.monto)||0)*(db.uf_value||1))});
    }
  });

  list=list.filter(ep=>{
    const pr=db.proyectos.find(p=>p.id===ep.proy_id)||{};
    const cl=db.clientes.find(c=>c.id===pr.cliente_id)||{};
    const matchQ=!q||(ep.n_factura||'').toLowerCase().includes(q)||(ep.numero||'').toLowerCase().includes(q)||(cl.nombre||'').toLowerCase().includes(q)||(pr.nombre||'').toLowerCase().includes(q);
    const matchE=!fe||ep.estado===fe;
    const matchC=!fc||cl.id===fc;
    return matchQ&&matchE&&matchC;
  });
  list.sort((a,b)=>(b.fecha_emision||'').localeCompare(a.fecha_emision||''));

  document.getElementById('cobros-count').textContent=`${db.eps.length} facturas · ${db.ncs.length} notas de crédito`;
  const cont=document.getElementById('co-table-body');
  if(list.length===0){cont.innerHTML=`<div class="empty"><div class="big">🧾</div><p>Sin registros.</p></div>`;return;}
  cont.innerHTML=`<div style="overflow-x:auto"><table>
    <thead><tr><th>Tipo</th><th>N° Doc</th><th>EP</th><th>Fecha</th><th>Mandante</th><th>Proyecto</th><th>Moneda</th><th>Neto</th><th>IVA</th><th>Total $</th><th>UF día</th><th>Vencimiento</th><th>Fecha Pago</th><th>Días</th><th>Estado</th><th></th></tr></thead>
    <tbody>${list.map(ep=>{
      const pr=db.proyectos.find(p=>p.id===ep.proy_id)||{};
      const cl=db.clientes.find(c=>c.id===pr.cliente_id)||{};
      const d=diasVenc(ep.fecha_venc);
      const dp=diasPago(ep.fecha_emision,ep.fecha_pago);
      const isNC=ep._type==='nc';
      const mon=ep.moneda||pr.moneda||'UF';
      return`<tr class="${isNC?'nc-line':''} ${ep.estado==='nula'?'anulada':''}" onclick="${isNC?'':''}" >
        <td>${isNC?badge('nc',null):'<span class="badge b-bor" style="gap:0">Factura</span>'}</td>
        <td class="mo">${ep.n_factura||ep.numero||'—'}</td>
        <td class="mo">${ep.numero||'—'}</td>
        <td class="mo">${fDate(ep.fecha_emision)}</td>
        <td>${cl.nombre||'—'}</td>
        <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px">${pr.nombre||'—'}</td>
        <td class="mo">${mon}</td>
        <td class="ra">${isNC?'-'+fMonto(ep.monto,mon):fMonto(ep.neto_ret,mon)}</td>
        <td class="ra">${isNC?'—':fMonto(ep.iva_uf,mon)}</td>
        <td class="ra" style="${isNC?'color:var(--red)':''}${!isNC&&ep.estado==='pagado'?';color:var(--green)':''}">${isNC?'-$'+fCLP(Math.abs(ep.total_clp)):'$'+fCLP(ep.total_clp)}</td>
        <td class="ra">${mon==='UF'?fUFVal(ep.uf_val):'—'}</td>
        <td class="mo">${isNC?'—':fDate(ep.fecha_venc)}</td>
        <td class="mo">${fDate(ep.fecha_pago)}</td>
        <td class="mo">${ep.estado==='pagado'&&dp!==null?dp+'d':'—'}</td>
        <td>${isNC?badge('nc',null):badge(ep.estado,d)}</td>
        <td style="white-space:nowrap;padding:5px 8px">
          <div style="display:flex;gap:4px;align-items:center;flex-wrap:nowrap">
            ${!isNC&&ep.estado!=='nula'?`<button class="btn xs" onclick="openPagoModal('${ep.id}')" style="background:var(--success);color:#fff;border-color:var(--success)">✓ Pago</button>`:''}
            ${!isNC&&ep.pdf_data?`<button class="btn xs sec" onclick="verPDF('${ep.id}')">📄</button>`:''}
            ${!isNC&&ep.estado==='nula'?`<button class="btn xs danger" onclick="eliminarEPdesdeCobros('${ep.id}')" title="Eliminar factura anulada del registro">🗑 Eliminar</button>`:''}
            ${isNC?`<button class="btn xs danger" onclick="eliminarNCdesdeCobros('${ep.id}')" title="Eliminar nota de crédito del registro">🗑 Eliminar</button>`:''}
          </div>
        </td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function eliminarEPdesdeCobros(id){
  const ep=db.eps.find(e=>e.id===id);
  if(!ep)return;
  if(ep.estado!=='nula'){alert('Solo se pueden eliminar facturas que estén anuladas.');return;}
  const nc=db.ncs.find(n=>n.ep_id===id);
  const msg=nc
    ?`¿Eliminar la factura N° ${ep.n_factura||ep.numero||'—'} del registro?\n\nNota: la Nota de Crédito asociada (NC ${nc.numero||'—'}) quedará huérfana. Se recomienda eliminarla también.`
    :`¿Eliminar la factura N° ${ep.n_factura||ep.numero||'—'} del registro? Esta acción no se puede deshacer.`;
  openConfirm('Eliminar Factura Anulada', msg, ()=>{
    db.eps=db.eps.filter(e=>e.id!==id);
    // also remove any NC associated with this EP
    db.ncs=db.ncs.filter(n=>n.ep_id!==id);
    save();
    renderCobrosStats();renderCobros();
    renderProyectosIfActive();
    renderReportesIfActive();
  });
}

function eliminarNCdesdeCobros(id){
  const nc=db.ncs.find(n=>n.id===id);
  if(!nc)return;
  const ep=db.eps.find(e=>e.id===nc.ep_id);
  openConfirm(
    'Eliminar Nota de Crédito',
    `¿Eliminar la NC N° ${nc.numero||'—'} del registro?\n\n${ep?'La factura asociada (N° '+(ep.n_factura||ep.numero||'—')+') volverá al estado Pendiente.':''}`,
    ()=>{
      db.ncs=db.ncs.filter(n=>n.id!==id);
      if(ep){ep.estado='pendiente';}
      save();
      renderCobrosStats();renderCobros();
      renderProyectosIfActive();
      renderReportesIfActive();
    }
  );
}

// ════════════════════════════════
//  PDF
// ════════════════════════════════
function verPDF(id){
  const ep=db.eps.find(e=>e.id===id);
  if(!ep?.pdf_data){alert('PDF no disponible. Adjúntalo nuevamente desde el proyecto.');return;}
  const w=window.open('','_blank');
  w.document.write(`<iframe src="${ep.pdf_data}" style="width:100%;height:100vh;border:none"></iframe>`);
}

function generarPDF(){
  const p=db.proyectos.find(x=>x.id===currentProyId);
  if(!p){alert('No hay proyecto activo.');return;}
  const cl=db.clientes.find(c=>c.id===p.cliente_id)||{};
  const cfg=db.config||{};
  const eps=db.eps.filter(e=>e.proy_id===currentProyId);
  const epsValidos=eps.filter(e=>e.estado!=='nula');
  const mon=p.moneda||'UF';
  const ncs=db.ncs.filter(n=>eps.some(e=>e.id===n.ep_id));
  const contrato=parseFloat(p.monto)||0;
  const totalNetoRet=epsValidos.reduce((s,e)=>s+(parseFloat(e.neto_ret)||0),0);
  const totalRet=epsValidos.reduce((s,e)=>s+(parseFloat(e.ret_uf)||0),0);
  // PDF: cobrado en netos
  const pdfValorCobro=(ep)=>(parseFloat(ep.neto_ret)||0);
  const pagadoNetoRet=epsValidos.filter(e=>e.estado==='pagado').reduce((s,e)=>s+pdfValorCobro(e),0);
  const saldo=Math.max(0,contrato-totalNetoRet);
  const retContrato=contrato*(parseFloat(p.ret)||0)/100;
  const ocs=p.ocs||[];

  let epRows='';let item=0;
  eps.forEach(ep=>{
    const nc=ncs.find(n=>n.ep_id===ep.id);
    item++;
    const epItem=item;
    const isAnulada=ep.estado==='nula';
    epRows+=`<tr style="${isAnulada?'color:#AAAAAA;font-style:italic':''}">
      <td style="text-align:center;font-weight:700">${epItem}</td>
      <td style="white-space:normal;word-break:break-word">${ep.glosa||'—'}</td>
      <td style="text-align:center">${ep.n_factura||'—'}</td>
      <td style="text-align:center">${fDate(ep.fecha_emision)}</td>
      <td style="text-align:right">${fMonto(ep.neto,mon)}</td>
      <td style="text-align:right">${parseFloat(ep.ret_uf||0)>0?fMonto(ep.ret_uf,mon):'—'}</td>
      <td style="text-align:right">${fMonto(ep.neto_ret,mon)}</td>
      <td style="text-align:right">${fMonto(ep.iva_uf,mon)}</td>
      <td style="text-align:right;font-weight:700">${fMonto(ep.total,mon)}</td>
      <td style="text-align:right">${mon==='UF'?fUFVal(ep.uf_val):'—'}</td>
      <td style="text-align:right">$${fCLP(ep.total_clp)}</td>
    </tr>`;
    if(nc){
      item++;
      const ncItem=item;
      epRows+=`<tr style="background:#FFFBF0;color:#8B6914">
        <td style="text-align:center;font-weight:700">${ncItem}</td>
        <td style="font-style:italic;white-space:normal;word-break:break-word">${nc.motivo||'Nota de Crédito — anula factura '+ep.n_factura}</td>
        <td style="text-align:center">NC ${nc.numero||'—'}</td>
        <td style="text-align:center">${fDate(nc.fecha)}</td>
        <td style="text-align:right;color:#C03030;font-weight:600">-${fMonto(nc.monto,mon)}</td>
        <td style="text-align:center">—</td>
        <td style="text-align:right;color:#C03030;font-weight:600">-${fMonto(nc.monto,mon)}</td>
        <td style="text-align:center">—</td>
        <td style="text-align:right;color:#C03030;font-weight:700">-${fMonto(nc.monto,mon)}</td>
        <td style="text-align:center">—</td>
        <td style="text-align:right;color:#C03030">-$${fCLP(nc.monto*(mon==='UF'?(db.uf_value||ep.uf_val||1):1))}</td>
      </tr>`;
    }
  });

  let ocRows=ocs.map(oc=>{
    const cargado=epsValidos.filter(e=>e.oc_id===oc.id).reduce((s,e)=>s+(parseFloat(e.neto_ret)||0),0);
    const saldoOC=Math.max(0,(parseFloat(oc.monto)||0)-cargado);
    return`<tr><td>${oc.num}</td><td style="text-align:right">${fMonto(oc.monto,mon)}</td><td style="text-align:right">${fMonto(cargado,mon)}</td><td style="text-align:right;color:${saldoOC>0?'#1B4332':'#C03030'};font-weight:600">${fMonto(saldoOC,mon)}</td></tr>`;
  }).join('');

  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>
body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:0;padding:0}
.pg{padding:26px 32px}
.top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;border-bottom:2px solid #1B4332;padding-bottom:12px}
.co-name{font-size:19px;font-weight:bold;color:#1A1A1A}
.co-sub{font-size:11px;color:#666;margin-top:2px}
.doc-box{border:2px solid #7B1A1A;padding:7px 16px;border-radius:4px;text-align:center}
.doc-box .dt{font-size:15px;font-weight:bold;color:#7B1A1A}
.doc-box .ds{font-size:11px;color:#555}
.pname{font-size:17px;font-weight:bold;color:#C03030;margin:10px 0 3px}
.pmeta{font-size:12px;color:#666;margin-bottom:12px}.pmeta table{border-collapse:collapse}.pmeta td{padding:1px 12px 1px 0;vertical-align:top}.pmeta td.lbl{color:#999;white-space:nowrap}.pmeta td.val{color:#333;font-weight:500}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px}
table.info{width:100%;border-collapse:collapse;font-size:12.5px}
table.info td{padding:5px 8px;border:1px solid #DDD}
table.info td:last-child{text-align:right;font-weight:500;background:#FAFAFA}
table.info tr.h td{background:#7B1A1A;color:#fff;font-weight:bold;text-align:center}
table.ep{width:100%;border-collapse:collapse;font-size:11px;margin:10px 0;table-layout:fixed}table.ep td{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}table.ep th{white-space:normal;line-height:1.3;vertical-align:bottom;padding:5px 4px}
table.ep th{background:#7B1A1A;color:#fff;padding:6px 6px;text-align:center;font-weight:500;border:1px solid #5A1212}
table.ep td{padding:5px 6px;border:1px solid #CCC;vertical-align:middle}
table.ep tr.tot td{background:#F5EAEA;font-weight:bold}

.saldos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
.sb{border:1px solid #CCC;border-radius:3px;padding:8px 10px;background:#FAFAFA}
.sb .sl{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.4px}
.sb .sv{font-size:16px;font-weight:bold;color:#C03030;margin-top:3px}
.foot{margin-top:18px;padding-top:8px;border-top:1px solid #EEE;font-size:11px;color:#888;display:flex;justify-content:space-between}
@media print{.no-print{display:none}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}@page{margin:10mm 12mm;size:A4 landscape}
</style></head><body>
<div class="pg">
  <div class="top">
    <div style="display:flex;align-items:center;gap:14px">
      <img src="data:image/jpeg;base64,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88888884AA8884gQ8888y/8A/wD/AM/q+/8A/wD+nzzzzzzzzzzygDzzzzzzzzwBTyxBzzzzzzzzgDDDzzzzzzzzyhDTzzgBTzzzy7b/AP8AB/PCPP8A+l/zzzzzzzzzzygDzzzzzzzzgTzzgBDzzzzzzzywABBjTzzzzzywDzzzADTzzzzyw9n/AM888fKdc888888888888oA88888884IA888IE888888888scAAA088888sAU84oQ888888Uc/t98888cc8888888888888oA88888884AAAAAAAc8888888888sIA0888888IU84AU888889/8A/wD/AL88088880888888888888A0888888gEU888oAY888888888884AQ888888MA8YE888888c//wD/AP8A/o88888o88888888888sAc888884oA88888gE888888888888Ac888888oIAIQ888888c/8A/wD/AP2o88888o88888888w84IAc888888As88888oAc88888w4084oE88888888oEA0888888x//wD/AO3+zzzzzyzzzzzzzyyDAADTzzzzzxgDTzzzzywBTzzzyiACDAAATzzzzzzzzgADzzzzzzy/ff8A0n88M484sc88888888s8sM8888888c888888888s88888s888c8888888888888888888888SY388884cY888888888888888888888888888888888888888888888888888888888888887F//ADevPKPPPKPPPPPPPPPPPPPPPPPPPPPPPPPOPPPPPPPPMNPPPPPPPOPPPPPPPPPPNPPPPPPBv/8A/wD93s88888s888888888048ww408w844084gY808004cscw80w04UwY888888044U8w88881/8A/wD/AP248888848888888888oQcoUMI88oUMI0Ios0ogs48Q4sMk0Uoo88osc888U80Uko0888W//wD/AP8A3s88888s8888888844oMQs44s80o44s8oY4U8Uc8s4000wgwk8YQo80848wkw800I8886/8A/wD/APc80888808888888888888088888888888888sM88888888888888888888888888888887928e888U48U888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888/9oADAMBAAIAAwAAABDzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzTzzzzzzzzzTzTzzzzzzzzzzjTABTzzzzzzzDzzzzzzTzzzzie36vTzzlxxxnzzzzzzzzzzzzwDzzzzzzzzzggADzzzzzzzzzxgAgQxDzzzywgTzzzzzgBTzzyf77747zl37775jzzzzzzzzzzzwDzzzzzzzzygABBTzzzzzzzyAATzywzzzzzwhDzzzzzgCzzzxX777777377777rzzzzzzzzzzzwDzzzzzzzzyARgDDzzzzzzzwADzzzzzzzzzxwBDzzzxgTzzzz777775W7777763zzzzzzzzzzzwDzzzzzzzzyhTygTzzzzzzzyBDTzzzzzzzzzwATzzziBTzzzxP7777zf3f7777TzzzzzzzzzzzwDzzzzzzzzgCTyBDTzzzzzzxgjBDzzzzzzzzyABzzygCzzzzyxb77zzzwrT76F/zzzzzzzzzzzwDzzzzzzzwgRzygDzzzzzzzzzwADDTTzzzzzzgBTzzATTzzzzzz8O/zzzw22xzzzzzzzzzzzzzwDzzzzzzzigTzzyhTzzzzzzzzyxwwBDTzzzzyggTzyBTzzzzz1Vy43LzzxxxxzzzzzzzzzzzzzwDzzzzzzygAAAAAABzzzzzzzzzzywQBTzzzzzygDSwBzzzzzyf7777nXxTzzzxTzzzzzzzzzzygDTzzzzzwgSwwwxwDTzzzzzzzzzzygBDzzzzzxwDyhBzzzzzzb77775+zzzzzyzzzzzzzzzzzzABTzzzzziBDzzzzyATzzzzzzzzzzzwBzzzzzzzwBCBjzzzzzz/AO++++U488888488888888w88AEc888888AE88888IQc88888Q0884IAc8888888IQA88888884++++ues88888s88888884gAgEk8888884EU888888Aw88888IAwggEE88888888cAUc888888+x+++288s484s88888888s888M8888888sc8888888Mc88888s888sc888888888sMM888888888C5e88888k088888888888888888888888888888888888888888888888888888888888888/E++ey88g888o08888888848888888888088888888888848088888408w8888488880888888G++++t+4c8888Y88888888U88884444w88444488008084Y8c0084gkUwU4408U8g08o408888W+++++9488888488888888UQIs0owA8UoowAo8o4s88g0s8EIgUIkU8UEswcU8U8Uo8I00U8880+++++fo88888o88888888QMs0ck8w0Ugs8wg0sg008888M4Q4w8kU8EwIs8U8Q4UowgM8Y088d++++od8088880888888888888ws8888888888888840888888888888888888888888888888s8y7+d88MQ44Ec88888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888/8QAKBEAAgECBQMEAwEAAAAAAAAAAQIDABEEICExYBASUCJBYXEyQnBR/9oACAECAQE/AP6bJiANFoyOdzQdh70mIYflrSsGFx1dwouafEMdtKLsfellcbGo5w2jeexElh2jLFJ2N8dCba1I5dr5YJO4WO/nZDdyc0Jugqc2TNCbOPOuLMRmgHorED0Zoxdx53EJZu7/AHKoLGwpR2i1OvcpFEEGxy4dLnu86yhhY1JEyfXUKWNhUUXZqd+s0PdqN6IINj1jiL/VKAosPPtCh3FCGOgoXbKyhtxRgSlhQe3AJMQdloknfokzLSOHFxwXESfqMsblGvQN9eCSG7E5oDdBwRxZiM0Asg4JiEse4ZUUsbCgLCw4IQCLGpICuo1HVEZ9qjiCD54O7RftQaH2oEEacGZgouakmZ/rqrFTcVFKHHzwXEPc9uVWKm4oG4uOCObsTmgN0HBJBZyM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" alt="JASV" style="height:52px;width:auto;object-fit:contain">
      <div>
        <div class="co-name">${cfg.razon||'JASV Ingeniería y Gestión Limitada'}</div>
        <div class="co-sub">Giro: ${cfg.giro||'Asesorías en Ingeniería e Inspecciones Técnicas'}<br>${cfg.dir||''}</div>
      </div>
    </div>
    <div class="doc-box">
      <div class="dt">CONTROL PRESUPUESTARIO</div>
      <div class="ds">Estado de Pago · ${fDate(today())}</div>
    </div>
  </div>
  <div class="pname">${p.nombre}</div>
  <div class="pmeta">
    <table><tbody>
      <tr>
        <td class="lbl">Mandante:</td><td class="val">${cl.nombre||'—'}</td>
        ${p.dir?`<td class="lbl" style="padding-left:20px">Dirección:</td><td class="val">${p.dir}</td>`:'<td colspan="2"></td>'}
      </tr>
      <tr>
        ${p.inicio?`<td class="lbl">Inicio:</td><td class="val">${fDate(p.inicio)}</td>`:'<td colspan="2"></td>'}
        <td class="lbl" style="padding-left:20px">Moneda:</td><td class="val">${mon}</td>
      </tr>
      <tr>
        <td class="lbl">Ret. Contrato:</td><td class="val">${p.ret||0}%</td>
        <td class="lbl" style="padding-left:20px">IVA:</td><td class="val">19%</td>
      </tr>
    </tbody></table>
  </div>

  <div class="grid2">
    <table class="info">
      <tr class="h"><td colspan="2">Resumen Contrato</td></tr>
      <tr><td>Monto Contrato ${mon}</td><td>${fMonto(contrato,mon)}</td></tr>
      <tr><td>Monto Actualizado</td><td>${fMonto(contrato,mon)}</td></tr>
      <tr><td>Retención (${p.ret||0}%)</td><td>${fMonto(retContrato,mon)}</td></tr>
    </table>
    ${ocs.length>0?`
    <table class="info">
      <tr class="h"><td colspan="4">Órdenes de Compra</td></tr>
      <tr><td style="font-weight:bold">N° OC</td><td style="font-weight:bold">Monto</td><td style="font-weight:bold">Cargado</td><td style="font-weight:bold">Saldo</td></tr>
      ${ocRows}
    </table>`:`<div style="background:#FAFAFA;border:1px solid #DDD;padding:12px;border-radius:3px;font-size:12px;color:#888">Sin órdenes de compra registradas. Los cobros se cargan contra el monto estimado del contrato.</div>`}
  </div>

  <table class="ep">
    <thead><tr>
      <th style="width:3%">Item</th><th style="width:24%">Detalle / Glosa</th><th style="width:6%">Factura</th><th style="width:8%">Fecha</th>
      <th style="width:8%">Monto<br>Bruto</th><th style="width:7%">Reten-<br>ciones</th>
      <th style="width:8%">Monto<br>Neto</th><th style="width:7%">IVA</th><th style="width:8%">Total</th><th style="width:9%">Valor UF</th><th style="width:12%">Total $</th>
    </tr></thead>
    <tbody>
      ${epRows}
      <tr class="tot">
        <td colspan="3"></td>
        <td style="text-align:right;font-weight:700">Totales</td>
        <td style="text-align:right">${fMonto(epsValidos.reduce((s,e)=>s+(parseFloat(e.neto)||0),0),mon)}</td>
        <td style="text-align:right">${fMonto(totalRet,mon)}</td>
        <td style="text-align:right">${fMonto(totalNetoRet,mon)}</td>
        <td style="text-align:right">${fMonto(epsValidos.reduce((s,e)=>s+(parseFloat(e.iva_uf)||0),0),mon)}</td>
        <td style="text-align:right">${fMonto(epsValidos.reduce((s,e)=>s+(parseFloat(e.total)||0),0),mon)}</td>
        <td></td>
        <td style="text-align:right">$${fCLP(epsValidos.reduce((s,e)=>s+(parseFloat(e.total_clp)||0),0))}</td>
      </tr>

    </tbody>
  </table>

  <div class="saldos">
    <div class="sb"><div class="sl">Por Pagar Contrato</div><div class="sv">${fMonto(saldo,mon)}</div></div>
    <div class="sb"><div class="sl">Por Retener</div><div class="sv">${fMonto(totalRet,mon)}</div></div>
  </div>

  <div class="foot">
    <div>${cfg.razon||'JASV Ingeniería y Gestión Limitada'} · RUT ${cfg.rut||''} · ${cfg.email||''}</div>
    <div>Generado el ${fDate(today())}</div>
  </div>
</div>

<style>
@media screen {
  .print-bar {
    position:fixed;bottom:0;left:0;right:0;
    background:linear-gradient(135deg,#2A2A2A,#1A1A1A);
    padding:16px 32px;
    display:flex;align-items:center;justify-content:space-between;gap:16px;
    font-family:Arial,sans-serif;z-index:999;
    box-shadow:0 -4px 20px rgba(0,0,0,.4);
  }
  .print-bar .hint {font-size:13px;color:#AAA;margin:0;line-height:1.5}
  .print-bar .hint b {color:#EEE}
  .print-bar .hint .step {
    display:inline-block;background:#7B1A1A;color:#fff;
    border-radius:50%;width:18px;height:18px;text-align:center;
    line-height:18px;font-size:11px;font-weight:700;margin-right:4px;
  }
  .print-bar .btns {display:flex;gap:12px;flex-shrink:0}
  .print-bar button {
    padding:13px 28px;border:none;border-radius:6px;
    cursor:pointer;font-size:14px;font-family:Arial;font-weight:700;
    letter-spacing:.3px;transition:opacity .15s;
  }
  .print-bar button:hover {opacity:.88}
  .btn-print {
    background:#7B1A1A;color:#fff;
    box-shadow:0 2px 8px rgba(123,26,26,.5);
    font-size:15px;padding:14px 32px;
  }
  .btn-close {background:#555;color:#DDD}
  body {padding-bottom:80px}
}
@media print {
  .print-bar {display:none!important}
  body {margin:0;padding:0}
  @page {margin:10mm 12mm;size:A4 landscape}
}
</style>
<div class="print-bar">
  <p class="hint">
    <span class="step">1</span> Clic en <b>Imprimir / Guardar PDF</b> &nbsp;·&nbsp;
    <span class="step">2</span> En <b>Destino</b> selecciona <b>"Guardar como PDF"</b> &nbsp;·&nbsp;
    <span class="step">3</span> Clic en <b>Guardar</b>
  </p>
  <div class="btns">
    <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
    <button class="btn-print" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  </div>
</div>
</body></html>`;
  // Create blob URL and open in new tab — user uses Cmd+P / Ctrl+P or browser print to save PDF
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const w=window.open(url,'_blank');
  // Revoke after a delay to free memory
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}

// ════════════════════════════════
//  REPORTES
// ════════════════════════════════
function renderReportes(){
  const ufV=db.uf_value||0;
  const porCliente=db.clientes.map(c=>{
    const prs=db.proyectos.filter(p=>p.cliente_id===c.id);
    const eps=db.eps.filter(e=>prs.some(p=>p.id===e.proy_id)&&e.estado!=='nula');
    const totalCLP=eps.reduce((s,e)=>s+(parseFloat(e.total_clp)||0),0);
    const pendienteCLP=eps.filter(e=>e.estado!=='pagado').reduce((s,e)=>s+(parseFloat(e.total_clp)||0),0);
    return{nombre:c.nombre,totalCLP,pendienteCLP,nEP:eps.length};
  }).sort((a,b)=>b.totalCLP-a.totalCLP);
  const maxT=Math.max(...porCliente.map(c=>c.totalCLP),1);

  let agingCLP={c:0,d30:0,d60:0,d90:0,m90:0};
  db.eps.filter(e=>e.estado==='pendiente').forEach(ep=>{
    const d=diasVenc(ep.fecha_venc);const clp=parseFloat(ep.total_clp)||0;
    if(d===null)return;
    if(d>=0)agingCLP.c+=clp;else if(d>=-30)agingCLP.d30+=clp;else if(d>=-60)agingCLP.d60+=clp;else if(d>=-90)agingCLP.d90+=clp;else agingCLP.m90+=clp;
  });

  const stats={cobrado:db.eps.filter(e=>e.estado==='pagado').reduce((s,e)=>s+(parseFloat(e.total_clp)||0),0),pendiente:db.eps.filter(e=>e.estado==='pendiente').reduce((s,e)=>s+(parseFloat(e.total_clp)||0),0),nula:db.ncs.reduce((s,n)=>s+(parseFloat(n.monto)||0),0)};

  document.getElementById('rep-content').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card">
        <div class="card-head"><div class="card-title">Cobros por Mandante ($)</div></div>
        <div style="padding:14px 18px">
          ${porCliente.length===0?'<p style="color:var(--ink4)">Sin datos</p>':porCliente.map(c=>`
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:9px">
              <div style="width:110px;font-size:11px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.nombre}</div>
              <div style="flex:1;height:8px;background:var(--paper2);border-radius:3px;overflow:hidden"><div style="height:100%;background:var(--green3);width:${(c.totalCLP/maxT*100).toFixed(1)}%"></div></div>
              <div style="width:90px;text-align:right;font-family:'IBM Plex Mono',monospace;font-size:10.5px">$${fCLP(c.totalCLP)}</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Antigüedad de Saldos ($)</div></div>
        <div style="padding:14px 18px">
          ${[['Corriente (al día)',agingCLP.c,'var(--green)'],['1–30 días vencido',agingCLP.d30,'var(--amber)'],['31–60 días',agingCLP.d60,'var(--amber)'],['61–90 días',agingCLP.d90,'var(--red)'],['Más de 90 días',agingCLP.m90,'var(--red)']].map(([l,v,col])=>`
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--paper3);font-size:12.5px">
              <span style="color:var(--ink3)">${l}</span>
              <span style="font-family:'IBM Plex Mono',monospace;color:${col};font-weight:${v>0?'500':'400'}">$${fCLP(v)}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Resumen Financiero</div></div>
        <div style="padding:14px 18px">
          <div class="cbox">
            <div class="crow"><span>Total Facturado</span><span>$${fCLP(stats.cobrado+stats.pendiente)}</span></div>
            <div class="crow" style="color:var(--green)"><span>Cobrado</span><span>$${fCLP(stats.cobrado)}</span></div>
            <div class="crow" style="color:var(--amber)"><span>Pendiente</span><span>$${fCLP(stats.pendiente)}</span></div>
            <div class="crow" style="color:var(--ink3)"><span>Anulado (NC)</span><span>$${fCLP(stats.nula*(ufV||1))}</span></div>
            <div class="crow"><span>% Cobrado</span><span>${(stats.cobrado+stats.pendiente)>0?(stats.cobrado/(stats.cobrado+stats.pendiente)*100).toFixed(1):0}%</span></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Proyectos Activos</div></div>
        <div style="padding:0">
          ${db.proyectos.slice(0,8).map(p=>{
            const cl=db.clientes.find(c=>c.id===p.cliente_id)||{};
            const eps=db.eps.filter(e=>e.proy_id===p.id&&e.estado!=='nula');
            const contrato=parseFloat(p.monto)||0;
            const emitido=eps.reduce((s,e)=>s+(parseFloat(e.neto_ret)||0),0);
            const pct=contrato>0?Math.min(100,emitido/contrato*100):0;
            return`<div style="padding:10px 16px;border-bottom:1px solid var(--paper3)">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <div style="font-size:12.5px;font-weight:500">${p.nombre}</div>
                <div style="font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--ink3)">${pct.toFixed(0)}%</div>
              </div>
              <div style="font-size:11px;color:var(--ink3);margin-bottom:4px">${cl.nombre||'—'}</div>
              <div class="prog-wrap"><div class="prog-fill" style="width:${pct.toFixed(1)}%"></div></div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

// ════════════════════════════════
//  ELIMINAR EP / NC
// ════════════════════════════════
function confirmarEliminarEP(id){
  const ep=db.eps.find(e=>e.id===id);
  if(!ep)return;
  // Open the custom delete modal
  window._elimEPId=id;
  const p=db.proyectos.find(x=>x.id===ep.proy_id)||{};
  const mon=ep.moneda||p.moneda||'UF';
  document.getElementById('elim-ep-info').innerHTML=
    `<b>EP ${ep.numero||'—'}</b> · Factura N° ${ep.n_factura||'—'} · ${fMonto(ep.total,mon)}`;
  // Pre-fill NC fields with EP values
  document.getElementById('elim-nc-num').value='';
  document.getElementById('elim-nc-fecha').value=today();
  document.getElementById('elim-nc-monto').value=ep.neto_ret||ep.total||'';
  document.getElementById('elim-nc-motivo').value='';
  // Show sin-NC panel by default
  document.getElementById('elim-panel-nc').style.display='none';
  document.getElementById('elim-radio-sin').checked=true;
  const el=document.getElementById('ov-elim-ep');el.style.display='flex';
}
function closeElimEPModal(){
  document.getElementById('ov-elim-ep').style.display='none';
  window._elimEPId=null;
}
function onElimRadioChange(){
  const conNC=document.getElementById('elim-radio-con').checked;
  document.getElementById('elim-panel-nc').style.display=conNC?'block':'none';
}
function ejecutarEliminarEP(){
  const id=window._elimEPId;
  const ep=db.eps.find(e=>e.id===id);
  if(!ep)return;
  const conNC=document.getElementById('elim-radio-con').checked;
  if(conNC){
    // Keep EP as 'nula' and create NC with same values (negative display)
    const num=document.getElementById('elim-nc-num').value.trim();
    if(!num){alert('El número de NC es obligatorio.');return;}
    const monto=parseFloat(document.getElementById('elim-nc-monto').value)||0;
    const fecha=document.getElementById('elim-nc-fecha').value;
    const motivo=document.getElementById('elim-nc-motivo').value.trim()||'Anulación EP '+ep.numero;
    // Remove any existing NC for this EP first
    db.ncs=db.ncs.filter(n=>n.ep_id!==id);
    const nc_iva=monto*0.19;
    const nc_total=monto+nc_iva;
    const nc_total_clp=Math.round(nc_total*(ep.moneda==='UF'?(ep.uf_val||db.uf_value||1):1));
    db.ncs.push({id:uid(),ep_id:id,proy_id:ep.proy_id,numero:num,n_factura:num,fecha,monto,iva:nc_iva,total:nc_total,total_clp:nc_total_clp,motivo,moneda:ep.moneda||'UF'});
    ep.estado='nula';
    mostrarToast('EP anulado con NC — ambos quedan en el registro','ok');
  } else {
    // Delete EP entirely
    db.eps=db.eps.filter(e=>e.id!==id);
    db.ncs=db.ncs.filter(n=>n.ep_id!==id);
    mostrarToast('EP eliminado del registro','ok');
  }
  closeElimEPModal();
  save();
  renderProyectoDetalle();
  renderCobrosStats();
  renderCobros();
  renderReportesIfActive();
}

function eliminarEP(id){
  const ep=db.eps.find(e=>e.id===id);
  if(!ep)return;
  if(ep.estado!=='nula'){
    alert('Solo se pueden eliminar facturas que hayan sido anuladas previamente con una Nota de Crédito.');
    return;
  }
  // Check if it has an associated NC — warn user
  const nc=db.ncs.find(n=>n.ep_id===id);
  const msg=nc
    ?`¿Eliminar la factura N° ${ep.n_factura||ep.numero||'—'} del registro?

Nota: la Nota de Crédito asociada (NC ${nc.numero||'—'}) quedará huérfana. Se recomienda eliminarla también.`
    :`¿Eliminar la factura N° ${ep.n_factura||ep.numero||'—'} del registro? Esta acción no se puede deshacer.`;
  openConfirm(
    'Eliminar Factura Anulada',
    msg,
    ()=>{
      db.eps=db.eps.filter(e=>e.id!==id);
      // also remove any NC associated with this EP
      db.ncs=db.ncs.filter(n=>n.ep_id!==id);
      save();
      renderProyectoDetalle();
      renderCobrosStats();
      renderCobros();
      renderReportesIfActive();
    }
  );
}

function eliminarNC(id){
  const nc=db.ncs.find(n=>n.id===id);
  if(!nc)return;
  const ep=db.eps.find(e=>e.id===nc.ep_id);
  openConfirm(
    'Eliminar Nota de Crédito',
    `¿Eliminar la NC N° ${nc.numero||'—'} del registro?

Si eliminas la NC, la factura asociada (${ep?'N° '+(ep.n_factura||ep.numero||'—'):'—'}) volverá al estado "Pendiente" automáticamente.`,
    ()=>{
      db.ncs=db.ncs.filter(n=>n.id!==id);
      // Restore EP to pendiente if it exists
      if(ep){ep.estado='pendiente';}
      save();
      renderProyectoDetalle();
      renderCobrosStats();
      renderCobros();
      renderReportesIfActive();
    }
  );
}

// ════════════════════════════════
//  CONFIRM / HELPERS
// ════════════════════════════════
function openConfirm(title,msg,cb){
  document.getElementById('cf-title').textContent=title;
  document.getElementById('cf-msg').textContent=msg;
  document.getElementById('cf-btn').onclick=()=>{cb();closeConfirm();};
  document.getElementById('ov-confirm').classList.add('open');
}
function closeConfirm(){document.getElementById('ov-confirm').classList.remove('open');}
function ovClose(e,id){if(e.target.id===id)document.getElementById(id).classList.remove('open');}
function exportJSON(){
  const b=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);
  a.download='jasv_cobros_'+today()+'.json';a.click();URL.revokeObjectURL(a.href);
}

// ════════════════════════════════
//  REFRESH HELPERS
// ════════════════════════════════
function renderReportesIfActive(){
  const rp=document.getElementById('p-reportes');
  if(rp&&rp.classList.contains('active'))renderReportes();
}
function renderProyectosIfActive(){
  const pp=document.getElementById('p-proyectos');
  if(pp&&pp.classList.contains('active'))renderProyectos();
  // also refresh detalle if open
  const pd=document.getElementById('p-proy-detalle');
  if(pd&&pd.classList.contains('active'))renderProyectoDetalle();
}
function refreshAll(){
  renderProyectos();
  renderClientes();
  renderCobrosStats();
  renderCobros();
}

// ════════════════════════════════
//  EXPORTAR EXCEL
// ════════════════════════════════
function exportarExcel(){
  const p=db.proyectos.find(x=>x.id===currentProyId);
  if(!p){alert('No hay proyecto activo.');return;}
  const cl=db.clientes.find(c=>c.id===p.cliente_id)||{};
  const mon=p.moneda||'UF';
  const eps=db.eps.filter(e=>e.proy_id===currentProyId);
  const epsValidos=eps.filter(e=>e.estado!=='nula');
  const ncs=db.ncs.filter(n=>eps.some(e=>e.id===n.ep_id));
  const ocs=p.ocs||[];
  const ufV=db.uf_value||0;
  const valorCobro=(ep)=>(parseFloat(ep.neto_ret)||0);

  const WB=XLSX.utils.book_new();

  // ── HOJA 1: ESTADOS DE PAGO ──────────────────────────────────────
  const epHeaders=['Item','N° EP','N° Factura','Fecha Emisión','Glosa / Detalle',
    `Monto Neto (${mon})`,`Retención (${mon})`,`Neto c/Ret (${mon})`,
    `IVA (${mon})`,`Total (${mon})`,'UF Día','Total ($)','Estado','Fecha Pago'];

  const epRows=[];
  let item=0;
  eps.forEach(ep=>{
    item++;
    const nc=ncs.find(n=>n.ep_id===ep.id);
    epRows.push([
      item, ep.numero||'', ep.n_factura||'', ep.fecha_emision||'', ep.glosa||'',
      parseFloat(ep.neto)||0, parseFloat(ep.ret_uf)||0,
      parseFloat(ep.neto_ret)||0, parseFloat(ep.iva_uf)||0,
      parseFloat(ep.total)||0, Math.round(parseFloat(ep.uf_val||0)*100)/100,
      parseFloat(ep.total_clp)||0,
      ep.estado==='nula'?'Anulada':ep.estado==='pagado'?'Pagado':ep.estado==='parcial'?'Parcial':'Pendiente',
      ep.fecha_pago||''
    ]);
    if(nc){
      item++;
      epRows.push([
        item, 'NC '+nc.numero, nc.numero||'', nc.fecha||'', nc.motivo||'Nota de Crédito',
        -parseFloat(nc.monto)||0, 0, -parseFloat(nc.monto)||0, 0,
        -parseFloat(nc.monto)||0, 0,
        -Math.round((parseFloat(nc.monto)||0)*(mon==='UF'?ufV:1)),
        'Nota Crédito', ''
      ]);
    }
  });

  // Totals row
  const totalNeto=epsValidos.reduce((s,e)=>s+(parseFloat(e.neto)||0),0);
  const totalRet=epsValidos.reduce((s,e)=>s+(parseFloat(e.ret_uf)||0),0);
  const totalNetoRet=epsValidos.reduce((s,e)=>s+(parseFloat(e.neto_ret)||0),0);
  const totalIVA=epsValidos.reduce((s,e)=>s+(parseFloat(e.iva_uf)||0),0);
  const totalTotal=epsValidos.reduce((s,e)=>s+(parseFloat(e.total)||0),0);
  const totalCLP=epsValidos.reduce((s,e)=>s+(parseFloat(e.total_clp)||0),0);
  const cobrado=epsValidos.filter(e=>e.estado==='pagado').reduce((s,e)=>s+valorCobro(e),0);
  const porCobrar=epsValidos.filter(e=>e.estado!=='pagado').reduce((s,e)=>s+valorCobro(e),0);

  epRows.push(['','','','','TOTALES',totalNeto,totalRet,totalNetoRet,totalIVA,totalTotal,'',totalCLP,'','']);
  epRows.push(['','','','','Cobrado (neto)',cobrado,'','','','','','','','']);
  epRows.push(['','','','','Por Cobrar (neto + IVA al facturar)',porCobrar,'','','','','','','','']);

  const wsEP=XLSX.utils.aoa_to_sheet([epHeaders,...epRows]);

  // Column widths
  wsEP['!cols']=[{wch:6},{wch:10},{wch:12},{wch:14},{wch:40},
    {wch:14},{wch:14},{wch:14},{wch:12},{wch:14},{wch:12},{wch:16},{wch:12},{wch:14}];
  XLSX.utils.book_append_sheet(WB,wsEP,'Estados de Pago');

  // ── HOJA 2: CONTROL DE SALDOS ────────────────────────────────────
  const contrato=parseFloat(p.monto)||0;
  const totalOC=ocs.reduce((s,o)=>s+(parseFloat(o.monto)||0),0);
  const saldoContrato=contrato-totalNetoRet;
  const saldoOCvsContrato=contrato-totalOC;
  const retContrato=contrato*(parseFloat(p.ret)||0)/100;

  const saldosData=[
    ['CONTROL DE SALDOS — '+p.nombre,''],
    ['Mandante',cl.nombre||'—'],
    ['Moneda',mon],
    ['IVA','19%'],
    ['',''],
    ['RESUMEN CONTRATO',''],
    ['Monto Contrato Estimado',contrato],
    ['Total Emitido (neto c/ret.)',totalNetoRet],
    ['Retención Acumulada',totalRet],
    ['Cobrado (neto)',cobrado],
    ['Por Cobrar (neto)',porCobrar],
    ['Saldo Por Emitir',saldoContrato],
    ['',''],
    ['ÓRDENES DE COMPRA vs CONTRATO',''],
    ['Total OC emitidas',totalOC],
    ['OC faltante / exceso',saldoOCvsContrato],
    ...(mon==='UF'&&ufV?[['OC faltante en $ (UF hoy '+fUFVal(ufV)+')',saldoOCvsContrato*ufV]]:[[],[]]),
    ['',''],
    ['RETENCIONES',''],
    ['Retención contrato ('+p.ret+'%)',retContrato],
    ['Retención acumulada en EPs',totalRet],
  ];

  const wsSaldos=XLSX.utils.aoa_to_sheet(saldosData);
  wsSaldos['!cols']=[{wch:38},{wch:20}];
  XLSX.utils.book_append_sheet(WB,wsSaldos,'Control de Saldos');

  // ── HOJA 3: ÓRDENES DE COMPRA ─────────────────────────────────────
  const ocHeaders=['N° OC','Fecha','Descripción',`Monto OC (${mon})`,`Cargado (${mon})`,`Saldo (${mon})`];
  const ocRows=ocs.map(oc=>{
    const cargado=epsValidos.filter(e=>e.oc_id===oc.id).reduce((s,e)=>s+(parseFloat(e.neto_ret)||0),0);
    const saldo=Math.max(0,(parseFloat(oc.monto)||0)-cargado);
    return[oc.num||'',oc.fecha||'',oc.desc||'',parseFloat(oc.monto)||0,cargado,saldo];
  });
  ocRows.push(['','','TOTAL',totalOC,'','']);

  const wsOC=XLSX.utils.aoa_to_sheet([ocHeaders,...ocRows]);
  wsOC['!cols']=[{wch:18},{wch:14},{wch:30},{wch:16},{wch:16},{wch:16}];
  XLSX.utils.book_append_sheet(WB,wsOC,'Órdenes de Compra');

  // ── HOJA 4: DETALLE ESTIMADO ──────────────────────────────────────
  if(p.lineas&&p.lineas.length>0){
    const linHeaders=['Descripción',`Monto (${mon})`];
    const linRows=p.lineas.map(l=>[l.desc||'',parseFloat(l.monto)||0]);
    linRows.push(['TOTAL CONTRATO ESTIMADO',contrato]);
    const wsLin=XLSX.utils.aoa_to_sheet([linHeaders,...linRows]);
    wsLin['!cols']=[{wch:40},{wch:18}];
    XLSX.utils.book_append_sheet(WB,wsLin,'Facturación Estimada');
  }

  // ── DESCARGAR ─────────────────────────────────────────────────────
  const fname=`${p.nombre.replace(/[^a-zA-Z0-9À-ɏ ]/g,'_')}_${today()}.xlsx`;
  XLSX.writeFile(WB,fname);
}

// ════════════════════════════════
//  EDITAR PROYECTO (desde detalle)
// ════════════════════════════════
function editarProyecto(){
  if(currentProyId) openProyModal(currentProyId);
}

// ════════════════════════════════
//  ALERTA SALDO
// ════════════════════════════════
function showAlertaSaldo(title, bodyHtml){
  document.getElementById('alerta-saldo-title').textContent=title;
  document.getElementById('alerta-saldo-body').innerHTML=bodyHtml;
  document.getElementById('ov-alerta-saldo').classList.add('open');
}

// ════════════════════════════════
//  INIT
// ════════════════════════════════
async function init(){
  await fetchUF();
  renderProyectos();
}
init();
