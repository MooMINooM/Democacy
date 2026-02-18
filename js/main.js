import { state } from './state.js';
import * as Data from './data.js';
import { engine, gameClock } from './engine.js';
import { ui } from './ui.js';

// Setup Logic
const setup = {
    currentStep: 1,
    init() {
        state.parties = engine.generateGameParties();
        Data.BACKGROUNDS.forEach(bg => {
            const el = document.createElement('div');
            el.className = "radio-card p-5 border-2 border-stone-300 cursor-pointer text-black transition hover:bg-stone-100 rounded-lg text-left shadow-sm font-sans";
            el.onclick = () => { document.querySelectorAll('#background-list .radio-card').forEach(x => x.classList.remove('selected')); el.classList.add('selected'); state.player.background = bg; };
            el.innerHTML = `<h3 class="font-bold text-xl mb-2 serif text-black text-lg">${bg.name}</h3><p class="text-xs text-black opacity-70 leading-relaxed font-sans">${bg.desc}</p>`;
            document.getElementById('background-list').appendChild(el);
        });
        state.parties.forEach(p => {
            const el = document.createElement('div');
            el.className = "party-card p-4 border border-stone-200 cursor-pointer text-black transition hover:border-black rounded-lg text-left bg-white shadow-sm font-sans";
            el.onclick = () => { document.querySelectorAll('#party-list-setup .party-card').forEach(x => x.classList.remove('selected')); el.classList.add('selected'); state.player.party = p; };
            el.innerHTML = `<div class="w-full h-1 mb-3 rounded-full font-sans" style="background:${p.color}"></div><div class="font-bold text-black text-sm mb-1 font-sans">${p.name}</div><div class="text-[9px] text-stone-500 mb-2 italic font-sans">ฐานเสียงหลัก: ${p.baseFaction}</div>`;
            document.getElementById('party-list-setup').appendChild(el);
        });
        ["สส. เขต", "หัวหน้าพรรค", "นายกรัฐมนตรี"].forEach(pos => {
            const el = document.createElement('div');
            el.className = "radio-card p-6 border-2 border-stone-300 cursor-pointer text-black transition hover:bg-stone-100 rounded-lg text-center shadow-sm font-sans";
            el.onclick = () => { document.querySelectorAll('#position-list .radio-card').forEach(x => x.classList.remove('selected')); el.classList.add('selected'); state.player.position = pos; };
            el.innerHTML = `<h3 class="font-bold text-2xl serif text-black text-xl font-sans">${pos}</h3>`;
            document.getElementById('position-list').appendChild(el);
        });
    },
    next() {
        if (this.currentStep === 1 && !document.getElementById('p-name').value) { alert("ระบุชื่อ"); return; }
        if (this.currentStep === 3 && !state.player.party) { alert("เลือกพรรค"); return; }
        if (this.currentStep === 4) { 
            if(!state.player.position) { alert("เลือกตำแหน่ง"); return; }
            state.player.name = document.getElementById('p-name').value;
            document.getElementById('setup-overlay').classList.add('hidden'); 
            document.getElementById('main-game').classList.remove('hidden'); 
            engine.init(); ui.updateMain(); gameClock.setSpeed(1); return; 
        }
        document.getElementById(`step-${this.currentStep}`).classList.add('hidden');
        this.currentStep++; document.getElementById(`step-${this.currentStep}`).classList.remove('hidden');
        const pB = document.getElementById('btn-prev'); if(pB) pB.classList.remove('invisible');
        document.querySelectorAll('#setup-dots span').forEach((d, i) => d.classList.toggle('bg-black', i < this.currentStep));
    },
    prev() {
        if(this.currentStep <= 1) return;
        document.getElementById(`step-${this.currentStep}`).classList.add('hidden');
        this.currentStep--; document.getElementById(`step-${this.currentStep}`).classList.remove('hidden');
        if (this.currentStep === 1) document.getElementById('btn-prev').classList.add('invisible');
        document.querySelectorAll('#setup-dots span').forEach((d, i) => d.classList.toggle('bg-black', i < this.currentStep));
    }
};

// Expose to window for HTML onclick attributes (Legacy Support)
window.setup = setup;
window.gameClock = gameClock;
window.ui = ui;
window.engine = engine;

// Start Setup
window.onload = () => { 
    setup.init(); 
    document.getElementById('setup-date').innerText = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }); 
};