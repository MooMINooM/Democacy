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

export const FOREIGN_POWERS = [
    { id: "US", name: "สหรัฐอเมริกา", icon: "fa-flag-usa", ideology: "เสรีนิยม", tradeWeight: 25 },
    { id: "CN", name: "จีน", icon: "fa-yin-yang", ideology: "อำนาจนิยม", tradeWeight: 30 },
    { id: "EU", name: "สหภาพยุโรป", icon: "fa-star", ideology: "สิทธิมนุษยชน", tradeWeight: 20 },
    { id: "JP", name: "ญี่ปุ่น", icon: "fa-torii-gate", ideology: "โลกาภิวัตน์", tradeWeight: 15 },
    { id: "AS", name: "อาเซียน", icon: "fa-people-group", ideology: "ประชานิยม", tradeWeight: 10 }
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
    "ประชาธิปไตย": ["อำนาจนิยม", "ฟาสซิสต์", "คอมมิวนิสต์"],
    "อำนาจนิยม": ["เสรีนิยม", "ประชาธิปไตย", "สิทธิมนุษยชน"],
    "สังคมนิยม": ["อนุรักษ์นิยม"],
    "อนุรักษ์นิยม": ["หัวก้าวหน้า", "สังคมนิยม"],
    "หัวก้าวหน้า": ["อนุรักษ์นิยม", "ศาสนานิยม"],
    "ศาสนานิยม": ["ฆราวาสนิยม", "หัวก้าวหน้า"]
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

export const MINISTRIES = {
    "กลาโหม": { icon: "fa-shield-halved", currentMinister: null, cooldown: 0 },
    "การคลัง": { icon: "fa-wallet", currentMinister: null, cooldown: 0 },
    "การต่างประเทศ": { icon: "fa-earth-asia", currentMinister: null, cooldown: 0 },
    "ท่องเที่ยวและกีฬา": { icon: "fa-person-skating", currentMinister: null, cooldown: 0 },
    "เกษตรและสหกรณ์": { icon: "fa-wheat-awn", currentMinister: null, cooldown: 0 },
    "คมนาคม": { icon: "fa-train-subway", currentMinister: null, cooldown: 0 },
    "ดิจิทัล": { icon: "fa-laptop-code", currentMinister: null, cooldown: 0 },
    "พลังงาน": { icon: "fa-bolt-lightning", currentMinister: null, cooldown: 0 },
    "พาณิชย์": { icon: "fa-shop", currentMinister: null, cooldown: 0 },
    "มหาดไทย": { icon: "fa-house-user", currentMinister: null, cooldown: 0 },
    "ยุติธรรม": { icon: "fa-scale-balanced", currentMinister: null, cooldown: 0 },
    "แรงงาน": { icon: "fa-hammer", currentMinister: null, cooldown: 0 },
    "ศึกษาธิการ": { icon: "fa-graduation-cap", currentMinister: null, cooldown: 0 },
    "สาธารณสุข": { icon: "fa-hospital", currentMinister: null, cooldown: 0 },
    "อุตสาหกรรม": { icon: "fa-industry", currentMinister: null, cooldown: 0 }
};

export const POLICY_TEMPLATES = [
    { ministry: "เกษตรและสหกรณ์", name: "โครงการประกันราคาพืชผล", cost: 8e10, delibTime: 30, cooldown: 90, ideology: "ประชานิยม", goal: "การเกษตร", target: "เกษตรกร", impact: { "เกษตรกร": 20, "นายทุน": -10 } },
    { ministry: "เกษตรและสหกรณ์", name: "ธนาคารน้ำใต้ดินทั่วไทย", cost: 1.5e10, delibTime: 40, cooldown: 100, ideology: "เทคโนแครต", goal: "การอนุรักษ์ทรัพยากร", target: "เกษตรกร", impact: { "เกษตรกร": 15, "สิ่งแวดล้อม": 10 } },
    { ministry: "การคลัง", name: "ภาษีเงินได้อัตราก้าวหน้า", cost: 0, delibTime: 60, cooldown: 180, ideology: "สังคมนิยม", goal: "คุณภาพชีวิต", target: "หัวก้าวหน้า", impact: { "นายทุน": -30, "หัวก้าวหน้า": 20 } },
    { ministry: "กลาโหม", name: "จัดซื้อเครื่องบินขับไล่", cost: 2.5e10, delibTime: 40, cooldown: 150, ideology: "ชาตินิยม", goal: "การทหาร", target: "กองทัพ", impact: { "กองทัพ": 25, "เด็กรุ่นใหม่": -25 } },
    { ministry: "คมนาคม", name: "รถไฟฟ้าความเร็วสูง", cost: 1.2e11, delibTime: 90, cooldown: 200, ideology: "โลกาภิวัตน์", goal: "เศรษฐกิจ", target: "ชนชั้นกลาง", impact: { "ชนชั้นกลาง": 20, "สิ่งแวดล้อม": -5 } },
    { ministry: "การต่างประเทศ", name: "เข้าร่วมกรอบการค้าเสรีระดับภูมิภาค", cost: 5e9, delibTime: 45, cooldown: 120, ideology: "โลกาภิวัตน์", goal: "การต่างประเทศ", target: "ทุนข้ามชาติ", impact: { "ทุนข้ามชาติ": 15, "ท้องถิ่น": -8 } }
];

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
