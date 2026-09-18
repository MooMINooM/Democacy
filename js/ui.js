import { state } from './state.js';
import * as Data from './data.js';
import { gameClock, engine } from './engine.js';

export const ui = {
    // State
    currentPartyView: null,
    mpListPage: 1,
    mapView: 'economic', // Province Political Layer (Stage B3): 'economic' | 'political' | 'social'

    // --- Main Tab Logic ---
    tab(t) { 
        document.querySelectorAll('main > div').forEach(d => d.classList.add('hidden')); 
        const target = document.getElementById(`tab-${t}`); if(target) target.classList.remove('hidden');
        document.querySelectorAll('.tab-btn').forEach(b => { const clickAttr = b.getAttribute('onclick'); b.classList.toggle('tab-active', clickAttr && clickAttr.includes(t)); });
        
        // Refresh specific tab data
        if (t === 'dashboard') { setTimeout(() => this.renderTrendGraphs(), 100); this.renderDashboard(); }
        if (t === 'administration') { this.renderCabinet(); this.renderActivePolicies(); this.renderMinistryList(); }
        if (t === 'parliament') { this.renderParliament(); }
        if (t === 'party-hq') { this.renderPartyHQ(); }
        if (t === 'factions') { this.renderFactionList(); }
        if (t === 'foreign') { this.renderForeignList(); }
        if (t === 'map') { this.renderProvinceMap(); }

        // MP List (Keep Logic)
        if (t === 'mps') {
            if (!this.currentPartyView && state.player.party) {
                this.currentPartyView = state.player.party.id;
                this.mpListPage = 1;
            }
            this.renderMPList(); 
        }
    },

    updateHUD() {
        const els = { 
            'hud-date': state.date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }), 
            'hud-budget': `฿${(state.world.nationalBudget / 1e12).toFixed(2)}T`, 
            'hud-approval-text': `${state.world.approval.toFixed(0)}%`,
            'hud-transparency-text': `${(state.world.transparency ?? 100).toFixed(0)}%`,
            'hud-personal-top': `฿${(state.player.personalFunds / 1e6).toFixed(0)}M`,
            'stat-cabinet-stability-display': `${state.world.cabinetStability}%`,
            'stat-growth-sidebar': `${state.world.growth >= 0 ? '+' : ''}${state.world.growth.toFixed(1)}%`,
            'hud-election-countdown': state.world.electionDay ? `${Math.max(0, Math.ceil((state.world.electionDay - state.date) / 86400000))} วัน` : '-'
        };
        for (const [id, val] of Object.entries(els)) { const el = document.getElementById(id); if(el) el.innerText = val; }
        const bar = document.getElementById('hud-approval-bar'); if (bar) bar.style.width = `${state.world.approval}%`;
        // Long Campaign (Phase 7): always visible so the player knows at a glance which toolkit
        // they currently have -- the government-only buttons elsewhere explain themselves when
        // clicked, but this is the one place that's true before they even try.
        const statusEl = document.getElementById('hud-gov-status');
        if (statusEl && state.player.party) {
            const STATUS_LABELS = { Government: ["รัฐบาล", "bg-black text-white"], Opposition: ["ฝ่ายค้าน", "bg-red-700 text-white"], Neutral: ["กลาง", "bg-stone-200 text-black"] };
            const [label, cls] = STATUS_LABELS[state.player.party.status] || STATUS_LABELS.Neutral;
            statusEl.textContent = label;
            statusEl.className = `text-[10px] font-bold uppercase tracking-widest px-2 py-1 border-2 border-black ${cls}`;
        }
        // Explainability (Phase 2): a small trend arrow next to the numbers that already have a
        // "why" breakdown, so the player sees direction before even opening it.
        const trends = { 'hud-approval-trend': 'approval', 'stat-cabinet-stability-trend': 'cabinetStability', 'stat-growth-trend': 'growth' };
        for (const [id, key] of Object.entries(trends)) { const el = document.getElementById(id); if (el) el.innerHTML = this.trendArrow(key); }
    },

    // Explainability (Phase 2): compares the last two monthly snapshots (state.history.*, the
    // same 6-entry rolling window the trend graphs already use) to a simple up/down/flat icon.
    // goodDirection follows WORLD_STAT_META's convention: -1 for a stat where rising is bad
    // (protestPressure), so a growing crisis doesn't render as a cheerful green up-arrow.
    trendArrow(key, goodDirection = 1) {
        const h = state.history[key];
        if (!h || h.length < 2) return '';
        const delta = h[h.length - 1] - h[h.length - 2];
        if (Math.abs(delta) < 0.5) return '<i class="fas fa-minus text-stone-400"></i>';
        const isGood = goodDirection > 0 ? delta > 0 : delta < 0;
        const cls = isGood ? 'text-emerald-600' : 'text-red-600';
        return delta > 0 ? `<i class="fas fa-arrow-up ${cls}"></i>` : `<i class="fas fa-arrow-down ${cls}"></i>`;
    },

    // Dynamic Society (Phase 6): same idea as trendArrow but over a faction's own popHistory
    // (basePop is per-faction, not a state.history.* series) -- no "good" direction here, a class
    // shrinking isn't inherently bad, it's just a fact about who the player's policies favored.
    factionTrend(f) {
        const h = f.popHistory;
        if (!h || h.length < 2) return '';
        const delta = h[h.length - 1] - h[h.length - 2];
        if (Math.abs(delta) < h[h.length - 1] * 0.002) return '<i class="fas fa-minus text-stone-400"></i>';
        return delta > 0 ? '<i class="fas fa-arrow-up text-emerald-600"></i>' : '<i class="fas fa-arrow-down text-red-600"></i>';
    },

    // Explainability (Phase 2): reuses the event-modal to show the ranked factors behind a
    // number, instead of the player only ever seeing the resulting figure. goodDirection matches
    // WORLD_STAT_META's convention: +1 means a positive contribution is good (growth, approval,
    // cabinet stability), -1 means it's bad (protest pressure, where every factor is a problem
    // piling up, not progress) -- otherwise a rising unrest factor would render in the same
    // green as a rising approval one, telling the player the opposite of what's true.
    showWhy(title, breakdown, goodDirection = 1) {
        this.resetModalState();
        document.getElementById('event-title').innerText = `ทำไม: ${title}`;
        const rows = Object.entries(breakdown).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
        let h = `<div class="space-y-2">`;
        if (rows.length === 0) h += `<div class="italic text-stone-400 text-center">ไม่มีปัจจัยเด่นในขณะนี้</div>`;
        rows.forEach(([label, val]) => {
            const isGood = goodDirection > 0 ? val > 0.05 : val < -0.05;
            const isBad = goodDirection > 0 ? val < -0.05 : val > 0.05;
            const color = isGood ? 'text-emerald-700' : (isBad ? 'text-red-700' : 'text-stone-400');
            h += `<div class="flex justify-between border-b border-stone-200 pb-1"><span class="text-sm">${label}</span><span class="font-mono font-bold ${color}">${val > 0 ? '+' : ''}${val.toFixed(1)}</span></div>`;
        });
        h += `</div>`;
        document.getElementById('event-desc').innerHTML = h;
        document.getElementById('event-options').innerHTML = `<button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="w-full p-2 bg-stone-200 font-bold text-xs uppercase border border-black">Close</button>`;
        document.getElementById('event-modal').classList.remove('hidden');
    },

    updateMain() { 
        this.updateHUD(); 
        const activeTab = document.querySelector('.tab-btn.tab-active')?.getAttribute('onclick');
        if(activeTab?.includes('administration')) { this.renderCabinet(); this.renderActivePolicies(); }
        if(activeTab?.includes('dashboard')) { this.renderDashboard(); }
        if(activeTab?.includes('mps')) { this.renderMPList(); } // Maintain MP list update
        if(activeTab?.includes('party-hq')) { this.renderOppositionCommandCenter(); }
    },
    
    // --- 1. DASHBOARD (ปรับใหม่: Newspaper Layout) ---
    renderDashboard() {
        this.renderNews();
        this.renderTrendGraphs();
        this.renderMiniFactions();
        this.renderNationalStats();
        this.renderContextPanel();
        this.renderEconomyPanel();
        this.renderSocietyPanel();
        this.renderEarlyWarningPanel();
        this.renderBattlegroundPanel();
    },

    // Dynamic Context Engine (Phase 1): shows the derived situational labels and the two new
    // slow-moving Phase 1 gauges, so the player can see *why* an action might land differently
    // today than it did a year ago, and see unrest building before it erupts.
    renderContextPanel() {
        const contextCont = document.getElementById('context-panel');
        const pressureCont = document.getElementById('pressure-panel');
        if (!contextCont || !pressureCont) return;
        const ctx = engine.getNationalContext();
        const ECONOMIC_LABELS = { Boom: ["เฟื่องฟู", "text-emerald-700"], Expansion: ["ขยายตัว", "text-emerald-700"], Slowdown: ["ชะลอตัว", "text-amber-700"], Recession: ["ถดถอย", "text-red-700"] };
        // Political Climate v2 (Stage A): replaces the old 4-state Crisis/Election Mode/Polarized/
        // Stable set (which read a plain 50% approval as automatically "Polarized") with a 5-state
        // multi-factor read -- see engine.js's getPoliticalClimate().
        const POLITICAL_LABELS = { Crisis: ["วิกฤต", "text-red-700"], Polarized: ["แตกขั้ว", "text-red-700"], Tense: ["ตึงเครียด", "text-amber-700"], Competitive: ["แข่งขันปกติ", "text-stone-700"], Calm: ["สงบ", "text-emerald-700"] };
        const FISCAL_LABELS = { "Debt Stress": ["งบตึงมาก", "text-red-700"], Tight: ["งบตึง", "text-amber-700"], Normal: ["ปกติ", "text-stone-700"], Surplus: ["เกินดุล", "text-emerald-700"] };
        const tiles = [
            { icon: "fa-chart-line", label: "วัฏจักรเศรษฐกิจ", val: ECONOMIC_LABELS[ctx.economicCycle] },
            { icon: "fa-coins", label: "สถานะการคลัง", val: FISCAL_LABELS[ctx.fiscalCondition] }
        ];
        const politicalVal = POLITICAL_LABELS[ctx.politicalClimate];
        contextCont.innerHTML = `
            <button onclick="ui.showWhy('บรรยากาศการเมือง', engine.getPoliticalClimateBreakdown())" class="border-2 border-black p-3 text-center hover:bg-stone-50 transition">
                <i class="fas fa-landmark text-lg text-stone-400 mb-1"></i>
                <div class="text-[9px] uppercase font-bold text-stone-500 tracking-widest mb-1">บรรยากาศการเมือง</div>
                <div class="text-sm font-black ${politicalVal[1]}">${politicalVal[0]}</div>
            </button>
            ${tiles.map(t => `
            <div class="border-2 border-black p-3 text-center">
                <i class="fas ${t.icon} text-lg text-stone-400 mb-1"></i>
                <div class="text-[9px] uppercase font-bold text-stone-500 tracking-widest mb-1">${t.label}</div>
                <div class="text-sm font-black ${t.val[1]}">${t.val[0]}</div>
            </div>`).join('')}`;

        const pressure = state.world.protestPressure;
        const legitimacy = state.world.institutionalLegitimacy;
        pressureCont.innerHTML = `
            <button onclick="ui.showWhy('แรงกดดันประท้วงสะสม', engine.getPressureBreakdown(), -1)" class="border-2 border-black p-3 text-left hover:bg-stone-50 transition">
                <div class="flex justify-between text-[9px] uppercase font-bold text-stone-500 tracking-widest mb-1"><span><i class="fas fa-people-group mr-1"></i>แรงกดดันประท้วงสะสม ${this.trendArrow('protestPressure', -1)}</span><span class="${pressure > 60 ? 'text-red-700' : (pressure > 35 ? 'text-amber-700' : 'text-emerald-700')}">${pressure.toFixed(0)}%</span></div>
                <div class="w-full h-2 bg-stone-200 border border-black"><div class="h-full ${pressure > 60 ? 'bg-red-600' : (pressure > 35 ? 'bg-amber-500' : 'bg-emerald-600')}" style="width:${pressure}%"></div></div>
            </button>
            <div class="border-2 border-black p-3">
                <div class="flex justify-between text-[9px] uppercase font-bold text-stone-500 tracking-widest mb-1"><span><i class="fas fa-building-columns mr-1"></i>ความเชื่อถือสถาบัน (ระยะยาว)</span><span class="${legitimacy > 60 ? 'text-emerald-700' : (legitimacy > 40 ? 'text-amber-700' : 'text-red-700')}">${legitimacy.toFixed(0)}%</span></div>
                <div class="w-full h-2 bg-stone-200 border border-black"><div class="h-full bg-black" style="width:${legitimacy}%"></div></div>
            </div>`;
    },

    // Economy v2 (Phase 5): what share of current output rides on foreign relations, and which
    // industries are driving growthBreakdown's "ผลผลิตอุตสาหกรรมเทียบฐาน" line up or down --
    // both pure aggregates over data provinceOutput() already computes, surfaced for the player.
    renderEconomyPanel() {
        const cont = document.getElementById('economy-panel'); if (!cont) return;
        const exposure = engine.getTradeExposure() * 100;
        cont.innerHTML = `
            <button onclick="ui.showWhy('ผลผลิตอุตสาหกรรมเทียบฐาน (ตามภาค)', engine.getProductionBreakdown())" class="border-2 border-black p-3 text-left hover:bg-stone-50 transition">
                <div class="flex justify-between text-[9px] uppercase font-bold text-stone-500 tracking-widest mb-1"><span><i class="fas fa-earth-asia mr-1"></i>สัดส่วนผลผลิตที่พึ่งพาการค้าต่างประเทศ</span><span class="${exposure > 60 ? 'text-amber-700' : 'text-stone-700'}">${exposure.toFixed(0)}%</span></div>
                <div class="w-full h-2 bg-stone-200 border border-black"><div class="h-full bg-blue-600" style="width:${exposure}%"></div></div>
                <div class="text-[9px] text-stone-500 mt-2">คลิกดูว่าอุตสาหกรรมภาคไหนกำลังดันหรือฉุดผลผลิตของประเทศ</div>
            </button>`;
    },

    // Dynamic Society (Phase 6): the country's agrarian-vs-industrial character, plus which class
    // is actually growing or shrinking right now -- a slower, structural dimension separate from
    // the approval/growth loop, so investing in factories over farms visibly reshapes society
    // over a term, not just the GDP number.
    renderSocietyPanel() {
        const cont = document.getElementById('society-panel'); if (!cont) return;
        const ctx = engine.getSocietyContext();
        const SOCIETY_LABELS = { Agrarian: ["สังคมเกษตรกรรม", "text-amber-700"], Transitioning: ["กำลังเปลี่ยนผ่าน", "text-stone-700"], Industrial: ["สังคมอุตสาหกรรม/เมือง", "text-blue-700"] };
        const label = SOCIETY_LABELS[ctx.societyType];
        cont.innerHTML = `
            <button onclick="ui.showWhy('โครงสร้างชนชั้นทางสังคม', engine.getClassCompositionBreakdown())" class="border-2 border-black p-3 text-left hover:bg-stone-50 transition">
                <div class="flex justify-between text-[9px] uppercase font-bold text-stone-500 tracking-widest mb-1"><span><i class="fas fa-people-roof mr-1"></i>โครงสร้างสังคม</span><span class="${label[1]}">${label[0]}</span></div>
                <div class="w-full h-2 bg-stone-200 border border-black mb-2"><div class="h-full bg-amber-600" style="width:${ctx.agrarianShare * 100}%"></div></div>
                <div class="text-[9px] text-stone-500 leading-relaxed">
                    ${ctx.growingClass ? `กลุ่ม "${ctx.growingClass}" กำลังขยายตัว` : 'ยังไม่มีข้อมูลแนวโน้มชนชั้นเพียงพอ'}
                    ${ctx.shrinkingClass ? ` &middot; กลุ่ม "${ctx.shrinkingClass}" กำลังหดตัว` : ''}
                </div>
            </button>`;
    },

    // Election Readability (Stage B4): the provinces actually worth watching before the next
    // vote, reusing getBattlegroundProvinces() (built on Stage B3's political layer) -- clicking
    // a row jumps straight to that province on the map instead of making the player hunt for it.
    renderBattlegroundPanel() {
        const cont = document.getElementById('battleground-panel'); if (!cont) return;
        const battlegrounds = engine.getBattlegroundProvinces(6);
        if (battlegrounds.length === 0) {
            cont.innerHTML = `<div class="text-[10px] text-stone-400 italic text-center py-2">ยังไม่มีจังหวัดที่สูสีในตอนนี้</div>`;
            return;
        }
        const COMPETITIVE_LABELS = { Battleground: ["สมรภูมิ", "text-red-700"], Leaning: ["เอียงข้างชัดเจน", "text-amber-700"] };
        cont.innerHTML = battlegrounds.map(b => `
            <button onclick="ui.tab('map'); ui.showProvinceDetail('${b.name}');" class="w-full text-left border-2 border-black p-2.5 hover:bg-stone-50 transition">
                <div class="flex justify-between items-center text-[10px] mb-1">
                    <span class="font-bold">${b.name} <span class="text-stone-500 font-normal">(${b.seats} ที่นั่ง · ${b.region})</span></span>
                    <span class="font-bold ${COMPETITIVE_LABELS[b.competitiveness][1]}">${COMPETITIVE_LABELS[b.competitiveness][0]}</span>
                </div>
                <div class="w-full h-1.5 bg-red-200 border border-black flex overflow-hidden"><div class="h-full bg-blue-500" style="width:${b.govSupport}%"></div></div>
                <div class="flex justify-between text-[9px] text-stone-500 mt-0.5"><span>รัฐบาล ${b.govSupport.toFixed(0)}%</span><span>ฝ่ายค้าน ${b.oppSupport.toFixed(0)}%</span></div>
            </button>
        `).join('');
    },

    // Early Warning System (Stage C2): all four pressures (Stage C1) on one board with a
    // trend arrow and a Low/Elevated/High/Critical risk read, each with its own why-button --
    // so a crisis, when it comes, is something the player already saw building, not a bolt from
    // the blue. goodDirection is always -1: every one of these is a risk gauge, rising is bad.
    renderEarlyWarningPanel() {
        const cont = document.getElementById('early-warning-panel'); if (!cont) return;
        const PRESSURES = [
            { key: 'protestPressure', label: 'แรงกดดันประท้วง', icon: 'fa-people-group', breakdownFn: 'getPressureBreakdown' },
            { key: 'coalitionCollapsePressure', label: 'ความเสี่ยงพรรคร่วมแตก', icon: 'fa-handshake-slash', breakdownFn: 'getCoalitionCollapseBreakdown' },
            { key: 'economicCrisisPressure', label: 'ความเสี่ยงวิกฤตเศรษฐกิจ', icon: 'fa-money-bill-trend-down', breakdownFn: 'getEconomicCrisisBreakdown' },
            { key: 'coupPressure', label: 'ความเสี่ยงรัฐประหาร', icon: 'fa-shield-halved', breakdownFn: 'getCoupBreakdown' }
        ];
        const RISK_LABELS = { Low: ["ต่ำ", "text-emerald-700", "bg-emerald-600"], Elevated: ["เริ่มสูง", "text-amber-700", "bg-amber-500"], High: ["สูง", "text-red-700", "bg-red-600"], Critical: ["วิกฤต", "text-red-900", "bg-red-900"] };
        cont.innerHTML = PRESSURES.map(p => {
            const value = state.world[p.key] ?? 0;
            const level = value > 75 ? "Critical" : value > 50 ? "High" : value > 25 ? "Elevated" : "Low";
            const [levelLabel, textColor, barColor] = RISK_LABELS[level];
            return `
            <button onclick="ui.showWhy('${p.label}', engine.${p.breakdownFn}(), -1)" class="w-full text-left border-2 border-black p-2.5 hover:bg-stone-50 transition">
                <div class="flex justify-between items-center text-[10px] mb-1">
                    <span class="font-bold"><i class="fas ${p.icon} mr-1"></i>${p.label} ${this.trendArrow(p.key, -1)}</span>
                    <span class="font-bold ${textColor}">${levelLabel} &middot; ${value.toFixed(0)}%</span>
                </div>
                <div class="w-full h-1.5 bg-stone-200 border border-black"><div class="h-full ${barColor}" style="width:${value}%"></div></div>
            </button>`;
        }).join('');
    },

    renderNationalStats() {
        const cont = document.getElementById('national-stats'); if (!cont) return;
        cont.innerHTML = Object.entries(Data.WORLD_STAT_META).map(([stat, meta]) => {
            const value = state.world[stat] ?? meta.baseline;
            const good = meta.goodDirection > 0 ? value >= meta.baseline : value <= meta.baseline;
            return `
            <div class="border-2 border-black p-3 text-center">
                <i class="fas ${meta.icon} text-lg text-stone-400 mb-1"></i>
                <div class="text-[9px] uppercase font-bold text-stone-500 tracking-widest mb-1">${meta.label}</div>
                <div class="text-xl font-black font-mono ${good ? 'text-emerald-700' : 'text-red-700'}">${value.toFixed(0)}</div>
                <div class="w-full h-1 bg-stone-200 mt-1"><div class="h-full bg-black" style="width:${value}%"></div></div>
            </div>`;
        }).join('');
    },

    renderNews() { 
        const cont = document.getElementById('news-feed'); if(!cont) return; 
        
        // Update Headline
        if (state.news.length > 0) { 
            document.getElementById('news-headline').innerText = state.news[0].headline; 
            document.getElementById('news-body').innerText = state.news[0].body; 
        }

        // News List (Ticker Style)
        cont.innerHTML = state.news.slice(1, 8).map(n => `
            <div class="border-b border-stone-300 pb-3 last:border-0 hover:bg-stone-50 transition p-2">
                <div class="text-[9px] text-stone-500 mb-1 uppercase font-mono tracking-wider">${n.date}</div>
                <h4 class="font-bold text-black text-sm font-serif leading-tight hover:underline cursor-pointer">${n.headline}</h4>
            </div>
        `).join(""); 
    },

    renderTrendGraphs() {
        const createChart = (id, data, color) => {
            const wrapper = document.getElementById(id); if (!wrapper) return;
            const max = Math.max(...data, 100); const min = Math.min(...data, 0);
            const w = wrapper.clientWidth; const h = wrapper.clientHeight;
            const pts = data.map((d, i) => ({ x: i * (w / (Math.max(data.length, 2) - 1)), y: h - ((d - min) / (max - min)) * h }));
            let path = `M${pts[0].x},${pts[0].y}`; pts.forEach(p => path += ` L${p.x},${p.y}`);
            wrapper.innerHTML = `<svg viewBox="0 0 ${w} ${h}" class="w-full h-full overflow-visible"><path d="${path}" fill="none" stroke="${color}" stroke-width="3" /></svg>`;
        };
        // Create containers if missing
        const feed = document.getElementById('news-feed');
        if (feed && !document.getElementById('trend-container')) {
             const div = document.createElement('div'); div.id = 'trend-container'; div.className = "grid grid-cols-2 gap-4 mb-6"; 
             div.innerHTML = `
                <div class="bg-stone-100 border border-black p-4 h-32 relative flex flex-col justify-end">
                    <div class="text-[9px] font-bold uppercase absolute top-2 left-2 text-stone-500">Public Approval</div>
                    <div id="trend-approval" class="w-full h-20"></div>
                </div>
                <div class="bg-stone-100 border border-black p-4 h-32 relative flex flex-col justify-end">
                    <div class="text-[9px] font-bold uppercase absolute top-2 left-2 text-stone-500">National Budget</div>
                    <div id="trend-budget" class="w-full h-20"></div>
                </div>`;
             feed.parentElement.insertBefore(div, feed);
        }
        if (state.history.approval.length > 0) { 
            createChart('trend-approval', state.history.approval, '#d97706'); 
            createChart('trend-budget', state.history.budget, '#2563eb'); 
        }
    },

    renderMiniFactions() {
        const cont = document.getElementById('mini-faction-list'); if(!cont) return;
        const sorted = [...state.factions].sort((a,b) => b.weight - a.weight).slice(0, 5);
        cont.innerHTML = sorted.map(f => `
            <div class="flex items-center justify-between text-xs border-b border-stone-200 pb-2">
                <span class="font-bold">${f.name}</span>
                <div class="flex items-center gap-2">
                    <div class="w-16 h-2 bg-stone-200"><div class="h-full bg-black" style="width: ${f.approval}%"></div></div>
                    <span class="font-mono">${f.approval.toFixed(0)}%</span>
                </div>
            </div>
        `).join("");
    },

    // --- 2. ADMINISTRATION (รวม ครม. + นโยบาย) ---
    // จัดวางแบบ: ซ้าย (รายชื่อ ครม. แบบตารางชัดเจน) | ขวา (วาระนโยบาย)
    renderCabinet() { 
        const cont = document.getElementById('cabinet-list'); if(!cont) return; 
        cont.innerHTML = ""; 
        
        // Table Structure
        let html = `
            <table class="w-full text-left text-xs">
                <thead class="bg-black text-white uppercase tracking-widest font-bold sticky top-0 z-10">
                    <tr>
                        <th class="p-3">กระทรวง</th>
                        <th class="p-3">ผู้ดำรงตำแหน่ง</th>
                        <th class="p-3 text-right">Action</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-stone-300">
        `;

        Object.entries(Data.MINISTRIES).forEach(([n, d]) => { 
            const m = d.currentMinister; 
            html += `
                <tr class="hover:bg-stone-200 transition group bg-white">
                    <td class="p-3 font-bold border-r border-stone-200">
                        <div class="flex items-center gap-2">
                            <i class="fas ${d.icon} w-4 text-center text-stone-400"></i> ${n}
                        </div>
                    </td>
                    <td class="p-3">
                        ${m ? `<div class="font-bold text-black">${m.name}</div><div class="text-[9px] uppercase" style="color:${m.party.color}">${m.party.name}</div>` 
                            : `<div class="text-stone-400 italic">-- ว่าง --</div>`}
                    </td>
                    <td class="p-3 text-right">
                        ${state.player.party.status === "Government"
                            ? `<button onclick="ui.showAppointModal('${n}')" class="border border-black px-2 py-1 hover:bg-black hover:text-white transition text-[9px] font-bold uppercase">${m ? 'Change' : 'Appoint'}</button>`
                            : `<span class="text-[9px] text-stone-400 italic" title="ต้องเป็นพรรครัฐบาลก่อนจึงจะแต่งตั้งได้">ฝ่ายค้านไม่มีอำนาจแต่งตั้ง</span>`}
                    </td>
                </tr>
            `;
        });
        html += `</tbody></table>`;
        cont.innerHTML = html;
    },

    renderActivePolicies() {
        const cont = document.getElementById('active-policy-list'); if(!cont) return;
        cont.innerHTML = "";
        
        if (state.activePolicies.length === 0) { 
            cont.innerHTML = `<div class="flex items-center justify-center h-full text-stone-400 italic bg-stone-50 border-2 border-dashed border-stone-300 m-4">ไม่มีวาระการประชุม</div>`; 
            return; 
        }

        state.activePolicies.forEach(p => {
            const progress = ((p.totalDays - p.remainingDays)/p.totalDays)*100;
            const el = document.createElement('div'); 
            el.className = "bg-white p-4 border-2 border-black shadow-[4px_4px_0_#ccc] mb-4 relative";
            el.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <div class="font-bold text-lg serif text-black">${p.name}</div>
                    ${p.isDeliberating
                        ? `<span class="bg-yellow-100 text-yellow-800 text-[9px] font-bold px-2 py-1 border border-yellow-500">วาระ ${p.stage}/3 &middot; รอพิจารณา ${p.remainingDays} วัน</span>`
                        : `<span class="bg-red-600 text-white text-[9px] font-bold px-2 py-1 border border-black animate-pulse">วาระ ${p.stage}/3 &middot; รอลงมติ</span>`}
                </div>
                <div class="text-[10px] text-stone-500 uppercase tracking-widest mb-3 border-b border-stone-200 pb-2">เสนอโดย: ${p.proposer} &middot; แพ้โหวตวาระนี้ร่างจะตกทันที</div>
                
                <div class="w-full bg-stone-200 h-2 border border-black mb-3"><div class="h-full bg-black" style="width: ${progress}%"></div></div>

                <div class="flex gap-2">
                    <button onclick="window.engine.startVote('${p.name}')" ${p.isDeliberating ? 'disabled' : ''} 
                        class="flex-1 py-2 text-xs font-bold border-2 border-black ${p.isDeliberating ? 'bg-stone-100 text-stone-400 opacity-50' : 'bg-black text-white hover:bg-white hover:text-black transition'}">
                        ลงมติ (Vote)
                    </button>
                    <button onclick="window.engine.lobbyCoalition('${p.name}')" class="px-3 py-2 bg-white hover:bg-stone-100 text-xs font-bold border-2 border-black transition">
                        ล็อบบี้
                    </button>
                </div>
            `;
            cont.appendChild(el);
        });
    },

    renderMinistryList() {
        const cont = document.getElementById('ministry-list'); if(!cont) return;
        cont.innerHTML = Object.entries(Data.MINISTRIES).map(([n, d]) => {
            const workload = d.workload || 0;
            return `
            <button onclick="ui.showPolicyBank('${n}')" class="relative p-2 border border-stone-400 bg-white hover:bg-black hover:text-white hover:border-black transition flex flex-col items-center gap-1 group">
                ${workload > 50 ? `<div class="absolute top-0.5 right-0.5 w-2 h-2 rounded-full ${workload > 80 ? 'bg-red-600' : 'bg-amber-500'}" title="ภาระงานสูง"></div>` : ''}
                <i class="fas ${d.icon} text-lg text-stone-400 group-hover:text-white"></i>
                <span class="text-[9px] font-bold uppercase">${n}</span>
            </button>
        `;
        }).join("");
    },

    // --- 3. PARLIAMENT (ปรับใหม่: Document Style) ---
    renderParliament() {
        const chart = document.getElementById('parliament-chart'); 
        const table = document.getElementById('party-stat-table'); 
        if(!chart || !table) return;
        
        chart.innerHTML = ""; table.innerHTML = "";
        let gT = 0, oT = 0, nT = 0;
        
        // Render Chart Dots
        state.leaders.forEach(l => { 
            const dot = document.createElement('div'); 
            dot.className = "w-2 h-2 rounded-full m-[1px] border border-black/10";
            if (state.lastVoteResults) { 
                const res = state.lastVoteResults.find(r => r.id === l.id); 
                dot.style.backgroundColor = res ? (res.vote === 'yes' ? '#10b981' : (res.vote === 'no' ? '#ef4444' : '#d1d5db')) : l.party.color;
            } else { 
                dot.style.backgroundColor = l.party.color; 
            }
            chart.appendChild(dot); 
        });

        // Render Table
        state.parties.sort((a,b) => b.seats - a.seats).forEach(p => {
            if(p.status === "Government") gT += p.seats; else if(p.status === "Opposition") oT += p.seats; else nT += p.seats;
            table.innerHTML += `
                <tr class="border-b border-stone-200 hover:bg-stone-50 text-xs">
                    <td class="p-3 font-bold border-r border-stone-200">
                        <span class="inline-block w-2 h-2 rounded-full mr-2 border border-black" style="background:${p.color}"></span>${p.name}
                    </td>
                    <td class="p-3 text-center border-r border-stone-200 uppercase text-[9px] font-bold tracking-wider">${p.status}</td>
                    <td class="p-3 text-center border-r border-stone-200 font-mono font-bold">${p.seats}</td>
                    <td class="p-3 text-center border-r border-stone-200 font-mono font-bold ${p.id === state.player.party.id ? 'text-stone-400' : ((p.trust ?? 70) > 60 ? 'text-emerald-700' : ((p.trust ?? 70) < 40 ? 'text-red-700' : 'text-stone-700'))}">${p.id === state.player.party.id ? '-' : (p.trust ?? 70).toFixed(0) + '%'}${(p.dependence || 0) > 20 ? `<div class="text-[8px] font-normal normal-case text-purple-700">พึ่งพา ${(p.dependence).toFixed(0)}%</div>` : ''}</td>
                    <td class="p-3 text-center border-r border-stone-200 font-mono font-bold">${(p.popularity ?? 0).toFixed(0)}%</td>
                    <td class="p-3 text-stone-500 italic border-r border-stone-200">${p.ideologies[0]}</td>
                    <td class="p-3 text-stone-500 italic">${p.goals[0]}</td>
                </tr>
            `;
        });

        document.getElementById('vote-summary-parliament').innerHTML = `
            <div class="grid grid-cols-3 gap-2 text-center text-xs font-bold uppercase tracking-widest bg-stone-100 p-2 border border-black">
                <div class="text-blue-800">Govt: ${gT}</div>
                <div class="text-red-800">Opp: ${oT}</div>
                <div class="text-stone-500">Neu: ${nT}</div>
            </div>
        `;
    },

    // --- 4. PARTY HQ (ปรับใหม่: Manifesto Style) ---
    renderPartyHQ() {
        const p = state.player.party; if(!p) return;
        
        // Ideologies as tags
        document.getElementById('my-party-ideologies').innerHTML = p.ideologies.map(i => 
            `<span class="bg-black text-white px-2 py-1 text-[10px] font-bold uppercase border border-black mr-1">${i}</span>`
        ).join("");
        
        document.getElementById('my-party-goals').innerHTML = p.goals.map(g =>
            `<span class="bg-white text-black px-2 py-1 text-[10px] font-bold uppercase border border-black mr-1">${g}</span>`
        ).join("");

        // Update transparency bar manually if needed (omitted for brevity, handled in main loop usually)
        this.renderOppositionCommandCenter();
    },

    // Opposition Gameplay v2 (Stage C5): shown only while the player's party is actually in
    // opposition -- the roadmap's own point is that opposition needs its own goal (build a path
    // back to power), not a permanently-visible watered-down copy of the government's screen.
    renderOppositionCommandCenter() {
        const cont = document.getElementById('opposition-command-center'); if (!cont) return;
        if (state.player.party.status !== "Opposition") {
            cont.innerHTML = `<div class="text-stone-400 italic text-xs p-6 border-2 border-dashed border-stone-300 text-center">ศูนย์บัญชาการฝ่ายค้านใช้งานได้เฉพาะขณะพรรคท่านเป็นฝ่ายค้าน</div>`;
            return;
        }

        const myParty = state.player.party;
        const pactPartner = myParty.electoralPactWith ? state.parties.find(p => p.id === myParty.electoralPactWith) : null;
        const blocSeats = myParty.seats + (pactPartner ? pactPartner.seats : 0);
        const seatsNeeded = Math.max(0, Data.MAJORITY_SEATS + 1 - blocSeats);

        const shadowGrid = Object.entries(Data.MINISTRIES).map(([n, d]) => {
            const mpId = state.player.shadowCabinet?.[n];
            const mp = mpId ? state.leaders.find(l => l.id === mpId) : null;
            return `
            <button onclick="ui.showShadowCabinetModal('${n}')" class="relative p-2 border border-stone-400 bg-white hover:bg-black hover:text-white hover:border-black transition flex flex-col items-center gap-1 group text-center">
                <i class="fas ${d.icon} text-lg text-stone-400 group-hover:text-white"></i>
                <span class="text-[9px] font-bold uppercase">${n}</span>
                <span class="text-[8px] font-bold ${mp ? 'text-emerald-700 group-hover:text-emerald-300' : 'text-stone-400 group-hover:text-stone-300'}">${mp ? mp.name : 'ว่าง'}</span>
            </button>`;
        }).join('');

        // Government bills open for a public stance: proposer is "รัฐบาล" (player's own
        // government-tabled bills, which can't happen while the player is opposition, so this
        // only ever matches the AI government's) or an MP from any non-player party.
        const govBills = state.activePolicies.filter(p => {
            const proposerMP = state.leaders.find(l => l.name === p.proposer);
            return p.proposer === "รัฐบาล" || (proposerMP && proposerMP.party.id !== myParty.id);
        });
        const billRows = govBills.length > 0 ? govBills.map(p => `
            <div class="flex justify-between items-center p-2 border border-stone-200 bg-white text-xs">
                <div><div class="font-bold">${p.name}</div><div class="text-[9px] text-stone-500">เสนอโดย ${p.proposer}</div></div>
                <div class="flex gap-1 shrink-0">
                    <button onclick="engine.stanceOnPolicy('${p.name}', 'oppose')" class="border border-red-700 text-red-700 px-2 py-1 text-[9px] font-bold uppercase hover:bg-red-700 hover:text-white transition">คัดค้าน</button>
                    <button onclick="engine.stanceOnPolicy('${p.name}', 'support')" class="border border-emerald-700 text-emerald-700 px-2 py-1 text-[9px] font-bold uppercase hover:bg-emerald-700 hover:text-white transition">สนับสนุน</button>
                </div>
            </div>`).join('') : `<div class="text-stone-400 italic text-[10px] p-2">ไม่มีร่างกฎหมายของรัฐบาลอยู่ในวาระขณะนี้</div>`;

        const candidates = state.parties.filter(p => p.status !== "Government" && p.id !== myParty.id);
        const allyRows = candidates.map(p => {
            const pact = myParty.electoralPactWith === p.id;
            return `
            <div class="flex justify-between items-center p-2 border border-stone-200 bg-white text-xs">
                <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full border border-black shrink-0" style="background:${p.color}"></span><div><div class="font-bold">${p.name}</div><div class="text-[9px] text-stone-500">${p.seats} ที่นั่ง &middot; ไว้ใจ ${(p.trust ?? 70).toFixed(0)}%</div></div></div>
                ${pact ? `<span class="text-[9px] font-bold text-emerald-700 uppercase shrink-0">พันธมิตรแล้ว</span>` : `<button onclick="engine.negotiateAlliance('${p.id}')" class="border border-black px-2 py-1 text-[9px] font-bold uppercase hover:bg-black hover:text-white transition shrink-0">เจรจา (฿15M)</button>`}
            </div>`;
        }).join('');

        cont.innerHTML = `
            <h3 class="font-bold text-black mb-1 text-sm uppercase tracking-widest border-b-2 border-black pb-2">ศูนย์บัญชาการฝ่ายค้าน</h3>
            <div class="flex justify-between items-baseline mb-6 mt-2 text-xs">
                <span class="text-stone-500">ที่นั่งของพรรคท่าน${pactPartner ? ` + พันธมิตร (${pactPartner.name})` : ''}: <span class="font-bold text-black">${blocSeats}</span></span>
                <span class="text-stone-500">ทางกลับสู่อำนาจ: ต้องการอีก <span class="font-bold text-black">${seatsNeeded}</span> ที่นั่ง</span>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <div class="text-[10px] text-stone-500 uppercase font-bold mb-2">คณะรัฐมนตรีเงา (Shadow Cabinet)</div>
                    <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">${shadowGrid}</div>
                </div>
                <div>
                    <div class="text-[10px] text-stone-500 uppercase font-bold mb-2">จุดยืนต่อร่างกฎหมายรัฐบาล</div>
                    <div class="space-y-2 mb-6">${billRows}</div>
                    <div class="text-[10px] text-stone-500 uppercase font-bold mb-2">เจรจาพันธมิตรก่อนเลือกตั้ง (ภายใน 1 ปีก่อนเลือกตั้ง)</div>
                    <div class="space-y-2">${allyRows}</div>
                </div>
            </div>
        `;
    },

    showShadowCabinetModal(mName) {
        if (state.player.party.status !== "Opposition") return;
        this.resetModalState();
        let h = `<div class="space-y-2 max-h-[400px] overflow-y-auto scroll-custom p-1">`;
        const myMPs = state.leaders.filter(l => l.party.id === state.player.party.id);
        myMPs.forEach(l => {
            h += `<div class="flex justify-between items-center p-3 border border-stone-200 bg-white hover:border-black transition"><div><div class="font-bold text-xs">${l.name}</div><div class="text-[9px] text-stone-500 uppercase">ชื่อเสียง ${l.prestige}%${l.shadowedMinistries?.[mName] ? ' &middot; เคยเป็นรัฐมนตรีเงากระทรวงนี้' : ''}</div></div><button onclick="engine.assignShadowMinister('${mName}', ${l.id}); document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="border border-black px-3 py-1 text-[9px] font-bold uppercase hover:bg-black hover:text-white transition">Select</button></div>`;
        });
        h += `</div>`;
        document.getElementById('event-title').innerText = `รัฐมนตรีเงา: ${mName}`;
        document.getElementById('event-desc').innerHTML = h;
        document.getElementById('event-options').innerHTML = `<button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="w-full p-2 bg-stone-200 border border-black font-bold text-xs uppercase hover:bg-stone-300">Cancel</button>`;
        document.getElementById('event-modal').classList.remove('hidden');
    },

    // --- PROVINCE MAP ---
    // Province Political Layer (Stage B3): the map reads as three lenses on the same 77
    // provinces -- economic (investment), political (who's actually ahead here right now), and
    // social (gaining or losing people) -- instead of one fixed color scheme that only ever
    // showed local-faction approval next to an industry icon.
    renderProvinceMap() {
        const cont = document.getElementById('province-map'); if (!cont) return;
        const byRegion = {};
        Data.REGIONS.forEach(r => byRegion[r] = state.provinces.filter(p => p.region === r));

        const toggleCont = document.getElementById('map-view-toggle');
        if (toggleCont) {
            const VIEWS = [
                { id: 'economic', label: 'เศรษฐกิจ', icon: 'fa-industry' },
                { id: 'political', label: 'การเมือง', icon: 'fa-landmark' },
                { id: 'social', label: 'สังคม', icon: 'fa-people-group' }
            ];
            toggleCont.innerHTML = VIEWS.map(v => `
                <button onclick="ui.mapView='${v.id}'; ui.renderProvinceMap();" class="px-3 py-2 border-2 border-black text-[10px] font-bold uppercase flex items-center gap-1.5 transition ${this.mapView === v.id ? 'bg-black text-white' : 'bg-white hover:bg-stone-100'}">
                    <i class="fas ${v.icon}"></i>${v.label}
                </button>`).join('');
        }

        const chip = (p) => {
            const industry = Data.INDUSTRY_TYPES[p.industry];
            const sizeClass = p.pop > 1200000 ? 'text-sm px-3 py-2' : (p.pop > 500000 ? 'text-xs px-2.5 py-1.5' : 'text-[10px] px-2 py-1');
            let color, badge = '';
            if (this.mapView === 'political') {
                const layer = engine.getProvincePoliticalLayer(p);
                color = layer.leaning === 'Government' ? '#3b82f6' : (layer.leaning === 'Opposition' ? '#ef4444' : '#94a3b8');
                if (layer.competitiveness === 'Battleground') badge = `<i class="fas fa-bullseye text-red-600 text-[9px]" title="สมรภูมิ"></i>`;
            } else if (this.mapView === 'social') {
                const layer = engine.getProvincePoliticalLayer(p);
                color = layer.populationTrend === 'Growing' ? '#10b981' : (layer.populationTrend === 'Shrinking' ? '#ef4444' : '#f59e0b');
                if (layer.populationTrend === 'Growing') badge = `<i class="fas fa-arrow-trend-up text-emerald-600 text-[9px]"></i>`;
                else if (layer.populationTrend === 'Shrinking') badge = `<i class="fas fa-arrow-trend-down text-red-600 text-[9px]"></i>`;
            } else {
                const inv = p.investmentLevel ?? 50;
                color = inv > 60 ? '#10b981' : (inv < 40 ? '#ef4444' : '#f59e0b');
            }
            return `<button onclick="ui.showProvinceDetail('${p.name}')" title="${industry?.label || ''}" class="border-2 border-black font-bold ${sizeClass} bg-white hover:-translate-y-0.5 transition shadow-[2px_2px_0_#000] hover:shadow-[3px_3px_0_#000] flex items-center gap-1.5" style="border-left: 6px solid ${color}"><i class="fas ${industry?.icon || 'fa-industry'} text-stone-400 text-[10px]"></i>${p.name}${badge}</button>`;
        };

        const regionBlock = (name) => `
            <div class="bg-stone-50 border-2 border-black p-3">
                <div class="flex justify-between items-center mb-2 border-b-2 border-black pb-1">
                    <span class="font-black text-xs uppercase tracking-widest">${name}</span>
                    <span class="text-[10px] font-mono text-stone-500">${byRegion[name].length} จังหวัด · ${byRegion[name].reduce((s,p)=>s+p.seats,0)} ที่นั่ง</span>
                </div>
                <div class="flex flex-wrap gap-1.5">${byRegion[name].map(chip).join('')}</div>
            </div>
        `;

        // Rough geographic mosaic: North/Northeast up top, West-Central-East in the middle band, South at the bottom
        cont.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
                ${regionBlock("เหนือ")}
                ${regionBlock("อีสาน")}
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
                ${regionBlock("ตะวันตก")}
                ${regionBlock("กลาง")}
                ${regionBlock("ตะวันออก")}
            </div>
            <div class="grid grid-cols-1 gap-3">
                ${regionBlock("ใต้")}
            </div>
        `;
    },

    showProvinceDetail(name) {
        const p = state.provinces.find(x => x.name === name); if (!p) return;
        const faction = state.factions.find(f => f.name === p.baseFaction);
        const approval = faction ? faction.approval : 50;
        const approvalColor = approval > 60 ? 'text-emerald-700' : (approval < 40 ? 'text-red-700' : 'text-amber-700');
        const industry = Data.INDUSTRY_TYPES[p.industry];
        const tradePartner = state.foreign.find(c => c.keyIndustry === p.industry);
        const isLogistics = p.industry === "โลจิสติกส์และการส่งออก";
        const avgTradeRelation = isLogistics
            ? state.foreign.reduce((s, c) => s + c.relation * c.tradeWeight, 0) / state.foreign.reduce((s, c) => s + c.tradeWeight, 0)
            : null;
        const investLevel = p.investmentLevel ?? 50;
        // Province Political Layer (Stage B3): the province as a source of information for a
        // decision, not just a button to invest in -- who's actually ahead here right now, how
        // contested it is, what's straining its own industry, and whether it's gaining or losing people.
        const layer = engine.getProvincePoliticalLayer(p);
        const LEANING_LABELS = { Government: ["รัฐบาลนำ", "text-blue-700"], Opposition: ["ฝ่ายค้านนำ", "text-red-700"], Neutral: ["สูสี", "text-stone-700"] };
        const COMPETITIVE_LABELS = { Battleground: ["สมรภูมิ", "text-red-700"], Leaning: ["เอียงข้างชัดเจน", "text-amber-700"], Safe: ["มั่นคง", "text-emerald-700"] };
        const TREND_LABELS = { Growing: ["ประชากรเพิ่มขึ้น", "text-emerald-700", "fa-arrow-trend-up"], Shrinking: ["ประชากรลดลง", "text-red-700", "fa-arrow-trend-down"], Stable: ["ประชากรคงที่", "text-stone-700", "fa-minus"] };
        const cont = document.getElementById('province-detail'); if (!cont) return;
        cont.innerHTML = `
            <div class="text-[9px] uppercase tracking-widest text-stone-500 font-bold mb-1">ภาค${p.region}</div>
            <h3 class="serif text-2xl font-black mb-4 border-b-2 border-black pb-2">${p.name}</h3>
            <div class="space-y-3 text-xs">
                <div class="flex justify-between border-b border-stone-200 pb-1"><span>ประชากร</span><span class="font-mono font-bold">${(p.pop/1e6).toFixed(2)}M</span></div>
                <div class="flex justify-between border-b border-stone-200 pb-1"><span>ที่นั่ง สส. เขต</span><span class="font-mono font-bold">${p.seats}</span></div>
                <div class="flex justify-between border-b border-stone-200 pb-1"><span>ฐานเสียงหลัก</span><span class="font-bold">${p.baseFaction}</span></div>
                <div class="flex justify-between border-b border-stone-200 pb-1"><span>Approval ฐานเสียง</span><span class="font-mono font-bold ${approvalColor}">${approval.toFixed(0)}%</span></div>
                <div class="flex justify-between border-b border-stone-200 pb-1"><span><i class="fas ${industry?.icon || 'fa-industry'} mr-1"></i>อุตสาหกรรมหลัก</span><span class="font-bold">${industry?.label || p.industry}</span></div>
                ${tradePartner ? `<div class="flex justify-between border-b border-stone-200 pb-1"><span><i class="fas ${tradePartner.icon} mr-1"></i>คู่ค้าหลัก</span><span class="font-bold">${tradePartner.name} (${tradePartner.relation.toFixed(0)}%)</span></div>` : ''}
                ${isLogistics ? `<div class="flex justify-between border-b border-stone-200 pb-1"><span><i class="fas fa-earth-asia mr-1"></i>คู่ค้าหลัก</span><span class="font-bold">ทุกประเทศเฉลี่ย (${avgTradeRelation.toFixed(0)}%)</span></div>` : ''}
            </div>
            <div class="mt-4 pt-3 border-t-2 border-black">
                <div class="text-[9px] uppercase tracking-widest text-stone-500 font-bold mb-2">สนามเลือกตั้ง (ถ้าเลือกตั้งวันนี้)</div>
                <div class="flex justify-between text-xs border-b border-stone-200 pb-1 mb-1"><span>รัฐบาล ${layer.govSupport.toFixed(0)}% &middot; ฝ่ายค้าน ${layer.oppSupport.toFixed(0)}%</span><span class="font-bold ${LEANING_LABELS[layer.leaning][1]}">${LEANING_LABELS[layer.leaning][0]}</span></div>
                <div class="w-full h-2 bg-red-200 border border-black mb-2 flex overflow-hidden"><div class="h-full bg-blue-500" style="width:${layer.govSupport}%"></div></div>
                <div class="flex justify-between text-xs border-b border-stone-200 pb-1"><span>ความสูสี</span><span class="font-bold ${COMPETITIVE_LABELS[layer.competitiveness][1]}">${COMPETITIVE_LABELS[layer.competitiveness][0]}</span></div>
                <div class="flex justify-between text-xs border-b border-stone-200 pb-1"><span><i class="fas ${TREND_LABELS[layer.populationTrend][2]} mr-1"></i>แนวโน้มประชากร</span><span class="font-bold ${TREND_LABELS[layer.populationTrend][1]}">${TREND_LABELS[layer.populationTrend][0]}</span></div>
                ${layer.localIssue ? `<div class="flex justify-between text-xs pb-1"><span><i class="fas fa-triangle-exclamation mr-1"></i>ปัญหาเด่นในพื้นที่</span><span class="font-bold text-amber-700">${layer.localIssue}</span></div>` : ''}
            </div>
            ${state.player.party.status === "Government" ? `
            <div class="mt-4 pt-3 border-t-2 border-black">
                <div class="flex justify-between text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1"><span>ระดับการลงทุน</span><span>${investLevel.toFixed(0)}%</span></div>
                <div class="w-full h-2 bg-stone-200 border border-black mb-2"><div class="h-full bg-emerald-600" style="width:${investLevel}%"></div></div>
                <div class="text-[9px] text-stone-500 mb-3 leading-relaxed">ลงทุนสูงกว่า 50% ช่วยผลผลิตและเพิ่มคะแนนเสียงให้พรรครัฐบาลในเขตนี้ตอนเลือกตั้ง ปล่อยให้ต่ำกว่า 50% จะถูกลงโทษที่คูหาเช่นกัน</div>
                <div class="text-[9px] uppercase tracking-widest text-stone-500 font-bold mb-2">ทิศทางเศรษฐกิจ (ตามสภาพภูมิศาสตร์ภาค${p.region})</div>
                <div class="space-y-2">
                    ${(Data.REGION_ELIGIBLE_INDUSTRIES[p.region] || []).map(ind => {
                        const meta = Data.INDUSTRY_TYPES[ind]; if (!meta) return '';
                        const isCurrent = ind === p.industry;
                        const GROWTH_STAGE_LABELS = { Saturated: "อิ่มตัวแล้ว ผลลดลงมาก", Growing: "กำลังเติบโต", Emerging: "เพิ่งเริ่มต้น", Declining: "ทรุดตัว" };
                        const growthNote = isCurrent ? GROWTH_STAGE_LABELS[engine.getProvinceContext(p).growthStage] : '';
                        const satNote = isCurrent && (p.investSaturation || 0) > 0 ? ` &middot; ผลเหลือ ${(100 - (p.investSaturation || 0)).toFixed(0)}%` : '';
                        return `<button onclick="engine.investProvince('${p.name}', '${ind}')" class="w-full flex items-center justify-between py-2 px-3 text-[10px] font-bold border-2 border-black uppercase transition ${isCurrent ? 'bg-black text-white' : 'bg-white hover:bg-stone-100'}">
                            <span><i class="fas ${meta.icon} mr-1.5"></i>${isCurrent ? 'ลงทุนเพิ่ม' : 'ปรับเป็น'}: ${meta.label}${growthNote ? ` (${growthNote}${satNote})` : ''}</span>
                            <span>฿${isCurrent ? '2' : '6'}B</span>
                        </button>`;
                    }).join('')}
                </div>
            </div>` : `
            <div class="mt-4 pt-3 border-t-2 border-black">
                <div class="text-[9px] text-stone-500 mb-3 leading-relaxed">พรรคท่านไม่ได้เป็นรัฐบาล จึงไม่มีอำนาจใช้งบประเทศพัฒนาอุตสาหกรรมในพื้นที่นี้ -- ใช้เงินส่วนตัวลงพื้นที่หาเสียงแทน เพื่อสะสมคะแนนไว้ใช้ตอนเลือกตั้งครั้งหน้า</div>
                <div class="flex justify-between text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1"><span>คะแนนหาเสียงสะสม (ใช้ตอนเลือกตั้งครั้งหน้า)</span><span>${(p.playerCampaignBoost || 0).toFixed(0)}/40</span></div>
                <div class="w-full h-2 bg-stone-200 border border-black mb-3"><div class="h-full bg-red-600" style="width:${((p.playerCampaignBoost || 0) / 40) * 100}%"></div></div>
                <button onclick="engine.campaignProvince('${p.name}')" class="w-full flex items-center justify-between py-2 px-3 text-[10px] font-bold border-2 border-black uppercase transition bg-white hover:bg-stone-100">
                    <span><i class="fas fa-bullhorn mr-1.5"></i>ลงพื้นที่หาเสียง${(p.campaignSaturation || 0) > 0 ? ` (ผลเหลือ ${(100 - (p.campaignSaturation || 0)).toFixed(0)}%)` : ''}</span>
                    <span>฿5M (ส่วนตัว)</span>
                </button>
            </div>`}
            ${p.lastResult ? `
            <div class="mt-4 pt-3 border-t-2 border-black">
                <div class="text-[9px] uppercase tracking-widest text-stone-500 font-bold mb-2">ผลเลือกตั้งล่าสุดในจังหวัดนี้</div>
                <div class="space-y-1">
                    ${Object.entries(p.lastResult).sort((a,b)=>b[1]-a[1]).map(([partyId, won]) => {
                        const party = state.parties.find(x => x.id === partyId);
                        if (!party) return '';
                        return `<div class="flex justify-between items-center text-[11px]"><span class="flex items-center gap-1.5"><span class="inline-block w-2 h-2 rounded-full border border-black" style="background:${party.color}"></span>${party.name}</span><span class="font-mono font-bold">${won}/${p.seats}</span></div>`;
                    }).join('')}
                </div>
            </div>` : ''}
        `;
    },

    // --- 5. FACTIONS (ปรับใหม่: Report Cards) ---
    renderFactionList() {
        const cont = document.getElementById('faction-list'); if(!cont) return;
        const totalOutput = state.factions.reduce((s, f) => s + f.basePop * f.wealth, 0);
        cont.innerHTML = state.factions.map(f => {
            const econShare = (f.basePop * f.wealth) / totalOutput * 100;
            return `
            <div class="bg-white p-4 border-2 border-black shadow-[4px_4px_0_rgba(0,0,0,0.1)] hover:-translate-y-1 transition duration-200">
                <div class="flex justify-between items-start mb-2">
                    <div class="text-2xl text-stone-400"><i class="fas ${f.icon}"></i></div>
                    <div class="text-right">
                        <div class="text-2xl font-black font-mono leading-none">${f.approval.toFixed(0)}%</div>
                        <div class="text-[8px] uppercase tracking-widest font-bold text-stone-500">Approval</div>
                    </div>
                </div>
                <div class="font-bold text-sm uppercase tracking-wide border-t-2 border-black pt-2 mt-2">${f.name}</div>
                <div class="w-full bg-stone-200 h-1 mt-2"><div class="h-full bg-black" style="width: ${f.approval}%"></div></div>
                <div class="flex justify-between text-[9px] text-stone-500 mt-2" title="สัดส่วนต่อผลผลิตทางเศรษฐกิจของประเทศ (ประชากร x ความมั่งคั่ง)">
                    <span>น้ำหนักเศรษฐกิจ</span>
                    <span class="font-mono font-bold">${econShare.toFixed(1)}%</span>
                </div>
                <div class="flex justify-between text-[9px] text-stone-500 mt-1" title="จำนวนประชากรกลุ่มนี้ในปัจจุบัน">
                    <span>ประชากร</span>
                    <span class="font-mono font-bold">${(f.basePop / 1e6 >= 1 ? (f.basePop / 1e6).toFixed(1) + 'M' : (f.basePop / 1e3).toFixed(0) + 'K')} ${this.factionTrend(f)}</span>
                </div>
                ${(f.modifiers && f.modifiers.length > 0) ? `
                <div class="mt-3 pt-2 border-t border-stone-200 space-y-1">
                    ${f.modifiers.slice(0, 3).map(m => `
                        <div class="flex justify-between text-[9px] text-stone-500 gap-2">
                            <span class="truncate">${m.source}</span>
                            <span class="font-mono whitespace-nowrap ${m.perDay > 0 ? 'text-emerald-700' : 'text-red-700'}">${m.perDay > 0 ? '+' : ''}${(m.perDay * m.remaining).toFixed(0)} · ${Math.ceil(m.remaining)}d</span>
                        </div>
                    `).join('')}
                </div>` : ''}
            </div>
        `;
        }).join("");
    },

    // --- FOREIGN AFFAIRS ---
    renderForeignList() {
        const cont = document.getElementById('foreign-list'); if(!cont) return;
        cont.innerHTML = state.foreign.map(c => {
            const relationColor = c.relation > 60 ? 'bg-emerald-500' : (c.relation < 35 ? 'bg-red-500' : 'bg-yellow-500');
            return `
            <div class="bg-white p-4 border-2 border-black shadow-[4px_4px_0_rgba(0,0,0,0.1)] hover:-translate-y-1 transition duration-200">
                <div class="flex justify-between items-start mb-2">
                    <div class="text-2xl text-stone-400"><i class="fas ${c.icon}"></i></div>
                    <div class="text-right">
                        <div class="text-2xl font-black font-mono leading-none">${c.relation.toFixed(0)}%</div>
                        <div class="text-[8px] uppercase tracking-widest font-bold text-stone-500">Relation</div>
                    </div>
                </div>
                <div class="font-bold text-sm uppercase tracking-wide border-t-2 border-black pt-2 mt-2">${c.name}</div>
                <div class="text-[9px] text-stone-500 italic mb-1">แนวคิด: ${c.ideology} · คู่ค้าหลัก: ${Data.INDUSTRY_TYPES[c.keyIndustry]?.label || c.keyIndustry}</div>
                <div class="w-full bg-stone-200 h-1 mt-1"><div class="h-full ${relationColor}" style="width: ${c.relation}%"></div></div>
                ${c.relation < 15 ? `<div class="mt-2 text-[9px] font-bold uppercase tracking-widest text-red-700"><i class="fas fa-triangle-exclamation mr-1"></i>เสี่ยงปะทะชายแดน</div>` : ''}
                ${(c.modifiers && c.modifiers.length > 0) ? `
                <div class="mt-3 pt-2 border-t border-stone-200 space-y-1">
                    ${c.modifiers.slice(0, 3).map(m => `
                        <div class="flex justify-between text-[9px] text-stone-500 gap-2">
                            <span class="truncate">${m.source}</span>
                            <span class="font-mono whitespace-nowrap ${m.perDay > 0 ? 'text-emerald-700' : 'text-red-700'}">${m.perDay > 0 ? '+' : ''}${(m.perDay * m.remaining).toFixed(0)} · ${Math.ceil(m.remaining)}d</span>
                        </div>
                    `).join('')}
                </div>` : ''}
                <div class="flex gap-2 mt-3">
                    <button onclick="engine.diplomaticVisit('${c.id}')" class="flex-1 py-2 text-[10px] font-bold border-2 border-black bg-white hover:bg-black hover:text-white transition uppercase">เยือนทางการทูต (฿20M)</button>
                    <button onclick="engine.tradeDeal('${c.id}')" class="flex-1 py-2 text-[10px] font-bold border-2 border-black bg-white hover:bg-black hover:text-white transition uppercase ${c.relation < 40 ? 'opacity-40' : ''}">ข้อตกลงการค้า (฿15B)</button>
                </div>
            </div>
        `;
        }).join("");
    },

    // --- 6. MP LIST (!!! DO NOT CHANGE LOGIC, ONLY NEATNESS !!!) ---
    renderMPList() {
        const cont = document.getElementById('mp-roster-list'); if(!cont) return;
        const leftScroll = document.getElementById('mp-list-left')?.scrollTop || 0;
        const filterVal = document.getElementById('mp-search-input')?.value.toLowerCase() || "";
        
        cont.className = "h-[70vh] flex flex-col md:flex-row overflow-hidden border-2 border-black bg-stone-200 shadow-xl";

        if (filterVal.length > 0) {
            // Search Mode
            const filtered = state.leaders.filter(l => l.name.toLowerCase().includes(filterVal));
            let html = `
                <div id="mp-list-right" class="w-full overflow-y-auto scroll-custom bg-[#fcfbf9] p-6">
                    <div class="font-bold text-lg mb-4 pb-2 border-b-2 border-black">ผลการค้นหา: "${filterVal}" (${filtered.length})</div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            `;
            if (filtered.length === 0) html += `<div class="col-span-full text-center text-stone-400 italic py-10">ไม่พบข้อมูล</div>`;
            else filtered.forEach(l => { html += this.createMPCard(l); });
            html += `</div></div>`;
            cont.innerHTML = html;
        } else {
            // Directory Mode
            if (!this.currentPartyView && state.player.party) this.currentPartyView = state.player.party.id;
            const parties = [...state.parties].sort((a,b) => b.seats - a.seats);
            const selectedParty = parties.find(p => p.id === this.currentPartyView) || parties[0];
            const allMps = state.leaders.filter(l => l.party.id === selectedParty.id);

            const itemsPerPage = 9;
            const totalPages = Math.ceil(allMps.length / itemsPerPage);
            if (this.mpListPage > totalPages) this.mpListPage = totalPages > 0 ? totalPages : 1;
            if (this.mpListPage < 1) this.mpListPage = 1;
            const currentMps = allMps.slice((this.mpListPage - 1) * itemsPerPage, this.mpListPage * itemsPerPage);

            // Left Col: Neat Folder Tabs
            let leftCol = `<div id="mp-list-left" class="w-full lg:w-1/4 bg-stone-100 border-r-2 border-black overflow-y-auto scroll-custom">`;
            leftCol += `<div class="bg-black text-white text-[10px] font-bold uppercase tracking-widest p-3 sticky top-0 z-10">Party Directory</div>`;
            leftCol += parties.map(p => `
                <button onclick="ui.currentPartyView = '${p.id}'; ui.mpListPage = 1; ui.renderMPList()" 
                    class="w-full text-left p-3 border-b border-stone-300 hover:bg-white transition flex items-center justify-between group ${p.id === selectedParty.id ? 'bg-white border-l-4 border-l-black' : 'opacity-70'}">
                    <div class="flex items-center gap-3">
                        <div class="w-2 h-2 rounded-full border border-black" style="background:${p.color}"></div>
                        <span class="font-bold text-xs uppercase tracking-tight">${p.name}</span>
                    </div>
                    <span class="font-mono text-[10px] font-bold bg-stone-200 px-1.5 rounded">${p.seats}</span>
                </button>
            `).join('');
            leftCol += `</div>`;

            // Right Col: Neat Grid
            let rightCol = `<div class="w-full lg:w-3/4 bg-[#fcfbf9] flex flex-col h-full relative">`;
            rightCol += `
                <div class="px-6 py-4 border-b-2 border-black bg-white flex justify-between items-center shadow-sm z-10">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 border-2 border-black flex items-center justify-center text-white text-lg font-bold shadow-[2px_2px_0_#000]" style="background:${selectedParty.color}">${selectedParty.name.charAt(0)}</div>
                        <div>
                            <h3 class="text-xl font-black uppercase tracking-tighter leading-none">${selectedParty.name}</h3>
                            <div class="text-[9px] font-bold text-stone-500 uppercase tracking-widest">Members: ${allMps.length} | Status: ${selectedParty.status}</div>
                        </div>
                    </div>
                    <div class="font-mono text-xs font-bold bg-stone-100 px-3 py-1 border border-stone-300">Page ${this.mpListPage}/${totalPages}</div>
                </div>
                
                <div class="flex-1 overflow-y-auto p-6 scroll-custom paper-texture">
                    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        ${currentMps.map(l => this.createMPCard(l)).join('')}
                    </div>
                </div>

                <div class="bg-stone-50 border-t-2 border-black p-2 flex justify-between items-center px-6">
                    <button onclick="if(ui.mpListPage > 1){ ui.mpListPage--; ui.renderMPList(); }" class="text-xs font-bold uppercase hover:underline ${this.mpListPage === 1 ? 'opacity-30 pointer-events-none' : ''}">← Previous</button>
                    <button onclick="if(ui.mpListPage < ${totalPages}){ ui.mpListPage++; ui.renderMPList(); }" class="text-xs font-bold uppercase hover:underline ${this.mpListPage === totalPages ? 'opacity-30 pointer-events-none' : ''}">Next →</button>
                </div>
            </div>`;

            cont.innerHTML = leftCol + rightCol;
        }
        const newLeft = document.getElementById('mp-list-left'); if (newLeft) newLeft.scrollTop = leftScroll;
    },

    createMPCard(l) {
        const trait = l.trait || { ideology: "-", goal: "-", ability: { icon: "fa-question", name: "-" }, socio: { name: "-" } };
        const loyaltyColor = l.loyalty > 70 ? 'bg-emerald-500' : (l.loyalty < 30 ? 'bg-red-500' : 'bg-yellow-500');
        
        return `
        <div class="bg-white border-2 border-stone-200 p-3 hover:border-black shadow-sm hover:shadow-[4px_4px_0_#000] transition group relative flex flex-col h-full rounded-sm">
            ${l.isCobra ? `<div class="absolute top-0 right-0 bg-red-600 text-white text-[8px] font-bold px-2 py-0.5 uppercase tracking-widest">Cobra</div>` : ''}
            
            <div class="flex items-center gap-3 mb-3 border-b border-stone-100 pb-2">
                <div class="w-8 h-8 bg-stone-100 border border-stone-300 flex items-center justify-center text-stone-400"><i class="fas fa-user"></i></div>
                <div class="min-w-0">
                    <div class="font-bold text-sm truncate text-black leading-tight">${l.name}</div>
                    <div class="text-[9px] text-stone-500 truncate uppercase tracking-wider">${trait.socio?.name || '-'}${l.province ? ` &middot; ${l.province}` : ''}</div>
                </div>
            </div>

            <div class="flex items-center gap-1 text-[9px] text-stone-500 mb-2 truncate" title="${trait.ideology} / ${trait.goal}">
                <i class="fas ${Data.TRAIT_ICONS[trait.ideology] || 'fa-question'}"></i>
                <span class="truncate">${trait.ideology}</span>
            </div>

            <div class="mt-auto space-y-2">
                <div class="flex justify-between items-center text-[9px] text-stone-500 font-bold uppercase tracking-wider">
                    <span>Loyalty</span>
                    <span>${l.loyalty.toFixed(0)}%</span>
                </div>
                <div class="w-full h-1.5 bg-stone-200 border border-stone-300"><div class="h-full ${loyaltyColor}" style="width: ${l.loyalty}%"></div></div>
                
                <button onclick="ui.showMPActionModal(${l.id})" class="w-full mt-2 py-1.5 bg-white border border-black text-[10px] font-bold uppercase hover:bg-black hover:text-white transition">
                    View Dossier
                </button>
            </div>
        </div>`;
    },

    // --- HELPER & MODALS (Consistent Style) ---
    createIcon(iconClass, colorClass, title) {
        return `<div class="w-6 h-6 bg-stone-100 border border-stone-300 flex items-center justify-center text-xs" title="${title}"><i class="fas ${iconClass} text-stone-600"></i></div>`;
    },

    showAppointModal(mName) { if (state.player.party.status !== "Government") return; this.resetModalState(); let h = `<div class="space-y-2 max-h-[400px] overflow-y-auto scroll-custom p-1">`; const govtParties = state.parties.filter(p => p.status === "Government"); govtParties.forEach(p => { const list = state.leaders.filter(l => l.party.id === p.id); list.forEach(l => { h += `<div class="flex justify-between items-center p-3 border border-stone-200 bg-white hover:border-black transition"><div class="flex items-center gap-3"><div class="w-2 h-2 rounded-full" style="background:${p.color}"></div><div><div class="font-bold text-xs">${l.name}</div><div class="text-[9px] text-stone-500 uppercase">${p.name} · ชื่อเสียง ${l.prestige}%</div></div></div><button onclick="engine.appointMinister('${mName}', ${l.id}); document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="border border-black px-3 py-1 text-[9px] font-bold uppercase hover:bg-black hover:text-white transition">Select</button></div>`; }); }); h += `</div>`; document.getElementById('event-title').innerText = `Appoint Minister: ${mName}`; document.getElementById('event-desc').innerHTML = h; document.getElementById('event-options').innerHTML = `<button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="w-full p-2 bg-stone-200 border border-black font-bold text-xs uppercase hover:bg-stone-300">Cancel</button>`; document.getElementById('event-modal').classList.remove('hidden'); },
    
    // Keeping other modals from previous context, applying "border-black" style where simple strings are used.
    showPartyAdjustModal(type) { this.resetModalState(); const pool = type === 'ideology' ? Data.IDEOLOGY_POOL : Data.GOAL_POOL; let h = `<div class="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-2 scroll-custom">`; pool.forEach(item => { h += `<div class="bg-white border border-stone-300 p-2 flex justify-between items-center hover:border-black transition"><span class="font-bold text-xs text-black">${item}</span><button onclick="engine.adjustStance('${type}', '${item}'); document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="bg-black text-white px-2 py-1 text-[9px] font-bold hover:bg-stone-700 uppercase">Select</button></div>`; }); h += `</div>`; document.getElementById('event-title').innerText = `Change Party ${type}`; document.getElementById('event-desc').innerHTML = h; document.getElementById('event-modal').classList.remove('hidden'); },
    
    // ... (Keep existing showMPActionModal, showFeedback, showVoteInterface etc. as they are already styled or logic-heavy) ...
    // Note: Re-inserting the previous `showMPActionModal` and others to ensure the file is complete.
    
    showMPActionModal(id) {
        this.resetModalState();
        const l = state.leaders.find(x => x.id === id); if(!l) return;
        const lobbyCost = 2000000 * (l.trait?.socio?.costMod || 1);
        const cobraCost = 10000000 * (l.trait?.ability?.costMod || 1);
        const switchCost = 50000000;
        
        const content = `
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full font-sans">
                <div class="lg:col-span-4 border-r-2 border-black pr-6 flex flex-col items-center text-center">
                    <div class="w-32 h-32 bg-stone-200 border-2 border-black flex items-center justify-center mb-4"><i class="fas fa-user text-6xl text-stone-400"></i></div>
                    <h2 class="text-2xl font-black uppercase leading-none mb-1">${l.name}</h2>
                    <div class="text-xs font-bold bg-black text-white px-2 py-0.5 mb-4">${l.party.name}</div>
                    <div class="w-full text-left space-y-2 border-t-2 border-black pt-4">
                        ${l.province ? `<div class="flex justify-between text-xs border-b border-stone-300 pb-1"><span>เขตเลือกตั้ง</span><span class="font-bold">${l.province}</span></div>` : ''}
                        <div class="flex justify-between text-xs border-b border-stone-300 pb-1"><span>Status</span><span class="font-bold">${l.status}</span></div>
                        <div class="flex justify-between text-xs border-b border-stone-300 pb-1"><span>Wealth</span><span class="font-bold font-mono">฿${(l.cash/1e6).toFixed(1)}M</span></div>
                        <div class="flex justify-between text-xs border-b border-stone-300 pb-1"><span>ชื่อเสียง (Prestige)</span><span class="font-bold ${l.prestige > 60 ? 'text-amber-700' : 'text-stone-700'}">${l.prestige}%</span></div>
                        <div class="flex justify-between text-xs border-b border-stone-300 pb-1"><span>ความทะเยอทะยาน (Ambition)</span><span class="font-bold ${(l.ambition ?? 50) > 60 ? 'text-purple-700' : 'text-stone-700'}">${l.ambition ?? 50}%</span></div>
                        ${(() => {
                            const risk = engine.getMPElectoralRisk(l);
                            const RISK_LABELS = { AtRisk: ["เสี่ยงแพ้เขต", "text-red-700"], Competitive: ["แข่งขันสูง", "text-amber-700"], Safe: ["ที่นั่งมั่นคง", "text-emerald-700"] };
                            const row = `<div class="flex justify-between text-xs border-b border-stone-300 pb-1"><span>สถานะการเลือกตั้ง</span><span class="font-bold ${RISK_LABELS[risk][1]}">${RISK_LABELS[risk][0]}</span></div>`;
                            // Seat Security (Stage B2): a one-line reason straight from the same
                            // inputs getMPElectoralRisk() itself reads, so an AtRisk/Competitive
                            // badge doesn't just assert a claim -- the province and the local base's
                            // mood are what actually decide it now, not the MP's own faction alone.
                            if (risk === "Safe" || !l.province) return row;
                            const prov = state.provinces.find(p => p.name === l.province);
                            const baseApproval = state.factions.find(f => f.name === prov?.baseFaction)?.approval ?? 50;
                            const reasons = [];
                            if (baseApproval < 45) reasons.push(`ฐานเสียง${prov.baseFaction}ในพื้นที่ไม่พอใจ (${baseApproval.toFixed(0)}%)`);
                            if (l.party.status === "Government" && (prov.investmentLevel ?? 50) < 45) reasons.push(`จังหวัดลงทุนต่ำ (${(prov.investmentLevel ?? 50).toFixed(0)}%)`);
                            const note = reasons.length > 0 ? `<div class="text-[9px] text-stone-500 -mt-1 mb-1">${reasons.join(' · ')}</div>` : '';
                            return row + note;
                        })()}
                        <div class="flex justify-between text-xs border-b border-stone-300 pb-1"><span>Loyalty</span><span class="font-bold ${l.loyalty > 50 ? 'text-green-700':'text-red-700'}">${l.loyalty.toFixed(0)}%</span></div>
                        <div class="flex justify-between text-xs border-b border-stone-300 pb-1"><span>Conviction</span><span class="font-bold ${l.conviction > 85 ? 'text-red-700':'text-stone-700'}">${l.conviction}%${l.conviction > 85 ? ' (ย้ายพรรคไม่ได้)' : ''}</span></div>
                        <div class="flex justify-between text-xs border-b border-stone-300 pb-1"><span>Trust (ท่าน)</span><span class="font-bold ${l.trust > 60 ? 'text-green-700' : (l.trust < 35 ? 'text-red-700' : 'text-stone-700')}">${l.trust.toFixed(0)}%${l.switchCooldown > 0 ? ` (จำเรื่องเดิมอีก ${Math.ceil(l.switchCooldown)} วัน)` : ''}</span></div>
                        <div class="flex justify-between text-xs border-b border-stone-300 pb-1"><span>Ideology</span><span class="font-bold">${l.trait.ideology}</span></div>
                        <div class="flex justify-between text-xs border-b border-stone-300 pb-1"><span>Goal</span><span class="font-bold">${l.trait.goal}</span></div>
                    </div>
                </div>
                <div class="lg:col-span-8 flex flex-col">
                    <h3 class="font-bold text-sm uppercase tracking-widest border-b-2 border-black pb-2 mb-4">Operations</h3>
                    <div class="grid grid-cols-1 gap-3">
                        <button onclick="engine.lobbyIndividual(${l.id})" class="flex justify-between items-center p-4 border-2 border-black hover:bg-stone-100 transition group">
                            <div class="text-left"><div class="font-bold text-sm group-hover:underline">Lobbying</div><div class="text-[9px] text-stone-500 uppercase">Improve Relations${(l.lobbySaturation || 0) > 0 ? ` &middot; ผลเหลือ ${(100 - (l.lobbySaturation || 0)).toFixed(0)}%` : ''}</div></div>
                            <div class="font-mono font-bold text-xs">฿${(lobbyCost/1e6).toFixed(1)}M</div>
                        </button>
                        <button onclick="engine.buyCobra(${l.id})" ${l.party.id === state.player.party.id ? 'disabled class="opacity-50 flex justify-between items-center p-4 border-2 border-stone-300"' : 'class="flex justify-between items-center p-4 border-2 border-black hover:bg-red-50 transition group"'} >
                            <div class="text-left"><div class="font-bold text-sm text-red-900 group-hover:underline">Secret Deal (Cobra)</div><div class="text-[9px] text-red-800/60 uppercase">Buy Vote</div></div>
                            <div class="font-mono font-bold text-xs text-red-700">฿${(cobraCost/1e6).toFixed(1)}M</div>
                        </button>
                        <button onclick="engine.forceSwitchParty(${l.id})" ${l.party.id === state.player.party.id ? 'disabled class="opacity-50 flex justify-between items-center p-4 border-2 border-stone-300"' : 'class="flex justify-between items-center p-4 border-2 border-black hover:bg-blue-50 transition group"'} >
                            <div class="text-left"><div class="font-bold text-sm text-blue-900 group-hover:underline">Force Switch</div><div class="text-[9px] text-blue-800/60 uppercase">Change Party</div></div>
                            <div class="font-mono font-bold text-xs text-blue-700">฿${(switchCost/1e6).toFixed(1)}M</div>
                        </button>
                    </div>
                </div>
            </div>`;
        document.getElementById('mp-dossier-content').innerHTML = content;
        document.getElementById('mp-dossier-modal').classList.remove('hidden');
    },

    showFeedback(t, s, n, cb) {
        const labels = { lobby: "ล็อบบี้", switch: "ดูด สส.", cobra: "ดีลลับ (งูเห่า)" };
        const label = labels[t] || t;
        const container = document.getElementById('toast-container');
        if (container) {
            const el = document.createElement('div');
            el.className = `w-72 px-4 py-3 border-2 border-black font-sans shadow-[4px_4px_0_#000] transition-opacity duration-500 ${s ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`;
            el.innerHTML = `
                <div class="text-[9px] font-bold uppercase tracking-widest opacity-70 mb-1">${label}</div>
                <div class="font-bold text-sm">${n}: ${s ? 'สำเร็จ' : 'ล้มเหลว'}</div>
            `;
            container.appendChild(el);
            setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, 2200);
        }
        if (cb) cb();
    },
    
    // ... Keeping other specific modal logic (Vote Interface etc) consistent with style ...
    showVoteInterface(pName) { const p = state.activePolicies.find(x => x.name === pName); gameClock.setSpeed(0); this.resetModalState(); document.getElementById('event-title').innerText = `Parliament Vote`; document.getElementById('event-desc').innerHTML = `<div class="text-center font-serif text-2xl font-bold border-y-2 border-black py-4 my-4">${p.name}</div><div class="text-center text-xs uppercase tracking-widest text-stone-500">วาระที่ ${p.stage}/3 &middot; แนวคิด: ${p.ideology} · เป้าหมาย: ${p.goal} · กลุ่มเป้าหมาย: ${p.target}</div><div class="text-center text-[10px] text-red-700 mt-2">แพ้โหวตครั้งนี้ ร่างจะตกทันที ไม่มีสิทธิ์แก้ตัว</div>`; document.getElementById('voting-display').classList.remove('hidden'); document.getElementById('event-options').innerHTML = `<button onclick="window.engine.runVote('${p.name}')" class="w-full p-4 bg-black text-white font-bold border-2 border-black text-lg hover:bg-stone-800">Start Voting</button>`; document.getElementById('event-modal').classList.remove('hidden'); },

    displayResults(p, yes, no) {
        document.getElementById('vote-count-yes').innerText = yes;
        document.getElementById('vote-count-no').innerText = no;
        const passed = yes > no;
        const outcomeNote = !passed ? "ร่างตกไป" : (p.stage < 3 ? `ผ่านวาระ ${p.stage}/3 เข้าสู่วาระ ${p.stage + 1} ต่อไป` : "ผ่านวาระสุดท้าย บังคับใช้เป็นกฎหมายทันที");
        document.getElementById('event-desc').innerHTML = `
            <div class="text-center font-serif text-2xl font-bold border-y-2 border-black py-4 my-4">${p.name}</div>
            <div class="text-center text-lg font-black uppercase tracking-widest ${passed ? 'text-emerald-700' : 'text-red-700'}">${passed ? 'มติผ่าน' : 'มติไม่ผ่าน'}</div>
            <div class="text-center text-xs text-stone-500 mt-1">${outcomeNote}</div>
        `;
        document.getElementById('event-options').innerHTML = `<button onclick="window.engine.finalizeVote('${p.name}', ${passed})" class="w-full p-4 ${passed ? 'bg-black' : 'bg-red-700'} text-white font-bold border-2 border-black text-lg hover:opacity-90">รับทราบผล</button>`;
    },
    showQuidProQuo(p, demand, party) { this.resetModalState(); document.getElementById('event-title').innerText = `Backroom Deal`; document.getElementById('event-desc').innerHTML = `<div class="border-l-4 border-black pl-4 my-4"><div class="font-bold text-sm uppercase text-stone-500">Proposal from ${party.name} <span class="ml-2 font-mono ${(party.trust ?? 70) > 60 ? 'text-emerald-700' : ((party.trust ?? 70) < 40 ? 'text-red-700' : 'text-stone-500')}">(Trust: ${(party.trust ?? 70).toFixed(0)}%)</span></div><div class="font-serif text-lg italic">"We will support ${p.name} if you approve this:"</div><div class="mt-2 font-bold bg-stone-100 p-2 border border-black">${demand.name}</div><div class="mt-2 text-xs text-stone-500">ปฏิเสธจะทำให้ trust ของพรรคนี้ลดลง และมีผลต่อการโหวตครั้งต่อๆไปด้วย ไม่ใช่แค่ร่างนี้</div></div>`; document.getElementById('event-options').innerHTML = `<div class="grid grid-cols-2 gap-4"><button onclick='engine.processQuidProQuo("${p.name}", "${demand.name}", "${party.id}", true)' class="p-3 bg-black text-white font-bold uppercase hover:opacity-80">Accept</button><button onclick='engine.processQuidProQuo("${p.name}", "${demand.name}", "${party.id}", false)' class="p-3 border-2 border-black font-bold uppercase hover:bg-stone-100">Reject</button></div>`; document.getElementById('event-modal').classList.remove('hidden'); },
    showStakeholderReview(p, stakeholders, proposer) {
        this.resetModalState();
        document.getElementById('event-title').innerText = `Policy Review`;
        document.getElementById('stakeholder-reactions').classList.remove('hidden');
        let h = "";
        // State Capacity (Phase 4): a preview, not a promise -- ministry workload, minister fit,
        // and fiscal condition can all shift before this bill clears 3 readings, so the numbers
        // below are the full legal effect, scaled down at actual implementation time.
        const { effectiveness, fitLabel } = engine.getImplementationEffectiveness(p);
        const effColor = effectiveness > 0.85 ? 'text-emerald-700' : effectiveness > 0.6 ? 'text-amber-700' : 'text-red-700';
        h += `<div class="mb-3 pb-2 border-b-2 border-black"><div class="flex justify-between text-xs"><span class="font-bold uppercase tracking-widest text-stone-500">ประสิทธิผลคาดการณ์ (ถ้าผ่านตอนนี้)</span><span class="font-mono font-bold ${effColor}">${(effectiveness*100).toFixed(0)}%</span></div><div class="text-[10px] text-stone-500 mt-1">${fitLabel}</div></div>`;
        stakeholders.forEach(s => {
            const impact = p.impact[s.name] || 0;
            const color = impact > 0 ? 'text-green-700' : (impact < 0 ? 'text-red-700' : 'text-stone-400');
            h += `<div class="flex justify-between border-b border-stone-300 pb-1 mb-2"><span class="font-bold text-sm">${s.name}</span><span class="font-mono ${color}">${impact > 0 ? '+' : ''}${impact}</span></div>`;
        });
        if (p.worldImpact) {
            h += `<div class="mt-2 pt-2 border-t-2 border-black text-[9px] uppercase tracking-widest text-stone-500 font-bold">ผลต่อสถิติประเทศ</div>`;
            Object.entries(p.worldImpact).forEach(([stat, v]) => {
                const meta = Data.WORLD_STAT_META[stat]; if (!meta) return;
                const isGood = meta.goodDirection > 0 ? v > 0 : v < 0;
                h += `<div class="flex justify-between border-b border-stone-300 pb-1 mb-2"><span class="font-bold text-sm">${meta.label}</span><span class="font-mono ${isGood ? 'text-green-700' : 'text-red-700'}">${v > 0 ? '+' : ''}${v}</span></div>`;
            });
        }
        document.getElementById('stakeholder-reactions').innerHTML = h;
        document.getElementById('event-desc').innerText = `Submit ${p.name} to Parliament?`;
        document.getElementById('event-options').innerHTML = `<button onclick="engine.confirmProposal('${p.name}', '${proposer}')" class="w-full p-3 bg-black text-white font-bold uppercase border-2 border-black">Confirm</button><button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="w-full p-3 border-2 border-black font-bold uppercase hover:bg-stone-100 mt-2">Cancel</button>`;
        document.getElementById('event-modal').classList.remove('hidden');
    },
    showPolicyBank(mName) {
        this.resetModalState();
        const filtered = Data.POLICY_TEMPLATES.filter(p => p.ministry === mName);
        const ministry = Data.MINISTRIES[mName];
        let h = "";
        const workload = ministry?.workload || 0;
        if (workload > 0) {
            const wColor = workload > 80 ? 'text-red-700' : workload > 50 ? 'text-amber-700' : 'text-stone-500';
            h += `<div class="flex justify-between text-[10px] uppercase tracking-widest font-bold mb-2"><span class="${wColor}">ภาระงานกระทรวง</span><span class="${wColor}">${workload.toFixed(0)}%</span></div>`;
        }
        if (mName === "กลาโหม") {
            const military = state.world.military ?? 50;
            h += `<div class="border-2 border-black p-3 mb-3 bg-stone-50 flex justify-between items-center">
                <div><div class="font-bold text-sm">ความพร้อมทางทหาร</div><div class="text-[10px] text-stone-500">ปัจจุบัน ${military.toFixed(0)}%</div></div>
                <button onclick="engine.investMilitary()" class="bg-black text-white text-[9px] font-bold px-3 py-1 uppercase">เพิ่มงบ ฿15B</button>
            </div>`;
        }
        h += `<div class="grid grid-cols-1 gap-2">`;
        if (filtered.length === 0) h += `<div class="italic text-stone-400 text-center">No drafts available</div>`;
        else filtered.forEach(p => { h += `<div class="border border-black p-3 hover:bg-stone-50 transition flex justify-between items-center"><div><div class="font-bold text-sm">${p.name}</div><div class="text-[10px] font-mono">฿${(p.cost/1e9).toFixed(1)}B</div></div><button onclick="engine.propose('${p.name}', 'รัฐบาล')" class="bg-black text-white text-[9px] font-bold px-3 py-1 uppercase">Draft</button></div>`; });
        h += `</div>`;
        document.getElementById('event-title').innerText = `Drafts: ${mName}`; document.getElementById('event-desc').innerHTML = h; document.getElementById('event-options').innerHTML = `<button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="w-full p-2 bg-stone-200 font-bold text-xs uppercase border border-black">Close</button>`; document.getElementById('event-modal').classList.remove('hidden');
    },

    showBorderConflict(c, playerStrength, enemyStrength, won) {
        this.resetModalState();
        document.getElementById('event-title').innerText = `ปะทะชายแดน: ${c.name}`;
        document.getElementById('event-desc').innerHTML = `
            <div class="text-center font-serif text-xl font-bold border-y-2 border-black py-4 my-4">ความสัมพันธ์กับ${c.name}ทรุดหนักจนเกิดการปะทะที่ชายแดน</div>
            <div class="grid grid-cols-2 gap-4 text-center mb-4">
                <div class="border-2 border-black p-3"><div class="text-[9px] uppercase tracking-widest text-stone-500 font-bold mb-1">กำลังฝ่ายไทย</div><div class="text-2xl font-black font-mono">${playerStrength.toFixed(0)}</div></div>
                <div class="border-2 border-black p-3"><div class="text-[9px] uppercase tracking-widest text-stone-500 font-bold mb-1">กำลังฝ่าย${c.name}</div><div class="text-2xl font-black font-mono">${enemyStrength.toFixed(0)}</div></div>
            </div>
            <div class="text-center text-lg font-black uppercase tracking-widest ${won ? 'text-emerald-700' : 'text-red-700'}">${won ? 'ฝ่ายไทยยันสถานการณ์ได้' : 'ฝ่ายไทยเสียเปรียบ'}</div>
        `;
        document.getElementById('event-options').innerHTML = `<button onclick="window.engine.resolveBorderConflict('${c.id}', ${won})" class="w-full p-4 ${won ? 'bg-black' : 'bg-red-700'} text-white font-bold border-2 border-black text-lg hover:opacity-90">รับทราบผล</button>`;
        document.getElementById('event-modal').classList.remove('hidden');
    },

    resetModalState() { document.getElementById('voting-display').classList.add('hidden'); document.getElementById('stakeholder-reactions').classList.add('hidden'); document.getElementById('event-options').innerHTML = ""; document.getElementById('event-desc').innerHTML = ""; }
};
