import { state } from './state.js';
import * as Data from './data.js';
import { gameClock, engine } from './engine.js';

export const ui = {
    tab(t) { 
        document.querySelectorAll('main > div').forEach(d => d.classList.add('hidden')); 
        const target = document.getElementById(`tab-${t}`); if(target) target.classList.remove('hidden');
        document.querySelectorAll('.tab-btn').forEach(b => { const clickAttr = b.getAttribute('onclick'); b.classList.toggle('tab-active', clickAttr && clickAttr.includes(t)); });
        if (t === 'dashboard') setTimeout(() => this.renderTrendGraphs(), 100);
        if (t === 'mps') this.renderMPList(); 
    },
    updateHUD() {
        const els = { 'hud-date': state.date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }), 'hud-budget': `฿${(state.world.nationalBudget / 1e12).toFixed(2)}T`, 'hud-approval-text': `${state.world.approval.toFixed(0)}%`, 'hud-personal-display': `฿${(state.player.personalFunds / 1e6).toFixed(0)}M`, 'hud-personal-sidebar': `฿${(state.player.personalFunds / 1e6).toFixed(0)}M`, 'hud-personal-top': `฿${(state.player.personalFunds / 1e6).toFixed(0)}M`, 'stat-cabinet-stability-display': `เสถียรภาพ ครม: ${state.world.cabinetStability}%`, 'stat-cabinet-stability-hud': `${state.world.cabinetStability}%`, 'stat-growth-sidebar': `${state.world.growth > 0 ? '+' : ''}${state.world.growth.toFixed(1)}%` };
        for (const [id, val] of Object.entries(els)) { const el = document.getElementById(id); if(el) el.innerText = val; }
        const bar = document.getElementById('hud-approval-bar'); if (bar) bar.style.width = `${state.world.approval}%`;
    },
    updateMain() { this.updateHUD(); this.renderActivePolicies(); this.renderMiniFactions(); this.renderFactionList(); this.renderParliament(); this.renderAI(); this.renderCabinet(); this.renderMinistryList(); this.renderPartyHQ(); if(!document.getElementById('tab-dashboard').classList.contains('hidden')) this.renderTrendGraphs(); if(!document.getElementById('tab-mps').classList.contains('hidden')) this.renderMPList(); },
    
    // --- UPDATED: Roster with Icons & Tooltips ---
    renderMPList() {
        const cont = document.getElementById('mp-roster-list'); if(!cont) return;
        const filterVal = document.getElementById('mp-search-input')?.value.toLowerCase() || "";
        const filtered = state.leaders.filter(l => l.name.toLowerCase().includes(filterVal) || l.party.name.toLowerCase().includes(filterVal));
        
        let html = `<table class="w-full text-left font-sans text-xs text-white border-collapse">
            <thead class="bg-black/50 text-zinc-400 uppercase tracking-wider sticky top-0 z-10">
                <tr>
                    <th class="p-3">ชื่อ - สกุล</th>
                    <th class="p-3">พรรคสังกัด</th>
                    <th class="p-3 text-center">คุณลักษณะ (Traits)</th>
                    <th class="p-3 text-center">อาชีพ & ฐานะ</th>
                    <th class="p-3 text-center">Loyalty</th>
                    <th class="p-3 text-center">จัดการ</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-zinc-800">`;

        filtered.slice(0, 100).forEach(l => { 
            const loyaltyColor = l.loyalty > 70 ? 'text-emerald-400' : (l.loyalty < 30 ? 'text-red-500' : 'text-yellow-500');
            
            // Helper to create Icon with Tooltip
            const createIcon = (iconClass, colorClass, title, subtitle = "") => `
                <div class="group relative inline-flex items-center justify-center w-8 h-8 bg-zinc-800 rounded-full border border-zinc-700 hover:bg-zinc-700 cursor-help transition">
                    <i class="fas ${iconClass} ${colorClass}"></i>
                    <div class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block w-max max-w-[150px] bg-black text-white text-[10px] p-2 rounded shadow-xl border border-zinc-600 z-50 pointer-events-none">
                        <div class="font-bold text-center border-b border-zinc-700 pb-1 mb-1">${title}</div>
                        ${subtitle ? `<div class="text-zinc-400 text-center">${subtitle}</div>` : ''}
                        <div class="absolute w-2 h-2 bg-black border-r border-b border-zinc-600 rotate-45 -bottom-1 left-1/2 -translate-x-1/2"></div>
                    </div>
                </div>
            `;

            const ideologyIcon = createIcon(Data.TRAIT_ICONS[l.trait.ideology] || 'fa-question', 'text-blue-400', 'แนวคิดทางการเมือง', l.trait.ideology);
            const goalIcon = createIcon(Data.TRAIT_ICONS[l.trait.goal] || 'fa-crosshairs', 'text-purple-400', 'เป้าหมายหลัก', l.trait.goal);
            const abilityIcon = createIcon(l.trait.ability.icon, 'text-orange-400', l.trait.ability.name, l.trait.ability.desc);
            const socioIcon = createIcon(l.trait.socio.icon, 'text-emerald-400', l.trait.socio.name, `ความมั่งคั่ง: ฿${l.trait.socio.baseWealth}M`);

            html += `<tr class="hover:bg-zinc-800/50 transition">
                <td class="p-3 font-bold">
                    ${l.name} 
                    ${l.isCobra ? '<span class="text-red-500 animate-pulse text-[10px] ml-1" title="รับเงินแล้ว (งูเห่า)"><i class="fas fa-snake"></i></span>' : ''}
                </td>
                <td class="p-3">
                    <div class="flex items-center gap-2">
                        <div class="w-3 h-3 rounded-full border border-white/20 shadow-sm" style="background:${l.party.color}"></div>
                        ${l.party.name}
                    </div>
                </td>
                <td class="p-3 text-center">
                    <div class="flex justify-center gap-2">
                        ${ideologyIcon}
                        ${goalIcon}
                        ${abilityIcon}
                    </div>
                </td>
                <td class="p-3 text-center">
                    ${socioIcon}
                </td>
                <td class="p-3 text-center font-bold font-mono ${loyaltyColor}">${l.loyalty.toFixed(0)}%</td>
                <td class="p-3 text-center">
                    <button onclick="ui.showMPActionModal(${l.id})" class="bg-zinc-700 hover:bg-white hover:text-black px-3 py-1.5 rounded text-[10px] font-bold transition shadow-sm border border-zinc-600">
                        <i class="fas fa-ellipsis"></i>
                    </button>
                </td>
            </tr>`;
        });
        html += `</tbody></table>`;
        if(filtered.length > 100) html += `<div class="p-2 text-center text-zinc-500 italic text-[10px]">แสดง 100 จาก ${filtered.length} รายชื่อ (กรุณาค้นหาเพิ่มเติม)</div>`;
        cont.innerHTML = html;
    },

    showMPActionModal(id) {
        this.resetModalState();
        const l = state.leaders.find(x => x.id === id); if(!l) return;
        
        document.getElementById('event-title').innerText = `แฟ้มประวัติ: ${l.name}`;
        
        const lobbyCost = 2000000 * l.trait.socio.costMod;
        const cobraCost = 10000000 * l.trait.ability.costMod * l.trait.socio.costMod;
        const switchCost = 50000000 * l.trait.ability.costMod * l.trait.socio.costMod;
        const isMyParty = l.party.id === state.player.party.id;

        document.getElementById('event-desc').innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-left font-sans mb-6 text-white">
                <div class="bg-black/40 p-4 rounded-xl border border-zinc-700 space-y-2">
                    <div class="text-[10px] text-zinc-500 uppercase font-bold border-b border-zinc-800 pb-1 mb-2">ข้อมูลส่วนบุคคล</div>
                    <div><span class="text-zinc-400 text-xs">พรรคสังกัด:</span> <span style="color:${l.party.color}" class="font-bold ml-2">${l.party.name}</span></div>
                    <div><span class="text-zinc-400 text-xs">ฐานเสียง:</span> <span class="ml-2">${l.status}</span></div>
                    <div><span class="text-zinc-400 text-xs">ทรัพย์สิน:</span> <span class="text-emerald-400 font-bold ml-2">฿${(l.cash/1e6).toFixed(1)}M</span></div>
                    <div class="bg-zinc-800/50 p-2 rounded mt-2 flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center"><i class="fas ${l.trait.socio.icon} text-emerald-400"></i></div>
                        <div>
                            <div class="text-xs text-zinc-300">อาชีพ: <b>${l.trait.socio.name}</b></div>
                            <div class="text-[10px] text-zinc-500">Wealth Factor: x${l.trait.socio.costMod}</div>
                        </div>
                    </div>
                </div>

                <div class="bg-black/40 p-4 rounded-xl border border-zinc-700 space-y-2">
                    <div class="text-[10px] text-zinc-500 uppercase font-bold border-b border-zinc-800 pb-1 mb-2">คุณลักษณะพิเศษ</div>
                    
                    <div class="flex items-center gap-2 text-xs">
                        <i class="fas ${Data.TRAIT_ICONS[l.trait.ideology]} text-blue-400 w-4 text-center"></i>
                        <span class="text-zinc-400">แนวคิด:</span> <span class="text-white">${l.trait.ideology}</span>
                    </div>
                    <div class="flex items-center gap-2 text-xs">
                        <i class="fas ${Data.TRAIT_ICONS[l.trait.goal]} text-purple-400 w-4 text-center"></i>
                        <span class="text-zinc-400">เป้าหมาย:</span> <span class="text-white">${l.trait.goal}</span>
                    </div>

                    <div class="bg-zinc-800/50 p-2 rounded mt-2 flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center"><i class="fas ${l.trait.ability.icon} text-orange-400"></i></div>
                        <div>
                            <div class="text-xs text-orange-300">ความสามารถ: <b>${l.trait.ability.name}</b></div>
                            <div class="text-[10px] text-zinc-500">${l.trait.ability.desc}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="bg-zinc-900 p-4 rounded-xl border border-zinc-800 mb-4 flex justify-between items-center shadow-inner">
                <div class="text-xs text-zinc-400 uppercase tracking-widest">สถานะความภักดี (Loyalty)</div>
                <div class="text-2xl font-black font-mono ${l.loyalty > 50 ? 'text-emerald-500' : 'text-red-500'}">${l.loyalty.toFixed(0)}%</div>
            </div>

            <div class="grid grid-cols-1 gap-3">
                <button onclick="engine.lobbyIndividual(${l.id})" class="flex justify-between bg-zinc-800 hover:bg-emerald-900 p-4 rounded-xl border border-zinc-700 transition group items-center">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded bg-emerald-900/50 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-black transition"><i class="fas fa-handshake"></i></div>
                        <span class="font-bold text-sm text-white group-hover:text-emerald-300">กระชับความสัมพันธ์ (Lobby)</span>
                    </div>
                    <span class="font-mono text-zinc-400">฿${(lobbyCost/1e6).toFixed(1)}M</span>
                </button>
                <button onclick="engine.buyCobra(${l.id})" ${isMyParty || l.isCobra ? 'disabled class="opacity-50 cursor-not-allowed bg-zinc-900 p-4 rounded-xl border border-zinc-800 flex justify-between items-center"' : 'class="flex justify-between bg-zinc-800 hover:bg-red-900 p-4 rounded-xl border border-zinc-700 transition group items-center"'} >
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded bg-red-900/50 flex items-center justify-center group-hover:bg-red-500 group-hover:text-black transition"><i class="fas fa-snake"></i></div>
                        <span class="font-bold text-sm text-white group-hover:text-red-300">ซื้อตัวงูเห่า (Secret Deal)</span>
                    </div>
                    <span class="font-mono text-zinc-400">฿${(cobraCost/1e6).toFixed(1)}M</span>
                </button>
                <button onclick="engine.forceSwitchParty(${l.id})" ${isMyParty ? 'disabled class="opacity-50 cursor-not-allowed bg-zinc-900 p-4 rounded-xl border border-zinc-800 flex justify-between items-center"' : 'class="flex justify-between bg-zinc-800 hover:bg-purple-900 p-4 rounded-xl border border-zinc-700 transition group items-center"'} >
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded bg-purple-900/50 flex items-center justify-center group-hover:bg-purple-500 group-hover:text-black transition"><i class="fas fa-right-left"></i></div>
                        <span class="font-bold text-sm text-white group-hover:text-purple-300">ดูดเข้าพรรค (Force Switch)</span>
                    </div>
                    <span class="font-mono text-zinc-400">฿${(switchCost/1e6).toFixed(1)}M</span>
                </button>
            </div>
        `;
        document.getElementById('event-options').innerHTML = `<button onclick="document.getElementById('event-modal').classList.add('hidden');" class="w-full p-3 bg-zinc-900 rounded-xl text-zinc-400 hover:bg-zinc-800 font-bold border border-zinc-800">ปิดหน้าต่าง</button>`;
        document.getElementById('event-modal').classList.remove('hidden');
    },

    showVoteBreakdown() {
        this.resetModalState();
        if(!state.lastVoteLog || state.lastVoteLog.length === 0) { alert("ยังไม่มีข้อมูลการโหวตล่าสุด"); return; }
        document.getElementById('event-title').innerText = "บันทึกการลงคะแนนรายบุคคล";
        let html = `<div class="max-h-[500px] overflow-y-auto scroll-custom p-2"><table class="w-full text-left text-xs font-sans text-white"><thead class="sticky top-0 bg-[#1a1c23]"><tr><th class="p-2">ชื่อ</th><th class="p-2">พรรค</th><th class="p-2 text-center">โหวต</th></tr></thead><tbody class="divide-y divide-zinc-800">`;
        state.lastVoteLog.forEach(log => {
            const voteBadge = log.vote === 'yes' ? '<span class="bg-emerald-900 text-emerald-400 px-2 py-1 rounded text-[10px]">เห็นชอบ</span>' : (log.vote === 'no' ? '<span class="bg-red-900 text-red-400 px-2 py-1 rounded text-[10px]">ไม่เห็นชอบ</span>' : '<span class="bg-zinc-700 text-zinc-400 px-2 py-1 rounded text-[10px]">งดออกเสียง</span>');
            const rebelMark = log.isRebel ? '<i class="fas fa-exclamation-circle text-yellow-500 ml-2" title="โหวตสวนมติพรรค"></i>' : '';
            html += `<tr><td class="p-2">${log.name} ${rebelMark}</td><td class="p-2"><span style="color:${log.color}" class="font-bold">${log.party}</span></td><td class="p-2 text-center">${voteBadge}</td></tr>`;
        });
        html += `</tbody></table></div>`;
        document.getElementById('event-desc').innerHTML = html;
        document.getElementById('event-options').innerHTML = `<button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="w-full p-3 bg-zinc-900 rounded text-zinc-400 hover:bg-zinc-800">ปิดบันทึก</button>`;
        document.getElementById('event-modal').classList.remove('hidden');
    },

    displayResults(p, y, n) {
        this.resetModalState();
        document.getElementById('voting-display').classList.remove('hidden');
        document.getElementById('vote-count-yes').innerText = y; document.getElementById('vote-count-no').innerText = n;
        const passed = y > 250;
        document.getElementById('event-desc').innerText = passed ? "รัฐสภามีมติเห็นชอบรับหลักการ" : "สภาตีตกร่างกฎหมายเนื่องจากความไม่เหมาะสม";
        document.getElementById('event-options').innerHTML = `<button onclick="ui.showVoteBreakdown()" class="w-full p-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold text-zinc-300 font-sans mb-3 border border-zinc-700">🔍 ดูรายชื่อผู้ลงคะแนน (Check Votes)</button><button onclick="engine.finalizeVote('${p.name}', ${passed})" class="w-full p-4 bg-red-700 hover:bg-red-600 rounded-xl font-bold text-white transition font-sans">ยืนยันผลมติ</button>`;
    },

    renderTrendGraphs() {
        const createRichChart = (id, data, color, label, unit) => {
            const wrapper = document.getElementById(id);
            if (!wrapper) return;
            const maxVal = Math.max(...data); const minVal = Math.min(...data);
            const diff = maxVal - minVal;
            const padding = diff === 0 ? maxVal * 0.1 : diff * 0.2; 
            const effectiveMax = maxVal + padding; const effectiveMin = Math.max(0, minVal - padding);
            const range = effectiveMax - effectiveMin || 1;
            const width = wrapper.clientWidth || 300; const height = wrapper.clientHeight || 150;
            const pointSpacing = width / (Math.max(data.length, 2) - 1);
            const points = data.map((d, i) => { const x = i * pointSpacing; const normalizedY = (d - effectiveMin) / range; const y = height - (normalizedY * height); return { x, y, val: d }; });
            let linePathD = `M${points[0].x},${points[0].y}`; points.forEach((p, i) => { if(i>0) linePathD += ` L${p.x},${p.y}`; });
            const areaPathD = `${linePathD} L${points[points.length-1].x},${height} L${points[0].x},${height} Z`;
            let grids = ""; for(let i=1; i<=3; i++) { const y = (height / 4) * i; grids += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1" stroke-dasharray="4"/>`; }
            const currentValue = data[data.length-1];
            const displayValue = unit === "T" ? `฿${(currentValue/1e12).toFixed(2)}T` : `${currentValue.toFixed(1)}%`;
            wrapper.innerHTML = `<div class="relative w-full h-full group"><div class="absolute top-2 left-3 z-10 pointer-events-none"><div class="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mb-1">${label}</div><div class="text-2xl font-bold font-mono" style="color:${color}; text-shadow: 0 0 10px ${color}40;">${displayValue}</div></div><svg viewBox="0 0 ${width} ${height}" class="w-full h-full overflow-visible" preserveAspectRatio="none"><defs><linearGradient id="grad-${id}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:${color};stop-opacity:0.2" /><stop offset="100%" style="stop-color:${color};stop-opacity:0" /></linearGradient></defs>${grids}<path d="${areaPathD}" fill="url(#grad-${id})" /><path d="${linePathD}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" />${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#1a1c23" stroke="${color}" stroke-width="2" />`).join('')}</svg><div class="absolute top-0 right-1 text-[9px] text-zinc-600 font-mono">${unit === "T" ? (effectiveMax/1e12).toFixed(1)+'T' : effectiveMax.toFixed(0)}</div><div class="absolute bottom-0 right-1 text-[9px] text-zinc-600 font-mono">${unit === "T" ? (effectiveMin/1e12).toFixed(1)+'T' : effectiveMin.toFixed(0)}</div></div>`;
        };
        const feed = document.getElementById('news-feed');
        if (feed && !document.getElementById('trend-container')) {
             const div = document.createElement('div'); div.id = 'trend-container'; div.className = "grid grid-cols-1 md:grid-cols-2 gap-4 mb-6"; 
             div.innerHTML = `<div class="bg-[#1a1c23] rounded-2xl border border-zinc-800 shadow-lg h-48 overflow-hidden relative p-0" id="wrapper-approval"><div id="trend-approval" class="w-full h-full"></div></div><div class="bg-[#1a1c23] rounded-2xl border border-zinc-800 shadow-lg h-48 overflow-hidden relative p-0" id="wrapper-budget"><div id="trend-budget" class="w-full h-full"></div></div>`;
             const contentGrid = feed.closest('.grid'); if(contentGrid) { contentGrid.parentNode.insertBefore(div, contentGrid); } else { feed.parentElement.insertAdjacentElement('beforebegin', div); }
        }
        if (state.history && state.history.approval.length > 0) { createRichChart('trend-approval', state.history.approval, '#eab308', 'Approval Rating', '%'); createRichChart('trend-budget', state.history.budget, '#60a5fa', 'National Budget', 'T'); }
    },
    renderPartyHQ() {
        const p = state.player.party; if(!p) return;
        document.getElementById('my-party-ideologies').innerHTML = p.ideologies.map(i => `<span class="badge-ideology text-white">${i}</span>`).join("");
        document.getElementById('my-party-goals').innerHTML = p.goals.map(g => `<span class="badge-goal font-sans">${g}</span>`).join("");
        if (!document.getElementById('transparency-display')) { const parent = document.getElementById('my-party-goals').closest('.bg-\\[\\#1a1c23\\]'); if(parent) { const div = document.createElement('div'); div.id = 'transparency-display'; div.className = "mt-6 border-t border-zinc-700 pt-4"; parent.appendChild(div); } }
        const tDisp = document.getElementById('transparency-display'); if(tDisp) { const tVal = state.world.transparency; const tColor = tVal > 70 ? 'text-emerald-400' : (tVal > 40 ? 'text-yellow-500' : 'text-red-500 animate-pulse'); tDisp.innerHTML = `<div class="flex justify-between items-center"><span class="text-xs font-bold text-zinc-400 uppercase tracking-widest">ดัชนีความโปร่งใส (Transparency)</span><span class="font-mono font-bold ${tColor}">${tVal}%</span></div><div class="w-full bg-black h-2 rounded-full mt-2 overflow-hidden border border-zinc-700"><div class="h-full bg-white transition-all duration-500" style="width:${tVal}%"></div></div><div class="text-[9px] text-zinc-600 mt-2 italic text-right">ความเสี่ยงรัฐประหาร: ${tVal < 40 ? '<span class="text-red-500 font-bold">สูงมาก</span>' : '<span class="text-emerald-600">ต่ำ</span>'}</div>`; }
    },
    renderParliament() {
        const chart = document.getElementById('parliament-chart'); const table = document.getElementById('party-stat-table'); if(!chart || !table) return;
        chart.innerHTML = ""; table.innerHTML = "";
        let gT = 0, oT = 0, nT = 0;
        state.parties.sort((a,b) => b.seats - a.seats).forEach(p => {
            const tag = p.status === "Government" ? "govt-tag" : (p.status === "Opposition" ? "opp-tag" : "neu-tag");
            const label = p.status === "Government" ? "รัฐบาล" : (p.status === "Opposition" ? "ฝ่ายค้าน" : "วางเฉย");
            if(p.status === "Government") gT += p.seats; else if(p.status === "Opposition") oT += p.seats; else nT += p.seats;
            table.innerHTML += `<tr class="hover:bg-zinc-800/50 transition font-sans text-white font-sans"><td class="p-3 font-bold text-white text-[10px] flex items-center gap-2 font-sans"><span class="w-3 h-3 rounded-full inline-block font-sans" style="background:${p.color}"></span> ${p.name}</td><td class="p-3 text-center font-sans"><span class="${tag} font-sans font-sans text-white">${label}</span></td><td class="p-3 text-center font-mono text-xs font-sans">${p.seats}</td><td class="p-3 font-sans">${p.ideologies.slice(0,2).map(id => `<span class="badge-ideology font-sans text-white font-sans">${id}</span>`).join('')}</td><td class="p-3 font-sans">${p.goals.slice(0,2).map(g => `<span class="badge-goal font-sans text-white font-sans">${g}</span>`).join('')}</td></tr>`;
        });
        document.getElementById('vote-summary-parliament').innerHTML = `<div class="flex justify-between text-xs text-white font-sans"><span>รัฐบาล:</span> <span class="text-blue-400 font-bold font-sans">${gT}</span></div><div class="flex justify-between text-xs mt-1 text-white font-sans"><span>ฝ่ายค้าน:</span> <span class="text-red-400 font-bold font-sans">${oT}</span></div><div class="flex justify-between text-xs border-t border-zinc-800 pt-2 mt-2 text-white text-white"><span>วางเฉย:</span> <span class="text-zinc-500 font-sans">${nT}</span></div>`;
        state.leaders.forEach(l => { const dot = document.createElement('div'); dot.className = "voting-dot shadow-sm"; 
            if (state.lastVoteResults) { const result = state.lastVoteResults.find(r => r.id === l.id); if (result) { if (result.vote === 'yes') dot.style.backgroundColor = '#10b981'; else if (result.vote === 'no') dot.style.backgroundColor = '#ef4444'; else dot.style.backgroundColor = '#52525b'; if (result.isRebel) { dot.classList.add('animate-pulse'); dot.style.boxShadow = '0 0 4px white'; } } } else { dot.style.backgroundColor = l.party.color; }
            chart.appendChild(dot); 
        });
    },
    renderAI() { const cont = document.getElementById('ai-list'); if(cont) cont.innerHTML = ""; }, 
    renderMiniFactions() {
        const cont = document.getElementById('mini-faction-list'); if(!cont) return;
        const sorted = [...state.factions].sort((a,b) => b.weight - a.weight).slice(0, 5);
        cont.innerHTML = sorted.map(f => `<div><div class="flex justify-between text-[10px] mb-2 text-white font-bold font-sans"><span>${f.name}</span><span class="font-mono text-zinc-400 font-sans">${f.approval.toFixed(1)}%</span></div><div class="h-1 bg-black rounded-full overflow-hidden shadow-inner font-sans"><div class="h-full bg-red-600 progress-fill" style="width: ${f.approval}%"></div></div></div>`).join("");
    },
    renderFactionList() { const cont = document.getElementById('faction-list'); if(cont) cont.innerHTML = state.factions.map(f => `<div class="bg-[#1a1c23] p-5 rounded-2xl border border-zinc-800 shadow-lg text-left transition-all hover:border-red-500/50 font-sans text-white"><div class="flex justify-between items-start mb-4 font-sans text-white"><i class="fas ${f.icon} text-lg text-zinc-500 font-sans"></i><span class="text-[9px] bg-zinc-800 text-zinc-500 px-2 rounded font-bold uppercase font-sans tracking-widest">Weight: ${f.weight}</span></div><div class="font-bold text-white mb-1 serif text-sm">${f.name}</div><div class="h-1 bg-black rounded-full overflow-hidden mt-2 font-sans"><div class="h-full bg-blue-500 progress-fill" style="width: ${f.approval}%"></div></div></div>`).join(""); },
    renderActivePolicies() {
        const cont = document.getElementById('active-policy-list'); if(!cont) return;
        if (state.activePolicies.length === 0) { cont.innerHTML = `<div class="text-zinc-700 italic text-center p-12 border-2 border-dashed border-zinc-900 rounded-2xl font-sans text-white">ไม่มีร่างกฎหมายพิจารณา</div>`; return; }
        cont.innerHTML = "";
        state.activePolicies.forEach(p => {
            const el = document.createElement('div'); el.className = "bg-[#1a1c23] p-6 rounded-2xl border-l-[6px] border-red-600 shadow-xl space-y-4 text-white text-left font-sans";
            el.innerHTML = `<div class="flex justify-between items-start font-sans"><div class="text-left font-sans"><h4 class="font-bold text-xl text-white serif font-sans text-white">${p.name}</h4><div class="text-[9px] text-zinc-500 uppercase font-mono tracking-tighter">โดย: ${p.proposer} | วาระ ${p.stage} / 3</div></div><span class="px-3 py-1 bg-zinc-800 text-yellow-500 rounded-full text-[9px] font-bold border border-zinc-700">${p.isDeliberating ? p.remainingDays + ' วัน' : 'พร้อมโหวต'}</span></div><div class="h-1.5 bg-zinc-800 rounded-full overflow-hidden shadow-inner border border-zinc-700"><div class="h-full bg-yellow-500 progress-fill" style="width: ${((p.totalDays - p.remainingDays)/p.totalDays)*100}%"></div></div><div class="flex gap-2"><button onclick="engine.startVote('${p.name}')" ${p.isDeliberating ? 'disabled' : ''} class="flex-1 py-3 rounded-xl font-bold text-xs ${p.isDeliberating ? 'bg-zinc-800 text-zinc-600 font-sans' : 'bg-emerald-700 text-white shadow-lg font-sans'} transition">ลงมติสภา</button><button onclick="engine.lobbyCoalition('${p.name}')" class="px-4 py-2 bg-stone-800 hover:bg-stone-700 rounded-xl text-xs font-bold text-stone-300 transition font-sans">ดีลพรรคร่วม (฿25M)</button></div>`;
            cont.appendChild(el);
        });
    },
    showQuidProQuo(p, demand, party) { this.resetModalState(); document.getElementById('event-title').innerText = `ข้อเสนอแลกเปลี่ยน (Quid Pro Quo)`; document.getElementById('event-desc').innerHTML = `<div class="bg-red-900/30 p-6 rounded-xl border border-red-600 text-left font-sans space-y-4"><div class="flex items-center gap-4"><div class="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-xl" style="color:${party.color}">${party.name.charAt(0)}</div><div><div class="font-bold text-lg text-white">ข้อเสนอจาก: ${party.name}</div><div class="text-xs text-zinc-400">พรรคร่วมรัฐบาล</div></div></div><p class="text-zinc-300 text-sm">"ทางเรายินดีจะโหวตสนับสนุนร่าง <b>${p.name}</b> ของท่านอย่างเต็มที่ แต่มีเงื่อนไขว่าท่านต้องอนุมัตินโยบายของเราทันที"</p><div class="bg-black/50 p-4 rounded-lg border border-zinc-700"><div class="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1">สิ่งที่ต้องการ</div><div class="text-red-400 font-bold text-lg serif">${demand.name}</div><div class="text-xs text-zinc-400 mt-1">งบประมาณที่ใช้: ฿${(demand.cost/1e9).toFixed(1)}B</div></div></div>`; document.getElementById('event-options').innerHTML = `<button onclick='engine.processQuidProQuo("${p.name}", "${demand.name}", "${party.id}", true)' class="w-full p-4 bg-emerald-700 hover:bg-emerald-600 rounded-xl font-bold text-white font-sans shadow-lg mb-2">ยอมรับข้อเสนอ (จ่ายเงินแลกเสียงโหวต)</button><button onclick='engine.processQuidProQuo("${p.name}", "${demand.name}", "${party.id}", false)' class="w-full p-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold text-zinc-400 font-sans border border-zinc-700">ปฏิเสธ (เสี่ยงถูกโหวตสวน)</button>`; document.getElementById('event-modal').classList.remove('hidden'); },
    showVoteInterface(pName) { const p = state.activePolicies.find(x => x.name === pName); gameClock.setSpeed(0); this.resetModalState(); document.getElementById('event-title').innerText = `สภาลงมติ: ${p.name}`; document.getElementById('voting-display').classList.remove('hidden'); document.getElementById('event-options').innerHTML = `<button onclick="engine.runVote('${p.name}')" class="w-full p-4 bg-red-700 hover:bg-red-600 rounded-xl font-bold text-white font-sans">ลงมติ</button>`; document.getElementById('event-modal').classList.remove('hidden'); },
    showAppointModal(mName) { this.resetModalState(); let h = `<div class="space-y-3 max-h-[400px] overflow-y-auto pr-2 scroll-custom text-black">`; const govtParties = state.parties.filter(p => p.status === "Government"); govtParties.forEach(p => { const candidate = state.leaders.find(l => l.party.id === p.id); if(!candidate) return; h += `<div class="bg-white p-4 rounded-xl flex justify-between items-center shadow-md text-left text-black"><div><div class="font-bold text-sm text-black font-sans">${candidate.name}</div><div class="text-[10px] text-red-600 font-bold uppercase">${p.name}</div></div><button onclick="engine.appointMinister('${mName}', ${candidate.id}); document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="bg-black text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-700 transition font-sans">เลือก</button></div>`; }); h += `</div>`; document.getElementById('event-title').innerText = `แต่งตั้ง ครม. (${mName})`; document.getElementById('event-desc').innerHTML = `<p class="text-xs mb-4 text-zinc-500 italic text-left font-sans">เลือกตัวแทนจากพรรคร่วมรัฐบาล พรรคละ 1 ท่าน</p>${h}`; document.getElementById('event-options').innerHTML = `<button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="w-full p-3 bg-zinc-300 rounded-xl font-bold text-black font-sans">ย้อนกลับ</button>`; document.getElementById('event-modal').classList.remove('hidden'); },
    showPartyAdjustModal(type) { this.resetModalState(); const pool = type === 'ideology' ? Data.IDEOLOGY_POOL : Data.GOAL_POOL; let h = `<div class="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-2 scroll-custom text-black">`; pool.forEach(item => { h += `<div class="bg-white p-3 rounded-xl flex justify-between items-center shadow-sm"><span class="font-bold text-xs text-black font-sans">${item}</span><button onclick="engine.adjustStance('${type}', '${item}'); document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="bg-red-600 text-white px-3 py-1 rounded text-[10px] font-sans">เลือก</button></div>`; }); h += `</div>`; document.getElementById('event-title').innerText = `ปรับเปลี่ยน${type === 'ideology' ? 'อุดมการณ์' : 'เป้าหมาย'}`; document.getElementById('event-desc').innerHTML = h; document.getElementById('event-modal').classList.remove('hidden'); },
    showStakeholderReview(p, stakeholders, proposer) { 
        this.resetModalState(); 
        document.getElementById('event-title').innerText = `Stakeholder Reaction: ${p.name}`; 
        document.getElementById('stakeholder-reactions').classList.remove('hidden'); 
        let h = ""; stakeholders.forEach(s => { const impact = p.impact[s.name] || 0; const color = impact > 0 ? "text-emerald-400" : (impact < 0 ? "text-red-500" : "text-zinc-500"); h += `<div class="bg-black/30 p-4 rounded-xl border border-zinc-800 flex items-center gap-4 text-left font-sans text-white"><div class="w-10 h-10 bg-zinc-900 rounded flex items-center justify-center ${color}"><i class="fas ${impact > 0 ? 'fa-face-smile' : (impact < 0 ? 'fa-face-angry' : 'fa-face-meh')}"></i></div><div class="flex-1 font-sans"><div class="font-bold text-sm">${s.name}</div><div class="text-[9px] opacity-50">ปัจจุบัน: ${s.approval.toFixed(0)}%</div></div><div class="text-right font-black ${color}">${impact > 0 ? '+' : ''}${impact}</div></div>`; }); 
        document.getElementById('stakeholder-reactions').innerHTML = h; 
        document.getElementById('event-desc').innerText = `ยืนยันจะเสนอร่างกฎหมายนี้ต่อสภาหรือไม่?`; 
        document.getElementById('event-options').innerHTML = `<button onclick="engine.confirmProposal('${p.name}', '${proposer}')" class="w-full p-4 bg-emerald-700 rounded-xl font-bold font-sans text-white">ยืนยันการเสนอ</button><button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="w-full p-3 bg-zinc-800 rounded-xl text-zinc-500 font-sans text-white">ยกเลิก</button>`; 
        document.getElementById('event-modal').classList.remove('hidden'); 
    },
    renderCabinet() { const cont = document.getElementById('cabinet-list'); if(!cont) return; cont.innerHTML = ""; Object.entries(Data.MINISTRIES).forEach(([n, d]) => { const m = d.currentMinister; const el = document.createElement('div'); el.className = "bg-black/30 p-5 rounded-xl border border-zinc-800 text-center text-white shadow-xl"; el.innerHTML = `<div class="text-[9px] text-zinc-500 uppercase mb-3 font-bold tracking-widest border-b border-zinc-800 pb-2">รมว.${n}</div><div class="${m ? 'font-bold text-sm text-yellow-500' : 'text-zinc-700 italic text-xs'} mb-1 font-sans">${m ? m.name : 'ว่าง'}</div><div class="text-[8px] text-zinc-600 mb-4 font-sans">${m ? m.party.name : 'รอแต่งตั้ง'}</div><button onclick="ui.showAppointModal('${n}')" class="w-full text-[9px] bg-zinc-800 hover:bg-zinc-700 px-2 py-2 rounded font-bold transition font-sans">แต่งตั้ง</button>`; cont.appendChild(el); }); },
    renderMinistryList() { const cont = document.getElementById('ministry-list'); if(!cont) return; cont.innerHTML = ""; Object.entries(Data.MINISTRIES).forEach(([n, d]) => { const btn = document.createElement('div'); btn.className = "p-4 rounded-xl border border-zinc-800 transition flex items-center gap-3 bg-[#1a1c23] cursor-pointer hover:bg-zinc-800 shadow-md text-white font-sans text-xs"; btn.innerHTML = `<i class="fas ${d.icon} text-red-500 w-4 text-center"></i> ${n}`; btn.onclick = () => this.showPolicyBank(n); cont.appendChild(btn); }); },
    showPolicyBank(mName) { 
        this.resetModalState(); 
        const filtered = Data.POLICY_TEMPLATES.filter(p => p.ministry === mName); 
        let h = `<div class="space-y-4">`; 
        if (filtered.length === 0) h += `<div class="text-zinc-500 italic p-4 text-center">ยังไม่มีแผนนโยบาย</div>`; 
        else filtered.forEach(p => { 
            h += `<div class="bg-black/40 p-5 rounded-2xl border border-zinc-700 text-left font-sans text-white"><div class="font-bold text-red-500 text-xl serif">${p.name}</div><button onclick="engine.propose('${p.name}', 'รัฐบาล')" class="w-full mt-4 bg-red-700 py-3 rounded-xl font-bold shadow-lg text-white font-sans">เสนอเข้าสภา</button></div>`; 
        }); 
        h += `</div>`; 
        document.getElementById('event-title').innerText = `ร่างนโยบาย: กระทรวง${mName}`; 
        document.getElementById('event-desc').innerHTML = h; 
        document.getElementById('event-options').innerHTML = `<button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="w-full p-3 bg-zinc-800 rounded-xl text-zinc-400 font-bold font-sans">ยกเลิก</button>`; 
        document.getElementById('event-modal').classList.remove('hidden'); 
    },
    renderNews() { const cont = document.getElementById('news-feed'); if(!cont) return; cont.innerHTML = state.news.slice(0, 10).map(n => `<div class="border-b border-zinc-800/50 pb-3 last:border-0 font-sans text-white"><div class="text-[9px] text-zinc-600 mb-1 uppercase font-mono">${n.date}</div><h4 class="font-bold text-zinc-200 text-[10px] font-sans">● ${n.headline}</h4></div>`).join(""); if (state.news.length > 0) { document.getElementById('news-headline').innerText = state.news[0].headline; document.getElementById('news-body').innerText = state.news[0].body; } },
    resetModalState() { document.getElementById('voting-display').classList.add('hidden'); document.getElementById('stakeholder-reactions').classList.add('hidden'); document.getElementById('event-options').innerHTML = ""; document.getElementById('event-desc').innerHTML = ""; }
};
