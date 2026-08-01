const grid = document.getElementById('synth-grid');
const fileInput = document.getElementById('audio-file');
const statusText = document.getElementById('status-text');
const panel = document.getElementById('main-panel');

const btnRecord = document.getElementById('btn-record');
const recStatus = document.getElementById('rec-status');

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

const OCTAVE_STR = "7,6,5,4,3,2,1";
const OCTAVES = OCTAVE_STR.split(",");

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let audioBuffer = null;
const midiButtonMap = {};

let destNode = audioCtx.createMediaStreamDestination();
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

let midiEvents = [];
let recordStartTime = 0;

function hexToRgb(hex) {
    if (!hex) return { r: 0, g: 0, b: 0 };
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

function updateColors() {
    if (uiColors.bg && document.body) document.body.style.backgroundColor = uiColors.bg.value;
    if (panel && uiColors.panel) panel.style.backgroundColor = uiColors.panel.value;

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
        const currentOctave = parseInt(OCTAVES[row]); 
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
            
            btn.onclick = () => {
                playNote(semitones, btn);
            };
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
    source.connect(destNode);
    source.start(0);
    
    if (isRecording) {
        const timestamp = Date.now() - recordStartTime;
        const noteNumber = 60 + semitones;
        midiEvents.push({ time: timestamp, note: noteNumber });
    }

    if (btn) {
        btn.classList.add('playing');
        setTimeout(() => btn.classList.remove('playing'), 120);
    }
}

if (btnRecord) {
    btnRecord.onclick = () => {
        if (!audioBuffer) return alert("Сначала загрузите аудиофайл!");

        if (!isRecording) {
            isRecording = true;
            audioChunks = [];
            midiEvents = [];
            recordStartTime = Date.now();

            mediaRecorder = new MediaRecorder(destNode.stream);
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                saveWavFile();
                saveMidiFile();
            };

            mediaRecorder.start();
            btnRecord.classList.add('recording');
            btnRecord.innerText = "⏹️ Стоп";
            recStatus.innerText = "Запись...";
        } else {
            isRecording = false;
            mediaRecorder.stop();
            btnRecord.classList.remove('recording');
            btnRecord.innerText = "🔴 Запись";
            recStatus.innerText = "Ожидание";
        }
    };
}

function saveWavFile() {
    const blob = new Blob(audioChunks, { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'synth_record.wav';
    a.click();
}

function saveMidiFile() {
    if (midiEvents.length === 0) return;

    let bytes = [
        0x4D, 0x54, 0x68, 0x64, 
        0x00, 0x00, 0x00, 0x06, 
        0x00, 0x00,             
        0x00, 0x01,             
        0x00, 0x60              
    ];

    let trackData = [
        0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20 
    ];

    let lastTime = 0;
    midiEvents.forEach(evt => {
        let deltaTime = Math.floor((evt.time - lastTime) * 0.5); 
        if (deltaTime < 0) deltaTime = 0;
        
        trackData.push(deltaTime & 0x7F); 
        trackData.push(0x90);     
        trackData.push(evt.note); 
        trackData.push(0x64);     

        trackData.push(40); 
        trackData.push(0x80);     
        trackData.push(evt.note);
        trackData.push(0x00);
        
        lastTime = evt.time + 80;
    });

    trackData.push(0x00, 0xFF, 0x2F, 0x00);

    bytes.push(0x4D, 0x54, 0x72, 0x6B); 
    let len = trackData.length;
    bytes.push((len >> 24) & 0xFF, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF);
    bytes = bytes.concat(trackData);

    const uint8 = new Uint8Array(bytes);
    const blob = new Blob([uint8], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'synth_record.mid';
    a.click();
}

if (fileInput) {
    fileInput.onchange = async (e) => {
        const fileTarget = e.target;
        if (!fileTarget.files || fileTarget.files.length === 0) return;
        statusText.innerText = "Загрузка...";
        try {
            // Исправлено: Сверхнадежный способ извлечения первого файла через встроенную функцию
            const chosenFile = fileTarget.files.item(0); 
            const arrayBuffer = await chosenFile.arrayBuffer();
            audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            statusText.innerText = chosenFile.name;
        } catch (err) {
            statusText.innerText = "Ошибка MP3";
        }
    };
}

const allInputs = [corners.tl, corners.tr, corners.bl, corners.br, uiColors.bg, uiColors.panel];
allInputs.forEach(i => { if(i) i.oninput = updateColors; });

if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(midi => {
        for (let input of midi.inputs.values()) {
            input.onmidimessage = (msg) => {
                const midiData = Array.from(msg.data);
                const cmd = midiData.shift();
                const note = midiData.shift();
                const vel = midiData.shift();
                
                if (cmd === 144 && vel > 0) {
                    const btn = midiButtonMap[note];
                    const semitones = note - 60;
                    playNote(semitones, btn);
                }
            };
        }
    });
}

createGrid();
