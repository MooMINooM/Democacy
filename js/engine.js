import { state } from './state.js';
import * as Data from './data.js';
import { ui } from './ui.js';

// Long Campaign (Phase 7): government-only gate for the discretionary, treasury/cabinet-spending
// actions (investProvince, investMilitary, tradeDeal, appointMinister) -- these represent the
// executive actually running the state, which only means anything while the player's party
// holds government. Parliamentary actions that execute regardless of who proposed them
// (finalizeVote's own budget spend, processQuidProQuo) are not gated here: those represent
// whichever coalition currently governs carrying out a bill that already passed, not the player
// personally reaching into the treasury.
// AI Cabinet (Phase 7 follow-up): appointMinister() is now player-only and gated to Government
// status (requireGovernment below), which left every ministry vacant for as long as the player
// stayed in opposition -- whichever coalition actually holds government still needs a working
// cabinet. Reuses the ministry<->goal link POLICY_TEMPLATES already encodes (the same field
// getImplementationEffectiveness() reads for minister fit) instead of adding a new mapping, and
// scores candidates on the same ambition/prestige traits the player already weighs in
// showAppointModal. Only ever runs when the player's own party isn't the one appointing --
// see the two call sites in runElection()/runNoConfidenceVote().
function autoAppointCabinet() {
    const govParties = new Set(state.parties.filter(p => p.status === "Government").map(p => p.id));
    const pool = state.leaders.filter(l => govParties.has(l.party.id));
    const taken = new Set();
    const appointed = [];
    Object.entries(Data.MINISTRIES).forEach(([mName, ministry]) => {
        const primaryGoal = Data.POLICY_TEMPLATES.find(t => t.ministry === mName)?.goal;
        const candidates = pool.filter(l => !taken.has(l.id));
        if (candidates.length === 0) return;
        const scored = candidates.map(l => ({
            l, score: (l.trait.goal === primaryGoal ? 40 : 0) + (l.ambition ?? 50) * 0.3 + (l.prestige ?? 50) * 0.3
        })).sort((a, b) => b.score - a.score);
        const pick = scored[0].l;
        ministry.currentMinister = pick;
        taken.add(pick.id);
        const boost = 10 + (pick.ambition ?? 50) * 0.3;
        pick.loyalty = Math.min(100, pick.loyalty + boost);
        pick.trust = Math.min(100, pick.trust + boost * 0.5);
        appointed.push(pick.party.name);
    });
    return appointed;
}

function requireGovernment(actionLabel) {
    if (state.player.party.status !== "Government") {
        alert(`เฉพาะพรรครัฐบาลเท่านั้นที่${actionLabel}ได้ ตอนนี้พรรคท่านเป็น${state.player.party.status === "Opposition" ? "ฝ่ายค้าน" : "กลาง"} ลองสร้างฐานเสียงผ่านการลงพื้นที่หาเสียงแทน`);
        return false;
    }
    return true;
}

function ideologiesConflict(a, b) {
    if (!a || !b) return false;
    const fromA = Data.IDEOLOGY_CONFLICTS[a] || [];
    const fromB = Data.IDEOLOGY_CONFLICTS[b] || [];
    return fromA.includes(b) || fromB.includes(a);
}

// A faction's rough weight in the national economy: how many people, how well-off they are.
function factionOutput(f) { return f.basePop * f.wealth; }

// Dynamic Society (Phase 6): fixed reference points computed once from the static faction data,
// not from a live province population that can be 10x the size these game-balance blocs were
// ever calibrated on -- see processMonthlyUpdate's class-transition step for why this matters.
const CLASS_FACTION_POOL_TOTAL = Data.FACTION_DATA
    .filter(f => Object.values(Data.FACTION_INDUSTRY_LINK).some(shares => shares[f.name] !== undefined))
    .reduce((s, f) => s + f.basePop, 0);
const UNEMPLOYED_BASELINE_POP = Data.FACTION_DATA.find(f => f.name === "คนว่างงาน")?.basePop || 0;

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
    // Logistics/export has no single keyIndustry partner -- it's the one industry whose whole
    // business is trade in general, so it leans on the same tradeWeight-weighted average
    // relation processMonthlyUpdate() uses for the national trade bonus, not one country.
    const partner = state.foreign.find(c => c.keyIndustry === prov.industry);
    if (partner) {
        multiplier += ((partner.relation - 50) / 50) * 0.25;
    } else if (prov.industry === "โลจิสติกส์และการส่งออก") {
        const totalTradeWeight = state.foreign.reduce((s, c) => s + c.tradeWeight, 0);
        const weightedRelation = state.foreign.reduce((s, c) => s + (c.relation - 50) * c.tradeWeight, 0) / totalTradeWeight;
        multiplier += (weightedRelation / 50) * 0.3;
    }
    return prov.pop * industry.baseOutput * Math.max(0.3, multiplier);
}

// Dynamic Context Engine (Phase 1): a pure read-only classification layer over stats that
// already exist, not new stored state. Actions and UI read these labels instead of raw numbers
// so the same action can be told apart by the situation it happened in -- Same Action, Same
// Numbers, Different Context, Different Result.
function getNationalContext() {
    const economicCycle = state.world.growth > 4 ? "Boom" : state.world.growth > 0.5 ? "Expansion" : state.world.growth > -2 ? "Slowdown" : "Recession";
    const politicalClimate = getPoliticalClimate();
    // Stage A fix: a flat/zero trend (always true right at game start, even with a seeded
    // multi-entry history, since every seeded entry is identical) used to read as "Tight" because
    // 0 is less than any positive 1%-of-budget threshold -- a brand new game with a perfectly
    // healthy 3.4T budget opened by claiming the treasury was already strained. "No real budget
    // movement yet" is now its own case instead of falling through into the worst-sounding band.
    const budgetHistory = state.history.budget;
    const hasBudgetTrend = budgetHistory.length >= 2 && budgetHistory.some(v => v !== budgetHistory[0]);
    const budgetTrend = hasBudgetTrend ? budgetHistory[budgetHistory.length - 1] - budgetHistory[0] : 0;
    const fiscalCondition = !hasBudgetTrend ? "Normal" : budgetTrend < 0 ? "Debt Stress" : budgetTrend < state.world.nationalBudget * 0.01 ? "Tight" : budgetTrend < state.world.nationalBudget * 0.05 ? "Normal" : "Surplus";
    return { economicCycle, politicalClimate, fiscalCondition };
}
// Political Climate v2 (Stage A): the old rule called anything with 35-50% approval "Polarized",
// which meant a perfectly ordinary fresh game (approval starts at ~50) opened already reading as
// divided before the player had done anything. Faction disagreement (how far the most and least
// approving factions are from each other) and protest pressure are the real polarization signals;
// approval and election proximity now only push a state that's already tense over the edge, the
// same reasoning the roadmap gives for why a calm 50%-approval start should read as Competitive.
function getPoliticalClimateSignals() {
    const factionApprovals = state.factions.map(f => f.approval);
    const factionSpread = Math.max(...factionApprovals) - Math.min(...factionApprovals);
    const daysToElection = state.world.electionDay ? Math.round((state.world.electionDay - state.date) / 86400000) : 9999;
    return { factionSpread, daysToElection, nearElection: daysToElection <= 90 };
}
function getPoliticalClimate() {
    const { factionSpread, nearElection } = getPoliticalClimateSignals();
    if (state.world.cabinetStability < 35 || state.world.protestPressure > 70) return "Crisis";
    if (factionSpread > 45 || (state.world.protestPressure > 55 && factionSpread > 30)) return "Polarized";
    if (nearElection || state.world.protestPressure > 35 || factionSpread > 30 || state.world.approval < 40) return "Tense";
    if (factionSpread > 15 || state.world.protestPressure > 15 || state.world.approval < 55) return "Competitive";
    return "Calm";
}
// Explainability: same +/- format as every other why-button, positive meaning calmer.
function getPoliticalClimateBreakdown() {
    const { factionSpread, daysToElection, nearElection } = getPoliticalClimateSignals();
    return {
        "ความมั่นคงคณะรัฐมนตรี": state.world.cabinetStability - 50,
        "ความแตกแยกระหว่างกลุ่มผลประโยชน์": -(factionSpread - 20),
        "แรงกดดันประท้วงสะสม": -(state.world.protestPressure - 20),
        "ความนิยมรัฐบาล": state.world.approval - 50,
        "ใกล้วันเลือกตั้ง": nearElection ? -(90 - Math.min(90, daysToElection)) * 0.5 : 0
    };
}
function getProvinceContext(prov) {
    const inv = prov.investmentLevel ?? 50;
    const growthStage = inv >= 85 ? "Saturated" : inv >= 55 ? "Growing" : inv >= 30 ? "Emerging" : "Declining";
    const laborCondition = state.world.unemployment < 15 ? "Shortage" : state.world.unemployment < 25 ? "Balanced" : "Surplus";
    return { growthStage, laborCondition };
}
// Province Political Layer (Stage B3): the exact same deterministic terms
// runProvinceElection()'s weight formula uses (affinity bonus, investment swing, campaign
// boost), minus its per-seat random jitter -- a smooth "if the election were today" reading
// instead of a one-shot lottery draw, since this is meant to inform planning, not decide a result.
function getProvinceVoteShare(prov) {
    const affinity = Data.FACTION_IDEOLOGY_AFFINITY[prov.baseFaction];
    const investmentSwing = ((prov.investmentLevel ?? 50) - 50) * 0.5;
    const weights = state.parties.map(p => {
        const bonus = affinity && p.ideologies.includes(affinity) ? 25 : 0;
        const govBonus = p.status === "Government" ? investmentSwing : 0;
        const campaignBonus = p.id === state.player.party.id ? (prov.playerCampaignBoost || 0) : 0;
        return { party: p, weight: Math.max(1, p.popularity + bonus + govBonus + campaignBonus) };
    });
    const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
    return weights.map(w => ({ party: w.party, share: (w.weight / totalWeight) * 100 })).sort((a, b) => b.share - a.share);
}
// Province Political Layer (Stage B3): a province is a source of decisions, not just a place to
// click invest -- government/opposition support (from the vote-share preview above),
// competitiveness, which national pressure this province's own industry actually feels worst
// (reusing INDUSTRY_TYPES.sensitivity, not a new per-province stat), and whether it's currently
// gaining or losing people (the same regional-deviation term the monthly migration drift itself
// already computes, Phase 6).
function getProvincePoliticalLayer(prov) {
    const shares = getProvinceVoteShare(prov);
    const govSupport = shares.filter(s => s.party.status === "Government").reduce((s, x) => s + x.share, 0);
    const oppSupport = shares.filter(s => s.party.status === "Opposition").reduce((s, x) => s + x.share, 0);
    const margin = Math.abs(govSupport - oppSupport);
    const competitiveness = margin < 10 ? "Battleground" : margin < 25 ? "Leaning" : "Safe";
    const leaning = govSupport > oppSupport ? "Government" : oppSupport > govSupport ? "Opposition" : "Neutral";

    const industry = Data.INDUSTRY_TYPES[prov.industry];
    let localIssue = null;
    if (industry?.sensitivity) {
        const strains = Object.entries(industry.sensitivity).map(([stat, weight]) => {
            const meta = Data.WORLD_STAT_META[stat];
            const value = state.world[stat] ?? meta?.baseline ?? 50;
            // weight>0 means this industry wants the stat HIGH (bad = value below baseline);
            // weight<0 means it wants the stat LOW (bad = value above baseline) -- same sign
            // convention provinceOutput() itself reads these weights with.
            const strain = weight > 0 ? (meta.baseline - value) * weight : (value - meta.baseline) * -weight;
            return { stat, label: meta?.label || stat, strain };
        }).sort((a, b) => b.strain - a.strain);
        if (strains[0]?.strain > 3) localIssue = strains[0].label;
    }

    const regionProvs = state.provinces.filter(p => p.region === prov.region);
    const regionAvgInvestment = regionProvs.reduce((s, p) => s + (p.investmentLevel ?? 50), 0) / regionProvs.length;
    const investDeviation = (prov.investmentLevel ?? 50) - regionAvgInvestment;
    const populationTrend = investDeviation > 5 ? "Growing" : investDeviation < -5 ? "Shrinking" : "Stable";

    return { govSupport, oppSupport, competitiveness, leaning, localIssue, populationTrend, shares };
}
// Seat Security (Stage B2): now that every MP carries a real province (Stage B1), this reads
// that constituency directly -- its own base faction's approval, and whether it's actually
// under- or well-invested -- instead of leaning on mp.status (the MP's personal faction
// alignment, not their electorate's) as a stand-in for the whole area.
function getMPElectoralRisk(mp) {
    const daysToElection = state.world.electionDay ? Math.round((state.world.electionDay - state.date) / 86400000) : 9999;
    if (daysToElection > 180) return "Safe";
    const prov = state.provinces.find(p => p.name === mp.province);
    if (!prov) {
        // Fallback for an MP with no province on record -- shouldn't happen after Stage B1, but
        // the old faction-approval-only read stays as a safety net rather than crashing.
        const statusApproval = state.factions.find(f => f.name === mp.status)?.approval ?? 50;
        return statusApproval < 40 ? "AtRisk" : statusApproval < 55 ? "Competitive" : "Safe";
    }
    const baseApproval = state.factions.find(f => f.name === prov.baseFaction)?.approval ?? 50;
    // A neglected home province hurts a government MP specifically -- the same asymmetry
    // runProvinceElection()'s govBonus term already scores at election time (investment only
    // swings the vote for whoever's in government); an opposition MP isn't defending a spending
    // record there, so their risk reads off local sentiment alone.
    const investmentRisk = mp.party.status === "Government" ? (50 - (prov.investmentLevel ?? 50)) : 0;
    const score = baseApproval - investmentRisk * 0.6;
    return score < 40 ? "AtRisk" : score < 55 ? "Competitive" : "Safe";
}

// Explainability (Phase 2): the same breakdown the formula itself used, handed back out so the
// UI can show "why" instead of just the resulting number. Pressure and approval are cheap to
// recompute on demand; growth and cabinetStability are snapshotted once a month instead (see
// processMonthlyUpdate) since blending them from scratch here would drift from the real value.
function getPressureBreakdown() {
    return {
        "การว่างงานสูงกว่าปกติ": Math.max(0, (state.world.unemployment - 15) * 1.5),
        "อาชญากรรมสูงกว่าปกติ": Math.max(0, (state.world.crime - 30) * 1.0),
        "ความนิยมรัฐบาลต่ำ": Math.max(0, (50 - state.world.approval) * 1.2),
        "ความโปร่งใสต่ำ": Math.max(0, (100 - state.world.transparency) * 0.3)
    };
}
function getApprovalBreakdown() {
    const rows = {};
    [...state.factions].sort((a, b) => Math.abs(b.approval - 50) - Math.abs(a.approval - 50)).slice(0, 5)
        .forEach(f => { rows[f.name] = f.approval - 50; });
    return rows;
}
function getGrowthBreakdown() { return state.world.growthBreakdown || {}; }
function getCabinetStabilityBreakdown() { return state.world.cabinetStabilityBreakdown || {}; }

// Initial World Consistency (Stage A): the exact math processMonthlyUpdate() already runs every
// month, pulled out so engine.init() can compute a real day-one value instead of a hardcoded
// placeholder the first monthly update would silently overwrite anyway -- confirmed by
// playtesting that cabinetStability used to open at a flat 80 and visibly crash to ~43 within two
// weeks once the real formula first ran, reading as an unexplained instant crisis.
function computeCabinetStability() {
    const govSeats = state.parties.filter(p => p.status === "Government").reduce((s, p) => s + p.seats, 0);
    let factionScore = 0, prestigeScore = 0, minCount = 0;
    Object.values(Data.MINISTRIES).forEach(m => { if (m.currentMinister) { const f = state.factions.find(fx => fx.name === m.currentMinister.status); if (f) factionScore += f.approval; prestigeScore += m.currentMinister.prestige ?? 50; minCount++; } });
    const cabinetPrestigeBonus = minCount > 0 ? (prestigeScore / minCount - 50) * 0.15 : 0;
    const breakdown = {
        "เสียงข้างมากในสภา": govSeats / Data.TOTAL_SEATS * 50,
        "ความพอใจกลุ่มที่มีรัฐมนตรี": minCount > 0 ? (factionScore / minCount) * 0.5 : 25,
        "ชื่อเสียงคณะรัฐมนตรี": cabinetPrestigeBonus,
        "แรงกดดันจากวิกฤต/เรื่องอื้อฉาว": -(state.world.stabilityPenalty || 0)
    };
    const value = Math.max(0, Math.floor(Object.values(breakdown).reduce((s, v) => s + v, 0)));
    return { value, breakdown };
}
// currentGrowth === null means "no prior value to ease in from" (game just started) -- the
// result becomes the target outright instead of blending toward it, since there's nothing to
// blend from yet.
function computeGrowth(currentGrowth) {
    const totalOutput = state.factions.reduce((s, f) => s + factionOutput(f), 0);
    const weightedApproval = state.factions.reduce((s, f) => s + (f.approval - 50) * factionOutput(f), 0) / totalOutput;
    const qualityOfLife = (state.world.health + state.world.education + (100 - state.world.crime) + state.world.environment) / 4 - state.world.unemployment;
    const totalPop = state.provinces.reduce((s, p) => s + p.pop, 0);
    const totalProduction = state.provinces.reduce((s, prov) => s + provinceOutput(prov), 0);
    const productionPerCapita = totalProduction / totalPop;
    const productionBias = state.world.baseProductionPerCapita ? (productionPerCapita / state.world.baseProductionPerCapita - 1) * 8 : 0;
    const breakdown = {
        "แรงหนุนจากกลุ่มผลประโยชน์": weightedApproval * 0.16,
        "คุณภาพชีวิตประชาชน": (qualityOfLife - 40) * 0.03,
        "ผลผลิตอุตสาหกรรมเทียบฐาน": productionBias,
        "ผลกระทบวิกฤตเศรษฐกิจล่าสุด": -(state.world.growthPenalty || 0)
    };
    const targetGrowth = Object.values(breakdown).reduce((s, v) => s + v, 0);
    const value = currentGrowth === null ? targetGrowth : currentGrowth + (targetGrowth - currentGrowth) * 0.3 + (Math.random() - 0.5) * 0.4;
    return { value, breakdown, productionBias };
}

// MP <-> Province (Stage B1): constituency by constituency, province by province, instead of
// allocating seats from national popularity alone -- each province's baseFaction rewards
// whichever party's platform matches its affinity ideology, so results vary by province and the
// map becomes readable evidence, not just a national number. Shared by runElection() (a real
// vote) and engine.init()'s allocateProvinceSeats() (the day-one seat map), so the two can't
// compute different answers to "who represents this province" -- also the source generateLeaders()
// reads to seat each MP in an actual constituency, not just tally a party headcount.
function runProvinceElection() {
    const seatsWon = {};
    state.parties.forEach(p => { seatsWon[p.id] = 0; });
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
            // Long Campaign (Phase 7): a term's worth of campaignProvince() visits pays off
            // here, the same way pork-barrel investment does for whoever's in government --
            // the one electoral lever available to the player regardless of party status.
            const campaignBonus = p.id === state.player.party.id ? (prov.playerCampaignBoost || 0) : 0;
            return { party: p, weight: Math.max(1, p.popularity + bonus + govBonus + campaignBonus + (Math.random() * 10 - 5)) };
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
    return seatsWon;
}

// State Capacity (Phase 4): "Policy Passed" and "Policy Effective" are different things -- a
// bill clearing parliament doesn't mean the state can deliver it in full. One pure function so
// both the pre-vote preview (ui.showStakeholderReview) and the actual finalizeVote() outcome
// use the exact same math, not two formulas that can drift apart.
// Implemented Effect = Legal Effect x Ministry Capacity x Minister Fit x Budget Coverage.
function getImplementationEffectiveness(p) {
    const ministry = Data.MINISTRIES[p.ministry];
    const workload = ministry?.workload || 0;
    const capacityMultiplier = Math.max(0.3, 1 - workload / 150);

    const minister = ministry?.currentMinister;
    let fitMultiplier, fitLabel;
    if (!minister) { fitMultiplier = 0.5; fitLabel = "ไม่มีรัฐมนตรีดูแลกระทรวงนี้"; }
    else if (minister.trait.goal === p.goal) { fitMultiplier = 1.15; fitLabel = `${minister.name}สนใจประเด็นนี้เป็นพิเศษ`; }
    else if (ideologiesConflict(minister.trait.ideology, p.ideology)) { fitMultiplier = 0.7; fitLabel = `${minister.name}ไม่เห็นด้วยกับแนวทางนี้`; }
    else { fitMultiplier = 1.0; fitLabel = `${minister.name}ดูแลตามปกติ`; }

    // Budget Coverage reads the same fiscalCondition tag Phase 1/2 already computes -- a policy
    // costing a few billion barely dents a multi-trillion treasury on paper, but a government
    // already in a tight or over-stretched fiscal position can't actually staff and fund it in full.
    const fiscal = getNationalContext().fiscalCondition;
    const budgetMultiplier = fiscal === "Debt Stress" ? 0.5 : fiscal === "Tight" ? 0.75 : 1;

    const effectiveness = Math.max(0.2, capacityMultiplier * fitMultiplier * budgetMultiplier);
    return { effectiveness, capacityMultiplier, fitMultiplier, fitLabel, budgetMultiplier, workload };
}

// Economy v2 (Phase 5): what share of the country's actual current output rides on trade versus
// domestic factors. Every industry has *some* trade term since PR #13/#17, so a binary
// has-a-partner check would always read 100% and say nothing -- instead this weighs each
// province's trade coefficient (0.25 for a direct keyIndustry partner, 0.3 for logistics'
// average-relation link) against that industry's own INDUSTRY_TYPES.sensitivity weights, the
// same numbers provinceOutput() already uses, so it genuinely varies with the industry mix.
function getTradeExposure() {
    let weightedExposure = 0, totalOutput = 0;
    state.provinces.forEach(prov => {
        const output = provinceOutput(prov);
        totalOutput += output;
        const industry = Data.INDUSTRY_TYPES[prov.industry];
        if (!industry) return;
        const domesticWeight = Object.values(industry.sensitivity || {}).reduce((s, w) => s + Math.abs(w), 0);
        const hasPartner = state.foreign.some(c => c.keyIndustry === prov.industry);
        const tradeWeight = hasPartner ? 0.25 : (prov.industry === "โลจิสติกส์และการส่งออก" ? 0.3 : 0);
        const exposureShare = (tradeWeight + domesticWeight) > 0 ? tradeWeight / (tradeWeight + domesticWeight) : 0;
        weightedExposure += output * exposureShare;
    });
    return totalOutput > 0 ? weightedExposure / totalOutput : 0;
}
// Which industries are over- or under-performing the national per-capita baseline right now,
// in the same +/- format as growthBreakdown -- drills into growthBreakdown's single
// "ผลผลิตอุตสาหกรรมเทียบฐาน" line to show which specific industries are driving it.
function getProductionBreakdown() {
    const rows = {};
    Object.entries(Data.INDUSTRY_TYPES).forEach(([ind, meta]) => {
        const provs = state.provinces.filter(p => p.industry === ind);
        if (provs.length === 0) return;
        const output = provs.reduce((s, p) => s + provinceOutput(p), 0);
        const pop = provs.reduce((s, p) => s + p.pop, 0);
        const perCapita = output / pop;
        rows[meta.label] = state.world.baseProductionPerCapita ? (perCapita / state.world.baseProductionPerCapita - 1) * 10 : 0;
    });
    return rows;
}

// Dynamic Society (Phase 6): a third lens on the country besides "growing" and "stable" --
// whether it's still agrarian or has shifted into industry/services, read straight off the same
// per-province industry mix investProvince() changes, not a new stat. Paired with which class
// faction is actually gaining or losing population this term (see processMonthlyUpdate's
// class-transition drift), so a player can watch their industrial policy reshape society, not
// just the GDP number.
function getSocietyContext() {
    const totalPop = state.provinces.reduce((s, p) => s + p.pop, 0);
    const agrarianPop = state.provinces.filter(p => p.industry === "เกษตรกรรม" || p.industry === "ประมง").reduce((s, p) => s + p.pop, 0);
    const agrarianShare = totalPop > 0 ? agrarianPop / totalPop : 0;
    const societyType = agrarianShare > 0.6 ? "Agrarian" : agrarianShare > 0.35 ? "Transitioning" : "Industrial";

    const tracked = state.factions.filter(f => f.popHistory && f.popHistory.length >= 2);
    let growingClass = null, shrinkingClass = null;
    if (tracked.length > 0) {
        const ranked = [...tracked].sort((a, b) => (b.basePop - b.popHistory[0]) - (a.basePop - a.popHistory[0]));
        if (ranked[0].basePop - ranked[0].popHistory[0] > 0) growingClass = ranked[0].name;
        const last = ranked[ranked.length - 1];
        if (last.basePop - last.popHistory[0] < 0) shrinkingClass = last.name;
    }
    return { societyType, agrarianShare, growingClass, shrinkingClass };
}
// Which class factions currently hold how much of the population tied to production (the same
// FACTION_INDUSTRY_LINK shares processMonthlyUpdate() drifts basePop toward), in the same +/-
// vs-starting-point format the other why-buttons use.
function getClassCompositionBreakdown() {
    const rows = {};
    state.factions.forEach(f => {
        if (!f.popHistory || f.popHistory.length === 0) return;
        rows[f.name] = ((f.basePop - f.popHistory[0]) / f.popHistory[0]) * 100;
    });
    return rows;
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
        Object.values(Data.MINISTRIES).forEach(m => { if(m.cooldown > 0) m.cooldown -= state.speed; m.workload = Math.max(0, (m.workload || 0) - 1.2 * state.speed); });
        // Time Control (Stage A): a policy reaching a vote is a decision point same as an
        // election or crisis -- the player used to have to notice the badge on the policy list
        // themselves while time kept running past it. Only fires once per stage (isDeliberating
        // flips false right here, so this block won't run again for the same stage next tick).
        state.activePolicies.forEach(p => { if(p.isDeliberating) { p.remainingDays -= state.speed; if(p.remainingDays <= 0) { p.remainingDays = 0; p.isDeliberating = false; this.setSpeed(0); engine.addNews(`${p.name}พร้อมลงมติ`, `ร่างนโยบายผ่านการพิจารณาวาระที่ ${p.stage}/3 แล้ว รอท่านเรียกลงมติ`); } } });
        state.world.stabilityPenalty = Math.max(0, (state.world.stabilityPenalty || 0) - 0.5 * state.speed);
        state.world.growthPenalty = Math.max(0, (state.world.growthPenalty || 0) - 0.15 * state.speed);
        state.leaders.forEach(l => {
            if (l.switchCooldown > 0) l.switchCooldown -= state.speed;
            // Saturation (Phase 1): contacting the same MP too often fades in value over ~3-4
            // weeks, same rhythm as the decaying modifiers everywhere else in the game.
            l.lobbySaturation = Math.max(0, (l.lobbySaturation || 0) - 1.2 * state.speed);
        });

        // Protest Pressure (Phase 1): a visible, structural buildup -- unemployment, crime, low
        // approval and low transparency all feed it -- instead of a blind dice roll, so the
        // player can see unrest coming before it erupts (randomness then only decides *when*).
        const targetPressure = Math.max(0, Math.min(100,
            (state.world.unemployment - 15) * 1.5 +
            (state.world.crime - 30) * 1.0 +
            (50 - state.world.approval) * 1.2 +
            (100 - state.world.transparency) * 0.3
        ));
        state.world.protestPressure = Math.max(0, Math.min(100, state.world.protestPressure + (targetPressure - state.world.protestPressure) * 0.05 * state.speed));

        if(crossedDayOfMonth(prevDate, state.date, 15) && Math.random() < 0.1) engine.aiPropose();
        if(crossedDayOfMonth(prevDate, state.date, 28) && state.player.position === "นายกรัฐมนตรี" && (state.world.approval < 30 || state.world.cabinetStability < 40)) {
           if(Math.random() < 0.05) engine.triggerNoConfidence();
        }
        // tick() fires once per real second regardless of state.speed, but each tick now covers
        // `state.speed` in-game days -- so every random-event check below is scaled by state.speed
        // too, or a player idling at 3x would silently see ~3x fewer crises/incidents per in-game
        // year than one at 1x, purely as a side effect of the speed toggle. The crisis roll also
        // now reads protestPressure: pressure changes the odds, not just the aftermath.
        if(Math.random() < (0.01 + (state.world.protestPressure / 100) * 0.03) * state.speed) engine.triggerCrisis();
        if(state.world.transparency < 40 && Math.random() < 0.05 * state.speed) {
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
            prov.investSaturation = Math.max(0, (prov.investSaturation || 0) - 0.8 * state.speed);
            // Long Campaign (Phase 7): only the diminishing-returns gauge decays here, same as
            // investSaturation -- playerCampaignBoost itself banks up untouched until it's spent
            // at the next election (runElection()), since it represents a whole term's grassroots effort.
            prov.campaignSaturation = Math.max(0, (prov.campaignSaturation || 0) - 0.8 * state.speed);
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
            c.visitSaturation = Math.max(0, (c.visitSaturation || 0) - 1 * state.speed);
        });
        if (Math.random() < 0.01 * state.speed) {
            const grudge = state.foreign.find(c => c.relation < 20);
            if (grudge) engine.triggerDiplomaticIncident(grudge);
        }
        // Relations have to collapse further than a mere diplomatic incident, and it's rarer
        // still, before a border conflict actually breaks out.
        if (Math.random() < 0.003 * state.speed) {
            const flashpoint = state.foreign.find(c => c.relation < 15);
            if (flashpoint) engine.triggerBorderConflict(flashpoint);
        }

        state.parties.forEach(p => {
            let target = p.status === "Government" ? state.world.approval : (p.status === "Opposition" ? 100 - state.world.approval : 50);
            if (p.id === state.player.party.id) target += (state.world.transparency - 100) * 0.15;
            // Long-term Memory (Phase 1): institutionalLegitimacy moves by tenths of a point a
            // month (see processMonthlyUpdate), so years of instability drag every party's
            // popularity ceiling down slowly -- a "the system has lost trust" effect that a
            // 60-day modifier could never represent.
            target += (state.world.institutionalLegitimacy - 70) * 0.1;
            p.popularity = Math.max(0, Math.min(100, p.popularity + (target - p.popularity) * 0.01 * state.speed + (Math.random() - 0.5) * 0.3 * state.speed));
            // Coalition Dependence (Phase 3): fades on its own if the player stops indulging this
            // party's demands, over roughly the same multi-week timescale as MP/province/foreign
            // saturation (Phase 1).
            p.dependence = Math.max(0, (p.dependence || 0) - 1 * state.speed);
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
    getNationalContext, getProvinceContext, getPressureBreakdown, getApprovalBreakdown, getGrowthBreakdown, getCabinetStabilityBreakdown, getMPElectoralRisk, getImplementationEffectiveness, getTradeExposure, getProductionBreakdown, getSocietyContext, getClassCompositionBreakdown, getPoliticalClimateBreakdown, getProvincePoliticalLayer,

    init() {
        state.voteModifier = null;
        state.world.transparency = 100;
        state.world.stabilityPenalty = 0;
        Object.entries(Data.WORLD_STAT_META).forEach(([stat, meta]) => { state.world[stat] = meta.baseline; });
        state.world.statMods = { unemployment: [], crime: [], health: [], education: [], environment: [], military: [] };
        state.world.electionDay = new Date(state.date);
        state.world.electionDay.setDate(state.world.electionDay.getDate() + Data.ELECTION_TERM_DAYS);
        state.history = { approval: [], budget: [] };
        state.lastVoteResults = null;
        state.lastVoteLog = [];

        // Opening Situation Generator (Stage A): a little variance on the seed stats so not
        // every game starts from an identical unemployment/crime/health/education, but every
        // derived value below (approval, growth, pressure, cabinet stability) is computed FROM
        // these, so the resulting opening situation stays internally consistent -- a bad-luck
        // roll on unemployment shows up in growth and protest pressure too, not just its own tile.
        state.world.unemployment = Math.max(10, state.world.unemployment + (Math.random() * 10 - 5));
        state.world.crime = Math.max(15, state.world.crime + (Math.random() * 12 - 6));
        state.world.health = Math.max(30, Math.min(90, state.world.health + (Math.random() * 14 - 7)));
        state.world.education = Math.max(30, Math.min(90, state.world.education + (Math.random() * 14 - 7)));

        state.factions = Data.FACTION_DATA.map(f => ({ ...f, approval: 50 + (Math.random() * 10 - 5), modifiers: [] }));
        state.foreign = Data.FOREIGN_POWERS.map(c => ({ ...c, relation: 50 + (Math.random() * 20 - 10), modifiers: [] }));
        if(state.parties.length === 0) state.parties = this.generateGameParties();
        if(state.provinces.length === 0) this.generateProvinces();
        // MP <-> Province (Stage B1): generateLeaders() now seats each MP in an actual
        // constituency, which means the per-province race needs to have already run once --
        // the same runProvinceElection() a real election uses, so day one's seat map is decided
        // by the identical formula, not a province-blind party headcount. Party seats and
        // government status are both derived from that result, not set independently of it.
        this.allocateProvinceSeats();
        this.generateLeaders();

        // Initial World Consistency (Stage A): a government taking office already has a cabinet
        // on day one, and every derived stat below reads from the exact same live formulas
        // tick()/processMonthlyUpdate() use later -- not a hardcoded placeholder the first month
        // would silently overwrite anyway. Confirmed by playtesting: cabinetStability used to
        // open at a flat 80 and visibly crash to ~43 within two weeks once the real formula first
        // ran, with no crisis or player mistake behind it -- just a number that never matched its
        // own formula. Applies regardless of who ends up governing: a sitting coalition already
        // has ministers whether the player joined it, opposes it, or sits outside it entirely.
        autoAppointCabinet();
        state.world.approval = state.factions.reduce((acc, f) => acc + f.approval, 0) / state.factions.length;
        const { value: cabinetStability, breakdown: cabinetStabilityBreakdown } = computeCabinetStability();
        state.world.cabinetStability = cabinetStability;
        state.world.cabinetStabilityBreakdown = cabinetStabilityBreakdown;
        const { value: growth, breakdown: growthBreakdown } = computeGrowth(null);
        state.world.growth = growth;
        state.world.growthBreakdown = growthBreakdown;
        const openingPressureBreakdown = getPressureBreakdown();
        state.world.protestPressure = Math.max(0, Math.min(100, Object.values(openingPressureBreakdown).reduce((s, v) => s + v, 0)));

        ui.renderCabinet(); ui.renderMinistryList();
        this.addNews("สภาสมัยประชุมเริ่มต้น", "สส. 500 ท่านเข้าประจำการเพื่อขับเคลื่อนแผ่นดิน");
        // A real baseline for every trend arrow and why-breakdown from the very first render,
        // instead of an empty history that would only start showing a trend a month in.
        for(let i=0; i<6; i++) { state.history.approval.push(state.world.approval); state.history.budget.push(state.world.nationalBudget); }
        ["growth", "cabinetStability", "protestPressure"].forEach(key => {
            state.history[key] = [];
            for (let i = 0; i < 6; i++) state.history[key].push(state.world[key]);
        });
        setInterval(() => gameClock.tick(), 1000);
    },

    // Fills state.leaders with fresh MPs seated in their actual constituency (Stage B1) --
    // walks state.provinces and each one's lastResult (which party won how many of ITS seats,
    // from runProvinceElection()) instead of just each party's national headcount, so every MP
    // carries a real province, not just a party. Requires allocateProvinceSeats() (or a real
    // runElection()) to have already populated prov.lastResult for every province.
    // Used at game start, and again after every election to seat the new parliament.
    generateLeaders() {
        state.leaders = [];
        let nIdx = 0;
        Data.ALL_MP_NAMES.sort(() => Math.random() - 0.5); // re-shuffle so a re-election doesn't hand out the same names in the same order
        const seenParty = new Set();
        state.provinces.forEach(prov => {
            Object.entries(prov.lastResult || {}).forEach(([partyId, count]) => {
                const p = state.parties.find(x => x.id === partyId);
                if (!p) return;
                for (let i = 0; i < count; i++) {
                    const ability = Data.ABILITY_POOL[Math.floor(Math.random() * Data.ABILITY_POOL.length)];
                    const socio = Data.SOCIO_POOL[Math.floor(Math.random() * Data.SOCIO_POOL.length)];
                    const ideology = Data.IDEOLOGY_POOL[Math.floor(Math.random() * Data.IDEOLOGY_POOL.length)];
                    const goal = Data.GOAL_POOL[Math.floor(Math.random() * Data.GOAL_POOL.length)];
                    const cash = (socio.baseWealth * 1000000) + Math.floor(Math.random() * 5000000);
                    // One flagship MP per party still gets the party's own baseFaction as their
                    // status -- everyone else stays a uniform random draw across all 17 factions,
                    // same spread as before. Tying every MP's status to their province's
                    // baseFaction instead would have collapsed representation down to the ~9
                    // factions that ever appear as a province baseFaction, permanently zeroing
                    // out MPs from the other 8 (กองทัพ, เทคโนแครต, สิ่งแวดล้อม, ...) -- status
                    // stays a separate signal from geography; getMPElectoralRisk() reading the
                    // MP's own province directly (not as a status proxy) is Stage B2's job.
                    const isFirstForParty = !seenParty.has(p.id);
                    seenParty.add(p.id);

                    state.leaders.push({
                        id: state.leaders.length,
                        name: Data.ALL_MP_NAMES[nIdx++] || `สส.นิรนาม ${state.leaders.length}`,
                        party: p,
                        province: prov.name,
                        status: isFirstForParty ? p.baseFaction : Data.FACTION_NAMES[Math.floor(Math.random()*17)],
                        prestige: Math.floor(Math.random() * 100),
                        loyalty: 40 + Math.random() * 60,
                        isCobra: false,
                        trait: { ideology, goal, ability, socio },
                        conviction: Math.floor(Math.random() * 100),
                        trust: 50,
                        switchCooldown: 0,
                        cash: cash,
                        ambition: Math.floor(Math.random() * 100) // Political Actors (Phase 3): how much a ministry post is worth to this MP
                    });
                }
            });
        });
    },

    // MP <-> Province (Stage B1): decides day one's seat map with the exact same per-province
    // race runElection() runs later, instead of the province-blind random headcount
    // generateGameParties() gives each party just for the setup screen's party-picker cards.
    // Both party.seats and government status end up derived from the same province results
    // generateLeaders() then seats MPs against, not set independently of them.
    allocateProvinceSeats() {
        const seatsWon = runProvinceElection();
        state.parties.forEach(p => { p.seats = seatsWon[p.id] || 0; });
        this.assignGovernmentStatus(state.parties);
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
        // a faction with a bigger production base (basePop * wealth) swings growth more when its
        // approval moves. Uses the same computeGrowth() engine.init() runs once for the opening
        // situation, so the formula can't drift between the two call sites.
        const { value: growthValue, breakdown: growthBreakdown, productionBias } = computeGrowth(state.world.growth);
        state.world.growth = growthValue;
        state.world.growthBreakdown = growthBreakdown;

        // Economy v2 (Phase 5): industries have only ever been on the receiving end of
        // unemployment (INDUSTRY_TYPES.sensitivity), never fed back into it -- a border conflict
        // or bad trade relation could tank an industry's output with zero effect on the national
        // unemployment rate it's itself sensitive to. Reuses productionBias (already computed
        // above for growth) through the same decaying-modifier channel every policy already uses.
        // Replaces its own previous entry each month instead of adding a new one on top of it --
        // industries are sensitive to unemployment too, so a naive monthly push here would stack
        // unboundedly into a runaway spiral (confirmed in testing: unemployment hit 80%+ within a
        // few years of otherwise-idle play before this fix) instead of tracking the current state.
        state.world.statMods.unemployment = (state.world.statMods.unemployment || []).filter(m => m.source !== "ผลผลิตอุตสาหกรรมรวมของประเทศ");
        this.applyWorldStatImpact("unemployment", -productionBias * 0.3, "ผลผลิตอุตสาหกรรมรวมของประเทศ", 45);

        // Trade partners in good standing add a little extra tax revenue on top of domestic growth; souring ones bleed it away
        const totalTradeWeight = state.foreign.reduce((s, c) => s + c.tradeWeight, 0);
        const weightedRelation = state.foreign.reduce((s, c) => s + (c.relation - 50) * c.tradeWeight, 0) / totalTradeWeight;
        const tradeBonus = weightedRelation * 0.000015;

        const taxRevenue = state.world.nationalBudget * Math.max(0.0002, 0.0012 + state.world.growth * 0.0004 + tradeBonus);
        state.world.nationalBudget += taxRevenue;
        this.addNews("รายได้ภาษีประจำเดือน", `รัฐเก็บภาษีได้ ฿${(taxRevenue/1e9).toFixed(1)}B จากภาวะเศรษฐกิจที่เติบโต ${state.world.growth.toFixed(1)}% และการค้าระหว่างประเทศ`);

        // Population dynamics: each province's headcount drifts monthly instead of staying
        // frozen for the whole game. A slow national baseline tracks overall growth.
        // Migration (Phase 6): the investment-driven pull is now measured against each
        // province's own regional peers, not a flat 50 -- a mid-tier province in a booming
        // region still loses people to its neighbors, and since the pull is a deviation from
        // the region's own average, what one province in a region gains is what its
        // under-invested neighbors lose (net movement within the region, not population
        // created from nowhere), on top of the separate national growth term.
        const regionInvestment = {};
        state.provinces.forEach(p => {
            const r = (regionInvestment[p.region] ||= { sum: 0, count: 0 });
            r.sum += p.investmentLevel ?? 50; r.count++;
        });
        state.provinces.forEach(prov => {
            const regionAvg = regionInvestment[prov.region].sum / regionInvestment[prov.region].count;
            const migrationPull = ((prov.investmentLevel ?? 50) - regionAvg) * 0.00008;
            const nationalBaseline = state.world.growth * 0.00015;
            prov.pop = Math.max(50000, Math.round(prov.pop * (1 + migrationPull + nationalBaseline)));
        });

        // Class transition (Phase 6): the 5 production-linked factions (เกษตรกร, แรงงาน,
        // ชนชั้นกลาง, เทคโนแครต, ท้องถิ่น) drift their basePop toward whatever share of the
        // *national industry mix* the provinces running their industry now hold
        // (FACTION_INDUSTRY_LINK), reallocating a fixed pool (CLASS_FACTION_POOL_TOTAL, each
        // faction's own starting basePop -- these are game-balance-sized political/economic
        // blocs, not literal census categories) rather than importing raw province headcounts
        // directly: an early version targeted province.pop straight (up to tens of millions)
        // against factions calibrated on a much smaller starting scale and blew เกษตรกร up
        // +180% and คนว่างงาน (a 2M bloc) up +600% within 3 years of idle play. คนว่างงาน
        // instead scales off its own starting size relative to the unemployment baseline, same
        // reasoning. Slow (3%/month) so a shift only reads clearly over a term.
        const industryPop = {};
        state.provinces.forEach(p => { industryPop[p.industry] = (industryPop[p.industry] || 0) + p.pop; });
        const totalIndustryPop = Object.values(industryPop).reduce((s, v) => s + v, 0) || 1;
        const classTargets = {};
        Object.entries(Data.FACTION_INDUSTRY_LINK).forEach(([industry, shares]) => {
            const industryShare = (industryPop[industry] || 0) / totalIndustryPop;
            Object.entries(shares).forEach(([factionName, share]) => {
                classTargets[factionName] = (classTargets[factionName] || 0) + industryShare * share * CLASS_FACTION_POOL_TOTAL;
            });
        });
        classTargets["คนว่างงาน"] = UNEMPLOYED_BASELINE_POP * (state.world.unemployment / Data.WORLD_STAT_META.unemployment.baseline);
        state.factions.forEach(f => {
            if (classTargets[f.name] === undefined) return;
            f.basePop = Math.max(10000, Math.round(f.basePop + (classTargets[f.name] - f.basePop) * 0.03));
            if (!f.popHistory) f.popHistory = [];
            f.popHistory.push(f.basePop);
            if (f.popHistory.length > 6) f.popHistory.shift();
        });

        // Same shared formula engine.init() uses for the opening situation.
        const { value: cabinetStabilityValue, breakdown: cabinetStabilityBreakdown } = computeCabinetStability();
        state.world.cabinetStability = cabinetStabilityValue;
        state.world.cabinetStabilityBreakdown = cabinetStabilityBreakdown;
        state.world.approval = state.factions.reduce((acc, f) => acc + f.approval, 0) / state.factions.length;

        // Long-term Memory (Phase 1): institutionalLegitimacy moves by at most a few tenths a
        // month -- unlike every decaying modifier in the game (30-90 days), sustained low
        // transparency or cabinet instability takes years to meaningfully erode it, and years of
        // clean, stable government takes just as long to rebuild it. This is the "the system has
        // a reputation across terms, not just this month" layer.
        const legitimacyPressure = (state.world.transparency < 50 ? -0.15 : 0.05) + (state.world.cabinetStability < 40 ? -0.2 : 0.02);
        state.world.institutionalLegitimacy = Math.max(0, Math.min(100, state.world.institutionalLegitimacy + legitimacyPressure));

        // Long Campaign (Phase 7): the executive perks behind positionIncome only mean anything
        // while the player's party actually holds government -- an ousted PM keeps their MP seat
        // and title, not the ministerial-scale pay, which now also matters as the funding source
        // for campaignProvince() while rebuilding from opposition.
        const isGoverning = state.player.party.status === "Government";
        const positionIncome = isGoverning
            ? ({ "นายกรัฐมนตรี": 20000000, "หัวหน้าพรรค": 12000000, "สส. เขต": 6000000 }[state.player.position] || 6000000)
            : 4000000;
        state.player.personalFunds += positionIncome;
        this.addNews("รายรับประจำเดือน", `ท่านได้รับเงินเดือนและผลตอบแทนตำแหน่ง ฿${(positionIncome/1e6).toFixed(0)}M${!isGoverning ? ' (ค่าตอบแทน สส. ฝ่ายค้าน)' : ''}`);

        // Trust slowly drifts back toward neutral each month, so grudges/goodwill fade but don't vanish instantly
        state.leaders.forEach(l => { l.trust = l.trust + (50 - l.trust) * 0.1; });
        state.parties.forEach(p => { p.trust = (p.trust ?? 70) + (70 - (p.trust ?? 70)) * 0.1; });

        // Trend arrows (Phase 2): a short rolling history per stat, so the UI can say "up from
        // last month" not just show a bare number. Pushed last, after every stat this month has
        // actually finished recomputing -- approval and cabinetStability used to get pushed
        // *before* their own recompute above, so their trend arrow was permanently a month stale.
        state.history.approval.push(state.world.approval); state.history.budget.push(state.world.nationalBudget);
        if(state.history.approval.length > 6) state.history.approval.shift(); if(state.history.budget.length > 6) state.history.budget.shift();
        ["growth", "cabinetStability", "protestPressure"].forEach(key => {
            if (!state.history[key]) state.history[key] = [];
            state.history[key].push(state.world[key]);
            if (state.history[key].length > 6) state.history[key].shift();
        });
    },
    
    lobbyIndividual(mpId) {
        const mp = state.leaders.find(l => l.id === mpId);
        const trustMod = mp.trust >= 70 ? 0.8 : (mp.trust <= 30 ? 1.4 : 1);
        const cost = 2000000 * mp.trait.socio.costMod * trustMod; // Richer people cost more to lobby; a burned relationship costs more too
        if (state.player.personalFunds < cost) { alert(`เงินไม่พอ (ต้องการ ฿${(cost/1e6).toFixed(1)}M)`); return; }
        state.player.personalFunds -= cost;
        // Saturation (Phase 1): contacting the same MP over and over gets less effective each
        // time -- first call full effect, repeated calls fade toward zero -- and past a point
        // it starts reading as suspicious instead of friendly.
        const satMultiplier = 1 - (mp.lobbySaturation || 0) / 100;
        mp.loyalty = Math.min(100, mp.loyalty + 15 * satMultiplier);
        mp.trust = Math.min(100, mp.trust + 8 * satMultiplier - ((mp.lobbySaturation || 0) > 70 ? 5 : 0));
        mp.lobbySaturation = Math.min(100, (mp.lobbySaturation || 0) + 35);
        const satNote = satMultiplier < 0.5 ? " (ติดต่อถี่เกินไป ผลลดลงมาก)" : "";
        this.addNews(`ล็อบบี้สำเร็จ: ${mp.name}`, `ความสัมพันธ์ดีขึ้น (+${(15 * satMultiplier).toFixed(0)} Loyalty)${satNote}`);

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
        // Which kind of crisis fires is itself context-read now: high protestPressure biases
        // toward Protest, not a flat coin flip -- the buildup the player already saw explains
        // which crisis showed up, instead of it looking arbitrary.
        const protestChance = 0.3 + (state.world.protestPressure / 100) * 0.5;
        const type = Math.random() < protestChance ? "Protest" : "Economic";
        if (type === "Economic") {
            // Mirrors the Protest branch's stabilityPenalty: a temporary, decaying drag (via
            // tick()'s growthPenalty decay) instead of a permanent subtraction, so repeated
            // crises fade over a couple of weeks like everything else in the game instead of
            // requiring the monthly growth blend alone to claw them back.
            state.world.growthPenalty = Math.min(15, (state.world.growthPenalty || 0) + 2.5);
            this.addNews("วิกฤตเศรษฐกิจถดถอย!", "GDP ร่วงกราวรูด ค่าครองชีพพุ่งสูง");
        } else {
            state.world.stabilityPenalty = Math.min(50, (state.world.stabilityPenalty || 0) + 15);
            state.world.cabinetStability = Math.max(0, state.world.cabinetStability - 15);
            // The protest itself lets off some of the pressure that built up to cause it,
            // instead of the same bubble immediately re-triggering another one next tick.
            state.world.protestPressure = Math.max(0, state.world.protestPressure - 35);
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
        // Saturation: repeat state visits with no time between them read as routine, not special.
        const satMultiplier = 1 - (c.visitSaturation || 0) / 100;
        c.relation = Math.min(100, c.relation + 12 * satMultiplier);
        c.visitSaturation = Math.min(100, (c.visitSaturation || 0) + 30);
        this.addNews(`เยือน${c.name}อย่างเป็นทางการ`, `ความสัมพันธ์ทางการทูตกับ${c.name}ดีขึ้น`);
        ui.updateMain(); ui.renderForeignList();
    },

    tradeDeal(countryId) {
        if (!requireGovernment("ลงนามข้อตกลงการค้าระดับชาติ")) return;
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

    // National-level counterpart to investProvince(): spends budget to push the military
    // readiness stat up via the same decaying-modifier channel every other world stat uses.
    investMilitary() {
        if (!requireGovernment("เพิ่มงบประมาณกองทัพ")) return;
        const cost = 1.5e10;
        if (state.world.nationalBudget < cost) { alert(`งบประเทศไม่พอ (ต้องการ ฿${(cost/1e9).toFixed(1)}B)`); return; }
        state.world.nationalBudget -= cost;
        this.applyWorldStatImpact("military", 20, "จัดซื้อยุทโธปกรณ์เพิ่มเติม", 60);
        this.applyFactionImpact("กองทัพ", 8, "จัดซื้อยุทโธปกรณ์เพิ่มเติม");
        this.addNews("เพิ่มงบประมาณกองทัพ", "จัดซื้อยุทโธปกรณ์เสริมความพร้อมทางทหาร");
        ui.updateMain(); ui.showPolicyBank("กลาโหม");
    },

    // Relations with a foreign power collapsing past triggerDiplomaticIncident's threshold can
    // escalate into an actual border conflict. Resolved as a single event, not a persistent
    // "at war" state: outcome is decided immediately, consequences ripple out from there.
    triggerBorderConflict(c) {
        gameClock.setSpeed(0); ui.resetModalState();
        const playerStrength = Math.max(5, state.world.military + (Math.random() * 20 - 10));
        const enemyStrength = 40 + Math.random() * 40;
        const won = playerStrength >= enemyStrength;
        ui.showBorderConflict(c, playerStrength, enemyStrength, won);
    },

    resolveBorderConflict(countryId, won) {
        const c = state.foreign.find(x => x.id === countryId);
        const cost = won ? 8e9 : 2.5e10;
        state.world.nationalBudget = Math.max(0, state.world.nationalBudget - cost);
        this.applyWorldStatImpact("military", won ? 8 : -15, `ปะทะชายแดนกับ${c.name}`, 60);
        this.applyFactionImpact("กองทัพ", won ? 10 : -8, `ปะทะชายแดนกับ${c.name}`);
        c.relation = Math.max(0, c.relation - (won ? 10 : 5));
        state.world.approval = Math.max(0, Math.min(100, state.world.approval + (won ? 3 : -6)));

        // Reuse the same investmentLevel modifier channel investProvince() uses: it already
        // drives production (Phase 5), the election swing (PR #10), and population (PR #12),
        // so a lost skirmish disrupting the industry tied to this country ripples through all three.
        const penalty = won ? -8 : -25; const days = won ? 45 : 90;
        state.provinces.filter(p => p.industry === c.keyIndustry).forEach(p => {
            if (!p.modifiers) p.modifiers = [];
            p.modifiers.push({ source: `ปะทะชายแดนกับ${c.name}`, perDay: penalty / days, remaining: days });
        });

        const industryLabel = Data.INDUSTRY_TYPES[c.keyIndustry]?.label || c.keyIndustry;
        this.addNews(
            won ? `ทหารไทยยันการปะทะชายแดนกับ${c.name}สำเร็จ` : `ปะทะชายแดนกับ${c.name}ยืดเยื้อ ฝ่ายไทยเสียเปรียบ`,
            won ? `กองทัพควบคุมสถานการณ์ได้ แต่จังหวัดที่ทำ${industryLabel}ยังชะงักงันชั่วคราว` : `ความไม่สงบกระทบจังหวัดที่ทำ${industryLabel}หนัก และกดดันเสถียรภาพรัฐบาล`
        );
        document.getElementById('event-modal').classList.add('hidden');
        ui.updateMain(); ui.renderForeignList(); gameClock.setSpeed(1);
    },

    // targetIndustry omitted (or equal to the province's current industry) just deepens the
    // existing industry, same as before. A different targetIndustry restructures the province
    // toward it instead -- only when REGION_ELIGIBLE_INDUSTRIES allows it for that region, so
    // the choice is always geography-gated, never an arbitrary picklist. Restructuring costs
    // more and resets investmentLevel low, since a province starting a new industry from
    // scratch hasn't built up the same capacity yet.
    investProvince(name, targetIndustry) {
        if (!requireGovernment("ใช้งบประมาณแผ่นดินลงทุนพัฒนาพื้นที่")) return;
        const prov = state.provinces.find(p => p.name === name);
        const isShift = targetIndustry && targetIndustry !== prov.industry;
        if (isShift) {
            const eligible = Data.REGION_ELIGIBLE_INDUSTRIES[prov.region] || [];
            if (!eligible.includes(targetIndustry)) { alert(`สภาพภูมิศาสตร์ของ${prov.name}ไม่เอื้อต่ออุตสาหกรรมนี้`); return; }
        }
        const cost = isShift ? 6e9 : 2e9;
        if (state.world.nationalBudget < cost) { alert(`งบประเทศไม่พอ (ต้องการ ฿${(cost/1e9).toFixed(1)}B)`); return; }
        state.world.nationalBudget -= cost;
        if (isShift) {
            prov.industry = targetIndustry;
            prov.investmentLevel = 25;
            prov.investSaturation = 0;
            this.addNews(`ปรับโครงสร้างเศรษฐกิจ${prov.name}`, `รัฐบาลผลักดันให้${prov.name}ปรับทิศทางสู่${Data.INDUSTRY_TYPES[targetIndustry]?.label}`);
        } else {
            // Context (growthStage): a province already near its investment ceiling gets less
            // out of the same money -- the worked example from the design doc, where 50->70
            // is still worth it but 90+ isn't, without a separate bottleneck fix.
            const { growthStage } = getProvinceContext(prov);
            const contextMultiplier = growthStage === "Saturated" ? 0.4 : growthStage === "Growing" ? 0.85 : 1;
            // Saturation: investing in the same province back-to-back fades over ~5 weeks.
            const satMultiplier = 1 - (prov.investSaturation || 0) / 100;
            if (!prov.modifiers) prov.modifiers = [];
            prov.modifiers.push({ source: "ลงทุนพัฒนาอุตสาหกรรม", perDay: (30 / 60) * contextMultiplier * satMultiplier, remaining: 60 });
            prov.investSaturation = Math.min(100, (prov.investSaturation || 0) + 30);
            const note = growthStage === "Saturated" ? " (จังหวัดนี้ลงทุนอิ่มตัวแล้ว ผลลดลงมาก)" : "";
            this.addNews(`ลงทุนพัฒนา${prov.name}`, `รัฐบาลอัดฉีดงบพัฒนาอุตสาหกรรม${Data.INDUSTRY_TYPES[prov.industry]?.label || ''}ในพื้นที่${note}`);
        }
        ui.updateMain(); ui.showProvinceDetail(prov.name);
    },

    // Long Campaign (Phase 7): investProvince()'s counterpart for whenever the player's party
    // doesn't hold the treasury -- personal funds instead of the national budget, and the payoff
    // is a banked electoral bonus in this specific province (spent at the next runElection(),
    // then reset to 0) instead of investmentLevel/production. Available regardless of government
    // status: a government party campaigns too, but it's the only lever an opposition player has
    // to "build a new base" the blueprint calls for. Same diminishing-returns pattern as every
    // other repeatable action (campaignSaturation decays in tick(), the boost itself doesn't).
    campaignProvince(name) {
        const prov = state.provinces.find(p => p.name === name);
        const cost = 5000000;
        if (state.player.personalFunds < cost) { alert(`เงินส่วนตัวไม่พอ (ต้องการ ฿${(cost/1e6).toFixed(1)}M)`); return; }
        state.player.personalFunds -= cost;
        const satMultiplier = 1 - (prov.campaignSaturation || 0) / 100;
        prov.playerCampaignBoost = Math.min(40, (prov.playerCampaignBoost || 0) + 8 * satMultiplier);
        prov.campaignSaturation = Math.min(100, (prov.campaignSaturation || 0) + 30);
        this.addNews(`ลงพื้นที่หาเสียง${prov.name}`, `${state.player.party.name}เดินสายพบประชาชนใน${prov.name}เพื่อสร้างฐานเสียงสำหรับการเลือกตั้งครั้งหน้า`);
        ui.updateMain(); ui.showProvinceDetail(prov.name);
    },

    runElection() {
        gameClock.setSpeed(0); ui.resetModalState();

        const prevSeats = {};
        state.parties.forEach(p => { prevSeats[p.id] = p.seats; });

        // Same shared per-province race allocateProvinceSeats() runs at game start.
        const seatsWon = runProvinceElection();

        const results = state.parties.map(p => ({ party: p, seats: seatsWon[p.id], prevSeats: prevSeats[p.id], prevStatus: p.status }));
        results.forEach(r => { r.party.seats = r.seats; });
        // Spent: this term's campaign effort only ever pays off once, at this election.
        state.provinces.forEach(p => { p.playerCampaignBoost = 0; });

        this.assignGovernmentStatus(state.parties);
        Object.values(Data.MINISTRIES).forEach(m => { m.currentMinister = null; }); // new term, new cabinet to appoint
        state.activePolicies = [];
        state.voteModifier = null; state.lastVoteResults = null; state.lastVoteLog = [];
        this.generateLeaders();

        const won = state.player.party.status === "Government";
        // AI Cabinet: the player can only appoint through showAppointModal while their own party
        // governs -- whichever coalition won instead fills its own cabinet automatically.
        if (!won) {
            const appointed = autoAppointCabinet();
            if (appointed.length > 0) this.addNews("จัดตั้งคณะรัฐมนตรีชุดใหม่", `รัฐบาลผสมจัดตั้งคณะรัฐมนตรีครบทุกกระทรวงแล้ว`);
        }
        state.world.electionDay = new Date(state.date);
        state.world.electionDay.setDate(state.world.electionDay.getDate() + Data.ELECTION_TERM_DAYS);

        const rows = results.sort((a, b) => b.seats - a.seats).map(r => `
            <div class="flex justify-between items-center text-xs border-b border-stone-200 py-1.5">
                <span class="flex items-center gap-2 font-bold"><span class="inline-block w-2 h-2 rounded-full border border-black" style="background:${r.party.color}"></span>${r.party.name}${r.party.id === state.player.party.id ? ' <span class="text-[9px] text-stone-500">(พรรคท่าน)</span>' : ''}</span>
                <span class="font-mono">${r.prevSeats} → <span class="font-bold">${r.seats}</span> <span class="text-[9px] uppercase text-stone-500">${r.party.status}</span></span>
            </div>
        `).join('');

        // Long Campaign (Phase 7): losing government used to end the game outright
        // (location.reload()) -- the blueprint calls this out directly as a design mistake.
        // The player's own MP prestige/trust, faction approval, institutionalLegitimacy and news
        // history all carry over untouched into the new term; only cabinet posts and this term's
        // spent campaign effort reset, same as they would for a winning term too.
        document.getElementById('event-title').innerText = "ผลการเลือกตั้งทั่วไป";
        document.getElementById('event-desc').innerHTML = `
            <div class="text-center mb-4">
                <div class="text-2xl font-black uppercase tracking-widest ${won ? 'text-emerald-700' : 'text-red-700'}">${won ? 'พรรคท่านจัดตั้งรัฐบาลต่อ' : 'พรรคท่านหลุดจากอำนาจ'}</div>
                ${!won ? `<div class="text-xs text-stone-500 mt-2">พรรคท่านเป็น${state.player.party.status === "Opposition" ? "ฝ่ายค้าน" : "กลาง"}ในสมัยนี้ -- ลงพื้นที่หาเสียงและสร้างฐานใหม่เพื่อกลับมาสมัยหน้า</div>` : ''}
            </div>
            <div class="text-left max-h-[320px] overflow-y-auto scroll-custom">${rows}</div>
        `;
        document.getElementById('event-options').innerHTML = won
            ? `<button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="w-full p-4 bg-black text-white font-bold border-2 border-black text-lg hover:opacity-90">เริ่มสมัยประชุมใหม่</button>`
            : `<button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1); ui.updateMain();" class="w-full p-4 bg-red-700 text-white font-bold border-2 border-black text-lg hover:opacity-90">เข้าสู่ฝ่ายค้าน</button>`;
        document.getElementById('event-modal').classList.remove('hidden');
        ui.renderCabinet(); ui.renderMinistryList(); ui.renderParliament(); ui.renderProvinceMap();
        this.addNews("ผลการเลือกตั้งทั่วไปประกาศแล้ว", won ? "พรรคท่านยังคงจัดตั้งรัฐบาลได้ต่อไป" : "พรรคท่านไม่สามารถจัดตั้งรัฐบาลได้ในสมัยนี้ และจะทำหน้าที่ฝ่ายค้านในสภาชุดใหม่");
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
        // Long Campaign (Phase 7): being ousted mid-term used to end the game (location.reload()).
        // Now the PM's own party is forced into Opposition -- seats don't change, so letting
        // assignGovernmentStatus() run on the full list would just hand government straight back
        // to whoever still holds the most seats -- and a new coalition is picked from everyone
        // else, same anchor-then-fill logic assignGovernmentStatus() already uses for elections.
        if (ousted) {
            state.player.party.status = "Opposition";
            this.assignGovernmentStatus(state.parties.filter(p => p.id !== state.player.party.id));
            Object.values(Data.MINISTRIES).forEach(m => { m.currentMinister = null; });
            state.activePolicies = [];
            state.voteModifier = null; state.lastVoteResults = null; state.lastVoteLog = [];
            autoAppointCabinet();
            this.addNews("รัฐบาลพ่ายมติไม่ไว้วางใจ", `${state.player.party.name}หลุดจากอำนาจกลางสมัยประชุม สภาจัดตั้งรัฐบาลใหม่จากเสียงที่เหลือและแต่งตั้งคณะรัฐมนตรีครบแล้ว`);
        }
        document.getElementById('event-options').innerHTML = ousted
            ? `<button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1); ui.updateMain(); ui.renderCabinet(); ui.renderMinistryList(); ui.renderParliament();" class="w-full p-4 bg-black rounded-xl text-white font-sans">เข้าสู่ฝ่ายค้าน</button>`
            : `<button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="w-full p-4 bg-zinc-700 rounded-xl text-white font-sans">บริหารต่อ</button>`;
    },

    appointMinister(mName, lId) {
        if (!requireGovernment("แต่งตั้งคณะรัฐมนตรี")) return;
        const l = state.leaders.find(x => x.id === lId);
        if (!l) return;
        Data.MINISTRIES[mName].currentMinister = l;
        // Ambition (Phase 3): a promotion means far more to an MP who wanted one than to a
        // content backbencher -- the same trait that makes ambitious MPs curry favor in
        // runVote() pays off here.
        const boost = 10 + (l.ambition ?? 50) * 0.3;
        l.loyalty = Math.min(100, l.loyalty + boost);
        l.trust = Math.min(100, l.trust + boost * 0.5);
        this.addNews(`แต่งตั้ง รมว.${mName}: ${l.name}`, (l.ambition ?? 50) > 65 ? `${l.name}ดีใจมากที่ได้รับตำแหน่งที่ใฝ่ฝัน` : `${l.name}รับตำแหน่งด้วยความยินดี`);
        ui.renderCabinet(); ui.updateMain();
    },

    startVote(pName) {
        state.voteModifier = null; state.lastVoteResults = null; state.lastVoteLog = [];
        const p = state.activePolicies.find(x => x.name === pName);
        const coalitions = state.parties.filter(py => py.status === "Government" && py.id !== state.player.party.id);
        // Coalition Dependence (Phase 3): a coalition partner the player keeps indulging comes
        // back asking for more, more often -- not just a flat 30% chance every time.
        const avgDependence = coalitions.length > 0 ? coalitions.reduce((s, py) => s + (py.dependence || 0), 0) / coalitions.length : 0;
        const quidProQuoChance = 0.3 + (avgDependence / 100) * 0.3;
        if (p.proposer === "รัฐบาล" && Math.random() < quidProQuoChance) {
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
            // Coalition Dependence (Phase 3): giving in raises this party's expectations, so the
            // same concession buys less trust each time it's repeated, mirroring the diminishing
            // returns every other repeatable action in the game already has (Phase 1 saturation).
            const dependence = party.dependence || 0;
            const trustGain = Math.max(2, 10 - dependence * 0.08);
            party.trust = Math.min(100, (party.trust ?? 70) + trustGain);
            party.dependence = Math.min(100, dependence + 20);
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

            // Ambition (Phase 3): a backbencher hoping for a ministry curries favor with the
            // government line instead of voting their own preference.
            const isMinister = Object.values(Data.MINISTRIES).some(m => m.currentMinister?.id === mp.id);
            if (mp.party.status === "Government" && !isMinister) score += (mp.ambition / 100) * 15;

            // Issue Priority (Phase 3): a policy that lands on the exact issue an MP personally
            // cares about (trait.goal matching the bill's goal) is judged by how it treats their
            // own base, not by party discipline -- the "farm-focused MP votes against the party
            // if the bill hits farmers hard" example from the design doc.
            const issueMatch = mp.trait.goal === p.goal;
            const impactOnOwnBase = p.impact?.[mp.status] || 0;
            if (issueMatch) score += impactOnOwnBase * 0.8;

            // Seat Security (Phase 3): close to an election, an MP whose own base has turned on
            // them weighs that base's stake in the bill over the party line -- no per-MP
            // constituency in this data model, so mp.status doubles as "their electorate".
            const electoralRisk = getMPElectoralRisk(mp);
            if (electoralRisk !== "Safe") score += impactOnOwnBase * (electoralRisk === "AtRisk" ? 1.0 : 0.5);

            let voteAgainstParty = (mp.loyalty < 30 && Math.random() < 0.4) || mp.isCobra || (personalConflict && Math.random() < 0.25)
                || (issueMatch && impactOnOwnBase < -15 && Math.random() < 0.5);
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
                // State Capacity (Phase 4): passing parliament is "Policy Passed", not
                // "Policy Effective" -- the ministry's workload, whether its minister actually
                // cares about this issue, and the government's fiscal room all cut into how
                // much of the legal effect the state can actually deliver.
                const { effectiveness, fitLabel } = getImplementationEffectiveness(p);
                state.world.nationalBudget -= p.cost;
                Object.entries(p.impact).forEach(([fn, v]) => this.applyFactionImpact(fn, v * effectiveness, p.name));
                if (p.worldImpact) Object.entries(p.worldImpact).forEach(([stat, v]) => this.applyWorldStatImpact(stat, v * effectiveness, p.name));
                state.foreign.forEach(c => {
                    if (c.ideology === p.ideology) this.applyForeignImpact(c.id, 8 * effectiveness, p.name, 60);
                    else if (ideologiesConflict(c.ideology, p.ideology)) this.applyForeignImpact(c.id, -8 * effectiveness, p.name, 60);
                });
                const ministry = Data.MINISTRIES[p.ministry];
                if (ministry) ministry.workload = Math.min(100, (ministry.workload || 0) + 30);
                const effLabel = effectiveness > 0.85 ? "ดำเนินงานได้เต็มที่" : effectiveness > 0.6 ? "ดำเนินงานได้ปานกลาง" : "ดำเนินงานได้จำกัดมาก";
                this.addNews(`${p.name} บังคับใช้เป็นกฎหมาย`, `${effLabel} (ประสิทธิผล ${(effectiveness*100).toFixed(0)}%) -- ${fitLabel}`);
                state.activePolicies = state.activePolicies.filter(x => x.name !== pName);
            }
        } else { state.activePolicies = state.activePolicies.filter(x => x.name !== pName); }
        document.getElementById('event-modal').classList.add('hidden'); 
        state.lastVoteResults = null; ui.renderParliament(); 
        ui.updateMain(); gameClock.setSpeed(1);
    }
};
