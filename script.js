// --- НАСТРОЙКИ И СОСТОЯНИЕ ИГРЫ ---
let score = 0;
let currentLevelIndex = 0;
let tapPower = 1;

const musicPlaylist = [ "audio/background_music.mp3", "audio/background_music2.mp3" ];
let currentTrackIndex = 0;

// --- НАХОДИМ ВСЕ ЭЛЕМЕНТЫ НА СТРАНИЦЕ ---
const mainMenu = document.getElementById('main-menu');
const settingsScreen = document.getElementById('settings-screen');
const gameContainer = document.getElementById('game-container');
const shopScreen = document.getElementById('shop-screen');

const startGameBtn = document.getElementById('start-game-btn');
const settingsBtn = document.getElementById('settings-btn');
const shopBtn = document.getElementById('shop-btn');
const backToMenuFromSettingsBtn = document.getElementById('back-from-settings-btn');
const backToMenuFromShopBtn = document.getElementById('back-from-shop-btn');
const ingameMenuBtn = document.getElementById('ingame-menu-btn');
const ingameShopBtn = document.getElementById('ingame-shop-btn');

const musicVolumeSlider = document.getElementById('music-volume');
const sfxVolumeSlider = document.getElementById('sfx-volume');

const scoreDisplay = document.getElementById('score-display');
const tapObject = document.getElementById('tap-object');
const characterImage = document.getElementById('character-image');
const upgradeButton = document.getElementById('upgrade-button');
const passiveIncomeDisplay = document.getElementById('passive-income-display');

const bgMusic = document.getElementById('bg-music');
const tapSound = document.getElementById('tap-sound');

// --- ИНИЦИАЛИЗАЦИЯ ГРОМКОСТИ ---
bgMusic.volume = musicVolumeSlider.value;
tapSound.volume = sfxVolumeSlider.value;

// --- ДАННЫЕ УРОВНЕЙ И МАГАЗИНА ---
const levels = [
    { name: "Мусорные баки", cost: 100, backgroundImage: "background/back1.png", characterImage: "character/char1.png", passiveIncome: 0, tapObjectImage: "tap/tap1.png" },
    { name: "Палатка с костром", cost: 1000, backgroundImage: "background/back2.png", characterImage: "character/char2.png", passiveIncome: 5, tapObjectImage: "tap/tap2.png" },
    { name: "Ржавый фургон", cost: 5000, backgroundImage: "background/back3.png", characterImage: "character/char3.png", passiveIncome: 25, tapObjectImage: "tap/tap3.png" },
    { name: "Нормальный фургон", cost: 25000, backgroundImage: "background/back4.png", characterImage: "character/char4.png", passiveIncome: 150, tapObjectImage: "tap/tap4.png" },
    { name: "Элитный фургон", cost: Infinity, backgroundImage: "background/back5.png", characterImage: "character/char5.png", passiveIncome: 1000, tapObjectImage: "tap/tap5.png" }
];
const shopUpgrades = [
    { id: 'tap_power', name: 'Сила клика', description: 'Увеличивает количество монет за каждый клик.', level: 0, baseCost: 25, bonusPerLevel: 1, },
    { id: 'passive_multiplier', name: 'Пассивный доход', description: 'Увеличивает весь пассивный доход на 10% за уровень.', level: 0, baseCost: 200, bonusPerLevel: 0.1, }
];

// --- УПРАВЛЕНИЕ ЭКРАНАМИ ---
function showScreen(screen) {
    mainMenu.classList.remove('active');
    settingsScreen.classList.remove('active');
    gameContainer.classList.remove('active');
    shopScreen.classList.remove('active');
    screen.classList.add('active');
}

// --- УПРАВЛЕНИЕ АУДИО ---
function playNextTrack() {
    currentTrackIndex = (currentTrackIndex + 1) % musicPlaylist.length;
    bgMusic.src = musicPlaylist[currentTrackIndex];
    bgMusic.play();
}

// --- УПРАВЛЕНИЕ МАГАЗИНОМ ---
function renderShop() {
    const container = document.getElementById('shop-items-container');
    container.innerHTML = '';
    shopUpgrades.forEach(upgrade => {
        const cost = Math.floor(upgrade.baseCost * Math.pow(1.2, upgrade.level));
        let currentBonusText = '';
        if (upgrade.id === 'tap_power') {
            currentBonusText = `Текущая сила: ${tapPower}`;
        } else if (upgrade.id === 'passive_multiplier') {
            const currentMultiplier = (shopUpgrades.find(u => u.id === 'passive_multiplier').level * 10);
            currentBonusText = `Текущий бонус: +${currentMultiplier}%`;
        }
        const item = document.createElement('div');
        item.className = 'shop-item';
        item.innerHTML = `<h3>${upgrade.name} (Ур. ${upgrade.level})</h3><p>${upgrade.description}</p><p style="color: #a7d4ff;">${currentBonusText}</p><div class="shop-item-footer"><span class="shop-item-cost">Цена: ${cost} монет</span><button class="buy-button" onclick="buyUpgrade('${upgrade.id}')">Купить</button></div>`;
        container.appendChild(item);
    });
}
function buyUpgrade(upgradeId) {
    const upgrade = shopUpgrades.find(u => u.id === upgradeId);
    if (!upgrade) return;
    const cost = Math.floor(upgrade.baseCost * Math.pow(1.2, upgrade.level));
    if (score >= cost) {
        score -= cost;
        upgrade.level++;
        if (upgrade.id === 'tap_power') {
            tapPower += upgrade.bonusPerLevel;
        }
        updateScoreDisplay();
        renderShop();
    } else {
        alert('Недостаточно монет!');
    }
}

// --- ОСНОВНЫЕ ИГРОВЫЕ ФУНКЦИИ ---
function updateScoreDisplay() { scoreDisplay.innerText = Math.floor(score); }
function updateUI() {
    const currentLevel = levels[currentLevelIndex];
    gameContainer.style.backgroundImage = `url('${currentLevel.backgroundImage}')`;
    characterImage.src = currentLevel.characterImage;
    tapObject.src = currentLevel.tapObjectImage;
    const passiveMultiplier = 1 + (shopUpgrades.find(u => u.id === 'passive_multiplier').level * 0.1);
    passiveIncomeDisplay.innerText = Math.round(currentLevel.passiveIncome * passiveMultiplier);
    if (currentLevelIndex < levels.length - 1) {
        const nextLevelCost = levels[currentLevelIndex].cost;
        upgradeButton.innerText = `Улучшить жилье (${nextLevelCost} монет)`;
        upgradeButton.disabled = false;
    } else {
        upgradeButton.innerText = "Макс. уровень";
        upgradeButton.disabled = true;
    }
    if (currentLevelIndex > 0) {
        tapObject.classList.add('enlarged-tap-object');
    } else {
        tapObject.classList.remove('enlarged-tap-object');
    }
}
function handleTap() {
    score += tapPower;
    updateScoreDisplay();
    tapSound.currentTime = 0;
    tapSound.play();
    if (bgMusic.paused && bgMusic.volume > 0) {
        bgMusic.play();
    }
}
function attemptUpgrade() {
    if (currentLevelIndex >= levels.length - 1) return;
    const upgradeCost = levels[currentLevelIndex].cost;
    if (score >= upgradeCost) {
        score -= upgradeCost;
        currentLevelIndex++;
        updateScoreDisplay();
        updateUI();
    } else {
        alert("Недостаточно монет!");
    }
}

// --- ГЛАВНЫЙ ИГРОВОЙ ЦИКЛ ---
setInterval(function() {
    const currentPassiveIncome = levels[currentLevelIndex].passiveIncome;
    const passiveMultiplier = 1 + (shopUpgrades.find(u => u.id === 'passive_multiplier').level * 0.1);
    if (currentPassiveIncome > 0) {
        score += (currentPassiveIncome * passiveMultiplier) / 10;
        updateScoreDisplay();
    }
}, 100);

// --- НАЗНАЧЕНИЕ СОБЫТИЙ ---
startGameBtn.addEventListener('click', () => {
    updateUI(); 
    showScreen(gameContainer); 
    if(bgMusic.paused && bgMusic.volume > 0) bgMusic.play(); 
});
settingsBtn.addEventListener('click', () => showScreen(settingsScreen));
shopBtn.addEventListener('click', () => { renderShop(); showScreen(shopScreen); });
backToMenuFromSettingsBtn.addEventListener('click', () => showScreen(mainMenu));
backToMenuFromShopBtn.addEventListener('click', () => showScreen(mainMenu));
ingameMenuBtn.addEventListener('click', () => { showScreen(mainMenu); bgMusic.pause(); });
ingameShopBtn.addEventListener('click', () => { renderShop(); showScreen(shopScreen); });
musicVolumeSlider.addEventListener('input', (e) => { bgMusic.volume = e.target.value; if (bgMusic.paused && bgMusic.volume > 0) { bgMusic.play(); } });
sfxVolumeSlider.addEventListener('input', (e) => { tapSound.volume = e.target.value; });
bgMusic.addEventListener('ended', playNextTrack);
tapObject.addEventListener('click', handleTap);
upgradeButton.addEventListener('click', attemptUpgrade);

// --- НАЧАЛЬНЫЙ ЗАПУСК ---
showScreen(mainMenu);