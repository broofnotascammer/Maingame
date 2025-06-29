// --- Configuration & Constants ---
// *** IMPORTANT: Replace 'YOUR_DODGE_CARS_BACKEND_RENDER_URL_HERE' with your actual Render backend URL! ***
const SERVER_URL = 'https://cardodge.onrender.com'; // <<< Make sure this is YOUR backend URL
const API_URL = `${SERVER_URL}/api/highscores`;

// Get DOM elements
const gameContainer = document.querySelector('.game-container'); // Get reference to the main container
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('scoreValue');
const highScoresList = document.getElementById('highScoresList');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreDisplay = document.getElementById('finalScore');
const playerNameInput = document.getElementById('playerNameInput');
const submitScoreBtn = document.getElementById('submitScoreBtn');
const restartGameBtn = document.getElementById('restartGameBtn');
const leftButton = document.getElementById('leftButton');
const rightButton = document.getElementById('rightButton');
const levelDisplay = document.getElementById('levelValue');


// Game object dimensions
const PLAYER_WIDTH = 50;
const PLAYER_HEIGHT = 80;
const CAR_WIDTH = 60;
const CAR_HEIGHT = 100;
const LANE_WIDTH = canvas.width / 3;

// Game state variables
let player = {
    x: canvas.width / 2 - PLAYER_WIDTH / 2,
    y: canvas.height - PLAYER_HEIGHT - 10,
    speed: 5
};

let cars = [];
let score = 0;
let gameOver = false;
let frame = 0;

// Level-related variables
let currentLevelIndex = 0; // Starts at the first level in the array
let carSpeed = 0; // Will be set by current level
let carSpawnRate = 0; // Will be set by current level

// Define your levels here: scoreThreshold determines when to advance to the NEXT level.
// Ensure levels are sorted by scoreThreshold.
const levels = [
    { level: 1, scoreThreshold: 0, carSpeed: 5, carSpawnRate: 90 }, // Initial settings
    { level: 2, scoreThreshold: 500, carSpeed: 6.5, carSpawnRate: 80 },
    { level: 3, scoreThreshold: 1500, carSpeed: 8, carSpawnRate: 70 },
    { level: 4, scoreThreshold: 3000, carSpeed: 9.5, carSpawnRate: 60 },
    { level: 5, scoreThreshold: 5000, carSpeed: 11, carSpawnRate: 50 },
    { level: 6, scoreThreshold: 7500, carSpeed: 12.5, carSpawnRate: 40 },
    { level: 7, scoreThreshold: 10000, carSpeed: 14, carSpawnRate: 30 },
    { level: 8, scoreThreshold: 13000, carSpeed: 15.5, carSpawnRate: 25 },
    { level: 9, scoreThreshold: 17000, carSpeed: 17, carSpawnRate: 20 },
    { level: 10, scoreThreshold: 22000, carSpeed: 18.5, carSpawnRate: 15 },
    { level: "MAX", scoreThreshold: Infinity, carSpeed: 20, carSpawnRate: 10 } // Final max difficulty
];

let moveLeft = false;
let moveRight = false;


// --- Socket.IO Setup (unchanged) ---
const socket = io(SERVER_URL);
let otherPlayers = {};

socket.on('connect', () => {
    console.log('Connected to game server!');
    fetchHighScores(); // Fetch high scores on connect
});

socket.on('disconnect', () => {
    console.log('Disconnected from game server.');
});

socket.on('currentPlayers', (playersData) => {
    otherPlayers = playersData;
    delete otherPlayers[socket.id];
});

socket.on('newPlayer', (playerData) => {
    if (playerData.id !== socket.id) {
        otherPlayers[playerData.id] = playerData;
    }
});

socket.on('playerMoved', (playerData) => {
    if (playerData.id !== socket.id) {
        otherPlayers[playerData.id] = playerData;
    }
});

socket.on('playerDisconnected', (playerId) => {
    delete otherPlayers[playerId];
});

socket.on('carSpawned', (carData) => {
    if (!cars.some(c => c.id === carData.id)) {
        cars.push(carData);
    }
});

socket.on('highScoresUpdated', (updatedScores) => {
    displayHighScores(updatedScores);
});

// --- High Score API Interaction (unchanged) ---
async function fetchHighScores() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const scores = await response.json();
        displayHighScores(scores);
    } catch (error) {
        console.error('Error fetching high scores:', error);
        highScoresList.innerHTML = '<li>Error loading scores. Check backend logs and CORS!</li>';
    }
}

async function submitHighScore(name, score) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, score }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.message}`);
        }
        const result = await response.json();
        console.log('Score submitted:', result);
        fetchHighScores();
        gameOverScreen.classList.remove('active');
    } catch (error) {
        console.error('Error submitting high score:', error);
        alert('Failed to submit high score. Check browser console for details.');
    }
}

function displayHighScores(scores) {
    highScoresList.innerHTML = '';
    if (scores.length === 0) {
        highScoresList.innerHTML = '<li>No high scores yet!</li>';
        return;
    }
    scores.forEach((s, index) => {
        const li = document.createElement('li');
        li.textContent = `${index + 1}. ${s.name}: ${s.score}`;
        highScoresList.appendChild(li);
    });
}

// --- Game Core Logic ---

// Initializes/resets the game state
function initGame() {
    player.x = canvas.width / 2 - PLAYER_WIDTH / 2;
    player.y = canvas.height - PLAYER_HEIGHT - 10;
    cars = [];
    score = 0;
    gameOver = false;
    frame = 0;

    // Reset and apply initial level settings
    currentLevelIndex = 0;
    applyLevelSettings(levels[currentLevelIndex]);

    scoreDisplay.textContent = score;
    // levelDisplay.textContent is updated by applyLevelSettings

    gameOverScreen.classList.remove('active');
    playerNameInput.value = '';

    moveLeft = false;
    moveRight = false;

    // --- NEW: Activate Focus Mode when game starts ---
    gameContainer.classList.add('focus-mode');

    requestAnimationFrame(gameLoop);
}

// Function to apply settings from a given level object
function applyLevelSettings(levelObj) {
    carSpeed = levelObj.carSpeed;
    carSpawnRate = levelObj.carSpawnRate;
    levelDisplay.textContent = levelObj.level; // Update the displayed level
    console.log(`Advancing to Level ${levelObj.level}! Speed: ${carSpeed}, Spawn Rate: ${carSpawnRate}`);
}


// The main game loop, called repeatedly
function gameLoop() {
    if (gameOver) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawRoad();

    for (const id in otherPlayers) {
        if (id !== socket.id) {
            drawPlayer(otherPlayers[id], 'blue');
        }
    }
    drawPlayer(player, 'red');

    updateCars();
    drawCars();
    checkCollisions();

    scoreDisplay.textContent = score;

    frame++;

    // Level progression logic based on score
    if (currentLevelIndex + 1 < levels.length && score >= levels[currentLevelIndex + 1].scoreThreshold) {
        currentLevelIndex++; // Move to the next level
        applyLevelSettings(levels[currentLevelIndex]); // Apply its settings
    }

    if (moveLeft) {
        player.x = Math.max(0, player.x - player.speed * 5);
        socket.emit('playerMoved', { x: player.x, y: player.y });
    } else if (moveRight) {
        player.x = Math.min(canvas.width - PLAYER_WIDTH, player.x + player.speed * 5);
        socket.emit('playerMoved', { x: player.x, y: player.y });
    }

    requestAnimationFrame(gameLoop);
}

// Drawing functions (unchanged)
function drawRoad() {
    ctx.fillStyle = '#7f8c8d';
    const lineCount = 5;
    const lineHeight = 50;
    const lineGap = 30;

    for (let i = 0; i < lineCount; i++) {
        let y = (frame * 2) % (lineHeight + lineGap);
        ctx.fillRect(canvas.width / 3 - 5, y + i * (lineHeight + lineGap), 10, lineHeight);
        ctx.fillRect(canvas.width * 2 / 3 - 5, y + i * (lineHeight + lineGap), 10, lineHeight);
    }
}

function drawPlayer(p, color) {
    ctx.fillStyle = color;
    ctx.fillRect(p.x, p.y, PLAYER_WIDTH, PLAYER_HEIGHT);
    ctx.fillStyle = 'black';
    ctx.fillRect(p.x + 5, p.y + 10, PLAYER_WIDTH - 10, 15);
    ctx.fillRect(p.x + 5, p.y + PLAYER_HEIGHT - 25, PLAYER_WIDTH - 10, 15);
    ctx.beginPath();
    ctx.arc(p.x + 10, p.y + PLAYER_HEIGHT - 10, 5, 0, Math.PI * 2);
    ctx.arc(p.x + PLAYER_WIDTH - 10, p.y + PLAYER_HEIGHT - 10, 5, 0, Math.PI * 2);
    ctx.fill();
}

function drawCars() {
    cars.forEach(car => {
        ctx.fillStyle = car.color;
        ctx.fillRect(car.x, car.y, CAR_WIDTH, CAR_HEIGHT);
        ctx.fillStyle = 'black';
        ctx.fillRect(car.x + 5, car.y + 10, CAR_WIDTH - 10, 15);
        ctx.fillRect(car.x + 5, car.y + CAR_HEIGHT - 25, CAR_WIDTH - 10, 15);
        ctx.beginPath();
        ctx.arc(car.x + 10, car.y + CAR_HEIGHT - 10, 5, 0, Math.PI * 2);
        ctx.arc(car.x + CAR_WIDTH - 10, car.y + CAR_HEIGHT - 10, 5, 0, Math.PI * 2);
        ctx.fill();
    });
}

function updateCars() {
    for (let i = 0; i < cars.length; i++) {
        cars[i].y += carSpeed;
        if (cars[i].y > canvas.height) {
            cars.splice(i, 1);
            i--;
            score += 10;
        }
    }

    if (frame % carSpawnRate === 0) {
        const lane = Math.floor(Math.random() * 3);
        const x = lane * LANE_WIDTH + (LANE_WIDTH / 2) - (CAR_WIDTH / 2);
        const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16);
        const newCar = {
            id: Date.now() + Math.random(),
            x: x,
            y: -CAR_HEIGHT,
            color: randomColor
        };
        cars.push(newCar);
        socket.emit('carSpawned', newCar);
    }
}

function checkCollisions() {
    for (let i = 0; i < cars.length; i++) {
        const car = cars[i];
        if (player.x < car.x + CAR_WIDTH &&
            player.x + PLAYER_WIDTH > car.x &&
            player.y < car.y + CAR_HEIGHT &&
            player.y + PLAYER_HEIGHT > car.y) {
            endGame();
            break;
        }
    }
}

function endGame() {
    gameOver = true;
    finalScoreDisplay.textContent = score;
    gameOverScreen.classList.add('active');

    // --- NEW: Deactivate Focus Mode when game ends ---
    gameContainer.classList.remove('focus-mode');

    console.log("Game Over! Final Score:", score);
}

// --- Event Listeners (Keyboard & Mobile Button Controls - unchanged) ---
document.addEventListener('keydown', (e) => {
    if (gameOver) return;
    let moved = false;
    if (e.key === 'ArrowLeft') {
        player.x = Math.max(0, player.x - player.speed * 10);
        moved = true;
    } else if (e.key === 'ArrowRight') {
        player.x = Math.min(canvas.width - PLAYER_WIDTH, player.x + player.speed * 10);
        moved = true;
    }

    if (moved) {
        socket.emit('playerMoved', { x: player.x, y: player.y });
    }
});

leftButton.addEventListener('touchstart', (e) => {
    if (gameOver) return;
    e.preventDefault();
    moveLeft = true;
    moveRight = false;
});

leftButton.addEventListener('touchend', (e) => {
    if (gameOver) return;
    e.preventDefault();
    moveLeft = false;
});

leftButton.addEventListener('touchcancel', (e) => {
    if (gameOver) return;
    e.preventDefault();
    moveLeft = false;
});

rightButton.addEventListener('touchstart', (e) => {
    if (gameOver) return;
    e.preventDefault();
    moveRight = true;
    moveLeft = false;
});

rightButton.addEventListener('touchend', (e) => {
    if (gameOver) return;
    e.preventDefault();
    moveRight = false;
});

rightButton.addEventListener('touchcancel', (e) => {
    if (gameOver) return;
    e.preventDefault();
    moveRight = false;
});

submitScoreBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value.trim();
    if (playerName) {
        submitHighScore(playerName, score);
    } else {
        alert('Please enter your name!');
    }
});

restartGameBtn.addEventListener('click', initGame);

// --- Initialize Game on Load ---
window.onload = () => {
    initGame();
    fetchHighScores(); // Fetch high scores initially even before game starts
};
