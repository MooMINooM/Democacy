export const TOTAL_SEATS = 500;
export const MAJORITY_SEATS = 250;
export const ELECTION_TERM_DAYS = 1460; // one 4-year parliamentary term

export const FACTION_DATA = [
    { name: "กองทัพ", weight: 80, wealth: 70, basePop: 300000, icon: "fa-shield-halved" },
    { name: "หัวก้าวหน้า", weight: 60, wealth: 30, basePop: 5000000, icon: "fa-bolt" },
    { name: "อนุรักษ์", weight: 70, wealth: 60, basePop: 4000000, icon: "fa-landmark" },
    { name: "เทคโนแครต", weight: 50, wealth: 50, basePop: 800000, icon: "fa-microchip" },
    { name: "นายทุน", weight: 90, wealth: 100, basePop: 100000, icon: "fa-briefcase" },
    { name: "ผู้นำศาสนา", weight: 40, wealth: 50, basePop: 2000000, icon: "fa-church" },
    { name: "สิ่งแวดล้อม", weight: 30, wealth: 20, basePop: 1500000, icon: "fa-leaf" },
    { name: "ชนชั้นกลาง", weight: 50, wealth: 50, basePop: 8000000, icon: "fa-user-tie" },
    { name: "แรงงาน", weight: 40, wealth: 20, basePop: 12000000, icon: "fa-hammer" },
    { name: "เกษตรกร", weight: 40, wealth: 10, basePop: 15000000, icon: "fa-wheat-awn" },
    { name: "คนว่างงาน", weight: 10, wealth: 5, basePop: 2000000, icon: "fa-person-circle-exclamation" },
    { name: "เด็กรุ่นใหม่", weight: 50, wealth: 10, basePop: 6000000, icon: "fa-graduation-cap" },
    { name: "ชาตินิยมขวาจัด", weight: 50, wealth: 30, basePop: 2000000, icon: "fa-flag" },
    { name: "สื่อและปัญญาชน", weight: 60, wealth: 40, basePop: 500000, icon: "fa-pen-nib" },
    { name: "ทุนข้ามชาติ", weight: 80, wealth: 100, basePop: 50000, icon: "fa-globe" },
    { name: "ท้องถิ่น", weight: 40, wealth: 30, basePop: 7000000, icon: "fa-house-user" },
    { name: "ข้าราชการ", weight: 70, wealth: 40, basePop: 3000000, icon: "fa-id-card" }
];
export const FACTION_NAMES = FACTION_DATA.map(f => f.name);

// keyIndustry ties each country to the one INDUSTRY_TYPES sector Thailand trades with it most --
// souring or strengthening that relationship (js/engine.js's provinceOutput()) now hits the
// provinces running that industry specifically, not just a flat national trade number.
export const FOREIGN_POWERS = [
    { id: "US", name: "สหรัฐอเมริกา", icon: "fa-flag-usa", ideology: "เสรีนิยม", tradeWeight: 25, keyIndustry: "เทคโนโลยี" },
    { id: "CN", name: "จีน", icon: "fa-yin-yang", ideology: "อำนาจนิยม", tradeWeight: 30, keyIndustry: "เกษตรกรรม" },
    { id: "EU", name: "สหภาพยุโรป", icon: "fa-star", ideology: "สิทธิมนุษยชน", tradeWeight: 20, keyIndustry: "การท่องเที่ยว" },
    { id: "JP", name: "ญี่ปุ่น", icon: "fa-torii-gate", ideology: "โลกาภิวัตน์", tradeWeight: 15, keyIndustry: "อุตสาหกรรม" },
    { id: "AS", name: "อาเซียน", icon: "fa-people-group", ideology: "ประชานิยม", tradeWeight: 10, keyIndustry: "ประมง" }
];

// --- MAPPING ICON สำหรับ String (Ideology & Goal) ---
export const TRAIT_ICONS = {
    // แนวคิด (Ideology)
    "เสรีนิยม": "fa-dove",
    "ชาตินิยม": "fa-flag",
    "อำนาจนิยม": "fa-gavel",
    "ประชาธิปไตย": "fa-check-to-slot",
    "สังคมนิยม": "fa-users",
    "ฟาสซิสต์": "fa-hand-fist",
    "คอมมิวนิสต์": "fa-hammer",
    "ศาสนานิยม": "fa-hands-praying",
    "ฆราวาสนิยม": "fa-ban",
    "อนุรักษ์นิยม": "fa-landmark",
    "โลกาภิวัตน์": "fa-earth-americas",
    "การแยกตัว": "fa-scissors",
    "หัวก้าวหน้า": "fa-rocket",
    "ประชานิยม": "fa-heart",
    "สิทธิมนุษยชน": "fa-hand-holding-heart",
    
    // เป้าหมาย (Goal)
    "การศึกษา": "fa-graduation-cap",
    "เศรษฐกิจ": "fa-chart-line",
    "การต่างประเทศ": "fa-handshake",
    "สิ่งแวดล้อม": "fa-leaf",
    "การเกษตร": "fa-wheat-awn",
    "การทหาร": "fa-jet-fighter",
    "เทคโนโลยี": "fa-microchip",
    "สาธารณสุข": "fa-hospital",
    "ความยุติธรรม": "fa-scale-balanced",
    "การอนุรักษ์ทรัพยากร": "fa-tree",
    "อุตสาหกรรมและการส่งออก": "fa-industry",
    "การท่องเที่ยว": "fa-plane",
    "คุณภาพชีวิต": "fa-smile",
    "สวัสดิการแรงงาน": "fa-hard-hat",
    "การสะสมทุน": "fa-sack-dollar",
    "ความมั่นคงทางอาหาร": "fa-bowl-rice",
    "สิทธิพลเมือง": "fa-user-shield"
};

// --- 1. ด้านแนวคิด (IDEOLOGY) ---
export const IDEOLOGY_POOL = Object.keys(TRAIT_ICONS).slice(0, 15);

// --- 2. ด้านเป้าหมาย (GOAL) ---
export const GOAL_POOL = Object.keys(TRAIT_ICONS).slice(15);

// --- 3. ด้านความสามารถ (ABILITY) ---
export const ABILITY_POOL = [
    { name: "การสื่อสารภาษาต่างประเทศ", costMod: 1.2, desc: "เจรจาต่างชาติได้ดี", icon: "fa-language" },
    { name: "การรับมือสื่อสาธารณะ", costMod: 1.5, desc: "แก้ข่าวเก่ง ลดความเสียหาย", icon: "fa-microphone" },
    { name: "การพูดชักจูง", costMod: 1.4, desc: "เพิ่มโอกาสโหวตชนะ", icon: "fa-bullhorn" },
    { name: "การระดมพล", costMod: 1.3, desc: "เรียกม็อบได้", icon: "fa-users-line" },
    { name: "การเงิน", costMod: 1.5, desc: "หาเงินทุนเข้าพรรคเก่ง", icon: "fa-money-bill-wave" },
    { name: "บารมี", costMod: 2.0, desc: "อิทธิพลสูง คุมเสียงได้", icon: "fa-sun" },
    { name: "เครือข่ายความสัมพันธ์", costMod: 1.8, desc: "รู้ข่าวงูเห่าเร็ว", icon: "fa-diagram-project" },
    { name: "การคิดวิเคราะห์", costMod: 1.2, desc: "วางแผนแม่นยำ", icon: "fa-magnifying-glass-chart" },
    { name: "ความเชี่ยวชาญเฉพาะทาง", costMod: 1.3, desc: "ร่างกฎหมายผ่านง่าย", icon: "fa-puzzle-piece" },
    { name: "การคอรัปชั่น", costMod: 0.5, desc: "ซื้อตัวง่ายมาก", icon: "fa-hand-holding-dollar" },
    { name: "ความยืดหยุ่นทางอุดมการณ์", costMod: 0.8, desc: "ย้ายพรรคง่าย", icon: "fa-shuffle" },
    { name: "ความเด็ดขาด", costMod: 1.5, desc: "ไม่ค่อยโหวตสวน", icon: "fa-gavel" },
    { name: "การบริหารจัดการ", costMod: 1.4, desc: "เพิ่มประสิทธิภาพกระทรวง", icon: "fa-sitemap" },
    { name: "การต่างประเทศ", costMod: 1.3, desc: "ภาพลักษณ์ดี", icon: "fa-passport" }
];

// --- 4. ด้านสถานะทางสังคม/ที่มาของรายได้ (SOCIO-ECONOMIC) ---
export const SOCIO_POOL = [
    { name: "เกษตรกร", baseWealth: 5, costMod: 0.8, icon: "fa-tractor" },
    { name: "มนุษย์เงินเดือน(เอกชน)", baseWealth: 10, costMod: 1.0, icon: "fa-user-tie" },
    { name: "เจ้าของธุรกิจขนาดใหญ่", baseWealth: 500, costMod: 3.0, icon: "fa-building" },
    { name: "แรงงาน", baseWealth: 3, costMod: 0.7, icon: "fa-wrench" },
    { name: "เจ้าของธุรกิจขนาดเล็ก", baseWealth: 20, costMod: 1.2, icon: "fa-store" },
    { name: "อดีตข้าราชการ", baseWealth: 15, costMod: 1.1, icon: "fa-stamp" },
    { name: "อาชีพอิสระ", baseWealth: 8, costMod: 0.9, icon: "fa-laptop" },
    { name: "นักวิชาการ", baseWealth: 12, costMod: 1.5, icon: "fa-book-open" }
];

export const IDEOLOGY_CONFLICTS = {
    "เสรีนิยม": ["อำนาจนิยม", "ฟาสซิสต์"],
    "ชาตินิยม": ["โลกาภิวัตน์", "การแยกตัว"],
    "อำนาจนิยม": ["เสรีนิยม", "ประชาธิปไตย", "สิทธิมนุษยชน"],
    "ประชาธิปไตย": ["อำนาจนิยม", "ฟาสซิสต์", "คอมมิวนิสต์"],
    "สังคมนิยม": ["อนุรักษ์นิยม"],
    "ฟาสซิสต์": ["เสรีนิยม", "ประชาธิปไตย", "คอมมิวนิสต์", "สิทธิมนุษยชน"],
    "คอมมิวนิสต์": ["ประชาธิปไตย", "ฟาสซิสต์", "อนุรักษ์นิยม"],
    "ศาสนานิยม": ["ฆราวาสนิยม", "หัวก้าวหน้า"],
    "ฆราวาสนิยม": ["ศาสนานิยม"],
    "อนุรักษ์นิยม": ["หัวก้าวหน้า", "สังคมนิยม", "คอมมิวนิสต์"],
    "โลกาภิวัตน์": ["ชาตินิยม", "การแยกตัว", "ประชานิยม"],
    "การแยกตัว": ["โลกาภิวัตน์", "ชาตินิยม"],
    "หัวก้าวหน้า": ["อนุรักษ์นิยม", "ศาสนานิยม"],
    "ประชานิยม": ["โลกาภิวัตน์"],
    "สิทธิมนุษยชน": ["อำนาจนิยม", "ฟาสซิสต์"]
};

export const THAI_NAMES = ["เกรียงไกร", "วิลาศ", "ธนา", "ศิริกัญญา", "สมชาย", "ประวิทย์", "ทักษิณ", "อนุทิน", "พิธา", "จุรินทร์", "ธรรมนัส", "สุดารัตน์", "วราวุธ", "กิตติภพ", "อารีลักษณ์", "ชูวิทย์", "ชวน", "รังสิมันต์", "ปารีณา", "เศรษฐา", "ไพบูลย์", "ปิยบุตร", "นิรันดร์", "ดนัย", "ชัยวุฒิ", "วรากร", "สนธิญาณ", "มงคลกิตติ์", "พรรณิการ์", "ทวี", "วันนอร์", "ชาดา", "สุริยะ", "วรวัจน์", "วิโรจน์"];
export const THAI_SURNAMES = ["จิตรภักดี", "เลิศอนันต์", "พาณิชย์ศิริ", "รุ่งเรืองไกร", "คงมั่งคั่ง", "วงษ์สุวรรณ", "ชินวัตร", "จูรีกรณ์", "เหล่าพงศ์ศิลป์", "ตระกูลสวัสดิ์", "ภักดีศรีไทย", "กรรณสูตร", "วานิชกุล", "ศิลปอาชา", "เทวกุล", "รัตนเสถียร", "โชติวิทย์", "มานะกร", "วิจิตรโชติ", "ไทยยืนยง", "จึงรุ่งเรืองกิจ", "ลีลาเทพ", "ชาญวีรกุล", "พูนสวัสดิ์", "สืบแสง"];

export let ALL_MP_NAMES = [];
THAI_NAMES.forEach(f => THAI_SURNAMES.forEach(l => ALL_MP_NAMES.push(`สส.${f} ${l}`)));
ALL_MP_NAMES.sort(() => Math.random() - 0.5);

export const BACKGROUNDS = [
    { id: "politician", name: "นักการเมืองอาชีพ", desc: "เข้าใจกลไกพรรคการเมือง", traits: ["เครือข่าย +20", "เจรจา +15"] },
    { id: "academic", name: "นักวิชาการ", desc: "เน้นข้อมูลและหลักการนโยบาย", traits: ["นโยบาย +25", "อภิปราย +15"] },
    { id: "business", name: "นักธุรกิจ", desc: "เน้นประสิทธิภาพการบริหารเงิน", traits: ["ทุน +30", "Elite +20"] },
    { id: "civil_servant", name: "อดีตข้าราชการ", desc: "เชี่ยวชาญราชการและกลไกแผ่นดิน", traits: ["บริหาร +25", "เสถียรภาพ +10"] },
    { id: "military", name: "อดีตผู้นำเหล่าทัพ", desc: "เน้นระเบียบวินัยและความมั่นคง", traits: ["ทหาร +40", "ต้านคูป +50"] }
];

// workload (Phase 4): builds up each time a bill from that ministry actually gets implemented,
// decaying over time in gameClock.tick() -- represents the bureaucracy's limited throughput,
// separate from whether the bill has a minister or the money to back it.
export const MINISTRIES = {
    "กลาโหม": { icon: "fa-shield-halved", currentMinister: null, cooldown: 0, workload: 0 },
    "การคลัง": { icon: "fa-wallet", currentMinister: null, cooldown: 0, workload: 0 },
    "การต่างประเทศ": { icon: "fa-earth-asia", currentMinister: null, cooldown: 0, workload: 0 },
    "ท่องเที่ยวและกีฬา": { icon: "fa-person-skating", currentMinister: null, cooldown: 0, workload: 0 },
    "เกษตรและสหกรณ์": { icon: "fa-wheat-awn", currentMinister: null, cooldown: 0, workload: 0 },
    "คมนาคม": { icon: "fa-train-subway", currentMinister: null, cooldown: 0, workload: 0 },
    "ดิจิทัล": { icon: "fa-laptop-code", currentMinister: null, cooldown: 0, workload: 0 },
    "พลังงาน": { icon: "fa-bolt-lightning", currentMinister: null, cooldown: 0, workload: 0 },
    "พาณิชย์": { icon: "fa-shop", currentMinister: null, cooldown: 0, workload: 0 },
    "มหาดไทย": { icon: "fa-house-user", currentMinister: null, cooldown: 0, workload: 0 },
    "ยุติธรรม": { icon: "fa-scale-balanced", currentMinister: null, cooldown: 0, workload: 0 },
    "แรงงาน": { icon: "fa-hammer", currentMinister: null, cooldown: 0, workload: 0 },
    "ศึกษาธิการ": { icon: "fa-graduation-cap", currentMinister: null, cooldown: 0, workload: 0 },
    "สาธารณสุข": { icon: "fa-hospital", currentMinister: null, cooldown: 0, workload: 0 },
    "อุตสาหกรรม": { icon: "fa-industry", currentMinister: null, cooldown: 0, workload: 0 }
};

// AI Party Personality (Stage C4): the 4 broad lanes a party's lasting priority lean and each
// policy template both live on. Not exhaustive of every issue in the game -- just enough buckets
// for a party's bias to mean something when it's picking which templates to push.
export const PRIORITY_CATEGORIES = ["เศรษฐกิจ", "สวัสดิการ", "ความมั่นคง", "สิ่งแวดล้อม"];

export const POLICY_TEMPLATES = [
    { ministry: "เกษตรและสหกรณ์", name: "โครงการประกันราคาพืชผล", category: "เศรษฐกิจ", cost: 8e10, delibTime: 30, cooldown: 90, ideology: "ประชานิยม", goal: "การเกษตร", target: "เกษตรกร", impact: { "เกษตรกร": 20, "นายทุน": -10 }, worldImpact: { unemployment: -3, crime: -2 } },
    { ministry: "เกษตรและสหกรณ์", name: "ธนาคารน้ำใต้ดินทั่วไทย", category: "สิ่งแวดล้อม", cost: 1.5e10, delibTime: 40, cooldown: 100, ideology: "เทคโนแครต", goal: "การอนุรักษ์ทรัพยากร", target: "เกษตรกร", impact: { "เกษตรกร": 15, "สิ่งแวดล้อม": 10 }, worldImpact: { environment: 8, unemployment: -2 } },
    { ministry: "การคลัง", name: "ภาษีเงินได้อัตราก้าวหน้า", category: "สวัสดิการ", cost: 0, delibTime: 60, cooldown: 180, ideology: "สังคมนิยม", goal: "คุณภาพชีวิต", target: "หัวก้าวหน้า", impact: { "นายทุน": -30, "หัวก้าวหน้า": 20 }, worldImpact: { crime: -5, unemployment: 2 } },
    { ministry: "กลาโหม", name: "จัดซื้อเครื่องบินขับไล่", category: "ความมั่นคง", cost: 2.5e10, delibTime: 40, cooldown: 150, ideology: "ชาตินิยม", goal: "การทหาร", target: "กองทัพ", impact: { "กองทัพ": 25, "เด็กรุ่นใหม่": -25 }, worldImpact: { education: -3, unemployment: -1, military: 12 } },
    { ministry: "คมนาคม", name: "รถไฟฟ้าความเร็วสูง", category: "เศรษฐกิจ", cost: 1.2e11, delibTime: 90, cooldown: 200, ideology: "โลกาภิวัตน์", goal: "เศรษฐกิจ", target: "ชนชั้นกลาง", impact: { "ชนชั้นกลาง": 20, "สิ่งแวดล้อม": -5 }, worldImpact: { unemployment: -6, environment: -4 } },
    { ministry: "การต่างประเทศ", name: "เข้าร่วมกรอบการค้าเสรีระดับภูมิภาค", category: "เศรษฐกิจ", cost: 5e9, delibTime: 45, cooldown: 120, ideology: "โลกาภิวัตน์", goal: "การต่างประเทศ", target: "ทุนข้ามชาติ", impact: { "ทุนข้ามชาติ": 15, "ท้องถิ่น": -8 }, worldImpact: { unemployment: -4 } },
    { ministry: "สาธารณสุข", name: "หลักประกันสุขภาพถ้วนหน้า", category: "สวัสดิการ", cost: 6e10, delibTime: 50, cooldown: 150, ideology: "สังคมนิยม", goal: "สาธารณสุข", target: "แรงงาน", impact: { "แรงงาน": 15, "นายทุน": -15 }, worldImpact: { health: 12, crime: -3 } },
    { ministry: "ศึกษาธิการ", name: "ปฏิรูปหลักสูตรการศึกษาแห่งชาติ", category: "สวัสดิการ", cost: 3e10, delibTime: 60, cooldown: 150, ideology: "หัวก้าวหน้า", goal: "การศึกษา", target: "เด็กรุ่นใหม่", impact: { "เด็กรุ่นใหม่": 20, "อนุรักษ์": -10 }, worldImpact: { education: 15, unemployment: -2 } },
    { ministry: "ท่องเที่ยวและกีฬา", name: "ส่งเสริมการท่องเที่ยวเชิงสร้างสรรค์", category: "เศรษฐกิจ", cost: 1.8e10, delibTime: 35, cooldown: 90, ideology: "โลกาภิวัตน์", goal: "การท่องเที่ยว", target: "ท้องถิ่น", impact: { "ท้องถิ่น": 15, "ทุนข้ามชาติ": 10 }, worldImpact: { unemployment: -4 } },
    { ministry: "ดิจิทัล", name: "โครงสร้างพื้นฐานดิจิทัลแห่งชาติ", category: "เศรษฐกิจ", cost: 4e10, delibTime: 50, cooldown: 120, ideology: "เทคโนแครต", goal: "เทคโนโลยี", target: "เด็กรุ่นใหม่", impact: { "เด็กรุ่นใหม่": 20, "ข้าราชการ": -10 }, worldImpact: { education: 6, unemployment: -3 } },
    { ministry: "พลังงาน", name: "โครงการพลังงานหมุนเวียนแห่งชาติ", category: "สิ่งแวดล้อม", cost: 9e10, delibTime: 70, cooldown: 180, ideology: "หัวก้าวหน้า", goal: "การอนุรักษ์ทรัพยากร", target: "สิ่งแวดล้อม", impact: { "สิ่งแวดล้อม": 25, "นายทุน": -15 }, worldImpact: { environment: 10, unemployment: -2 } },
    { ministry: "พาณิชย์", name: "ควบคุมราคาสินค้าอุปโภคบริโภค", category: "สวัสดิการ", cost: 5e9, delibTime: 30, cooldown: 90, ideology: "ประชานิยม", goal: "คุณภาพชีวิต", target: "ชนชั้นกลาง", impact: { "ชนชั้นกลาง": 15, "นายทุน": -10 }, worldImpact: { crime: -1 } },
    { ministry: "มหาดไทย", name: "กระจายอำนาจสู่องค์กรปกครองส่วนท้องถิ่น", category: "ความมั่นคง", ideology: "การแยกตัว", cost: 2.5e10, delibTime: 60, cooldown: 150, goal: "สิทธิพลเมือง", target: "ท้องถิ่น", impact: { "ท้องถิ่น": 25, "ข้าราชการ": -15 }, worldImpact: { crime: -2 } },
    { ministry: "ยุติธรรม", name: "ปฏิรูปกระบวนการยุติธรรมให้โปร่งใส", category: "ความมั่นคง", cost: 1.5e10, delibTime: 55, cooldown: 130, ideology: "สิทธิมนุษยชน", goal: "ความยุติธรรม", target: "สื่อและปัญญาชน", impact: { "สื่อและปัญญาชน": 20, "ข้าราชการ": -10 }, worldImpact: { crime: -6 } },
    { ministry: "แรงงาน", name: "ปรับขึ้นค่าแรงขั้นต่ำทั่วประเทศ", category: "สวัสดิการ", cost: 0, delibTime: 45, cooldown: 120, ideology: "สังคมนิยม", goal: "สวัสดิการแรงงาน", target: "แรงงาน", impact: { "แรงงาน": 20, "นายทุน": -20 }, worldImpact: { unemployment: 3, crime: -2 } },
    { ministry: "อุตสาหกรรม", name: "ส่งเสริมนิคมอุตสาหกรรมเพื่อการส่งออก", category: "เศรษฐกิจ", cost: 6e10, delibTime: 60, cooldown: 150, ideology: "ชาตินิยม", goal: "อุตสาหกรรมและการส่งออก", target: "นายทุน", impact: { "นายทุน": 20, "แรงงาน": -10 }, worldImpact: { unemployment: -5, environment: -3 } }
];

// The 6 stats a policy's worldImpact can move, each on a 0-100 index and drifting back
// toward its baseline over time (like faction/party trust does) unless a policy keeps pushing it.
export const WORLD_STAT_META = {
    unemployment: { label: "การว่างงาน", icon: "fa-person-circle-exclamation", baseline: 20, goodDirection: -1 },
    crime: { label: "อาชญากรรม", icon: "fa-handcuffs", baseline: 35, goodDirection: -1 },
    health: { label: "สาธารณสุข", icon: "fa-heart-pulse", baseline: 60, goodDirection: 1 },
    education: { label: "การศึกษา", icon: "fa-graduation-cap", baseline: 55, goodDirection: 1 },
    environment: { label: "สิ่งแวดล้อม", icon: "fa-leaf", baseline: 55, goodDirection: 1 },
    military: { label: "ความพร้อมทางทหาร", icon: "fa-shield-halved", baseline: 50, goodDirection: 1 }
};

// Economic Pressure v1 (Stage D1): 5 cost-of-living indices, not the 30-50 individual goods the
// roadmap explicitly says this version skips. Each is DERIVED every tick from real production/
// trade/unemployment/industry-mix signals (engine.js's getCostOfLivingTarget()), the same
// target-and-drift way protestPressure etc. already work -- not something a policy sets directly
// like WORLD_STAT_META's 6 stats, so it deliberately isn't merged into that table (a fixed-
// baseline pull would fight a live-computed target). 50 = neutral; above 50 = more expensive than
// the neutral baseline, below = cheaper.
export const COST_OF_LIVING_META = {
    food: { label: "ค่าอาหาร", icon: "fa-bowl-rice" },
    energy: { label: "ค่าพลังงาน", icon: "fa-bolt" },
    housing: { label: "ค่าที่อยู่อาศัย", icon: "fa-house" },
    industrial: { label: "ต้นทุนภาคอุตสาหกรรม", icon: "fa-industry" },
    transport: { label: "ค่าขนส่ง", icon: "fa-truck" }
};
export const COST_OF_LIVING_CATEGORIES = Object.keys(COST_OF_LIVING_META);

// Each faction feels a rising cost index differently -- the roadmap's own examples (food hits
// labor/farmers differently, housing hits middle class/youth harder) are both in here. Weight is
// how strongly a category above/below 50 moves that faction's approval; a negative weight means
// the faction actually benefits when that cost rises (farmers are food PRODUCERS, not just
// consumers, so rising food prices raise their income). Only the factions economics visibly
// drives get an entry here, the same restraint the existing statBias block already uses (only
// สิ่งแวดล้อม reads environment, only คนว่างงาน/แรงงาน read unemployment) -- more identity-driven
// factions (กองทัพ, ผู้นำศาสนา, ชาตินิยมขวาจัด, etc.) aren't pulled into an economic mechanic that
// isn't really what moves them.
export const COST_OF_LIVING_SENSITIVITY = {
    "แรงงาน": { food: 1.0, energy: 0.6, transport: 0.6, housing: 0.3 },
    "เกษตรกร": { food: -0.4, industrial: 0.3 },
    "ชนชั้นกลาง": { housing: 1.2, transport: 0.5, energy: 0.4, food: 0.3 },
    "เด็กรุ่นใหม่": { housing: 1.3, transport: 0.4, food: 0.3 },
    "คนว่างงาน": { food: 1.2, energy: 0.8, housing: 0.6, transport: 0.5 },
    "นายทุน": { industrial: 0.8, energy: 0.5 },
    "ทุนข้ามชาติ": { industrial: 0.6, energy: 0.4 },
    "ท้องถิ่น": { transport: 0.8, food: 0.4, energy: 0.5 },
    "ข้าราชการ": { food: 0.4, housing: 0.5, transport: 0.3 }
};

// The 6 conventional regions of Thailand, in the order the province map lays them out.
export const REGIONS = ["เหนือ", "อีสาน", "กลาง", "ตะวันออก", "ตะวันตก", "ใต้"];

// All 77 provinces with their real region and an approximate population (rounded, for gameplay
// weighting -- not census-precise). Province shapes/borders aren't included: no licensed Thai
// province boundary dataset was available to bundle locally, so the map groups these by region
// in a grid instead of tracing real geography.
export const PROVINCES = [
    // เหนือ (17)
    { name: "เชียงใหม่", region: "เหนือ", pop: 1780000 },
    { name: "เชียงราย", region: "เหนือ", pop: 1290000 },
    { name: "ลำปาง", region: "เหนือ", pop: 730000 },
    { name: "ลำพูน", region: "เหนือ", pop: 400000 },
    { name: "แม่ฮ่องสอน", region: "เหนือ", pop: 250000 },
    { name: "น่าน", region: "เหนือ", pop: 470000 },
    { name: "พะเยา", region: "เหนือ", pop: 470000 },
    { name: "แพร่", region: "เหนือ", pop: 430000 },
    { name: "อุตรดิตถ์", region: "เหนือ", pop: 440000 },
    { name: "ตาก", region: "เหนือ", pop: 540000 },
    { name: "สุโขทัย", region: "เหนือ", pop: 580000 },
    { name: "พิษณุโลก", region: "เหนือ", pop: 850000 },
    { name: "พิจิตร", region: "เหนือ", pop: 520000 },
    { name: "เพชรบูรณ์", region: "เหนือ", pop: 960000 },
    { name: "กำแพงเพชร", region: "เหนือ", pop: 720000 },
    { name: "นครสวรรค์", region: "เหนือ", pop: 1010000 },
    { name: "อุทัยธานี", region: "เหนือ", pop: 320000 },
    // อีสาน (20)
    { name: "นครราชสีมา", region: "อีสาน", pop: 2630000 },
    { name: "ขอนแก่น", region: "อีสาน", pop: 1800000 },
    { name: "อุดรธานี", region: "อีสาน", pop: 1570000 },
    { name: "อุบลราชธานี", region: "อีสาน", pop: 1870000 },
    { name: "บุรีรัมย์", region: "อีสาน", pop: 1580000 },
    { name: "สุรินทร์", region: "อีสาน", pop: 1370000 },
    { name: "ศรีสะเกษ", region: "อีสาน", pop: 1450000 },
    { name: "ร้อยเอ็ด", region: "อีสาน", pop: 1300000 },
    { name: "มหาสารคาม", region: "อีสาน", pop: 940000 },
    { name: "กาฬสินธุ์", region: "อีสาน", pop: 980000 },
    { name: "สกลนคร", region: "อีสาน", pop: 1140000 },
    { name: "นครพนม", region: "อีสาน", pop: 710000 },
    { name: "ชัยภูมิ", region: "อีสาน", pop: 1120000 },
    { name: "ยโสธร", region: "อีสาน", pop: 530000 },
    { name: "หนองคาย", region: "อีสาน", pop: 520000 },
    { name: "หนองบัวลำภู", region: "อีสาน", pop: 510000 },
    { name: "มุกดาหาร", region: "อีสาน", pop: 350000 },
    { name: "อำนาจเจริญ", region: "อีสาน", pop: 370000 },
    { name: "เลย", region: "อีสาน", pop: 630000 },
    { name: "บึงกาฬ", region: "อีสาน", pop: 420000 },
    // กลาง (14, รวมกรุงเทพฯ)
    { name: "กรุงเทพมหานคร", region: "กลาง", pop: 5500000 },
    { name: "นนทบุรี", region: "กลาง", pop: 1300000 },
    { name: "ปทุมธานี", region: "กลาง", pop: 1200000 },
    { name: "สมุทรปราการ", region: "กลาง", pop: 1370000 },
    { name: "นครปฐม", region: "กลาง", pop: 920000 },
    { name: "สมุทรสาคร", region: "กลาง", pop: 590000 },
    { name: "สมุทรสงคราม", region: "กลาง", pop: 190000 },
    { name: "พระนครศรีอยุธยา", region: "กลาง", pop: 830000 },
    { name: "อ่างทอง", region: "กลาง", pop: 270000 },
    { name: "ลพบุรี", region: "กลาง", pop: 750000 },
    { name: "สิงห์บุรี", region: "กลาง", pop: 200000 },
    { name: "ชัยนาท", region: "กลาง", pop: 320000 },
    { name: "สระบุรี", region: "กลาง", pop: 640000 },
    { name: "สุพรรณบุรี", region: "กลาง", pop: 830000 },
    // ตะวันออก (8)
    { name: "ชลบุรี", region: "ตะวันออก", pop: 1600000 },
    { name: "ระยอง", region: "ตะวันออก", pop: 780000 },
    { name: "จันทบุรี", region: "ตะวันออก", pop: 540000 },
    { name: "ตราด", region: "ตะวันออก", pop: 230000 },
    { name: "ฉะเชิงเทรา", region: "ตะวันออก", pop: 720000 },
    { name: "ปราจีนบุรี", region: "ตะวันออก", pop: 490000 },
    { name: "นครนายก", region: "ตะวันออก", pop: 260000 },
    { name: "สระแก้ว", region: "ตะวันออก", pop: 560000 },
    // ตะวันตก (4)
    { name: "กาญจนบุรี", region: "ตะวันตก", pop: 900000 },
    { name: "ราชบุรี", region: "ตะวันตก", pop: 860000 },
    { name: "เพชรบุรี", region: "ตะวันตก", pop: 480000 },
    { name: "ประจวบคีรีขันธ์", region: "ตะวันตก", pop: 550000 },
    // ใต้ (14)
    { name: "นครศรีธรรมราช", region: "ใต้", pop: 1550000 },
    { name: "กระบี่", region: "ใต้", pop: 480000 },
    { name: "พังงา", region: "ใต้", pop: 270000 },
    { name: "ภูเก็ต", region: "ใต้", pop: 420000 },
    { name: "สุราษฎร์ธานี", region: "ใต้", pop: 1080000 },
    { name: "ระนอง", region: "ใต้", pop: 190000 },
    { name: "ชุมพร", region: "ใต้", pop: 510000 },
    { name: "สงขลา", region: "ใต้", pop: 1420000 },
    { name: "สตูล", region: "ใต้", pop: 320000 },
    { name: "ตรัง", region: "ใต้", pop: 640000 },
    { name: "พัทลุง", region: "ใต้", pop: 520000 },
    { name: "ปัตตานี", region: "ใต้", pop: 730000 },
    { name: "ยะลา", region: "ใต้", pop: 540000 },
    { name: "นราธิวาส", region: "ใต้", pop: 830000 }
];

// Regional default candidate factions a province's voters are likely to lean toward,
// plus explicit overrides for provinces where a regional default would be unrealistic.
export const REGION_FACTION_POOL = {
    "เหนือ": ["เกษตรกร", "หัวก้าวหน้า", "ท้องถิ่น"],
    "อีสาน": ["เกษตรกร", "แรงงาน", "ท้องถิ่น"],
    "กลาง": ["เกษตรกร", "ชนชั้นกลาง", "ท้องถิ่น"],
    "ตะวันออก": ["ทุนข้ามชาติ", "แรงงาน", "นายทุน"],
    "ตะวันตก": ["เกษตรกร", "ท้องถิ่น"],
    "ใต้": ["อนุรักษ์", "ผู้นำศาสนา", "ท้องถิ่น"]
};
export const PROVINCE_FACTION_OVERRIDES = {
    "กรุงเทพมหานคร": "ชนชั้นกลาง",
    "เชียงใหม่": "หัวก้าวหน้า",
    "ภูเก็ต": "ทุนข้ามชาติ",
    "ชลบุรี": "ทุนข้ามชาติ",
    "ระยอง": "ทุนข้ามชาติ",
    "ปัตตานี": "ผู้นำศาสนา",
    "ยะลา": "ผู้นำศาสนา",
    "นราธิวาส": "ผู้นำศาสนา",
    "สตูล": "ผู้นำศาสนา"
};

// Which ideology (from IDEOLOGY_POOL) each faction tends to reward at the ballot box.
// Used at election time: a party campaigning on a province's affinity ideology gets a
// local boost in that province's constituency races.
export const FACTION_IDEOLOGY_AFFINITY = {
    "กองทัพ": "ชาตินิยม",
    "หัวก้าวหน้า": "หัวก้าวหน้า",
    "อนุรักษ์": "อนุรักษ์นิยม",
    "เทคโนแครต": "โลกาภิวัตน์",
    "นายทุน": "อนุรักษ์นิยม",
    "ผู้นำศาสนา": "ศาสนานิยม",
    "สิ่งแวดล้อม": "หัวก้าวหน้า",
    "ชนชั้นกลาง": "เสรีนิยม",
    "แรงงาน": "สังคมนิยม",
    "เกษตรกร": "ประชานิยม",
    "คนว่างงาน": "ประชานิยม",
    "เด็กรุ่นใหม่": "สิทธิมนุษยชน",
    "ชาตินิยมขวาจัด": "ชาตินิยม",
    "สื่อและปัญญาชน": "เสรีนิยม",
    "ทุนข้ามชาติ": "โลกาภิวัตน์",
    "ท้องถิ่น": "การแยกตัว",
    "ข้าราชการ": "อนุรักษ์นิยม"
};

// Each province's primary industry, driving the production side of the economy
// (js/engine.js's provinceOutput()) alongside the approval-driven growth formula that
// already existed. sensitivity ties an industry's output to the national stats added in
// Phase 4: a positive weight means the industry does better when that stat is high, a
// negative weight means it does better when that stat is low.
export const INDUSTRY_TYPES = {
    "เกษตรกรรม": { icon: "fa-wheat-awn", label: "เกษตรกรรม", baseOutput: 1.0, sensitivity: { environment: 0.4, unemployment: -0.2 } },
    "อุตสาหกรรม": { icon: "fa-industry", label: "อุตสาหกรรม", baseOutput: 1.8, sensitivity: { education: 0.3, unemployment: -0.3, military: 0.15 } },
    "การท่องเที่ยว": { icon: "fa-umbrella-beach", label: "การท่องเที่ยว", baseOutput: 1.4, sensitivity: { crime: -0.4 } },
    "เทคโนโลยี": { icon: "fa-microchip", label: "เทคโนโลยี", baseOutput: 2.2, sensitivity: { education: 0.5 } },
    "ประมง": { icon: "fa-fish", label: "ประมงและทะเล", baseOutput: 1.0, sensitivity: { environment: 0.3 } },
    "โลจิสติกส์และการส่งออก": { icon: "fa-truck-fast", label: "โลจิสติกส์และการส่งออก", baseOutput: 1.6, sensitivity: { crime: -0.3, unemployment: -0.2 } }
};
export const REGION_INDUSTRY_DEFAULT = {
    "เหนือ": "เกษตรกรรม",
    "อีสาน": "เกษตรกรรม",
    "กลาง": "เกษตรกรรม",
    "ตะวันออก": "อุตสาหกรรม",
    "ตะวันตก": "เกษตรกรรม",
    "ใต้": "ประมง"
};
export const PROVINCE_INDUSTRY_OVERRIDES = {
    "กรุงเทพมหานคร": "เทคโนโลยี",
    "นนทบุรี": "เทคโนโลยี",
    "ปทุมธานี": "เทคโนโลยี",
    "สมุทรปราการ": "อุตสาหกรรม",
    "ภูเก็ต": "การท่องเที่ยว",
    "กระบี่": "การท่องเที่ยว",
    "พังงา": "การท่องเที่ยว",
    "สุราษฎร์ธานี": "การท่องเที่ยว",
    "ชลบุรี": "อุตสาหกรรม",
    "ระยอง": "อุตสาหกรรม",
    "ฉะเชิงเทรา": "อุตสาหกรรม",
    "ปราจีนบุรี": "อุตสาหกรรม",
    "เชียงใหม่": "การท่องเที่ยว",
    "เชียงราย": "การท่องเที่ยว"
};

// Which industries a province can realistically pivot toward, by region: a landlocked
// northeastern province can't become a fishery, a mountainous northern one can't become a
// logistics/export hub the way a border or port province can. investProvince() in engine.js
// only allows a shift within this set -- geography gates the choice, not an arbitrary picklist.
export const REGION_ELIGIBLE_INDUSTRIES = {
    "เหนือ": ["เกษตรกรรม", "การท่องเที่ยว"],
    "อีสาน": ["เกษตรกรรม", "อุตสาหกรรม", "โลจิสติกส์และการส่งออก"],
    "กลาง": ["เกษตรกรรม", "อุตสาหกรรม", "เทคโนโลยี", "โลจิสติกส์และการส่งออก"],
    "ตะวันออก": ["เกษตรกรรม", "อุตสาหกรรม", "การท่องเที่ยว", "โลจิสติกส์และการส่งออก"],
    "ตะวันตก": ["เกษตรกรรม", "การท่องเที่ยว", "โลจิสติกส์และการส่งออก"],
    "ใต้": ["เกษตรกรรม", "ประมง", "การท่องเที่ยว"]
};

// Dynamic Society (Phase 6): which of the 17 existing FACTIONS actually work each industry, and
// what share of that industry's provincial population belongs to each -- no new factions, just
// wiring the ones that already exist (เกษตรกร, แรงงาน, ชนชั้นกลาง, เทคโนแครต, ท้องถิ่น) to the
// provincial industry mix so investing in one industry over another visibly grows the classes
// that work there. Shares per industry sum to 1.
export const FACTION_INDUSTRY_LINK = {
    "เกษตรกรรม": { "เกษตรกร": 1.0 },
    "ประมง": { "เกษตรกร": 0.7, "ท้องถิ่น": 0.3 },
    "อุตสาหกรรม": { "แรงงาน": 0.8, "ชนชั้นกลาง": 0.2 },
    "การท่องเที่ยว": { "แรงงาน": 0.5, "ท้องถิ่น": 0.5 },
    "เทคโนโลยี": { "เทคโนแครต": 0.6, "ชนชั้นกลาง": 0.4 },
    "โลจิสติกส์และการส่งออก": { "แรงงาน": 0.5, "ชนชั้นกลาง": 0.3, "ท้องถิ่น": 0.2 }
};
