const grid = document.getElementById('synth-grid');
const fileInput = document.getElementById('audio-file');
const statusText = document.getElementById('status-text');
const panel = document.getElementById('main-panel');
const nickInput = document.getElementById('nickname-input');
const playersList = document.getElementById('players-list');

const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const roomInput = document.getElementById('room-input');

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

let peer = null;
let connection = null;
let myNickname = "User_" + Math.floor(Math.random() * 900 + 100);
if (nickInput) nickInput.value = myNickname;

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
                sendNoteToFriend(semitones);
            };
            grid.appendChild(btn);
        }
    }
    updateColors();
    updatePlayersUI();
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

function updatePlayersUI(friendNick = null) {
    if (!playersList) return;
    playersList.innerHTML = "<li>" + myNickname + " (Вы)</li>";
    if (friendNick) {
        playersList.innerHTML += "<li>" + friendNick + "</li>";
    }
}

if (nickInput) {
    nickInput.onchange = () => {
        myNickname = nickInput.value.trim() || "User";
        updatePlayersUI(connection ? connection.peerNickname : null);
        if (connection && connection.open) {
            connection.send({ type: "nick-update", nickname: myNickname });
        }
    };
}

// ИНИЦИАЛИЗАЦИЯ НАДЕЖНОЙ СЕТИ P2P
function initPeer() {
    if (peer) return;
    if (statusText) statusText.innerText = "Вход в сеть...";

    // Подключаемся через гарантированно рабочий резервный хост содружества PeerJS
    peer = new Peer({
        host: "://herokuapp.com",
        secure: true,
        port: 443
    });

    // Если резервный сервер перегружен, мгновенно переключаемся на стандартный автоматический
    peer.on('error', (err) => {
        if (!connection) {
            console.log("Переключение на резервный сервер коммутации...");
            peer = new Peer(); 
        }
    });

    peer.on('open', (id) => {
        if (statusText) statusText.innerText = "Код: " + id;
        if (roomInput) roomInput.value = id;
    });

    peer.on('connection', (conn) => {
        connection = conn;
        setupConnectionListeners();
    });
}

function setupConnectionListeners() {
    if (statusText) statusText.innerText = "Связь установлена!";
    
    connection.on('open', () => {
        connection.send({ type: "nick-update", nickname: myNickname });
    });

    connection.on('data', (data) => {
        if (data.type === "nick-update") {
            connection.peerNickname = data.nickname;
            updatePlayersUI(data.nickname);
        }
        if (data.type === "note") {
            const targetMidi = 60 + data.semitones;
            const targetBtn = midiButtonMap[targetMidi];
            playNote(data.semitones, targetBtn, true);
        }
    });

    connection.on('close', () => {
        if (statusText) statusText.innerText = "Друг отключился";
        updatePlayersUI();
        connection = null;
    });
}

if (btnCreateRoom) {
    btnCreateRoom.onclick = () => {
        initPeer(); 
    };
}

if (btnJoinRoom) {
    btnJoinRoom.onclick = () => {
        const targetRoom = roomInput.value.trim();
        if (!targetRoom) return alert("Введите код комнаты друга!");
        
        if (!peer) {
            peer = new Peer();
            peer.on('open', () => { connectToFriend(targetRoom); });
        } else {
            connectToFriend(targetRoom);
        }
    };
}

function connectToFriend(targetRoom) {
    if (statusText) statusText.innerText = "Подключение...";
    connection = peer.connect(targetRoom);
    setupConnectionListeners();
}

function sendNoteToFriend(semitones) {
    if (connection && connection.open) {
        connection.send({ type: "note", semitones: semitones });
    }
}

if (fileInput) {
    fileInput.onchange = async (e) => {
        const fileTarget = e.target;
        if (!fileTarget.files || fileTarget.files.length === 0) return;
        if (statusText) statusText.innerText = "Загрузка...";
        try {
            const chosenFile = fileTarget.files.item(0); 
            const arrayBuffer = await chosenFile.arrayBuffer();
            audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            if (statusText) statusText.innerText = chosenFile.name;
        } catch (err) {
            if (statusText) statusText.innerText = "Ошибка MP3";
        }
    };
}

const allInputs = [corners.tl, corners.tr, corners.bl, corners.br, uiColors.bg, uiColors.panel];
allInputs.forEach(i => { if(i) i.oninput = updateColors; });

createGrid();
