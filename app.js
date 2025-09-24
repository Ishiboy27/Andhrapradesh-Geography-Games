/* ==========================================================
   AP & TS Guessr — ALL GAMES (stable + Winners Match)
   - Basemap ON by default (?base=off to disable)
   - No white veil on map panes
   - District filter for AC/PC and WIN_* using exact "DISTRICT"
   - AC/PC/WIN_* HUD: per-district coverage + fully solved counts
   - Winners (AC/PC): drag & drop, all parties always visible
   - Filters: by State (AP/TS/BOTH) and by District
   ========================================================== */
console.log("APP JS LOADED v-2025-09-21+DISTRICT-only+all-games");

// ---------- URL params ----------
const urlParams = new URLSearchParams(location.search);

// ---------- Data paths ----------
const PATHS = {
  DISTRICT: "ap_ts_districts.geojson",
  RIVER:    "ap_ts_rivers.geojson",
  HIGHWAY:  "ap_ts_highways.geojson",
  AC:       "ap_ts_ac.geojson",
  PC:       "ap_ts_pc.geojson",
  CITY:     "ap_ts_cities.geojson",
  PEAK:     "ap_ts_peaks.geojson",
  WIN_AC:   "ap_ts_ac_winners.geojson",
  WIN_PC:   "ap_ts_pc_winners.geojson",
};

// ---------- Field keys ----------
const KEYS = {
  DISTRICT: ["DISTRICT","District","district"],      // used EXACTLY
  AC:       ["AC","AC_NAME","acname","ACNAME","Constituency","constituency","assembly","NAME","Name"],
  PC:       ["PC","PC_NAME","pcname","PCNAME","Parliament","parliament","NAME","Name"],
  RIVER:    ["rivname","RIVER","RIVER_NAME","NAME","NAME_EN","R_NAME","river"],
  HIGHWAY:  ["Name","nh","NH","NH_NO","NH_NUMBER","NHNAME","NH_NAME","road_name","ROAD_NAME","NAME","highway","highway_name"],
  CITYNAME: ["Name","NAME","City","CITY","City_Name","CITY_NAME","Town","TOWN"],
  CITYPOP:  ["2011 population","2011 Population","Population 2011","Population (2011)","2011_population","Population_2011","POP_2011","POP2011","2011pop","pop2011","Population","population","POP","Pop","TOT_P","TOT_POP","TOTAL_POP","Total_Pop"],
  STATE:    ["STATE","State","state","state_name","st_name","STATE_NM","STNAME","st","statecode","STATECODE"],
  REGION:   ["REGION","Region","region"],
  PEAKNAME: ["Name","NAME","Peak","PEAK"],
  PEAKNOTES:["Notes","NOTES","note","NOTE","Desc","DESC"],
  PEAKCAT:  ["Category","category","TYPE","Type"],
  ELEV:     ["Elevation_m","elevation_m","Elevation","ELEV"],
};
const YEAR_FIELDS = ["2009","2014","2018","2019","2019LS","2023","2024","2024LS"];
const YEARS_AC_AP = ["2009","2014","2019","2024"];
const YEARS_AC_TS = ["2009","2014","2018","2023"];
const YEARS_PC_ALL= ["2009","2014","2019","2024"];

// ---------- DOM ----------
const $  = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

const scoreEl  = $("#score");
const timeEl   = $("#time");
const roundEl  = $("#round");
const targetEl = $("#targetName");
const statusEl = $("#status");
const sourceTag= $("#dataSourceTag");
const countEl  = $("#districtCount");

const modeBtns = $$("#modeControls button");
const diffBtns = $$("#difficultyControls button");
const playBtns = $$("#playControls button");

const typePanel = $("#typePanel");
const typeInput = $("#typeInput");
const typeSubmit= $("#typeSubmit");
const splashEl      = document.getElementById("districtSplash");
const splashOkBtn   = document.getElementById("districtSplashOk");
const splashDontInp = document.getElementById("districtSplashDont");

// kept but hidden for winners
const yearControls = $("#yearControls");
const mcRow = $("#mcRow");

const rightHud = $("#rightHud");
const skipBtn = $("#skipBtn");   // becomes "Next" in winners
const restartBtn = $("#restartBtn");
let revealBtn = null;            // created dynamically

// ---- Winners match UI (lazy) ----
let matchPanel=null, yearSlotsEl=null, partyTrayEl=null;

// ---- District filter UI (lazy) ----
let districtSection=null, districtSelect=null;

// ---------- Map ----------
const showBase = (urlParams.get("base") || "on").toLowerCase() !== "off";

const map = L.map("map", {
  scrollWheelZoom: true,
  minZoom: 4,
  maxZoom: 12,
  markerZoomAnimation: true
}).setView([17.5,78.5],6);

let baseLayer = null;
if (showBase) {
  baseLayer = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
    { subdomains:"abcd", attribution:"&copy; OpenStreetMap contributors &copy; CARTO" }
  ).addTo(map);
}

// Keep every pane fully transparent (no white veil)
map.whenReady(() => {
  ["mapPane","tilePane","overlayPane","shadowPane","markerPane","popupPane"].forEach(p=>{
    const el=map.getPane(p); if(el) el.style.background="transparent";
  });
  map.getContainer().style.background="transparent";
});

map.fitBounds(L.latLngBounds([[6.5,67.0],[35.5,97.5]]),{padding:[20,20]});

// Context (district outlines)
const contextPane = map.createPane("context");
contextPane.style.zIndex=350;
contextPane.style.pointerEvents="none";
contextPane.classList.add("leaflet-context-pane");
contextPane.style.background="transparent";

let districtsContextLayer=null, contextDistrictsFC=null;

// End-of-game labels
let finishLabelsLayer = null;

function safeInvalidate(){ requestAnimationFrame(()=> map.invalidateSize({debounceMoveend:true})); }

// ---------- Utils ----------
function getProp(props, keys){
  if(!props) return undefined;
  if(Array.isArray(keys)){
    for(const k of keys){ if(props[k]!=null) return props[k]; }
    const ix={};
    for(const a of Object.keys(props)) ix[a.toLowerCase().replace(/[\s_]+/g,"")] = a;
    for(const k of keys){
      const hit=ix[String(k).toLowerCase().replace(/[\s_]+/g,"")];
      if(hit && props[hit]!=null) return props[hit];
    }
    return undefined;
  }
  return props[keys];
}
function normalizeState(s){
  const v=String(s||"").toLowerCase();
  if(v==="ap"||v.includes("andhra")) return "Andhra Pradesh";
  if(v==="ts"||v==="tg"||v.includes("telan")) return "Telangana";
  return s||"Unknown";
}
function normalizeLabel(s){
  return String(s||"")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[.()/\-]/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function css(v,f){ const x=getComputedStyle(document.documentElement).getPropertyValue(v).trim(); return x||f; }
async function loadGeoJSON(url){
  const r=await fetch(url,{cache:"no-store"});
  if(!r.ok) throw new Error(`${url} ${r.status}`);
  const j=await r.json();
  if(j?.type!=="FeatureCollection") throw new Error(`Invalid FeatureCollection for ${url}`);
  return j;
}
function isCorrectTag(v){ return v==="correct" || (typeof v==="string" && v.startsWith("correct")); }

// ---------- City helpers ----------
function parsePop(val){
  if(val==null) return 0;
  if(typeof val==="number") return Math.round(val);
  let s=String(val).trim(); if(!s) return 0;
  s=s.replace(/[\u00A0\u202F\u2009]/g," ");
  const low=s.toLowerCase();
  let m=low.match(/([\d.,]+)\s*(lakh|lac)\b/); if(m) return Math.round(parseFloat(m[1].replace(/[,\s]/g,""))*100000);
  m=low.match(/([\d.,]+)\s*crore\b/);         if(m) return Math.round(parseFloat(m[1].replace(/[,\s]/g,""))*10000000);
  m=low.match(/([\d.,]+)\s*m(n)?\b/);         if(m) return Math.round(parseFloat(m[1].replace(/[,\s]/g,""))*1000000);
  m=low.match(/([\d.,]+)\s*k\b/);             if(m) return Math.round(parseFloat(m[1].replace(/[,\s]/g,""))*1000);
  const n=parseFloat(s.replace(/[^\d.-]/g,"")); return isFinite(n)?Math.round(n):0;
}
function cityPop(props){
  let raw=getProp(props,KEYS.CITYPOP);
  if(raw==null){ for(const k of Object.keys(props)) if(/pop/i.test(k)){ raw=props[k]; break; } }
  return parsePop(raw);
}
function cityCat(n){ return n>=1000000?"mega":n>=200000?"large":n>=100000?"med":"small"; }

// ---------- Party colors ----------
const PARTY_ALIASES={
  inc:"inc",congress:"inc",indiannationalcongress:"inc",
  bjp:"bjp",bharatiyajanataparty:"bjp",
  ysrcp:"ysrcp",ysrcongress:"ysrcp",ysrcongressparty:"ysrcp",
  tdp:"tdp",telugudesamparty:"tdp",
  jsp:"jsp",janasena:"jsp",janasenaparty:"jsp",
  trs:"brs",brs:"brs",
  aimim:"aimim",mim:"aimim",
  ind:"ind",independent:"ind",
  others:"other", other:"other"
};
function normParty(raw){ const k=String(raw||"").toLowerCase().replace(/[^a-z]/g,""); return PARTY_ALIASES[k] || (k? "other":"other"); }
const PARTY_COLORS={
  inc:"var(--p-inc)",
  bjp:"var(--p-bjp)",
  ysrcp:"var(--p-ysrcp)",
  tdp:"var(--p-tdp)",
  jsp:"var(--p-jsp)",
  brs:"var(--p-brs)",
  aimim:"var(--p-aimim)",
  ind:"var(--p-other)",
  other:"var(--p-other)"
};
const partyColor = p => PARTY_COLORS[p]||"var(--p-other)";

// ---------- Game state ----------
const pGame     = (urlParams.get("game")||"DISTRICT").toUpperCase();
let game=["DISTRICT","RIVER","HIGHWAY","AC","PC","CITY","PEAK","WIN_AC","WIN_PC"].includes(pGame)?pGame:"DISTRICT";

let mode = $("#modeControls .active")?.dataset.mode || "BOTH";
let difficulty = $("#difficultyControls .active")?.dataset.diff || "NORMAL";
let playStyle = (game==="CITY"||game==="AC"||game==="PC") ? "TYPE" : "CLICK";

let districtFilter = "ALL";

let all={DISTRICT:[],RIVER:[],HIGHWAY:[],AC:[],PC:[],CITY:[],PEAK:[],WIN_AC:[],WIN_PC:[]};
let loaded={DISTRICT:false,RIVER:false,HIGHWAY:false,AC:false,PC:false,CITY:false,PEAK:false,WIN_AC:false,WIN_PC:false};

let pool=[], nonCityLayer=null, cityFG=null, selection={}, target=null;
let score=0, round=1, timer=0, isGameOver=false;

let stateTotals={ap:0,ts:0}, stateSolved={ap:0,ts:0};
let coveredPop=0,totalPop=0,catTotals={mega:0,large:0,med:0,small:0},catSolved={mega:0,large:0,med:0,small:0};
let cityByDistrict=new Map(), solvedCities=new Set(), districtFullSolved=new Set();
let districtCoveredAny = new Set();

// Per-district tallies for AC/PC/WIN_* (mode-limited, ignore current district filter)
let distTotalsAll = new Map();   // district -> total seats
let distSolvedAll = new Map();   // district -> solved seats (AC/PC via selection, WIN via completed seats)
let distCoveredAll = 0;          // districts with >=1 solved
let distFullAll    = 0;          // districts where solved == total
let distUniqueAll  = 0;          // distinct districts count in mode (Both=23, AP=13, TS=10 if data covers all)

// ---------- Tries / points ----------
const DISTRICT_MAX_TRIES = 3;
const DISTRICT_POINTS = [10,7,5];
let districtAttemptCount = 0;
let mustConfirmClickName = null;

const RIVER_POINTS   = [10,7,5]; let riverAttemptCount = 0;
const HIGHWAY_POINTS = [10,7,5]; let highwayAttemptCount = 0;

const AC_POINTS = [10,7,5]; let acAttemptCount = 0; let acTypeWrongsSinceLastCorrect = 0;
const PC_POINTS = [10,7,5]; let pcAttemptCount = 0; let pcTypeWrongsSinceLastCorrect = 0;

// ---------- Winners Match (shared) ----------
const WM_POINTS=[5,3,1];
const PARTY_SET_ALL = ["inc","bjp","ysrcp","tdp","jsp","brs","aimim","ind","other"];

let wm_attemptsByLabel={}, wm_lockedByLabel={}, wm_solvedYears=0;
let wm_currentSlots=[], wm_yearKeyByLabel={};
let wm_completedSeatNames=new Set(); let wm_seatsCompleted=0;
let wm_seatLayer=null;

// ---------- Winners UI ----------
function ensureMatchUI(){
  if(matchPanel && yearSlotsEl && partyTrayEl) return;
  const anchor = targetEl?.closest("section.card") || typePanel?.previousElementSibling || $(".sidebar .card");
  matchPanel = document.createElement("section");
  matchPanel.id = "matchPanel";
  matchPanel.className = "card block hidden";
  matchPanel.innerHTML = `
    <div class="small muted" style="margin-bottom:8px">
      Match winners by year (drag & drop). All parties available below.
    </div>
    <div id="yearSlots"></div>
    <div class="small muted" style="margin:10px 0 4px">Parties</div>
    <div id="partyTray"></div>
  `;
  anchor?.insertAdjacentElement("afterend", matchPanel);
  yearSlotsEl = matchPanel.querySelector("#yearSlots");
  partyTrayEl = matchPanel.querySelector("#partyTray");
}
function winnersAllowedLabelsForSeat(seat){
  const st=seat?.properties?.__state;
  if(game==="WIN_PC") return YEARS_PC_ALL.slice();
  return st==="Andhra Pradesh" ? YEARS_AC_AP.slice()
       : st==="Telangana"      ? YEARS_AC_TS.slice()
       : [...new Set([...YEARS_AC_AP, ...YEARS_AC_TS])];
}
function resolveYearKey(partyByYear, displayLabel){
  if(displayLabel in partyByYear) return displayLabel;
  if((displayLabel+"LS") in partyByYear) return displayLabel+"LS";
  return null;
}
function wm_buildTray(){
  partyTrayEl.innerHTML="";
  for(const p of PARTY_SET_ALL){
    const chip=document.createElement("div");
    chip.className="chip party";
    chip.draggable=true;
    chip.dataset.party=p;
    chip.innerHTML=`<span class="dot ${p}"></span><span>${p.toUpperCase()}</span>`;
    chip.addEventListener("dragstart", e=>{ e.dataTransfer.setData("text/party", p); });
    chip.addEventListener("click", ()=>{
      const sel=partyTrayEl.querySelector(".party.selected");
      if(sel && sel!==chip) sel.classList.remove("selected");
      chip.classList.toggle("selected");
    });
    partyTrayEl.appendChild(chip);
  }
}
function wm_clearSeatLayer(){ if(wm_seatLayer){ map.removeLayer(wm_seatLayer); wm_seatLayer=null; } }
function wm_highlightSeat(seat){
  wm_clearSeatLayer();
  if(!seat) return;
  wm_seatLayer = L.geoJSON(seat,{ style:{ color:"#111827", weight:3, fillOpacity:0 } }).addTo(map);
  try{ const b=wm_seatLayer.getBounds(); if(b?.isValid()) map.fitBounds(b,{padding:[24,24]}); }catch{}
  safeInvalidate();
}
function wm_pulseSeatFill(party){
  if(!wm_seatLayer) return;
  const color=partyColor(party);
  try{
    wm_seatLayer.setStyle({fillColor: color, fillOpacity:0.18});
    const layers = wm_seatLayer.getLayers ? wm_seatLayer.getLayers() : [];
    const anyPath = layers[0];
    if(anyPath && anyPath._path) anyPath._path.style.animation="fillPulse 800ms ease";
    setTimeout(()=>{
      wm_seatLayer.setStyle({fillOpacity:0});
      if(anyPath && anyPath._path) anyPath._path.style.animation="";
    }, 820);
  }catch{}
}
function wm_buildForTarget(){
  ensureMatchUI();
  if(!target){ yearSlotsEl.innerHTML=""; partyTrayEl.innerHTML=""; return; }
  const seat=target;
  const nm = seat.properties.__name;
  const yearMap = seat.properties.__partyByYear || {};

  const labels = winnersAllowedLabelsForSeat(seat);

  wm_currentSlots = [];
  wm_yearKeyByLabel={};
  wm_attemptsByLabel={}; wm_lockedByLabel={}; wm_solvedYears=0;

  for(const label of labels){
    const key = resolveYearKey(yearMap, label);
    const have = key !== null;
    wm_currentSlots.push({label, key, have});
    wm_yearKeyByLabel[label] = key;
    wm_attemptsByLabel[label]=0;
    wm_lockedByLabel[label]=false;
  }

  targetEl.textContent=nm;

  yearSlotsEl.innerHTML="";
  for(const s of wm_currentSlots){
    const slot=document.createElement("div");
    slot.className="slot";
    slot.dataset.yearlabel=s.label;
    slot.dataset.state = s.have ? "open" : "disabled";
    slot.innerHTML=`<div class="year">${s.label}</div><div class="drop"></div>`;
    if(s.have){
      slot.addEventListener("dragover", e=>{ e.preventDefault(); slot.classList.add("hover"); });
      slot.addEventListener("dragleave", ()=> slot.classList.remove("hover"));
      slot.addEventListener("drop", e=>{
        e.preventDefault(); slot.classList.remove("hover");
        const p=e.dataTransfer.getData("text/party");
        wm_attemptPlace(slot, p);
      });
      slot.addEventListener("click", ()=>{
        if(wm_lockedByLabel[s.label]) return;
        const sel=partyTrayEl.querySelector(".party.selected");
        if(sel) wm_attemptPlace(slot, sel.dataset.party);
      });
    }else{
      slot.querySelector(".drop").textContent="—";
    }
    yearSlotsEl.appendChild(slot);
  }

  wm_buildTray();
  wm_highlightSeat(seat);
  renderRightHUD();
}
function wm_attemptPlace(slot, party){
  const label=slot.dataset.yearlabel;
  const key = wm_yearKeyByLabel[label];
  if(!label || !key || wm_lockedByLabel[label]) return;

  const correct = normParty( (target.properties.__partyByYear||{})[key] );
  const guess = normParty(party);
  const dropDiv=slot.querySelector(".drop");
  dropDiv.innerHTML = `<span class="dot ${guess}"></span><strong>${guess.toUpperCase()}</strong>`;

  if(guess===correct){
    const t=wm_attemptsByLabel[label]||0;
    const gain=WM_POINTS[Math.min(t,WM_POINTS.length-1)]||0;
    score+=gain; round+=1; wm_solvedYears+=1;
    slot.classList.remove("wrong"); slot.classList.add("correct");
    slot.dataset.state="locked"; slot.dataset.party=guess.toUpperCase(); wm_lockedByLabel[label]=true;
    statusEl.textContent = `✓ ${label}: ${guess.toUpperCase()} (+${gain})`;
    wm_pulseSeatFill(guess);
    wm_maybeSeatComplete();
    updateHUD(); renderRightHUD();
  }else{
    wm_attemptsByLabel[label]=(wm_attemptsByLabel[label]||0)+1;
    slot.classList.remove("correct"); slot.classList.add("wrong");
    statusEl.textContent=`Not ${guess.toUpperCase()} for ${label}.`;
    if(wm_attemptsByLabel[label] >= 3){
      wm_revealYear(label, slot);
      wm_maybeSeatComplete();
      updateHUD(); renderRightHUD();
    }
  }
}
function wm_revealYear(label, slot){
  const key = wm_yearKeyByLabel[label];
  if(!key) return;
  const correct = normParty( (target.properties.__partyByYear||{})[key] );
  wm_lockedByLabel[label]=true; slot.dataset.state="locked";
  slot.classList.remove("wrong"); slot.classList.add("correct");
  slot.dataset.party=correct.toUpperCase();
  slot.querySelector(".drop").innerHTML = `<span class="dot ${correct}"></span><strong>${correct.toUpperCase()}</strong>`;
  statusEl.textContent=`Revealed ${label}: ${correct.toUpperCase()}.`;
  round+=1;
}
function wm_allYearsLocked(){ return wm_currentSlots.every(s => !s.have || wm_lockedByLabel[s.label]); }
function wm_maybeSeatComplete(){
  if(!wm_allYearsLocked()) return;
  wm_completedSeatNames.add(target.properties.__name);
  wm_seatsCompleted=wm_completedSeatNames.size;
  statusEl.textContent=`Seat complete! ${wm_seatsCompleted}/${pool.length} seats done.`;
}
function wm_revealAll(){
  if(!target) return;
  for(const s of wm_currentSlots){
    if(!s.have) continue;
    if(!wm_lockedByLabel[s.label]){
      const slot=yearSlotsEl.querySelector(`.slot[data-yearlabel="${s.label}"]`);
      if(slot) wm_revealYear(s.label, slot);
    }
  }
  wm_maybeSeatComplete();
}

// ---------- Loaders ----------
function normalizeFeatures(fc,nameKeys){
  const out=[];
  for(const f of (fc.features||[])){
    const nm=normalizeLabel(getProp(f.properties,nameKeys));
    if(!nm) continue;
    const st=normalizeState(getProp(f.properties,KEYS.STATE)||"Unknown");
    out.push({...f, properties:{...f.properties, __name:nm, __state:st}});
  }
  return out;
}
async function ensure(key){
  if(loaded[key]) return true;
  try{
    const fc=await loadGeoJSON(PATHS[key]);
    let feats=[];
    if(key==="DISTRICT"){
      feats = normalizeFeatures(fc, KEYS.DISTRICT);
    } else if(key==="RIVER"){
      feats = normalizeFeatures(fc, KEYS.RIVER);
    } else if(key==="HIGHWAY"){
      feats = normalizeFeatures(fc, KEYS.HIGHWAY);
    } else if(key==="AC" || key==="PC"){
      feats = fc.features.map(f=>{
        const nm  = normalizeLabel(getProp(f.properties, key==="AC"?KEYS.AC:KEYS.PC));
        const st  = normalizeState(getProp(f.properties, KEYS.STATE));
        // EXACTLY DISTRICT (fallback to REGION only if missing/empty)
        let dist = normalizeLabel(getProp(f.properties, KEYS.DISTRICT) || "");
        if(!dist) dist = normalizeLabel(getProp(f.properties, KEYS.REGION) || "");
        return {...f, properties:{...f.properties, __name:nm, __state:st, __district:dist}};
      }).filter(f=>!!f.properties.__name);
    } else if(key==="CITY"){
      feats = fc.features.map(f=>{
        const nm=normalizeLabel(getProp(f.properties, KEYS.CITYNAME));
        const st=normalizeState(getProp(f.properties, KEYS.STATE));
        const dist=normalizeLabel(getProp(f.properties, KEYS.DISTRICT)||"");
        return {...f, properties:{...f.properties,__name:nm,__state:st,__district:dist}};
      }).filter(f=>!!f.properties.__name);
    } else if(key==="PEAK"){
      feats = fc.features.map(f=>{
        const nm=normalizeLabel(getProp(f.properties, KEYS.PEAKNAME));
        const st=normalizeState(getProp(f.properties, KEYS.STATE));
        const notes=getProp(f.properties,KEYS.PEAKNOTES)||"";
        const elev=getProp(f.properties,KEYS.ELEV)||"";
        const cat =getProp(f.properties,KEYS.PEAKCAT)||"";
        return {...f, properties:{...f.properties,__name:nm,__state:st,__notes:String(notes),__elev:String(elev),__cat:String(cat)}};
      }).filter(f=>!!f.properties.__name);
    } else if(key==="WIN_AC"||key==="WIN_PC"){
      feats = fc.features.map(f=>{
        const seatKeys = key==="WIN_AC" ? KEYS.AC : KEYS.PC;
        const nm  = normalizeLabel(getProp(f.properties, seatKeys));
        const st  = normalizeState(getProp(f.properties, KEYS.STATE));
        let dist  = normalizeLabel(getProp(f.properties, KEYS.DISTRICT) || "");
        if(!dist) dist = normalizeLabel(getProp(f.properties, KEYS.REGION) || "");
        const partyByYear={};
        for(const yf of YEAR_FIELDS){
          const val=getProp(f.properties, yf);
          if(val!=null && String(val).trim()!==""){ partyByYear[yf]=normParty(val); }
        }
        return {...f, properties:{...f.properties,__name:nm,__state:st,__district:dist,__partyByYear:partyByYear}};
      }).filter(f=>!!f.properties.__name);
    }
    all[key]=feats; loaded[key]=true; return true;
  }catch(e){
    console.warn("Load failed:",key,e);
    loaded[key]=false;
    return false;
  }
}

// ---------- Pools / tallies ----------
function rebuildPool(){
  const feats = all[game]||[];
  pool = feats.filter(f=>{
    const st=f.properties.__state;
    if(mode==="AP" && !(st==="Andhra Pradesh" || st==="Unknown")) return false;
    if(mode==="TS" && !(st==="Telangana" || st==="Unknown")) return false;
    if(districtFilter!=="ALL"){
      const want = normalizeLabel(districtFilter);
      const d  = normalizeLabel(f.properties.__district || "");
      if (d !== want) return false;
    }
    return true;
  });

  if(countEl) countEl.textContent = pool.length;

  if(game==="CITY"){
    totalPop=0; catTotals={mega:0,large:0,med:0,small:0}; cityByDistrict.clear(); districtFullSolved.clear();
    for(const f of pool){
      const pop=cityPop(f.properties); totalPop+=pop; catTotals[cityCat(pop)]++;
      const d=f.properties.__district||"";
      if(d){ if(!cityByDistrict.has(d)) cityByDistrict.set(d,[]); cityByDistrict.get(d).push(f.properties.__name); }
    }
    recalcCityProgress();
  }

  if(game==="DISTRICT"||game==="AC"||game==="PC"){
    stateTotals={ap:0,ts:0}; stateSolved={ap:0,ts:0};
    for(const f of pool){
      const bucket = f.properties.__state==="Andhra Pradesh" ? "ap" : f.properties.__state==="Telangana" ? "ts" : null;
      if(bucket){ stateTotals[bucket]++; if(isCorrectTag(selection[f.properties.__name])) stateSolved[bucket]++; }
    }
  }

  // AC/PC/WIN_* district tallies across all mode-limited seats (ignore current district filter)
  if (game==="AC" || game==="PC" || game==="WIN_AC" || game==="WIN_PC"){
    distTotalsAll.clear();
    distSolvedAll.clear();

    const modeFiltered = (all[game]||[]).filter(f=>{
      const st=f.properties.__state;
      if(mode==="AP" && !(st==="Andhra Pradesh" || st==="Unknown")) return false;
      if(mode==="TS" && !(st==="Telangana" || st==="Unknown")) return false;
      return true;
    });

    const isSolved = (f)=>{
      if(game==="WIN_AC"||game==="WIN_PC") return wm_completedSeatNames.has(f.properties.__name);
      return isCorrectTag(selection[f.properties.__name]);
    };

    for(const f of modeFiltered){
      const d = normalizeLabel(f.properties.__district||"");
      if(!d) continue;
      distTotalsAll.set(d,(distTotalsAll.get(d)||0)+1);
      if(isSolved(f)) distSolvedAll.set(d,(distSolvedAll.get(d)||0)+1);
    }

    distUniqueAll = distTotalsAll.size;
    distCoveredAll = 0; distFullAll = 0;
    for(const [d,tot] of distTotalsAll.entries()){
      const s = distSolvedAll.get(d)||0;
      if(s>0) distCoveredAll++;
      if(s===tot) distFullAll++;
    }
  }

  if(game==="WIN_AC"||game==="WIN_PC"){
    wm_completedSeatNames = new Set([...wm_completedSeatNames].filter(n => pool.some(f=>f.properties.__name===n)));
    wm_seatsCompleted = wm_completedSeatNames.size;
  }

  rebuildDistrictFilterOptions();
}

function recalcCityProgress(){
  coveredPop=0; catSolved={mega:0,large:0,med:0,small:0};
  solvedCities.clear(); districtFullSolved.clear(); districtCoveredAny.clear();

  for(const f of pool){
    const nm=f.properties.__name; const pop=cityPop(f.properties);
    if(isCorrectTag(selection[nm])){ coveredPop+=pop; catSolved[cityCat(pop)]++; solvedCities.add(nm); }
  }
  for(const [d,list] of cityByDistrict){
    if(!d) continue;
    const allSolved = list.length && list.every(n=>solvedCities.has(n));
    if(allSolved) districtFullSolved.add(d);
    if(list.some(n=>solvedCities.has(n))) districtCoveredAny.add(d);
  }
}
function remainingNames(){ return pool.map(f=>f.properties.__name).filter(n=>!isCorrectTag(selection[n])); }
function oldDistrictDenom(){ if(mode==="AP") return 13; if(mode==="TS") return 10; return 23; }

// ---------- Target ----------
function pickNewTarget(){
  districtAttemptCount=0; mustConfirmClickName=null;
  riverAttemptCount=0; highwayAttemptCount=0; acAttemptCount=0; pcAttemptCount=0;

  if(game==="WIN_AC"||game==="WIN_PC"){
    const remain = pool.map(f=>f.properties.__name).filter(n=>!wm_completedSeatNames.has(n));
    if(!remain.length){ endGame(); return; }
    const nm = remain[Math.floor(Math.random()*remain.length)];
    target = pool.find(f=>f.properties.__name===nm) || null;
    wm_buildForTarget();
    return;
  }

  if((game==="CITY"||game==="AC"||game==="PC") && playStyle==="TYPE"){
    target=null;
    targetEl.textContent=`(${remainingNames().length}/${pool.length} remaining)`;
    return;
  }
  const remain=remainingNames();
  if(!remain.length){ endGame(); return; }
  const nm = remain[Math.floor(Math.random()*remain.length)];
  target = pool.find(f=>f.properties.__name===nm)||null;
  targetEl.textContent = target ? target.properties.__name : "—";
}

// ---------- Layers ----------
const cityRenderer = L.svg({ padding: 0.5 });

function cityStyle(cat,glow=false){
  const fill = cat==="mega"  ? "#facc15"
             : cat==="large" ? "#ef4444"
             : cat==="med"   ? "#3b82f6"
             :                 "#22c55e";
  const stroke = cat==="mega"  ? "#c4a30a"
               : cat==="large" ? "#aa1e1e"
               : cat==="med"   ? "#1f61cf"
               :                 "#148443";
  const radius = cat==="mega" ? 8 : cat==="large" ? 7 : cat==="med" ? 6 : 5;
  return { radius, color: stroke, weight: glow?3:1.8, opacity:1, fillColor:fill, fillOpacity:0.92 };
}

const IN_LON_MIN = 65, IN_LON_MAX = 98;
const IN_LAT_MIN = 5,  IN_LAT_MAX = 37;
function looksLon(x){ return x>=IN_LON_MIN && x<=IN_LON_MAX; }
function looksLat(x){ return x>=IN_LAT_MIN && x<=IN_LAT_MAX; }
function toLatLngAutodetect(a,b){
  if(looksLon(a)&&looksLat(b)) return L.latLng(b,a);
  if(looksLon(b)&&looksLat(a)) return L.latLng(a,b);
  if(looksLat(a)&&!looksLat(b)) return L.latLng(a,b);
  if(looksLat(b)&&!looksLat(a)) return L.latLng(b,a);
  return Math.abs(a)>Math.abs(b) ? L.latLng(b,a) : L.latLng(a,b);
}
function extractFirstPointCoords(geom){
  if(!geom) return null;
  if(geom.type==="Point") return geom.coordinates;
  if(geom.type==="MultiPoint") return geom.coordinates?.[0];
  if(geom.type==="GeometryCollection"){
    const g=(geom.geometries||[]).find(x=>x.type==="Point"||x.type==="MultiPoint");
    return g ? extractFirstPointCoords(g) : null;
  }
  return null;
}
function getPointLatLng(feature){
  const c = extractFirstPointCoords(feature?.geometry);
  if(!Array.isArray(c)||c.length<2) return null;
  const a=Number(c[0]), b=Number(c[1]);
  if(!isFinite(a)||!isFinite(b)) return null;
  return toLatLngAutodetect(a,b);
}

function styleForFeature(f){
  const sel  = selection[f.properties.__name];
  const type = f.geometry?.type || "";
  const isLine = /LineString/i.test(type);

  // Points (CITY/PEAK handled elsewhere)
  if (game === "CITY" || game === "PEAK") return {};

  // --- Base stroke/fill (neutral) ---
  let color = "#64748b";
  let weight = 1.2;
  let fillColor = undefined;
  let fillOpacity = 0;

  if (game === "RIVER") {
    color = css("--river-stroke", "#64748b");
    weight = 4;
    fillOpacity = 0;
  } else if (game === "HIGHWAY") {
    color = css("--hwy-stroke", "#475569");
    weight = 3;
    fillOpacity = 0;
  } else if (game === "AC" || game === "PC" || game === "WIN_AC" || game === "WIN_PC") {
    color = "#64748b";
    weight = 1.2;
    fillOpacity = 0;
  } else {
    const ap = (f.properties.__state === "Andhra Pradesh");
    color     = ap ? css("--ap-stroke", "#3b82f6") : css("--ts-stroke", "#a855f7");
    fillColor = ap ? css("--ap-fill",   "#93c5fd") : css("--ts-fill",   "#d8b4fe");
    weight = 2;
    fillOpacity = isLine ? 0 : 0.45;
  }

  // --- Guess/reveal overrides ---
  if (isCorrectTag(sel)) {
    const first  = sel === "correct" || sel === "correct1";
    const second = sel === "correct2";
    const stroke = first ? css("--ok-stroke",  "#22c55e")
               : second ? css("--ok2-stroke", "#16a34a")
                        : css("--ok3-stroke", "#15803d");
    const fill   = first ? css("--ok-fill",  "#86efac")
               : second ? css("--ok2-fill", "#b7e7c8")
                        : css("--ok3-fill", "#d6f2e0");

    color = stroke;
    fillColor = fill;
    weight = isLine ? 6 : 3;
    fillOpacity = isLine ? 0 : 0.75;
    return isLine ? { color, weight } : { color, weight, fillColor, fillOpacity };
  }

  if (sel === "wrong") {
    color = css("--bad-stroke", "#ef4444");
    fillColor = css("--bad-fill", "#fca5a5");
    weight = isLine ? 6 : 3;
    fillOpacity = isLine ? 0 : 0.7;
    return isLine ? { color, weight } : { color, weight, fillColor, fillOpacity };
  }

  if (sel === "reveal") {
    const rStroke = "#f59e0b", rFill = "#fde68a";
    return isLine ? { color: rStroke, weight: 6 }
                  : { color: rStroke, weight: 3, fillColor: rFill, fillOpacity: 0.8 };
  }

  // Default (neutral)
  return isLine ? { color, weight } : { color, weight, fillColor, fillOpacity };
}

function bindCityLabel(layer, name){
  if(!layer || !name || layer._cityLabelBound) return;
  layer.bindTooltip(name, { permanent:true, direction:"top", offset:[0,-6], className:"city-label" });
  layer._cityLabelBound = true;
}

function rebuildLayer(fit=true){
  // city-mode class only for CITY game
  map.getContainer().classList.toggle("city-mode", game==="CITY");

  if(nonCityLayer){ nonCityLayer.remove(); nonCityLayer=null; }
  wm_clearSeatLayer();

  if(game==="CITY"){
    if(!cityFG){ cityFG = L.featureGroup([]).addTo(map); }
    cityFG.clearLayers();

    const visible = (playStyle==="TYPE")
      ? pool.filter(f => isCorrectTag(selection[f.properties.__name]))
      : pool;

    visible.forEach(f=>{
      const nm  = f.properties.__name;
      const pop = cityPop(f.properties);
      const cat = cityCat(pop);
      const ll  = getPointLatLng(f);
      if(!ll) return;
      const glow = (isCorrectTag(selection[nm]) && playStyle==="CLICK");
      const marker = L.circleMarker(ll, { renderer:cityRenderer, ...cityStyle(cat,glow) });
      marker.feature = f;
      if(playStyle==="CLICK"){ marker.on("click", onFeatureClick); }
      if(isCorrectTag(selection[nm])) bindCityLabel(marker, nm);
      cityFG.addLayer(marker);
    });

    if(fit && visible.length){
      try{ const b = cityFG.getBounds(); if(b?.isValid()) map.fitBounds(b,{padding:[20,20]}); }catch{}
    }
    safeInvalidate();
    return;
  }

  if(game==="PEAK"){
    nonCityLayer = L.geoJSON({type:"FeatureCollection",features:pool},{
      pointToLayer:(feature,latlng)=>{
        const icon=L.divIcon({className:"leaflet-div-icon peak-ico",html:`<svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 3l9 18H3z" fill="#f59e0b" stroke="#92400e" stroke-width="1.2"/></svg>`,iconSize:[18,18],iconAnchor:[9,9]});
        return L.marker(latlng,{icon});
      },
      onEachFeature:(f,layer)=> layer.on({click:onFeatureClick})
    }).addTo(map);
  }
  else {
    nonCityLayer = L.geoJSON({type:"FeatureCollection",features:pool},{
      style:styleForFeature,
      onEachFeature:(f,layer)=> layer.on({click:onFeatureClick})
    }).addTo(map);
  }

  if(fit){
    const b=nonCityLayer.getBounds();
    if(b?.isValid()) map.fitBounds(b,{padding:[20,20]});
  }
  safeInvalidate();
}

function redrawStyles(){
  if(game==="CITY"){
    if(!cityFG) return;
    cityFG.eachLayer(layer=>{
      const f=layer.feature; if(!f) return;
      const nm=f.properties.__name;
      const pop=cityPop(f.properties);
      const cat=cityCat(pop);
      const glow=(isCorrectTag(selection[nm]) && playStyle==="CLICK");
      layer.setStyle?.(cityStyle(cat,glow));
      if(isCorrectTag(selection[nm])) bindCityLabel(layer, nm);
    });
    return;
  }
  nonCityLayer?.setStyle?.(styleForFeature);
}

// ---------- District filter UI ----------
function ensureDistrictFilterUI(){
  if(districtSection && districtSelect) return;
  const anchor = $("#modeControls")?.closest("section") || $("#modeControls");
  districtSection = document.createElement("section");
  districtSection.id = "districtControls";
  districtSection.className = "block";
  districtSection.innerHTML = `
    <div class="small muted" style="margin-bottom:6px">Filter by district</div>
    <select id="districtSelect" class="input"></select>
  `;
  anchor?.insertAdjacentElement("afterend", districtSection);
  districtSelect = districtSection.querySelector("#districtSelect");
  districtSelect.addEventListener("change", ()=>{
    districtFilter = districtSelect.value || "ALL";
    selection={}; score=0; round=1; isGameOver=false;
    wm_completedSeatNames.clear(); wm_seatsCompleted=0;
    rebuildPool();
    pickNewTarget();
    rebuildLayer(true);
    renderRightHUD();
    updateHUD();
  });
}
function rebuildDistrictFilterOptions(){
  ensureDistrictFilterUI();
  const show = ["AC","PC","WIN_AC","WIN_PC"].includes(game);
  districtSection?.classList.toggle("hidden", !show);
  if(!show) return;

  const districts = new Set();
  for(const f of all[game]||[]){
    const st=f.properties.__state;
    if(mode==="AP" && st!=="Andhra Pradesh" && st!=="Unknown") continue;
    if(mode==="TS" && st!=="Telangana" && st!=="Unknown") continue;
    const d = normalizeLabel(f.properties.__district||"");
    if(d) districts.add(d);
  }
  const arr=[...districts].sort((a,b)=>a.localeCompare(b));
  const cur = districtFilter;
  districtSelect.innerHTML =
    `<option value="ALL">All districts</option>` +
    arr.map(d=>`<option value="${d}">${d}</option>`).join("");
  if(arr.includes(cur)) districtSelect.value = cur; else { districtSelect.value="ALL"; districtFilter="ALL"; }
}

// ---------- Interaction ----------
function onFeatureClick(e){
  const f=e.target.feature;

  if(game==="WIN_AC" || game==="WIN_PC"){
    target = f;
    wm_buildForTarget();
    statusEl.textContent = "Drag party chips to the year slots.";
    return;
  }

  if(isGameOver) return;

  // block clicks only in TYPE mode
  if( (playStyle==="TYPE") && (game==="CITY" || game==="AC" || game==="PC") ) return;

  const nm=f.properties.__name;

  if (game === "DISTRICT") {
    if (mustConfirmClickName) {
      if (nm === mustConfirmClickName) {
        selection[nm] = "correct3"; round += 1; statusEl.textContent = "Moving on…";
        rebuildPool(); renderRightHUD(); redrawStyles(); pickNewTarget(); updateHUD();
      } else { statusEl.textContent = "Click the highlighted district to continue."; }
      return;
    }
    if (!target || isCorrectTag(selection[nm])) return;
    if (nm === target.properties.__name) {
      const award = DISTRICT_POINTS[Math.min(districtAttemptCount, DISTRICT_POINTS.length-1)];
      selection[nm] = districtAttemptCount===0 ? "correct1" : districtAttemptCount===1 ? "correct2" : "correct3";
      score += award; round += 1; statusEl.textContent = `Correct! +${award} points`;
      rebuildPool(); renderRightHUD(); redrawStyles(); pickNewTarget(); updateHUD();
    } else {
      selection[nm] = "wrong"; districtAttemptCount++;
      const left = DISTRICT_MAX_TRIES - districtAttemptCount;
      if (left > 0){ statusEl.textContent = `Wrong! ${left} ${left===1?'try':'tries'} left.`; redrawStyles(); }
      else { const ans = target.properties.__name; selection[ans] = "reveal"; mustConfirmClickName = ans;
             statusEl.textContent = "Out of tries! Click the highlighted district to continue."; redrawStyles(); }
    }
    return;
  }

  if (game === "RIVER") {
    if (!target || isCorrectTag(selection[nm])) return;
    if (nm === target.properties.__name) {
      const idx = Math.min(riverAttemptCount, RIVER_POINTS.length-1);
      selection[nm] = idx===0 ? "correct1" : idx===1 ? "correct2" : "correct3";
      score += RIVER_POINTS[idx]; round += 1;
      statusEl.textContent = `Correct! +${RIVER_POINTS[idx]} points`;
      redrawStyles(); updateHUD(); pickNewTarget();
    } else { selection[nm] = "wrong"; riverAttemptCount++; statusEl.textContent = "Try again…"; redrawStyles(); }
    return;
  }

  if (game === "HIGHWAY") {
    if (!target || isCorrectTag(selection[nm])) return;
    if (nm === target.properties.__name) {
      const idx = Math.min(highwayAttemptCount, HIGHWAY_POINTS.length-1);
      selection[nm] = idx===0 ? "correct1" : idx===1 ? "correct2" : "correct3";
      score += HIGHWAY_POINTS[idx]; round += 1;
      statusEl.textContent = `Correct! +${HIGHWAY_POINTS[idx]} points`;
      redrawStyles(); updateHUD(); pickNewTarget();
    } else { selection[nm] = "wrong"; highwayAttemptCount++; statusEl.textContent = "Try again…"; redrawStyles(); }
    return;
  }

  if (game === "AC" && playStyle==="CLICK") {
    if (!target || isCorrectTag(selection[nm])) return;
    if (nm === target.properties.__name) {
      const idx = Math.min(acAttemptCount, AC_POINTS.length-1);
      selection[nm] = idx===0 ? "correct1" : idx===1 ? "correct2" : "correct3";
      score += AC_POINTS[idx]; round += 1;
      statusEl.textContent = `Correct! +${AC_POINTS[idx]} points`;
      rebuildPool(); renderRightHUD(); redrawStyles(); updateHUD(); pickNewTarget();
    } else { selection[nm] = "wrong"; acAttemptCount++; statusEl.textContent = "Try again…"; redrawStyles(); }
    return;
  }

  if (game === "PC" && playStyle==="CLICK") {
    if (!target || isCorrectTag(selection[nm])) return;
    if (nm === target.properties.__name) {
      const idx = Math.min(pcAttemptCount, PC_POINTS.length-1);
      selection[nm] = idx===0 ? "correct1" : idx===1 ? "correct2" : "correct3";
      score += PC_POINTS[idx]; round += 1;
      statusEl.textContent = `Correct! +${PC_POINTS[idx]} points`;
      rebuildPool(); renderRightHUD(); redrawStyles(); updateHUD(); pickNewTarget();
    } else { selection[nm] = "wrong"; pcAttemptCount++; statusEl.textContent = "Try again…"; redrawStyles(); }
    return;
  }

  // CITY — Click mode
  if (game === "CITY" && playStyle==="CLICK") {
    if (!target || isCorrectTag(selection[nm])) return;
    if (nm === target.properties.__name) {
      selection[nm] = "correct"; score += 10; round += 1;
      statusEl.textContent = "Correct! ✨";
      bindCityLabel(e.target, nm);
      recalcCityProgress(); renderRightHUD(); updateHUD();
      pickNewTarget(); redrawStyles();
    } else {
      selection[nm] = "wrong"; statusEl.textContent = "Try again…"; redrawStyles();
    }
    return;
  }
}

// ---------- UI / Visibility ----------
function ensureRevealNextButtons(){
  if(revealBtn) return;
  const controls = skipBtn?.parentElement;
  if(!controls) return;
  revealBtn = document.createElement("button");
  revealBtn.id = "revealBtn";
  revealBtn.className = "btn";
  revealBtn.textContent = "Reveal";
  controls.insertBefore(revealBtn, skipBtn); // [Reveal] [Next] [Restart]
  revealBtn.addEventListener("click", ()=>{ if(game==="WIN_AC"||game==="WIN_PC") wm_revealAll(); });
}
function updateLabels(){
  const lab=$(".card .small.muted");
  if(lab){
    if((game==="CITY"||game==="AC"||game==="PC") && playStyle==="TYPE"){
      lab.textContent=`Type all ${game==="CITY"?"cities":game==="AC"?"ACs":"PCs"}`;
    } else if (game==="WIN_AC" || game==="WIN_PC") {
      lab.textContent="Match winners by year (drag & drop)";
    } else {
      lab.textContent=`Find this ${game==="DISTRICT"?"district":game==="RIVER"?"river":game==="HIGHWAY"?"highway":game}`;
    }
  }
  if(sourceTag) sourceTag.textContent = `geojson: ${loaded[game]?"live":"error"} (${game.toLowerCase()})`;
  if (skipBtn){
    if(game==="WIN_AC"||game==="WIN_PC") skipBtn.textContent="Next";
    else ((game==="AC"||game==="PC") && playStyle==="TYPE") ? skipBtn.textContent="Give Up" : skipBtn.textContent="Skip";
  }
}
function applyVisibility(){
  const modeBlock = $("#modeControls")?.closest("section") || $("#modeControls");
  (game==="RIVER"||game==="HIGHWAY") ? modeBlock.classList.add("hidden") : modeBlock.classList.remove("hidden");

  const playBlock = $("#playControls")?.closest("section") || $("#playControls");
  ((game==="CITY"||game==="AC"||game==="PC") ? playBlock.classList.remove("hidden") : playBlock.classList.add("hidden"));

  const showType = ((game==="CITY"||game==="AC"||game==="PC") && playStyle==="TYPE");
  showType ? typePanel.classList.remove("hidden") : typePanel.classList.add("hidden");

  mcRow.classList.add("hidden");
  yearControls.classList.add("hidden");

  ensureMatchUI();
  ensureRevealNextButtons();
  ensureDistrictFilterUI();

  if(game==="WIN_AC"||game==="WIN_PC"){
    matchPanel.classList.remove("hidden");
    revealBtn?.classList.remove("hidden");
  }else{
    matchPanel.classList.add("hidden");
    revealBtn?.classList.add("hidden");
  }
}

// ---------- HUD helpers ----------
function districtBreakdownHTML(){
  const rows=[];
  const entries=[...cityByDistrict.entries()].sort((a,b)=>{
    const aSolved = a[1].filter(n=>solvedCities.has(n)).length;
    const bSolved = b[1].filter(n=>solvedCities.has(n)).length;
    if(bSolved!==aSolved) return bSolved-aSolved;
    return a[0].localeCompare(b[0]);
  });
  for(const [d,list] of entries){
    if(!d) continue;
    const solved = list.filter(n=>solvedCities.has(n)).length;
    const total  = list.length;
    rows.push(`<div class="row"><span>${d}</span><strong>${solved}/${total}</strong></div>`);
  }
  if(!rows.length) return `<div class="small muted" style="margin-top:6px">No districts found in city data.</div>`;
  return rows.join("");
}
function populationBreakdownHTML(){
  const buckets = { mega:[], large:[], med:[], small:[] };
  for(const f of pool){
    const nm=f.properties.__name;
    buckets[cityCat(cityPop(f.properties))].push(nm);
  }
  return [
    ["mega","1M+"],["large","200k–1M"],["med","100k–200k"],["small","<100k"]
  ].map(([k,label])=>{
    const all=buckets[k].sort();
    const s=all.filter(n=>solvedCities.has(n));
    const u=all.filter(n=>!solvedCities.has(n));
    const left = u.map(n=>`<span class="spoiler">[${n}]</span>`).join(", ");
    const solved = s.join(", ");
    return `
      <div class="row"><span><strong>${label}</strong></span><strong>${s.length}/${all.length}</strong></div>
      ${s.length?`<div class="small" style="margin:6px 0"><strong>✓ Solved:</strong> ${solved}</div>`:""}
      ${u.length?`<div class="small muted" style="margin:6px 0"><strong>Left:</strong> ${left}</div>`:""}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0"/>
    `;
  }).join("");
}
function byDistrictRowsHTML(){
  const rows=[...distTotalsAll.entries()]
    .sort((a,b)=>{
      const as=distSolvedAll.get(a[0])||0, bs=distSolvedAll.get(b[0])||0;
      if(bs!==as) return bs-as;
      return a[0].localeCompare(b[0]);
    })
    .map(([d,tot])=>{
      const s=distSolvedAll.get(d)||0;
      return `<div class="row"><span>${d}</span><strong>${s}/${tot}</strong></div>`;
    });
  if(!rows.length) return `<div class="small muted" style="margin-top:6px">No districts in current mode.</div>`;
  return rows.join("");
}

// ---------- HUD ----------
function renderRightHUD(){
  if(!rightHud) return;

  if(game==="CITY"){
    const pct = totalPop>0 ? Math.round((coveredPop/totalPop)*1000)/10 : 0;
    const citiesSolved = solvedCities.size;
    const citiesTotal  = pool.length;
    const oldDistCovered = districtCoveredAny.size;
    const oldDistTotal   = oldDistrictDenom();

    rightHud.innerHTML = `
      <div class="hud-card">
        <div class="hud-title">Cities progress</div>
        <div class="row"><span>Total urban pop covered</span><strong>${coveredPop.toLocaleString()} (${pct}%)</strong></div>
        <div class="row"><span>Cities solved</span><strong>${citiesSolved}/${citiesTotal}</strong></div>
        <div class="grid2" style="margin-top:6px">
          <div class="chip cat-mega">1M+ <strong>${catSolved.mega}/${catTotals.mega}</strong></div>
          <div class="chip cat-large">200k–1M <strong>${catSolved.large}/${catTotals.large}</strong></div>
          <div class="chip cat-med">100k–200k <strong>${catSolved.med}/${catTotals.med}</strong></div>
          <div class="chip cat-small">&lt;100k <strong>${catSolved.small}/${catTotals.small}</strong></div>
        </div>
        <details style="margin-top:8px">
          <summary class="small" style="cursor:pointer;color:#0f172a">By population (expand)</summary>
          <div style="margin-top:8px">${populationBreakdownHTML()}</div>
          <div class="small muted" style="margin-top:4px">Tip: click a bracketed name to reveal.</div>
        </details>
        <details style="margin-top:8px">
          <summary>
            <div class="row"><span>Old districts covered</span><strong>${oldDistCovered}/${oldDistTotal}</strong></div>
          </summary>
          <div style="margin-top:8px">${districtBreakdownHTML()}</div>
        </details>
      </div>`;
    // Let the right HUD scroll without zooming the map
    if (rightHud) {
      if (window.L && L.DomEvent) {
        L.DomEvent.disableScrollPropagation(rightHud);
        L.DomEvent.disableClickPropagation(rightHud);
      } else {
        ["wheel","mousewheel","DOMMouseScroll","touchmove"].forEach(ev =>
          rightHud.addEventListener(ev, e => e.stopPropagation(), { passive:false })
        );
      }
    }
    safeInvalidate(); 
    return;
  }

  if (game==="AC"||game==="PC"||game==="DISTRICT"){
    let extra = "";
    if (game!=="DISTRICT") {
      const allTotal = (mode==="AP") ? 13 : (mode==="TS") ? 10 : 23; // fixed denominator expectation
      if(districtFilter==="ALL"){
        extra = `
          <div class="row"><span>Districts covered</span><strong>${distCoveredAll}/${allTotal}</strong></div>
          <div class="row"><span>Fully solved districts</span><strong>${distFullAll}/${allTotal}</strong></div>
          <details style="margin-top:8px">
            <summary class="small" style="cursor:pointer;color:#0f172a">By district (expand)</summary>
            <div style="margin-top:8px">${byDistrictRowsHTML()}</div>
          </details>
        `;
      }else{
        const d = normalizeLabel(districtFilter);
        const s = distSolvedAll.get(d)||0;
        const t = distTotalsAll.get(d)||0;
        extra = `<div class="row"><span>${districtFilter}</span><strong>${s}/${t}</strong></div>`;
      }
    }
    const totSolved = stateSolved.ap + stateSolved.ts; const tot = stateTotals.ap + stateTotals.ts;
    rightHud.innerHTML = `
      <div class="hud-card"><div class="hud-title">${game==="DISTRICT"?"Districts":game}</div>
        <div class="row"><span>AP</span><strong>${stateSolved.ap}/${stateTotals.ap}</strong></div>
        <div class="row"><span>TS</span><strong>${stateSolved.ts}/${stateTotals.ts}</strong></div>
        <div class="row"><span>Total</span><strong>${totSolved}/${tot}</strong></div>
        ${extra}
      </div>`;
    return;
  }

  if (game==="WIN_AC" || game==="WIN_PC"){
    const seat = target;
    let rows = "";
    if(seat){
      const mapY = seat.properties.__partyByYear||{};
      rows = wm_currentSlots.map(s=>{
        const locked = wm_lockedByLabel[s.label];
        const val = s.have ? (locked ? normParty(mapY[s.key]).toUpperCase() : "?") : "—";
        return `<div class="row"><span>${s.label}</span><strong>${val}</strong></div>`;
      }).join("");
    }

    const allTotal = (mode==="AP") ? 13 : (mode==="TS") ? 10 : 23;
    const districtBlock = (districtFilter==="ALL")
      ? `<div class="row"><span>Districts covered</span><strong>${distCoveredAll}/${allTotal}</strong></div>
         <div class="row"><span>Fully solved districts</span><strong>${distFullAll}/${allTotal}</strong></div>
         <details style="margin-top:8px">
           <summary class="small" style="cursor:pointer;color:#0f172a">By district (expand)</summary>
           <div style="margin-top:8px">${byDistrictRowsHTML()}</div>
         </details>`
      : (()=>{ const d=normalizeLabel(districtFilter); return `<div class="row"><span>${districtFilter}</span><strong>${(distSolvedAll.get(d)||0)}/${(distTotalsAll.get(d)||0)}</strong></div>`; })();

    rightHud.innerHTML = `
      <div class="hud-card">
        <div class="hud-title">${game==="WIN_AC"?"Winners Match (AC)":"Winners Match (PC)"}</div>
        <div class="row"><span>Seat progress</span><strong>${wm_solvedYears}/${wm_currentSlots.filter(s=>s.have).length||0}</strong></div>
        <div class="row"><span>Seats completed</span><strong>${wm_seatsCompleted}/${pool.length}</strong></div>
        ${rows ? `<div style="margin-top:8px">${rows}</div>` : ""}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:10px 0"/>
        ${districtBlock}
      </div>
    `;
    return;
  }

  rightHud.innerHTML = "";
  safeInvalidate();
}

// ---------- Labels / context ----------
async function addDistrictContext(){
  try{
    const fc=await loadGeoJSON(PATHS.DISTRICT);
    contextDistrictsFC=fc;
    refreshDistrictContextForMode();
  }catch{}
}
function refreshDistrictContextForMode(){
  if(["AC","PC","WIN_AC","WIN_PC"].includes(game)){
    if(districtsContextLayer){ map.removeLayer(districtsContextLayer); districtsContextLayer=null; }
    return;
  }
  if(!contextDistrictsFC) return;
  if(districtsContextLayer){ map.removeLayer(districtsContextLayer); districtsContextLayer=null; }
  const feats = contextDistrictsFC.features.filter(f=>{
    const st = normalizeState(getProp(f.properties,KEYS.STATE)||"Unknown").toLowerCase();
    const isAP = st.includes("andhra")||st==="ap";
    const isTS = st.includes("telan")||st==="ts"||st==="tg";
    if(mode==="AP") return isAP;
    if(mode==="TS") return isTS;
    return true;
  });

  districtsContextLayer = L.geoJSON(
    { type:"FeatureCollection", features:feats },
    { pane:"context", style: { color:"#cbd5e1", weight:0.8, fill:false } }
  ).addTo(map);
}

// ---------- End-of-game labels ----------
function clearFinishLabels(){
  if(finishLabelsLayer){ map.removeLayer(finishLabelsLayer); finishLabelsLayer=null; }
}
function addFinishLabels(){
  clearFinishLabels();
  const group = (game==="CITY" && cityFG) ? cityFG : nonCityLayer;
  if(!group) return;
  finishLabelsLayer = L.layerGroup().addTo(map);
  const layers = group.getLayers ? group.getLayers() : [];
  layers.forEach(layer=>{
    const f = layer.feature;
    if(!f) return;
    const name = f.properties?.__name || "";
    if(!name) return;
    let at;
    if(typeof layer.getLatLng === "function"){ at = layer.getLatLng(); }
    else if(typeof layer.getBounds === "function"){ at = layer.getBounds().getCenter(); }
    if(!at) return;
    L.marker(at, {opacity:0}).bindTooltip(name, { permanent:true, direction:"center", className:"city-label" }).addTo(finishLabelsLayer);
  });
}

// ---------- Round lifecycle ----------
function clearGame(){
  selection={}; solvedCities.clear(); score=0; round=1; isGameOver=false; statusEl.textContent="";
  districtAttemptCount=0; mustConfirmClickName=null;
  riverAttemptCount=0; highwayAttemptCount=0;
  acAttemptCount=0; acTypeWrongsSinceLastCorrect=0;
  pcAttemptCount=0; pcTypeWrongsSinceLastCorrect=0;
  wm_completedSeatNames.clear(); wm_seatsCompleted=0;
  clearFinishLabels();
  if(cityFG) cityFG.clearLayers();
  wm_clearSeatLayer();
}
function startRound(){
  rebuildPool();
  rebuildLayer(true);
  updateLabels();
  applyVisibility();
  renderRightHUD();
  pickNewTarget();
  startTimer();
  updateHUD();
  safeInvalidate();
}
function endGame(){
  isGameOver=true; clearTimer();
  let msg="";
  if(game==="CITY"){
    const pct = totalPop>0 ? Math.round((coveredPop/totalPop)*1000)/10 : 0;
    msg = `🎉 Game over! ${solvedCities.size}/${pool.length} solved. Score ${score}. · Covered pop ${coveredPop.toLocaleString()} (${pct}%).`;
  } else if(game==="WIN_AC" || game==="WIN_PC"){
    msg = `🎉 All seats completed! ${wm_seatsCompleted}/${pool.length} seats. Score ${score}.`;
  } else {
    const solved = Object.values(selection).filter(isCorrectTag).length;
    const max = pool.length*10;
    msg = `🎉 Game over! ${solved}/${pool.length} solved. Score ${score}/${max}.`;
  }
  statusEl.textContent = msg;
  target=null; targetEl.textContent="—";
  addFinishLabels();
}
function updateHUD(){
  if (game === "DISTRICT") {
    const max = pool.length * 10 || 1;
    const pct = Math.round((score / max) * 100);
    if (scoreEl) scoreEl.textContent = `${score}/${max} (${pct}%)`;
  } else { if (scoreEl) scoreEl.textContent = String(score); }
  if (timeEl) timeEl.textContent = `${timer}s`;
  if (roundEl) roundEl.textContent = String(round);
}

// ---------- Controls ----------
modeBtns.forEach(btn=>btn.addEventListener("click",()=>{
  modeBtns.forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  mode=btn.dataset.mode;
  selection={}; score=0; round=1; isGameOver=false;
  wm_completedSeatNames.clear(); wm_seatsCompleted=0;
  refreshDistrictContextForMode();
  clearFinishLabels();
  if(cityFG) cityFG.clearLayers();
  startRound();
}));

diffBtns.forEach(btn=>btn.addEventListener("click",()=>{
  diffBtns.forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  difficulty=btn.dataset.diff;
  statusEl.textContent="";
}));

playBtns.forEach(btn=>btn.addEventListener("click",()=>{
  if(!(game==="CITY"||game==="AC"||game==="PC")) return;
  playBtns.forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  playStyle=btn.dataset.play||"CLICK";
  selection={}; score=0; round=1; isGameOver=false;
  acTypeWrongsSinceLastCorrect=0; pcTypeWrongsSinceLastCorrect=0;
  clearFinishLabels();
  startRound();
}));

// TYPE submit (CITY / AC TYPE / PC TYPE)
typeSubmit?.addEventListener("click", ()=>{
  const val=(typeInput?.value||"").trim();
  if(!val) return;

  if(game==="CITY" || ((game==="AC"||game==="PC") && playStyle==="TYPE")){
    const needle = val.toLowerCase();
    const pick = remainingNames().find(n => n.toLowerCase().includes(needle));
    if(pick){
      if(game==="AC"){
        const idx = Math.min(acTypeWrongsSinceLastCorrect, AC_POINTS.length-1);
        selection[pick] = idx===0 ? "correct1" : idx===1 ? "correct2" : "correct3";
        score += AC_POINTS[idx]; acTypeWrongsSinceLastCorrect = 0;
        rebuildPool(); renderRightHUD();
      }else if(game==="PC"){
        const idx = Math.min(pcTypeWrongsSinceLastCorrect, PC_POINTS.length-1);
        selection[pick] = idx===0 ? "correct1" : idx===1 ? "correct2" : "correct3";
        score += PC_POINTS[idx]; pcTypeWrongsSinceLastCorrect = 0;
        rebuildPool(); renderRightHUD();
      }else{
        selection[pick]="correct"; score+=10;
        recalcCityProgress(); renderRightHUD();
      }
      round+=1; statusEl.textContent="Correct! ✨";
      rebuildLayer(false);
      typeInput.value="";
      updateHUD(); pickNewTarget();
      return;
    }
    const already = pool.find(f => f.properties.__name.toLowerCase().includes(needle) && isCorrectTag(selection[f.properties.__name]));
    if(already){ statusEl.textContent = "Already guessed."; typeInput.select?.(); return; }
    statusEl.textContent = "Not a correct answer — check spelling.";
    if(game==="AC") acTypeWrongsSinceLastCorrect += 1;
    if(game==="PC") pcTypeWrongsSinceLastCorrect += 1;
    return;
  }
});
typeInput?.addEventListener("keydown",(e)=>{ if(e.key==="Enter"){ e.preventDefault(); typeSubmit?.click(); } });

// Reveal / Next / Restart
skipBtn?.addEventListener("click",()=>{
  if(isGameOver) return;
  if(game==="WIN_AC"||game==="WIN_PC"){ pickNewTarget(); return; } // Next only
  if((game==="AC"||game==="PC") && playStyle==="TYPE"){ endGame(); }
  else { pickNewTarget(); statusEl.textContent=""; }
});
restartBtn?.addEventListener("click",()=>{
  selection={}; solvedCities.clear(); score=0; round=1; statusEl.textContent="";
  districtAttemptCount=0; mustConfirmClickName=null;
  riverAttemptCount=0; highwayAttemptCount=0;
  acAttemptCount=0; acTypeWrongsSinceLastCorrect=0;
  pcAttemptCount=0; pcTypeWrongsSinceLastCorrect=0;
  wm_completedSeatNames.clear(); wm_seatsCompleted=0;
  clearFinishLabels();
  if(cityFG) cityFG.clearLayers();
  startRound();
});

// ---------- Timer ----------
let timerHandle=null;
function clearTimer(){ if(timerHandle) clearInterval(timerHandle); timerHandle=null; }
function startTimer(){
  clearTimer(); timer=0;
  if(timeEl) timeEl.textContent=`${timer}s`;
  timerHandle=setInterval(()=>{ timer++; if(timeEl) timeEl.textContent=`${timer}s`; },1000);
}

// ---------- District splash ----------
const LS_KEY_SPLASH_HIDE = "apts_district_disclaimer_hide";
function showDistrictSplash(startCallback){
  if(!splashEl) { startCallback?.(); return; }
  splashEl.classList.remove("hidden");

  // trap focus basic: focus button
  setTimeout(()=>{ try{ splashOkBtn?.focus(); }catch{} }, 0);

  function finish(){
    const dont = !!splashDontInp?.checked;
    if(dont){ try{ localStorage.setItem(LS_KEY_SPLASH_HIDE, "1"); }catch{} }
    splashEl.classList.add("hidden");
    startCallback?.();
  }
  splashOkBtn?.addEventListener("click", finish, { once:true });

  // allow Enter/Escape
  function onKey(e){
    if(e.key === "Enter" || e.key === "Escape"){ e.preventDefault(); finish(); }
  }
  document.addEventListener("keydown", onKey, { once:true });
}

// ---------- Init ----------
(async function init(){
  await addDistrictContext();
  await ensure(game);
  applyVisibility();
  updateLabels();
  clearGame();

  const start = () => {
    startRound();
    requestAnimationFrame(()=> map.invalidateSize());
  };

  // Show disclaimer only for DISTRICT and only if not hidden
  let shouldShow = (game === "DISTRICT");
  try { shouldShow = shouldShow && !localStorage.getItem(LS_KEY_SPLASH_HIDE); } catch {}

  if(shouldShow){
    showDistrictSplash(start);
  }else{
    start();
  }

  window.addEventListener("load", ()=> map.invalidateSize());
})();
