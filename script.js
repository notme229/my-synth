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

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let audioBuffer = null;
const midiButtonMap = {};

// Генерируем ID пользователя и никнейм
const myUserId = "usr_" + Math.floor(Math.random() * 89999 + 10000);
let myNickname = "User_" + Math.floor(Math.random() * 900 + 100);
if (nickInput) nickInput.value = myNickname;

// Конфигурация бесплатной базы данных Firebase
const firebaseConfig = {
    databaseURL: "https://firebasedatabase.app"
};

// Инициализируем сеть
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentRoomId = null;
let roomRef = null;
let myPlayerRef = null;

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
            
            btn.onclick = () => {
                playNote(semitones, btn);
                sendNoteToFirebase(semitones);
            };
            grid.appendChild(btn);
        }
    }
    updateColors();
    updatePlayersListUI({});
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

function updatePlayersListUI(playersObj) {
    if (!playersList) return;
    playersList.innerHTML = "";
    
    let hasPlayers = false;
    for (let id in playersObj) {
        hasPlayers = true;
        const p = playersObj[id];
        const isMe = id === myUserId;
        playersList.innerHTML += "<li>" + p.nickname + (isMe ? " (Вы)" : "") + "</li>";
    }
    
    if (!hasPlayers) {
        playersList.innerHTML = "<li>" + myNickname + " (Вы)</li>";
    }
}

// ПОДКЛЮЧЕНИЕ К КОМНАТЕ СЕТИ
function connectToRoom(roomId) {
    currentRoomId = roomId;
    if (roomInput) roomInput.value = roomId;
    statusText.innerText = "В комнате: " + roomId;

    // Ссылка на базу данных нашей комнаты
    roomRef = db.ref("rooms/" + roomId);
    myPlayerRef = roomRef.child("players/" + myUserId);

    // Записываем себя в онлайн-список комнаты
    myPlayerRef.set({ nickname: myNickname });
    // Автоудаление из базы при закрытии вкладки
    myPlayerRef.onDisconnect().remove();

    // Слушаем список игроков онлайн
    roomRef.child("players").on("value", (snapshot) => {
        const players = snapshot.val() || {};
        updatePlayersListUI(players);
    });

    // Слушаем появление новых нот от других игроков
    roomRef.child("last_note").on("value", (snapshot) => {
        const data = snapshot.val();
        if (data && data.sender !== myUserId) {
            const targetMidi = 60 + data.semitones;
            const targetBtn = midiButtonMap[targetMidi];
            playNote(data.semitones, targetBtn, true);
        }
    });
}

if (nickInput) {
    nickInput.onchange = () => {
        myNickname = nickInput.value.trim() || "User";
        if (myPlayerRef) {
            myPlayerRef.update({ nickname: myNickname });
        } else {
            updatePlayersListUI({});
        }
    };
}

if (btnCreateRoom) {
    btnCreateRoom.onclick = () => {
        const generatedId = "rm_" + Math.floor(Math.random() * 8999 + 1000);
        connectToRoom(generatedId);
    };
}

if (btnJoinRoom) {
    btnJoinRoom.onclick = () => {
        const targetRoom = roomInput.value.trim();
        if (!targetRoom) return alert("Введите код комнаты!");
        connectToRoom(targetRoom);
    };
}

function sendNoteToFirebase(semitones) {
    if (roomRef) {
        // Записываем ноту в облако. Firebase тут же обновит её у всех игроков
        roomRef.child("last_note").set({
            sender: myUserId,
            semitones: semitones,
            timestamp: Date.now()
        });
    }
}

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

if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(midi => {
        for (let input of midi.inputs.values()) {
            input.onmidimessage = (msg) => {
                const cmd = msg.data;
                const note = msg.data;
                const vel = msg.data;
                if (cmd === 144 && vel > 0) {
                    const btn = midiButtonMap[note];
                    const semitones = note - 60;
                    playNote(semitones, btn);
                    sendNoteToFirebase(semitones);
                }
            };
        }
    });
}

createGrid();
