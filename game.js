// --- Configuration & Constants ---
// IMPORTANT: Replace with your actual Render backend URL after deployment!
const SERVER_URL = 'https://cardodge.onrender.com';
const API_URL = `${SERVER_URL}/api/highscores`; // For high scores API

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('scoreValue');
const highScoresList = document.getElementById('highScoresList');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreDisplay = document.getElementById('finalScore');
const playerNameInput = document.getElementById('playerNameInput');
const submitScoreBtn = document.getElementById('submitScoreBtn');
const restartGameBtn = document.getElementById('restartGameBtn');

const PLAYER_WIDTH = 50;
const PLAYER_HEIGHT = 80;
const CAR_WIDTH = 60;
const CAR_HEIGHT = 100;
const LANE_WIDTH = canvas.width / 3; // For 3 lanes

let player = {
    x: canvas.width / 2 - PLAYER_WIDTH / 2,
    y: canvas.height - PLAYER_HEIGHT - 10,
    speed: 5
};

let cars = [];
let score = 0;
let gameOver = false;
let frame = 0; // Game frames for car spawning
let carSpeed = 5; // Initial car speed
let carSpawnRate = 90; // Spawn every X frames (lower = more frequent)

// --- Socket.IO Setup ---
const socket = io(SERVER_URL);
let otherPlayers = {}; // Stores other players' data

socket.on('connect', () => {
    console.log('Connected to game server!');
    // Request initial high scores on connect
    fetchHighScores();
});

socket.on('disconnect', () => {
    console.log('Disconnected from game server.');
});

// Receive initial list of players
socket.on('currentPlayers', (playersData) => {
    otherPlayers = playersData;
    delete otherPlayers[socket.id]; // Don't include self in otherPlayers
});

// Receive a new player
socket.on('newPlayer', (playerData) => {
    otherPlayers[playerData.id] = playerData;
});

// Receive player movement updates
socket.on('playerMoved', (playerData) => {
    otherPlayers[playerData.id] = playerData;
});

// Receive notification when a player disconnects
socket.on('playerDisconnected', (playerId) => {
    delete otherPlayers[playerId];
});

// Receive car spawned data from other clients (for multiplayer sync)
socket.on('carSpawned', (carData) => {
    // Only add if not already present (might need more robust sync for duplicates)
    if (!cars.some(c => c.id === carData.id)) {
        cars.push(carData);
    }
});

// Receive high scores update from server (after a new score is submitted)
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
        highScoresList.innerHTML = '<li>Error loading scores.</li>';
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
        fetchHighScores(); // Refresh high scores after submission
        gameOverScreen.classList.remove('active'); // Hide screen
    } catch (error) {
        console.error('Error submitting high score:', error);
        alert('Failed to submit high score. Please try again.');
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

// --- Game Logic ---

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
    requestAnimationFrame(gameLoop); // Start the game loop
}

function gameLoop() {
    if (gameOver) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas

    drawRoad(); // Draw the road background

    // Draw other players
    for (const id in otherPlayers) {
        if (id !== socket.id) { // Don't draw self from otherPlayers object
            drawPlayer(otherPlayers[id], 'blue'); // Draw other players in blue
        }
    }
    drawPlayer(player, 'red'); // Draw current player in red

    updateCars();
    drawCars();
    checkCollisions();

    scoreDisplay.textContent = score;

    frame++;

    // Increase difficulty over time
    if (frame % 500 === 0) {
        carSpeed += 0.5;
        if (carSpawnRate > 20) { // Don't make it too frequent
            carSpawnRate -= 5;
        }
    }

    requestAnimationFrame(gameLoop); // Loop
}

function drawRoad() {
    ctx.fillStyle = '#7f8c8d'; // Gray for road lines
    const lineCount = 5;
    const lineHeight = 50;
    const lineGap = 30;

    for (let i = 0; i < lineCount; i++) {
        let y = (frame * 2) %
