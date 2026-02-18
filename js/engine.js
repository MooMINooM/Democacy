import { state } from './state.js';
import * as Data from './data.js';
import { ui } from './ui.js';

export const gameClock = {
    toggle() { this.setSpeed(state.speed === 0 ? 1 : 0); },
    setSpeed(s) { 
        state.speed = s; 
        const btn = document.getElementById('play-pause-btn'); 
        if (btn) btn.innerHTML = s===0 ? '<i class="fas fa-play text-xs text-white"></i>' : '<i class="fas fa-pause text-xs text-red-500"></i>'; 
    },
    tick() {
        if (state.speed === 0) return;
        state.date.setDate(state.date.getDate() + 1);
        Object.values(Data.MINISTRIES).forEach(m => { if(m.cooldown > 0) m.cooldown -= state.speed; });
        state.activePolicies.forEach(p => { if(p.isDeliberating) { p.remainingDays -= state.speed; if(p.remainingDays <= 0) { p.remainingDays = 0; p.isDeliberating = false; } } });
        
        if(state.date.getDate() === 15 && Math.random() < 0.1) engine.aiPropose();
        if(state.date.getDate() === 28 && state.player.position === "นายกรัฐมนตรี" && (state.world.approval < 30 || state.world.cabinetStability < 40)) {
           if(Math.random() < 0.05) engine.triggerNoConfidence();
        }
        if(Math.random() < 0.02) engine.triggerCrisis();
        if(state.world.transparency < 40 && Math.random() < 0.05) {
             const army = state.factions.find(f => f.name === "กองทัพ");
             if(army && army.approval < 50) engine.triggerCoup();
        }
        
        state.factions.forEach(f => { f.approval = Math.max(0, Math.min(100, f.approval + (Math.random() - 0.5) * 1.5)); });
        if (state.date.getDate() === 1) engine.processMonthlyUpdate();
        ui.updateMain();
    }
};

export const engine = {
    init() {
        state.voteModifier = null; 
        state.world.transparency = 100; 
        state.history = { approval: [], budget: [] }; 
        state.lastVoteResults = null; 
        state.lastVoteLog = []; 

        state.factions = Data.FACTION_DATA.map(f => ({ ...f, approval: 50 + (Math.random() * 10 - 5) }));
        if(state.parties.length === 0) state.parties = this.generateGameParties();
        state.leaders = [];
        let nIdx = 0;
        
        // --- NEW: Generate MPs with 4 Dimensions ---
        state.parties.forEach(p => {
            for(let i=0; i<p.seats; i++) {
                // Randomize 4 Traits
                const ability = Data.ABILITY_POOL[Math.floor(Math.random() * Data.ABILITY_POOL.length)];
                const socio = Data.SOCIO_POOL[Math.floor(Math.random() * Data.SOCIO_POOL.length)];
                const ideology = Data.IDEOLOGY_POOL[Math.floor(Math.random() * Data.IDEOLOGY_POOL.length)];
                const goal = Data.GOAL_POOL[Math.floor(Math.random() * Data.GOAL_POOL.length)];
                
                // Calculate Wealth based on Socio status
                const cash = (socio.baseWealth * 1000000) + Math.floor(Math.random() * 5000000); 

                state.leaders.push({
                    id: state.leaders.length, 
                    name: Data.ALL_MP_NAMES[nIdx++] || `สส.นิรนาม ${state.leaders.length}`,
                    party: p, 
                    status: i === 0 ? p.baseFaction : Data.FACTION_NAMES[Math.floor(Math.random()*17)],
                    prestige: Math.floor(Math.random() * 100), 
                    loyalty: 40 + Math.random() * 60, 
                    isCobra: false,
                    // 4 Key Traits
                    trait: {
                        ideology: ideology,
                        goal: goal,
                        ability: ability,
                        socio: socio
                    },
                    cash: cash
                });
            }
        });
        ui.renderCabinet(); ui.renderMinistryList();
        this.addNews("สภาสมัยประชุมเริ่มต้น", "สส. 500 ท่านเข้าประจำการเพื่อขับเคลื่อนแผ่นดิน");
        for(let i=0; i<6; i++) { state.history.approval.push(50); state.history.budget.push(state.world.nationalBudget); }
        setInterval(() => gameClock.tick(), 1000);
    },

    generateGameParties() {
        const pArr = [];
        const colors = ["#f87171", "#60a5fa", "#fbbf24", "#34d399", "#a78bfa", "#f472b6", "#22c55e", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#6366f1", "#84cc16", "#eab308", "#d946ef", "#0ea5e9", "#475569"];
        const names = ["ไทสร้างชาติ", "อนาคตใหม่", "ธรรมนำไทย", "ประชาธิปัตย์", "ภูมิใจไทย", "ก้าวหน้า", "ชาติไทยพัฒนา", "เสรีรวมไทย", "พลังประชารัฐ", "เพื่อไทย", "ประชาชาติ", "สีเขียวไทย", "กิจสังคม", "นวัตกรรม", "มิตรภาพ", "ทางเลือกใหม่", "เกษตรกรรม", "แรงงาน", "ศาสนา", "เอกราช"];
        const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);
        
        for(let i=0; i<20; i++) {
            let size = i < 6 ? "Major" : (i < 12 ? "Medium" : "Small");
            pArr.push({
                id: "P" + (i + 1), name: "พรรค" + names[i], size, color: colors[i],
                ideologies: shuffle(Data.IDEOLOGY_POOL).slice(0, size === "Major" ? 5 : (size === "Medium" ? 3 : 2)),
                goals: shuffle(Data.GOAL_POOL).slice(0, size === "Major" ? 5 : (size === "Medium" ? 3 : 2)),
                baseFaction: Data.FACTION_NAMES[Math.floor(Math.random() * Data.FACTION_NAMES.length)],
                status: "Opposition", seats: 0 
            });
        }
        let rSeats = 500;
        pArr.forEach((p) => {
            let s = p.size === "Major" ? 35 + Math.random()*25 : (p.size === "Medium" ? 15 + Math.random()*15 : 2 + Math.random()*8);
            p.seats = Math.floor(s); rSeats -= p.seats;
        });
        pArr[0].seats += rSeats;
        
        pArr[0].status = "Government";
        let currentGovSeats = pArr[0].seats;
        for(let i=1; i<pArr.length; i++) {
            if (currentGovSeats > 250) break;
            let conflict = false;
            pArr[i].ideologies.forEach(ideo => {
                if(Data.IDEOLOGY_CONFLICTS[ideo] && Data.IDEOLOGY_CONFLICTS[ideo].some(c => pArr[0].ideologies.includes(c))) conflict = true;
            });
            if (!conflict) { pArr[i].status = "Government"; currentGovSeats += pArr[i].seats; }
        }
        if (currentGovSeats <= 250) {
            for(let i=1; i<pArr.length; i++) {
                if (currentGovSeats > 250) break;
                if (pArr[i].status !== "Government") { pArr[i].status = "Government"; currentGovSeats += pArr[i].seats; }
            }
        }
        for(let i=1; i<pArr.length; i++) {
            if (pArr[i].status !== "Government") {
                if (pArr[i].seats > 40 || Math.random() > 0.5) pArr[i].status = "Opposition"; else pArr[i].status = "Neutral";
            }
        }
        return pArr;
    },

    addNews(h, b = "") { state.news.unshift({ date: state.date.toLocaleDateString('th-TH'), headline: h, body: b || "วิเคราะห์สถานการณ์วันนี้..." }); ui.renderNews(); },
    
    processMonthlyUpdate() {
        state.world.growth += (Math.random() - 0.5) * 0.1;
        state.history.approval.push(state.world.approval); state.history.budget.push(state.world.nationalBudget);
        if(state.history.approval.length > 6) state.history.approval.shift(); if(state.history.budget.length > 6) state.history.budget.shift();
        const govSeats = state.parties.filter(p => p.status === "Government").reduce((s, p) => s + p.seats, 0);
        let factionScore = 0; let minCount = 0;
        Object.values(Data.MINISTRIES).forEach(m => { if(m.currentMinister) { const f = state.factions.find(fx => fx.name === m.currentMinister.status); if(f) factionScore += f.approval; minCount++; } });
        state.world.cabinetStability = Math.floor((govSeats / 500 * 50) + (minCount > 0 ? (factionScore / minCount) * 0.5 : 25));
        state.world.approval = state.factions.reduce((acc, f) => acc + f.approval, 0) / state.factions.length;
    },
    
    lobbyIndividual(mpId) {
        const mp = state.leaders.find(l => l.id === mpId);
        const cost = 2000000 * mp.trait.socio.costMod; // Richer people cost more to lobby
        if (state.player.personalFunds < cost) { alert(`เงินไม่พอ (ต้องการ ฿${(cost/1e6).toFixed(1)}M)`); return; }
        state.player.personalFunds -= cost;
        mp.loyalty = Math.min(100, mp.loyalty + 15);
        this.addNews(`ล็อบบี้สำเร็จ: ${mp.name}`, `ความสัมพันธ์ดีขึ้น (+15 Loyalty)`);
        
        // --- UI FEEDBACK ---
        ui.showFeedback('lobby', true, mp.name, () => {
            ui.updateMain();
            ui.showMPActionModal(mpId); 
        });
    },

    forceSwitchParty(mpId) {
        const mp = state.leaders.find(l => l.id === mpId);
        const cost = 50000000 * mp.trait.ability.costMod * mp.trait.socio.costMod; 
        
        if (state.player.personalFunds < cost) { alert(`เงินไม่พอ (ต้องการ ฿${(cost/1e6).toFixed(1)}M)`); return; }
        if (mp.trait.ideology === "อุดมการณ์สูง") { 
            ui.showFeedback('switch', false, mp.name, null); // ปฏิเสธทันที
            return; 
        }

        state.player.personalFunds -= cost;
        mp.party.seats--; 
        mp.party = state.player.party; 
        mp.party.seats++; 
        mp.loyalty = 50; 
        mp.isCobra = false; 
        
        state.world.transparency -= 15;
        this.addNews(`ดูด สส. สำเร็จ!`, `${mp.name} ย้ายขั้วมาสังกัด ${state.player.party.name} อย่างเป็นทางการ`);
        
        // --- UI FEEDBACK ---
        ui.showFeedback('switch', true, mp.name, () => {
            ui.updateMain();
            ui.showMPActionModal(mpId); 
        });
    },

    buyCobra(mpId) {
        const mp = state.leaders.find(l => l.id === mpId);
        const cost = 10000000 * mp.trait.ability.costMod * mp.trait.socio.costMod; 
        
        if (mp.isCobra) { alert("เป็นงูเห่าอยู่แล้ว"); return; }
        if (state.player.personalFunds < cost) { alert(`เงินไม่พอ (ต้องการ ฿${(cost/1e6).toFixed(1)}M)`); return; }
        
        state.world.transparency = Math.max(0, state.world.transparency - 5);

        // Success Chance: Depends on Loyalty and Ideology mismatch
        const successChance = 100 - (mp.loyalty * 0.8);
        const isSuccess = Math.random() * 100 <= successChance;

        if (!isSuccess) {
             state.player.personalFunds -= (cost / 5); 
             // --- UI FEEDBACK (FAIL) ---
             ui.showFeedback('cobra', false, mp.name, () => ui.updateMain());
             return;
        }
        
        state.player.personalFunds -= cost;
        mp.isCobra = true; mp.loyalty = 0; 
        this.addNews(`ดีลลับสำเร็จ`, `สส. ${mp.name} เป็นงูเห่า (Transparency -5)`);
        
        // --- UI FEEDBACK (SUCCESS) ---
        ui.showFeedback('cobra', true, mp.name, () => {
            ui.updateMain();
            ui.showMPActionModal(mpId); 
        });
    },

    triggerCrisis() {
        const type = Math.random() > 0.5 ? "Economic" : "Protest";
        if (type === "Economic") {
            state.world.growth -= 2.5;
            this.addNews("วิกฤตเศรษฐกิจถดถอย!", "GDP ร่วงกราวรูด ค่าครองชีพพุ่งสูง");
        } else {
            state.world.cabinetStability -= 15;
            this.addNews("ม็อบลงถนนขับไล่รัฐบาล!", "ประชาชนชุมนุมใหญ่ เรียกร้องให้ยุบสภา");
        }
        ui.updateMain();
    },

    triggerCoup() {
        gameClock.setSpeed(0); ui.resetModalState();
        document.getElementById('event-title').innerText = "รัฐประหารยึดอำนาจ!";
        document.getElementById('event-desc').innerHTML = `<div class="text-red-500 font-bold text-xl mb-4">ระบอบประชาธิปไตยสิ้นสุดลง</div>เนื่องจากค่าความโปร่งใสต่ำและความนิยมตกต่ำ กองทัพตัดสินใจเข้าควบคุมความสงบเรียบร้อย`;
        document.getElementById('event-options').innerHTML = `<button onclick="location.reload()" class="w-full p-4 bg-black rounded-xl text-white font-sans">เริ่มเกมใหม่</button>`;
        document.getElementById('event-modal').classList.remove('hidden');
    },

    propose(pInput, proposer = "รัฐบาล") {
        let p = pInput;
        if (typeof pInput === 'string') {
            p = Data.POLICY_TEMPLATES.find(x => x.name === pInput);
        }
        if (!p) { console.error("Policy not found:", pInput); return; }

        if (state.activePolicies.some(x => x.name === p.name)) return;
        if(proposer !== "รัฐบาล") {
            state.activePolicies.push({ ...p, stage: 1, isDeliberating: true, remainingDays: p.delibTime, totalDays: p.delibTime, proposer, coalitionBoost: 0, oppositionLobby: 0 });
            ui.updateMain(); return;
        }
        gameClock.setSpeed(0); ui.resetModalState();
        const stakeholders = [state.factions.find(f => f.name === p.target)];
        while(stakeholders.length < 3) { let rf = state.factions[Math.floor(Math.random()*17)]; if(!stakeholders.includes(rf)) stakeholders.push(rf); }
        ui.showStakeholderReview(p, stakeholders, proposer);
    },

    confirmProposal(pInput, proposer) {
        let p = pInput;
        if (typeof pInput === 'string') {
            p = Data.POLICY_TEMPLATES.find(x => x.name === pInput);
        }
        if (!p) { console.error("Policy not found:", pInput); return; }

        state.activePolicies.push({ ...p, stage: 1, isDeliberating: true, remainingDays: p.delibTime, totalDays: p.delibTime, proposer, coalitionBoost: 0, oppositionLobby: 0 });
        this.addNews(`ยื่นเสนอร่าง ${p.name}`, `โดยรัฐบาล เข้าสู่วาระการพิจารณาชั้นกรรมาธิการ`);
        document.getElementById('event-modal').classList.add('hidden');
        ui.updateMain(); gameClock.setSpeed(1);
    },

    aiPropose() {
        const aiMP = state.leaders[Math.floor(Math.random()*state.leaders.length)];
        const temp = Data.POLICY_TEMPLATES[Math.floor(Math.random()*Data.POLICY_TEMPLATES.length)];
        if (aiMP.party.status === "Government" && temp.cost > state.world.nationalBudget * 0.1) return;
        this.propose(temp, `${aiMP.name}`);
    },

    partyWhip() {
        if(state.player.personalFunds < 30000000) { alert("เงินส่วนตัวไม่เพียงพอ"); return; }
        state.player.personalFunds -= 30000000;
        state.leaders.forEach(l => { if(l.party.id === state.player.party.id) l.loyalty = Math.min(100, l.loyalty + 15); });
        this.addNews("Whip!: ดีลในพรรค", "สส. ในพรรคมีความภักดีและพร้อมโหวตตามมติพรรคมากขึ้น");
        ui.updateMain();
    },

    adjustStance(type, newValue) {
        if(state.player.personalFunds < 50000000) return;
        state.player.personalFunds -= 50000000;
        const p = state.player.party;
        if(type === 'ideology') { p.ideologies.shift(); p.ideologies.push(newValue); } else { p.goals.shift(); p.goals.push(newValue); }
        this.addNews(`พรรค ${p.name} ปรับอุดมการณ์`, `ประกาศเปลี่ยนจุดยืนเป็น ${newValue}`);
        ui.updateMain();
    },

    lobbyCoalition(policyName) {
        if(state.player.personalFunds < 25000000) return;
        state.player.personalFunds -= 25000000;
        state.world.transparency = Math.max(0, state.world.transparency - 2);
        const p = state.activePolicies.find(x => x.name === policyName);
        if(p) p.coalitionBoost = (p.coalitionBoost || 0) + 10;
        this.addNews(`ดีลพรรคร่วม: ${p.name}`, "การล็อบบี้ทำให้พรรคร่วมมีแนวโน้มเห็นชอบมากขึ้น");
        ui.renderActivePolicies(); ui.updateHUD();
    },

    triggerNoConfidence() {
        gameClock.setSpeed(0); ui.resetModalState();
        document.getElementById('event-title').innerText = `ศึกอภิปรายไม่ไว้วางใจ`;
        document.getElementById('event-desc').innerText = `ฝ่ายค้านยื่นญัตติลงมติไม่ไว้วางใจรัฐบาลเนื่องจากภาวะเสถียรภาพต่ำ ท่านต้องรวบรวมเสียงสนับสนุนเพื่อรักษาตำแหน่ง!`;
        document.getElementById('voting-display').classList.remove('hidden');
        document.getElementById('event-options').innerHTML = `<button onclick="engine.runNoConfidenceVote()" class="w-full p-4 bg-red-700 hover:bg-red-600 rounded-xl font-bold text-white font-sans">ลงมติ</button>`;
        document.getElementById('event-modal').classList.remove('hidden');
    },

    runNoConfidenceVote() {
        let yes = 0, no = 0; 
        state.leaders.forEach(mp => {
            let score = state.factions.find(fx => fx.name === mp.status)?.approval || 50;
            if(mp.party.status === "Opposition") score -= 40; if(mp.party.status === "Government") score += 30;
            let voteAgainstParty = (mp.loyalty < 30 && Math.random() < 0.3) || mp.isCobra;
            if(mp.party.status === "Government") { if(voteAgainstParty) yes++; else no++; }
            else if(mp.party.status === "Opposition") { if(voteAgainstParty) no++; else yes++; }
            else { if (score < 50) yes++; else no++; }
        });
        document.getElementById('vote-count-yes').innerText = yes; document.getElementById('vote-count-no').innerText = no;
        const ousted = yes > 250;
        document.getElementById('event-options').innerHTML = ousted ? `<button onclick="location.reload()" class="w-full p-4 bg-black rounded-xl text-white font-sans">จบเกม</button>` : `<button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="w-full p-4 bg-zinc-700 rounded-xl text-white font-sans">บริหารต่อ</button>`;
    },

    appointMinister(mName, lId) {
        const l = state.leaders.find(x => x.id === lId);
        if (!l) return;
        Data.MINISTRIES[mName].currentMinister = l;
        this.addNews(`แต่งตั้ง รมว.${mName}: ${l.name}`);
        ui.renderCabinet(); ui.updateMain();
    },

    startVote(pName) {
        state.voteModifier = null; state.lastVoteResults = null; state.lastVoteLog = [];
        const p = state.activePolicies.find(x => x.name === pName);
        if (p.proposer === "รัฐบาล" && Math.random() < 0.3) {
            const coalitions = state.parties.filter(py => py.status === "Government" && py.id !== state.player.party.id);
            if (coalitions.length > 0) {
                const badActor = coalitions[Math.floor(Math.random() * coalitions.length)];
                const demands = Data.POLICY_TEMPLATES.filter(t => t.ministry === "การคลัง" || t.ministry === "คมนาคม"); 
                if (demands.length > 0) {
                     ui.showQuidProQuo(p, demands[0], badActor); return; 
                }
            }
        }
        ui.showVoteInterface(pName);
    },

    processQuidProQuo(pName, demandName, partyId, accepted) {
        const demand = Data.POLICY_TEMPLATES.find(x => x.name === demandName);
        const party = state.parties.find(x => x.id === partyId);
        if (accepted) {
            state.world.nationalBudget -= demand.cost; state.world.transparency = Math.max(0, state.world.transparency - 8);
            this.addNews(`ดีลการเมือง: ${demand.name}`, `รัฐบาลอนุมัตินโยบายแลกเสียง`);
            state.voteModifier = { partyId: partyId, type: 'support' }; 
        } else {
            this.addNews(`ดีลล่ม! พรรคร่วมไม่พอใจ`, `การเจรจาแลกเปลี่ยนล้มเหลว`);
            state.voteModifier = { partyId: partyId, type: 'rebel' }; 
        }
        ui.showVoteInterface(pName); 
    },

    runVote(pName) {
        const p = state.activePolicies.find(x => x.name === pName);
        let yes = 0, no = 0;
        state.lastVoteResults = []; state.lastVoteLog = [];

        state.leaders.forEach(mp => {
            let score = state.factions.find(fx => fx.name === mp.status)?.approval || 50;
            if (mp.party.ideologies.includes(p.ideology)) score += 35;
            score += (p.coalitionBoost || 0); 
            if (state.voteModifier && mp.party.id === state.voteModifier.partyId) {
                if (state.voteModifier.type === 'support') score += 100; if (state.voteModifier.type === 'rebel') score -= 100; 
            }
            let voteAgainstParty = (mp.loyalty < 30 && Math.random() < 0.4) || mp.isCobra;
            if (mp.isCobra) { if(mp.party.status === "Government") voteAgainstParty = false; if(mp.party.status === "Opposition") voteAgainstParty = true; }

            let finalVote = "abstain";
            if(mp.party.status === "Government") { if (voteAgainstParty) finalVote = "no"; else { if(score > 50) finalVote = "yes"; else finalVote = "no"; } } 
            else if (mp.party.status === "Opposition") { if (voteAgainstParty) finalVote = "yes"; else finalVote = "no"; } 
            else { if (score > 50) finalVote = "yes"; else finalVote = "no"; }

            state.lastVoteResults.push({ id: mp.id, vote: finalVote, isRebel: voteAgainstParty });
            state.lastVoteLog.push({ name: mp.name, party: mp.party.name, color: mp.party.color, vote: finalVote, isCobra: mp.isCobra, isRebel: voteAgainstParty });

            if (finalVote === "yes") yes++; else no++;
        });
        ui.renderParliament(); ui.displayResults(p, yes, no);
    },

    finalizeVote(pName, passed) {
        const p = state.activePolicies.find(x => x.name === pName);
        if (passed) {
            if (p.stage < 3) { p.stage++; p.isDeliberating = true; p.remainingDays = p.totalDays; }
            else {
                state.world.nationalBudget -= p.cost;
                Object.entries(p.impact).forEach(([fn,v]) => { const fac = state.factions.find(x=>x.name===fn); if(fac) fac.approval += v; });
                this.addNews(`${p.name} บังคับใช้เป็นกฎหมาย`);
                state.activePolicies = state.activePolicies.filter(x => x.name !== pName);
            }
        } else { state.activePolicies = state.activePolicies.filter(x => x.name !== pName); }
        document.getElementById('event-modal').classList.add('hidden'); 
        state.lastVoteResults = null; ui.renderParliament(); 
        ui.updateMain(); gameClock.setSpeed(1);
    }
};
