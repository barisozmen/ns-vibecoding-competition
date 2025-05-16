import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Game state
let gameState = {
  running: true,
  score: 0,
  speed: 0.1,
  direction: new THREE.Vector3(1, 0, 0),
  nextDirection: new THREE.Vector3(1, 0, 0),
  lastUpdateTime: 0,
  updateInterval: 150, // ms between moves
  worldChunks: new Map(), // Store generated world chunks
  chunkSize: 20,
  visibleDistance: 3, // Number of chunks visible in each direction
};

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue

// Fog for distance fade-out
scene.fog = new THREE.Fog(0x87CEEB, 30, 80);

// Camera setup
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 15, 15);
camera.lookAt(0, 0, 0);

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
directionalLight.shadow.camera.near = 0.1;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -20;
directionalLight.shadow.camera.right = 20;
directionalLight.shadow.camera.top = 20;
directionalLight.shadow.camera.bottom = -20;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

// Game objects
let snake = [];
let food = null;
const snakeSegmentSize = 1;
const objectsLibrary = {
  trees: [],
  rocks: [],
  buildings: []
};

// Create material library for low-poly look
const materials = {
  ground: new THREE.MeshLambertMaterial({ color: 0x7CFC00 }), // Light green
  snake: new THREE.MeshLambertMaterial({ color: 0x32CD32 }), // Green
  snakeHead: new THREE.MeshLambertMaterial({ color: 0x228B22 }), // Forest green
  food: new THREE.MeshLambertMaterial({ color: 0xFF4500 }), // Orange-red
  tree: new THREE.MeshLambertMaterial({ color: 0x8B4513 }), // Brown
  leaf: new THREE.MeshLambertMaterial({ color: 0x228B22 }), // Forest green
  rock: new THREE.MeshLambertMaterial({ color: 0x696969 }), // Gray
  building: new THREE.MeshLambertMaterial({ color: 0xDEB887 }), // Burlywood
};

// Initialize snake
function initSnake() {
  // Create head
  const headGeometry = new THREE.BoxGeometry(snakeSegmentSize, snakeSegmentSize, snakeSegmentSize);
  const headMesh = new THREE.Mesh(headGeometry, materials.snakeHead);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  scene.add(headMesh);
  snake.push({ mesh: headMesh, position: new THREE.Vector3(0, 0.5, 0) });
  
  // Add initial tail segments
  addSnakeSegment();
  addSnakeSegment();
}

function addSnakeSegment() {
  const lastSegment = snake[snake.length - 1];
  const segmentGeometry = new THREE.BoxGeometry(snakeSegmentSize, snakeSegmentSize, snakeSegmentSize);
  const segmentMesh = new THREE.Mesh(segmentGeometry, materials.snake);
  segmentMesh.castShadow = true;
  segmentMesh.receiveShadow = true;
  scene.add(segmentMesh);
  
  // Place new segment at the same position as the last segment
  const newPos = lastSegment.position.clone();
  snake.push({ mesh: segmentMesh, position: newPos });
  
  // Update positions of all segments
  updateSnakePositions();
}

function updateSnakePositions() {
  // Update all snake segment positions
  for (let i = 0; i < snake.length; i++) {
    snake[i].mesh.position.copy(snake[i].position);
  }
}

function moveSnake() {
  gameState.direction.copy(gameState.nextDirection);
  
  // Store previous positions to create follow effect
  const positions = snake.map(segment => segment.position.clone());
  
  // Move head
  snake[0].position.add(gameState.direction.clone().multiplyScalar(snakeSegmentSize));
  
  // Move other segments to previous positions
  for (let i = 1; i < snake.length; i++) {
    snake[i].position.copy(positions[i-1]);
  }
  
  // Update meshes
  updateSnakePositions();
  
  // Check collisions
  checkCollisions();
  
  // Add world chunks if needed based on new head position
  updateWorldChunks();
}

// Spawn food at random position
function spawnFood() {
  if (food) {
    scene.remove(food.mesh);
  }
  
  const headPos = snake[0].position;
  let foodPos;
  
  // Try to find a position not too close and not too far from the snake head
  do {
    const angle = Math.random() * Math.PI * 2;
    const distance = 5 + Math.random() * 10; // Between 5 and 15 units away
    
    foodPos = new THREE.Vector3(
      headPos.x + Math.cos(angle) * distance,
      0.5,
      headPos.z + Math.sin(angle) * distance
    );
  } while (isPositionOccupied(foodPos));
  
  const foodGeometry = new THREE.SphereGeometry(0.5, 8, 8); // Low-poly sphere
  const foodMesh = new THREE.Mesh(foodGeometry, materials.food);
  foodMesh.castShadow = true;
  foodMesh.receiveShadow = true;
  foodMesh.position.copy(foodPos);
  scene.add(foodMesh);
  
  food = {
    mesh: foodMesh,
    position: foodPos
  };
}

// Check if position is already occupied by snake or objects
function isPositionOccupied(position, tolerance = 1.5) {
  // Check against snake segments
  for (const segment of snake) {
    if (segment.position.distanceTo(position) < tolerance) {
      return true;
    }
  }
  
  // Check against environmental objects (implementation depends on how you store them)
  // This is a simplified placeholder
  const chunkKey = getChunkKeyFromPosition(position);
  const chunk = gameState.worldChunks.get(chunkKey);
  if (chunk) {
    for (const obj of chunk.objects) {
      if (obj.position.distanceTo(position) < tolerance) {
        return true;
      }
    }
  }
  
  return false;
}

// Check collisions with food and obstacles
function checkCollisions() {
  const headPos = snake[0].position;
  
  // Check food collision
  if (food && headPos.distanceTo(food.position) < snakeSegmentSize) {
    eatFood();
  }
  
  // Check self collision (skip head)
  for (let i = 4; i < snake.length; i++) {
    if (headPos.distanceTo(snake[i].position) < snakeSegmentSize * 0.5) {
      gameOver();
      return;
    }
  }
  
  // Check world boundaries (not needed with infinite world)
  // We could add a way for the snake to die if it falls off the world
  if (headPos.y < -5) {
    gameOver();
  }
}

function eatFood() {
  gameState.score++;
  document.getElementById('score').textContent = `Score: ${gameState.score}`;
  scene.remove(food.mesh);
  food = null;
  
  // Add new segment
  addSnakeSegment();
  
  // Spawn new food
  spawnFood();
  
  // Increase speed slightly
  gameState.updateInterval = Math.max(80, gameState.updateInterval - 2);
}

function gameOver() {
  gameState.running = false;
  document.getElementById('gameOver').style.display = 'flex';
  document.getElementById('finalScore').textContent = gameState.score;
}

// World generation
function getChunkKeyFromPosition(position) {
  const x = Math.floor(position.x / gameState.chunkSize);
  const z = Math.floor(position.z / gameState.chunkSize);
  return `${x},${z}`;
}

function updateWorldChunks() {
  const headPos = snake[0].position;
  const currentChunkX = Math.floor(headPos.x / gameState.chunkSize);
  const currentChunkZ = Math.floor(headPos.z / gameState.chunkSize);
  
  // Generate chunks in view distance
  for (let x = currentChunkX - gameState.visibleDistance; x <= currentChunkX + gameState.visibleDistance; x++) {
    for (let z = currentChunkZ - gameState.visibleDistance; z <= currentChunkZ + gameState.visibleDistance; z++) {
      const chunkKey = `${x},${z}`;
      
      if (!gameState.worldChunks.has(chunkKey)) {
        generateChunk(x, z, chunkKey);
      }
    }
  }
  
  // Remove chunks that are too far away
  for (const [key, chunk] of gameState.worldChunks.entries()) {
    const [chunkX, chunkZ] = key.split(',').map(Number);
    
    if (Math.abs(chunkX - currentChunkX) > gameState.visibleDistance + 1 || 
        Math.abs(chunkZ - currentChunkZ) > gameState.visibleDistance + 1) {
      // Remove chunk objects from scene
      for (const object of chunk.objects) {
        scene.remove(object);
      }
      scene.remove(chunk.ground);
      
      // Remove from map
      gameState.worldChunks.delete(key);
    }
  }
}

function generateChunk(chunkX, chunkZ, chunkKey) {
  const chunk = {
    ground: null,
    objects: []
  };
  
  // Create ground
  const groundGeometry = new THREE.PlaneGeometry(gameState.chunkSize, gameState.chunkSize, 1, 1);
  const ground = new THREE.Mesh(groundGeometry, materials.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(
    chunkX * gameState.chunkSize + gameState.chunkSize / 2,
    0,
    chunkZ * gameState.chunkSize + gameState.chunkSize / 2
  );
  ground.receiveShadow = true;
  scene.add(ground);
  chunk.ground = ground;
  
  // Add random environmental objects
  const numObjects = Math.floor(Math.random() * 5) + 2; // 2-6 objects per chunk
  
  for (let i = 0; i < numObjects; i++) {
    const objectType = Math.random();
    const offsetX = Math.random() * gameState.chunkSize;
    const offsetZ = Math.random() * gameState.chunkSize;
    const worldX = chunkX * gameState.chunkSize + offsetX;
    const worldZ = chunkZ * gameState.chunkSize + offsetZ;
    
    // Create a low-poly object based on random type
    let object;
    
    if (objectType < 0.5) {
      // Tree
      object = createLowPolyTree();
    } else if (objectType < 0.8) {
      // Rock
      object = createLowPolyRock();
    } else {
      // Building
      object = createLowPolyBuilding();
    }
    
    object.position.set(worldX, 0, worldZ);
    scene.add(object);
    chunk.objects.push(object);
  }
  
  // Store the chunk
  gameState.worldChunks.set(chunkKey, chunk);
}

function createLowPolyTree() {
  const group = new THREE.Group();
  
  // Trunk
  const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.3, 1.5, 5);
  const trunk = new THREE.Mesh(trunkGeometry, materials.tree);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  trunk.position.y = 0.75;
  group.add(trunk);
  
  // Leaves (low-poly cone)
  const leavesGeometry = new THREE.ConeGeometry(0.8, 1.5, 6);
  const leaves = new THREE.Mesh(leavesGeometry, materials.leaf);
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  leaves.position.y = 2;
  group.add(leaves);
  
  return group;
}

function createLowPolyRock() {
  // Create a low-poly rock using a modified icosahedron
  const geometry = new THREE.IcosahedronGeometry(0.5 + Math.random() * 0.5, 0);
  
  // Modify vertices slightly for more randomness
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    const x = geometry.attributes.position.getX(i);
    const y = geometry.attributes.position.getY(i);
    const z = geometry.attributes.position.getZ(i);
    
    geometry.attributes.position.setX(i, x * (0.8 + Math.random() * 0.4));
    geometry.attributes.position.setY(i, y * (0.8 + Math.random() * 0.4));
    geometry.attributes.position.setZ(i, z * (0.8 + Math.random() * 0.4));
  }
  
  geometry.attributes.position.needsUpdate = true;
  
  const rock = new THREE.Mesh(geometry, materials.rock);
  rock.castShadow = true;
  rock.receiveShadow = true;
  rock.position.y = 0.25;
  
  return rock;
}

function createLowPolyBuilding() {
  const group = new THREE.Group();
  
  // Building body
  const height = 1 + Math.random() * 2;
  const width = 1 + Math.random() * 1.5;
  const depth = 1 + Math.random() * 1.5;
  
  const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
  const building = new THREE.Mesh(buildingGeometry, materials.building);
  building.castShadow = true;
  building.receiveShadow = true;
  building.position.y = height / 2;
  group.add(building);
  
  // Simple roof
  const roofGeometry = new THREE.ConeGeometry(Math.max(width, depth) * 0.7, height * 0.4, 4);
  const roof = new THREE.Mesh(roofGeometry, materials.rock);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = height + height * 0.2;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);
  
  return group;
}

// Handle controls
document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  
  switch (key) {
    case 'w':
    case 'arrowup':
      if (gameState.direction.z !== 1) { // Not moving backward
        gameState.nextDirection.set(0, 0, -1);
      }
      break;
    case 's':
    case 'arrowdown':
      if (gameState.direction.z !== -1) { // Not moving forward
        gameState.nextDirection.set(0, 0, 1);
      }
      break;
    case 'a':
    case 'arrowleft':
      if (gameState.direction.x !== 1) { // Not moving right
        gameState.nextDirection.set(-1, 0, 0);
      }
      break;
    case 'd':
    case 'arrowright':
      if (gameState.direction.x !== -1) { // Not moving left
        gameState.nextDirection.set(1, 0, 0);
      }
      break;
  }
  
  event.preventDefault();
});

// Mobile swipe controls
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('touchstart', (event) => {
  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;
}, false);

document.addEventListener('touchend', (event) => {
  const touchEndX = event.changedTouches[0].clientX;
  const touchEndY = event.changedTouches[0].clientY;
  
  const diffX = touchEndX - touchStartX;
  const diffY = touchEndY - touchStartY;
  
  if (Math.abs(diffX) > Math.abs(diffY)) {
    // Horizontal swipe
    if (diffX > 0 && gameState.direction.x !== -1) {
      // Right swipe
      gameState.nextDirection.set(1, 0, 0);
    } else if (diffX < 0 && gameState.direction.x !== 1) {
      // Left swipe
      gameState.nextDirection.set(-1, 0, 0);
    }
  } else {
    // Vertical swipe
    if (diffY > 0 && gameState.direction.z !== -1) {
      // Down swipe
      gameState.nextDirection.set(0, 0, 1);
    } else if (diffY < 0 && gameState.direction.z !== 1) {
      // Up swipe
      gameState.nextDirection.set(0, 0, -1);
    }
  }
}, false);

// Handle restart
document.getElementById('restartButton')?.addEventListener('click', () => {
  restartGame();
});

function restartGame() {
  // Remove all snake segments
  for (const segment of snake) {
    scene.remove(segment.mesh);
  }
  snake = [];
  
  // Remove food
  if (food) {
    scene.remove(food.mesh);
    food = null;
  }
  
  // Reset game state
  gameState.running = true;
  gameState.score = 0;
  gameState.direction.set(1, 0, 0);
  gameState.nextDirection.set(1, 0, 0);
  gameState.updateInterval = 150;
  
  // Reset UI
  document.getElementById('gameOver').style.display = 'none';
  document.getElementById('score').textContent = 'Score: 0';
  
  // Initialize game
  initSnake();
  spawnFood();
  
  // Reset camera
  camera.position.set(0, 15, 15);
  camera.lookAt(0, 0, 0);
}

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Camera follows snake
function updateCamera() {
  if (snake.length > 0) {
    const headPos = snake[0].position;
    const targetCameraPos = new THREE.Vector3(
      headPos.x - gameState.direction.x * 5,
      15,
      headPos.z - gameState.direction.z * 5 + 12
    );
    
    // Smoothly move camera
    camera.position.lerp(targetCameraPos, 0.1);
    camera.lookAt(headPos.x + gameState.direction.x * 5, headPos.y, headPos.z + gameState.direction.z * 5);
  }
}

// Game loop
function animate(timestamp) {
  requestAnimationFrame(animate);
  
  if (gameState.running) {
    // Update snake position at fixed intervals
    if (timestamp - gameState.lastUpdateTime > gameState.updateInterval) {
      moveSnake();
      gameState.lastUpdateTime = timestamp;
    }
    
    updateCamera();
  }
  
  renderer.render(scene, camera);
}

// Create UI
function createUI() {
  // Score display
  const scoreDiv = document.createElement('div');
  scoreDiv.id = 'score';
  scoreDiv.textContent = 'Score: 0';
  scoreDiv.style.position = 'absolute';
  scoreDiv.style.top = '10px';
  scoreDiv.style.left = '10px';
  scoreDiv.style.color = 'white';
  scoreDiv.style.fontFamily = 'Arial, sans-serif';
  scoreDiv.style.fontSize = '24px';
  scoreDiv.style.fontWeight = 'bold';
  scoreDiv.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.5)';
  document.body.appendChild(scoreDiv);
  
  // Game over screen
  const gameOverDiv = document.createElement('div');
  gameOverDiv.id = 'gameOver';
  gameOverDiv.style.position = 'absolute';
  gameOverDiv.style.top = '0';
  gameOverDiv.style.left = '0';
  gameOverDiv.style.width = '100%';
  gameOverDiv.style.height = '100%';
  gameOverDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  gameOverDiv.style.display = 'none';
  gameOverDiv.style.flexDirection = 'column';
  gameOverDiv.style.justifyContent = 'center';
  gameOverDiv.style.alignItems = 'center';
  gameOverDiv.style.color = 'white';
  gameOverDiv.style.fontFamily = 'Arial, sans-serif';
  
  const gameOverTitle = document.createElement('h1');
  gameOverTitle.textContent = 'Game Over';
  gameOverTitle.style.fontSize = '48px';
  gameOverTitle.style.marginBottom = '20px';
  
  const finalScore = document.createElement('p');
  finalScore.id = 'finalScore';
  finalScore.textContent = '0';
  finalScore.style.fontSize = '24px';
  finalScore.style.marginBottom = '30px';
  
  const restartButton = document.createElement('button');
  restartButton.id = 'restartButton';
  restartButton.textContent = 'Restart';
  restartButton.style.padding = '10px 20px';
  restartButton.style.fontSize = '18px';
  restartButton.style.cursor = 'pointer';
  restartButton.style.backgroundColor = '#4CAF50';
  restartButton.style.border = 'none';
  restartButton.style.borderRadius = '5px';
  restartButton.style.color = 'white';
  
  gameOverDiv.appendChild(gameOverTitle);
  gameOverDiv.appendChild(finalScore);
  gameOverDiv.appendChild(restartButton);
  document.body.appendChild(gameOverDiv);
  
  // Mobile controls instructions
  const instructions = document.createElement('div');
  instructions.id = 'instructions';
  instructions.textContent = 'Desktop: Use Arrow Keys or WASD. Mobile: Swipe to change direction.';
  instructions.style.position = 'absolute';
  instructions.style.bottom = '10px';
  instructions.style.left = '0';
  instructions.style.width = '100%';
  instructions.style.textAlign = 'center';
  instructions.style.color = 'white';
  instructions.style.fontFamily = 'Arial, sans-serif';
  instructions.style.fontSize = '16px';
  instructions.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.5)';
  document.body.appendChild(instructions);
}

// Initialize game
function init() {
  createUI();
  initSnake();
  updateWorldChunks(); // Generate initial world chunks
  spawnFood();
  
  gameState.lastUpdateTime = performance.now();
  animate(gameState.lastUpdateTime);
}

init(); 