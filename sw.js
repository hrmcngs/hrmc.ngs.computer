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

        const imageFrame = document.createElement('div');
        imageFrame.classList.add('image-frame');
        const img = document.createElement('img');
        img.src = item.image || 'path/to/default/image.png';
        img.alt = item.name || 'Unknown';
        imageFrame.appendChild(img);

        itemDiv.appendChild(imageFrame);
        container.appendChild(itemDiv);
    });
}

document.addEventListener('DOMContentLoaded', fetchItems);