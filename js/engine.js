import { state } from './state.js';
import * as Data from './data.js';
import { ui } from './ui.js';

function ideologiesConflict(a, b) {
    if (!a || !b) return false;
    const fromA = Data.IDEOLOGY_CONFLICTS[a] || [];
    const fromB = Data.IDEOLOGY_CONFLICTS[b] || [];
    return fromA.includes(b) || fromB.includes(a);
}

// A faction's rough weight in the national economy: how many people, how well-off they are.
function factionOutput(f) { return f.basePop * f.wealth; }

// A province's actual production, given its industry's base output, the national stats that
// industry is sensitive to (Phase 4), and however much investment has built up there.
function provinceOutput(prov) {
    const industry = Data.INDUSTRY_TYPES[prov.industry] || Data.INDUSTRY_TYPES["เกษตรกรรม"];
    let multiplier = 1 + ((prov.investmentLevel ?? 50) - 50) / 50 * 0.4;
    Object.entries(industry.sensitivity || {}).forEach(([stat, weight]) => {
        const val = state.world[stat] ?? 50;
        multiplier += ((val - 50) / 50) * weight;
    });
    // Trade exposure: each industry leans on the one foreign power that shares its keyIndustry
    // (Data.FOREIGN_POWERS), so a souring or improving relationship hits the provinces running
    // that industry specifically, on top of whatever it does to the national trade number.
    const partner = state.foreign.find(c => c.keyIndustry === prov.industry);
    if (partner) multiplier += ((partner.relation - 50) / 50) * 0.25;
    return prov.pop * industry.baseOutput * Math.max(0.3, multiplier);
}

// state.speed can advance the calendar by more than 1 day per tick, so periodic checks
// (day-of-month triggers, month-boundary updates) must detect crossing a mark, not equal it exactly.
function crossedMonthBoundary(prev, curr) {
    return curr.getMonth() !== prev.getMonth() || curr.getFullYear() !== prev.getFullYear();
}
function crossedDayOfMonth(prev, curr, day) {
    if (curr.getMonth() === prev.getMonth() && curr.getFullYear() === prev.getFullYear()) {
        return prev.getDate() < day && curr.getDate() >= day;
    }
    return curr.getDate() >= day; // rolled into a new month already at/past `day`
}

export const gameClock = {
    toggle() { this.setSpeed(state.speed === 0 ? 1 : 0); },
    setSpeed(s) { 
        state.speed = s; 
        const btn = document.getElementById('play-pause-btn'); 
        if (btn) btn.innerHTML = s===0 ? '<i class="fas fa-play text-xs text-white"></i>' : '<i class="fas fa-pause text-xs text-red-500"></i>'; 
    },
    tick() {
        if (state.speed === 0) return;
        const prevDate = new Date(state.date);
        state.date.setDate(state.date.getDate() + state.speed);
        Object.values(Data.MINISTRIES).forEach(m => { if(m.cooldown > 0) m.cooldown -= state.speed; });
        state.activePolicies.forEach(p => { if(p.isDeliberating) { p.remainingDays -= state.speed; if(p.remainingDays <= 0) { p.remainingDays = 0; p.isDeliberating = false; } } });
        state.world.stabilityPenalty = Math.max(0, (state.world.stabilityPenalty || 0) - 0.5 * state.speed);
        state.leaders.forEach(l => { if (l.switchCooldown > 0) l.switchCooldown -= state.speed; });

        if(crossedDayOfMonth(prevDate, state.date, 15) && Math.random() < 0.1) engine.aiPropose();
        if(crossedDayOfMonth(prevDate, state.date, 28) && state.player.position === "นายกรัฐมนตรี" && (state.world.approval < 30 || state.world.cabinetStability < 40)) {
           if(Math.random() < 0.05) engine.triggerNoConfidence();
        }
        if(Math.random() < 0.02) engine.triggerCrisis();
        if(state.world.transparency < 40 && Math.random() < 0.05) {
             const army = state.factions.find(f => f.name === "กองทัพ");
             if(army && army.approval < 50) engine.triggerCoup();
        }
        
        // The 5 policy-driven national stats: apply/decay their modifiers, then drift back
        // toward baseline like faction/party trust does, so a policy's effect fades unless renewed.
        Object.entries(Data.WORLD_STAT_META).forEach(([stat, meta]) => {
            const mods = state.world.statMods[stat] || (state.world.statMods[stat] = []);
            mods.forEach(m => { state.world[stat] = Math.max(0, Math.min(100, state.world[stat] + m.perDay * state.speed)); m.remaining -= state.speed; });
            state.world.statMods[stat] = mods.filter(m => m.remaining > 0);
            state.world[stat] = Math.max(0, Math.min(100, state.world[stat] + (meta.baseline - state.world[stat]) * 0.002 * state.speed + (Math.random() - 0.5) * 0.1 * state.speed));
        });

        state.provinces.forEach(prov => {
            (prov.modifiers || []).forEach(m => { prov.investmentLevel = Math.max(0, Math.min(100, prov.investmentLevel + m.perDay * state.speed)); m.remaining -= state.speed; });
            prov.modifiers = (prov.modifiers || []).filter(m => m.remaining > 0);
            prov.investmentLevel = Math.max(0, Math.min(100, prov.investmentLevel + (50 - prov.investmentLevel) * 0.003 * state.speed));
        });

        state.factions.forEach(f => {
            (f.modifiers || []).forEach(m => { f.approval = Math.max(0, Math.min(100, f.approval + m.perDay * state.speed)); m.remaining -= state.speed; });
            f.modifiers = (f.modifiers || []).filter(m => m.remaining > 0);
            // Wealthier/more capital-exposed factions feel national growth (or a recession) more directly, day to day
            const growthBias = (state.world.growth / 10) * (f.wealth / 100) * 0.3;
            // The unemployment/environment indices ripple into the factions they hit hardest
            let statBias = 0;
            if (f.name === "สิ่งแวดล้อม") statBias += (state.world.environment - 55) * 0.03;
            if (f.name === "คนว่างงาน" || f.name === "แรงงาน") statBias -= (state.world.unemployment - 20) * 0.03;
            f.approval = Math.max(0, Math.min(100, f.approval + (Math.random() - 0.5) * 1.5 + growthBias * state.speed + statBias * state.speed));
        });

        state.foreign.forEach(c => {
            (c.modifiers || []).forEach(m => { c.relation = Math.max(0, Math.min(100, c.relation + m.perDay * state.speed)); m.remaining -= state.speed; });
            c.modifiers = (c.modifiers || []).filter(m => m.remaining > 0);
            // A government whose ideology lines up with (or clashes with) a power's own drifts relation slowly either way
            const govIdeo = state.player.party?.ideologies?.[0];
            const align = ideologiesConflict(c.ideology, govIdeo) ? -0.06 : (c.ideology === govIdeo ? 0.06 : 0);
            c.relation = Math.max(0, Math.min(100, c.relation + (Math.random() - 0.5) * 0.8 + align * state.speed));
        });
        if (Math.random() < 0.01) {
            const grudge = state.foreign.find(c => c.relation < 20);
            if (grudge) engine.triggerDiplomaticIncident(grudge);
        }

        state.parties.forEach(p => {
            let target = p.status === "Government" ? state.world.approval : (p.status === "Opposition" ? 100 - state.world.approval : 50);
            if (p.id === state.player.party.id) target += (state.world.transparency - 100) * 0.15;
            p.popularity = Math.max(0, Math.min(100, p.popularity + (target - p.popularity) * 0.01 * state.speed + (Math.random() - 0.5) * 0.3 * state.speed));
        });

        if (crossedMonthBoundary(prevDate, state.date)) engine.processMonthlyUpdate();

        const daysToElection = Math.round((state.world.electionDay - state.date) / 86400000);
        const prevDaysToElection = Math.round((state.world.electionDay - prevDate) / 86400000);
        [180, 90, 30, 7].forEach(threshold => {
            if (prevDaysToElection > threshold && daysToElection <= threshold) {
                engine.addNews(`นับถอยหลังเลือกตั้ง`, `เหลืออีก ${threshold} วันก่อนวันเลือกตั้งทั่วไป`);
            }
        });
        if (state.date >= state.world.electionDay) engine.runElection();

        ui.updateMain();
    }
};

export const engine = {
    init() {
        state.voteModifier = null;
        state.world.transparency = 100;
        state.world.stabilityPenalty = 0;
        Object.entries(Data.WORLD_STAT_META).forEach(([stat, meta]) => { state.world[stat] = meta.baseline; });
        state.world.statMods = { unemployment: [], crime: [], health: [], education: [], environment: [] };
        state.world.electionDay = new Date(state.date);
        state.world.electionDay.setDate(state.world.electionDay.getDate() + Data.ELECTION_TERM_DAYS);
        state.history = { approval: [], budget: [] };
        state.lastVoteResults = null;
        state.lastVoteLog = [];

        state.factions = Data.FACTION_DATA.map(f => ({ ...f, approval: 50 + (Math.random() * 10 - 5), modifiers: [] }));
        state.foreign = Data.FOREIGN_POWERS.map(c => ({ ...c, relation: 50 + (Math.random() * 20 - 10), modifiers: [] }));
        if(state.parties.length === 0) state.parties = this.generateGameParties();
        this.generateLeaders();
        if(state.provinces.length === 0) this.generateProvinces();

        ui.renderCabinet(); ui.renderMinistryList();
        this.addNews("สภาสมัยประชุมเริ่มต้น", "สส. 500 ท่านเข้าประจำการเพื่อขับเคลื่อนแผ่นดิน");
        for(let i=0; i<6; i++) { state.history.approval.push(50); state.history.budget.push(state.world.nationalBudget); }
        setInterval(() => gameClock.tick(), 1000);
    },

    // Fills state.leaders with fresh MPs matching each party's current seat count.
    // Used at game start, and again after every election to seat the new parliament.
    generateLeaders() {
        state.leaders = [];
        let nIdx = 0;
        Data.ALL_MP_NAMES.sort(() => Math.random() - 0.5); // re-shuffle so a re-election doesn't hand out the same names in the same order
        state.parties.forEach(p => {
            for(let i=0; i<p.seats; i++) {
                const ability = Data.ABILITY_POOL[Math.floor(Math.random() * Data.ABILITY_POOL.length)];
                const socio = Data.SOCIO_POOL[Math.floor(Math.random() * Data.SOCIO_POOL.length)];
                const ideology = Data.IDEOLOGY_POOL[Math.floor(Math.random() * Data.IDEOLOGY_POOL.length)];
                const goal = Data.GOAL_POOL[Math.floor(Math.random() * Data.GOAL_POOL.length)];
                const cash = (socio.baseWealth * 1000000) + Math.floor(Math.random() * 5000000);

                state.leaders.push({
                    id: state.leaders.length,
                    name: Data.ALL_MP_NAMES[nIdx++] || `สส.นิรนาม ${state.leaders.length}`,
                    party: p,
                    status: i === 0 ? p.baseFaction : Data.FACTION_NAMES[Math.floor(Math.random()*17)],
                    prestige: Math.floor(Math.random() * 100),
                    loyalty: 40 + Math.random() * 60,
                    isCobra: false,
                    trait: { ideology, goal, ability, socio },
                    conviction: Math.floor(Math.random() * 100),
                    trust: 50,
                    switchCooldown: 0,
                    cash: cash
                });
            }
        });
    },

    // Splits the 500 seats across all 77 provinces by population (largest-remainder method,
    // same technique runElection() uses) and assigns each a plausible dominant faction.
    generateProvinces() {
        const totalPop = Data.PROVINCES.reduce((s, p) => s + p.pop, 0);
        const withSeats = Data.PROVINCES.map(p => {
            const exact = (p.pop / totalPop) * Data.TOTAL_SEATS;
            return { ...p, seats: Math.floor(exact), remainder: exact - Math.floor(exact) };
        });
        const remaining = Data.TOTAL_SEATS - withSeats.reduce((s, p) => s + p.seats, 0);
        [...withSeats].sort((a, b) => b.remainder - a.remainder).slice(0, remaining).forEach(p => p.seats++);

        state.provinces = withSeats.map(p => ({
            name: p.name, region: p.region, pop: p.pop, seats: p.seats,
            baseFaction: Data.PROVINCE_FACTION_OVERRIDES[p.name] || Data.REGION_FACTION_POOL[p.region][Math.floor(Math.random() * Data.REGION_FACTION_POOL[p.region].length)],
            industry: Data.PROVINCE_INDUSTRY_OVERRIDES[p.name] || Data.REGION_INDUSTRY_DEFAULT[p.region],
            investmentLevel: 50, modifiers: []
        }));

        // Capture today's production-per-capita as the neutral reference point, so growth is only
        // biased once industries actually out- or under-perform this starting mix -- not by the mix itself.
        const totalProduction = state.provinces.reduce((s, prov) => s + provinceOutput(prov), 0);
        state.world.baseProductionPerCapita = totalProduction / totalPop;
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
                status: "Opposition", seats: 0, trust: 70, popularity: 0
            });
        }
        let rSeats = Data.TOTAL_SEATS;
        pArr.forEach((p) => {
            let s = p.size === "Major" ? 35 + Math.random()*25 : (p.size === "Medium" ? 15 + Math.random()*15 : 2 + Math.random()*8);
            p.seats = Math.floor(s); rSeats -= p.seats;
        });
        pArr[0].seats += rSeats;
        pArr.forEach(p => { p.popularity = Math.max(2, (p.seats / Data.TOTAL_SEATS) * 100 + (Math.random() * 10 - 5)); });

        this.assignGovernmentStatus(pArr);
        return pArr;
    },

    // Picks the largest party as the coalition anchor, adds non-conflicting parties until it
    // clears a majority, then labels the rest Opposition/Neutral. Used for the initial parliament
    // and to reseat government after every election.
    assignGovernmentStatus(pArr) {
        pArr.forEach(p => { p.status = "Opposition"; });
        const sorted = [...pArr].sort((a, b) => b.seats - a.seats);
        const anchor = sorted[0];
        anchor.status = "Government";
        let currentGovSeats = anchor.seats;
        for (const p of sorted) {
            if (p === anchor) continue;
            if (currentGovSeats > Data.MAJORITY_SEATS) break;
            let conflict = false;
            p.ideologies.forEach(ideo => { anchor.ideologies.forEach(govIdeo => { if (ideologiesConflict(ideo, govIdeo)) conflict = true; }); });
            if (!conflict) { p.status = "Government"; currentGovSeats += p.seats; }
        }
        if (currentGovSeats <= Data.MAJORITY_SEATS) {
            for (const p of sorted) {
                if (currentGovSeats > Data.MAJORITY_SEATS) break;
                if (p.status !== "Government") { p.status = "Government"; currentGovSeats += p.seats; }
            }
        }
        for (const p of sorted) {
            if (p.status !== "Government") p.status = (p.seats > 40 || Math.random() > 0.5) ? "Opposition" : "Neutral";
        }
    },

    addNews(h, b = "") { state.news.unshift({ date: state.date.toLocaleDateString('th-TH'), headline: h, body: b || "วิเคราะห์สถานการณ์วันนี้..." }); ui.renderNews(); },

    // Spreads a policy's impact on a faction over `days` instead of an instant jolt,
    // so the reaction is still building (and readable in the Factions tab) while it lasts.
    applyFactionImpact(factionName, value, source, days = 60) {
        const fac = state.factions.find(f => f.name === factionName);
        if (!fac) return;
        if (!fac.modifiers) fac.modifiers = [];
        fac.modifiers.push({ source, perDay: value / days, remaining: days });
    },

    // Same idea as applyFactionImpact, for a foreign power's relation score.
    applyForeignImpact(countryId, value, source, days = 60) {
        const c = state.foreign.find(x => x.id === countryId);
        if (!c) return;
        if (!c.modifiers) c.modifiers = [];
        c.modifiers.push({ source, perDay: value / days, remaining: days });
    },

    // Same idea again, for one of the 5 national stats a policy's worldImpact can move
    // (unemployment, crime, health, education, environment).
    applyWorldStatImpact(stat, value, source, days = 60) {
        if (!Data.WORLD_STAT_META[stat]) return;
        if (!state.world.statMods[stat]) state.world.statMods[stat] = [];
        state.world.statMods[stat].push({ source, perDay: value / days, remaining: days });
    },

    processMonthlyUpdate() {
        // Growth tracks how the economically-weighted population feels, not a plain random walk:
        // a faction with a bigger production base (basePop * wealth) swings growth more when its approval moves.
        const totalOutput = state.factions.reduce((s, f) => s + factionOutput(f), 0);
        const weightedApproval = state.factions.reduce((s, f) => s + (f.approval - 50) * factionOutput(f), 0) / totalOutput;
        // A healthier, better-educated, safer, cleaner, more employed country grows faster --
        // this is the other half of the policy web: worldImpact stats feed back into growth,
        // not just faction approval.
        const qualityOfLife = (state.world.health + state.world.education + (100 - state.world.crime) + state.world.environment) / 4 - state.world.unemployment;

        // Provincial production (Phase 5): how much the country's actual industries are putting
        // out right now versus the day the game started, driven by each province's industry type,
        // the national stats it's sensitive to, and any investment poured into it.
        const totalPop = state.provinces.reduce((s, p) => s + p.pop, 0);
        const totalProduction = state.provinces.reduce((s, prov) => s + provinceOutput(prov), 0);
        const productionPerCapita = totalProduction / totalPop;
        const productionBias = state.world.baseProductionPerCapita ? (productionPerCapita / state.world.baseProductionPerCapita - 1) * 8 : 0;

        const targetGrowth = weightedApproval * 0.16 + (qualityOfLife - 40) * 0.03 + productionBias;
        state.world.growth = state.world.growth + (targetGrowth - state.world.growth) * 0.3 + (Math.random() - 0.5) * 0.4;

        // Trade partners in good standing add a little extra tax revenue on top of domestic growth; souring ones bleed it away
        const totalTradeWeight = state.foreign.reduce((s, c) => s + c.tradeWeight, 0);
        const weightedRelation = state.foreign.reduce((s, c) => s + (c.relation - 50) * c.tradeWeight, 0) / totalTradeWeight;
        const tradeBonus = weightedRelation * 0.000015;

        const taxRevenue = state.world.nationalBudget * Math.max(0.0002, 0.0012 + state.world.growth * 0.0004 + tradeBonus);
        state.world.nationalBudget += taxRevenue;
        this.addNews("รายได้ภาษีประจำเดือน", `รัฐเก็บภาษีได้ ฿${(taxRevenue/1e9).toFixed(1)}B จากภาวะเศรษฐกิจที่เติบโต ${state.world.growth.toFixed(1)}% และการค้าระหว่างประเทศ`);

        // Population dynamics: each province's headcount drifts monthly instead of staying
        // frozen for the whole game. A slow baseline tracks national growth; the real driver
        // is investmentLevel -- a province built up over a term pulls in migrants, one left
        // neglected bleeds them, slowly enough that it only shows up over years of play.
        state.provinces.forEach(prov => {
            const investmentPull = ((prov.investmentLevel ?? 50) - 50) * 0.00003;
            const nationalBaseline = state.world.growth * 0.00015;
            prov.pop = Math.max(50000, Math.round(prov.pop * (1 + investmentPull + nationalBaseline)));
        });

        state.history.approval.push(state.world.approval); state.history.budget.push(state.world.nationalBudget);
        if(state.history.approval.length > 6) state.history.approval.shift(); if(state.history.budget.length > 6) state.history.budget.shift();
        const govSeats = state.parties.filter(p => p.status === "Government").reduce((s, p) => s + p.seats, 0);
        // A minister's prestige feeds cabinetStability alongside their base faction's approval:
        // a well-known appointee reassures the public, an unknown backbencher does not.
        let factionScore = 0; let prestigeScore = 0; let minCount = 0;
        Object.values(Data.MINISTRIES).forEach(m => { if(m.currentMinister) { const f = state.factions.find(fx => fx.name === m.currentMinister.status); if(f) factionScore += f.approval; prestigeScore += m.currentMinister.prestige ?? 50; minCount++; } });
        const cabinetPrestigeBonus = minCount > 0 ? (prestigeScore / minCount - 50) * 0.15 : 0;
        state.world.cabinetStability = Math.max(0, Math.floor((govSeats / Data.TOTAL_SEATS * 50) + (minCount > 0 ? (factionScore / minCount) * 0.5 : 25) + cabinetPrestigeBonus - (state.world.stabilityPenalty || 0)));
        state.world.approval = state.factions.reduce((acc, f) => acc + f.approval, 0) / state.factions.length;

        const positionIncome = { "นายกรัฐมนตรี": 20000000, "หัวหน้าพรรค": 12000000, "สส. เขต": 6000000 }[state.player.position] || 6000000;
        state.player.personalFunds += positionIncome;
        this.addNews("รายรับประจำเดือน", `ท่านได้รับเงินเดือนและผลตอบแทนตำแหน่ง ฿${(positionIncome/1e6).toFixed(0)}M`);

        // Trust slowly drifts back toward neutral each month, so grudges/goodwill fade but don't vanish instantly
        state.leaders.forEach(l => { l.trust = l.trust + (50 - l.trust) * 0.1; });
        state.parties.forEach(p => { p.trust = (p.trust ?? 70) + (70 - (p.trust ?? 70)) * 0.1; });
    },
    
    lobbyIndividual(mpId) {
        const mp = state.leaders.find(l => l.id === mpId);
        const trustMod = mp.trust >= 70 ? 0.8 : (mp.trust <= 30 ? 1.4 : 1);
        const cost = 2000000 * mp.trait.socio.costMod * trustMod; // Richer people cost more to lobby; a burned relationship costs more too
        if (state.player.personalFunds < cost) { alert(`เงินไม่พอ (ต้องการ ฿${(cost/1e6).toFixed(1)}M)`); return; }
        state.player.personalFunds -= cost;
        mp.loyalty = Math.min(100, mp.loyalty + 15);
        mp.trust = Math.min(100, mp.trust + 8);
        this.addNews(`ล็อบบี้สำเร็จ: ${mp.name}`, `ความสัมพันธ์ดีขึ้น (+15 Loyalty)`);
        
        // --- UI FEEDBACK ---
        ui.showFeedback('lobby', true, mp.name, () => {
            ui.updateMain();
            ui.showMPActionModal(mpId); 
        });
    },

    forceSwitchParty(mpId) {
        const mp = state.leaders.find(l => l.id === mpId);
        if (mp.switchCooldown > 0) {
            ui.showFeedback('switch', false, mp.name, null); // ยังจำการเสนอครั้งก่อนอยู่ ยังไม่คุยด้วย
            return;
        }
        const cost = 50000000 * mp.trait.ability.costMod * mp.trait.socio.costMod;

        if (state.player.personalFunds < cost) { alert(`เงินไม่พอ (ต้องการ ฿${(cost/1e6).toFixed(1)}M)`); return; }
        if (mp.conviction > 85) {
            mp.trust = Math.max(0, mp.trust - 20);
            mp.switchCooldown = 60;
            ui.showFeedback('switch', false, mp.name, null); // ยึดมั่นอุดมการณ์สูง ปฏิเสธทันที
            return;
        }

        state.player.personalFunds -= cost;
        mp.party.seats--;
        mp.party = state.player.party;
        mp.party.seats++;
        mp.loyalty = 50;
        mp.trust = 60;
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
        // A well-known MP demands a bigger payoff to keep quiet, and is harder to turn without
        // it leaking -- prestige makes the secret deal both costlier and riskier.
        const cost = 10000000 * mp.trait.ability.costMod * mp.trait.socio.costMod * (1 + mp.prestige / 150);

        if (mp.isCobra) { alert("เป็นงูเห่าอยู่แล้ว"); return; }
        if (state.player.personalFunds < cost) { alert(`เงินไม่พอ (ต้องการ ฿${(cost/1e6).toFixed(1)}M)`); return; }

        state.world.transparency = Math.max(0, state.world.transparency - 5);

        // Success Chance: depends on loyalty, trust burned by any past failed approach, and prestige
        const trustPenalty = Math.max(0, 50 - mp.trust) * 0.4;
        const successChance = 100 - (mp.loyalty * 0.8) - trustPenalty - mp.prestige * 0.25;
        const isSuccess = Math.random() * 100 <= successChance;

        if (!isSuccess) {
             state.player.personalFunds -= (cost / 5);
             mp.trust = Math.max(0, mp.trust - 15);
             // --- UI FEEDBACK (FAIL) ---
             ui.showFeedback('cobra', false, mp.name, () => ui.updateMain());
             return;
        }

        state.player.personalFunds -= cost;
        mp.isCobra = true; mp.loyalty = 0; mp.trust = Math.max(0, mp.trust - 10);
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
            state.world.stabilityPenalty = Math.min(50, (state.world.stabilityPenalty || 0) + 15);
            state.world.cabinetStability = Math.max(0, state.world.cabinetStability - 15);
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

    diplomaticVisit(countryId) {
        const c = state.foreign.find(x => x.id === countryId);
        const cost = 20000000;
        if (state.player.personalFunds < cost) { alert(`เงินไม่พอ (ต้องการ ฿${(cost/1e6).toFixed(1)}M)`); return; }
        state.player.personalFunds -= cost;
        c.relation = Math.min(100, c.relation + 12);
        this.addNews(`เยือน${c.name}อย่างเป็นทางการ`, `ความสัมพันธ์ทางการทูตกับ${c.name}ดีขึ้น`);
        ui.updateMain(); ui.renderForeignList();
    },

    tradeDeal(countryId) {
        const c = state.foreign.find(x => x.id === countryId);
        const cost = 1.5e10;
        if (c.relation < 40) { alert("ความสัมพันธ์ยังไม่ดีพอสำหรับข้อตกลงการค้า (ต้องการ Relation 40%+)"); return; }
        if (state.world.nationalBudget < cost) { alert(`งบประเทศไม่พอ (ต้องการ ฿${(cost/1e9).toFixed(1)}B)`); return; }
        state.world.nationalBudget -= cost;
        this.applyForeignImpact(countryId, 15, "ข้อตกลงการค้า", 90);
        state.world.growth += 0.3;
        const industryLabel = Data.INDUSTRY_TYPES[c.keyIndustry]?.label || c.keyIndustry;
        this.addNews(`ลงนามข้อตกลงการค้ากับ${c.name}`, `กระตุ้นเศรษฐกิจและความสัมพันธ์ระหว่างประเทศ จังหวัดที่ทำ${industryLabel}ได้อานิสงส์มากที่สุด`);
        ui.updateMain(); ui.renderForeignList();
    },

    triggerDiplomaticIncident(c) {
        state.world.growth = Math.max(-10, state.world.growth - 1);
        c.relation = Math.max(0, c.relation - 5);
        const industryLabel = Data.INDUSTRY_TYPES[c.keyIndustry]?.label || c.keyIndustry;
        this.addNews(`${c.name}กดดันทางการค้า`, `ความสัมพันธ์กับ${c.name}ทรุดหนักจนกระทบการค้าระหว่างประเทศ จังหวัดที่ทำ${industryLabel}จะได้รับผลกระทบหนักสุด`);
        ui.updateMain(); ui.renderForeignList();
    },

    investProvince(name) {
        const prov = state.provinces.find(p => p.name === name);
        const cost = 2e9;
        if (state.world.nationalBudget < cost) { alert(`งบประเทศไม่พอ (ต้องการ ฿${(cost/1e9).toFixed(1)}B)`); return; }
        state.world.nationalBudget -= cost;
        if (!prov.modifiers) prov.modifiers = [];
        prov.modifiers.push({ source: "ลงทุนพัฒนาอุตสาหกรรม", perDay: 30 / 60, remaining: 60 });
        this.addNews(`ลงทุนพัฒนา${prov.name}`, `รัฐบาลอัดฉีดงบพัฒนาอุตสาหกรรม${Data.INDUSTRY_TYPES[prov.industry]?.label || ''}ในพื้นที่`);
        ui.updateMain(); ui.showProvinceDetail(prov.name);
    },

    runElection() {
        gameClock.setSpeed(0); ui.resetModalState();

        // Count constituency by constituency, province by province, instead of allocating
        // seats from national popularity alone: each province's baseFaction rewards whichever
        // party's platform matches its affinity ideology, so results vary by province and the
        // map becomes readable evidence, not just a national number.
        const seatsWon = {};
        state.parties.forEach(p => { seatsWon[p.id] = 0; });
        const prevSeats = {};
        state.parties.forEach(p => { prevSeats[p.id] = p.seats; });

        state.provinces.forEach(prov => {
            const affinity = Data.FACTION_IDEOLOGY_AFFINITY[prov.baseFaction];
            // investProvince() spends national budget to push investmentLevel above its 50
            // baseline; a neglected province (left to drift below 50) punishes the incumbent
            // the same way. Scaled to match the affinity bonus (+/-25 at the extremes) so
            // pork-barrel spending is a real electoral lever, not just an economic one.
            const investmentSwing = ((prov.investmentLevel ?? 50) - 50) * 0.5;
            const weights = state.parties.map(p => {
                const bonus = affinity && p.ideologies.includes(affinity) ? 25 : 0;
                const govBonus = p.status === "Government" ? investmentSwing : 0;
                return { party: p, weight: Math.max(1, p.popularity + bonus + govBonus + (Math.random() * 10 - 5)) };
            });
            const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
            const provinceResult = {};
            for (let i = 0; i < prov.seats; i++) {
                let r = Math.random() * totalWeight;
                let winner = weights[weights.length - 1];
                for (const w of weights) { r -= w.weight; if (r <= 0) { winner = w; break; } }
                seatsWon[winner.party.id]++;
                provinceResult[winner.party.id] = (provinceResult[winner.party.id] || 0) + 1;
            }
            prov.lastResult = provinceResult;
        });

        const results = state.parties.map(p => ({ party: p, seats: seatsWon[p.id], prevSeats: prevSeats[p.id], prevStatus: p.status }));
        results.forEach(r => { r.party.seats = r.seats; });

        this.assignGovernmentStatus(state.parties);
        Object.values(Data.MINISTRIES).forEach(m => { m.currentMinister = null; }); // new term, new cabinet to appoint
        state.activePolicies = [];
        state.voteModifier = null; state.lastVoteResults = null; state.lastVoteLog = [];
        this.generateLeaders();

        const won = state.player.party.status === "Government";
        state.world.electionDay = new Date(state.date);
        state.world.electionDay.setDate(state.world.electionDay.getDate() + Data.ELECTION_TERM_DAYS);

        const rows = results.sort((a, b) => b.seats - a.seats).map(r => `
            <div class="flex justify-between items-center text-xs border-b border-stone-200 py-1.5">
                <span class="flex items-center gap-2 font-bold"><span class="inline-block w-2 h-2 rounded-full border border-black" style="background:${r.party.color}"></span>${r.party.name}${r.party.id === state.player.party.id ? ' <span class="text-[9px] text-stone-500">(พรรคท่าน)</span>' : ''}</span>
                <span class="font-mono">${r.prevSeats} → <span class="font-bold">${r.seats}</span> <span class="text-[9px] uppercase text-stone-500">${r.party.status}</span></span>
            </div>
        `).join('');

        document.getElementById('event-title').innerText = "ผลการเลือกตั้งทั่วไป";
        document.getElementById('event-desc').innerHTML = `
            <div class="text-center mb-4">
                <div class="text-2xl font-black uppercase tracking-widest ${won ? 'text-emerald-700' : 'text-red-700'}">${won ? 'พรรคท่านจัดตั้งรัฐบาลต่อ' : 'พรรคท่านหลุดจากอำนาจ'}</div>
            </div>
            <div class="text-left max-h-[320px] overflow-y-auto scroll-custom">${rows}</div>
        `;
        document.getElementById('event-options').innerHTML = won
            ? `<button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="w-full p-4 bg-black text-white font-bold border-2 border-black text-lg hover:opacity-90">เริ่มสมัยประชุมใหม่</button>`
            : `<button onclick="location.reload()" class="w-full p-4 bg-red-700 text-white font-bold border-2 border-black text-lg hover:opacity-90">จบเกม</button>`;
        document.getElementById('event-modal').classList.remove('hidden');
        ui.renderCabinet(); ui.renderMinistryList(); ui.renderParliament(); ui.renderProvinceMap();
        this.addNews("ผลการเลือกตั้งทั่วไปประกาศแล้ว", won ? "พรรคท่านยังคงจัดตั้งรัฐบาลได้ต่อไป" : "พรรคท่านไม่สามารถจัดตั้งรัฐบาลได้ในสมัยนี้");
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
        const ousted = yes > Data.MAJORITY_SEATS;
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
            party.trust = Math.min(100, (party.trust ?? 70) + 10);
            this.addNews(`ดีลการเมือง: ${demand.name}`, `รัฐบาลอนุมัตินโยบายแลกเสียง`);
            state.voteModifier = { partyId: partyId, type: 'support' };
        } else {
            party.trust = Math.max(0, (party.trust ?? 70) - 20);
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
            const personalMatch = mp.trait.ideology === p.ideology;
            const personalConflict = ideologiesConflict(mp.trait.ideology, p.ideology);
            if (personalMatch) score += 20;
            if (personalConflict) score -= 25;
            if (mp.party.status === "Government" && mp.party.id !== state.player.party.id) {
                score += ((mp.party.trust ?? 70) - 70) * 0.6;
            }
            score += (p.coalitionBoost || 0);
            if (state.voteModifier && mp.party.id === state.voteModifier.partyId) {
                if (state.voteModifier.type === 'support') score += 100; if (state.voteModifier.type === 'rebel') score -= 100;
            }
            let voteAgainstParty = (mp.loyalty < 30 && Math.random() < 0.4) || mp.isCobra || (personalConflict && Math.random() < 0.25);
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
                Object.entries(p.impact).forEach(([fn, v]) => this.applyFactionImpact(fn, v, p.name));
                if (p.worldImpact) Object.entries(p.worldImpact).forEach(([stat, v]) => this.applyWorldStatImpact(stat, v, p.name));
                state.foreign.forEach(c => {
                    if (c.ideology === p.ideology) this.applyForeignImpact(c.id, 8, p.name, 60);
                    else if (ideologiesConflict(c.ideology, p.ideology)) this.applyForeignImpact(c.id, -8, p.name, 60);
                });
                this.addNews(`${p.name} บังคับใช้เป็นกฎหมาย`);
                state.activePolicies = state.activePolicies.filter(x => x.name !== pName);
            }
        } else { state.activePolicies = state.activePolicies.filter(x => x.name !== pName); }
        document.getElementById('event-modal').classList.add('hidden'); 
        state.lastVoteResults = null; ui.renderParliament(); 
        ui.updateMain(); gameClock.setSpeed(1);
    }
};
