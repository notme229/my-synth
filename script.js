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

// P2P Переменные
let peer = null;
let connection = null; // Объект связи с другом
let myNickname = "User_" + Math.floor(Math.random() * 900 + 100);
nickInput.value = myNickname;

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
                sendNoteToFriend(semitones); // Отправляем ноту другу
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
        // Если ноту нажал друг, подсветим её более ярко
        const playClass = isRemote ? 'remote-playing' : 'playing';
        btn.classList.add(playClass);
        setTimeout(() => btn.classList.remove(playClass), 120);
    }
}

// Обновление списка игроков на экране
function updatePlayersUI(friendNick = null) {
    playersList.innerHTML = "<li>" + myNickname + " (Вы)</li>";
    if (friendNick) {
        playersList.innerHTML += "<li>" + friendNick + "</li>";
    }
}

// Изменение ника на лету
nickInput.onchange = () => {
    myNickname = nickInput.value.trim() || "User";
    updatePlayersUI(connection ? connection.peerNickname : null);
    if (connection && connection.open) {
        connection.send({ type: "nick-update", nickname: myNickname });
    }
};

// ИНИЦИАЛИЗАЦИЯ P2P СЕТИ
function initPeer(customRoomId = null) {
    // Если peer уже создан, ничего не делаем
    if (peer) return;

    statusText.innerText = "Подключение к сети P2P...";
    
    // Создаем P2P узел (PeerJS использует бесплатные мировые сервера-коммутаторы для стыковки)
    peer = customRoomId ? new Peer(customRoomId) : new Peer();

    peer.on('open', (id) => {
        statusText.innerText = "Комната готова! Код: " + id;
        roomInput.value = id;
    });

    // Слушаем, если кто-то подключается к НАМ (Мы — Хост)
    peer.on('connection', (conn) => {
        connection = conn;
        setupConnectionListeners();
    });

    peer.on('error', (err) => {
        alert("Ошибка сети. Возможно, этот код комнаты уже занят.");
        console.error(err);
    });
}

// Настройка прослушивания сообщений от друга
function setupConnectionListeners() {
    statusText.innerText = "Связь установлена!";
    
    connection.on('open', () => {
        // Сразу обмениваемся никами
        connection.send({ type: "nick-update", nickname: myNickname });
    });

    connection.on('data', (data) => {
        if (data.type === "nick-update") {
            connection.peerNickname = data.nickname;
            updatePlayersUI(data.nickname);
        }
        if (data.type === "note") {
            // Играем ноту, которую прислал друг
            const currentOctave = Math.floor(data.semitones / 12) + 4;
            const noteIdx = (data.semitones % 12 + 12) % 12;
            const targetMidi = 60 + data.semitones;
            const targetBtn = midiButtonMap[targetMidi];
            playNote(data.semitones, targetBtn, true);
        }
    });

    connection.on('close', () => {
        statusText.innerText = "Друг отключился";
        updatePlayersUI();
        connection = null;
    });
}

// Кнопка: Создать комнату
btnCreateRoom.onclick = () => {
    // Генерируем красивый короткий случайный ID для комнаты
    const randomRoomId = "rm_" + Math.floor(Math.random() * 8999 + 1000);
    initPeer(randomRoomId);
};

// Кнопка: Подключиться к другу
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

function connectToFriend(targetRoom) {
    statusText.innerText = "Подключение к " + targetRoom + "...";
    connection = peer.connect(targetRoom);
    setupConnectionListeners();
}

// Функция отправки ноты другу через P2P канал
function sendNoteToFriend(semitones) {
    if (connection && connection.open) {
        connection.send({ type: "note", semitones: semitones });
    }
}

// Загрузка звука
fileInput.onchange = async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    statusText.innerText = "Загрузка звука...";
    try {
        const file = e.target.files;
        const arrayBuffer = await file.arrayBuffer();
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        statusText.innerText = file.name;
        document.querySelectorAll('.music-btn').forEach(btn => btn.style.opacity = "1");
    } catch (err) {
        statusText.innerText = "Ошибка MP3";
    }
};

// Цвета
const allInputs = [corners.tl, corners.tr, corners.bl, corners.br, uiColors.bg, uiColors.panel];
allInputs.forEach(i => { if(i) i.oninput = updateColors; });

// Поддержка MIDI клавиатуры
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
                    sendNoteToFriend(semitones); // Отправляем MIDI ноту другу
                }
            };
        }
    });
}

createGrid();
