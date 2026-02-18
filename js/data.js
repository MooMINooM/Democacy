// --- EXISTING FACTION DATA (Keep as is) ---
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

// --- 1. ด้านแนวคิด (IDEOLOGY) ---
export const IDEOLOGY_POOL = [
    "เสรีนิยม", "ชาตินิยม", "อำนาจนิยม", "ประชาธิปไตย", "สังคมนิยม", 
    "ฟาสซิสต์", "คอมมิวนิสต์", "ศาสนานิยม", "ฆราวาสนิยม", "อนุรักษ์นิยม", 
    "โลกาภิวัตน์", "การแยกตัว", "หัวก้าวหน้า", "ประชานิยม", "สิทธิมนุษยชน"
];

// --- 2. ด้านเป้าหมาย (GOAL) ---
export const GOAL_POOL = [
    "การศึกษา", "เศรษฐกิจ", "การต่างประเทศ", "สิ่งแวดล้อม", "การเกษตร", 
    "การทหาร", "เทคโนโลยี", "สาธารณสุข", "ความยุติธรรม", "การอนุรักษ์ทรัพยากร", 
    "อุตสาหกรรมและการส่งออก", "การท่องเที่ยว", "คุณภาพชีวิต", "สวัสดิการแรงงาน", 
    "การสะสมทุน", "ความมั่นคงทางอาหาร", "สิทธิพลเมือง"
];

// --- 3. ด้านความสามารถ (ABILITY) ---
// costMod: ตัวคูณราคาค่าตัว, influence: ผลต่อคะแนนเสียง
export const ABILITY_POOL = [
    { name: "การสื่อสารภาษาต่างประเทศ", costMod: 1.2, desc: "เจรจาต่างชาติได้ดี" },
    { name: "การรับมือสื่อสาธารณะ", costMod: 1.5, desc: "แก้ข่าวเก่ง ลดความเสียหาย" },
    { name: "การพูดชักจูง", costMod: 1.4, desc: "เพิ่มโอกาสโหวตชนะ" },
    { name: "การระดมพล", costMod: 1.3, desc: "เรียกม็อบได้" },
    { name: "การเงิน", costMod: 1.5, desc: "หาเงินทุนเข้าพรรคเก่ง" },
    { name: "บารมี", costMod: 2.0, desc: "อิทธิพลสูง คุมเสียงได้" },
    { name: "เครือข่ายความสัมพันธ์", costMod: 1.8, desc: "รู้ข่าวงูเห่าเร็ว" },
    { name: "การคิดวิเคราะห์", costMod: 1.2, desc: "วางแผนแม่นยำ" },
    { name: "ความเชี่ยวชาญเฉพาะทาง", costMod: 1.3, desc: "ร่างกฎหมายผ่านง่าย" },
    { name: "การคอรัปชั่น", costMod: 0.5, desc: "ซื้อตัวง่ายมาก" },
    { name: "ความยืดหยุ่นทางอุดมการณ์", costMod: 0.8, desc: "ย้ายพรรคง่าย" },
    { name: "ความเด็ดขาด", costMod: 1.5, desc: "ไม่ค่อยโหวตสวน" },
    { name: "การบริหารจัดการ", costMod: 1.4, desc: "เพิ่มประสิทธิภาพกระทรวง" },
    { name: "การต่างประเทศ", costMod: 1.3, desc: "ภาพลักษณ์ดี" }
];

// --- 4. ด้านสถานะทางสังคม/ที่มาของรายได้ (SOCIO-ECONOMIC) ---
// baseWealth: ฐานะการเงิน (M), costMod: ความยากในการซื้อ (คนรวยซื้อยากกว่า)
export const SOCIO_POOL = [
    { name: "เกษตรกร", baseWealth: 5, costMod: 0.8 },
    { name: "มนุษย์เงินเดือน(เอกชน)", baseWealth: 10, costMod: 1.0 },
    { name: "เจ้าของธุรกิจขนาดใหญ่", baseWealth: 500, costMod: 3.0 },
    { name: "แรงงาน", baseWealth: 3, costMod: 0.7 },
    { name: "เจ้าของธุรกิจขนาดเล็ก", baseWealth: 20, costMod: 1.2 },
    { name: "อดีตข้าราชการ", baseWealth: 15, costMod: 1.1 },
    { name: "อาชีพอิสระ", baseWealth: 8, costMod: 0.9 },
    { name: "นักวิชาการ", baseWealth: 12, costMod: 1.5 }
];

export const IDEOLOGY_CONFLICTS = {
    "เสรีนิยม": ["อำนาจนิยม", "ฟาสซิสต์"],
    "ประชาธิปไตย": ["อำนาจนิยม", "ฟาสซิสต์", "คอมมิวนิสต์"],
    "อำนาจนิยม": ["เสรีนิยม", "ประชาธิปไตย", "สิทธิมนุษยชน"],
    "สังคมนิยม": ["ทุนนิยม", "อนุรักษ์นิยม"],
    "อนุรักษ์นิยม": ["หัวก้าวหน้า", "สังคมนิยม"],
    "หัวก้าวหน้า": ["อนุรักษ์นิยม", "ศาสนานิยม"],
    "ศาสนานิยม": ["ฆราวาสนิยม", "หัวก้าวหน้า"]
};

export const THAI_NAMES = ["เกรียงไกร", "วิลาศ", "ธนา", "ศิริกัญญา", "สมชาย", "ประวิทย์", "ทักษิณ", "อนุทิน", "พิธา", "จุรินทร์", "ธรรมนัส", "สุดารัตน์", "วราวุธ", "กิตติภพ", "อารีลักษณ์", "ชูวิทย์", "ชวน", "รังสิมันต์", "ปารีณา", "เศรษฐา", "ไพบูลย์", "ปิยบุตร", "นิรันดร์", "ดนัย", "ชัยวุฒิ", "วรากร", "สนธิญาณ", "มงคลกิตติ์", "พรรณิการ์", "ทวี", "วันนอร์", "ชาดา", "สุริยะ", "วรวัจน์", "วิโรจน์"];
export const THAI_SURNAMES = ["จิตรภักดี", "เลิศอนันต์", "พาณิชย์ศิริ", "รุ่งเรืองไกร", "คงมั่งคั่ง", "วงษ์สุวรรณ", "ชินวัตร", "จูรีกรณ์", "เหล่าพงศ์ศิลป์", "ตระกูลสวัสดิ์", "ภักดีศรีไทย", "กรรณสูตร", "วานิชกุล", "ศิลปอาชา", "เทวกุล", "รัตนเสถียร", "โชติวิทย์", "มานะกร", "วิจิตรโชติ", "ไทยยืนยง", "จึงรุ่งเรืองกิจ", "ลีลาเทพ", "ชาญวีรกุล", "พูนสวัสดิ์", "สืบแสง"];

export let ALL_MP_NAMES = [];
THAI_NAMES.forEach(f => THAI_SURNAMES.forEach(l => ALL_MP_NAMES.push(`สส.${f} ${l}`)));
ALL_MP_NAMES.sort(() => Math.random() - 0.5);

// Player Backgrounds (Keep for compatibility)
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
    { ministry: "เกษตรและสหกรณ์", name: "โครงการประกันราคาพืชผล", cost: 8e10, delibTime: 30, cooldown: 90, ideology: "ประชานิยม", goal: "เกษตร", target: "เกษตรกร", impact: { "เกษตรกร": 20, "นายทุน": -10 } },
    { ministry: "เกษตรและสหกรณ์", name: "ธนาคารน้ำใต้ดินทั่วไทย", cost: 1.5e10, delibTime: 40, cooldown: 100, ideology: "เทคโนแครต", goal: "ทรัพยากร", target: "เกษตรกร", impact: { "เกษตรกร": 15, "สิ่งแวดล้อม": 10 } },
    { ministry: "การคลัง", name: "ภาษีเงินได้อัตราก้าวหน้า", cost: 0, delibTime: 60, cooldown: 180, ideology: "สังคมนิยม", goal: "คุณภาพชีวิต", target: "หัวก้าวหน้า", impact: { "นายทุน": -30, "หัวก้าวหน้า": 20 } },
    { ministry: "กลาโหม", name: "จัดซื้อเครื่องบินขับไล่", cost: 2.5e10, delibTime: 40, cooldown: 150, ideology: "ชาตินิยม", goal: "การทหาร", target: "กองทัพ", impact: { "กองทัพ": 25, "เด็กรุ่นใหม่": -25 } },
    { ministry: "คมนาคม", name: "รถไฟฟ้าความเร็วสูง", cost: 1.2e11, delibTime: 90, cooldown: 200, ideology: "โลกาภิวัตน์", goal: "เศรษฐกิจ", target: "ชนชั้นกลาง", impact: { "ชนชั้นกลาง": 20, "สิ่งแวดล้อม": -5 } }
];
