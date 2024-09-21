document.querySelectorAll('.weapon').forEach(item => {
    item.addEventListener('mouseenter', event => {
        const tooltip = document.getElementById('tooltip');
        const name = event.currentTarget.getAttribute('data-name');
        const damage = event.currentTarget.getAttribute('data-damage');
        const speed = event.currentTarget.getAttribute('data-speed');
        const lore = event.currentTarget.getAttribute('data-lore');
        const rarity = event.currentTarget.getAttribute('data-rarity');

        document.getElementById('tooltip-name').textContent = name;
        document.getElementById('tooltip-damage').textContent = "Damage: " + damage;
        document.getElementById('tooltip-speed').textContent = "Attack Speed: " + speed;
        document.getElementById('tooltip-lore').textContent = lore;
        document.getElementById('tooltip-rarity').textContent = rarity;

        // Change the name color based on the weapon
        if (name === "Iron Katana") {
            document.getElementById('tooltip-name').style.color = "#ffffff";  // White for Iron Katana
        } else if (name === "Darkness Katana") {
            document.getElementById('tooltip-name').style.color = "#AA00AA";  // Purple for Darkness Katana
        } else if (name === "Katana Nigu Humerus") {
            document.getElementById('tooltip-name').style.color = "#FFFF55";  // Purple for Darkness Katana
        } else if (name === "Sword of Night") {
            document.getElementById('tooltip-name').style.color = "#FFAA00";  // Purple for Darkness Katana
        }

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

