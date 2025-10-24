// Initialize Three.js scene, camera, renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('solarSystemCanvas') });

// Create Sun
const sunGeometry = new THREE.SphereGeometry(5, 32, 32);
const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Basic yellow for sun
const sun = new THREE.Mesh(sunGeometry, sunMaterial);
scene.add(sun);

// Create Earth
const earthGeometry = new THREE.SphereGeometry(1, 32, 32);
const earthMaterial = new THREE.MeshPhongMaterial({ color: 0x0000ff }); // Blue for Earth
const earth = new THREE.Mesh(earthGeometry, earthMaterial);
scene.add(earth);

// Position Earth relative to Sun (e.g., using a parent group for orbit)
const earthOrbitGroup = new THREE.Object3D();
earthOrbitGroup.add(earth);
scene.add(earthOrbitGroup);
earth.position.x = 20; // Distance from sun

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    // Rotate Earth on its axis
    earth.rotation.y += 0.01;

    // Rotate Earth orbit group around the sun
    earthOrbitGroup.rotation.y += 0.005;

    renderer.render(scene, camera);
}

animate();
