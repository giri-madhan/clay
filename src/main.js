import * as THREE from 'three';
import { GUI } from 'lil-gui';

// --- Configuration ---
const CONFIG = {
    clayColor: 0xE07A5F,
    backgroundColor: 0xF5F5DC, // Beige
    rotationSpeed: 2.0, // Radians per second
    sculptStrength: 0.05,
    sculptRadius: 0.5, // Vertical influence radius
    minRadius: 0.2, // Don't sculpt thinner than this
    maxRadius: 3.5, // Don't sculpt thicker than this
    clayHeight: 5,
    clayRadius: 1.5,
    segmentsRadial: 128,
    segmentsHeight: 128
};

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.backgroundColor);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 3, 8);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
scene.add(dirLight);

// --- Clay Mesh ---
// Generate a simple noise texture for the clay so we can see it spinning
const canvas = document.createElement('canvas');
canvas.width = 512;
canvas.height = 512;
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#E07A5F';
ctx.fillRect(0,0,512,512);
// Add noise
for(let i=0; i<50000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#cc6950' : '#f08a6f';
    ctx.fillRect(Math.random()*512, Math.random()*512, 2, 2);
}
const clayTexture = new THREE.CanvasTexture(canvas);

const geometry = new THREE.CylinderGeometry(
    CONFIG.clayRadius, // radiusTop
    CONFIG.clayRadius, // radiusBottom
    CONFIG.clayHeight,
    CONFIG.segmentsRadial,
    CONFIG.segmentsHeight,
    true // openEnded?
);
// Determine UVs properly or just use default. Default cylinder UVs wrap around.

const positionAttribute = geometry.attributes.position;
const vertex = new THREE.Vector3();

const material = new THREE.MeshStandardMaterial({
    map: clayTexture,
    roughness: 0.8,
    metalness: 0.1,
});

const clayMesh = new THREE.Mesh(geometry, material);
clayMesh.castShadow = true;
clayMesh.receiveShadow = true;
scene.add(clayMesh);

// --- Invisible Plane for Raycasting ---
// This plane bisects the cylinder and faces the camera roughly.
// Since our camera is at (0, 3, 8), a plane at Z=0 is perfect.
const planeGeo = new THREE.PlaneGeometry(20, 20);
const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
const sculptPlane = new THREE.Mesh(planeGeo, planeMat);
// We want the plane to align with the axis of rotation (Y) and be roughly perpendicular to camera view.
// Default PlaneGeometry is in XY plane (normal Z). That works for Z distance check.
scene.add(sculptPlane);

// --- Cursor Helper ---
const cursorGeo = new THREE.SphereGeometry(0.1, 16, 16);
const cursorMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 });
const cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
scene.add(cursorMesh);


// --- Floor ---
const floorGeo = new THREE.PlaneGeometry(20, 20);
const floorMat = new THREE.MeshStandardMaterial({ 
    color: 0xeeeeee,
    roughness: 1.0,
    metalness: 0.0
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -CONFIG.clayHeight / 2 - 0.1; // Just below the clay
floor.receiveShadow = true;
scene.add(floor);


// --- Interaction Logic ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isMouseDown = false;

window.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('mousedown', () => { isMouseDown = true; });
window.addEventListener('mouseup', () => { isMouseDown = false; });

// --- Touch Support ---
window.addEventListener('touchstart', (event) => {
    event.preventDefault();
    isMouseDown = true;
    const touch = event.touches[0];
    mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
}, { passive: false });

window.addEventListener('touchmove', (event) => {
    event.preventDefault();
    const touch = event.touches[0];
    mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
}, { passive: false });

window.addEventListener('touchend', () => { isMouseDown = false; });
window.addEventListener('touchcancel', () => { isMouseDown = false; });

// Sculpting Function
function sculpt(intersectPoint) {
    // The intersectPoint is on the plane Z=0.
    // localPoint relative to mesh? Mesh is at 0,0,0.
    // So intersectPoint IS the local point (ignoring rotation for the "radius" target).
    
    // We want the radius at this Y height to become the distance from Y axis.
    // P = (x, y, 0). Dist = abs(x).
    
    // However, the user might be dragging outside the mesh to "pull" or inside to "push".
    // Reference radius is simply abs(intersectPoint.x).
    
    let targetRadius = Math.abs(intersectPoint.x);
    
    // Clamp target radius
    targetRadius = Math.max(CONFIG.minRadius, Math.min(CONFIG.maxRadius, targetRadius));

    // Y level
    const targetY = intersectPoint.y;
    
    // Apply changes
    const count = positionAttribute.count;
    let needsUpdate = false;

    // Iterate vertices
    for (let i = 0; i < count; i++) {
        const y = positionAttribute.getY(i);
        const dy = Math.abs(y - targetY);
        
        if (dy < CONFIG.sculptRadius) {
            const x = positionAttribute.getX(i);
            const z = positionAttribute.getZ(i);
            const currentRadius = Math.sqrt(x*x + z*z);
            
            // Influence factor
            const factor = Math.exp(- (dy * dy) / (0.1)); // Shape of the tool
            
            // Move towards target radius
            // We use lerp to make it feel like "pressure" over time
            const speed = CONFIG.sculptStrength; 
            const newRadius = currentRadius + (targetRadius - currentRadius) * factor * speed;
            
            const angle = Math.atan2(z, x);
            positionAttribute.setX(i, Math.cos(angle) * newRadius);
            positionAttribute.setZ(i, Math.sin(angle) * newRadius);
            
            needsUpdate = true;
        }
    }

    if (needsUpdate) {
        positionAttribute.needsUpdate = true;
        geometry.computeVertexNormals();
    }
}




// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- GUI ---
const gui = new GUI();
gui.add(CONFIG, 'rotationSpeed', 0, 10);
gui.add(CONFIG, 'sculptStrength', 0.01, 0.5);
gui.add(CONFIG, 'sculptRadius', 0.1, 2.0);
gui.addColor(CONFIG, 'clayColor').onChange(c => material.color.setHex(c));

// Add hide/show toggle
gui.add({ hideControls: () => gui.hide() }, 'hideControls').name('Hide Controls');

// Variable to track GUI interaction
let isInteractingWithGUI = false;

// Prevent GUI touch/mouse events from affecting clay
const guiElement = gui.domElement;
guiElement.addEventListener('mouseenter', () => { isInteractingWithGUI = true; });
guiElement.addEventListener('mouseleave', () => { isInteractingWithGUI = false; });
guiElement.addEventListener('touchstart', (e) => { 
    isInteractingWithGUI = true; 
    e.stopPropagation(); 
}, { passive: false });
guiElement.addEventListener('touchend', () => { isInteractingWithGUI = false; });
guiElement.addEventListener('touchcancel', () => { isInteractingWithGUI = false; });

// Add keyboard shortcut to show GUI (press 'h')
window.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') {
        if (gui._hidden) {
            gui.show();
        } else {
            gui.hide();
        }
    }
});


// --- Animation Loop ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // 1. Rotate Clay
    clayMesh.rotation.y += CONFIG.rotationSpeed * delta;

    // 2. Mouse sculpting
    raycaster.setFromCamera(mouse, camera);
    
    const intersects = raycaster.intersectObject(sculptPlane);
    
    if (intersects.length > 0) {
        const point = intersects[0].point;
        
        if (point.y < CONFIG.clayHeight/2 + 1 && point.y > -CONFIG.clayHeight/2 - 1) {
            cursorMesh.visible = true;
            cursorMesh.position.copy(point);
            cursorMesh.material.color.set(isMouseDown ? 0xffff00 : 0xff0000);
            
            if (isMouseDown && !isInteractingWithGUI) {
                sculpt(point);
            }
        } else {
            cursorMesh.visible = false;
        }
    } else {
        cursorMesh.visible = false;
    }

    renderer.render(scene, camera);
}

animate();

