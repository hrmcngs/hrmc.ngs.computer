async function fetchDirectoryContents(path) {
    const repo = 'Drowse-Lab/The-four-primitives-and-Weapons';
    const branch = 'main'; // ブランチ名の確認
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching directory contents:', error);
        return [];
    }
}

async function fetchFiles(fileUrls) {
    const files = [];
    for (const url of fileUrls) {
        try {
            const response = await fetch(url);
            const content = await response.json(); // Assume JSON content
            files.push(content);
        } catch (error) {
            console.error('Error fetching file:', error);
        }
    }
    return files;
}

async function fetchItems() {
    const itemPath = 'src/main/resources/assets/minecraft_armor_weapon/model/item/';
    const customPath = 'src/main/resources/assets/minecraft_armor_weapon/model/custom/';

    const itemContents = await fetchDirectoryContents(itemPath);
    const customContents = await fetchDirectoryContents(customPath);

    const itemUrls = itemContents.filter(file => file.type === 'file' && file.name.endsWith('.json')).map(file => file.download_url);
    const customUrls = customContents.filter(file => file.type === 'file' && file.name.endsWith('.json')).map(file => file.download_url);

    const items = await fetchFiles(itemUrls);
    const customItems = await fetchFiles(customUrls);

    displayItems(items.concat(customItems));
}

function displayItems(items) {
    const container = document.getElementById('item-container');
    container.innerHTML = ''; // Clear the container

    items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.classList.add('item');
        itemDiv.dataset.name = item.name || 'Unknown';
        itemDiv.dataset.damage = item.damage || 'N/A';
        itemDiv.dataset.speed = item.speed || 'N/A';

        const modelUrl = item.model || 'path/to/default/model.glb'; // Default model path
        load3DModel(itemDiv, modelUrl);

        container.appendChild(itemDiv);
    });
}

function load3DModel(container, modelUrl) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const loader = new THREE.GLTFLoader();
    loader.load(modelUrl, function (gltf) {
        scene.add(gltf.scene);
        camera.position.z = 5;
        animate();
    }, undefined, function (error) {
        console.error('Error loading 3D model:', error);
    });

    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }
}

document.addEventListener('DOMContentLoaded', fetchItems);