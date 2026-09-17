export const state = {
    date: new Date(2024, 0, 1),
    speed: 0, 
    player: { name: "", personalFunds: 150000000, background: null, party: null, position: "" },
    world: { nationalBudget: 3400000000000, approval: 50, growth: 2.4, cabinetStability: 80, transparency: 100, stabilityPenalty: 0, unemployment: 20, crime: 35, health: 60, education: 55, environment: 55, military: 50, statMods: { unemployment: [], crime: [], health: [], education: [], environment: [], military: [] } },
    factions: [],
    foreign: [],
    provinces: [],
    parties: [],
    leaders: [], 
    activePolicies: [], 
    news: []
};