/**
 * LeitWerk Ticket-Dienst – Admin-Seite (nur für Paul)
 *
 * Liegt hinter Cloudflare Access (Anmeldung mit GitHub). Die Seite prüft das Access-Token selbst
 * (Signatur, Audience, Ablauf) – ohne gültiges Token oder Passwort ist alles gesperrt.
 * Alternativ: Secret ADMIN_PASSWORT (Anmeldung mit Benutzer „admin“).
 *
 *   GET   /                      → Seite
 *   GET   /api/tickets?status=&art=
 *   GET   /api/tickets/:nr
 *   PATCH /api/tickets/:nr       {status?, version?, antwort?}
 *   DELETE /api/tickets/:nr
 *   GET   /api/tickets/:nr/anhang?name=
 *   GET   /api/hilfe             (alle, auch abgeschaltete)
 *   PUT   /api/hilfe             [{id, titel, text, art, aktiv}]
 *   GET   /api/fortschritt       (alle, auch ausgeblendete)
 *   PUT   /api/fortschritt       [{id, titel, text, stand, prozent, aktiv}]
 */

const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function b64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

let schluessel = { zeit: 0, keys: [] };
async function accessKeys(team) {
  if (Date.now() - schluessel.zeit < 3_600_000 && schluessel.keys.length) return schluessel.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
  const j = await r.json();
  schluessel = { zeit: Date.now(), keys: j.keys ?? [] };
  return schluessel.keys;
}

/** Access-Token (JWT, RS256) prüfen */
export async function accessGueltig(token, team, aud) {
  if (!token || !team || !aud) return false;
  const teile = token.split(".");
  if (teile.length !== 3) return false;
  let kopf;
  let inhalt;
  try {
    kopf = JSON.parse(new TextDecoder().decode(b64url(teile[0])));
    inhalt = JSON.parse(new TextDecoder().decode(b64url(teile[1])));
  } catch {
    return false;
  }
  if (kopf.alg !== "RS256") return false;
  const auds = Array.isArray(inhalt.aud) ? inhalt.aud : [inhalt.aud];
  if (!auds.includes(aud)) return false;
  if (!inhalt.exp || inhalt.exp * 1000 < Date.now()) return false;
  if (inhalt.iss && inhalt.iss !== `https://${team}`) return false;
  const jwk = (await accessKeys(team)).find((k) => k.kid === kopf.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(teile[2]), new TextEncoder().encode(`${teile[0]}.${teile[1]}`));
}

async function gleich(a, b) {
  const h = async (x) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(x)));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

async function berechtigt(request, env) {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (token && (await accessGueltig(token, env.ACCESS_TEAM, env.ACCESS_AUD).catch(() => false))) return true;
  const pw = env.ADMIN_PASSWORT;
  const auth = request.headers.get("authorization") ?? "";
  if (pw && auth.startsWith("Basic ")) {
    const [u, p] = atob(auth.slice(6)).split(":");
    if (u === "admin" && (await gleich(p ?? "", pw))) return true;
  }
  return false;
}

export default {
  async fetch(request, env) {
    if (!(await berechtigt(request, env))) {
      const eingerichtet = !!(env.ACCESS_TEAM && env.ACCESS_AUD) || !!env.ADMIN_PASSWORT;
      if (!eingerichtet) return new Response("Die Admin-Seite ist noch nicht eingerichtet (Cloudflare Access oder ADMIN_PASSWORT fehlt).", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
      return new Response("Kein Zugang", { status: 401, headers: { "content-type": "text/plain; charset=utf-8", ...(env.ADMIN_PASSWORT ? { "www-authenticate": 'Basic realm="LeitWerk Tickets"' } : {}) } });
    }
    const url = new URL(request.url);
    const store = env.TICKETS.get(env.TICKETS.idFromName("haupt"));
    const m = url.pathname.match(/^\/api\/tickets\/(\d+)(\/anhang)?$/);
    if (url.pathname === "/" && request.method === "GET") return new Response(SEITE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    if (url.pathname === "/api/tickets" && request.method === "GET") return json(await store.liste({ status: url.searchParams.get("status") || undefined, art: url.searchParams.get("art") || undefined }));
    if (m && m[2] && request.method === "GET") {
      const name = url.searchParams.get("name") ?? "";
      const inhalt = await store.anhang(Number(m[1]), name);
      if (inhalt === null) return json({ fehler: "nicht gefunden" }, 404);
      return new Response(inhalt, { headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="${name.replace(/"/g, "")}"`, "x-content-type-options": "nosniff" } });
    }
    if (m && request.method === "GET") {
      const t = await store.ticket(Number(m[1]));
      return t ? json(t) : json({ fehler: "nicht gefunden" }, 404);
    }
    if (m && request.method === "PATCH") return json(await store.setze(Number(m[1]), await request.json()));
    if (m && request.method === "DELETE") return json(await store.loesche(Number(m[1])));
    if (url.pathname === "/api/hilfe" && request.method === "GET") return json(await store.hilfe(true));
    if (url.pathname === "/api/hilfe" && request.method === "PUT") return json(await store.hilfeSpeichern(await request.json()));
    if (url.pathname === "/api/fortschritt" && request.method === "GET") return json(await store.fortschritt(true));
    if (url.pathname === "/api/fortschritt" && request.method === "PUT") return json(await store.fortschrittSpeichern(await request.json()));
    return json({ fehler: "Nicht gefunden" }, 404);
  },
};

const SEITE = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LeitWerk Tickets</title>
<style>
:root{--bg:#0f1726;--panel:#16213a;--fg:#e8eef8;--dim:#94a3bd;--line:#2a3a5c;--blau:#2f7cf6;--gruen:#2fb36d;--rot:#e5484d;--gelb:#e3b84a}
[hidden]{display:none!important}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,sans-serif}
header{display:flex;gap:12px;align-items:center;padding:14px 20px;border-bottom:1px solid var(--line);flex-wrap:wrap}
h1{font-size:18px;margin:0 12px 0 0}button,select,input,textarea{font:inherit;color:var(--fg);background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:6px 10px}
button{cursor:pointer}button.primaer{background:var(--blau);border-color:var(--blau)}.tab.an{border-color:var(--blau)}
main{display:grid;grid-template-columns:minmax(320px,1fr) 2fr;gap:0;height:calc(100vh - 58px)}
#liste{overflow:auto;border-right:1px solid var(--line)}#detail{overflow:auto;padding:16px 20px}
.zeile{padding:10px 16px;border-bottom:1px solid var(--line);cursor:pointer}.zeile:hover,.zeile.an{background:var(--panel)}
.zeile b{font-variant-numeric:tabular-nums}.dim{color:var(--dim);font-size:12px}
.st{font-size:11px;padding:1px 7px;border-radius:99px;border:1px solid currentColor;margin-left:6px}
.st-eingegangen{color:var(--blau)}.st-in_arbeit{color:var(--gelb)}.st-rueckfrage{color:#c084fc}.st-eingebaut,.st-erledigt{color:var(--gruen)}.st-abgelehnt{color:var(--rot)}
pre{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:10px;overflow:auto;white-space:pre-wrap;max-height:340px}
.feld{display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap}textarea{width:100%;min-height:70px}
.fs-z{display:grid;grid-template-columns:24px 1fr 2fr 110px 120px 54px 30px;gap:6px;margin-bottom:6px;align-items:start}.fs-z input[type=range]{width:100%}.fs-z .pz{font-variant-numeric:tabular-nums;font-size:12px;color:var(--dim)}
.hilfe-z{display:grid;grid-template-columns:24px 1fr 2fr 110px 60px 30px;gap:6px;margin-bottom:6px;align-items:start}
@media(max-width:800px){main{grid-template-columns:1fr;height:auto}#liste{max-height:45vh}}
</style></head><body>
<header><h1>LeitWerk Tickets</h1>
<button class="tab an" data-tab="tickets">Tickets</button><button class="tab" data-tab="hilfe">„Deine Hilfe wird gebraucht“</button><button class="tab" data-tab="fortschritt">Entwicklungsfortschritt</button>
<select id="fStatus"><option value="">alle Stände</option><option>eingegangen</option><option value="in_arbeit">in Arbeit</option><option value="rueckfrage">Rückfrage</option><option>eingebaut</option><option>erledigt</option><option>abgelehnt</option></select>
<select id="fArt"><option value="">alle Arten</option><option>dienststelle</option><option>fahrzeug</option><option>poi</option><option>krankenhaus</option><option>vorschlag</option><option>hilfe</option><option value="idee">Idee/Wunsch</option></select>
<button id="csvAlle">Importdaten der Liste herunterladen</button></header>
<main id="tickets"><div id="liste"></div><div id="detail"><p class="dim">Ticket links auswählen.</p></div></main>
<section id="hilfe" hidden style="padding:16px 20px"><p class="dim">Diese Punkte sehen alle in LeitWerk auf der Startseite. Haken weg = ausgeblendet.</p><div id="hl"></div>
<button id="hNeu">+ Punkt</button> <button class="primaer" id="hSpeichern">Speichern</button> <span id="hInfo" class="dim"></span></section>
<section id="fortschritt" hidden style="padding:16px 20px"><p class="dim">Diese Liste sehen alle in LeitWerk unter „Entwicklungsfortschritt“ – Änderungen gelten sofort. Haken weg = ausgeblendet; ↑↓ ändert die Reihenfolge.</p><div id="fl"></div>
<button id="fNeu">+ Punkt</button> <button class="primaer" id="fSpeichern">Speichern</button> <span id="fInfo" class="dim"></span></section>
<script>
const $=s=>document.querySelector(s);const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const STAND={eingegangen:"eingegangen",in_arbeit:"in Arbeit",rueckfrage:"Rückfrage",eingebaut:"eingebaut",erledigt:"erledigt",abgelehnt:"abgelehnt"};
let liste=[],aktiv=null;
const d=t=>new Date(t).toLocaleString("de-AT",{dateStyle:"short",timeStyle:"short"});
async function laden(){const q=new URLSearchParams({status:$("#fStatus").value,art:$("#fArt").value});liste=await (await fetch("/api/tickets?"+q)).json();
$("#liste").innerHTML=liste.map(t=>'<div class="zeile'+(t.nr===aktiv?' an':'')+'" data-nr="'+t.nr+'"><b>#'+t.nr+'</b> '+esc(t.titel)+'<span class="st st-'+t.status+'">'+esc(STAND[t.status]??t.status)+(t.version?' '+esc(t.version):'')+'</span><div class="dim">'+esc(t.art)+' · '+d(t.erstellt)+(t.funkgruppe?' · '+esc(t.funkgruppe):'')+(t.anhaenge?' · 📎 '+t.anhaenge:'')+(t.kontakt?' · '+esc(t.kontakt):'')+'</div></div>').join("")||'<p class="dim" style="padding:16px">Keine Tickets.</p>';}
async function zeigen(nr){aktiv=nr;document.querySelectorAll(".zeile").forEach(z=>z.classList.toggle("an",Number(z.dataset.nr)===nr));
const t=await (await fetch("/api/tickets/"+nr)).json();
$("#detail").innerHTML='<h2>#'+t.nr+' '+esc(t.titel)+'</h2><div class="dim">'+esc(t.art)+' · eingegangen '+d(t.erstellt)+' · LeitWerk '+esc(t.app_version||"?")+(t.funkgruppe?' · '+esc(t.funkgruppe):'')+(t.hilfe_id?' · zu Punkt „'+esc(t.hilfe_id)+'“':'')+'</div>'+
(t.kontakt?'<p><b>Kontakt:</b> '+esc(t.kontakt)+'</p>':'')+(t.text?'<h3>Beschreibung</h3><pre>'+esc(t.text)+'</pre>':'')+
(t.daten?'<h3>Angaben</h3><pre>'+esc(JSON.stringify(t.daten,null,2))+'</pre>':'')+
(t.import_csv?'<h3>Importdaten (LeitWerk)</h3><pre>'+esc(t.import_csv)+'</pre><button id="csv1">Als CSV herunterladen</button>':'')+
(t.anhaenge.length?'<h3>Anhänge</h3>'+t.anhaenge.map(a=>'<div><a style="color:var(--blau)" href="/api/tickets/'+t.nr+'/anhang?name='+encodeURIComponent(a.name)+'">'+esc(a.name)+'</a> <span class="dim">'+Math.ceil(a.groesse/1024)+' KB</span></div>').join(""):'')+
'<h3>Stand</h3><div class="feld"><select id="dStatus">'+Object.entries(STAND).map(([k,v])=>'<option value="'+k+'"'+(k===t.status?' selected':'')+'>'+v+'</option>').join("")+'</select><input id="dVersion" placeholder="Version, z. B. 0.67.0" value="'+esc(t.version??"")+'"></div>'+
'<textarea id="dAntwort" placeholder="Antwort an den Nutzer (sieht er unter „Meine Tickets“)">'+esc(t.antwort??"")+'</textarea><div class="feld"><button class="primaer" id="dSpeichern">Speichern</button><button id="dLoeschen">Ticket löschen</button><span id="dInfo" class="dim"></span></div>';
if($("#csv1"))$("#csv1").onclick=()=>speichernDatei("ticket-"+t.nr+".csv",t.import_csv);
$("#dSpeichern").onclick=async()=>{await fetch("/api/tickets/"+t.nr,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status:$("#dStatus").value,version:$("#dVersion").value,antwort:$("#dAntwort").value})});$("#dInfo").textContent="gespeichert";laden();};
$("#dLoeschen").onclick=async()=>{if(!confirm("Ticket #"+t.nr+" wirklich löschen?"))return;await fetch("/api/tickets/"+t.nr,{method:"DELETE"});$("#detail").innerHTML="";laden();};}
function speichernDatei(name,inhalt){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\\ufeff"+inhalt],{type:"text/csv"}));a.download=name;a.click();}
$("#liste").onclick=e=>{const z=e.target.closest(".zeile");if(z)zeigen(Number(z.dataset.nr));};
$("#fStatus").onchange=laden;$("#fArt").onchange=laden;
$("#csvAlle").onclick=async()=>{const teile={};for(const t of liste){const x=await (await fetch("/api/tickets/"+t.nr)).json();if(!x.import_csv)continue;const [kopf,...rest]=x.import_csv.split("\\n");(teile[kopf]??=[]).push(...rest.filter(Boolean));}
const k=Object.keys(teile);if(!k.length)return alert("Keine Importdaten in der Liste.");k.forEach((kopf,i)=>speichernDatei("tickets-import-"+(i+1)+".csv",[kopf,...teile[kopf]].join("\\n")));};
let hl=[];async function hilfeLaden(){hl=await (await fetch("/api/hilfe")).json();hilfeZeigen();}
function hilfeZeigen(){$("#hl").innerHTML='<div class="hilfe-z dim"><span>an</span><span>Titel</span><span>Text</span><span>Art</span><span>Reihe</span><span></span></div>'+hl.map((p,i)=>'<div class="hilfe-z" data-i="'+i+'"><input type="checkbox" data-f="aktiv"'+(p.aktiv?' checked':'')+'><input data-f="titel" value="'+esc(p.titel)+'"><textarea data-f="text">'+esc(p.text)+'</textarea><select data-f="art">'+["fahrzeug","dienststelle","poi","krankenhaus","vorschlag"].map(a=>'<option'+(a===p.art?' selected':'')+'>'+a+'</option>').join("")+'</select><span>'+(i+1)+'</span><button data-weg>✕</button></div>').join("");}
$("#hl").oninput=e=>{const z=e.target.closest(".hilfe-z");if(!z)return;const p=hl[Number(z.dataset.i)];const f=e.target.dataset.f;p[f]=f==="aktiv"?e.target.checked:e.target.value;};
$("#hl").onclick=e=>{if(e.target.dataset.weg!==undefined){hl.splice(Number(e.target.closest(".hilfe-z").dataset.i),1);hilfeZeigen();}};
$("#hNeu").onclick=()=>{hl.push({id:"p"+Date.now(),titel:"",text:"",art:"fahrzeug",aktiv:true});hilfeZeigen();};
$("#hSpeichern").onclick=async()=>{const r=await (await fetch("/api/hilfe",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(hl)})).json();hl=r.punkte??hl;hilfeZeigen();$("#hInfo").textContent="gespeichert";};
let fl=[];const STAENDE={arbeit:"in Arbeit",geplant:"geplant",fertig:"fertig"};
async function fsLaden(){fl=await (await fetch("/api/fortschritt")).json();fsZeigen();}
function fsZeigen(){$("#fl").innerHTML='<div class="fs-z dim"><span>an</span><span>Titel</span><span>Text</span><span>Stand</span><span>Fertig</span><span></span><span></span></div>'+fl.map((p,i)=>'<div class="fs-z" data-i="'+i+'"><input type="checkbox" data-f="aktiv"'+(p.aktiv?' checked':'')+'><input data-f="titel" value="'+esc(p.titel)+'"><textarea data-f="text">'+esc(p.text)+'</textarea><select data-f="stand">'+Object.entries(STAENDE).map(([k,l])=>'<option value="'+k+'"'+(k===p.stand?' selected':'')+'>'+l+'</option>').join("")+'</select><div><input type="range" min="0" max="100" step="5" data-f="prozent" value="'+(p.prozent||0)+'"><div class="pz">'+(p.prozent||0)+' %</div></div><span><button data-hoch>↑</button><button data-runter>↓</button></span><button data-weg>✕</button></div>').join("");}
$("#fl").oninput=e=>{const z=e.target.closest(".fs-z");if(!z)return;const p=fl[Number(z.dataset.i)];const f=e.target.dataset.f;p[f]=f==="aktiv"?e.target.checked:f==="prozent"?Number(e.target.value):e.target.value;if(f==="prozent")z.querySelector(".pz").textContent=p.prozent+" %";};
$("#fl").onclick=e=>{const z=e.target.closest(".fs-z");if(!z)return;const i=Number(z.dataset.i);if(e.target.dataset.weg!==undefined)fl.splice(i,1);else if(e.target.dataset.hoch!==undefined&&i>0)fl.splice(i-1,0,fl.splice(i,1)[0]);else if(e.target.dataset.runter!==undefined&&i<fl.length-1)fl.splice(i+1,0,fl.splice(i,1)[0]);else return;fsZeigen();};
$("#fNeu").onclick=()=>{fl.push({id:"f"+Date.now(),titel:"",text:"",stand:"geplant",prozent:0,aktiv:true});fsZeigen();};
$("#fSpeichern").onclick=async()=>{const r=await (await fetch("/api/fortschritt",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(fl)})).json();fl=r.punkte??fl;fsZeigen();$("#fInfo").textContent="gespeichert";};
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("an",x===b));const t=b.dataset.tab;$("#tickets").hidden=t!=="tickets";$("#hilfe").hidden=t!=="hilfe";$("#fortschritt").hidden=t!=="fortschritt";const nt=t!=="tickets";$("#fStatus").hidden=nt;$("#fArt").hidden=nt;$("#csvAlle").hidden=nt;if(t==="hilfe")hilfeLaden();if(t==="fortschritt")fsLaden();});
laden();
</script></body></html>`;
