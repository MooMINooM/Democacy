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
const COST_OF_LIVING_CATEGORY_SET = new Set(Data.COST_OF_LIVING_CATEGORIES);
function provinceOutput(prov) {
    const industry = Data.INDUSTRY_TYPES[prov.industry] || Data.INDUSTRY_TYPES["เกษตรกรรม"];
    let multiplier = 1 + ((prov.investmentLevel ?? 50) - 50) / 50 * 0.4;
    Object.entries(industry.sensitivity || {}).forEach(([stat, weight]) => {
        // Emergent Chain Verification (Balance Pass v1 Phase 5): a sensitivity key can now name
        // either a flat state.world stat (environment, unemployment, ...) or one of the 5
        // cost-of-living categories (state.world.costOfLiving.<cat>) -- resolved the same way
        // either way, so "energy" above reads the real, live cost index instead of undefined.
        const val = COST_OF_LIVING_CATEGORY_SET.has(stat) ? (state.world.costOfLiving?.[stat] ?? 50) : (state.world[stat] ?? 50);
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
    // Emergent Chain Verification (Balance Pass v1 Phase 5): "local decline -> migration -> vote
    // share change" -- a province genuinely emptying out (popTrend, the EMA the monthly migration
    // update tracks) costs the incumbent on top of investmentLevel itself, not just through it.
    // Scaled well under investmentSwing's own range (up to +-15 vs investmentSwing's up to +-25)
    // since it's the secondary signal here, not the primary one.
    const migrationSwing = (prov.popTrend ?? 0) * 3000;
    const weights = state.parties.map(p => {
        const bonus = affinity && p.ideologies.includes(affinity) ? 25 : 0;
        const govBonus = p.status === "Government" ? investmentSwing + migrationSwing : 0;
        const campaignBonus = p.id === state.player.party.id ? (prov.playerCampaignBoost || 0) : 0;
        // Long-term Political Memory (Stage D3): same legacyBonus term runProvinceElection()
        // itself uses, kept in sync deliberately -- otherwise this preview would show a
        // different picture than the real election it's meant to be a readable stand-in for.
        const legacyBonus = ((p.legacyTrust ?? 60) - 60) * 0.4;
        return { party: p, weight: Math.max(1, p.popularity + bonus + govBonus + campaignBonus + legacyBonus) };
    });
    const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
    return weights.map(w => ({ party: w.party, share: (w.weight / totalWeight) * 100 })).sort((a, b) => b.share - a.share);
}
// Better Why System (Stage D4): "ทำไมจังหวัดเสียฐานเสียง" -- showProvinceDetail() showed the
// leaning/competitiveness result of the formula above but never the terms that actually produced
// it. Same weight terms, for one named party, as signed contributions instead of a single number.
function getProvinceVoteShareBreakdown(provOrName, partyId) {
    // Same object-or-name flexibility as getEffectivenessBreakdown()/getFactionApprovalBreakdown()
    // -- a UI onclick only ever has the province's name to pass through global scope.
    const prov = typeof provOrName === 'string' ? state.provinces.find(x => x.name === provOrName) : provOrName;
    if (!prov) return {};
    const party = state.parties.find(p => p.id === partyId);
    if (!party) return {};
    const affinity = Data.FACTION_IDEOLOGY_AFFINITY[prov.baseFaction];
    const investmentSwing = ((prov.investmentLevel ?? 50) - 50) * 0.5;
    const migrationSwing = (prov.popTrend ?? 0) * 3000;
    const terms = { "ความนิยมพรรคโดยรวม": party.popularity };
    if (affinity && party.ideologies.includes(affinity)) terms[`อุดมการณ์ตรงกับฐานเสียง${prov.baseFaction}`] = 25;
    if (party.status === "Government") {
        terms["ระดับการลงทุนในจังหวัด"] = investmentSwing;
        if (Math.abs(migrationSwing) > 0.1) terms[migrationSwing < 0 ? "ประชากรกำลังย้ายออก" : "ประชากรกำลังย้ายเข้า"] = migrationSwing;
    }
    if (party.id === state.player.party.id && (prov.playerCampaignBoost || 0) > 0) terms["คะแนนหาเสียงสะสม"] = prov.playerCampaignBoost;
    terms["ชื่อเสียงระยะยาวของพรรค"] = ((party.legacyTrust ?? 60) - 60) * 0.4;
    return terms;
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
        // Emergent Chain Verification (Balance Pass v1 Phase 5): a sensitivity key can now also
        // name a cost-of-living category (see provinceOutput()) -- those live in
        // Data.COST_OF_LIVING_META (label only, no per-stat baseline field, since every
        // cost-of-living index shares the same 50 baseline) rather than Data.WORLD_STAT_META,
        // which this used to assume unconditionally and crashed on "energy" reading `.baseline`
        // off an undefined meta.
        const strains = Object.entries(industry.sensitivity).map(([stat, weight]) => {
            const isCost = COST_OF_LIVING_CATEGORY_SET.has(stat);
            const meta = isCost ? Data.COST_OF_LIVING_META[stat] : Data.WORLD_STAT_META[stat];
            const baseline = isCost ? 50 : (meta?.baseline ?? 50);
            const value = isCost ? (state.world.costOfLiving?.[stat] ?? 50) : (state.world[stat] ?? baseline);
            // weight>0 means this industry wants the stat HIGH (bad = value below baseline);
            // weight<0 means it wants the stat LOW (bad = value above baseline) -- same sign
            // convention provinceOutput() itself reads these weights with.
            const strain = weight > 0 ? (baseline - value) * weight : (value - baseline) * -weight;
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
// Election Readability (Stage B4): the provinces actually worth the player's attention before an
// election, ranked by how thin the margin is -- reuses getProvincePoliticalLayer() (Stage B3),
// not a new formula.
function getBattlegroundProvinces(limit = 8) {
    return state.provinces
        .map(p => ({ province: p, layer: getProvincePoliticalLayer(p) }))
        .filter(x => x.layer.competitiveness !== "Safe")
        .sort((a, b) => Math.abs(a.layer.govSupport - a.layer.oppSupport) - Math.abs(b.layer.govSupport - b.layer.oppSupport))
        .slice(0, limit)
        .map(x => ({ name: x.province.name, region: x.province.region, seats: x.province.seats, ...x.layer }));
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
// Event Pressure Framework (Stage C1): protestPressure's own pattern (a real, visible, structural
// buildup instead of a blind dice roll) extended to the other three trigger checks that used to
// be flat/gated random -- triggerNoConfidence(), triggerCrisis()'s Economic branch, and
// triggerCoup(). Random still decides *when* within tick(), but now scaled by how much these
// pressures have actually built up, the same relationship protestPressure->triggerCrisis() already had.
function getCoalitionCollapseBreakdown() {
    const coalitionParties = state.parties.filter(p => p.status === "Government" && p.id !== state.player.party.id);
    const avgCoalitionTrust = coalitionParties.length > 0 ? coalitionParties.reduce((s, p) => s + (p.trust ?? 70), 0) / coalitionParties.length : 100;
    return {
        "พรรคร่วมรัฐบาลไม่ไว้ใจ": Math.max(0, (70 - avgCoalitionTrust) * 1.2),
        "เสถียรภาพคณะรัฐมนตรีต่ำ": Math.max(0, (50 - state.world.cabinetStability) * 0.8),
        "ความนิยมรัฐบาลต่ำ": Math.max(0, (40 - state.world.approval) * 0.6)
    };
}
function getEconomicCrisisBreakdown() {
    // The growth term's coefficient was originally 8 (borrowed from growth's own productionBias
    // scale) -- calm-baseline testing caught a real feedback spiral it created: an Economic
    // crisis sets growthPenalty (up to 15), which drags growth down once the month rolls over,
    // which fed straight back into this same pressure at 8x, re-triggering another Economic
    // crisis before growthPenalty had time to decay. Cut to 1.5 (an ~80% reduction, the same
    // scale of cut the Phase 5 employment-feedback fix needed for the same reason) so a crisis's
    // own aftermath doesn't relaunch the pressure that caused it.
    // Fiscal Emergency (Balance Pass v1): the old fiscalStrain term here only read the recent
    // TREND tag (rising/falling), so an empty-but-flat treasury contributed 0. Reads the absolute
    // depletion stat (state.world.fiscalStress, itself driven by getBudgetCoverage()) instead, at
    // a modest 0.3 coefficient -- fiscalStress already updates on its own slow target-and-drift
    // clock in tick(), so this just carries that signal into the crisis total, not a second copy.
    return {
        "เศรษฐกิจหดตัว": Math.max(0, -state.world.growth * 1.5),
        "การว่างงานสูง": Math.max(0, (state.world.unemployment - 20) * 1.2),
        "ภาวะการคลังตึงตัว": (state.world.fiscalStress ?? 0) * 0.3
    };
}
function getCoupBreakdown() {
    const army = state.factions.find(f => f.name === "กองทัพ");
    const armyApproval = army ? army.approval : 50;
    return {
        "ความโปร่งใสต่ำ": Math.max(0, (40 - state.world.transparency) * 0.8),
        "กองทัพไม่พอใจ": Math.max(0, (50 - armyApproval) * 0.6),
        "เสถียรภาพคณะรัฐมนตรีต่ำ": Math.max(0, (40 - state.world.cabinetStability) * 0.5),
        "แรงกดดันประท้วงสูง": Math.max(0, (state.world.protestPressure - 50) * 0.3)
    };
}
// Fiscal Emergency (Balance Pass v1): the opening treasury size -- what "fully funded" is measured
// against. getNationalContext().fiscalCondition already reads whether the budget is currently
// rising or falling (a TREND), which meant a treasury sitting at literal zero but no longer moving
// read as perfectly healthy. budgetCoverage below reads the absolute DEPLETION level instead, the
// signal that trend was missing.
const REFERENCE_BUDGET = 3.4e12;
function getBudgetCoverage() {
    return Math.max(0, Math.min(100, (state.world.nationalBudget / REFERENCE_BUDGET) * 100));
}
function getFiscalStressBreakdown() {
    const coverage = getBudgetCoverage();
    return {
        "งบประเทศเหลือน้อย": Math.max(0, (60 - coverage) * 1.2),
        "แนวโน้มขาดดุลต่อเนื่อง": getNationalContext().fiscalCondition === "Debt Stress" ? 20 : 0
    };
}
// Economic Pressure v1 (Stage D1): the same 5-term-breakdown-per-stat convention getCoupBreakdown()
// etc. use, but signed (a term can push the index up OR down) rather than clamped-positive-only --
// cost-of-living is centered at 50 like growth, not a one-directional 0-100 buildup like the
// pressures above, so it follows computeGrowth()'s breakdown shape instead of getPressureBreakdown()'s.
// Reads production (provinceOutput() by industry), trade exposure (the FOREIGN_POWERS partner
// whose keyIndustry matches), unemployment, and industry mix (outputShare) -- the 4 structural
// inputs the roadmap names; external shocks are a separate decaying-modifier channel (see tick()
// and triggerCrisis()'s Economic branch) layered on top of this target, not part of it.
function getCostOfLivingBreakdown(category) {
    const totalProduction = state.provinces.reduce((s, p) => s + provinceOutput(p), 0) || 1;
    const outputShare = (industryName) => state.provinces.filter(p => p.industry === industryName).reduce((s, p) => s + provinceOutput(p), 0) / totalProduction;
    const relationFor = (industryName) => {
        const partner = Data.FOREIGN_POWERS.find(f => f.keyIndustry === industryName);
        const c = partner ? state.foreign.find(x => x.id === partner.id) : null;
        return c ? c.relation : 50;
    };
    const avgInvestment = state.provinces.length > 0 ? state.provinces.reduce((s, p) => s + (p.investmentLevel ?? 50), 0) / state.provinces.length : 50;
    // costBaselineShares (generateProvinces()) is this game's own actual day-one output shares --
    // see the comment there for why a hand-guessed "neutral" percentage caused a real feedback
    // spiral in testing. Falls back to 0 bias (share === baseline) if read before init() sets it.
    const baseline = state.world.costBaselineShares || { food: outputShare("เกษตรกรรม") + outputShare("ประมง"), energyDemand: outputShare("อุตสาหกรรม") + outputShare("เทคโนโลยี"), industrial: outputShare("อุตสาหกรรม"), transport: outputShare("โลจิสติกส์และการส่งออก"), housingDemand: outputShare("เทคโนโลยี") + outputShare("การท่องเที่ยว") };

    if (category === "food") {
        const supply = outputShare("เกษตรกรรม") + outputShare("ประมง");
        return {
            "ผลผลิตเกษตร/ประมงเทียบวันแรก": -(supply - baseline.food) * 35,
            "ความสัมพันธ์การค้ากับจีน": -(relationFor("เกษตรกรรม") - 50) * 0.15,
            "การว่างงานสูง": (state.world.unemployment - 20) * 0.08
        };
    }
    if (category === "energy") {
        const demand = outputShare("อุตสาหกรรม") + outputShare("เทคโนโลยี");
        const avgRelation = state.foreign.length > 0 ? state.foreign.reduce((s, c) => s + c.relation, 0) / state.foreign.length : 50;
        return {
            "ความต้องการพลังงานเทียบวันแรก": (demand - baseline.energyDemand) * 20,
            "ความสัมพันธ์การค้าระหว่างประเทศโดยรวม": -(avgRelation - 50) * 0.15
        };
    }
    if (category === "housing") {
        return {
            "การลงทุนในพื้นที่เฉลี่ยทั่วประเทศ": (avgInvestment - 50) * 0.25,
            "สัดส่วนอุตสาหกรรมมูลค่าสูงเทียบวันแรก": (outputShare("เทคโนโลยี") + outputShare("การท่องเที่ยว") - baseline.housingDemand) * 10
        };
    }
    if (category === "industrial") {
        const supply = outputShare("อุตสาหกรรม");
        return {
            "กำลังผลิตภาคอุตสาหกรรมเทียบวันแรก": -(supply - baseline.industrial) * 30,
            "ความสัมพันธ์การค้ากับญี่ปุ่น": -(relationFor("อุตสาหกรรม") - 50) * 0.15,
            "การว่างงานสูง": (state.world.unemployment - 20) * 0.1
        };
    }
    if (category === "transport") {
        const supply = outputShare("โลจิสติกส์และการส่งออก");
        return {
            "โครงข่ายโลจิสติกส์เทียบวันแรก": -(supply - baseline.transport) * 25,
            "ราคาพลังงาน": ((state.world.costOfLiving?.energy ?? 50) - 50) * 0.15,
            "การว่างงานสูง": (state.world.unemployment - 20) * 0.05
        };
    }
    return {};
}
function getCostOfLivingTarget() {
    const target = {};
    Data.COST_OF_LIVING_CATEGORIES.forEach(cat => {
        target[cat] = Math.max(0, Math.min(100, 50 + Object.values(getCostOfLivingBreakdown(cat)).reduce((s, v) => s + v, 0)));
    });
    return target;
}
function getApprovalBreakdown() {
    const rows = {};
    [...state.factions].sort((a, b) => Math.abs(b.approval - 50) - Math.abs(a.approval - 50)).slice(0, 5)
        .forEach(f => { rows[f.name] = f.approval - 50; });
    return rows;
}
// Better Why System (Stage D4): renderFactionList() only ever showed a faction's recent POLICY
// modifiers (f.modifiers), never the ongoing structural drivers that move its approval every
// single tick -- growth, unemployment/environment, and Stage D1's cost-of-living sensitivity were
// all completely invisible to the player. Pulled out of tick()'s faction loop into this one shared
// function (tick() now calls it too, below) instead of a second copy of the same math, the same
// discipline getCostOfLivingTarget()/getCostOfLivingBreakdown() already established -- two
// formulas computing the same thing are two formulas that can quietly drift apart.
function getFactionApprovalBreakdown(fOrName) {
    // Same object-or-name flexibility as getEffectivenessBreakdown() -- tick() already has the
    // real faction object on hand, but a UI onclick (global scope, no closures) only has a name.
    const f = typeof fOrName === 'string' ? state.factions.find(x => x.name === fOrName) : fOrName;
    if (!f) return {};
    const terms = {};
    terms["ภาวะเศรษฐกิจโดยรวม (Growth)"] = (state.world.growth / 10) * (f.wealth / 100) * 0.08;
    if (f.name === "สิ่งแวดล้อม") terms["สภาพแวดล้อมของประเทศ"] = (state.world.environment - 55) * 0.03;
    if (f.name === "คนว่างงาน" || f.name === "แรงงาน") terms["อัตราการว่างงาน"] = -(state.world.unemployment - 20) * 0.03;
    const sensitivity = Data.COST_OF_LIVING_SENSITIVITY[f.name];
    if (sensitivity) {
        let costBias = 0;
        Object.entries(sensitivity).forEach(([cat, weight]) => { costBias -= ((state.world.costOfLiving?.[cat] ?? 50) - 50) * weight * 0.006; });
        terms["ค่าครองชีพที่กลุ่มนี้เจอ"] = costBias;
    }
    terms["แนวโน้มกลับสู่ปกติ"] = (50 - f.approval) * 0.01;
    return terms;
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
    // Coefficient was originally 0.16 -- see the faction tick loop's growthBias comment (same
    // file) for the runaway this coupling caused and why both sides needed cutting together.
    const breakdown = {
        "แรงหนุนจากกลุ่มผลประโยชน์": weightedApproval * 0.04,
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
        // Emergent Chain Verification (Balance Pass v1 Phase 5): same migrationSwing term
        // getProvinceVoteShare() uses, kept in sync for the same reason investmentSwing/legacyBonus
        // already are here -- otherwise the preview would show a different picture than the real
        // election it's meant to be a readable stand-in for.
        const migrationSwing = (prov.popTrend ?? 0) * 3000;
        const weights = state.parties.map(p => {
            const bonus = affinity && p.ideologies.includes(affinity) ? 25 : 0;
            const govBonus = p.status === "Government" ? investmentSwing + migrationSwing : 0;
            // Long Campaign (Phase 7): a term's worth of campaignProvince() visits pays off
            // here, the same way pork-barrel investment does for whoever's in government --
            // the one electoral lever available to the player regardless of party status.
            const campaignBonus = p.id === state.player.party.id ? (prov.playerCampaignBoost || 0) : 0;
            // Long-term Political Memory (Stage D3): a party's multi-term record (broken
            // promises, ideology flip-flops, crises it survived or didn't) now has real
            // electoral weight, not just this term's popularity/investment/campaign numbers.
            const legacyBonus = ((p.legacyTrust ?? 60) - 60) * 0.4;
            return { party: p, weight: Math.max(1, p.popularity + bonus + govBonus + campaignBonus + legacyBonus + (Math.random() * 10 - 5)) };
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
    else {
        if (minister.trait.goal === p.goal) { fitMultiplier = 1.15; fitLabel = `${minister.name}สนใจประเด็นนี้เป็นพิเศษ`; }
        else if (ideologiesConflict(minister.trait.ideology, p.ideology)) { fitMultiplier = 0.7; fitLabel = `${minister.name}ไม่เห็นด้วยกับแนวทางนี้`; }
        else { fitMultiplier = 1.0; fitLabel = `${minister.name}ดูแลตามปกติ`; }
        // Opposition Gameplay v2 (Stage C5): a minister who shadowed this exact ministry while in
        // opposition (assignShadowMinister()) already studied the brief -- a small but real edge,
        // and the payoff that makes building a shadow cabinet worth doing before you're back in power.
        if (minister.shadowedMinistries?.[p.ministry]) { fitMultiplier += 0.1; fitLabel += ` (เคยเป็นรัฐมนตรีเงากระทรวงนี้)`; }
    }

    // Budget Coverage reads the same fiscalCondition tag Phase 1/2 already computes -- a policy
    // costing a few billion barely dents a multi-trillion treasury on paper, but a government
    // already in a tight or over-stretched fiscal position can't actually staff and fund it in full.
    const fiscal = getNationalContext().fiscalCondition;
    const budgetMultiplier = fiscal === "Debt Stress" ? 0.5 : fiscal === "Tight" ? 0.75 : 1;

    // Fiscal Emergency (Balance Pass v1): budgetMultiplier above only reads the recent TREND (is
    // the treasury rising or falling right now), so a budget that's already near empty but holding
    // flat read as fully funded. This second, separate multiplier reads the absolute depletion
    // level (state.world.fiscalStress, see getBudgetCoverage()) -- a government genuinely out of
    // money can't staff and fund new policy at full strength even in a quiet, trend-flat month.
    const fiscalStressMultiplier = Math.max(0.4, 1 - (state.world.fiscalStress ?? 0) / 100 * 0.5);

    const effectiveness = Math.max(0.2, capacityMultiplier * fitMultiplier * budgetMultiplier * fiscalStressMultiplier);
    return { effectiveness, capacityMultiplier, fitMultiplier, fitLabel, budgetMultiplier, fiscalStressMultiplier, workload };
}
// Better Why System (Stage D4): "ทำไม policy effectiveness ต่ำ" -- getImplementationEffectiveness()
// above already computes the real three multipliers, but only fitLabel (one of the three) ever
// reached the player, as plain text with no numbers. Effectiveness is a PRODUCT of these three,
// not a sum, so showWhy()'s ranked-list display can't literally add up to it -- each term here is
// that factor's own % deviation from "full effectiveness" (1.0), which stays additive-compatible
// for display while still being read directly off the real multiplier, not invented after the fact.
function getEffectivenessBreakdown(pOrName) {
    // Accepts either the policy object directly or its name -- UI onclick handlers run in global
    // scope where only window.engine/window.ui are exposed (not Data), so a why-button that needs
    // to look a template up by name has to do it in here, where Data is a normal module import.
    const p = typeof pOrName === 'string' ? Data.POLICY_TEMPLATES.find(t => t.name === pOrName) : pOrName;
    if (!p) return {};
    const { capacityMultiplier, fitMultiplier, fitLabel, budgetMultiplier, fiscalStressMultiplier, workload } = getImplementationEffectiveness(p);
    return {
        [`ภาระงานกระทรวง (${workload.toFixed(0)}%)`]: (capacityMultiplier - 1) * 100,
        [fitLabel]: (fitMultiplier - 1) * 100,
        "แนวโน้มงบประมาณช่วงนี้": (budgetMultiplier - 1) * 100,
        [`ภาวะฉุกเฉินทางการคลัง (งบเหลือ ${(state.world.budgetCoverage ?? 100).toFixed(0)}%)`]: (fiscalStressMultiplier - 1) * 100
    };
}

// Legacy Trust v2 (Balance Pass v1): "ทำไม Legacy Trust ขึ้น/ลง" -- each sub-dimension's own
// deviation from its 60 baseline, the same additive-deviation display convention
// getEffectivenessBreakdown() above uses. Accepts either the party object or its name, same
// object-or-name flexibility as every other why-button (onclick handlers run in global scope).
function getLegacyBreakdown(partyOrName) {
    const party = typeof partyOrName === 'string' ? state.parties.find(x => x.name === partyOrName) : partyOrName;
    if (!party || !party.legacy) return {};
    return {
        "ความซื่อตรง/โปร่งใส (Integrity)": party.legacy.integrity - 60,
        "การส่งมอบนโยบาย (Delivery)": party.legacy.delivery - 60,
        "เสถียรภาพการปกครอง (Governance)": party.legacy.governance - 60,
        "ความสม่ำเสมอของจุดยืน (Consistency)": party.legacy.consistency - 60
    };
}

// UI/Explainability (Balance Pass v1 Phase 6): "สรุปปีล่าสุด: สิ่งที่ดีขึ้น/แย่ลง/ความเสี่ยง" --
// compares live current stats against yearStartSnapshot (tick()/init() freeze one at the start of
// each calendar year), same before/after comparison the doc's own Monte Carlo phase used, just
// live and readable in the UI instead of an offline script. A stat under its noise threshold
// (deliberately larger than a rounding error, smaller than what a single event usually moves)
// shows in neither list rather than cluttering the summary with noise.
function getAnnualSummary() {
    const snap = state.world.yearStartSnapshot;
    if (!snap) return { improved: [], worsened: [], risks: [], sinceDate: null };
    const cost = state.world.costOfLiving;
    const avgCostNow = (cost.food + cost.energy + cost.housing + cost.industrial + cost.transport) / 5;
    const compare = (label, curr, prev, goodDirection, threshold) => {
        const delta = curr - prev;
        if (Math.abs(delta) < threshold) return null;
        return { label, delta: +delta.toFixed(1), isGood: goodDirection > 0 ? delta > 0 : delta < 0 };
    };
    const items = [
        compare("ความนิยมรัฐบาล", state.world.approval, snap.approval, 1, 1),
        compare("อัตราการเติบโตเศรษฐกิจ", state.world.growth, snap.growth, 1, 0.3),
        compare("ความโปร่งใส", state.world.transparency, snap.transparency, 1, 2),
        compare("เสถียรภาพคณะรัฐมนตรี", state.world.cabinetStability, snap.cabinetStability, 1, 2),
        compare("ค่าครองชีพเฉลี่ย", avgCostNow, snap.avgCostOfLiving, -1, 1),
        compare("ชื่อเสียงระยะยาวของพรรคท่าน", state.player.party.legacyTrust ?? 60, snap.legacyTrust, 1, 1),
        compare("ที่นั่งของพรรคท่านในสภา", state.player.party.seats, snap.seats, 1, 1),
        compare("งบประเทศ", state.world.nationalBudget / 1e9, snap.nationalBudget / 1e9, 1, 5),
    ].filter(Boolean);
    const risks = [];
    [["protestPressure", "แรงกดดันประท้วง"], ["coalitionCollapsePressure", "ความเสี่ยงพรรคร่วมแตก"],
     ["economicCrisisPressure", "ความเสี่ยงวิกฤตเศรษฐกิจ"], ["coupPressure", "ความเสี่ยงรัฐประหาร"],
     ["fiscalStress", "ภาวะการคลังตึงตัว"]].forEach(([key, label]) => {
        const v = state.world[key] ?? 0;
        if (v > 25) risks.push({ label, value: +v.toFixed(0), level: v > 75 ? "วิกฤต" : v > 50 ? "สูง" : "เริ่มสูง" });
    });
    return { improved: items.filter(i => i.isGood), worsened: items.filter(i => !i.isGood), risks, sinceDate: snap.date };
}

// UI/Explainability (Balance Pass v1 Phase 6): "Timeline เหตุการณ์สำคัญของรัฐบาล" -- merges the
// player's own party legacyHistory (broken promises, ideology flips, confidence votes survived/
// lost) with the national crisisTriggerLog (coup/no-confidence triggers) into one chronological
// read, sorted by the real timestamp both logs now carry (their display date strings are Thai
// Buddhist-calendar D/M/Y text, not sortable). Both source logs are already the curated,
// significant-event lists (not routine monthly noise), so no extra filtering needed here.
function getGovernmentTimeline() {
    const party = state.player.party;
    const legacyEvents = (party.legacyHistory || []).map(e => ({ date: e.date, ts: e.ts ?? 0, label: e.label, delta: e.delta, kind: 'legacy' }));
    const crisisEvents = (state.crisisTriggerLog || []).map(e => ({
        date: e.date, ts: e.ts ?? 0,
        label: e.type === 'coup' ? 'ความกดดันรัฐประหารถึงจุดวิกฤต' : 'ญัตติไม่ไว้วางใจถูกยื่น',
        delta: null, kind: e.type
    }));
    return [...legacyEvents, ...crisisEvents].sort((a, b) => b.ts - a.ts);
}

// Faction Response v2 (Stage D2): a faction used to feel a policy's impact.<factionName> exactly
// as written on the template, every time, in every era -- getImplementationEffectiveness() above
// already scales the LEGAL effect down by state capacity, but the raw number a faction actually
// FEELS never adjusted for the faction's own real circumstances. Reads the 5 things the roadmap
// names: income (f.wealth -- a poorer faction feels the same nominal move more), unemployment
// (a faction with a real stake in jobs reacts harder during a genuine slump), cost of living
// (reuses Stage D1's COST_OF_LIVING_SENSITIVITY -- an already-squeezed faction is more reactive),
// province (a policy lands harder on a faction whose home provinces -- prov.baseFaction match --
// are already neglected), and institutionalLegitimacy (a cynical public discounts good news and
// believes bad news more readily). Policy memory is handled separately in finalizeVote() (the
// same template's own persistent enactCount, incremented there) since it needs to mutate state
// once per real enactment, not just read it. Together this is also what makes "the same policy in
// different eras affects factions differently" (the roadmap's third ask) fall out for free: the
// multiplier moves with real game state, not a fixed lookup, so the identical template.impact
// value plays out differently depending on when in a given game's history it actually passes.
function getFactionResponseBreakdown(factionName, template) {
    const f = state.factions.find(x => x.name === factionName);
    if (!f) return {};

    const terms = {};
    // Income: wealth 0 -> 1.33x, wealth 100 -> 0.67x, wealth 50 (neutral) -> 1x.
    terms["รายได้ของกลุ่ม"] = (50 - f.wealth) / 150;
    // Unemployment: only factions with a real material stake in jobs (below-median wealth) feel this.
    if (f.wealth < 40) terms["ภาวะว่างงานสูง"] = Math.max(0, state.world.unemployment - 20) / 100;
    // Cost of living (Stage D1 reuse): how far this faction's own weighted cost exposure sits from neutral.
    const sensitivity = Data.COST_OF_LIVING_SENSITIVITY[factionName];
    if (sensitivity) {
        const entries = Object.entries(sensitivity);
        const avgDeviation = entries.reduce((s, [cat, w]) => s + Math.abs((state.world.costOfLiving?.[cat] ?? 50) - 50) * Math.abs(w), 0) / entries.length;
        terms["ค่าครองชีพของกลุ่มนี้"] = avgDeviation / 80;
    }
    // Province: this faction's home provinces (baseFaction match), how neglected they already are.
    const homeProvinces = state.provinces.filter(p => p.baseFaction === factionName);
    if (homeProvinces.length > 0) {
        const avgInvestment = homeProvinces.reduce((s, p) => s + (p.investmentLevel ?? 50), 0) / homeProvinces.length;
        terms["จังหวัดฐานเสียงถูกทอดทิ้ง"] = Math.max(0, 50 - avgInvestment) / 150;
    }
    return terms;
}
function getFactionResponseMultiplier(factionName, rawValue, template, proposingParty) {
    const terms = getFactionResponseBreakdown(factionName, template);
    let mult = Math.max(0.4, Math.min(2.2, 1 + Object.values(terms).reduce((s, v) => s + v, 0)));
    let adjusted = rawValue * mult;

    // Legitimacy: below institutionalLegitimacy's own long-run comfortable range (Phase 1 treats
    // 60+ as healthy), a cynical public discounts a policy's good news and believes its bad news
    // more readily -- the same directional skew real approval-rating research finds.
    const legitimacyGap = Math.max(0, 60 - (state.world.institutionalLegitimacy ?? 70));
    if (legitimacyGap > 0) {
        adjusted *= adjusted > 0 ? Math.max(0.4, 1 - legitimacyGap / 100) : 1 + legitimacyGap / 150;
    }

    // Long-term Political Memory (Stage D3): the same discount/belief asymmetry as institutional
    // legitimacy above, but keyed to the SPECIFIC party enacting this policy -- a government with
    // a poor multi-term record (broken promises, flip-flopped ideology, crises it didn't survive)
    // gets less credit for good news and more blame for bad, on top of the national mood.
    const legacyGap = Math.max(0, 60 - (proposingParty?.legacyTrust ?? 60));
    if (legacyGap > 0) {
        adjusted *= adjusted > 0 ? Math.max(0.5, 1 - legacyGap / 120) : 1 + legacyGap / 180;
    }

    // Policy memory: the same template enacted before (template.enactCount, incremented once per
    // real enactment in finalizeVote()) lands softer each repeat -- voters get less moved by a
    // promise that's already been made, especially one that evidently hasn't solved the problem
    // it targets or they wouldn't be hearing it again. Same shape as every other saturation
    // mechanic already in the game (campaignSaturation, lobbySaturation, oppStanceSaturation).
    const enactCount = template?.enactCount || 0;
    if (enactCount > 0) adjusted *= Math.max(0.35, 1 - enactCount * 0.2);

    return adjusted;
}

// AI Government Behavior v2 (Stage C3): aiPropose() used to grab a fully random MP and a fully
// random policy template -- no reading of ideology, which faction is hurting, which national
// stat is worst, coalition demand, or how close the next election is, exactly the gap the
// roadmap calls out. Once a policy passes, finalizeVote() already runs it through
// getImplementationEffectiveness() and the same faction/world-stat/foreign consequences a
// player's own policy gets, regardless of who proposed it -- the "same state capacity, real
// consequences" half of AI Government Behavior v2 was already true structurally; this is the
// selection half.
function scoreAIPolicy(template, drivingParty) {
    let score = 0;
    // Ideology: does this fit what the governing coalition actually stands for?
    const govParties = state.parties.filter(p => p.status === "Government");
    if (govParties.some(p => p.ideologies.includes(template.ideology))) score += 20;
    // Party Personality (Stage C4): on top of the coalition-wide terms below, the specific party
    // actually driving this proposal weighs it by its own lasting priority lean -- a party whose
    // bias runs toward สวัสดิการ pushes welfare bills more often than one leaning ความมั่นคง would,
    // even inside the same coalition. drivingParty.priority drifts slowly (see
    // updatePartyPriorities()) so this bias adapts rather than staying a fixed pattern forever.
    if (drivingParty && template.category && drivingParty.priority) {
        score += (drivingParty.priority[template.category] || 0) * 0.4;
    }
    // Faction pressure: a template that helps (positive impact on) a currently unhappy target
    // faction is more urgent than one that helps a faction already doing fine.
    const targetFaction = state.factions.find(f => f.name === template.target);
    if (targetFaction && targetFaction.approval < 45 && (template.impact?.[template.target] || 0) > 0) {
        score += (45 - targetFaction.approval) * 0.8;
    }
    // Economic context: reward whichever national stat this policy actually improves, weighted
    // by how far that stat currently sits from where it should be.
    Object.entries(template.worldImpact || {}).forEach(([stat, impact]) => {
        const meta = Data.WORLD_STAT_META[stat]; if (!meta) return;
        const value = state.world[stat] ?? meta.baseline;
        const badness = meta.goodDirection > 0 ? Math.max(0, meta.baseline - value) : Math.max(0, value - meta.baseline);
        const helps = meta.goodDirection > 0 ? impact > 0 : impact < 0;
        if (helps) score += badness * 0.5;
    });
    // Coalition demand: the neediest partner (highest dependence -- Phase 3) gets some weight
    // toward whatever it's actually pushing for, the same way a real coalition partner would.
    const neediest = govParties.filter(p => p.id !== state.player.party.id).sort((a, b) => (b.dependence || 0) - (a.dependence || 0))[0];
    if (neediest && (neediest.ideologies.includes(template.ideology) || neediest.goals.includes(template.goal))) {
        score += (neediest.dependence || 0) * 0.3;
    }
    // Election proximity: with a vote coming up, a bill that can actually land before polling
    // day is worth more than one still in committee -- prefer faster deliberation times.
    const daysToElection = state.world.electionDay ? Math.round((state.world.electionDay - state.date) / 86400000) : 9999;
    if (daysToElection < 180) score += Math.max(0, 60 - template.delibTime) * 0.3;
    return score;
}

// AI Party Personality (Stage C4): each party's lasting lean across the 4 PRIORITY_CATEGORIES,
// one clearly dominant so parties actually read as different from each other instead of all
// scoring templates the same way. Reused both at party creation and after an election punishes
// a party badly enough to pick a new leader (applyElectionPunishment()).
function generatePartyPriority() {
    const dominant = Data.PRIORITY_CATEGORIES[Math.floor(Math.random() * Data.PRIORITY_CATEGORIES.length)];
    const priority = {};
    Data.PRIORITY_CATEGORIES.forEach(c => { priority[c] = c === dominant ? 40 + Math.random() * 30 : Math.random() * 25; });
    return priority;
}

// A party's priority is a bias, not a fixed pattern (roadmap's own wording) -- it should drift
// toward what the world and the party's own base actually need, not just sit at its starting
// roll forever. Called monthly (in processMonthlyUpdate()) so the drift stays slow and readable
// as a lasting lean rather than something that swings with every tick like a pressure stat.
//
// Anchored to party.basePriority (the fixed roll from generatePartyPriority(), unchanged except
// on a leadership change), NOT to party.priority's own current value -- an early version targeted
// current-value-plus-badness, which meant the target itself rose every time priority rose, so any
// persistent badness ratcheted priority toward 100 forever with nothing to pull it back down once
// conditions improved (confirmed in testing: after ~16 elections/64 years, 3 of 4 categories had
// pinned at 99.99 on multiple parties, erasing the "one clearly dominant lean" the whole feature
// is meant to show). Anchoring to a fixed base means the target -- and priority behind it --
// actually falls back when the badness that pushed it up goes away, a real adapt-and-recede bias
// instead of a one-way ratchet.
function getPartyPriorityTarget(party) {
    const unemploymentBadness = Math.max(0, state.world.unemployment - Data.WORLD_STAT_META.unemployment.baseline);
    const crimeBadness = Math.max(0, state.world.crime - Data.WORLD_STAT_META.crime.baseline);
    const envBadness = Math.max(0, Data.WORLD_STAT_META.environment.baseline - state.world.environment);
    const securityBadness = Math.max(0, state.world.protestPressure - 30) + Math.max(0, Data.WORLD_STAT_META.military.baseline - state.world.military);

    // Base pressure: a party whose own base is unhappy pivots toward bread-and-butter relief
    // regardless of its original ideology, the same way a real party chases its slipping base.
    const baseFaction = state.factions.find(f => f.name === party.baseFaction);
    const baseUnhappy = baseFaction ? Math.max(0, 45 - baseFaction.approval) : 0;

    const base = party.basePriority || party.priority;
    const target = { ...base };
    target["เศรษฐกิจ"] = (base["เศรษฐกิจ"] || 0) + unemploymentBadness * 0.3 + baseUnhappy * 0.15;
    target["สวัสดิการ"] = (base["สวัสดิการ"] || 0) + (unemploymentBadness + crimeBadness) * 0.2 + baseUnhappy * 0.15;
    target["สิ่งแวดล้อม"] = (base["สิ่งแวดล้อม"] || 0) + envBadness * 0.3;
    target["ความมั่นคง"] = (base["ความมั่นคง"] || 0) + securityBadness * 0.25;
    Data.PRIORITY_CATEGORIES.forEach(c => { target[c] = Math.max(0, Math.min(100, target[c])); });
    return target;
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
        // Balance Pass v1 correction: a first pass here called the getXBreakdown() why-panel
        // functions directly instead of duplicating each formula, on the assumption the two were
        // just accidentally-duplicated copies of the same math (the "shared pure function"
        // pattern the project keeps having to apply elsewhere). They're NOT -- the breakdown
        // functions floor each individual term at 0 on purpose, so a term literally labeled
        // "transparency is low" never shows a confusing negative contribution when transparency
        // is actually high. The calculation below intentionally allows a strongly healthy term to
        // go negative and offset a bad one before the total is clamped, which per-term flooring
        // silently removes -- verified by testing: it turned every one of these pressures strictly
        // non-decreasing across mixed-signal scenarios, which was the direct cause of a coup-rate
        // explosion found in Monte Carlo testing (even the Passive control, which never coups
        // otherwise, started coup-ing within ~8 years). Reverted to the original raw-sum-then-
        // clamp formula; only the four getXBreakdown() functions stay in sync for their own
        // why-panel/telemetry callers, not for driving the actual pressure value.
        const targetPressure = Math.max(0, Math.min(100,
            (state.world.unemployment - 15) * 1.5 +
            (state.world.crime - 30) * 1.0 +
            (50 - state.world.approval) * 1.2 +
            (100 - state.world.transparency) * 0.3
        ));
        state.world.protestPressure = Math.max(0, Math.min(100, state.world.protestPressure + (targetPressure - state.world.protestPressure) * 0.05 * state.speed));

        // Event Pressure Framework (Stage C1): the same structural-buildup treatment for the
        // three other trigger checks below, which used to be a flat or hard-gated random roll.
        const coalitionParties = state.parties.filter(p => p.status === "Government" && p.id !== state.player.party.id);
        const avgCoalitionTrust = coalitionParties.length > 0 ? coalitionParties.reduce((s, p) => s + (p.trust ?? 70), 0) / coalitionParties.length : 100;
        const targetCollapsePressure = Math.max(0, Math.min(100,
            (70 - avgCoalitionTrust) * 1.2 +
            (50 - state.world.cabinetStability) * 0.8 +
            (40 - state.world.approval) * 0.6
        ));
        state.world.coalitionCollapsePressure = Math.max(0, Math.min(100, state.world.coalitionCollapsePressure + (targetCollapsePressure - state.world.coalitionCollapsePressure) * 0.05 * state.speed));

        // Fiscal Emergency (Balance Pass v1): computed before economicCrisisPressure below so that
        // term can read this tick's fresh fiscalStress value instead of lagging a full tick behind.
        // budgetCoverage itself is a plain ratio (not drifted) since it should always reflect the
        // treasury's real, current state -- only fiscalStress (built from it) drifts slowly, same
        // as every other pressure stat.
        state.world.budgetCoverage = getBudgetCoverage();
        const targetFiscalStress = Math.max(0, Math.min(100, Object.values(getFiscalStressBreakdown()).reduce((s, v) => s + v, 0)));
        state.world.fiscalStress = Math.max(0, Math.min(100, (state.world.fiscalStress ?? 0) + (targetFiscalStress - (state.world.fiscalStress ?? 0)) * 0.05 * state.speed));
        const wasFiscalEmergency = !!state.world.fiscalEmergency;
        // Hysteresis (enter at 70, only clear below 50): without a gap, a budget hovering right at
        // one threshold would flip the status -- and re-fire the news item -- every few ticks.
        state.world.fiscalEmergency = wasFiscalEmergency ? state.world.fiscalStress > 50 : state.world.fiscalStress > 70;
        // Latch flags (not a history lookup, which only updates monthly while tick() runs daily):
        // each one-shot news item fires once on the way up past its threshold and re-arms once
        // stress drops back below it, the same hysteresis shape as fiscalEmergency itself.
        if (state.world.fiscalEmergency && !wasFiscalEmergency) {
            engine.addNews("ภาวะฉุกเฉินทางการคลัง!", `งบประเทศเหลือเพียง ${state.world.budgetCoverage.toFixed(0)}% ของระดับปกติ ประสิทธิผลนโยบายและความเชื่อมั่นจะลดลงจนกว่าฐานะการคลังจะฟื้น`);
        } else if (!state.world.fiscalEmergency && wasFiscalEmergency) {
            engine.addNews("พ้นภาวะฉุกเฉินทางการคลัง", "ฐานะการคลังฟื้นตัวกลับสู่ระดับที่รับมือได้แล้ว");
        } else if (!state.world.fiscalEmergency && state.world.fiscalStress > 50 && !state.world.fiscalWatchWarned) {
            state.world.fiscalWatchWarned = true;
            engine.addNews("เตือนภัยการคลัง", `งบประเทศเริ่มตึงตัว (เหลือ ${state.world.budgetCoverage.toFixed(0)}%) หากปล่อยต่อเนื่องอาจเข้าสู่ภาวะฉุกเฉิน`);
        } else if (state.world.fiscalStress <= 50) {
            state.world.fiscalWatchWarned = false;
        }

        // fiscalStress*0.3 replaces the old 3-tier fiscalStrain term (see getEconomicCrisisBreakdown()'s
        // own comment) -- it's already non-negative by construction, so no floor-mismatch risk here.
        const targetEconomicPressure = Math.max(0, Math.min(100,
            Math.max(0, -state.world.growth) * 1.5 +
            (state.world.unemployment - 20) * 1.2 +
            (state.world.fiscalStress ?? 0) * 0.3
        ));
        state.world.economicCrisisPressure = Math.max(0, Math.min(100, state.world.economicCrisisPressure + (targetEconomicPressure - state.world.economicCrisisPressure) * 0.05 * state.speed));

        const army = state.factions.find(f => f.name === "กองทัพ");
        const armyApproval = army ? army.approval : 50;
        const targetCoupPressure = Math.max(0, Math.min(100,
            (40 - state.world.transparency) * 0.8 +
            (50 - armyApproval) * 0.6 +
            (40 - state.world.cabinetStability) * 0.5 +
            (state.world.protestPressure - 50) * 0.3
        ));
        state.world.coupPressure = Math.max(0, Math.min(100, state.world.coupPressure + (targetCoupPressure - state.world.coupPressure) * 0.05 * state.speed));

        if(crossedDayOfMonth(prevDate, state.date, 15)) {
            // Proposal frequency now scales with urgency instead of a flat 10% roll -- a
            // government sitting on rising pressure or a close election should legislate more
            // often, not the same trickle as a calm term. Capped well under 1 so a bad month
            // doesn't guarantee a proposal every tick, which would itself become a spending
            // feedback loop worth checking for in calm-baseline testing (same class of bug as
            // the Stage C1 economicCrisisPressure spiral).
            const urgency = Math.max(state.world.protestPressure, state.world.economicCrisisPressure, state.world.coalitionCollapsePressure) / 100;
            const daysToElection = state.world.electionDay ? Math.round((state.world.electionDay - state.date) / 86400000) : 9999;
            const proposeChance = 0.1 + urgency * 0.15 + (daysToElection < 180 ? 0.1 : 0);
            if (Math.random() < proposeChance) engine.aiPropose();
        }
        // Coalition Collapse Pressure now gates and scales this instead of a flat 0.05 roll behind
        // a hard approval/stability AND-gate -- a floor of 20 keeps ordinary governing from ever
        // rolling at all, same effective floor the old gate provided. player.position is just the
        // title chosen at setup and never changes after an ouster, so a no-confidence motion
        // against a player no longer actually governing needs the live party.status too -- a
        // pre-existing gap from before this pressure framework, surfaced by testing this check
        // firing far more often than intended once coalitionCollapsePressure genuinely rewards checking.
        if(crossedDayOfMonth(prevDate, state.date, 28) && state.player.position === "นายกรัฐมนตรี" && state.player.party.status === "Government" && state.world.coalitionCollapsePressure > 20) {
           const roll = Math.random(); const chance = (state.world.coalitionCollapsePressure / 100) * 0.3;
           const fired = roll < chance;
           if (fired) engine.logCrisisTrigger("noConfidence", getCoalitionCollapseBreakdown(), state.world.coalitionCollapsePressure, chance, roll);
           if (fired) engine.triggerNoConfidence();
        }
        // tick() fires once per real second regardless of state.speed, but each tick now covers
        // `state.speed` in-game days -- so every random-event check below is scaled by state.speed
        // too, or a player idling at 3x would silently see ~3x fewer crises/incidents per in-game
        // year than one at 1x, purely as a side effect of the speed toggle. The crisis roll now
        // reads whichever of protest/economic pressure is higher: either building up is enough to
        // make *a* crisis likely, and triggerCrisis() itself picks the type from their relative share.
        if(Math.random() < (0.01 + (Math.max(state.world.protestPressure, state.world.economicCrisisPressure) / 100) * 0.03) * state.speed) engine.triggerCrisis();
        // Coup Pressure replaces the old hard transparency<40 AND army<50 gate -- both terms
        // already feed the pressure itself, continuously, instead of an all-or-nothing switch.
        // Crisis Calibration (Balance Pass v1 Phase 2): 50-seed Monte Carlo testing found this
        // roll firing from coupPressure as low as 6-25 (nowhere near its 100 cap) -- at ~122
        // ticks/year, even a ~0.5-1% per-tick chance compounds to near-certainty within 1-4 years,
        // so Corrupt and Populist were coup-ing 10/10 seeds every time, purely from RNG
        // accumulation at a mildly elevated pressure sustained long enough, not from pressure ever
        // genuinely reaching crisis levels. triggerNoConfidence() above already guards its own
        // roll behind a `> 20` floor on its pressure for exactly this reason; coupPressure never
        // had the same floor. Gated at 35 (close to where at least one of the breakdown's own
        // 40/40/50-threshold terms has to be substantially active, not just barely nonzero) --
        // logged AND rolled only once pressure has genuinely built, not from month one.
        if (state.world.coupPressure > 35) {
            const roll = Math.random(); const chance = (state.world.coupPressure / 100) * 0.015 * state.speed;
            const fired = roll < chance;
            if (fired) engine.logCrisisTrigger("coup", getCoupBreakdown(), state.world.coupPressure, chance, roll);
            if (fired) engine.triggerCoup();
        }
        
        // The 5 policy-driven national stats: apply/decay their modifiers, then drift back
        // toward baseline like faction/party trust does, so a policy's effect fades unless renewed.
        Object.entries(Data.WORLD_STAT_META).forEach(([stat, meta]) => {
            const mods = state.world.statMods[stat] || (state.world.statMods[stat] = []);
            mods.forEach(m => { state.world[stat] = Math.max(0, Math.min(100, state.world[stat] + m.perDay * state.speed)); m.remaining -= state.speed; });
            state.world.statMods[stat] = mods.filter(m => m.remaining > 0);
            state.world[stat] = Math.max(0, Math.min(100, state.world[stat] + (meta.baseline - state.world[stat]) * 0.002 * state.speed + (Math.random() - 0.5) * 0.1 * state.speed));
        });

        // Economic Pressure v1 (Stage D1): same decaying-modifier sweep as the WORLD_STAT_META
        // loop above (applyWorldStatImpact() already works on any stat name, cost categories
        // included -- triggerCrisis()'s Economic branch uses it as the "external shock" channel),
        // but blended toward a live getCostOfLivingTarget() instead of a fixed meta.baseline --
        // these are derived from production/trade/unemployment/industry mix every tick, not
        // something a policy sets directly, so a fixed-baseline pull would fight the real target.
        const costTarget = getCostOfLivingTarget();
        Data.COST_OF_LIVING_CATEGORIES.forEach(cat => {
            const mods = state.world.statMods[cat] || (state.world.statMods[cat] = []);
            mods.forEach(m => { state.world.costOfLiving[cat] = Math.max(0, Math.min(100, state.world.costOfLiving[cat] + m.perDay * state.speed)); m.remaining -= state.speed; });
            state.world.statMods[cat] = mods.filter(m => m.remaining > 0);
            state.world.costOfLiving[cat] = Math.max(0, Math.min(100, state.world.costOfLiving[cat] + (costTarget[cat] - state.world.costOfLiving[cat]) * 0.05 * state.speed));
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
            // Growth<->approval coupling history (why growthBias was cut 0.3->0.08, costBias
            // 0.02->0.006, and normalcyPull added) is now on getFactionApprovalBreakdown() (Stage
            // D4) -- the single shared formula this loop and the faction-list why-button both use.
            const bias = Object.values(getFactionApprovalBreakdown(f)).reduce((s, v) => s + v, 0);
            f.approval = Math.max(0, Math.min(100, f.approval + (Math.random() - 0.5) * 1.5 + bias * state.speed));
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

        // UI/Explainability (Balance Pass v1 Phase 6): "สรุปปีล่าสุด" -- a frozen snapshot of the
        // key stats taken once at the start of each calendar year, so getAnnualSummary() can
        // compare the live current numbers against where the year began, instead of the player
        // having to remember. Overwritten once a year, at the boundary, so it always reads
        // "since this year started" for the rest of the year.
        if (prevDate.getFullYear() !== state.date.getFullYear()) {
            const cost = state.world.costOfLiving;
            state.world.yearStartSnapshot = {
                date: state.date.toLocaleDateString('th-TH'),
                approval: state.world.approval, growth: state.world.growth,
                transparency: state.world.transparency, cabinetStability: state.world.cabinetStability,
                avgCostOfLiving: (cost.food + cost.energy + cost.housing + cost.industrial + cost.transport) / 5,
                legacyTrust: state.player.party.legacyTrust ?? 60,
                seats: state.player.party.seats,
                nationalBudget: state.world.nationalBudget,
            };
        }

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
    getNationalContext, getProvinceContext, getPressureBreakdown, getApprovalBreakdown, getFactionApprovalBreakdown, getGrowthBreakdown, getCabinetStabilityBreakdown, getMPElectoralRisk, getImplementationEffectiveness, getTradeExposure, getProductionBreakdown, getSocietyContext, getClassCompositionBreakdown, getPoliticalClimateBreakdown, getProvinceVoteShare, getProvinceVoteShareBreakdown, getProvincePoliticalLayer, getBattlegroundProvinces, getCoalitionCollapseBreakdown, getEconomicCrisisBreakdown, getCoupBreakdown, getCostOfLivingBreakdown, getFactionResponseBreakdown, getFactionResponseMultiplier, getEffectivenessBreakdown, getLegacyBreakdown, getFiscalStressBreakdown, getBudgetCoverage, getAnnualSummary, getGovernmentTimeline,

    init() {
        state.voteModifier = null;
        state.world.transparency = 100;
        state.world.stabilityPenalty = 0;
        Object.entries(Data.WORLD_STAT_META).forEach(([stat, meta]) => { state.world[stat] = meta.baseline; });
        state.world.statMods = { unemployment: [], crime: [], health: [], education: [], environment: [], military: [], food: [], energy: [], housing: [], industrial: [], transport: [] };
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
        // Event Pressure Framework (Stage C1): same day-one treatment for the other three
        // pressures -- computed from the real formula instead of the flat 0 placeholder.
        state.world.coalitionCollapsePressure = Math.max(0, Math.min(100, Object.values(getCoalitionCollapseBreakdown()).reduce((s, v) => s + v, 0)));
        // Fiscal Emergency (Balance Pass v1): computed before economicCrisisPressure below, same
        // ordering as tick(), since that breakdown now reads fiscalStress.
        state.world.budgetCoverage = getBudgetCoverage();
        state.world.fiscalStress = Math.max(0, Math.min(100, Object.values(getFiscalStressBreakdown()).reduce((s, v) => s + v, 0)));
        state.world.fiscalEmergency = state.world.fiscalStress > 70;
        state.world.fiscalWatchWarned = state.world.fiscalStress > 50;
        state.world.economicCrisisPressure = Math.max(0, Math.min(100, Object.values(getEconomicCrisisBreakdown()).reduce((s, v) => s + v, 0)));
        state.world.coupPressure = Math.max(0, Math.min(100, Object.values(getCoupBreakdown()).reduce((s, v) => s + v, 0)));
        // Economic Pressure v1 (Stage D1): same day-one treatment -- real production/trade/
        // unemployment/industry-mix numbers from turn one, not a flat 50 every game opens on
        // regardless of the province/industry mix just generated above.
        state.world.costOfLiving = getCostOfLivingTarget();

        // UI/Explainability (Balance Pass v1 Phase 6): day one counts as "the start of this year"
        // too, so getAnnualSummary() has something to compare against immediately instead of
        // reading empty until the first real year boundary (crossed in tick()) almost a year in.
        {
            const cost = state.world.costOfLiving;
            state.world.yearStartSnapshot = {
                date: state.date.toLocaleDateString('th-TH'),
                approval: state.world.approval, growth: state.world.growth,
                transparency: state.world.transparency, cabinetStability: state.world.cabinetStability,
                avgCostOfLiving: (cost.food + cost.energy + cost.housing + cost.industrial + cost.transport) / 5,
                legacyTrust: state.player.party.legacyTrust ?? 60,
                seats: state.player.party.seats,
                nationalBudget: state.world.nationalBudget,
            };
        }

        ui.renderCabinet(); ui.renderMinistryList();
        this.addNews("สภาสมัยประชุมเริ่มต้น", "สส. 500 ท่านเข้าประจำการเพื่อขับเคลื่อนแผ่นดิน");
        // A real baseline for every trend arrow and why-breakdown from the very first render,
        // instead of an empty history that would only start showing a trend a month in.
        for(let i=0; i<6; i++) { state.history.approval.push(state.world.approval); state.history.budget.push(state.world.nationalBudget); }
        ["growth", "cabinetStability", "protestPressure", "coalitionCollapsePressure", "economicCrisisPressure", "coupPressure", "fiscalStress"].forEach(key => {
            state.history[key] = [];
            for (let i = 0; i < 6; i++) state.history[key].push(state.world[key]);
        });
        // Economic Pressure v1 (Stage D1): flat "cost<Category>" history keys, matching the
        // existing flat state.history[key] convention rather than nesting an object per category.
        Data.COST_OF_LIVING_CATEGORIES.forEach(cat => {
            const key = "cost" + cat.charAt(0).toUpperCase() + cat.slice(1);
            state.history[key] = [];
            for (let i = 0; i < 6; i++) state.history[key].push(state.world.costOfLiving[cat]);
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
            investmentLevel: 50, modifiers: [], popTrend: 0
        }));

        // Capture today's production-per-capita as the neutral reference point, so growth is only
        // biased once industries actually out- or under-perform this starting mix -- not by the mix itself.
        const totalProduction = state.provinces.reduce((s, prov) => s + provinceOutput(prov), 0);
        state.world.baseProductionPerCapita = totalProduction / totalPop;

        // Economic Pressure v1 (Stage D1): same reasoning, for getCostOfLivingBreakdown()'s
        // industry-mix terms -- an earlier version compared each industry's output share against
        // a hand-guessed "neutral" percentage (e.g. food assumed 35% agri+fishing share), which
        // didn't match this game's actual randomly-generated province/industry mix (REGION_
        // INDUSTRY_DEFAULT + PROVINCE_INDUSTRY_OVERRIDES). Confirmed in a 30-year calm-baseline
        // run: cost indices settled structurally above 50 from day one (not from any real shock),
        // which fed a persistent drag through COST_OF_LIVING_SENSITIVITY into faction approval,
        // then into growth via computeGrowth()'s existing weightedApproval term, then back into
        // approval via the existing growthBias term -- growth got stuck at -6% to -9.5% and
        // laborApproval pinned at 0 for the entire run, never recovering. Capturing this game's
        // own actual day-one shares as the reference point (the same fix baseProductionPerCapita
        // already uses above) means the index only moves once the mix genuinely shifts from where
        // it started, not from a guess about what a "typical" mix should look like.
        const shareOf = (industryName) => state.provinces.filter(p => p.industry === industryName).reduce((s, p) => s + provinceOutput(p), 0) / (totalProduction || 1);
        state.world.costBaselineShares = {
            food: shareOf("เกษตรกรรม") + shareOf("ประมง"),
            energyDemand: shareOf("อุตสาหกรรม") + shareOf("เทคโนโลยี"),
            industrial: shareOf("อุตสาหกรรม"),
            transport: shareOf("โลจิสติกส์และการส่งออก"),
            housingDemand: shareOf("เทคโนโลยี") + shareOf("การท่องเที่ยว")
        };
    },

    generateGameParties() {
        const pArr = [];
        const colors = ["#f87171", "#60a5fa", "#fbbf24", "#34d399", "#a78bfa", "#f472b6", "#22c55e", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#6366f1", "#84cc16", "#eab308", "#d946ef", "#0ea5e9", "#475569"];
        const names = ["ไทสร้างชาติ", "อนาคตใหม่", "ธรรมนำไทย", "ประชาธิปัตย์", "ภูมิใจไทย", "ก้าวหน้า", "ชาติไทยพัฒนา", "เสรีรวมไทย", "พลังประชารัฐ", "เพื่อไทย", "ประชาชาติ", "สีเขียวไทย", "กิจสังคม", "นวัตกรรม", "มิตรภาพ", "ทางเลือกใหม่", "เกษตรกรรม", "แรงงาน", "ศาสนา", "เอกราช"];
        const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);
        
        for(let i=0; i<20; i++) {
            let size = i < 6 ? "Major" : (i < 12 ? "Medium" : "Small");
            const priority = generatePartyPriority();
            pArr.push({
                id: "P" + (i + 1), name: "พรรค" + names[i], size, color: colors[i],
                ideologies: shuffle(Data.IDEOLOGY_POOL).slice(0, size === "Major" ? 5 : (size === "Medium" ? 3 : 2)),
                goals: shuffle(Data.GOAL_POOL).slice(0, size === "Major" ? 5 : (size === "Medium" ? 3 : 2)),
                baseFaction: Data.FACTION_NAMES[Math.floor(Math.random() * Data.FACTION_NAMES.length)],
                status: "Opposition", seats: 0, trust: 70, popularity: 0,
                priority: { ...priority }, basePriority: priority, electoralPactWith: null,
                // Long-term Political Memory (Stage D3): a slow-moving record distinct from
                // party.trust above, which decays back to 70 within a month or two by design
                // (grudges/goodwill fade). legacyTrust barely moves month to month -- see
                // recordLegacyEvent()'s drift comment -- so it can actually hold a multi-term
                // reputation instead of resetting every time trust does.
                legacyTrust: 60, legacyHistory: [],
                // Legacy Trust v2 (Balance Pass v1): the four sub-scores legacyTrust above is now
                // a weighted blend of -- see recomputeLegacyTrust()/getLegacyBreakdown().
                legacy: { integrity: 60, delivery: 60, governance: 60, consistency: 60 },
                legacyTermCounts: {}, legacyBillFailures: {}
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

        // Opposition Gameplay v2 (Stage C5): a pre-election alliance (negotiateAlliance()) is a
        // commitment, not just a hope -- if either side of a pact ends up in government by the
        // above heuristic, the other rides in with them regardless of the usual ideology-conflict
        // filter. Doesn't rework the coalition-formation algorithm itself (too invasive for what's
        // meant to be an insurance policy on an existing government seat, not a guarantee of one),
        // so a pact only pays off when at least one side already made it in on its own. Consumed
        // once here -- a fresh negotiation is needed before the next election.
        pArr.forEach(p => {
            if (!p.electoralPactWith) return;
            const partner = pArr.find(x => x.id === p.electoralPactWith);
            if (partner && p.status === "Government" && partner.status !== "Government") partner.status = "Government";
        });
        pArr.forEach(p => { p.electoralPactWith = null; });
    },

    addNews(h, b = "") { state.news.unshift({ date: state.date.toLocaleDateString('th-TH'), headline: h, body: b || "วิเคราะห์สถานการณ์วันนี้..." }); ui.renderNews(); },

    // Long-term Political Memory (Stage D3): the single place every legacyTrust-moving event
    // (broken promise, ideology flip, crisis handled/failed, legitimacy built/destroyed) goes
    // through, so the log and the number can't drift apart. Capped at 20 like addNews() caps
    // nothing but everything else with a rolling list in this game caps somewhere -- long enough
    // to browse a party's real record, short enough not to grow forever over a 60-year game.
    // Legacy Trust v2 (Balance Pass v1): simulation testing found Reformist and Austerity -- both
    // just proposing legislation often -- driving legacyTrust from 60 to under 1 within a couple
    // of years, purely from event VOLUME, while Passive (proposing nothing) actually finished
    // higher than it started. A flat -8 per failed bill with no severity distinction and no
    // diminishing return on repeats was punishing activity itself, not bad governance.
    // dimension: one of 'integrity' | 'delivery' | 'governance' | 'consistency' -- the four
    // sub-scores legacyTrust is now a weighted blend of (see recomputeLegacyTrust()).
    // tier: severity, per the doc's own ordering (กฎหมายเล็กตก < นโยบายเรือธงตก < ผิดสัญญาหลัก <
    // วิกฤตความเชื่อมั่น) -- scales the raw delta so a minor bill failing barely registers next to
    // losing a confidence vote.
    recordLegacyEvent(party, delta, label, dimension = 'delivery', tier = 'minor') {
        if (!party) return;
        if (!party.legacy) {
            const seed = party.legacyTrust ?? 60;
            party.legacy = { integrity: seed, delivery: seed, governance: seed, consistency: seed };
        }
        if (!party.legacyTermCounts) party.legacyTermCounts = {};

        const TIER_WEIGHT = { minor: 0.5, flagship: 1.0, brokenPromise: 1.6, confidenceCrisis: 2.2 };
        const weight = TIER_WEIGHT[tier] ?? 1;

        // Diminishing repeat penalty: the SAME kind of bad news happening over and over within one
        // parliamentary term reads less like fresh information each time -- capped at a quarter
        // strength, not floored to zero, so repeats still cost something. Counter resets on the
        // next election (runElection()), so a new term starts with a clean slate.
        let repeatFactor = 1;
        if (delta < 0) {
            const key = `${dimension}:${tier}`;
            const count = party.legacyTermCounts[key] || 0;
            repeatFactor = Math.max(0.25, 1 - count * 0.15);
            party.legacyTermCounts[key] = count + 1;
        }

        const scaledDelta = delta * weight * repeatFactor;
        party.legacy[dimension] = Math.max(0, Math.min(100, party.legacy[dimension] + scaledDelta));
        this.recomputeLegacyTrust(party);

        party.legacyHistory = party.legacyHistory || [];
        // Balance Pass v1 Phase 6: ts alongside the display-formatted date -- state.date.toLocaleDateString('th-TH')
        // (Thai Buddhist calendar, D/M/Y) can't be re-parsed back into real chronological order,
        // which getGovernmentTimeline() below needs to merge this log with crisisTriggerLog.
        party.legacyHistory.unshift({ date: state.date.toLocaleDateString('th-TH'), ts: state.date.getTime(), label, delta: +scaledDelta.toFixed(1), dimension, tier });
        if (party.legacyHistory.length > 20) party.legacyHistory.length = 20;
    },

    // The single overall number every existing call site (getFactionResponseMultiplier,
    // runProvinceElection, negotiateAlliance, the Parliament table) already reads -- kept as a
    // plain weighted average so none of those needed to change, only how it's built underneath.
    // Governance and Integrity carry slightly more weight: a government's basic competence and
    // honesty matter more to its lasting reputation than any single bill's fate.
    recomputeLegacyTrust(party) {
        if (!party.legacy) return;
        const l = party.legacy;
        party.legacyTrust = Math.max(0, Math.min(100, l.integrity * 0.3 + l.delivery * 0.25 + l.governance * 0.25 + l.consistency * 0.2));
    },

    // Crisis Calibration (Balance Pass v1 Phase 2): "บันทึก coup trigger log ก่อนเกิดเหตุการณ์...
    // แสดง contribution ของ Transparency, Army Approval, Cabinet Stability, Protest Spillover...
    // บันทึก pressure และ random roll ณ เวลาที่ trigger" -- one shared logger for both coup and
    // no-confidence (same shape, just a different breakdown function feeding it), capped like
    // legacyHistory so a long game doesn't grow this unbounded.
    logCrisisTrigger(type, breakdown, pressure, rollChance, roll) {
        state.crisisTriggerLog = state.crisisTriggerLog || [];
        state.crisisTriggerLog.unshift({ date: state.date.toLocaleDateString('th-TH'), ts: state.date.getTime(), type, breakdown, pressure: +pressure.toFixed(1), rollChance: +rollChance.toFixed(4), roll: +roll.toFixed(4) });
        if (state.crisisTriggerLog.length > 50) state.crisisTriggerLog.length = 50;
    },

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

    // Same idea again, for any stat with a statMods channel: originally just the 6
    // WORLD_STAT_META stats a policy's worldImpact can move, now also the 5 Stage D1 cost-of-
    // living categories (external shocks -- see triggerCrisis()'s Economic branch). The old guard
    // here (`if (!Data.WORLD_STAT_META[stat]) return`) silently no-op'd on any other stat name,
    // which is exactly what it did to the food/energy shock calls below until caught in testing --
    // this function never actually reads anything else from WORLD_STAT_META[stat], so the guard
    // was only ever blocking legitimate generic use, not protecting against a real bug.
    applyWorldStatImpact(stat, value, source, days = 60) {
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

        // Fiscal Emergency (Balance Pass v1): revenue used to scale purely off the CURRENT
        // treasury, so a budget that reached zero collected zero tax forever -- a one-way trap
        // with no counter-force, unlike every other stat in the game. Splitting it into a
        // structural half (the underlying economy, tracked off REFERENCE_BUDGET so it doesn't
        // care how much cash the government currently has on hand) and a treasury-proportional
        // half (the original behavior, halved) keeps a healthy budget's income the same as before
        // while giving a depleted one a real, if slow, way back.
        const revenueRate = Math.max(0.0002, 0.0012 + state.world.growth * 0.0004 + tradeBonus);
        const structuralRevenue = REFERENCE_BUDGET * revenueRate * 0.5;
        const treasuryRevenue = state.world.nationalBudget * revenueRate * 0.5;
        const taxRevenue = structuralRevenue + treasuryRevenue;
        state.world.nationalBudget += taxRevenue;
        this.addNews("รายได้ภาษีประจำเดือน", `รัฐเก็บภาษีได้ ฿${(taxRevenue/1e9).toFixed(1)}B จากภาวะเศรษฐกิจที่เติบโต ${state.world.growth.toFixed(1)}% และการค้าระหว่างประเทศ`);

        // Fiscal Emergency (Balance Pass v1): running the state costs something even in a month
        // with no new legislation at all -- a small fixed maintenance burden, so a depleted
        // treasury doesn't just sit inert as an untouched resource bar. Modest next to a healthy
        // 3.4T budget, but real once the treasury is already thin.
        // Testing a forced-zero-budget scenario found the structural revenue floor above stops
        // the literal forever-zero trap, but a treasury already in fiscalEmergency has no real
        // way OUT: ongoing crisis activity (itself partly fed by fiscalStress feeding into
        // economicCrisisPressure) drains it about as fast as structural revenue refills it, so it
        // just oscillates near zero indefinitely -- exactly the "runaway that doesn't recover
        // without reason" the spec calls out. A government that recognizes it's in an emergency
        // cuts its own routine spending, same as any real austerity response -- so the fixed
        // burden shrinks sharply while fiscalEmergency holds, giving the structural floor enough
        // room to actually pull the treasury back out instead of just treading water.
        const fixedBurden = REFERENCE_BUDGET * (state.world.fiscalEmergency ? 0.00005 : 0.00035);
        state.world.nationalBudget -= fixedBurden;

        // Long-run Economic Drift (Balance Pass v1 Phase 3): an 80-year, zero-player-action Monte
        // Carlo test found nationalBudget on a genuine one-way structural decline -- consistently
        // negative slope across every seed (unlike growth/unemployment/cost-of-living, whose
        // slopes straddle zero, consistent with noise around a stable level, not real drift) --
        // from AI's own ongoing policy enactments outpacing the revenue/burden balance above, with
        // nothing pulling it back. Every OTHER float stat in this game has a baseline-reversion
        // term; nationalBudget was the one exception. A gentle pull toward 60% of the opening
        // treasury, not the full 100% -- some long-run fiscal erosion from real governing is
        // expected, just not an unbounded bleed toward zero regardless of anyone's choices.
        // Verification re-run at 0.003 (4 seeds, 80 years) still showed a real, if slower,
        // decline -- the pull was too weak to actually offset AI's ongoing enactment spending,
        // only softened it. Raised ~7x; re-verify below before trusting this constant either.
        state.world.nationalBudget += (REFERENCE_BUDGET * 0.6 - state.world.nationalBudget) * 0.02;

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
            const monthlyChange = migrationPull + nationalBaseline;
            prov.pop = Math.max(50000, Math.round(prov.pop * (1 + monthlyChange)));
            // Emergent Chain Verification (Balance Pass v1 Phase 5): "Local decline -> migration ->
            // vote share change -> election flip" checked out for "local decline -> vote share"
            // (investmentLevel already drives getProvinceVoteShare()'s investmentSwing directly),
            // but migration itself was a dead end -- population moved provinces around with zero
            // path back into any election. A province can be genuinely emptying out for reasons
            // investmentLevel alone doesn't fully capture (a neighboring region's boom pulling
            // workers away), and that exodus is itself something an electorate punishes an
            // incumbent for, on top of investment. Smoothed (EMA, not the raw noisy monthly
            // figure) since getProvinceVoteShare() reads it directly, same as a trend arrow would.
            prov.popTrend = (prov.popTrend ?? 0) + (monthlyChange - (prov.popTrend ?? 0)) * 0.2;
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
        // Long-term Political Memory (Stage D3): whichever parties are actually governing right
        // now are the ones building or spending this month's legitimacy swing -- a quiet drift
        // (not a discrete recordLegacyEvent() entry; logging this every single month would flood
        // the 20-entry history cap with noise and crowd out the events actually worth browsing).
        state.parties.filter(p => p.status === "Government").forEach(gp => {
            if (!gp.legacy) { const seed = gp.legacyTrust ?? 60; gp.legacy = { integrity: seed, delivery: seed, governance: seed, consistency: seed }; }
            gp.legacy.governance = Math.max(0, Math.min(100, gp.legacy.governance + legitimacyPressure * 2));
            // Legacy Trust v2 (Balance Pass v1): the doc's ask that transparency/corruption should
            // matter to Legacy "in the long run, significantly" -- a slow pull toward a target set
            // by CURRENT transparency, not an instant hit, so one bad month of backroom dealing
            // doesn't equal years of clean governance, but sustained corruption still drags this
            // down hard given enough time (this is what actually explains the Corrupt/Populist
            // playtest runs' transparency collapsing to 0 well before either government fell).
            const integrityTarget = 20 + (state.world.transparency ?? 100) * 0.7;
            gp.legacy.integrity = gp.legacy.integrity + (integrityTarget - gp.legacy.integrity) * 0.08;
            // Delivery and Consistency get a gentle pull back toward the 60 baseline instead of
            // transparency/legitimacy driving them -- without this, the diminishing-repeat penalty
            // above still leaves a bad stretch of failed bills permanently pinned near the floor
            // even after the government stops failing them (exactly what Reformist/Austerity did
            // in testing). A real event still moves these dimensions far more than this drift does.
            gp.legacy.delivery = gp.legacy.delivery + (60 - gp.legacy.delivery) * 0.03;
            gp.legacy.consistency = gp.legacy.consistency + (60 - gp.legacy.consistency) * 0.03;
            this.recomputeLegacyTrust(gp);
        });

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

        // AI Party Personality (Stage C4): each party's priority lean drifts toward what the
        // world and its own base currently reward, slowly (10%/month, same cadence as trust
        // above) so it reads as a lasting bias shifting over a term, not a stat that swings with
        // every crisis.
        state.parties.forEach(p => {
            if (!p.priority) { const fresh = generatePartyPriority(); p.priority = { ...fresh }; p.basePriority = fresh; }
            if (!p.basePriority) p.basePriority = { ...p.priority };
            const target = getPartyPriorityTarget(p);
            Data.PRIORITY_CATEGORIES.forEach(c => { p.priority[c] = p.priority[c] + (target[c] - p.priority[c]) * 0.1; });
        });

        // Trend arrows (Phase 2): a short rolling history per stat, so the UI can say "up from
        // last month" not just show a bare number. Pushed last, after every stat this month has
        // actually finished recomputing -- approval and cabinetStability used to get pushed
        // *before* their own recompute above, so their trend arrow was permanently a month stale.
        state.history.approval.push(state.world.approval); state.history.budget.push(state.world.nationalBudget);
        if(state.history.approval.length > 6) state.history.approval.shift(); if(state.history.budget.length > 6) state.history.budget.shift();
        ["growth", "cabinetStability", "protestPressure", "coalitionCollapsePressure", "economicCrisisPressure", "coupPressure", "fiscalStress"].forEach(key => {
            if (!state.history[key]) state.history[key] = [];
            state.history[key].push(state.world[key]);
            if (state.history[key].length > 6) state.history[key].shift();
        });
        Data.COST_OF_LIVING_CATEGORIES.forEach(cat => {
            const key = "cost" + cat.charAt(0).toUpperCase() + cat.slice(1);
            if (!state.history[key]) state.history[key] = [];
            state.history[key].push(state.world.costOfLiving[cat]);
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
        // Event Pressure Framework (Stage C1): which kind of crisis fires now reads both
        // pressures' relative share instead of protestPressure alone deciding against a flat
        // 30-80% band -- if economicCrisisPressure has genuinely built up higher than
        // protestPressure, Economic is the more likely (not just possible) outcome.
        const totalPressure = state.world.protestPressure + state.world.economicCrisisPressure;
        const protestShare = totalPressure > 1 ? state.world.protestPressure / totalPressure : 0.5;
        const type = Math.random() < protestShare ? "Protest" : "Economic";
        if (type === "Economic") {
            // Mirrors the Protest branch's stabilityPenalty: a temporary, decaying drag (via
            // tick()'s growthPenalty decay) instead of a permanent subtraction, so repeated
            // crises fade over a couple of weeks like everything else in the game instead of
            // requiring the monthly growth blend alone to claw them back.
            state.world.growthPenalty = Math.min(15, (state.world.growthPenalty || 0) + 2.5);
            // Same venting the Protest branch already does for protestPressure -- the crisis
            // itself lets off some of the pressure that built up to cause it.
            state.world.economicCrisisPressure = Math.max(0, state.world.economicCrisisPressure - 35);
            // Economic Pressure v1 (Stage D1): "ค่าครองชีพพุ่งสูง" in the headline above used to
            // be flavor text with no mechanical effect -- a real external shock now backs it,
            // the same decaying applyWorldStatImpact() channel a policy's worldImpact uses,
            // just on the two cost categories a recession actually spikes first.
            this.applyWorldStatImpact("food", 15, "วิกฤตเศรษฐกิจถดถอย", 45);
            this.applyWorldStatImpact("energy", 12, "วิกฤตเศรษฐกิจถดถอย", 45);
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
        const candidates = Data.POLICY_TEMPLATES.filter(t => !state.activePolicies.some(x => x.name === t.name));
        if (candidates.length === 0) return;

        // Party Personality (Stage C4): which government party actually drives this month's
        // proposal is picked weighted by seats (a bigger coalition partner gets more turns at
        // the wheel), then its own priority lean shapes what it pushes -- see scoreAIPolicy().
        const govParties = state.parties.filter(p => p.status === "Government");
        let drivingParty = null;
        if (govParties.length > 0) {
            const totalGovSeats = govParties.reduce((s, p) => s + p.seats, 0);
            let r = Math.random() * totalGovSeats;
            drivingParty = govParties[govParties.length - 1];
            for (const p of govParties) { r -= p.seats; if (r <= 0) { drivingParty = p; break; } }
        }

        const scored = candidates.map(t => ({ t, score: scoreAIPolicy(t, drivingParty) })).sort((a, b) => b.score - a.score);
        const picked = scored[Math.floor(Math.random() * Math.min(3, scored.length))].t;
        const partyMPs = drivingParty ? state.leaders.filter(l => l.party.id === drivingParty.id) : [];
        const aiMP = partyMPs.length > 0 ? partyMPs[Math.floor(Math.random()*partyMPs.length)] : state.leaders[Math.floor(Math.random()*state.leaders.length)];
        if (aiMP.party.status === "Government" && picked.cost > state.world.nationalBudget * 0.1) return;
        this.propose(picked, `${aiMP.name}`);
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
        // Legacy Trust v2 (Balance Pass v1): a deliberate stance flip is a real identity change
        // whether the player chose it or the party was forced into one post-election -- same
        // consistency hook applyElectionPunishment() uses, milder since this one is a single-field
        // nudge, not a full ideology swap.
        this.recordLegacyEvent(p, -5, `ปรับ${type === 'ideology' ? 'อุดมการณ์' : 'เป้าหมาย'}พรรคเป็น${newValue}`, 'consistency', 'minor');
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

    // Opposition Gameplay v2 (Stage C5): the roadmap is explicit that opposition needs its own
    // goal -- "build a path back to power" -- not a scaled-down copy of government actions.
    // campaignProvince() above already covers building a provincial base; these three cover the
    // rest of the roadmap's list (Shadow Cabinet, policy stance, pre-election alliance), each
    // wired into a real system instead of just posting a news item: a shadow minister's fit
    // bonus shows up in getImplementationEffectiveness() once they're a real minister, an
    // opposition stance moves the actual vote math in runVote() via oppositionLobby/
    // coalitionBoost, and an alliance changes who assignGovernmentStatus() actually seats.
    assignShadowMinister(ministryName, mpId) {
        if (state.player.party.status !== "Opposition") { alert("เฉพาะฝ่ายค้านเท่านั้นที่ตั้งคณะรัฐมนตรีเงาได้"); return; }
        if (!Data.MINISTRIES[ministryName]) return;
        const mp = state.leaders.find(l => l.id === mpId);
        if (!mp || mp.party.id !== state.player.party.id) { alert("เลือกได้เฉพาะ สส. พรรคท่านเอง"); return; }
        state.player.shadowCabinet[ministryName] = mpId;
        mp.shadowedMinistries = mp.shadowedMinistries || {};
        mp.shadowedMinistries[ministryName] = true;
        // A smaller echo of the prestige/trust boost a real appointment gives (appointMinister()).
        mp.prestige = Math.min(100, (mp.prestige ?? 50) + 5);
        mp.trust = Math.min(100, mp.trust + 3);
        this.addNews(`แต่งตั้งรัฐมนตรีเงา: ${mp.name}`, `${mp.name}รับหน้าที่รัฐมนตรีเงากระทรวง${ministryName} ทำหน้าที่ตรวจสอบและวิจารณ์การทำงานของรัฐบาลด้านนี้`);
        ui.updateMain();
    },

    stanceOnPolicy(pName, stance) {
        if (state.player.party.status !== "Opposition") { alert("เฉพาะฝ่ายค้านเท่านั้นที่แสดงจุดยืนต่อร่างกฎหมายรัฐบาลได้"); return; }
        const p = state.activePolicies.find(x => x.name === pName);
        if (!p) return;
        const proposerMP = state.leaders.find(l => l.name === p.proposer);
        if (p.proposer === "รัฐบาล" ? state.player.party.status === "Government" : proposerMP?.party.id === state.player.party.id) {
            alert("นี่คือร่างกฎหมายของพรรคท่านเอง"); return;
        }
        const cost = 3000000;
        if (state.player.personalFunds < cost) { alert(`เงินส่วนตัวไม่พอ (ต้องการ ฿${(cost/1e6).toFixed(1)}M)`); return; }
        state.player.personalFunds -= cost;
        // Same saturation pattern as lobbyIndividual()/campaignProvince(): repeating the same
        // press line on the same bill gets less effective each time.
        const satMultiplier = 1 - (p.oppStanceSaturation || 0) / 100;
        const amount = 10 * satMultiplier;
        if (stance === "oppose") {
            p.oppositionLobby = (p.oppositionLobby || 0) + amount;
            this.addNews(`ฝ่ายค้านคัดค้าน: ${p.name}`, `${state.player.party.name}ออกแถลงการณ์คัดค้านร่างนี้ต่อสาธารณะ`);
        } else {
            p.coalitionBoost = (p.coalitionBoost || 0) + amount;
            this.addNews(`ฝ่ายค้านสนับสนุน: ${p.name}`, `${state.player.party.name}ประกาศสนับสนุนร่างนี้อย่างเปิดเผย แม้เป็นร่างของรัฐบาล`);
        }
        p.oppStanceSaturation = Math.min(100, (p.oppStanceSaturation || 0) + 35);
        ui.updateMain();
    },

    negotiateAlliance(partyId) {
        if (state.player.party.status !== "Opposition") { alert("เฉพาะฝ่ายค้านเท่านั้นที่เจรจาพันธมิตรก่อนเลือกตั้งได้"); return; }
        const daysToElection = state.world.electionDay ? Math.round((state.world.electionDay - state.date) / 86400000) : 9999;
        if (daysToElection > 365) { alert("เจรจาพันธมิตรได้เฉพาะช่วงใกล้เลือกตั้ง (ภายใน 1 ปี)"); return; }
        const partner = state.parties.find(p => p.id === partyId);
        if (!partner || partner.id === state.player.party.id || partner.status === "Government") return;
        const cost = 15000000;
        if (state.player.personalFunds < cost) { alert(`เงินส่วนตัวไม่พอ (ต้องการ ฿${(cost/1e6).toFixed(1)}M)`); return; }
        state.player.personalFunds -= cost;

        // Same conflict check assignGovernmentStatus() itself uses -- a party won't commit to a
        // pact with someone whose ideology it's actively opposed to, and low trust (the same
        // field processQuidProQuo() spends/builds) makes even a compatible party wary.
        const conflict = state.player.party.ideologies.some(i => partner.ideologies.some(gi => ideologiesConflict(i, gi)));
        // Long-term Political Memory (Stage D3): a party's own multi-term record shapes how
        // willing another party is to commit to it -- a government that's kept its word and
        // survived its crises is simply a safer bet to ally with than one that's flip-flopped
        // or broken promises before.
        const legacyFactor = ((state.player.party.legacyTrust ?? 60) - 60) * 0.3;
        const successChance = conflict ? 20 : 60 + ((partner.trust ?? 70) - 70) * 0.5 + legacyFactor;
        if (Math.random() * 100 > successChance) {
            this.addNews(`เจรจาพันธมิตรล้มเหลว`, `${partner.name}ปฏิเสธข้อเสนอเป็นพันธมิตรก่อนการเลือกตั้งกับ${state.player.party.name}`);
            ui.updateMain(); return;
        }
        state.player.party.electoralPactWith = partner.id;
        partner.electoralPactWith = state.player.party.id;
        this.addNews(`จับมือพันธมิตรก่อนเลือกตั้ง`, `${state.player.party.name}และ${partner.name}ตกลงร่วมมือกันหากได้เสียงข้างมากในการเลือกตั้งครั้งหน้า`);
        ui.updateMain();
    },

    runElection() {
        gameClock.setSpeed(0); ui.resetModalState();

        const prevSeats = {};
        state.parties.forEach(p => { prevSeats[p.id] = p.seats; });
        // Post-election analysis (Stage B4): which party actually led each province BEFORE this
        // vote, captured from last term's lastResult before runProvinceElection() overwrites it,
        // so flips can be attributed to something concrete instead of just showing a seat count.
        const prevLeaders = {};
        state.provinces.forEach(p => {
            const entries = Object.entries(p.lastResult || {}).sort((a, b) => b[1] - a[1]);
            prevLeaders[p.name] = entries[0]?.[0] || null;
        });

        // Same shared per-province race allocateProvinceSeats() runs at game start.
        const seatsWon = runProvinceElection();

        // Which provinces flipped to a different leading party, and a plausible reason drawn
        // from the same terms runProvinceElection()'s weight formula actually scored on
        // (ideology affinity, investment record, the player's own campaign effort) -- computed
        // before playerCampaignBoost is spent/reset below, so that signal is still live.
        const flips = state.provinces.map(p => {
            const entries = Object.entries(p.lastResult || {}).sort((a, b) => b[1] - a[1]);
            const newLeaderId = entries[0]?.[0];
            const oldLeaderId = prevLeaders[p.name];
            if (!oldLeaderId || !newLeaderId || newLeaderId === oldLeaderId) return null;
            const oldParty = state.parties.find(x => x.id === oldLeaderId);
            const newParty = state.parties.find(x => x.id === newLeaderId);
            if (!oldParty || !newParty) return null;
            const affinity = Data.FACTION_IDEOLOGY_AFFINITY[p.baseFaction];
            const reasons = [];
            if (affinity && newParty.ideologies.includes(affinity) && !oldParty.ideologies.includes(affinity)) reasons.push(`แนวคิดพรรคใหม่ตรงกับฐานเสียง${p.baseFaction}`);
            if (newParty.status === "Government" && (p.investmentLevel ?? 50) > 60) reasons.push("จังหวัดได้รับการลงทุนสูงภายใต้รัฐบาลใหม่");
            if (oldParty.status === "Government" && (p.investmentLevel ?? 50) < 40) reasons.push("จังหวัดถูกทอดทิ้งภายใต้รัฐบาลเดิม");
            if (newParty.id === state.player.party.id && (p.playerCampaignBoost || 0) > 15) reasons.push("ผลจากการลงพื้นที่หาเสียงของท่าน");
            if (reasons.length === 0) reasons.push("กระแสความนิยมพรรคเปลี่ยนไปโดยรวม");
            return { name: p.name, seats: p.seats, from: oldParty.name, fromColor: oldParty.color, to: newParty.name, toColor: newParty.color, reasons };
        }).filter(Boolean).sort((a, b) => b.seats - a.seats);

        const results = state.parties.map(p => ({ party: p, seats: seatsWon[p.id], prevSeats: prevSeats[p.id], prevStatus: p.status }));
        results.forEach(r => { r.party.seats = r.seats; });
        // Spent: this term's campaign effort only ever pays off once, at this election.
        state.provinces.forEach(p => { p.playerCampaignBoost = 0; });

        this.assignGovernmentStatus(state.parties);
        // AI Party Personality (Stage C4): a party punished hard enough by this election -- lost
        // government or lost over a quarter of its prior seats -- gets a chance to actually
        // change instead of running back the same losing pitch next term.
        this.applyElectionPunishment(results);
        Object.values(Data.MINISTRIES).forEach(m => { m.currentMinister = null; }); // new term, new cabinet to appoint
        state.activePolicies = [];
        state.voteModifier = null; state.lastVoteResults = null; state.lastVoteLog = [];
        // Legacy Trust v2 (Balance Pass v1): diminishing-repeat counters and per-bill failure
        // tracking are scoped to a single parliamentary term -- a genuinely new election is a
        // clean slate, unlike a mid-term no-confidence ouster (runNoConfidenceVote()), which keeps
        // the same term's counters since it's still the same session.
        state.parties.forEach(p => { p.legacyTermCounts = {}; p.legacyBillFailures = {}; });
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
        // Post-election analysis (Stage B4): which provinces actually changed hands and why,
        // instead of only ever showing the resulting seat table -- capped and ranked by seat
        // count so a nationwide realignment doesn't dump all 77 provinces on the player at once.
        const flipRows = flips.slice(0, 8).map(f => `
            <div class="border-b border-stone-200 py-1.5">
                <div class="flex justify-between items-center text-xs">
                    <span class="font-bold">${f.name} <span class="text-[9px] text-stone-500 font-normal">(${f.seats} ที่นั่ง)</span></span>
                    <span class="font-mono text-[10px]"><span style="color:${f.fromColor}">${f.from}</span> → <span style="color:${f.toColor}" class="font-bold">${f.to}</span></span>
                </div>
                <div class="text-[9px] text-stone-500">${f.reasons.join(' · ')}</div>
            </div>
        `).join('');
        document.getElementById('event-title').innerText = "ผลการเลือกตั้งทั่วไป";
        document.getElementById('event-desc').innerHTML = `
            <div class="text-center mb-4">
                <div class="text-2xl font-black uppercase tracking-widest ${won ? 'text-emerald-700' : 'text-red-700'}">${won ? 'พรรคท่านจัดตั้งรัฐบาลต่อ' : 'พรรคท่านหลุดจากอำนาจ'}</div>
                ${!won ? `<div class="text-xs text-stone-500 mt-2">พรรคท่านเป็น${state.player.party.status === "Opposition" ? "ฝ่ายค้าน" : "กลาง"}ในสมัยนี้ -- ลงพื้นที่หาเสียงและสร้างฐานใหม่เพื่อกลับมาสมัยหน้า</div>` : ''}
            </div>
            <div class="text-left max-h-[220px] overflow-y-auto scroll-custom">${rows}</div>
            ${flips.length > 0 ? `
            <div class="mt-3 pt-3 border-t-2 border-black">
                <div class="text-[9px] uppercase tracking-widest text-stone-500 font-bold mb-2">จังหวัดที่พลิกขั้ว (${flips.length})</div>
                <div class="text-left max-h-[220px] overflow-y-auto scroll-custom">${flipRows}</div>
                ${flips.length > 8 ? `<div class="text-[9px] text-stone-400 text-center mt-1">และอีก ${flips.length - 8} จังหวัด</div>` : ''}
            </div>` : `<div class="text-[9px] text-stone-400 text-center mt-3 pt-3 border-t-2 border-black">ไม่มีจังหวัดใดพลิกขั้วในสมัยนี้</div>`}
        `;
        document.getElementById('event-options').innerHTML = won
            ? `<button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1);" class="w-full p-4 bg-black text-white font-bold border-2 border-black text-lg hover:opacity-90">เริ่มสมัยประชุมใหม่</button>`
            : `<button onclick="document.getElementById('event-modal').classList.add('hidden'); gameClock.setSpeed(1); ui.updateMain();" class="w-full p-4 bg-red-700 text-white font-bold border-2 border-black text-lg hover:opacity-90">เข้าสู่ฝ่ายค้าน</button>`;
        document.getElementById('event-modal').classList.remove('hidden');
        ui.renderCabinet(); ui.renderMinistryList(); ui.renderParliament(); ui.renderProvinceMap();
        this.addNews("ผลการเลือกตั้งทั่วไปประกาศแล้ว", won ? "พรรคท่านยังคงจัดตั้งรัฐบาลได้ต่อไป" : "พรรคท่านไม่สามารถจัดตั้งรัฐบาลได้ในสมัยนี้ และจะทำหน้าที่ฝ่ายค้านในสภาชุดใหม่");
    },

    // AI Party Personality (Stage C4): the roadmap's third ask -- "a party punished by the
    // election should have a chance to change stance or leadership long-term". Only reacts to a
    // real beating (lost government, or lost over a quarter of its prior seats), and even then
    // doesn't always react (parties have inertia too), and skips the player's own party -- that
    // stance is the player's call, not something scripted out from under them.
    applyElectionPunishment(results) {
        results.forEach(r => {
            const party = r.party;
            if (party.id === state.player.party.id) return;
            const seatLossRatio = r.prevSeats > 0 ? (r.prevSeats - r.seats) / r.prevSeats : 0;
            const lostPower = r.prevStatus === "Government" && party.status !== "Government";
            if (seatLossRatio <= 0.25 && !lostPower) return;
            if (Math.random() < 0.5) return;

            if (Math.random() < 0.5) {
                // Stance change: swap one held ideology for one the party doesn't currently hold.
                const pool = Data.IDEOLOGY_POOL.filter(i => !party.ideologies.includes(i));
                if (pool.length === 0) return;
                const outIdx = Math.floor(Math.random() * party.ideologies.length);
                const dropped = party.ideologies[outIdx];
                const added = pool[Math.floor(Math.random() * pool.length)];
                party.ideologies[outIdx] = added;
                this.addNews(`${party.name} ปรับจุดยืนใหม่`, `หลังพ่ายศึกเลือกตั้งอย่างหนัก พรรคเปลี่ยนแนวทางจาก${dropped}สู่${added}`);
                // Long-term Political Memory (Stage D3): flip-flopping is exactly the kind of
                // thing that damages a multi-term reputation, beyond this term's seats/trust hit
                // C4 already applies above.
                this.recordLegacyEvent(party, -10, `เปลี่ยนอุดมการณ์จาก${dropped}สู่${added}`, 'consistency', 'flagship');
            } else {
                // Leadership change: a fresh leader resets standing with coalition partners and
                // brings their own priority lean, same shared roll party creation uses.
                party.trust = Math.min(100, Math.max(party.trust ?? 70, 60) + 15);
                party.dependence = 0;
                const newPriority = generatePartyPriority();
                party.priority = { ...newPriority }; party.basePriority = newPriority;
                party.popularity = Math.min(100, (party.popularity || 0) + 3);
                this.addNews(`${party.name} เปลี่ยนหัวหน้าพรรค`, `หลังพ่ายศึกเลือกตั้งอย่างหนัก พรรคเปลี่ยนผู้นำใหม่พร้อมทิศทางใหม่`);
            }
        });
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
        // Same venting triggerCrisis() does for whichever pressure caused it -- resolved either
        // way, so it doesn't sit maxed out and immediately re-roll next month.
        state.world.coalitionCollapsePressure = ousted ? 0 : Math.max(0, state.world.coalitionCollapsePressure - 40);
        // Long-term Political Memory (Stage D3): a no-confidence motion is the clearest crisis-
        // management test this game has -- surviving one is a real mark in a government's favor
        // that outlasts this term's trust/approval swings; losing one is the opposite.
        this.recordLegacyEvent(state.player.party, ousted ? -12 : 5, ousted ? "แพ้มติไม่ไว้วางใจ" : "รอดมติไม่ไว้วางใจ", 'governance', 'confidenceCrisis');
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
                // Better Why System (Stage D4): "ทำไมพรรคร่วมเรียกร้องเพิ่ม" -- used to pick a
                // coalition partner uniformly at random, so there was never a real reason to show
                // for WHY that specific partner came asking. Now it's whichever partner actually
                // has the highest dependence (the same field driving quidProQuoChance above), so
                // showQuidProQuo() has a genuine number to point to.
                const badActor = [...coalitions].sort((a, b) => (b.dependence || 0) - (a.dependence || 0))[0];
                const demands = Data.POLICY_TEMPLATES.filter(t => t.ministry === "การคลัง" || t.ministry === "คมนาคม");
                if (demands.length > 0) {
                     ui.showQuidProQuo(p, demands[0], badActor, { avgDependence, quidProQuoChance }); return;
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
            // Opposition Gameplay v2 (Stage C5): stanceOnPolicy('oppose') builds this up the same
            // way processQuidProQuo() builds coalitionBoost -- a public opposition campaign
            // against a bill is real pressure on the floor, not just flavor text.
            score -= (p.oppositionLobby || 0);
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

            // Better Why System (Stage D4): "ทำไม MP โหวตค้าน" -- every condition that actually
            // fed voteAgainstParty's roll above, named with the MP's own real numbers, captured
            // here (not re-derived later from possibly-changed live state) so the why-modal shows
            // exactly what decided this specific historical vote.
            const rebelReasons = [];
            if (mp.loyalty < 30) rebelReasons.push(`ความภักดีต่อพรรคต่ำ (${mp.loyalty.toFixed(0)}%)`);
            if (mp.isCobra) rebelReasons.push("เป็นงูเห่า (ผูกมัดลับไว้กับอีกฝ่าย)");
            if (personalConflict) rebelReasons.push(`อุดมการณ์ส่วนตัว (${mp.trait.ideology}) ขัดกับร่างนี้ (${p.ideology})`);
            if (issueMatch && impactOnOwnBase < -15) rebelReasons.push(`ร่างนี้กระทบฐานเสียงของตัวเอง (${mp.status}) หนัก (${impactOnOwnBase})`);

            state.lastVoteResults.push({ id: mp.id, vote: finalVote, isRebel: voteAgainstParty });
            state.lastVoteLog.push({ name: mp.name, party: mp.party.name, color: mp.party.color, vote: finalVote, isCobra: mp.isCobra, isRebel: voteAgainstParty, score: Math.round(score), rebelReasons });

            if (finalVote === "yes") yes++; else no++;
        });
        ui.renderParliament(); ui.displayResults(p, yes, no);
    },

    finalizeVote(pName, passed) {
        const p = state.activePolicies.find(x => x.name === pName);
        // Long-term Political Memory (Stage D3): who actually proposed this, resolved once so
        // both the broken-promise hook below and getFactionResponseMultiplier()'s legacyTrust
        // term can use it -- same resolution renderOppositionCommandCenter() (Stage C5) uses.
        const proposingParty = p.proposer === "รัฐบาล" ? state.player.party : (state.leaders.find(l => l.name === p.proposer)?.party || null);
        // Legacy Trust v2 (Balance Pass v1): severity tier for whichever legacy event this vote's
        // outcome triggers below -- a bill's own cost, relative to every other template, stands in
        // for "flagship" since there's no separate significance field on POLICY_TEMPLATES to add.
        const costRank = Data.POLICY_TEMPLATES.filter(t => t.cost <= p.cost).length / Data.POLICY_TEMPLATES.length;
        const isFlagship = costRank >= 0.6;
        if (passed) {
            if (p.stage < 3) { p.stage++; p.isDeliberating = true; p.remainingDays = p.totalDays; }
            else {
                // State Capacity (Phase 4): passing parliament is "Policy Passed", not
                // "Policy Effective" -- the ministry's workload, whether its minister actually
                // cares about this issue, and the government's fiscal room all cut into how
                // much of the legal effect the state can actually deliver.
                const { effectiveness, fitLabel } = getImplementationEffectiveness(p);
                state.world.nationalBudget -= p.cost;
                // Faction Response v2 (Stage D2): the template's own persistent record (not this
                // activePolicy instance, which is a fresh spread copy every proposal) of how many
                // times it's actually been enacted -- read and incremented here so
                // getFactionResponseMultiplier()'s policy-memory term has something real to read.
                const template = Data.POLICY_TEMPLATES.find(t => t.name === p.name);
                Object.entries(p.impact).forEach(([fn, v]) => this.applyFactionImpact(fn, getFactionResponseMultiplier(fn, v * effectiveness, template, proposingParty), p.name));
                if (template) template.enactCount = (template.enactCount || 0) + 1;
                if (p.worldImpact) Object.entries(p.worldImpact).forEach(([stat, v]) => this.applyWorldStatImpact(stat, v * effectiveness, p.name));
                state.foreign.forEach(c => {
                    if (c.ideology === p.ideology) this.applyForeignImpact(c.id, 8 * effectiveness, p.name, 60);
                    else if (ideologiesConflict(c.ideology, p.ideology)) this.applyForeignImpact(c.id, -8 * effectiveness, p.name, 60);
                });
                const ministry = Data.MINISTRIES[p.ministry];
                if (ministry) ministry.workload = Math.min(100, (ministry.workload || 0) + 30);
                const effLabel = effectiveness > 0.85 ? "ดำเนินงานได้เต็มที่" : effectiveness > 0.6 ? "ดำเนินงานได้ปานกลาง" : "ดำเนินงานได้จำกัดมาก";
                this.addNews(`${p.name} บังคับใช้เป็นกฎหมาย`, `${effLabel} (ประสิทธิผล ${(effectiveness*100).toFixed(0)}%) -- ${fitLabel}`);
                // Legacy Trust v2 (Balance Pass v1): delivering a bill all the way to enactment was
                // previously invisible to legacyTrust -- only failure ever touched it. A one-sided
                // ledger is what let pure legislative volume (many attempts, inevitably some
                // failures) drag the score down with nothing on the other side of the scale.
                if (proposingParty && proposingParty.status === "Government") {
                    this.recordLegacyEvent(proposingParty, isFlagship ? 6 : 2, `ร่าง "${p.name}" บังคับใช้เป็นกฎหมายสำเร็จ`, 'delivery', isFlagship ? 'flagship' : 'minor');
                }
                state.activePolicies = state.activePolicies.filter(x => x.name !== pName);
            }
        } else {
            // Long-term Political Memory (Stage D3): a government's own bill failing a reading
            // it already spent political capital proposing (the news already announced it, the
            // stakeholder review already previewed it) is the closest thing this game's
            // mechanics have to a broken promise -- the party said it would do this and couldn't.
            // Legacy Trust v2 (Balance Pass v1): a flat -8 regardless of what failed punished a
            // minor bill exactly as hard as a flagship one. Now tiered by cost, and a SECOND
            // failure of this exact template within the same term reads as a broken promise (the
            // party re-committed to the same thing and couldn't deliver it twice), the next tier
            // up in the doc's own severity ordering.
            if (proposingParty && proposingParty.status === "Government") {
                proposingParty.legacyBillFailures = proposingParty.legacyBillFailures || {};
                const priorFailures = proposingParty.legacyBillFailures[p.name] || 0;
                const tier = priorFailures > 0 ? 'brokenPromise' : (isFlagship ? 'flagship' : 'minor');
                proposingParty.legacyBillFailures[p.name] = priorFailures + 1;
                this.recordLegacyEvent(proposingParty, -8, `ร่าง "${p.name}" ตกในสภา`, 'delivery', tier);
            }
            state.activePolicies = state.activePolicies.filter(x => x.name !== pName);
        }
        document.getElementById('event-modal').classList.add('hidden');
        state.lastVoteResults = null; ui.renderParliament();
        ui.updateMain(); gameClock.setSpeed(1);
    }
};
