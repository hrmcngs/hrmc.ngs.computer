async function fetchWeapons() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/username/repository/branch/data/items.json');
        const data = await response.json();
        const container = document.getElementById('weapon-container');
        
        data.forEach(item => {
            const weaponDiv = document.createElement('div');
            weaponDiv.classList.add('weapon');
            weaponDiv.dataset.name = item.name;
            weaponDiv.dataset.damage = item.damage;
            weaponDiv.dataset.speed = item.speed;
            
            const imageFrame = document.createElement('div');
            imageFrame.classList.add('image-frame');
            const img = document.createElement('img');
            img.src = item.image;
            img.alt = item.name;
            imageFrame.appendChild(img);
            
            weaponDiv.appendChild(imageFrame);
            container.appendChild(weaponDiv);
        });

        document.querySelectorAll('.weapon').forEach(item => {
            item.addEventListener('mouseenter', event => {
                const tooltip = document.getElementById('tooltip');
                const name = event.currentTarget.dataset.name;
                const damage = event.currentTarget.dataset.damage;
                const speed = event.currentTarget.dataset.speed;

                document.getElementById('tooltip-name').textContent = name;
                document.getElementById('tooltip-damage').textContent = "Damage: " + damage;
                document.getElementById('tooltip-speed').textContent = "Attack Speed: " + speed;

                tooltip.style.display = 'block';
            });

            item.addEventListener('mousemove', event => {
                const tooltip = document.getElementById('tooltip');
                tooltip.style.top = event.pageY + 10 + 'px';
                tooltip.style.left = event.pageX + 10 + 'px';
            });

            item.addEventListener('mouseleave', () => {
                const tooltip = document.getElementById('tooltip');
                tooltip.style.display = 'none';
            });
        });
    } catch (error) {
        console.error('Error fetching weapons:', error);
    }
}

fetchWeapons();
