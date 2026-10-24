const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));
const fmt = (v) => v ? new Date(v).toLocaleString() : "—";

let state = { admin:null, players:[], tournaments:[], registrations:[], matches:[], reviews:[], staff:[], audit:[], recovery:[], cancelled:[] };

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

async function loadAll(){ await Promise.all([loadPlayers(),loadTournaments(),loadCancelled(),loadRegistrations(),loadMatches(),loadReviews(),loadStaff(),loadAudit(),loadRecovery()]); renderDashboard(); renderAll(); }
async function loadPlayers(){ const d=await api("/api/admin/players"); state.players=d.players||[]; }
async function loadTournaments(){ const d=await api("/api/admin/tournaments"); state.tournaments=d.tournaments||[]; }
async function loadCancelled(){ const d=await api("/api/tournaments/cancelled"); state.cancelled=d.tournaments||[]; }
async function loadRegistrations(){ const d=await api("/api/admin/registrations"); state.registrations=d.registrations||[]; }
async function loadMatches(){ const d=await api("/api/admin/matches"); state.matches=d.matches||[]; }
async function loadReviews(){ try{const d=await api("/api/admin/reviews");state.reviews=d.reviews||[]}catch{state.reviews=[];} }
async function loadStaff(){ try{const d=await api("/api/admin/staff");state.staff=d.staff||[]}catch{state.staff=[];} }
async function loadAudit(){ const d=await api("/api/admin/audit"); state.audit=d.logs||[]; }
async function loadRecovery(){ try{const d=await api("/api/admin/recovery-requests");state.recovery=d.requests||[]}catch{state.recovery=[];} }

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
  $("#playersTable").innerHTML=rows.map(p=>`<tr><td><b>${esc(p.display_name||"—")}</b><small>${esc(p.public_id)}</small></td><td>${esc(p.username)}</td><td>${esc(p.free_fire_uid||"—")}</td><td>${esc(p.email||p.phone||"—")}</td><td>${pill(p.status)}</td><td>${fmt(p.created_at)}</td><td><select class="player-status" data-id="${p.id}"><option ${p.status==="ACTIVE"?"selected":""}>ACTIVE</option><option ${p.status==="SUSPENDED"?"selected":""}>SUSPENDED</option><option ${p.status==="BANNED"?"selected":""}>BANNED</option></select><button class="btn secondary change-player-username" data-id="${p.id}" data-username="${esc(p.username)}" type="button">Change username</button> <button class="btn secondary reset-player-password" data-id="${p.id}" data-username="${esc(p.username)}" data-email="${esc(p.email||"")}" type="button">Reset password</button></td></tr>`).join("")||`<tr><td colspan="7" class="empty">No players found.</td></tr>`;
}
function renderTournaments(){
  $("#tournamentsList").innerHTML=state.tournaments.map(t=>{
    const room=state.matches.find(m=>String(m.tournament_id)===String(t.id));
    return `<div class="entity-card room-match-card tournament-admin-card">
      <div><b>${esc(t.title)}</b><small>${esc(t.public_id)} · ${esc(t.mode)} · ${esc(t.entry_type)} · ₹${Number(t.entry_fee||0).toFixed(2)} · capacity ${esc(t.capacity)}</small><small>${esc(t.description||"")}</small></div>
      <div class="entity-actions tournament-actions"><select class="tournament-status" data-id="${t.id}" aria-label="Tournament status">${["DRAFT","PUBLISHED","REGISTRATION OPEN","REGISTRATION CLOSED","READY","LIVE","RESULTS PENDING","RESULTS FINAL","COMPLETED","CANCELLED","SUSPENDED"].map(s=>`<option value="${s}" ${t.status===s?"selected":""}>${s}</option>`).join("")}</select><button class="btn secondary edit-tournament" data-id="${t.id}" type="button">Edit</button><button class="btn danger delete-tournament" data-id="${t.id}" type="button">Delete</button></div>
      <div class="tournament-room-settings">
        <h3>Tournament Room</h3>
        ${room ? `<small class="muted">${room.room_enabled?"Published to approved players (release time applies)":"Hidden from players"} · ${room.room_release_at? "Release: "+esc(fmt(room.room_release_at)):"Release immediately when published"}</small>
        <form class="room-credentials-form form-grid" data-id="${room.id}" data-tournament-id="${t.id}">
          <label>Room ID<input name="roomId" value="${esc(room.room_id||"")}" autocomplete="off" maxlength="100"></label>
          <label>Room Password<input name="roomPassword" value="${esc(room.room_password||"")}" autocomplete="off" maxlength="100"></label>
          <label>Release Date &amp; Time<input name="roomReleaseAt" type="datetime-local" value="${esc(localDateTimeValue(room.room_release_at))}"><small>Blank means release immediately when published.</small></label>
          <label class="check-label"><input name="roomEnabled" type="checkbox" value="true" ${room.room_enabled?"checked":""}> Publish to approved players</label>
          <button class="btn secondary full" type="submit">Save Room Settings</button>
        </form>` : `<p class="muted">Room settings are being prepared. Refresh in a moment.</p>`}
      </div>
    </div>`;
  }).join("")||"<div class='empty'>No tournaments.</div>";
  $("#resultMatch").innerHTML=state.matches.filter(m=>!["COMPLETED","RESULTS FINAL","CANCELLED","SUSPENDED","DELETED"].includes(String(m.tournament_status||"").toUpperCase())).map(m=>`<option value="${m.id}">${esc(m.title)}</option>`).join("");
}
function renderCancelled(){
  const el=$("#cancelledTournamentsList"); if(!el)return;
  el.innerHTML=state.cancelled.map(t=>`<div class="entity-card"><div><b>${esc(t.title)}</b><small>${esc(t.public_id)} · ${esc(t.mode)} · ${esc(t.entry_type)} · ${esc(t.registrations_count)} registration(s)</small><small>${esc(t.description||"")}</small></div><div class="entity-actions"><button class="btn secondary restore-cancelled" data-id="${t.id}" type="button">Reopen tournament</button></div></div>`).join("")||"<div class='empty'>No cancelled tournaments.</div>";
}
function renderPayments(){
  const input=$("#paymentUidSearch");
  if(!input)return;
  const q=input.value.trim().toLowerCase();
  const filter=$("#paymentStatusFilter")?.value||"ACTION";
  const paid=state.registrations.filter(r=>r.entry_type==="PAID");
  const countStatus=s=>paid.filter(r=>(r.payment_status||"NOT_SUBMITTED")===s).length;
  $("#paymentStatSubmitted").textContent=countStatus("SUBMITTED");
  $("#paymentStatVerifiedAmount").textContent="₹"+paid.filter(r=>r.payment_status==="VERIFIED").reduce((sum,r)=>sum+Number(r.entry_fee||0),0).toLocaleString("en-IN",{maximumFractionDigits:2,minimumFractionDigits:2});
  $("#paymentStatRejected").textContent=countStatus("REJECTED");
  $("#paymentStatNotSubmitted").textContent=countStatus("NOT_SUBMITTED");
  let rows=paid.filter(r=>{
    const status=r.payment_status||"NOT_SUBMITTED";
    const matchesQuery=!q||[r.free_fire_uid,r.username,r.display_name,r.public_id,r.title,r.utr,r.payment_note].some(v=>String(v||"").toLowerCase().includes(q));
    const matchesStatus=filter==="ALL"||(filter==="ACTION"?["SUBMITTED","REJECTED","NOT_SUBMITTED"].includes(status)&&status==="SUBMITTED":status===filter);
    return matchesQuery&&matchesStatus;
  });
  rows.sort((a,b)=>{
    const rank={"SUBMITTED":0,"REJECTED":1,"NOT_SUBMITTED":2,"VERIFIED":3};
    return (rank[a.payment_status||"NOT_SUBMITTED"]??4)-(rank[b.payment_status||"NOT_SUBMITTED"]??4)||new Date(b.payment_submitted_at||b.created_at||0)-new Date(a.payment_submitted_at||a.created_at||0);
  });
  $("#paymentSearchHint").textContent=`${rows.length} shown · ${countStatus("SUBMITTED")} awaiting review · ${countStatus("VERIFIED")} verified`;
  $("#paymentsTable").innerHTML=rows.map(r=>`<tr><td><b>${esc(r.display_name||r.username)}</b><small>@${esc(r.username)}</small><small>Free Fire UID: ${esc(r.free_fire_uid||"Not set")}</small></td><td>${esc(r.title)}<small>Registration: ${esc(r.public_id)}</small></td><td><b>₹${Number(r.entry_fee||0).toFixed(2)}</b></td><td><b>${esc(r.utr||"Not submitted")}</b>${r.payment_submitted_at?`<small>Submitted: ${esc(fmt(r.payment_submitted_at))}</small>`:""}${r.utr?`<button class="btn secondary payment-copy-utr" data-utr="${esc(r.utr)}" type="button">Copy UTR</button>`:""}</td><td><b>${esc((r.payment_status||"NOT_SUBMITTED").replaceAll("_"," "))}</b>${r.payment_note?`<small>Note: ${esc(r.payment_note)}</small>`:""}</td><td>${pill(r.status)}</td><td><div class="payment-action-stack">${r.payment_status==="SUBMITTED"?`<button class="btn primary payment-review" data-id="${r.id}" data-status="VERIFIED" type="button">Verify</button><button class="btn danger payment-review" data-id="${r.id}" data-status="REJECTED" type="button">Reject</button>`:""}<button class="btn secondary payment-history" data-id="${r.id}" type="button">History</button></div></td></tr>`).join("")||`<tr><td colspan="7" class="empty">${q?"No matching payment records.":filter==="ACTION"?"No payments are awaiting review.":"No paid registrations match this filter."}</td></tr>`;
}
function renderRegistrations(){
  const filter=$("#registrationFilter").value; const rows=state.registrations.filter(r=>filter==="ALL"||r.status===filter);
  $("#registrationsTable").innerHTML=rows.map(r=>`<tr><td><b>${esc(r.public_id)}</b><small>${esc(r.team_name||"")}</small></td><td><b>${esc(r.display_name||r.username)}</b><small>UID: ${esc(r.free_fire_uid||"—")}</small></td><td>${esc(r.title)}<small>${r.entry_type==="PAID"?"₹"+Number(r.entry_fee||0).toFixed(2):"FREE"}</small></td><td>${esc(r.mode||"—")}</td><td>${pill(r.status)}</td><td>${fmt(r.created_at)}</td><td>${r.entry_type==="PAID"?`<b>${esc(r.payment_status||"NOT_SUBMITTED")}</b><small>UTR: ${esc(r.utr||"Not submitted")}</small>${r.payment_note?`<small>Note: ${esc(r.payment_note)}</small>`:""}`: "<span class='muted'>Not required</span>"}</td><td><select class="registration-status" data-id="${r.id}"><option value="PENDING" ${r.status==="PENDING"?"selected":""}>PENDING</option><option value="VERIFIED" ${r.status==="VERIFIED"?"selected":""}>VERIFIED</option><option value="REJECTED" ${r.status==="REJECTED"?"selected":""}>REJECTED</option><option value="WAITLISTED" ${r.status==="WAITLISTED"?"selected":""}>WAITLISTED</option><option value="CANCELLED" ${r.status==="CANCELLED"?"selected":""}>CANCELLED</option></select>${r.entry_type==="PAID"&&r.payment_status==="SUBMITTED"?`<div class="button-row"><button class="btn secondary payment-review" data-id="${r.id}" data-status="VERIFIED" type="button">Verify payment</button><button class="btn danger payment-review" data-id="${r.id}" data-status="REJECTED" type="button">Reject payment</button></div>`:""}</td></tr>`).join("")||`<tr><td colspan="8" class="empty">No registrations.</td></tr>`;
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
  // Kept as a no-op so the existing render pipeline can remain unchanged.
}
function playerOptions(){ return state.players.map(p=>`<option value="${p.id}">${esc(p.display_name||p.username)} · ${esc(p.free_fire_uid||p.public_id)}</option>`).join(""); }
function addResultRow(){
  const div=document.createElement("div");
  div.className="result-row";
  div.innerHTML=`<label class="result-field result-player-field"><span>Player</span><select class="result-player" required><option value="">Select player…</option>${playerOptions()}</select></label>
    <label class="result-field"><span>Placement</span><input class="result-placement" type="number" min="1" step="1" placeholder="e.g. 1" required></label>
    <label class="result-field"><span>Kills</span><input class="result-kills" type="number" min="0" step="1" value="0" placeholder="e.g. 5"></label>
    <label class="result-field"><span>Points</span><input class="result-points" type="number" min="0" step="1" value="0" placeholder="e.g. 12"></label>
    <label class="result-field result-notes-field"><span>Notes (optional)</span><input class="result-notes" placeholder="e.g. Winner / disqualified"></label>
    <button type="button" class="remove-result" aria-label="Remove this player result" title="Remove row">×</button>`;
  $("#resultRows").appendChild(div);
}
function renderReviews(){
  const f=$("#reviewFilter").value; const rows=state.reviews.filter(r=>f==="ALL"||r.status===f);
  $("#reviewsList").innerHTML=rows.map(r=>`<article class="review-card"><div class="review-head"><b>${esc(r.display_name||r.username||"Player")}</b>${pill(r.status)}</div><div class="stars">${"★".repeat(Number(r.rating||0))}${"☆".repeat(5-Number(r.rating||0))}</div><p>${esc(r.review_text||"")}</p><small>${esc(r.title||"")} · ${fmt(r.created_at)}</small><div class="button-row"><button class="btn secondary review-action" data-id="${r.id}" data-status="APPROVED">Approve</button><button class="btn danger review-action" data-id="${r.id}" data-status="REJECTED">Reject</button></div></article>`).join("")||"<div class='empty'>No reviews.</div>";
}
function renderStaff(){ $("#staffList").innerHTML=state.staff.map(s=>`<div class="entity-card"><div><b>${esc(s.username)}</b><small>${fmt(s.created_at)}</small></div><div>${pill(s.role)} <select class="staff-role" data-id="${s.id}"><option ${s.role==="OWNER"?"selected":""}>OWNER</option><option ${s.role==="TOURNAMENT_MANAGER"?"selected":""}>TOURNAMENT_MANAGER</option><option ${s.role==="RESULTS_MANAGER"?"selected":""}>RESULTS_MANAGER</option><option ${s.role==="MODERATOR"?"selected":""}>MODERATOR</option><option ${s.role==="SUPPORT"?"selected":""}>SUPPORT</option></select></div></div>`).join("")||"<div class='empty'>No staff accounts.</div>"; }
function renderAudit(){ $("#auditTable").innerHTML=state.audit.map(a=>`<tr><td>${fmt(a.created_at)}</td><td>${esc(a.actor_type)} #${esc(a.actor_id||"")}</td><td>${esc(a.action)}</td><td>${esc(a.entity_type||"")}</td><td>${esc(a.entity_id||"")}</td><td><code>${esc(JSON.stringify(a.details||{}))}</code></td></tr>`).join("")||`<tr><td colspan="6" class="empty">No audit logs.</td></tr>`; }
function renderRecovery(){ $("#recoveryTable").innerHTML=state.recovery.map(r=>`<tr><td>${esc(r.request_type)}</td><td>${esc(r.username||"—")}</td><td>${esc(r.contact||"—")}</td><td>${esc(r.player_uid||"—")}</td><td>${esc(r.details||"—")}</td><td>${pill(r.status)}</td><td>${fmt(r.created_at)}</td><td>${r.status==="OPEN"?`<button class="btn secondary close-recovery" data-id="${r.id}" type="button">Mark reviewed</button>`:"—"}</td></tr>`).join("")||`<tr><td colspan="8" class="empty">No recovery requests.</td></tr>`; }
function renderAll(){renderPlayers();renderTournaments();renderCancelled();renderRegistrations();renderPayments();renderMatches();renderReviews();renderStaff();renderAudit();renderRecovery();renderDashboard();}

function switchSection(name){ $$(".admin-section").forEach(x=>x.classList.toggle("active",x.id===`section-${name}`)); $$("#adminNav button").forEach(x=>x.classList.toggle("active",x.dataset.section===name)); $("#sectionTitle").textContent=name.charAt(0).toUpperCase()+name.slice(1); }

$("#adminLoginForm").addEventListener("submit",async e=>{e.preventDefault();$("#loginMessage").textContent="Signing in…";try{const d=await api("/api/admin/login",{method:"POST",body:JSON.stringify({username:$("#adminUsername").value,password:$("#adminPassword").value})});state.admin=d.admin;showApp();await loadAll();}catch(err){$("#loginMessage").textContent=err.message;}});
$("#adminNav").addEventListener("click",e=>{const b=e.target.closest("button[data-section]");if(b)switchSection(b.dataset.section);});
$("#adminLogoutBtn").addEventListener("click",async()=>{await api("/api/admin/logout",{method:"POST"}).catch(()=>{});showLogin();});
$("#playerSearch").addEventListener("input",renderPlayers);
$("#registrationFilter").addEventListener("change",renderRegistrations);
$("#paymentUidSearch").addEventListener("input",renderPayments);
$("#paymentStatusFilter").addEventListener("change",renderPayments);
$("#clearPaymentSearch").addEventListener("click",()=>{$("#paymentUidSearch").value="";renderPayments();$("#paymentUidSearch").focus();});
$("#refreshPayments").addEventListener("click",async()=>{const b=$("#refreshPayments");b.disabled=true;try{await loadRegistrations();renderAll();msg("Payment records refreshed.");}catch(err){msg(err.message,true);}finally{b.disabled=false;}});
$("#paymentsTable").addEventListener("click",async e=>{
  const copy=e.target.closest(".payment-copy-utr");if(!copy)return;
  try{
    if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(copy.dataset.utr);
    else {const ta=document.createElement("textarea");ta.value=copy.dataset.utr;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();const ok=document.execCommand("copy");ta.remove();if(!ok)throw new Error("Clipboard unavailable");}
    msg("UTR copied.");
  }catch{msg("Could not copy automatically. Select the UTR text and copy it manually.",true);}
});
$("#reviewFilter").addEventListener("change",renderReviews);
$("#refreshCancelled").addEventListener("click",async()=>{await loadCancelled();renderCancelled();});
$("#cancelledTournamentsList").addEventListener("click",async e=>{const b=e.target.closest(".restore-cancelled");if(!b)return;const t=state.cancelled.find(x=>String(x.id)===b.dataset.id);if(!t||!confirm(`Reopen "${t.title}" and make it visible again?`))return;try{await api(`/api/admin/tournaments/${t.id}/status`,{method:"PATCH",body:JSON.stringify({status:"REGISTRATION OPEN"})});await Promise.all([loadCancelled(),loadTournaments()]);renderAll();msg("Tournament reopened.");}catch(err){msg(err.message,true);}});
$("#refreshAudit").addEventListener("click",async()=>{await loadAudit();renderAudit();});
$("#refreshRecovery").addEventListener("click",async()=>{await loadRecovery();renderRecovery();});
$("#recoveryTable").addEventListener("click",async e=>{const b=e.target.closest(".close-recovery");if(!b)return;try{await api("/api/admin/recovery-requests/"+b.dataset.id+"/close",{method:"POST"});await loadRecovery();renderRecovery();msg("Recovery request marked reviewed.");}catch(err){msg(err.message,true);}});

$("#tournamentForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);const b=Object.fromEntries(f.entries());try{await api("/api/admin/tournaments",{method:"POST",body:JSON.stringify({...b,capacity:Number(b.capacity),matchesCount:1})});e.target.reset();msg("Tournament created.");await Promise.all([loadTournaments(),loadMatches()]);renderAll();}catch(err){msg(err.message,true);}});
$("#tournamentsList").addEventListener("submit",async e=>{const form=e.target.closest(".room-credentials-form");if(!form)return;e.preventDefault();const f=new FormData(form);const b=Object.fromEntries(f.entries());b.roomEnabled=f.has("roomEnabled");b.roomReleaseAt=dateTimeLocalToISO(b.roomReleaseAt);try{await api(`/api/admin/matches/${form.dataset.id}/room`,{method:"PATCH",body:JSON.stringify(b)});msg("Tournament room settings saved.");await loadMatches();renderAll();}catch(err){msg(err.message,true);}});
$("#addResultRow").addEventListener("click",addResultRow); addResultRow();
$("#resultRows").addEventListener("click",e=>{if(e.target.classList.contains("remove-result")){if($("#resultRows").children.length>1)e.target.parentElement.remove();}});
$("#resultForm").addEventListener("submit",async e=>{e.preventDefault();const rows=$$(".result-row").map(r=>({playerId:Number(r.querySelector(".result-player").value),placement:Number(r.querySelector(".result-placement").value),kills:Number(r.querySelector(".result-kills").value||0),points:Number(r.querySelector(".result-points").value||0),notes:r.querySelector(".result-notes").value}));try{await api(`/api/admin/matches/${$("#resultMatch").value}/results`,{method:"POST",body:JSON.stringify({results:rows})});$("#resultMessage").textContent="Tournament results saved.";await loadMatches();renderAll();}catch(err){$("#resultMessage").textContent=err.message;}});
$("#staffForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);const b=Object.fromEntries(f.entries());try{await api("/api/admin/staff",{method:"POST",body:JSON.stringify(b)});e.target.reset();msg("Staff account created.");await loadStaff();renderStaff();}catch(err){msg(err.message,true);}});

$("#playersTable").addEventListener("click",async e=>{
  const nameBtn=e.target.closest(".change-player-username");
  if(nameBtn){
    const username=prompt("New username for "+nameBtn.dataset.username+" (3–30 letters/numbers/._-):",nameBtn.dataset.username);
    if(username===null)return;
    try{const d=await api("/api/admin/players/"+nameBtn.dataset.id+"/username",{method:"PATCH",body:JSON.stringify({username})});msg(d.message||"Username changed.");await loadPlayers();renderPlayers();}
    catch(err){msg(err.message,true);}
    return;
  }
  const b=e.target.closest(".reset-player-password"); if(!b)return;
  const password=prompt("Set a new password for "+b.dataset.username+" (minimum 8 characters). You must send it to the player separately using their registered Gmail: "+(b.dataset.email||"no email")+".");
  if(password===null)return;
  if(password.length<8){msg("Password must be at least 8 characters.",true);return;}
  if(!confirm("Reset "+b.dataset.username+"'s password now? The player will need the new password."))return;
  try{const d=await api("/api/admin/players/"+b.dataset.id+"/password",{method:"POST",body:JSON.stringify({password})});msg(d.message||"Password reset.");}
  catch(err){msg(err.message,true);}
});
$("#playersTable").addEventListener("change",async e=>{if(!e.target.classList.contains("player-status"))return;try{await api(`/api/admin/players/${e.target.dataset.id}/status`,{method:"PATCH",body:JSON.stringify({status:e.target.value})});await loadPlayers();renderPlayers();msg("Player status updated.");}catch(err){msg(err.message,true);}});
$("#tournamentsList").addEventListener("change",async e=>{if(!e.target.classList.contains("tournament-status"))return;try{await api(`/api/admin/tournaments/${e.target.dataset.id}/status`,{method:"PATCH",body:JSON.stringify({status:e.target.value})});await loadTournaments();renderTournaments();msg("Tournament status updated.");}catch(err){msg(err.message,true);}});
$("#tournamentsList").addEventListener("click",async e=>{
  const edit=e.target.closest(".edit-tournament");
  const del=e.target.closest(".delete-tournament");
  if(edit){
    const t=state.tournaments.find(x=>String(x.id)===edit.dataset.id); if(!t)return;
    const title=prompt("Tournament title:",t.title); if(title===null)return;
    const description=prompt("Description:",t.description||""); if(description===null)return;
    const entryType=prompt("Entry type: FREE or PAID",t.entry_type); if(entryType===null)return;
    const entryFee=prompt("Entry fee (₹):",String(t.entry_fee||0)); if(entryFee===null)return;
    const capacity=prompt("Player capacity:",String(t.capacity)); if(capacity===null)return;
    
    const mode=prompt("Mode: SOLO, DUO or SQUAD",t.mode); if(mode===null)return;
    const status=prompt("Status (e.g. REGISTRATION OPEN, PUBLISHED, LIVE, COMPLETED, CANCELLED):",t.status); if(status===null)return;
    const rules=prompt("Rules:",t.rules||""); if(rules===null)return;
    const prizeSummary=prompt("Prize information:",t.prize_summary||""); if(prizeSummary===null)return;
    try{
      await api(`/api/admin/tournaments/${t.id}`,{method:"PATCH",body:JSON.stringify({title,description,entryType:entryType.trim().toUpperCase(),entryFee:Number(entryFee),capacity:Number(capacity),matchesCount:1,mode:mode.trim().toUpperCase(),status:status.trim().toUpperCase(),scoringType:t.scoring_type||"CUSTOM",startAt:t.start_at||null,registrationCloseAt:t.registration_close_at||null,rules,prizeSummary})});
      await loadTournaments();renderAll();msg("Tournament updated.");
    }catch(err){msg(err.message,true);}
  }
  if(del){
    const t=state.tournaments.find(x=>String(x.id)===del.dataset.id);if(!t)return;
    if(!confirm(`Delete "${t.title}"? This is allowed only if it has no registrations or tournament activity.`))return;
    try{await api(`/api/admin/tournaments/${t.id}`,{method:"DELETE"});await loadTournaments();renderAll();msg("Tournament deleted.");}
    catch(err){msg(err.message,true);}
  }
});
$("#tournamentsList").addEventListener("change",async e=>{
  const select=e.target.closest(".tournament-status");if(!select)return;
  const t=state.tournaments.find(x=>String(x.id)===select.dataset.id);if(!t)return;
  try{await api(`/api/admin/tournaments/${t.id}/status`,{method:"PATCH",body:JSON.stringify({status:select.value})});await loadTournaments();renderAll();msg("Tournament status updated.");}
  catch(err){select.value=t.status;msg(err.message,true);}
});
$("#paymentsTable").addEventListener("click",async e=>{
  const button=e.target.closest(".payment-review");if(!button)return;
  const status=button.dataset.status;
  const note=prompt(status==="VERIFIED"?"Optional verification note:":"Reason for rejecting this payment (required):","")||"";
  if(status==="REJECTED"&&!note.trim()){msg("Enter a reason when rejecting a payment.",true);return;}
  if(!confirm(status==="VERIFIED"?"Confirm you checked the received payment and UTR in your payment account?":"Reject this payment reference?"))return;
  button.disabled=true;
  try{await api(`/api/admin/registrations/${button.dataset.id}/payment`,{method:"PATCH",body:JSON.stringify({paymentStatus:status,note})});await loadRegistrations();renderRegistrations();renderPayments();renderDashboard();msg(status==="VERIFIED"?"Payment verified. Approve the registration separately.":"Payment rejected. The player can submit a corrected UTR.");}
  catch(err){msg(err.message,true);}finally{button.disabled=false;}
});
$("#paymentsTable").addEventListener("click",async e=>{
  const button=e.target.closest(".payment-history");if(!button)return;
  button.disabled=true;
  try{
    const data=await api(`/api/admin/registrations/${button.dataset.id}/payment-history`);
    const events=data.events||[];
    const message=events.length?events.map(item=>{
      const amount=item.amount==null?"—":"₹"+Number(item.amount).toFixed(2);
      const transition=(item.previous_status||"—")+" → "+item.new_status;
      const note=item.note?("\nNote: "+item.note):"";
      return fmt(item.created_at)+" | "+item.event_type+" | "+transition+" | "+amount+" | UTR: "+(item.utr||"—")+note;
    }).join("\n\n"):"No payment history has been recorded for this registration yet.";
    alert("UPPS Payment History\n\n"+message);
  }catch(err){msg(err.message,true);}finally{button.disabled=false;}
});
$("#registrationsTable").addEventListener("click",async e=>{
  const button=e.target.closest(".payment-review");
  if(!button)return;
  const status=button.dataset.status;
  const note=prompt(status==="VERIFIED"?"Optional payment verification note:":"Reason for rejecting this payment (required):","")||"";
  if(status==="REJECTED"&&!note.trim()){msg("Enter a reason when rejecting a payment.",true);return;}
  if(!confirm(status==="VERIFIED"?"Confirm you checked the payment against your payment account and the UTR?":"Reject this payment reference?"))return;
  button.disabled=true;
  try{
    await api(`/api/admin/registrations/${button.dataset.id}/payment`,{method:"PATCH",body:JSON.stringify({paymentStatus:status,note})});
    await loadRegistrations();renderRegistrations();renderDashboard();
    msg(status==="VERIFIED"?"Payment verified. You can now approve the registration.":"Payment marked rejected. Player can submit a corrected reference.");
  }catch(err){msg(err.message,true);}finally{button.disabled=false;}
});
$("#registrationsTable").addEventListener("change",async e=>{
  if(!e.target.classList.contains("registration-status"))return;
  const control=e.target;
  const registration=state.registrations.find(r=>String(r.id)===String(control.dataset.id));
  const previous=registration?.status || "PENDING";
  const next=control.value;
  if(next==="VERIFIED" && previous!=="VERIFIED" && !confirm("Approve this registration? This confirms the player's slot. For paid tournaments, verify payment first.")){
    control.value=previous; return;
  }
  if(next==="REJECTED" && previous!=="REJECTED" && !confirm("Reject this player's registration?")){control.value=previous;return;}
  control.disabled=true;
  try{
    await api(`/api/admin/registrations/${control.dataset.id}/status`,{method:"PATCH",body:JSON.stringify({status:next})});
    await loadRegistrations(); renderRegistrations(); renderDashboard();
    msg(next==="VERIFIED"?"Registration approved. Confirm payment first for paid tournaments.":"Registration status updated.");
  }catch(err){
    control.value=previous;
    msg(err.message,true);
  }finally{control.disabled=false;}
});
$("#reviewsList").addEventListener("click",async e=>{const b=e.target.closest(".review-action");if(!b)return;try{await api(`/api/admin/reviews/${b.dataset.id}/status`,{method:"PATCH",body:JSON.stringify({status:b.dataset.status})});await loadReviews();renderReviews();renderDashboard();msg("Review status updated.");}catch(err){msg(err.message,true);}});
$("#staffList").addEventListener("change",async e=>{if(!e.target.classList.contains("staff-role"))return;try{await api(`/api/admin/staff/${e.target.dataset.id}/role`,{method:"PATCH",body:JSON.stringify({role:e.target.value})});await loadStaff();renderStaff();msg("Staff role updated.");}catch(err){msg(err.message,true);}});

boot();
