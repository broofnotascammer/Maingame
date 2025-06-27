// --- Configuration & Constants ---
// *** IMPORTANT: Replace 'YOUR_DODGE_CARS_BACKEND_RENDER_URL_HERE' with your actual Render backend URL! ***
// Example: const SERVER_URL = 'https://my-dodge-cars-server.onrender.com';
const SERVER_URL = 'YOUR_DODGE_CARS_BACKEND_RENDER_URL_HERE'; // <<< Make sure this is YOUR backend URL
const API_URL = `${SERVER_URL}/api/highscores`;

// Get DOM elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('scoreValue');
const highScoresList = document.getElementById('highScoresList');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreDisplay = document.getElementById('finalScore');
const playerNameInput = document.getElementById('playerNameInput');
const submitScoreBtn = document.getElementById('submitScoreBtn');
const restartGameBtn = document.getElementById('restartGameBtn');

// NEW: Get references to control buttons
const leftButton = document.getElementById('leftButton');
const rightButton = document.getElementById('rightButton');

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
let carSpeed = 5;
let carSpawnRate = 90;

// NEW: Variables to track continuous movement from buttons
let moveLeft = false;
let moveRight = false;


// --- Socket.IO Setup ---
const socket = io(SERVER_URL);
let otherPlayers = {};

socket.on('connect', () => {
    console.log('Connected to game server!');
    fetchHighScores();
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

// --- High Score API Interaction ---
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
function initGame() {
    player.x = canvas.width / 2 - PLAYER_WIDTH / 2;
    player.y = canvas.height - PLAYER_HEIGHT - 10;
    cars = [];
    score = 0;
    gameOver = false;
    frame = 0;
    carSpeed = 5;
    carSpawnRate = 90;
    scoreDisplay.textContent = score;
    gameOverScreen.classList.remove('active');
    playerNameInput.value = '';
    
    // NEW: Reset movement flags
    moveLeft = false;
    moveRight = false;

    requestAnimationFrame(gameLoop);
}

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

    if (frame % 500 === 0) {
        carSpeed += 0.5;
        if (carSpawnRate > 20) {
            carSpawnRate -= 5;
        }
    }

    // NEW: Apply continuous movement based on button flags
    if (moveLeft) {
        player.x = Math.max(0, player.x - player.speed * 5); // Use a faster step for continuous movement
        socket.emit('playerMoved', { x: player.x, y: player.y });
    } else if (moveRight) {
        player.x = Math.min(canvas.width - PLAYER_WIDTH, player.x + player.speed * 5); // Use a faster step
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
    console.log("Game Over! Final Score:", score);
}

// --- Event Listeners (Keyboard & NEW Mobile Button Controls) ---

// Keyboard controls for desktop (unchanged)
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

// IMPORTANT: REMOVE or COMMENT OUT the old canvas-wide touch events
// if you want to rely solely on the new buttons:
/*
canvas.addEventListener('touchstart', (e) => {
    if (gameOver) return;
    e.preventDefault();
    // Your old touch logic here
});
canvas.addEventListener('touchmove', (e) => {
    if (gameOver) return;
    e.preventDefault();
    // Your old touch logic here
});
canvas.addEventListener('touchend', (e) => {
    if (gameOver) return;
    e.preventDefault();
    // Your old touch logic here
});
canvas.addEventListener('touchcancel', (e) => {
    if (gameOver) return;
    e.preventDefault();
    // Your old touch logic here
});
*/

// NEW: Mobile Button Touch Controls
leftButton.addEventListener('touchstart', (e) => {
    if (gameOver) return;
    e.preventDefault(); // Prevent scrolling/zooming
    moveLeft = true;
    moveRight = false; // Ensure only one direction is active
});

leftButton.addEventListener('touchend', (e) => {
    if (gameOver) return;
    e.preventDefault();
    moveLeft = false;
});

leftButton.addEventListener('touchcancel', (e) => { // Handle cases where touch might be interrupted
    if (gameOver) return;
    e.preventDefault();
    moveLeft = false;
});

rightButton.addEventListener('touchstart', (e) => {
    if (gameOver) return;
    e.preventDefault(); // Prevent scrolling/zooming
    moveRight = true;
    moveLeft = false; // Ensure only one direction is active
});

rightButton.addEventListener('touchend', (e) => {
    if (gameOver) return;
    e.preventDefault();
    moveRight = false;
});

rightButton.addEventListener('touchcancel', (e) => { // Handle cases where touch might be interrupted
    if (gameOver) return;
    e.preventDefault();
    moveRight = false;
});


// Button event listeners (unchanged)
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
    fetchHighScores();
};
