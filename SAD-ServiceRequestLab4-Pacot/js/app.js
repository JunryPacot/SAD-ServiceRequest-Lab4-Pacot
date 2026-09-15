let currentUser = null
let currentProfile = null
let equipment = []
let borrowings = []
let maintenance = []

const $ = id => document.getElementById(id)

document.addEventListener('DOMContentLoaded', initialize)

async function initialize() {
  const { data: { session } } = await supabaseClient.auth.getSession()
  if (!session) return location.href = 'login.html'
  currentUser = session.user
  const { data: profile, error } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single()
  if (error || !profile) { alert('Your account has no profile. Ask the administrator to configure your role.'); await supabaseClient.auth.signOut(); return location.href='login.html' }
  currentProfile = profile
  $('userName').textContent = profile.full_name || currentUser.email
  $('roleBadge').textContent = profile.role.toUpperCase()
  $('currentUserInfo').textContent = `${profile.full_name} (${currentUser.email}) - ${profile.role}`
  applyRoleAccess()
  setupEvents()
  await loadAll()
}

function applyRoleAccess() {
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = currentProfile.role === 'admin' ? '' : 'none')
  document.querySelectorAll('.requester-staff').forEach(el => el.style.display = ['admin','staff','requester'].includes(currentProfile.role) ? '' : 'none')
}

function setupEvents() {
  $('logoutBtn').onclick = logout
  document.querySelectorAll('.nav-btn').forEach(btn => btn.onclick = () => showSection(btn.dataset.section))
  $('addEquipmentBtn').onclick = () => $('equipmentForm').classList.toggle('hidden')
  $('cancelEquipment').onclick = () => $('equipmentForm').classList.add('hidden')
  $('equipmentAddForm').onsubmit = addEquipment
  $('newBorrowBtn').onclick = () => { fillEquipmentSelect('borrowEquipment', true); $('borrowerName').value = currentProfile.full_name; $('borrowForm').classList.remove('hidden') }
  $('cancelBorrow').onclick = () => $('borrowForm').classList.add('hidden')
  $('borrowAddForm').onsubmit = addBorrowing
  $('borrowSearch').oninput = renderBorrowings
  $('borrowStatus').onchange = renderBorrowings
  $('newMaintenanceBtn').onclick = () => { fillEquipmentSelect('maintenanceEquipment', false); $('maintenanceForm').classList.remove('hidden') }
  $('maintenanceAddForm').onsubmit = addMaintenance
  $('damageCheckbox').onchange = (e) => $('damageReportContainer').classList.toggle('show', e.target.checked)
  $('cancelReturn').onclick = () => $('returnModal').classList.add('hidden')
  $('returnForm').onsubmit = processReturn
}

function showSection(id) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'))
  $(id).classList.remove('hidden')
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.section === id))
  if (id === 'users' && currentProfile.role === 'admin') loadUsers()
  if (id === 'audit' && currentProfile.role === 'admin') loadAudit()
}

async function loadAll() {
  await Promise.all([loadEquipment(), loadBorrowings(), loadMaintenance()])
  updateDashboard()
}

async function loadEquipment() {
  const { data, error } = await supabaseClient.from('equipment').select('*').order('id')
  if (error) return toast(error.message,'error')
  equipment = data || []; renderEquipment(); fillEquipmentSelect('borrowEquipment', true); fillEquipmentSelect('maintenanceEquipment', false)
}

function renderEquipment() {
  $('equipmentBody').innerHTML = equipment.map(e => `<tr><td>${esc(e.asset_code)}</td><td><strong>${esc(e.name)}</strong></td><td>${esc(e.category)}</td><td><span class="badge ${e.status.toLowerCase()}">${e.status}</span></td><td>${currentProfile.role==='admin' ? `<button class="btn-small delete" onclick="deleteEquipment(${e.id})">Delete</button>` : '-'}</td></tr>`).join('') || '<tr><td colspan="5">No equipment found.</td></tr>'
}

function fillEquipmentSelect(id, availableOnly) {
  const list = availableOnly ? equipment.filter(e => e.status === 'Available') : equipment
  $(id).innerHTML = '<option value="">Select equipment</option>' + list.map(e => `<option value="${e.id}">${esc(e.asset_code)} - ${esc(e.name)} (${e.status})</option>`).join('')
}

async function addEquipment(e) {
  e.preventDefault()
  const payload = { asset_code:$('assetCode').value.trim(), name:$('assetName').value.trim(), category:$('assetCategory').value.trim(), description:$('assetDescription').value.trim(), status:$('assetStatus').value }
  const { data, error } = await supabaseClient.from('equipment').insert(payload).select().single()
  if (error) return toast(error.message,'error')
  await audit('CREATED','Equipment',data.id,`Created equipment ${payload.asset_code}`)
  e.target.reset(); $('equipmentForm').classList.add('hidden'); toast('Equipment added.'); await loadEquipment(); updateDashboard()
}

async function deleteEquipment(id) {
  if (currentProfile.role !== 'admin') return toast('Access denied.','error')
  const e = equipment.find(x=>x.id===id)
  if (!e || e.status !== 'Available') return toast('Only available equipment can be deleted.','error')
  if (!confirm(`Delete ${e.asset_code}?`)) return
  const { error } = await supabaseClient.from('equipment').delete().eq('id',id)
  if (error) return toast(error.message,'error')
  await audit('DELETED','Equipment',id,`Deleted equipment ${e.asset_code}`); toast('Equipment deleted.'); await loadEquipment(); updateDashboard()
}

async function addBorrowing(e) {
  e.preventDefault()
  const equipmentId = Number($('borrowEquipment').value)
  const selected = equipment.find(x=>x.id===equipmentId)
  const purpose = $('borrowPurpose').value.trim()
  if (!selected || selected.status !== 'Available') return toast('Only available equipment may be requested.','error')
  if (purpose.length < 10) return toast('Please provide a sufficient purpose.','error')
  const payload = { equipment_id:equipmentId, requester_id:currentUser.id, requester_name:$('borrowerName').value.trim(), purpose, expected_return:$('expectedReturn').value || null, status:'Pending' }
  const { data, error } = await supabaseClient.from('borrowing_requests').insert(payload).select().single()
  if (error) return toast(error.message,'error')
  await audit('SUBMITTED','Borrowing',data.id,`Submitted borrowing request for ${selected.asset_code}`)
  e.target.reset(); $('borrowForm').classList.add('hidden'); toast('Borrowing request submitted as Pending.'); await loadBorrowings(); updateDashboard()
}

async function loadBorrowings() {
  const { data, error } = await supabaseClient.from('borrowing_requests').select('*, equipment(asset_code,name)').order('created_at',{ascending:false})
  if (error) return toast(error.message,'error')
  borrowings = data || []; renderBorrowings()
}

function renderBorrowings() {
  const search = $('borrowSearch').value.toLowerCase().trim(), status = $('borrowStatus').value
  const rows = borrowings.filter(r => {
    const matchesStatus = status==='All'||r.status===status
    const matchesSearch = (`${r.requester_name} ${r.purpose} ${r.equipment?.asset_code||''} ${r.equipment?.name||''}`).toLowerCase().includes(search)
    return matchesStatus && matchesSearch
  })
  
  // Check for overdue items
  rows.forEach(r => {
    if (r.status==='Released' && r.expected_return && new Date(r.expected_return) < new Date()) {
      supabaseClient.from('borrowing_requests').update({status:'Overdue'}).eq('id',r.id).then(() => {
        audit('OVERDUE','Borrowing',r.id,`Marked ${r.equipment?.asset_code||''} as overdue`)
      })
    }
  })
  
  $('borrowingBody').innerHTML = rows.map(r => `<tr><td>#${r.id}</td><td>${esc(r.equipment?.asset_code||'')}</td><td>${esc(r.requester_name)}</td><td>${esc(r.purpose)}</td><td><span class="badge status-${r.status.toLowerCase()}">${r.status}</span></td><td>${borrowActions(r)}</td></tr>`).join('') || '<tr><td colspan="6">No borrowing requests found.</td></tr>'
}

let currentReturnId = null

function borrowActions(r) {
  if (currentProfile.role === 'admin') {
    if (r.status==='Pending') return `<button class="btn-small" onclick="approveBorrow(${r.id})">Approve</button> <button class="btn-small delete" onclick="rejectBorrow(${r.id})">Reject</button>`
    if (r.status==='Approved') return `<button class="btn-small" onclick="releaseBorrow(${r.id})">Release</button>`
    if (r.status==='Released') return `<button class="btn-small" onclick="openReturnModal(${r.id})">Process Return</button>`
  }
  if (currentProfile.role==='staff' && r.status==='Approved') return `<button class="btn-small" onclick="releaseBorrow(${r.id})">Release</button>`
  if (currentProfile.role==='staff' && r.status==='Released') return `<button class="btn-small" onclick="openReturnModal(${r.id})">Process Return</button>`
  return '-'
}

async function updateBorrow(id, status, extra={}) {
  const r = borrowings.find(x=>x.id===id)
  if (!r) return
  if (['Approved','Rejected'].includes(status) && currentProfile.role !== 'admin') return toast('Only Administrator may approve or reject requests.','error')
  if (status==='Released' && r.status!=='Approved') return toast('Only Approved requests may be released.','error')
  if (['Approved','Rejected'].includes(status) && r.requester_id===currentUser.id && currentProfile.role!=='admin') return toast('You cannot approve your own request.','error')
  const payload = {status,...extra}
  if (status==='Approved') payload.approved_by=currentUser.id
  if (status==='Released') payload.released_at=new Date().toISOString()
  const { error } = await supabaseClient.from('borrowing_requests').update(payload).eq('id',id)
  if (error) return toast(error.message,'error')
  const eq = r.equipment
  if (status==='Released') await supabaseClient.from('equipment').update({status:'Borrowed'}).eq('id',r.equipment_id)
  await audit(status.toUpperCase(),'Borrowing',id,`${status} borrowing request for ${eq?.asset_code||''}`)
  toast(`Request ${status.toLowerCase()}.`); await loadAll(); if(currentProfile.role==='admin') loadAudit()
}
window.approveBorrow=id=>updateBorrow(id,'Approved')
window.rejectBorrow=id=>updateBorrow(id,'Rejected')
window.releaseBorrow=id=>updateBorrow(id,'Released')
window.openReturnModal=id=>{currentReturnId=id; $('damageCheckbox').checked=false; $('damageReport').value=''; $('damageReportContainer').classList.remove('show'); $('returnModal').classList.remove('hidden')}

async function processReturn(e) {
  e.preventDefault()
  const r = borrowings.find(x=>x.id===currentReturnId)
  if (!r || r.status!=='Released') return toast('Only Released requests may be returned.','error')
  if (r.actual_return) return toast('This transaction was already returned.','error')
  
  const isDamaged = $('damageCheckbox').checked
  const damageReport = isDamaged ? $('damageReport').value.trim() : null
  if (isDamaged && !damageReport) return toast('Please provide a damage report.','error')
  
  const equipmentStatus = isDamaged ? 'Maintenance' : 'Available'
  const payload = {
    status: 'Closed',
    returned_at: new Date().toISOString(),
    actual_return: new Date().toISOString().slice(0,10),
    damage_report: damageReport
  }
  
  const { error } = await supabaseClient.from('borrowing_requests').update(payload).eq('id',currentReturnId)
  if (error) return toast(error.message,'error')
  
  await supabaseClient.from('equipment').update({status: equipmentStatus}).eq('id',r.equipment_id)
  await audit('RETURNED','Borrowing',currentReturnId,`Returned ${r.equipment?.asset_code||''} - ${isDamaged ? 'Damaged, sent to Maintenance' : 'Available'}`)
  
  $('returnModal').classList.add('hidden')
  toast(`Equipment returned successfully. Status: ${equipmentStatus}`)
  await loadAll()
  if(currentProfile.role==='admin') loadAudit()
}

async function addMaintenance(e) {
  e.preventDefault(); const equipmentId=Number($('maintenanceEquipment').value), description=$('maintenanceDescription').value.trim()
  if (!description || description.length<10) return toast('Please describe the maintenance problem.','error')
  const {data,error}=await supabaseClient.from('maintenance_requests').insert({equipment_id:equipmentId,submitted_by:currentUser.id,description}).select().single()
  if(error) return toast(error.message,'error')
  await supabaseClient.from('equipment').update({status:'Maintenance'}).eq('id',equipmentId)
  await audit('SUBMITTED','Maintenance',data.id,`Submitted maintenance request for equipment #${equipmentId}`)
  e.target.reset(); $('maintenanceForm').classList.add('hidden'); toast('Maintenance request submitted.'); await loadAll()
}

async function loadMaintenance() {
  const {data,error}=await supabaseClient.from('maintenance_requests').select('*, equipment(asset_code,name)').order('created_at',{ascending:false})
  if(error) return toast(error.message,'error'); maintenance=data||[]; renderMaintenance()
}
function renderMaintenance(){ $('maintenanceBody').innerHTML=maintenance.map(m=>`<tr><td>#${m.id}</td><td>${esc(m.equipment?.asset_code||'')}</td><td>${esc(m.description)}</td><td>${m.status}</td><td>${['staff','admin'].includes(currentProfile.role)&&m.status!=='Completed'?`<button class="btn-small" onclick="completeMaintenance(${m.id})">Complete</button>`:'-'}</td></tr>`).join('')||'<tr><td colspan="5">No maintenance requests found.</td></tr>' }
window.completeMaintenance=async id=>{const m=maintenance.find(x=>x.id===id); if(!m)return; const {error}=await supabaseClient.from('maintenance_requests').update({status:'Completed'}).eq('id',id); if(error)return toast(error.message,'error'); await supabaseClient.from('equipment').update({status:'Available'}).eq('id',m.equipment_id); await audit('COMPLETED','Maintenance',id,`Completed maintenance for ${m.equipment?.asset_code||''}`); toast('Maintenance completed.'); await loadAll()}

async function loadUsers(){const {data,error}=await supabaseClient.from('profiles').select('id,full_name,role').order('full_name');if(error)return toast(error.message,'error');const ids=data.map(x=>x.id);let emails={};for(const id of ids){/* email is not exposed by profiles */} $('usersBody').innerHTML=data.map(u=>`<tr><td>${esc(u.full_name)}</td><td>${u.id}</td><td><select onchange="changeRole('${u.id}',this.value)"><option ${u.role==='admin'?'selected':''}>admin</option><option ${u.role==='staff'?'selected':''}>staff</option><option ${u.role==='requester'?'selected':''}>requester</option></select></td><td>-</td></tr>`).join('')}
window.changeRole=async(id,role)=>{if(!['admin','staff','requester'].includes(role))return;const {error}=await supabaseClient.from('profiles').update({role}).eq('id',id);if(error)return toast(error.message,'error');await audit('ROLE_CHANGED','Users',null,`Changed user ${id} role to ${role}`);toast('Role updated.');}

async function loadAudit(){const {data,error}=await supabaseClient.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(100);if(error)return toast(error.message,'error');const {data:profiles}=await supabaseClient.from('profiles').select('id,full_name');const userMap={};(profiles||[]).forEach(p=>userMap[p.id]=p.full_name);$('auditBody').innerHTML=(data||[]).map(a=>`<tr><td>${new Date(a.created_at).toLocaleString()}</td><td>${a.user_id===currentUser.id?'You':userMap[a.user_id]||a.user_id}</td><td>${esc(a.action)}</td><td>${esc(a.module)}</td><td>${a.record_id??'-'}</td><td>${esc(a.description)}</td></tr>`).join('')||'<tr><td colspan="6">No audit logs.</td></tr>'}

async function audit(action,module,recordId,description){const {error}=await supabaseClient.from('audit_logs').insert({user_id:currentUser.id,action,module,record_id:recordId,description});if(error)console.error('Audit log:',error.message)}
function updateDashboard(){ $('equipmentCount').textContent=equipment.length; $('availableCount').textContent=equipment.filter(e=>e.status==='Available').length; $('pendingCount').textContent=borrowings.filter(r=>r.status==='Pending').length; $('borrowedCount').textContent=equipment.filter(e=>e.status==='Borrowed').length }
async function logout(){await supabaseClient.auth.signOut();location.href='login.html'}
function toast(msg,type='success'){const t=$('toast');t.textContent=msg;t.className=`toast show ${type}`;setTimeout(()=>t.className='toast',3000)}
function esc(v){const d=document.createElement('div');d.textContent=v??'';return d.innerHTML}
