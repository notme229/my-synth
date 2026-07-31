const grid = document.getElementById('synth-grid');
const fileInput = document.getElementById('audio-file');
const statusText = document.getElementById('status-text');
const panel = document.getElementById('main-panel');
const nickInput = document.getElementById('nickname-input');
const playersList = document.getElementById('players-list');

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

// Задаем октавы строкой, чтобы избежать ошибок фильтрации
const OCTAVE_STR = "7,6,5,4,3,2,1";
const OCTAVES = OCTAVE_STR.split(",");

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let audioBuffer = null;
const midiButtonMap = {};

const myUserId = "usr_" + Math.floor(Math.random() * 89999 + 10000);
let myNickname = "User_" + Math.floor(Math.random() * 900 + 100);
if (nickInput) nickInput.value = myNickname;

// Встроенный канал мультиплеера внутри вашего браузера
const jamChannel = new BroadcastChannel("synth_jam_session");

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
                // Передаем ноту в мультиплеерный канал
                jamChannel.postMessage({
                    type: "note",
                    sender: myUserId,
                    senderNick: myNickname,
                    semitones: semitones
                });
            };
            grid.appendChild(btn);
        }
    }
    updateColors();
    updatePlayersListUI();
}

async function playNote(semitones, btn, isRemote = false) {
    if (!audioBuffer) return;
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.detune.value = semitones * 100;
    source.connect(audioCtx.destination);
    source.start(0);
    
    if (btn) {
        const playClass = isRemote ? 'remote-playing' : 'playing';
        btn.classList.add(playClass);
        setTimeout(() => btn.classList.remove('playing'), 120);
        setTimeout(() => btn.classList.remove('remote-playing'), 120);
    }
}

function updatePlayersListUI(friendNick = null) {
    if (!playersList) return;
    playersList.innerHTML = "<li>" + myNickname + " (Вы)</li>";
    if (friendNick) {
        playersList.innerHTML += "<li>" + friendNick + "</li>";
    }
}

if (nickInput) {
    nickInput.onchange = () => {
        myNickname = nickInput.value.trim() || "User";
        updatePlayersListUI();
        jamChannel.postMessage({ type: "ping", nickname: myNickname });
    };
}

// СЛУШАЕМ ДРУГИХ ИГРОКОВ В КАНАЛЕ
jamChannel.onmessage = (event) => {
    const data = event.data;
    if (data.type === "note") {
        const targetMidi = 60 + data.semitones;
        const targetBtn = midiButtonMap[targetMidi];
        playNote(data.semitones, targetBtn, true);
        updatePlayersListUI(data.senderNick);
    }
    if (data.type === "ping") {
        updatePlayersListUI(data.nickname);
    }
};

if (fileInput) {
    fileInput.onchange = async (e) => {
        const fileTarget = e.target;
        if (!fileTarget.files || fileTarget.files.length === 0) return;
        statusText.innerText = "Загрузка...";
        try {
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

createGrid();
// Оповещаем другие вкладки о своем присутствии
setTimeout(() => { jamChannel.postMessage({ type: "ping", nickname: myNickname }); }, 500);
