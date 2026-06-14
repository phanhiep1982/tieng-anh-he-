let ALL_DATA = null;
let currentUnitId = "";
let currentVocabList = [];
let currentGamePhase = 1; // 1: Trắc nghiệm Vocab, 2: Nói Vocab, 3: Nói Ngữ Pháp, 4: Hội Thoại
let currentIndex = 0;
let totalTasks = 0;
let completedTasks = 0;

let recognition = null;
let micTimeoutTimer;
let isFallbackActive = false;
let isListening = false;
let attemptCounter = 0;
const MAX_ATTEMPTS = 3;

// 1. TỰ ĐỘNG NẠP DỮ LIỆU TỪ FILE JSON NGOÀI KHI KHỞI ĐỘNG
window.addEventListener('DOMContentLoaded', () => {
    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            ALL_DATA = data;
            renderUnitSelector();
        })
        .catch(err => console.error("Không thể tải file data.json: ", err));
});

// Kết xuất lưới danh sách bài học 9 Unit cho bé bấm chọn
function renderUnitSelector() {
    const grid = document.getElementById('unit-grid');
    grid.innerHTML = "";
    for (let i = 1; i <= 9; i++) {
        let uKey = `unit${i}`;
        if (ALL_DATA && ALL_DATA[uKey]) {
            let btn = document.createElement('div');
            btn.className = "unit-card";
            btn.innerHTML = `<span style="color:#ff6b6b;">Unit ${i}</span><br><span style="font-size:14px;color:#7f8c8d;">${ALL_DATA[uKey].title}</span>`;
            btn.onclick = () => selectUnit(uKey);
            grid.appendChild(btn);
        }
    }
}

function selectUnit(unitId) {
    currentUnitId = unitId;
    let unitData = ALL_DATA[currentUnitId];
    
    // Trộn ngẫu nhiên danh sách từ vựng để tăng phản xạ
    currentVocabList = [...unitData.vocabulary].sort(() => Math.random() - 0.5);
    
    currentGamePhase = 1;
    currentIndex = 0;
    completedTasks = 0;
    totalTasks = currentVocabList.length * 2 + unitData.grammar.length + unitData.dialogs.length;
    
    initSpeechAPI();
    document.getElementById('control-area').style.display = 'flex';
    updateProgressBar();
    loadTask();
}

function changeScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function updateProgressBar() {
    let percentage = (completedTasks / totalTasks) * 100;
    document.getElementById('progress-bar').style.width = percentage + '%';
}

// 2. ĐIỀU PHỐI VÀ LIÊN KẾT MODULE DỮ LIỆU CHẠY THEO VÒNG
function loadTask() {
    isFallbackActive = false;
    attemptCounter = 0;
    document.getElementById('global-skip-btn').classList.remove('highlighted');
    document.getElementById('speech-live-text').innerText = "";
    setMicListeningState(false);
    isListening = false;
    
    let unitData = ALL_DATA[currentUnitId];

    if (currentGamePhase === 1) {
        if (currentIndex >= currentVocabList.length) {
            currentGamePhase = 2; currentIndex = 0;
        } else {
            renderQuizLayout(currentVocabList[currentIndex], 'word');
            return;
        }
    }

    if (currentGamePhase === 2) {
        if (currentIndex >= currentVocabList.length) {
            currentGamePhase = 3; currentIndex = 0;
        } else {
            renderSpeakLayout(currentVocabList[currentIndex], 'word');
            return;
        }
    }

    if (currentGamePhase === 3) {
        if (currentIndex >= unitData.grammar.length) {
            currentGamePhase = 4; currentIndex = 0;
        } else {
            renderSpeakLayout(unitData.grammar[currentIndex], 'grammar');
            return;
        }
    }

    if (currentGamePhase === 4) {
        if (currentIndex >= unitData.dialogs.length) {
            changeScreen('screen-result');
            document.getElementById('result-message').innerText = `Con đã xuất sắc vượt qua ${unitData.title}! 🎉`;
            playLocalAudio("assets/audio/khen_hoanthanh.mp3");
            document.getElementById('control-area').style.display = 'none';
            return;
        } else {
            renderDialogLayout(unitData.dialogs[currentIndex]);
            return;
        }
    }
}

function renderQuizLayout(item, type) {
    changeScreen('screen-quiz');
    // Giao diện Vòng 1: Gán hình ảnh từ folder assets chuẩn xác
    document.getElementById('quiz-img').src = item.image || `assets/images/${item.word || item.id}.png`;
    document.getElementById('game-hint').innerText = "Nghĩa tiếng Việt: " + item.meaning;

    let targetText = type === 'word' ? item.word : item.sentence;
    let options = [targetText, ...item.distractors];
    options.sort(() => Math.random() - 0.5);

    let container = document.getElementById('quiz-options-container');
    container.innerHTML = "";
    options.forEach(opt => {
        let btn = document.createElement('button');
        btn.className = "option-btn";
        btn.innerText = opt;
        btn.onclick = () => checkQuizAnswer(btn, opt, targetText);
        container.appendChild(btn);
    });
    speakCurrentTarget();
}

function renderSpeakLayout(item, type) {
    changeScreen('screen-speak');
    document.getElementById('speak-vocab-area').style.display = 'block';
    document.getElementById('speak-dialog-area').style.display = 'none';
    
    if (type === 'word') {
        document.getElementById('speak-title').innerText = "Vòng 2: Bé Tập Phát Âm 🗣️";
        document.getElementById('speak-img').src = item.image || `assets/images/${item.word}.png`;
        document.getElementById('speak-word').innerText = item.word;
        document.getElementById('game-hint').innerText = "Nghĩa: " + item.meaning;
    } else {
        document.getElementById('speak-title').innerText = "Vòng 2.5: Luyện Câu Ngữ Pháp 🧩";
        document.getElementById('speak-img').src = item.image || `assets/images/${item.id}.png`;
        document.getElementById('speak-word').innerText = item.sentence;
        document.getElementById('game-hint').innerText = item.hint_vn;
    }
    speakCurrentTarget();
}

function renderDialogLayout(item) {
    changeScreen('screen-speak');
    document.getElementById('speak-title').innerText = "Vòng 3: Đóng Vai Đối Thoại 🎭";
    document.getElementById('speak-vocab-area').style.display = 'none';
    document.getElementById('speak-dialog-area').style.display = 'flex';

    document.getElementById('dialog-context-img').src = item.image || `assets/images/${item.id}.png`;
    document.getElementById('bubble-machine').innerText = "💬 Beth: " + item.speaker_machine;
    document.getElementById('bubble-user').innerText = "👉 Con hãy đọc: " + item.suggested_user;
    document.getElementById('game-hint').innerText = "Dịch nghĩa: " + item.hint_vn;

    playLocalAudio(item.audio_file);
}

function checkQuizAnswer(btn, selected, correct) {
    if (selected === correct) {
        btn.classList.add('correct');
        playLocalAudio("assets/audio/khen_dung.mp3");
        setTimeout(() => {
            completedTasks++; currentIndex++; updateProgressBar(); loadTask();
        }, 1200);
    } else {
        btn.classList.add('wrong');
        playLocalAudio("assets/audio/khen_sai.mp3");
        setTimeout(() => btn.className = "option-btn", 1200);
    }
}

function playLocalAudio(filePath) {
    let audio = new Audio(filePath);
    audio.play().catch(() => {
        // Dự phòng Fallback đọc thô bằng gTTS nếu thiếu tệp local để chống treo máy
        let utterance = new SpeechSynthesisUtterance();
        if(filePath.includes('khen_dung')) { utterance.text = "Đúng quá! Con giỏi quá!"; utterance.lang = 'vi-VN'; }
        else if(filePath.includes('khen_sai')) { utterance.text = "Chưa đúng rồi, thử lại nhé!"; utterance.lang = 'vi-VN'; }
        else { speakCurrentTarget(); return; }
        window.speechSynthesis.speak(utterance);
    });
}

// 3. THUẬT TOÁN ĐO ĐỘ TƯƠNG ĐỒNG LAI (HYBRID SPEECH MATCHING) TỐI ƯU CỦA ANH
function getSimilarityScore(s1, s2) {
    const clean = (str) => str.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").trim();
    const strA = clean(s1); const strB = clean(s2);
    if (strA === strB) return 1.0;
    
    const wordsA = strA.split(" "); const wordsB = strB.split(" ");
    
    // Nếu là Từ Đơn -> Tính Character-level Levenshtein Distance để bắt biên độ âm cận
    if (wordsA.length === 1 || wordsB.length === 1) {
        let track = Array(strB.length + 1).fill(null).map(() => Array(strA.length + 1).fill(null));
        for (let i = 0; i <= strA.length; i++) track[0][i] = i;
        for (let j = 0; j <= strB.length; j++) track[j][0] = j;
        for (let j = 1; j <= strB.length; j++) {
            for (let i = 1; i <= strA.length; i++) {
                let ind = strA[i - 1] === strB[j - 1] ? 0 : 1;
                track[j][i] = Math.min(track[j][i - 1] + 1, track[j - 1][i] + 1, track[j - 1][i - 1] + ind);
            }
        }
        return (Math.max(strA.length, strB.length) - track[strB.length][strA.length]) / Math.max(strA.length, strB.length);
    } 
    // Nếu là Câu Dài -> Tính Word-level Jaccard
    else {
        const intersection = wordsA.filter(w => wordsB.includes(w));
        return (2.0 * intersection.length) / (wordsA.length + wordsB.length);
    }
}

function initSpeechAPI() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
        clearTimeout(micTimeoutTimer);
        isListening = false; setMicListeningState(false);
        const result = event.results[0][0].transcript;
        document.getElementById('speech-live-text').innerText = "Máy nghe được: \"" + result + "\"";
        evaluateSpeech(result);
    };

    recognition.onerror = () => {
        clearTimeout(micTimeoutTimer); isListening = false; setMicListeningState(false);
        activateFallbackQuiz();
    };
    recognition.onend = () => { isListening = false; setMicListeningState(false); };
}

function toggleListening() {
    if (isFallbackActive || !recognition) return;
    if (isListening) {
        isListening = false; recognition.stop(); clearTimeout(micTimeoutTimer); setMicListeningState(false);
    } else {
        isListening = true;
        try {
            recognition.start(); setMicListeningState(true);
            document.getElementById('speech-live-text').innerText = "🎙️ Đang lắng nghe... Con nói đi nào!";
            micTimeoutTimer = setTimeout(() => {
                if (isListening) { isListening = false; recognition.stop(); activateFallbackQuiz(); }
            }, 8000);
        } catch(e) { activateFallbackQuiz(); }
    }
}

function setMicListeningState(state) {
    const btn = document.getElementById('mic-button');
    if (btn) { if (state) btn.classList.add('listening'); else btn.classList.remove('listening'); }
}

function evaluateSpeech(spokenText) {
    let unitData = ALL_DATA[currentUnitId];
    let targetText = "";
    let threshold = 0.55;

    if (currentGamePhase === 2) targetText = currentVocabList[currentIndex].word;
    else if (currentGamePhase === 3) targetText = unitData.grammar[currentIndex].sentence;
    else if (currentGamePhase === 4) {
        let isMatch = unitData.dialogs[currentIndex].accept_keywords.some(key => getSimilarityScore(spokenText, key) >= threshold);
        if (isMatch) processSpeechSuccess(); else processSpeechFail();
        return;
    }

    if (getSimilarityScore(spokenText, targetText) >= threshold) processSpeechSuccess(); else processSpeechFail();
}

function processSpeechSuccess() {
    playLocalAudio("assets/audio/khen_dung.mp3");
    setTimeout(() => { completedTasks++; currentIndex++; updateProgressBar(); loadTask(); }, 1500);
}

function processSpeechFail() {
    attemptCounter++;
    if (attemptCounter >= MAX_ATTEMPTS) {
        document.getElementById('global-skip-btn').classList.add('highlighted');
        activateFallbackQuiz();
    } else {
        playLocalAudio("assets/audio/khen_sai.mp3");
        document.getElementById('speech-live-text').innerText += ` (Lần ${attemptCounter}/${MAX_ATTEMPTS})`;
    }
}

function activateFallbackQuiz() {
    if (isFallbackActive) return;
    isFallbackActive = true;
    playLocalAudio("assets/audio/khen_sai.mp3");
    
    setTimeout(() => {
        let unitData = ALL_DATA[currentUnitId];
        if (currentGamePhase === 2) renderQuizLayout(currentVocabList[currentIndex], 'word');
        else if (currentGamePhase === 3) renderQuizLayout(unitData.grammar[currentIndex], 'sentence');
        else if (currentGamePhase === 4) { completedTasks++; currentIndex++; updateProgressBar(); loadTask(); }
    }, 1000);
}

function speakCurrentTarget() {
    let unitData = ALL_DATA[currentUnitId];
    let text = "";
    if (currentGamePhase === 1 || currentGamePhase === 2) text = currentVocabList[currentIndex].word;
    else if (currentGamePhase === 3) text = unitData.grammar[currentIndex].sentence;
    else if (currentGamePhase === 4) text = unitData.dialogs[currentIndex].speaker_machine;

    let utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
}

function skipTask() {
    completedTasks++; currentIndex++; updateProgressBar(); loadTask();
}

function resetGame() {
    changeScreen('screen-welcome');
    document.getElementById('control-area').style.display = 'none';
}

