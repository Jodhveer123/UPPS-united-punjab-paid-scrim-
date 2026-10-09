const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));
const fmt = (v) => v ? new Date(v).toLocaleString() : "—";

let state = { admin:null, players:[], tournaments:[], registrations:[], matches:[], reviews:[], staff:[], audit:[] };

async function api(url, options={}) {
  const r = await fetch(url, { credentials:"include", ...options, headers:{"Content-Type":"application/json", ...(options.headers||{})} });
  const d = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
  return d;
}
function msg(text, error=false) { const el=$("#globalMessage"); el.textContent=text||""; el.className=`admin-message ${error?"error":"success"}`; if(text) setTimeout(()=>{el.textContent="";el.className="admin-message"},3500); }
function pill(s){ const c=String(s||"").toLowerCase().replace(/\s+/g,"-"); return `<span class="status-pill ${esc(c)}">${esc(s||"—")}</span>`; }

async function boot(){
  try { const d=await api("/api/admin/me"); state.admin=d.admin; showApp(); await loadAll(); }
  catch { showLogin(); }
}
function showLogin(){ $("#loginView").classList.remove("hidden"); $("#adminApp").classList.add("hidden"); }
function showApp(){ $("#loginView").classList.add("hidden"); $("#adminApp").classList.remove("hidden"); $("#adminIdentity").textContent=`${state.admin.username} · ${state.admin.role}`; }

async function loadAll(){ await Promise.all([loadPlayers(),loadTournaments(),loadRegistrations(),loadMatches(),loadReviews(),loadStaff(),loadAudit()]); renderDashboard(); renderAll(); }
async function loadPlayers(){ const d=await api("/api/admin/players"); state.players=d.players||[]; }
async function loadTournaments(){ const d=await api("/api/admin/tournaments"); state.tournaments=d.tournaments||[]; }
async function loadRegistrations(){ const d=await api("/api/admin/registrations"); state.registrations=d.registrations||[]; }
async function loadMatches(){ const d=await api("/api/admin/matches"); state.matches=d.matches||[]; }
async function loadReviews(){ try{const d=await api("/api/admin/reviews");state.reviews=d.reviews||[]}catch{state.reviews=[];} }
async function loadStaff(){ try{const d=await api("/api/admin/staff");state.staff=d.staff||[]}catch{state.staff=[];} }
async function loadAudit(){ const d=await api("/api/admin/audit"); state.audit=d.logs||[]; }

function renderDashboard(){
  $("#statPlayers").textContent=state.players.length;
  $("#statTournaments").textContent=state.tournaments.length;
  $("#statPending").textContent=state.registrations.filter(x=>x.status==="PENDING").length;
  $("#statVerified").textContent=state.registrations.filter(x=>x.status==="VERIFIED").length;
  $("#statLive").textContent=state.tournaments.filter(x=>x.status==="LIVE").length;
  $("#statReviews").textContent=state.reviews.filter(x=>x.status==="PENDING").length;
  $("#dashboardRegistrations").innerHTML=state.registrations.slice(0,6).map(r=>`<div class="list-item"><b>${esc(r.display_name||r.username)}</b><span>${esc(r.title)} · ${pill(r.status)}</span></div>`).join("")||"<div class='empty'>No registrations yet.</div>";
  $("#dashboardPlayers").innerHTML=state.players.slice(0,6).map(p=>`<div class="list-item"><b>${esc(p.display_name||p.username)}</b><span>${esc(p.username)} · ${pill(p.status)}</span></div>`).join("")||"<div class='empty'>No players yet.</div>";
}
function renderPlayers(){
  const q=$("#playerSearch").value.trim().toLowerCase();
  const rows=state.players.filter(p=>[p.username,p.display_name,p.free_fire_uid,p.email].some(v=>String(v||"").toLowerCase().includes(q)));
  $("#playersTable").innerHTML=rows.map(p=>`<tr><td><b>${esc(p.display_name||"—")}</b><small>${esc(p.public_id)}</small></td><td>${esc(p.username)}</td><td>${esc(p.free_fire_uid||"—")}</td><td>${esc(p.email||p.phone||"—")}</td><td>${pill(p.status)}</td><td>${fmt(p.created_at)}</td><td><select class="player-status" data-id="${p.id}"><option ${p.status==="ACTIVE"?"selected":""}>ACTIVE</option><option ${p.status==="SUSPENDED"?"selected":""}>SUSPENDED</option><option ${p.status==="BANNED"?"selected":""}>BANNED</option></select></td></tr>`).join("")||`<tr><td colspan="7" class="empty">No players found.</td></tr>`;
}
function renderTournaments(){
  $("#tournamentsList").innerHTML=state.tournaments.map(t=>`<div class="entity-card"><div><b>${esc(t.title)}</b><small>${esc(t.public_id)} · ${esc(t.mode)} · capacity ${esc(t.capacity)}</small></div><div class="entity-actions"><select class="tournament-status" data-id="${t.id}">${["DRAFT","PUBLISHED","REGISTRATION OPEN","REGISTRATION CLOSED","READY","LIVE","RESULTS PENDING","RESULTS FINAL","COMPLETED","CANCELLED","SUSPENDED"].map(s=>`<option ${t.status===s?"selected":""}>${s}</option>`).join("")}</select>${pill(t.status)}</div></div>`).join("")||"<div class='empty'>No tournaments.</div>";
  $("#matchTournament").innerHTML=state.tournaments.map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join("");
}
function renderRegistrations(){
  const filter=$("#registrationFilter").value; const rows=state.registrations.filter(r=>filter==="ALL"||r.status===filter);
  $("#registrationsTable").innerHTML=rows.map(r=>`<tr><td><b>${esc(r.public_id)}</b><small>${esc(r.team_name||"")}</small></td><td><b>${esc(r.display_name||r.username)}</b><small>${esc(r.free_fire_uid||"")}</small></td><td>${esc(r.title)}</td><td>${esc(r.mode||"—")}</td><td>${pill(r.status)}</td><td>${fmt(r.created_at)}</td><td><select class="registration-status" data-id="${r.id}"><option ${r.status==="PENDING"?"selected":""}>PENDING</option><option ${r.status==="VERIFIED"?"selected":""}>VERIFIED</option><option ${r.status==="REJECTED"?"selected":""}>REJECTED</option><option ${r.status==="WAITLISTED"?"selected":""}>WAITLISTED</option><option ${r.status==="CANCELLED"?"selected":""}>CANCELLED</option></select></td></tr>`).join("")||`<tr><td colspan="7" class="empty">No registrations.</td></tr>`;
}
function localDateTimeValue(v){
  if(!v) return "";
  const d=new Date(v);
  if(Number.isNaN(d.getTime())) return "";
  const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
}
function dateTimeLocalToISO(v){
  if(!v) return null;
  const d=new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function renderMatches(){
  $("#matchesList").innerHTML=state.matches.map(m=>`
    <div class="entity-card room-match-card">
      <div><b>${esc(m.title)} · Match ${esc(m.match_number)}</b><small>${esc(m.public_id)} · ${pill(m.status)} · starts ${fmt(m.start_at)}</small></div>
      <form class="room-credentials-form form-grid" data-id="${m.id}">
        <label>Room ID<input name="roomId" value="${esc(m.room_id||"")}" autocomplete="off"></label>
        <label>Room Password<input name="roomPassword" value="${esc(m.room_password||"")}" autocomplete="off"></label>
        <label>Release Date &amp; Time<input name="roomReleaseAt" type="datetime-local" value="${esc(localDateTimeValue(m.room_release_at))}"><small>Blank means release as soon as published.</small></label>
        <label class="check-label"><input name="roomEnabled" type="checkbox" value="true" ${m.room_enabled?"checked":""}> Publish to approved players</label>
        <button class="btn secondary full" type="submit">Save Room Settings</button>
        <small class="muted">Current status: ${m.room_enabled ? "Published (release time still applies)" : "Hidden from players"}</small>
      </form>
    </div>`).join("")||"<div class='empty'>No matches.</div>";
  $("#resultMatch").innerHTML=state.matches.map(m=>`<option value="${m.id}">${esc(m.title)} · Match ${esc(m.match_number)}</option>`).join("");
}
function playerOptions(){ return state.players.map(p=>`<option value="${p.id}">${esc(p.display_name||p.username)} · ${esc(p.free_fire_uid||p.public_id)}</option>`).join(""); }
function addResultRow(){ const div=document.createElement("div"); div.className="result-row"; div.innerHTML=`<select class="result-player" required><option value="">Player</option>${playerOptions()}</select><input class="result-placement" type="number" min="1" placeholder="Placement" required><input class="result-kills" type="number" min="0" value="0" placeholder="Kills"><input class="result-points" type="number" min="0" value="0" placeholder="Points"><input class="result-notes" placeholder="Notes"><button type="button" class="remove-result">×</button>`; $("#resultRows").appendChild(div); }
function renderReviews(){
  const f=$("#reviewFilter").value; const rows=state.reviews.filter(r=>f==="ALL"||r.status===f);
  $("#reviewsList").innerHTML=rows.map(r=>`<article class="review-card"><div class="review-head"><b>${esc(r.display_name||r.username||"Player")}</b>${pill(r.status)}</div><div class="stars">${"★".repeat(Number(r.rating||0))}${"☆".repeat(5-Number(r.rating||0))}</div><p>${esc(r.review_text||"")}</p><small>${esc(r.title||"")} · ${fmt(r.created_at)}</small><div class="button-row"><button class="btn secondary review-action" data-id="${r.id}" data-status="APPROVED">Approve</button><button class="btn danger review-action" data-id="${r.id}" data-status="REJECTED">Reject</button></div></article>`).join("")||"<div class='empty'>No reviews.</div>";
}
function renderStaff(){ $("#staffList").innerHTML=state.staff.map(s=>`<div class="entity-card"><div><b>${esc(s.username)}</b><small>${fmt(s.created_at)}</small></div><div>${pill(s.role)} <select class="staff-role" data-id="${s.id}"><option ${s.role==="OWNER"?"selected":""}>OWNER</option><option ${s.role==="TOURNAMENT_MANAGER"?"selected":""}>TOURNAMENT_MANAGER</option><option ${s.role==="RESULTS_MANAGER"?"selected":""}>RESULTS_MANAGER</option><option ${s.role==="MODERATOR"?"selected":""}>MODERATOR</option><option ${s.role==="SUPPORT"?"selected":""}>SUPPORT</option></select></div></div>`).join("")||"<div class='empty'>No staff accounts.</div>"; }
function renderAudit(){ $("#auditTable").innerHTML=state.audit.map(a=>`<tr><td>${fmt(a.created_at)}</td><td>${esc(a.actor_type)} #${esc(a.actor_id||"")}</td><td>${esc(a.action)}</td><td>${esc(a.entity_type||"")}</td><td>${esc(a.entity_id||"")}</td><td><code>${esc(JSON.stringify(a.details||{}))}</code></td></tr>`).join("")||`<tr><td colspan="6" class="empty">No audit logs.</td></tr>`; }
function renderAll(){renderPlayers();renderTournaments();renderRegistrations();renderMatches();renderReviews();renderStaff();renderAudit();renderDashboard();}

function switchSection(name){ $$(".admin-section").forEach(x=>x.classList.toggle("active",x.id===`section-${name}`)); $$("#adminNav button").forEach(x=>x.classList.toggle("active",x.dataset.section===name)); $("#sectionTitle").textContent=name.charAt(0).toUpperCase()+name.slice(1); }

$("#adminLoginForm").addEventListener("submit",async e=>{e.preventDefault();$("#loginMessage").textContent="Signing in…";try{const d=await api("/api/admin/login",{method:"POST",body:JSON.stringify({username:$("#adminUsername").value,password:$("#adminPassword").value})});state.admin=d.admin;showApp();await loadAll();}catch(err){$("#loginMessage").textContent=err.message;}});
$("#adminNav").addEventListener("click",e=>{const b=e.target.closest("button[data-section]");if(b)switchSection(b.dataset.section);});
$("#adminLogoutBtn").addEventListener("click",async()=>{await api("/api/admin/logout",{method:"POST"}).catch(()=>{});showLogin();});
$("#playerSearch").addEventListener("input",renderPlayers);
$("#registrationFilter").addEventListener("change",renderRegistrations);
$("#reviewFilter").addEventListener("change",renderReviews);
$("#refreshAudit").addEventListener("click",async()=>{await loadAudit();renderAudit();});

$("#tournamentForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);const b=Object.fromEntries(f.entries());try{await api("/api/admin/tournaments",{method:"POST",body:JSON.stringify({...b,capacity:Number(b.capacity),matchesCount:Number(b.matchesCount||1)})});e.target.reset();msg("Tournament created.");await loadTournaments();renderAll();}catch(err){msg(err.message,true);}});
$("#matchForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);const b=Object.fromEntries(f.entries());b.roomEnabled=f.has("roomEnabled");b.roomReleaseAt=dateTimeLocalToISO(b.roomReleaseAt);b.startAt=dateTimeLocalToISO(b.startAt);try{await api(`/api/admin/tournaments/${b.tournamentId}/matches`,{method:"POST",body:JSON.stringify({...b,matchNumber:Number(b.matchNumber)})});e.target.reset();msg("Match created.");await loadMatches();renderAll();}catch(err){msg(err.message,true);}});
$("#matchesList").addEventListener("submit",async e=>{const form=e.target.closest(".room-credentials-form");if(!form)return;e.preventDefault();const f=new FormData(form);const b=Object.fromEntries(f.entries());b.roomEnabled=f.has("roomEnabled");b.roomReleaseAt=dateTimeLocalToISO(b.roomReleaseAt);try{await api(`/api/admin/matches/${form.dataset.id}/room`,{method:"PATCH",body:JSON.stringify(b)});msg("Room settings saved.");await loadMatches();renderMatches();}catch(err){msg(err.message,true);}});
$("#addResultRow").addEventListener("click",addResultRow); addResultRow();
$("#resultRows").addEventListener("click",e=>{if(e.target.classList.contains("remove-result")){if($("#resultRows").children.length>1)e.target.parentElement.remove();}});
$("#resultForm").addEventListener("submit",async e=>{e.preventDefault();const rows=$$(".result-row").map(r=>({playerId:Number(r.querySelector(".result-player").value),placement:Number(r.querySelector(".result-placement").value),kills:Number(r.querySelector(".result-kills").value||0),points:Number(r.querySelector(".result-points").value||0),notes:r.querySelector(".result-notes").value}));try{await api(`/api/admin/matches/${$("#resultMatch").value}/results`,{method:"POST",body:JSON.stringify({results:rows})});$("#resultMessage").textContent="Results saved.";await loadMatches();renderMatches();}catch(err){$("#resultMessage").textContent=err.message;}});
$("#staffForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);const b=Object.fromEntries(f.entries());try{await api("/api/admin/staff",{method:"POST",body:JSON.stringify(b)});e.target.reset();msg("Staff account created.");await loadStaff();renderStaff();}catch(err){msg(err.message,true);}});

$("#playersTable").addEventListener("change",async e=>{if(!e.target.classList.contains("player-status"))return;try{await api(`/api/admin/players/${e.target.dataset.id}/status`,{method:"PATCH",body:JSON.stringify({status:e.target.value})});await loadPlayers();renderPlayers();msg("Player status updated.");}catch(err){msg(err.message,true);}});
$("#tournamentsList").addEventListener("change",async e=>{if(!e.target.classList.contains("tournament-status"))return;try{await api(`/api/admin/tournaments/${e.target.dataset.id}/status`,{method:"PATCH",body:JSON.stringify({status:e.target.value})});await loadTournaments();renderTournaments();msg("Tournament status updated.");}catch(err){msg(err.message,true);}});
$("#registrationsTable").addEventListener("change",async e=>{if(!e.target.classList.contains("registration-status"))return;try{await api(`/api/admin/registrations/${e.target.dataset.id}/status`,{method:"PATCH",body:JSON.stringify({status:e.target.value})});await loadRegistrations();renderRegistrations();renderDashboard();msg("Registration status updated.");}catch(err){msg(err.message,true);}});
$("#reviewsList").addEventListener("click",async e=>{const b=e.target.closest(".review-action");if(!b)return;try{await api(`/api/admin/reviews/${b.dataset.id}/status`,{method:"PATCH",body:JSON.stringify({status:b.dataset.status})});await loadReviews();renderReviews();renderDashboard();msg("Review status updated.");}catch(err){msg(err.message,true);}});
$("#staffList").addEventListener("change",async e=>{if(!e.target.classList.contains("staff-role"))return;try{await api(`/api/admin/staff/${e.target.dataset.id}/role`,{method:"PATCH",body:JSON.stringify({role:e.target.value})});await loadStaff();renderStaff();msg("Staff role updated.");}catch(err){msg(err.message,true);}});

boot();
