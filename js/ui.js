import { state } from './state.js';
import * as Data from './data.js';
import { gameClock, engine } from './engine.js';

export const ui = {
    tab(t) { 
        document.querySelectorAll('main > div').forEach(d => d.classList.add('hidden')); 
        const target = document.getElementById(`tab-${t}`); if(target) target.classList.remove('hidden');
        document.querySelectorAll('.tab-btn').forEach(b => { const clickAttr = b.getAttribute('onclick'); b.classList.toggle('tab-active', clickAttr && clickAttr.includes(t)); });
    },
    updateHUD() {
        const els = { 'hud-date': state.date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }), 'hud-budget': `฿${(state.world.nationalBudget / 1e12).toFixed(2)}T`, 'hud-approval-text': `${state.world.approval.toFixed(0)}%`, 'hud-personal-display': `฿${(state.player.personalFunds / 1e6).toFixed(0)}M`, 'hud-personal-sidebar': `฿${(state.player.personalFunds / 1e6).toFixed(0)}M`, 'hud-personal-top': `฿${(state.player.personalFunds / 1e6).toFixed(0)}M`, 'stat-cabinet-stability-display': `เสถียรภาพ ครม: ${state.world.cabinetStability}%`, 'stat-cabinet-stability-hud': `${state.world.cabinetStability}%`, 'stat-growth-sidebar': `${state.world.growth > 0 ? '+' : ''}${state.world.growth.toFixed(1)}%` };
        for (const [id, val] of Object.entries(els)) { const el = document.getElementById(id); if(el) el.innerText = val; }
        const bar = document.getElementById('hud-approval-bar'); if (bar) bar.style.width = `${state.world.approval}%`;
    },
    updateMain() { this.updateHUD(); this.renderActivePolicies(); this.renderMiniFactions(); this.renderFactionList(); this.renderParliament(); this.renderAI(); this.renderCabinet(); this.renderMinistryList(); this.renderPartyHQ(); },
    
    renderPartyHQ() {
        const p = state.player.party; if(!p) return;
        const idCont = document.getElementById('my-party-ideologies');
        const glCont = document.getElementById('my-party-goals');
        if(idCont) idCont.innerHTML = p.ideologies.map(i => `<span class="badge-ideology text-white">${i}</span>`).join("");
        if(glCont) glCont.innerHTML = p.goals.map(g => `<span class="badge-goal font-sans">${g}</span>`).join("");
    },

    showPartyAdjustModal(type) {
        this.resetModalState();
        const pool = type === 'ideology' ? Data.IDEOLOGY_POOL : Data.GOAL_POOL;
        let h = `<div class="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-2 scroll-custom text-black">`;
        pool.forEach(item => {
            h += `<div class="bg-white p-3 rounded-xl flex justify-between items-center shadow-sm">
                <span class="font-bold text-xs text-black font-sans">${item}</span>
                <button onclick="engine.adjustStance('${type}', '${item}'); document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="bg-red-600 text-white px-3 py-1 rounded text-[10px] font-sans">เลือก</button>
            </div>`;
        });
        h += `</div>`;
        document.getElementById('event-title').innerText = `ปรับเปลี่ยน${type === 'ideology' ? 'อุดมการณ์' : 'เป้าหมาย'}`;
        document.getElementById('event-desc').innerHTML = h;
        document.getElementById('event-modal').classList.remove('hidden');
    },

    renderMinistryList() {
        const cont = document.getElementById('ministry-list'); if(!cont) return;
        cont.innerHTML = "";
        Object.entries(Data.MINISTRIES).forEach(([n, d]) => {
            const btn = document.createElement('div');
            btn.className = "p-4 rounded-xl border border-zinc-800 transition flex items-center gap-3 bg-[#1a1c23] cursor-pointer hover:bg-zinc-800 shadow-md text-white font-sans text-xs";
            btn.innerHTML = `<i class="fas ${d.icon} text-red-500 w-4 text-center"></i> ${n}`;
            btn.onclick = () => this.showPolicyBank(n);
            cont.appendChild(btn);
        });
    },
    showPolicyBank(mName) {
        this.resetModalState();
        const filtered = Data.POLICY_TEMPLATES.filter(p => p.ministry === mName);
        let h = `<div class="space-y-4">`;
        if (filtered.length === 0) h += `<div class="text-zinc-500 italic p-4 text-center">ยังไม่มีแผนนโยบาย</div>`;
        else filtered.forEach(p => {
            h += `<div class="bg-black/40 p-5 rounded-2xl border border-zinc-700 text-left font-sans text-white">
                <div class="font-bold text-red-500 text-xl serif">${p.name}</div>
                <button onclick='engine.propose(${JSON.stringify(p)}, "รัฐบาล");' class="w-full mt-4 bg-red-700 py-3 rounded-xl font-bold shadow-lg text-white font-sans">เสนอเข้าสภา</button>
            </div>`;
        });
        h += `</div>`;
        document.getElementById('event-title').innerText = `ร่างนโยบาย: กระทรวง${mName}`;
        document.getElementById('event-desc').innerHTML = h;
        document.getElementById('event-options').innerHTML = `<button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="w-full p-3 bg-zinc-800 rounded-xl text-zinc-400 font-bold font-sans">ยกเลิก</button>`;
        document.getElementById('event-modal').classList.remove('hidden');
    },
    showStakeholderReview(p, stakeholders, proposer) {
        this.resetModalState();
        document.getElementById('event-title').innerText = `Stakeholder Reaction: ${p.name}`;
        document.getElementById('stakeholder-reactions').classList.remove('hidden');
        let h = "";
        stakeholders.forEach(s => {
            const impact = p.impact[s.name] || 0;
            const color = impact > 0 ? "text-emerald-400" : (impact < 0 ? "text-red-500" : "text-zinc-500");
            h += `<div class="bg-black/30 p-4 rounded-xl border border-zinc-800 flex items-center gap-4 text-left font-sans text-white">
                <div class="w-10 h-10 bg-zinc-900 rounded flex items-center justify-center ${color}"><i class="fas ${impact > 0 ? 'fa-face-smile' : (impact < 0 ? 'fa-face-angry' : 'fa-face-meh')}"></i></div>
                <div class="flex-1 font-sans"><div class="font-bold text-sm">${s.name}</div><div class="text-[9px] opacity-50">ปัจจุบัน: ${s.approval.toFixed(0)}%</div></div>
                <div class="text-right font-black ${color}">${impact > 0 ? '+' : ''}${impact}</div>
            </div>`;
        });
        document.getElementById('stakeholder-reactions').innerHTML = h;
        document.getElementById('event-desc').innerText = `ยืนยันจะเสนอร่างกฎหมายนี้ต่อสภาหรือไม่?`;
        document.getElementById('event-options').innerHTML = `<button onclick='engine.confirmProposal(${JSON.stringify(p)}, "${proposer}")' class="w-full p-4 bg-emerald-700 rounded-xl font-bold font-sans text-white">ยืนยันการเสนอ</button><button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="w-full p-3 bg-zinc-800 rounded-xl text-zinc-500 font-sans text-white">ยกเลิก</button>`;
        document.getElementById('event-modal').classList.remove('hidden');
    },
    renderCabinet() {
        const cont = document.getElementById('cabinet-list'); if(!cont) return;
        cont.innerHTML = "";
        Object.entries(Data.MINISTRIES).forEach(([n, d]) => {
            const m = d.currentMinister;
            const el = document.createElement('div');
            el.className = "bg-black/30 p-5 rounded-xl border border-zinc-800 text-center text-white shadow-xl";
            el.innerHTML = `<div class="text-[9px] text-zinc-500 uppercase mb-3 font-bold tracking-widest border-b border-zinc-800 pb-2">รมว.${n}</div>
                <div class="${m ? 'font-bold text-sm text-yellow-500' : 'text-zinc-700 italic text-xs'} mb-1 font-sans">${m ? m.name : 'ว่าง'}</div>
                <div class="text-[8px] text-zinc-600 mb-4 font-sans">${m ? m.party.name : 'รอแต่งตั้ง'}</div>
                <button onclick="ui.showAppointModal('${n}')" class="w-full text-[9px] bg-zinc-800 hover:bg-zinc-700 px-2 py-2 rounded font-bold transition font-sans">แต่งตั้ง</button>`;
            cont.appendChild(el);
        });
    },
    showAppointModal(mName) {
        this.resetModalState();
        let h = `<div class="space-y-3 max-h-[400px] overflow-y-auto pr-2 scroll-custom text-black">`;
        const govtParties = state.parties.filter(p => p.status === "Government");
        govtParties.forEach(p => {
            const candidate = state.leaders.find(l => l.party.id === p.id);
            if(!candidate) return;
            h += `<div class="bg-white p-4 rounded-xl flex justify-between items-center shadow-md text-left text-black">
                <div><div class="font-bold text-sm text-black font-sans">${candidate.name}</div><div class="text-[10px] text-red-600 font-bold uppercase">${p.name}</div></div>
                <button onclick="engine.appointMinister('${mName}', ${candidate.id}); document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="bg-black text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-700 transition font-sans">เลือก</button>
            </div>`;
        });
        h += `</div>`;
        document.getElementById('event-title').innerText = `แต่งตั้ง ครม. (${mName})`;
        document.getElementById('event-desc').innerHTML = `<p class="text-xs mb-4 text-zinc-500 italic text-left font-sans">เลือกตัวแทนจากพรรคร่วมรัฐบาล พรรคละ 1 ท่าน</p>${h}`;
        document.getElementById('event-options').innerHTML = `<button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="w-full p-3 bg-zinc-300 rounded-xl font-bold text-black font-sans">ย้อนกลับ</button>`;
        document.getElementById('event-modal').classList.remove('hidden');
    },
    renderActivePolicies() {
        const cont = document.getElementById('active-policy-list'); if(!cont) return;
        if (state.activePolicies.length === 0) { cont.innerHTML = `<div class="text-zinc-700 italic text-center p-12 border-2 border-dashed border-zinc-900 rounded-2xl font-sans text-white">ไม่มีร่างกฎหมายพิจารณา</div>`; return; }
        cont.innerHTML = "";
        state.activePolicies.forEach(p => {
            const el = document.createElement('div');
            el.className = "bg-[#1a1c23] p-6 rounded-2xl border-l-[6px] border-red-600 shadow-xl space-y-4 text-white text-left font-sans";
            el.innerHTML = `
                <div class="flex justify-between items-start font-sans">
                    <div class="text-left font-sans"><h4 class="font-bold text-xl text-white serif font-sans text-white">${p.name}</h4><div class="text-[9px] text-zinc-500 uppercase font-mono tracking-tighter">โดย: ${p.proposer} | วาระ ${p.stage} / 3</div></div>
                    <span class="px-3 py-1 bg-zinc-800 text-yellow-500 rounded-full text-[9px] font-bold border border-zinc-700">${p.isDeliberating ? p.remainingDays + ' วัน' : 'พร้อมโหวต'}</span>
                </div>
                <div class="h-1.5 bg-zinc-800 rounded-full overflow-hidden shadow-inner border border-zinc-700"><div class="h-full bg-yellow-500 progress-fill" style="width: ${((p.totalDays - p.remainingDays)/p.totalDays)*100}%"></div></div>
                <div class="flex gap-2">
                   <button onclick="engine.startVote('${p.name}')" ${p.isDeliberating ? 'disabled' : ''} class="flex-1 py-3 rounded-xl font-bold text-xs ${p.isDeliberating ? 'bg-zinc-800 text-zinc-600 font-sans' : 'bg-emerald-700 text-white shadow-lg font-sans'} transition">ลงมติสภา</button>
                   <button onclick="engine.lobbyCoalition('${p.name}')" class="px-4 py-2 bg-stone-800 hover:bg-stone-700 rounded-xl text-xs font-bold text-stone-300 transition font-sans">ดีลพรรคร่วม (฿25M)</button>
                </div>`;
            cont.appendChild(el);
        });
    },
    displayResults(p, y, n) {
        this.resetModalState();
        document.getElementById('voting-display').classList.remove('hidden');
        document.getElementById('vote-count-yes').innerText = y; document.getElementById('vote-count-no').innerText = n;
        const passed = y > 250;
        document.getElementById('event-desc').innerText = passed ? "รัฐสภามีมติเห็นชอบรับหลักการ" : "สภาตีตกร่างกฎหมายเนื่องจากความไม่เหมาะสม";
        document.getElementById('event-options').innerHTML = `<button onclick="engine.finalizeVote('${p.name}', ${passed})" class="w-full p-4 bg-zinc-700 rounded-xl font-bold text-white transition font-sans text-white font-sans">ยืนยันผลมติ</button>`;
    },
    renderNews() {
        const cont = document.getElementById('news-feed'); if(!cont) return;
        cont.innerHTML = state.news.slice(0, 10).map(n => `<div class="border-b border-zinc-800/50 pb-3 last:border-0 font-sans text-white"><div class="text-[9px] text-zinc-600 mb-1 uppercase font-mono">${n.date}</div><h4 class="font-bold text-zinc-200 text-[10px] font-sans">● ${n.headline}</h4></div>`).join("");
        if (state.news.length > 0) { document.getElementById('news-headline').innerText = state.news[0].headline; document.getElementById('news-body').innerText = state.news[0].body; }
    },
    renderMiniFactions() {
        const cont = document.getElementById('mini-faction-list'); if(!cont) return;
        const sorted = [...state.factions].sort((a,b) => b.weight - a.weight).slice(0, 5);
        cont.innerHTML = sorted.map(f => `
            <div><div class="flex justify-between text-[10px] mb-2 text-white font-bold font-sans"><span>${f.name}</span><span class="font-mono text-zinc-400 font-sans">${f.approval.toFixed(1)}%</span></div>
                <div class="h-1 bg-black rounded-full overflow-hidden shadow-inner font-sans"><div class="h-full bg-red-600 progress-fill" style="width: ${f.approval}%"></div></div></div>`).join("");
    },
    renderFactionList() {
        const cont = document.getElementById('faction-list'); if(!cont) return;
        cont.innerHTML = state.factions.map(f => `
            <div class="bg-[#1a1c23] p-5 rounded-2xl border border-zinc-800 shadow-lg text-left transition-all hover:border-red-500/50 font-sans text-white">
                <div class="flex justify-between items-start mb-4 font-sans text-white"><i class="fas ${f.icon} text-lg text-zinc-500 font-sans"></i><span class="text-[9px] bg-zinc-800 text-zinc-500 px-2 rounded font-bold uppercase font-sans tracking-widest">Weight: ${f.weight}</span></div>
                <div class="font-bold text-white mb-1 serif text-sm">${f.name}</div>
                <div class="h-1 bg-black rounded-full overflow-hidden mt-2 font-sans"><div class="h-full bg-blue-500 progress-fill" style="width: ${f.approval}%"></div></div>
            </div>`).join("");
    },
    renderParliament() {
        const chart = document.getElementById('parliament-chart'); const table = document.getElementById('party-stat-table'); if(!chart || !table) return;
        chart.innerHTML = ""; table.innerHTML = "";
        let gT = 0, oT = 0, nT = 0;
        state.parties.sort((a,b) => b.seats - a.seats).forEach(p => {
            const tag = p.status === "Government" ? "govt-tag" : (p.status === "Opposition" ? "opp-tag" : "neu-tag");
            const label = p.status === "Government" ? "รัฐบาล" : (p.status === "Opposition" ? "ฝ่ายค้าน" : "วางเฉย");
            if(p.status === "Government") gT += p.seats; else if(p.status === "Opposition") oT += p.seats; else nT += p.seats;
            table.innerHTML += `<tr class="hover:bg-zinc-800/50 transition font-sans text-white font-sans">
                <td class="p-3 font-bold text-white text-[10px] flex items-center gap-2 font-sans"><span class="w-3 h-3 rounded-full inline-block font-sans" style="background:${p.color}"></span> ${p.name}</td>
                <td class="p-3 text-center font-sans"><span class="${tag} font-sans font-sans text-white">${label}</span></td>
                <td class="p-3 text-center font-mono text-xs font-sans">${p.seats}</td>
                <td class="p-3 font-sans">${p.ideologies.slice(0,2).map(id => `<span class="badge-ideology font-sans text-white font-sans">${id}</span>`).join('')}</td>
                <td class="p-3 font-sans">${p.goals.slice(0,2).map(g => `<span class="badge-goal font-sans text-white font-sans">${g}</span>`).join('')}</td></tr>`;
        });
        const summary = document.getElementById('vote-summary-parliament');
        if(summary) summary.innerHTML = `<div class="flex justify-between text-xs text-white font-sans"><span>รัฐบาล:</span> <span class="text-blue-400 font-bold font-sans">${gT}</span></div>
            <div class="flex justify-between text-xs mt-1 text-white font-sans"><span>ฝ่ายค้าน:</span> <span class="text-red-400 font-bold font-sans">${oT}</span></div>
            <div class="flex justify-between text-xs border-t border-zinc-800 pt-2 mt-2 text-white text-white"><span>วางเฉย:</span> <span class="text-zinc-500 font-sans">${nT}</span></div>`;
        state.leaders.forEach(l => { const dot = document.createElement('div'); dot.className = "voting-dot shadow-sm"; dot.style.backgroundColor = l.party.color; chart.appendChild(dot); });
    },

    // --- UPGRADED: AI List with Lobbying Button ---
    renderAI() {
        const cont = document.getElementById('ai-list'); if(!cont) return;
        cont.innerHTML = state.leaders.slice(0, 15).map(l => {
            const tag = l.party.status === "Government" ? "govt-tag" : (l.party.status === "Opposition" ? "opp-tag" : "neu-tag");
            const cobraClass = l.isCobra ? "text-red-500 font-bold animate-pulse" : "text-zinc-400";
            return `<div class="bg-white p-4 rounded-xl border-l-4 shadow-md text-left font-sans text-black" style="border-left-color:${l.party.color}">
                <div class="flex justify-between items-start font-sans">
                    <div>
                        <div class="text-xs font-bold text-black font-sans">${l.name}</div>
                        <div class="text-[9px] text-zinc-500 font-bold uppercase">${l.party.name}</div>
                    </div>
                    <span class="${tag} font-sans">${l.party.status}</span>
                </div>
                <div class="mt-3 flex justify-between items-center">
                    <div class="text-[9px] text-zinc-600">Loyalty: <span class="font-bold">${l.loyalty.toFixed(0)}%</span></div>
                    <div class="text-[8px] ${cobraClass}">${l.isCobra ? '● สถานะ: งูเห่า' : '● สถานะ: ปกติ'}</div>
                </div>
                <button onclick="engine.buyCobra(${l.id})" class="mt-3 w-full py-2 bg-black hover:bg-red-700 text-white rounded-lg text-[10px] font-bold transition-all">
                    ดีลลับส่วนตัว (฿10M)
                </button>
            </div>`;
        }).join("");
    },

    resetModalState() {
        document.getElementById('voting-display').classList.add('hidden');
        document.getElementById('stakeholder-reactions').classList.add('hidden');
        document.getElementById('event-options').innerHTML = "";
        document.getElementById('event-desc').innerHTML = "";
    }
};
