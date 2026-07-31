const grid = document.getElementById('synth-grid');
const fileInput = document.getElementById('audio-file');
const statusText = document.getElementById('status-text');
const panel = document.getElementById('main-panel');

const corners = {
    tl: document.getElementById('color-tl'),
    tr: document.getElementById('color-tr'),
    bl: document.getElementById('color-bl'),
    br: document.getElementById('color-br')
};
const uiColors = {
    bg: document.getElementById('color-bg'),
    panel: document.getElementById('color-ui')
};

const COLUMNS = 12;
const ROWS = 7;

const NOTE_STR = "C,C#,D,D#,E,F,F#,G,G#,A,A#,B";
const NOTE_NAMES = NOTE_STR.split(",");

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let audioBuffer = null;
const midiButtonMap = {};

function hexToRgb(hex) {
    if (!hex) return { r: 0, g: 0, b: 0 };
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

function updateColors() {
    if (uiColors.bg) document.body.style.backgroundColor = uiColors.bg.value;
    if (panel && uiColors.panel) panel.style.backgroundColor = uiColors.panel.value;

    if (!corners.tl || !corners.tr || !corners.bl || !corners.br) return;

    const cTL = hexToRgb(corners.tl.value);
    const cTR = hexToRgb(corners.tr.value);
    const cBL = hexToRgb(corners.bl.value);
    const cBR = hexToRgb(corners.br.value);

    document.querySelectorAll('.music-btn').forEach((btn, index) => {
        const x = (index % COLUMNS) / (COLUMNS - 1);
        const y = Math.floor(index / COLUMNS) / (ROWS - 1);
        const r = Math.round(cTL.r*(1-x)*(1-y) + cTR.r*x*(1-y) + cBL.r*(1-x)*y + cBR.r*x*y);
        const g = Math.round(cTL.g*(1-x)*(1-y) + cTR.g*x*(1-y) + cBL.g*(1-x)*y + cBR.g*x*y);
        const b = Math.round(cTL.b*(1-x)*(1-y) + cTR.b*x*(1-y) + cBL.b*(1-x)*y + cBR.b*x*y);
        btn.style.backgroundColor = "rgb(" + r + "," + g + "," + b + ")";
    });
}

function createGrid() {
    if (!grid) return;
    grid.innerHTML = '';
    for (let row = 0; row < ROWS; row++) {
        const currentOctave = 7 - row; 
        
        for (let col = 0; col < COLUMNS; col++) {
            const btn = document.createElement('button');
            btn.className = 'music-btn';
            const label = document.createElement('span');
            label.className = 'note-label';
            label.innerText = NOTE_NAMES[col] + currentOctave;
            btn.appendChild(label);
            
            const semitones = (currentOctave - 4) * 12 + col;
            const midiNote = 60 + semitones; 
            midiButtonMap[midiNote] = btn;
            
            btn.onclick = () => playNote(semitones, btn);
            grid.appendChild(btn);
        }
    }
    updateColors();
}

async function playNote(semitones, btn) {
    if (!audioBuffer) return;
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.detune.value = semitones * 100;
    source.connect(audioCtx.destination);
    source.start(0);
    if (btn) {
        btn.classList.add('playing');
        setTimeout(() => btn.classList.remove('playing'), 100);
    }
}

if (fileInput) {
    fileInput.onchange = async (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        if (statusText) statusText.innerText = "Загрузка...";
        try {
            const file = e.target.files[0]; // Исправлено: берем первый файл из массива напрямую
            const arrayBuffer = await file.arrayBuffer();
            audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            if (statusText) statusText.innerText = file.name;
            
            // Как только звук успешно загружен, делаем кнопки на 100% яркими и живыми!
            document.querySelectorAll('.music-btn').forEach(btn => {
                btn.style.opacity = "1";
            });
        } catch (err) {
            if (statusText) statusText.innerText = "Ошибка файла";
            console.error(err);
        }
    };
}

const allInputs = [corners.tl, corners.tr, corners.bl, corners.br, uiColors.bg, uiColors.panel];
allInputs.forEach(i => { if(i) i.oninput = updateColors; });

if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(midi => {
        for (let input of midi.inputs.values()) {
            input.onmidimessage = (msg) => {
                const cmd = msg.data[0];  // Исправлено: корректное чтение байтов MIDI
                const note = msg.data[1]; // Исправлено
                const vel = msg.data[2];  // Исправлено
                if (cmd === 144 && vel > 0) {
                    const btn = midiButtonMap[note];
                    playNote(note - 60, btn);
                }
            };
        }
    }).catch(err => console.log("MIDI не поддерживается"));
}

createGrid();
